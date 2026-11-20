/* =====================================================================
   松果 AI 翻譯（前端）
   - 英文介面：中文的貼文、活動、留言旁出現「Translate」→ 翻成英文
   - 中文介面：英文內容旁出現「翻譯」→ 翻成繁體中文
   流程：先查 Supabase 的 translations 快取（用原文的雜湊值當 ID）→ 查不到的才送 /api/ai-translate
        （一次最多 20 段、只呼叫一次 AI）→ 結果存回快取，下次任何人看同一段文字都不用再花額度。
   index.html 用法：
     TR.init({ db:()=>S.db, uid:()=>S.uid, lang:()=>I18N.lang, onChange:renderKeep, toast })
     const v = TR.view("post:"+p.id, [p.title, p.body]);  // v.texts = 要顯示的文字；v.button = 按鈕（不需要時是 null）
   ===================================================================== */
(() => {
  "use strict";
  const MAX_BATCH = 20, MAX_CHARS = 2000;
  let app = { db: () => null, uid: () => null, lang: () => "zh", onChange: () => {}, toast: () => {} };

  const memo = new Map();     // "en\u0000原文" → { status:"loading"|"done"|"error", out }
  const shown = new Set();    // 目前切換成「顯示翻譯」的項目（例如 "post:abc"）
  const k = (target, text) => target + "\u0000" + text;

  /* ---------- 這段文字需要翻譯嗎？ ---------- */
  const CJK = /[㐀-鿿豈-﫿]/g, LATIN = /[A-Za-z]/g;
  function needs(text, target){
    if (typeof text !== "string" || !text.trim()) return false;
    const cjk = (text.match(CJK) || []).length, latin = (text.match(LATIN) || []).length;
    if (target === "en") return cjk >= 2;                            // 英文介面：含中文就能翻
    return latin >= 8 && cjk / (cjk + latin) < 0.2;                  // 中文介面：主要是英文才翻
  }
  const targetLang = () => app.lang() === "en" ? "en" : "zh";

  /* ---------- 雜湊：同一段文字永遠得到同一個 ID ---------- */
  async function keyOf(target, text){
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    const hex = [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
    // "g" = 加入中大詞彙表後的版本；詞彙表之前的舊翻譯不再沿用
    return `${target}g_${hex.slice(0, 40)}`;
  }

  /* ---------- 查快取、呼叫 AI、存回快取 ---------- */
  async function translateTexts(texts, target){
    const todo = [...new Set(texts)].filter(t => { const m = memo.get(k(target, t)); return !m || m.status === "error"; });
    if (!todo.length) return;
    todo.forEach(t => memo.set(k(target, t), { status: "loading" }));
    app.onChange();
    const db = app.db();
    const keys = await Promise.all(todo.map(t => keyOf(target, t).catch(() => null)));

    // 1) 先查 Supabase 快取
    let miss = todo.map((t, i) => ({ t, key: keys[i] }));
    if (db && keys.every(Boolean)){
      try {
        const snap = await db.collection("translations").where("key", "in", keys).limit(keys.length).get();
        const hit = new Map(snap.docs.map(d => [d.data().key, d.data()]));
        miss = miss.filter(({ t, key }) => {
          const d = hit.get(key);
          if (d && d.src === t && d.target === target && typeof d.out === "string"){ memo.set(k(target, t), { status: "done", out: d.out }); return false; }
          return true;
        });
      } catch {}
    }

    // 2) 查不到的才請 AI 翻譯（一次最多 20 段）
    let failMsg = "";
    for (let i = 0; i < miss.length; i += MAX_BATCH){
      const chunk = miss.slice(i, i + MAX_BATCH);
      try {
        const r = await fetch("/api/ai-translate", { method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ target, texts: chunk.map(x => x.t) }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !Array.isArray(j.translations)) throw j.code === "ai_not_configured" ? "AI 翻譯尚未啟用，請稍後再試。"
          : r.status === 429 ? "翻譯太頻繁了，請稍後再試。" : "翻譯失敗，請稍後再試。";
        chunk.forEach((x, n) => {
          const out = j.translations[n];
          memo.set(k(target, x.t), { status: "done", out });
          // 3) 存回快取（失敗也沒關係，只是下次要再翻一次）
          if (db && app.uid() && x.key) db.doc("translations/" + x.key)
            .set({ key: x.key, target, src: x.t, out, uid: app.uid(), ts: Date.now() }).catch(() => {});
        });
      } catch (e){
        failMsg = typeof e === "string" ? e : "翻譯失敗，請稍後再試。";
        chunk.forEach(x => memo.set(k(target, x.t), { status: "error" }));
      }
    }
    if (failMsg) app.toast(failMsg);
    app.onChange();
  }

  /* ---------- 給 index.html 用的：產生顯示文字與按鈕 ---------- */
  function translateItems(items){        // items: [{ id, texts }]
    const target = targetLang(); const all = [];
    for (const it of items){
      const need = it.texts.filter(t => needs(t, target)).map(t => t.slice(0, MAX_CHARS));
      if (!need.length) continue;
      shown.add(it.id); all.push(...need);
    }
    if (all.length) translateTexts(all, target); else app.onChange();
  }

  function view(id, texts, opts = {}){
    const target = targetLang();
    const need = texts.map(t => needs(t, target));
    if (!need.some(Boolean)) return { texts, button: null, translated: false };
    const states = texts.map((t, i) => need[i] ? memo.get(k(target, t.slice(0, MAX_CHARS))) : null);
    const loading = states.some(s => s && s.status === "loading");
    const ready = need.every((n, i) => !n || (states[i] && states[i].status === "done"));
    const on = shown.has(id) && ready;
    const out = on ? texts.map((t, i) => need[i] ? states[i].out : t) : texts;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "linkbtn tr-btn" + (opts.small ? " sm" : "");
    btn.textContent = loading ? "翻譯中…" : on ? "顯示原文" : "翻譯";
    btn.title = on ? "AI 翻譯，可能有誤" : "用 AI 翻譯";
    btn.disabled = loading;
    btn.addEventListener("click", e => {
      e.stopPropagation();
      if (shown.has(id) && ready){ shown.delete(id); app.onChange(); return; }
      translateItems([{ id, texts }]);
    });
    return { texts: out, button: btn, translated: on };
  }

  window.sgTranslate = {
    init(o){ app = { ...app, ...o }; },
    needs: (t) => needs(t, targetLang()),
    view, translateItems,
  };
})();
