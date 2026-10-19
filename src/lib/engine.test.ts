import { test } from "node:test";
import assert from "node:assert/strict";
import { atLeast, poissonBinomial, wilson } from "./stats.ts";
import { emptyModel, observe, posterior, prob, replay } from "./model.ts";
import { buildPlan, progress, remainingDays, type PlanInput } from "./planner.ts";
import { findConflicts } from "./conflicts.ts";
import { whatIf } from "./changes.ts";
import { explainHabit } from "./explain.ts";
import { observationsBetween, perfectStreak, weekHistory } from "./history.ts";
import type { Habit } from "./types.ts";

const ALL = 0b1111111;
const habit = (id: string, target: number, minutes: number, days = ALL): Habit => ({ id, name: id, target, minutes, days, color: "#000", icon: "leaf", createdAt: "2026-10-01" });

function input(over: Partial<PlanInput>): PlanInput {
  return {
    today: "2026-10-19", // понедельник
    weekStart: "2026-10-19",
    habits: [],
    targets: {},
    done: {},
    capacity: [60, 60, 60, 60, 60, 60, 60],
    busy: [],
    pins: [],
    prob: () => 0.7,
    ...over,
  };
}

test("poisson-binomial sums to one and matches the binomial", () => {
  const d = poissonBinomial([0.5, 0.5, 0.5]);
  assert.deepEqual(d.map((x) => Math.round(x * 1000) / 1000), [0.125, 0.375, 0.375, 0.125]);
  assert.ok(Math.abs(atLeast(d, 2) - 0.5) < 1e-12);
  const [lo, hi] = wilson(8, 10);
  assert.ok(lo > 0.44 && lo < 0.5 && hi > 0.94 && hi < 0.97);
});

test("model accumulates, decays and shrinks a weekday toward the habit level", () => {
  const m = emptyModel();
  const fresh = prob(m, "a", 0);
  assert.ok(Math.abs(fresh - 0.7) < 1e-9);
  for (let i = 0; i < 6; i++) observe(m, "a", 2, false);
  const wed = posterior(m, "a", 2);
  const mon = posterior(m, "a", 0);
  assert.ok(wed.mean < 0.25, "misses on Wednesday pull Wednesday down");
  assert.ok(mon.mean < 0.7 && mon.mean > wed.mean, "Monday is pulled only through the habit level");
  assert.ok(wed.priorWeight < 0.5);
  // Порядок важен: свежие успехи весят больше старых провалов.
  const recentGood = replay([...Array(5).fill({ habitId: "b", weekday: 1, success: false }), ...Array(5).fill({ habitId: "b", weekday: 1, success: true })]);
  const recentBad = replay([...Array(5).fill({ habitId: "b", weekday: 1, success: true }), ...Array(5).fill({ habitId: "b", weekday: 1, success: false })]);
  assert.ok(prob(recentGood, "b", 1) > prob(recentBad, "b", 1));
});

test("remaining days run from today to Sunday", () => {
  assert.equal(remainingDays("2026-10-22", "2026-10-19").length, 4);
  assert.equal(remainingDays("2026-10-25", "2026-10-19")[0], "2026-10-25");
});

test("planner picks the most reliable weekdays and respects capacity exactly", () => {
  const probs = [0.9, 0.3, 0.85, 0.3, 0.8, 0.4, 0.4];
  const plan = buildPlan(input({ habits: [habit("run", 3, 30)], prob: (_, wd) => probs[wd] }));
  const run = plan.habits[0];
  assert.ok(run.days.includes("2026-10-19") && run.days.includes("2026-10-21") && run.days.includes("2026-10-23"));
  assert.ok(run.pHit > 0.6);
  assert.ok(plan.exact);

  // Два захода по 40 минут при лимите 60 не помещаются в один день.
  const tight = buildPlan(input({ habits: [habit("a", 4, 40), habit("b", 4, 40)], capacity: [60, 60, 60, 60, 60, 60, 60] }));
  tight.load.forEach((l, i) => assert.ok(l <= tight.capacity[i]));
  const totalSlots = tight.habits.reduce((s, h) => s + h.days.length, 0);
  assert.ok(totalSlots <= 7);
});

test("branch and bound matches brute force on a small instance", () => {
  const habits = [habit("a", 2, 30), habit("b", 2, 30, 0b0011111), habit("c", 1, 45)];
  const inp = input({ today: "2026-10-22", habits, capacity: [60, 60, 60, 60, 60, 60, 60], prob: (id, wd) => (id === "a" ? 0.5 + wd * 0.05 : 0.6) });
  const plan = buildPlan(inp);
  // Полный перебор всех назначений (по 4 дня, 2^4 на привычку).
  const days = plan.days;
  let best = -Infinity;
  for (let a = 0; a < 16; a++)
    for (let b = 0; b < 16; b++)
      for (let c = 0; c < 16; c++) {
        const masks = [a, b, c];
        const load = [0, 0, 0, 0];
        let value = 0;
        let ok = true;
        masks.forEach((m, h) => {
          const ps: number[] = [];
          for (let i = 0; i < 4; i++)
            if (m & (1 << i)) {
              const wd = (3 + i) % 7;
              if (!(habits[h].days & (1 << wd))) ok = false;
              load[i] += habits[h].minutes;
              ps.push(inp.prob(habits[h].id, wd));
            }
          if (ps.length > habits[h].target + 1) ok = false;
          const dist = poissonBinomial(ps);
          value += atLeast(dist, habits[h].target) + 0.2 * progress(dist, habits[h].target) - 0.015 * ps.length - 1e-5 * ps.length * habits[h].minutes;
        });
        if (load.some((l) => l > 60)) ok = false;
        if (ok) best = Math.max(best, value);
      }
  assert.equal(days.length, 4);
  assert.ok(Math.abs(plan.objective - best) < 1e-9);
});

