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
    const r = await fetch(url, { ...opts, headers, redirect: "follow", signal: AbortSignal.timeout(opts.timeoutMs || 12000) });
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

module.exports = { session, semester, sleep, decode, text, cacheDay };
