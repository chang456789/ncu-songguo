/* =====================================================================
   松果「今日松果」個人化早安卡（首頁最上方）
   - 整合天氣、下一堂課、下一班公車、空檔時間能去的活動，由 AI 寫成 2–3 句話。
   - 先用程式整理出「今天的重點」（facts），AI 只負責寫成好讀的句子（api/ai-today.js）。
   - 每人每天只呼叫一次 AI：結果存在 LocalStorage，隔天或今天的課表改了才重新產生。
   - 沒有課表的人也能用（只講天氣、公車和活動）。AI 失敗時改用程式寫的句子，卡片照常顯示。
   index.html 用法（改版合併後再接上）：
     TODAY.init({ context: async () => ({ weather, courses, bus, events }), lang:()=>I18N.lang, onChange:()=>renderKeep(), translate:el=>I18N.translate(el) })
     TODAY.card()
   context 的格式：
     weather: { hours: [{ t, temp, pop, wx }] }（/api/weather 或 Open-Meteo 的資料）
     courses: [{ name, day: 1–7（週一～週日）, start: "10:00", end: "11:50", room }]（整份課表）
     bus:     [{ to: "中壢火車站", route: "132", time: "08:20" }]（各方向下一班）
     events:  [{ title, date: "2026-11-23", time: "12:10–13:00", place, tags, highlight }]
   ===================================================================== */
