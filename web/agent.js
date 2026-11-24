/* =====================================================================
   松果 AI 代理人（前端）— 讓「問松果」不只回答文字，而是直接給可以操作的結果
   流程（一次提問最多 2 次 AI）：
     1. POST /api/ai-agent step:"route" → AI 只輸出 { tool, args }，決定用哪個工具
        （AI 失敗時，改用下面的關鍵字規則自己判斷，網站照常給結果）
     2. 程式用網站現有的資料執行工具 → 算出 result（給 AI 看）＋ cards（給使用者點）
     3. POST /api/ai-agent step:"answer" → AI 只根據 result 寫成回答（失敗時用程式寫的摘要）
     不需要工具的一般問題（tool:"none"）交回 web/assistant.js，照舊呼叫 /api/ai-chat。
   工具：commute 交通精算／find_rides 找拼車團／draft_ride 預填開團表單／find_events 找活動／
         find_food 找店家／next_class 下一堂課／my_timetable 整週課表／search_posts 搜尋貼文／weather 天氣／find_course 學校開課與教授
   動作工具（使用者確認後才會真的做）：draft_ride 預填開團表單／create_post_draft 預填貼文草稿／add_to_calendar 活動加入行事曆
   上網搜尋：web_search（最新、熱門、新開、校外、新聞、考試報名）→ 伺服器用 Tavily 搜尋，AI 只根據結果回答，下面顯示來源卡片
            沒有設定 Tavily 金鑰、今天的搜尋次數用完時 → 改走一般回答（網站資料），並說明原因
   不需要工具（穿搭、讀書、英文、生活建議、閒聊）或沒把握 → none；工具結果是空的 → 也交給一般回答
   index.html 用法：AGENT.init({ ... })；assistant.js 呼叫 AGENT.ask(message, history)
   ===================================================================== */
