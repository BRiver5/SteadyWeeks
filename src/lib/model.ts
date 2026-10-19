// Модель надёжности: "если привычка стоит в плане на этот день недели —
// с какой вероятностью я её сделаю". Состояние НАКАПЛИВАЕТСЯ: каждый закрытый
// запланированный день — одно наблюдение, старые наблюдения затухают.
// Частичное объединение: ячейка (привычка × день недели) стартует с уровня
// привычки в целом, а привычка — с общего априорного уровня, поэтому новая
// привычка или редкий день не прыгают в 0% / 100% после одного промаха.

import type { Cell, ModelState } from "./types.ts";

export const MODEL_VERSION = 1;

export const CELL_DECAY = 0.92;
export const HABIT_DECAY = 0.97;
export const GLOBAL_MEAN = 0.7;
export const GLOBAL_STRENGTH = 3;
export const HABIT_STRENGTH = 3;

export function emptyModel(): ModelState {
  return { habit: {}, cells: {} };
}

function ensure(m: ModelState, habitId: string) {
  if (!m.habit[habitId]) m.habit[habitId] = { s: 0, f: 0 };
  if (!m.cells[habitId]) m.cells[habitId] = Array.from({ length: 7 }, () => ({ s: 0, f: 0 }));
}

function push(c: Cell, decay: number, success: boolean) {
  c.s = c.s * decay + (success ? 1 : 0);
  c.f = c.f * decay + (success ? 0 : 1);
}

export function observe(m: ModelState, habitId: string, weekday: number, success: boolean): ModelState {
  ensure(m, habitId);
  push(m.habit[habitId], HABIT_DECAY, success);
  push(m.cells[habitId][weekday], CELL_DECAY, success);
  return m;
}

export function habitMean(m: ModelState, habitId: string): number {
  const h = m.habit[habitId] ?? { s: 0, f: 0 };
  return (GLOBAL_MEAN * GLOBAL_STRENGTH + h.s) / (GLOBAL_STRENGTH + h.s + h.f);
}

export type Posterior = {
  mean: number;
  lo: number;
  hi: number;
  priorMean: number; // уровень привычки, к которому стягивается ячейка
  priorWeight: number; // доля априора в итоговой оценке
  s: number;
  f: number;
};

export function posterior(m: ModelState, habitId: string, weekday: number): Posterior {
  const priorMean = habitMean(m, habitId);
  const c = m.cells[habitId]?.[weekday] ?? { s: 0, f: 0 };
  const a = priorMean * HABIT_STRENGTH + c.s;
  const b = (1 - priorMean) * HABIT_STRENGTH + c.f;
  const mean = a / (a + b);
  const sd = Math.sqrt((a * b) / ((a + b) ** 2 * (a + b + 1)));
  return {
    mean,
    lo: Math.max(0, mean - 1.645 * sd),
    hi: Math.min(1, mean + 1.645 * sd),
    priorMean,
    priorWeight: HABIT_STRENGTH / (HABIT_STRENGTH + c.s + c.f),
    s: c.s,
    f: c.f,
  };
}

export function prob(m: ModelState, habitId: string, weekday: number): number {
  return posterior(m, habitId, weekday).mean;
}

// Сколько эффективных наблюдений за ячейкой (после затухания).
export function evidence(m: ModelState, habitId: string, weekday: number): number {
  const c = m.cells[habitId]?.[weekday];
  return c ? c.s + c.f : 0;
}

export type Observation = { habitId: string; weekday: number; success: boolean };

// Полная пересборка из журнала — при смене MODEL_VERSION или после удаления
// данных; порядок наблюдений важен из-за затухания.
export function replay(obs: Observation[]): ModelState {
  const m = emptyModel();
  for (const o of obs) observe(m, o.habitId, o.weekday, o.success);
  return m;
}
