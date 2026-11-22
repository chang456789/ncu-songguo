/* =====================================================================
   松果 AI 代理人（前端）— 讓「問松果」不只回答文字，而是直接給可以操作的結果
   流程（一次提問最多 2 次 AI）：
     1. POST /api/ai-agent step:"route" → AI 只輸出 { tool, args }，決定用哪個工具
        （AI 失敗時，改用下面的關鍵字規則自己判斷，網站照常給結果）
     2. 程式用網站現有的資料執行工具 → 算出 result（給 AI 看）＋ cards（給使用者點）
     3. POST /api/ai-agent step:"answer" → AI 只根據 result 寫成回答（失敗時用程式寫的摘要）
     不需要工具的一般問題（tool:"none"）交回 web/assistant.js，照舊呼叫 /api/ai-chat。
   工具：commute 交通精算／find_rides 找拼車團／draft_ride 預填開團表單／find_events 找活動／
         find_food 找店家／next_class 下一堂課／my_timetable 整週課表／search_posts 搜尋貼文／weather 天氣
   不需要工具（穿搭、讀書、英文、生活建議、閒聊）或沒把握 → none；工具結果是空的 → 也交給一般回答
   index.html 用法：AGENT.init({ ... })；assistant.js 呼叫 AGENT.ask(message, history)
   ===================================================================== */
