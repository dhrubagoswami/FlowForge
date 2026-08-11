import { describe, expect, it, vi } from 'vitest';
import { runSimulate, SimulatedTaskError } from './simulate.task.ts';

function noopLog() {
  return vi.fn().mockResolvedValue(undefined);
}

describe('runSimulate', () => {
  it('succeeds when failureMode is none', async () => {
    const result = await runSimulate({ durationMs: 1, failureMode: 'none' }, noopLog());
    expect(result).toEqual({ durationMs: 1 });
  });

  it('succeeds when failureRate is 0 even with a failureMode set', async () => {
    const result = await runSimulate({ durationMs: 1, failureMode: 'crash', failureRate: 0 }, noopLog());
    expect(result).toEqual({ durationMs: 1 });
  });

  it('throws a SimulatedTaskError with the right errorType when failureRate is 1', async () => {
    await expect(runSimulate({ durationMs: 1, failureMode: 'rate_limit', failureRate: 1 }, noopLog())).rejects.toThrow(SimulatedTaskError);

    try {
      await runSimulate({ durationMs: 1, failureMode: 'timeout', failureRate: 1 }, noopLog());
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(SimulatedTaskError);
      expect((err as SimulatedTaskError).errorType).toBe('timeout');
    }
  });

  it('logs an error line before throwing', async () => {
    const log = noopLog();
    await expect(runSimulate({ durationMs: 1, failureMode: 'crash', failureRate: 1 }, log)).rejects.toThrow();
    expect(log).toHaveBeenCalledWith('error', expect.any(String));
  });
});
