// "Почему так": разложение решения планировщика по одной привычке — откуда
// вероятность каждого дня (априор привычки против собственных наблюдений дня
// недели), сколько каждый выбранный день добавляет к шансу закрыть квоту и
// почему остальные дни не взяты.

import { atLeast, poissonBinomial } from "./stats.ts";
import { posterior, type Posterior } from "./model.ts";
import type { Plan, PlanInput } from "./planner.ts";
import { allowsDay, type ModelState } from "./types.ts";
import { weekdayIndex } from "./time.ts";

export type ChosenDay = { day: string; p: Posterior; marginal: number; pinned: boolean };
export type SkippedDay = { day: string; reason: string };

export type Explanation = {
  chosen: ChosenDay[];
  skipped: SkippedDay[];
  pHit: number;
  need: number;
  buffer: number; // запасных дней сверх нужного
};

export function explainHabit(input: PlanInput, plan: Plan, model: ModelState, habitId: string): Explanation | null {
  const hp = plan.habits.find((h) => h.habitId === habitId);
  const habit = input.habits.find((h) => h.id === habitId);
  if (!hp || !habit) return null;
  const done = input.done[habitId] ?? [];

  const chosen = hp.days.map((day, i) => {
    const rest = hp.probs.filter((_, j) => j !== i);
    const without = atLeast(poissonBinomial(rest), hp.need);
    return { day, p: posterior(model, habitId, weekdayIndex(day)), marginal: hp.pHit - without, pinned: hp.pinned.includes(day) };
  });

  const minP = Math.min(...hp.probs, 1);
  const skipped: SkippedDay[] = [];
  plan.days.forEach((day, i) => {
    if (hp.days.includes(day)) return;
    const wd = weekdayIndex(day);
    let reason: string;
    if (done.includes(day)) reason = "Already done that day.";
    else if (input.busy.includes(wd)) reason = "Marked as fully booked.";
    else if (!allowsDay(habit.days, wd)) reason = "Not one of this habit's days.";
    else if (hp.need === 0) reason = "Quota already met.";
    else if (plan.capacity[i] - plan.load[i] < habit.minutes) reason = `Full: ${plan.load[i]} of ${plan.capacity[i]} min booked.`;
    else {
      const p = posterior(model, habitId, wd).mean;
      reason = p < minP ? `Lower odds (${Math.round(p * 100)}%) than the chosen days.` : "Extra slot would add too little.";
    }
    skipped.push({ day, reason });
  });

  return { chosen, skipped, pHit: hp.pHit, need: hp.need, buffer: Math.max(0, hp.days.length - hp.need) };
}
