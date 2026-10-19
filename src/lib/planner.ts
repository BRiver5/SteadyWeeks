// Планировщик недели: на какие из оставшихся дней поставить каждую привычку,
// чтобы закрыть как можно больше недельных квот при дневном лимите минут.
//
// Для каждой привычки перебираются ВСЕ подмножества её допустимых оставшихся
// дней (≤ 2⁷), у каждого — точная вероятность закрыть квоту (пуассон-
// биномиальное по вероятностям модели) и нагрузка по дням. Затем выбор ровно
// одного варианта на привычку под лимиты дней — многомерный рюкзак с
// множественным выбором, решается точным ветвлением с границами (верхняя
// граница — сумма лучших вариантов оставшихся привычек без учёта лимитов).

import { addDays, daysBetween, weekdayIndex } from "./time.ts";
import { atLeast, expectation, poissonBinomial } from "./stats.ts";
import { allowsDay, type Habit, type Pin } from "./types.ts";

// Цена лишнего слота в плане: запасной день ставится, только если поднимает
// шанс закрыть квоту больше чем на ~1.5 п.п.
export const SLOT_COST = 0.015;
// Вес ожидаемого прогресса к квоте (доля закрытых заходов): без него привычка,
// которую лимиты не дают закрыть целиком, не получала ни одного захода — пустой
// план выигрывал у частичного. Закрытие квоты остаётся главным слагаемым.
export const PROGRESS_WEIGHT = 0.2;

export function progress(dist: number[], need: number): number {
  if (need <= 0) return 1;
  let s = 0;
  for (let k = 0; k < dist.length; k++) s += dist[k] * Math.min(k, need);
  return s / need;
}
const MINUTE_COST = 1e-5;
const NODE_LIMIT = 30_000;
// Проверочные прогоны (выходы конфликтов, what-if превью) — меньший бюджет.
export const QUICK_LIMIT = 3_000;
// Допуск оптимальности: ветка отсекается, если даже в лучшем случае она
// выигрывает меньше 0.002 ожидаемой закрытой квоты — план гарантированно
// не хуже оптимума больше чем на эту величину (как MIP gap).
export const GAP = 0.002;

export type PlanInput = {
  today: string;
  weekStart: string;
  habits: Habit[];
  targets: Record<string, number>;
  done: Record<string, string[]>; // дни этой недели, когда привычка сделана
  capacity: number[]; // минуты по дням недели Mon..Sun
  busy: number[]; // дни недели, занятые целиком (what-if "занят")
  pins: Pin[];
  prob: (habitId: string, weekday: number) => number;
};

export type Status = "met" | "onTrack" | "atRisk" | "unreachable";

export type HabitPlan = {
  habitId: string;
  target: number;
  doneCount: number;
  need: number;
  candidates: string[];
  days: string[];
  pinned: string[];
  probs: number[]; // по days
  pHit: number;
  dist: number[]; // распределение числа будущих заходов
  expected: number; // ожидаемое итоговое число заходов за неделю
  status: Status;
};

export type Plan = {
  days: string[]; // оставшиеся дни недели, начиная с сегодня
  habits: HabitPlan[];
  load: number[]; // минуты по days
  capacity: number[]; // эффективный лимит по days
  expectedHits: number;
  hitDist: number[];
  objective: number;
  explored: number;
  exact: boolean;
};

export function remainingDays(today: string, weekStart: string): string[] {
  const out: string[] = [];
  const start = Math.max(0, daysBetween(weekStart, today));
  for (let i = start; i < 7; i++) out.push(addDays(weekStart, i));
  return out;
}

type Option = { mask: number; value: number; pHit: number; dist: number[]; size: number };

function popcount(x: number): number {
  let n = 0;
  while (x) {
    n += x & 1;
    x >>= 1;
  }
  return n;
}

export function effectiveTarget(input: PlanInput, habit: Habit): number {
  return input.targets[habit.id] ?? habit.target;
}

