// Debug helper: prints BullMQ's own view of a job (state, attemptsMade, opts) by run id — useful whenever the runs table and BullMQ's bookkeeping need to be compared directly. Run with: pnpm --filter=@flowforge/server exec tsx scripts/check-bullmq-job-state.ts <runId>
import { jobQueue } from '../src/queue/job.queue.ts';

const runId = process.argv[2];
if (!runId) {
  console.error('Usage: tsx scripts/check-bullmq-job-state.ts <runId>');
  process.exit(1);
}

const job = await jobQueue.getJob(runId);
if (!job) {
  console.log('No BullMQ job found for this id (already removed/completed/failed and cleaned up).');
} else {
  const state = await job.getState();
  console.log(JSON.stringify({ id: job.id, state, attemptsMade: job.attemptsMade, opts: job.opts, failedReason: job.failedReason }, null, 2));
}
process.exit(0);
