// Single-instance guard for the server's schedule-tick worker — same rationale as
// worker/src/instance-lock.ts: a schedule-tick worker binds no port, so nothing stops two server
// processes from coexisting and both consuming the same tick queue (which would fire every cron
// slot once per duplicate server, a real correctness bug already flagged in DECISIONS.md's M7
// entry, not just a command-budget one). The server is a designed scheduling singleton, so its
// lock identity is a fixed name, not a per-instance id.
import { INSTANCE_LOCK_TTL_MS, instanceLockKey } from '@flowforge/shared';
import { redisConnection } from '../queue/connection.ts';

const SCHEDULE_TICK_LOCK_ID = 'singleton';
const instanceToken = `${process.pid}:${Date.now()}:${Math.random().toString(36).slice(2)}`;

export class InstanceLockConflictError extends Error {}

export async function acquireScheduleTickLock(): Promise<void> {
  const key = instanceLockKey('schedule-tick-worker', SCHEDULE_TICK_LOCK_ID);
  const acquired = await redisConnection.set(key, instanceToken, 'PX', INSTANCE_LOCK_TTL_MS, 'NX');
  if (acquired !== 'OK') {
    throw new InstanceLockConflictError(
      `Another live server instance already holds the schedule-tick lock (Redis key ${key} is already set). ` +
        `The server is a scheduling singleton — running two would fire every cron slot once per instance. ` +
        `Check for orphaned node processes (see "pnpm dev:clean") before starting another instance.`,
    );
  }
}

/** Refreshes this instance's lock TTL — never throws; returns false if the lock was somehow lost so the caller can log it. */
export async function refreshScheduleTickLock(): Promise<boolean> {
  const key = instanceLockKey('schedule-tick-worker', SCHEDULE_TICK_LOCK_ID);
  const script = `if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("PEXPIRE", KEYS[1], ARGV[2]) else return 0 end`;
  const result = await redisConnection.eval(script, 1, key, instanceToken, INSTANCE_LOCK_TTL_MS);
  return result === 1;
}

export async function releaseScheduleTickLock(): Promise<void> {
  const key = instanceLockKey('schedule-tick-worker', SCHEDULE_TICK_LOCK_ID);
  const script = `if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) else return 0 end`;
  await redisConnection.eval(script, 1, key, instanceToken);
}

export async function countLiveWorkerInstances(): Promise<number> {
  const keys = await redisConnection.keys(`${instanceLockKey('worker', '*')}`);
  return keys.length;
}
