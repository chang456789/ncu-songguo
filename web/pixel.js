/* =====================================================================
   松果 像素吉祥物：抱著松果的小松鼠（全部用程式畫，沒有使用任何外部圖片）
   - 每張圖是 32×32 的文字格子；一個字元 = 一個像素：
       .  透明     o  輪廓（深棕）   f  毛色（公車黃 --bus）
       c  奶油色（肚子、尾巴）        n  松果棕       g  松綠（--pine）
   - 用 SVG 畫出、放大顯示（crispEdges＋image-rendering: pixelated）。
     顏色由 web/ui.css 的 CSS 變數（--px-o、--px-f…）決定，深色模式自動換色。
   - 動畫只用在短暫的時刻，並遵守 prefers-reduced-motion（減少動態效果時只顯示靜態圖）。
   用法（index.html 或其他檔案）：
     PX.sprite("normal" | "think" | "happy" | "sad" | "umbrella" | "search" | "bus" | "stop" | "bench", { size: 96 })
     PX.loading()                       // 松鼠追著 132 公車跑（取代「載入中…」）
     PX.thinking()                      // 問松果思考中
     PX.empty("rides" | "posts" | "search", { onAction })   // 空白狀態：圖＋一句提示＋行動按鈕
     PX.error({ onRetry })              // 斷線或錯誤
     PX.celebrate("已發布！")            // 發文、開團成功：開心表情跳一下
     PX.weather(isRain)                 // 天氣卡用：下雨撐傘
   ===================================================================== */
