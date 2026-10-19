// Конфликты плана и ранжированные выходы. Каждый выход ПРОВЕРЕН повторным
// прогоном планировщика: показывается только то, что реально поднимает
// ожидаемое число закрытых квот, отсортировано по выигрышу.

import { buildPlan, QUICK_LIMIT, unconstrainedHit, type Plan, type PlanInput } from "./planner.ts";
import { applyChange, describeChange, type Change } from "./changes.ts";
import { allowsDay, WEEKDAYS, type Habit } from "./types.ts";
import { weekdayIndex } from "./time.ts";

export type Fix = { change: Change; label: string; gain: number; after: number };

export type Conflict = {
  id: string;
  kind: "unreachable" | "squeezed" | "overbooked";
  habitId?: string;
  title: string;
  reason: string;
  fixes: Fix[];
};

const MIN_GAIN = 0.005;
const SQUEEZE_GAP = 0.15;

function verify(input: PlanInput, plan: Plan, changes: Change[], name: (id: string) => string): Fix[] {
  const seen = new Set<string>();
  const fixes: Fix[] = [];
  for (const change of changes) {
    const key = JSON.stringify(change);
    if (seen.has(key)) continue;
    seen.add(key);
    const after = buildPlan(applyChange(input, change), QUICK_LIMIT);
    const gain = after.expectedHits - plan.expectedHits;
    if (gain > MIN_GAIN) fixes.push({ change, label: describeChange(change, name), gain, after: after.expectedHits });
  }
  return fixes.sort((a, b) => b.gain - a.gain).slice(0, 3);
}

function list(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export function findConflicts(input: PlanInput, plan: Plan): Conflict[] {
  const byId = new Map(input.habits.map((h) => [h.id, h] as const));
  const name = (id: string) => byId.get(id)?.name ?? "Habit";
  const out: Conflict[] = [];

  // 1. Закреплённая нагрузка уже больше лимита дня.
  plan.days.forEach((day) => {
    const wd = weekdayIndex(day);
    const raw = input.busy.includes(wd) ? 0 : input.capacity[wd];
    const pins = input.pins.filter((p) => p.day === day && byId.has(p.habitId));
    const pinned = pins.reduce((s, p) => s + (byId.get(p.habitId)?.minutes ?? 0), 0);
    if (pins.length > 0 && pinned > raw) {
      const changes: Change[] = pins.map((p) => ({ kind: "unpin", habitId: p.habitId, day }));
      // Снятие закрепа не меняет вероятности напрямую — ранжируем по честному
      // пересчёту, а если выигрыша нет, всё равно предлагаем (день переполнен).
      const fixes = verify(input, plan, changes, name);
      out.push({
        id: `over-${day}`,
        kind: "overbooked",
        title: `${WEEKDAYS[wd]} is overbooked`,
        reason: `Pinned sessions need ${pinned} min, but the day allows ${raw} min.`,
        fixes: fixes.length
          ? fixes
          : changes.map((c) => ({ change: c, label: describeChange(c, name), gain: 0, after: plan.expectedHits })),
      });
    }
  });

  for (const hp of plan.habits) {
    const habit = byId.get(hp.habitId) as Habit;
    if (hp.status === "met") continue;

    // 2. Квота недостижима: дней не хватает в принципе.
    if (hp.status === "unreachable") {
      const blocked = plan.days.filter((d) => !hp.candidates.includes(d) && !(input.done[hp.habitId] ?? []).includes(d));
      const changes: Change[] = [
        { kind: "target", habitId: hp.habitId, target: hp.doneCount + hp.candidates.length },
        ...blocked.map((d) => ({ kind: "allowDay" as const, habitId: hp.habitId, weekday: weekdayIndex(d), allow: true })),
      ];
      out.push({
        id: `unr-${hp.habitId}`,
        kind: "unreachable",
        habitId: hp.habitId,
        title: `${habit.name} can't reach ${hp.target}× this week`,
        reason: `It still needs ${hp.need}, but only ${hp.candidates.length} allowed ${hp.candidates.length === 1 ? "day is" : "days are"} left.`,
        fixes: verify(input, plan, changes, name),
      });
      continue;
    }

    // 3. Привычку зажал дневной лимит: без лимитов шанс заметно выше.
    const free = unconstrainedHit(input, hp.habitId);
    if (free - hp.pHit >= SQUEEZE_GAP) {
      const full = hp.candidates.filter((d) => {
        const i = plan.days.indexOf(d);
        return !hp.days.includes(d) && plan.capacity[i] - plan.load[i] < habit.minutes;
      });
      const changes: Change[] = [];
      for (const d of full) {
        const i = plan.days.indexOf(d);
        const missing = habit.minutes - (plan.capacity[i] - plan.load[i]);
        const wd = weekdayIndex(d);
        changes.push({ kind: "capacity", weekday: wd, minutes: input.capacity[wd] + Math.ceil(missing / 5) * 5 });
      }
      if (habit.minutes > 10) changes.push({ kind: "minutes", habitId: habit.id, minutes: Math.max(5, habit.minutes - 15) });
      for (let wd = 0; wd < 7; wd++) {
        const day = plan.days.find((d) => weekdayIndex(d) === wd);
        if (day && !allowsDay(habit.days, wd) && !(input.done[habit.id] ?? []).includes(day)) changes.push({ kind: "allowDay", habitId: habit.id, weekday: wd, allow: true });
      }
      changes.push({ kind: "target", habitId: habit.id, target: Math.max(1, hp.target - 1) });
      out.push({
        id: `sq-${hp.habitId}`,
        kind: "squeezed",
        habitId: hp.habitId,
        title: `${habit.name} is squeezed`,
        reason: full.length
          ? `${list(full.map((d) => WEEKDAYS[weekdayIndex(d)]))} ${full.length === 1 ? "has" : "have"} no room for ${habit.minutes} min. With room it would be ${Math.round(free * 100)}% instead of ${Math.round(hp.pHit * 100)}%.`
          : `Other habits took the open days. With room it would be ${Math.round(free * 100)}% instead of ${Math.round(hp.pHit * 100)}%.`,
        fixes: verify(input, plan, changes, name),
      });
    }
  }
  return out;
}
