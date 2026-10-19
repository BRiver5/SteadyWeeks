// Общие типы движка. Дни — строки "YYYY-MM-DD" (UTC-арифметика из time.ts),
// день недели — индекс 0..6, где 0 = понедельник.

export type Habit = {
  id: string;
  name: string;
  target: number; // раз в неделю
  minutes: number; // длительность одного захода
  days: number; // битовая маска разрешённых дней, бит 0 = Mon
  color: string;
  icon: string;
  createdAt: string;
};

export type Pin = { habitId: string; day: string };

// Накапливаемые (с забыванием) счётчики "запланировал → сделал / не сделал".
export type Cell = { s: number; f: number };

export type ModelState = {
  habit: Record<string, Cell>;
  cells: Record<string, Cell[]>; // 7 ячеек на привычку
};

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const WEEKDAYS_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function allowsDay(mask: number, weekday: number): boolean {
  return (mask & (1 << weekday)) !== 0;
}

export function countDays(mask: number): number {
  let n = 0;
  for (let i = 0; i < 7; i++) if (allowsDay(mask, i)) n++;
  return n;
}
