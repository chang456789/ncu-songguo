// GET /api/places — restaurants, cafés and drink shops around NCU from OpenStreetMap (Overpass API).
// Cached on Vercel's CDN for a day so OpenStreetMap only sees about one request per day.
const CENTER = [24.9668, 121.1925];   // between campus, the back gate and 宵夜街
const RADIUS = 2200;                   // metres
const QUERY = `[out:json][timeout:20];
(
  nwr["amenity"~"^(restaurant|fast_food|cafe|food_court|ice_cream|bar|pub)$"](around:${RADIUS},${CENTER[0]},${CENTER[1]});
  nwr["shop"~"^(bakery|beverages|coffee|tea|confectionery|deli|pastry)$"](around:${RADIUS},${CENTER[0]},${CENTER[1]});
);
out center tags;`;
const MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://lz4.overpass-api.de/api/interpreter",
  "https://z.overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

function toPlace(el) {
  const t = el.tags || {};
  const name = t["name:zh-Hant"] || t["name:zh"] || t.name || t["name:en"];
  const lat = el.lat ?? (el.center && el.center.lat), lng = el.lon ?? (el.center && el.center.lon);
  if (!name || lat == null || lng == null) return null;
  const cu = (t.cuisine || "").toLowerCase(), a = t.amenity, sh = t.shop;
  let cat = "正餐";
  if (a === "cafe" || ["coffee", "tea", "beverages"].includes(sh) || /bubble_tea|coffee|tea|juice/.test(cu) || /茶|咖啡|飲/.test(name)) cat = "飲料咖啡";
  else if (a === "ice_cream" || ["bakery", "confectionery", "pastry"].includes(sh) || /dessert|ice_cream|cake|donut|waffle|crepe|bakery/.test(cu) || /豆花|甜點|冰|烘焙|麵包|鬆餅/.test(name)) cat = "甜點";
  else if (/breakfast|brunch/.test(cu) || /早餐|早午餐|美而美|晨間/.test(name)) cat = "早餐";
  else if (a === "fast_food" || /snack|noodle|dumpling|fried_chicken|street/.test(cu) || /滷味|雞排|鹹酥|小吃|麵線|湯包|蛋餅/.test(name)) cat = "小吃";
  else if (a === "bar" || a === "pub") cat = "宵夜";
  const addr = [t["addr:district"], t["addr:street"], t["addr:housenumber"] && (/號$/.test(t["addr:housenumber"]) ? t["addr:housenumber"] : t["addr:housenumber"] + "號")].filter(Boolean).join("");
  return { osm: el.type[0] + el.id, name, nameEn: t["name:en"] || "", cat, lat: +lat.toFixed(6), lng: +lng.toFixed(6), hours: t.opening_hours || "", addr, cuisine: t.cuisine || "" };
}

module.exports = async (req, res) => {
  const started = Date.now(); const errors = [];
  for (const url of MIRRORS) {
    const left = 26000 - (Date.now() - started); if (left < 3000) break;
    try {
      // GET works on every mirror (some reject POST bodies); a browser-like Accept avoids HTML error pages
      const r = await fetch(url + "?data=" + encodeURIComponent(QUERY), {
        headers: { "accept": "application/json", "user-agent": "songguo-ncu-campus-app/1.0 (+https://ncu-songguo.vercel.app)" }, signal: AbortSignal.timeout(Math.min(12000, left)) });
      if (!r.ok) throw new Error(r.status + " " + (await r.text()).slice(0, 120).replace(/\s+/g, " "));
      const j = await r.json();
      const seen = new Set();
      const items = (j.elements || []).map(toPlace).filter(p => p && !seen.has(p.name + p.lat.toFixed(4)) && seen.add(p.name + p.lat.toFixed(4)));
      res.setHeader("Cache-Control", items.length ? "public, s-maxage=86400, stale-while-revalidate=604800" : "public, s-maxage=600");
      return res.status(200).json({ source: "© OpenStreetMap contributors", mirror: url, items, fetchedAt: new Date().toISOString() });
    } catch (e) { errors.push(url.split("/")[2] + ": " + String(e.message || e).slice(0, 160)); }
  }
  // 200 with an empty list so the browser falls back to asking OpenStreetMap itself
  res.setHeader("Cache-Control", "public, s-maxage=120");
  res.status(200).json({ items: [], errors });
};
module.exports.toPlace = toPlace; module.exports.QUERY = QUERY;
