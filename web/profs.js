/* =====================================================================
   松果「找課程／教授」（前端）
   - 搜尋框 + 兩個分段：課程（課名、課號、流水號、教師姓名）／教授（姓名、系所、研究專長）
   - 課程 → /api/ncu-courses?q=   教授 → /api/ncu-profs?q=   （資料來自學校公開網頁，伺服器每天更新一次）
   - 教授卡：姓名、職稱、系所、信箱（點了開啟寄信）、專長、「看開的課」、「到 Dcard 看評價」
   - 課程卡：課名、課號、授課教授（點名字查教授）、時間、教室、學分、課程綱要、「到 Dcard 看評價」
   - Dcard 只是開搜尋連結，不抓任何內容
   - 畫面自己管理（同一個 root 節點），index.html 重繪時不會打斷打字
   index.html 用法：PROFS.init({ lang:()=>I18N.lang })；PROFS.view() 回傳頁面內容
   ===================================================================== */
(() => {
  "use strict";
  let A = { lang: () => "zh" };
  const tr = s => (window.sgI18n ? window.sgI18n.tr(s) : s);
  const en = () => A.lang() === "en";
  let root = null, input = null, resultEl = null, tabBtns = {};
  let mode = "course", busy = false, lastKey = "";
  const courseCache = new Map();   // 教授名字 → 開的課（避免重複查）

  function el(tag, attrs, ...kids){
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})){
      if (v == null || v === false) continue;
      if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2), v);
      else if (k === "class") e.className = v; else e.setAttribute(k, v === true ? "" : v);
    }
    for (const c of kids.flat(Infinity)){ if (c == null || c === false) continue; e.append(c.nodeType ? c : document.createTextNode(String(c))); }
    return e;
  }
  const dcard = q => "https://www.dcard.tw/search?query=" + encodeURIComponent(q) + "&forum=ncu";
  const dcardBtn = q => el("a", { class: "pf-link", href: dcard(q), target: "_blank", rel: "noopener" }, tr("到 Dcard 看評價"), " ↗");
  const DAY_EN = { 一: "Mon", 二: "Tue", 三: "Wed", 四: "Thu", 五: "Fri", 六: "Sat", 日: "Sun" };
  const timeText = (t, rooms) => [(en() ? DAY_EN[t.day] : "週" + t.day), `${t.start}–${t.end}`, t.room ? (rooms[t.room] || t.room) : ""].filter(Boolean).join(" ");

  async function getJSON(url){
    const r = await fetch(url);
    let j = null; try { j = await r.json(); } catch {}
    if (!r.ok) throw new Error(j && j.code === "rate_limited" ? tr("查得太快了，請等一分鐘再試。") : tr("學校的資料暫時連不上，請稍後再試。"));
    return j;
  }

  /* ---------- 卡片 ---------- */
  function courseCard(c){
    return el("article", { class: "card pf-card" },
      el("div", { class: "pf-head" },
        el("b", { translate: "no" }, en() && c.nameEn ? c.nameEn : c.name),
        el("span", { class: "pf-code", translate: "no" }, [c.code, c.cls].filter(Boolean).join("-"))),
      el("div", { class: "pf-row" }, el("span", { class: "muted" }, tr("授課教授")), " ",
        c.teachers.length ? c.teachers.map((t, i) => [i ? "、" : "", el("button", { type: "button", class: "pf-name", translate: "no", onclick: () => search(t, "prof") }, t)]) : tr("未定")),
      el("div", { class: "pf-row" }, el("span", { class: "muted" }, tr("時間教室")), " ",
        c.times.length ? el("span", { translate: "no" }, c.times.map(t => timeText(t, c.rooms)).join("；")) : tr("未排定")),
      el("div", { class: "pf-row muted small" }, [`${c.credits} ${tr("學分")}`, tr(c.type), c.limit ? `${tr("上限")} ${c.limit}` : ""].filter(Boolean).join("・")),
      c.notes.length ? el("p", { class: "pf-note small", translate: "no" }, c.notes.join(" ")) : null,
      el("div", { class: "pf-actions" },
        c.outline ? el("a", { class: "pf-link", href: c.outline, target: "_blank", rel: "noopener" }, tr("課程綱要"), " ↗") : null,
        dcardBtn(c.name)));
  }

  function profCard(p){
    const mail = el("span", { class: "pf-mail" });
    const showMail = email => { mail.replaceChildren(email ? el("a", { href: "mailto:" + email, translate: "no" }, email) : el("span", { class: "muted" }, tr("沒有公開信箱"))); };
    if (p.email !== null && p.email !== undefined) showMail(p.email);
    else mail.append(el("button", { type: "button", class: "pf-name", onclick: async e => {
      e.currentTarget.disabled = true;
      try { showMail((await getJSON("/api/ncu-profs?id=" + encodeURIComponent(p.id))).email); } catch (err) { mail.replaceChildren(el("span", { class: "muted" }, err.message)); }
    } }, tr("顯示信箱")));
    const courses = el("div", { class: "pf-courses" });
    const loadCourses = async btn => {
      btn.disabled = true; courses.replaceChildren(el("p", { class: "muted small" }, tr("查詢中…")));
      try {
        let list = courseCache.get(p.name);
        if (!list){ list = (await getJSON("/api/ncu-courses?q=" + encodeURIComponent(p.name))).courses.filter(c => c.teachers.includes(p.name)); courseCache.set(p.name, list); }
        courses.replaceChildren(list.length
          ? el("ul", { class: "pf-list" }, list.map(c => el("li", {}, el("b", { translate: "no" }, en() && c.nameEn ? c.nameEn : c.name), " ",
              el("span", { class: "muted small", translate: "no" }, c.times.map(t => timeText(t, c.rooms)).join("；") || tr("未排定")))))
          : el("p", { class: "muted small" }, tr("這學期沒有查到開課。")));
      } catch (err) { courses.replaceChildren(el("p", { class: "muted small" }, err.message)); btn.disabled = false; }
    };
    return el("article", { class: "card pf-card" },
      el("div", { class: "pf-head" },
        el("b", { translate: "no" }, en() && p.nameEn ? p.nameEn : p.name),
        el("span", { class: "pf-code" }, en() ? p.titleEn || p.title : p.title)),
      el("div", { class: "pf-row" }, el("span", { translate: "no" }, en() ? p.deptEn || p.dept : p.dept)),
      el("div", { class: "pf-row" }, el("span", { class: "muted" }, tr("信箱")), " ", mail),
      p.keywords.length ? el("div", { class: "pf-row small muted", translate: "no" }, p.keywords.join("・")) : null,
      courses,
      el("div", { class: "pf-actions" },
        el("button", { type: "button", class: "pf-link", onclick: e => loadCourses(e.currentTarget) }, tr("看開的課")),
        el("a", { class: "pf-link", href: p.profile, target: "_blank", rel: "noopener" }, tr("教師簡歷"), " ↗"),
        dcardBtn(p.name)));
  }

  /* ---------- 搜尋 ---------- */
  async function search(q, m){
    q = String(q || "").trim().slice(0, 40);
    if (m && m !== mode){ mode = m; syncTabs(); }
    if (input && input.value !== q) input.value = q;
    if (!q || busy) return;
    const key = mode + ":" + q; if (key === lastKey && resultEl.childElementCount) return;
    busy = true; lastKey = key;
    resultEl.replaceChildren(el("p", { class: "muted", role: "status" }, tr("向學校查詢中，第一次查大約要 5–10 秒…")));
    try {
      if (mode === "course"){
        const j = await getJSON("/api/ncu-courses?q=" + encodeURIComponent(q));
        resultEl.replaceChildren(j.courses.length
          ? [el("p", { class: "muted small" }, `${tr("本學期")} ${j.courses.length} ${tr("筆")}`), ...j.courses.map(courseCard)]
          : el("p", { class: "muted" }, tr("這學期沒有查到符合的課程，換個關鍵字試試（例如課號或教授全名）。")));
      } else {
        const j = await getJSON("/api/ncu-profs?q=" + encodeURIComponent(q));
        resultEl.replaceChildren(j.profs.length
          ? [el("p", { class: "muted small" }, `${tr("共")} ${j.total} ${tr("位教授")}${j.total > j.profs.length ? `，${tr("顯示前")} ${j.profs.length} ${tr("位教授")}` : ""}`), ...j.profs.map(profCard)]
          : el("p", { class: "muted" }, tr("沒有查到符合的教授，試試全名、系所或研究專長。")));
      }
    } catch (err) {
      lastKey = "";
      resultEl.replaceChildren(el("div", { class: "info" }, err.message));
    }
    busy = false;
  }

  function syncTabs(){ for (const [k, b] of Object.entries(tabBtns)) b.setAttribute("aria-pressed", k === mode ? "true" : "false"); if (input) input.placeholder = tr(mode === "course" ? "課名、課號或教師姓名" : "教授姓名、系所或研究專長"); }

  function build(){
    input = el("input", { type: "search", class: "pf-input", maxlength: "40", enterkeyhint: "search", "aria-label": tr("搜尋") });
    resultEl = el("div", { class: "pf-results", "aria-live": "polite" },
      el("p", { class: "muted small" }, tr("資料來自中央大學課程查詢系統與教師履歷平台，每天更新一次。")));
    tabBtns = {
      course: el("button", { type: "button", onclick: () => { mode = "course"; syncTabs(); lastKey = ""; search(input.value); } }, tr("課程")),
      prof: el("button", { type: "button", onclick: () => { mode = "prof"; syncTabs(); lastKey = ""; search(input.value); } }, tr("教授")),
    };
    root = el("div", { class: "stack pf-page" },
      el("div", { class: "sphead" }, el("h1", {}, tr("找課程／教授"))),
      el("form", { class: "card pf-form", onsubmit: e => { e.preventDefault(); lastKey = ""; search(input.value); } },
        el("div", { class: "lang-row pf-tabs" }, tabBtns.course, tabBtns.prof),
        el("div", { class: "pf-bar" }, input, el("button", { type: "submit", class: "primary" }, tr("搜尋")))),
      resultEl);
    syncTabs();
  }
  let builtLang = "";
  function view(){
    if (!root || builtLang !== A.lang()){   // 第一次或切換語言：重建畫面，保留搜尋字與分段
      const q = input ? input.value : "";
      build(); builtLang = A.lang(); lastKey = "";
      if (q) search(q);
    }
    return root;
  }

  const css = `
.pf-form{display:flex;flex-direction:column;gap:10px}
.pf-bar{display:flex;gap:8px}
.pf-input{flex:1;min-width:0;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:var(--bg);color:var(--ink);font-size:16px}
.pf-results{display:flex;flex-direction:column;gap:10px}
.pf-card{display:flex;flex-direction:column;gap:6px;overflow-wrap:anywhere}
.pf-head{display:flex;justify-content:space-between;align-items:baseline;gap:8px}
.pf-head b{font-size:16px;color:var(--ink)}
.pf-code{font-size:13px;color:var(--muted);white-space:nowrap}
.pf-row{font-size:14px;color:var(--ink)}
.pf-note{margin:0;color:var(--muted)}
.pf-name{background:none;border:0;padding:0;color:var(--pine);font:inherit;text-decoration:underline;cursor:pointer}
.pf-mail a{color:var(--pine)}
.pf-actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:2px}
.pf-link{background:none;border:0;padding:0;color:var(--pine);font:inherit;font-size:14px;font-weight:600;cursor:pointer;text-decoration:none}
.pf-link:disabled{color:var(--muted);cursor:default}
.pf-list{margin:0;padding-left:18px;display:flex;flex-direction:column;gap:4px;font-size:14px}
`;
  const s = document.createElement("style"); s.textContent = css; document.head.append(s);
  window.sgProfs = { init(o){ A = { ...A, ...o }; }, view, search };
})();
