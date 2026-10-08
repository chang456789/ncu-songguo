// GET /api/events — upcoming campus events gathered from several NCU sites.
//  - www.ncu.edu.tw 「活動」 and 「校園公告」 (event-like titles only)
//  - 人文藝術中心 cha.ncu.edu.tw (concerts, exhibitions, talks)
// For each recent item it opens the announcement and pulls out the event date, time, place and perks
// (free meal, 藝文時數, free tickets). The result is cached on Vercel's CDN for 30 minutes.
const news = require("./news.js");

const UA = { "user-agent": "Mozilla/5.0 (songguo campus app; +https://ncu-songguo.vercel.app)", "accept-language": "zh-TW" };
const SRC = {
  activity: { url: "https://www.ncu.edu.tw/p/403-1000-28.php?Lang=zh-tw", label: "學校活動" },
  announce: { url: "https://www.ncu.edu.tw/p/403-1000-15.php?Lang=zh-tw", label: "校園公告" },
  cha: { url: "https://cha.ncu.edu.tw/web/news/news.jsp?lang=tw", label: "人文藝術中心" },
};
const EVENTISH = /講座|工作坊|音樂會|演講|展覽|特展|展出|活動|說明會|研討會|座談|講習|博覽會|比賽|競賽|表演|演出|電影|放映|市集|音樂節|晚會|營隊|體驗|導覽|沙龍|論壇|讀書會|健走|路跑|捐血|徵才/;
const NOT_EVENT = /誠徵|徵求.*人員|招標|採購|施工|停車場|停電|停水|公告.*結果|錄取|榜單|評選結果|延長公告/;

const decode = s => String(s || "").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/[ \t　]+/g, " ").trim();
const pad = n => String(n).padStart(2, "0");
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const validYMD = (y, m, d) => m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 2020 && y <= 2035;

async function get(url, ms = 7000) {
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(`${url} ${r.status}`);
  return r.text();
}

/* ---------- list pages ---------- */
function parseCha(html, base) {
  const out = []; const seen = new Set();
  const re = /<a\b[^>]*href="([^"]*news_in\.jsp\?np_id=[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi; let m;
  while ((m = re.exec(html))) {
    let url; try { url = new URL(m[1].replace(/&amp;/g, "&"), base).href; } catch { continue; }
    const t = decode(m[2]).replace(/(另開新視窗|原頁面開啟)/g, "").trim();
    const title = t.length >= 4 ? t : decode((m[0].match(/title="([^"]*)"/) || [])[1]);
    if (!title || title.length < 4 || seen.has(url)) continue;
    const near = html.slice(Math.max(0, m.index - 600), m.index + 200);
    const d = [...near.matchAll(/(20\d{2})[\/.-](\d{1,2})[\/.-](\d{1,2})/g)].pop();
    seen.add(url);
    out.push({ title, url, posted: d ? iso(+d[1], +d[2], +d[3]) : "", src: "cha" });
  }
  return out;
}

/* ---------- detail pages ---------- */
function pageText(html, title) {
  let t = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|li|tr|h\d|td)>/gi, "\n");
  t = decode(t).replace(/\n\s*\n+/g, "\n");
  const key = (title || "").slice(0, 12);
  let at = key ? t.indexOf(key) : -1;
  if (at >= 0) { const second = t.indexOf(key, at + key.length); if (second > 0 && second - at < 3000) at = second; }
  return t.slice(Math.max(0, at), Math.max(0, at) + 5000);
}

