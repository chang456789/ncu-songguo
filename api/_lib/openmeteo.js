// 中央大學附近的天氣（Open-Meteo，免金鑰）：現在溫度＋今天起 3 天預報，10 分鐘快取
// 寫法和 api/ai-chat.js 的 weather() 相同（那邊由謝恩妮維護，這裡複製一份給 api/ai-agent.js 的 weather 工具用）
// 「有時抓不到預報」的原因與處理：
//   1. Open-Meteo 被限流或出錯時會回 {error:true, reason}（不是 daily），以前會把「空的預報」存進快取 10 分鐘 → 現在沒有預報就當作失敗，不快取
//   2. Vercel 冷啟動時 4 秒常常不夠 → 每次 6 秒，失敗再試一次
//   3. 都失敗時用 6 小時內的舊資料（標明時間），再不行由 api/ai-agent.js 改用前端送來的預報
const WX = { 0:"晴",1:"大致晴",2:"多雲",3:"陰",45:"霧",48:"霧",51:"毛毛雨",53:"毛毛雨",55:"毛毛雨",61:"小雨",63:"雨",65:"大雨",80:"陣雨",81:"陣雨",82:"大陣雨",95:"雷雨",96:"雷雨",99:"雷雨" };
const FRESH = 10 * 60e3, STALE = 6 * 3600e3;
let cache = { at: 0, data: null };

async function fetchOnce() {
  const u = "https://api.open-meteo.com/v1/forecast?latitude=24.968&longitude=121.195&timezone=Asia%2FTaipei&forecast_days=3"
    + "&current=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max";
  const r = await fetch(u, { signal: AbortSignal.timeout(6000) });
  if (!r.ok) throw new Error("open-meteo " + r.status);
  const j = await r.json();
  const d = j.daily || {};
  if (!Array.isArray(d.time) || !d.time.length) throw new Error("open-meteo: no daily data");
  return {
    地點: "中央大學（桃園中壢）",
    來源: "Open-Meteo",
    現在: j.current ? `${Math.round(j.current.temperature_2m)}°C ${WX[j.current.weather_code] || ""}` : null,
    預報: d.time.map((t, i) => ({ 日期: t, 天氣: WX[d.weather_code[i]] || "", 最低: Math.round(d.temperature_2m_min[i]), 最高: Math.round(d.temperature_2m_max[i]), 降雨機率: d.precipitation_probability_max[i] ?? null })),
  };
}

async function weather() {
  if (cache.data && Date.now() - cache.at < FRESH) return cache.data;
  for (let i = 0; i < 2; i++) {
    try { const data = await fetchOnce(); cache = { at: Date.now(), data }; return data; }
    catch (e) { console.warn("weather", i + 1, e.message || e); }
  }
  if (cache.data && Date.now() - cache.at < STALE)
    return { ...cache.data, 備註: `這是 ${Math.round((Date.now() - cache.at) / 60e3)} 分鐘前的預報` };
  return null;
}

module.exports = { weather };
