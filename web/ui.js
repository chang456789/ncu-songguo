/* =====================================================================
   松果 UI 小工具：骨架屏、小動畫、手機下拉重新整理、鍵盤不遮輸入框
   樣式在 web/ui.css。所有動畫都遵守 prefers-reduced-motion。
   用法：
     UI.skeleton("post" | "event" | "ride" | "shop", 3)  // 資料還沒到之前的灰色卡片輪廓
     UI.pop(heartButton)                                  // 按讚愛心彈一下
     UI.sent(sendButton)                                  // 送出成功的回饋（打勾閃一下）
     UI.pullToRefresh(async () => { ...重新抓資料... })   // 手機下拉重新整理（只在觸控裝置、頁面頂端時作用）
   載入這個檔案後會自動處理：手機打字時隱藏底部選單，並把輸入框捲到鍵盤上方。
   ===================================================================== */
(() => {
  "use strict";
  const reduced = () => !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
  const touch = () => !!(window.matchMedia && matchMedia("(pointer: coarse)").matches);
  function el(tag, cls, ...kids){ const e = document.createElement(tag); if (cls) e.className = cls; e.append(...kids.filter(Boolean)); return e; }
  const bar = (w, cls = "") => { const b = el("span", "sk-bar " + cls); b.style.width = w; return b; };

  /* ---------- 骨架屏 ---------- */
  const SHAPES = {
    post:  () => el("div", "sk-card sk-post", el("div", "sk-row", el("span", "sk-dot"), el("div", "sk-col", bar("40%"), bar("25%", "thin"))), bar("70%", "thick"), bar("95%"), bar("85%")),
    event: () => el("div", "sk-card sk-event", el("span", "sk-box"), el("div", "sk-col", bar("75%", "thick"), bar("45%"), bar("35%"), el("div", "sk-row", bar("56px", "pill"), bar("72px", "pill")))),
    ride:  () => el("div", "sk-card sk-ride", el("span", "sk-box"), el("div", "sk-col", bar("65%", "thick"), bar("40%")), el("span", "sk-seats")),
    shop:  () => el("div", "sk-card sk-shop", el("span", "sk-thumb"), el("div", "sk-col", bar("55%", "thick"), bar("35%"), bar("80%"))),
  };
  function skeleton(kind, n = 3){
    const wrap = el("div", "sk-list");
    wrap.setAttribute("aria-busy", "true"); wrap.setAttribute("role", "status");
    const sr = el("span", "px-sr"); sr.textContent = "載入中…"; wrap.append(sr);
    for (let i = 0; i < n; i++){ const c = (SHAPES[kind] || SHAPES.post)(); c.setAttribute("aria-hidden", "true"); wrap.append(c); }
    return wrap;
  }

  /* ---------- 小動畫 ---------- */
  function replay(node, cls, ms){
    if (!node || reduced()) return;
    node.classList.remove(cls); void node.offsetWidth; node.classList.add(cls);
    setTimeout(() => node.classList.remove(cls), ms);
  }
  const pop = node => replay(node, "ui-pop", 450);
  const sent = node => replay(node, "ui-sent", 900);

  /* ---------- 手機下拉重新整理 ---------- */
  let ptr = null;
  function pullToRefresh(onRefresh, opts = {}){
    if (ptr) ptr.off();
    if (!touch()) return { off(){} };
    const MAX = 90, GO = 64;
    const ind = el("div", "ptr"); ind.setAttribute("aria-hidden", "true");
    const label = el("span", "ptr-label");
    if (window.sgPixel) ind.append(window.sgPixel.sprite("normal", { size: 32 }));
    ind.append(label); document.body.append(ind);
    let y0 = null, dy = 0, busy = false;
    const text = s => { label.textContent = opts.tr ? opts.tr(s) : s; };
    const set = d => { ind.style.transform = `translate(-50%, ${Math.min(d, MAX) - 56}px)`; ind.classList.toggle("ready", d >= GO); text(d >= GO ? "放開重新整理" : "下拉重新整理"); };
    const start = e => { if (busy || window.scrollY > 0 || e.touches.length !== 1 || document.querySelector(".scrim")) return; y0 = e.touches[0].clientY; dy = 0; };
    const move = e => { if (y0 == null) return; dy = (e.touches[0].clientY - y0) * 0.5; if (dy <= 0 || window.scrollY > 0){ y0 = null; set(0); return; } ind.classList.add("show"); set(dy); };
    const end = async () => {
      if (y0 == null) return; y0 = null;
      if (dy < GO){ ind.classList.remove("show"); set(0); return; }
      busy = true; ind.classList.add("busy"); text("重新整理中…"); set(GO);
      try { await onRefresh(); } catch {}
      busy = false; ind.classList.remove("busy", "show", "ready"); set(0);
    };
    addEventListener("touchstart", start, { passive: true }); addEventListener("touchmove", move, { passive: true });
    addEventListener("touchend", end); addEventListener("touchcancel", end);
    ptr = { off(){ removeEventListener("touchstart", start); removeEventListener("touchmove", move); removeEventListener("touchend", end); removeEventListener("touchcancel", end); ind.remove(); ptr = null; } };
    return ptr;
  }

  /* ---------- 手機鍵盤：打字時隱藏底部選單，輸入框捲到鍵盤上方 ---------- */
  const typing = t => t && (t.tagName === "TEXTAREA" || (t.tagName === "INPUT" && /^(text|search|url|email|tel|number|password)$/.test(t.type || "text")));
  document.addEventListener("focusin", e => { if (touch() && typing(e.target)) document.body.classList.add("kb-open"); });
  document.addEventListener("focusout", () => setTimeout(() => { if (!typing(document.activeElement)) document.body.classList.remove("kb-open"); }, 120));
  if (window.visualViewport) visualViewport.addEventListener("resize", () => {
    const a = document.activeElement; if (!touch() || !typing(a)) return;
    const r = a.getBoundingClientRect(), bottom = visualViewport.height + visualViewport.offsetTop;
    if (r.bottom > bottom - 8 || r.top < 0) a.scrollIntoView({ block: "center", behavior: reduced() ? "auto" : "smooth" });
  });

  window.sgUI = { skeleton, pop, sent, pullToRefresh, reduced };
})();