(() => {
  "use strict";
  let A = {};
  const tr = s => (A.tr ? A.tr(s) : s);
  const RA = () => window.sgRideAI;
  const CACHE_MS = 10 * 60e3, TIMEOUT_MS = 22000;
  const pad = n => String(n).padStart(2, "0");
  const localISO = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const dayISO = d => localISO(d).slice(0, 10);
  const WK = ["日", "一", "二", "三", "四", "五", "六"];
  const toMin = s => { const m = /^(\d{1,2}):(\d{2})/.exec(s || ""); return m ? +m[1] * 60 + +m[2] : null; };
  const hm = ms => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  // 片段陣列 → 字串（每段先翻譯，數字和使用者資料原樣保留）
  const say = parts => parts.flat(Infinity).map(x => typeof x === "string" ? tr(x) : String(x)).join("");

  /* ---------- 呼叫 /api/ai-agent（含 10 分鐘快取） ---------- */
  function hashKey(s){ let x = 2166136261; for (let i = 0; i < s.length; i++){ x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); } return (x >>> 0).toString(36); }
  async function post(body, cacheKey){
    const key = "ag." + hashKey(JSON.stringify(cacheKey) + "|" + A.lang());
    try { const v = JSON.parse(sessionStorage.getItem(key)); if (v && Date.now() - v.at < CACHE_MS) return { status: "ok", data: v.data }; } catch {}
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const r = await fetch("/api/ai-agent", { method: "POST", headers: { "content-type": "application/json" }, signal: ctrl.signal,
        body: JSON.stringify({ ...body, lang: A.lang() === "en" ? "en" : "zh" }) });
      let j = null; try { j = await r.json(); } catch {}
      if (r.ok && j && j.ok){ try { sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), data: j.data })); } catch {} return { status: "ok", data: j.data }; }
      const c = j && j.code;
      return { status: c === "ai_not_configured" ? "not_configured" : (r.status === 429 || c === "rate_limited") ? "rate_limited" : (r.status === 504 || c === "timeout") ? "timeout" : "error" };
    } catch (e) { return { status: e && e.name === "AbortError" ? "timeout" : "error" }; }
    finally { clearTimeout(t); }
  }

  /* ---------- AI 失敗時的關鍵字規則（不呼叫 AI 也能挑工具） ---------- */
  const PLACE_WORDS = [[/後門|宵夜街|back gate/i, "中央大學（後門）"], [/正門|學校|中大|校門|main gate|campus/i, "中央大學（正門）"],
    [/中壢(?:火)?車站|火車站|zhongli station/i, "中壢火車站"], [/高鐵|thsr|high.?speed/i, "高鐵桃園站"], [/台北|taipei/i, "台北車站"], [/松山|songshan/i, "松山機場"]];
  function placesIn(t){ const out = []; for (const [re, p] of PLACE_WORDS){ const m = re.exec(t); if (m) out.push([m.index, p]); } return out.sort((a, b) => a[0] - b[0]).map(x => x[1]); }
  function hourIn(t, now){
    const m = /(\d{1,2})\s*(?:[點:：時]|o'?clock|pm|am)\s*(\d{1,2}|半)?/i.exec(t); if (!m) return null;
    let h = +m[1]; const mi = m[2] === "半" ? 30 : m[2] ? +m[2] : 0;
    if (h < 12 && (/下午|晚上|傍晚|今晚|pm|evening|tonight/i.test(t) || (!/早上|上午|明早|am|morning/i.test(t) && now.getHours() >= h))) h += 12;
    return `${pad(h % 24)}:${pad(mi)}`;
  }
  function whenIn(t, now){
    const d = new Date(now); const tomorrow = /明|tomorrow/i.test(t); if (tomorrow) d.setDate(d.getDate() + 1);
    // 「週五」「星期五」：最近的那一天（今天是週五就是今天）
    const wd = /(?:週|星期|禮拜)([一二三四五六日天])/.exec(t);
    if (wd && !tomorrow){ const target = "日一二三四五六".indexOf(wd[1] === "天" ? "日" : wd[1]); d.setDate(d.getDate() + ((target - d.getDay() + 7) % 7)); }
    const h = hourIn(t, now);
    if (h) return `${dayISO(d)}T${h}`;
    if (/早|morning/i.test(t)) return `${dayISO(d)}T08:00`;
    if (/晚|tonight|evening/i.test(t)) return `${dayISO(d)}T19:00`;
    if (/下午|afternoon/i.test(t)) return `${dayISO(d)}T15:00`;
    return tomorrow ? `${dayISO(d)}T08:00` : null;
  }
  // 這些主題一律交給一般回答（ai-chat）：穿搭、讀書與考試、英文、生活建議、心情、閒聊
  const NONE_ALWAYS = /穿搭|穿什麼|要穿|衣服|外套|wear|outfit|clothes/i;
  const NONE_TOPICS = /讀書|念書|唸書|考試|期中|期末|複習|報告怎麼|英文|英語|多益|雅思|托福|生活建議|建議|怎麼辦|心情|壓力|焦慮|難過|失眠|室友相處|聊聊|無聊|你好|哈囉|嗨|謝謝|你是誰|\b(hi|hello|hey|thanks|study|exam|english|essay|advice|stress|bored|who are you)\b/i;
  // 句子裡明確提到網站的功能時，才不算一般問題（例如「有練英文的活動嗎」）
  const SITE_NOUNS = /活動|講座|課表|下一堂|拼車|揪|公車|高鐵|火車站|吃|店|美食|貼文|市集|二手|租屋|套房|看板|天氣|下雨|帶傘|event|ride|bus|food|market|housing|weather/i;
  function ruleRoute(t){
    const now = new Date(), P = placesIn(t);
    if (NONE_ALWAYS.test(t) || (NONE_TOPICS.test(t) && !SITE_NOUNS.test(t))) return { tool: "none", args: {} };
    if (/下一堂|下堂|next class|教室在哪|在哪.{0,4}上課/i.test(t)) return { tool: "next_class", args: {} };
    const DAYS = "一二三四五六日";
    const dm = /(?:週|星期|禮拜)([一二三四五六日天])/.exec(t);
    if (/課表|課程表|幾堂課|有什麼課|哪些課|timetable|schedule|my classes|classes on/i.test(t) || (dm && /課/.test(t)))
      return { tool: "my_timetable", args: { day: dm ? (DAYS.indexOf(dm[1] === "天" ? "日" : dm[1]) + 1) : /今天|today/i.test(t) ? ((now.getDay() + 6) % 7) + 1 : /明天|tomorrow/i.test(t) ? ((now.getDay() + 7) % 7) + 1 : null } };
    if (/課|教室|上課|class|lecture|classroom/i.test(t)) return { tool: "next_class", args: {} };
    if (/天氣|下雨|會不會雨|帶傘|溫度|幾度|冷不冷|熱不熱|weather|rain|umbrella|temperature/i.test(t))
      return { tool: "weather", args: { day: /後天|day after/i.test(t) ? "dayafter" : /明天|明早|tomorrow/i.test(t) ? "tomorrow" : "today" } };
    if (/二手|市集|在賣|有人賣|賣|收購|徵求|徵|租屋|租房|套房|雅房|房間|室友|看板|貼文|討論|有人問|有人說|PO文|second.?hand|for sale|selling|market|housing|apartment|room|roommate|post|board/i.test(t) && !/拼車|揪.*車/.test(t)){
      const board = /二手|市集|賣|收購|徵|second.?hand|for sale|selling|market/i.test(t) ? "market" : /租屋|租房|套房|雅房|房間|室友|housing|apartment|room|roommate/i.test(t) ? "housing" : /系上|系所|department/i.test(t) ? "campus" : /看板|討論|board/i.test(t) ? "forum" : null;
      const kw = (t.replace(/有沒有人|有人|在賣|賣|要|嗎|呢|\?|？|的|找|徵求|收購|二手|市集|租屋|附近|看板|貼文|上|在|問|說|有|沒有|一下|想|is anyone|anyone|selling|for sale|looking for|second.?hand|is there|are there|any|a |on the|board|market/gi, " ").trim().split(/\s+/).filter(w => w.length >= 2)[0]) || null;
      const room = board === "housing" && /套房|雅房|家庭式|整層|室友|studio|roommate/i.exec(t);
      return { tool: "search_posts", args: { keyword: room ? room[0] : kw, board } };
    }
    if (/揪|拼車|共乘|有人.*(?:一起|去|嗎)|carpool|ride ?share|anyone/i.test(t)){
      const to = P.find(p => !/中央大學/.test(p)) || null, from = P.find(p => /中央大學/.test(p)) || null;
      const draft = /我要開|幫我揪|開團|start a ride/i.test(t);
      return { tool: draft ? "draft_ride" : "find_rides", args: { from, to, when: whenIn(t, now), ...(draft ? { seats: null, luggage: /行李|luggage/i.test(t) ? "heavy" : "none" } : {}) } };
    }
    if (/吃|餐|飯|美食|便宜|宵夜|飲料|咖啡|food|eat|cheap|restaurant|dinner|lunch|snack/i.test(t))
      return { tool: "find_food", args: { budget: /便宜|cheap|省|budget/i.test(t) ? 1 : null, type: /宵夜|late.?night/i.test(t) ? "宵夜" : /早餐|breakfast/i.test(t) ? "早餐" : /飲料|咖啡|coffee|drink/i.test(t) ? "飲料咖啡" : /甜點|dessert/i.test(t) ? "甜點" : null, maxWalkMin: null, keyword: null } };
    const dest = P.includes("高鐵桃園站") ? "hsr" : P.includes("中壢火車站") ? "zl" : P.some(p => /台北|松山/.test(p)) ? "tpe" : null;
    if (dest && /到|去|公車|怎麼|來得及|趕|get to|bus|go to|by/i.test(t))
      return { tool: "commute", args: { dest, arriveBy: hourIn(t, now), luggage: /行李|luggage/i.test(t), priority: /趕|急|hurry|fast/i.test(t) ? "time" : /省錢|便宜|cheap/i.test(t) ? "money" : "balanced", origin: /後門|back gate/i.test(t) ? "back" : "gate" } };
    if (/活動|做什麼|有空|空檔|一小時|講座|展覽|event|what.*do|free time|an hour/i.test(t)){
      const today = dayISO(now);
      if (/中午|noon|lunch/i.test(t)) return { tool: "find_events", args: { date: today, timeFrom: "12:00", timeTo: "13:00", tags: [], keyword: null } };
      if (/今晚|tonight/i.test(t)) return { tool: "find_events", args: { date: today, timeFrom: "18:00", timeTo: "23:00", tags: [], keyword: null } };
      return { tool: "find_events", args: { date: /今天|today/i.test(t) ? today : null, timeFrom: null, timeTo: null, tags: /免費|free/i.test(t) ? ["免費"] : [], keyword: null } };
    }
    return { tool: "none", args: {} };
  }

  /* ---------- 工具：用網站現有資料計算結果與卡片 ---------- */
  const TOOLS = {
    commute(a){
      const r = RA(); if (!r || !r.commuteFor) return { result: { error: "unavailable" }, cards: [], summary: ["交通精算暫時無法使用"] };
      const c = r.commuteFor(a), R = c.R, p = R.pick, D = r.DESTS[a.dest], O = r.ORIGINS[a.origin || "gate"];
      const cards = [{ kind: "commute", icon: "⇄", title: ["交通精算：", O.label, " → ", D.label], sub: c.hero, action: () => r.showCommute(a) }];
      const bus = R.plans.find(x => x.kind === "bus" && !x.unavailable);
      if (bus) cards.push({ kind: "bus", icon: "🚌", title: [bus.route, "・", bus.stop, " 上車 ", r.hm(bus.depart)], sub: ["約 ", r.hm(bus.arrive), " 到・", bus.cost[0], " 元", bus.onTime === false ? "・來不及" : ""],
        action: () => { r.showCommute(a); A.goBus(a.dest); } });
      if (p.kind !== "bus") cards.push({ kind: "draft", icon: "＋", title: ["開一團拼車"], sub: [O.label, " → ", D.label],
        action: () => A.openRide(r.draftForm({ from: O.place, to: D.place, when: localISO(new Date(Date.now() + 20 * 60e3)), luggage: a.luggage ? "heavy" : "none" })) });
      return { result: c.payload, cards, summary: c.hero };
    },
    find_rides(a){
      const r = RA(); const list = r && r.findRides ? r.findRides(a) : [];
      const rides = list.slice(0, 5).map(x => ({ from: x.from, to: x.to, when: localISO(new Date(x.when)), seatsLeft: A.seatsLeft(x), tags: x.tags || [], luggage: x.luggage || "none" }));
      const cards = list.slice(0, 3).map(x => ({ kind: "ride", icon: "🚕", title: [x.from, " → ", x.to], userTitle: true,
        sub: [hm(x.when), "・剩 ", A.seatsLeft(x), " 位"], action: () => A.openRideThread(x.id) }));
      if (a.to) cards.push({ kind: "draft", icon: "＋", title: [list.length ? "都不合適？開一團（已填好）" : "開一團（已填好）"], sub: [a.from || "", a.from ? " → " : "", a.to],
        action: () => A.openRide(r.draftForm({ from: a.from || "中央大學（正門）", to: a.to, when: a.when })) });
      return { empty: !list.length, result: { criteria: a, rides }, cards,
        summary: list.length ? ["找到 ", list.length, " 團符合的拼車，點下面的卡片看討論區。"] : ["目前沒有符合的拼車團，可以自己開一團，表單已經幫你填好。"] };
    },
    draft_ride(a){
      const r = RA();
      return { result: { draft: a }, cards: [{ kind: "draft", icon: "＋", title: ["打開已填好的開團表單"], sub: [a.from || "", a.from ? " → " : "", a.to || "", a.when ? "・" + a.when.replace("T", " ") : ""],
        action: () => A.openRide(r.draftForm({ ...a, from: a.from || "中央大學（正門）", to: a.to || "中壢火車站" })) }],
        summary: ["開團表單已經幫你填好，點下面的卡片確認後再發布。"] };
    },
    find_events(a){
      const today = dayISO(new Date()), date = a.date || (a.timeFrom ? today : null);
      const from = toMin(a.timeFrom), to = toMin(a.timeTo);
      const kw = (a.keyword || "").toLowerCase();
      const list = A.events().filter(e => {
        if (date && !(e.date <= date && date <= (e.end || e.date))) return false;
        if (a.tags && a.tags.length && !a.tags.some(t => (e.tags || []).includes(t))) return false;
        if (kw && !`${e.title} ${e.place || ""} ${e.highlight || ""}`.toLowerCase().includes(kw)) return false;
        if (from != null){ const s = toMin(e.time); if (s == null) return !!e.end;          // 沒寫時間：只留展覽這類整天的
          const end = toMin(String(e.time).split(/[–~-]/)[1]); return (s >= from - 30 && s <= (to ?? from + 60)) || (s <= from && end != null && end > from); }
        return true;
      }).slice(0, 5);
      return { empty: !list.length, result: { criteria: { date, timeFrom: a.timeFrom, timeTo: a.timeTo, tags: a.tags || [] },
          events: list.map(e => ({ title: e.title, date: e.date, end: e.end || undefined, time: e.time || "", place: e.place || "", tags: e.tags || [], highlight: e.highlight || "" })) },
        cards: list.slice(0, 3).map(e => ({ kind: "event", icon: "📣", title: [e.title], userTitle: true, sub: [A.evWhen(e), e.place ? "・" + e.place : ""], action: () => A.goEvent(e.id) })),
        summary: list.length ? ["找到 ", list.length, " 個符合的活動，點下面的卡片看詳情。"] : ["這段時間沒有找到符合的活動，可以到活動頁看看其他時間。"] };
    },
    find_food(a){
      const all = A.foods();
      const base = all.filter(f => (!a.type || f.type === a.type) && (!a.maxWalkMin || f.walkMin <= a.maxWalkMin)
        && (!a.keyword || `${f.name} ${f.note || ""}`.toLowerCase().includes(a.keyword.toLowerCase())));
      let list = base.filter(f => !a.budget || (f.price && f.price <= a.budget));
      if (a.budget && list.length < 3) list = list.concat(base.filter(f => !f.price && !list.includes(f)).map(f => ({ ...f, priceUnknown: true })));
      list = list.sort((x, y) => (y.stars ?? -1) - (x.stars ?? -1) || x.walkMin - y.walkMin).slice(0, 5);
      return { empty: !list.length, result: { criteria: a, places: list.map(f => ({ name: f.name, type: f.type, price: f.price ? "$".repeat(f.price) : (f.priceUnknown ? "價位未知" : ""), stars: f.stars, ratings: f.ratings, walkMin: f.walkMin, hours: f.hours || "" })) },
        cards: list.slice(0, 3).map(f => ({ kind: "food", icon: "🍜", title: [f.name], userTitle: true,
          sub: [f.type, f.price ? "・" + "$".repeat(f.price) : "", "・走路約 ", f.walkMin, " 分鐘", f.stars ? "・★" + f.stars : ""], action: () => A.goFood(f.id) })),
        summary: list.length ? ["找到 ", list.length, " 間符合的店，點下面的卡片在美食地圖上看。"] : ["美食地圖上沒有找到符合的店，換個條件試試。"] };
    },
    my_timetable(a){
      const cs = A.timetable();
      const DAYN = ["", "週一", "週二", "週三", "週四", "週五", "週六", "週日"];
      const list = cs.filter(c => !a.day || +c.day === a.day).sort((x, y) => x.day - y.day || String(x.start).localeCompare(String(y.start)));
      const cards = [{ kind: "class", icon: "📅", title: [a.day ? DAYN[a.day] : "整週", "課表"], sub: [list.length, " 堂課"], action: () => A.goSchedule() }];
      return { empty: !list.length, cards,
        result: { day: a.day ? DAYN[a.day] : "整週", courses: list.map(c => ({ name: c.name, day: DAYN[c.day], start: c.start, end: c.end, room: c.room || "", teacher: c.teacher || "" })) },
        summary: list.length ? [a.day ? DAYN[a.day] : "這週", "有 ", list.length, " 堂課，點下面的卡片看完整課表。"] : [cs.length ? "那天沒有課。" : "你還沒有建立課表，點下面的卡片輸入一次就好。"] };
    },
    search_posts(a){
      const kw = (a.keyword || "").toLowerCase();
      const list = A.posts().filter(p => (!a.board || p.tab === a.board) && (!kw || `${p.title} ${p.body} ${p.cat || ""} ${p.spaceName || ""}`.toLowerCase().includes(kw)))
        .sort((x, y) => y.ts - x.ts).slice(0, 5);
      return { empty: !list.length,
        result: { criteria: a, posts: list.map(p => ({ board: p.spaceName, title: p.title, excerpt: String(p.body || "").slice(0, 80), category: p.cat || "", price: p.price || p.rent || "", daysAgo: Math.floor((Date.now() - p.ts) / 864e5) })) },
        cards: list.slice(0, 3).map(p => ({ kind: "post", icon: "📝", title: [p.title || "（無標題）"], userTitle: true, sub: [p.spaceName, p.price ? "・" + p.price : p.rent ? "・" + p.rent : ""], action: () => A.openPost(p.id) })),
        summary: list.length ? ["找到 ", list.length, " 篇相關的貼文，點下面的卡片看內容。"] : ["目前沒有相關的貼文，可以自己發一篇。"] };
    },
    weather(a){
      const w = A.weather && A.weather();
      const cards = [{ kind: "weather", icon: "☁️", title: ["天氣預報"], sub: ["中壢・逐時與一週預報"], action: () => A.goWeather() }];
      // 天氣數字由伺服器在 answer 步驟向 Open-Meteo 取得；這裡只準備 AI 失敗時的摘要
      return { result: { day: a.day }, cards,
        summary: w ? ["現在約 ", Math.round(w.temp), "°，降雨機率 ", w.pop ?? "—", "%。點下面的卡片看完整預報。"] : ["點下面的卡片看中壢的天氣預報。"] };
    },
    next_class(){
      const n = A.nextClass();
      if (!n) return { empty: true, result: { nextClass: null }, cards: [{ kind: "class", icon: "📅", title: ["建立課表"], sub: ["輸入一次，之後就能問下一堂課"], action: () => A.goSchedule() }],
        summary: ["你還沒有建立課表，點下面的卡片輸入一次就好。"] };
      const when = n.ongoing ? "上課中" : n.inDays === 0 ? "今天" : n.inDays === 1 ? "明天" : n.weekday;
      const cards = [{ kind: "class", icon: "📅", title: [n.name], userTitle: true, sub: [when, " ", n.start, "–", n.end, n.room ? "・" + n.room : ""], action: () => A.goSchedule() }];
      if (n.room) cards.push({ kind: "room", icon: "📍", title: ["找教室：", n.room], sub: ["在校內導航上看位置"], action: () => A.findRoom(n.room) });
      return { result: { nextClass: { ...n, when } }, cards, summary: ["下一堂是「", n.name, "」，", when, " ", n.start, n.room ? ["，在 ", n.room] : "", "。"] };
    },
  };

  /* ---------- 主流程 ---------- */
  async function ask(message, history){
    const now = new Date();
    const routed = await post({ step: "route", message, now: `${localISO(now)}（週${WK[now.getDay()]}）`, places: A.places(), history: (history || []).slice(-4) },
      { s: "route", message, hour: localISO(now).slice(0, 13) });
    let status = routed.status;
    const route = status === "ok" ? routed.data : ruleRoute(message);
    if (route.tool === "none") return { general: true, status, route };
    let out;
    try { out = TOOLS[route.tool](route.args || {}); }
    catch (e) { console.error("agent tool failed", route.tool, e); return { general: true, status, route }; }
    const cards = out.cards.map(c => ({ ...c, title: say(c.title), sub: say(c.sub) }));
    // 工具結果是空的：AI 正常時改走一般回答（ai-chat 讀得到全站資料），卡片照樣附上；AI 不能用時才顯示程式的摘要
    if (out.empty && status === "ok") return { general: true, status, route, cards };
    let reply = null;
    if (status === "ok"){
      const ans = await post({ step: "answer", message, tool: route.tool, args: route.args, result: out.result },
        { s: "answer", message, tool: route.tool, result: out.result });
      if (ans.status === "ok") reply = ans.data.reply; else status = ans.status;
    }
    return { reply: reply || say(out.summary), byAI: !!reply, cards, status, tool: route.tool, args: route.args };
  }

  window.sgAgent = { init(o){ A = { ...A, ...o }; }, ask, ruleRoute, TOOLS };
})();
