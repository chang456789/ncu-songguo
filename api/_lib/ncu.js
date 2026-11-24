// 中央大學公開網頁的共用抓取工具（只抓不需要登入的公開頁面）
// - 同一個網站兩次請求之間至少間隔 1.1 秒（禮貌抓取，不要一次狂抓）
// - 簡單的 cookie 保存：課程查詢要先切換成中文、iTeacher 搜尋需要 session 與 _token
// - 學期：8 月～隔年 1 月是第 1 學期，2～7 月是第 2 學期（民國學年）
const GAP_MS = 1100;
const lastAt = new Map();   // host → 上次請求的時間

const sleep = ms => new Promise(r => setTimeout(r, ms));

// 一個「連線」：記住 cookie，所有請求都排隊、彼此間隔 GAP_MS
function session() {
  const jar = new Map();
  async function request(url, opts = {}) {
    const host = new URL(url).host;
    const wait = (lastAt.get(host) || 0) + GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastAt.set(host, Date.now());
    const headers = { "user-agent": "Songguo campus site (ncu-songguo.vercel.app)", "accept-language": "zh-TW,zh;q=0.9", ...(opts.headers || {}) };
    if (jar.size) headers.cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
    const go = () => fetch(url, { ...opts, headers, redirect: "follow", signal: AbortSignal.timeout(opts.timeoutMs || 12000) });
    let r;
    try { r = await go(); }
    catch (e) {   // 連線偶爾中斷：等 1.5 秒再試一次（只重試一次）
      if (e.name === "TimeoutError") throw e;
      await sleep(1500); lastAt.set(host, Date.now()); r = await go();
    }
    const set = typeof r.headers.getSetCookie === "function" ? r.headers.getSetCookie() : [r.headers.get("set-cookie")].filter(Boolean);
    for (const c of set) { const m = /^([^=;\s]+)=([^;]*)/.exec(c); if (m) jar.set(m[1], m[2]); }
    if (!r.ok) throw Object.assign(new Error(`${host} 回應 ${r.status}`), { code: "upstream" });
    return r;
  }
  return { request, text: async (url, opts) => (await request(url, opts)).text() };
}

// 目前學期，例如 2026-11 → { year: 115, term: 1, code: "1151" }
function semester(now = new Date()) {
  const t = new Date(now.getTime() + 8 * 3600e3);   // 台灣時間
  const y = t.getUTCFullYear(), m = t.getUTCMonth() + 1;
  const year = m >= 8 ? y - 1911 : y - 1912, term = m >= 8 || m === 1 ? 1 : 2;
  return { year, term, code: `${year}${term}` };
}

