// Assembles the Overview stats response. All counts/percentiles come from SQL aggregates in stats.repository.ts; queueDepth comes from BullMQ directly.
import type { StatsOverview } from '@flowforge/shared';
import { STATS_ACTIVITY_WINDOW_HOURS } from '../config/constants.ts';
import { jobQueue } from '../queue/job.queue.ts';
import { activityBucketsSince, countRunsSince, p95WaitMsSince, topWorkersByInflight } from '../repositories/stats.repository.ts';
import { listRecentRuns } from './run.service.ts';

/** "Queue depth" is work not yet finished: waiting to be picked up, plus already in flight. */
async function getQueueDepth(): Promise<number> {
  const counts = await jobQueue.getJobCounts('waiting', 'active');
  return (counts.waiting ?? 0) + (counts.active ?? 0);
}

export async function getStatsOverview(): Promise<StatsOverview> {
  const since = new Date(Date.now() - STATS_ACTIVITY_WINDOW_HOURS * 60 * 60 * 1000);

  const [counts, p95WaitMs, activity, topWorkers, recentRuns, queueDepth] = await Promise.all([
    countRunsSince(since),
    p95WaitMsSince(since),
    activityBucketsSince(since, STATS_ACTIVITY_WINDOW_HOURS),
    topWorkersByInflight(5),
    listRecentRuns({ limit: 10 }),
    getQueueDepth(),
  ]);

  return {
    runsLast24h: counts.total,
    successRatePct: counts.ratedTotal > 0 ? Number(((counts.succeeded / counts.ratedTotal) * 100).toFixed(1)) : 100,
    queueDepth,
    p95WaitMs: Math.round(p95WaitMs),
    activity,
    topWorkers,
    recentRuns,
  };
}
