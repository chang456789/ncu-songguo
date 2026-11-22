// 問松果 AI 代理人：路由測試
// 執行：node tests/agent-route.test.js
//   ① 關鍵字備援（AI 不能用時，web/agent.js 的 ruleRoute）— 一定會跑
//   ② 伺服器檢查 AI 選的工具（api/ai-agent.js 的 cleanRoute）— 一定會跑
//   ③ 真正的 AI 路由 — 有設定 AI 金鑰（GITHUB_MODELS_TOKEN 或 AZURE_OPENAI_*）時才會跑
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
];

let fail = 0;
const ok = (cond, label) => { console.log((cond ? "  ✓ " : "  ✗ ") + label); if (!cond) fail++; };

// ---------- ① 關鍵字備援 ----------
console.log("① 關鍵字備援（AI 不能用時）");
const win = {};
vm.runInNewContext(fs.readFileSync(path.join(ROOT, "web/agent.js"), "utf8"), { window: win, console, Date, sessionStorage: { getItem(){ return null; }, setItem(){} } });
const ruleRoute = win.sgAgent.ruleRoute;
let ruleOK = 0;
for (const [q, tool, check] of CASES){
  const r = ruleRoute(q);
  const good = r.tool === tool && (!check || check(r.args || {}));
  if (good) ruleOK++;
  ok(good, `${q.padEnd(20)} → ${r.tool}${good ? "" : `（應該是 ${tool}）`}  ${JSON.stringify(r.args)}`);
}
console.log(`  關鍵字備援：${ruleOK} / ${CASES.length} 正確\n`);

// ---------- ② 伺服器檢查 ----------
console.log("② 伺服器檢查 AI 選的工具（cleanRoute）");
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
console.log("");

// ---------- ③ 真正的 AI 路由 ----------
(async () => {
  if (!process.env.GITHUB_MODELS_TOKEN && !(process.env.AZURE_OPENAI_ENDPOINT && process.env.AZURE_OPENAI_API_KEY)){
    console.log("③ 真正的 AI 路由：略過（沒有設定 AI 金鑰）。設定 GITHUB_MODELS_TOKEN 後再執行一次就會測。");
  } else {
    console.log("③ 真正的 AI 路由");
    const handler = require(path.join(ROOT, "api/ai-agent.js"));
    const now = new Date(), pad = n => String(n).padStart(2, "0");
    const nowStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T14:00（週四）`;
    let aiOK = 0;
    for (const [q, tool] of CASES){
      const r = await new Promise(done => handler({ method: "POST", headers: { "x-forwarded-for": "test-" + Math.random() }, body: { step: "route", message: q, lang: /[a-z]/i.test(q[0]) ? "en" : "zh", now: nowStr, places: P } },
        { setHeader(){}, status(c){ this.c = c; return this; }, json(j){ done({ code: this.c, j }); } }));
      const got = r.j.ok ? r.j.data.tool : `錯誤 ${r.j.code}`;
      if (got === tool) aiOK++;
      ok(got === tool, `${q.padEnd(20)} → ${got}${got === tool ? "" : `（應該是 ${tool}）`}`);
    }
    console.log(`  AI 路由：${aiOK} / ${CASES.length} 正確`);
  }
  console.log(fail ? `\n共 ${fail} 項失敗` : "\n全部通過");
  process.exit(fail ? 1 : 0);
})();
