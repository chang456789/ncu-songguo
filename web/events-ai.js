/* =====================================================================
   松果 活動空檔媒合（前端）
   - 活動頁上方三個按鈕：「我有 1 小時」「我有 2 小時」「今晚想找事做」。
   - 先用程式篩出時間吻合的活動：現在到空檔結束之間開始、正在進行中、或展期中的展覽。
     沒有符合的就直接說沒有，不呼叫 AI。
   - 有符合的才呼叫一次 POST /api/events（task:"match"），AI 從中挑 1–3 個並各寫一句「為什麼現在去剛好」。
   - 同樣的空檔＋同樣的候選活動，10 分鐘內不重複呼叫（記在記憶體）。
   - AI 失敗（尚未設定、太頻繁、逾時、其他）時，改列出程式篩出的前 3 個活動，並顯示友善提示。
   index.html 用法：
     EVAI.init({ events:()=>upcomingEvents(), when:e=>evWhen(e), lang:()=>I18N.lang, onChange:()=>renderKeep() })
     EVAI.panel()   // 回傳要放進活動頁的 DOM
   ===================================================================== */
(() => {
  "use strict";
  const SLOTS = [["1h", "我有 1 小時"], ["2h", "我有 2 小時"], ["tonight", "今晚想找事做"]];
  const MAX_CANDIDATES = 12, MEMO_MS = 10 * 60e3, TIMEOUT_MS = 25000;
  let app = { events: () => [], when: () => "", lang: () => "zh", onChange: () => {} };
  let st = { slot: null, loading: false, picks: null, note: "" };
  const memo = new Map();   // key → { at, picks }

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
  const pad = n => String(n).padStart(2, "0");
  const isoOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const toMin = s => { const m = /^(\d{1,2}):(\d{2})/.exec(s || ""); return m ? +m[1] * 60 + +m[2] : null; };
  function times(e){
    const parts = String(e.time || "").split(/[–~-]/);
    const s = toMin(parts[0]), en = toMin(parts[1]);
    return { s, en: en != null && s != null && en > s ? en : null };
  }

  /* ---------- 用程式篩出時間吻合的活動（不呼叫 AI） ---------- */
  function candidates(slot, list, now = new Date()){
    const today = isoOf(now), nowM = now.getHours() * 60 + now.getMinutes();
    const ws = slot === "tonight" ? Math.max(nowM, 17 * 60) : nowM;
    const we = slot === "1h" ? nowM + 60 : slot === "2h" ? nowM + 120 : 24 * 60;
    if (ws >= we) return [];
    const out = [];
    for (const e of list){
      if (!e || !e.date || !e.title) continue;
      const { s, en } = times(e);
      const multiDay = e.end && e.end > e.date;
      if (multiDay){
        // 展覽／展期中的活動：今天在展期內，且（若有開放時間）開放時間和空檔有重疊
        if (!(e.date <= today && today <= e.end)) continue;
        if (s != null){ const close = en != null ? en : s + 8 * 60; if (s < we && close > ws + 20) out.push({ e, start: Math.max(s, ws), kind: "ongoing" }); }
        else if (slot !== "tonight" && nowM >= 9 * 60 && nowM < 17 * 60) out.push({ e, start: ws, kind: "ongoing" });
        continue;
      }
      if (e.date !== today || s == null) continue;        // 沒有時間的單日活動無法判斷，略過
      if (s >= ws && s <= we) out.push({ e, start: s, kind: "starts" });
      else if (en != null && s < nowM && en - nowM >= 20 && slot !== "tonight") out.push({ e, start: nowM, kind: "now" });
    }
    return out.sort((a, b) => a.start - b.start).slice(0, MAX_CANDIDATES);
  }

  /* ---------- 按下按鈕 ---------- */
  async function pick(slot){
    if (st.loading) return;
    const cands = candidates(slot, app.events());
    st = { slot, loading: false, picks: null, note: "", cands };
    if (!cands.length){ st.note = "none"; app.onChange(); return; }   // 沒有符合的：直接說沒有，不呼叫 AI
    const lang = app.lang() === "en" ? "en" : "zh";
    const now = new Date();
    const key = JSON.stringify([slot, lang, cands.map(c => c.e.id || c.e.title)]);
    const hit = memo.get(key);
    if (hit && Date.now() - hit.at < MEMO_MS){ st.picks = hit.picks; app.onChange(); return; }
    st.loading = true; app.onChange();
    let code = "";
    try {
      const r = await fetch("/api/events", {
        method: "POST", headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS),
        body: JSON.stringify({ task: "match", slot, lang, now: `${isoOf(now)} ${pad(now.getHours())}:${pad(now.getMinutes())}`,
          candidates: cands.map(({ e }) => ({ title: e.title, when: app.when(e), place: e.place || "", tags: e.tags || [], highlight: e.highlight || "" })) }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok && Array.isArray(j.picks) && j.picks.length){
        const picks = j.picks.filter(p => cands[p.i]).map(p => ({ c: cands[p.i], why: p.why }));
        memo.set(key, { at: Date.now(), picks }); st.picks = picks;
      } else code = j.code || (r.status === 429 ? "rate_limited" : r.status === 504 ? "ai_timeout" : "ai_error");
    } catch (e){
      code = e && (e.name === "TimeoutError" || e.name === "AbortError") ? "ai_timeout" : "network";
    }
    if (code){
      // 備援：AI 失敗時列出程式篩出的前 3 個
      st.picks = cands.slice(0, 3).map(c => ({ c, why: "" }));
      st.note = code === "ai_not_configured" ? "fallback_off" : code === "rate_limited" || code === "ai_rate_limited" ? "fallback_busy"
        : code === "ai_timeout" ? "fallback_timeout" : "fallback_error";
    }
    st.loading = false; app.onChange();
  }

  const NOTES = {
    none: "這段時間沒有找到適合的活動，可以看看下面完整的活動列表。",
    fallback_off: "AI 推薦還沒啟用，先列出時間吻合的活動。",
    fallback_busy: "AI 使用量太多了，先列出時間吻合的活動，稍後再試。",
    fallback_timeout: "AI 回應逾時，先列出時間吻合的活動。",
    fallback_error: "AI 暫時無法推薦，先列出時間吻合的活動。",
  };
  const KIND = { starts: "即將開始", now: "進行中", ongoing: "展期中" };

  function panel(){
    const box = el("section", { class: "card gap-card" },
      el("div", { class: "gap-head" }, el("b", {}, "有空檔嗎？"), el("span", { class: "muted small" }, "AI 從時間剛好的活動裡幫你挑")),
      el("div", { class: "chips" }, SLOTS.map(([k, l]) => el("button", { type: "button", class: "chip", "aria-pressed": st.slot === k ? "true" : "false",
        disabled: st.loading, onclick: () => pick(k) }, l))));
    if (st.loading) box.append(el("p", { class: "gap-loading muted small", role: "status" }, "AI 正在挑選…"));
    else if (st.slot){
      if (st.note) box.append(el("p", { class: "gap-note small" }, NOTES[st.note]));
      if (st.picks && st.picks.length) box.append(el("ul", { class: "gap-list" }, st.picks.map(({ c, why }) => el("li", {},
        el("div", { class: "gap-t" }, el("span", { class: "tag" }, KIND[c.kind]),
          el("b", { translate: "no" }, c.e.url ? el("a", { href: c.e.url, target: "_blank", rel: "noopener" }, c.e.title) : c.e.title)),
        el("span", { class: "muted small" }, app.when(c.e), c.e.place ? el("span", { translate: "no" }, "・" + c.e.place) : null),
        why ? el("span", { class: "gap-why", translate: "no" }, why) : null))));
    }
    return box;
  }

  window.sgEventsAI = { init(o){ app = { ...app, ...o }; }, panel, candidates };
})();
