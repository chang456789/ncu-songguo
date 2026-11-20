/* =====================================================================
   松果 發布前隱私提醒（前端，純規則，不呼叫 AI）
   適用：開拼車團的備註、發文（論壇、市集、租屋…）、拼車討論區留言
   偵測：手機號碼、LINE ID、門牌地址（X 路 X 號、X 樓）、Email、身分證字號、銀行帳號
   偵測到時跳出提醒，但「不擋發布」，使用者可以選：
     ・改成校內集合點：地址換成選好的校內集合點，其他個資換成「（私訊再交換）」，然後發布
     ・仍要照原內容發布
     ・回去修改
   index.html 用法：
     const out = await PRIV.review([title, body]);   // 沒偵測到 → 立刻回傳原文
     if (!out) return;                              // 使用者選「回去修改」
     const [t, b] = out;                            // 照原文，或已換成集合點的文字
   ===================================================================== */
(() => {
  "use strict";
  let app = { tr: s => s, translate: () => {} };
  const t = s => app.tr(s);

  // 每條規則：kind（種類）、re（要找的樣子）。地址類（addr）會換成集合點，其他換成「（私訊再交換）」
  const RULES = [
    { kind: "phone", label: "手機號碼", re: /(?:\+?886[-\s]?|0)9\d{2}[-\s]?\d{3}[-\s]?\d{3}(?!\d)/g },
    { kind: "email", label: "Email", re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
    { kind: "id", label: "身分證字號", re: /(?<![A-Za-z0-9])[A-Z][12489]\d{8}(?!\d)/gi },
    { kind: "line", label: "LINE ID", re: /(?:\bline\b|賴)(?:\s*\bline\b)?\s*(?:\bid\b)?\s*[:：]?\s*@?(?!(?:line|id)\b)[A-Za-z0-9._-]{4,20}(?![A-Za-z0-9._-])|(?<![A-Za-z])id\s*[:：]\s*@?[A-Za-z0-9._-]{4,20}/gi },
    { kind: "bank", label: "銀行帳號", re: /(?:帳號|帳戶|匯款|轉帳|account)\s*[:：]?\s*(?:\(\d{3}\)|\d{3})?[-\s]?\d[\d-]{9,17}\d|(?<!\d)\d{3}[-\s]\d{10,14}(?!\d)|(?<![\d-])\d{12,16}(?![\d-])/gi },
    { kind: "addr", label: "門牌地址", re: /[一-鿿]{1,8}(?:路|街|大道)(?:[一二三四五六七八九十\d]+段)?(?:\d+巷)?(?:\d+弄)?\d+(?:之\d+)?號(?:\d+樓(?:之\d+)?)?|(?<![\d.])\d{1,2}\s*樓(?:之\d+)?/g },
  ];
  const SPOTS = ["正門警衛室公車站", "後門", "中大湖", "依仁堂", "校內集合（私訊確認地點）"];

  /** 找出文字裡的個資：回傳 [{ kind, label, text, index }]（同一段不重複） */
  function scan(text){
    const s = String(text || ""), hits = [];
    for (const r of RULES){
      for (const m of s.matchAll(r.re)){
        const a = m.index, b = a + m[0].length;
        if (hits.some(x => a < x.index + x.text.length && b > x.index)) continue;   // 已被別的規則抓到
        // 銀行帳號規則不要抓到手機號碼
        if (r.kind === "bank" && /^(?:\+?886|0)9/.test(m[0].replace(/\D/g, "").replace(/^886/, "0"))) continue;
        hits.push({ kind: r.kind, label: r.label, text: m[0], index: a });
      }
    }
    return hits.sort((x, y) => x.index - y.index);
  }
  function replaceAll(text, spot){
    const hits = scan(text); if (!hits.length) return text;
    let out = "", at = 0;
    for (const x of hits){
      out += text.slice(at, x.index) + t(x.kind === "addr" ? spot : "（私訊再交換）");
      at = x.index + x.text.length;
    }
    return out + text.slice(at);
  }

  let open = null;
  /** texts: 字串陣列。回傳 Promise：照原文或替換後的字串陣列；選「回去修改」回傳 null */
  function review(texts){
    const list = (Array.isArray(texts) ? texts : [texts]).map(x => String(x == null ? "" : x));
    const hits = list.flatMap(scan);
    if (!hits.length) return Promise.resolve(list);
    if (open) open.close(null);
    return new Promise(resolve => {
      const kinds = [...new Set(hits.map(x => x.label))];
      const hasAddr = hits.some(x => x.kind === "addr");
      let spot = SPOTS[0];
      const el = (tag, attrs, ...kids) => { const e = document.createElement(tag);
        for (const [k, v] of Object.entries(attrs || {})) { if (v == null || v === false) continue; if (k.startsWith("on")) e.addEventListener(k.slice(2), v); else if (k === "class") e.className = v; else e.setAttribute(k, v === true ? "" : v); }
        for (const c of kids.flat(Infinity)) { if (c == null || c === false) continue; e.append(c.nodeType ? c : document.createTextNode(String(c))); }
        return e; };
      const preview = el("p", { class: "pv-preview", translate: "no" });
      const showPreview = () => { preview.textContent = list.map(x => replaceAll(x, spot)).filter(Boolean).join("\n"); };
      const sel = el("select", { class: "pv-spot", "aria-label": t("集合點"), onchange: e => { spot = e.target.value; showPreview(); } },
        SPOTS.map(s => el("option", { value: s }, t(s))));
      const close = v => { if (!open) return; open = null; wrap.remove(); document.removeEventListener("keydown", onKey, true); resolve(v); };
      const onKey = e => { if (e.key === "Escape"){ e.stopPropagation(); close(null); } };
      const wrap = el("div", { class: "pv-scrim", onclick: e => { if (e.target === wrap) close(null); } },
        el("div", { class: "pv-box", role: "alertdialog", "aria-modal": "true", "aria-labelledby": "pv-title" },
          el("h2", { id: "pv-title" }, "發布前提醒"),
          el("p", {}, "內容裡好像有個人資料：", kinds.map((k, i) => [i ? "、" : "", el("b", {}, k)]), "。"),
          el("p", { class: "pv-tip" }, "匿名平台建議不要公開個資，可以等對方同意私訊後再交換。"),
          el("ul", { class: "pv-hits", translate: "no" }, hits.slice(0, 6).map(x => el("li", {}, el("mark", {}, x.text)))),
          el("div", { class: "pv-fix" },
            el("span", { class: "pv-label" }, hasAddr ? "改成校內集合點：" : "把個資換成「（私訊再交換）」："),
            hasAddr ? sel : null, el("span", { class: "pv-label small" }, "發布後的內容會變成："), preview),
          el("div", { class: "pv-acts" },
            el("button", { type: "button", class: "primary", onclick: () => close(list.map(x => replaceAll(x, spot))) }, hasAddr ? "改成校內集合點" : "改掉個資再發布"),
            el("button", { type: "button", class: "ghost", onclick: () => close(list) }, "仍要照原內容發布"),
            el("button", { type: "button", class: "linkbtn", onclick: () => close(null) }, "回去修改"))));
      showPreview();
      document.body.append(wrap);
      app.translate(wrap);
      document.addEventListener("keydown", onKey, true);
      open = { close };
      // 焦點放在對話框本身，不放在按鈕上：使用者是按 Enter 送出的話，同一個 Enter 不能順便按到「改成校內集合點」
      const box = wrap.querySelector(".pv-box"); box.setAttribute("tabindex", "-1"); box.focus({ preventScroll: true });
    });
  }

  const css = `
.pv-scrim{position:fixed;inset:0;z-index:50;background:rgba(10,15,12,.55);display:flex;align-items:center;justify-content:center;padding:16px}
.pv-box{background:var(--surface);color:var(--ink);border-radius:16px;max-width:460px;width:100%;max-height:calc(100dvh - 32px);overflow-y:auto;padding:18px 20px;display:flex;flex-direction:column;gap:10px;box-shadow:0 12px 40px rgba(0,0,0,.3);border-top:4px solid var(--bus)}
.pv-box:focus{outline:none}
.pv-box h2{margin:0;font-size:19px;font-weight:800}
.pv-box p{margin:0;font-size:14px;line-height:1.55}
.pv-tip{color:var(--muted)}
.pv-hits{margin:0;padding:0;list-style:none;display:flex;flex-wrap:wrap;gap:6px}
.pv-hits mark{background:var(--bus-soft);color:var(--bus);border-radius:6px;padding:2px 8px;font-size:13px;overflow-wrap:anywhere}
.pv-fix{display:flex;flex-direction:column;gap:6px;background:var(--sunk);border-radius:12px;padding:10px 12px}
.pv-label{font-size:13px;font-weight:600}
.pv-label.small{color:var(--muted);font-weight:400}
.pv-preview{white-space:pre-wrap;overflow-wrap:anywhere;font-size:14px;max-height:120px;overflow-y:auto}
.pv-acts{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.pv-acts .primary,.pv-acts .ghost{flex:1 1 160px}
@media (max-width:720px){.pv-scrim{align-items:flex-end;padding:0}.pv-box{border-radius:16px 16px 0 0;max-width:none;padding-bottom:calc(18px + env(safe-area-inset-bottom,0px))}}
`;
  const st = document.createElement("style"); st.textContent = css; document.head.append(st);

  window.sgPrivacy = { init(o){ app = { ...app, ...o }; }, scan, replaceAll, review };
})();
