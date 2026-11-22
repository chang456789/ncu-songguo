/* =====================================================================
   松果 AI 使用數據（前端）
   - 每次網站呼叫 AI（/api/ai-*，以及活動空檔媒合 POST /api/events），就在 Supabase 的 aistats 寫一筆：
       { f: 功能名稱, ok: 成功與否, ms: 耗時（毫秒）, ts: 時間 }
     只記這四個欄位，不記問題、回答或任何內容。
   - 為什麼在瀏覽器記：伺服器沒有使用者身分，也不能放 Supabase 的 service key（規則 2），
     所以由送出請求的瀏覽器在拿到回應後寫入（資料庫的防洗版上限：每人每小時 200 筆）。
   - 「我的 → 松果 AI 數據」頁面讀這些紀錄，算出各功能的使用次數、成功率、平均回應時間。
   index.html 用法：AISTATS.init({ db:()=>S.db, uid:()=>S.uid, canWrite:()=>... })；AISTATS.load()；AISTATS.summary()
   注意：這個檔案要在其他會呼叫 AI 的檔案之前載入。
   ===================================================================== */
(() => {
  "use strict";
  let A = { db: () => null, uid: () => null, canWrite: () => true, onChange: () => {} };
  const queue = [];
  const origFetch = window.fetch.bind(window);

  // 功能名稱：網址＋（task 或 step），例如 ai-agent:route、ai-ride:commute_advisor
  function featureOf(path, init){
    let sub = "";
    try { const b = JSON.parse(init && typeof init.body === "string" ? init.body : "{}"); sub = b.task || b.step || ""; } catch {}
    const name = path.replace(/^\/api\//, "");
    return (sub ? `${name}:${sub}` : name).slice(0, 40);
  }
  function isAI(url, init){
    let u; try { u = new URL(url, location.href); } catch { return null; }
    if (u.origin !== location.origin) return null;
    if (/^\/api\/ai-/.test(u.pathname)) return u.pathname;
    if (u.pathname === "/api/events" && String((init && init.method) || "GET").toUpperCase() === "POST") return u.pathname;
    return null;
  }
  window.fetch = async function(input, init){
    const path = isAI(typeof input === "string" ? input : input && input.url, init);
    if (!path) return origFetch(input, init);
    const f = featureOf(path, init), t0 = performance.now();
    try { const r = await origFetch(input, init); record(f, r.ok, performance.now() - t0); return r; }
    catch (e) { record(f, false, performance.now() - t0); throw e; }
  };

  function record(f, ok, ms){ queue.push({ f, ok: !!ok, ms: Math.max(0, Math.round(ms)), ts: Date.now() }); if (queue.length > 100) queue.shift(); flush(); }
  let flushing = false;
  async function flush(){
    const db = A.db(); if (flushing || !db || !A.uid() || A.canWrite() === false) return;
    flushing = true;
    while (queue.length){ const x = queue.shift(); try { await db.collection("aistats").add(x); } catch { /* 寫不進去（例如超過上限）就算了，不影響使用 */ } }
    flushing = false;
  }

  // ---------- 統計 ----------
  let stats = { status: "idle", rows: [], at: 0 };
  async function load(){
    const db = A.db(); if (!db){ stats = { status: "error", rows: [], at: Date.now() }; A.onChange(); return; }
    stats = { ...stats, status: "loading" }; A.onChange();
    try {
      const snap = await db.collection("aistats").orderBy("ts", "desc").limit(2000).get();
      stats = { status: "ok", rows: snap.docs.map(d => d.data()).filter(x => x && typeof x.f === "string"), at: Date.now() };
    } catch { stats = { status: "error", rows: [], at: Date.now() }; }
    A.onChange();
  }
  function summary(){
    const by = new Map();
    for (const x of stats.rows){ const g = by.get(x.f) || { f: x.f, n: 0, ok: 0, ms: 0 }; g.n++; if (x.ok) g.ok++; g.ms += +x.ms || 0; by.set(x.f, g); }
    const list = [...by.values()].map(g => ({ ...g, rate: g.n ? g.ok / g.n : 0, avg: g.n ? g.ms / g.n : 0 })).sort((a, b) => b.n - a.n);
    const n = stats.rows.length, ok = stats.rows.filter(x => x.ok).length, ms = stats.rows.reduce((t, x) => t + (+x.ms || 0), 0);
    const since = n ? Math.min(...stats.rows.map(x => x.ts || Date.now())) : null;
    return { status: stats.status, total: n, rate: n ? ok / n : 0, avg: n ? ms / n : 0, list, since };
  }

  // init 不立刻寫入：網站狀態還沒建好；資料庫連上時 index.html 會呼叫 flush()
  window.sgAIStats = { init(o){ A = { ...A, ...o }; }, flush, load, summary, _queue: queue };
})();
