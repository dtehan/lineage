import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../client';
import type { LineageGraph, ImpactAnalysisResponse } from '../../types';

interface LineageOptions {
  direction?: 'upstream' | 'downstream' | 'both';
  maxDepth?: number;
}

export function useLineage(assetId: string, options: LineageOptions = {}) {
  const { direction = 'both', maxDepth = 5 } = options;

  return useQuery({
    queryKey: ['lineage', assetId, direction, maxDepth],
    queryFn: async () => {
      const params = new URLSearchParams({
        direction,
        maxDepth: String(maxDepth),
      });
      const { data } = await apiClient.get<{ assetId: string; graph: LineageGraph }>(
        `/lineage/${encodeURIComponent(assetId)}?${params}`
      );
      return data;
    },
    enabled: !!assetId,
  });
}

export function useImpactAnalysis(assetId: string, maxDepth = 10) {
  return useQuery({
    queryKey: ['impact', assetId, maxDepth],
    queryFn: async () => {
      const { data } = await apiClient.get<ImpactAnalysisResponse>(
        `/lineage/${encodeURIComponent(assetId)}/impact?maxDepth=${maxDepth}`
      );
      return data;
    },
    enabled: !!assetId,
  });
}
