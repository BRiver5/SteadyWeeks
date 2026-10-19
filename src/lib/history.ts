// Журнал → наблюдения модели и история недель для Stats.
// planned — снимок плана на день (с прогнозной вероятностью), completions —
// факт. Закрытый запланированный день = одно наблюдение модели и одна пара
// "прогноз/исход" для калибровки.

import { addDays, weekStart, weekdayIndex } from "./time.ts";
import { brier, wilson } from "./stats.ts";
import type { Observation } from "./model.ts";
import type { Habit } from "./types.ts";

export type PlannedRow = { day: string; habitId: string; p: number };
export type Completion = { day: string; habitId: string; planned: boolean };

const key = (habitId: string, day: string) => `${habitId}|${day}`;

// Наблюдения за дни из (after, until] в хронологическом порядке.
export function observationsBetween(planned: PlannedRow[], completions: Completion[], after: string | null, until: string): Observation[] {
  const doneSet = new Set(completions.map((c) => key(c.habitId, c.day)));
  return planned
    .filter((r) => (after === null || r.day > after) && r.day <= until)
    .sort((a, b) => (a.day === b.day ? a.habitId.localeCompare(b.habitId) : a.day < b.day ? -1 : 1))
    .map((r) => ({ habitId: r.habitId, weekday: weekdayIndex(r.day), success: doneSet.has(key(r.habitId, r.day)) }));
}

export type WeekSummary = {
  week: string;
  hits: number; // привычек с закрытой квотой
  total: number; // активных привычек в эту неделю
  done: number; // всего заходов
  perHabit: Record<string, number>;
};

export function weekHistory(
  habits: Habit[],
  completions: Completion[],
  targets: (week: string, habit: Habit) => number,
  today: string,
  weeks: number,
): WeekSummary[] {
  const current = weekStart(today);
  const out: WeekSummary[] = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const ws = addDays(current, -7 * w);
    const we = addDays(ws, 6);
    const active = habits.filter((h) => h.createdAt.slice(0, 10) <= we);
    const perHabit: Record<string, number> = {};
    for (const c of completions) if (c.day >= ws && c.day <= we) perHabit[c.habitId] = (perHabit[c.habitId] ?? 0) + 1;
    const hits = active.filter((h) => (perHabit[h.id] ?? 0) >= targets(ws, h)).length;
    out.push({ week: ws, hits, total: active.length, done: Object.values(perHabit).reduce((s, x) => s + x, 0), perHabit });
  }
  return out;
}

// Серия полностью закрытых недель подряд (текущая неделя не считается, пока не закончилась).
export function perfectStreak(history: WeekSummary[]): { current: number; best: number } {
  let best = 0;
  let run = 0;
  const closed = history.slice(0, -1);
  for (const w of closed) {
    if (w.total > 0 && w.hits === w.total) best = Math.max(best, ++run);
    else run = 0;
  }
  return { current: run, best };
}

export type CalibrationBin = { lo: number; hi: number; n: number; predicted: number; actual: number };

export function calibration(planned: PlannedRow[], completions: Completion[], before: string) {
  const doneSet = new Set(completions.map((c) => key(c.habitId, c.day)));
  const pairs = planned.filter((r) => r.day < before).map((r) => ({ p: r.p, y: doneSet.has(key(r.habitId, r.day)) ? 1 : 0 }));
  const edges = [0, 0.5, 0.65, 0.8, 1.0001];
  const bins: CalibrationBin[] = [];
  for (let i = 0; i < edges.length - 1; i++) {
    const inBin = pairs.filter((x) => x.p >= edges[i] && x.p < edges[i + 1]);
    bins.push({
      lo: edges[i],
      hi: Math.min(1, edges[i + 1]),
      n: inBin.length,
      predicted: inBin.length ? inBin.reduce((s, x) => s + x.p, 0) / inBin.length : 0,
      actual: inBin.length ? inBin.reduce((s, x) => s + x.y, 0) / inBin.length : 0,
    });
  }
  const base = pairs.length ? pairs.reduce((s, x) => s + x.y, 0) / pairs.length : 0;
  const score = brier(pairs);
  const baseline = brier(pairs.map((x) => ({ p: base, y: x.y })));
  // Skill > 0 — прогноз по дням недели лучше, чем "всегда средний процент".
  return { bins, n: pairs.length, brier: score, skill: baseline > 0 ? 1 - score / baseline : 0 };
}

export type WeekdayRate = { weekday: number; planned: number; done: number; rate: number; lo: number; hi: number };

export function weekdayRates(planned: PlannedRow[], completions: Completion[], before: string, habitId?: string): WeekdayRate[] {
  const doneSet = new Set(completions.map((c) => key(c.habitId, c.day)));
  const rows = planned.filter((r) => r.day < before && (!habitId || r.habitId === habitId));
  return Array.from({ length: 7 }, (_, wd) => {
    const inDay = rows.filter((r) => weekdayIndex(r.day) === wd);
    const done = inDay.filter((r) => doneSet.has(key(r.habitId, r.day))).length;
    const [lo, hi] = wilson(done, inDay.length);
    return { weekday: wd, planned: inDay.length, done, rate: inDay.length ? done / inDay.length : 0, lo, hi };
  });
}

// Лучший/худший день недели — только если интервалы Уилсона не пересекаются.
export function reliableExtremes(rates: WeekdayRate[]): { best: WeekdayRate; worst: WeekdayRate; reliable: boolean } | null {
  const usable = rates.filter((r) => r.planned >= 3);
  if (usable.length < 2) return null;
  const sorted = [...usable].sort((a, b) => b.rate - a.rate);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  return { best, worst, reliable: best.lo > worst.hi };
}
