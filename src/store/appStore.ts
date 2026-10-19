// Состояние приложения: журнал из SQLite → накопленная модель → план недели.
// refresh() — единственное место, где модель дообучается на закрытых днях и
// пересобирается план; экраны читают готовые plan/input и зовут действия.

import { create } from "zustand";
import * as repo from "../data/repo";
import { emptyModel, MODEL_VERSION, observe, prob, replay } from "../lib/model";
import { buildPlan, type Plan, type PlanInput } from "../lib/planner";
import { observationsBetween, type Completion, type PlannedRow } from "../lib/history";
import { addDays, todayLocal, weekStart } from "../lib/time";
import type { Habit, ModelState, Pin } from "../lib/types";
import type { Change } from "../lib/changes";
import { findConflicts, type Conflict } from "../lib/conflicts";
import { setHapticsEnabled } from "../services/haptics";

export const MAX_HABITS = 8;
export const DEFAULT_CAPACITY = [60, 60, 60, 60, 60, 90, 90];

type Settings = { capacity: number[]; haptics: boolean };

type State = {
  ready: boolean;
  version: number;
  today: string;
  week: string;
  habits: Habit[];
  completions: Completion[];
  planned: PlannedRow[];
  overrides: { week: string; habitId: string; target: number }[];
  pins: Pin[];
  busy: number[];
  model: ModelState;
  settings: Settings;
  input: PlanInput | null;
  plan: Plan | null;
  // Конфликты с проверенными выходами — дорогие (десятки перепланирований),
  // поэтому считаются один раз на версию и уже после отрисовки нового плана.
  conflicts: Conflict[] | null;
  refresh: () => Promise<void>;
  rebuild: () => Promise<void>;
  addHabit: (d: repo.HabitDraft) => Promise<Habit>;
  updateHabit: (h: Habit) => Promise<void>;
  deleteHabit: (id: string) => Promise<void>;
  toggleDone: (habitId: string, day: string) => Promise<boolean>;
  togglePin: (habitId: string, day: string) => Promise<void>;
  movePin: (habitId: string, from: string | null, to: string) => Promise<void>;
  setWeekTarget: (habitId: string, target: number | null) => Promise<void>;
  setCapacity: (weekday: number, minutes: number) => Promise<void>;
  toggleBusy: (weekday: number) => Promise<void>;
  applyChange: (c: Change) => Promise<void>;
  setHaptics: (on: boolean) => Promise<void>;
  wipe: () => Promise<void>;
};

export function targetFor(overrides: State["overrides"], week: string, h: Habit): number {
  return overrides.find((o) => o.week === week && o.habitId === h.id)?.target ?? h.target;
}

let refreshChain: Promise<void> = Promise.resolve();

