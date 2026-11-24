// 問松果 AI 代理人：路由測試
// 執行：node tests/agent-route.test.js
//   ① 關鍵字備援（AI 不能用時，web/agent.js 的 ruleRoute）— 一定會跑
//   ② 伺服器檢查 AI 選的工具（api/ai-agent.js 的 cleanRoute）— 一定會跑
//   ③ 真正的 AI 路由 — 兩種方式（擇一）：
//      BASE_URL=https://ncu-songguo.vercel.app node tests/agent-route.test.js
//        直接打已部署網站的 /api/ai-agent，用 Vercel 上真正的 Azure 測試，本機不需要任何金鑰（推薦）
//        每批 9 句、批次之間等 65 秒，不超過網站的每分鐘上限
//      或在本機設定 AI 金鑰（GITHUB_MODELS_TOKEN 或 AZURE_OPENAI_*）直接呼叫 api/ai-agent.js
process.env.TZ = "Asia/Taipei";   // 時間換算依台灣時間（電腦或雲端是別的時區也一樣）
const path = require("path"), fs = require("fs"), vm = require("vm");
const ROOT = path.resolve(__dirname, "..");

// 測試題：[句子, 應該選的工具, 參數檢查（選填）]
const CASES = [
  ["我 5 點要到高鐵", "commute", a => a.dest === "hsr" && a.arriveBy === "17:00"],
  ["怎麼去中壢火車站最快", "commute", a => a.dest === "zl"],
  ["今晚有空想吃便宜的", "find_food", a => a.budget === 1],
  ["後門附近有什麼宵夜", "find_food", a => a.type === "宵夜"],
  ["明早後門去中壢車站有人揪嗎", "find_rides", a => a.from === "中央大學（後門）" && a.to === "中壢火車站"],
  ["幫我揪週五下午回台北的車", "draft_ride", a => a.to === "台北車站" && new Date(a.when).getDay() === 5 && a.when.endsWith("T15:00")],
  ["中午有一小時能做什麼", "find_events", a => a.timeFrom === "12:00" && a.timeTo === "13:00"],
  ["這週有什麼免費的講座", "find_events"],
  ["有練英文的活動嗎", "find_events"],
  ["下一堂課在哪", "next_class"],
  ["我週三有什麼課", "my_timetable", a => a.day === 3],
  ["給我看這週的課表", "my_timetable", a => a.day === null],
  ["有人在賣二手腳踏車嗎", "search_posts", a => a.board === "market" && /腳踏車/.test(a.keyword || "")],
  ["後門附近有套房嗎", "search_posts", a => a.board === "housing" && a.keyword === "套房"],
  ["看板上有人問微積分嗎", "search_posts", a => a.board === "forum" && a.keyword === "微積分"],
  ["明天會下雨嗎", "weather", a => a.day === "tomorrow"],
  ["現在幾度", "weather", a => a.day === "today"],
  ["明天要穿什麼", "none"],
  ["期中考怎麼準備比較有效率", "none"],
  ["英文報告開頭怎麼寫", "none"],
  ["最近壓力好大怎麼辦", "none"],
  ["你好啊", "none"],
  ["Will it rain tomorrow?", "weather", a => a.day === "tomorrow"],
  ["Is anyone selling a bike?", "search_posts", a => a.board === "market"],
  ["What should I wear tomorrow?", "none"],
  ["When is my next class?", "next_class"],
  // 動作工具
  ["幫我寫一篇賣二手腳踏車的文，1500 元", "create_post_draft", a => a.space === "m:all" && a.category === "機車單車" && /1500/.test(a.price || "") && /腳踏車/.test(a.title || "") && !/狀況良好|九成新|適合|可議/.test(a.body || "")],
  ["我要轉租後門套房", "create_post_draft", a => a.space === "hb:list" && a.category === "轉租"],
  ["幫我發一篇撿到學生證的失物招領", "create_post_draft", a => a.space === "g:lost" && a.category === "拾獲"],
  ["Help me sell my desk lamp", "create_post_draft", a => a.space === "m:all"],
  ["把週五的音樂會加到行事曆", "add_to_calendar", a => a.keyword === "音樂會" && new Date(a.date + "T12:00").getDay() === 5],
  ["幫我把講座加入行事曆", "add_to_calendar", a => a.keyword === "講座"],
  // 上網查最新消息（web_search）：query 一定要是中文；跟地點有關但沒說地點 → 自動加上「中壢 中央大學 附近」
  ["中央大學附近最近很紅的餐廳", "web_search", a => /很紅/.test(a.query) && /中央大學/.test(a.query)],
  ["這週末中壢有什麼活動", "web_search", a => /中壢/.test(a.query) && /活動/.test(a.query)],
  ["桃園最近有什麼展覽", "web_search", a => /桃園/.test(a.query) && /展覽/.test(a.query)],
  ["中壢新開的咖啡廳", "web_search", a => /中壢/.test(a.query) && /咖啡/.test(a.query)],
  ["多益最近一次報名時間", "web_search", a => /多益/.test(a.query) && /報名/.test(a.query) && !/中央大學/.test(a.query)],
  ["最近有什麼好吃的新開的店", "web_search", a => /新開/.test(a.query) && /中壢 中央大學 附近/.test(a.query)],
  ["What's trending to eat near NCU?", "web_search", a => /[\u4e00-\u9fff]/.test(a.query) && /熱門/.test(a.query) && /中央大學/.test(a.query)],
  ["Any concerts in Taoyuan this month?", "web_search", a => /演唱會/.test(a.query) && /桃園/.test(a.query)],
  ["New cafes in Zhongli?", "web_search", a => /咖啡/.test(a.query) && /中壢/.test(a.query)],
  ["When is the next TOEIC registration?", "web_search", a => /多益/.test(a.query) && /報名/.test(a.query)],
  ["Any exhibitions in Taoyuan recently?", "web_search", a => /展覽/.test(a.query) && /桃園/.test(a.query)],
  ["Latest news about Zhongli traffic", "web_search", a => /中壢/.test(a.query) && a.topic === "news"],
];
// 這些一定不能跑去上網搜尋（校內的公車、課表、市集用原本的工具）
const NOT_WEB = ["下一班132", "我週三有什麼課", "市集有人賣電風扇嗎", "後門附近有什麼宵夜", "這週有什麼免費的講座", "怎麼去中壢火車站最快", "最近壓力好大怎麼辦"];

