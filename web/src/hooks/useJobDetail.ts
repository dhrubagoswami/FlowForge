import { useCallback } from 'react';
import type { JobDetail } from '@flowforge/shared';
import { fetchJobDetail } from '../api/jobs.ts';
import { useApiResource, type ApiResourceState } from './useApiResource.ts';

export function useJobDetail(jobId: string | null): ApiResourceState<JobDetail> {
  const fetcher = useCallback(() => fetchJobDetail(jobId ?? ''), [jobId]);
  return useApiResource(fetcher, [jobId], { skip: jobId === null });
}
