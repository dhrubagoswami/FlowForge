// §8: every STATS_TICK_INTERVAL_MS, recompute the full Overview payload and publish it as
// stats.tick — one source of truth shared with GET /api/stats/overview, no separate delta path.
import { STATS_TICK_INTERVAL_MS } from '../config/constants.ts';
import { logger } from '../lib/logger.ts';
import { getStatsOverview } from '../services/stats.service.ts';
import { publishEvent } from './event-bus.ts';

export function startStatsTick(): { stop: () => void } {
  const interval = setInterval(() => {
    getStatsOverview()
      .then((overview) => publishEvent({ event: 'stats.tick', data: overview }))
      .catch((err: unknown) => {
        logger.error({ err }, 'Failed to compute stats.tick payload');
      });
  }, STATS_TICK_INTERVAL_MS);

  return { stop: () => clearInterval(interval) };
}
