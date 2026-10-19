import type { SQLiteDatabase } from "expo-sqlite";

// Каждая миграция — одна ступень схемы. Не редактируй уже выпущенную миграцию —
// добавляй новую в конец массива. PRAGMA user_version хранит номер последней
// применённой ступени, миграции применяются последовательно от текущего значения.
const migrations: string[] = [
  `
  CREATE TABLE IF NOT EXISTS habits (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    target INTEGER NOT NULL,
    minutes INTEGER NOT NULL,
    days INTEGER NOT NULL,
    color TEXT NOT NULL,
    icon TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  -- Факт: привычка сделана в этот день (не больше одного захода в день).
  CREATE TABLE IF NOT EXISTS completions (
    habit_id TEXT NOT NULL,
    day TEXT NOT NULL,
    planned INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (habit_id, day)
  );
  -- Снимок плана на день с прогнозной вероятностью: прошлые дни не
  -- переписываются, из них модель учится и считается калибровка.
  CREATE TABLE IF NOT EXISTS planned (
    day TEXT NOT NULL,
    habit_id TEXT NOT NULL,
    p REAL NOT NULL,
    PRIMARY KEY (day, habit_id)
  );
  CREATE TABLE IF NOT EXISTS pins (
    habit_id TEXT NOT NULL,
    day TEXT NOT NULL,
    PRIMARY KEY (habit_id, day)
  );
  -- Квота конкретной недели, если её поменяли только на эту неделю.
  CREATE TABLE IF NOT EXISTS overrides (
    week TEXT NOT NULL,
    habit_id TEXT NOT NULL,
    target INTEGER NOT NULL,
    PRIMARY KEY (week, habit_id)
  );
  CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );
  `,
];

export async function runMigrations(db: SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>("PRAGMA user_version;");
  const currentVersion = row?.user_version ?? 0;

  for (let i = currentVersion; i < migrations.length; i++) {
    await db.execAsync(migrations[i]);
    await db.execAsync(`PRAGMA user_version = ${i + 1};`);
  }
}
