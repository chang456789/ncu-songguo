/* =====================================================================
   松果 暱稱不重複＋我的紀錄（前端）
   ① 暱稱不重複
     - 取名、改名時先「登記」：寫入 nicknames/<key>，key＝正規化後的暱稱（全形轉半形、去空白、轉小寫）。
     - 資料庫規則（supabase/schema.sql）保證同一個 key 只能屬於一個人：別人登記過的名字寫不進去 → 提示換一個。
     - 改名後舊名字不刪除，仍然屬於原本的人，他改回來時不會被別人搶走。
     - 名字使用紀錄存在 data/users/<uid>/names（只有本人看得到），「我的紀錄」可以看。
   ② 我的紀錄（#/mine）：我的貼文、我的留言、我的拼車、我用過的名字
     - 一律用 uid（資料表的 owner＝自己）查，不看暱稱，所以改名後舊紀錄都還在。
   index.html 用法：
     MINE.init({ h, db:()=>S.db, uid:()=>S.uid, tr, … })
     await MINE.claim("小松鼠")   // "ok" | "taken" | "limit" | "short" | "offline" | "error"
     MINE.record("小松鼠")        // 記到名字使用紀錄（claim 成功後呼叫）
     MINE.page()                  // 「我的紀錄」頁
   ===================================================================== */