let fail = 0;
const ok = (cond, label) => { console.log((cond ? "  ✓ " : "  ✗ ") + label); if (!cond) fail++; };

// ---------- ① 關鍵字備援 ----------
console.log("① 關鍵字備援（AI 不能用時）");
const win = {};
vm.runInNewContext(fs.readFileSync(path.join(ROOT, "web/agent.js"), "utf8"), { window: win, console, Date, URL, Blob: class {}, document: {}, sessionStorage: { getItem(){ return null; }, setItem(){} } });
const ruleRoute = win.sgAgent.ruleRoute;
let ruleOK = 0;
for (const [q, tool, check] of CASES){
  const r = ruleRoute(q);
  const good = r.tool === tool && (!check || check(r.args || {}));
  if (good) ruleOK++;
  ok(good, `${q.padEnd(20)} → ${r.tool}${good ? "" : `（應該是 ${tool}）`}  ${JSON.stringify(r.args)}`);
}
for (const q of NOT_WEB){ const r = ruleRoute(q); ok(r.tool !== "web_search", `不上網：${q.padEnd(16)} → ${r.tool}`); }
// 時間換算：沒說上午或下午的 1～6 點一律當下午，不管測試在幾點跑（以前凌晨跑會算成 05:00）
function ruleAt(iso){
  const T = new Date(iso).getTime();
  class FixedDate extends Date { constructor(...a){ if (a.length) super(...a); else super(T); } static now(){ return T; } }
  const w = {};
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, "web/agent.js"), "utf8"), { window: w, console, Date: FixedDate, URL, Blob: class {}, document: {}, sessionStorage: { getItem(){ return null; }, setItem(){} } });
  return w.sgAgent.ruleRoute;
}
for (const [at, q, want] of [
  ["2026-11-25T03:00:00+08:00", "我 5 點要到高鐵", "17:00"], ["2026-11-25T10:00:00+08:00", "我 5 點要到高鐵", "17:00"],
  ["2026-11-25T03:00:00+08:00", "6點半要到中壢火車站", "18:30"], ["2026-11-25T03:00:00+08:00", "早上 5 點要到高鐵", "05:00"],
  ["2026-11-25T03:00:00+08:00", "凌晨5點要到高鐵", "05:00"], ["2026-11-25T21:00:00+08:00", "8 點要到高鐵", "20:00"],
  ["2026-11-25T07:00:00+08:00", "8 點要到高鐵", "08:00"], ["2026-11-25T03:00:00+08:00", "12 點要到高鐵", "12:00"],
]){
  const r = ruleAt(at)(q), hm = at.slice(11, 16);
  ok(r.tool === "commute" && r.args.arriveBy === want, `現在 ${hm}「${q}」→ ${r.args && r.args.arriveBy}（應該是 ${want}）`);
}
console.log(`  關鍵字備援：${ruleOK} / ${CASES.length} 正確\n`);