// HTML 文字工具
const decode = s => String(s || "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
const text = s => decode(String(s || "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "")).replace(/[ \t\r]+/g, " ").replace(/\n\s*/g, "\n").trim();

// 每天更新一次：Vercel CDN 快取 1 天，過期後先給舊資料、背景更新
function cacheDay(res) { res.setHeader("cache-control", "public, s-maxage=86400, stale-while-revalidate=43200"); }

// ======================================================================
// 下面是「找課程／教授」的兩個查詢。Vercel 免費方案最多 12 個後端程式，所以不另開 api/*.js：
//   /api/ncu-courses?q=… 和 /api/ncu-profs?q=… 由 vercel.json 的 rewrites 轉到
//   /api/ai-agent?task=ncu&type=courses|profs，再由 api/ai-agent.js 開頭交給這裡的 handler。
// ======================================================================
const { rateLimit } = require("./ai");
const MAX_Q = 40;

// ---------- 課程 ----------
// GET /api/ncu-courses?q=關鍵字 — 查中央大學本學期開課（課名、課號、流水號或教師姓名）
//
// 資料來源：中央大學課程查詢系統（公開、不需登入）https://cis.ncu.edu.tw/Course/main/query/byKeywords
//   1. 開查詢頁取得 session → 2. 開 /Course/main/lang 切換成中文 → 3. 用關鍵字查詢本學期
//   三次請求之間各間隔 1 秒以上（api/_lib/ncu.js）。
// 回傳：{ q, semester:"1151", source, courses:[{ serial, code, cls, name, nameEn, teachers:[], credits,
//          times:[{ day:"二", periods:"12", start:"09:00", end:"10:50", room:"M-429" }], rooms:{ "M-429":"鴻經館-429" },
//          type:"必修", length:"半", limit, notes:[], outline }] }
// 快取：Cache-Control s-maxage=86400，Vercel 每個關鍵字每天最多向學校查一次。不用資料庫、沒有金鑰。

const COURSE_BASE = "https://cis.ncu.edu.tw/Course/main";
const MAX_ROWS = 40;
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

async function courseSearch(q) {
  const sem = semester();
  const s = session();
  await s.text(`${COURSE_BASE}/query/byKeywords`);           // 1. 取得 session
  await s.text(`${COURSE_BASE}/lang`);                         // 2. 切換成中文
  const params = new URLSearchParams({ keyword: q, year: String(sem.year), fall_spring: String(sem.term), selectDept: "", week: "", day: "", crs_lang_no: "0", query: "Search" });
  let html = await s.text(`${COURSE_BASE}/query/byKeywords?${params}`);
  if (/Course Name\/Remark/.test(html) && !/課程名稱/.test(html)) {   // 萬一切換成英文了，再切一次
    await s.text(`${COURSE_BASE}/lang`);
    html = await s.text(`${COURSE_BASE}/query/byKeywords?${params}`);
  }
  return { semester: sem.code, courses: parseRows(html, sem.code) };
}

async function coursesHandler(req, res) {
  if (req.method !== "GET") { res.setHeader("cache-control", "no-store"); return res.status(405).json({ error: "請用 GET" }); }
  const q = String((req.query && req.query.q) || "").trim().replace(/\s+/g, " ");
  if (!q || q.length > MAX_Q) { res.setHeader("cache-control", "no-store"); return res.status(400).json({ error: `請輸入 1–${MAX_Q} 字的課名、課號或教師姓名` }); }
  if (!rateLimit(req, 20)) { res.setHeader("cache-control", "no-store"); return res.status(429).json({ error: "太頻繁了，請稍後再試", code: "rate_limited" }); }
  try {
    const r = await courseSearch(q);
    cacheDay(res);
    return res.status(200).json({ q, ...r, source: "https://cis.ncu.edu.tw/Course/main/query/byKeywords" });
  } catch (e) {
    res.setHeader("cache-control", "no-store");
    console.error("[ncu-courses]", e.message);
    return res.status(502).json({ error: "學校課程查詢系統暫時連不上，請稍後再試", code: "upstream" });
  }
}

// ---------- 教授 ----------
// GET /api/ncu-profs?q=姓名、系所或研究專長 — 查中央大學教師（姓名、職稱、系所、信箱、專長）
// GET /api/ncu-profs?id=<iTeacher 代碼>       — 只查一位教師的信箱（前 5 位以外，使用者點「顯示信箱」時才查）
//
// 資料來源：中央大學「教師履歷平台」iTeacher（公開、不需登入；個人資料來自學校人事系統）
//   https://cis.ncu.edu.tw/iTeacher/  → 搜尋 /iTeacher/cardList（需要首頁給的 session 與 _token）
//   信箱在個人頁 /iTeacher/home/<代碼>：只替前 5 位抓，每次請求間隔 1 秒以上（api/_lib/ncu.js）
// 回傳：{ q, source, total, profs:[{ id, name, nameEn, dept, deptEn, title, titleEn, keywords:[], email, profile }] }
// 快取：Cache-Control s-maxage=86400（每天更新一次）。不用資料庫、沒有金鑰。

const ITEACHER = "https://cis.ncu.edu.tw/iTeacher";
const EMAIL_FOR = 5, MAX_PROFS = 30;
const ID_RE = /^0x[0-9a-f]{32}$/;

const profileUrl = id => `${ITEACHER}/home/${id}`;
const pickEmail = html => { const m = /href="mailto:([^"?]+)"/i.exec(html); return m ? decode(m[1]).trim() : ""; };
const clean = v => String(v || "").replace(/\s+/g, " ").trim();

async function profSearch(q) {
  const s = session();
  const home = await s.text(`${ITEACHER}/`);
  const token = (/"_token"\s*:\s*"([^"]+)"/.exec(home) || [])[1];
  if (!token) throw Object.assign(new Error("iTeacher 沒有 _token"), { code: "upstream" });
  const r = await s.request(`${ITEACHER}/cardList`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded; charset=UTF-8", "x-requested-with": "XMLHttpRequest" },
    body: new URLSearchParams({ q, page: "1", _token: token }).toString(),
  });
  const j = await r.json();
  const list = (Array.isArray(j.data) ? j.data : []).slice(0, MAX_PROFS).map(d => {
    const i = d.info || {};
    return { id: i.PersonalNoEncode, name: clean(i.Cname), nameEn: clean(i.Ename), dept: clean(i.DisplayUnitCname), deptEn: clean(i.DisplayUnitEname),
      title: clean(i.TitleCname), titleEn: clean(i.TitleEname), keywords: (d.keywords || []).map(clean).filter(Boolean).slice(0, 6), email: null,
      profile: ID_RE.test(i.PersonalNoEncode || "") ? profileUrl(i.PersonalNoEncode) : null };
  }).filter(p => p.name && p.profile);
  for (const p of list.slice(0, EMAIL_FOR)) {   // 前 5 位順便抓信箱（每次間隔 1 秒以上）
    try { p.email = pickEmail(await s.text(p.profile)); } catch { p.email = null; }
  }
  return { total: Number(j.total) || list.length, profs: list };
}

async function profsHandler(req, res) {
  const fail = (status, error, code) => { res.setHeader("cache-control", "no-store"); return res.status(status).json({ error, code }); };
  if (req.method !== "GET") return fail(405, "請用 GET");
  const id = String((req.query && req.query.id) || "").trim();
  const q = String((req.query && req.query.q) || "").trim().replace(/\s+/g, " ");
  if (!id && (!q || q.length > MAX_Q)) return fail(400, `請輸入 1–${MAX_Q} 字的教師姓名、系所或專長`);
  if (id && !ID_RE.test(id)) return fail(400, "教師代碼格式不對");
  if (!rateLimit(req, 20)) return fail(429, "太頻繁了，請稍後再試", "rate_limited");
  try {
    if (id) {
      const email = pickEmail(await session().text(profileUrl(id)));
      cacheDay(res);
      return res.status(200).json({ id, email, profile: profileUrl(id) });
    }
    const r = await profSearch(q);
    cacheDay(res);
    return res.status(200).json({ q, ...r, source: `${ITEACHER}/` });
  } catch (e) {
    console.error("[ncu-profs]", e.message);
    return fail(502, "學校教師資料暫時連不上，請稍後再試", "upstream");
  }
}

// /api/ai-agent?task=ncu&type=courses|profs 進來的請求
function handler(req, res) {
  const type = req.query && req.query.type;
  if (type === "courses") return coursesHandler(req, res);
  if (type === "profs") return profsHandler(req, res);
  res.setHeader("cache-control", "no-store");
  return res.status(400).json({ error: "type 只能是 courses 或 profs" });
}

module.exports = { session, semester, sleep, decode, text, cacheDay, handler, parseRows, parseTimes, pickEmail };
