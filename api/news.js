// GET /api/news?cat=activity|announce|news
// Fetches the NCU website server-side (browsers can't, because of CORS), parses the list, and lets
// Vercel's CDN cache the result for 15 minutes so the school site only sees a few requests per hour.
const SOURCES = {
  activity: "https://www.ncu.edu.tw/p/403-1000-28.php?Lang=zh-tw",
  announce: "https://www.ncu.edu.tw/p/403-1000-15.php?Lang=zh-tw",
  news: "https://ncusec.ncu.edu.tw/news/index.php",
};
const decode = s => s.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/\s+/g, " ").trim();
const abs = (href, base) => { try { return new URL(href.replace(/&amp;/g, "&"), base).href; } catch { return null; } };
const DATE = /(20\d{2})[-\/.](\d{1,2})[-\/.](\d{1,2})/;
const fmtDate = m => m ? `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}` : "";

function parseRpage(html, base) {
  // rpage list items: <div class="mtitle"> ... <i class="mdate">2026-10-06</i> <a href="..." title="...">標題</a>
  const items = []; const seen = new Set();
  const parts = html.split(/class="[^"]*\bmtitle\b[^"]*"/).slice(1);
  for (const part of parts) {
    const seg = part.slice(0, 2500);
    const a = seg.match(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i); if (!a) continue;
    const titleAttr = (a[0].match(/title="([^"]*)"/) || [])[1];
    const title = decode(titleAttr || a[2]); const url = abs(a[1], base);
    if (!title || !url || seen.has(url)) continue; seen.add(url);
    items.push({ title, url, date: fmtDate(seg.match(DATE)) });
  }
  if (items.length) return items;
  // fallback: any article link on the page
  const re = /<a\b[^>]*href="([^"]*406-1000-[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi; let m;
  while ((m = re.exec(html))) {
    const url = abs(m[1], base); const title = decode(m[2]); if (!title || !url || seen.has(url)) continue; seen.add(url);
    const near = html.slice(Math.max(0, m.index - 300), m.index + m[0].length + 300);
    items.push({ title, url, date: fmtDate(near.match(DATE)) });
  }
  return items;
}
function parseSec(html, base) {
  const items = []; const seen = new Set();
  const re = /<a\b[^>]*href="([^"]*headlines_content\.php\?H_ID=\d+[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi; let m;
  while ((m = re.exec(html))) {
    const url = abs(m[1], base); const title = decode(m[2]);
    if (!title || title.length < 4 || !url || seen.has(url)) continue; seen.add(url);
    const near = html.slice(Math.max(0, m.index - 400), m.index + m[0].length + 400);
    items.push({ title, url, date: fmtDate(near.match(DATE)) });
  }
  return items;
}

module.exports = async (req, res) => {
  const cat = SOURCES[req.query.cat] ? req.query.cat : "activity";
  const src = SOURCES[cat];
  try {
    const r = await fetch(src, { headers: { "user-agent": "Mozilla/5.0 (songguo campus app; +https://ncu-songguo.vercel.app)", "accept-language": "zh-TW" }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error("upstream " + r.status);
    const html = await r.text();
    let items = cat === "news" ? parseSec(html, src) : parseRpage(html, src);
    items = items.slice(0, 40);
    res.setHeader("Cache-Control", "public, s-maxage=900, stale-while-revalidate=3600");
    res.status(200).json({ cat, source: src, items, fetchedAt: new Date().toISOString() });
  } catch (e) {
    res.setHeader("Cache-Control", "public, s-maxage=120");
    res.status(502).json({ cat, source: src, items: [], error: String(e.message || e) });
  }
};
module.exports.parseRpage = parseRpage; module.exports.parseSec = parseSec;
