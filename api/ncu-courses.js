// GET /api/ncu-courses?q=關鍵字 — 查中央大學本學期開課（課名、課號、流水號或教師姓名）
//
// 資料來源：中央大學課程查詢系統（公開、不需登入）https://cis.ncu.edu.tw/Course/main/query/byKeywords
//   1. 開查詢頁取得 session → 2. 開 /Course/main/lang 切換成中文 → 3. 用關鍵字查詢本學期
//   三次請求之間各間隔 1 秒以上（api/_lib/ncu.js）。
// 回傳：{ q, semester:"1151", source, courses:[{ serial, code, cls, name, nameEn, teachers:[], credits,
//          times:[{ day:"二", periods:"12", start:"09:00", end:"10:50", room:"M-429" }], rooms:{ "M-429":"鴻經館-429" },
//          type:"必修", length:"半", limit, notes:[], outline }] }
// 快取：Cache-Control s-maxage=86400，Vercel 每個關鍵字每天最多向學校查一次。不用資料庫、沒有金鑰。
const { session, semester, text, cacheDay } = require("./_lib/ncu");
const { rateLimit } = require("./_lib/ai");

const BASE = "https://cis.ncu.edu.tw/Course/main";
const MAX_Q = 40, MAX_ROWS = 40;
const DAYS = "一二三四五六日";
// 節次 → 開始的整點（第 1 節 08:00…第 4 節 11:00、Z 中午 12:00、第 5 節 13:00…第 9 節 17:00、A 18:00…D 21:00）
const PERIOD = { 1: 8, 2: 9, 3: 10, 4: 11, Z: 12, 5: 13, 6: 14, 7: 15, 8: 16, 9: 17, A: 18, B: 19, C: 20, D: 21 };
const hh = h => String(h).padStart(2, "0");

function parseTimes(raw) {
  const rooms = {}, times = [];
  for (const line of raw.split("\n").map(s => s.trim()).filter(Boolean)) {
    const full = /\s\((.+)\)\s*$/.exec(line);   // 教室全名可能有括號，例如「健雄館(科學四館)-101」
    const m = /^([一二三四五六日])([0-9ZA-D]+)(?:\/([^\s(]+))?/.exec(line);
    if (!m) continue;
    const ps = [...m[2]].filter(p => p in PERIOD);
    if (!ps.length) continue;
    const room = m[3] || "";
    if (room && full) rooms[room] = full[1].trim();
    times.push({ day: m[1], periods: m[2], start: `${hh(PERIOD[ps[0]])}:00`, end: `${hh(PERIOD[ps.at(-1)])}:50`, room });
  }
  // 教室全名常常只寫在最後一行，用 rooms 對照表（以教室代號為 key）讓每一行都查得到
  return { times: times.sort((a, b) => DAYS.indexOf(a.day) - DAYS.indexOf(b.day)), rooms };
}

function parseRows(html, sem) {
  const out = [];
  const rows = html.split(/<tr class="(?:odd|even)">/).slice(1);
  for (const row of rows) {
    const cells = row.split(/<td[^>]*>/).slice(1).map(c => c.split("</td>")[0]);
    if (cells.length < 8) continue;
    const [serial, codeCls = ""] = text(cells[0]).split("\n");
    const [code, cls = ""] = codeCls.split("-");
    const nameCell = cells[1];
    const name = text(nameCell.split(/<br\s*\/?>/i)[0]);
    const nameEn = text((/<span class="engclass">([\s\S]*?)<\/span>/.exec(nameCell) || [])[1]);
    const notice = text((/<span class="notice">([\s\S]*?)<\/span>/.exec(nameCell) || [])[1]);
    const tags = (text((/<span class="descript">([\s\S]*?)<\/span>/.exec(nameCell) || [])[1]).match(/\[[^\]]+\]/g) || []).map(s => s.slice(1, -1));
    const { times, rooms } = parseTimes(text(cells[4]));
    const outline = (/open_outline\('([^']+)'/.exec(row) || [])[1];
    out.push({
      serial: (serial || "").trim(), code: (code || "").trim(), cls: cls.trim(), name, nameEn,
      teachers: text(cells[2]).split(/[\n、,，]/).map(s => s.trim()).filter(Boolean),
      credits: Number(text(cells[3])) || text(cells[3]),
      times, rooms, type: text(cells[5]), length: text(cells[6]), limit: text(cells[7]),
      notes: [notice, ...tags.filter(t => /授課語言|英語/.test(t))].filter(Boolean),
      outline: outline ? "https://cis.ncu.edu.tw" + outline : null,
    });
    if (out.length >= MAX_ROWS) break;
  }
  return out;
}

async function search(q) {
  const sem = semester();
  const s = session();
  await s.text(`${BASE}/query/byKeywords`);           // 1. 取得 session
  await s.text(`${BASE}/lang`);                         // 2. 切換成中文
  const params = new URLSearchParams({ keyword: q, year: String(sem.year), fall_spring: String(sem.term), selectDept: "", week: "", day: "", crs_lang_no: "0", query: "Search" });
  let html = await s.text(`${BASE}/query/byKeywords?${params}`);
  if (/Course Name\/Remark/.test(html) && !/課程名稱/.test(html)) {   // 萬一切換成英文了，再切一次
    await s.text(`${BASE}/lang`);
    html = await s.text(`${BASE}/query/byKeywords?${params}`);
  }
  return { semester: sem.code, courses: parseRows(html, sem.code) };
}

module.exports = async (req, res) => {
  if (req.method !== "GET") { res.setHeader("cache-control", "no-store"); return res.status(405).json({ error: "請用 GET" }); }
  const q = String((req.query && req.query.q) || "").trim().replace(/\s+/g, " ");
  if (!q || q.length > MAX_Q) { res.setHeader("cache-control", "no-store"); return res.status(400).json({ error: `請輸入 1–${MAX_Q} 字的課名、課號或教師姓名` }); }
  if (!rateLimit(req, 20)) { res.setHeader("cache-control", "no-store"); return res.status(429).json({ error: "太頻繁了，請稍後再試", code: "rate_limited" }); }
  try {
    const r = await search(q);
    cacheDay(res);
    return res.status(200).json({ q, ...r, source: "https://cis.ncu.edu.tw/Course/main/query/byKeywords" });
  } catch (e) {
    res.setHeader("cache-control", "no-store");
    console.error("[ncu-courses]", e.message);
    return res.status(502).json({ error: "學校課程查詢系統暫時連不上，請稍後再試", code: "upstream" });
  }
};
module.exports.parseRows = parseRows;
module.exports.parseTimes = parseTimes;
