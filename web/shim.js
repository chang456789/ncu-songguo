/* =====================================================================
   松果資料層：把 Supabase 包成 app 使用的 claude.use("db" | "user" | "room") 介面。
   - db   : Firestore 風格的 collection / doc / where / orderBy / limit / onSnapshot
   - user : 匿名登入後的使用者 ID、是否為管理員
   - room : 線上名單（Supabase Realtime Presence）
   ===================================================================== */
(() => {
  "use strict";
  const CFG = window.SONGGUO_CONFIG || {};
  const ready = (async () => {
    if (!window.supabase || !CFG.supabaseUrl || !CFG.supabaseAnonKey || CFG.supabaseUrl.includes("YOUR-PROJECT")) {
      console.warn("[songguo] 尚未設定 Supabase（web/config.js）"); return null;
    }
    const sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: "songguo-auth" },
      realtime: { params: { eventsPerSecond: 10 } },
    });
    let { data: { session } } = await sb.auth.getSession();
    if (!session) {
      const opts = {};
      if (CFG.turnstileToken) opts.options = { captchaToken: await CFG.turnstileToken() };
      const res = await sb.auth.signInAnonymously(opts);
      if (res.error) { console.error("[songguo] 匿名登入失敗", res.error); return null; }
      session = res.data.session;
    }
    const uid = session.user.id;
    let admin = false;
    try { const r = await sb.from("admins").select("uid").eq("uid", uid).maybeSingle(); admin = !!r.data; } catch {}
    return { sb, uid, admin };
  })();

  /* ---------- errors → codes the app understands ---------- */
  function mapErr(e) {
    const msg = (e && (e.message || e.hint || "")) + "";
    if (/rate_limited/.test(msg)) return { code: "resource_exhausted", message: "too many writes" };
    if (e && (e.code === "42501" || /row-level security|permission/i.test(msg))) return { code: "invalid_argument", message: msg };
    if (e && e.code === "23514") return { code: "invalid_argument", message: msg };
    return { code: "unavailable", message: msg || "network" };
  }
  const randId = () => (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, "") : Math.random().toString(36).slice(2) + Date.now().toString(36)).slice(0, 20);
  const splitPath = p => { const i = p.lastIndexOf("/"); return { collection: p.slice(0, i), id: p.slice(i + 1) }; };
  const deepMerge = (a, b) => { const o = { ...a }; for (const k in b) o[k] = b[k] && typeof b[k] === "object" && !Array.isArray(b[k]) && a && typeof a[k] === "object" ? deepMerge(a[k], b[k]) : b[k]; return o; };
  const snapDoc = (id, row) => ({ id, exists: !!row, data: () => row ? row.data : undefined, metadata: { fromCache: false, hasPendingWrites: false } });

  /* ---------- realtime: one channel per collection, shared by listeners ---------- */
  function makeDb(ctx) {
    const { sb } = ctx;
    const chans = new Map(); // collection -> { listeners:Set, ch, poll }
    // Realtime filters do not apply to DELETE events, so one unfiltered channel routes deletes by path.
    sb.channel("deletes:" + randId())
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "docs" }, payload => {
        const p = payload.old && payload.old.path; if (!p) return;
        const w = chans.get(splitPath(p).collection); if (w) w.fireNow();
      }).subscribe();
    function watch(collection, fn) {
      let w = chans.get(collection);
      if (!w) {
        w = { listeners: new Set(), ch: null, poll: null, t: null };
        const fire = () => { clearTimeout(w.t); w.t = setTimeout(() => w.listeners.forEach(f => f()), 120); };
        w.fireNow = fire;
        w.ch = sb.channel("c:" + collection + ":" + randId())
          .on("postgres_changes", { event: "INSERT", schema: "public", table: "docs", filter: `collection=eq.${collection}` }, fire)
          .on("postgres_changes", { event: "UPDATE", schema: "public", table: "docs", filter: `collection=eq.${collection}` }, fire)
          .subscribe(status => {
            if (status === "SUBSCRIBED") { clearInterval(w.poll); w.poll = null; }
            else if ((status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") && !w.poll) w.poll = setInterval(fire, 30000);
          });
        chans.set(collection, w);
      }
      w.listeners.add(fn);
      return () => { w.listeners.delete(fn); if (!w.listeners.size) { sb.removeChannel(w.ch); clearInterval(w.poll); chans.delete(collection); } };
    }

    function query(collection, q = { where: [], order: null, limit: null }) {
      const run = async () => {
        let r = sb.from("docs").select("doc_id,data").eq("collection", collection);
        for (const [f, op, v] of q.where) {
          const col = `data->>${f}`;
          if (op === "==") r = r.eq(col, String(v)); else if (op === "!=") r = r.neq(col, String(v));
          else if (op === "in") r = r.in(col, v.map(String)); else if (op === ">") r = r.gt(col, v); else if (op === ">=") r = r.gte(col, v);
          else if (op === "<") r = r.lt(col, v); else if (op === "<=") r = r.lte(col, v);
          else if (op === "array-contains") r = r.contains(`data->${f}`, JSON.stringify([v]));
        }
        r = q.order ? r.order(`data->${q.order[0]}`, { ascending: q.order[1] !== "desc", nullsFirst: false }) : r.order("doc_id");
        r = r.limit(q.limit || 1000);
        const { data, error } = await r;
        if (error) throw mapErr(error);
        const docs = data.map(row => snapDoc(row.doc_id, row));
        return { docs, size: docs.length, empty: !docs.length, docChanges: () => docs.map((d, i) => ({ type: "added", doc: d, oldIndex: -1, newIndex: i })), metadata: { fromCache: false, hasPendingWrites: false } };
      };
      const api = {
        where: (f, op, v) => query(collection, { ...q, where: [...q.where, [f, op, v]] }),
        orderBy: (f, dir) => query(collection, { ...q, order: [f, dir || "asc"] }),
        limit: n => query(collection, { ...q, limit: n }),
        get: run,
        onSnapshot(next, onErr) {
          let alive = true;
          const tick = () => run().then(s => alive && next(s)).catch(e => alive && onErr && onErr(e));
          tick();
          const un = watch(collection, tick);
          return () => { alive = false; un(); };
        },
      };
      return api;
    }

    function doc(path) {
      const { collection, id } = splitPath(path);
      const get = async () => {
        const { data, error } = await sb.from("docs").select("doc_id,data").eq("path", path).maybeSingle();
        if (error) throw mapErr(error);
        return snapDoc(id, data);
      };
      return {
        id, path,
        get,
        async set(data) {
          const { error } = await sb.from("docs").upsert({ path, collection, doc_id: id, data }, { onConflict: "path" });
          if (error) throw mapErr(error);
        },
        async update(patch) {
          const cur = await get();
          if (!cur.exists) throw { code: "invalid_argument", message: "missing" };
          const { data, error } = await sb.from("docs").update({ data: deepMerge(cur.data(), patch) }).eq("path", path).select("path");
          if (error) throw mapErr(error);
          if (!data || !data.length) throw { code: "invalid_argument", message: "not allowed" };
        },
        async delete() {
          const { error } = await sb.from("docs").delete().eq("path", path);
          if (error) throw mapErr(error);
        },
        onSnapshot(next, onErr) {
          let alive = true;
          const tick = () => get().then(s => alive && next(s)).catch(e => alive && onErr && onErr(e));
          tick();
          const un = watch(collection, tick);
          return () => { alive = false; un(); };
        },
        collection: sub => collectionRef(path + "/" + sub),
      };
    }
    function collectionRef(collection) {
      return Object.assign(query(collection), {
        path: collection,
        doc: id => doc(collection + "/" + (id || randId())),
        add: async data => { const d = doc(collection + "/" + randId()); await d.set(data); return d; },
      });
    }
    return { doc, collection: collectionRef };
  }

  function makeUser(ctx) {
    return {
      id: async () => ctx.uid,
      me: async () => ({ id: ctx.uid }),
      isOwner: () => ctx.admin,
      canEdit: async () => ctx.admin,
      can: async () => true,
      profiles: async () => ({}),
    };
  }

  function makeRoom(ctx) {
    const { sb, uid } = ctx;
    const peerId = randId();
    let mine = {};
    let handlers = new Set(); let peers = [];
    const ch = sb.channel("presence:lobby", { config: { presence: { key: peerId } } });
    const rebuild = () => {
      const st = ch.presenceState();
      peers = Object.entries(st).map(([key, metas]) => {
        const m = metas[metas.length - 1] || {};
        return { peer: key, by: m.uid || null, isMe: m.uid === uid, sameTab: key === peerId, kind: "viewer", guest: false, presence: m.p || {}, updatedAt: m.at || 0 };
      });
      handlers.forEach(f => f({ peers, joined: [], left: [], updated: [] }));
    };
    ch.on("presence", { event: "sync" }, rebuild).subscribe(status => { if (status === "SUBSCRIBED") ch.track({ uid, p: mine, at: Date.now() }); });
    return {
      presence: async patch => { mine = { ...mine, ...patch }; for (const k in mine) if (mine[k] == null) delete mine[k]; await ch.track({ uid, p: mine, at: Date.now() }); },
      peers: () => peers,
      onPeers: (fn) => { handlers.add(fn); fn({ peers, joined: [], left: [], updated: [] }); return () => handlers.delete(fn); },
      emit: async () => {}, on: () => () => {},
    };
  }

  const cache = {};
  window.claude = {
    async use(name) {
      const ctx = await ready; if (!ctx) return null;
      if (cache[name]) return cache[name];
      if (name === "db") return (cache.db = makeDb(ctx));
      if (name === "user") return (cache.user = makeUser(ctx));
      if (name === "room") return (cache.room = makeRoom(ctx));
      return null;
    },
  };
  window.songguoReady = ready;
})();