(() => {
  "use strict";
  const SVGNS = "http://www.w3.org/2000/svg";
  const G = {
    normal: [
      "................................",
      "................................",
      "..............ooo......ooo......",
      "..............ofo......ofo......",
      ".....oooooo..ofcfo....ofcfo.....",
      "....offffffo.ofcfoooooofcfo.....",
      "...offffffffo.oooffffffooo......",
      "..offfffcffffooffffffffffo......",
      "..offfcccccffoffffffffffffo.....",
      "..offfcccccffoffffffffffffo.....",
      "..offfcccccffoffcofffffcofo.....",
      "..offcccccccfoffoofffffoofo.....",
      "..offcccccccfoffffccccffffo.....",
      "..offcccccccfoffcccoocccffo.....",
      "..offfcccccffoffccccccccffo.....",
      "..offfcccccffoofcccococcfo......",
      "..offfcccccffo.oocccoccoo.......",
      "...offffcffffo.oooooooo.........",
      "....offfffffffoffffffgfo........",
      ".....offfffffoffffffoggfo.......",
      ".....offfffffoffccoonnnoo.......",
      ".....offfffffoffccfoonnof.......",
      ".....offffffoffcccfonnoofo......",
      ".....offfffffofcccooonnoo.......",
      "......offffffofcccconnooo.......",
      "......offffffofcccccooofo.......",
      ".......oooooo.ofccccccfo........",
      ".............oooooccooooo.......",
      ".............offfoooofffo.......",
      "..............ooo....ooo........",
      "................................",
      "................................",
    ],
    think: [
      "........................ooooooo.",
      ".......................occcccccc",
      "..............ooo......ococococo",
      "..............ofo......occccccco",
      ".....oooooo..ofcfo....ofooooooo.",
      "....offffffo.ofcfoooooofcoo.....",
      "...offffffffo.oooffffffooo......",
      "..offfffcffffooffffffffffo......",
      "..offfcccccffoffffffffffffo.....",
      "..offfcccccffoffffffffffffo.....",
      "..offfcccccffoffcofffffcofo.....",
      "..offcccccccfoffoofffffoofo.....",
      "..offcccccccfoffffccccffffo.....",
      "..offcccccccfoffcccoocccffo.....",
      "..offfcccccffoffccccccccffo.....",
      "..offfcccccffoofcccococcfo......",
      "..offfcccccffo.oocccoccoo.......",
      "...offffcffffo.oooooooo.........",
      "....offfffffffoffffffgfo........",
      ".....offfffffoffffffoggfo.......",
      ".....offfffffoffccoonnnoo.......",
      ".....offfffffoffccfoonnof.......",
      ".....offffffoffcccfonnoofo......",
      ".....offfffffofcccooonnoo.......",
      "......offffffofcccconnooo.......",
      "......offffffofcccccooofo.......",
      ".......oooooo.ofccccccfo........",
      ".............oooooccooooo.......",
      ".............offfoooofffo.......",
      "..............ooo....ooo........",
      "................................",
      "................................",
    ],
    happy: [
      "................................",
      "..g.............................",
      ".ggg..........ooo......ooo......",
      "..g...........ofo......ofo......",
      ".....oooooo..ofcfo....ofcfo..g..",
      "....offffffo.ofcfoooooofcfo.ggg.",
      "...offffffffo.oooffffffooo...g..",
      "..offfffcffffooffffffffffo......",
      "..offfcccccffoffffffffffffo.....",
      "..offfcccccffoffffffffffffo.....",
      "..offfcccccffofffoffffffofo.....",
      "..offcccccccfoffofoffffofoo.....",
      "..offcccccccfoffffccccffffo.....",
      "..offcccccccfoffcccoocccffo.....",
      "..offfcccccffoffccccccccffo.....",
      "..offfcccccffoofcccoocccfo.oo...",
      "..offfcccccffo.ooccocccoo.ofo...",
      "...offffcffffo.oooooooo...ofo...",
      "....offfffffffoffffffgfo.oofoooo",
      ".....offfffffoffffffoggfooffffo.",
      ".....offfffffoffccoonnnooofffffo",
      ".....offfffffoffccfoonnofofffffo",
      ".....offffffoffcccfonnoofoooooo.",
      ".....offfffffofcccooonnoo.......",
      "......offffffofcccconnooo.......",
      "......offffffofcccccooofo.......",
      ".......oooooo.ofccccccfo........",
      ".............oooooccooooo.......",
      ".............offfoooofffo.......",
      "..............ooo....ooo........",
      "................................",
      "................................",
    ],
    sad: [
      "................................",
      "................................",
      "..............ooo......ooo......",
      "..............ofo......ofo......",
      ".....oooooo..ofcfo....ofcfo.....",
      "....offffffo.ofcfoooooofcfo.....",
      "...offffffffo.oooffffffooo......",
      "..offfffcffffooffffffffffo......",
      "..offfcccccffoffffffffffffo.....",
      "..offfcccccffoffffffffffffo.....",
      "..offfcccccffofofffffffffoo.....",
      "..offcccccccfoffoofffffoofo.....",
      "..offcccccccfoffcfccccffffo.....",
      "..offcccccccfoffcccoocccffo.....",
      "..offfcccccffoffccccccccffo.....",
      "..offfcccccffoofccoccoccfo......",
      "..offfcccccffo.ooccooccoo.......",
      "...offffcffffo.oooooooo.........",
      "....offfffffffoffffofofo........",
      ".....offfffffofffffofoffo.......",
      ".....offfffffoffcconnnofo.......",
      ".....offfffffoffcconnnofo.......",
      ".....offffffoffccconnnoffo......",
      ".....offfffffofcccconocfo.......",
      "......offffffofcccccoccfo.......",
      "......offffffofcccccoccfo.......",
      ".......oooooo.ofccccocfo.......g",
      ".............oooooccooooo.....g.",
      ".............offfoooofffo.......",
      "..............ooo....ooo.ooo....",
      "............................oo..",
      "..............................g.",
    ],
    umbrella: [
      "...................oooooo.......",
      "...g............ooogggggggooo...",
      "......g.......oogggggggggggggo..",
      "..g...........ogggggggggggggggo.",
      ".....oooooo..oggggggggggggggggg.",
      "....ogfffffo.ooggoooggoooggoogo.",
      ".g.offffffffo.ooofffffoooo...o..",
      "..offfffcffffooffffffffffo...o..",
      "..offfcccccffoffffffffffffo..o..",
      "..offfcccccffoffffffffffffo..o..",
      "..offfcccccffoffcofffffcofo..o..",
      "..offcccccccfoffoofffffoofo..o..",
      "..offcccccccfoffffccccffffo..o..",
      "..offcccccccfoffcccoocccffo..o..",
      "..offfcccccffoffccccccccffo..o..",
      "..offfcccccffoofcccococcfo...o..",
      "..offfcccccffo.oocccoccoo....o..",
      "...offffcffffo.oooooooo......o..",
      "....offfffffffoffffffgfo...o.o..",
      ".....offfffffoffffffoggfo...o...",
      ".....offfffffoffccoonnnoo.......",
      ".....offfffffoffccfoonnof.......",
      ".....offffffoffcccfonnoofo......",
      ".....offfffffofcccooonnoo.......",
      "......offffffofcccconnooo.......",
      "......offffffofcccccooofo.......",
      ".......oooooo.ofccccccfo........",
      ".............oooooccooooo.......",
      ".............offfoooofffo.......",
      "..............ooo....ooo........",
      "................................",
      "................................",
    ],
    search: [
      "................................",
      "................................",
      "..............ooo......ooo......",
      "..............ofo......ofo......",
      ".....oooooo..ofcfo....ofcfo.....",
      "....offffffo.ofcfoooooofcfo.....",
      "...offffffffo.oooffffffooo......",
      "..offfffcffffooffffffffffo......",
      "..offfcccccffoffffffffffffo.....",
      "..offfcccccffoffffffffffffo.....",
      "..offfcccccffoffffffffffffo.....",
      "..offcccccccfoffoofffffoofo.....",
      "..offcccccccfoffooccccfoofo.....",
      "..offcccccccfoffcccoocccffo.....",
      "..offfcccccffoffccccccccffo.....",
      "..offfcccccffoofcccococcfo......",
      "..offfcccccffo.oocccoccoo.ooo...",
      "...offffcffffo.oooooooo..occco..",
      "....offfffffffoffffffffooccccco.",
      ".....offfffffoffffffffffoccccco.",
      ".....offfffffoffccccccffooccco..",
      ".....offfffffoffccccccffo.oooo..",
      ".....offffffoffccccccccffo...oo.",
      ".....offfffffofccccccccfo.....o.",
      "......offffffofccccccccfo.......",
      "......offffffofccccccccfo.......",
      ".......oooooo.ofccccccfo........",
      ".............oooooccooooo.......",
      ".............offfoooofffo.......",
      "..............ooo....ooo........",
      "................................",
      "................................",
    ],
    bus: [
      "..ooooooooooooooooooooooooooo...",
      ".ofooooooooooooooofffffffffffo..",
      ".ofocccccccccccccofooooooooooo..",
      ".ofocooccooocooocofoccooccooco..",
      ".ofoccoccccocccocofoccooccooco..",
      ".ofoccoccooocooocofoccooccooco..",
      ".ofoccoccccococccofoccooccooco..",
      ".ofocooocooocooocofoooooooooco..",
      ".ofocccccccccccccofffffffffoco..",
      ".ofooooooooooooooofffffffffooo..",
      ".oggggooggggggggggggggoogggggo..",
      ".offfooooffffffffffffooooffffooo",
      ".ooooonnoooooooooooooonnoooooo..",
      "....oonnoo..........oonnoo......",
      ".....oooo............oooo.......",
      "......oo..............oo........",
    ],
    stop: [
      "oooooooooooo",
      "oggggggggggo",
      "ogoooooooogo",
      "ogooccccoogo",
      "ogoccccccogo",
      "ogoffffffogo",
      "ogooccccoogo",
      "ogoooooooogo",
      "oggggggggggo",
      "oggggggggggo",
      "oooooooooooo",
      ".....on.....",
      ".....on.....",
      ".....on.....",
      ".....on.....",
      ".....on.....",
      ".....on.....",
      ".....on.....",
      ".....on.....",
      ".....on.....",
      ".....on.....",
      ".....on.....",
      ".....on.....",
      ".....on.....",
      ".....on.....",
      ".....on.....",
      ".....on.....",
      ".....on.....",
      ".....on.....",
      "...oooooo...",
      "...onnnno...",
      "...oooooo...",
    ],
    bench: [
      "oooooooooooooooooooooo",
      "onnnnnnnnnnnnnnnnnnnno",
      "oooooooooooooooooooooo",
      "..o................o..",
      "oooooooooooooooooooooo",
      "onnnnnnnnnnnnnnnnnnnno",
      "oooooooooooooooooooooo",
      "..oo..............oo..",
      "..oo..............oo..",
      "..oo..............oo..",
    ],
    // ---------- 松果 2.0：分頁圖示（24×24，k＝跟著文字顏色）、AI 頭像、眨眼、橫幅道具 ----------
    blink: [
      "................................",
      "................................",
      "..............ooo......ooo......",
      "..............ofo......ofo......",
      ".....oooooo..ofcfo....ofcfo.....",
      "....offffffo.ofcfoooooofcfo.....",
      "...offffffffo.oooffffffooo......",
      "..offfffcffffooffffffffffo......",
      "..offfcccccffoffffffffffffo.....",
      "..offfcccccffoffffffffffffo.....",
      "..offfcccccffoffffffffffffo.....",
      "..offcccccccfoffoofffffoofo.....",
      "..offcccccccfoffffccccffffo.....",
      "..offcccccccfoffcccoocccffo.....",
      "..offfcccccffoffccccccccffo.....",
      "..offfcccccffoofcccococcfo......",
      "..offfcccccffo.oocccoccoo.......",
      "...offffcffffo.oooooooo.........",
      "....offfffffffoffffffgfo........",
      ".....offfffffoffffffoggfo.......",
      ".....offfffffoffccoonnnoo.......",
      ".....offfffffoffccfoonnof.......",
      ".....offffffoffcccfonnoofo......",
      ".....offfffffofcccooonnoo.......",
      "......offffffofcccconnooo.......",
      "......offffffofcccccooofo.......",
      ".......oooooo.ofccccccfo........",
      ".............oooooccooooo.......",
      ".............offfoooofffo.......",
      "..............ooo....ooo........",
      "................................",
      "................................",
    ],
    icon_home: [
      "........................",
      "........................",
      "........................",
      ".......kkkk..kkkk.......",
      "......kggggkkggggk......",
      ".......kkkk.gkkkk.......",
      "..........kkkk..........",
      "........kknnnnkk........",
      ".......knnnknnnkk.......",
      ".......konnnonnnk.......",
      "......knnnnnnnnnnk......",
      "......knnknnnknnnk......",
      "......knnnonnnonnk......",
      "......knnnnnnnnnnk......",
      "......kknnnknnnknk......",
      "......knonnnonnnok......",
      "......knnnnnnnnnnk......",
      "......knnknnnknnnk......",
      ".......knnonnnonk.......",
      ".......knnnnnnnnk.......",
      "........kknknnkk........",
      "..........kkkk..........",
      "........................",
      "........................",
    ],
    icon_bus: [
      "........................",
      "........................",
      "........................",
      "........................",
      "........................",
      "..kkkkkkkkkkkkkkkkkkkk..",
      ".kffffffffffffffffffffk.",
      ".kfkkkkkkfkkkkkkfkkkkkk.",
      ".kfkcccckfkcccckfkccckk.",
      ".kfkcccckfkcccckfkccckk.",
      ".kfkcccckfkcccckfkccckk.",
      ".kfkkkkkkfkkkkkkfkccckk.",
      ".kfffffffffffffffkccckk.",
      ".kfffffffffffffffkkkkkk.",
      ".kggggggggggggggggggggk.",
      ".kfffkkfffffffffkkffffk.",
      ".kffkookfffffffkookfffk.",
      ".kkkooookkkkkkkooookkkk.",
      "...kooook.....kooook....",
      "....kook.......kook.....",
      ".....kk.........kk......",
      "........................",
      "........................",
      "........................",
    ],
    icon_map: [
      "........................",
      "........................",
      ".........kkkkkk.........",
      "........kggggggk........",
      ".......kggggggggk.......",
      "......kggggggggggk......",
      ".....kggggkkkkggggk.....",
      ".....kgggkcccckgggk.....",
      ".....kgggkcccckgggk.....",
      ".....kgggkcccckgggk.....",
      ".....kgggkcccckgggk.....",
      ".....kggggkkkkggggk.....",
      "......kggggggggggk......",
      "......kggggggggggk......",
      ".......kggggggggk.......",
      "........kggggggk........",
      "........kggggggk........",
      ".........kggggk.........",
      "..........kggk..........",
      "..........kggk..........",
      "...........kk...........",
      "...........kk...........",
      ".....k.o.o.o.o.o.o.k....",
      "........................",
    ],
    icon_chat: [
      "........................",
      "........................",
      "........................",
      ".......kkkkkkkkkk.......",
      ".....kkcccccccccckk.....",
      "....kcccccccccccccck....",
      "...kcccccccccccccccck...",
      "..kcccccccccccccccccck..",
      "..kcccccccccccccccccck..",
      "..kcccccccccccccccccck..",
      "..kccccggcccggcccggcck..",
      "..kccccggcccggcccggcck..",
      "..kcccccccccccccccccck..",
      "...kcccccccccccccccck...",
      "....kcccccccccccccck....",
      ".....kccccccccccckk.....",
      ".....kccckkkkkkkk.......",
      ".....kcck...............",
      ".....kck................",
      ".....kk.................",
      ".....k..................",
      "........................",
      "........................",
      "........................",
    ],
    icon_me: [
      "........................",
      "........................",
      "........................",
      "........................",
      "......kk........kk......",
      ".....kffk......kffk.....",
      ".....kfck.kkkk.kfck.....",
      ".....kfkkkffffkkkfk.....",
      ".....kkffffffffffkk.....",
      ".....kffffffffffffk.....",
      ".....kffffffffffffk.....",
      "....kfffckfffffckffk....",
      "....kfffkkfffffkkffk....",
      "....kffffffccffffffk....",
      "....kffffcckkccffffk....",
      ".....kffccccccccffk.....",
      ".....kffccckkcccffk.....",
      "......kfccccccccfk......",
      ".......kkkcccckkk.......",
      "..........kkkk..........",
      "........................",
      "........................",
      "........................",
      "........................",
    ],
    avatar: [
      "........................",
      ".....................g..",
      "....................ggg.",
      ".....................g..",
      "......kk........kk......",
      ".....kffk......kffk.....",
      ".....kfck.kkkk.kfck.....",
      ".....kfkkkffffkkkfk.....",
      ".....kkffffffffffkk.....",
      ".....kffffffffffffk.....",
      ".....kffffffffffffk.....",
      "....kfffckfffffckffk....",
      "....kfffkkfffffkkffk....",
      "....kffffffccffffffk....",
      "....kffffcckkccffffk....",
      ".....kffccccccccffk.....",
      ".....kffccckkcccffk.....",
      "......kfccccccccfk......",
      ".......kkkcccckkk.......",
      "..........kkkk..........",
      "........................",
      "........................",
      "........................",
      "........................",
    ],
    tree: [
      "..........................",
      "..........oooooo..........",
      ".......ooollllllooo.......",
      "......ollllllllllllo......",
      ".....ollllllllllllllo.....",
      "....ollllllllllllllllo....",
      "...ollllllllllllllllllo...",
      "...ollllllllllllllllllo...",
      "..ollllllllllllllllllllo..",
      "..ollllllllllllllllllllo..",
      "..ollllllllllllllllllllo..",
      "..ollllllllllllllllllllo..",
      ".ollllllllllllllllllllllo.",
      ".olllllllllllllllllllllllo",
      "ollllllllllllggggggllllllo",
      "ollllllllllggggggggggllllo",
      "olllllllllgggggggggggglllo",
      "olllllllllgggggggggggglllo",
      ".ollllllllgggggggggggglllo",
      ".ollllllllggggggggggggllo.",
      "..ollllllllggggggggggllo..",
      "...oollllllllgggggglllo...",
      ".....olllllnnnnllllloo....",
      "......ollllnnnnllllo......",
      ".......oollnnnnlloo.......",
      ".........oonnnnoo.........",
      "..........onnnno..........",
      "..........onnnno..........",
      "..........onnnno..........",
      "..........onnnno..........",
      ".........onnnnno..........",
      "........ononnnno..........",
      ".........oonnnno..........",
      "..........onnnno..........",
      "..........onnnno..........",
      "..........onnnno..........",
      "..........onnnno..........",
      "..........onnnno..........",
      "..........onnnno..........",
      "..........onnnno..........",
    ],
    lake: [
      "............wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww............",
      "......wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww......",
      "wwwwwwwwwwwwwwcccwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwcccwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww",
      "wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwcwwwwwwwww",
      "wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwccwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww",
      "wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwccwwwwwwwwwwwwwwwwwwwwwww",
      "wwwwwwwwwwwwwwwwwwwwwwwwwwwwccwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww",
      "wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww",
    ],
    goose: [
      "....ooo.....",
      "...occco....",
      "...ocoof....",
      "...occcofo..",
      "....occo....",
      "....occo....",
      ".oooocccoo..",
      "occcccccccoo",
      "occcccccccco",
      ".occcccccco.",
      "..oooooooo..",
    ],
    reeds: [
      "..g...",
      "..g.g.",
      "g.g.g.",
      "g.g.gg",
      "g.ggg.",
      "gggg..",
      ".gg...",
      ".g....",
      ".g....",
      ".g....",
      ".g....",
      ".g....",
    ],
    stall: [
      "....................................",
      "....................................",
      "....................................",
      "............oooooooooooo............",
      "..........ooccccggggccccoo..........",
      "........ooggccccggggccccggoo........",
      ".....oooggggccccggggccccggggooo.....",
      "...oocccggggccccggggccccggggcccoo...",
      ".oogccccggggccccggggccccggggccccgoo.",
      "ogggccccggggccccggggccccggggccccgggo",
      "ogggccccggggccccggggccccggggccccgggo",
      "oggggggggggggggggggggggggggggggggggo",
      ".oonoooooooooooooooooooooooooooonoo.",
      "..onoo.o.o.o.o.o.o.o.o.o.o.o.o.ono..",
      "..onocococococococococococococoono..",
      "..onoo.o.o.o.o.o.o.o.o.o.o.o.o.ono..",
      "..ono..........................ono..",
      "..ono..........................ono..",
      "..ono..........................ono..",
      "..ono..........................ono..",
      "..ono..........................ono..",
      "..onoooooooooooooooooooooooooooono..",
      ".offffffffffffffffffffffffffffffffo.",
      ".onnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnno.",
      ".onnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnno.",
      ".onnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnno.",
      ".onnnnnnccnnnnnnccnnnnnnccnnnnnnnno.",
      ".onnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnno.",
      ".onnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnno.",
      ".onnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnno.",
      ".onnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnno.",
      ".onnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnno.",
      ".onnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnno.",
      ".onnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnno.",
    ],
    lantern: [
      "..oo..",
      "oooooo",
      "offffo",
      "offcfo",
      "offffo",
      "offffo",
      "oooooo",
      "..oo..",
      "...o..",
    ],
    map: [
      "..............................",
      ".ooooooo.......oooooooo.......",
      "occcccccoooooooccccogggoooooo.",
      "occccccclcccccclccogcccgocccco",
      "occccccclcccccclccoggcggocccco",
      "occccccclcccccclcccogggoccccco",
      "occccccclcccccclccccogocccccco",
      "occccccclcccccclcccccolcccccco",
      "occccccclcccccclccoccclcccccco",
      "occccccclccccccloccccclcccccco",
      "occccccclccccoclcccccclcccccco",
      "occccccclcccccclcccccclcccccco",
      "occccccclccoccclcccccclcccccco",
      "occcccccloccccclcccccclcccccco",
      "occccccclcccccclcccccclcccccco",
      "occcccoclcccccclcccccclcccccco",
      "occccccclcccccclcccccclcccccco",
      "occcoccclcccccclcccccclcccccco",
      "occccccclcccccclcccccclcccccco",
      "occccccclcccccclcccccclcccccco",
      "occccccclcccccclcccccclcccccco",
      ".ooooooocccccccoooooooccccccco",
    ],
    bubble_dots: [
      ".oooooooooooo.",
      "occcccccccccco",
      "occcccccccccco",
      "occgccgccgccco",
      "occcccccccccco",
      ".oooooooooooo.",
      "...oco........",
      "...oo.........",
      "...o..........",
    ],
    bubble_heart: [
      ".ooooooooo.",
      "occccccccco",
      "occggcggcco",
      "ocgggggggco",
      "occgggggcco",
      "occcgggccco",
      "occccgcccco",
      ".ooooooooo.",
      "......oco..",
      "......oo...",
    ],
    desk: [
      "nnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn",
      "nnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn",
      "nnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn",
      "ooonnooooooooooooooooooooooooooooooooooooooooooooonnnnnnnnnnnnnoonnooo",
      "..onno...........................................onnnnnnnnnnnnnoonno..",
      "..onno...........................................onnnnnnffnnnnnoonno..",
      "..onno...........................................onnnnnnnnnnnnnoonno..",
      "..onno...........................................onnnnnnnnnnnnnoonno..",
      "..onno...........................................onnnnnnnnnnnnnoonno..",
      "..onno............................................ooooooooooooo.onno..",
      "..onno..........................................................onno..",
      "..onno..........................................................onno..",
      "..onno..........................................................onno..",
      "..onno..........................................................onno..",
    ],
    lamp: [
      ".....oooooo.",
      "....offffffo",
      "...offffffo.",
      "...oooooooo.",
      "......o.....",
      "......o.....",
      "......o.....",
      "......o.....",
      "......o.....",
      "......o.....",
      "....ooooo...",
      "...onnnnno..",
    ],
    laptop: [
      "oooooooooooooo",
      "occcccccccccco",
      "ocggcccccccgco",
      "ocgcccccccccco",
      "occcccccccccco",
      "occcccccccccco",
      "oooooooooooooo",
      ".onnnnnnnnnno.",
      "oooooooooooooo",
    ],
    books: [
      "oooooooooo",
      "oggggggggo",
      "oooooooooo",
      ".offfffffo",
      ".ooooooooo",
      "onnnnnnnno",
      "oooooooooo",
    ],
    // ---------- v2-polish2：問松果卡片小圖示（12×12）、松鼠頭像的三種表情（公車牌、便當、行事曆） ----------
    ci_bus: [
      "............",
      "kkkkkkkkkkk.",
      "kffffffffffk",
      "kfccfccfcffk",
      "kfccfccfcffk",
      "kffffffffffk",
      "kggggggggggk",
      "kffffffffffk",
      "kkkkkkkkkkkk",
      ".kok....kok.",
      ".kkk....kkk.",
      "............",
    ],
    ci_cal: [
      ".kk....kk...",
      "kkkkkkkkkk..",
      "kggggggggk..",
      "kggggggggk..",
      "kcccccccck..",
      "kckckckcck..",
      "kcccccccck..",
      "kckckckcck..",
      "kcccccccck..",
      "kkkkkkkkkk..",
      "............",
      "............",
    ],
    ci_food: [
      "....k.k.....",
      "...k.k......",
      "............",
      "kkkkkkkkkkkk",
      "kccccccccnnk",
      "kcccccccnnnk",
      ".kccccccggk.",
      ".kkccccccck.",
      "..kkkkkkkk..",
      "....kkkk....",
      "............",
      "............",
    ],
    ci_car: [
      "............",
      "...kkkkkk...",
      "..kccckcck..",
      ".kccccccck..",
      "kkkkkkkkkkkk",
      "kffffffffffk",
      "kfkffffffkfk",
      "kkkkkkkkkkkk",
      ".kok....kok.",
      ".kkk....kkk.",
      "............",
      "............",
    ],
    avatar_bus: [
      "........................",
      "........................",
      "........................",
      "........................",
      "......kk........kk......",
      ".....kffk......kffk.....",
      ".....kfck.kkkk.kfck.....",
      ".....kfkkkffffkkkfk.....",
      ".....kkffffffffffkk.....",
      ".....kffffffffffffk.....",
      ".....kffffffffffffk.....",
      "....kfffckfffffckffk....",
      "....kfffkkfffffkkffk....",
      "....kffffffccffffffk....",
      "....kffffcckkccffffk....",
      ".....kffccccccccffk.....",
      ".....kffccckkcckkkkkkkkk",
      "......kfccccccckfffffffk",
      ".......kkkcccckkfkkkkkfk",
      "..........kkkk.kfffffffk",
      "...............kkkkkkkkk",
      "..................kk....",
      "..................kk....",
      "..................kk....",
    ],
    avatar_food: [
      "........................",
      "........................",
      "........................",
      "........................",
      "......kk........kk......",
      ".....kffk......kffk.....",
      ".....kfck.kkkk.kfck.....",
      ".....kfkkkffffkkkfk.....",
      ".....kkffffffffffkk.....",
      ".....kffffffffffffk.....",
      ".....kffffffffffffk.....",
      "....kfffckfffffckffk....",
      "....kfffkkfffffkkffk....",
      "....kffffffccffffffk....",
      "....kffffcckkccffffk....",
      ".....kffccccccccffk.....",
      ".....kffccckkcccffk.....",
      "......kfccccccccfk......",
      ".......kkkcccckkkkkkkkkk",
      "..........kkkkkcccccnnnk",
      "..............kccccnnggk",
      "..............kcccccgggk",
      "..............kkkkkkkkkk",
      "...............kkkkkkkk.",
    ],
    avatar_cal: [
      "........................",
      "........................",
      "........................",
      "........................",
      "......kk........kk......",
      ".....kffk......kffk.....",
      ".....kfck.kkkk.kfck.....",
      ".....kfkkkffffkkkfk.....",
      ".....kkffffffffffkk.....",
      ".....kffffffffffffk.....",
      ".....kffffffffffffk.....",
      "....kfffckfffffckffk....",
      "....kfffkkfffffkkffk....",
      "....kffffffccffffffk....",
      "....kffffcckkccffffk....",
      ".....kffccccccccffk.....",
      ".....kffccckkcccffk.....",
      "......kfcccccccckk..k...",
      ".......kkkcccckkkkkkkkkk",
      "..........kkkk.kgggggggk",
      "...............kccccccck",
      "...............kckckckck",
      "...............kccccccck",
      "...............kkkkkkkkk",
    ],
  };
  const CLASS = { o: "px-o", f: "px-f", c: "px-c", n: "px-n", g: "px-g", k: "px-k", l: "px-l", w: "px-w" };
  const reduced = () => !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);

  /* ---------- 文字格子 → SVG（同一列相同顏色的連續像素合併成一個長方形，檔案比較小） ---------- */
  const cache = new Map();
  function markup(name){
    if (cache.has(name)) return cache.get(name);
    const rows = G[name]; if (!rows) return "";
    let s = "";
    rows.forEach((row, y) => {
      let x = 0;
      while (x < row.length){
        const ch = row[x]; let n = 1;
        while (x + n < row.length && row[x + n] === ch) n++;
        if (CLASS[ch]) s += `<rect class="${CLASS[ch]}" x="${x}" y="${y}" width="${n}" height="1"/>`;
        x += n;
      }
    });
    cache.set(name, s); return s;
  }
  function sprite(name, opts = {}){
    const rows = G[name] || G.normal;
    const w = rows[0].length, h = rows.length, scale = (opts.size || 96) / 32;
    const svg = document.createElementNS(SVGNS, "svg");
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    svg.setAttribute("width", String(Math.round(w * scale)));
    svg.setAttribute("height", String(Math.round(h * scale)));
    svg.setAttribute("shape-rendering", "crispEdges");
    svg.setAttribute("class", "px" + (opts.cls ? " " + opts.cls : ""));
    if (opts.label){ svg.setAttribute("role", "img"); svg.setAttribute("aria-label", opts.label); }
    else svg.setAttribute("aria-hidden", "true");
    svg.innerHTML = markup(name);
    return svg;
  }

  function el(tag, attrs, ...kids){
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})){
      if (v == null || v === false) continue;
      if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else if (k === "class") e.className = v;
      else e.setAttribute(k, v === true ? "" : v);
    }
    for (const c of kids.flat(Infinity)){ if (c == null || c === false) continue; e.append(c.nodeType ? c : document.createTextNode(String(c))); }
    return e;
  }

  /* ① 載入中：松鼠追著 132 公車跑過去 */
  function loading(opts = {}){
    return el("div", { class: "px-loading" + (opts.compact ? " compact" : ""), role: "status" },
      el("div", { class: "px-track" },
        el("div", { class: "px-run" }, el("span", { class: "px-hop" }, sprite("normal", { size: opts.compact ? 30 : 42 })), sprite("bus", { size: opts.compact ? 56 : 80, cls: "px-bus" }))),
      el("span", { class: "px-sr" }, opts.label || "載入中…"));
  }

  /* ② 問松果 AI 思考中 */
  function thinking(opts = {}){
    return el("span", { class: "px-thinking", role: "status" }, sprite("think", { size: opts.size || 44 }), el("span", { class: "px-sr" }, "松果正在想…"));
  }

  /* ③ 空白狀態：每種都有一張圖、一句可愛的提示、一個行動按鈕 */
  const EMPTY = {
    rides:  { art: ["stop", "normal"], title: "還沒有人開團", text: "松鼠在站牌下等了好久…開一團，順路的同學就會加入！", action: "開一團" },
    posts:  { art: ["bench", "normal"], title: "這裡還空空的", text: "大廳只剩松鼠一個。發第一篇貼文，打破沉默吧！", action: "發一篇貼文" },
    search: { art: ["search"], title: "找不到符合的結果", text: "松鼠翻遍了松果堆也沒找到，換個關鍵字試試？", action: "清除搜尋" },
  };
  function empty(kind, opts = {}){
    const c = EMPTY[kind] || EMPTY.posts;
    return el("div", { class: "px-empty px-empty-" + kind },
      el("div", { class: "px-scene" }, c.art.map(a => sprite(a, { size: 84, cls: "px-art-" + a }))),
      el("h3", {}, opts.title || c.title),
      opts.text === "" ? null : el("p", {}, opts.text || c.text),   // text:"" ＝不要預設的提示（原本畫面已經有說明時）
      opts.onAction ? el("button", { type: "button", class: "primary", onclick: opts.onAction }, opts.action || c.action) : null);
  }

  /* ⑤ 斷線或錯誤 */
  function error(opts = {}){
    return el("div", { class: "px-empty px-error", role: "alert" },
      el("div", { class: "px-scene" }, sprite("sad", { size: 96 })),
      el("h3", {}, opts.title || "連不上松果"),
      el("p", {}, opts.text || "網路好像斷線了，松鼠也好難過。檢查網路後再試一次。"),
      opts.onRetry ? el("button", { type: "button", class: "primary", onclick: opts.onRetry }, opts.action || "重新整理") : null);
  }

  /* ④ 發文、開團成功：開心表情跳一下（約 1.8 秒後自動消失） */
  let pop = null, popT = 0;
  function celebrate(text, opts = {}){
    if (pop) pop.remove();
    pop = el("div", { class: "px-celebrate" + (reduced() ? " still" : ""), role: "status" }, sprite("happy", { size: 64 }), text ? el("b", {}, text) : null);
    document.body.append(pop);
    if (opts.translate) opts.translate(pop);
    clearTimeout(popT);
    const p = pop; popT = setTimeout(() => { p.classList.add("out"); setTimeout(() => p.remove(), 300); }, opts.ms || 1800);
    return pop;
  }

  /* ⑥ 天氣卡：下雨時撐傘 */
  function weather(isRain, opts = {}){ return sprite(isRain ? "umbrella" : "normal", { size: opts.size || 48, label: opts.label }); }

  /* =====================================================================
     松果 2.0 美術
     ===================================================================== */

  /* ---------- 分頁圖示（24×24）：首頁＝松果、交通＝132 公車、地圖＝地圖釘、社群＝對話泡泡、我的＝松鼠頭 ---------- */
  const ICONS = { home: "icon_home", transit: "icon_bus", map: "icon_map", community: "icon_chat", me: "icon_me" };
  function icon(name, opts = {}){ return sprite(ICONS[name] || name, { size: (opts.size || 24) * 32 / 24, cls: "px-icon" + (opts.cls ? " " + opts.cls : ""), label: opts.label }); }

  /* ---------- 分頁頂部橫幅（全寬、高 96px）：每張是由像素小圖組成的場景 ---------- */
  // [圖名, x, y, 左右翻轉, 放大倍數]，畫布 200×48 像素、放大 2 倍顯示
  const SCENES = {
    home:      [["tree", 8, 8], ["lake", 70, 40], ["reeds", 62, 30], ["reeds", 176, 30], ["goose", 150, 31], ["goose", 126, 33, 1], ["normal", 92, 13]],   // 湖邊松鼠
    transit:   [["stop", 46, 13], ["normal", 58, 13], ["bus", 98, 12, 0, 2], ["tree", 178, 8]],                                                          // 站牌與公車
    map:       [["map", 30, 22], ["stall", 96, 10], ["lantern", 102, 12], ["lantern", 122, 12], ["happy", 62, 13], ["tree", 164, 8]],                     // 小地圖與美食
    community: [["normal", 64, 13], ["normal", 108, 13, 1], ["bubble_dots", 58, 1], ["bubble_heart", 122, 2], ["bench", 150, 30], ["tree", 4, 8]],        // 松鼠們聊天
    me:        [["normal", 58, 13], ["desk", 44, 30], ["lamp", 44, 18], ["laptop", 90, 23], ["books", 104, 23], ["tree", 170, 8]],                       // 松鼠書桌
  };
  const BW = 200, BH = 48, BSCALE = 2;
  function bannerSVG(name, hide = []){
    const svg = document.createElementNS(SVGNS, "svg");
    svg.setAttribute("viewBox", `0 0 ${BW} ${BH}`); svg.setAttribute("width", String(BW * BSCALE)); svg.setAttribute("height", String(BH * BSCALE));
    svg.setAttribute("shape-rendering", "crispEdges"); svg.setAttribute("class", "px px-scene-svg"); svg.setAttribute("aria-hidden", "true");
    let s = `<rect class="px-l" x="0" y="44" width="${BW}" height="1"/><rect class="px-g" x="0" y="45" width="${BW}" height="3"/>`;
    for (const [k, x, y, flip, sc] of SCENES[name] || []){
      const rows = G[k]; if (!rows || hide.includes(k)) continue; const w = rows[0].length, z = sc || 1;
      const t = flip ? `translate(${x + w * z} ${y}) scale(${-z} ${z})` : `translate(${x} ${y}) scale(${z})`;
      s += `<g transform="${t}">${markup(k)}</g>`;
    }
    svg.innerHTML = s; return svg;
  }
  // 天空依時間換色：早上淺藍、傍晚橘粉、晚上深藍加星星（opts.sky）
  function skyOf(d = new Date()){ const h = d.getHours(); return h >= 6 && h < 16 ? "morning" : h >= 16 && h < 19 ? "evening" : "night"; }
  function banner(name, opts = {}){
    // opts.hide：不畫某些小圖（首頁把場景裡的松鼠換成會動的大松鼠 #hero）
    const b = el("div", { class: "px-banner px-banner-" + name + (opts.sky ? " px-sky-" + skyOf() : ""), role: opts.title ? "img" : null, "aria-label": opts.title || null }, bannerSVG(name, opts.hide || []));
    if (opts.sky) b.append(el("span", { class: "px-stars", "aria-hidden": "true" }));
    return b;
  }

  /* ---------- 首頁大松鼠：PIXEL.mount("#hero") ---------- */
  // 會眨眼；依時段說早安／午安／晚安；問松果思考時換成思考，回答完換成開心（約 4 秒後回到普通）
  const heroes = new Set();
  function greeting(d = new Date()){ const h = d.getHours(); return h >= 5 && h < 11 ? "早安" : h >= 11 && h < 17 ? "午安" : "晚安"; }
  function mount(target, opts = {}){
    const host = typeof target === "string" ? document.querySelector(target) : target;
    if (!host) return null;
    const hero = { host, mood: "normal", opts, timer: 0, blinkT: 0 };
    const draw = () => {
      const name = hero.mood === "think" ? "think" : hero.mood === "happy" ? "happy" : "normal";
      const nick = opts.nick ? opts.nick() : "";
      const say = opts.say ? opts.say(hero.mood) : hero.mood === "think" ? "讓我想想…" : hero.mood === "happy" ? "幫你找到了！" : greeting();
      const sayKids = [el("span", {}, say), nick && hero.mood === "normal" ? el("span", { translate: "no" }, (/^en/.test(document.documentElement.lang) ? ", " : "，") + nick) : null];
      const art = sprite(name, { size: opts.size || 112, cls: "px-hero-art" + (hero.mood === "happy" ? " px-hero-happy" : "") });
      if (opts.askHost){
        // 對話泡泡改成「問松果輸入框」的外觀，放在橫幅下方；點了打開問松果
        host.replaceChildren(el("div", { class: "px-hero" }, art));
        opts.askHost.replaceChildren(el("button", { type: "button", class: "px-ask", onclick: () => opts.onAsk && opts.onAsk(), "aria-label": "問松果" },
          sprite(hero.mood === "think" ? "think" : "avatar", { size: 28, cls: "px-ask-av" }),
          el("span", { class: "px-ask-say", "aria-live": "polite" }, sayKids),
          el("span", { class: "px-ask-ph" }, hero.mood === "normal" ? "問我公車、活動、美食…" : ""),
          el("span", { class: "px-ask-go", "aria-hidden": "true" }, "›")));
        if (opts.translate) opts.translate(opts.askHost);
      } else {
        const bubble = el("div", { class: "px-hero-say", "aria-live": "polite" }, sayKids);
        host.replaceChildren(el("div", { class: "px-hero" }, art, bubble));
      }
      host.classList.add("px-hero-host");
      if (opts.translate) opts.translate(host);
      hero.art = art;
    };
    // 眨眼：每 3–6 秒閉眼 0.15 秒（減少動態效果時不眨）
    const blink = () => {
      clearTimeout(hero.blinkT);
      hero.blinkT = setTimeout(() => {
        if (!host.isConnected){ heroes.delete(hero); return; }
        if (!reduced() && hero.mood === "normal" && hero.art && !document.hidden){
          hero.art.innerHTML = markup("blink"); setTimeout(() => { if (hero.mood === "normal" && hero.art) hero.art.innerHTML = markup("normal"); }, 150);
        }
        blink();
      }, 3000 + Math.random() * 3000);
    };
    hero.set = mood => {
      clearTimeout(hero.timer);
      hero.mood = mood; draw();
      if (mood === "happy") hero.timer = setTimeout(() => { hero.mood = "normal"; draw(); }, 4000);
    };
    draw(); blink(); heroes.add(hero);
    return hero;
  }
  function mood(m){ for (const h of heroes){ if (h.host.isConnected) h.set(m); else heroes.delete(h); } }

  /* ---------- 問松果：AI 頭像換成小松鼠、思考中換成思考松鼠，並通知首頁大松鼠 ---------- */
  // 不修改 web/assistant.js：等「問松果」的畫面出現後，把它的圖示換掉。
  let aiBusy = false;
  function enhanceAI(){
    for (const ico of document.querySelectorAll(".ai-panel .ai-ico, .ai-fab .ai-ico, .ai-card .ai-ico, .ai-card-top .ai-ico")){
      if (ico.dataset.px) continue;
      const s = sprite("avatar", { size: 28, cls: "ai-ico px-avatar" }); s.dataset.px = "1"; ico.replaceWith(s);
    }
    for (const t of document.querySelectorAll(".ai-typing")){
      if (t.dataset.px) continue; t.dataset.px = "1";
      for (const i of t.querySelectorAll("i")) i.remove();
      t.prepend(sprite("think", { size: 36, cls: "px-think-mini" }));
    }
    const busy = !!document.querySelector(".ai-panel:not([hidden]) .ai-typing");
    if (busy !== aiBusy){
      aiBusy = busy;
      // 回答完才開心；如果最後是錯誤提示（例如 AI 尚未設定），就回到普通
      const last = [...document.querySelectorAll(".ai-panel .ai-bubble")].pop();
      mood(busy ? "think" : last && last.classList.contains("notice") ? "normal" : "happy");
    }
  }
  let aiObs = null;
  function watchAI(){
    if (aiObs || !document.body) return;
    aiObs = new MutationObserver(() => { cancelAnimationFrame(aiObs.raf); aiObs.raf = requestAnimationFrame(enhanceAI); });
    aiObs.observe(document.body, { childList: true, subtree: true });
    enhanceAI();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", watchAI); else watchAI();

  window.sgPixel = { sprite, loading, thinking, empty, error, celebrate, weather, icon, banner, mount, mood, greeting, skyOf, grids: G, scenes: SCENES, reduced };
  window.PIXEL = window.sgPixel;
})();
