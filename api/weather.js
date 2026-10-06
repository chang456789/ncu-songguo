// GET /api/weather — 中央氣象署 鄉鎮天氣預報（桃園市中壢區）
// Needs a free CWA open-data key in the Vercel environment variable CWA_API_KEY.
// Without a key (or if CWA is down) it returns 503 and the app falls back to Open-Meteo.
const BASE = "https://opendata.cwa.gov.tw/api/v1/rest/datastore/";
const TOWN = "中壢區";

const lower = o => { if (Array.isArray(o)) return o.map(lower); if (o && typeof o === "object") { const r = {}; for (const k in o) r[k.charAt(0).toLowerCase() + k.slice(1)] = lower(o[k]); return r; } return o; };
function findLocation(j) {
  const rec = j.records || {};
  const groups = rec.locations || rec.location ? (rec.locations || [rec]) : [];
  for (const g of groups) for (const loc of (g.location || [])) if ((loc.locationName || "").includes(TOWN)) return loc;
  return null;
}
const el = (loc, names) => (loc.weatherElement || []).find(e => names.includes(e.elementName));
const val = (t, keys) => { const ev = t.elementValue; const o = Array.isArray(ev) ? ev[0] : ev; if (!o) return null; for (const k of keys) if (o[k] != null && o[k] !== "") return o[k]; const first = Object.values(o)[0]; return first; };
const num = x => { const n = parseFloat(x); return Number.isFinite(n) ? n : null; };
const tstart = t => t.startTime || t.dataTime;

async function get(id, key) {
  const u = `${BASE}${id}?Authorization=${encodeURIComponent(key)}&format=JSON&LocationName=${encodeURIComponent(TOWN)}&locationName=${encodeURIComponent(TOWN)}`;
  const r = await fetch(u, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(id + " " + r.status);
  return lower(await r.json());
}

module.exports = async (req, res) => {
  const key = process.env.CWA_API_KEY;
  if (!key) { res.setHeader("Cache-Control", "public, s-maxage=600"); return res.status(503).json({ error: "CWA_API_KEY not set" }); }
  try {
    const [d3, d7] = await Promise.all([get("F-D0047-005", key), get("F-D0047-007", key).catch(() => null)]);
    const loc = findLocation(d3); if (!loc) throw new Error("location not found");
    const T = el(loc, ["溫度", "T"]), P = el(loc, ["3小時降雨機率", "PoP6h", "PoP3h"]), W = el(loc, ["天氣現象", "Wx"]);
    const pick = (E, t, keys) => { if (!E) return null; const ts = new Date(t).getTime();
      const hit = E.time.find(x => { const a = new Date(tstart(x)).getTime(), b = x.endTime ? new Date(x.endTime).getTime() : a + 3 * 3600e3; return ts >= a && ts < b; }) || E.time.find(x => tstart(x) === t);
      return hit ? val(hit, keys) : null; };
    const hours = (T ? T.time : []).map(x => { const t = tstart(x);
      return { t, temp: num(val(x, ["temperature", "value"])), pop: num(pick(P, t, ["probabilityOfPrecipitation", "value"])), wx: pick(W, t, ["weather", "value"]) || "" }; })
      .filter(x => x.temp != null);
    let days = [];
    const loc7 = d7 && findLocation(d7);
    if (loc7) {
      const MX = el(loc7, ["最高溫度", "MaxT"]), MN = el(loc7, ["最低溫度", "MinT"]), PP = el(loc7, ["12小時降雨機率", "PoP12h"]), WW = el(loc7, ["天氣現象", "Wx"]);
      const byDay = new Map();
      for (const x of (MX ? MX.time : [])) { const d = tstart(x).slice(0, 10); const cur = byDay.get(d) || { t: d };
        cur.max = Math.max(cur.max ?? -99, num(val(x, ["maxTemperature", "value"])) ?? -99); byDay.set(d, cur); }
      for (const x of (MN ? MN.time : [])) { const d = tstart(x).slice(0, 10); const cur = byDay.get(d) || { t: d };
        cur.min = Math.min(cur.min ?? 99, num(val(x, ["minTemperature", "value"])) ?? 99); byDay.set(d, cur); }
      for (const x of (PP ? PP.time : [])) { const d = tstart(x).slice(0, 10); const cur = byDay.get(d); if (cur) cur.pop = Math.max(cur.pop ?? 0, num(val(x, ["probabilityOfPrecipitation", "value"])) ?? 0); }
      for (const x of (WW ? WW.time : [])) { const d = tstart(x).slice(0, 10); const cur = byDay.get(d); if (cur && !cur.wx) cur.wx = val(x, ["weather", "value"]) || ""; }
      days = [...byDay.values()].filter(d => d.max > -99 && d.min < 99);
    }
    if (!hours.length) throw new Error("no hourly data");
    res.setHeader("Cache-Control", "public, s-maxage=1200, stale-while-revalidate=3600");
    res.status(200).json({ source: "中央氣象署 鄉鎮天氣預報（桃園市中壢區）", hours, days });
  } catch (e) {
    res.setHeader("Cache-Control", "public, s-maxage=300");
    res.status(502).json({ error: String(e.message || e) });
  }
};
