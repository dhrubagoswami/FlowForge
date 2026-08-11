import { describe, expect, it, vi } from 'vitest';

const groupByMock = vi.fn();
vi.mock('../db/client.ts', () => ({
  db: { select: () => ({ from: () => ({ where: () => ({ groupBy: () => groupByMock() }) }) }) },
}));

const { runReportGenerate } = await import('./report-generate.task.ts');

function noopLog() {
  return vi.fn().mockResolvedValue(undefined);
}

describe('runReportGenerate', () => {
  it('returns the windowHours, groupBy, and grouped rows', async () => {
    groupByMock.mockResolvedValue([{ group: 'succeeded', count: 10 }]);
    const result = await runReportGenerate({ windowHours: 24, groupBy: 'status' }, noopLog());
    expect(result).toEqual({ windowHours: 24, groupBy: 'status', groups: [{ group: 'succeeded', count: 10 }] });
  });
});
