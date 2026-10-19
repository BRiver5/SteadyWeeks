// Пуассон-биномиальное распределение (сумма независимых бернулли с разными p)
// точным ДП O(n²) — им считается и "закрою ли квоту привычки", и "сколько
// привычек закроются за неделю".

export function poissonBinomial(ps: number[]): number[] {
  let dist = [1];
  for (const raw of ps) {
    const p = Math.min(1, Math.max(0, raw));
    const next = new Array(dist.length + 1).fill(0);
    for (let k = 0; k < dist.length; k++) {
      next[k] += dist[k] * (1 - p);
      next[k + 1] += dist[k] * p;
    }
    dist = next;
  }
  return dist;
}

export function atLeast(dist: number[], k: number): number {
  if (k <= 0) return 1;
  let s = 0;
  for (let i = k; i < dist.length; i++) s += dist[i];
  return Math.min(1, s);
}

export function expectation(dist: number[]): number {
  return dist.reduce((s, p, k) => s + p * k, 0);
}

// Самое вероятное значение и узкий центральный интервал ~80%.
export function centralRange(dist: number[], mass = 0.8): [number, number] {
  const tail = (1 - mass) / 2;
  let lo = 0;
  let acc = 0;
  while (lo < dist.length - 1 && acc + dist[lo] < tail) acc += dist[lo++];
  let hi = dist.length - 1;
  acc = 0;
  while (hi > lo && acc + dist[hi] < tail) acc += dist[hi--];
  return [lo, hi];
}

export function brier(pairs: { p: number; y: number }[]): number {
  if (pairs.length === 0) return 0;
  return pairs.reduce((s, x) => s + (x.p - x.y) ** 2, 0) / pairs.length;
}

// Интервал Уилсона для доли (95%) — порог надёжности для выводов на Stats.
export function wilson(successes: number, n: number, z = 1.96): [number, number] {
  if (n === 0) return [0, 1];
  const p = successes / n;
  const d = 1 + (z * z) / n;
  const c = p + (z * z) / (2 * n);
  const r = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [Math.max(0, (c - r) / d), Math.min(1, (c + r) / d)];
}