// all dates in a snippet, in order: {y?, m, d, idx}
function datesIn(s) {
  const out = [];
  const push = (y, m, d, idx, len) => out.push({ y, m: +m, d: +d, idx, len });
  for (const x of s.matchAll(/(1\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/g)) push(+x[1] + 1911, x[2], x[3], x.index, x[0].length);
  for (const x of s.matchAll(/(20\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/g)) push(+x[1], x[2], x[3], x.index, x[0].length);
  for (const x of s.matchAll(/(20\d{2})[\/.-](\d{1,2})[\/.-](\d{1,2})/g)) push(+x[1], x[2], x[3], x.index, x[0].length);
  for (const x of s.matchAll(/(?<![\d\/.年])(\d{1,2})\s*月\s*(\d{1,2})\s*日/g)) push(null, x[1], x[2], x.index, x[0].length);
  for (const x of s.matchAll(/(?<![\d\/.])(\d{1,2})[\/.](\d{1,2})(?![\d\/.:：])(?=\s*[（(]?\s*[一二三四五六日週星期])?/g)) push(null, x[1], x[2], x.index, x[0].length);
  const seen = new Set();
  return out.filter(o => { const k = o.idx; if (seen.has(k)) return false; seen.add(k); return o.m >= 1 && o.m <= 12 && o.d >= 1 && o.d <= 31; })
    .sort((a, b) => a.idx - b.idx);
}
function resolveYear(o, posted) {
  if (o.y) return validYMD(o.y, o.m, o.d) ? iso(o.y, o.m, o.d) : null;
  const p = posted ? new Date(posted + "T00:00:00+08:00") : new Date();
  let y = p.getFullYear(); let dt = new Date(`${iso(y, o.m, o.d)}T00:00:00+08:00`);
  if (dt - p < -90 * 864e5) y += 1;           // e.g. posted in Dec about a Jan event
  return validYMD(y, o.m, o.d) ? iso(y, o.m, o.d) : null;
}
const TIME = /(?<![\d.\/])([01]?\d|2[0-3])\s*[:：]\s*([0-5]\d)(?:\s*(?:[-–—~～至到]|\s)\s*([01]?\d|2[0-3])\s*[:：]\s*([0-5]\d))?/;
const PLACE_KEYS = /(活動地點|講座地點|演出地點|展覽地點|展出地點|上課地點|地點|場地|地點\/Venue|Venue|Location)\s*[:：]\s*([^\n，。；;]{2,40})/i;
const PLACES = ["大禮堂", "羅家倫國際會議廳", "羅家倫講堂", "羅家倫", "教研大樓", "國鼎光電大樓", "國鼎圖書資料館", "文三館", "文二館", "文學院", "總圖書館", "圖書館", "藝文中心", "藝文展場", "藝文走廊", "依仁堂", "中大會館", "綜教館", "綜合教學大樓", "工程一館", "工程二館", "工程三館", "工程四館", "工程五館", "科學一館", "科學二館", "科學三館", "科學四館", "科學五館", "管二館", "管理二館", "鴻經館", "志希館", "客家學院", "人文社會科學大樓", "研究中心大樓", "太空遙測", "游藝館", "松苑", "中大湖", "操場", "線上", "視訊", "Google Meet", "Teams", "Webex"];

function tagsOf(s) {
  const tags = [];
  if (/午餐|便當|餐盒|餐點|輕食|點心|晚餐|早餐|供餐|pizza|披薩/i.test(s)) tags.push("有餐點");
  if (/藝文時數|藝文護照|藝文認證|學習護照|藝文活動時數|通識.*時數|服務學習時數|認證時數|研習時數|時數認證|學習時數/.test(s)) tags.push("可認證時數");
  if (/免費|免報名費|不收費|自由入場|免費索票|免票/.test(s)) tags.push("免費");
  if (/抽獎|贈品|好禮|禮券|小禮物|紀念品/.test(s)) tags.push("有抽獎贈品");
  if (/報名/.test(s)) tags.push("需報名");
  return tags;
}

function extract(title, text, posted) {
  const both = `${title}\n${text}`;
  let date = null, end = null, time = "", place = "";
  // candidates: a 時間/日期/展期 line in the body, else the title, else the start of the body
  const line = text.match(/(活動時間|演出時間|講座時間|展覽時間|展期|展出期間|活動日期|日期|時間|Date|Time)\s*[:：]\s*([^\n]{0,80})/i);
  const sources = [line ? line[2] : "", title, text.slice(0, 1500)];
  let dates = [];
  for (const srcStr of sources) {
    if (!srcStr) continue;
    let ds = datesIn(srcStr).map(o => ({ ...o, v: resolveYear(o, posted) })).filter(o => o.v);
    if (srcStr === sources[2]) ds = ds.filter(o => !posted || o.v >= posted);
    if (!ds.length) continue;
    const a = ds[0], b = ds[1];
    const between = b ? srcStr.slice(a.idx + a.len, b.idx).replace(/[（(][^)）]{0,6}[)）]/g, "").replace(/\d{1,2}[:：]\d{2}/g, "").trim() : "";
    date = a.v;
    if (b && b.v > a.v && /^[～~至\-–—到]$/.test(between)) end = b.v;
    else dates = [...new Set(ds.map(o => o.v))].sort();
    break;
  }
  if (end && (new Date(end) - new Date(date)) > 200 * 864e5) end = null;
  const tm = (line && line[2].match(TIME)) || title.match(TIME) || text.slice(0, 1500).match(TIME);
  if (tm) time = `${pad(tm[1])}:${tm[2]}` + (tm[3] ? `–${pad(tm[3])}:${tm[4]}` : "");
  // skip the office address that sites print in their footer (郵遞區號／中大路300號)
  const FOOTER = /^\(?\d{3,6}\)?\s*桃園|中大路\s*300\s*號|^桃園市中壢區/;
  const pm = [...text.matchAll(new RegExp(PLACE_KEYS.source, "gi"))].map(m => m[2].replace(/\s+/g, " ").trim()).find(p => !FOOTER.test(p));
  if (pm) place = pm;
  else { const hit = PLACES.find(p => both.includes(p)); if (hit) place = hit; }
  return { date, end, dates, time, place: place.slice(0, 40), tags: tagsOf(both) };
}

const norm = s => s.replace(/[\s\[\]【】《》「」『』()（）:：|｜·．.,，、!！?？—\-–_~～]/g, "").toLowerCase();

async function mapLimit(items, n, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; try { out[k] = await fn(items[k]); } catch { out[k] = null; } } }));
  return out;
}

