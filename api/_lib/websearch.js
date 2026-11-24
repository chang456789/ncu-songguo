// 上網搜尋（伺服器端）：問松果需要「最新、即時、校外、網站資料沒有」的資訊時使用。
// 使用 Tavily Search API（專為 AI 設計的搜尋服務）。檔名以 _ 開頭的資料夾不會變成網址，只能被 api/*.js 引用。
//
// 需要的 Vercel 環境變數：
//   TAVILY_API_KEY           Tavily 的 API key（tvly- 開頭）。沒有設定時這個功能自動關閉，問松果照舊運作。
//   WEB_SEARCH_DAILY_LIMIT   選填，每天最多搜尋幾次（預設 80）。超過就不搜尋，改用網站資料回答。
// 金鑰只能放在環境變數，絕對不能寫進程式或推上 GitHub。
//
// 用法：const { search, enabled } = require("./_lib/websearch");
//       const list = await search("中壢 新開 咖啡廳", { topic: "general", days: 30, max: 5 });
//       // → [{ title, url, snippet, published, source }]（最多 5 筆，snippet 最多 300 字）
// 失敗時丟出錯誤，e.code 是：web_search_not_configured / web_search_limit / timeout / web_search_quota / web_search_error / bad_query

const ENDPOINT = "https://api.tavily.com/search";
const CACHE_MS = 60 * 60e3;       // 同樣的查詢 1 小時內用快取
const TIMEOUT_MS = 8000;          // 逾時 8 秒
const MAX_RESULTS = 5;            // 最多 5 筆
const SNIPPET_MAX = 300;          // 內文截到 300 字
const DEFAULT_DAILY = 80;

const enabled = () => !!String(process.env.TAVILY_API_KEY || "").trim();
function dailyLimit(){
  const n = parseInt(process.env.WEB_SEARCH_DAILY_LIMIT, 10);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_DAILY;
}
const taipeiDay = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
function fail(code, msg){ const e = new Error(msg || code); e.code = code; return e; }

// 每天的次數與快取：存在這台伺服器的記憶體裡（Vercel 可能同時開好幾台、閒置後會重開，所以是「大約」的上限；
// Tavily 帳號本身的每月額度才是最後一道關卡，用完時這裡會收到錯誤並改用網站資料回答）
const cache = new Map();
let count = { day: "", n: 0 };
function used(){ const d = taipeiDay(); if (count.day !== d) count = { day: d, n: 0 }; return count; }

// 外部網站的文字：去掉控制字元、多餘空白，截短。只當資料用，絕不當指令（見 api/ai-agent.js 的回答規則）
function clean(s, max){
  return String(s == null ? "" : s).replace(/[\u0000-\u001f\u007f\u200b-\u200f\u2028-\u202e\ufeff]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}
function hostOf(u){ try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } }
function dateOf(v){
  if (!v) return null;
  const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}
// days → Tavily 的參數：新聞用 days；一般搜尋用 time_range（day / week / month / year）
function timeParams(topic, days){
  if (!days) return {};
  if (topic === "news") return { days };
  return { time_range: days <= 1 ? "day" : days <= 7 ? "week" : days <= 31 ? "month" : "year" };
}

/**
 * search(query, { topic, days, max, timeoutMs }) → [{ title, url, snippet, published, source }]
 * topic：「news」（新聞）或「general」（一般，預設）；days：只要最近幾天的資料（選填）；max：最多幾筆（1–5）
 */
async function search(query, opts = {}){
  if (!enabled()) throw fail("web_search_not_configured", "網路搜尋尚未設定（TAVILY_API_KEY）");
  const q = clean(query, 200);
  if (!q) throw fail("bad_query", "沒有搜尋字串");
  const topic = opts.topic === "news" ? "news" : "general";
  const days = Number.isInteger(+opts.days) && +opts.days >= 1 && +opts.days <= 365 ? +opts.days : null;
  const max = Math.min(MAX_RESULTS, Math.max(1, parseInt(opts.max, 10) || MAX_RESULTS));
  const key = JSON.stringify([q.toLowerCase(), topic, days, max]);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS){ log(0, true, true); return hit.list.map(x => ({ ...x })); }

  const c = used();
  if (c.n >= dailyLimit()) throw fail("web_search_limit", "今天的網路搜尋次數用完了");
  c.n++;

  const body = { query: q, topic, search_depth: "basic", max_results: max, include_answer: false, include_raw_content: false,
    include_images: false, ...timeParams(topic, days), ...(topic === "general" ? { country: "taiwan" } : {}) };
  const t0 = Date.now();
  let r, raw;
  try {
    r = await call(body, opts.timeoutMs || TIMEOUT_MS);
    // 國家參數不被接受時（400），拿掉再試一次
    if (r.status === 400 && body.country){ delete body.country; r = await call(body, opts.timeoutMs || TIMEOUT_MS); }
    raw = await r.text();
  } catch (e) {
    log(Date.now() - t0, false, false);
    if (e && (e.name === "TimeoutError" || e.name === "AbortError")) throw fail("timeout", "網路搜尋逾時");
    throw fail("web_search_error", "連不上搜尋服務");
  }
  if (!r.ok){
    log(Date.now() - t0, false, false);
    console.error(`web search failed: HTTP ${r.status} ${String(raw).slice(0, 160)}`);
    // 401 金鑰錯誤；429 太頻繁；432／433 Tavily 方案或帳號的額度用完
    throw fail(r.status === 429 || r.status === 432 || r.status === 433 ? "web_search_quota" : "web_search_error", `搜尋服務回應 ${r.status}`);
  }
  let j = null; try { j = JSON.parse(raw); } catch {}
  const seen = new Set(), list = [];
  for (const x of (j && Array.isArray(j.results) ? j.results : [])){
    const url = typeof x.url === "string" && /^https?:\/\//i.test(x.url) ? x.url.slice(0, 500) : null;
    if (!url || seen.has(url)) continue;
    seen.add(url);
    list.push({ title: clean(x.title, 120) || hostOf(url), url, snippet: clean(x.content, SNIPPET_MAX),
      published: dateOf(x.published_date), source: hostOf(url) });
    if (list.length >= max) break;
  }
  log(Date.now() - t0, true, false);
  cache.set(key, { at: Date.now(), list });
  if (cache.size > 300) cache.delete(cache.keys().next().value);
  return list.map(x => ({ ...x }));
}

function call(body, timeoutMs){
  return fetch(ENDPOINT, { method: "POST", signal: AbortSignal.timeout(timeoutMs),
    headers: { "content-type": "application/json", authorization: `Bearer ${String(process.env.TAVILY_API_KEY).trim()}` }, body: JSON.stringify(body) });
}
// 使用紀錄（和 api/_lib/ai.js 同樣格式，印在 Vercel → Logs）：不記錄搜尋內容
function log(latencyMs, ok, cached){
  try { console.log(JSON.stringify({ task: "web_search", provider: "tavily", latencyMs, ok, cached })); } catch {}
}

// 測試用：清掉快取與今天的次數
function _reset(){ cache.clear(); count = { day: "", n: 0 }; }

module.exports = { search, enabled, dailyLimit, TIMEOUT_MS, CACHE_MS, MAX_RESULTS, SNIPPET_MAX, _reset };
