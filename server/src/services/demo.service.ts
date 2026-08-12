// Business rules behind the demo/chaos panel: fire a healthy job, force a failing one, simulate a
// worker dying at the DB level, and restore seeded state. Every action here is a deliberate,
// visible simulation — nothing here reaches into a live OS process (the server has no channel to
// one; see kill-worker below).
import type { DemoResetResult, RunSummary, WorkerSummary } from '@flowforge/shared';
import { AppError } from '../lib/app-error.ts';
import { publishEvent } from '../realtime/event-bus.ts';
import { findJobById } from '../repositories/job.repository.ts';
import { backdateWorkerHeartbeat, findAllWorkers, restoreWorkerHeartbeat, setWorkerStatus } from '../repositories/worker.repository.ts';
import { enqueueRun } from './enqueue.service.ts';
import { listWorkers, toWorkerSummary } from './worker.service.ts';

const DEMO_TRIGGER_JOB_ID = 'competitor-pricing-scrape';
const DEMO_BREAK_JOB_ID = 'stripe-webhook-reconcile';
const KILL_WORKER_DRAIN_DELAY_MS = 2000;
const KILL_WORKER_BACKDATE_MS = 30000;
const RESET_CLEAN_THRESHOLD_MS = 1000;

async function enqueueDemoJob(jobId: string): Promise<RunSummary> {
  const job = await findJobById(jobId);
  if (!job) {
    throw new AppError({ code: 'DEMO_JOB_MISSING', message: `Demo job "${jobId}" is missing — has the database been seeded?`, statusCode: 409 });
  }
  return enqueueRun(job, { triggerSource: 'demo', scheduledAt: null });
}

/** Fires the demo panel's "happy path" job so a visitor can watch a real run go queued -> running -> succeeded. */
export function demoTrigger(): Promise<RunSummary> {
  return enqueueDemoJob(DEMO_TRIGGER_JOB_ID);
}

/** Fires a job already configured with a real failure mode, so a visitor watches genuine retries and dead-lettering — no job config is mutated to do this. */
export function demoBreak(): Promise<RunSummary> {
  return enqueueDemoJob(DEMO_BREAK_JOB_ID);
}

async function pickWorkerToKill(): Promise<string> {
  const workers = await listWorkers();
  const online = workers.filter((w) => w.status === 'online');
  if (online.length === 0) {
    throw new AppError({ code: 'NO_ONLINE_WORKER', message: 'No online worker is available to kill right now.', statusCode: 409 });
  }
  const busiest = [...online].sort((a, b) => b.inflight - a.inflight)[0];
  return busiest.id;
}

/**
 * Simulates a worker dying, entirely at the DB level — the server has no way to reach into a live
 * worker OS process, so this does not touch one. Marks the busiest online worker `draining`, then
 * (after a short delay so the transition is visible) backdates its heartbeat so it reads `offline`
 * on the next check. Any run it was holding is left alone; BullMQ's own stalled-job recovery is
 * what picks it back up — demonstrating that recovery path is the point of this button.
 *
 * Publishes worker.updated explicitly at both transitions rather than waiting for the real
 * worker's own heartbeat loop to notice and publish it. The real worker process is untouched by
 * this action (see above) and keeps heartbeating on its own ~5s cadence — draining only holds for
 * KILL_WORKER_DRAIN_DELAY_MS (2s), so relying on a heartbeat tick landing inside that window would
 * make the transition a coin-flip in the UI instead of the deterministic, always-visible sequence
 * a demo needs. A heartbeat tick landing in the same window is harmless: the frontend's
 * worker.updated handler doesn't apply the event payload directly, it just triggers a fresh
 * GET /api/workers (App.tsx), so a duplicate publish of the same state is a redundant refetch, not
 * a correctness risk. This is deliberately scoped to the demo path only — the real worker
 * lifecycle keeps relying on the heartbeat loop, not an explicit publish per state change.
 */
export async function demoKillWorker(): Promise<WorkerSummary> {
  const workerId = await pickWorkerToKill();

  const drainingRow = await setWorkerStatus(workerId, 'draining');
  if (!drainingRow) {
    throw new AppError({ code: 'WORKER_NOT_FOUND', message: `Worker "${workerId}" was not found.`, statusCode: 404 });
  }
  const drainingSummary = toWorkerSummary(drainingRow, new Date());
  publishEvent({ event: 'worker.updated', data: { worker: drainingSummary } });

  setTimeout(() => {
    void backdateWorkerHeartbeat(workerId, 'offline', new Date(Date.now() - KILL_WORKER_BACKDATE_MS)).then((offlineRow) => {
      if (!offlineRow) return;
      publishEvent({ event: 'worker.updated', data: { worker: toWorkerSummary(offlineRow, new Date()) } });
    });
  }, KILL_WORKER_DRAIN_DELAY_MS);

  const workers = await listWorkers();
  const summary = workers.find((w) => w.id === workerId);
  if (!summary) {
    throw new AppError({ code: 'WORKER_NOT_FOUND', message: `Worker "${workerId}" was not found.`, statusCode: 404 });
  }
  return summary;
}

// Job config and pause state are intentionally out of scope here — no demo action (demoTrigger,
// demoBreak) mutates a job's stored config or pauses it (see DECISIONS.md), so there is nothing of
// that kind for a reset to undo. Only demoKillWorker changes anything reset needs to restore.
/**
 * Restores every worker row to a fresh, healthy heartbeat — undoes demoKillWorker (and any other
 * drift) without touching jobs/runs history. Always succeeds with a 200: safe to call on an
 * already-clean fleet (nothing to restore, reports an empty list) and safe to call repeatedly
 * (each call is a full overwrite to the same target state, not a relative change).
 */
export async function demoReset(): Promise<DemoResetResult> {
  const workers = await findAllWorkers();
  const now = new Date();

  const alreadyClean = (w: (typeof workers)[number]) => w.status === 'online' && now.getTime() - w.lastHeartbeatAt.getTime() < RESET_CLEAN_THRESHOLD_MS;
  const needsRestore = workers.filter((w) => !alreadyClean(w));

  await Promise.all(needsRestore.map((w) => restoreWorkerHeartbeat(w.id, now)));

  return { restoredWorkerIds: needsRestore.map((w) => w.id), workers: await listWorkers() };
}
