import type { StatsOverview } from '@flowforge/shared';
import { fetchStatsOverview } from '../api/stats.ts';
import { useApiResource, type ApiResourceState } from './useApiResource.ts';

export function useStatsOverview(): ApiResourceState<StatsOverview> {
  return useApiResource(fetchStatsOverview, []);
}