(() => {
  "use strict";
  const KEY = "pc.today", LEAVE_BEFORE = 20, MIN_GAP = 60;
  let app = { context: async () => ({}), lang: () => "zh", onChange: () => {}, translate: () => {} };
  let st = { key: "", loading: false, text: "", ai: false, note: "", at: 0, chips: null, rain: false };

  const pad = n => String(n).padStart(2, "0");
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const toMin = s => { const m = /^(\d{1,2}):(\d{2})/.exec(s || ""); return m ? +m[1] * 60 + +m[2] : null; };
  const hm = m => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;
  const WK = ["日", "一", "二", "三", "四", "五", "六"], WK_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const ls = { get(){ try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } }, set(v){ try { localStorage.setItem(KEY, JSON.stringify(v)); } catch {} } };
  function hash(s){ let h = 2166136261; for (let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }

  /* ---------- 用程式整理今天的重點（不呼叫 AI） ---------- */
  function todaysCourses(courses, now){
    const dow = now.getDay() === 0 ? 7 : now.getDay();
    return (courses || []).filter(c => c && +c.day === dow && toMin(c.start) != null).sort((a, b) => toMin(a.start) - toMin(b.start));
  }
  function buildFacts(ctx = {}, now = new Date()){
    const today = iso(now), nowM = now.getHours() * 60 + now.getMinutes();
    const f = { now: `${hm(nowM)}（週${WK[now.getDay()]}）` };
    // 天氣：今天還沒過的時段
    const hrs = ((ctx.weather && ctx.weather.hours) || []).filter(x => x && x.t && String(x.t).slice(0, 10) === today && new Date(x.t).getTime() >= now.getTime() - 90 * 60e3);
    if (hrs.length){
      const temps = hrs.map(x => x.temp).filter(Number.isFinite), pops = hrs.map(x => +x.pop || 0);
      const wet = hrs.find(x => (+x.pop || 0) >= 50);
      f.weather = { now: hrs[0].wx || "", tempMin: Math.round(Math.min(...temps)), tempMax: Math.round(Math.max(...temps)), maxRainChance: Math.max(...pops) };
      if (wet){ const d = new Date(wet.t); f.weather.rainFrom = hm(d.getHours() * 60 + d.getMinutes()); }
    }
    // 課：今天還沒結束的課
    const list = todaysCourses(ctx.courses, now).filter(c => (toMin(c.end) ?? toMin(c.start) + 50) > nowM);
    if (list.length){
      f.classes = list.slice(0, 6).map(c => ({ name: String(c.name || "").slice(0, 30), start: c.start, end: c.end || "", room: String(c.room || "").slice(0, 20) }));
      const next = list.find(c => toMin(c.start) > nowM);
      if (next){ f.leaveBy = hm(Math.max(nowM, toMin(next.start) - LEAVE_BEFORE)); f.nextClass = next.name; }
      else f.inClassNow = list[0].name;
      // 空檔：課與課之間 ≥ 60 分鐘，以及最後一堂課之後
      const gaps = [];
      for (let i = 0; i < list.length - 1; i++){
        const a = Math.max(nowM, toMin(list[i].end) ?? toMin(list[i].start) + 50), b = toMin(list[i + 1].start);
        if (b - a >= MIN_GAP) gaps.push({ from: hm(a), to: hm(b), minutes: b - a });
      }
      const lastEnd = Math.max(nowM, toMin(list[list.length - 1].end) ?? toMin(list[list.length - 1].start) + 50);
      if (lastEnd < 21 * 60) gaps.push({ from: hm(lastEnd), to: "21:00", minutes: 21 * 60 - lastEnd, afterClass: true });
      f.gaps = gaps.slice(0, 3);
    } else f.noClassToday = true;
    // 空檔能去的活動（沒課的人：今天還沒開始的活動都算）
    const windows = f.gaps ? f.gaps.map(g => [toMin(g.from), toMin(g.to)]) : [[nowM, 23 * 60]];
    const evs = (ctx.events || []).filter(e => e && e.title && e.date === today).map(e => {
      const p = String(e.time || "").split(/[–~-]/); const s = toMin(p[0]), en = toMin(p[1]);
      return { e, s, en: en != null && s != null && en > s ? en : (s != null ? s + 60 : null) };
    }).filter(x => x.s != null && x.s >= nowM && windows.some(([a, b]) => x.s >= a && x.en <= b + 15)).sort((a, b) => a.s - b.s).slice(0, 2);
    if (evs.length) f.events = evs.map(({ e }) => ({ title: String(e.title).slice(0, 50), time: e.time, place: String(e.place || "").slice(0, 20),
      ...(e.tags && e.tags.length ? { tags: e.tags.slice(0, 4) } : {}), ...(e.highlight ? { highlight: String(e.highlight).slice(0, 40) } : {}) }));
    // 公車
    const bus = (ctx.bus || []).filter(x => x && x.time).slice(0, 3);
    if (bus.length) f.bus = bus.map(x => ({ to: x.to, route: String(x.route || ""), time: x.time }));
    return f;
  }

  /* ---------- AI 失敗時：用程式寫的句子 ---------- */
  function fallback(f, lang){
    const out = [], en = lang === "en", w = f.weather;
    const temp = w ? (w.tempMin === w.tempMax ? `${w.tempMax}°` : `${w.tempMin}–${w.tempMax}°`) : "";
    if (w){
      if (w.rainFrom) out.push(en ? `Rain is likely from ${w.rainFrom} (${w.maxRainChance}%) — bring an umbrella.` : `${w.rainFrom} 後可能下雨（降雨機率 ${w.maxRainChance}%），記得帶傘。`);
      else out.push(en ? `${temp} today${w.maxRainChance != null ? `, ${w.maxRainChance}% chance of rain` : ""}.` : `今天 ${temp}${w.now ? "，" + w.now : ""}。`);
    }
    const next = f.classes && f.classes.find(c => c.name === f.nextClass);
    if (next) out.push(en ? `${next.name} at ${next.start}${next.room ? " in " + next.room : ""} — leave by ${f.leaveBy}.` : `${next.start}${next.room ? " 在" + next.room : ""}上「${next.name}」，${f.leaveBy} 出門剛好。`);
    else if (f.noClassToday && f.bus && f.bus[0]) out.push(en ? `No classes today. Next bus ${f.bus[0].route} to ${f.bus[0].to} at ${f.bus[0].time}.` : `今天沒有課，下一班往${f.bus[0].to}的 ${f.bus[0].route} 是 ${f.bus[0].time}。`);
    if (f.events && f.events[0]){ const e = f.events[0]; out.push(en ? `Free time? Try “${e.title}” at ${e.time}${e.place ? ", " + e.place : ""}.` : `有空可以去${e.place ? e.place + "的" : ""}「${e.title}」（${e.time}）。`); }
    if (!out.length) out.push(en ? "Have a great day at NCU!" : "祝你在中大有美好的一天！");
    return out.slice(0, 3).join(en ? " " : "");
  }

  /* ---------- 小標籤：即時計算（不靠 AI，所以不會過時） ---------- */
  function chipsOf(f){
    const c = [];
    if (f.weather) c.push(f.weather.rainFrom ? ["☂", `${f.weather.maxRainChance}%`] : ["🌡", f.weather.tempMin === f.weather.tempMax ? `${f.weather.tempMax}°` : `${f.weather.tempMin}–${f.weather.tempMax}°`]);
    const next = f.classes && f.classes.find(x => x.name === f.nextClass);
    if (next) c.push(["下一堂", `${next.start}${next.room ? " " + next.room : ""}`]);
    if (f.bus && f.bus[0]) c.push([f.bus[0].route, f.bus[0].time]);
    return c;
  }

  /* ---------- 產生（每天一次） ---------- */
  async function refresh(force){
    if (st.loading) return;
    const now = new Date(), lang = app.lang() === "en" ? "en" : "zh";
    let ctx = {}; try { ctx = (await app.context()) || {}; } catch {}
    const facts = buildFacts(ctx, now);
    st.chips = chipsOf(facts); st.rain = !!(facts.weather && facts.weather.rainFrom);
    const key = `${iso(now)}:${lang}:${hash(JSON.stringify(todaysCourses(ctx.courses, now).map(c => [c.name, c.start, c.end, c.room])))}`;
    const saved = ls.get();
    if (!force && saved && saved.key === key && saved.text){ Object.assign(st, { key, text: saved.text, ai: saved.ai, at: saved.at, note: "" }); app.onChange(); return; }
    if (!force && saved && saved.key === key && saved.retryAfter > Date.now()){ Object.assign(st, { key, text: fallback(facts, lang), ai: false, note: saved.note || "", at: Date.now() }); app.onChange(); return; }
    st.key = key; st.loading = true; app.onChange();
    let code = "";
    try {
      const r = await fetch("/api/ai-today", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ lang, facts }), signal: AbortSignal.timeout(20000) });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.text){ Object.assign(st, { text: j.text, ai: true, at: Date.now(), note: "" }); ls.set({ key, text: j.text, ai: true, at: st.at }); }
      else code = j.code || (r.status === 429 ? "rate_limited" : r.status === 504 ? "ai_timeout" : "ai_error");
    } catch (e){ code = e && (e.name === "TimeoutError" || e.name === "AbortError") ? "ai_timeout" : "network"; }
    if (code){
      const note = code === "ai_not_configured" ? "AI 還沒啟用，先用簡單版整理。" : code === "rate_limited" || code === "ai_rate_limited" ? "AI 使用量太多了，先用簡單版整理。"
        : code === "ai_timeout" ? "AI 回應逾時，先用簡單版整理。" : "AI 暫時無法使用，先用簡單版整理。";
      Object.assign(st, { text: fallback(facts, lang), ai: false, at: Date.now(), note });
      ls.set({ key, retryAfter: Date.now() + 60 * 60e3, note });   // 失敗時一小時內不再重試，避免浪費額度
    }
    st.loading = false; app.onChange();
  }

  /* ---------- 卡片 ---------- */
  function el(tag, attrs, ...kids){
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})){
      if (v == null || v === false) continue;
      if (k.startsWith("on")) e.addEventListener(k.slice(2), v); else if (k === "class") e.className = v; else e.setAttribute(k, v === true ? "" : v);
    }
    for (const c of kids.flat(Infinity)){ if (c == null || c === false) continue; e.append(c.nodeType ? c : document.createTextNode(String(c))); }
    return e;
  }
  let started = 0;
  function card(){
    const now = new Date(), lang = app.lang() === "en" ? "en" : "zh";
    // 第一次顯示、跨日、或切換語言時才重新整理（課表有沒有改，refresh 裡會比對）
    if (!st.loading && (!started || !st.key.startsWith(`${iso(now)}:${lang}:`) || Date.now() - started > 10 * 60e3)){ started = Date.now(); setTimeout(() => refresh(false)); }
    const PX = window.sgPixel;
    const date = lang === "en" ? `${WK_EN[now.getDay()]} ${now.getMonth() + 1}/${now.getDate()}` : `${now.getMonth() + 1}/${now.getDate()}（${WK[now.getDay()]}）`;
    const body = st.loading || !st.text
      ? el("div", { class: "today-loading", role: "status" }, PX ? PX.thinking({ size: 36 }) : null, el("span", {}, "松果正在整理今天…"))
      : el("p", { class: "today-text", translate: "no" }, st.text);
    const chips = (st.chips || []).length ? el("div", { class: "today-chips" }, st.chips.map(([a, b]) => el("span", { class: "today-chip" }, el("b", {}, a), " ", el("span", { translate: "no" }, b)))) : null;
    const foot = st.text && !st.loading ? el("p", { class: "today-foot" }, st.ai ? ["AI 整理・", el("span", { translate: "no" }, hm(new Date(st.at).getHours() * 60 + new Date(st.at).getMinutes()))] : st.note) : null;
    return el("section", { class: "card today-card", "aria-label": "今日松果" },
      el("div", { class: "today-head" }, PX ? PX.sprite(st.rain ? "umbrella" : "normal", { size: 44 }) : null,
        el("div", {}, el("b", {}, "今日松果"), el("small", { translate: "no" }, date))),
      body, chips, foot);
  }

  window.sgToday = { init(o){ app = { ...app, ...o }; }, card, refresh: () => refresh(true), buildFacts, fallback, chipsOf };
})();
