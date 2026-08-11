import { describe, expect, it, vi } from 'vitest';

const selectMock = vi.fn();
vi.mock('../db/client.ts', () => ({
  db: { select: () => ({ from: () => selectMock() }) },
}));

const { runDbSnapshot } = await import('./db-snapshot.task.ts');

function noopLog() {
  return vi.fn().mockResolvedValue(undefined);
}

describe('runDbSnapshot', () => {
  it('returns the row count for an allowed table', async () => {
    selectMock.mockResolvedValue([{ count: 42 }]);
    const result = await runDbSnapshot({ table: 'jobs' }, noopLog());
    expect(result).toEqual({ table: 'jobs', rowCount: 42 });
  });

  it('rejects a table name that is not in the allow-list, and logs the error itself', async () => {
    const log = noopLog();
    await expect(runDbSnapshot({ table: 'pg_catalog.pg_user' }, log)).rejects.toThrow(/not a snapshot-able table/);
    expect(log).toHaveBeenCalledWith('error', expect.stringMatching(/not a snapshot-able table/));
  });
});
