/* =====================================================================
   松果 2.0 問松果面板的外觀（不修改 web/assistant.js、web/agent.js，等畫面出現後再加上效果）
   1. AI 回答一字一字打出來；打完才顯示結果卡片。開了「減少動態效果」就直接顯示全文。
   2. 結果卡片依類型加顏色和像素小圖示：公車＝黃、活動／課表＝紫、美食＝橘、拼車＝綠。
   3. 視窗上方的松鼠頭像依回答類型換表情：公車＝拿公車牌、美食＝拿便當、活動／課表＝拿行事曆、上網搜尋＝拿放大鏡。
   4. 上網搜尋的來源卡片：藍色＋地球像素圖示。
   需要 web/pixel.js。
   ===================================================================== */
(() => {
  "use strict";
  const PX = () => window.sgPixel;
  const reduced = () => !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);

  /* ---------- 卡片類型 → 顏色與小圖示 ---------- */
  const GROUP = { bus: "bus", commute: "bus", event: "event", calendar: "event", class: "event", food: "food", ride: "ride", web: "web" };
  const ICON = { bus: "ci_bus", event: "ci_cal", food: "ci_food", ride: "ci_car", web: "ci_globe" };
  const AVATAR = { bus: "avatar_bus", event: "avatar_cal", food: "avatar_food", ride: "avatar_bus", web: "avatar_search" };
  function groupOf(card){
    const kind = [...card.classList].find(c => c !== "ai-card-btn") || "";
    if (GROUP[kind]) return GROUP[kind];
    if (kind === "draft") return /拼車|開一團|ride/i.test(card.textContent) ? "ride" : "";
    return "";
  }
  function decorateCards(root){
    for (const card of root.querySelectorAll(".ai-card-btn:not([data-px])")){
      card.dataset.px = "1";
      const g = groupOf(card); if (!g) continue;
      card.classList.add("cc-" + g);
      const ico = card.querySelector(".ai-card-ico");
      if (ico && PX() && ICON[g]){ ico.replaceChildren(PX().sprite(ICON[g], { size: 64, cls: "cc-ico" })); }   // 12×12 的圖放大 2 倍
    }
  }
  // 依回答判斷類型：先看卡片，沒有卡片就看文字
  function answerType(bubble){
    const cards = [...bubble.querySelectorAll(".ai-card-btn")].map(groupOf).filter(Boolean);
    if (cards.length) return cards[0];
    const t = bubble.textContent || "";
    if (/公車|客運|\b13[23]\b|高鐵|bus|THSR/i.test(t)) return "bus";
    if (/吃|餐|美食|宵夜|便當|food|eat|lunch|dinner/i.test(t)) return "food";
    if (/活動|講座|課|行事曆|event|class|lecture/i.test(t)) return "event";
    return "";
  }
  let face = "";
  function setFace(type){
    const want = AVATAR[type] || "avatar";
    if (want === face || !PX()) return;
    const head = document.querySelector(".ai-panel .ai-head .px-avatar, .ai-panel .ai-head .ai-ico");
    if (!head) return;
    const s = PX().sprite(want, { size: 28, cls: "ai-ico px-avatar" }); s.dataset.px = "1";
    head.replaceWith(s); face = want;
  }

  /* ---------- 一字一字打出來 ---------- */
  const typed = new Set();      // 已經打完（或不需要打）的回答，重繪時不再重打
  let job = null;               // { full, n, bubble, node, timer }
  const textNodeOf = b => [...b.childNodes].find(n => n.nodeType === 3 && n.nodeValue.trim());
  function finish(){
    if (!job) return;
    clearInterval(job.timer);
    if (job.node && job.node.isConnected) job.node.nodeValue = job.full;
    if (job.bubble && job.bubble.isConnected){ job.bubble.classList.remove("tw-typing"); setFace(answerType(job.bubble)); }
    job = null;
  }
  function scan(){
    const panel = document.querySelector(".ai-panel");
    if (!panel || panel.hidden) return;
    decorateCards(panel);
    const bubbles = panel.querySelectorAll(".ai-row:not(.me) .ai-bubble:not(.notice):not(.ai-typing)");
    const last = bubbles[bubbles.length - 1];
    if (!last) return;
    const node = textNodeOf(last); if (!node) return;
    // 打字到一半畫面重繪了：接著在新的元素上繼續打
    if (job && job.bubble !== last && node.nodeValue === job.full){ job.bubble = last; job.node = node; node.nodeValue = job.full.slice(0, job.n); last.classList.add("tw-typing"); return; }
    if (job && job.bubble === last) return;
    const full = node.nodeValue;
    if (typed.has(full)) return;
    typed.add(full); if (typed.size > 200) typed.clear();
    if (job) finish();
    if (reduced() || full.length < 2){ setFace(answerType(last)); return; }
    job = { full, n: 0, bubble: last, node };
    node.nodeValue = ""; last.classList.add("tw-typing");
    // 長回答打快一點：整段最多約 1.8 秒
    const step = Math.max(1, Math.ceil(full.length / 90)), list = panel.querySelector(".ai-list");
    job.timer = setInterval(() => {
      if (!job) return;
      job.n = Math.min(job.full.length, job.n + step);
      if (job.node.isConnected) job.node.nodeValue = job.full.slice(0, job.n);
      if (list) list.scrollTop = list.scrollHeight;
      if (job.n >= job.full.length) finish();
    }, 20);
  }
  // 點一下正在打字的回答：直接顯示全文
  document.addEventListener("click", e => { if (job && e.target.closest && e.target.closest(".tw-typing")) finish(); }, true);

  function start(){
    if (!document.body) return;
    new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });   // 同步處理，畫面不會先閃出全文
    scan();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
  window.sgAILook = { finish, answerType };
})();
