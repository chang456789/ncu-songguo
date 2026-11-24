/* =====================================================================
   松果 v3（IG／Threads 風格）的小功能
   - 頂部列：往下捲時自動隱藏、往上捲時出現（只切換 body 的 class，樣式在 web/ui.css）
   - 分享：手機用系統的分享選單；電腦（不支援分享）就複製到剪貼簿
   index.html 用法：V3.share({ title, text, url }, toast)
   ===================================================================== */
(() => {
  "use strict";
  let lastY = window.scrollY, ticking = false;
  const SHOW_ZONE = 80, DELTA = 6;
  function onScroll(){
    ticking = false;
    const y = window.scrollY, dy = y - lastY;
    if (Math.abs(dy) < DELTA) return;
    const typing = document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
    // 往下捲而且已經離開頂端：藏起來；往上捲或回到頂端：出現。打字中、有彈出視窗時不藏
    const hide = dy > 0 && y > SHOW_ZONE && !typing && !document.querySelector(".scrim");
    document.body.classList.toggle("v3-top-hide", hide);
    lastY = y;
  }
  addEventListener("scroll", () => { if (!ticking){ ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  // 換分頁時（畫面重繪）頂部列一定要出現
  addEventListener("hashchange", () => document.body.classList.remove("v3-top-hide"));

  async function share(data, toast){
    const payload = { title: data.title || "松果", text: data.text || "", url: data.url || location.origin };
    try {
      if (navigator.share){ await navigator.share(payload); return true; }
    } catch (e){ if (e && e.name === "AbortError") return false; }
    try {
      await navigator.clipboard.writeText([payload.title, payload.text, payload.url].filter(Boolean).join("\n"));
      if (toast) toast("已複製，可以貼給朋友");
      return true;
    } catch {
      if (toast) toast("這個瀏覽器不能分享，請複製網址");
      return false;
    }
  }
  window.sgV3 = { share };
})();
