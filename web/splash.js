/* =====================================================================
   松果 v3 開場動畫（仿 Threads）：白底（深色模式黑底）中間是松鼠 Logo，接著「松果」字樣淡入，約 1.2 秒後淡出。
   - 用 sessionStorage 記錄：同一次瀏覽只出現一次；關掉分頁、手機完全關掉 App 後，下次打開會再出現。
   - 開啟「減少動態效果」時直接略過。
   - 放在 index.html 其他程式之前載入（需要 web/pixel.js），畫面還沒畫好前就先蓋住，避免閃一下。
   ===================================================================== */
(() => {
  "use strict";
  const KEY = "sg.splash", SHOW_MS = 1200, FADE_MS = 320;
  let seen = false;
  try { seen = sessionStorage.getItem(KEY) === "1"; sessionStorage.setItem(KEY, "1"); } catch { seen = true; }   // 不能用 sessionStorage 時就不放，避免每次都出現
  const reduced = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (seen || reduced || !document.body) return;
  const PX = window.sgPixel;
  const wrap = document.createElement("div");
  wrap.className = "px-splash"; wrap.setAttribute("aria-hidden", "true");
  const logo = document.createElement("div"); logo.className = "px-splash-logo";
  if (PX) logo.append(PX.sprite("icon_me", { size: 128 }));
  const name = document.createElement("div"); name.className = "px-splash-name";
  let en = false; try { en = localStorage.getItem("pc.lang") === "en" || (!localStorage.getItem("pc.lang") && !/^zh/i.test(navigator.language || "zh")); } catch {}
  name.textContent = en ? "Songguo" : "松果";
  wrap.append(logo, name);
  document.body.append(wrap);
  const done = () => { wrap.classList.add("out"); setTimeout(() => wrap.remove(), FADE_MS); };
  setTimeout(done, SHOW_MS);
  wrap.addEventListener("click", done);   // 點一下可以略過
})();
