// GET /api/responsible-ai — 回傳「負責任的 AI」說明頁的 Markdown 原文
// 原文由謝恩妮維護在 docs/responsible-ai.md（網站只發布 web/ 資料夾，所以透過這支 API 讀取；
// vercel.json 的 includeFiles 會把這個檔案一起打包）。前端 web/rai.js 負責顯示。
const fs = require("fs");
const path = require("path");

module.exports = (req, res) => {
  const file = path.join(__dirname, "..", "docs", "responsible-ai.md");
  let text;
  try { text = fs.readFileSync(file, "utf8"); }
  catch { res.setHeader("cache-control", "no-store"); return res.status(404).json({ error: "說明頁還沒準備好" }); }
  res.setHeader("content-type", "text/markdown; charset=utf-8");
  res.setHeader("cache-control", "public, s-maxage=3600, stale-while-revalidate=86400");
  res.status(200).send(text);
};
