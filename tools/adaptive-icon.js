#!/usr/bin/env node
// Слой переднего плана адаптивной иконки Android из release/creo/icon.png.
//
// Зачем: icon.png пользователя — готовая картинка со своим фоном и скруглённым
// квадратом. Если отдать её как adaptiveIcon.foregroundImage целиком, лаунчер
// наложит свою маску (круг/сквиркл) поверх уже скруглённого квадрата —
// получаются двойные углы и обрезанный символ. Правильно: символ на прозрачном
// фоне, уменьшенный до безопасной зоны (круг 66dp из 108dp), а фон — сплошной
// цвет adaptiveIcon.backgroundColor.
//
// Как работает: цвет фона берётся медианой по кольцу у края картинки, альфа
// каждого пикселя — по его удалённости от фона (с "размоткой" полупрозрачных
// краёв обратно к чистому цвету), рамка/скруглённые углы отрезаются отступом.
// Детали символа того же цвета, что фон (белая звезда на светлом фоне и т.п.),
// становятся прозрачными и показывают backgroundColor — визуально то же самое.
//
// --full: для иконок, где символ того же цвета, что фон (белый календарь на
// светлом фоне и т.п.), вырезание по цвету ломает рисунок. В этом режиме
// картинка берётся ЦЕЛИКОМ без внешних скруглённых углов (центральные 90%),
// вписывается в квадрат 600/1024 (диагональ ≈ видимому кругу маски), а фон
// заливается медианным цветом края — рисунок цел, двойных углов нет.
//
// Запуск (из папки проекта, нужен установленный node_modules — jimp-compact
// приходит транзитивно с expo):
//   node tools/adaptive-icon.js [icon.png] [out.png] [--scale 0.44] [--preview preview.png]
// По умолчанию: release/creo/icon.png → release/creo/adaptive-foreground.png.
// Скрипт печатает цвет для adaptiveIcon.backgroundColor. ОБЯЗАТЕЛЬНО посмотри
// превью (символ должен целиком помещаться в круг) перед prebuild.

const path = require("path");
const Jimp = require(path.join(process.cwd(), "node_modules", "jimp-compact"));

