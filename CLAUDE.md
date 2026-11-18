# 松果 中大生活通 — 給團隊 Claude 的專案說明

這份檔案會被 Claude Code 自動讀取。開工前請完整讀完，所有修改都要遵守「開發規則」。

## 專案是什麼

中央大學學生的匿名生活網站，正式網址 https://ncu-songguo.vercel.app 。
功能：公車時刻、拼車、近期活動、即時大廳與看板、課表提醒、美食地圖、校內導航、二手市集、租屋大廳、系所看板、加密私訊、中英文切換。
團隊正以這個網站參加「Microsoft × NCU AI 創新應用主題挑戰賽」（12/4 23:59 繳件，12/30 決賽）。
評分五項各 20%：問題與需求、AI 創新應用、解決方案、影響力、成果表達。網站目前**沒有任何 AI 功能**，這次要補上。

## 架構

純靜態前端 + Vercel serverless functions + Supabase，**沒有建置步驟**（沒有 npm build、沒有框架）。

```
web/index.html   整個 App：所有畫面、樣式、邏輯都在這一個檔案（約 2,700 行）
web/i18n.js      中英文切換：英文模式下把畫面上的中文換成英文（中文 → 英文對照表 EN = { ... }）
web/shim.js      資料層：把 Supabase 包成 claude.use("db" | "user" | "room") 介面
web/config.js    Supabase 網址與公開金鑰（publishable key，本來就是公開的）
web/sw.js        Service worker；改了前端後把 CACHE 版本號 +1
api/*.js         Vercel serverless functions，網址是 /api/檔名
api/_lib/ai.js   ★ 共用的 AI 呼叫程式。所有 AI 功能都用它，不要自己寫呼叫模型的程式
supabase/schema.sql  資料庫結構與權限規則（Row Level Security），可重複執行
```

### index.html 的寫法
- 用 `h(tag, attrs, ...children)` 產生 DOM（不是 React）。`attrs` 裡 `onclick` 之類會變成事件。
- 全域狀態在 `S`。資料變動後呼叫 `renderKeep()` 重繪；**不要直接呼叫 `render()`**，`renderKeep()` 會避開使用者正在打字、選字的時候（修過注音輸入被打斷的問題，不要改壞）。
- 會即時更新的區塊（聊天列表等）用 `live(key, build)` 包起來，打字時只更新這些區塊。
- 分頁列表在 `TABS`，分頁內容對照在 `page()` 裡的 `P = { ... }`。新增分頁兩邊都要加。
- 彈出視窗：`openModal({ k:"名稱" })`，對照表在 `renderOverlay()` 裡的 `B = { ... }`，用 `sheet(標題, ...內容)` 產生。
- 提示訊息：`toast("…")`。是否能發文：`canPost()`。
- 樣式用 CSS 變數（`--bg`、`--surface`、`--ink`、`--muted`、`--line`、`--pine` 等），淺色、深色模式都要好看，不要寫死顏色。

### 資料（Supabase）
- 所有資料存在一張表 `public.docs`（`path`、`collection`、`doc_id`、`owner`、`data jsonb`），前端用 Firestore 風格操作：
  `S.db.collection("posts").orderBy("ts","desc").limit(50).onSnapshot(...)`、`S.db.doc("posts/abc").set({...})`。
- 現有 collection：posts、lobby、rides、riders、events、going、food、foodrate、spots、likes、reports、locations、dmreq、dms/…、data/users/<uid>/…（個人私密）。
- 寫入的資料若有 `uid` 欄位，必須等於自己的 `S.uid`（資料庫會擋冒名）。
- 新增 collection 若需要防洗版，在 `schema.sql` 的 `docs_rate_limit` 加上限，並告訴大家要重新執行 schema.sql。
- 使用者是匿名登入（Supabase anonymous sign-in），沒有帳號密碼。

### 伺服器端 API（api/*.js）
- 格式：`module.exports = async (req, res) => { ... res.status(200).json({...}) }`，Node 18+，可直接用 `fetch`。
- 呼叫 AI：
  ```js
  const { chat, rateLimit } = require("./_lib/ai");
  if (!rateLimit(req, 12)) return res.status(429).json({ error: "太頻繁了，請稍後再試" });
  const r = await chat([{ role: "system", content: "…" }, { role: "user", content: "…" }], { json: true, maxTokens: 500 });
  // r.text 是模型回覆；json:true 時 r.json 是解析好的物件
  ```
- AI 尚未設定金鑰時，`chat()` 會丟出 `code === "ai_not_configured"` 的錯誤，前端要顯示友善訊息，不能整頁壞掉。
- 需要長時間執行的 function，在 `vercel.json` 的 `functions` 設 `maxDuration`（上限 60）。

## 開發規則（一定要遵守）

1. **不要直接改 main。** 每個人在自己的分支開發（例：`ai-assistant`、`ai-translate`、`ai-events`），完成一段就推上 GitHub 並開 Pull Request 到 main。
   PR 開好後 Vercel 會自動產生預覽網址，用預覽網址測試，確定沒問題才合併。
2. **金鑰、密碼絕對不能寫進程式或推上 GitHub**（repo 是公開的）。AI 金鑰只放在 Vercel 環境變數。Supabase 的 service_role / secret key 不能出現在任何檔案。
3. **新功能盡量寫在新檔案**（新的 `api/xxx.js`；前端若邏輯很多，可新增 `web/xxx.js` 並在 index.html 用 `<script src>` 載入），只在 index.html 加最少的接點，避免三個人互相衝突。
4. 合併前先 `git pull origin main`，有衝突就請 Claude 協助解決，保留雙方的修改。
5. 所有給使用者看的文字，**同時在 `web/i18n.js` 的 `EN` 加上英文**。使用者自己寫的內容（貼文、暱稱、店名）加 `translate="no"`，不要被翻譯。
6. 改了前端就把 `web/sw.js` 的 `CACHE` 版本號 +1，使用者手機才會拿到新版。
7. 每次修改後至少檢查：
   - `node --check api/你的檔案.js` 沒有語法錯誤
   - 本機開 `cd web && python3 -m http.server 8080` 看畫面（/api 在本機不會動，要用 Vercel 預覽網址測）
   - 手機寬度（約 390px）不會有東西超出畫面、淺色深色都正常
8. 不確定的事先問隊友，不要猜。不要刪除或改寫別人負責的功能。

## 團隊分工（AI 功能）

| 分支 | 負責 | 功能 |
|---|---|---|
| `ai-assistant` | 組員 A | 松果 AI 助理：自然語言問公車、活動、美食、校園生活，AI 讀網站現有資料回答（`api/ai-chat.js`） |
| `ai-translate` | 組員 B | AI 翻譯：貼文、活動、公告一鍵翻成英文；英文介面下自動提供翻譯（`api/ai-translate.js`） |
| `ai-events` | 組員 C | AI 活動擷取：用 AI 從學校公告抽出日期、時間、地點、有無餐點與時數並寫摘要，取代 `api/events.js` 的規則式解析 |

AI 金鑰由組員 C 申請（Azure for Students），交給網站擁有者加到 Vercel 環境變數後，三個功能都能使用。
在金鑰設定好之前，可以先用 GitHub Models 的免費權杖測試（見 `api/_lib/ai.js` 開頭的說明）。
