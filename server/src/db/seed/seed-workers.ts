// The eight seeded worker rows. Varied concurrency/inflight so the Workers page isn't eight identical cards; one is stale-heartbeated to exercise the offline derivation.
export interface SeedWorkerDef {
  id: string;
  hostname: string;
  concurrency: number;
  inflight: number;
  /** Seconds before "now" that this worker last heartbeat — >15s reads as offline. */
  heartbeatAgeSeconds: number;
  version: string;
}

export const SEED_WORKERS: SeedWorkerDef[] = [
  { id: 'worker-01', hostname: 'iad-worker-01', concurrency: 4, inflight: 3, heartbeatAgeSeconds: 2, version: '1.4.0' },
  { id: 'worker-02', hostname: 'iad-worker-02', concurrency: 4, inflight: 2, heartbeatAgeSeconds: 3, version: '1.4.0' },
  { id: 'worker-03', hostname: 'fra-worker-01', concurrency: 6, inflight: 5, heartbeatAgeSeconds: 1, version: '1.4.0' },
  { id: 'worker-04', hostname: 'sfo-worker-01', concurrency: 4, inflight: 1, heartbeatAgeSeconds: 4, version: '1.4.0' },
  { id: 'worker-05', hostname: 'iad-worker-03', concurrency: 4, inflight: 4, heartbeatAgeSeconds: 2, version: '1.3.2' },
  { id: 'worker-06', hostname: 'fra-worker-02', concurrency: 6, inflight: 2, heartbeatAgeSeconds: 5, version: '1.4.0' },
  { id: 'worker-07', hostname: 'sfo-worker-02', concurrency: 4, inflight: 0, heartbeatAgeSeconds: 3, version: '1.4.0' },
  { id: 'worker-08', hostname: 'iad-worker-04', concurrency: 4, inflight: 0, heartbeatAgeSeconds: 240, version: '1.3.2' },
];
