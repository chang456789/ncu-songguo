/* =====================================================================
   松果「負責任的 AI」頁（前端）
   - 內容來自謝恩妮維護的 docs/responsible-ai.md（透過 /api/responsible-ai 取得），這裡只負責顯示
   - 原文中英文寫在一起：標題「中文｜English」、內文一段中文一段英文（中間用 <!-- --> 分開）
     → 依目前語言只顯示那一種
   - 只支援這份文件用到的 Markdown：# 標題、段落、- 清單、**粗體**、[連結](網址)、---
     一律用 DOM 組出來（不用 innerHTML），文件內容不會被當成程式執行
   index.html 用法：RAI.init({ lang:()=>I18N.lang, onChange:()=>renderKeep() })；RAI.view() 回傳頁面內容
   ===================================================================== */
(() => {
  "use strict";
  let A = { lang: () => "zh", onChange: () => {} };
  let st = { status: "idle", md: "" };
  const CJK = /[㐀-鿿]/;

  function el(tag, attrs, ...kids){
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})){ if (v == null || v === false) continue; if (k === "class") e.className = v; else e.setAttribute(k, v === true ? "" : v); }
    for (const c of kids.flat(Infinity)){ if (c == null || c === false) continue; e.append(c.nodeType ? c : document.createTextNode(String(c))); }
    return e;
  }
  // 行內：**粗體**、[文字](https://…)、<https://…>
  function inline(text){
    const out = []; const re = /\*\*(.+?)\*\*|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|<(https?:\/\/[^>\s]+)>/g; let at = 0, m;
    while ((m = re.exec(text))){
      if (m.index > at) out.push(text.slice(at, m.index));
      out.push(m[1] != null ? el("strong", {}, m[1]) : m[4] != null ? el("a", { href: m[4], target: "_blank", rel: "noopener" }, m[4])
        : el("a", { href: m[3], target: "_blank", rel: "noopener" }, m[2]));
      at = re.lastIndex;
    }
    if (at < text.length) out.push(text.slice(at));
    return out;
  }
  // 拆成區塊：{ type: "h1"|"h2"|"p"|"ul"|"hr", text | items }
  function blocks(md){
    const out = []; let para = [], list = null;
    const flush = () => { if (para.length){ out.push({ type: "p", text: para.join(" ") }); para = []; } if (list){ out.push({ type: "ul", items: list }); list = null; } };
    for (const raw of md.replace(/\r/g, "").split("\n")){
      const line = raw.trim();
      if (!line || /^<!--.*-->$/.test(line)){ flush(); continue; }
      let m;
      if ((m = /^(#{1,3})\s+(.*)$/.exec(line))){ flush(); out.push({ type: m[1].length === 1 ? "h1" : "h2", text: m[2] }); continue; }
      if (/^-{3,}$/.test(line)){ flush(); out.push({ type: "hr" }); continue; }
      if ((m = /^[-*]\s+(.*)$/.exec(line))){ if (para.length) flush(); (list ||= []).push(m[1]); continue; }
      if (list) flush();
      para.push(line);
    }
    flush();
    return out;
  }
  // 依語言挑內容：標題「中文｜English」取一半；段落與清單只留那個語言的
  function render(md, lang){
    const en = lang === "en";
    // 「1. 中文｜English」：英文也保留前面的編號
    const pickTitle = t => { const parts = t.split("｜"); if (parts.length < 2) return t;
      const num = (/^\s*(\d+\.\s*)/.exec(parts[0]) || [, ""])[1];
      return en ? (num + parts.slice(1).join("｜").trim()) : parts[0].trim(); };
    const isZh = s => CJK.test(s.replace(/「問松果」|"Ask Songguo"/g, ""));
    const nodes = [];
    for (const b of blocks(md)){
      if (b.type === "h1") nodes.push(el("h1", {}, pickTitle(b.text)));
      else if (b.type === "h2") nodes.push(el("h2", {}, pickTitle(b.text)));
      else if (b.type === "hr") continue;
      else if (b.type === "p"){ if (isZh(b.text) !== en) nodes.push(el("p", {}, inline(b.text))); }
      else if (b.type === "ul"){ const items = b.items.filter(t => isZh(t) !== en); if (items.length) nodes.push(el("ul", {}, items.map(t => el("li", {}, inline(t))))); }
    }
    return nodes;
  }

  async function load(){
    st = { status: "loading", md: "" }; A.onChange();
    try {
      const r = await fetch("/api/responsible-ai");
      st = r.ok ? { status: "ok", md: await r.text() } : { status: r.status === 404 ? "missing" : "error", md: "" };
    } catch { st = { status: "error", md: "" }; }
    A.onChange();
  }
  function view(){
    if (st.status === "idle") load();
    const tr = s => (window.sgI18n ? window.sgI18n.tr(s) : s);
    if (st.status === "loading" || st.status === "idle") return el("p", { class: "muted" }, tr("載入中…"));
    if (st.status !== "ok") return el("div", { class: "info" }, tr(st.status === "missing" ? "負責任的 AI 說明頁還沒準備好，請稍後再來看。" : "讀不到說明頁，請檢查網路後再試一次。"));
    // 文件本身已經依語言挑好，不需要再被 i18n 翻譯
    return el("article", { class: "card rai-doc", translate: "no", lang: A.lang() === "en" ? "en" : "zh-Hant" }, render(st.md, A.lang()));
  }

  const css = `
.rai-doc{display:flex;flex-direction:column;gap:10px;line-height:1.7;font-size:15px}
.rai-doc h1{margin:0;font-size:22px;color:var(--pine)}
.rai-doc h2{margin:14px 0 0;font-size:17px;padding-top:12px;border-top:1px solid var(--line)}
.rai-doc p{margin:0;color:var(--ink)}
.rai-doc ul{margin:0;padding-left:20px;display:flex;flex-direction:column;gap:6px}
.rai-doc strong{color:var(--pine)}
.rai-doc a{color:var(--pine)}
`;
  const s = document.createElement("style"); s.textContent = css; document.head.append(s);
  window.sgRAI = { init(o){ A = { ...A, ...o }; }, view, load, _render: render, _blocks: blocks };
})();
