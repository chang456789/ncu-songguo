/* =====================================================================
   松果 語音輸入（前端）—— 用瀏覽器內建的語音辨識（Web Speech API），免費、不用金鑰
   - 即時大廳輸入框、「問松果」輸入框旁有麥克風按鈕。
   - 中文介面用 zh-TW，英文介面用 en-US。
   - 辨識結果只「填進輸入框」，由使用者自己按送出，絕不自動發送。
   - 瀏覽器不支援（例如部分 iPhone）就不顯示按鈕。
   index.html 用法：
     VOICE.init({ lang:()=>I18N.lang, toast:m=>toast(m), tr:s=>I18N.tr(s) })
     VOICE.button("lobby", () => document.getElementById("lobby-in"))   // 不支援時回傳 null
     「問松果」的輸入框在 web/assistant.js 裡，這裡會在視窗出現後自動把按鈕加上去，不用改 assistant.js。
   ===================================================================== */
(() => {
  "use strict";
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let app = { lang: () => "zh", toast: () => {}, tr: s => s };
  let rec = null, activeKey = null;

  const ERR = {
    "not-allowed": "請允許松果使用麥克風，才能用語音輸入。",
    "service-not-allowed": "請允許松果使用麥克風，才能用語音輸入。",
    "no-speech": "沒有聽到聲音，請再試一次。",
    "audio-capture": "找不到麥克風。",
    network: "語音辨識需要網路連線，請稍後再試。",
  };
  const MIC = '<svg viewBox="0 0 24 24" aria-hidden="true" width="20" height="20"><path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM6 11a6 6 0 0 0 12 0M12 17v4M9 21h6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function sync(){
    for (const b of document.querySelectorAll(".mic-btn")){
      const on = b.dataset.key === activeKey;
      b.classList.toggle("on", on); b.setAttribute("aria-pressed", on ? "true" : "false");
      const label = app.tr(on ? "停止語音輸入" : "語音輸入");
      b.setAttribute("aria-label", label); b.title = label;
    }
  }
  function stop(){ if (rec){ try { rec.stop(); } catch {} } }
  function start(key, getInput){
    if (rec){ const same = activeKey === key; stop(); if (same) return; }
    const inp = getInput(); if (!inp || inp.disabled) return;
    const r = new SR();
    r.lang = app.lang() === "en" ? "en-US" : "zh-TW";
    r.interimResults = true; r.continuous = false; r.maxAlternatives = 1;
    const base = inp.value, sep = base && !/\s$/.test(base) && app.lang() === "en" ? " " : "";
    const max = inp.maxLength > 0 ? inp.maxLength : 500;
    r.onresult = e => {
      let text = ""; for (const res of e.results) text += res[0].transcript;
      const el = getInput(); if (!el) return;     // 畫面重繪過也找得到新的輸入框
      el.value = (base + sep + text).slice(0, max);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    };
    r.onerror = e => { if (e.error !== "aborted") app.toast(ERR[e.error] || "語音辨識失敗，請再試一次。"); };
    r.onend = () => {
      if (rec === r){ rec = null; activeKey = null; sync(); }
      const el = getInput(); if (el && !el.disabled){ el.focus({ preventScroll: true }); try { el.setSelectionRange(el.value.length, el.value.length); } catch {} }
    };
    rec = r; activeKey = key;
    try { r.start(); } catch { rec = null; activeKey = null; app.toast("語音辨識失敗，請再試一次。"); }
    sync();
  }

  function button(key, getInput){
    if (!SR) return null;
    const b = document.createElement("button");
    b.type = "button"; b.className = "mic-btn"; b.dataset.key = key; b.innerHTML = MIC;
    b.addEventListener("click", e => { e.preventDefault(); start(key, getInput); });
    setTimeout(sync);   // 畫面重繪後，讓新按鈕顯示目前是否正在聽
    return b;
  }

  // 「問松果」視窗（web/assistant.js）出現後，把麥克風加在送出鈕前面
  function attachAssistant(){
    const form = document.querySelector(".ai-panel .ai-form");
    if (!form || form.querySelector(".mic-btn")) return;
    const b = button("assistant", () => document.querySelector(".ai-panel .ai-input"));
    if (b) form.insertBefore(b, form.querySelector(".ai-send"));
  }
  if (SR){
    const mo = new MutationObserver(attachAssistant);
    const go = () => { attachAssistant(); mo.observe(document.body, { childList: true }); };
    if (document.body) go(); else document.addEventListener("DOMContentLoaded", go);
  }

  window.sgVoice = { init(o){ app = { ...app, ...o }; sync(); }, button, supported: !!SR, stop };
})();
