// Изменение входа планировщика — общий язык для "исправлений" конфликтов и
// для режима "что если": одно и то же изменение применяется к копии входа,
// план пересобирается, и сравнение до/после — честный повторный прогон.

import { buildPlan, type Plan, type PlanInput } from "./planner.ts";
import { WEEKDAYS } from "./types.ts";
import { weekdayIndex } from "./time.ts";

export type Change =
  | { kind: "capacity"; weekday: number; minutes: number } // новый лимит дня
  | { kind: "busy"; weekday: number } // день занят целиком
  | { kind: "target"; habitId: string; target: number } // квота этой недели
  | { kind: "allowDay"; habitId: string; weekday: number; allow: boolean }
  | { kind: "minutes"; habitId: string; minutes: number }
  | { kind: "unpin"; habitId: string; day: string };

export function applyChange(input: PlanInput, c: Change): PlanInput {
  switch (c.kind) {
    case "capacity":
      return { ...input, capacity: input.capacity.map((m, i) => (i === c.weekday ? Math.max(0, c.minutes) : m)) };
    case "busy":
      return { ...input, busy: input.busy.includes(c.weekday) ? input.busy : [...input.busy, c.weekday] };
    case "target":
      return { ...input, targets: { ...input.targets, [c.habitId]: Math.max(0, c.target) } };
    case "allowDay":
      return {
        ...input,
        habits: input.habits.map((h) => (h.id === c.habitId ? { ...h, days: c.allow ? h.days | (1 << c.weekday) : h.days & ~(1 << c.weekday) } : h)),
      };
    case "minutes":
      return { ...input, habits: input.habits.map((h) => (h.id === c.habitId ? { ...h, minutes: Math.max(5, c.minutes) } : h)) };
    case "unpin":
      return { ...input, pins: input.pins.filter((p) => !(p.habitId === c.habitId && p.day === c.day)) };
  }
}

export function describeChange(c: Change, habitName: (id: string) => string): string {
  switch (c.kind) {
    case "capacity":
      return `${WEEKDAYS[c.weekday]} limit → ${c.minutes} min`;
    case "busy":
      return `${WEEKDAYS[c.weekday]} fully booked`;
    case "target":
      return `${habitName(c.habitId)}: ${c.target}× this week`;
    case "allowDay":
      return `${c.allow ? "Allow" : "Block"} ${habitName(c.habitId)} on ${WEEKDAYS[c.weekday]}`;
    case "minutes":
      return `${habitName(c.habitId)} sessions → ${c.minutes} min`;
    case "unpin":
      return `Unpin ${habitName(c.habitId)} from ${WEEKDAYS[weekdayIndex(c.day)]}`;
  }
}

export type HabitDelta = {
  habitId: string;
  before: number;
  after: number;
  daysBefore: string[];
  daysAfter: string[];
  moved: boolean;
};

export type Comparison = {
  before: Plan;
  after: Plan;
  delta: number; // изменение ожидаемого числа закрытых квот
  rows: HabitDelta[];
  minutesBefore: number;
  minutesAfter: number;
};

export function compare(before: Plan, after: Plan): Comparison {
  const rows = before.habits.map((b) => {
    const a = after.habits.find((x) => x.habitId === b.habitId) ?? b;
    return {
      habitId: b.habitId,
      before: b.pHit,
      after: a.pHit,
      daysBefore: b.days,
      daysAfter: a.days,
      moved: b.days.join() !== a.days.join(),
    };
  });
  return {
    before,
    after,
    delta: after.expectedHits - before.expectedHits,
    rows,
    minutesBefore: before.load.reduce((s, x) => s + x, 0),
    minutesAfter: after.load.reduce((s, x) => s + x, 0),
  };
}

export function whatIf(input: PlanInput, changes: Change[], base?: Plan): Comparison {
  const before = base ?? buildPlan(input);
  const next = changes.reduce(applyChange, input);
  return compare(before, buildPlan(next));
}