export const useApp = create<State>((set, get) => ({
  ready: false,
  version: 0,
  today: todayLocal(),
  week: weekStart(todayLocal()),
  habits: [],
  completions: [],
  planned: [],
  overrides: [],
  pins: [],
  busy: [],
  model: emptyModel(),
  settings: { capacity: DEFAULT_CAPACITY, haptics: true },
  input: null,
  plan: null,
  conflicts: null,

  // Пересборки идут по очереди: иначе более ранняя могла закончиться позже и
  // перезаписать стор устаревшим планом.
  refresh: () => (refreshChain = refreshChain.then(() => get().rebuild()).catch(() => undefined)),

  rebuild: async () => {
    const today = todayLocal();
    const week = weekStart(today);
    const yesterday = addDays(today, -1);
    const [habits, completions, planned, overrides, pins, capacity, haptics, busyByWeek] = await Promise.all([
      repo.listHabits(),
      repo.listCompletions(),
      repo.listPlanned(),
      repo.listOverrides(),
      repo.listPins(week, addDays(week, 6)),
      repo.getMeta<number[]>("capacity", DEFAULT_CAPACITY),
      repo.getMeta<boolean>("haptics", true),
      repo.getMeta<Record<string, number[]>>("busy", {}),
    ]);
    setHapticsEnabled(haptics);

    // Модель накапливается: дообучаем только на днях после последней обработки.
    // При смене версии констант — пересборка из журнала.
    const version = await repo.getMeta<number>("modelVersion", 0);
    const through = await repo.getMeta<string | null>("modelThrough", null);
    let model: ModelState;
    if (version !== MODEL_VERSION || through === null) {
      model = replay(observationsBetween(planned, completions, null, yesterday));
    } else {
      model = await repo.getMeta<ModelState>("model", emptyModel());
      if (through < yesterday) for (const o of observationsBetween(planned, completions, through, yesterday)) observe(model, o.habitId, o.weekday, o.success);
    }
    if (version !== MODEL_VERSION || through !== yesterday) {
      await repo.setMeta("model", model);
      await repo.setMeta("modelVersion", MODEL_VERSION);
      await repo.setMeta("modelThrough", yesterday);
    }

    const busy = busyByWeek[week] ?? [];
    const done: Record<string, string[]> = {};
    for (const c of completions) if (c.day >= week && c.day <= addDays(week, 6)) (done[c.habitId] ??= []).push(c.day);
    const targets: Record<string, number> = {};
    for (const h of habits) targets[h.id] = targetFor(overrides, week, h);

    const input: PlanInput = {
      today,
      weekStart: week,
      habits,
      targets,
      done,
      capacity: capacity.length === 7 ? capacity : DEFAULT_CAPACITY,
      busy,
      pins,
      prob: (id, wd) => prob(model, id, wd),
    };
    const plan = buildPlan(input);

    const doneToday = habits.filter((h) => (done[h.id] ?? []).includes(today)).map((h) => h.id);
    const todayRows = plan.habits
      .filter((hp) => hp.days.includes(today))
      .map((hp) => ({ habitId: hp.habitId, p: hp.probs[hp.days.indexOf(today)] }));
    await repo.writeTodayPlan(today, todayRows, doneToday);
    const plannedNow = await repo.listPlanned();

    set({
      ready: true,
      version: get().version + 1,
      today,
      week,
      habits,
      completions,
      planned: plannedNow,
      overrides,
      pins,
      busy,
      model,
      settings: { capacity: input.capacity, haptics },
      input,
      plan,
      conflicts: null,
    });
    const v = get().version;
    setTimeout(() => {
      const s = get();
      if (s.version === v && s.input && s.plan) set({ conflicts: findConflicts(s.input, s.plan) });
    }, 0);
  },

  addHabit: async (d) => {
    const h = await repo.insertHabit(d, todayLocal());
    await get().refresh();
    return h;
  },
  updateHabit: async (h) => {
    await repo.saveHabit(h);
    await get().refresh();
  },
  deleteHabit: async (id) => {
    await repo.removeHabit(id);
    await get().refresh();
  },
  toggleDone: async (habitId, day) => {
    const isDone = get().completions.some((c) => c.habitId === habitId && c.day === day);
    const wasPlanned = get().planned.some((r) => r.habitId === habitId && r.day === day);
    await repo.setCompletion(habitId, day, !isDone, wasPlanned);
    // Правка прошлого дня меняет уже выученные наблюдения — пересборка модели.
    if (day < get().today) await repo.setMeta("modelThrough", null);
    await get().refresh();
    return !isDone;
  },
  togglePin: async (habitId, day) => {
    const on = !get().pins.some((p) => p.habitId === habitId && p.day === day);
    await repo.setPin(habitId, day, on);
    await get().refresh();
  },
  movePin: async (habitId, from, to) => {
    await repo.movePin(habitId, from, to);
    await get().refresh();
  },
  setWeekTarget: async (habitId, target) => {
    await repo.setOverride(get().week, habitId, target);
    await get().refresh();
  },
  setCapacity: async (weekday, minutes) => {
    const next = get().settings.capacity.map((m, i) => (i === weekday ? Math.max(0, minutes) : m));
    await repo.setMeta("capacity", next);
    await get().refresh();
  },
  toggleBusy: async (weekday) => {
    const all = await repo.getMeta<Record<string, number[]>>("busy", {});
    const cur = all[get().week] ?? [];
    all[get().week] = cur.includes(weekday) ? cur.filter((x) => x !== weekday) : [...cur, weekday];
    await repo.setMeta("busy", all);
    await get().refresh();
  },
  // Перевод изменения движка (выход конфликта / what-if) в постоянные данные.
  applyChange: async (c) => {
    const s = get();
    const habit = "habitId" in c ? s.habits.find((h) => h.id === c.habitId) : undefined;
    switch (c.kind) {
      case "capacity":
        return s.setCapacity(c.weekday, c.minutes);
      case "busy":
        return s.busy.includes(c.weekday) ? undefined : s.toggleBusy(c.weekday);
      case "target":
        return s.setWeekTarget(c.habitId, c.target);
      case "allowDay":
        if (habit) return s.updateHabit({ ...habit, days: c.allow ? habit.days | (1 << c.weekday) : habit.days & ~(1 << c.weekday) });
        return;
      case "minutes":
        if (habit) return s.updateHabit({ ...habit, minutes: c.minutes });
        return;
      case "unpin":
        await repo.setPin(c.habitId, c.day, false);
        return s.refresh();
    }
  },
  setHaptics: async (on) => {
    await repo.setMeta("haptics", on);
    await get().refresh();
  },
  wipe: async () => {
    await repo.wipeAll();
    await get().refresh();
  },
}));

// Срез для селекторов экранов (src/ui/selectors.ts); null — пока нет плана.
export function useSnapshot() {
  const s = useApp();
  if (!s.plan || !s.input) return null;
  return { today: s.today, week: s.week, habits: s.habits, completions: s.completions, planned: s.planned, pins: s.pins, busy: s.busy, plan: s.plan, capacity: s.settings.capacity };
}
