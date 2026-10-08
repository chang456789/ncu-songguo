/* =====================================================================
   松果 i18n — 中文 / English
   The app renders Chinese; in English mode every rendered text node and the placeholder / aria-label / title
   attributes are swapped through this dictionary (exact match first, then sentence patterns).
   User content (posts, nicknames, chats, official announcements), shop names and street addresses stay as written.
   ===================================================================== */
(() => {
  "use strict";
  const KEY = "pc.lang";
  let lang;
  try { lang = localStorage.getItem(KEY); } catch {}
  if (lang !== "zh" && lang !== "en") lang = /^zh/i.test(navigator.language || "zh") ? "zh" : "en";

  const EN = {
    // ---------- shell & navigation ----------
    "松果":"Songguo", "松果首頁":"Songguo home", "主選單":"Main menu", "選單":"Menu", "即時資訊":"Live info", "快速查看":"At a glance",
    "首頁":"Home", "交通":"Transit", "活動":"Events", "論壇":"Forum", "課表":"Timetable", "美食":"Food", "導航":"Campus map",
    "市集":"Market", "租屋":"Housing", "系所":"Departments", "天氣":"Weather", "在線":"Online", "私訊":"Messages", "更多":"More",
    "建立":"Create", "所有功能":"All features", "安裝到手機":"Install on phone", "加到主畫面當 App 用":"Add to home screen as an app",
    "我的設定":"Settings", "在線 ":"Online ", "看看誰在線上":"See who's online", "看誰在線":"Who's online",
    "公車時刻・拼車":"Bus times · Ride share", "近期活動・學校公告":"Upcoming events · School notices", "即時大廳・看板":"Live lounge · Boards",
    "我的課表與提醒":"My timetable & reminders", "共同編輯的美食地圖":"Community food map", "校內建築・步行導航":"Campus buildings · Walking directions",
    "二手・免費送・徵求":"Second-hand · Free · Wanted", "租屋大廳・避雷":"Rental lobbies · Reviews", "各系看板":"Department boards",
    "中壢天氣預報":"Zhongli weather forecast", "現在誰在線上":"Who's online now", "加密私訊":"Encrypted messages",
    "松果是中央學生自己做的生活網站，資料來自學校公開資訊與大家的分享。":"Songguo is a campus-life site made by NCU students. Data comes from public school sources and what everyone shares.",
    // ---------- gate ----------
    "中央人的生活圈。看公車、揪拼車、找活動、聊天，打開就能用。":"Campus life for NCU students. Bus times, ride shares, events and chat — ready the moment you open it.",
    "取一個暱稱":"Pick a nickname", "匿名暱稱":"Anonymous nickname", "不用註冊，也不用學號。暱稱之後隨時可以改。":"No sign-up, no student ID. You can change your nickname anytime.",
    "換一個":"Shuffle", "開始使用":"Get started", "暱稱至少要 2 個字。":"Nickname needs at least 2 characters.", "隨機":"Random",
    // ---------- home ----------
    "下一班公車":"Next bus", "團":"rides", "場":"events", "今日活動":"Today", "即時大廳":"Live lounge", "想說什麼？":"What's on your mind?",
    "揪拼車":"Share a ride", "分享活動":"Share an event", "賣東西":"Sell something", "從中大出發":"From NCU", "回中大":"To NCU",
    "完整時刻表與搭車資訊":"Full timetable & tips", "近期活動":"Upcoming events", "查看全部":"See all", "動態":"Feed", "全部":"All",
    "貼文":"Posts", "拼車":"Ride share", "還沒有動態":"Nothing here yet",
    "發一篇貼文、開一團拼車，或分享你知道的校園活動，大家就會在這裡看到。":"Write a post, start a ride share or share a campus event — everyone will see it here.",
    "下一堂課":"Next class", "現在這堂":"Now in class", "上課中":"In class", "找教室":"Find room", "建立課表":"Set up timetable",
    "還沒有課表。輸入一次，之後首頁就會顯示下一堂課，也能設定上課提醒。":"No timetable yet. Enter it once and your next class shows up here, with optional reminders.",
    "今天已無班次":"No more buses today", "考慮拼車":"Try ride share", "今天往車站、高鐵的公車都收班了。":"Buses to the station and THSR are done for today.",
    "即將發車":"Leaving now", "約 ":"~", "接下來可能下雨，記得帶傘":"Rain likely soon — bring an umbrella", "天氣暫時抓不到":"Weather unavailable", "天氣載入中…":"Loading weather…",
    // ---------- create sheet ----------
    "發文到論壇":"Post to forum", "開一團拼車":"Start a ride share", "分享校園活動":"Share a campus event", "標美食":"Add a food spot", "新增課程":"Add a class",
    "關閉":"Close", "建立貼文":"New post", "發到哪裡":"Post to",
    // ---------- transit ----------
    "公車時刻":"Bus times", "中壢火車站":"Zhongli Station", "高鐵桃園站":"THSR Taoyuan", "台北・松山機場":"Taipei · Songshan Airport",
    "班表":"Timetable", "自動判斷":"Auto", "學期中平日":"Term weekday", "寒暑假平日":"Vacation weekday", "假日":"Weekend/holiday", "寒假":"Winter break", "暑假":"Summer break",
    "接下來的班次":"Upcoming trips", "這個班表今天沒有班次。":"No trips on this timetable today.", "沒趕上公車？":"Missed the bus?",
    "　計程車到中壢車站約 165 元，4 人分攤每人約 40 元。":" A taxi to Zhongli Station is about NT$165 — about NT$40 each for 4 people.",
    "看拼車":"See rides", "開一團":"Start one", "在哪裡上車":"Where to board", "搭車小提醒":"Tips",
    "車程約 20–30 分鐘":"About 20–30 min", "到松山機場約 1 小時":"About 1 hour to Songshan Airport", "全票 18 元、半票 9 元":"NT$18 full fare, NT$9 half fare",
    "中大↔松山機場 全票 84 元、半票 42 元":"NCU↔Songshan Airport NT$84 full, NT$42 half", "・可刷悠遊卡、一卡通":" · EasyCard / iPASS accepted",
    "校內 5 站都能上車：前門警衛室、中大湖、依仁堂、後門、觀景台。":"Board at any of 5 campus stops: Front Gate guardhouse, NCU Lake, Yi-Ren Hall, Back Gate, Lookout.",
    "132 在中壢公車站（復興路，NET 旁）上車；133、133A 在中壢客運中壢總站（建國路 100 號，火車前站左側）上車。":"132 boards at Zhongli Bus Station (Fuxing Rd., next to NET); 133 and 133A board at Chung Li Bus main station (100 Jianguo Rd., left of the station's front exit).",
    "從前門警衛室發車，校內另停中大湖、依仁堂、後門、觀景台。":"Departs from the Front Gate guardhouse, also stopping at NCU Lake, Yi-Ren Hall, Back Gate and Lookout.",
    "高鐵桃園站出站後，到站外 8 號月台上車。":"At THSR Taoyuan, board at bus platform 8 outside the station.",
    "在中大警衛室或依仁堂站牌上車，經中壢交流道上國道 1 號。":"Board at the NCU guardhouse or Yi-Ren Hall stop; it takes Freeway 1 via the Zhongli interchange.",
    "松山機場 3 號候車亭上車，經行天宮，終點中壢。":"Board at Songshan Airport shelter 3; via Xingtian Temple, ending in Zhongli.",
    "週五下午、連假前一天和收假日是尖峰，建議提早 30–40 分鐘到警衛室排隊，那裡有各路線的排隊標示。":"Friday afternoons, the day before long weekends and the last day of holidays are rush times — queue at the guardhouse 30–40 min early; each route has a marked line.",
    "Google 地圖的公車時間常不準，出門前看「桃園公車動態」或 Bus+ 的即時位置。":"Google Maps bus times are often wrong — check Taoyuan eBus or Bus+ for live positions before you go.",
    "132、133 客滿時，可以走到後門外的雙連坡站搭 50 開頭的公車（如 5026、5027）往中壢。":"If 132/133 are full, walk to Shuanglianpo stop outside the back gate and take a 50xx bus (e.g. 5026, 5027) to Zhongli.",
    "每天 23:00–05:00 校內禁止車輛深入，深夜叫車請約在前門。":"Cars can't enter campus 23:00–05:00 — meet late-night rides at the front gate.",
    "桃園公車動態":"Taoyuan eBus", "中大總務處交通資訊":"NCU transport info", "管理員：班表設定":"Admin: timetable settings",
    "中大總務處「對外交通資訊」115.02.26 版":"the NCU General Affairs transport notice (2026-02-26)", "依":"Based on ",
    "整理。標「約」的是客運的預估時間，實際以公車動態為準。":". Times marked ~ are the bus company's estimates; live tracking is the final word.",
    "目前顯示 172A 試辦班表　":"Showing the 172A trial timetable  ", "目前顯示一般班表　":"Showing the regular timetable  ",
    "總務處公告的試辦期到 115/3/31（172 停駛，改開 172A 與 18:00 的 172 加班車）。公車動態目前仍只看到 172 加班車，所以先用試辦班表；若 172 恢復正常行駛，請切到一般班表。":"The posted 172A trial ran to 2026-03-31 (172 suspended; 172A plus an extra 18:00 172 instead). Live tracking still only shows the extra 172, so the trial timetable is used; switch to the regular one if 172 returns.",
    "172、173 一般班表。若客運仍在行駛 172A 試辦路線，請切到試辦班表。":"Regular 172/173 timetable. If the 172A trial is still running, switch to the trial timetable.",
    "看一般班表":"Regular timetable", "看試辦班表":"Trial timetable", "已切換全站班表":"Timetable switched for everyone",
    "班表設定":"Timetable settings", "高鐵線使用的班表":"Timetable for the THSR routes", "172A 試辦班表（172 停駛）":"172A trial (172 suspended)", "172、173 一般班表":"Regular 172/173",
    "寒暑假期間":"Vacation dates", "133 在寒暑假改用假日班次。一行一段：名稱, 開始日, 結束日（例：寒假, 2027-01-18, 2027-02-21）":"133 runs the weekend schedule during vacations. One per line: name, start, end (e.g. Winter break, 2027-01-18, 2027-02-21)",
    "這裡的設定會套用到所有人。各班次時間依總務處公告寫在頁面裡，公告更新時請跟我說，我會重新整理。":"These settings apply to everyone. Trip times follow the General Affairs notice; when it changes, the timetable needs updating.",
    "班表設定已更新":"Timetable settings updated", "高鐵站外 8 號月台上車":"Board at platform 8 outside THSR",
    "中壢公車站（復興路，NET 旁）":"Zhongli Bus Station (Fuxing Rd., by NET)", "中壢客運中壢總站（建國路 100 號）":"Chung Li Bus main station (100 Jianguo Rd.)",
    "172加":"172 extra", "往 ":"To ", "進站":"Arriving",
    // rides
    "公車少又擠，就揪人一起搭計程車。開團寫好時間、起訖和人數，同路的人按「加入」就能占位，留言區直接討論集合點。":"Buses are few and packed — share a taxi instead. Post the time, route and seats; people heading the same way tap Join, and sort out the meeting point in the comments.",
    "目前沒有人揪車":"No ride shares yet", "週五下午回家、週日晚上回學校最常有人一起搭。開第一團吧。":"Friday afternoons home and Sunday evenings back are the busiest. Start the first one.",
    "你開的團":"Your ride", "加入":"Join", "退出":"Leave", "已額滿":"Full", "已滿":"Full", "已加入：":"Joined: ", "討論集合點":"Discuss meeting point", "收起討論":"Hide discussion",
    "取消這團":"Cancel ride", "取消這團？":"Cancel this ride?", "已加入的人會看到這團消失。":"People who joined will see it disappear.", "已取消":"Cancelled",
    "已加入，記得到討論區約集合點":"Joined — agree on a meeting point in the discussion", "已退出":"Left", "已開團":"Ride posted",
    "出發":"From", "目的地":"To", "出發時間":"Departure", "總人數":"Seats", "車資":"Fare split", "車資平分":"Split evenly", "先到先付・現場再算":"Pay now, settle up later",
    "我出車・每人固定費用":"I'm driving · fixed price each", "備註（選填）":"Note (optional)", "例：在後門 7-11 集合、有大行李":"e.g. meet at the back-gate 7-Eleven, big luggage",
    "為了安全，請在校內或人多的地方集合；不要在公開留言區留下電話，需要時用私訊交換。":"For safety, meet on campus or somewhere busy. Don't post phone numbers publicly — swap them by private message.",
    "開團":"Post ride", "出發時間要在現在之後。":"Departure must be in the future.", "出發地和目的地不能一樣。":"From and To can't be the same.",
    "中央大學（正門）":"NCU (Main Gate)", "中央大學（後門）":"NCU (Back Gate)", "台北車站":"Taipei Main Station", "松山機場":"Songshan Airport", "桃園機場":"Taoyuan Airport",
    "大江購物中心":"Metrowalk Mall", "中原商圈・中原夜市":"CYCU area · Zhongyuan Night Market", "龍岡・忠貞市場":"Longgang · Zhongzhen Market", "中壢觀光夜市":"Zhongli Night Market", "青埔":"Qingpu", "其他":"Other",
    // ---------- events ----------
    "校園活動":"Campus events", "學校公告":"School notices", "中大新聞":"NCU news", "校園公告":"Campus notices", "其他活動公告":"Other notices",
    "學校官網和人文藝術中心的活動會自動整理進來；你知道的活動也可以直接分享。":"Events from the school website and the Center for Humanities & Arts are collected automatically — you can share ones you know about too.",
    "＋ 分享活動":"+ Share event", "展覽・進行中":"Exhibitions · On now", "今天":"Today", "明天":"Tomorrow", "這週":"This week", "之後":"Later",
    "展期至":"Until", "想去":"Interested", "我會去":"Going", "有餐點":"Food provided", "可認證時數":"Counts for hours", "免費":"Free", "有抽獎贈品":"Prizes/giveaways", "需報名":"Registration",
    "近期還沒有活動":"No upcoming events", "正在整理學校的活動…":"Collecting school events…", "學校網站":"School website",
    "學校活動的時間、地點和「有餐點」「可認證時數」標籤是程式從公告內文自動整理的，可能有誤，請以原公告為準。資料每 30 分鐘更新。":"Times, places and the Food / Hours tags are extracted automatically from the announcements and may be wrong — check the original. Updated every 30 minutes.",
    " 學校網站暫時連不上，先顯示上次的資料。":" The school website is unreachable — showing the last data.",
    "看到海報、社團宣傳或系上活動？分享到這裡，大家就看得到。":"Saw a poster, club promo or department event? Share it here so everyone can see.",
    "活動名稱":"Event name", "例：秋光．古典的回聲 音樂會":"e.g. Autumn classical concert", "日期":"Date", "開始":"Start", "結束（選填）":"End (optional)", "地點":"Place",
    "例：大禮堂、文三館 112":"e.g. Auditorium, Liberal Arts 3 Rm 112", "標籤":"Tags", "補充說明":"Details", "怎麼報名、要不要索票、適合誰（選填）":"How to register, tickets, who it's for (optional)",
    "報名或公告網址（選填）":"Registration or announcement link (optional)", "網址":"Link", "分享":"Share", "已分享，謝謝你":"Shared — thanks!",
    "請填活動名稱。":"Enter an event name.", "活動日期要是今天或之後。":"The date must be today or later.", "結束時間要比開始時間晚。":"End must be after start.",
    "網址要以 http:// 或 https:// 開頭。":"Links must start with http:// or https://.",
    "同步中央大學官網，點標題會開啟原始公告。":"Synced from the NCU website — tap a title for the original.", "自動同步中央大學官網，每 15 分鐘更新一次。點標題會開啟學校的原始公告。":"Synced from the NCU website every 15 minutes. Tap a title for the original announcement.",
    "校園活動與消息":"Campus events & news", "暫時抓不到學校網站的資料，":"Couldn't reach the school website — ", "目前沒有資料，":"Nothing here yet — ", "到學校網站看":"see the school website",
    "國立中央大學官網":"NCU website", "資料來源：":"Source: ",
    // ---------- forum / posts ----------
    "全校共用的聊天大廳，下課無聊就進來聊。":"A chat room for the whole campus — drop in when you're bored.", "大廳還很安靜，說聲嗨吧。":"It's quiet in here. Say hi!",
    "大廳訊息":"Lounge message", "目前無法發言":"Can't post right now", "送出":"Send", "請友善發言。不當內容管理員會刪除；每人每小時最多 120 則。":"Be kind. Admins remove inappropriate content; max 120 messages per hour.",
    "看板":"Boards", "閒聊":"Chat", "課程評價":"Course reviews", "社團活動":"Clubs", "失物招領":"Lost & found", "求助問答":"Q&A",
    "什麼都能聊的中大綜合版。":"The NCU board for anything.", "選課前先看：甜涼度、作業量、考試方式、老師風格。":"Read before you enroll: workload, exams, teaching style.",
    "社團招生、活動宣傳、演出與比賽。":"Club recruiting, events, performances and competitions.", "撿到或遺失東西都可以在這裡發。":"Lost something or found something? Post it here.",
    "後門宵夜街、松苑、中壢市區哪間好吃。":"Where to eat — back gate, late-night street, Songyuan, Zhongli.", "行政流程、選課系統、校園生活的大小問題。":"Admin procedures, course registration and campus life questions.",
    "心情":"Feelings", "問題":"Question", "評價":"Review", "選課":"Enrollment", "共筆":"Shared notes", "招生":"Recruiting", "宣傳":"Promo", "遺失":"Lost", "拾獲":"Found",
    "推薦":"Recommend", "踩雷":"Avoid", "揪吃":"Eat together", "教學":"How-to", "課程":"Courses", "考試":"Exams", "求助":"Help",
    "發文":"Post", "發布":"Publish", "已發布":"Posted", "標題":"Title", "內容":"Content", "分類":"Category", "發文身分":"Post as", "發文身分　":"Post as  ",
    "用我的暱稱":"My nickname", "一次性隨機暱稱":"One-time random name", " （一次性暱稱）":" (one-time name)", "請填寫標題。":"Enter a title.", "內容太短了，再多寫一點。":"Too short — write a bit more.",
    "打到一半關掉也沒關係，草稿會自動保留。":"Drafts are saved automatically.", "讚":"Like", "已按讚":"Liked", "留言":"Comment", "寫留言…":"Write a comment…", "留言內容":"Comment",
    "還沒有留言，說點什麼吧。":"No comments yet. Say something!", "收起留言":"Hide comments", "檢舉":"Report", "已檢舉":"Reported", "刪除":"Delete", "已刪除":"Deleted",
    "刪除這篇貼文？":"Delete this post?", "刪除後無法復原。":"This can't be undone.", "檢舉這篇貼文":"Report this post", "送出檢舉":"Report",
    "人身攻擊或謾罵":"Harassment or abuse", "捏造不實內容":"False information", "洩漏個人資料":"Personal information", "廣告或詐騙":"Spam or scam",
    "同一篇貼文被 3 位不同使用者檢舉後會自動暫時隱藏，等管理員審核。":"A post reported by 3 different people is hidden until an admin reviews it.",
    "已檢舉，累積 3 次會自動隱藏":"Reported — hidden automatically after 3 reports", "這篇貼文已被 3 位以上使用者檢舉，暫時隱藏，等待管理員審核。":"This post was reported by 3+ people and is hidden pending review.",
    "審核通過，恢復顯示":"Approve & restore", "這裡還沒有人發文":"No posts yet", "當第一個開口的人。點一個開頭直接開始寫：":"Be the first. Tap a starter:",
    "正在載入貼文…":"Loading posts…", "最新":"Newest", "熱門":"Popular", "排序":"Sort", "找不到這個版":"Board not found", "找不到這個版，可能已被移除。":"Board not found — it may have been removed.",
    "已移除的版":"Removed board", "有人知道…？":"Does anyone know…?", "分享一下今天發生的事":"Something that happened today",
    "有人要一起訂外送嗎？":"Anyone want to order delivery together?", "今晚宵夜街走起":"Late-night street tonight?", "烘衣機是不是壞了？":"Is the dryer broken?",
    "子母車爆滿了":"The garbage bins are overflowing", "包裹被誤拿了":"Someone took my parcel", "隔音實測心得":"Soundproofing test", "電費一度怎麼算才合理？":"What's a fair electricity rate?",
    "寒假轉租，2 月可入住":"Winter sublet, move in Feb", "後門套房招租":"Studio for rent near back gate", "徵室友一起租整層":"Looking for flatmates", "缺一位女室友":"Need one female flatmate",
    "畢業出清：除濕機":"Graduation sale: dehumidifier", "免費送三層櫃":"Free 3-tier shelf", "徵二手計算機概論課本":"Wanted: used Intro to Computers textbook",
    "候補第幾號有機會？":"What waitlist number usually gets in?", "想跟人換床位":"Want to swap beds", "微積分哪個老師推薦？":"Which calculus teacher do you recommend?", "通識甜課整理":"Easy general-ed courses",
    // market
    "二手市集":"Market", "買賣、交換、免費贈送都在這裡。面交地點建議選校內人多的地方。":"Buy, sell, swap or give away. Meet somewhere busy on campus.",
    "書籍講義":"Books & notes", "家具家電":"Furniture & appliances", "3C":"Electronics", "機車單車":"Scooters & bikes", "生活用品":"Daily goods", "免費送":"Free", "徵求":"Wanted",
    "價格":"Price", "例：NT$300、免費":"e.g. NT$300, free", "物品狀況、使用多久、面交地點與時間。":"Condition, how long it's been used, where and when to meet.",
    // ---------- housing ----------
    "校外租屋":"Off-campus", "租屋看板":"Rental boards", "全區廣播":"Area board", "租屋避雷與心得":"Landlord reviews", "招租・轉租":"For rent · Sublet", "徵室友":"Flatmates",
    "匿名點評房東、隔音、採光、壁癌、電費計算。請以親身經歷的事實描述。":"Review landlords, noise, light, damp and electricity billing anonymously. Stick to facts you experienced.",
    "房間要轉租、房東招租都在這裡，請寫清楚租金、坪數、可入住日。":"Sublets and listings. Include rent, size and move-in date.", "找人分租、找室友一起租整層。":"Find people to share a flat.",
    "避雷":"Warning", "心得":"Review", "轉租":"Sublet", "招租":"For rent", "短租":"Short-term", "找房一起租":"Rent together",
    "閒聊交友":"Chat", "居住溝通":"Neighbours", "公用設施":"Shared facilities", "公告":"Notice", "詢問":"Question",
    "我住這裡":"I live here", "已設為我住的地方":"Set as my home", "＋ 找不到你的租屋處？新增":"+ Can't find your place? Add it", "清單裡沒有我的租屋處？新增":"My place isn't listed — add it",
    "選一棟租屋處進入它的大廳，或選「全區廣播」看整條路的公告。":"Pick a building to open its lobby, or an area board for the whole street.",
    "（使用者新增的社區頻道）":" (added by users)", "免責聲明　":"Disclaimer  ",
    "本人保證所述內容皆為親身經歷之事實，未捏造或誇大，並對發文內容自負法律責任（包括但不限於刑法第 310 條誹謗罪及民事損害賠償）。本站僅提供交流平台，不代表本站立場，亦不擔保內容之真實性。請勿揭露房東或他人之全名、電話、身分證字號等個人資料。被檢舉內容將暫時隱藏並由管理員審核。":"I confirm this is my own first-hand experience, not invented or exaggerated, and I am legally responsible for it (including defamation under Article 310 of the Criminal Code and civil damages). This site is only a platform, does not share these views and does not guarantee accuracy. Do not post anyone's full name, phone or ID number. Reported content is hidden pending admin review.",
    "我已閱讀並同意免責聲明：":"I have read and agree to the disclaimer: ", "發表避雷文前必須勾選同意免責聲明。":"You must agree to the disclaimer before posting a review.",
    "隔音":"Soundproofing", "房東態度":"Landlord", "CP 值":"Value", "請完成三項評分。":"Please rate all three.", "評論的租屋處":"Place reviewed", "房子在哪":"Location",
    "租金":"Rent", "例：月租 6,500（含水）":"e.g. NT$6,500/month incl. water", "房型":"Type", "（不指定）":"(not specified)", "（不設定）":"(none)",
    "具體寫下你遇到的事實：時間、狀況、房東怎麼處理。避免人身攻擊與未經證實的猜測。":"Describe the facts: when, what happened, how the landlord handled it. No personal attacks or unverified guesses.",
    "新增我的租屋處":"Add my place", "租屋名稱":"Name", "例：中央路 XX 號透天":"e.g. house at No. XX Zhongyang Rd.", "區域":"Area", "巷弄（選填）":"Lane (optional)", "例：232 巷":"e.g. Lane 232",
    "房屋類型":"Type", "建立後會產生這棟的專屬大廳，之後輸入相同名稱的人會被引導加入同一個頻道。":"Creates a lobby for this building; people who type the same name will be guided to it.",
    "這些社區跟你輸入的很像，是同一個地方嗎？直接加入就能找到同棟鄰居：":"These look similar — same place? Join to find your neighbours:",
    "建立社區頻道":"Create lobby", "請輸入租屋處名稱（至少 2 個字）。":"Enter a name (at least 2 characters).", "已經有同名的社區了，請直接加入上面的頻道。":"A lobby with this name exists — join it above.",
    "目前無法寫入資料，所以不能新增社區。":"Can't save right now, so the lobby can't be created.",
    "獨立套房":"Studio", "分租套房":"Shared-flat room", "雅房":"Room (shared bath)", "家庭式整層":"Whole flat", "整棟透天":"Whole house",
    "後門・中央路":"Back gate · Zhongyang Rd.", "中央路 232 巷":"Zhongyang Rd. Lane 232", "中央路 216 巷":"Zhongyang Rd. Lane 216", "宵夜街・五興路":"Late-night street · Wuxing Rd.",
    "中大路・側門":"Zhongda Rd. · Side gate", "新興路・環中東路":"Xinxing Rd. · Huanzhong E. Rd.", "中正路・中壢市區":"Zhongzheng Rd. · Zhongli city", "其他地區":"Elsewhere",
    "後門商圈":"Back-gate shops", "後門商圈巷弄":"Back-gate lanes", "含 86 弄":"incl. Alley 86", "含 331 巷":"incl. Lane 331", "中央路 216・232 巷":"Zhongyang Rd. Lanes 216 · 232",
    // ---------- departments ----------
    "系所看板":"Department boards", "依學院分":"By college", "這是我的系":"My department", "已設為我的系":"Set as my department",
    "文學院":"College of Liberal Arts", "理學院":"College of Science", "工學院":"College of Engineering", "管理學院":"College of Management", "資訊電機學院":"College of EECS",
    "地球科學學院":"College of Earth Sciences", "客家學院":"College of Hakka Studies", "生醫理工學院":"College of Health Sciences & Technology", "松濤全人學院":"Songtao College",
    "中國文學系":"Chinese Literature", "英美語文學系":"English", "法國語文學系":"French", "哲學研究所":"Philosophy (Grad.)", "藝術學研究所":"Art Studies (Grad.)", "歷史研究所":"History (Grad.)",
    "學習與教學研究所":"Learning & Instruction (Grad.)", "物理學系":"Physics", "數學系":"Mathematics", "化學學系":"Chemistry", "光電科學與工程學系":"Optics & Photonics",
    "統計研究所":"Statistics (Grad.)", "天文研究所":"Astronomy (Grad.)", "化學工程與材料工程學系":"Chemical & Materials Eng.", "土木工程學系":"Civil Engineering", "機械工程學系":"Mechanical Engineering",
    "能源工程研究所":"Energy Engineering (Grad.)", "環境工程研究所":"Environmental Eng. (Grad.)", "材料科學與工程研究所":"Materials Science (Grad.)", "企業管理學系":"Business Administration",
    "資訊管理學系":"Information Management", "財務金融學系":"Finance", "經濟學系":"Economics", "會計研究所":"Accounting (Grad.)", "產業經濟研究所":"Industrial Economics (Grad.)",
    "人力資源管理研究所":"Human Resource Mgmt. (Grad.)", "工業管理研究所":"Industrial Management (Grad.)", "電機工程學系":"Electrical Engineering", "資訊工程學系":"Computer Science",
    "通訊工程學系":"Communication Engineering", "網路學習科技研究所":"Network Learning Tech. (Grad.)", "人工智慧國際碩士學位學程":"Int'l Master's in AI", "地球科學學系":"Earth Sciences",
    "大氣科學學系":"Atmospheric Sciences", "太空科學與工程學系":"Space Science & Eng.", "應用地質研究所":"Applied Geology (Grad.)", "水文與海洋科學研究所":"Hydrology & Oceanography (Grad.)",
    "客家語文暨社會科學學系":"Hakka Language & Social Sciences", "法律與政府研究所":"Law & Government (Grad.)", "生命科學系":"Life Sciences", "生醫科學與工程學系":"Biomedical Sciences & Eng.",
    "認知神經科學研究所":"Cognitive Neuroscience (Grad.)", "通識教育":"General Education", "語言中心":"Language Center", "體育室":"Physical Education",
    // ---------- food ----------
    "中大美食地圖":"NCU food map", "＋ 標一間店":"+ Add a spot", "正餐":"Meals", "小吃":"Snacks", "早餐":"Breakfast", "飲料咖啡":"Drinks & coffee", "宵夜":"Late night", "甜點":"Desserts",
    "大家一起編輯的地圖：任何人都能新增店家、修正位置、更新營業狀態（例如校內餐廳暫停營業、寒暑假休息）。點店家看評分與留言，一鍵用 Google 地圖導航。":"A map everyone edits: add places, fix locations and update status (e.g. campus restaurants paused or closed for vacation). Tap a place for ratings and comments, and open it in Google Maps.",
    "實心圓點＝營業中；半透明虛線＝暫停營業或寒暑假休息；灰色＝已歇業。虛線圓圈是從中大正門算起的步行距離。":"Solid = open; faded dashed = paused or vacation break; grey = closed. Dashed circles show walking distance from the main gate.",
    "隱藏已歇業":"Hide closed", "管理員：編輯地標":"Admin: edit landmarks", "離正門最近":"Nearest", "評分最高":"Top rated",
    "地圖上還沒有店":"No places on the map yet", "從下面的「附近店家指南」挑一間你知道位置的店，按「標上地圖」就好。":"Pick a place you know from the guide below and tap “Pin on map”.",
    "標第一間店":"Add the first place", "附近店家指南":"Nearby places guide", "還沒標上地圖的店":"Not yet on the map", "整理自":"From ",
    "，可能有店已歇業或搬家。吃過的話，按「標上地圖」幫大家定位。":"; some may have closed or moved. If you've eaten there, tap “Pin on map”.",
    "這一區的店都已經標上地圖了。":"Every place in this area is on the map.", "Google 地圖":"Google Maps", "標上地圖":"Pin on map", "在 Google 地圖開啟":"Open in Google Maps",
    "編輯資訊・狀態":"Edit info · status", "看留言・必點":"Comments · must-tries", "你的評分":"Your rating", "給個評分":"Rate it", "還沒有評分":"No ratings yet",
    "營業中":"Open", "暫停營業":"Paused", "寒暑假暫停":"Closed for vacation", "已歇業":"Closed", "標一間店":"Add a place", "編輯店家":"Edit place", "店名":"Name",
    "營業狀態":"Status", "類型":"Type", "價位":"Price range", "$ 百元內":"$ under NT$100", "$$$ 250 以上":"$$$ over NT$250", "位置":"Location",
    "在 Google 地圖長按（手機）或右鍵（電腦）店家位置，複製座標貼上最準。":"Long-press (phone) or right-click (computer) the spot in Google Maps and paste the coordinates — that's most accurate.",
    "貼上 Google 地圖連結或座標，例：24.9705, 121.1928":"Paste a Google Maps link or coordinates, e.g. 24.9705, 121.1928", "貼上 Google 地圖連結或座標":"Paste a Google Maps link or coordinates",
    "尚未定位":"Not located yet", "在地圖上點選":"Pick on map", "在地圖上點店家的位置":"Tap the place on the map", "點地圖選位置":"Tap the map to choose",
    "營業時間（選填）":"Hours (optional)", "例：17:00–02:00，週一休":"e.g. 17:00–02:00, closed Mon", "推薦說明（選填）":"Recommendation (optional)",
    "必點、份量、適合幾個人、要不要排隊":"Must-tries, portions, group size, queues",
    "這是大家一起編輯的地圖，你的修改會記錄暱稱。店家關了請改成「已歇業」，不要刪除。":"Everyone edits this map and your nickname is recorded. If a place closes, set it to Closed instead of deleting it.",
    "加到地圖":"Add to map", "儲存變更":"Save changes", "已加到地圖":"Added to map", "已更新，謝謝你":"Updated — thanks!", "請填店名。":"Enter a name.",
    "請貼上座標，或在地圖上點選位置。":"Paste coordinates or pick the spot on the map.", "這個位置離中大超過 15 公里，請確認座標。":"That's over 15 km from NCU — check the coordinates.",
    "從地圖移除這間店？":"Remove this place from the map?", "評分與留言也會看不到。":"Its ratings and comments will be hidden too.", "移除":"Remove", "已移除":"Removed",
    "編輯地圖地標":"Edit map landmarks", "一行一個：名稱, 緯度, 經度。座標可從 Google 地圖複製。":"One per line: name, latitude, longitude. Copy coordinates from Google Maps.",
    "地標已更新":"Landmarks updated", "格式不對：":"Wrong format: ", "走路 5 分":"5 min walk", "走路 10 分":"10 min walk", "走路 20 分":"20 min walk",
    "回到中大":"Back to NCU", "地圖載入失敗，請檢查網路後重新整理。":"The map failed to load. Check your connection and refresh.", "地圖":"Map",
    "中壢火車站（約略）":"Zhongli Station (approx.)", "高鐵桃園站（約略）":"THSR Taoyuan (approx.)", "校內":"On campus", "其他 ":"Other ",
    // ---------- campus map ----------
    "校內導航":"Campus map", "找教室、宿舍、餐廳。已標位置的地點可以直接開 Google 步行導航；還沒標的，可以先用 Google 搜尋，順手幫大家標上。":"Find classrooms, dorms and food. Pinned places open Google walking directions; for the rest, search Google and pin them for everyone.",
    "搜尋建築、教室、餐廳…":"Search buildings, rooms, food…", "搜尋地點":"Search places", "我的位置":"My location", "你在這裡":"You are here",
    "步行導航":"Walk there", "Google 步行導航":"Google walking directions", "Google 搜尋":"Google search", "用 Google 搜尋":"Search on Google", "標位置":"Pin it",
    "・尚未標位置":" · not pinned yet", "清單裡沒有？":"Not listed?", "＋ 新增地點":"+ Add place", "幫忙標位置":"Help pin it", "修正位置或說明":"Fix location or notes",
    "標上地點":"Pin a place", "修正地點":"Fix a place", "名稱":"Name", "類別":"Category", "說明（選填）":"Notes (optional)",
    "例：入口在大樓東側、二樓有飲水機":"e.g. entrance on the east side, water fountain on 2F",
    "最快：在 Google 地圖長按該地點，複製座標貼上。或按下方按鈕直接在地圖上點。":"Quickest: long-press the spot in Google Maps and paste the coordinates, or pick it on the map below.",
    "在地圖上點這個地點的位置":"Tap this place on the map", "地圖是大家一起編輯的。標錯了沒關係，其他人可以再修正。":"Everyone edits this map. Mistakes are fine — others can fix them.",
    "請填地點名稱。":"Enter a place name.", "這個位置離校園太遠了，請確認座標。":"That's too far from campus — check the coordinates.", "已更新地圖，謝謝你":"Map updated — thanks!",
    "這個裝置無法取得位置":"This device can't get your location", "沒有取得位置權限":"Location permission denied",
    "教學":"Teaching", "圖書館":"Libraries", "宿舍":"Dorms", "餐廳":"Dining", "運動":"Sports", "地標":"Landmarks", "行政服務":"Admin & services",
    "綜合教學大樓":"General Teaching Bldg.", "科學一館":"Science Bldg. 1", "科學二館":"Science Bldg. 2", "科學三館":"Science Bldg. 3", "科學四館":"Science Bldg. 4", "科學五館":"Science Bldg. 5",
    "志希館":"Zhixi Hall", "工程一館":"Engineering Bldg. 1", "工程二館":"Engineering Bldg. 2", "工程三館":"Engineering Bldg. 3", "工程四館":"Engineering Bldg. 4", "工程五館":"Engineering Bldg. 5",
    "鴻經館":"Hongjing Hall", "據德樓":"Jude Bldg.", "客家學院大樓":"Hakka College Bldg.", "人文社會科學大樓":"Humanities & Social Sciences Bldg.", "國鼎光電大樓":"Kuo-Ting Optoelectronics Bldg.",
    "研究中心大樓":"Research Center Bldg.", "太空遙測研究中心":"Center for Space & Remote Sensing", "創新育成中心":"Innovation Incubation Center", "總圖書館":"Main Library",
    "中正圖書館":"Chung-Cheng Library", "國鼎圖書資料館":"Kuo-Ting Library", "校史館":"History Museum", "國際學舍":"International House", "男研舍":"Men's Grad. Dorm",
    "女14舍":"Women's Dorm 14", "女1～4舍":"Women's Dorms 1–4", "女1舍":"Women's Dorm 1", "女2舍":"Women's Dorm 2", "女3舍":"Women's Dorm 3", "女4舍":"Women's Dorm 4",
    "男3舍":"Men's Dorm 3", "男5舍":"Men's Dorm 5", "男6舍":"Men's Dorm 6", "男7舍":"Men's Dorm 7", "男9舍":"Men's Dorm 9", "男9A舍":"Men's Dorm 9A", "男9B舍":"Men's Dorm 9B",
    "男11舍":"Men's Dorm 11", "男12舍":"Men's Dorm 12", "男13舍":"Men's Dorm 13", "曦望居":"Xiwang Residence", "中大會館":"NCU Guest House",
    "松苑餐廳":"Songyuan Dining Hall", "松果餐廳":"Songguo Dining Hall", "九舍餐廳":"Dorm 9 Dining Hall", "女14舍地下商場":"Women's Dorm 14 basement shops", "松果餐廳（男7舍）":"Songguo Dining Hall (Men's Dorm 7)",
    "依仁堂":"Yi-Ren Hall (gym)", "操場":"Track", "室內游泳池":"Indoor pool", "籃球場":"Basketball courts", "網球場":"Tennis courts", "排球場":"Volleyball courts", "羽球館":"Badminton hall",
    "棒壘球場":"Baseball field", "溜冰場":"Skating rink", "攀岩場":"Climbing wall", "中大湖":"NCU Lake", "國泰樹":"Cathay Tree", "太極銅雕":"Tai Chi Bronze Sculpture", "百花川":"Baihua Stream",
    "中大正門":"Main Gate", "後門":"Back Gate", "觀景台":"Lookout", "行政大樓":"Administration Bldg.", "志道樓":"Zhidao Bldg.", "游藝館":"Youyi Hall", "前門警衛室公車站":"Front gate guardhouse bus stop",
    "男":"Men", "女":"Women", "研究生":"Graduate", "性別友善":"All-gender", "115學年為女宿":"Women's dorm in 2026–27", "東區":"East", "西區":"West", "南區":"South", "北區":"North", "宿舍綜合":"Dorms general",
    // ---------- timetable ----------
    "我的課表":"My timetable", "只有你自己看得到。上課前會提醒你；想在沒開松果時也收到提醒，就把課表匯入手機行事曆。":"Only you can see this. You'll get reminders before class; to get them even when Songguo is closed, import it into your phone calendar.",
    "＋ 新增課程":"+ Add class", "匯入手機行事曆":"Import to phone calendar", "提醒設定":"Reminder settings", "這天沒有課。":"No classes this day.", "還沒有課程":"No classes yet",
    "按「新增課程」輸入課名、星期、時間和教室。":"Tap Add class and enter the name, day, time and room.", "新增第一堂課":"Add your first class",
    "編輯課程":"Edit class", "課名":"Course", "例：電子學（一）":"e.g. Electronics I", "星期":"Day", "上課":"Starts", "下課":"Ends", "教室":"Room", "例：工程五館 E1-101":"e.g. Engineering 5 E1-101",
    "老師":"Teacher", "選填":"Optional", "顏色":"Colour", "請填課名。":"Enter a course name.", "下課時間要比上課時間晚。":"End time must be after start.", "已儲存":"Saved",
    "開啟網頁提醒":"Turn on web reminders", "松果開著時（含加到主畫面的 App），上課前跳出通知。":"Get a notification before class while Songguo is open (including the home-screen app).",
    "提醒時間":"Remind me", "學期結束日":"Semester ends", "匯入行事曆時，課程會每週重複到這一天。":"Imported classes repeat weekly until this date.",
    "瀏覽器沒有允許通知，改用行事曆提醒吧":"Notifications blocked — use calendar reminders instead", "網頁提醒尚未開啟，可在「提醒設定」打開。":"Web reminders are off — turn them on in Reminder settings.",
    "這個瀏覽器不支援網頁通知，請用「匯入手機行事曆」設定提醒。":"This browser doesn't support notifications — use Import to phone calendar.", "已下載課表檔，打開它就能加入手機行事曆":"Downloaded — open the file to add it to your calendar",
    "課表已存在這台裝置，但同步失敗：":"Saved on this device, but sync failed: ", "松果上課提醒":"Songguo class reminder", "上課提醒：":"Class reminder: ",
    "一":"Mon", "二":"Tue", "三":"Wed", "四":"Thu", "五":"Fri", "六":"Sat", "日":"Sun", "週":"",
    // ---------- weather ----------
    "中壢天氣":"Zhongli weather", "中央大學所在的桃園市中壢區。":"Zhongli District, Taoyuan — home of NCU.", "接下來 36 小時":"Next 36 hours",
    "天氣資料暫時抓不到，稍後再試。":"Weather data unavailable — try again later.", "載入中…":"Loading…", "中央氣象署":"Central Weather Administration", "Open-Meteo（備援）":"Open-Meteo (backup)",
    "晴":"Sunny", "晴時多雲":"Mostly sunny", "多雲":"Cloudy", "陰":"Overcast", "霧":"Fog", "毛毛雨":"Drizzle", "凍雨":"Freezing rain", "小雨":"Light rain", "中雨":"Rain", "大雨":"Heavy rain",
    "陣雨":"Showers", "大陣雨":"Heavy showers", "小雪":"Light snow", "雪":"Snow", "大雪":"Heavy snow", "陣雪":"Snow showers", "雷雨":"Thunderstorms", "雷雨冰雹":"Thunderstorms with hail",
    "中壢・":"Zhongli · ",
    // ---------- online & messages ----------
    "現在在線":"Online now", "在線狀態暫時無法使用，請重新整理。":"Online status unavailable — please refresh.", "在線狀態無法使用":"Online status unavailable", "目前沒有其他人在這裡":"No one else is here",
    "（你）":" (you)", "匿名":"Anonymous", "提出私訊請求":"Send message request",
    "在「在線」頁面、租屋大廳或市集看到的人和貼文作者，都可以提出私訊請求。對方同意後才會開啟對話，訊息在你的瀏覽器裡加密，只有你們兩個人看得到內容。":"Send a message request to anyone you see on the Online page, in housing lobbies or the market, or to a post's author. The chat opens once they accept; messages are encrypted in your browser so only the two of you can read them.",
    "收到的請求":"Requests received", " 想跟你私訊":" wants to message you", "拒絕":"Decline", "同意":"Accept", "目前沒有待回覆的請求。":"No pending requests.", "對話":"Chats", "加密對話":"Encrypted chat",
    "還沒有對話":"No chats yet", "到「在線」看看現在誰在，點他的暱稱就能提出私訊請求。":"Check Online to see who's around and tap a nickname to send a request.",
    "我送出的請求":"Requests sent", "對方婉拒":"Declined", "等待回覆":"Waiting", "已同意，可以開始對話":"Accepted — you can chat now", "已拒絕":"Declined",
    "返回":"Back", "輸入訊息…":"Type a message…", "訊息":"Message", "傳送":"Send", "打聲招呼吧。要不要交換 LINE 或其他聯絡方式，由你們自己決定。":"Say hi. Whether to swap LINE or other contacts is up to you.",
    "對方還沒開啟過松果的私訊功能，請等對方上線後再試。":"They haven't set up messaging yet — try again once they're online.", "對方還沒開啟過私訊功能，暫時無法傳送。":"They haven't set up messaging yet, so this can't be sent.",
    "（無法解密這則訊息）":"(couldn't decrypt this message)", "無法私訊":"Can't message", "無法辨識你的身分，請重新整理後再試。":"We couldn't identify you — refresh and try again.",
    "這是你自己":"That's you", "開啟對話中…":"Opening chat…",
    "對方同意後才會開啟對話。對話內容會加密，只有你們兩個看得到；要不要透露真實身分或聯絡方式由你們自己決定。":"The chat opens after they accept. It's encrypted so only the two of you can read it; sharing real names or contacts is up to you.",
    "你已經送出請求，正在等對方回覆。":"Request sent — waiting for a reply.", "打個招呼（選填）":"Say hi (optional)", "例：你好，我也住 3 樓，想問一下烘衣機的事":"e.g. Hi, I'm on 3F too — quick question about the dryer",
    "重新送出":"Send again", "送出請求":"Send request", "已送出請求":"Request sent", "無法辨識你的身分，所以不能檢舉。":"We couldn't identify you, so you can't report.",
    // ---------- settings & install ----------
    "這些設定會存在你的帳號裡，換裝置或關掉再開都還在。系所和住處只用來幫你把常用的版放在首頁，其他人看不到。":"Settings are saved to your account and survive restarts. Department and home only personalise your home page — no one else sees them.",
    "我的系所":"My department", "我住的地方":"Where I live", "使用者 ID（設定管理員時用）：":"User ID (for admin setup): ", "儲存":"Save", "取消":"Cancel", "知道了":"Got it", "語言":"Language",
    "松果是免費的網頁 App，加到主畫面後點開就是全螢幕，跟一般 App 一樣使用，不用到 App Store 下載。":"Songguo is a free web app. Add it to your home screen and it opens full-screen like any app — no App Store needed.",
    "你已經是用安裝版開啟的，不用再裝一次。":"You're already using the installed app.", "一鍵安裝":"Install", "iPhone・iPad（Safari）":"iPhone · iPad (Safari)", "Android（Chrome）":"Android (Chrome)",
    "用 Safari 打開松果網址。":"Open Songguo in Safari.", "點下方工具列的「分享」按鈕。":"Tap the Share button in the toolbar.", "往下滑，選「加入主畫面」，再點「新增」。":"Scroll down, choose “Add to Home Screen”, then tap Add.",
    "用 Chrome 打開松果網址。":"Open Songguo in Chrome.", "點右上角「⋮」選單。":"Tap the ⋮ menu at the top right.", "選「安裝應用程式」或「加到主畫面」。":"Choose “Install app” or “Add to Home screen”.",
    "你的匿名身分存在這支手機的瀏覽器裡。換手機或清除瀏覽器資料會變成新的匿名身分。":"Your anonymous identity lives in this phone's browser. A new phone or cleared browser data means a new identity.",
    // ---------- errors & states ----------
    "目前連不上伺服器，所以看不到也無法發布內容。請檢查網路後重新整理。":"Can't reach the server, so content can't load or be posted. Check your connection and refresh.",
    "你目前是唯讀身分：可以瀏覽，但無法發文、留言或私訊。":"You're read-only: you can browse but not post, comment or message.", "你目前沒有寫入權限，只能瀏覽。":"You don't have write access — browse only.",
    "資料庫空間已滿，請管理員清理舊資料。":"The database is full — an admin needs to clear old data.", "操作太頻繁了，稍等幾秒再試。":"Too many actions — wait a few seconds.",
    "沒有送出成功，請檢查網路後再試一次。":"That didn't go through — check your connection and try again.", "剛剛":"just now", "依仁堂 ":"Yi-Ren Hall ",
    "、":", ", "。":".", "「":"“", "」":"”", "」大廳":"” lobby", "」提出私訊請求":"”", "向「":"Message request to “", "發文到「":"Post to “", "已建立「":"Created “", "已加入 ":"Joined ",
    "　":" ", " 大廳":" lobby", " 中壢":" Zhongli", " 標記・":" pinned · ", "由 ":"By ", "・走路約 ":" · walk ~", " 分":" min", "・點標題看原公告":" · tap title for original",
    // ---------- food map (v2) ----------
    "美食地圖":"Food map", "只看營業中":"Open only", "＋ 新增店家":"+ Add a place", "新增店家":"Add a place", "店家指南":"Guide",
    "地圖上已標出中大附近的餐廳。點店家看評分、留言和導航；找不到的店，按「＋ 新增店家」把圖釘拖到店門口就好。":"Restaurants around NCU are already on the map. Tap one for ratings, comments and directions. Can't find a place? Tap “+ Add a place” and drag the pin to its door.",
    "松果店家（可評分、留言）":"Songguo places (ratings & comments)", "附近餐廳（OpenStreetMap）":"Nearby restaurants (OpenStreetMap)",
    "正在載入附近餐廳…":"Loading nearby restaurants…", "附近餐廳暫時載入失敗":"Couldn't load nearby restaurants", "附近餐廳暫時載入失敗，稍後再試。":"Couldn't load nearby restaurants — try again later.",
    "附近餐廳的位置來自 OpenStreetMap 貢獻者，每天更新；松果店家由大家一起編輯，店關了請改成「已歇業」。":"Nearby restaurant locations come from OpenStreetMap contributors and update daily. Songguo places are edited by everyone — if a place closes, mark it “Closed”.",
    "還沒有人加入店家":"No places added yet", "點地圖上的任何一間餐廳，按「加入松果」就能評分和留言；地圖上沒有的店，按「＋ 新增店家」。":"Tap any restaurant on the map and choose “Add to Songguo” to rate and comment. Not on the map? Tap “+ Add a place”.",
    "沒有符合的餐廳。":"No matching restaurants.", "營業時間":"Hours", "營業時間 ":"Hours ", "加入松果":"Add to Songguo", "Google 評論":"Google reviews", "在地圖上看":"Show on map",
    "這間店還沒有人評分。加入松果後，大家就能評分、留言推薦必點，也能更新營業狀態。":"No ratings yet. Once it's added to Songguo, everyone can rate it, recommend dishes and update whether it's open.",
    "，還沒加入松果的店。有些可能已歇業或搬家；吃過的話幫大家加進來。":" places not on Songguo yet. Some may have closed or moved — if you've eaten there, add it for everyone.",
    "這一區的店都已經在松果上了。":"Every place in this area is already on Songguo.", "留言・必點":"Comments · must-try", "編輯":"Edit",
    "還沒選位置":"No location yet", "必點、份量、要不要排隊（選填）":"Must-try dishes, portions, queues (optional)", "請先在地圖上選位置。":"Pick a spot on the map first.",
    "這個位置離中大超過 15 公里，請確認位置。":"That spot is more than 15 km from NCU — please check it.", "已加到地圖，謝謝你":"Added to the map — thanks!",
    "重新選位置":"Pick again", "在地圖上選位置":"Pick on map", "更多資訊（選填）":"More details (optional)", "推薦說明":"Recommendation", "直接貼座標":"Paste coordinates",
    "在 Google 地圖長按店家位置，複製座標貼上。":"Long-press the place in Google Maps, copy the coordinates and paste them here.",
    "評分與留言也會看不到。店家只是關了的話，請改成「已歇業」。":"Its ratings and comments will disappear too. If the place just closed, mark it “Closed” instead.",
    "拖曳地圖，把圖釘對準店門口":"Drag the map so the pin sits on the shop's door", "確定位置":"Use this spot", "用我的位置":"Use my location",
    "搜尋店名、料理…":"Search places or dishes…", "搜尋店家":"Search places", "早餐店":"Breakfast", "飲料・咖啡":"Drinks · Coffee", "餐廳":"Restaurant",
    "例：咖哩老師":"e.g. Curry Teacher", "切換成中文":"切換成中文", "Switch to English":"Switch to English",
    "在地圖上選":"Pick on map", "選一棟宿舍進入它的大廳。":"Choose a dorm to enter its lobby.",
    "營業中":"Open", "暫停營業":"Temporarily closed", "寒暑假暫停":"Closed for vacation", "已歇業":"Closed",
  };

  const WKEN = { "一":"Mon", "二":"Tue", "三":"Wed", "四":"Thu", "五":"Fri", "六":"Sat", "日":"Sun" };
  const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const T = s => tr(s);
  const RX = [
    [/^星期(.)$/, (m,a) => ({一:"Monday",二:"Tuesday",三:"Wednesday",四:"Thursday",五:"Friday",六:"Saturday",日:"Sunday"})[a] || m],
    [/^約 (\d{1,2}:\d\d)$/, (m,a) => `~${a}`], [/^(\d+)巷$/, (m,a) => `Lane ${a}`], [/^(\d+)巷(\d+)弄$/, (m,a,b) => `Lane ${a}, Alley ${b}`],
    [/^松果店家 (\d+)$/, (m,a) => `Songguo ${a}`], [/^附近餐廳 (\d+)$/, (m,a) => `Nearby ${a}`], [/^由 (.+) 加入・(.+)$/, (m,a,b) => `Added by ${a} · ${T(b)}`],
    [/^把圖釘拖到「(.+)」（(.+)）$/, (m,a,b) => `Drag the pin to ${a} (${b})`], [/^把圖釘拖到「(.+)」$/, (m,a) => `Drag the pin to ${a}`],
    [/^降雨機率 (.+)%$/, (m,a) => `Rain ${a}%`],
    [/^(\d+) 分鐘前$/, (m,a) => `${a} min ago`], [/^(\d+) 小時前$/, (m,a) => `${a} h ago`], [/^(\d+) 天前$/, (m,a) => `${a} d ago`],
    [/^(\d+) 分鐘後$/, (m,a) => `in ${a} min`], [/^(\d+) 小時 (\d+) 分後$/, (m,a,b) => `in ${a} h ${b} min`],
    [/^(.+)，想聊點什麼？$/, (m,a) => `What's on your mind, ${a}?`], [/^(.+)，想說點什麼？$/, (m,a) => `What's on your mind, ${a}?`],
    [/^(\d+) 班$/, (m,a) => `${a} trips`], [/^(\d+) 人$/, (m,a) => `${a} people`], [/^(\d+) 棟$/, (m,a) => `${a} buildings`],
    [/^(\d+) 間店$/, (m,a) => `${a} places`], [/^(\d+) 處$/, (m,a) => `${a} places`], [/^(\d+) 個地點$/, (m,a) => `${a} places`], [/^(\d+)分$/, (m,a) => `${a} min`],
    [/^(\d+)月$/, (m,a) => MON[+a-1] || a], [/^(\d+) 人（含我）$/, (m,a) => `${a} people (incl. me)`], [/^(\d+) 團即將出發$/, (m,a) => `${a} upcoming rides`],
    [/^(\d+)\/(\d+) 人$/, (m,a,b) => `${a}/${b} people`], [/^剩 (\d+) 位$/, (m,a) => `${a} seats left`], [/^在線 (\d+) 人$/, (m,a) => `${a} online`],
    [/^(.+) 全區廣播$/, (m,a) => `${T(a)} — area board`], [/^(.+)・(.+) 的大小事：課程、考試、系上活動、學長姐經驗。$/, (m,a,b) => `${T(b)} (${T(a)}): courses, exams, department events and advice.`],
    [/^(.+) (\d{1,2}:\d\d) 開始(?:・(.+))?$/, (m,a,b,c) => `${a} starts at ${b}${c ? " · " + c : ""}`],
    [/^(.+) 分享・(.+)$/, (m,a,b) => `Shared by ${a} · ${T(b)}`], [/^(寒假|暑假)平日$/, (m,a) => `${T(a)} weekday`],
    [/^★ ([\d.]+)・(\d+) 人評分$/, (m,a,b) => `★ ${a} · ${b} ratings`], [/^★ ([\d.]+)（(\d+)）・$/, (m,a,b) => `★ ${a} (${b}) · `],
    [/^目前有 (\d+) 團拼車同方向$/, (m,a) => ` ${a} rides going the same way`], [/^「(.+)」分類還沒有貼文$/, (m,a) => `No posts in “${T(a)}” yet`],
    [/^・最後由 (.+) 編輯（(.+)）$/, (m,a,b) => ` · last edited by ${a} (${T(b)})`], [/^・管理員最後確認 (.+)$/, (m,a) => ` · checked by admin ${a}`],
    [/^上課前 (\d+) 分鐘$/, (m,a) => `${a} min before class`], [/^下週(.) (\d{1,2}:\d\d)$/, (m,a,b) => `Next ${WKEN[a]||a} ${b}`], [/^週(.) (\d{1,2}:\d\d)$/, (m,a,b) => `${WKEN[a]||a} ${b}`],
    [/^今天 (\d{1,2}:\d\d)・(.+)$/, (m,a,b) => `Today ${a} · ${T(b)}`], [/^明天 (\d{1,2}:\d\d)$/, (m,a) => `Tomorrow ${a}`],
    [/^中原大學 (\d{1,2}:\d\d) 發車，到中大警衛室候車後開往高鐵$/, (m,a) => `Leaves CYCU ${a}, waits at the NCU guardhouse, then to THSR`],
    [/^中原大學 (\d{1,2}:\d\d) 發車，經高鐵站（時間未公告），約此時到中大$/, (m,a) => `Leaves CYCU ${a} via THSR (time not posted), reaches NCU about now`],
    [/^中壢 (\d{1,2}:\d\d) 發車，約此時到中大，繞校內後開回中壢$/, (m,a) => `Leaves Zhongli ${a}, reaches NCU about now, loops campus and returns`],
    [/^中壢 (\d{1,2}:\d\d) 發車・約 (\d{1,2}:\d\d) 到松山機場$/, (m,a,b) => `Leaves Zhongli ${a} · Songshan Airport ~${b}`],
    [/^中大警衛室發車(?:・高鐵回程 (\d{1,2}:\d\d))?$/, (m,a) => `From the NCU guardhouse${a ? ` · back from THSR ${a}` : ""}`],
    [/^(.+)上車・約 (\d{1,2}:\d\d) 到中大$/, (m,a,b) => `Board at ${T(a)} · NCU ~${b}`], [/^松山機場 3 號候車亭上車・約 (\d{1,2}:\d\d) 到中大$/, (m,a) => `Board at Songshan Airport shelter 3 · NCU ~${a}`],
    [/^今天以「(.+)」班表計算・$/, (m,a) => `Using the ${T(a)} timetable · `], [/^今天全部班次（(.+)）$/, (m,a) => `All trips today (${T(a)})`], [/^自動（今天：(.+)）$/, (m,a) => `Auto (today: ${T(a)})`],
    [/^明天首班 (.+)・(\d{1,2}:\d\d)$/, (m,a,b) => `First tomorrow: ${a} · ${b}`], [/^往 (.+)$/, (m,a) => `To ${T(a)}`], [/^從 (.+) 回中大$/, (m,a) => `${T(a)} → NCU`],
    [/^以「(.+)」發言…$/, (m,a) => `Say something as ${a}…`], [/^來源：(.+?)(・點標題看原公告)?$/, (m,a,b) => `Source: ${T(a)}${b ? " · tap the title for the original" : ""}`],
    [/^來自 (.+)・(.+)$/, (m,a,b) => `From ${T(a)} · ${T(b)}`], [/^只有住在「(.+)」的鄰居才懂的事：.*$/, (m,a) => `For neighbours at ${a}: noise, parcels, shared appliances, late-night food runs.`],
    [/^發給整個「(.+)」的公告：.*$/, (m,a) => `Notices for all of ${T(a)}: water or power cuts, garbage truck times, suspicious people, roadworks.`],
    [/^已定位：([\d.]+), ([\d.]+)(?:（離正門 (.+)）)?$/, (m,a,b,c) => `Located: ${a}, ${b}${c ? ` (${c} from main gate)` : ""}`],
    [/^已標位置 (\d+) \/ (\d+)$/, (m,a,b) => `${a} / ${b} pinned`], [/^已被檢舉 (\d+) 次，其他人目前看不到這篇。$/, (m,a) => `Reported ${a} times — hidden from others for now.`],
    [/^已評 (\d) 顆星$/, (m,a) => `Rated ${a} stars`], [/^給 (\d) 顆星$/, (m,a) => `Give ${a} stars`], [/^(.+) (\d) 分$/, (m,a,b) => `${T(a)} ${b}`],
    [/^最後由 (.+) 編輯・(.+)$/, (m,a,b) => `Last edited by ${a} · ${T(b)}`], [/^由 (.+) 標記・(.+)$/, (m,a,b) => `Pinned by ${a} · ${T(b)}`],
    [/^現在有 (\d+) 人在大廳。$/, (m,a) => `${a} in the lounge now.`], [/^目前在線 (\d+) 人：$/, (m,a) => `${a} online here: `],
    [/^目前有 (\d+) 個人開著松果。.*$/, (m,a) => `${a} people have Songguo open. Tap a nickname to send a message request — the chat starts once they accept.`],
    [/^目前沒有標示「(.+)」的活動$/, (m,a) => `No events tagged “${T(a)}”`], [/^網頁提醒已開啟：上課前 (\d+) 分鐘通知（需要松果開著）。$/, (m,a) => `Web reminders on: ${a} min before class (Songguo must be open).`],
    [/^降雨機率 (.+)%$/, (m,a) => `Chance of rain ${a}%`], [/^離正門約 (.+)・走路約 (\d+) 分$/, (m,a,b) => `About ${a} from the main gate · ~${b} min walk`], [/^離正門 (.+)$/, (m,a) => `${a} from main gate`],
    [/^顯示已歇業（(\d+)）$/, (m,a) => `Show closed (${a})`], [/^已加入 (.+)$/, (m,a) => `Joined ${T(a)}`], [/^已建立「(.+)」大廳$/, (m,a) => `Created the ${a} lobby`],
    [/^發文到「(.+)」$/, (m,a) => `Post to “${T(a)}”`], [/^向「(.+)」提出私訊請求$/, (m,a) => `Message request to ${a}`], [/^(.+) 大廳$/, (m,a) => `${T(a)} lobby`],
    [/^（(.+)）$/, (m,a) => `(${T(a)})`], [/^上課提醒：(.+)$/, (m,a) => `Class reminder: ${T(a)}`], [/^課表已存在這台裝置，但同步失敗：(.+)$/, (m,a) => `Saved on this device, but sync failed: ${T(a)}`],
    [/^格式不對：(.+)$/, (m,a) => `Wrong format: ${a}`], [/^週(.)$/, (m,a) => WKEN[a] || m],
  ];
  const WEEKDAY_IN = /（([一二三四五六日])）/g;

  function tr(s){
    if (lang !== "en" || s == null) return s;
    s = String(s); if (!/[　-〿㐀-鿿＀-￯]/.test(s)) return s;
    const m = s.match(/^([\s　]*)([\s\S]*?)([\s　]*)$/); const core = m[2];
    let out = Object.prototype.hasOwnProperty.call(EN, s) ? EN[s] : Object.prototype.hasOwnProperty.call(EN, core) ? EN[core] : null;
    if (out != null) return Object.prototype.hasOwnProperty.call(EN, s) ? out : m[1] + out + m[3];
    for (const [rx, fn] of RX){ const mm = core.match(rx); if (mm){ out = fn(...mm); break; } }
    if (out == null) out = core.replace(WEEKDAY_IN, (x, d, off, str) => ` (${WKEN[d]})` + (/[\d\w]/.test(str[off + x.length] || "") ? " " : ""));
    return m[1] + out + m[3];
  }

  const SKIP = "script,style,[translate=no],textarea,.tt-osm,.tt-ours";
  function translate(root){
    if (lang !== "en" || !root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = []; let n;
    while ((n = walker.nextNode())) nodes.push(n);
    for (const t of nodes){
      const p = t.parentElement; if (!p || p.closest(SKIP)) continue;
      const v = t.nodeValue; if (!v || !/[　-〿㐀-鿿＀-￯]/.test(v)) continue;
      const out = tr(v); if (out !== v) t.nodeValue = out;
    }
    const els = root.querySelectorAll ? root.querySelectorAll("[placeholder],[aria-label],[title]") : [];
    for (const el of els){
      if (el.closest("[translate=no]")) continue;
      for (const a of ["placeholder","aria-label","title"]){ const v = el.getAttribute(a); if (v){ const o = tr(v); if (o !== v) el.setAttribute(a, o); } }
    }
  }
  function setLang(l){ lang = l === "en" ? "en" : "zh"; try { localStorage.setItem(KEY, lang); } catch {} document.documentElement.lang = lang === "en" ? "en" : "zh-Hant"; }
  document.documentElement.lang = lang === "en" ? "en" : "zh-Hant";

  const NICK_EN = {
    adj: ["Sleepy","Late-night","Caffeinated","Lakeside","Back-gate","Hungry","Early-bird","Guitar-playing","Plant-loving","Bus-chasing","Midnight","Studious"],
    noun: ["Squirrel","Pinecone","Owl","Neighbour","Commuter","Night Owl","Senior","Wanderer","Snacker","Cat","Roommate","Explorer"],
  };
  window.sgI18n = { tr, translate, get lang(){ return lang; }, setLang,
    randNick(){ const a = NICK_EN.adj, b = NICK_EN.noun; return a[Math.random()*a.length|0] + " " + b[Math.random()*b.length|0]; } };
})();
