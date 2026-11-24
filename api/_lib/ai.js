// 共用的 AI 呼叫程式（伺服器端）。所有 AI 功能都透過這裡呼叫模型，不要在別的檔案自己寫。
// 檔名以 _ 開頭的資料夾不會變成網址，只能被 api/*.js 引用：const { chat } = require("./_lib/ai");
//
// 需要的 Vercel 環境變數（Settings → Environment Variables），擇一設定即可（由上往下優先）：
//   OpenAI 相容服務（目前使用 Groq，免費）：
//     AI_BASE_URL   例：https://api.groq.com/openai/v1
//     AI_API_KEY
//     AI_MODEL      例：llama-3.3-70b-versatile
//   Azure OpenAI（優先，比賽加分）：
//     AZURE_OPENAI_ENDPOINT     例：https://songguo-ai.openai.azure.com
//     AZURE_OPENAI_API_KEY
//     AZURE_OPENAI_DEPLOYMENT   在 Azure AI Foundry 部署模型時取的名字，例：gpt-4o-mini
//   GitHub Models（免費備援，每天約 150 次）：
//     GITHUB_MODELS_TOKEN       GitHub 個人存取權杖（權限勾 models:read）
//     GITHUB_MODELS_MODEL       選填，預設 openai/gpt-4o-mini
// 金鑰只能放在環境變數，絕對不能寫進程式或推上 GitHub。

const AZURE_API_VERSION = "2024-10-21";

function provider() {
  if (process.env.AI_BASE_URL && process.env.AI_API_KEY && process.env.AI_MODEL) return "openai-compatible";
  if (process.env.AZURE_OPENAI_ENDPOINT && process.env.AZURE_OPENAI_API_KEY && process.env.AZURE_OPENAI_DEPLOYMENT) return "azure";
  if (process.env.GITHUB_MODELS_TOKEN) return "github";
  return null;
}

/**
 * chat(messages, opts) → { text, json, provider, usage }
 * messages: [{ role: "system" | "user" | "assistant", content: "..." }]
 * opts.json: true 時要求模型只回傳 JSON，並幫你解析成 result.json
 * opts.maxTokens: 回覆長度上限（預設 600）
 * opts.temperature: 預設 0.3
 * opts.task: 選填，這次呼叫是哪個功能（例如 "translate"），只用在下面的使用紀錄
 */
async function chat(messages, opts = {}) {
  const t0 = Date.now(); let ok = false;
  try {
    const result = await callModel(messages, opts);
    ok = true;
    return result;
  } finally {
    logUsage({ task: opts.task, latencyMs: Date.now() - t0, ok, cached: false });
  }
}

// AI 使用紀錄（微軟 AI 可觀測性，簡報用）：每次呼叫在 Vercel → Logs 印一行 JSON。
// 只記功能名稱、服務、耗時、成功與否、是否走快取，絕不記錄使用者的內容。
function logUsage({ task, latencyMs = 0, ok = true, cached = false }) {
  try { console.log(JSON.stringify({ task: task || "unknown", provider: provider() || "none", latencyMs, ok, cached })); } catch {}
}
// 各功能的快取命中時呼叫（沒有呼叫 AI，但留下紀錄，才看得出快取省了多少次）
const logCached = task => logUsage({ task, latencyMs: 0, ok: true, cached: true });

// 隊長可編輯的規則（api/_lib/ai-rules.js），插在功能本身的系統提示後面
let RULES = {}; try { RULES = require("./ai-rules"); } catch {}
function withRules(messages, task) {
  const skipAll = /translate|moderate/.test(task || ""); // 翻譯、審查不套用通用規則
  const extra = [skipAll ? "" : RULES.all, task && RULES[task]].map(x => String(x || "").trim()).filter(Boolean).join("\n\n");
  if (!extra) return messages;
  const i = messages.findIndex(m => m.role !== "system");
  const at = i < 0 ? messages.length : i;
  return [...messages.slice(0, at), { role: "system", content: "【必須遵守的補充規則】\n" + extra }, ...messages.slice(at)];
}

