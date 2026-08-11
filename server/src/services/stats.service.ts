// Assembles the Overview stats response. All counts/percentiles come from SQL aggregates in stats.repository.ts.
import type { StatsOverview } from '@flowforge/shared';
import { STATS_ACTIVITY_WINDOW_HOURS } from '../config/constants.ts';
import { activityBucketsSince, countRunsSince, p95WaitMsSince, topWorkersByInflight } from '../repositories/stats.repository.ts';
import { listRecentRuns } from './run.service.ts';

// TODO(M5): queueDepth becomes a real BullMQ queue read once queue/connection.ts exists.
const QUEUE_DEPTH_NOT_WIRED = 0;

export async function getStatsOverview(): Promise<StatsOverview> {
  const since = new Date(Date.now() - STATS_ACTIVITY_WINDOW_HOURS * 60 * 60 * 1000);

  const [counts, p95WaitMs, activity, topWorkers, recentRuns] = await Promise.all([
    countRunsSince(since),
    p95WaitMsSince(since),
    activityBucketsSince(since, STATS_ACTIVITY_WINDOW_HOURS),
    topWorkersByInflight(5),
    listRecentRuns({ limit: 10 }),
  ]);

  return {
    runsLast24h: counts.total,
    successRatePct: counts.ratedTotal > 0 ? Number(((counts.succeeded / counts.ratedTotal) * 100).toFixed(1)) : 100,
    queueDepth: QUEUE_DEPTH_NOT_WIRED,
    p95WaitMs: Math.round(p95WaitMs),
    activity,
    topWorkers,
    recentRuns,
  };
}
