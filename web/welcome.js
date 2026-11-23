/* =====================================================================
   松果 2.0 首次進站頁（取暱稱的畫面）上方：放大的松鼠＋一句自我介紹＋3 個可以點的示範問題
   點示範問題：用輸入框裡的暱稱直接進站，並打開問松果問這一題。
   index.html 用法（gate() 裡）：WELCOME.block({ onAsk: q => {...} })
   需要 web/pixel.js；沒有的話回傳 null，畫面維持原樣。
   ===================================================================== */
(() => {
  "use strict";
  const DEMOS = ["下一班 132 公車幾點？", "今天有什麼免費活動？", "後門宵夜吃什麼好？"];
  function el(tag, attrs, ...kids){
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})){
      if (v == null || v === false) continue;
      if (k.startsWith("on")) e.addEventListener(k.slice(2), v); else if (k === "class") e.className = v; else e.setAttribute(k, v === true ? "" : v);
    }
    for (const c of kids.flat(Infinity)){ if (c == null || c === false) continue; e.append(c.nodeType ? c : document.createTextNode(String(c))); }
    return e;
  }
  function block(opts = {}){
    const PX = window.sgPixel; if (!PX) return null;
    const hero = el("div", { class: "wl-hero" });
    PX.mount(hero, { size: 128, say: () => "我是松果，中大的 AI 生活助理", translate: opts.translate });
    return el("div", { class: "wl" }, hero,
      el("p", { class: "wl-try" }, "試著問我："),
      el("div", { class: "wl-demos" }, DEMOS.map(q => el("button", { type: "button", class: "chip wl-demo", onclick: () => opts.onAsk && opts.onAsk(opts.tr ? opts.tr(q) : q) }, "✦ ", q))));
  }
  window.sgWelcome = { block, DEMOS };
})();
