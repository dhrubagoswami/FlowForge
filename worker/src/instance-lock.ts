// Single-instance guard: a worker binds no port, so nothing at the OS level stops two processes
// from claiming the same worker identity and coexisting silently (the actual 2026-08-11 incident —
// 10 duplicate processes, no port conflict, no crash). This module makes that visible: on boot,
// acquire a Redis lock key naming this instance's *lock identity* as held; refuse to start if it's
// already held by a live instance. The lock is refreshed roughly once a minute on the existing
// heartbeat cycle (no new timer) and released on graceful shutdown.
//
// Lock identity vs. display identity (worker-NN, from registration.ts) are deliberately separate:
// - If WORKER_ID is explicitly set, the lock identity IS that value — explicit intent wins, and
//   this is what M7-era horizontal worker replicas will rely on to run several distinctly-named
//   workers side by side without colliding.
// - If WORKER_ID is unset (the default — a fresh worker-NN is auto-assigned on every boot), a
//   *derived* lock identity is used instead: a hash of hostname + this checkout's absolute repo
//   path + the job queue name. This is what actually closes the incident's root cause — two
//   unset-WORKER_ID `pnpm dev` runs on the same machine and checkout used to get two different
//   auto-assigned worker-NN ids and therefore two different (non-colliding) locks under the old
//   per-workerId scheme; the derived identity is stable across restarts of the *same* machine +
//   checkout, so a second one now collides regardless of what worker-NN it would have been
//   assigned. Two separate checkouts of this repo on the same machine — legitimate parallel work,
//   not a duplicate — do NOT collide, because the repo path is part of the hash.
import { createHash } from 'node:crypto';
import { hostname } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { instanceLockKey, INSTANCE_LOCK_TTL_MS, JOB_QUEUE_NAME } from '@flowforge/shared';
import { env } from './config/env.ts';
import { redisConnection } from './queue-connection.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(new URL('.', import.meta.url))), '..', '..');

function derivedLockIdentity(): string {
  const fingerprint = `${hostname()}:${repoRoot}:${JOB_QUEUE_NAME}`;
  return `derived-${createHash('sha256').update(fingerprint).digest('hex').slice(0, 16)}`;
}

/** The identity the lock is acquired under — the explicit WORKER_ID if set, otherwise a machine+checkout-stable derived id. Not the same as the cosmetic worker-NN display id (registration.ts). */
export function resolveLockIdentity(): { identity: string; isExplicit: boolean } {
  if (env.WORKER_ID) return { identity: env.WORKER_ID, isExplicit: true };
  return { identity: derivedLockIdentity(), isExplicit: false };
}

// Unique per process, not per lock identity — lets the release/refresh calls verify it's still the
// instance that originally acquired the lock (a GET-then-DEL race is possible without this, e.g.
// if this process's lock already expired and a new instance acquired it before this one's
// shutdown ran).
const instanceToken = `${process.pid}:${Date.now()}:${Math.random().toString(36).slice(2)}`;

export class InstanceLockConflictError extends Error {}

export async function acquireInstanceLock(): Promise<void> {
  const { identity, isExplicit } = resolveLockIdentity();
  const key = instanceLockKey('worker', identity);
  const acquired = await redisConnection.set(key, instanceToken, 'PX', INSTANCE_LOCK_TTL_MS, 'NX');
  if (acquired !== 'OK') {
    const identityKind = isExplicit ? 'explicit WORKER_ID' : 'derived (hostname + repo path — no WORKER_ID was set)';
    throw new InstanceLockConflictError(
      `Another live worker instance already holds lock identity "${identity}" (${identityKind}; Redis key ${key} is already set). ` +
        `This usually means a previous "pnpm dev" was left running — check for orphaned node processes ` +
        `(see "pnpm dev:clean") before starting another instance. ${
          isExplicit
            ? 'To run a second worker deliberately, give it a different WORKER_ID.'
            : 'Two instances on the same machine and checkout always collide when WORKER_ID is unset, by design — set distinct WORKER_ID values to run more than one deliberately.'
        }`,
    );
  }
}

/** Refreshes this instance's lock TTL — call on the existing heartbeat cycle, not a separate timer. Silently returns false (does not throw) if the lock was somehow lost, so a heartbeat tick never crashes the process; the caller logs. */
export async function refreshInstanceLock(): Promise<boolean> {
  const { identity } = resolveLockIdentity();
  const key = instanceLockKey('worker', identity);
  // Only refresh if we still hold it — a plain PEXPIRE would happily extend a key another instance
  // now owns after this one's lock lapsed and was reclaimed.
  const script = `if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("PEXPIRE", KEYS[1], ARGV[2]) else return 0 end`;
  const result = await redisConnection.eval(script, 1, key, instanceToken, INSTANCE_LOCK_TTL_MS);
  return result === 1;
}

export async function releaseInstanceLock(): Promise<void> {
  const { identity } = resolveLockIdentity();
  const key = instanceLockKey('worker', identity);
  const script = `if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) else return 0 end`;
  await redisConnection.eval(script, 1, key, instanceToken);
}

export async function countLiveWorkerInstances(): Promise<number> {
  const keys = await redisConnection.keys(`${instanceLockKey('worker', '*')}`);
  return keys.length;
}