// ---------- ② 伺服器檢查 ----------
console.log("② 伺服器檢查 AI 選的工具（cleanRoute）");
{ const { pmFix, cleanRoute } = require(path.join(ROOT, "api/ai-agent.js"));
  ok(pmFix("05:00", "我 5 點要到高鐵") === "17:00" && pmFix("05:30", "五點半要到高鐵") === "17:30", "伺服器：AI 把「5 點」算成 05:00 → 修正成 17:00（中文數字也可以）");
  ok(pmFix("05:00", "凌晨 5 點要到高鐵") === "05:00" && pmFix("05:00", "早上五點要到高鐵") === "05:00", "伺服器：說了凌晨、早上就不改");
  ok(pmFix("04:00", "我 5 點要到高鐵") === "04:00" && pmFix("08:00", "8 點要到") === "08:00" && pmFix(null, "5 點") === null, "伺服器：只改使用者說出的 1～6 點");
  const c = cleanRoute({ tool: "commute", args: { dest: "hsr", arriveBy: "05:00" }, confidence: 0.9 }, [], "我 5 點要到高鐵");
  const d = cleanRoute({ tool: "draft_ride", args: { from: null, to: null, when: "2026-11-27T03:00" }, confidence: 0.9 }, [], "幫我揪週五 3 點去高鐵的車");
  ok(c.args.arriveBy === "17:00" && d.args.when === "2026-11-27T15:00", "cleanRoute：交通精算的 arriveBy、開團的 when 都會修正"); }
