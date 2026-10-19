// Производные данные для экранов из состояния стора — одна функция на виджет,
// чтобы доска, циферблат и списки считали один и тот же план одинаково.

import { addDays, weekdayIndex } from "../lib/time";
import { WEEKDAYS } from "../lib/types";
import type { HabitPlan, Plan } from "../lib/planner";
import type { Completion, PlannedRow } from "../lib/history";
import type { Habit, Pin } from "../lib/types";
import type { BoardDay } from "../components/WeekBoard";
import type { DialDay } from "../components/WeekDial";

export type Snapshot = {
  today: string;
  week: string;
  habits: Habit[];
  completions: Completion[];
  planned: PlannedRow[];
  pins: Pin[];
  busy: number[];
  plan: Plan;
  capacity: number[];
};

export function weekDays(week: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(week, i));
}

export function doneOn(s: Snapshot, habitId: string, day: string): boolean {
  return s.completions.some((c) => c.habitId === habitId && c.day === day);
}

export function boardDays(s: Snapshot): BoardDay[] {
  return weekDays(s.week).map((day) => {
    const wd = weekdayIndex(day);
    const isPast = day < s.today;
    const pi = s.plan.days.indexOf(day);
    const chips: BoardDay["chips"] = [];
    for (const h of s.habits) {
      const done = doneOn(s, h.id, day);
      const hp = s.plan.habits.find((x) => x.habitId === h.id);
      const idx = hp ? hp.days.indexOf(day) : -1;
      if (done || idx >= 0) chips.push({ habitId: h.id, icon: h.icon, color: h.color, done, pinned: s.pins.some((p) => p.habitId === h.id && p.day === day), p: idx >= 0 ? hp!.probs[idx] : undefined });
    }
    const doneMinutes = chips.filter((c) => c.done).reduce((sum, c) => sum + (s.habits.find((h) => h.id === c.habitId)?.minutes ?? 0), 0);
    return {
      day,
      label: WEEKDAYS[wd],
      date: Number(day.slice(8, 10)),
      load: pi >= 0 ? s.plan.load[pi] + doneMinutes : doneMinutes,
      capacity: pi >= 0 ? s.plan.capacity[pi] + doneMinutes : s.busy.includes(wd) ? 0 : s.capacity[wd],
      isToday: day === s.today,
      isPast,
      busy: s.busy.includes(wd),
      chips,
    };
  });
}

export function dialDays(s: Snapshot): DialDay[] {
  return weekDays(s.week).map((day) => {
    const done = s.completions.filter((c) => c.day === day).length;
    const future = s.plan.habits.filter((hp) => hp.days.includes(day)).length;
    const pastPlanned = s.planned.filter((r) => r.day === day).length;
    return { label: WEEKDAYS[weekdayIndex(day)].slice(0, 1), slots: day < s.today ? Math.max(pastPlanned, done) : done + future, done, isToday: day === s.today, isPast: day < s.today };
  });
}

export function statusLabel(hp: HabitPlan): string {
  switch (hp.status) {
    case "met":
      return "Quota met";
    case "unreachable":
      return "Out of days";
    case "onTrack":
      return "On track";
    case "atRisk":
      return "At risk";
  }
}

export function shortDays(days: string[]): string {
  return days.length ? days.map((d) => WEEKDAYS[weekdayIndex(d)]).join(" · ") : "—";
}

export function daysMaskLabel(mask: number): string {
  if (mask === 0b1111111) return "Any day";
  if (mask === 0b0011111) return "Weekdays";
  if (mask === 0b1100000) return "Weekends";
  return WEEKDAYS.filter((_, i) => mask & (1 << i)).join(" ");
}
