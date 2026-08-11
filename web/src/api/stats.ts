import type { StatsOverview } from '@flowforge/shared';
import { apiGet } from './client.ts';

export function fetchStatsOverview(): Promise<StatsOverview> {
  return apiGet('/api/stats/overview');
}
