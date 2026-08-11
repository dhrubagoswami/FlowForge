// Reproduction case for §7.3.3's duplicate-skip guarantee: enqueues two runs sharing one
// idempotency key (simulating two overlapping cron fires for the same scheduled slot) and lets
// the worker-side unique-constraint guard decide which one actually executes. Run with:
//   pnpm --filter=@flowforge/server exec tsx scripts/verify-duplicate-skip.ts
// Kept in the repo (not thrown away after M6) — the same reproduction is needed again at M7
// (real overlapping cron fires) and M10 (demo panel's "fire a duplicate" scenario, if one exists).
import { randomUUID } from 'node:crypto';
import { db } from '../src/db/client.ts';
import { runsTable } from '../src/db/schema/index.ts';
import { jobQueue } from '../src/queue/job.queue.ts';

const jobId = process.argv[2] ?? 'competitor-pricing-scrape';
const sharedKey = `${jobId}:duplicate-verification:${Date.now()}`;
const now = new Date();

const runA = { id: randomUUID(), jobId, status: 'queued' as const, triggerSource: 'manual' as const, attempt: 1, maxAttempts: 3, queuedAt: now, idempotencyKey: sharedKey, scheduledAt: null };
const runB = {
  id: randomUUID(),
  jobId,
  status: 'queued' as const,
  triggerSource: 'manual' as const,
  attempt: 1,
  maxAttempts: 3,
  queuedAt: new Date(now.getTime() + 1),
  idempotencyKey: sharedKey,
  scheduledAt: null,
};

await db.insert(runsTable).values([runA, runB]);

const enqueueOpts = { attempts: 3, backoff: { type: 'exponential' as const, delay: 30000 } };
await jobQueue.add(jobId, { runId: runA.id, jobId }, { jobId: runA.id, ...enqueueOpts });
await jobQueue.add(jobId, { runId: runB.id, jobId }, { jobId: runB.id, ...enqueueOpts });

console.log(JSON.stringify({ runA: runA.id, runB: runB.id, sharedKey }, null, 2));
process.exit(0);
