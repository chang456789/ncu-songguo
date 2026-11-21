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
//   parse_ride       自然語言拼車：一句話 → { intent, from, to, when, seats, luggage, split, tags, missing_fields }，
//                    找車時同一次呼叫一起寫每一團的「為什麼適合你」（reasons）
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

  // 自然語言發布與搜尋拼車：一句話 → 結構化欄位；要找車時，同一次呼叫一起寫每一團「為什麼適合你」
  parse_ride: {
    system: lang => [
      "你是「松果拼車小幫手」，把中央大學學生的一句話轉成拼車資料。",
      "你會收到 JSON：text（使用者的話）、now（現在的台灣時間與星期）、places（允許的地點清單）、tagOptions（允許的標籤）、myTags（使用者自己的偏好標籤）、rides（目前開放中的拼車團，可能是空的）。",
      "",
      "請輸出 JSON：",
      "{\"intent\": \"offer\"|\"request\"|\"search\", \"from\": 地點或 null, \"to\": 地點或 null, \"when\": \"YYYY-MM-DDTHH:mm\" 或 null, \"seats\": 數字或 null, \"luggage\": \"none\"|\"light\"|\"heavy\", \"split\": 字串或 null, \"tags\": [], \"missing_fields\": [], \"reasons\": {\"團的 id\": \"為什麼適合你\"}}",
      "",
      "規則：",
      "1. intent：要開團、揪人、「我出發，誰要一起」→ offer；想搭別人的車、徵求同行 → request；「找…的車」「有沒有…的團」→ search。",
      "2. from、to 只能是 places 裡的其中一個（完全一樣的字）。「後門、宵夜街」→「中央大學（後門）」；「學校、中大、正門、校門口」→「中央大學（正門）」；「高鐵」→「高鐵桃園站」；「火車站、中壢車站」→「中壢火車站」；「回台北、去台北」→「台北車站」。對不上 places 的地點，該欄位填 null，並把欄位名稱放進 missing_fields。",
      "3. 只說「回台北」「回家」而沒說出發地時，學生通常從學校出發，from 填「中央大學（正門）」。",
      "4. when：依 now 換算成 24 小時制的台灣時間。「明早」＝明天早上；「今晚」＝今天晚上；「週五下午」沒說幾點就用 15:00。完全沒提到時間就填 null。",
      "5. seats：開團的總人數（含自己）。「2 人」「我們兩個」＝使用者這邊的人數，開團時 seats 至少要比它多 1（預設 4）。沒提到就 null。",
      "6. luggage：有大行李、行李箱 → heavy；背包、小行李 → light；沒提到 → none。",
      "7. tags 只能從 tagOptions 選，依使用者的話判斷（例如「想睡覺」→「想安靜補眠」、有大行李 →「行李較多」、「要準時」→「準時優先」）。",
      "8. missing_fields：intent 是 offer 或 request 時，from、to、when 缺哪個就列哪個。search 不用列。",
      "9. reasons：只在 intent 是 search 或 request 時填。針對 rides 中「目的地相符」的團，各寫一句 25 字內的「為什麼適合你」，要具體（時間差幾分鐘、剩幾個位子、標籤是否合拍——只能用 rides 裡的資料）。不相符的團不要寫。沒有就給 {}。",
      `10. reasons 用${replyLang(lang)}寫。其他欄位照格式。`,
      "只輸出 JSON。",
    ].join("\n"),
    maxTokens: 600,
    clean: (j, payload) => {
      if (!j || typeof j !== "object") return null;
      const places = Array.isArray(payload.places) ? payload.places : [];
      const tagOptions = Array.isArray(payload.tagOptions) ? payload.tagOptions : [];
      const intent = ["offer", "request", "search"].includes(j.intent) ? j.intent : "search";
      const place = v => typeof v === "string" && places.includes(v.trim()) ? v.trim() : null;
      const missing = new Set((Array.isArray(j.missing_fields) ? j.missing_fields : []).filter(f => ["from", "to", "when"].includes(f)));
      const from = place(j.from), to = place(j.to);
      // 時間：只接受「YYYY-MM-DDTHH:mm」格式
      const when = typeof j.when === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(j.when) ? j.when.slice(0, 16) : null;
      if (intent !== "search"){ if (!from) missing.add("from"); if (!to) missing.add("to"); if (!when) missing.add("when"); }
      else missing.clear();
      if (from) missing.delete("from"); if (to) missing.delete("to"); if (when) missing.delete("when");
      const seats = Number.isInteger(+j.seats) && +j.seats >= 2 && +j.seats <= 6 ? +j.seats : null;
      const luggage = ["none", "light", "heavy"].includes(j.luggage) ? j.luggage : "none";
      const tags = [...new Set((Array.isArray(j.tags) ? j.tags : []).filter(t => tagOptions.includes(t)))];
      const split = typeof j.split === "string" ? j.split.trim().slice(0, 30) || null : null;
      const ids = new Set((Array.isArray(payload.rides) ? payload.rides : []).map(r => r && r.id));
      const reasons = {};
      if (j.reasons && typeof j.reasons === "object") for (const [id, v] of Object.entries(j.reasons)) if (ids.has(id) && typeof v === "string" && v.trim()) reasons[id] = v.trim().slice(0, 60);
      return { intent, from, to, when, seats, luggage, split, tags, missing_fields: [...missing], reasons };
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
    ], { json: true, maxTokens: task.maxTokens, temperature: 0.2, timeoutMs: 18000, task: body.task });
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
