import type { RunLogLine, RunSummary } from '@flowforge/shared';
import { apiGet } from './client.ts';

export interface PagedRuns {
  runs: RunSummary[];
  nextCursor: string | null;
}

export function fetchRecentRuns(params?: { limit?: number }): Promise<RunSummary[]> {
  return apiGet('/api/runs', { limit: params?.limit });
}

export function fetchRunsForJob(jobId: string, params?: { limit?: number; cursor?: string }): Promise<PagedRuns> {
  return apiGet(`/api/jobs/${jobId}/runs`, { limit: params?.limit, cursor: params?.cursor });
}

export function fetchRunLogs(runId: string, params?: { since?: string }): Promise<RunLogLine[]> {
  return apiGet(`/api/runs/${runId}/logs`, { since: params?.since });
}
