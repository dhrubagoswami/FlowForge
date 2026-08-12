// A worker (job worker or schedule-tick worker) binds no port — so N duplicate instances of the
// same logical worker can coexist with zero OS-level signal that anything is wrong (confirmed: the
// 2026-08-11 incident had 10 duplicate processes with no port conflict, no crash, no error). This
// key namespace is the mechanism that makes that visible: each instance holds a Redis lock key
// (SET NX PX, refreshed on its own heartbeat cycle) naming itself as the sole holder of its
// logical identity. A second instance trying to boot under the same identity finds the key already
// held and refuses to start, instead of silently coexisting.
export const INSTANCE_LOCK_KEY_PREFIX = 'flowforge:instance-lock';
// TTL is long relative to its refresh cadence deliberately — the lock's job is to catch a
// duplicate *process*, not to detect a dead one quickly (that's what worker.service.ts's
// heartbeat-staleness check already does, on its own 15s threshold). A refresh roughly once a
// minute (worker: piggybacked on the existing 5s DB heartbeat cycle but only every ~12th tick;
// server: its own small dedicated interval) keeps the lock's own command cost near the ~2/min the
// owner sized this against, while a minute-scale TTL still reclaims a genuinely crashed process's
// identity well within the time it'd take anyone to notice and restart it.
export const INSTANCE_LOCK_TTL_MS = 90000;
export const INSTANCE_LOCK_REFRESH_INTERVAL_MS = 60000;

export function instanceLockKey(kind: 'worker' | 'schedule-tick-worker', instanceId: string): string {
  return `${INSTANCE_LOCK_KEY_PREFIX}:${kind}:${instanceId}`;
}
