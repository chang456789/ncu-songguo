/* =====================================================================
   松果 內容安全過濾（前端，以規則為主）——適用即時大廳訊息與留言
   送出前先用規則判斷（不呼叫 AI）：
     ① 短網址、可疑連結（bit.ly、reurl、LINE 加好友連結…）與「投資群」等詐騙字樣 → 擋下
     ② 洗版：自己 30 秒內已經發了 5 則，或和自己上一則完全一樣 → 擋下
     ③ 辱罵詞：嚴重的擋下；輕微的只提醒，可以選擇仍要送出
   只有「含連結、但規則判斷不出來」的訊息，才呼叫一次 AI（/api/ai-chatroom task:"moderate"）。
   AI 失敗（尚未設定、太頻繁、逾時）時一律放行，聊天不能因為 AI 壞掉而不能用。
   index.html 用法：
     MOD.init({ onChange:()=>renderKeep() })
     if (!(await MOD.guard("lobby", text, myRecentMessages, () => send(true)))) return;   // false = 不要送出
     live("lobbymod", () => MOD.note("lobby"))                                            // 顯示原因
   ===================================================================== */
(() => {
  "use strict";
  let app = { onChange: () => {} };
  const notes = new Map();      // key → { level:"block"|"warn"|"check", msg, force? }
  const sent = new Map();       // key → [{ body, ts }, …] 我在這台裝置送出的訊息（資料庫還沒回來前也能判斷洗版）
  const aiMemo = new Map();     // 文字 → "high" | "ok"

  /* ---------- 規則 ---------- */
  const SHORT = /(?:^|[^a-z0-9.-])(bit\.ly|reurl\.cc|tinyurl\.com|t\.co|goo\.gl(?!\/maps)|ppt\.cc|pse\.is|lihi\d?\.(?:cc|com|me)|shorturl\.at|is\.gd|cutt\.ly|rebrand\.ly|ow\.ly|tiny\.cc|s\.id|t\.ly|rb\.gy|url\.cc|lin\.ee|0rz\.tw|tny\.im)\b/i;
  const LINE_ADD = /line\.me\/(?:r\/)?ti\/|line\.me\/[^\s]*\/ti\/|line\.naver\.jp\/ti\//i;
  const SCAM = /投資群|投資(?:社|社團|群組|交流群)|飆股|帶單|老師帶(?:你|單|操作)|穩賺|保證(?:獲利|賺|收益|報酬)|躺賺|零風險|高報酬|日賺\s*\d|月入\s*\d+\s*萬|虛擬(?:貨幣|幣)投資|USDT\s*(?:投資|套利)|博弈|娛樂城|代儲|網賺|被動收入群/i;
  const SCAM_EN = /\b(guaranteed (?:profit|returns?)|investment group|crypto (?:signals?|investment)|double your money|forex signals?)\b/i;
  // 嚴重辱罵：擋下
  const SEVERE = /幹你娘|操你媽|操你妈|你媽死了|你妈死了|去死吧|去死一死|雜種|婊子|賤人|狗娘養的|死全家|\bf+u+c+k+\s*(?:you|u|off)\b|\bmotherf\w*|\bkill\s*yourself\b|\bkys\b/i;
  // 輕微不雅：只提醒（避開「幹嘛、幹部、能幹、樹幹、主幹、骨幹、幹事、苦幹」等正常用字）
  const MILD = /智障|白癡|白痴|腦殘|北七|低能|靠北|靠腰|(?<![能樹主骨苦實才精])幹(?![嘛麻啥什部事活練勁線道細話掉])|\bshit\b|\bstupid\b|\bidiot\b|\bdumbass\b|\bwtf\b/i;
  const LINK = /https?:\/\/[^\s]+|(?:^|[^@\w])(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|tw|cc|io|me|co|xyz|top|info|app|link|ly|gl|gd|at|im|site|online|shop|vip|club)(?:\/[^\s]*)?/i;
  // 常見、可信的網域：含這些連結不必問 AI
  const SAFE_HOST = /(?:^|\.)(?:ncu\.edu\.tw|edu\.tw|gov\.tw|google\.com|maps\.app\.goo\.gl|goo\.gl\/maps|forms\.gle|youtube\.com|youtu\.be|instagram\.com|facebook\.com|fb\.com|threads\.net|dcard\.tw|ptt\.cc|github\.com|notion\.so|notion\.site|hackmd\.io|wikipedia\.org|apple\.com|ncu-songguo\.vercel\.app|thsrc\.com\.tw|railway\.gov\.tw|tycg\.gov\.tw|ebus\.tycg\.gov\.tw|bus\.taoyuan\.gov\.tw|ubereats\.com|foodpanda\.com\.tw)$/i;
  const norm = s => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
  function hostsOf(text){
    const out = [];
    for (const m of String(text).matchAll(/(?:https?:\/\/)?((?:[a-z0-9-]+\.)+[a-z]{2,})(\/[^\s]*)?/gi)){
      if (!LINK.test(m[0])) continue;
      out.push((m[1] + (m[2] || "")).toLowerCase());
    }
    return out;
  }
  const safeLink = h => SAFE_HOST.test(h.split("/")[0]) || /^maps\.app\.goo\.gl|^goo\.gl\/maps/.test(h);

  /* 回傳 { level:"block"|"warn"|"ai"|"ok", msg } —— 純規則，不呼叫 AI */
  function check(text, mine = [], key = ""){
    const t = String(text || "");
    if (SHORT.test(t) || LINE_ADD.test(t)) return { level: "block", msg: "為了大家的安全，短網址和 LINE 加好友連結不能發在這裡。請改貼完整網址，或私訊對方。" };
    if (SCAM.test(t) || SCAM_EN.test(t)) return { level: "block", msg: "訊息看起來像投資或詐騙宣傳，已擋下。如果是誤會，請換個說法再試。" };
    if (SEVERE.test(t)) return { level: "block", msg: "訊息含有攻擊性的字眼，請友善發言。" };
    const now = Date.now();
    // 同一則訊息可能同時出現在本機紀錄和資料庫，取兩邊較大的數字，避免重複計算
    const local = (sent.get(key) || []).filter(x => now - x.ts < 30000).length;
    const remote = mine.filter(m => now - (+m.ts || 0) < 30000).length;
    if (Math.max(local, remote) >= 5) return { level: "block", msg: "發言太快了，休息 30 秒再繼續聊吧。" };
    const last = [...mine, ...(sent.get(key) || [])].sort((a, b) => (+b.ts || 0) - (+a.ts || 0))[0];
    if (last && norm(last.body) === norm(t) && now - (+last.ts || 0) < 120000) return { level: "block", msg: "這則和你上一則一模一樣，請不要重複發送。" };
    if (MILD.test(t)) return { level: "warn", msg: "訊息裡有比較不禮貌的字眼，要不要修改一下？" };
    const hosts = hostsOf(t);
    if (hosts.length && !hosts.every(safeLink)) return { level: "ai", msg: "" };
    return { level: "ok", msg: "" };
  }

  /* ---------- 只有規則判斷不出來、但含有連結的訊息，才問 AI 一次 ---------- */
  async function askAI(text){
    const k = norm(text);
    if (aiMemo.has(k)) return aiMemo.get(k);
    try {
      const r = await fetch("/api/ai-chatroom", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ task: "moderate", text: String(text).slice(0, 500) }), signal: AbortSignal.timeout(8000) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return "ok";                       // 尚未設定、太頻繁、逾時：放行
      const v = j.risk === "high" ? "high" : "ok";
      aiMemo.set(k, v); if (aiMemo.size > 300) aiMemo.clear();
      return v;
    } catch { return "ok"; }
  }

  /* 送出前呼叫。回傳 true 才送出。force：使用者按了「仍要送出」 */
  async function guard(key, text, mine, resend, force){
    const r = check(text, mine || [], key);
    if (r.level === "block"){ notes.set(key, { level: "block", msg: r.msg }); app.onChange(); return false; }
    if (r.level === "warn" && !force){ notes.set(key, { level: "warn", msg: r.msg, force: resend }); app.onChange(); return false; }
    if (r.level === "ai"){
      notes.set(key, { level: "check", msg: "正在檢查連結安全…" }); app.onChange();
      const v = await askAI(text);
      if (v === "high"){ notes.set(key, { level: "block", msg: "這個連結看起來可能是詐騙或廣告，已擋下。如果是誤會，請改用文字說明。" }); app.onChange(); return false; }
    }
    if (notes.has(key)){ notes.delete(key); app.onChange(); }
    const list = (sent.get(key) || []).filter(x => Date.now() - x.ts < 120000); list.push({ body: String(text), ts: Date.now() }); sent.set(key, list);
    return true;
  }

  function note(key){
    const n = notes.get(key);
    const box = document.createElement("div");
    if (!n) return box;
    box.className = "mod-note " + n.level; box.setAttribute("role", n.level === "check" ? "status" : "alert");
    const p = document.createElement("span"); p.textContent = n.msg; box.append(p);
    if (n.level === "warn" && n.force){
      const b = document.createElement("button"); b.type = "button"; b.className = "linkbtn"; b.textContent = "仍要送出";
      b.addEventListener("click", () => { const f = n.force; notes.delete(key); app.onChange(); f(); }); box.append(b);
    }
    if (n.level !== "check"){
      const x = document.createElement("button"); x.type = "button"; x.className = "linkbtn mod-x"; x.textContent = "知道了";
      x.addEventListener("click", () => { notes.delete(key); app.onChange(); }); box.append(x);
    }
    return box;
  }

  window.sgModeration = { init(o){ app = { ...app, ...o }; }, check, guard, note, clear(key){ notes.delete(key); } };
})();
