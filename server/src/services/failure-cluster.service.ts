// Groups recent failed/dead-lettered runs into clusters by error_type + a normalised message fingerprint. Deterministic, code-only — no AI involved (that's ai-diagnosis.service.ts, M10).
import type { FailureCluster } from '@flowforge/shared';
import { FAILURE_CLUSTER_DEFAULT_WINDOW_HOURS } from '../config/constants.ts';
import { fingerprintErrorMessage } from '../lib/error-fingerprint.util.ts';
import { findFailedRunsSince } from '../repositories/run.repository.ts';

export async function getFailureClusters(params?: { windowHours?: number; jobId?: string }): Promise<FailureCluster[]> {
  const windowHours = params?.windowHours ?? FAILURE_CLUSTER_DEFAULT_WINDOW_HOURS;
  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);

  const failedRuns = await findFailedRunsSince(since, params?.jobId);

  const clusters = new Map<string, { errorType: string; sampleMessage: string; jobIds: Set<string>; count: number }>();

  for (const run of failedRuns) {
    const errorType = run.errorType ?? 'unknown';
    const fingerprint = fingerprintErrorMessage(run.errorMessage ?? '');
    const key = `${errorType}::${fingerprint}`;

    const existing = clusters.get(key);
    if (existing) {
      existing.count += 1;
      existing.jobIds.add(run.jobId);
    } else {
      clusters.set(key, {
        errorType,
        sampleMessage: run.errorMessage ?? '(no error message)',
        jobIds: new Set([run.jobId]),
        count: 1,
      });
    }
  }

  return [...clusters.values()]
    .sort((a, b) => b.count - a.count)
    .map((c) => ({ errorType: c.errorType, count: c.count, sampleMessage: c.sampleMessage, jobIds: [...c.jobIds] }));
}
