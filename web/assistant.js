/* =====================================================================
   松果 AI 助理（前端）
   - 首頁有一張「問松果」卡片，右下角有一顆「問松果」浮動按鈕，點開是聊天視窗。
   - 每次發問時，向 index.html 要一份「網站目前的資料」（context：公車、活動、美食、下一堂課），
     裁到 6,000 字以內，連同問題送到 /api/ai-chat，AI 只根據這份資料回答。
   - 聊天視窗放在 <body> 底下、不在 #app 裡，所以 index.html 重繪畫面時不會把它清掉，
     也不會打斷使用者在視窗裡打字（注音輸入）。
   index.html 用法：
     AI.init({ context: async () => ({...}), lang: () => I18N.lang, tr: s => I18N.tr(s),
               translate: el => I18N.translate(el), visible: () => true/false, openRides: () => {...} })
     AI.homeCard()   // 首頁的「問松果」卡片
     AI.sync()       // 每次 render() 後呼叫，決定右下角按鈕要不要顯示
   ===================================================================== */
(() => {
  "use strict";
  const MAX_CONTEXT = 24000;   // 和 api/ai-chat.js 一致
  const MAX_INPUT = 500;
  // 建議問題：示範 AI 代理人會自己挑的工具（交通精算、找吃的、找拼車、下一堂課）
  const SUGGEST = [
    "我 5 點要到高鐵",
    "今晚有空想吃便宜的",
    "明早後門去中壢車站有人揪嗎",
    "下一堂課在哪",
  ];

  let app = { context: async () => ({}), lang: () => "zh", tr: s => s, translate: () => {}, visible: () => true, openRides: () => {} };
  const msgs = [];          // { role: "user" | "assistant", content, showRides?, kind? }  kind: "notice" = 系統提示（不送給 AI）
  let busy = false, panel = null, fab = null, listEl = null, inputEl = null, sendBtn = null;
  const t = s => app.tr(s);

  /* ---------- 小工具：產生 DOM ---------- */
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
  // 松果小圖示（對話泡泡＋星星），用 currentColor，淺色深色都能用
  function spark(){
    const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("aria-hidden", "true"); s.setAttribute("class", "ai-ico");
    s.innerHTML = '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.2 3.6c-.5.4-1.3.1-1.3-.6V16A2.5 2.5 0 0 1 4 13.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>'
      + '<path d="M12 6.2l.9 2.2 2.2.9-2.2.9-.9 2.2-.9-2.2-2.2-.9 2.2-.9z" fill="currentColor"/>';
    return s;
  }

  /* ---------- context：裁到 6,000 字以內 ---------- */
  // 先拿掉比較不重要的欄位，再逐步減少活動與店家的數量，直到放得下
  function fit(ctx){
    const c = JSON.parse(JSON.stringify(ctx || {}));
    const size = () => JSON.stringify(c).length;
    if (size() <= MAX_CONTEXT) return c;
    // 先縮減次要資料：大廳、校內地點、貼文
    for (const k of ["lobby", "campusPlaces", "posts"]) while (size() > MAX_CONTEXT && Array.isArray(c[k]) && c[k].length) c[k].pop();
    for (const f of c.food || []) delete f.note;
    for (const e of c.events || []) delete e.source;
    while (size() > MAX_CONTEXT && ((c.events && c.events.length > 3) || (c.food && c.food.length > 5))){
      if (c.events && c.events.length > 3 && (!c.food || c.events.length >= c.food.length)) c.events.pop(); else if (c.food) c.food.pop();
    }
    for (const e of c.events || []) if (e.title && e.title.length > 60) e.title = e.title.slice(0, 60) + "…";
    while (size() > MAX_CONTEXT && c.events && c.events.length) c.events.pop();
    while (size() > MAX_CONTEXT && c.food && c.food.length) c.food.pop();
    return c;
  }

  /* ---------- 發問 ---------- */
  async function ask(text){
    text = String(text || "").trim().slice(0, MAX_INPUT);
    if (!text || busy) return;
    const history = msgs.filter(m => m.kind !== "notice").slice(-6).map(m => ({ role: m.role, content: m.content }));
    msgs.push({ role: "user", content: text });
    busy = true; draw();
    let notice = null;
    // AI 代理人（web/agent.js）：先讓它判斷要用哪個工具；不需要工具的一般問題才走下面原本的 /api/ai-chat
    if (app.agent){
      let out = null;
      try { out = await app.agent(text, history); } catch (e) { console.error("agent failed", e); }
      if (out && !out.general){
        const AGENT_NOTE = { not_configured: "AI 尚未設定，以下是程式直接找到的結果。", rate_limited: "AI 使用太頻繁了，以下是程式直接找到的結果。",
          timeout: "AI 回應逾時，以下是程式直接找到的結果。", error: "AI 暫時無法使用，以下是程式直接找到的結果。" };
        msgs.push({ role: "assistant", content: out.reply, cards: out.cards, note: out.byAI ? null : AGENT_NOTE[out.status] || null });
        busy = false; draw();
        if (inputEl && panel && !panel.hidden) inputEl.focus({ preventScroll: true });
        return;
      }
    }
    try {
      let context = {};
      try { context = fit(await app.context()); } catch { context = {}; }
      const r = await fetch("/api/ai-chat", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: text, lang: app.lang() === "en" ? "en" : "zh", context, history }),
      });
      let j = null; try { j = await r.json(); } catch {}
      if (r.ok && j && j.reply) msgs.push({ role: "assistant", content: j.reply, showRides: !!j.showRides });
      else if (j && j.code === "ai_not_configured") notice = "松果 AI 助理還在準備中（尚未設定 AI 金鑰），先用網站上的各個頁面查詢吧。";
      else if (r.status === 429 || (j && j.code === "rate_limited")) notice = "問得太快了，請等一分鐘再試。";
      else notice = "AI 暫時無法回答，請稍後再試。";
    } catch {
      notice = "連不上松果，請檢查網路後再試。";
    }
    if (notice){
      msgs.push({ role: "assistant", kind: "notice", content: notice });
      // 失敗的問題不放進之後的對話紀錄，避免 AI 看到沒有回答的問題
      const i = msgs.length - 2; if (msgs[i] && msgs[i].role === "user") msgs[i].kind = "notice";
    }
    busy = false; draw();
    if (inputEl && panel && !panel.hidden) inputEl.focus({ preventScroll: true });
  }

  /* ---------- 畫面 ---------- */
  function bubble(m){
    const mine = m.role === "user";
    return el("div", { class: "ai-row" + (mine ? " me" : "") },
      el("div", { class: "ai-bubble" + (m.kind === "notice" && !mine ? " notice" : ""), translate: m.kind === "notice" ? null : "no" }, m.content,
        m.showRides ? el("div", {}, el("button", { type: "button", class: "ai-ride", onclick: () => { close(); app.openRides(); } }, t("看拼車"))) : null,
        m.note ? el("p", { class: "ai-note" }, t(m.note)) : null,
        // AI 代理人的結果卡片：點了就關掉視窗、跳到對應頁面並帶入條件
        m.cards && m.cards.length ? el("div", { class: "ai-cards" }, m.cards.map(c =>
          el("button", { type: "button", class: "ai-card-btn " + c.kind, onclick: () => { close(); c.action(); } },
            el("span", { class: "ai-card-ico", "aria-hidden": "true" }, c.icon || "›"),
            el("span", { class: "ai-card-txt" }, el("b", {}, c.title), c.sub ? el("small", {}, c.sub) : null),
            el("span", { class: "ai-card-go", "aria-hidden": "true" }, "›")))) : null));
  }
  function draw(){
    if (!panel) return;
    const kids = [];
    if (!msgs.length){
      kids.push(el("div", { class: "ai-hello" },
        el("b", {}, t("嗨，我是松果 AI 助理")),
        el("p", {}, t("可以問我公車、活動、美食和你的課表。我只會根據松果網站上的資料回答。")),
        el("div", { class: "ai-sugs" }, SUGGEST.map(q => el("button", { type: "button", class: "ai-sug", onclick: () => ask(t(q)) }, t(q))))));
    }
    for (const m of msgs) kids.push(bubble(m));
    if (busy) kids.push(el("div", { class: "ai-row" }, el("div", { class: "ai-bubble ai-typing", role: "status" }, el("i"), el("i"), el("i"), el("span", {}, t("松果正在想…")))));
    listEl.replaceChildren(...kids);
    listEl.scrollTop = listEl.scrollHeight;
    sendBtn.disabled = busy;
    panel.querySelector(".ai-clear").hidden = !msgs.length || busy;
  }
  function build(){
    inputEl = el("textarea", { class: "ai-input", rows: "1", maxlength: String(MAX_INPUT), placeholder: t("輸入問題…"), "aria-label": t("輸入問題…") });
    inputEl.addEventListener("keydown", e => {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing && e.keyCode !== 229){ e.preventDefault(); submit(); }
    });
    inputEl.addEventListener("input", () => { inputEl.style.height = "auto"; inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + "px"; });
    sendBtn = el("button", { type: "submit", class: "ai-send", "aria-label": t("送出") }, t("送出"));
    listEl = el("div", { class: "ai-list", "aria-live": "polite" });
    panel = el("div", { class: "ai-panel", role: "dialog", "aria-modal": "false", "aria-label": t("松果 AI 助理"), hidden: true },
      el("div", { class: "ai-head" }, spark(), el("b", {}, t("松果 AI 助理")),
        el("button", { type: "button", class: "ai-clear", onclick: () => { msgs.length = 0; draw(); } }, t("清除對話")),
        el("button", { type: "button", class: "ai-x", "aria-label": t("關閉"), onclick: close }, "×")),
      listEl,
      el("form", { class: "ai-form", onsubmit: e => { e.preventDefault(); submit(); } }, inputEl, sendBtn),
      el("p", { class: "ai-foot" }, t("AI 可能出錯，重要資訊請以網站頁面與學校公告為準。你的下一堂課會一起送出，但不會被保存。")));
    panel.addEventListener("keydown", e => { if (e.key === "Escape") close(); });
    fab = el("button", { type: "button", class: "ai-fab", onclick: () => open(), "aria-label": t("問松果") }, spark(), el("span", {}, t("問松果")));
    document.body.append(panel, fab);
  }
  function submit(){ const v = inputEl.value; if (!v.trim() || busy) return; inputEl.value = ""; inputEl.style.height = "auto"; ask(v); }
  function open(question){
    if (!panel) sync();
    panel.hidden = false; document.body.classList.add("ai-open");
    draw(); app.translate(panel); sync();
    if (question) ask(question); else inputEl.focus({ preventScroll: true });
  }
  function close(){ if (!panel) return; panel.hidden = true; document.body.classList.remove("ai-open"); sync(); if (fab && !fab.hidden) fab.focus({ preventScroll: true }); }

  // 語言切換或畫面重繪後：更新按鈕文字、決定要不要顯示浮動按鈕
  let lastLang = null;
  function sync(){
    if (!fab || lastLang !== app.lang()){
      lastLang = app.lang();
      // 第一次、或換語言時（重新）建立視窗，讓固定文字換成目前的語言（對話內容保留）
      const wasOpen = !!panel && !panel.hidden;
      if (panel){ panel.remove(); fab.remove(); }
      build(); app.translate(fab); app.translate(panel);
      if (wasOpen){ panel.hidden = false; draw(); }
    }
    const show = !!app.visible();
    fab.hidden = !show || !panel.hidden;
    if (!show && !panel.hidden) close();
  }

  function homeCard(){
    return el("section", { class: "card ai-card" },
      el("div", { class: "ai-card-top" }, spark(), el("div", {}, el("b", {}, t("問松果")), el("span", {}, t("AI 助理幫你查公車、活動、美食和課表")))),
      el("div", { class: "ai-sugs" }, SUGGEST.slice(0, 2).map(q => el("button", { type: "button", class: "ai-sug", onclick: () => open(t(q)) }, t(q))),
        el("button", { type: "button", class: "ai-sug ai-more", onclick: () => open() }, t("自己問…"))));
  }

  /* ---------- 樣式（只用網站的 CSS 變數，淺色深色都適用） ---------- */
  const css = `
.ai-ico{width:22px;height:22px;flex:none}
.ai-fab{position:fixed;right:20px;bottom:24px;z-index:25;display:flex;align-items:center;gap:6px;background:var(--pine);color:var(--bg);border:0;border-radius:999px;padding:12px 18px 12px 14px;font-weight:700;font-size:15px;box-shadow:0 6px 20px rgba(0,0,0,.25);cursor:pointer}
.ai-fab:hover{filter:brightness(1.08)}
.ai-panel{position:fixed;right:20px;bottom:24px;z-index:35;width:min(400px,calc(100vw - 32px));height:min(600px,calc(100dvh - 48px));background:var(--surface);color:var(--ink);border:1px solid var(--line);border-radius:18px;box-shadow:0 16px 48px rgba(0,0,0,.28);display:flex;flex-direction:column;overflow:hidden}
.ai-panel[hidden],.ai-fab[hidden]{display:none}
.ai-head{display:flex;align-items:center;gap:8px;padding:12px 12px 12px 16px;border-bottom:1px solid var(--line);color:var(--pine)}
.ai-head b{flex:1;color:var(--ink);font-size:16px}
.ai-clear{background:none;border:0;color:var(--muted);font-size:13px;cursor:pointer;padding:6px}
.ai-clear[hidden]{display:none}
.ai-x{background:none;border:0;color:var(--muted);font-size:24px;line-height:1;width:36px;height:36px;border-radius:999px;cursor:pointer}
.ai-x:hover{background:var(--sunk)}
.ai-list{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px;overscroll-behavior:contain}
.ai-hello{display:flex;flex-direction:column;gap:8px}
.ai-hello b{font-size:17px}
.ai-hello p{margin:0;color:var(--muted);font-size:14px;line-height:1.5}
.ai-sugs{display:flex;flex-wrap:wrap;gap:8px}
.ai-sug{background:var(--sunk);color:var(--ink);border:1px solid var(--line);border-radius:14px;padding:8px 12px;font-size:14px;text-align:left;cursor:pointer;line-height:1.35}
.ai-sug:hover{border-color:var(--pine)}
.ai-more{color:var(--pine);font-weight:600}
.ai-row{display:flex}
.ai-row.me{justify-content:flex-end}
.ai-bubble{max-width:86%;background:var(--sunk);border-radius:16px 16px 16px 4px;padding:9px 13px;font-size:15px;line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere}
.ai-row.me .ai-bubble{background:var(--pine);color:var(--bg);border-radius:16px 16px 4px 16px}
.ai-bubble.notice{background:var(--bus-soft);color:var(--ink);border:1px solid var(--line)}
.card.ev.ag-flash{box-shadow:0 0 0 2px var(--pine)}
.ai-note{margin:6px 0 0;font-size:12.5px;color:var(--muted);white-space:normal}
.ai-cards{display:flex;flex-direction:column;gap:6px;margin-top:10px;white-space:normal}
.ai-card-btn{display:flex;align-items:center;gap:10px;width:100%;text-align:left;background:var(--surface);color:var(--ink);border:1px solid var(--line);border-radius:12px;padding:8px 10px;cursor:pointer;font:inherit}
.ai-card-btn:hover{border-color:var(--pine)}
.ai-card-ico{flex:none;width:28px;height:28px;border-radius:8px;background:var(--sunk);display:grid;place-items:center;font-size:15px}
.ai-card-txt{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}
.ai-card-txt b{font-size:14px;line-height:1.35;overflow-wrap:anywhere}
.ai-card-txt small{font-size:12.5px;color:var(--muted);line-height:1.35;overflow-wrap:anywhere}
.ai-card-go{flex:none;color:var(--pine);font-size:20px;font-weight:700}
.ai-ride{margin-top:8px;background:var(--surface);color:var(--pine);border:1px solid var(--pine);border-radius:999px;padding:5px 14px;font-weight:700;font-size:14px;cursor:pointer}
.ai-typing{display:flex;align-items:center;gap:4px;color:var(--muted);font-size:14px}
.ai-typing i{width:7px;height:7px;border-radius:50%;background:var(--muted);animation:ai-dot 1.2s infinite ease-in-out}
.ai-typing i:nth-child(2){animation-delay:.15s}.ai-typing i:nth-child(3){animation-delay:.3s}
.ai-typing span{margin-left:6px}
@keyframes ai-dot{0%,80%,100%{opacity:.25;transform:translateY(0)}40%{opacity:1;transform:translateY(-3px)}}
.ai-form{display:flex;gap:8px;align-items:flex-end;padding:10px 12px 4px;border-top:1px solid var(--line)}
.ai-panel textarea.ai-input{flex:1;width:auto;min-width:0;min-height:42px;height:42px;resize:none;background:var(--sunk);color:var(--ink);border:1px solid var(--line);border-radius:18px;padding:9px 14px;font:inherit;font-size:16px;line-height:1.4;max-height:120px}
.ai-panel textarea.ai-input:focus{outline:none;border-color:var(--pine);background:var(--surface)}
.ai-send{background:var(--pine);color:var(--bg);border:0;border-radius:999px;padding:10px 16px;font-weight:700;cursor:pointer;flex:none}
.ai-send:disabled{opacity:.5;cursor:default}
.ai-foot{margin:0;padding:2px 14px 10px;font-size:11.5px;color:var(--muted);line-height:1.4}
.ai-card{display:flex;flex-direction:column;gap:10px}
.ai-card-top{display:flex;gap:10px;align-items:center;color:var(--pine)}
.ai-card-top .ai-ico{width:28px;height:28px}
.ai-card-top div{display:flex;flex-direction:column;gap:2px}
.ai-card-top b{color:var(--ink);font-size:16px}
.ai-card-top span{color:var(--muted);font-size:13px}
@media (max-width:720px){
  .ai-fab{right:14px;bottom:calc(76px + env(safe-area-inset-bottom,0px));padding:11px 16px 11px 12px}
  .ai-panel{left:0;right:0;bottom:0;width:auto;height:min(88dvh,680px);border-radius:18px 18px 0 0;border-bottom:0;padding-bottom:env(safe-area-inset-bottom,0px)}
  body.ai-open{overflow:hidden}
}
@media (prefers-reduced-motion:reduce){.ai-typing i{animation:none;opacity:.6}}
`;
  document.head.append(el("style", {}, css));

  window.sgAssistant = {
    init(opts){ app = { ...app, ...opts }; },
    open, close, sync, homeCard, fit,
  };
})();
