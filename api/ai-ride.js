// POST /api/ai-ride — 松果 AI 智慧交通與共乘
//
// 請求：{ task, payload, lang: "zh" | "en" }
// 回應：{ ok: true, data } 或 { ok: false, error, code }
//   code：bad_request / rate_limited / ai_not_configured / timeout / ai_error
//
// 原則：所有數字（時間、費用、座位）都由前端 web/ride-ai.js 用程式算好放在 payload 裡，
//       AI 只負責「寫推薦理由與說明」，不可以自己估算或新增數字。每次操作只呼叫一次 AI。
//
// task：
//   commute_advisor  交通精算師：根據程式算好的方案比較，寫一句首選建議＋理由＋風險
const { chat, rateLimit } = require("./_lib/ai");

const MAX_PAYLOAD = 5000;   // payload 轉成文字後最多幾個字

function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  try { return JSON.parse(req.body || "{}"); } catch { return null; }
}
const replyLang = lang => lang === "en" ? "English" : "繁體中文（台灣用語）";
// 把 AI 回傳的值整理成「最多 n 句、每句最多 max 字」的字串陣列
const strList = (v, n, max) => (Array.isArray(v) ? v : typeof v === "string" ? [v] : [])
  .filter(s => typeof s === "string" && s.trim()).slice(0, n).map(s => s.trim().slice(0, max));
const str = (v, max) => typeof v === "string" ? v.trim().slice(0, max) : "";

/* ---------- 各任務：system prompt 與輸出整理 ---------- */
const TASKS = {
  commute_advisor: {
    system: lang => [
      "你是「松果交通精算師」，幫中央大學（中大）學生決定怎麼去目的地。",
      "你會收到 JSON：出發點、目的地、條件（希望抵達時間、大行李、人數、優先考量）、天氣／情境，以及程式已經算好的各方案 plans（出發、抵達、總分鐘數、每人費用等），和程式選出的首選 pick。",
      "",
      "規則：",
      "1. 首選一定是 pick 指定的方案，不要改推別的方案。",
      "2. 只能使用 payload 裡出現的數字（時間、分鐘、元）。不可以自己估算、換算、加總或新增任何數字，也不可以編造路線、站名或地點。費用是區間（costRange）時，照區間寫。",
      "3. hero：一句話首選建議，要具體，包含搭什麼、幾點出發或上車、約幾點到、每人多少錢。30 字以內（英文 20 個字以內）。",
      "4. reasons：2–3 條，說明為什麼選它，要和其他方案比較（例如比計程車省多少、比公車快多少——只能引用 payload 裡已經算好的 diff 數字）。每條 40 字以內。",
      "5. risks：0–2 條風險提醒，根據 payload 的 notes、情境（下雨、尖峰）、大行李、是否來得及抵達。沒有就給空陣列。",
      "6. 情境 simulated 為 true 時，那是模擬情境，不要說成真實天氣。",
      `7. 用${replyLang(lang)}回答。地名可保留中文。`,
      "",
      "只輸出 JSON：{\"hero\": \"...\", \"reasons\": [\"...\"], \"risks\": [\"...\"]}",
    ].join("\n"),
    maxTokens: 400,
    clean: j => {
      const hero = str(j && j.hero, 80);
      if (!hero) return null;
      return { hero, reasons: strList(j.reasons, 3, 90), risks: strList(j.risks, 2, 90) };
    },
  },
};

module.exports = async (req, res) => {
  res.setHeader("cache-control", "no-store");
  const fail = (status, code, error) => res.status(status).json({ ok: false, code, error });
  if (req.method !== "POST") return fail(405, "bad_request", "請用 POST");
  if (!rateLimit(req, 12)) return fail(429, "rate_limited", "太頻繁了，請稍後再試");

  // ---------- 1. 檢查輸入 ----------
  const body = readBody(req);
  if (!body) return fail(400, "bad_request", "格式錯誤");
  const task = TASKS[body.task];
  if (!task) return fail(400, "bad_request", "不支援的 task");
  const lang = body.lang === "en" ? "en" : "zh";
  if (!body.payload || typeof body.payload !== "object") return fail(400, "bad_request", "缺少 payload");
  const payloadText = JSON.stringify(body.payload);
  if (payloadText.length > MAX_PAYLOAD) return fail(413, "bad_request", "資料太長了");

  // ---------- 2. 呼叫 AI（一次） ----------
  try {
    const r = await chat([
      { role: "system", content: task.system(lang) },
      { role: "user", content: payloadText },
    ], { json: true, maxTokens: task.maxTokens, temperature: 0.2, timeoutMs: 18000 });
    const data = r.json ? task.clean(r.json, body.payload) : null;
    if (!data) return fail(502, "ai_error", "AI 回覆的格式不對，請稍後再試");
    return res.status(200).json({ ok: true, data });
  } catch (e) {
    if (e.code === "ai_not_configured") return fail(503, "ai_not_configured", "AI 尚未設定");
    if (e.code === "ai_rate_limited") return fail(429, "rate_limited", "AI 使用量太大了，請稍後再試");
    if (e.name === "TimeoutError" || e.name === "AbortError") return fail(504, "timeout", "AI 回應逾時");
    console.error("ai-ride failed:", body.task, e.message);
    return fail(502, "ai_error", "AI 暫時無法回答");
  }
};
module.exports.TASKS = TASKS;
