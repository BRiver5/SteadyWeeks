// ПРИМЕР слоя доступа к данным для таблицы "items" из миграции 1.
// Удали этот файл и напиши свой (habits.ts, entries.ts, ...) под реальную
// модель данных приложения — паттерн (async функции поверх getDb()) одинаковый.

import { getDb } from "../db/client";
import { generateId } from "../lib/id";

export type Item = {
  id: string;
  title: string;
  created_at: string;
};

export async function listItems(): Promise<Item[]> {
  const db = await getDb();
  return db.getAllAsync<Item>("SELECT * FROM items ORDER BY created_at DESC;");
}

export async function addItem(title: string): Promise<Item> {
  const db = await getDb();
  const item: Item = { id: generateId(), title, created_at: new Date().toISOString() };
  await db.runAsync("INSERT INTO items (id, title, created_at) VALUES (?, ?, ?);", [
    item.id,
    item.title,
    item.created_at,
  ]);
  return item;
}

export async function deleteItem(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync("DELETE FROM items WHERE id = ?;", [id]);
}