(() => {
  "use strict";
  let A = { h: null, db: () => null, uid: () => null, tr: s => s, rerender: () => {}, openPost: () => {}, goRides: () => {}, spaceLabel: () => "", ago: () => "",
    postTitle: () => null, nick: () => "", rideById: () => null };

  const key = nick => String(nick || "").normalize("NFKC").replace(/\s+/g, "").replace(/\//g, "∕").toLowerCase();

  /* ---------- ① 暱稱登記 ---------- */
  async function claim(nick){
    const k = key(nick);
    if (k.length < 2) return "short";
    const db = A.db(), uid = A.uid();
    if (!db || !uid) return "offline";      // 資料庫還沒連上：先讓使用者進站，連上後 index.html 會再登記一次
    const ref = db.doc("nicknames/" + k);
    try { const cur = await ref.get(); if (cur.exists) return "ok"; } catch {}   // 已經是我的（別人的名字讀不到）
    try { await ref.set({ key: k, uid, ts: Date.now() }); return "ok"; }
    catch (e){
      if (e && e.code === "resource_exhausted") return "limit";
      if (e && e.code === "invalid_argument") return "taken";
      return "error";
    }
  }
  const CLAIM_MSG = {
    taken: "這個暱稱已經有人用了，請換一個。",
    limit: "改名太頻繁了，請過一陣子再試。",
    short: "暱稱至少要 2 個字。",
    error: "暫時無法確認暱稱，請稍後再試。",
  };

  // 名字使用紀錄：[{ nick, ts }]，最新的在最後，最多 50 筆
  async function history(){
    const db = A.db(), uid = A.uid(); if (!db || !uid) return [];
    try { const s = await db.doc(`data/users/${uid}/names`).get(); const d = s.exists ? s.data() : null; return d && Array.isArray(d.list) ? d.list : []; }
    catch { return []; }
  }
  async function record(nick){
    const db = A.db(), uid = A.uid(); if (!db || !uid || !nick) return;
    const list = await history();
    if (list.length && list[list.length - 1].nick === nick) return;
    list.push({ nick, ts: Date.now() });
    try { await db.doc(`data/users/${uid}/names`).set({ list: list.slice(-50) }); } catch {}
    if (rec.names) rec.names = list.slice(-50);
  }

  /* ---------- ② 我的紀錄 ---------- */
  const rec = { tab: "posts", loading: false, at: 0, posts: null, comments: null, rides: null, joined: null, names: null, err: false };
  async function load(force){
    const db = A.db(); if (!db || !db.mine || rec.loading) return;
    if (!force && rec.at && Date.now() - rec.at < 60e3) return;
    rec.loading = true; rec.err = false;
    try {
      const [posts, comments, rides, joined, names] = await Promise.all([db.mine("posts"), db.mine("%/comments"), db.mine("rides"), db.mine("riders"), history()]);
      Object.assign(rec, { posts, comments, rides, joined, names, at: Date.now() });
    } catch { rec.err = true; }
    rec.loading = false; A.rerender();
  }

  function page(){
    const h = A.h; load(false);
    const TABS = [["posts", "貼文"], ["comments", "留言"], ["rides", "拼車"], ["names", "用過的名字"]];
    const t = rec.tab;
    const row = (title, sub, onclick, userTitle) => h(onclick ? "button" : "div", { class: "mine-row", onclick },
      h("b", userTitle ? { translate: "no" } : {}, title), sub ? h("span", { class: "small muted" }, sub) : null);
    let body;
    if (!A.db() || !A.db().mine) body = h("p", { class: "muted small" }, "連上松果後才看得到你的紀錄。");
    else if (rec.err) body = h("p", { class: "muted small" }, "暫時讀不到你的紀錄，請稍後再試。", h("button", { class: "linkbtn", onclick: () => load(true) }, "再試一次"));
    else if (rec[t === "rides" ? "rides" : t] == null) body = h("p", { class: "muted small", role: "status" }, "載入中…");
    else if (t === "posts") body = rec.posts.length ? rec.posts.map(p => row(p.data.title || String(p.data.body || "").slice(0, 40) || "（無標題）",
        [A.spaceLabel(p.data.space), "・", A.ago(p.data.ts), p.data.nick ? ["・以「", h("span", { translate: "no" }, p.data.nick), "」發布"] : null], () => A.openPost(p.id), true))
      : h("p", { class: "muted small" }, "你還沒有發過貼文。");
    else if (t === "comments") body = rec.comments.length ? rec.comments.map(c => { const pid = c.collection.split("/")[1]; const title = A.postTitle(pid);
        return row(String(c.data.body || "").slice(0, 60) || "（空白留言）", [title ? ["留言在「", h("span", { translate: "no" }, title), "」"] : "留言在已刪除的貼文", "・", A.ago(c.data.ts)],
          title ? () => A.openPost(pid) : null, true); })
      : h("p", { class: "muted small" }, "你還沒有留過言。");
    else if (t === "rides"){
      const all = [...rec.rides.map(r => ({ r: r.data, id: r.id, mine: true })), ...rec.joined.filter(x => !rec.rides.some(r => r.id === x.data.ride)).map(x => ({ r: A.rideById(x.data.ride) || {}, id: x.data.ride, mine: false }))];
      body = all.length ? all.map(x => row(x.r.from ? [h("span", {}, x.r.from), " → ", h("span", {}, x.r.to || "?")] : "（已結束或取消的團）", [x.mine ? "我開的團" : "我加入的團", x.r.when ? ["・", String(x.r.when).replace("T", " ").slice(0, 16)] : null], () => A.goRides(), false))
        : h("p", { class: "muted small" }, "你還沒有開過或加入過拼車。");
    } else {
      const list = (rec.names || []).slice().reverse();
      body = [h("p", { class: "muted small", style: "margin:0" }, "只有你自己看得到。改名後，舊名字仍然保留給你，別人不能使用；你的貼文、留言、拼車紀錄也都還在。"),
        list.length ? list.map((n, i) => row(n.nick, i === 0 && n.nick === A.nick() ? "現在的名字" : (d => `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`)(new Date(n.ts)), null, true))
          : row(A.nick() || "—", "現在的名字", null, true)];
    }
    return h("div", { class: "stack" },
      h("div", { class: "sphead" }, h("h1", {}, "我的紀錄"), h("p", {}, "用你的帳號（不是暱稱）查，改名後舊紀錄都還在。只有你自己看得到這一頁。")),
      h("div", { class: "seg mine-seg" }, TABS.map(([k, l]) => h("button", { "aria-pressed": t === k ? "true" : "false", onclick: () => { rec.tab = k; A.rerender(); } }, l))),
      h("section", { class: "card mine-list" }, body));
  }

  const css = `
.mine-list{display:flex;flex-direction:column;gap:2px;padding:8px}
.mine-row{display:flex;flex-direction:column;gap:2px;text-align:left;background:none;border:0;border-radius:10px;padding:10px;color:var(--ink);font:inherit;width:100%;min-width:0}
button.mine-row{cursor:pointer}
button.mine-row:hover{background:var(--hover,var(--sunk))}
.mine-row b{font-size:15px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mine-row span{overflow-wrap:anywhere}
.mine-seg{overflow-x:auto}
`;
  const s = document.createElement("style"); s.textContent = css; document.head.append(s);

  window.sgMine = { init(o){ A = { ...A, ...o }; }, key, claim, record, history, page, reload: () => load(true), message: r => CLAIM_MSG[r] || null };
})();
