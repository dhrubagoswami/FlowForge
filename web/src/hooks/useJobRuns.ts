import { useCallback } from 'react';
import { fetchRunsForJob, type PagedRuns } from '../api/runs.ts';
import { useApiResource, type ApiResourceState } from './useApiResource.ts';

export function useJobRuns(jobId: string | null, limit = 8): ApiResourceState<PagedRuns> {
  const fetcher = useCallback(() => fetchRunsForJob(jobId ?? '', { limit }), [jobId, limit]);
  return useApiResource(fetcher, [jobId, limit], { skip: jobId === null });
}