const args = process.argv.slice(2);
const flag = (name, def) => {
  const i = args.indexOf(name);
  if (i < 0) return def;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const full = args.includes("--full");
if (full) args.splice(args.indexOf("--full"), 1);
const scale = Number(flag("--scale", full ? "0.6" : "0.44"));
const previewPath = flag("--preview", "release/creo/adaptive-preview.png");
const input = args[0] ?? "release/creo/icon.png";
const output = args[1] ?? "release/creo/adaptive-foreground.png";

const hex = (c) => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("").toUpperCase();

(async () => {
  const img = await Jimp.read(input);
  const w = img.bitmap.width;
  const h = img.bitmap.height;
  const d = img.bitmap.data;
  const inset = Math.round(w * 0.08);
  const at = (x, y) => (y * w + x) * 4;

  // Фон: медиана по квадратному кольцу на отступе 12% (внутри скругления).
  const ring = Math.round(w * 0.12);
  const samples = [];
  for (let t = ring; t < w - ring; t += 4) {
    for (const [x, y] of [[t, ring], [t, h - ring - 1], [ring, t], [w - ring - 1, t]]) {
      const i = at(x, y);
      if (d[i + 3] > 250) samples.push([d[i], d[i + 1], d[i + 2]]);
    }
  }
  const med = (k) => samples.map((s) => s[k]).sort((a, b) => a - b)[samples.length >> 1];
  const bg = [med(0), med(1), med(2)];

  if (full) {
    const inner = Math.round(w * 0.9);
    const off = Math.round((w - inner) / 2);
    const art = img.clone().crop(off, off, inner, inner);
    const target = Math.round(1024 * scale);
    art.resize(target, target);
    // Растушёвка края (последние 5%): без неё на стыке с фоном виден квадрат.
    const fe = Math.round(target * 0.05);
    art.scan(0, 0, target, target, function (x, y, i) {
      const d = Math.min(x, y, target - 1 - x, target - 1 - y);
      if (d < fe) this.bitmap.data[i + 3] = Math.round(this.bitmap.data[i + 3] * (d / fe));
    });
    const out = new Jimp(1024, 1024, 0x00000000);
    out.composite(art, (1024 - target) >> 1, (1024 - target) >> 1);
    await out.writeAsync(output);
    const prev = new Jimp(1024, 1024, Jimp.rgbaToInt(bg[0], bg[1], bg[2], 255));
    prev.composite(out, 0, 0);
    prev.scan(0, 0, 1024, 1024, function (x, y, i) {
      if (Math.hypot(x - 512, y - 512) > (512 * 72) / 108) this.bitmap.data[i + 3] = 0;
    });
    await prev.writeAsync(previewPath);
    console.log(`foreground: ${output}  (full artwork)`);
    console.log(`preview:    ${previewPath}`);
    console.log(`app.json → android.adaptiveIcon = { foregroundImage: "./${output.replace(/\\/g, "/")}", backgroundColor: "${hex(bg)}" }`);
    return;
  }

  // Порог "это фон" — по разбросу самого фона (градиенты), "это символ" —
  // 90-й перцентиль удалённости среди явно не фоновых пикселей.
  const distOf = (i) => Math.hypot(d[i] - bg[0], d[i + 1] - bg[1], d[i + 2] - bg[2]);
  const bgSpread = samples.map((s) => Math.hypot(s[0] - bg[0], s[1] - bg[1], s[2] - bg[2])).sort((a, b) => a - b);
  const low = Math.max(18, bgSpread[Math.floor(bgSpread.length * 0.95)] + 6);
  const far = [];
  for (let y = inset; y < h - inset; y += 2) for (let x = inset; x < w - inset; x += 2) {
    const dist = distOf(at(x, y));
    if (dist > low * 2) far.push(dist);
  }
  far.sort((a, b) => a - b);
  const high = Math.max(low + 30, far.length ? far[Math.floor(far.length * 0.9)] : 200);

  let x0 = w, y0 = h, x1 = 0, y1 = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = at(x, y);
    const edge = d[i + 3] < 250 || x < inset || y < inset || x >= w - inset || y >= h - inset;
    const a = edge ? 0 : Math.max(0, Math.min(1, (distOf(i) - low) / (high - low)));
    for (let k = 0; k < 3; k++) d[i + k] = a > 0 ? Math.max(0, Math.min(255, Math.round((d[i + k] - (1 - a) * bg[k]) / a))) : 0;
    d[i + 3] = Math.round(a * 255);
    if (a > 0.1) {
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
  }
  if (x1 <= x0) throw new Error("Символ не найден — проверь icon.png (фон и символ одного цвета?)");

  const side = Math.max(x1 - x0, y1 - y0) + 1;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const glyph = img.clone().crop(Math.round(cx - side / 2), Math.round(cy - side / 2), side, side);
  const target = Math.round(1024 * scale);
  glyph.resize(target, target);
  const out = new Jimp(1024, 1024, 0x00000000);
  out.composite(glyph, (1024 - target) >> 1, (1024 - target) >> 1);
  await out.writeAsync(output);

  // Превью: фон + видимая маска-круг безопасной зоны (66dp из 108dp).
  const prev = new Jimp(1024, 1024, Jimp.rgbaToInt(bg[0], bg[1], bg[2], 255));
  prev.composite(out, 0, 0);
  prev.scan(0, 0, 1024, 1024, function (x, y, i) {
    if (Math.hypot(x - 512, y - 512) > (512 * 66) / 108) this.bitmap.data[i + 3] = 0;
  });
  await prev.writeAsync(previewPath);

  console.log(`foreground: ${output}`);
  console.log(`preview:    ${previewPath}  (символ должен целиком помещаться в круг)`);
  console.log(`app.json → android.adaptiveIcon = { foregroundImage: "./${output.replace(/\\/g, "/")}", backgroundColor: "${hex(bg)}" }`);
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
