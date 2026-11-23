// 中央大學附近的天氣（Open-Meteo，免金鑰）：現在溫度＋今天起 3 天預報，10 分鐘快取
// 寫法和 api/ai-chat.js 的 weather() 相同（那邊由謝恩妮維護，這裡複製一份給 api/ai-agent.js 的 weather 工具用）
const WX = { 0:"晴",1:"大致晴",2:"多雲",3:"陰",45:"霧",48:"霧",51:"毛毛雨",53:"毛毛雨",55:"毛毛雨",61:"小雨",63:"雨",65:"大雨",80:"陣雨",81:"陣雨",82:"大陣雨",95:"雷雨",96:"雷雨",99:"雷雨" };
let cache = { at: 0, data: null };

async function weather() {
  if (cache.data && Date.now() - cache.at < 600000) return cache.data;
  try {
    const u = "https://api.open-meteo.com/v1/forecast?latitude=24.968&longitude=121.195&timezone=Asia%2FTaipei&forecast_days=3"
      + "&current=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max";
    const j = await (await fetch(u, { signal: AbortSignal.timeout(4000) })).json();
    const d = j.daily || {};
    const data = {
      地點: "中央大學（桃園中壢）",
      現在: j.current ? `${Math.round(j.current.temperature_2m)}°C ${WX[j.current.weather_code] || ""}` : null,
      預報: (d.time || []).map((t, i) => ({ 日期: t, 天氣: WX[d.weather_code[i]] || "", 最低: Math.round(d.temperature_2m_min[i]), 最高: Math.round(d.temperature_2m_max[i]), 降雨機率: d.precipitation_probability_max[i] })),
    };
    cache = { at: Date.now(), data }; return data;
  } catch { return null; }
}

module.exports = { weather };
