#!/usr/bin/env node
// Количественный подбор акцента под DESIGN_REGISTRY.md: перебор сетки HSL,
// для каждого кандидата — минимальная Lab-дистанция (CIE76) до ВСЕХ акцентов
// реестра, причём дистанция до последних десяти делится на 1.7 (их
// повторять хуже всего). Кандидаты с контрастом белого текста < 4.5:1
// отбрасываются (акцент несёт onAccent-текст).
//
//   node tools/palette-search.js                 # лучшие по секторам 10° + топ-10
//   node tools/palette-search.js --hue 140-230   # только сектор
//   node tools/palette-search.js --near "#52148F" # ближайшие соседи готового цвета
//
// Результат — повод, а не приговор: смотри соседей глазами и пиши их в строку
// реестра честно (см. строки Churnly/Quietzone/Useby).

const fs = require("fs");
const path = require("path");

// Реестр лежит в корне APPs: из шаблона это ../.., из проекта APPs/DD.MM/App — ../../..
function findRegistry() {
  let dir = __dirname;
  for (let i = 0; i < 6; i++) {
    const f = path.join(dir, "DESIGN_REGISTRY.md");
    if (fs.existsSync(f)) return f;
    dir = path.dirname(dir);
  }
  throw new Error("DESIGN_REGISTRY.md не найден выше папки tools");
}
const REG = findRegistry();
const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const txt = fs.readFileSync(REG, "utf8");
// Основная таблица — строки "| **Имя** | ... #hex ...", в порядке добавления.
const acc = txt
  .split("\n")
  .filter((l) => /^\| \*\*/.test(l) && /#[0-9A-Fa-f]{6}/.test(l))
  .map((l) => ({ name: l.split("|")[1].replace(/\*/g, "").trim(), hex: l.match(/#[0-9A-Fa-f]{6}/)[0].toUpperCase() }));
// Плюс старая короткая таблица "| Имя | `#hex` | ..." без жирного — тоже акценты.
for (const l of txt.split("\n")) {
  const m = l.match(/^\| ([^*|][^|]*) \| `(#[0-9A-Fa-f]{6})`/);
  if (m && !acc.some((a) => a.name === m[1].trim())) acc.push({ name: m[1].trim(), hex: m[2].toUpperCase() });
}
const main = txt.split("\n").filter((l) => /^\| \*\*/.test(l) && /#[0-9A-Fa-f]{6}/.test(l));
const recent = new Set(main.slice(-10).map((l) => l.split("|")[1].replace(/\*/g, "").trim()));

const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const lin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
function lab(h) {
  const [r, g, b] = rgb(h).map(lin);
  const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}
const dE = (a, b) => {
  const A = lab(a);
  const B = lab(b);
  return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]);
};
const lum = (h) => {
  const [r, g, b] = rgb(h).map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
function hsl(h, s, l) {
  s /= 100;
  l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return "#" + [f(0), f(8), f(4)].map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("").toUpperCase();
}

console.log(`Акцентов в реестре: ${acc.length}; последние десять: ${[...recent].join(", ")}\n`);

const near = opt("--near");
if (near) {
  const list = acc.map((a) => ({ ...a, d: dE(near.toUpperCase(), a.hex) })).sort((x, y) => x.d - y.d).slice(0, 8);
  for (const a of list) console.log(`${a.name.padEnd(18)} ${a.hex}  ΔE ${a.d.toFixed(1)}${recent.has(a.name) ? "  (из последних 10)" : ""}`);
  console.log(`\nБелый на ${near}: ${((1.05) / (lum(near) + 0.05)).toFixed(2)}:1`);
  process.exit(0);
}

const [h0, h1] = (opt("--hue") ?? "0-359").split("-").map(Number);
const res = [];
for (let h = h0; h <= h1; h += 3)
  for (let s = 40; s <= 80; s += 5)
    for (let l = 26; l <= 46; l += 2) {
      const hx = hsl(h, s, l);
      if (1.05 / (lum(hx) + 0.05) < 4.5) continue;
      let best = Infinity;
      let who = "";
      for (const a of acc) {
        let d = dE(hx, a.hex);
        if (recent.has(a.name)) d /= 1.7;
        if (d < best) {
          best = d;
          who = a.name;
        }
      }
      res.push({ hx, h, s, l, best, who });
    }
res.sort((a, b) => b.best - a.best);
const bySector = {};
for (const r of res) {
  const k = Math.floor(r.h / 10) * 10;
  if (!bySector[k] || bySector[k].best < r.best) bySector[k] = r;
}
console.log("Лучший кандидат по секторам 10° (взвешенная дистанция до ближайшего):");
for (const r of Object.values(bySector)) console.log(`  ${String(r.h).padStart(3)}° ${r.hx}  s${r.s} l${r.l}  ${r.best.toFixed(1)}  ← ${r.who}`);
console.log("\nТоп-10:");
for (const r of res.slice(0, 10)) console.log(`  ${r.hx}  h${r.h} s${r.s} l${r.l}  ${r.best.toFixed(1)}  ← ${r.who}`);
