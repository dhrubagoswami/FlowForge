import type { JobConfig, JobDetail, JobSummary } from '@flowforge/shared';
import { apiGet, apiPost } from './client.ts';

export function fetchJobs(): Promise<JobSummary[]> {
  return apiGet('/api/jobs');
}

export function fetchJobDetail(id: string): Promise<JobDetail> {
  return apiGet(`/api/jobs/${id}`);
}

export function createJob(config: JobConfig): Promise<JobDetail> {
  return apiPost('/api/jobs', config);
}
