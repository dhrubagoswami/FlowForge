// Keeps BullMQ's Job Scheduler set in sync with the jobs table (§7.4: "reconcile, don't append").
// A job scheduler fires a tick onto scheduleTickQueue on each cron slot; schedule-tick.service.ts
// turns that tick into a real run. Scoped to one job at a time — reconcileJob is called after every
// create/update/pause/resume/delete, so BullMQ never drifts more than one mutation behind the table.
// reconcileAll does the equivalent full diff-and-fix pass, run once at boot to catch drift from a
// crash or a manual DB edit between server runs (and by the standalone reconcile-schedules.ts script).
import { SCHEDULE_TICK_QUEUE_NAME } from '@flowforge/shared';
import { findAllJobs, type JobRow } from '../repositories/job.repository.ts';
import { logger } from '../lib/logger.ts';
import { scheduleTickQueue } from './schedule-tick.queue.ts';

export function shouldBeScheduled(job: Pick<JobRow, 'status' | 'triggerType' | 'cronExpr' | 'deletedAt'>): boolean {
  return job.deletedAt === null && job.status === 'active' && job.triggerType === 'cron' && !!job.cronExpr;
}

/** Adds or updates jobId's schedule if it should run on a cron; removes it otherwise. Safe to call unconditionally after any job mutation. */
export async function reconcileJob(job: Pick<JobRow, 'id' | 'status' | 'triggerType' | 'cronExpr' | 'timezone' | 'deletedAt'>): Promise<void> {
  await scheduleTickQueue.removeJobScheduler(job.id);
  if (!shouldBeScheduled(job)) return;

  await scheduleTickQueue.upsertJobScheduler(
    job.id,
    { pattern: job.cronExpr as string, tz: job.timezone },
    { name: SCHEDULE_TICK_QUEUE_NAME, data: { jobId: job.id } },
  );
}

/** Full diff-and-fix pass: every active cron job gets a scheduler, every scheduler with no matching active cron job is removed. Run at boot and by the standalone resync script — not on the per-mutation hot path. */
export async function reconcileAllSchedules(): Promise<{ added: number; removed: number; unchanged: number }> {
  const jobs = await findAllJobs();
  const desired = new Map(jobs.filter(shouldBeScheduled).map((job) => [job.id, job]));

  const existing = await scheduleTickQueue.getJobSchedulers();
  const existingIds = new Set(existing.map((s) => s.id).filter((id): id is string => !!id));

  let added = 0;
  let removed = 0;
  let unchanged = 0;

  for (const schedulerId of existingIds) {
    if (!desired.has(schedulerId)) {
      await scheduleTickQueue.removeJobScheduler(schedulerId);
      removed += 1;
    }
  }

  for (const job of desired.values()) {
    await scheduleTickQueue.upsertJobScheduler(
      job.id,
      { pattern: job.cronExpr as string, tz: job.timezone },
      { name: SCHEDULE_TICK_QUEUE_NAME, data: { jobId: job.id } },
    );
    if (existingIds.has(job.id)) unchanged += 1;
    else added += 1;
  }

  logger.info({ added, removed, unchanged }, 'Schedule reconciliation complete');
  return { added, removed, unchanged };
}
