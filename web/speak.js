/* =====================================================================
   松果 語音朗讀（前端）—— 瀏覽器內建的 speechSynthesis，免費、不用金鑰
   - 用語音問問松果時，回答會同時念出來；旁邊有「停止朗讀」按鈕。
   - 依回答的文字決定語言：中文念中文（zh-TW）、英文念英文（en-US）。
   - 長回答切成短句依序念（Chrome 一次念太長會中斷）。
   - 瀏覽器不支援就什麼都不做（supported = false）。
   用法（web/assistant.js）：
     SPEAK.speak(text, { onEnd })   // 開始念；會先停掉正在念的
     SPEAK.stop()                   // 停止朗讀
     SPEAK.unlock()                 // 在使用者按下麥克風時呼叫：iPhone 要在點擊當下先「開」過一次才能之後自動念
   ===================================================================== */
(() => {
  "use strict";
  const syn = window.speechSynthesis;
  const supported = !!(syn && window.SpeechSynthesisUtterance);
  let token = 0, onEndCb = null;

  // 中文字占文字的比例夠高就念中文，否則念英文
  function langOf(text){
    const s = String(text || "");
    const cjk = (s.match(/[㐀-鿿]/g) || []).length;
    const latin = (s.match(/[A-Za-z]/g) || []).length;
    return cjk && cjk * 3 >= latin ? "zh-TW" : "en-US";
  }
  function pickVoice(lang){
    const vs = syn.getVoices() || [];
    const want = lang.toLowerCase(), base = want.slice(0, 2);
    return vs.find(v => v.lang.toLowerCase().replace("_", "-") === want)
      || (base === "zh" && vs.find(v => /zh[-_](tw|hant)/i.test(v.lang)))
      || (base === "zh" && vs.find(v => /^zh/i.test(v.lang) && !/yue|hk/i.test(v.lang)))
      || vs.find(v => v.lang.toLowerCase().startsWith(base)) || null;
  }
  // 念之前整理文字：去掉表情符號、網址、條列符號
  function clean(text){
    return String(text || "")
      .replace(/https?:\/\/\S+/g, "")
      .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, "")
      .replace(/^[\s\-•*・]+/gm, "")
      .replace(/\s+/g, " ").trim();
  }
  // 依標點切成 120 字以內的短句
  function chunks(text){
    const parts = (text.match(/[^。！？!?；;]+(?:[。！？!?；;]+|$)/g) || []).map(x => x.trim()).filter(Boolean);
    const out = [];
    for (let p of parts){
      while (p.length > 120){ const cut = Math.max(p.lastIndexOf("，", 120), p.lastIndexOf(", ", 120), 60); out.push(p.slice(0, cut + 1)); p = p.slice(cut + 1).trim(); }
      if (p) out.push(p);
    }
    return out;
  }

  function stop(){
    if (!supported) return;
    token++;
    const cb = onEndCb; onEndCb = null;
    try { syn.cancel(); } catch {}
    if (cb) cb();
  }
  function speak(text, opts){
    if (!supported) return false;
    stop();
    const t = clean(text); if (!t) return false;
    const my = ++token, lang = langOf(t), voice = pickVoice(lang), list = chunks(t);
    onEndCb = (opts && opts.onEnd) || null;
    const done = () => { if (my !== token) return; token++; const cb = onEndCb; onEndCb = null; if (cb) cb(); };
    list.forEach((s, i) => {
      const u = new SpeechSynthesisUtterance(s);
      u.lang = lang; if (voice) u.voice = voice;
      u.rate = lang === "zh-TW" ? 1.05 : 1;
      if (i === list.length - 1){ u.onend = done; u.onerror = done; }
      syn.speak(u);
    });
    return true;
  }
  // iPhone Safari：語音要在使用者點擊時先播過一次，之後非同步拿到回答才能自動念
  function unlock(){
    if (!supported || unlock.done) return;
    unlock.done = true;
    try { const u = new SpeechSynthesisUtterance(" "); u.volume = 0; syn.speak(u); } catch {}
  }
  if (supported && syn.addEventListener) syn.addEventListener("voiceschanged", () => {});   // 讓瀏覽器先載入聲音清單
  window.addEventListener("pagehide", stop);

  window.sgSpeak = { supported, speak, stop, unlock, langOf, speaking: () => supported && token > 0 && !!onEndCb };
})();
