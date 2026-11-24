/* =====================================================================
   松果 v3 動態像素角色（需要 web/pixel.js）
   1. 散步：松鼠偶爾從畫面下緣走過；點牠會跳一下、說一句話（隨機 10 句，中英文）。
   2. 操作反應：按讚跳出愛心松果、發文成功放煙火（下拉更新時松鼠盪鞦韆在 web/ui.js）。
   3. 分頁角色：交通＝公車開過、地圖＝松鼠揮地圖、社群＝小鳥飛過、我的＝松鼠翻書（畫在橫幅裡，不會擋到按鈕和文字）。
   4. 彩蛋：連點松鼠 5 下有隱藏動畫；聖誕節、跨年、期末考週自動換裝（換裝在 web/pixel.js）。
   規則：同一個畫面同時最多 1 個角色在動；開啟「減少動態效果」時全部停止。
   index.html 用法：CR.init({ tr, translate, lang })；CR.like(按讚的按鈕)；CR.fireworks()
   ===================================================================== */
(() => {
  "use strict";
  const PX = () => window.sgPixel;
  const reduced = () => !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
  const off = () => reduced() || window.__noCritters || !PX();
  let app = { tr: s => s, translate: () => {}, lang: () => "zh" };
  const SAYINGS = ["今天也要記得喝水喔！", "132 公車來了嗎？", "中大湖的鵝今天很兇…", "後門宵夜吃什麼好呢？", "期末加油，你可以的！",
    "我在找我的松果…", "下雨記得帶傘 ☔", "早八好想睡…", "要不要一起揪團？", "松果超好吃的！"];

  function el(tag, cls, ...kids){ const e = document.createElement(tag); if (cls) e.className = cls; e.append(...kids.filter(Boolean)); return e; }

  /* ---------- 協調：同一時間只有一個角色在動 ---------- */
  let active = null, activeT = 0;
  function claim(id, ms){
    if (off() || (active && active !== id)) return false;
    active = id; clearTimeout(activeT); activeT = setTimeout(() => { if (active === id) active = null; }, ms);
    return true;
  }
  function release(id){ if (active === id){ active = null; clearTimeout(activeT); } }
  function stopAll(){ endWalk(); for (const b of document.querySelectorAll(".px-banner.play")) b.classList.remove("play"); active = null; }
  const busyUI = () => document.hidden || document.querySelector(".scrim, .ai-panel:not([hidden]), .ph-viewer, .px-splash") || document.body.classList.contains("kb-open");

  /* ---------- 3. 分頁角色：讓目前分頁的橫幅動一次 ---------- */
  const PLAY_MS = { transit: 5200, map: 2600, community: 4200, me: 3000 };
  function playBanner(){
    const b = document.querySelector(".px-banner-transit, .px-banner-map, .px-banner-community, .px-banner-me");
    if (!b || busyUI()) return;
    const r = b.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight) return;   // 看不到就不動
    const kind = [...b.classList].find(c => c.startsWith("px-banner-")).slice(10), ms = PLAY_MS[kind] || 3000;
    if (!claim("banner", ms + 100)) return;
    b.classList.add("play");
    setTimeout(() => { b.classList.remove("play"); release("banner"); }, ms);
  }

  /* ---------- 1. 散步的松鼠 ---------- */
  let walker = null;
  function endWalk(){ if (walker){ walker.remove(); walker = null; release("walk"); } }
  function walk(){
    if (busyUI() || walker) return;
    const WALK_MS = 9000; if (!claim("walk", WALK_MS + 200)) return;
    const nav = document.querySelector("nav.bottom"), navH = nav && getComputedStyle(nav).display !== "none" ? nav.getBoundingClientRect().height : 0;
    const right = Math.random() < .5;
    walker = el("button", "cr-walker" + (right ? "" : " left"));
    walker.type = "button"; walker.setAttribute("aria-label", app.tr("松鼠"));
    walker.append(PX().sprite("walk1", { size: 40, cls: "cr-w1" }), PX().sprite("walk2", { size: 40, cls: "cr-w2" }));
    walker.style.bottom = (navH ? navH - 6 : 4) + "px";
    walker.style.setProperty("--cr-walk-ms", WALK_MS + "ms");
    document.body.append(walker);
    const me = walker; setTimeout(() => { if (walker === me) endWalk(); }, WALK_MS);
  }
  function say(host, text, ms = 2200){
    const b = el("span", "cr-say", app.tr(text)); b.setAttribute("role", "status");
    host.append(b); app.translate(b); setTimeout(() => b.remove(), ms);
  }

  /* ---------- 4. 彩蛋：連點松鼠 5 下 ---------- */
  let taps = [];
  document.addEventListener("click", e => {
    const sq = e.target.closest && e.target.closest(".cr-walker, #hero .px-hero-art, .wl-hero .px-hero-art");
    if (!sq || off()) return;
    const now = Date.now(); taps = taps.filter(t => now - t < 2500); taps.push(now);
    if (taps.length >= 5){ taps = []; secret(sq); return; }
    const host = sq.closest(".cr-walker") || sq.parentElement;
    host.classList.remove("cr-jump"); void host.offsetWidth; host.classList.add("cr-jump");
    if (sq.closest(".cr-walker")){ say(sq.closest(".cr-walker"), SAYINGS[Math.floor(Math.random() * SAYINGS.length)]); }
  }, true);
  function secret(sq){
    stopAll(); active = "secret";
    const host = sq.closest(".cr-walker") || sq.parentElement;
    host.classList.add("cr-spin");
    const rain = el("div", "cr-rain"); rain.setAttribute("aria-hidden", "true");
    for (let i = 0; i < 18; i++){ const c = PX().sprite(i % 3 ? "heartcone" : "normal", { size: i % 3 ? 48 : 36, cls: "cr-drop" });
      c.style.left = (Math.random() * 96) + "vw"; c.style.animationDelay = (Math.random() * .9).toFixed(2) + "s"; rain.append(c); }
    const msg = el("div", "cr-secret", app.tr("你找到隱藏彩蛋了！🎉")); msg.setAttribute("role", "status");
    document.body.append(rain, msg); app.translate(msg);
    setTimeout(() => { rain.remove(); msg.remove(); host.classList.remove("cr-spin"); active = null; }, 2600);
  }

  /* ---------- 2. 操作反應 ---------- */
  function like(btn){
    if (off() || !btn) return;
    if (btn.getAttribute("aria-pressed") === "true") return;   // 取消讚不放愛心
    stopAll();
    const r = btn.getBoundingClientRect();
    const h = el("div", "cr-heart"); h.setAttribute("aria-hidden", "true");
    h.append(PX().sprite("heartcone", { size: 64 }));
    h.style.left = (r.left + r.width / 2 - 12) + "px"; h.style.top = (r.top - 8) + "px";
    document.body.append(h); setTimeout(() => h.remove(), 900);
  }
  function fireworks(){
    if (off()) return;
    stopAll();
    const box = el("div", "cr-fireworks"); box.setAttribute("aria-hidden", "true");
    const colors = ["var(--px-f)", "var(--pine)", "var(--like)", "var(--px-c)", "var(--plate)"];
    for (let burst = 0; burst < 3; burst++){
      const cx = 20 + Math.random() * 60, cy = 18 + Math.random() * 25;
      for (let i = 0; i < 14; i++){
        const a = (Math.PI * 2 * i) / 14, d = 40 + Math.random() * 30, p = el("i", "cr-spark");
        p.style.left = cx + "vw"; p.style.top = cy + "vh"; p.style.background = colors[(i + burst) % colors.length];
        p.style.setProperty("--dx", Math.round(Math.cos(a) * d) + "px"); p.style.setProperty("--dy", Math.round(Math.sin(a) * d) + "px");
        p.style.animationDelay = (burst * .25) + "s"; box.append(p);
      }
    }
    document.body.append(box); setTimeout(() => box.remove(), 1700);
  }

  /* ---------- 排程 ---------- */
  let lastBanner = null;
  function tick(){
    if (off()){ stopAll(); return; }
    const b = document.querySelector(".px-banner-transit, .px-banner-map, .px-banner-community, .px-banner-me");
    const kind = b && [...b.classList].find(c => c.startsWith("px-banner-"));
    if (kind && kind !== lastBanner){ lastBanner = kind; setTimeout(playBanner, 1200); }   // 剛換到這個分頁：動一次
    if (!b) lastBanner = null;
  }
  setInterval(tick, 1000);
  setInterval(() => { if (!off()) (Math.random() < .5 ? walk : playBanner)(); }, 45000);   // 大約每 45 秒輪流
  setTimeout(() => { if (!off()) walk(); }, 25000);
  if (window.matchMedia) matchMedia("(prefers-reduced-motion: reduce)").addEventListener?.("change", () => { if (reduced()) stopAll(); });

  window.sgCritters = { init(o){ app = { ...app, ...o }; }, like, fireworks, walk, playBanner, stopAll, SAYINGS };
})();
