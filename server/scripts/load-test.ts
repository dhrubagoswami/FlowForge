// M11 load test: pushes 10,000 runs through the real queue against a local Redis (Memurai/
// redis-server — never point this at a hosted free tier, see .env.example) and a worker process
// this script spawns itself, then reports throughput, drain time, duplicate count, and the
// worker's peak RSS. Peak memory matters because Phase 3 puts the worker on a 1GB EC2 instance
// sharing RAM with Redis — this is how we find out ahead of time whether 10k jobs is comfortable.
//
// Mix: 9,000 runs with unique idempotency keys + 1,000 runs drawn from 100 distinct keys (10
// submissions each), so the expected dedup count (900) is computable in advance, not just
// observed — a metric that can't structurally be non-zero isn't a metric. The duplicate
// submissions are interleaved through the run (not appended at the end) and fired in bursts of
// concurrent submissions per key, so dedup is exercised under concurrent load — that's where a
// race in the idempotency claim would actually show up, not against a quiet queue.
//
// Run with: pnpm --filter=@flowforge/server exec tsx scripts/load-test.ts
import { randomUUID } from 'node:crypto';
import { execSync, spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { eq, inArray, sql } from 'drizzle-orm';
import { db } from '../src/db/client.ts';
import { jobsTable, runLogsTable, runsTable, workersTable } from '../src/db/schema/index.ts';
import { jobQueue } from '../src/queue/job.queue.ts';

const TOTAL_RUNS = 10_000;
const UNIQUE_COUNT = 9_000;
const DUPLICATE_SUBMISSIONS = 1_000;
const DISTINCT_DUPLICATE_KEYS = 100;
const SUBMISSIONS_PER_DUPLICATE_KEY = DUPLICATE_SUBMISSIONS / DISTINCT_DUPLICATE_KEYS; // 10
const EXPECTED_DEDUPED = DUPLICATE_SUBMISSIONS - DISTINCT_DUPLICATE_KEYS; // one winner per key, the rest skipped
const LOAD_TEST_JOB_ID = `load-test-${randomUUID()}`;
const WORKER_CONCURRENCY = 50;
const MEM_SAMPLE_INTERVAL_MS = 500;
const DRAIN_POLL_INTERVAL_MS = 250;
const DRAIN_TIMEOUT_MS = 15 * 60 * 1000; // each processed job writes to Neon (queued->running->succeeded), so drain time is DB-RTT-bound too

interface PlannedRun {
  idempotencyKey: string;
  // A run with a simultaneousGroup is submitted alongside every other run sharing the same group
  // id, via Promise.all, rather than as part of the large sequential DB_BATCH_SIZE chunks — this
  // is reserved for the handful of duplicate keys that need genuinely concurrent submissions to
  // exercise the idempotency claim's race window. undefined means "goes through the normal
  // chunked path", which is the vast majority of the plan (this is what keeps enqueue throughput
  // from being dominated by network RTT — see DB_BATCH_SIZE below).
  simultaneousGroup?: number;
}

const SIMULTANEOUS_DUPLICATE_KEY_COUNT = 5; // of the 100 distinct duplicate keys, this many get their 10 submissions fired concurrently instead of spread out

// Interleaves 9,000 unique-key runs with 1,000 duplicate-key runs (100 distinct keys x 10
// submissions each) so duplicates land throughout the plan, not clustered at the end — one
// duplicate submission every ~10th item. A handful of duplicate keys (the near-simultaneous case)
// get all 10 of their submissions marked with the same simultaneousGroup, so enqueuePlan fires
// them concurrently via Promise.all — that's the actual race window for the idempotency claim,
// not just "duplicates exist somewhere in a large batch".
function planRuns(): PlannedRun[] {
  const plan: PlannedRun[] = [];
  const duplicateKeys = Array.from({ length: DISTINCT_DUPLICATE_KEYS }, (_, i) => `${LOAD_TEST_JOB_ID}:dup-${i}`);

  let uniqueEmitted = 0;
  let duplicateKeyIndex = 0;
  let duplicateSubmissionsEmittedForCurrentKey = 0;
  let itemsSinceLastDuplicate = 0;

  while (uniqueEmitted < UNIQUE_COUNT || duplicateKeyIndex < DISTINCT_DUPLICATE_KEYS) {
    const dueForDuplicate = duplicateKeyIndex < DISTINCT_DUPLICATE_KEYS && (itemsSinceLastDuplicate >= 9 || uniqueEmitted >= UNIQUE_COUNT);

    if (dueForDuplicate) {
      const key = duplicateKeys[duplicateKeyIndex]!;
      const simultaneous = duplicateKeyIndex < SIMULTANEOUS_DUPLICATE_KEY_COUNT;

      if (simultaneous && duplicateSubmissionsEmittedForCurrentKey === 0) {
        // Emit all 10 submissions for this key at once, tagged to fire together.
        for (let i = 0; i < SUBMISSIONS_PER_DUPLICATE_KEY; i++) plan.push({ idempotencyKey: key, simultaneousGroup: duplicateKeyIndex });
        duplicateKeyIndex += 1;
        itemsSinceLastDuplicate = 0;
        continue;
      }

      plan.push({ idempotencyKey: key });
      duplicateSubmissionsEmittedForCurrentKey += 1;
      itemsSinceLastDuplicate = 0;
      if (duplicateSubmissionsEmittedForCurrentKey >= SUBMISSIONS_PER_DUPLICATE_KEY) {
        duplicateKeyIndex += 1;
        duplicateSubmissionsEmittedForCurrentKey = 0;
      }
      continue;
    }

    if (uniqueEmitted < UNIQUE_COUNT) {
      plan.push({ idempotencyKey: `${LOAD_TEST_JOB_ID}:unique-${uniqueEmitted}` });
      uniqueEmitted += 1;
      itemsSinceLastDuplicate += 1;
    } else {
      itemsSinceLastDuplicate += 1;
    }
  }

  return plan;
}

async function seedLoadTestJob(): Promise<void> {
  await db.insert(jobsTable).values({
    id: LOAD_TEST_JOB_ID,
    name: 'Load Test Job',
    triggerType: 'manual',
    taskType: 'simulate',
    // durationMs: 0 keeps per-job wall-clock cost negligible so the number measured is queue/DB
    // throughput, not artificial sleep time. failureMode: 'none' keeps failures out of the
    // throughput/duplicate numbers entirely — that's not what this run is measuring.
    taskInput: { durationMs: 0, failureMode: 'none', failureRate: 0 },
    idempotencyKeyTemplate: '{{job}}', // overridden per-run below; template value itself unused
    createdBy: 'load-test',
  });
}

// DATABASE_URL here is hosted Neon (ap-southeast-1, Singapore) — a single round-trip from this
// machine (Bengaluru) measured ~88ms (see DECISIONS.md), which would make TOTAL_RUNS sequential
// inserts alone take minutes, dwarfing actual queue/worker throughput. Batching multi-row INSERTs
// turns "N round-trips" into "N/DB_BATCH_SIZE round-trips" — this is what keeps the measured
// number about queue+worker capacity instead of being dominated by network RTT to Postgres. BullMQ
// adds are similarly batched via addBulk per burst rather than one .add() per job.
const DB_BATCH_SIZE = 500;

function toRunRow(idempotencyKey: string) {
  return {
    id: randomUUID(),
    jobId: LOAD_TEST_JOB_ID,
    status: 'queued' as const,
    triggerSource: 'manual' as const,
    attempt: 1,
    maxAttempts: 1,
    queuedAt: new Date(),
    idempotencyKey,
  };
}

async function insertAndEnqueue(rows: ReturnType<typeof toRunRow>[]): Promise<void> {
  for (let i = 0; i < rows.length; i += DB_BATCH_SIZE) {
    await db.insert(runsTable).values(rows.slice(i, i + DB_BATCH_SIZE));
  }
  await jobQueue.addBulk(rows.map((r) => ({ name: LOAD_TEST_JOB_ID, data: { runId: r.id, jobId: LOAD_TEST_JOB_ID }, opts: { jobId: r.id, attempts: 1 } })));
}

async function enqueuePlan(plan: PlannedRun[]): Promise<void> {
  // The plan is processed in its original order (preserving the interleaving), but split into two
  // kinds of work: the vast majority of items (no simultaneousGroup) accumulate into a running
  // buffer and get flushed as one DB_BATCH_SIZE chunk at a time — this is what keeps enqueue
  // throughput from being dominated by Neon's ~88ms/round-trip RTT (see DECISIONS.md). A
  // simultaneousGroup item instead flushes whatever's buffered so far, then submits its entire
  // group as one Promise.all burst — genuinely concurrent BullMQ adds, not just adjacent DB rows —
  // so the near-simultaneous duplicate case actually exercises the idempotency claim's race
  // window rather than being smoothed out by sequential batching.
  let buffer: ReturnType<typeof toRunRow>[] = [];
  const handledGroups = new Set<number>();

  const flush = async () => {
    if (buffer.length === 0) return;
    await insertAndEnqueue(buffer);
    buffer = [];
  };

  for (const item of plan) {
    if (item.simultaneousGroup !== undefined) {
      if (handledGroups.has(item.simultaneousGroup)) continue; // already submitted as part of this group's first occurrence
      handledGroups.add(item.simultaneousGroup);
      await flush();
      const groupItems = plan.filter((p) => p.simultaneousGroup === item.simultaneousGroup);
      await Promise.all(groupItems.map((g) => insertAndEnqueue([toRunRow(g.idempotencyKey)])));
      continue;
    }

    buffer.push(toRunRow(item.idempotencyKey));
    if (buffer.length >= DB_BATCH_SIZE) await flush();
  }

  await flush();
}

const SERVER_DIR = fileURLToPath(new URL('..', import.meta.url));
const WORKER_DIR = fileURLToPath(new URL('../../worker', import.meta.url));
// Hoisted so cleanup() can delete this specific workers row — worker/src/registration.ts upserts
// it on boot and never removes it itself outside a graceful SIGTERM/SIGINT shutdown, which a
// killWorkerHard() taskkill deliberately bypasses (see killWorkerHard's own comment). Left
// uncleaned across several runs during this script's development — 8 stray `load-test-worker-*`
// rows accumulated and broke an unrelated repository test (topWorkersByInflight) by outranking
// its fixture data. See DECISIONS.md.
const LOAD_TEST_WORKER_ID = `load-test-worker-${randomUUID()}`;

function spawnWorker(): ChildProcess {
  // Spawned via the workspace's tsx binary, run from worker/ with worker/'s own .env — not
  // server/'s — since worker/src/config/env.ts has its own env schema (WORKER_* vars).
  const child = spawn('node', [`${SERVER_DIR}/node_modules/tsx/dist/cli.mjs`, '--env-file=.env', 'src/index.ts'], {
    cwd: WORKER_DIR,
    env: { ...process.env, WORKER_CONCURRENCY: String(WORKER_CONCURRENCY), WORKER_ID: LOAD_TEST_WORKER_ID },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout?.on('data', () => {}); // swallow the worker's own logging — this script reports its own summary
  child.stderr?.on('data', (chunk: Buffer) => process.stderr.write(chunk));
  return child;
}

// Module-level so every exit path (normal completion, the top-level catch, and the safety-net
// signal handlers below) can reach the spawned worker — an orphaned worker process was a real
// failure mode hit while developing this script (a killed parent left its worker running,
// draining the queue invisibly in the background for minutes after the script appeared to exit).
let spawnedWorker: ChildProcess | null = null;

function killWorkerHard(): void {
  if (!spawnedWorker?.pid) return;
  // Windows: a plain child.kill('SIGTERM') can leave the process (and tsx's own child) alive.
  // taskkill /T /F kills the whole process tree, not just the immediate pid.
  try {
    execSync(`taskkill /PID ${spawnedWorker.pid} /T /F`, { stdio: 'ignore' });
  } catch {
    // Already exited — not a failure.
  }
  spawnedWorker = null;
}

process.on('exit', killWorkerHard);
process.on('SIGINT', () => {
  killWorkerHard();
  process.exit(130);
});

function samplePeakRssMb(pid: number): { stop: () => number } {
  let peakMb = 0;
  const interval = setInterval(() => {
    try {
      process.kill(pid, 0); // liveness check only, throws if the process is gone
    } catch {
      return;
    }
    try {
      const out = execSync(`powershell -NoProfile -Command "(Get-Process -Id ${pid}).WorkingSet64"`, { encoding: 'utf8' }).trim();
      const bytes = Number(out);
      if (Number.isFinite(bytes)) peakMb = Math.max(peakMb, bytes / (1024 * 1024));
    } catch {
      // Process may have exited between the liveness check and the sample — not a failure.
    }
  }, MEM_SAMPLE_INTERVAL_MS);

  return {
    stop: () => {
      clearInterval(interval);
      return peakMb;
    },
  };
}

async function waitForDrain(): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < DRAIN_TIMEOUT_MS) {
    const counts = await jobQueue.getJobCounts('waiting', 'active', 'delayed');
    const pending = (counts.waiting ?? 0) + (counts.active ?? 0) + (counts.delayed ?? 0);
    if (pending === 0) return;
    await new Promise((resolve) => setTimeout(resolve, DRAIN_POLL_INTERVAL_MS));
  }
  throw new Error(`Queue did not drain within ${DRAIN_TIMEOUT_MS / 1000}s`);
}

async function reportOutcome(): Promise<{ succeeded: number; dedupedActual: number; other: number }> {
  const rows = await db
    .select({ status: runsTable.status, count: sql<number>`count(*)`.mapWith(Number) })
    .from(runsTable)
    .where(eq(runsTable.jobId, LOAD_TEST_JOB_ID))
    .groupBy(runsTable.status);

  const byStatus = new Map(rows.map((r) => [r.status, r.count]));
  const succeeded = byStatus.get('succeeded') ?? 0;
  const dedupedActual = byStatus.get('skipped_duplicate') ?? 0;
  const total = rows.reduce((sum, r) => sum + r.count, 0);
  const other = total - succeeded - dedupedActual;

  return { succeeded, dedupedActual, other };
}

async function cleanup(): Promise<void> {
  // run_logs FK-references runs — must go first (see DECISIONS.md; run_logs isn't written by the
  // load-test path itself, since task-logger only logs during actual task execution, but the
  // worker's own processRun writes "claimed by/attempt N starting/etc" log lines regardless).
  const runIdRows = await db.select({ id: runsTable.id }).from(runsTable).where(eq(runsTable.jobId, LOAD_TEST_JOB_ID));
  const runIds = runIdRows.map((r) => r.id);
  if (runIds.length > 0) {
    for (let i = 0; i < runIds.length; i += DB_BATCH_SIZE) {
      await db.delete(runLogsTable).where(inArray(runLogsTable.runId, runIds.slice(i, i + DB_BATCH_SIZE)));
    }
  }
  await db.delete(runsTable).where(eq(runsTable.jobId, LOAD_TEST_JOB_ID));
  await db.delete(jobsTable).where(eq(jobsTable.id, LOAD_TEST_JOB_ID));
  // The spawned worker upserts its own workers row on boot (worker/src/registration.ts) and never
  // removes it outside a graceful shutdown, which killWorkerHard()'s taskkill deliberately
  // bypasses — must be deleted here or it leaks permanently. Real gap found and fixed this
  // session: 8 such rows had already accumulated across earlier runs and broke an unrelated
  // repository test by outranking its fixture data. See DECISIONS.md.
  await db.delete(workersTable).where(eq(workersTable.id, LOAD_TEST_WORKER_ID));
  await jobQueue.obliterate({ force: true }).catch(() => {}); // load-test-only queue state; safe since this script owns it exclusively for the run
}

async function main(): Promise<void> {
  console.log(`load-test — seeding job ${LOAD_TEST_JOB_ID}, planning ${TOTAL_RUNS} runs (${UNIQUE_COUNT} unique + ${DUPLICATE_SUBMISSIONS} duplicate submissions across ${DISTINCT_DUPLICATE_KEYS} keys)`);
  await seedLoadTestJob();
  const plan = planRuns();
  if (plan.length !== TOTAL_RUNS) throw new Error(`planRuns() produced ${plan.length} runs, expected ${TOTAL_RUNS}`);

  console.log(`load-test — spawning worker (concurrency ${WORKER_CONCURRENCY})`);
  const worker = spawnWorker();
  spawnedWorker = worker;
  await new Promise((resolve) => setTimeout(resolve, 2000)); // let the worker finish boot/registration before enqueueing
  if (!worker.pid) throw new Error('Worker process failed to spawn (no pid)');
  const memSampler = samplePeakRssMb(worker.pid);

  console.log('load-test — enqueueing...');
  const enqueueStartedAt = Date.now();
  await enqueuePlan(plan);
  const enqueueMs = Date.now() - enqueueStartedAt;

  console.log('load-test — waiting for queue to drain...');
  const drainStartedAt = Date.now();
  await waitForDrain();
  const drainMs = Date.now() - drainStartedAt;
  const totalMs = Date.now() - enqueueStartedAt;

  // Give the last few DB writes (status updates that land just after the queue's last job
  // completes) a moment to settle before reading final counts.
  await new Promise((resolve) => setTimeout(resolve, 1000));

  const peakRssMb = memSampler.stop();
  killWorkerHard();

  const { succeeded, dedupedActual, other } = await reportOutcome();

  console.log('\n--- load-test report ---');
  console.log('DB target: hosted Neon (ap-southeast-1) — DB writes cross a network; queue/worker concurrency is local (Memurai)');
  console.log(`DB insert batch size: ${DB_BATCH_SIZE} rows/round-trip (see DECISIONS.md for the un-batched ~88ms/row RTT this avoids)`);
  console.log(`total submitted: ${TOTAL_RUNS} (${UNIQUE_COUNT} unique + ${DUPLICATE_SUBMISSIONS} duplicate submissions)`);
  console.log(`enqueue time: ${(enqueueMs / 1000).toFixed(1)}s`);
  console.log(`drain time (after enqueue completes): ${(drainMs / 1000).toFixed(1)}s`);
  console.log(`total wall time (enqueue start -> fully drained): ${(totalMs / 1000).toFixed(1)}s`);
  console.log(`throughput (submitted / total wall time): ${(TOTAL_RUNS / (totalMs / 1000)).toFixed(1)} jobs/sec`);
  console.log(`throughput (executed / total wall time): ${(succeeded / (totalMs / 1000)).toFixed(1)} jobs/sec — excludes deduped runs, which never ran the task`);
  console.log(`executed (succeeded): ${succeeded}`);
  console.log(`deduped — expected: ${EXPECTED_DEDUPED}, actual: ${dedupedActual}${dedupedActual !== EXPECTED_DEDUPED ? '  <-- MISMATCH, see below' : ''}`);
  if (other > 0) console.log(`other status (not succeeded/skipped_duplicate): ${other} — investigate before trusting the numbers above`);
  console.log(`worker peak RSS: ${peakRssMb.toFixed(1)} MB (sampled every ${MEM_SAMPLE_INTERVAL_MS}ms via Get-Process, concurrency=${WORKER_CONCURRENCY})`);
  console.log('--- end report ---\n');

  console.log('load-test — cleaning up load-test job/runs/queue state...');
  await cleanup();
  console.log('load-test — done');
  process.exit(0);
}

main().catch(async (err: unknown) => {
  console.error('load-test failed:', err);
  await cleanup().catch(() => {});
  process.exit(1);
});