async function callModel(messages, opts) {
  messages = withRules(messages, opts.task);
  const p = provider();
  if (!p) { const e = new Error("AI 尚未設定：請在 Vercel 環境變數加上 Azure OpenAI 或 GitHub Models 的金鑰"); e.code = "ai_not_configured"; throw e; }
  const body = { messages, max_tokens: opts.maxTokens || 600, temperature: opts.temperature ?? 0.3 };
  if (opts.json) body.response_format = { type: "json_object" };
  let j;
  if (p === "openai-compatible") {
    // 任何 OpenAI 相容服務（Groq 等）：AI_BASE_URL 例 https://api.groq.com/openai/v1
    const base = process.env.AI_BASE_URL.trim().replace(/\/+$/, "");
    const auth = { authorization: `Bearer ${process.env.AI_API_KEY.trim()}` };
    try {
      j = await post(`${base}/chat/completions`, auth, { ...body, model: autoModel || process.env.AI_MODEL.trim() }, opts);
    } catch (e) {
      // 模型名稱不能用（404／400）：向服務查詢這把金鑰能用的模型，自動挑一個再試
      if (e.status !== 404 && e.status !== 400) throw e;
      const m = await pickModel(base, auth, autoModel || process.env.AI_MODEL.trim());
      if (!m) throw e;
      console.error(`AI_MODEL 不能用，自動改用 ${m}`);
      autoModel = m;
      j = await post(`${base}/chat/completions`, auth, { ...body, model: m }, opts);
    }
  } else if (p === "azure") {
    const base = process.env.AZURE_OPENAI_ENDPOINT.trim().replace(/\/+$/, "");
    const url = `${base}/openai/deployments/${encodeURIComponent(process.env.AZURE_OPENAI_DEPLOYMENT.trim())}/chat/completions?api-version=${AZURE_API_VERSION}`;
    j = await post(url, { "api-key": process.env.AZURE_OPENAI_API_KEY.trim() }, body, opts);
  } else {
    // GitHub Models：先用新網址，回應異常（非 JSON、404、5xx）時改用舊網址再試一次
    const auth = { authorization: `Bearer ${process.env.GITHUB_MODELS_TOKEN.trim()}` };
    const model = (process.env.GITHUB_MODELS_MODEL || "openai/gpt-4o-mini").trim();
    try {
      j = await post("https://models.github.ai/inference/chat/completions", auth, { ...body, model }, opts);
    } catch (e) {
      if (e.status === 401 || e.status === 403 || e.status === 429) throw e;
      console.error("github models primary failed, retry legacy:", e.message);
      j = await post("https://models.inference.ai.azure.com/chat/completions", auth, { ...body, model: model.replace(/^[^/]+\//, "") }, opts);
    }
  }
  const text = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || "";
  let json = null;
  if (opts.json) { try { json = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, "")); } catch { json = null; } }
  return { text, json, provider: p, usage: j.usage || null };
}

// 自動挑模型（同一個伺服器實例內記住結果）
let autoModel = null;
async function pickModel(base, auth, failed) {
  try {
    const r = await fetch(`${base}/models`, { headers: auth, signal: AbortSignal.timeout(8000) });
    const ids = ((await r.json()).data || []).map(x => x.id).filter(x => x && x !== failed);
    console.log("可用模型：" + ids.join(", "));
    const pref = ["llama-3.3-70b-versatile", "openai/gpt-oss-120b", "llama-3.1-8b-instant", "openai/gpt-oss-20b"];
    return pref.find(x => ids.includes(x)) || ids.find(x => /llama|gpt|qwen|gemma|mistral/i.test(x) && !/guard|whisper|tts|embed|vision/i.test(x)) || null;
  } catch { return null; }
}

// 送出請求並確認回應是模型的 JSON；不是的話丟出含狀態碼與前 200 字的錯誤（不含使用者內容）
async function post(url, extraHeaders, body, opts) {
  if (/gpt-oss/.test(body.model || "")) body = { ...body, reasoning_effort: "low" }; // 推理模型：少想一點，避免回覆被截斷
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json", accept: "application/json", ...extraHeaders }, body: JSON.stringify(body), signal: AbortSignal.timeout(opts.timeoutMs || 20000) });
  const raw = await r.text();
  const host = new URL(url).host;
  if (!r.ok) {
    const e = new Error(`AI 服務回應 ${r.status}（${host}）：${raw.slice(0, 300)}`); e.code = r.status === 429 ? "ai_rate_limited" : "ai_error"; e.status = r.status; throw e;
  }
  let j = null; try { j = JSON.parse(raw); } catch {}
  if (!j || !Array.isArray(j.choices)) {
    const e = new Error(`AI 服務回應格式不對 ${r.status}（${host}，${r.headers.get("content-type") || "?"}）：${raw.slice(0, 200)}`); e.code = "ai_error"; e.status = 502; throw e;
  }
  return j;
}

// 簡單的防濫用：同一個 IP 每分鐘最多 limit 次（同一台伺服器實例內有效，足夠擋住惡意狂刷）
const hits = new Map();
// bucket：選填，分開計算的類別（例如 api/ai-agent.js 代為執行的 /api/ai-timetable 用 "timetable"，不和問松果共用額度）
function rateLimit(req, limit = 12, bucket = "") {
  const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "?").split(",")[0].trim();
  const key = bucket ? bucket + ":" + ip : ip;
  const now = Date.now(); const list = (hits.get(key) || []).filter(t => now - t < 60000);
  list.push(now); hits.set(key, list);
  if (hits.size > 5000) hits.clear();
  return list.length <= limit;
}

module.exports = { chat, provider, rateLimit, logCached };
