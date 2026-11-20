/* =====================================================================
   松果 AI 智慧交通與共乘（前端）  — 搭配 api/ai-ride.js
   功能一：交通精算師（交通分頁頂部的「智慧精算決策卡」）
     1. 程式先算出每個方案的數字：公車／拼車／計程車的步行、等車、車程、總時間、每人費用
     2. 程式依「優先考量」選出首選（數字與首選都不是 AI 決定的）
     3. 只呼叫一次 AI（task: commute_advisor），請它寫一句首選建議＋理由＋風險
     4. AI 失敗（尚未設定、逾時、太頻繁）時，照樣顯示程式算好的比較，並用程式寫的首選句子
   省額度：同樣的條件 10 分鐘內不重複呼叫 AI，結果暫存在 sessionStorage。
   index.html 用法：RA.init({...})、RA.commuteCard()、RA.isPick(dest, trip)、RA.filterRides(list)、RA.filterBar()
   ===================================================================== */
(() => {
  "use strict";
  let A = {};   // index.html 透過 RA.init() 提供的工具與資料（h、trips、rides、weather…）
  const tr = s => (A.tr ? A.tr(s) : s);

  /* =================================================================
     共用：呼叫 /api/ai-ride（四種狀態＋10 分鐘快取）
     ================================================================= */
  const CACHE_MS = 10 * 60e3, TIMEOUT_MS = 25000;
  function hashKey(s){ let x = 2166136261; for (let i = 0; i < s.length; i++){ x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); } return (x >>> 0).toString(36); }
  function cacheGet(key){
    try { const v = JSON.parse(sessionStorage.getItem("ra." + key)); if (v && Date.now() - v.at < CACHE_MS) return v.data; } catch {}
    return null;
  }
  function cacheSet(key, data){ try { sessionStorage.setItem("ra." + key, JSON.stringify({ at: Date.now(), data })); } catch {} }
  /** 回傳 { status: "ok" | "not_configured" | "rate_limited" | "timeout" | "error", data } */
  async function callAI(task, payload, cacheKey){
    const key = task + "." + hashKey(JSON.stringify(cacheKey || payload) + "|" + A.lang());
    const hit = cacheGet(key); if (hit) return { status: "ok", data: hit, cached: true };
    const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const r = await fetch("/api/ai-ride", { method: "POST", headers: { "content-type": "application/json" }, signal: ctrl.signal,
        body: JSON.stringify({ task, payload, lang: A.lang() === "en" ? "en" : "zh" }) });
      let j = null; try { j = await r.json(); } catch {}
      if (r.ok && j && j.ok) { cacheSet(key, j.data); return { status: "ok", data: j.data }; }
      const code = j && j.code;
      if (code === "ai_not_configured") return { status: "not_configured" };
      if (r.status === 429 || code === "rate_limited") return { status: "rate_limited" };
      if (r.status === 504 || code === "timeout") return { status: "timeout" };
      return { status: "error" };
    } catch (e) {
      return { status: e && e.name === "AbortError" ? "timeout" : "error" };
    } finally { clearTimeout(timer); }
  }
  // 四種狀態給使用者看的說明（AI 失敗時，原本的功能照樣能用）
  const STATE_MSG = {
    loading: "AI 正在分析…",
    not_configured: "AI 尚未設定，先顯示程式算好的結果。",
    rate_limited: "AI 使用太頻繁了，請等一分鐘再試。先顯示程式算好的結果。",
    timeout: "AI 回應逾時，先顯示程式算好的結果。",
    error: "AI 暫時無法使用，先顯示程式算好的結果。",
  };

  /* =================================================================
     功能一：交通精算師 — 常數（都有出處或估算方式）
     ================================================================= */
  // 出發點 → 各方向最近的站牌與步行分鐘數（晴天）。
  // 站牌依總務處「對外交通資訊」：132／133／172／173 校內停 前門警衛室、中大湖、依仁堂、後門、觀景台；9025A 停 警衛室、依仁堂。
  // 步行分鐘數依校園地圖直線距離 ×1.3（繞路）÷ 每分鐘 80 公尺估算，取整數。
  const ORIGINS = {
    gate:  { label: "正門",   place: "中央大學（正門）", stop: { zl: ["前門警衛室", 1], hsr: ["前門警衛室", 1], tpe: ["前門警衛室", 1] }, nightWalk: 0 },
    back:  { label: "後門",   place: "中央大學（後門）", stop: { zl: ["後門", 1], hsr: ["後門", 1], tpe: ["依仁堂", 8] }, nightWalk: 0 },
    snack: { label: "宵夜街", place: "中央大學（後門）", stop: { zl: ["後門", 6], hsr: ["後門", 6], tpe: ["依仁堂", 13] }, nightWalk: 0 },
    edu:   { label: "綜教館", place: "中央大學（正門）", stop: { zl: ["依仁堂", 3], hsr: ["依仁堂", 3], tpe: ["依仁堂", 3] }, nightWalk: 8 },
  };
  // 計程車車資：
  //  - 中大 ↔ 中壢火車站：約 165 元（網站原本的資料）
  //  - 中大 ↔ 高鐵桃園站、台北：Uber／LINE GO 的試算只能在 App 內登入後查詢，無法取得可引用的數字，
  //    所以改用桃園市計程車費率推算，並一律顯示「區間」：
  //    費率：起程 1.25 公里 90 元、續程每 200 公尺 5 元（桃園市 2025 年調整後費率；
  //    來源：聯合新聞網 https://udn.com/news/story/7266/9275847 ，查詢日期 2026-11-20）。
  //    中大→高鐵桃園站 行車約 9 公里 → 跳表約 296 元；加上塞車延滯、議價差異 → 250–350 元。
  //    中大→台北市區 行車約 50 公里（國道 1 號）→ 跳表約 1,330 元；加上延滯 → 1,300–1,700 元。
  //  AI 不可以自己估車資，只能引用這裡算好的數字。
  const DESTS = {
    zl:  { label: "中壢火車站", place: "中壢火車站", match: /中壢火車站/, fare: 18, taxi: [165, 165], taxiRide: 15, peakBus: 10, peakTaxi: 8 },
    hsr: { label: "高鐵桃園站", place: "高鐵桃園站", match: /高鐵/, fare: 18, taxi: [250, 350], taxiRide: 20, peakBus: 10, peakTaxi: 10, busRide: 25 },
    tpe: { label: "台北", place: "台北車站", match: /台北|松山/, fare: 84, taxi: [1300, 1700], taxiRide: 60, peakBus: 20, peakTaxi: 25 },
  };
  // 高鐵線車程：總務處公告「車程約 20–30 分鐘」，取 25 分鐘。
  // 中壢線：用網站時刻表「中壢開 → 約到中大」的時間差，算出每條路線的平均車程（程式算，不是猜的）。
  // 台北線：9025A 時刻表有「約到松山機場」的時間，直接相減。
  const TAXI_WAIT = { base: 8, peak: 12, rain: 15, both: 18 };   // 叫車等待分鐘（估計值）
  const GATHER_MIN = 20;      // 自己開一團時，預估揪到人需要的時間
  const BUFFER_MIN = 2;       // 提早到站牌的緩衝

  const LS = { get(k, d){ try { const v = localStorage.getItem(k); return v == null ? d : v; } catch { return d; } }, set(k, v){ try { localStorage.setItem(k, v); } catch {} } };
  const CM = {
    dest: null, origin: LS.get("ra.origin", "gate"), arriveBy: "", luggage: false, party: 1,
    priority: LS.get("ra.priority", "balanced"), scenario: "real",
    result: null, ai: null, stale: false, moreOpen: false,
  };

  const hm = m => A.fromMin(((Math.round(m) % 1440) + 1440) % 1440);
  const toMin = t => { const [a, b] = String(t).split(":").map(Number); return a * 60 + b; };
  function routeRide(dest, trip){
    const BUS = A.bus;
    if (dest === "zl"){
      const list = BUS.zl.filter(x => x[0] === trip.route).map(x => toMin(x[2]) - toMin(x[1]));
      return list.length ? Math.round(list.reduce((a, b) => a + b, 0) / list.length) : 25;
    }
    if (dest === "tpe"){
      const hit = BUS.tpeOut.find(x => toMin(x[1]) === trip.t);
      return hit ? toMin(hit[2]) - toMin(hit[1]) : 60;
    }
    return DESTS.hsr.busRide;
  }
  function weatherNow(){
    if (CM.scenario === "rain") return { rain: true, peak: false, simulated: true };
    if (CM.scenario === "peak") return { rain: false, peak: true, simulated: true };
    if (CM.scenario === "normal") return { rain: false, peak: false, simulated: true };
    const w = A.weather && A.weather();
    const rain = !!w && ((w.pop != null && w.pop >= 50) || /雨/.test(w.wx || ""));
    return { rain, peak: false, simulated: false, pop: w ? w.pop : null, temp: w && w.temp != null ? Math.round(w.temp) : null, known: !!w };
  }
  const mid = p => (p.cost[0] + p.cost[1]) / 2;
  const perPerson = (range, n) => [Math.ceil(range[0] / n), Math.ceil(range[1] / n)];

  /* ---------- 算出所有方案（純程式） ---------- */
  function compute(){
    const dest = CM.dest, D = DESTS[dest], O = ORIGINS[CM.origin] || ORIGINS.gate;
    const now = A.nowMin(), hour = new Date().getHours(), night = hour >= 23 || hour < 5;
    const sc = weatherNow(); const { rain, peak } = sc;
    const party = CM.party, plans = [];

    // 1) 步行＋公車
    const [stop, w0] = O.stop[dest];
    const walk = Math.ceil(w0 * (rain ? 1.3 : 1));
    const list = A.trips(dest);
    const idx = list.findIndex(x => x.t >= now + walk + BUFFER_MIN);
    if (idx >= 0){
      const trip = list[idx];
      const ride = routeRide(dest, trip) + (rain ? 5 : 0) + (peak ? D.peakBus : 0);
      const wait = trip.t - now - walk;
      const notes = [];
      if (trip.approx) notes.push(["公車時間是客運的預估，建議提早 ", BUFFER_MIN, " 分鐘到站牌"]);
      if (wait > 20) notes.push(["到站後要等 ", wait, " 分鐘"]);
      if (CM.luggage && dest !== "tpe") notes.push(["大行李搭市區公車比較不方便"]);
      let nextArrive = null;
      if (peak){ const n2 = list[idx + 1];
        if (n2){ nextArrive = n2.t + routeRide(dest, n2) + (rain ? 5 : 0) + D.peakBus; notes.push(["尖峰可能客滿；改搭下一班 ", hm(n2.t), "，約 ", hm(nextArrive), " 到"]); }
        else notes.push(["尖峰可能客滿，而且這是今天最後一班"]); }
      if (rain && walk > 3) notes.push(["下雨走到站牌約 ", walk, " 分鐘，記得帶傘"]);
      plans.push({ id: "bus", kind: "bus", name: ["步行＋公車 ", trip.route], route: trip.route, trip, stop,
        depart: trip.t, arrive: trip.t + ride, walk, wait, ride, approx: true,
        cost: [D.fare, D.fare], costTotal: D.fare * party, notes, pros: ["最便宜"], fareLabel: dest === "tpe" ? "9025A 全票" : "市區公車全票" });
    } else {
      const tm = A.tomorrow && A.tomorrow(dest);
      const notes = [["今天往這個方向的公車已經收班"]];
      if (tm) notes.push(["明天首班 ", tm.route, "・", hm(tm.t)]);
      plans.push({ id: "bus", kind: "bus", name: ["步行＋公車"], unavailable: true, notes });
    }

    // 2) 計程車（自己叫）
    const tWait = rain && peak ? TAXI_WAIT.both : rain ? TAXI_WAIT.rain : peak ? TAXI_WAIT.peak : TAXI_WAIT.base;
    const tWalk = night ? O.nightWalk : 0;
    const tRide = D.taxiRide + (peak ? D.peakTaxi : 0) + (rain ? 5 : 0);
    const taxiNotes = [];
    if (D.taxi[0] !== D.taxi[1]) taxiNotes.push(["車資是依桃園市計程車費率推算的區間，實際以跳表或叫車 App 為準"]);
    if (night && tWalk) taxiNotes.push(["23:00–05:00 車輛不能進校園，要走到正門上車"]);
    if (rain) taxiNotes.push(["下雨叫車要等比較久"]);
    plans.push({ id: "taxi", kind: "taxi", name: ["計程車（自己叫）"], depart: now + tWalk + tWait, arrive: now + tWalk + tWait + tRide,
      walk: tWalk, wait: tWait, ride: tRide, cost: perPerson(D.taxi, party), costTotal: D.taxi, people: party, notes: taxiNotes,
      pros: CM.luggage ? ["行李放後車廂"] : [] });

    // 3) 拼車：有同方向、還有空位的團就加入；沒有就自己開一團
    const nowMs = Date.now();
    const need = party;
    const same = A.rides().filter(r => /中央大學/.test(r.from || "") && D.match.test(r.to || ""));
    const join = same.filter(r => r.when >= nowMs + tWalk * 60e3 && r.when <= nowMs + 3 * 3600e3 && A.seatsLeft(r) >= need && r.uid !== A.uid())
      .sort((a, b) => a.when - b.when)[0];
    const poolNotes = [];
    if (CM.luggage) poolNotes.push(["大行李可能要多占一個座位，先在討論區說一聲"]);
    if (join){
      const dep = now + Math.max(0, Math.round((join.when - nowMs) / 60e3));
      plans.push({ id: "pool", kind: "pool", name: ["加入拼車團"], ride: tRide, wait: dep - now, walk: 0, depart: dep, arrive: dep + tRide,
        cost: perPerson(D.taxi, join.seats || 4), costTotal: D.taxi, people: join.seats || 4, joinRide: join,
        notes: [["以團主設定的出發時間 ", hm(dep), " 計算"], ...poolNotes], pros: ["比自己叫車便宜"] });
    } else if (party < 4) {
      poolNotes.unshift(["目前沒有同方向的團，揪人約需 ", GATHER_MIN, " 分鐘（估計）；揪不到就要自己付全額"]);
      const dep = now + GATHER_MIN;
      plans.push({ id: "pool", kind: "pool", name: ["自己開一團拼車"], ride: tRide, wait: GATHER_MIN, walk: 0, depart: dep, arrive: dep + tRide,
        cost: perPerson(D.taxi, 4), costTotal: D.taxi, people: 4, openNew: true, notes: poolNotes, pros: ["4 人分攤最划算"] });
    }

    // ---------- 選首選（程式決定） ----------
    const target = CM.arriveBy ? toMin(CM.arriveBy) + (toMin(CM.arriveBy) < now - 60 ? 1440 : 0) : null;
    const avail = plans.filter(p => !p.unavailable);
    for (const p of avail){ p.total = p.arrive - now; p.onTime = target == null ? null : p.arrive <= target; }
    let pool = target == null ? avail : avail.filter(p => p.onTime);
    const noneOnTime = target != null && !pool.length;
    if (!pool.length) pool = avail;
    const penalty = p => (p.kind === "bus" && CM.luggage && dest !== "tpe" ? (rain ? 35 : 15) : 0) + (p.kind === "bus" && peak ? 10 : 0) + (rain && p.walk > 5 ? p.walk : 0) + (p.openNew ? 10 : 0);
    // 都趕不上希望的抵達時間時，一律選最早到的
    const score = p => CM.priority === "time" || noneOnTime ? p.arrive + mid(p) / 1e4
      : CM.priority === "money" ? mid(p) + p.arrive / 1e4
      : p.total + mid(p) / 4 + penalty(p);
    const pick = pool.slice().sort((a, b) => score(a) - score(b))[0];
    for (const p of avail) if (p !== pick) p.vsPick = { arriveLaterMin: Math.round(p.arrive - pick.arrive), costMorePerPerson: Math.round(mid(p) - mid(pick)) };
    const sameCount = same.filter(r => r.when >= nowMs - 30 * 60e3).length;
    return { dest, D, O, now, sc, plans, pick, target, noneOnTime, sameCount, party, luggage: CM.luggage, priority: CM.priority };
  }

  const flat = parts => parts.map(x => Array.isArray(x) ? flat(x) : String(x)).join("");
  const costText = c => c[0] === c[1] ? String(c[0]) : `${c[0]}–${c[1]}`;
  function payloadOf(R){
    return {
      from: R.O.label, to: R.D.label, now: hm(R.now),
      conditions: { arriveBy: CM.arriveBy || null, bigLuggage: R.luggage, people: R.party, priority: { time: "趕時間（最早到）", money: "省錢", balanced: "時間與費用平衡" }[R.priority] },
      scenario: { rain: R.sc.rain, peak: R.sc.peak, simulated: R.sc.simulated, ...(R.sc.pop != null ? { rainChancePct: R.sc.pop } : {}) },
      pick: R.pick.id, noneArrivesOnTime: R.noneOnTime, sameDirectionRides: R.sameCount,
      plans: R.plans.map(p => p.unavailable ? { id: p.id, name: flat(p.name), unavailable: true, notes: p.notes.map(flat) } : {
        id: p.id, name: flat(p.name), depart: hm(p.depart), arrive: "約 " + hm(p.arrive), totalMin: p.total, walkMin: p.walk, waitMin: p.wait, rideMin: p.ride,
        [p.cost[0] === p.cost[1] ? "costPerPerson" : "costRangePerPerson"]: p.cost[0] === p.cost[1] ? p.cost[0] : p.cost,
        ...(p.stop ? { boardAt: p.stop } : {}), ...(p.onTime != null ? { arrivesOnTime: p.onTime } : {}),
        ...(p.vsPick ? { diffVsPick: p.vsPick } : {}), notes: p.notes.map(flat) }),
    };
  }
  // AI 用不了時，程式自己寫首選句子（片段分開，讓 i18n 能逐段翻成英文）
  function fallbackHero(R){
    const p = R.pick;
    return [p.name, "：", "出發時間 ", hm(p.depart), "・", "抵達約 ", hm(p.arrive), "・", "每人 ", costText(p.cost), " 元"];
  }

  async function runAI(){
    const R = CM.result; if (!R) return;
    const payload = payloadOf(R);
    // 快取用的鍵：條件＋首選方案（分鐘數每分鐘都會變，不放進鍵）
    const ck = { d: R.dest, o: CM.origin, a: CM.arriveBy, l: CM.luggage, n: CM.party, p: CM.priority, s: CM.scenario, rain: R.sc.rain, pick: R.pick.id, dep: hm(R.pick.depart) };
    CM.ai = { status: "loading" }; CM.stale = false; A.renderKeep();
    const r = await callAI("commute_advisor", payload, ck);
    if (CM.result !== R) return;   // 使用者已經換了條件
    CM.ai = r; A.renderKeep();
  }
  function analyze(dest){
    if (dest) CM.dest = dest;
    if (!CM.dest) return;
    CM.result = compute(); runAI();
  }
  function changed(){ if (!CM.dest) return A.renderKeep(); CM.result = compute(); CM.stale = true; A.renderKeep(); }

  /* ---------- 畫面 ---------- */
  function seg(options, cur, onPick, label){
    const h = A.h;
    return h("div", { class: "seg ra-seg", role: "group", "aria-label": label }, options.map(([k, l]) =>
      h("button", { type: "button", "aria-pressed": cur === k ? "true" : "false", onclick: () => onPick(k) }, l)));
  }
  function controls(){
    const h = A.h;
    return h("div", { class: "ra-ctrl" },
      h("label", { class: "ra-f" }, h("span", {}, "出發點"),
        h("select", { id: "ra-origin", onchange: e => { CM.origin = e.target.value; LS.set("ra.origin", CM.origin); changed(); } },
          Object.entries(ORIGINS).map(([k, o]) => h("option", { value: k, selected: CM.origin === k }, o.label)))),
      h("label", { class: "ra-f" }, h("span", {}, "希望幾點抵達"),
        h("input", { type: "time", id: "ra-arrive", value: CM.arriveBy, onchange: e => { CM.arriveBy = e.target.value; changed(); } })),
      h("label", { class: "ra-f" }, h("span", {}, "人數"),
        h("select", { id: "ra-party", onchange: e => { CM.party = +e.target.value; changed(); } },
          [1, 2, 3, 4].map(n => h("option", { value: n, selected: CM.party === n }, String(n))))),
      h("label", { class: "ra-chk" }, h("input", { type: "checkbox", checked: CM.luggage, onchange: e => { CM.luggage = e.target.checked; changed(); } }), "有大行李"),
      h("div", { class: "ra-f ra-wide" }, h("span", {}, "優先考量"),
        seg([["time", "趕時間"], ["balanced", "平衡"], ["money", "省錢"]], CM.priority, k => { CM.priority = k; LS.set("ra.priority", k); changed(); }, "優先考量")),
      h("div", { class: "ra-f ra-wide" }, h("span", {}, "天氣與路況"),
        seg([["real", "即時天氣"], ["normal", "一般"], ["rain", "下雨"], ["peak", "尖峰"]], CM.scenario, k => { CM.scenario = k; changed(); }, "天氣與路況")));
  }
  function planCard(p, R){
    const h = A.h, isPick = p === R.pick;
    if (p.unavailable) return h("div", { class: "ra-plan off" }, h("b", {}, p.name), p.notes.map(n => h("p", { class: "small muted" }, n)));
    return h("div", { class: "ra-plan" + (isPick ? " pick" : "") },
      h("div", { class: "ra-plan-top" }, h("b", {}, p.name), isPick ? h("span", { class: "ra-badge" }, "首選") : null,
        p.onTime === false ? h("span", { class: "ra-badge warn" }, "來不及") : p.onTime === true ? h("span", { class: "ra-badge ok" }, "來得及") : null),
      h("div", { class: "ra-nums" },
        h("div", {}, h("small", {}, "總時間"), h("b", {}, String(p.total), h("small", {}, " 分鐘"))),
        h("div", {}, h("small", {}, "抵達"), h("b", {}, h("small", {}, "約 "), hm(p.arrive))),
        h("div", {}, h("small", {}, "每人"), h("b", {}, costText(p.cost), h("small", {}, " 元")))),
      h("p", { class: "ra-break small muted" },
        p.walk ? ["步行 ", p.walk, "・"] : null, "等 ", p.wait, "・", "車程 ", p.ride, " 分鐘",
        p.stop ? ["・", p.stop, " 上車 ", hm(p.depart)] : null,
        p.people > 1 ? ["・", "總價 ", costText(p.costTotal), " 元 ÷ ", p.people, " 人"] : null),
      (p.pros.length || p.notes.length) ? h("ul", { class: "ra-notes" },
        p.pros.map(x => h("li", { class: "pro" }, x)), p.notes.map(n => h("li", {}, n))) : null);
  }
  function actions(R){
    const h = A.h, p = R.pick, out = [];
    const to = R.D.place, from = R.O.place;
    if (p.kind === "bus"){
      out.push(h("button", { type: "button", class: "primary", onclick: () => { A.goBus(R.dest); setTimeout(() => { const el = document.querySelector(".trow.ra-pick"); if (el) el.scrollIntoView({ block: "center", behavior: "smooth" }); }, 80); } }, "在時刻表上看這班"));
    }
    if (p.kind === "pool" || p.kind === "taxi"){
      if (R.sameCount) out.push(h("button", { type: "button", class: p.kind === "pool" ? "primary" : "ghost", onclick: () => A.goRides({ to: R.dest }) }, "找同方向拼車"));
      const when = Date.now() + Math.max(15, p.kind === "pool" && p.openNew ? GATHER_MIN : 15) * 60e3;
      out.push(h("button", { type: "button", class: p.kind === "pool" && !R.sameCount ? "primary" : "ghost", disabled: !A.canPost(),
        onclick: () => A.openRide({ from, to, when, note: CM.luggage ? "有大行李" : "" }) }, "開一團拼車"));
    }
    return out.length ? h("div", { class: "ra-acts" }, out) : null;
  }
  function commuteCard(){
    const h = A.h; if (!h) return null;
    const R = CM.result;
    const quick = h("div", { class: "ra-quick" }, [["zl", "現在去中壢火車站"], ["hsr", "現在去高鐵桃園站"], ["tpe", "現在去台北"]].map(([d, l]) =>
      h("button", { type: "button", class: "ra-qbtn", "aria-pressed": CM.dest === d ? "true" : "false", onclick: () => analyze(d) }, l)));
    const head = h("div", { class: "ra-head" }, h("div", {}, h("b", {}, "智慧精算決策卡"), h("span", { class: "small muted" }, "AI 幫你比較公車、拼車、計程車的時間與費用")));
    if (!R) return h("section", { class: "card ra-card" }, head, quick, h("details", { class: "ra-more", open: CM.moreOpen || null, ontoggle: e => { CM.moreOpen = e.target.open; } }, h("summary", {}, "調整條件"), controls()));

    const ai = CM.ai || {};
    const useAI = ai.status === "ok" && ai.data && !CM.stale;
    const sc = R.sc;
    const scLine = h("div", { class: "ra-sc small" },
      sc.simulated ? h("span", { class: "ra-badge warn" }, "模擬情境") : null,
      sc.simulated ? h("span", {}, { normal: "一般", rain: "下雨", peak: "尖峰" }[CM.scenario]) :
        sc.known ? h("span", { class: "muted" }, "即時天氣：", sc.rain ? "可能下雨" : "不太會下雨", sc.pop != null ? ["（", "降雨機率 ", sc.pop, "%", "）"] : null) :
        h("span", { class: "muted" }, "抓不到即時天氣，以一般情況計算"),
      h("span", { class: "muted" }, "・", R.O.label, " → ", R.D.label, "・", "現在 ", hm(R.now)));
    let heroBox;
    if (useAI){
      heroBox = h("div", { class: "ra-hero" },
        h("p", { class: "ra-hero-t", translate: "no" }, ai.data.hero),
        ai.data.reasons.length ? h("ul", { class: "ra-why", translate: "no" }, ai.data.reasons.map(x => h("li", {}, x))) : null,
        ai.data.risks.length ? h("ul", { class: "ra-risk", translate: "no" }, ai.data.risks.map(x => h("li", {}, x))) : null,
        h("p", { class: "ra-tag small muted" }, "AI 撰寫說明・所有數字由程式計算"));
    } else {
      const loading = ai.status === "loading";
      heroBox = h("div", { class: "ra-hero" },
        h("p", { class: "ra-hero-t" }, fallbackHero(R)),
        R.noneOnTime ? h("p", { class: "ra-warn small" }, "所有方案都趕不上你希望的抵達時間，以下是最快的選擇。") : null,
        loading ? h("p", { class: "ra-state small", role: "status" }, h("i", { class: "ra-spin" }), STATE_MSG.loading) :
        CM.stale ? h("p", { class: "ra-state small" }, "條件已變更，數字已重新計算。", h("button", { type: "button", class: "linkbtn", onclick: runAI }, "更新 AI 建議")) :
        STATE_MSG[ai.status] ? h("p", { class: "ra-state small" + (ai.status === "not_configured" ? "" : " warn") }, STATE_MSG[ai.status],
          ai.status !== "not_configured" ? h("button", { type: "button", class: "linkbtn", onclick: runAI }, "再試一次") : null) : null);
    }
    return h("section", { class: "card ra-card" }, head, quick,
      h("details", { class: "ra-more", open: CM.moreOpen || null, ontoggle: e => { CM.moreOpen = e.target.open; } }, h("summary", {}, "調整條件"), controls()),
      scLine, heroBox,
      R.noneOnTime && useAI ? h("p", { class: "ra-warn small" }, "所有方案都趕不上你希望的抵達時間，以下是最快的選擇。") : null,
      actions(R),
      h("div", { class: "ra-plans" }, R.plans.map(p => planCard(p, R))),
      h("p", { class: "small muted ra-src" }, "時間依總務處公車時刻表與步行距離估算；車資：市區公車 18 元、9025A 84 元，計程車到中壢車站約 165 元，高鐵、台北依桃園市計程車費率推算。實際以公車動態與跳表為準。"));
  }

  // 公車時刻表上要不要標出「首選那班」
  function isPick(dest, trip){
    const R = CM.result; if (!R || R.dest !== dest || R.pick.kind !== "bus") return false;
    return R.pick.trip.route === trip.route && R.pick.trip.t === trip.t;
  }
  // 「找同方向拼車」：拼車列表只顯示往那個方向的團
  let rideFilter = null;
  function setRideFilter(f){ rideFilter = f; }
  function filterRides(list){ if (!rideFilter || !DESTS[rideFilter.to]) return list; const D = DESTS[rideFilter.to]; return list.filter(r => D.match.test(r.to || "")); }
  function filterBar(){
    if (!rideFilter || !DESTS[rideFilter.to]) return null;
    const h = A.h;
    return h("div", { class: "ra-filter" }, h("span", {}, "只顯示往 ", DESTS[rideFilter.to].label, " 的團"),
      h("button", { type: "button", class: "linkbtn", onclick: () => { rideFilter = null; A.renderKeep(); } }, "顯示全部"));
  }

  /* ---------- 樣式（只用網站的 CSS 變數） ---------- */
  const css = `
.ra-card{display:flex;flex-direction:column;gap:12px}
.ra-head b{display:block;font-size:17px}
.ra-quick{display:flex;gap:8px;flex-wrap:wrap}
.ra-qbtn{flex:1 1 140px;background:var(--sunk);color:var(--ink);border:1px solid var(--line);border-radius:12px;padding:10px 12px;font-weight:700;font-size:15px;cursor:pointer;text-align:center}
.ra-qbtn[aria-pressed=true]{border-color:var(--pine);color:var(--pine);background:var(--surface);box-shadow:inset 0 0 0 1px var(--pine)}
.ra-more summary{cursor:pointer;color:var(--pine);font-weight:600;font-size:14px}
.ra-ctrl{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:10px}
.ra-f{display:flex;flex-direction:column;gap:4px;font-size:13px;color:var(--muted);min-width:0}
.ra-f select,.ra-f input{color:var(--ink)}
.ra-wide{grid-column:1/-1}
.ra-chk{display:flex;align-items:center;gap:8px;font-size:14px;align-self:end;padding-bottom:10px}
.ra-chk input{width:18px;height:18px}
.ra-seg{display:flex;flex-wrap:wrap}
.ra-seg button{flex:1 1 auto}
.ra-sc{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.ra-hero{background:var(--sunk);border-radius:14px;padding:14px 16px;display:flex;flex-direction:column;gap:8px;border-left:4px solid var(--pine)}
.ra-hero-t{margin:0;font-size:20px;font-weight:800;line-height:1.4;color:var(--ink)}
.ra-why,.ra-risk{margin:0;padding-left:20px;font-size:14px;line-height:1.55;display:flex;flex-direction:column;gap:2px}
.ra-risk li{color:var(--bus)}
.ra-tag{margin:0}
.ra-state{margin:0;display:flex;align-items:center;gap:8px;flex-wrap:wrap;color:var(--muted)}
.ra-state.warn{color:var(--bus)}
.ra-warn{margin:0;color:var(--bus);font-weight:600}
.ra-spin{width:14px;height:14px;border:2px solid var(--line);border-top-color:var(--pine);border-radius:50%;animation:ra-spin .8s linear infinite;display:inline-block}
@keyframes ra-spin{to{transform:rotate(360deg)}}
.ra-acts{display:flex;gap:8px;flex-wrap:wrap}
.ra-plans{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px}
.ra-plan{border:1px solid var(--line);border-radius:14px;padding:12px;display:flex;flex-direction:column;gap:8px;min-width:0}
.ra-plan.pick{border-color:var(--pine);box-shadow:inset 0 0 0 1px var(--pine)}
.ra-plan.off{opacity:.7}
.ra-plan p{margin:0}
.ra-plan-top{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.ra-badge{font-size:12px;font-weight:700;border-radius:999px;padding:2px 8px;background:var(--pine);color:var(--bg)}
.ra-badge.ok{background:var(--sunk);color:var(--pine);border:1px solid var(--pine)}
.ra-badge.warn{background:var(--bus-soft);color:var(--bus)}
.ra-nums{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}
.ra-nums div{display:flex;flex-direction:column;gap:2px;min-width:0}
.ra-nums small{font-size:12px;color:var(--muted);font-weight:500}
.ra-nums b{font-size:18px;font-variant-numeric:tabular-nums;white-space:nowrap}
.ra-break{line-height:1.5}
.ra-notes{margin:0;padding-left:18px;font-size:13px;color:var(--muted);display:flex;flex-direction:column;gap:2px}
.ra-notes li.pro{color:var(--pine)}
.ra-src{margin:0;font-size:12px}
.ra-filter{display:flex;align-items:center;gap:10px;flex-wrap:wrap;background:var(--sunk);border-radius:10px;padding:8px 12px;font-size:14px}
.trow.ra-pick{background:var(--sunk);box-shadow:inset 3px 0 0 var(--pine);border-radius:8px}
.ra-pick-tag{font-size:11px;font-weight:700;color:var(--pine);white-space:nowrap}
@media (max-width:520px){.ra-hero-t{font-size:18px}.ra-nums b{font-size:16px}}
@media (prefers-reduced-motion:reduce){.ra-spin{animation:none}}
`;
  const st = document.createElement("style"); st.textContent = css; document.head.append(st);

  window.sgRideAI = {
    init(opts){ A = { ...A, ...opts }; },
    callAI, commuteCard, isPick, filterRides, filterBar, setRideFilter,
    _compute: () => { CM.result = compute(); return CM.result; }, _state: CM, _payload: () => CM.result && payloadOf(CM.result),
  };
})();
