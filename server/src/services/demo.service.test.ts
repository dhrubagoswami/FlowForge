import { beforeEach, describe, expect, it, vi } from 'vitest';

const findAllWorkersMock = vi.fn();
const restoreWorkerHeartbeatMock = vi.fn();
const setWorkerStatusMock = vi.fn();
const backdateWorkerHeartbeatMock = vi.fn();
const findJobByIdMock = vi.fn();
const insertQueuedRunMock = vi.fn();
const queueAddMock = vi.fn();

vi.mock('../repositories/worker.repository.ts', () => ({
  findAllWorkers: (...args: unknown[]) => findAllWorkersMock(...args),
  restoreWorkerHeartbeat: (...args: unknown[]) => restoreWorkerHeartbeatMock(...args),
  setWorkerStatus: (...args: unknown[]) => setWorkerStatusMock(...args),
  backdateWorkerHeartbeat: (...args: unknown[]) => backdateWorkerHeartbeatMock(...args),
}));
// demo.service.ts pulls in enqueue.service.ts (for demoTrigger/demoBreak), which reaches the
// DB-backed job/run repositories and the Redis-backed job queue — none of that is exercised by
// the demoReset tests below, but it must still be mocked so importing demo.service.ts doesn't
// require real DATABASE_URL/REDIS_URL env vars.
vi.mock('../repositories/job.repository.ts', () => ({ findJobById: (...args: unknown[]) => findJobByIdMock(...args) }));
vi.mock('../repositories/run.repository.ts', () => ({ insertQueuedRun: (...args: unknown[]) => insertQueuedRunMock(...args) }));
vi.mock('../queue/job.queue.ts', () => ({ jobQueue: { add: (...args: unknown[]) => queueAddMock(...args) } }));

const { demoReset } = await import('./demo.service.ts');

function workerRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'worker-01',
    hostname: 'worker-01',
    status: 'online' as const,
    concurrency: 4,
    inflight: 0,
    lastHeartbeatAt: new Date(),
    startedAt: new Date('2026-08-01T00:00:00.000Z'),
    version: '1.0.0',
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    updatedAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('demoReset', () => {
  it('is a safe no-op on a clean fleet: restores nothing and still returns 200-shaped success', async () => {
    findAllWorkersMock.mockResolvedValue([workerRow(), workerRow({ id: 'worker-02' })]);

    const result = await demoReset();

    expect(result.restoredWorkerIds).toEqual([]);
    expect(restoreWorkerHeartbeatMock).not.toHaveBeenCalled();
    expect(result.workers).toBeDefined();
  });

  it('restores a worker whose heartbeat has gone stale (even if status still reads online)', async () => {
    const staleHeartbeat = new Date(Date.now() - 60000);
    findAllWorkersMock.mockResolvedValue([workerRow({ id: 'worker-01', lastHeartbeatAt: staleHeartbeat })]);

    const result = await demoReset();

    expect(result.restoredWorkerIds).toEqual(['worker-01']);
    expect(restoreWorkerHeartbeatMock).toHaveBeenCalledWith('worker-01', expect.any(Date));
  });

  it('restores a draining/offline worker (the state demoKillWorker leaves behind)', async () => {
    findAllWorkersMock.mockResolvedValue([
      workerRow({ id: 'worker-01', status: 'offline', lastHeartbeatAt: new Date(Date.now() - 60000) }),
    ]);

    const result = await demoReset();

    expect(result.restoredWorkerIds).toEqual(['worker-01']);
    expect(restoreWorkerHeartbeatMock).toHaveBeenCalledTimes(1);
  });

  it('calling reset twice in a row is idempotent — the second call finds a clean fleet and restores nothing', async () => {
    const freshRow = workerRow({ id: 'worker-01', status: 'offline', lastHeartbeatAt: new Date(Date.now() - 60000) });
    findAllWorkersMock.mockResolvedValueOnce([freshRow]);

    const first = await demoReset();
    expect(first.restoredWorkerIds).toEqual(['worker-01']);

    // Second call: the repository now reports the worker as the reset already left it — online, fresh heartbeat.
    findAllWorkersMock.mockResolvedValueOnce([workerRow({ id: 'worker-01', status: 'online' })]);
    restoreWorkerHeartbeatMock.mockClear();

    const second = await demoReset();
    expect(second.restoredWorkerIds).toEqual([]);
    expect(restoreWorkerHeartbeatMock).not.toHaveBeenCalled();
  });

  it('never throws, even for an empty fleet', async () => {
    findAllWorkersMock.mockResolvedValue([]);
    await expect(demoReset()).resolves.toMatchObject({ restoredWorkerIds: [] });
  });
});
