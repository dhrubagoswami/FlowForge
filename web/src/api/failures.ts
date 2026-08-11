import type { FailureCluster } from '@flowforge/shared';
import { apiGet } from './client.ts';

export function fetchFailureClusters(params?: { windowHours?: number; jobId?: string }): Promise<FailureCluster[]> {
  return apiGet('/api/failures/clusters', { windowHours: params?.windowHours, jobId: params?.jobId });
}
