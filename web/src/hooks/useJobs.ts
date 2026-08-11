import type { JobSummary } from '@flowforge/shared';
import { fetchJobs } from '../api/jobs.ts';
import { useApiResource, type ApiResourceState } from './useApiResource.ts';

export function useJobs(): ApiResourceState<JobSummary[]> {
  return useApiResource(fetchJobs, []);
}
