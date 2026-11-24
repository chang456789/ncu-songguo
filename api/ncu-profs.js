// GET /api/ncu-profs?q=姓名、系所或研究專長 — 查中央大學教師（姓名、職稱、系所、信箱、專長）
// GET /api/ncu-profs?id=<iTeacher 代碼>       — 只查一位教師的信箱（前 5 位以外，使用者點「顯示信箱」時才查）
//
// 資料來源：中央大學「教師履歷平台」iTeacher（公開、不需登入；個人資料來自學校人事系統）
//   https://cis.ncu.edu.tw/iTeacher/  → 搜尋 /iTeacher/cardList（需要首頁給的 session 與 _token）
//   信箱在個人頁 /iTeacher/home/<代碼>：只替前 5 位抓，每次請求間隔 1 秒以上（api/_lib/ncu.js）
// 回傳：{ q, source, total, profs:[{ id, name, nameEn, dept, deptEn, title, titleEn, keywords:[], email, profile }] }
// 快取：Cache-Control s-maxage=86400（每天更新一次）。不用資料庫、沒有金鑰。
const { session, decode, cacheDay } = require("./_lib/ncu");
const { rateLimit } = require("./_lib/ai");

const BASE = "https://cis.ncu.edu.tw/iTeacher";
const MAX_Q = 40, EMAIL_FOR = 5, MAX_PROFS = 30;
const ID_RE = /^0x[0-9a-f]{32}$/;

const profileUrl = id => `${BASE}/home/${id}`;
const pickEmail = html => { const m = /href="mailto:([^"?]+)"/i.exec(html); return m ? decode(m[1]).trim() : ""; };
const clean = v => String(v || "").replace(/\s+/g, " ").trim();

async function search(q) {
  const s = session();
  const home = await s.text(`${BASE}/`);
  const token = (/"_token"\s*:\s*"([^"]+)"/.exec(home) || [])[1];
  if (!token) throw Object.assign(new Error("iTeacher 沒有 _token"), { code: "upstream" });
  const r = await s.request(`${BASE}/cardList`, {
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

module.exports = async (req, res) => {
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
    const r = await search(q);
    cacheDay(res);
    return res.status(200).json({ q, ...r, source: `${BASE}/` });
  } catch (e) {
    console.error("[ncu-profs]", e.message);
    return fail(502, "學校教師資料暫時連不上，請稍後再試", "upstream");
  }
};
module.exports.pickEmail = pickEmail;
