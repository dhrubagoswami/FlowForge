// A small seeded PRNG so the seed script produces the same data on every run — reproducibility matters more than true randomness here.
export function makeRng(seed: number) {
  let state = seed >>> 0;
  return function next(): number {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

export function pick<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)];
}

export function jitter(rng: () => number, base: number, spreadPct: number): number {
  const spread = base * spreadPct;
  return base + (rng() * 2 - 1) * spread;
}