module.exports = async (req, res) => {
  const started = Date.now();
  const today = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
  // rpage lists are paginated as 403-1000-<cat>-<page>.php; events are often announced weeks ahead, so read a few pages
  const pageUrl = (u, n) => u.replace(/403-1000-(\d+)\.php/, `403-1000-$1-${n}.php`);
  const activity = n => get(pageUrl(SRC.activity.url, n)).then(h => news.parseRpage(h, SRC.activity.url).map(x => ({ ...x, posted: x.date, src: "activity" })));
  const announce = n => get(pageUrl(SRC.announce.url, n)).then(h => news.parseRpage(h, SRC.announce.url).filter(x => EVENTISH.test(x.title) && !NOT_EVENT.test(x.title)).map(x => ({ ...x, posted: x.date, src: "announce" })));
  const lists = await Promise.allSettled([
    activity(1), activity(2), announce(1), announce(2), announce(3), announce(4),
    get(SRC.cha.url).then(h => parseCha(h, SRC.cha.url)),
  ]);
  const errors = lists.slice(0, 2).concat(lists.slice(2, 3), lists.slice(6)).filter(r => r.status === "rejected").map(r => String(r.reason && r.reason.message || r.reason));
  let items = lists.flatMap(r => r.status === "fulfilled" ? r.value : []);

  // only look closely at recent posts
  const cutoff = new Date(Date.now() - 75 * 864e5).toISOString().slice(0, 10);
  const seenUrl = new Set();
  const recent = items.filter(x => (!x.posted || x.posted >= cutoff) && !seenUrl.has(x.url) && seenUrl.add(x.url)).slice(0, 45);

  const details = await mapLimit(recent, 6, async it => {
    if (Date.now() - started > 16000) return extract(it.title, "", it.posted);
    let text = "";
    try { text = pageText(await get(it.url, 6000), it.title); } catch { }
    return extract(it.title, text, it.posted);
  });
  const events = recent.map((it, i) => {
    const d = details[i] || extract(it.title, "", it.posted);
    if (d.dates && d.dates.length > 1) d.date = d.dates.find(x => x >= today) || d.dates[d.dates.length - 1];
    return { title: it.title, url: it.url, posted: it.posted || "", src: it.src, srcLabel: SRC[it.src].label, ...d };
  });

  // merge cross-posted items (the art center's posts also appear on the school's 活動 page): keep the richest copy
  const merged = [];
  const score = e => (e.date ? 4 : 0) + (e.time ? 2 : 0) + (e.place ? 1 : 0) + (e.src === "cha" ? 0.5 : 0);
  for (const e of events.sort((a, b) => score(b) - score(a))) {
    const n = norm(e.title.replace(/^\d{1,2}\/\d{1,2}\s*(\([^)]*\)|（[^）]*）)?/, ""));
    const dup = merged.find(k => { const m = norm(k.title.replace(/^\d{1,2}\/\d{1,2}\s*(\([^)]*\)|（[^）]*）)?/, ""));
      return n.length > 5 && m.length > 5 && (m.includes(n) || n.includes(m)); });
    if (dup) { dup.tags = [...new Set([...dup.tags, ...e.tags])]; if (!dup.place && e.place) dup.place = e.place; continue; }
    merged.push(e);
  }
  const upcoming = merged.filter(e => e.date && ((e.end || e.date) >= today)).sort((a, b) => (a.date < today ? today : a.date).localeCompare(b.date < today ? today : b.date) || a.date.localeCompare(b.date));
  const undated = merged.filter(e => !e.date).sort((a, b) => (b.posted || "").localeCompare(a.posted || ""));
  res.setHeader("Cache-Control", "public, s-maxage=1800, stale-while-revalidate=86400");
  res.status(200).json({ today, upcoming, undated: undated.slice(0, 12), errors, fetchedAt: new Date().toISOString() });
};
module.exports.extract = extract; module.exports.parseCha = parseCha; module.exports.datesIn = datesIn; module.exports.pageText = pageText;
