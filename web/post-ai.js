/* =====================================================================
   松果 AI 發文助手（市集、租屋招租）
   - 使用者在「內容」寫一句話（例如「九成新電風扇 300」），可以先放照片，按「✦ AI 幫我寫」。
   - AI（api/ai-post.js）產生標題、分類、內文和價格建議，直接填進表單；使用者可以修改後再自己按發布。
   - 填好之後可以按「還原我寫的」回到原本的字。
   - AI 失敗（尚未設定、太頻繁、逾時、其他）時，表單完全不動，保留使用者原本寫的字，並顯示友善提示。
   - 同一句話 10 分鐘內再按，直接用上次的結果，不重複花額度。
   index.html 用法（postSheet 裡）：
     POSTAI.box({ board:"market"|"rent", cats, types, read:()=>({ title, body }), photos:()=>張數, apply:r=>{...填表單...}, restore:o=>{...} })
   ===================================================================== */
(() => {
  "use strict";
  let app = { lang: () => "zh", tr: s => s, translate: () => {} };
  const memo = new Map();

  function el(tag, attrs, ...kids){
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})){
      if (v == null || v === false) continue;
      if (k.startsWith("on")) e.addEventListener(k.slice(2), v); else if (k === "class") e.className = v; else e.setAttribute(k, v === true ? "" : v);
    }
    for (const c of kids.flat(Infinity)){ if (c == null || c === false) continue; e.append(c.nodeType ? c : document.createTextNode(String(c))); }
    return e;
  }
  const NOTE = {
    empty: "先在「內容」寫一句話，例如「九成新電風扇 300」。",
    ai_not_configured: "AI 發文助手還沒啟用，你寫的內容都還在，可以直接發布。",
    rate_limited: "按太快了，請等一分鐘再試；你寫的內容都還在。",
    ai_timeout: "AI 回應逾時，你寫的內容都還在，可以再試一次。",
    error: "AI 暫時無法使用，你寫的內容都還在。",
  };

  function box(opts){
    let busy = false, before = null;
    const status = el("p", { class: "postai-note", role: "status" });
    const undo = el("button", { type: "button", class: "linkbtn postai-undo", hidden: true, onclick: () => {
      if (before){ opts.restore(before); before = null; undo.hidden = true; say("已還原成你原本寫的內容。"); } } }, "還原我寫的");
    const btn = el("button", { type: "button", class: "ghost postai-btn", onclick: run }, "✦ ", "AI 幫我寫");
    const wrap = el("div", { class: "postai" }, el("div", { class: "postai-row" }, btn, undo), status);
    function say(msg, extra){
      status.replaceChildren(msg ? app.tr(msg) : "", extra || "");
      if (!msg && !extra) status.hidden = true; else status.hidden = false;
    }
    say(opts.hint === false ? "" : "寫一句話（物品、狀況、價格），再按「AI 幫我寫」，標題、分類、內文和價格建議會幫你填好。");
    async function run(){
      if (busy) return;
      const cur = opts.read();
      const text = String(cur.body || cur.title || "").trim().slice(0, 300);
      if (!text){ say(NOTE.empty); return; }
      const payload = { board: opts.board, text, cats: opts.cats, types: opts.types || [], photos: opts.photos ? opts.photos() : 0, lang: app.lang() === "en" ? "en" : "zh" };
      const key = JSON.stringify(payload);
      busy = true; btn.disabled = true;
      const PX = window.sgPixel;
      status.hidden = false; status.replaceChildren(PX ? PX.sprite("think", { size: 28, cls: "postai-think" }) : "", app.tr("AI 正在幫你寫…"));
      let r = memo.get(key), code = "";
      if (!r){
        try {
          const res = await fetch("/api/ai-post", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(25000) });
          const j = await res.json().catch(() => ({}));
          if (res.ok && j.title && j.body){ r = j; memo.set(key, j); if (memo.size > 50) memo.clear(); }
          else code = j.code === "ai_not_configured" ? "ai_not_configured" : res.status === 429 ? "rate_limited" : res.status === 504 ? "ai_timeout" : "error";
        } catch (e){ code = e && (e.name === "TimeoutError" || e.name === "AbortError") ? "ai_timeout" : "error"; }
      }
      busy = false; btn.disabled = false;
      if (!r){ say(NOTE[code] || NOTE.error); return; }       // 失敗：表單不動，保留原本的字
      if (!before) before = cur;                              // 記住使用者原本寫的，可以還原
      opts.apply(r);
      undo.hidden = false;
      say("AI 已經幫你填好，請確認、修改後再按發布。", r.priceNote ? el("span", { class: "postai-price", translate: "no" }, " 💰 ", r.priceNote) : null);
    }
    return wrap;
  }

  window.sgPostAI = { init(o){ app = { ...app, ...o }; }, box };
})();
