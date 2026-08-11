// §7.3.7: after a job's N most recent runs have all dead-lettered in a row, fire an alert — a
// notify.webhook task if the job has a channel configured, otherwise just an error log line.
// "Consecutive" is counted by logical run outcome (one row = one outcome), not by attempt: a run
// that fails twice then succeeds on its third attempt is one success, which resets the streak.
import { jobsTable, runsTable } from '@flowforge/shared';
import { desc, eq } from 'drizzle-orm';
import { db } from '../db/client.ts';
import { logger } from './logger.ts';
import type { TaskLogger } from './task-logger.ts';
import { runNotifyWebhook } from '../tasks/notify-webhook.task.ts';

const TERMINAL_OUTCOME_STATUSES = new Set(['succeeded', 'dead_letter']);

/** Pure over a newest-first status list — exported so the streak rule itself can be unit tested without a database. */
export function countConsecutiveFailures(recentStatusesNewestFirst: string[]): number {
  let streak = 0;
  for (const status of recentStatusesNewestFirst) {
    if (!TERMINAL_OUTCOME_STATUSES.has(status)) continue; // non-terminal and skipped_duplicate don't break or extend the streak
    if (status !== 'dead_letter') break;
    streak += 1;
  }
  return streak;
}

async function consecutiveFailureStreak(jobId: string, sampleSize: number): Promise<number> {
  const recentRuns = await db
    .select({ status: runsTable.status })
    .from(runsTable)
    .where(eq(runsTable.jobId, jobId))
    .orderBy(desc(runsTable.queuedAt))
    .limit(sampleSize * 3); // generous margin over non-terminal/skipped rows interleaved between outcomes

  return countConsecutiveFailures(recentRuns.map((r) => r.status));
}

/**
 * Checks whether a job has just crossed its consecutive-failure threshold and, if so, alerts —
 * either a webhook (job.alertChannel set) or a plain log line (unset). `log` writes into the
 * triggering run's own run_logs, so Job Detail shows that an alert fired and where it went. An
 * alert that fails to deliver never fails the run or crashes the worker — caught and logged only.
 */
export async function fireConsecutiveFailureAlertIfDue(jobId: string, log: TaskLogger): Promise<void> {
  const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, jobId)).limit(1);
  if (!job) return;

  const streak = await consecutiveFailureStreak(jobId, job.alertAfterConsecutiveFailures);
  if (streak < job.alertAfterConsecutiveFailures) return;
  // Only fire exactly once per threshold crossing, not on every dead-letter past it.
  if (streak > job.alertAfterConsecutiveFailures) return;

  const message = `${job.id} has failed ${streak} times in a row`;

  if (!job.alertChannel) {
    await log('error', `${message} · no alert channel configured`);
    logger.error({ jobId: job.id, streak }, message);
    return;
  }

  try {
    await runNotifyWebhook({ url: job.alertChannel, payload: { jobId: job.id, consecutiveFailures: streak, message } }, async () => {});
    await log('error', `${message} · alert sent to ${job.alertChannel}`);
  } catch (err) {
    await log('error', `${message} · alert failed to send to ${job.alertChannel}`);
    logger.error({ err, jobId: job.id }, 'Failed to deliver consecutive-failure alert');
  }
}