test("minutes already done today shrink today's room", () => {
  const habits = [habit("run", 3, 40), habit("read", 3, 30)];
  const plan = buildPlan(input({ habits, done: { run: ["2026-10-19"] }, capacity: [60, 60, 60, 60, 60, 60, 60] }));
  assert.equal(plan.capacity[0], 20);
  assert.ok(!plan.habits[1].days.includes("2026-10-19"), "30 min of reading no longer fits on Monday");
});

test("a quota that can't close still gets the sessions that fit", () => {
  // 5× по 20 минут, но место есть только в трёх днях.
  const plan = buildPlan(input({ habits: [habit("med", 5, 20)], capacity: [20, 20, 20, 0, 0, 0, 0] }));
  assert.equal(plan.habits[0].pHit, 0);
  assert.equal(plan.habits[0].days.length, 3);
});

test("pins are honoured and overbooking is reported with an unpin exit", () => {
  const pins = [
    { habitId: "a", day: "2026-10-20" },
    { habitId: "b", day: "2026-10-20" },
  ];
  const inp = input({ habits: [habit("a", 2, 40), habit("b", 2, 40)], pins });
  const plan = buildPlan(inp);
  assert.ok(plan.habits.every((h) => h.days.includes("2026-10-20")));
  const conflicts = findConflicts(inp, plan);
  const over = conflicts.find((c) => c.kind === "overbooked");
  assert.ok(over && over.fixes.length > 0 && over.fixes[0].changes[0].kind === "unpin");
});

test("unreachable quota offers verified exits ranked by gain", () => {
  const inp = input({ today: "2026-10-24", habits: [habit("gym", 3, 45, 0b0011111)] }); // остались Sat/Sun, но разрешены только будни
  const plan = buildPlan(inp);
  assert.equal(plan.habits[0].status, "unreachable");
  const c = findConflicts(inp, plan)[0];
  assert.equal(c.kind, "unreachable");
  assert.ok(c.fixes.length >= 1);
  for (let i = 1; i < c.fixes.length; i++) assert.ok(c.fixes[i - 1].gain >= c.fixes[i].gain);
  assert.ok(c.fixes.every((f) => f.gain > 0));
});

test("squeezed habit gets capacity fixes that really help", () => {
  const inp = input({ habits: [habit("big", 5, 50), habit("read", 5, 30)], capacity: [60, 60, 60, 60, 60, 60, 60] });
  const plan = buildPlan(inp);
  const conflicts = findConflicts(inp, plan);
  const sq = conflicts.find((c) => c.kind === "squeezed");
  assert.ok(sq, "one of the two habits must be squeezed");
  assert.ok(sq!.fixes[0].after > plan.expectedHits);
});

test("a quota that one extra day can't save gets a combined exit", () => {
  // Каждый будний день занят на 50 из 60 минут; Spanish 20 мин 4× нужен минимум на 4 дня.
  const inp = input({ habits: [habit("fill", 5, 50, 0b0011111), habit("es", 4, 20, 0b0011111)], capacity: [60, 60, 60, 60, 60, 0, 0], prob: () => 0.9 });
  const plan = buildPlan(inp);
  // Планировщик жертвует одной из двух привычек; у жертвы одного дня мало — нужна связка.
  const sq = findConflicts(inp, plan).find((c) => c.kind === "squeezed");
  assert.ok(sq && sq.fixes.length > 0, "some exit must exist");
  const combo = sq!.fixes.find((f) => f.changes.length > 1);
  assert.ok(combo && combo.gain > 0.3);
});

test("what-if compares before and after on the same base", () => {
  const inp = input({ habits: [habit("run", 3, 30)], prob: () => 0.6 });
  const cmp = whatIf(inp, [{ kind: "busy", weekday: 0 }, { kind: "busy", weekday: 1 }, { kind: "busy", weekday: 2 }, { kind: "busy", weekday: 3 }, { kind: "busy", weekday: 4 }]);
  assert.ok(cmp.delta < 0);
  assert.ok(cmp.rows[0].moved);
  assert.ok(cmp.rows[0].daysAfter.every((d) => d >= "2026-10-24"));
});

test("explanation marginals are positive for chosen days and skipped days get reasons", () => {
  const inp = input({ habits: [habit("run", 2, 30, 0b0010101)] });
  const plan = buildPlan(inp);
  const ex = explainHabit(inp, plan, emptyModel(), "run")!;
  assert.ok(ex.chosen.every((c) => c.marginal > 0));
  assert.ok(ex.skipped.some((s) => s.reason === "Not one of this habit's days."));
});

test("journal to observations and week history", () => {
  const planned = [
    { day: "2026-10-12", habitId: "a", p: 0.7 },
    { day: "2026-10-13", habitId: "a", p: 0.7 },
    { day: "2026-10-20", habitId: "a", p: 0.7 },
  ];
  const completions = [{ day: "2026-10-12", habitId: "a", planned: true }];
  const obs = observationsBetween(planned, completions, "2026-10-12", "2026-10-19");
  assert.deepEqual(obs, [{ habitId: "a", weekday: 1, success: false }]);
  const hist = weekHistory([habit("a", 1, 10)], completions, (_, h) => h.target, "2026-10-19", 3);
  assert.deepEqual(hist.map((w) => w.hits), [0, 1, 0]);
  assert.deepEqual(perfectStreak(hist), { current: 1, best: 1 });
});
