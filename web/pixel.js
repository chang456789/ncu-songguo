/* =====================================================================
   松果 像素吉祥物：抱著松果的小松鼠（全部用程式畫，沒有使用任何外部圖片）
   - 每張圖是 32×32 的文字格子；一個字元 = 一個像素：
       .  透明     o  輪廓（深棕）   f  毛色（公車黃 --bus）
       c  奶油色（肚子、尾巴）        n  松果棕       g  松綠（--pine）
   - 用 SVG 畫出、放大顯示（crispEdges＋image-rendering: pixelated）。
     顏色由 web/ui.css 的 CSS 變數（--px-o、--px-f…）決定，深色模式自動換色。
   - 動畫只用在短暫的時刻，並遵守 prefers-reduced-motion（減少動態效果時只顯示靜態圖）。
   用法（index.html 或其他檔案）：
     PX.sprite("normal" | "think" | "happy" | "sad" | "umbrella" | "search" | "bus" | "stop" | "bench", { size: 96 })
     PX.loading()                       // 松鼠追著 132 公車跑（取代「載入中…」）
     PX.thinking()                      // 問松果思考中
     PX.empty("rides" | "posts" | "search", { onAction })   // 空白狀態：圖＋一句提示＋行動按鈕
     PX.error({ onRetry })              // 斷線或錯誤
     PX.celebrate("已發布！")            // 發文、開團成功：開心表情跳一下
     PX.weather(isRain)                 // 天氣卡用：下雨撐傘
   ===================================================================== */
