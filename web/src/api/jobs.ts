import type { JobDetail, JobSummary } from '@flowforge/shared';
import { apiGet } from './client.ts';

export function fetchJobs(): Promise<JobSummary[]> {
  return apiGet('/api/jobs');
}

export function fetchJobDetail(id: string): Promise<JobDetail> {
  return apiGet(`/api/jobs/${id}`);
}