const { cleanRoute } = require(path.join(ROOT, "api/ai-agent.js"));
const P = ["中央大學（正門）", "中央大學（後門）", "中壢火車站", "高鐵桃園站", "台北車站", "松山機場"];
ok(cleanRoute({ tool: "find_food", args: { budget: 1 }, confidence: 0.4 }, P).tool === "none", "沒把握（confidence 0.4）→ none");
ok(cleanRoute({ tool: "find_food", args: { budget: 1 }, confidence: 0.9 }, P).tool === "find_food", "有把握（confidence 0.9）→ 照選");
ok(cleanRoute({ tool: "find_food", args: {} }, P).tool === "find_food", "沒給 confidence → 照選（舊格式相容）");
ok(JSON.stringify(cleanRoute({ tool: "search_posts", args: { keyword: "腳踏車", board: "market" }, confidence: 0.8 }, P).args) === '{"keyword":"腳踏車","board":"market"}', "search_posts 參數");
ok(cleanRoute({ tool: "search_posts", args: { board: "hack" }, confidence: 0.8 }, P).args.board === null, "search_posts 不合法的看板 → null");
ok(cleanRoute({ tool: "my_timetable", args: { day: 9 } }, P).args.day === null, "my_timetable 不合法的星期 → null（整週）");
ok(cleanRoute({ tool: "weather", args: { day: "next week" } }, P).args.day === "today", "weather 不合法的日子 → today");
ok(cleanRoute({ tool: "rm -rf", args: {} }, P) === null, "不存在的工具 → 拒絕");
const d1 = cleanRoute({ tool: "create_post_draft", args: { space: "m:all", category: "機車單車", title: "二手腳踏車", body: "九成新", price: "NT$800–1,200（建議）" }, confidence: 0.9 }, P).args;
ok(d1.space === "m:all" && d1.category === "機車單車" && d1.price === "NT$800–1,200（建議）", "create_post_draft 參數");
const d2 = cleanRoute({ tool: "create_post_draft", args: { space: "hack", category: "亂寫", title: "t", price: "100" } }, P).args;
ok(d2.space === "g:chat" && d2.category === "閒聊" && d2.price === null, "create_post_draft 不合法的看板與分類 → 閒聊；閒聊不填價格");
ok(cleanRoute({ tool: "add_to_calendar", args: { keyword: "音樂會", date: "下週" } }, P).args.date === null, "add_to_calendar 不合法的日期 → null");
ok(cleanRoute({ tool: "find_rides", args: { to: "台北車站", when: "2026-11-27T15:00" }, confidence: 0.9 }, P, "幫我揪週五下午回台北的車").tool === "draft_ride", "「幫我揪」被選成找車 → 改成開團（draft_ride）");
ok(cleanRoute({ tool: "create_post_draft", args: { space: "g:lost", category: "遺失", title: "撿到學生證" }, confidence: 0.9 }, P, "幫我發一篇撿到學生證的失物招領").args.category === "拾獲", "失物招領「撿到」→ 拾獲");
ok(cleanRoute({ tool: "create_post_draft", args: { space: "m:all", category: "機車單車", title: "賣二手腳踏車", price: null }, confidence: 0.9 }, P, "幫我寫一篇賣二手腳踏車的文，1500 元").args.price === "NT$1500", "使用者說了 1500 元 → 價格一定是 NT$1500");
// web_search：沒有 Tavily 金鑰 → 關閉；有金鑰 → 檢查參數、自動加地點、修正選錯的工具
{ const saved = process.env.TAVILY_API_KEY;
  delete process.env.TAVILY_API_KEY;
  ok(cleanRoute({ tool: "web_search", args: { query: "中壢 新開 咖啡廳" }, confidence: 0.9 }, P, "中壢新開的咖啡廳").tool === "none", "web_search：沒有金鑰 → none（問松果照舊）");
  ok(cleanRoute({ tool: "find_food", args: {}, confidence: 0.9 }, P, "中壢新開的咖啡廳").tool === "find_food", "web_search：沒有金鑰 → 不會把找店改成上網");
  process.env.TAVILY_API_KEY = "tvly-test";
  const w1 = cleanRoute({ tool: "web_search", args: { query: "最近很紅的餐廳", topic: "hack", days: 9999 }, confidence: 0.9 }, P, "最近很紅的餐廳");
  ok(w1.tool === "web_search" && w1.args.query === "最近很紅的餐廳 中壢 中央大學 附近" && w1.args.topic === "general" && w1.args.days === 30, "web_search：沒說地點 → 加「中壢 中央大學 附近」；不合法的 topic → general；不合法的 days → 依原話「最近」＝30 天");
  ok(cleanRoute({ tool: "web_search", args: { query: "多益 報名 時間", topic: "general", days: 60 }, confidence: 0.9 }, P, "多益最近一次報名時間").args.query === "多益 報名 時間", "web_search：考試報名跟地點無關 → 不加地點");
  ok(cleanRoute({ tool: "web_search", args: { query: "" }, confidence: 0.9 }, P, "桃園最近有什麼展覽").args.query.includes("桃園"), "web_search：AI 沒給查詢字串 → 用原話");
  ok(cleanRoute({ tool: "find_food", args: {}, confidence: 0.9 }, P, "中央大學附近最近很紅的餐廳").tool === "web_search", "AI 把「最近很紅的餐廳」選成 find_food → 改成 web_search");
  ok(cleanRoute({ tool: "web_search", args: { query: "132 公車" }, confidence: 0.9 }, P, "下一班132").tool === "none", "AI 把「下一班132」選成 web_search → 不准上網");
  const w2 = cleanRoute({ tool: "find_events", args: { date: "2026-11-28" }, confidence: 0.9 }, P, "這週末中壢有什麼活動");
  ok(w2.tool === "web_search" && /中壢/.test(w2.args.query) && w2.args.days === 7, "正式網站實測：「這週末中壢有什麼活動」被選成 find_events → 改成 web_search（這週 → 7 天）");
  ok(cleanRoute({ tool: "find_events", args: {}, confidence: 0.9 }, P, "這週有什麼免費的講座").tool === "find_events", "校內活動（沒提校外地點）→ 照舊 find_events");
  ok(cleanRoute({ tool: "find_food", args: {}, confidence: 0.9 }, P, "中壢有什麼好吃的").tool === "find_food", "「中壢有什麼好吃的」→ 照舊美食地圖");
  ok(cleanRoute({ tool: "web_search", args: { query: "What's trending to eat near NCU" }, confidence: 0.9 }, P, "What's trending to eat near NCU?").args.query === "中央大學 熱門 美食 餐廳 附近", "正式網站實測：AI 給英文查詢字串 → 換成中文");
  ok(cleanRoute({ tool: "web_search", args: { query: "x" }, confidence: 0.3 }, P, "中壢新開的咖啡廳").tool === "none", "web_search：沒把握 → none");
  if (saved) process.env.TAVILY_API_KEY = saved; else delete process.env.TAVILY_API_KEY; }