(() => {
  "use strict";
  const SVGNS = "http://www.w3.org/2000/svg";
  const G = {
    normal: [
      "................................",
      "................................",
      "..............ooo......ooo......",
      "..............ofo......ofo......",
      ".....oooooo..ofcfo....ofcfo.....",
      "....offffffo.ofcfoooooofcfo.....",
      "...offffffffo.oooffffffooo......",
      "..offfffcffffooffffffffffo......",
      "..offfcccccffoffffffffffffo.....",
      "..offfcccccffoffffffffffffo.....",
      "..offfcccccffoffcofffffcofo.....",
      "..offcccccccfoffoofffffoofo.....",
      "..offcccccccfoffffccccffffo.....",
      "..offcccccccfoffcccoocccffo.....",
      "..offfcccccffoffccccccccffo.....",
      "..offfcccccffoofcccococcfo......",
      "..offfcccccffo.oocccoccoo.......",
      "...offffcffffo.oooooooo.........",
      "....offfffffffoffffffgfo........",
      ".....offfffffoffffffoggfo.......",
      ".....offfffffoffccoonnnoo.......",
      ".....offfffffoffccfoonnof.......",
      ".....offffffoffcccfonnoofo......",
      ".....offfffffofcccooonnoo.......",
      "......offffffofcccconnooo.......",
      "......offffffofcccccooofo.......",
      ".......oooooo.ofccccccfo........",
      ".............oooooccooooo.......",
      ".............offfoooofffo.......",
      "..............ooo....ooo........",
      "................................",
      "................................",
    ],
    think: [
      "........................ooooooo.",
      ".......................occcccccc",
      "..............ooo......ococococo",
      "..............ofo......occccccco",
      ".....oooooo..ofcfo....ofooooooo.",
      "....offffffo.ofcfoooooofcoo.....",
      "...offffffffo.oooffffffooo......",
      "..offfffcffffooffffffffffo......",
      "..offfcccccffoffffffffffffo.....",
      "..offfcccccffoffffffffffffo.....",
      "..offfcccccffoffcofffffcofo.....",
      "..offcccccccfoffoofffffoofo.....",
      "..offcccccccfoffffccccffffo.....",
      "..offcccccccfoffcccoocccffo.....",
      "..offfcccccffoffccccccccffo.....",
      "..offfcccccffoofcccococcfo......",
      "..offfcccccffo.oocccoccoo.......",
      "...offffcffffo.oooooooo.........",
      "....offfffffffoffffffgfo........",
      ".....offfffffoffffffoggfo.......",
      ".....offfffffoffccoonnnoo.......",
      ".....offfffffoffccfoonnof.......",
      ".....offffffoffcccfonnoofo......",
      ".....offfffffofcccooonnoo.......",
      "......offffffofcccconnooo.......",
      "......offffffofcccccooofo.......",
      ".......oooooo.ofccccccfo........",
      ".............oooooccooooo.......",
      ".............offfoooofffo.......",
      "..............ooo....ooo........",
      "................................",
      "................................",
    ],
    happy: [
      "................................",
      "..g.............................",
      ".ggg..........ooo......ooo......",
      "..g...........ofo......ofo......",
      ".....oooooo..ofcfo....ofcfo..g..",
      "....offffffo.ofcfoooooofcfo.ggg.",
      "...offffffffo.oooffffffooo...g..",
      "..offfffcffffooffffffffffo......",
      "..offfcccccffoffffffffffffo.....",
      "..offfcccccffoffffffffffffo.....",
      "..offfcccccffofffoffffffofo.....",
      "..offcccccccfoffofoffffofoo.....",
      "..offcccccccfoffffccccffffo.....",
      "..offcccccccfoffcccoocccffo.....",
      "..offfcccccffoffccccccccffo.....",
      "..offfcccccffoofcccoocccfo.oo...",
      "..offfcccccffo.ooccocccoo.ofo...",
      "...offffcffffo.oooooooo...ofo...",
      "....offfffffffoffffffgfo.oofoooo",
      ".....offfffffoffffffoggfooffffo.",
      ".....offfffffoffccoonnnooofffffo",
      ".....offfffffoffccfoonnofofffffo",
      ".....offffffoffcccfonnoofoooooo.",
      ".....offfffffofcccooonnoo.......",
      "......offffffofcccconnooo.......",
      "......offffffofcccccooofo.......",
      ".......oooooo.ofccccccfo........",
      ".............oooooccooooo.......",
      ".............offfoooofffo.......",
      "..............ooo....ooo........",
      "................................",
      "................................",
    ],
    sad: [
      "................................",
      "................................",
      "..............ooo......ooo......",
      "..............ofo......ofo......",
      ".....oooooo..ofcfo....ofcfo.....",
      "....offffffo.ofcfoooooofcfo.....",
      "...offffffffo.oooffffffooo......",
      "..offfffcffffooffffffffffo......",
      "..offfcccccffoffffffffffffo.....",
      "..offfcccccffoffffffffffffo.....",
      "..offfcccccffofofffffffffoo.....",
      "..offcccccccfoffoofffffoofo.....",
      "..offcccccccfoffcfccccffffo.....",
      "..offcccccccfoffcccoocccffo.....",
      "..offfcccccffoffccccccccffo.....",
      "..offfcccccffoofccoccoccfo......",
      "..offfcccccffo.ooccooccoo.......",
      "...offffcffffo.oooooooo.........",
      "....offfffffffoffffofofo........",
      ".....offfffffofffffofoffo.......",
      ".....offfffffoffcconnnofo.......",
      ".....offfffffoffcconnnofo.......",
      ".....offffffoffccconnnoffo......",
      ".....offfffffofcccconocfo.......",
      "......offffffofcccccoccfo.......",
      "......offffffofcccccoccfo.......",
      ".......oooooo.ofccccocfo.......g",
      ".............oooooccooooo.....g.",
      ".............offfoooofffo.......",
      "..............ooo....ooo.ooo....",
      "............................oo..",
      "..............................g.",
    ],
    umbrella: [
      "...................oooooo.......",
      "...g............ooogggggggooo...",
      "......g.......oogggggggggggggo..",
      "..g...........ogggggggggggggggo.",
      ".....oooooo..oggggggggggggggggg.",
      "....ogfffffo.ooggoooggoooggoogo.",
      ".g.offffffffo.ooofffffoooo...o..",
      "..offfffcffffooffffffffffo...o..",
      "..offfcccccffoffffffffffffo..o..",
      "..offfcccccffoffffffffffffo..o..",
      "..offfcccccffoffcofffffcofo..o..",
      "..offcccccccfoffoofffffoofo..o..",
      "..offcccccccfoffffccccffffo..o..",
      "..offcccccccfoffcccoocccffo..o..",
      "..offfcccccffoffccccccccffo..o..",
      "..offfcccccffoofcccococcfo...o..",
      "..offfcccccffo.oocccoccoo....o..",
      "...offffcffffo.oooooooo......o..",
      "....offfffffffoffffffgfo...o.o..",
      ".....offfffffoffffffoggfo...o...",
      ".....offfffffoffccoonnnoo.......",
      ".....offfffffoffccfoonnof.......",
      ".....offffffoffcccfonnoofo......",
      ".....offfffffofcccooonnoo.......",
      "......offffffofcccconnooo.......",
      "......offffffofcccccooofo.......",
      ".......oooooo.ofccccccfo........",
      ".............oooooccooooo.......",
      ".............offfoooofffo.......",
      "..............ooo....ooo........",
      "................................",
      "................................",
    ],
    search: [
      "................................",
      "................................",
      "..............ooo......ooo......",
      "..............ofo......ofo......",
      ".....oooooo..ofcfo....ofcfo.....",
      "....offffffo.ofcfoooooofcfo.....",
      "...offffffffo.oooffffffooo......",
      "..offfffcffffooffffffffffo......",
      "..offfcccccffoffffffffffffo.....",
      "..offfcccccffoffffffffffffo.....",
      "..offfcccccffoffffffffffffo.....",
      "..offcccccccfoffoofffffoofo.....",
      "..offcccccccfoffooccccfoofo.....",
      "..offcccccccfoffcccoocccffo.....",
      "..offfcccccffoffccccccccffo.....",
      "..offfcccccffoofcccococcfo......",
      "..offfcccccffo.oocccoccoo.ooo...",
      "...offffcffffo.oooooooo..occco..",
      "....offfffffffoffffffffooccccco.",
      ".....offfffffoffffffffffoccccco.",
      ".....offfffffoffccccccffooccco..",
      ".....offfffffoffccccccffo.oooo..",
      ".....offffffoffccccccccffo...oo.",
      ".....offfffffofccccccccfo.....o.",
      "......offffffofccccccccfo.......",
      "......offffffofccccccccfo.......",
      ".......oooooo.ofccccccfo........",
      ".............oooooccooooo.......",
      ".............offfoooofffo.......",
      "..............ooo....ooo........",
      "................................",
      "................................",
    ],
    bus: [
      "..ooooooooooooooooooooooooooo...",
      ".ofooooooooooooooofffffffffffo..",
      ".ofocccccccccccccofooooooooooo..",
      ".ofocooccooocooocofoccooccooco..",
      ".ofoccoccccocccocofoccooccooco..",
      ".ofoccoccooocooocofoccooccooco..",
      ".ofoccoccccococccofoccooccooco..",
      ".ofocooocooocooocofoooooooooco..",
      ".ofocccccccccccccofffffffffoco..",
      ".ofooooooooooooooofffffffffooo..",
      ".oggggooggggggggggggggoogggggo..",
      ".offfooooffffffffffffooooffffooo",
      ".ooooonnoooooooooooooonnoooooo..",
      "....oonnoo..........oonnoo......",
      ".....oooo............oooo.......",
      "......oo..............oo........",
    ],
    stop: [
      "oooooooooooo",
      "oggggggggggo",
      "ogoooooooogo",
      "ogooccccoogo",
      "ogoccccccogo",
      "ogoffffffogo",
      "ogooccccoogo",
      "ogoooooooogo",
      "oggggggggggo",
      "oggggggggggo",
      "oooooooooooo",
      ".....on.....",
      ".....on.....",
      ".....on.....",
      ".....on.....",
      ".....on.....",
      ".....on.....",
      ".....on.....",
      ".....on.....",
      ".....on.....",
      ".....on.....",
      ".....on.....",
      ".....on.....",
      ".....on.....",
      ".....on.....",
      ".....on.....",
      ".....on.....",
      ".....on.....",
      ".....on.....",
      "...oooooo...",
      "...onnnno...",
      "...oooooo...",
    ],
    bench: [
      "oooooooooooooooooooooo",
      "onnnnnnnnnnnnnnnnnnnno",
      "oooooooooooooooooooooo",
      "..o................o..",
      "oooooooooooooooooooooo",
      "onnnnnnnnnnnnnnnnnnnno",
      "oooooooooooooooooooooo",
      "..oo..............oo..",
      "..oo..............oo..",
      "..oo..............oo..",
    ],
  };
  const CLASS = { o: "px-o", f: "px-f", c: "px-c", n: "px-n", g: "px-g" };
  const reduced = () => !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);

  /* ---------- 文字格子 → SVG（同一列相同顏色的連續像素合併成一個長方形，檔案比較小） ---------- */
  const cache = new Map();
  function markup(name){
    if (cache.has(name)) return cache.get(name);
    const rows = G[name]; if (!rows) return "";
    let s = "";
    rows.forEach((row, y) => {
      let x = 0;
      while (x < row.length){
        const ch = row[x]; let n = 1;
        while (x + n < row.length && row[x + n] === ch) n++;
        if (CLASS[ch]) s += `<rect class="${CLASS[ch]}" x="${x}" y="${y}" width="${n}" height="1"/>`;
        x += n;
      }
    });
    cache.set(name, s); return s;
  }
  function sprite(name, opts = {}){
    const rows = G[name] || G.normal;
    const w = rows[0].length, h = rows.length, scale = (opts.size || 96) / 32;
    const svg = document.createElementNS(SVGNS, "svg");
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    svg.setAttribute("width", String(Math.round(w * scale)));
    svg.setAttribute("height", String(Math.round(h * scale)));
    svg.setAttribute("shape-rendering", "crispEdges");
    svg.setAttribute("class", "px" + (opts.cls ? " " + opts.cls : ""));
    if (opts.label){ svg.setAttribute("role", "img"); svg.setAttribute("aria-label", opts.label); }
    else svg.setAttribute("aria-hidden", "true");
    svg.innerHTML = markup(name);
    return svg;
  }

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

  /* ① 載入中：松鼠追著 132 公車跑過去 */
  function loading(opts = {}){
    return el("div", { class: "px-loading" + (opts.compact ? " compact" : ""), role: "status" },
      el("div", { class: "px-track" },
        el("div", { class: "px-run" }, el("span", { class: "px-hop" }, sprite("normal", { size: opts.compact ? 30 : 42 })), sprite("bus", { size: opts.compact ? 56 : 80, cls: "px-bus" }))),
      el("span", { class: "px-sr" }, opts.label || "載入中…"));
  }

  /* ② 問松果 AI 思考中 */
  function thinking(opts = {}){
    return el("span", { class: "px-thinking", role: "status" }, sprite("think", { size: opts.size || 44 }), el("span", { class: "px-sr" }, "松果正在想…"));
  }

  /* ③ 空白狀態：每種都有一張圖、一句可愛的提示、一個行動按鈕 */
  const EMPTY = {
    rides:  { art: ["stop", "normal"], title: "還沒有人開團", text: "松鼠在站牌下等了好久…開一團，順路的同學就會加入！", action: "開一團" },
    posts:  { art: ["bench", "normal"], title: "這裡還空空的", text: "大廳只剩松鼠一個。發第一篇貼文，打破沉默吧！", action: "發一篇貼文" },
    search: { art: ["search"], title: "找不到符合的結果", text: "松鼠翻遍了松果堆也沒找到，換個關鍵字試試？", action: "清除搜尋" },
  };
  function empty(kind, opts = {}){
    const c = EMPTY[kind] || EMPTY.posts;
    return el("div", { class: "px-empty px-empty-" + kind },
      el("div", { class: "px-scene" }, c.art.map(a => sprite(a, { size: 84, cls: "px-art-" + a }))),
      el("h3", {}, opts.title || c.title),
      el("p", {}, opts.text || c.text),
      opts.onAction ? el("button", { type: "button", class: "primary", onclick: opts.onAction }, opts.action || c.action) : null);
  }

  /* ⑤ 斷線或錯誤 */
  function error(opts = {}){
    return el("div", { class: "px-empty px-error", role: "alert" },
      el("div", { class: "px-scene" }, sprite("sad", { size: 96 })),
      el("h3", {}, opts.title || "連不上松果"),
      el("p", {}, opts.text || "網路好像斷線了，松鼠也好難過。檢查網路後再試一次。"),
      opts.onRetry ? el("button", { type: "button", class: "primary", onclick: opts.onRetry }, opts.action || "重新整理") : null);
  }

  /* ④ 發文、開團成功：開心表情跳一下（約 1.8 秒後自動消失） */
  let pop = null, popT = 0;
  function celebrate(text, opts = {}){
    if (pop) pop.remove();
    pop = el("div", { class: "px-celebrate" + (reduced() ? " still" : ""), role: "status" }, sprite("happy", { size: 64 }), text ? el("b", {}, text) : null);
    document.body.append(pop);
    if (opts.translate) opts.translate(pop);
    clearTimeout(popT);
    const p = pop; popT = setTimeout(() => { p.classList.add("out"); setTimeout(() => p.remove(), 300); }, opts.ms || 1800);
    return pop;
  }

  /* ⑥ 天氣卡：下雨時撐傘 */
  function weather(isRain, opts = {}){ return sprite(isRain ? "umbrella" : "normal", { size: opts.size || 48, label: opts.label }); }

  window.sgPixel = { sprite, loading, thinking, empty, error, celebrate, weather, grids: G, reduced };
})();
