/* =====================================================================
   松果 即時大廳 AI（前端）：AI 懶人包、AI 破冰話題
   - 「AI 懶人包」：把最近 50 則訊息送到 /api/ai-chatroom（task:"summary"），顯示 3 點重點、熱門關鍵字、切入建議。
     訊息少於 10 則時按鈕不能按，並提示「訊息還不夠多」。同樣的訊息範圍 5 分鐘內不重複呼叫。
   - 「AI 破冰話題」：顯示 2 個話題，點一下填進輸入框，由使用者自己按送出（絕不自動發送）。
     伺服器一次產生 6 個，這裡每次隨機挑 2 個，同一組 30 分鐘內不重複呼叫。AI 失敗時用內建話題。
   - 大廳超過 10 分鐘沒有新訊息時，顯示一個小提示。
   index.html 用法：
     CHAI.init({ lobby:()=>S.lobby, lang:()=>I18N.lang, onChange:()=>renderKeep(), fill:text=>{...} })
     live("lobbyai", () => CHAI.panel())
   ===================================================================== */
(() => {
  "use strict";
  const MIN = 10, MAX = 50, SUMMARY_TTL = 5 * 60e3, TOPICS_TTL = 30 * 60e3, IDLE_MS = 10 * 60e3, TIMEOUT_MS = 25000;
  // AI 無法使用時的內建破冰話題（規則式備援，不花額度）
  const BUILTIN = {
    zh: ["後門宵夜街你的必點是哪一家？🍜", "下雨天趕課，大家都怎麼過去？☔", "132 公車擠不上去的時候你都怎麼辦？", "這個週末有人要去哪裡玩嗎？",
         "中大湖邊最適合發呆的位置在哪？", "期中考週大家都在哪裡讀書？📚", "推薦一門你覺得超值得修的通識？", "松苑哪一攤最常吃？"],
    en: ["What's your must-order at the Houmen night market? 🍜", "How do you get to class on rainy days? ☔", "What do you do when bus 132 is too full?",
         "Any plans for this weekend?", "Best spot by NCU Lake to chill?", "Where do you study during midterms? 📚", "Which gen-ed course would you recommend?", "Favorite stall at Songyuan?"],
  };
  let app = { lobby: () => [], lang: () => "zh", onChange: () => {}, fill: () => {} };
  const sum = { open: false, loading: false, data: null, note: "", key: "", at: 0 };
  const ice = { open: false, loading: false, pool: null, shown: [], note: null, key: "", at: 0 };

  function el(tag, attrs, ...kids){
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})){
      if (v == null || v === false) continue;
      if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else if (k === "class") e.className = v;
      else e.setAttribute(k, v === true ? "" : v);
    }
    for (const c of kids.flat(Infinity)){ if (c == null || c === false) continue; e.append(c.nodeType ? c : document.createTextNode(String(c))); }
    return e;
  }
  const lang = () => app.lang() === "en" ? "en" : "zh";
  const recent = () => (app.lobby() || []).filter(m => m && typeof m.body === "string" && m.body.trim()).slice(-MAX);

  async function call(body){
    try {
      const r = await fetch("/api/ai-chatroom", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT_MS) });
      const j = await r.json().catch(() => ({}));
      if (r.ok) return { ok: true, j };
      return { code: j.code || (r.status === 429 ? "rate_limited" : r.status === 504 ? "ai_timeout" : "ai_error") };
    } catch (e){
      return { code: e && (e.name === "TimeoutError" || e.name === "AbortError") ? "ai_timeout" : "network" };
    }
  }
  const noteOf = code => code === "ai_not_configured" ? "AI 功能還沒啟用，聊天照常可以使用。"
    : code === "rate_limited" || code === "ai_rate_limited" ? "AI 使用量太多了，請稍後再試。"
    : code === "ai_timeout" ? "AI 回應逾時，請稍後再試。"
    : code === "network" ? "連不上松果，請檢查網路後再試。" : "AI 暫時無法使用，請稍後再試。";

  /* ---------- AI 懶人包 ---------- */
  async function summarize(){
    const msgs = recent(); if (msgs.length < MIN || sum.loading) return;
    const l = lang();
    const key = l + ":" + msgs.length + ":" + (msgs[msgs.length - 1].id || msgs[msgs.length - 1].ts);
    sum.open = true; ice.open = false;
    if (sum.key === key && sum.data && Date.now() - sum.at < SUMMARY_TTL){ app.onChange(); return; }   // 5 分鐘內同樣範圍：不重複呼叫
    sum.loading = true; sum.note = ""; app.onChange();
    const r = await call({ task: "summary", lang: l, messages: msgs.map(m => m.body) });
    sum.loading = false;
    if (r.ok){ sum.data = r.j; sum.key = key; sum.at = Date.now(); }
    else { sum.data = null; sum.note = r.code === "too_few" ? "訊息還不夠多" : noteOf(r.code); }
    app.onChange();
  }

  /* ---------- AI 破冰話題 ---------- */
  const pick2 = (pool, avoid) => {
    const rest = pool.filter(t => !avoid.includes(t)); const src = rest.length >= 2 ? rest : pool;
    return [...src].sort(() => Math.random() - 0.5).slice(0, 2);
  };
  async function icebreak(){
    if (ice.loading) return;
    const l = lang();
    ice.open = true; sum.open = false;
    if (ice.pool && ice.key === l && Date.now() - ice.at < TOPICS_TTL){ ice.shown = pick2(ice.pool, ice.shown); app.onChange(); return; }
    ice.loading = true; ice.note = null; app.onChange();
    const r = await call({ task: "icebreaker", lang: l });
    ice.loading = false;
    if (r.ok && Array.isArray(r.j.topics) && r.j.topics.length >= 2){ ice.pool = r.j.topics; ice.key = l; ice.at = Date.now(); ice.note = null; }
    else { ice.pool = null; ice.note = [noteOf(r.code), " ", "先給你幾個常見話題。"]; }
    ice.shown = pick2(ice.pool || BUILTIN[l], ice.shown);
    app.onChange();
  }

  /* ---------- 畫面 ---------- */
  function panel(){
    const msgs = recent(); const enough = msgs.length >= MIN;
    const last = (app.lobby() || []).reduce((t, m) => Math.max(t, (m && +m.ts) || 0), 0);
    const idle = !last || Date.now() - last > IDLE_MS;
    const box = el("div", { class: "lobby-ai" });
    box.append(el("div", { class: "lobby-ai-bar" },
      el("button", { type: "button", class: "chip ai-chip", disabled: !enough || sum.loading, "aria-pressed": sum.open ? "true" : "false",
        title: enough ? null : "訊息還不夠多", onclick: summarize }, "✦ ", "AI 懶人包"),
      el("button", { type: "button", class: "chip ai-chip", disabled: ice.loading, "aria-pressed": ice.open ? "true" : "false", onclick: icebreak }, "✦ ", "AI 破冰話題"),
      !enough ? el("span", { class: "muted small" }, "訊息還不夠多") : null));
    if (idle && !ice.open) box.append(el("p", { class: "lobby-ai-idle small" }, "大廳有點安靜，要不要用「AI 破冰話題」開個頭？"));
    if (sum.open){
      const card = el("div", { class: "lobby-ai-card", role: "status" },
        el("div", { class: "lobby-ai-head" }, el("b", {}, "AI 懶人包"), el("button", { type: "button", class: "linkbtn", onclick: () => { sum.open = false; app.onChange(); } }, "收起")));
      if (sum.loading) card.append(el("p", { class: "muted small" }, "AI 正在整理最近的訊息…"));
      else if (sum.note) card.append(el("p", { class: "muted small" }, sum.note));
      else if (sum.data){
        card.append(el("ol", { class: "lobby-ai-points", translate: "no" }, sum.data.points.map(p => el("li", {}, p))));
        if (sum.data.keywords && sum.data.keywords.length) card.append(el("div", { class: "tags", translate: "no" }, sum.data.keywords.map(k => el("span", { class: "tag" }, "#" + k))));
        if (sum.data.tip) card.append(el("p", { class: "lobby-ai-tip", translate: "no" }, "💡 ", sum.data.tip));
        card.append(el("p", { class: "muted small", style: "margin:0" }, "AI 整理，可能有誤。"));
      }
      box.append(card);
    }
    if (ice.open){
      const card = el("div", { class: "lobby-ai-card" },
        el("div", { class: "lobby-ai-head" }, el("b", {}, "AI 破冰話題"), el("button", { type: "button", class: "linkbtn", onclick: () => { ice.open = false; app.onChange(); } }, "收起")));
      if (ice.loading) card.append(el("p", { class: "muted small" }, "AI 正在想話題…"));
      else {
        if (ice.note) card.append(el("p", { class: "muted small" }, ice.note));
        card.append(el("p", { class: "muted small", style: "margin:0" }, "點一下會填進輸入框，確認後再自己按送出。"));
        card.append(el("div", { class: "lobby-ai-topics" }, ice.shown.map(t => el("button", { type: "button", class: "topic", translate: "no", onclick: () => app.fill(t) }, t)),
          el("button", { type: "button", class: "linkbtn", onclick: icebreak }, "換一組")));
      }
      box.append(card);
    }
    return box;
  }

  window.sgChatroomAI = { init(o){ app = { ...app, ...o }; }, panel, BUILTIN };
})();
