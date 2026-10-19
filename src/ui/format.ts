import { addDays, dayLabel, weekdayLabel } from "../lib/time.ts";
import { pluralWord } from "../lib/words.ts";

export function money(x: number, cur: string): string {
  const v = Math.abs(x) < 0.005 ? 0 : x;
  const s = Math.abs(v) >= 100 ? Math.round(v).toString() : v.toFixed(2);
  return cur.length > 1 ? `${s} ${cur}` : `${cur}${s}`;
}

export function pct(p: number): string {
  if (p > 0 && p < 0.01) return "<1%";
  if (p < 1 && p > 0.99) return ">99%";
  return `${Math.round(p * 100)}%`;
}

export function num(x: number): string {
  return Math.abs(x) >= 10 || Number.isInteger(x) ? Math.round(x).toString() : x.toFixed(1);
}

export function plural(n: number, word: string): string {
  return `${n} ${n === 1 ? word : pluralWord(word)}`;
}

// Дробное количество порций: "~1 glass", "2.2 slices".
export function qty(x: number, word: string): string {
  const s = num(x);
  return `${s} ${s === "1" ? word : pluralWord(word)}`;
}

// Подпись дня плана/ленты относительно сегодня.
export function relDay(idx: number): string {
  if (idx < 0) return idx === -1 ? "yesterday" : `${-idx} days ago`;
  if (idx === 0) return "today";
  if (idx === 1) return "tomorrow";
  return `in ${idx} days`;
}

export function dayTitle(today: string, idx: number): string {
  const iso = addDays(today, idx);
  if (idx === 0) return `Today · ${weekdayLabel(iso)}, ${dayLabel(iso)}`;
  if (idx === 1) return `Tomorrow · ${weekdayLabel(iso)}, ${dayLabel(iso)}`;
  return `${weekdayLabel(iso)}, ${dayLabel(iso)}`;
}

export function shortDay(today: string, idx: number): string {
  if (idx === 0) return "Today";
  if (idx === 1) return "Tmrw";
  return weekdayLabel(addDays(today, idx));
}
