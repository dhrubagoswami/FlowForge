// Mocked-repository test: getFailureClusters is pure grouping/sorting logic over whatever
// findFailedRunsSince returns, so a real DB isn't needed here — run.repository.test.ts already
// covers findFailedRunsSince's own SQL correctness for real.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const findFailedRunsSinceMock = vi.fn();

vi.mock('../repositories/run.repository.ts', () => ({ findFailedRunsSince: (...args: unknown[]) => findFailedRunsSinceMock(...args) }));

const { getFailureClusters } = await import('./failure-cluster.service.ts');

function failedRun(overrides: Record<string, unknown> = {}) {
  return {
    id: 'run-1',
    jobId: 'job-a',
    jobName: 'Job A',
    status: 'failed',
    errorType: 'rate_limit',
    errorMessage: 'rate limited · attempt 2/3',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getFailureClusters', () => {
  it('groups runs with similar messages (same errorType + fingerprint) into one cluster', async () => {
    findFailedRunsSinceMock.mockResolvedValue([
      failedRun({ id: 'run-1', errorMessage: 'rate limited · attempt 1/3' }),
      failedRun({ id: 'run-2', errorMessage: 'rate limited · attempt 2/3' }),
      failedRun({ id: 'run-3', errorMessage: 'rate limited · dead-lettered after 3 attempts' }),
    ]);

    const clusters = await getFailureClusters();

    expect(clusters).toHaveLength(1);
    expect(clusters[0]?.count).toBe(3);
  });

  it('keeps dissimilar messages in separate clusters', async () => {
    findFailedRunsSinceMock.mockResolvedValue([
      failedRun({ id: 'run-1', errorType: 'rate_limit', errorMessage: 'rate limited' }),
      failedRun({ id: 'run-2', errorType: 'timeout', errorMessage: 'request timed out after 30000ms' }),
      failedRun({ id: 'run-3', errorType: 'crash', errorMessage: 'unexpected token in JSON' }),
    ]);

    const clusters = await getFailureClusters();

    expect(clusters).toHaveLength(3);
  });

  it('separates identical messages that have different errorType, since the key is errorType + fingerprint', async () => {
    findFailedRunsSinceMock.mockResolvedValue([
      failedRun({ id: 'run-1', errorType: 'timeout', errorMessage: 'connection failed' }),
      failedRun({ id: 'run-2', errorType: 'crash', errorMessage: 'connection failed' }),
    ]);

    const clusters = await getFailureClusters();

    expect(clusters).toHaveLength(2);
  });

  it('returns an empty array when there are no failed runs in the window', async () => {
    findFailedRunsSinceMock.mockResolvedValue([]);

    const clusters = await getFailureClusters();

    expect(clusters).toEqual([]);
  });

  it('sorts clusters by count descending', async () => {
    findFailedRunsSinceMock.mockResolvedValue([
      failedRun({ id: 'run-1', errorType: 'timeout', errorMessage: 'timed out' }),
      failedRun({ id: 'run-2', errorType: 'rate_limit', errorMessage: 'rate limited' }),
      failedRun({ id: 'run-3', errorType: 'rate_limit', errorMessage: 'rate limited' }),
      failedRun({ id: 'run-4', errorType: 'rate_limit', errorMessage: 'rate limited' }),
    ]);

    const clusters = await getFailureClusters();

    expect(clusters[0]?.errorType).toBe('rate_limit');
    expect(clusters[0]?.count).toBe(3);
    expect(clusters[1]?.errorType).toBe('timeout');
    expect(clusters[1]?.count).toBe(1);
  });

  it('collects distinct jobIds contributing to a cluster, not one per run', async () => {
    findFailedRunsSinceMock.mockResolvedValue([
      failedRun({ id: 'run-1', jobId: 'job-a', errorMessage: 'rate limited' }),
      failedRun({ id: 'run-2', jobId: 'job-b', errorMessage: 'rate limited' }),
      failedRun({ id: 'run-3', jobId: 'job-a', errorMessage: 'rate limited' }), // same job again — should not duplicate in jobIds
    ]);

    const clusters = await getFailureClusters();

    expect(clusters[0]?.jobIds.sort()).toEqual(['job-a', 'job-b']);
  });

  it('passes windowHours and jobId through to the repository call', async () => {
    findFailedRunsSinceMock.mockResolvedValue([]);

    await getFailureClusters({ windowHours: 168, jobId: 'job-a' });

    const [sinceArg, jobIdArg] = findFailedRunsSinceMock.mock.calls[0] as [Date, string];
    expect(jobIdArg).toBe('job-a');
    expect(sinceArg).toBeInstanceOf(Date);
  });
});