// weather 工具：伺服器抓不到預報時改用前端送來的預報，並挑出問的那一天
{ const { weatherResult } = require(path.join(ROOT, "api/ai-agent.js"));
  const NOW = new Date("2026-11-23T22:30:00+08:00").getTime();   // 台灣晚上 10 點半（UTC 已經是同一天下午）
  const client = { source: "中央氣象署", now: { temp: 18.4, wx: "多雲" }, days: [{ t: "2026-11-23", min: 16, max: 21, pop: 20, wx: "多雲" }, { t: "2026-11-24T06:00:00+08:00", min: 15.6, max: 19.2, pop: 70, wx: "短暫雨" }] };
  const r1 = weatherResult("tomorrow", null, client, NOW);
  ok(r1.日期 === "2026-11-24" && r1.當天預報 && r1.當天預報.降雨機率 === 70 && r1.當天預報.最低 === 16, "天氣：伺服器抓不到 → 用前端的預報，挑出明天（降雨 70%）");
  const server = { 地點: "中央大學", 預報: [{ 日期: "2026-11-25", 天氣: "晴", 最低: 14, 最高: 22, 降雨機率: 0 }] };
  ok(weatherResult("dayafter", server, client, NOW).當天預報.天氣 === "晴", "天氣：伺服器有預報 → 用伺服器的，後天＝11/25");
  const r3 = weatherResult("today", null, { days: [{ t: "亂寫", min: "x" }] }, NOW);
  ok(r3.天氣 === null && r3.當天預報 === null && /抓不到/.test(r3.注意), "天氣：兩邊都沒有 → 明確標示抓不到，不讓 AI 猜");
  ok(weatherResult("hack", null, null, NOW).day === "today", "天氣：不合法的 day → today"); }

// ---------- 行事曆檔格式 ----------
console.log("\n行事曆檔（.ics）");
const ics1 = win.sgAgent.icsFor({ id: "o-1", title: "古典音樂會; 晚場", date: "2026-11-27", time: "19:00–21:00", place: "大禮堂" });
ok(/DTSTART:20261127T110000Z/.test(ics1) && /DTEND:20261127T130000Z/.test(ics1), "有時間的活動：台灣 19:00–21:00 → UTC 11:00–13:00");
ok(/SUMMARY:古典音樂會\\; 晚場/.test(ics1) && /LOCATION:大禮堂/.test(ics1) && /\r\nEND:VCALENDAR$/.test(ics1), "標題的分號有跳脫、地點、換行格式正確");
const ics2 = win.sgAgent.icsFor({ id: "o-2", title: "攝影展", date: "2026-11-20", end: "2026-11-30", time: "" });
ok(/DTSTART;VALUE=DATE:20261120/.test(ics2) && /DTEND;VALUE=DATE:20261201/.test(ics2), "沒寫時間的展覽：整天，結束日的隔天");
console.log("");