(() => {
  "use strict";
  let A = {};
  const tr = s => (A.tr ? A.tr(s) : s);
  const RA = () => window.sgRideAI;
  const CACHE_MS = 10 * 60e3, TIMEOUT_MS = 22000;
  const pad = n => String(n).padStart(2, "0");
  const localISO = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const dayISO = d => localISO(d).slice(0, 10);
  const WK = ["日", "一", "二", "三", "四", "五", "六"];
  const toMin = s => { const m = /^(\d{1,2}):(\d{2})/.exec(s || ""); return m ? +m[1] * 60 + +m[2] : null; };
  const hm = ms => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  // 片段陣列 → 字串（每段先翻譯，數字和使用者資料原樣保留）
  const say = parts => parts.flat(Infinity).map(x => typeof x === "string" ? tr(x) : String(x)).join("");

  /* ---------- 呼叫 /api/ai-agent（含 10 分鐘快取） ---------- */
  function hashKey(s){ let x = 2166136261; for (let i = 0; i < s.length; i++){ x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); } return (x >>> 0).toString(36); }
  async function post(body, cacheKey){
    const key = "ag." + hashKey(JSON.stringify(cacheKey) + "|" + A.lang());
    try { const v = JSON.parse(sessionStorage.getItem(key)); if (v && Date.now() - v.at < CACHE_MS) return { status: "ok", data: v.data }; } catch {}
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const r = await fetch("/api/ai-agent", { method: "POST", headers: { "content-type": "application/json" }, signal: ctrl.signal,
        body: JSON.stringify({ ...body, lang: A.lang() === "en" ? "en" : "zh" }) });
      let j = null; try { j = await r.json(); } catch {}
      if (r.ok && j && j.ok && !(j.data && j.data.unavailable)){ try { sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), data: j.data })); } catch {} return { status: "ok", data: j.data }; }
      if (r.ok && j && j.ok) return { status: "ok", data: j.data };   // 網路搜尋暫時不能用：不快取，下次再試
      const c = j && j.code;
      return { status: c === "ai_not_configured" ? "not_configured" : (r.status === 429 || c === "rate_limited") ? "rate_limited" : (r.status === 504 || c === "timeout") ? "timeout" : "error" };
    } catch (e) { return { status: e && e.name === "AbortError" ? "timeout" : "error" }; }
    finally { clearTimeout(t); }
  }

  /* ---------- AI 失敗時的關鍵字規則（不呼叫 AI 也能挑工具） ---------- */
  const PLACE_WORDS = [[/後門|宵夜街|back gate/i, "中央大學（後門）"], [/正門|學校|中大|校門|main gate|campus/i, "中央大學（正門）"],
    [/中壢(?:火)?車站|火車站|zhongli station/i, "中壢火車站"], [/高鐵|thsr|high.?speed/i, "高鐵桃園站"], [/台北|taipei/i, "台北車站"], [/松山|songshan/i, "松山機場"]];
  function placesIn(t){ const out = []; for (const [re, p] of PLACE_WORDS){ const m = re.exec(t); if (m) out.push([m.index, p]); } return out.sort((a, b) => a[0] - b[0]).map(x => x[1]); }
  function hourIn(t, now){
    const m = /(\d{1,2})\s*(?:[點:：時]|o'?clock|pm|am)\s*(\d{1,2}|半)?/i.exec(t); if (!m) return null;
    let h = +m[1]; const mi = m[2] === "半" ? 30 : m[2] ? +m[2] : 0;
    if (h < 12 && (/下午|晚上|傍晚|今晚|pm|evening|tonight/i.test(t) || (!/早上|上午|明早|am|morning/i.test(t) && now.getHours() >= h))) h += 12;
    return `${pad(h % 24)}:${pad(mi)}`;
  }
  function whenIn(t, now){
    const d = new Date(now); const tomorrow = /明|tomorrow/i.test(t); if (tomorrow) d.setDate(d.getDate() + 1);
    // 「週五」「星期五」：最近的那一天（今天是週五就是今天）
    const wd = /(?:週|星期|禮拜)([一二三四五六日天])/.exec(t);
    if (wd && !tomorrow){ const target = "日一二三四五六".indexOf(wd[1] === "天" ? "日" : wd[1]); d.setDate(d.getDate() + ((target - d.getDay() + 7) % 7)); }
    const h = hourIn(t, now);
    if (h) return `${dayISO(d)}T${h}`;
    if (/早|morning/i.test(t)) return `${dayISO(d)}T08:00`;
    if (/晚|tonight|evening/i.test(t)) return `${dayISO(d)}T19:00`;
    if (/下午|afternoon/i.test(t)) return `${dayISO(d)}T15:00`;
    return tomorrow ? `${dayISO(d)}T08:00` : null;
  }
  // 這些主題一律交給一般回答（ai-chat）：穿搭、讀書與考試、英文、生活建議、心情、閒聊
  const NONE_ALWAYS = /穿搭|穿什麼|要穿|衣服|外套|wear|outfit|clothes/i;
  const NONE_TOPICS = /讀書|念書|唸書|考試|期中|期末|複習|報告怎麼|英文|英語|多益|雅思|托福|生活建議|建議|怎麼辦|心情|壓力|焦慮|難過|失眠|室友相處|聊聊|無聊|你好|哈囉|嗨|謝謝|你是誰|\b(hi|hello|hey|thanks|study|exam|english|essay|advice|stress|bored|who are you)\b/i;
  // 句子裡明確提到網站的功能時，才不算一般問題（例如「有練英文的活動嗎」）
  const SITE_NOUNS = /活動|講座|課表|下一堂|拼車|揪|公車|高鐵|火車站|吃|店|美食|貼文|市集|二手|租屋|套房|看板|天氣|下雨|帶傘|event|ride|bus|food|market|housing|weather/i;
  // 只要日期：今天、明天、後天、週五（最近的那一天）；沒提到就 null
  function dateIn(t, now){
    const d = new Date(now);
    if (/後天|day after tomorrow/i.test(t)) d.setDate(d.getDate() + 2);
    else if (/明天|明早|明晚|tomorrow/i.test(t)) d.setDate(d.getDate() + 1);
    else { const wd = /(?:週|星期|禮拜)([一二三四五六日天])/.exec(t);
      if (wd){ const target = "日一二三四五六".indexOf(wd[1] === "天" ? "日" : wd[1]); d.setDate(d.getDate() + ((target - d.getDay() + 7) % 7)); }
      else if (!/今天|today|tonight|今晚/i.test(t)) return null; }
    return dayISO(d);
  }
  // 上網搜尋：最新、很紅、新開、新聞、報名；或「最近／推薦／附近」＋校外地點或主題（校內的公車、拼車、課表、市集不算）
  const WEB_HOT = /很紅|爆紅|熱門|夯|新開|剛開|最新|新聞|報名時間|報名日期|開放報名|異動|改道|停駛|演唱會|trending|popular|latest|news|newly opened|just opened|registration|concerts?|detour/i;
  const WEB_RECENT = /最近|近期|這陣子|這週末|週末|recent(?:ly)?|these days|this (?:week|weekend|month)/i;
  const WEB_NEAR = /推薦|附近|recommend|near/i;
  const WEB_TOPIC = /餐廳|美食|好吃|吃|店|咖啡|甜點|早午餐|酒吧|活動|展覽|演出|景點|新聞|考試|報名|restaurant|eat|food|cafe|coffee|bar|events?|exhibitions?|shows?|news|exam/i;
  const OFF_CAMPUS = /中壢(?!.{0,2}(?:火)?車站|站)|桃園(?!.{0,2}(?:高鐵|站|機場))|青埔|內壢|平鎮|八德|台北(?!車站)|臺北|新竹|zhongli(?! station)|taoyuan(?! (?:hsr|station|airport))|taipei(?! station)/i;
  const WEB_SKIP = /揪|拼車|共乘|下一班|下一堂|課表|carpool|next bus|next class|timetable|市集|有人(?:在)?賣|selling/i;
  function isWeb(t){
    if (WEB_SKIP.test(t)) return false;
    return WEB_HOT.test(t) || (WEB_RECENT.test(t) && WEB_TOPIC.test(t)) || (OFF_CAMPUS.test(t) && WEB_TOPIC.test(t)) || (WEB_NEAR.test(t) && WEB_RECENT.test(t));
  }
  // 英文的問題：換成中文關鍵字再搜尋（中文的網路資料比較多），回答仍然用英文
  const EN_ZH = [[/\bNCU\b|national central university/i, "中央大學"], [/zhongli/i, "中壢"], [/taoyuan/i, "桃園"], [/taipei/i, "台北"],
    [/trending|popular|hot\b/i, "熱門"], [/newly opened|just opened|\bnew\b/i, "新開"], [/latest|recent(?:ly)?/i, "最新"], [/news/i, "新聞"],
    [/restaurants?|eat|food|dinner|lunch/i, "美食 餐廳"], [/cafes?|coffee/i, "咖啡廳"], [/dessert/i, "甜點"], [/brunch/i, "早午餐"], [/\bbars?\b/i, "酒吧"],
    [/concerts?/i, "演唱會"], [/exhibitions?/i, "展覽"], [/events?|things to do/i, "活動"], [/this weekend/i, "這週末"], [/this month/i, "這個月"],
    [/TOEIC/i, "多益"], [/TOEFL/i, "托福"], [/IELTS/i, "雅思"], [/registration|register|sign up/i, "報名 時間"], [/traffic|road|detour/i, "交通 異動"], [/bus route/i, "公車 路線 異動"], [/near/i, "附近"]];
  const LOCAL_TOPIC = /餐廳|美食|好吃|吃|店|咖啡|甜點|早午餐|酒吧|活動|展覽|演出|景點|附近/;
  const HAS_PLACE = /中壢|桃園|台北|臺北|新竹|青埔|內壢|平鎮|八德|中央大學|中大|台灣|臺灣|全台|全國/;
  function webQuery(t){
    let q = /[\u4e00-\u9fff]/.test(t) ? t : EN_ZH.filter(([re]) => re.test(t)).map(x => x[1]).join(" ");
    q = q.replace(/[?？!！。，,、~～]+/g, " ").replace(/請問|幫我|查一下|有沒有|有什麼|有哪些|嗎|呢|啊|吧/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
    if (q && LOCAL_TOPIC.test(q) && !HAS_PLACE.test(q)) q += " 中壢 中央大學 附近";
    return q;
  }
  function ruleRoute(t){
    const now = new Date(), P = placesIn(t);
    if (!NONE_ALWAYS.test(t) && isWeb(t))
      return { tool: "web_search", args: { query: webQuery(t), topic: /新聞|news|異動|停駛|改道|detour/i.test(t) ? "news" : "general", days: WEB_RECENT.test(t) || WEB_HOT.test(t) ? 30 : null } };
    if (NONE_ALWAYS.test(t) || (NONE_TOPICS.test(t) && !SITE_NOUNS.test(t))) return { tool: "none", args: {} };
    // 動作：加入行事曆、擬貼文草稿（要放在「找活動」「找貼文」前面）
    if (/行事曆|日曆|加到.{0,3}曆|calendar|\.ics/i.test(t)){
      const kw = t.replace(/幫我|把|加到|加入|放進|行事曆|日曆|提醒我|那場|這場|的|活動|calendar|add|to my|please|\.ics/gi, " ").replace(/(?:這|下)?(?:週|星期|禮拜)[一二三四五六日天]|今天|明天|後天/g, " ").trim().split(/\s+/).filter(w => w.length >= 2)[0] || null;
      return { tool: "add_to_calendar", args: { keyword: kw, date: dateIn(t, now) } };
    }
    if (/幫我(?:寫|發|po|PO|貼|擬)|我要(?:賣|發文|po|PO|出租|轉租|招租|徵|找室友)|想(?:賣|轉租|出租|徵室友)|發一篇|寫一篇|help me (?:post|write|sell)|i want to sell/i.test(t)){
      const space = /轉租|出租|招租|sublet|rent out/i.test(t) ? "hb:list" : /室友|roommate/i.test(t) ? "hb:mate" : /失物|撿到|遺失|掉了|lost|found/i.test(t) ? "g:lost"
        : /賣|二手|出清|送|徵|收|sell|for sale/i.test(t) ? "m:all" : /課|老師|選課/.test(t) ? "g:course" : "g:chat";
      const category = space === "m:all" ? (/書|講義|課本|book/i.test(t) ? "書籍講義" : /腳踏車|單車|機車|bike|scooter/i.test(t) ? "機車單車" : /冰箱|電風扇|桌|椅|床|櫃|fridge|desk|chair/i.test(t) ? "家具家電"
          : /手機|電腦|筆電|耳機|平板|螢幕|phone|laptop/i.test(t) ? "3C" : /免費送|送人|贈送|free/i.test(t) ? "免費送" : /徵|收購|want to buy/i.test(t) ? "徵求" : "生活用品")
        : space === "hb:list" ? (/轉租|sublet/i.test(t) ? "轉租" : "招租") : space === "hb:mate" ? "徵室友" : space === "g:lost" ? (/撿到|found/i.test(t) ? "拾獲" : "遺失") : space === "g:course" ? "評價" : "閒聊";
      const title = t.replace(/^(?:請)?幫我(?:寫|發|po|PO|貼|擬)(?:一篇|一則)?|^我要|^我想|一篇/g, "").replace(/的(?:貼)?文(?=[，,。]|$)/g, "")
        .replace(/[，,]\s*(?:NT\$?|\$)?\s?\d[\d,]*\s?元?\s*$/, "").replace(/[，。！？,.!?]+$/g, "").trim().slice(0, 30) || null;
      const price = /(?:NT\$?|\$)\s?\d[\d,]*|\d[\d,]*\s?元/.exec(t);
      return { tool: "create_post_draft", args: { space, category, title, body: t.slice(0, 150), price: price ? price[0] : null } };
    }
    if (/下一堂|下堂|next class|教室在哪|在哪.{0,4}上課/i.test(t)) return { tool: "next_class", args: {} };
    const DAYS = "一二三四五六日";
    const dm = /(?:週|星期|禮拜)([一二三四五六日天])/.exec(t);
    if (/課表|課程表|幾堂課|有什麼課|哪些課|timetable|schedule|my classes|classes on/i.test(t) || (dm && /課/.test(t)))
      return { tool: "my_timetable", args: { day: dm ? (DAYS.indexOf(dm[1] === "天" ? "日" : dm[1]) + 1) : /今天|today/i.test(t) ? ((now.getDay() + 6) % 7) + 1 : /明天|tomorrow/i.test(t) ? ((now.getDay() + 7) % 7) + 1 : null } };
    if (/誰教|教授|老師|開課|課號|信箱|email|professor|instructor|who teaches|syllabus|課程綱要/i.test(t)){
      const kw = t.replace(/(請問|是誰教的|誰教的|誰教|的?信箱|email|老師|教授|開了?什麼課|開的課|在哪(?:裡|間)?上課|幾點上課|課號|嗎|呢|？|\?|有哪些|研究|的|\b(?:who|teaches|teach|is|the|what|where|when|does|do|professor|prof|instructor|email|of|for|course|class|taught|by|a)\b)/gi, " ").trim().split(/\s+/).filter(w => w.length >= 2)[0] || null;
      if (kw) return { tool: "find_course", args: { keyword: kw, kind: /信箱|email|系有哪些|研究|教授們|professor/i.test(t) ? "prof" : "course" } };
    }
    if (/課|教室|上課|class|lecture|classroom/i.test(t)) return { tool: "next_class", args: {} };
    if (/天氣|下雨|會不會雨|帶傘|溫度|幾度|冷不冷|熱不熱|weather|rain|umbrella|temperature/i.test(t))
      return { tool: "weather", args: { day: /後天|day after/i.test(t) ? "dayafter" : /明天|明早|tomorrow/i.test(t) ? "tomorrow" : "today" } };
    if (/二手|市集|在賣|有人賣|賣|收購|徵求|徵|租屋|租房|套房|雅房|房間|室友|看板|貼文|討論|有人問|有人說|PO文|second.?hand|for sale|selling|market|housing|apartment|room|roommate|post|board/i.test(t) && !/拼車|揪.*車/.test(t)){
      const board = /二手|市集|賣|收購|徵|second.?hand|for sale|selling|market/i.test(t) ? "market" : /租屋|租房|套房|雅房|房間|室友|housing|apartment|room|roommate/i.test(t) ? "housing" : /系上|系所|department/i.test(t) ? "campus" : /看板|討論|board/i.test(t) ? "forum" : null;
      const kw = (t.replace(/有沒有人|有人|在賣|賣|要|嗎|呢|\?|？|的|找|徵求|收購|二手|市集|租屋|附近|看板|貼文|上|在|問|說|有|沒有|一下|想|is anyone|anyone|selling|for sale|looking for|second.?hand|is there|are there|any|a |on the|board|market/gi, " ").trim().split(/\s+/).filter(w => w.length >= 2)[0]) || null;
      const room = board === "housing" && /套房|雅房|家庭式|整層|室友|studio|roommate/i.exec(t);
      return { tool: "search_posts", args: { keyword: room ? room[0] : kw, board } };
    }
    if (/揪|拼車|共乘|有人.*(?:一起|去|嗎)|carpool|ride ?share|anyone/i.test(t)){
      const to = P.find(p => !/中央大學/.test(p)) || null, from = P.find(p => /中央大學/.test(p)) || null;
      const draft = /我要開|幫我揪|開團|start a ride/i.test(t);
      return { tool: draft ? "draft_ride" : "find_rides", args: { from, to, when: whenIn(t, now), ...(draft ? { seats: null, luggage: /行李|luggage/i.test(t) ? "heavy" : "none" } : {}) } };
    }
    if (/吃|餐|飯|美食|便宜|宵夜|飲料|咖啡|food|eat|cheap|restaurant|dinner|lunch|snack/i.test(t))
      return { tool: "find_food", args: { budget: /便宜|cheap|省|budget/i.test(t) ? 1 : null, type: /宵夜|late.?night/i.test(t) ? "宵夜" : /早餐|breakfast/i.test(t) ? "早餐" : /飲料|咖啡|coffee|drink/i.test(t) ? "飲料咖啡" : /甜點|dessert/i.test(t) ? "甜點" : null, maxWalkMin: null, keyword: null } };
    const dest = P.includes("高鐵桃園站") ? "hsr" : P.includes("中壢火車站") ? "zl" : P.some(p => /台北|松山/.test(p)) ? "tpe" : null;
    if (dest && /到|去|公車|怎麼|來得及|趕|get to|bus|go to|by/i.test(t))
      return { tool: "commute", args: { dest, arriveBy: hourIn(t, now), luggage: /行李|luggage/i.test(t), priority: /趕|急|hurry|fast/i.test(t) ? "time" : /省錢|便宜|cheap/i.test(t) ? "money" : "balanced", origin: /後門|back gate/i.test(t) ? "back" : "gate" } };
    if (/活動|做什麼|有空|空檔|一小時|講座|展覽|event|what.*do|free time|an hour/i.test(t)){
      const today = dayISO(now);
      if (/中午|noon|lunch/i.test(t)) return { tool: "find_events", args: { date: today, timeFrom: "12:00", timeTo: "13:00", tags: [], keyword: null } };
      if (/今晚|tonight/i.test(t)) return { tool: "find_events", args: { date: today, timeFrom: "18:00", timeTo: "23:00", tags: [], keyword: null } };
      return { tool: "find_events", args: { date: /今天|today/i.test(t) ? today : null, timeFrom: null, timeTo: null, tags: /免費|free/i.test(t) ? ["免費"] : [], keyword: null } };
    }
    return { tool: "none", args: {} };
  }

  /* ---------- 工具：用網站現有資料計算結果與卡片 ---------- */
  const TOOLS = {
    commute(a){
      const r = RA(); if (!r || !r.commuteFor) return { result: { error: "unavailable" }, cards: [], summary: ["交通精算暫時無法使用"] };
      const c = r.commuteFor(a), R = c.R, p = R.pick, D = r.DESTS[a.dest], O = r.ORIGINS[a.origin || "gate"];
      const cards = [{ kind: "commute", icon: "⇄", title: ["交通精算：", O.label, " → ", D.label], sub: c.hero, action: () => r.showCommute(a) }];
      const bus = R.plans.find(x => x.kind === "bus" && !x.unavailable);
      if (bus) cards.push({ kind: "bus", icon: "🚌", title: [bus.route, "・", bus.stop, " 上車 ", r.hm(bus.depart)], sub: ["約 ", r.hm(bus.arrive), " 到・", bus.cost[0], " 元", bus.onTime === false ? "・來不及" : ""],
        action: () => { r.showCommute(a); A.goBus(a.dest); } });
      if (p.kind !== "bus") cards.push({ kind: "draft", icon: "＋", title: ["開一團拼車"], sub: [O.label, " → ", D.label],
        action: () => A.openRide(r.draftForm({ from: O.place, to: D.place, when: localISO(new Date(Date.now() + 20 * 60e3)), luggage: a.luggage ? "heavy" : "none" })) });
      return { result: c.payload, cards, summary: c.hero };
    },
    find_rides(a){
      const r = RA(); const list = r && r.findRides ? r.findRides(a) : [];
      const rides = list.slice(0, 5).map(x => ({ from: x.from, to: x.to, when: localISO(new Date(x.when)), seatsLeft: A.seatsLeft(x), tags: x.tags || [], luggage: x.luggage || "none" }));
      const cards = list.slice(0, 3).map(x => ({ kind: "ride", icon: "🚕", title: [x.from, " → ", x.to], userTitle: true,
        sub: [hm(x.when), "・剩 ", A.seatsLeft(x), " 位"], action: () => A.openRideThread(x.id) }));
      if (a.to) cards.push({ kind: "draft", icon: "＋", title: [list.length ? "都不合適？開一團（已填好）" : "開一團（已填好）"], sub: [a.from || "", a.from ? " → " : "", a.to],
        action: () => A.openRide(r.draftForm({ from: a.from || "中央大學（正門）", to: a.to, when: a.when })) });
      return { empty: !list.length, result: { criteria: a, rides }, cards,
        summary: list.length ? ["找到 ", list.length, " 團符合的拼車，點下面的卡片看討論區。"] : ["目前沒有符合的拼車團，可以自己開一團，表單已經幫你填好。"] };
    },
    draft_ride(a){
      const r = RA();
      return { result: { draft: a }, cards: [{ kind: "draft", icon: "＋", title: ["打開已填好的開團表單"], sub: [a.from || "", a.from ? " → " : "", a.to || "", a.when ? "・" + a.when.replace("T", " ") : ""],
        action: () => A.openRide(r.draftForm({ ...a, from: a.from || "中央大學（正門）", to: a.to || "中壢火車站" })) }],
        summary: ["開團表單已經幫你填好，點下面的卡片確認後再發布。"] };
    },
    find_events(a){
      const today = dayISO(new Date()), date = a.date || (a.timeFrom ? today : null);
      const from = toMin(a.timeFrom), to = toMin(a.timeTo);
      const kw = (a.keyword || "").toLowerCase();
      const list = A.events().filter(e => {
        if (date && !(e.date <= date && date <= (e.end || e.date))) return false;
        if (a.tags && a.tags.length && !a.tags.some(t => (e.tags || []).includes(t))) return false;
        if (kw && !`${e.title} ${e.place || ""} ${e.highlight || ""}`.toLowerCase().includes(kw)) return false;
        if (from != null){ const s = toMin(e.time); if (s == null) return !!e.end;          // 沒寫時間：只留展覽這類整天的
          const end = toMin(String(e.time).split(/[–~-]/)[1]); return (s >= from - 30 && s <= (to ?? from + 60)) || (s <= from && end != null && end > from); }
        return true;
      }).slice(0, 5);
      return { empty: !list.length, result: { criteria: { date, timeFrom: a.timeFrom, timeTo: a.timeTo, tags: a.tags || [] },
          events: list.map(e => ({ title: e.title, date: e.date, end: e.end || undefined, time: e.time || "", place: e.place || "", tags: e.tags || [], highlight: e.highlight || "" })) },
        cards: list.slice(0, 3).map(e => ({ kind: "event", icon: "📣", title: [e.title], userTitle: true, sub: [A.evWhen(e), e.place ? "・" + e.place : ""], action: () => A.goEvent(e.id) })),
        summary: list.length ? ["找到 ", list.length, " 個符合的活動，點下面的卡片看詳情。"] : ["這段時間沒有找到符合的活動，可以到活動頁看看其他時間。"] };
    },
    find_food(a){
      const all = A.foods();
      const base = all.filter(f => (!a.type || f.type === a.type) && (!a.maxWalkMin || f.walkMin <= a.maxWalkMin)
        && (!a.keyword || `${f.name} ${f.note || ""}`.toLowerCase().includes(a.keyword.toLowerCase())));
      let list = base.filter(f => !a.budget || (f.price && f.price <= a.budget));
      if (a.budget && list.length < 3) list = list.concat(base.filter(f => !f.price && !list.includes(f)).map(f => ({ ...f, priceUnknown: true })));
      list = list.sort((x, y) => (y.stars ?? -1) - (x.stars ?? -1) || x.walkMin - y.walkMin).slice(0, 5);
      return { empty: !list.length, result: { criteria: a, places: list.map(f => ({ name: f.name, type: f.type, price: f.price ? "$".repeat(f.price) : (f.priceUnknown ? "價位未知" : ""), stars: f.stars, ratings: f.ratings, walkMin: f.walkMin, hours: f.hours || "" })) },
        cards: list.slice(0, 3).map(f => ({ kind: "food", icon: "🍜", title: [f.name], userTitle: true,
          sub: [f.type, f.price ? "・" + "$".repeat(f.price) : "", "・走路約 ", f.walkMin, " 分鐘", f.stars ? "・★" + f.stars : ""], action: () => A.goFood(f.id) })),
        summary: list.length ? ["找到 ", list.length, " 間符合的店，點下面的卡片在美食地圖上看。"] : ["美食地圖上沒有找到符合的店，換個條件試試。"] };
    },
    // 動作：擬好貼文草稿，使用者在表單確認後自己按發布
    create_post_draft(a){
      const SPACE_NAME = { "m:all": "二手市集", "hb:list": "招租・轉租", "hb:mate": "徵室友", "g:lost": "失物招領", "g:course": "課程評價", "g:help": "求助問答", "g:club": "社團活動", "g:food": "美食", "g:chat": "閒聊" };
      return { result: { draft: { board: SPACE_NAME[a.space] || a.space, category: a.category, title: a.title, body: a.body, priceSuggestion: a.price } },
        cards: [{ kind: "draft", icon: "📝", title: ["打開已填好的貼文草稿"], sub: [SPACE_NAME[a.space] || "", a.category ? "・" : "", a.category || "", a.price ? ["・", a.price] : ""],
          action: () => A.openPostDraft(a) }],
        summary: ["貼文草稿已經幫你填好（", SPACE_NAME[a.space] || "", "），點下面的卡片確認內容後再發布。"] };
    },
    // 動作：把活動加入行事曆（在瀏覽器產生 .ics 檔下載，手機、Google 日曆都能匯入）
    add_to_calendar(a){
      const kw = (a.keyword || "").toLowerCase();
      const list = A.events().filter(e => (!a.date || (e.date <= a.date && a.date <= (e.end || e.date)))
        && (!kw || `${e.title} ${e.place || ""}`.toLowerCase().includes(kw))).slice(0, 3);
      return { empty: !list.length,
        result: { events: list.map(e => ({ title: e.title, date: e.date, time: e.time || "", place: e.place || "" })) },
        cards: list.map(e => ({ kind: "calendar", icon: "🗓️", title: ["加入行事曆：", e.title], userTitle: true, sub: [A.evWhen(e), e.place ? "・" + e.place : ""], action: () => downloadIcs(e) })),
        summary: list.length ? ["找到 ", list.length, " 個活動，點卡片就會下載行事曆檔（.ics），手機或 Google 日曆都能加入。"] : ["沒有找到這個活動。"] };
    },
    my_timetable(a){
      const cs = A.timetable();
      const DAYN = ["", "週一", "週二", "週三", "週四", "週五", "週六", "週日"];
      const list = cs.filter(c => !a.day || +c.day === a.day).sort((x, y) => x.day - y.day || String(x.start).localeCompare(String(y.start)));
      const cards = [{ kind: "class", icon: "📅", title: [a.day ? DAYN[a.day] : "整週", "課表"], sub: [list.length, " 堂課"], action: () => A.goSchedule() }];
      return { empty: !list.length, cards,
        result: { day: a.day ? DAYN[a.day] : "整週", courses: list.map(c => ({ name: c.name, day: DAYN[c.day], start: c.start, end: c.end, room: c.room || "", teacher: c.teacher || "" })) },
        summary: list.length ? [a.day ? DAYN[a.day] : "這週", "有 ", list.length, " 堂課，點下面的卡片看完整課表。"] : [cs.length ? "那天沒有課。" : "你還沒有建立課表，點下面的卡片輸入一次就好。"] };
    },
    search_posts(a){
      const kw = (a.keyword || "").toLowerCase();
      const list = A.posts().filter(p => (!a.board || p.tab === a.board) && (!kw || `${p.title} ${p.body} ${p.cat || ""} ${p.spaceName || ""}`.toLowerCase().includes(kw)))
        .sort((x, y) => y.ts - x.ts).slice(0, 5);
      return { empty: !list.length,
        result: { criteria: a, posts: list.map(p => ({ board: p.spaceName, title: p.title, excerpt: String(p.body || "").slice(0, 80), category: p.cat || "", price: p.price || p.rent || "", daysAgo: Math.floor((Date.now() - p.ts) / 864e5) })) },
        cards: list.slice(0, 3).map(p => ({ kind: "post", icon: "📝", title: [p.title || "（無標題）"], userTitle: true, sub: [p.spaceName, p.price ? "・" + p.price : p.rent ? "・" + p.rent : ""], action: () => A.openPost(p.id) })),
        summary: list.length ? ["找到 ", list.length, " 篇相關的貼文，點下面的卡片看內容。"] : ["目前沒有相關的貼文，可以自己發一篇。"] };
    },
    async find_course(a){
      // 學校公開資料：/api/ncu-courses、/api/ncu-profs（伺服器每天更新一次）
      const get = async u => { try { const r = await fetch(u); return r.ok ? await r.json() : null; } catch { return null; } };
      const timeOf = c => c.times.map(x => `週${x.day} ${x.start}–${x.end} ${c.rooms[x.room] || x.room || ""}`.trim()).join("；");
      const courseRow = c => ({ name: c.name, code: [c.code, c.cls].filter(Boolean).join("-"), teachers: c.teachers, time: timeOf(c) || "未排定", credits: c.credits, type: c.type });
      const go = (q, m) => () => A.goProfs && A.goProfs(q, m);
      if (a.kind === "prof"){
        const pj = await get("/api/ncu-profs?q=" + encodeURIComponent(a.keyword));
        if (!pj) return { result: { error: "unavailable" }, cards: [], summary: ["學校的教師資料暫時連不上，請稍後再試。"] };
        const profs = pj.profs.slice(0, 3);
        let taught = [];
        if (profs.length === 1){ const cj = await get("/api/ncu-courses?q=" + encodeURIComponent(profs[0].name)); taught = cj ? cj.courses.filter(c => c.teachers.includes(profs[0].name)).slice(0, 5) : []; }
        return { empty: !profs.length,
          result: { keyword: a.keyword, totalFound: pj.total, profs: profs.map(p => ({ name: p.name, dept: p.dept, title: p.title, email: p.email || "（點卡片看信箱）", research: p.keywords })), coursesThisSemester: taught.map(courseRow) },
          cards: profs.map(p => ({ kind: "prof", icon: "🎓", title: [p.name], userTitle: true, sub: [p.title, "・", p.dept], action: go(p.name, "prof") })),
          summary: profs.length ? ["找到 ", pj.total, " 位教授，點下面的卡片看信箱和開的課。"] : ["沒有查到這位教授，試試全名或系所。"] };
      }
      const cj = await get("/api/ncu-courses?q=" + encodeURIComponent(a.keyword));
      if (!cj) return { result: { error: "unavailable" }, cards: [], summary: ["學校的課程查詢暫時連不上，請稍後再試。"] };
      const list = cj.courses.slice(0, 5);
      return { empty: !list.length,
        result: { keyword: a.keyword, semester: cj.semester, totalFound: cj.courses.length, courses: list.map(courseRow) },
        cards: list.slice(0, 3).map(c => ({ kind: "course", icon: "📘", title: [c.name, " ", [c.code, c.cls].filter(Boolean).join("-")], userTitle: true, sub: [c.teachers.join("、") || "未定", "・", timeOf(c) || "未排定"], action: go(a.keyword, "course") })),
        summary: list.length ? ["這學期找到 ", cj.courses.length, " 門相關的課，點下面的卡片看時間、教室和教授。"] : ["這學期沒有查到相關的課，換個關鍵字試試。"] };
    },
    async weather(a){
      // 前端的預報（中央氣象署，失敗時 Open-Meteo）還在載入就最多等 3 秒；伺服器抓不到預報時會改用這份
      let f = A.weatherForecast && A.weatherForecast();
      for (let i = 0; i < 15 && f && f.loading; i++){ await new Promise(r => setTimeout(r, 200)); f = A.weatherForecast(); }
      const off = a.day === "tomorrow" ? 1 : a.day === "dayafter" ? 2 : 0;
      const d0 = new Date(); d0.setDate(d0.getDate() + off); const date = dayISO(d0);
      const day = f && f.days ? f.days.find(x => String(x.t).slice(0, 10) === date) : null;
      const now = f && f.now;
      const label = off === 2 ? "後天" : off === 1 ? "明天" : "今天";
      const cards = [{ kind: "weather", icon: "☁️", title: ["天氣預報"], sub: ["中壢・逐時與一週預報"], action: () => A.goWeather() }];
      const forecast = f && f.days ? { source: f.source || "", now: now ? { temp: now.temp, pop: now.pop, wx: now.wx } : null,
        days: f.days.slice(0, 3).map(x => ({ t: String(x.t).slice(0, 10), max: x.max, min: x.min, pop: x.pop, wx: x.wx })) } : null;
      // 天氣數字由伺服器在 answer 步驟向 Open-Meteo 取得，抓不到時用這裡的 forecast；summary 是 AI 失敗時的摘要
      return { result: { day: a.day, forecast }, cards,
        summary: day ? [label, "：", day.wx || "", " ", Math.round(day.min), "–", Math.round(day.max), "°，降雨機率 ", day.pop ?? "—", "%。點下面的卡片看完整預報。"]
          : off === 0 && now ? ["現在約 ", Math.round(now.temp), "°，降雨機率 ", now.pop ?? "—", "%。點下面的卡片看完整預報。"]
          : ["點下面的卡片看中壢的天氣預報。"] };
    },
    // 上網搜尋：真正的搜尋在伺服器的 answer 步驟（金鑰只在伺服器），這裡只是讓 ask() 認得這個工具
    web_search(){ return { web: true, result: null, cards: [], summary: [] }; },
    next_class(){
      const n = A.nextClass();
      if (!n) return { empty: true, result: { nextClass: null }, cards: [{ kind: "class", icon: "📅", title: ["建立課表"], sub: ["輸入一次，之後就能問下一堂課"], action: () => A.goSchedule() }],
        summary: ["你還沒有建立課表，點下面的卡片輸入一次就好。"] };
      const when = n.ongoing ? "上課中" : n.inDays === 0 ? "今天" : n.inDays === 1 ? "明天" : n.weekday;
      const cards = [{ kind: "class", icon: "📅", title: [n.name], userTitle: true, sub: [when, " ", n.start, "–", n.end, n.room ? "・" + n.room : ""], action: () => A.goSchedule() }];
      if (n.room) cards.push({ kind: "room", icon: "📍", title: ["找教室：", n.room], sub: ["在校內導航上看位置"], action: () => A.findRoom(n.room) });
      return { result: { nextClass: { ...n, when } }, cards, summary: ["下一堂是「", n.name, "」，", when, " ", n.start, n.room ? ["，在 ", n.room] : "", "。"] };
    },
  };

  /* ---------- 行事曆檔（.ics） ---------- */
  function icsFor(e){
    const esc = v => String(v || "").replace(/[\\;,]/g, m => "\\" + m).replace(/\n/g, "\\n");
    const stamp = d => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const m = /^(\d{1,2}):(\d{2})(?:\s*[–~-]\s*(\d{1,2}):(\d{2}))?/.exec(e.time || "");
    let when;
    if (m){   // 有時間：台灣時間換成 UTC
      const start = new Date(`${e.date}T${pad(+m[1])}:${m[2]}:00+08:00`);
      const end = m[3] ? new Date(`${e.date}T${pad(+m[3])}:${m[4]}:00+08:00`) : new Date(start.getTime() + 2 * 3600e3);
      when = [`DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`];
    } else {  // 沒寫時間（展覽等）：整天
      const next = new Date(`${e.end || e.date}T12:00:00+08:00`); next.setDate(next.getDate() + 1);
      when = [`DTSTART;VALUE=DATE:${e.date.replace(/-/g, "")}`, `DTEND;VALUE=DATE:${dayISO(next).replace(/-/g, "")}`];
    }
    return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Songguo NCU//EN", "CALSCALE:GREGORIAN", "BEGIN:VEVENT",
      `UID:${(e.id || e.title).replace(/[^\w-]/g, "")}-${e.date}@ncu-songguo`, `DTSTAMP:${stamp(new Date())}`, ...when,
      `SUMMARY:${esc(e.title)}`, e.place ? `LOCATION:${esc(e.place)}` : null, e.url ? `URL:${e.url}` : null,
      `DESCRIPTION:${esc((e.highlight ? e.highlight + "\n" : "") + "松果 中大生活通")}`, "END:VEVENT", "END:VCALENDAR"].filter(Boolean).join("\r\n");
  }
  function downloadIcs(e){
    const blob = new Blob([icsFor(e)], { type: "text/calendar;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    // 檔名用英數字：中文或全形標點的檔名在部分瀏覽器會被換成「download」，連 .ics 副檔名都不見，手機就認不出是行事曆檔
    a.download = `songguo-event-${e.date}.ics`;
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    if (A.toast) A.toast("已下載行事曆檔，打開它就能加入行事曆");
  }

  /* ---------- 主流程 ---------- */
  async function ask(message, history){
    const now = new Date();
    const routed = await post({ step: "route", message, now: `${localISO(now)}（週${WK[now.getDay()]}）`, places: A.places(), history: (history || []).slice(-4) },
      { s: "route", message, hour: localISO(now).slice(0, 13) });
    let status = routed.status;
    const route = status === "ok" ? routed.data : ruleRoute(message);
    if (route.tool === "none") return { general: true, status, route };
    if (route.tool === "web_search") return askWeb(message, route, status);
    let out;
    try { out = await TOOLS[route.tool](route.args || {}); }
    catch (e) { console.error("agent tool failed", route.tool, e); return { general: true, status, route }; }
    const cards = out.cards.map(c => ({ ...c, title: say(c.title), sub: say(c.sub) }));
    // 工具結果是空的：AI 正常時改走一般回答（ai-chat 讀得到全站資料），卡片照樣附上；AI 不能用時才顯示程式的摘要
    if (out.empty && status === "ok") return { general: true, status, route, cards };
    let reply = null;
    if (status === "ok"){
      const ans = await post({ step: "answer", message, tool: route.tool, args: route.args, result: out.result },
        { s: "answer", message, tool: route.tool, result: out.result });
      if (ans.status === "ok") reply = ans.data.reply; else status = ans.status;
    }
    return { reply: reply || say(out.summary), byAI: !!reply, cards, status, tool: route.tool, args: route.args };
  }

  /* ---------- 上網搜尋（web_search） ---------- */
  const WEB_NOTE = { limit: "今天的網路搜尋次數用完了，以下用網站上的資料回答。", quota: "網路搜尋的額度用完了，以下用網站上的資料回答。",
    timeout: "網路搜尋逾時，以下用網站上的資料回答。", error: "網路搜尋暫時無法使用，以下用網站上的資料回答。" };
  async function askWeb(message, route, routeStatus){
    // 路由的 AI 失敗時（關鍵字判斷出要上網）也照樣搜尋：伺服器會在 AI 不能用時直接列出搜尋結果
    const ans = await post({ step: "answer", task: "web_search", message, tool: "web_search", args: route.args, result: null },
      { s: "web", message, args: route.args });
    const d = ans.status === "ok" ? ans.data : null;
    // 沒有設定 Tavily 金鑰 → 和以前一樣交給一般回答；其他原因（次數用完、逾時）→ 一般回答＋說明
    if (!d || d.unavailable) return { general: true, status: routeStatus, route, note: d && d.unavailable === "not_configured" ? null : WEB_NOTE[(d && d.unavailable) || "error"] };
    const cards = (Array.isArray(d.sources) ? d.sources : []).filter(x => x && /^https?:\/\//i.test(x.url)).slice(0, 5).map(x => ({
      kind: "web", icon: "🌐", title: String(x.title || x.source || x.url), userTitle: true, href: x.url,
      sub: `[${x.n}] ${x.published ? x.published + "・" : ""}${x.source || ""}` }));   // 日期放前面，窄螢幕才不會被拆成兩行
    return { reply: d.reply, byAI: d.byAI !== false, cards, status: d.byAI === false && routeStatus !== "ok" ? routeStatus : "ok", tool: "web_search", args: route.args, web: true };
  }

  window.sgAgent = { init(o){ A = { ...A, ...o }; }, ask, ruleRoute, TOOLS, icsFor, webQuery };
})();
