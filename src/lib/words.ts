// Английское множественное число для названий порций: glass → glasses,
// berry → berries, slice → slices. Названия порций короткие и бытовые,
// исключения (loaf → loaves) не встречаются в пресетах.
export function pluralWord(w: string): string {
  if (/(s|sh|ch|x|z)$/i.test(w)) return `${w}es`;
  if (/[^aeiou]y$/i.test(w)) return `${w.slice(0, -1)}ies`;
  return `${w}s`;
}
