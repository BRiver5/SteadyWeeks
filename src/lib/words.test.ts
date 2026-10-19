// Образец юнит-теста чистой функции: `node --test` гоняет .ts напрямую
// (type stripping) — импорты с расширением .ts, без parameter properties.
import { test } from "node:test";
import assert from "node:assert/strict";
import { pluralWord } from "./words.ts";

test("pluralWord handles -s/-sh/-ch/-x and consonant + y", () => {
  assert.equal(pluralWord("glass"), "glasses");
  assert.equal(pluralWord("dish"), "dishes");
  assert.equal(pluralWord("berry"), "berries");
  assert.equal(pluralWord("day"), "days");
  assert.equal(pluralWord("slice"), "slices");
});
