/* =====================================================================
   松果 通知中心（前端，用現有資料計算，不新增資料庫的表）
   - 頂部小鈴鐺，集中顯示：私訊請求、有人加入你的拼車團、你「想去」的活動 1 小時內開始、你的貼文有新留言
   - 鈴鐺上顯示未讀數字；已讀狀態存在 LocalStorage（pc.notif.read）
   - 第一次使用前就有的舊留言、舊加入紀錄不算未讀（pc.notif.since），避免一打開就跳出一堆
   index.html 用法：
     NOTIFY.init({ items:()=>[{ id, ts, kind, icon, text, sub, user, action, sticky }], tr, translate, onChange })
     NOTIFY.bell()   // 頂部的鈴鐺按鈕（含未讀數字）
   ===================================================================== */
(() => {
  "use strict";
  let A = { items: () => [], tr: s => s, translate: () => {}, onChange: () => {} };
  const t = s => A.tr(s);
  const KEY = "pc.notif.read", SINCE = "pc.notif.since", MAX = 400;
  const LS = { get(k){ try { return localStorage.getItem(k); } catch { return null; } }, set(k, v){ try { localStorage.setItem(k, v); } catch {} } };
  let read = new Set(); try { read = new Set(JSON.parse(LS.get(KEY) || "[]")); } catch {}
  let since = +LS.get(SINCE) || 0; if (!since){ since = Date.now(); LS.set(SINCE, String(since)); }
  const save = () => LS.set(KEY, JSON.stringify([...read].slice(-MAX)));
  // sticky：私訊請求、快開始的活動，需要處理的事不受「第一次使用前」影響
  const isUnread = it => !read.has(it.id) && (it.sticky || it.ts >= since);

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
  const list = () => { try { return A.items().filter(Boolean).sort((a, b) => b.ts - a.ts).slice(0, 40); } catch (e) { console.error("notify items", e); return []; } };
  const unreadCount = () => list().filter(isUnread).length;
  function ago(ts){
    const d = Date.now() - ts;
    if (d < 0) return [Math.max(1, Math.round(-d / 60e3)), " 分鐘後"];
    if (d < 60e3) return ["剛剛"]; if (d < 3600e3) return [Math.round(d / 60e3), " 分鐘前"];
    if (d < 86400e3) return [Math.round(d / 3600e3), " 小時前"]; return [Math.round(d / 86400e3), " 天前"];
  }

  function bell(){
    const n = unreadCount();
    return el("button", { type: "button", class: "iconbtn nt-bell", title: t("通知"), "aria-label": n ? `${t("通知")} (${n})` : t("通知"), onclick: open },
      el("span", { class: "nt-ico", "aria-hidden": "true" }), n ? el("span", { class: "badge" }, n > 99 ? "99+" : n) : null);
  }

  // { user: "…" } 是使用者寫的內容（暱稱、標題、留言），不要被翻譯
  const frag = x => typeof x === "object" && x && x.user != null ? el("span", { translate: "no" }, x.user) : x;
  let box = null;
  function open(){
    const items = list();
    const fresh = new Set(items.filter(isUnread).map(i => i.id));
    // 打開就全部標為已讀；這次打開時是新的，列表上仍標一個點
    for (const i of items) read.add(i.id); save(); A.onChange();
    if (box) box.remove();
    const row = it => el("button", { type: "button", class: "nt-item" + (fresh.has(it.id) ? " new" : ""), onclick: () => { close(); it.action && it.action(); } },
      el("span", { class: "nt-kind " + it.kind, "aria-hidden": "true" }, it.icon || "•"),
      el("span", { class: "nt-txt" }, el("b", {}, it.text.map(frag)),
        el("small", {}, it.sub ? [frag(it.sub), "・"] : null, ago(it.ts))),
      fresh.has(it.id) ? el("i", { class: "nt-dot", "aria-label": t("新") }) : null);
    box = el("div", { class: "nt-scrim", onclick: e => { if (e.target === box) close(); } },
      el("div", { class: "nt-box", role: "dialog", "aria-modal": "true", "aria-label": t("通知") },
        el("div", { class: "nt-head" }, el("b", {}, t("通知")), el("button", { type: "button", class: "linkbtn", onclick: close }, t("關閉"))),
        items.length ? el("div", { class: "nt-list" }, items.map(row)) :
          el("p", { class: "nt-empty" }, t("目前沒有通知。有人私訊你、加入你的拼車、留言給你，或你想去的活動快開始時，會出現在這裡。"))));
    box.addEventListener("keydown", e => { if (e.key === "Escape") close(); });
    document.body.append(box); A.translate(box);
    const first = box.querySelector(".nt-head .linkbtn"); if (first) first.focus({ preventScroll: true });
  }
  function close(){ if (box){ box.remove(); box = null; } }

  const css = `
.nt-bell .nt-ico{width:20px;height:20px;background:currentColor;-webkit-mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0'/%3E%3C/svg%3E") center/contain no-repeat;mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0'/%3E%3C/svg%3E") center/contain no-repeat}
.nt-scrim{position:fixed;inset:0;z-index:45;background:rgba(10,15,12,.35);display:flex;justify-content:flex-end;align-items:flex-start;padding:60px 16px 16px}
.nt-box{background:var(--surface);color:var(--ink);border-radius:16px;width:100%;max-width:400px;max-height:75vh;display:flex;flex-direction:column;box-shadow:0 12px 40px rgba(0,0,0,.28);overflow:hidden}
.nt-head{display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid var(--line)}
.nt-head b{font-size:17px}
.nt-list{overflow-y:auto;padding:6px;display:flex;flex-direction:column;overscroll-behavior:contain}
.nt-item{display:flex;align-items:flex-start;gap:10px;width:100%;text-align:left;background:none;border:0;border-radius:12px;padding:10px;cursor:pointer;color:var(--ink);font:inherit}
.nt-item:hover{background:var(--sunk)}
.nt-item.new{background:var(--pine-soft)}
.nt-kind{flex:none;width:34px;height:34px;border-radius:50%;display:grid;place-items:center;background:var(--sunk);font-size:16px}
.nt-txt{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.nt-txt b{font-size:14px;font-weight:600;line-height:1.4;overflow-wrap:anywhere}
.nt-txt small{font-size:12.5px;color:var(--muted)}
.nt-dot{flex:none;width:9px;height:9px;border-radius:50%;background:var(--pine);margin-top:6px}
.nt-empty{margin:0;padding:24px 18px;color:var(--muted);font-size:14px;line-height:1.6}
@media (max-width:720px){.nt-scrim{padding:0;align-items:flex-end}.nt-box{max-width:none;border-radius:16px 16px 0 0;max-height:80vh;padding-bottom:env(safe-area-inset-bottom,0px)}}
`;
  const st = document.createElement("style"); st.textContent = css; document.head.append(st);
  window.sgNotify = { init(o){ A = { ...A, ...o }; }, bell, open, close, unreadCount, _list: list };
})();
