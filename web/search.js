/* =====================================================================
   松果 全站搜尋（前端，純比對現有資料，不呼叫 AI）
   - 頂部的放大鏡 → 一個輸入框，同時搜尋：貼文標題與內容、活動、美食店家、校內地點、看板與系所名稱
   - 結果依類別分組，點了就跳到對應的內容
   - 中英文都能搜：比對原文，也比對系統名稱（系所、建築、類別）的英文翻譯；英文介面下照樣能打中文
   index.html 用法：
     SEARCH.init({ sources:()=>[{ group, title, sub, text, en, user, action }], tr, translate, onOpen })
     SEARCH.open()
   ===================================================================== */
(() => {
  "use strict";
  let A = { sources: () => [], tr: s => s, translate: () => {}, onOpen: () => {} };
  const t = s => A.tr(s);
  const GROUP_ORDER = ["貼文", "活動", "美食", "校內地點", "看板與系所"];
  const PER_GROUP = 5;

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
  const norm = s => String(s || "").toLowerCase().replace(/\s+/g, " ");
  // 每個字詞都要出現（原文或英文翻譯其中之一）；標題命中排前面
  function match(items, q){
    const words = norm(q).trim().split(" ").filter(Boolean); if (!words.length) return [];
    const out = [];
    for (const it of items){
      const hay = norm(it.title) + " " + norm(it.text) + " " + norm(it.en);
      if (!words.every(w => hay.includes(w))) continue;
      const title = norm(it.title) + " " + norm(it.enTitle);
      out.push({ ...it, score: words.reduce((n, w) => n + (title.includes(w) ? (title.startsWith(w) ? 3 : 2) : 0), 0) });
    }
    return out.sort((a, b) => b.score - a.score);
  }

  let box = null, input = null, results = null, items = [], timer = 0;
  function draw(){
    const q = input.value.trim();
    if (!q){ results.replaceChildren(el("p", { class: "sr-hint" }, t("可以搜尋貼文、活動、美食、校內地點、看板與系所。中文、英文都可以。"))); A.translate(results); return; }
    const hits = match(items, q);
    if (!hits.length){ results.replaceChildren(el("p", { class: "sr-hint" }, t("找不到符合的結果，換個關鍵字試試。"))); return; }
    const groups = GROUP_ORDER.map(g => [g, hits.filter(h => h.group === g)]).filter(([, l]) => l.length);
    results.replaceChildren(...groups.map(([g, list]) => el("section", { class: "sr-group" },
      el("h3", {}, t(g), el("span", { class: "sr-n" }, String(list.length))),
      list.slice(0, PER_GROUP).map(it => el("button", { type: "button", class: "sr-item", onclick: () => { close(); it.action(); } },
        el("b", { translate: it.user ? "no" : null }, it.title),
        it.sub ? el("span", { translate: it.userSub ? "no" : null }, it.sub) : null)),
      list.length > PER_GROUP ? el("p", { class: "sr-more" }, t("還有"), " ", list.length - PER_GROUP, " ", t("筆，輸入更多字縮小範圍")) : null)));
    A.translate(results);
  }
  function open(){
    A.onOpen();
    items = A.sources();
    if (box) box.remove();
    input = el("input", { type: "search", class: "sr-input", placeholder: t("搜尋松果…"), "aria-label": t("搜尋松果…"), autocomplete: "off", enterkeyhint: "search" });
    // 注音輸入選字中不搜尋，選完字（compositionend）才更新
    input.addEventListener("input", e => { if (e.isComposing) return; clearTimeout(timer); timer = setTimeout(draw, 120); });
    input.addEventListener("compositionend", () => { clearTimeout(timer); timer = setTimeout(draw, 60); });
    input.addEventListener("keydown", e => { if (e.key === "Enter" && !e.isComposing){ const first = results.querySelector(".sr-item"); if (first) first.click(); } });
    results = el("div", { class: "sr-results", "aria-live": "polite" });
    box = el("div", { class: "sr-scrim", onclick: e => { if (e.target === box) close(); } },
      el("div", { class: "sr-box", role: "dialog", "aria-modal": "true", "aria-label": t("搜尋") },
        el("div", { class: "sr-top" }, input, el("button", { type: "button", class: "sr-x", onclick: close }, t("取消"))), results));
    box.addEventListener("keydown", e => { if (e.key === "Escape") close(); });
    document.body.append(box); document.body.classList.add("sr-open");
    A.translate(box); draw(); input.focus();
  }
  function close(){ if (!box) return; box.remove(); box = null; document.body.classList.remove("sr-open"); }

  const css = `
.sr-scrim{position:fixed;inset:0;z-index:45;background:rgba(10,15,12,.5);display:flex;justify-content:center;align-items:flex-start;padding:6vh 16px 16px}
.sr-box{background:var(--surface);color:var(--ink);border-radius:16px;width:100%;max-width:600px;max-height:82vh;display:flex;flex-direction:column;box-shadow:0 12px 40px rgba(0,0,0,.28);overflow:hidden}
.sr-top{display:flex;gap:8px;align-items:center;padding:12px;border-bottom:1px solid var(--line)}
.sr-box input.sr-input{flex:1;min-width:0;font-size:16px;border-radius:999px;padding:10px 16px;background:var(--sunk);border:1px solid transparent;color:var(--ink)}
.sr-box input.sr-input:focus{outline:none;border-color:var(--pine);background:var(--surface)}
.sr-x{background:none;border:0;color:var(--pine);font-weight:600;font-size:15px;cursor:pointer;padding:6px}
.sr-results{overflow-y:auto;padding:6px 12px 14px;display:flex;flex-direction:column;gap:12px;overscroll-behavior:contain}
.sr-hint{margin:12px 4px;color:var(--muted);font-size:14px;line-height:1.5}
.sr-group h3{margin:6px 4px;font-size:13px;color:var(--muted);font-weight:700;display:flex;align-items:center;gap:6px}
.sr-n{font-size:11px;background:var(--sunk);border-radius:999px;padding:0 7px;font-weight:600}
.sr-item{display:flex;flex-direction:column;gap:2px;width:100%;text-align:left;background:none;border:0;border-radius:10px;padding:8px 10px;cursor:pointer;color:var(--ink);font:inherit}
.sr-item:hover,.sr-item:focus-visible{background:var(--sunk);outline:none}
.sr-item b{font-size:15px;overflow-wrap:anywhere}
.sr-item span{font-size:12.5px;color:var(--muted);overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.sr-more{margin:2px 10px;font-size:12.5px;color:var(--muted)}
@media (max-width:720px){.sr-scrim{padding:0;align-items:stretch}.sr-box{max-width:none;max-height:none;border-radius:0;height:100dvh}}
body.sr-open{overflow:hidden}
`;
  const st = document.createElement("style"); st.textContent = css; document.head.append(st);
  window.sgSearch = { init(o){ A = { ...A, ...o }; }, open, close, match };
})();
