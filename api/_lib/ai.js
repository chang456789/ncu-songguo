// 共用的 AI 呼叫程式（伺服器端）。所有 AI 功能都透過這裡呼叫模型，不要在別的檔案自己寫。
// 檔名以 _ 開頭的資料夾不會變成網址，只能被 api/*.js 引用：const { chat } = require("./_lib/ai");
//
// 需要的 Vercel 環境變數（Settings → Environment Variables），擇一設定即可：
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
 */
async function chat(messages, opts = {}) {
  const p = provider();
  if (!p) { const e = new Error("AI 尚未設定：請在 Vercel 環境變數加上 Azure OpenAI 或 GitHub Models 的金鑰"); e.code = "ai_not_configured"; throw e; }
  const body = { messages, max_tokens: opts.maxTokens || 600, temperature: opts.temperature ?? 0.3 };
  if (opts.json) body.response_format = { type: "json_object" };
  let url, headers = { "content-type": "application/json" };
  if (p === "azure") {
    const base = process.env.AZURE_OPENAI_ENDPOINT.replace(/\/+$/, "");
    url = `${base}/openai/deployments/${encodeURIComponent(process.env.AZURE_OPENAI_DEPLOYMENT)}/chat/completions?api-version=${AZURE_API_VERSION}`;
    headers["api-key"] = process.env.AZURE_OPENAI_API_KEY;
  } else {
    url = "https://models.github.ai/inference/chat/completions";
    headers.authorization = `Bearer ${process.env.GITHUB_MODELS_TOKEN}`;
    body.model = process.env.GITHUB_MODELS_MODEL || "openai/gpt-4o-mini";
  }
  const r = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(opts.timeoutMs || 20000) });
  if (!r.ok) {
    const detail = (await r.text()).slice(0, 300);
    const e = new Error(`AI 服務回應 ${r.status}：${detail}`); e.code = r.status === 429 ? "ai_rate_limited" : "ai_error"; e.status = r.status; throw e;
  }
  const j = await r.json();
  const text = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || "";
  let json = null;
  if (opts.json) { try { json = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, "")); } catch { json = null; } }
  return { text, json, provider: p, usage: j.usage || null };
}

// 簡單的防濫用：同一個 IP 每分鐘最多 limit 次（同一台伺服器實例內有效，足夠擋住惡意狂刷）
const hits = new Map();
function rateLimit(req, limit = 12) {
  const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "?").split(",")[0].trim();
  const now = Date.now(); const list = (hits.get(ip) || []).filter(t => now - t < 60000);
  list.push(now); hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length <= limit;
}

module.exports = { chat, provider, rateLimit };
