# 松果 中大生活通

中央大學學生的匿名生活圈：公車時刻、拼車、課表與上課提醒、即時大廳論壇、共同編輯的美食地圖、校內導航、校園活動、中壢天氣、二手市集、租屋大廳、系所看板、端對端加密私訊。

- 不用註冊：打開網站就自動建立匿名身分，取個暱稱就能用
- 完全免費：Supabase 免費方案 + Vercel 免費方案，手機用「加入主畫面」安裝，不用上架費
- 純靜態網站：沒有建置步驟，`web/` 資料夾就是整個網站

## 專案結構

```
web/
  index.html            整個 App（介面與功能）
  shim.js               資料層：把 Supabase 包成 App 用的 db / user / room 介面
  config.js             ← 部署前要填入你的 Supabase 網址與 anon key
  sw.js                 Service worker（可安裝成 App、網路不穩時顯示上次畫面）
  manifest.webmanifest  App 名稱與圖示
  icons/                App 圖示
api/events.js           整理近期校園活動（學校活動、校園公告、人文藝術中心）：日期、時間、地點、有沒有餐點／時數，CDN 快取 30 分鐘
api/news.js             讀取中大官網最新消息／活動（Vercel 伺服器端，CDN 快取 15 分鐘）
api/weather.js          中央氣象署中壢區天氣預報（需要 CWA_API_KEY，沒有就自動改用 Open-Meteo）
supabase/schema.sql     資料庫結構與權限規則（Row Level Security）
vercel.json             Vercel 部署設定（直接發布 web/）
```

## 部署步驟（約 15 分鐘）

### 1. 建立 Supabase 專案（免費）

1. 到 <https://supabase.com> 用 GitHub 登入，按 **New project**。
   - Region 選 **Northeast Asia (Tokyo)** 或 **Southeast Asia (Singapore)**，台灣連線比較快。
   - 資料庫密碼自己設一組，存好。
2. 左側 **SQL Editor** → New query → 把 `supabase/schema.sql` 整份貼上 → **Run**。
3. 左側 **Authentication → Sign In / Providers**，打開 **Allow anonymous sign-ins**（允許匿名登入），儲存。
4. 左側 **Project Settings → API**，複製：
   - **Project URL**（像 `https://abcd1234.supabase.co`）
   - **anon public key**

### 2. 填入設定

打開 `web/config.js`，把兩個值換成剛剛複製的：

```js
window.SONGGUO_CONFIG = {
  supabaseUrl: "https://abcd1234.supabase.co",
  supabaseAnonKey: "eyJhbGciOi...",
};
```

anon key 本來就是公開的金鑰，資料安全由 `schema.sql` 裡的權限規則保護，放在前端沒問題。
**絕對不要**把 `service_role` key 放進任何前端檔案。

### 3. 部署到 Vercel（免費）

1. 到 <https://vercel.com> 用 GitHub 登入 → **Add New → Project** → 選這個 repo → **Import**。
2. Framework Preset 選 **Other**，其他都不用改（`vercel.json` 已經設定好發布 `web/`）→ **Deploy**。
3. 完成後會拿到 `https://xxx.vercel.app` 網址，這就是松果的正式網址。之後每次 push 到 GitHub 都會自動重新部署。

### 4. 把自己設成管理員

1. 用手機或電腦打開松果，右上角點自己的暱稱 →「我的設定」，最下面有 **使用者 ID**，複製起來。
2. 回 Supabase **SQL Editor** 執行（把 ID 換成你的）：

```sql
insert into public.admins (uid) values ('貼上你的使用者 ID');
```

3. 重新整理松果。管理員可以：審核被檢舉的貼文、刪除任何內容、切換高鐵線班表、設定寒暑假日期、編輯地圖地標。

## 天氣預報：設定中央氣象署金鑰（免費，選做）

1. 到 <https://opendata.cwa.gov.tw> 註冊會員並登入，在「取得授權碼」複製 API 授權碼。
2. Vercel 專案 → **Settings → Environment Variables**，新增 `CWA_API_KEY`，值貼上授權碼，儲存。
3. Vercel → **Deployments** → 最新一筆右邊「⋯」→ **Redeploy**。

沒設定也能用：天氣會自動改用 Open-Meteo 的資料，頁面底下會標示來源。

## 更新資料庫權限（每次 schema.sql 有更新時）

把最新的 `supabase/schema.sql` 整份貼到 Supabase SQL Editor 再執行一次即可，可以重複執行，不會刪掉資料。

## 免費方案的限制與注意事項

- **Supabase 免費專案一週沒有任何人使用會被暫停**，到後台按一下就能恢復。有人在用就不會暫停。
- 免費方案的資料庫容量、流量與同時在線連線數都有上限，一般校內使用綽綽有餘；若使用量變大，後台會提醒，屆時再考慮升級。
- 匿名身分存在瀏覽器裡：換手機或清除瀏覽器資料，會變成新的匿名使用者（舊貼文還在，但不能再刪改）。
- 美食地圖使用 OpenStreetMap 免費圖磚。若之後流量很大，依 OpenStreetMap 使用政策應改用其他圖磚服務。
- 防洗版：資料庫限制每人每小時最多 10 篇貼文、60 則留言、120 則大廳訊息、6 團拼車、20 個私訊請求等（可在 `schema.sql` 的 `docs_rate_limit` 調整）。
- 租屋避雷板發文前必須勾選免責聲明；同一篇被 3 個人檢舉會自動隱藏，等管理員審核。

## 公車時刻表更新

班次資料寫在 `web/index.html` 的 `BUS` 常數裡，來源是中大總務處「對外交通資訊」（115.02.26 版）。
總務處公告更新時，照同樣格式修改後 push 即可。高鐵線要用一般班表或 172A 試辦班表、寒暑假日期，管理員可以直接在網站上切換，不用改程式。

## 本機預覽

```bash
cd web && python3 -m http.server 8080
# 打開 http://localhost:8080
```
