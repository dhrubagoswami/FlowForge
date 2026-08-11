// Shapes run volume across the day (busy-hours) and across the 30-day window (weekday/weekend variation), used only by the webhook job whose volume isn't schedule-bound.
const BUSY_HOUR_WEIGHTS: Record<number, number> = {
  0: 0.3, 1: 0.2, 2: 0.2, 3: 0.2, 4: 0.25, 5: 0.35,
  6: 0.5, 7: 0.7, 8: 0.9, 9: 1.1, 10: 1.3, 11: 1.4,
  12: 1.2, 13: 1.3, 14: 1.4, 15: 1.3, 16: 1.2, 17: 1.0,
  18: 0.8, 19: 0.6, 20: 0.5, 21: 0.45, 22: 0.4, 23: 0.35,
};

export function hourWeight(hour: number): number {
  return BUSY_HOUR_WEIGHTS[hour] ?? 1;
}

export function weekdayWeight(dayOfWeek: number): number {
  // 0 = Sunday .. 6 = Saturday. Slightly lighter on weekends.
  return dayOfWeek === 0 || dayOfWeek === 6 ? 0.7 : 1.05;
}

/** Distributes `dailyTarget` webhook deliveries across a day's 24 hours using the busy-hour weights. */
export function distributeAcrossHours(dailyTarget: number, dayOfWeek: number, rng: () => number): number[] {
  const dayFactor = weekdayWeight(dayOfWeek);
  const weights = Array.from({ length: 24 }, (_, h) => hourWeight(h) * dayFactor);
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  return weights.map((w) => Math.max(0, Math.round((dailyTarget * w) / totalWeight + (rng() - 0.5))));
}
