// Ищет элемент в дампе uiautomator по тексту или content-desc (регулярка или
// точное совпадение) и печатает центр его bounds "x y". Используется
// tools/emu.sh. content-desc у RN — это accessibilityLabel, а у Pressable без
// него — склеенный текст детей через запятую ("Milk, 4 of 4 glasses · ...").
const fs = require("fs");
const [file, pat, nth, mode] = process.argv.slice(2);
const xml = fs.readFileSync(file, "utf8");
const un = (v) => (v === undefined ? "" : v.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&amp;/g, "&"));
const match = mode === "re" ? ((s) => new RegExp(pat).test(s)) : ((s) => s === pat);
const hits = [];
const re = /<node [^>]*>/g;
let m;
while ((m = re.exec(xml))) {
  const n = m[0];
  const t = un((n.match(/ text="([^"]*)"/) || [])[1]);
  const d = un((n.match(/content-desc="([^"]*)"/) || [])[1]);
  if (match(t) || match(d)) {
    const b = n.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
    // Только видимые: в горизонтальных листалках соседние карточки лежат за
    // краем экрана с теми же подписями — тап по ним ушёл бы в никуда.
    if (b) {
      const x = (+b[1] + +b[3]) >> 1;
      const y = (+b[2] + +b[4]) >> 1;
      if (x > 0 && x < 1080 && y > 0 && y < 2400) hits.push([x, y]);
    }
  }
}
const h = hits[(+nth || 1) - 1];
console.log(h ? h.join(" ") : "");