export function buildPlan(input: PlanInput, nodeLimit = NODE_LIMIT): Plan {
  const days = remainingDays(input.today, input.weekStart);
  const D = days.length;
  const habits = input.habits;

  // Минуты, уже потраченные на сделанные сегодня привычки, съедают лимит дня.
  const spent = days.map((d) => habits.reduce((s, h) => s + ((input.done[h.id] ?? []).includes(d) ? h.minutes : 0), 0));
  const caps = days.map((d, i) => Math.max(0, (input.busy.includes(weekdayIndex(d)) ? 0 : input.capacity[weekdayIndex(d)]) - spent[i]));

  type Prep = {
    habit: Habit;
    target: number;
    doneCount: number;
    need: number;
    candMask: number; // по индексам days
    pinMask: number;
    probs: number[]; // по индексам days
    options: Option[];
  };

  const preps: Prep[] = habits.map((habit) => {
    const doneDays = input.done[habit.id] ?? [];
    const doneCount = doneDays.length;
    const target = effectiveTarget(input, habit);
    const need = Math.max(0, target - doneCount);
    let candMask = 0;
    let pinMask = 0;
    const probs = days.map((d) => input.prob(habit.id, weekdayIndex(d)));
    days.forEach((d, i) => {
      if (doneDays.includes(d)) return;
      const pinned = input.pins.some((p) => p.habitId === habit.id && p.day === d);
      if (pinned) pinMask |= 1 << i;
      if (pinned || (allowsDay(habit.days, weekdayIndex(d)) && !input.busy.includes(weekdayIndex(d)))) candMask |= 1 << i;
    });
    if (need === 0) {
      return { habit, target, doneCount, need, candMask, pinMask: 0, probs, options: [{ mask: 0, value: 1, pHit: 1, dist: [1], size: 0 }] };
    }
    const nCand = popcount(candMask);
    // Вариант "только закрепы" всегда есть и всегда влезает — дерево не пустое.
    const maxSize = Math.max(popcount(pinMask), Math.min(nCand, need + 1));
    const options: Option[] = [];
    // Перебор подмножеств кандидатов, содержащих все закрепы.
    for (let sub = candMask; ; sub = (sub - 1) & candMask) {
      if ((sub & pinMask) === pinMask) {
        const size = popcount(sub);
        if (size <= maxSize) {
          const ps: number[] = [];
          let minutes = 0;
          for (let i = 0; i < D; i++)
            if (sub & (1 << i)) {
              ps.push(probs[i]);
              minutes += habit.minutes;
            }
          const dist = poissonBinomial(ps);
          const pHit = atLeast(dist, need);
          // Недостижимая квота: шанс закрыть = 0, остаётся только прогресс.
          const gain = (need > nCand ? 0 : pHit) + PROGRESS_WEIGHT * progress(dist, need);
          options.push({ mask: sub, value: gain - SLOT_COST * size - MINUTE_COST * minutes, pHit, dist, size });
        }
      }
      if (sub === 0) break;
    }
    options.sort((a, b) => b.value - a.value);
    // Доминирование: вариант, у которого есть под-набор дней с не меньшей
    // ценностью, никогда не бывает нужен — он только занимает больше минут.
    const kept: Option[] = [];
    for (const o of options) if (!kept.some((k) => (k.mask & o.mask) === k.mask)) kept.push(o);
    return { habit, target, doneCount, need, candMask, pinMask, probs, options: kept };
  });

  // Закрепы обязательны: если они уже переполняют день, лимит дня поднимается
  // до закреплённой нагрузки (конфликт об этом сообщит отдельно).
  const pinnedLoad = new Array(D).fill(0);
  for (const p of preps) for (let i = 0; i < D; i++) if (p.pinMask & (1 << i)) pinnedLoad[i] += p.habit.minutes;
  const effCap = caps.map((c, i) => Math.max(c, pinnedLoad[i]));

  // Сначала самые "тяжёлые" привычки — они сильнее всего режут лимиты дней.
  const order = preps.map((_, i) => i).sort((a, b) => preps[b].habit.minutes * preps[b].need - preps[a].habit.minutes * preps[a].need);

  const load = new Array(D).fill(0);
  const choice = new Array(preps.length).fill(-1);
  let best = -Infinity;
  let bestChoice: number[] = [];
  let explored = 0;
  let exact = true;

  const fits = (habit: Habit, mask: number) => {
    for (let i = 0; i < D; i++) if (mask & (1 << i) && load[i] + habit.minutes > effCap[i]) return false;
    return true;
  };
  const apply = (habit: Habit, mask: number, sign: 1 | -1) => {
    for (let i = 0; i < D; i++) if (mask & (1 << i)) load[i] += sign * habit.minutes;
  };

  // Лагранжева граница: лимиты дней переносятся в цель со штрафом λ за минуту.
  // Для любых λ ≥ 0 сумма лучших "оштрафованных" вариантов + λ·(свободные
  // минуты) — верхняя оценка; λ подбираются субградиентом один раз в корне.
  const minutesIn = (p: Prep, mask: number) => {
    const per = new Array(D).fill(0);
    for (let i = 0; i < D; i++) if (mask & (1 << i)) per[i] = p.habit.minutes;
    return per;
  };
  const lagBound = (lambda: number[], from: number): number => {
    let total = 0;
    for (let i = 0; i < D; i++) total += lambda[i] * (effCap[i] - load[i]);
    for (let j = from; j < order.length; j++) {
      const q = preps[order[j]];
      let bestRed = -Infinity;
      for (const o of q.options) {
        if (o.value <= bestRed) break; // штраф только уменьшает ценность
        if (!fits(q.habit, o.mask)) continue;
        let red = o.value;
        for (let i = 0; i < D; i++) if (o.mask & (1 << i)) red -= lambda[i] * q.habit.minutes;
        if (red > bestRed) bestRed = red;
      }
      if (bestRed === -Infinity) return -Infinity;
      total += bestRed;
    }
    return total;
  };
  let lambda = new Array(D).fill(0);
  {
    let cur = new Array(D).fill(0);
    let bestBound = lagBound(cur, 0);
    for (let t = 0; t < 40; t++) {
      const usage = new Array(D).fill(0);
      for (const idx of order) {
        const q = preps[idx];
        let pick = q.options[0];
        let bestRed = -Infinity;
        for (const o of q.options) {
          let red = o.value;
          for (let i = 0; i < D; i++) if (o.mask & (1 << i)) red -= cur[i] * q.habit.minutes;
          if (red > bestRed) {
            bestRed = red;
            pick = o;
          }
        }
        minutesIn(q, pick.mask).forEach((m, i) => (usage[i] += m));
      }
      const g = usage.map((u, i) => u - effCap[i]);
      const norm = Math.sqrt(g.reduce((a, x) => a + x * x, 0));
      if (norm < 1e-9) break;
      const step = 0.01 * Math.pow(0.88, t);
      cur = cur.map((l, i) => Math.max(0, l + (step * g[i]) / norm));
      const b = lagBound(cur, 0);
      if (b < bestBound) {
        bestBound = b;
        lambda = cur.slice();
      }
    }
  }

  // Порядок обхода вариантов — по лагранжевой ценности (минуты в тесных днях
  // "стоят" λ): первый же спуск близок к оптимуму, а не к жадному плану, где
  // самая тяжёлая привычка забирает все дни.
  const visit = preps.map((p) => {
    const red = p.options.map((o) => {
      let r = o.value;
      for (let i = 0; i < D; i++) if (o.mask & (1 << i)) r -= lambda[i] * p.habit.minutes;
      return r;
    });
    return p.options.map((_, i) => i).sort((a, b) => red[b] - red[a]);
  });

  const dfs = (k: number, value: number) => {
    explored++;
    if (explored > nodeLimit) {
      exact = false;
      return;
    }
    if (k === order.length) {
      if (value > best + 1e-12) {
        best = value;
        bestChoice = choice.slice();
      }
      return;
    }
    // Граница: каждая оставшаяся привычка берёт свой лучший вариант, который
    // влезает в ТЕКУЩУЮ загрузку по отдельности (без учёта соседей).
    const bounds = new Array(order.length - k + 1).fill(0);
    for (let j = order.length - 1; j > k; j--) {
      const q = preps[order[j]];
      const fit = q.options.find((o) => fits(q.habit, o.mask));
      bounds[j - k] = bounds[j - k + 1] + (fit ? fit.value : -Infinity);
    }
    const rest = bounds[1];
    if (k > 0 && value + lagBound(lambda, k) <= best + GAP) return;
    const idx = order[k];
    const p = preps[idx];
    for (const o of visit[idx]) {
      const opt = p.options[o];
      if (value + opt.value + rest <= best + GAP) continue;
      if (!fits(p.habit, opt.mask)) continue;
      apply(p.habit, opt.mask, 1);
      choice[idx] = o;
      dfs(k + 1, value + opt.value);
      apply(p.habit, opt.mask, -1);
      if (!exact) return;
    }
  };
  // Стартовый рекорд: жадный план + локальный поиск (вариант одной привычки
  // при фиксированных остальных, до сходимости). С хорошим рекордом ветвление
  // отсекает почти всё дерево и чаще успевает ДОКАЗАТЬ оптимальность.
  {
    const pick = new Array(preps.length).fill(-1);
    for (const idx of order) {
      const p = preps[idx];
      const o = visit[idx].find((i) => fits(p.habit, p.options[i].mask)) ?? -1;
      pick[idx] = o;
      if (o >= 0) apply(p.habit, p.options[o].mask, 1);
    }
    if (pick.every((o) => o >= 0)) {
      for (let pass = 0; pass < 6; pass++) {
        let improved = false;
        for (const idx of order) {
          const p = preps[idx];
          apply(p.habit, p.options[pick[idx]].mask, -1);
          const o = p.options.findIndex((opt) => fits(p.habit, opt.mask));
          if (o >= 0 && o !== pick[idx] && p.options[o].value > p.options[pick[idx]].value + 1e-12) {
            pick[idx] = o;
            improved = true;
          }
          apply(p.habit, p.options[pick[idx]].mask, 1);
        }
        if (!improved) break;
      }
      best = pick.reduce((sum, o, idx) => sum + preps[idx].options[o].value, 0);
      bestChoice = pick.slice();
      for (const idx of order) apply(preps[idx].habit, preps[idx].options[pick[idx]].mask, -1);
    } else {
      for (const idx of order) if (pick[idx] >= 0) apply(preps[idx].habit, preps[idx].options[pick[idx]].mask, -1);
    }
  }
  dfs(0, 0);

  const finalLoad = new Array(D).fill(0);
  const habitPlans: HabitPlan[] = preps.map((p, idx) => {
    const opt = p.options[bestChoice[idx] ?? p.options.length - 1] ?? { mask: 0, pHit: p.need === 0 ? 1 : 0, dist: [1], value: 0, size: 0 };
    const chosen: string[] = [];
    const probs: number[] = [];
    for (let i = 0; i < D; i++)
      if (opt.mask & (1 << i)) {
        chosen.push(days[i]);
        probs.push(p.probs[i]);
        finalLoad[i] += p.habit.minutes;
      }
    const candidates = days.filter((_, i) => p.candMask & (1 << i));
    const pinned = days.filter((_, i) => p.pinMask & (1 << i));
    const status: Status = p.need === 0 ? "met" : p.need > candidates.length ? "unreachable" : opt.pHit >= 0.6 ? "onTrack" : "atRisk";
    return {
      habitId: p.habit.id,
      target: p.target,
      doneCount: p.doneCount,
      need: p.need,
      candidates,
      days: chosen,
      pinned,
      probs,
      pHit: p.need === 0 ? 1 : status === "unreachable" ? 0 : opt.pHit,
      dist: opt.dist,
      expected: p.doneCount + expectation(opt.dist),
      status,
    };
  });

  const hitDist = poissonBinomial(habitPlans.map((h) => h.pHit));
  return {
    days,
    habits: habitPlans,
    load: finalLoad,
    capacity: effCap,
    expectedHits: habitPlans.reduce((s, h) => s + h.pHit, 0),
    hitDist,
    objective: best === -Infinity ? 0 : best,
    explored,
    exact,
  };
}

// Лучший вариант привычки при бесконечных лимитах — для поиска "зажатых" привычек.
export function unconstrainedHit(input: PlanInput, habitId: string): number {
  const big = { ...input, capacity: input.capacity.map(() => 10_000), habits: input.habits.filter((h) => h.id === habitId) };
  return buildPlan(big, QUICK_LIMIT).habits[0]?.pHit ?? 0;
}
