// Доступ к SQLite: тонкие async-функции, вся логика — в src/lib и сторе.

import { getDb } from "../db/client";
import { generateId } from "../lib/id";
import type { Habit, Pin } from "../lib/types";
import type { Completion, PlannedRow } from "../lib/history";

// Все обращения к базе идут строго по очереди: параллельные refresh() с
// транзакциями внутри иначе пересекались, и expo-sqlite отклонял вызовы
// ("NativeDatabase.execAsync has been rejected").
let chain: Promise<unknown> = Promise.resolve();
function lock<R>(fn: () => Promise<R>): Promise<R> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => undefined);
  return run;
}
function locked<A extends unknown[], R>(fn: (...a: A) => Promise<R>) {
  return (...a: A) => lock(() => fn(...a));
}

type HabitRow = { id: string; name: string; target: number; minutes: number; days: number; color: string; icon: string; created_at: string };

const toHabit = (r: HabitRow): Habit => ({ id: r.id, name: r.name, target: r.target, minutes: r.minutes, days: r.days, color: r.color, icon: r.icon, createdAt: r.created_at });

async function listHabitsRaw(): Promise<Habit[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<HabitRow>("SELECT * FROM habits ORDER BY created_at ASC;");
  return rows.map(toHabit);
}

export type HabitDraft = Omit<Habit, "id" | "createdAt">;

async function insertHabitRaw(d: HabitDraft, createdAt: string): Promise<Habit> {
  const db = await getDb();
  const h: Habit = { ...d, id: generateId(), createdAt };
  await db.runAsync("INSERT INTO habits (id, name, target, minutes, days, color, icon, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?);", [
    h.id,
    h.name,
    h.target,
    h.minutes,
    h.days,
    h.color,
    h.icon,
    h.createdAt,
  ]);
  return h;
}

async function saveHabitRaw(h: Habit): Promise<void> {
  const db = await getDb();
  await db.runAsync("UPDATE habits SET name = ?, target = ?, minutes = ?, days = ?, color = ?, icon = ? WHERE id = ?;", [h.name, h.target, h.minutes, h.days, h.color, h.icon, h.id]);
}

async function removeHabitRaw(id: string): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const table of ["completions", "planned", "pins", "overrides"]) await db.runAsync(`DELETE FROM ${table} WHERE habit_id = ?;`, [id]);
    await db.runAsync("DELETE FROM habits WHERE id = ?;", [id]);
  });
}

async function listCompletionsRaw(): Promise<Completion[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ habit_id: string; day: string; planned: number }>("SELECT * FROM completions ORDER BY day ASC;");
  return rows.map((r) => ({ habitId: r.habit_id, day: r.day, planned: r.planned === 1 }));
}

async function setCompletionRaw(habitId: string, day: string, done: boolean, planned: boolean): Promise<void> {
  const db = await getDb();
  if (done) await db.runAsync("INSERT OR REPLACE INTO completions (habit_id, day, planned) VALUES (?, ?, ?);", [habitId, day, planned ? 1 : 0]);
  else await db.runAsync("DELETE FROM completions WHERE habit_id = ? AND day = ?;", [habitId, day]);
}

async function listPlannedRaw(): Promise<PlannedRow[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ day: string; habit_id: string; p: number }>("SELECT * FROM planned ORDER BY day ASC;");
  return rows.map((r) => ({ day: r.day, habitId: r.habit_id, p: r.p }));
}

// Переписывается только сегодняшний снимок; строки привычек, уже сделанных
// сегодня, не трогаются — иначе пропало бы наблюдение "запланировал и сделал".
async function writeTodayPlanRaw(day: string, rows: { habitId: string; p: number }[], keep: string[]): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    const existing = await db.getAllAsync<{ habit_id: string }>("SELECT habit_id FROM planned WHERE day = ?;", [day]);
    for (const e of existing) if (!keep.includes(e.habit_id)) await db.runAsync("DELETE FROM planned WHERE day = ? AND habit_id = ?;", [day, e.habit_id]);
    for (const r of rows) if (!keep.includes(r.habitId)) await db.runAsync("INSERT OR REPLACE INTO planned (day, habit_id, p) VALUES (?, ?, ?);", [day, r.habitId, r.p]);
  });
}

async function listPinsRaw(from: string, to: string): Promise<Pin[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ habit_id: string; day: string }>("SELECT * FROM pins WHERE day >= ? AND day <= ?;", [from, to]);
  return rows.map((r) => ({ habitId: r.habit_id, day: r.day }));
}

async function setPinRaw(habitId: string, day: string, on: boolean): Promise<void> {
  const db = await getDb();
  if (on) await db.runAsync("INSERT OR IGNORE INTO pins (habit_id, day) VALUES (?, ?);", [habitId, day]);
  else await db.runAsync("DELETE FROM pins WHERE habit_id = ? AND day = ?;", [habitId, day]);
}

async function movePinRaw(habitId: string, from: string | null, to: string): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    if (from) await db.runAsync("DELETE FROM pins WHERE habit_id = ? AND day = ?;", [habitId, from]);
    await db.runAsync("INSERT OR IGNORE INTO pins (habit_id, day) VALUES (?, ?);", [habitId, to]);
  });
}

async function listOverridesRaw(): Promise<{ week: string; habitId: string; target: number }[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ week: string; habit_id: string; target: number }>("SELECT * FROM overrides;");
  return rows.map((r) => ({ week: r.week, habitId: r.habit_id, target: r.target }));
}

async function setOverrideRaw(week: string, habitId: string, target: number | null): Promise<void> {
  const db = await getDb();
  if (target === null) await db.runAsync("DELETE FROM overrides WHERE week = ? AND habit_id = ?;", [week, habitId]);
  else await db.runAsync("INSERT OR REPLACE INTO overrides (week, habit_id, target) VALUES (?, ?, ?);", [week, habitId, target]);
}

async function getMetaRaw<T>(key: string, fallback: T): Promise<T> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>("SELECT value FROM meta WHERE key = ?;", [key]);
  if (!row) return fallback;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return fallback;
  }
}

async function setMetaRaw(key: string, value: unknown): Promise<void> {
  const db = await getDb();
  await db.runAsync("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?);", [key, JSON.stringify(value)]);
}

async function wipeAllRaw(): Promise<void> {
  const db = await getDb();
  await db.execAsync("DELETE FROM habits; DELETE FROM completions; DELETE FROM planned; DELETE FROM pins; DELETE FROM overrides; DELETE FROM meta;");
}

export const listHabits = locked(listHabitsRaw);
export const insertHabit = locked(insertHabitRaw);
export const saveHabit = locked(saveHabitRaw);
export const removeHabit = locked(removeHabitRaw);
export const listCompletions = locked(listCompletionsRaw);
export const setCompletion = locked(setCompletionRaw);
export const listPlanned = locked(listPlannedRaw);
export const writeTodayPlan = locked(writeTodayPlanRaw);
export const listPins = locked(listPinsRaw);
export const setPin = locked(setPinRaw);
export const movePin = locked(movePinRaw);
export const listOverrides = locked(listOverridesRaw);
export const setOverride = locked(setOverrideRaw);
export const setMeta = locked(setMetaRaw);
export const wipeAll = locked(wipeAllRaw);
export function getMeta<T>(key: string, fallback: T): Promise<T> {
  return lock(() => getMetaRaw(key, fallback));
}
