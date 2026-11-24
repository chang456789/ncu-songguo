/* =====================================================================
   松果「🎤 用說的建立課表」（前端）
   - 課表頁的按鈕打開一個視窗：一口氣說完（或貼上一整段文字），
     例如「星期一早上九點到十一點微積分在科一101，星期三下午兩點英文」。
   - 送到 /api/ai-timetable，AI 整理成課程清單（星期、開始、結束、課名、教室）。
   - 先顯示「預覽」，每一欄都能改、可以刪掉某一堂；按「確認加入」才寫進課表。
   - 沒說下課時間的課，結束時間是預設的兩節課，會標出來請使用者確認。
   - 和原本課表時間重疊的課會提醒（不擋）。
   index.html 用法：
     TTV.init({ h, tr, voice, toast, tt, save, colors, closeModal, rerender })
     TTV.button()          // 課表頁的「🎤 用說的建立課表」按鈕
     TTV.sheet()           // openModal({ k:"ttvoice" }) 的內容
   ===================================================================== */
(() => {
  "use strict";
  const DAYN = ["", "一", "二", "三", "四", "五", "六", "日"];
  const MAX = 1000;
  let A = { h: null, tr: s => s, voice: null, toast: () => {}, tt: () => ({ courses: [] }), save: () => {}, colors: ["#235c45"],
    open: () => {}, closeModal: () => {}, rerender: () => {} };
  let st = null;
  const reset = () => { st = { text: "", status: "idle", msg: "", rows: [], replace: false }; };
  reset();

  const toMin = s => { const m = /^(\d{1,2}):(\d{2})/.exec(s || ""); return m ? +m[1] * 60 + +m[2] : null; };
  const ERR = {
    ai_not_configured: "AI 還沒設定，請先用「＋ 新增課程」一堂一堂輸入。",
    rate_limited: "用得太頻繁了，請等一分鐘再試。",
    too_long: "文字太長了，請分幾次輸入。",
    empty: "聽不出任何一堂課，請說出星期、時間和課名，例如「星期二下午兩點英文」。",
    net: "連不上松果，請檢查網路後再試。",
  };

  async function parse(){
    const text = st.text.trim();
    if (!text){ st.status = "error"; st.msg = "請先說或輸入你的課。"; return A.rerender(); }
    st.status = "loading"; st.msg = ""; A.rerender();
    try {
      const r = await fetch("/api/ai-timetable", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, lang: "zh" }) });
      let j = null; try { j = await r.json(); } catch {}
      if (!r.ok){ st.status = "error"; st.msg = ERR[j && j.code] || "AI 暫時無法使用，請稍後再試。"; return A.rerender(); }
      const list = (j && Array.isArray(j.courses) ? j.courses : []);
      if (!list.length){ st.status = "error"; st.msg = ERR.empty; return A.rerender(); }
      st.rows = list.map(c => ({ day: +c.day, start: c.start, end: c.end, name: c.name || "", room: c.room || "", guess: !!c.endGuessed }));
      st.status = "preview";
    } catch { st.status = "error"; st.msg = ERR.net; }
    A.rerender();
  }

  // 和原本課表（或這次清單裡的其他課）時間重疊
  function clash(r, i){
    const a = toMin(r.start), b = toMin(r.end); if (a == null || b == null) return null;
    const hit = c => +c.day === +r.day && toMin(c.start) < b && a < toMin(c.end);
    const old = st.replace ? null : A.tt().courses.find(hit);
    if (old) return old.name;
    const dup = st.rows.find((c, k) => k !== i && hit(c));
    return dup ? dup.name : null;
  }
  const rowErr = r => !r.name.trim() ? "請填課名" : toMin(r.start) == null || toMin(r.end) == null ? "請填時間" : toMin(r.end) <= toMin(r.start) ? "下課時間要比上課時間晚" : null;

  function confirm(){
    const bad = st.rows.findIndex(rowErr);
    if (bad >= 0){ st.msg = `第 ${bad + 1} 堂：${rowErr(st.rows[bad])}`; st.status = "preview"; return A.rerender(); }
    const T = A.tt(), base = st.replace ? [] : T.courses.slice();
    const add = st.rows.map((r, i) => ({ id: Math.random().toString(36).slice(2, 10), name: r.name.trim().slice(0, 40), day: +r.day, start: r.start, end: r.end,
      room: r.room.trim().slice(0, 30), teacher: "", color: A.colors[(base.length + i) % A.colors.length] }));
    const n = add.length;
    reset(); A.closeModal();
    A.save({ ...T, courses: base.concat(add) });
    A.toast(A.tr(`已加入 ${n} 堂課`));
  }

  // 預覽清單：修改欄位時只更新提示（不重繪整個視窗，避免打字或點按鈕時畫面被換掉）
  function preview(h){
    const notes = [];
    const refresh = () => st.rows.forEach((r, i) => {
      const c = clash(r, i), box = notes[i]; if (!box) return;
      box.replaceChildren(...[r.guess ? h("p", { class: "ttv-note" }, A.tr("沒聽到下課時間，先填兩節課，請確認。")) : null,
        c ? h("p", { class: "ttv-note warn" }, A.tr(`和「${c}」時間重疊`)) : null].filter(Boolean));
      const endEl = box.parentElement && box.parentElement.querySelector(".ttv-end"); if (endEl) endEl.classList.toggle("ttv-guess", !!r.guess);
    });
    const field = (r, k, el) => { el.addEventListener("input", () => { r[k] = el.value; if (k === "end") r.guess = false; refresh(); }); return el; };
    const list = h("div", { class: "ttv-list" },
      st.rows.map((r, i) => {
        const box = h("div", { class: "ttv-notes", "aria-live": "polite" }); notes[i] = box;
        return h("div", { class: "ttv-row" },
          h("div", { class: "ttv-line" },
            field(r, "day", h("select", { "aria-label": "星期", class: "ttv-day" }, [1, 2, 3, 4, 5, 6, 7].map(d => h("option", { value: d, selected: +r.day === d }, "星期" + DAYN[d])))),
            field(r, "name", h("input", { type: "text", value: r.name, maxlength: "40", placeholder: A.tr("課名"), "aria-label": "課名", translate: "no" })),
            h("button", { type: "button", class: "ttv-x", "aria-label": "刪掉這堂", title: "刪掉這堂", onclick: () => { st.rows.splice(i, 1); if (!st.rows.length) st.status = "idle"; A.rerender(); } }, "×")),
          h("div", { class: "ttv-line" },
            field(r, "start", h("input", { type: "time", value: r.start, step: "300", "aria-label": "上課時間" })),
            h("span", { class: "muted ttv-dash" }, "–"),
            field(r, "end", h("input", { type: "time", value: r.end, step: "300", "aria-label": "下課時間", class: "ttv-end" }))),
          h("div", { class: "ttv-line" },
            field(r, "room", h("input", { type: "text", value: r.room, maxlength: "30", placeholder: A.tr("教室（選填）"), "aria-label": "教室", translate: "no" }))),
          box);
      }));
    refresh();
    return list;
  }

  function sheet(){
    const h = A.h;
    const ta = h("textarea", { id: "ttv-text", rows: "4", maxlength: String(MAX), placeholder: "例：星期一早上九點到十一點微積分在科一101，星期三下午兩點英文", "aria-label": "你的課" });
    ta.value = st.text;
    ta.addEventListener("input", () => { st.text = ta.value; });
    const mic = A.voice && A.voice.button ? A.voice.button("ttv", () => document.getElementById("ttv-text")) : null;
    const loading = st.status === "loading", isPreview = st.status === "preview" && st.rows.length;
    const hasOld = A.tt().courses.length > 0;
    return h("div", { class: "sheet ttv", role: "dialog", "aria-modal": "true", "aria-label": "用說的建立課表" },
      h("h2", {}, "🎤 用說的建立課表"),
      h("p", { class: "muted small", style: "margin:0" }, mic ? "按麥克風一口氣說完，或直接貼上整段文字（例如選課系統複製的課表）。AI 會整理成課程清單，確認後才會加入。"
        : "直接打字或貼上整段文字（例如選課系統複製的課表），AI 會整理成課程清單，確認後才會加入。"),
      !mic && A.voice && A.voice.supported === false ? h("p", { class: "muted small", style: "margin:0" }, "這個瀏覽器不支援語音輸入，可以改用 Chrome 或 Edge，或直接打字。") : null,
      h("div", { class: "ttv-in" }, ta, mic),
      h("div", { class: "ttv-go" },
        h("button", { type: "button", class: isPreview ? "ghost" : "primary", disabled: loading, onclick: parse }, loading ? "整理中…" : isPreview ? "重新整理" : "整理成課程"),
        loading ? h("span", { class: "muted small", role: "status" }, "AI 正在整理你的課…") : null),
      st.msg ? h("p", { class: st.status === "error" ? "err" : "ttv-note warn", role: "alert" }, st.msg) : null,
      isPreview ? [
        h("h3", { class: "ttv-h" }, `預覽（共 ${st.rows.length} 堂，可以直接修改）`),
        preview(h),
        hasOld ? h("label", { class: "ttv-replace" }, h("input", { type: "checkbox", checked: st.replace, onchange: e => { st.replace = e.target.checked; A.rerender(); } }), h("span", {}, `清掉原本的 ${A.tt().courses.length} 堂課，改用這份`)) : null,
      ] : null,
      h("div", { class: "foot" },
        h("button", { type: "button", class: "ghost", onclick: () => { reset(); A.closeModal(); } }, "取消"),
        h("button", { type: "button", class: "primary", disabled: !isPreview || loading, onclick: confirm }, isPreview ? `確認加入 ${st.rows.length} 堂` : "確認加入")));
  }

  function button(){
    return A.h("button", { class: "ghost ttv-btn", onclick: () => { reset(); A.open(); } }, "🎤 用說的建立課表");
  }

  const css = `
.ttv{max-width:560px}
.ttv-in{display:flex;gap:8px;align-items:flex-start}
.ttv-in textarea{flex:1;min-width:0;resize:vertical;min-height:96px}
.ttv-go{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.ttv-h{font-size:15px;margin:6px 0 0}
.ttv-list{display:flex;flex-direction:column;gap:10px}
.ttv-row{display:flex;flex-direction:column;gap:6px;border:1px solid var(--line);border-radius:12px;padding:10px;background:var(--sunk)}
.ttv-line{display:flex;gap:6px;align-items:center;min-width:0}
.ttv-line select,.ttv-line input{min-width:0;width:auto}
.ttv-line .ttv-day{flex:0 0 auto;max-width:46%}
.ttv-line input[type=time]{flex:1 1 0;min-width:0;padding-inline:8px}
.ttv-dash{flex:none}
.ttv-line input[type=text]{flex:1 1 0}
.ttv-notes:empty{display:none}
.ttv-notes{display:flex;flex-direction:column;gap:2px}
.ttv-guess{border-color:var(--warn,#c2552b)!important}
.ttv-x{flex:none;width:32px;height:32px;border-radius:50%;border:1px solid var(--line);background:var(--surface);color:var(--muted);font-size:18px;line-height:1;cursor:pointer}
.ttv-x:hover{color:var(--warn,#c2552b);border-color:var(--warn,#c2552b)}
.ttv-note{margin:0;font-size:12.5px;color:var(--muted)}
.ttv-note.warn{color:var(--warn,#c2552b)}
.ttv-replace{display:flex;gap:8px;align-items:center;font-size:14px}
.ttv-replace input{width:auto}
`;
  const s = document.createElement("style"); s.textContent = css; document.head.append(s);

  window.sgTTVoice = { init(o){ A = { ...A, ...o }; }, sheet, button, parse, state: () => st };
})();