// ---------- ③ 真正的 AI 路由 ----------
(async () => {
  const BASE = (process.env.BASE_URL || "").replace(/\/+$/, "");
  const hasKey = process.env.GITHUB_MODELS_TOKEN || (process.env.AZURE_OPENAI_ENDPOINT && process.env.AZURE_OPENAI_API_KEY);
  if (!BASE && !hasKey){
    console.log("③ 真正的 AI 路由：略過。設定 BASE_URL=https://ncu-songguo.vercel.app（或本機 AI 金鑰）後再執行一次就會測。");
  } else {
    console.log(`③ 真正的 AI 路由（${BASE ? BASE + "/api/ai-agent" : "本機 api/ai-agent.js"}）`);
    const handler = BASE ? null : require(path.join(ROOT, "api/ai-agent.js"));
    const now = new Date(), pad = n => String(n).padStart(2, "0"), WK = "日一二三四五六";
    const nowStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}（週${WK[now.getDay()]}）`;
    const route = async (q) => {
      const body = { step: "route", message: q, lang: /^[A-Za-z]/.test(q) ? "en" : "zh", now: nowStr, places: P };
      if (BASE){
        try {
          const r = await fetch(BASE + "/api/ai-agent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
          const j = await r.json().catch(() => ({}));
          return j.ok ? j.data : { error: j.code || ("HTTP " + r.status) };
        } catch (e) { return { error: e.name === "TimeoutError" ? "timeout" : e.message }; }
      }
      return new Promise(done => handler({ method: "POST", headers: { "x-forwarded-for": "test-" + Math.random() }, body },
        { setHeader(){}, status(c){ this.c = c; return this; }, json(j){ done(j.ok ? j.data : { error: j.code }); } }));
    };
    const BATCH = 9, WAIT = 65000;   // 網站每個 IP 每分鐘有上限；每批 9 句、批次間等 65 秒
    // WAIT_FIRST=1：先等 65 秒再開始（剛剛才打過網站時，避免第一批就超過每分鐘上限）
    if (BASE && process.env.WAIT_FIRST){ console.log("  （先等 65 秒…）"); await new Promise(r => setTimeout(r, WAIT)); }
    let aiOK = 0; const wrong = [];
    for (let i = 0; i < CASES.length; i++){
      if (BASE && i && i % BATCH === 0){ console.log(`  （等 ${WAIT / 1000} 秒，避免超過每分鐘上限…）`); await new Promise(r => setTimeout(r, WAIT)); }
      const [q, tool, check] = CASES[i];
      const r = await route(q);
      const got = r.error ? `錯誤 ${r.error}` : r.tool;
      const good = got === tool && (!check || check(r.args || {}));
      if (good) aiOK++; else wrong.push({ q, want: tool, got, args: r.args });
      ok(good, `${q.padEnd(20)} → ${got}${got === tool && !good ? "（工具對，參數不對）" : got === tool ? "" : `（應該是 ${tool}）`}  ${r.args ? JSON.stringify(r.args) : ""}${r.lowConfidence ? " [沒把握→none]" : ""}`);
    }
    console.log(`  AI 路由：${aiOK} / ${CASES.length} 正確`);
    if (wrong.length) console.log("  需要修的：\n" + wrong.map(w => `   - 「${w.q}」應該是 ${w.want}，AI 選了 ${w.got} ${w.args ? JSON.stringify(w.args) : ""}`).join("\n"));
  }
  console.log(fail ? `\n共 ${fail} 項失敗` : "\n全部通過");
  process.exit(fail ? 1 : 0);
})();
