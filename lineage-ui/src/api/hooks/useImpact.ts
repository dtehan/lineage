import { useQuery } from '@tanstack/react-query';
import { openLineageApi } from '../client';

export function useImpactAnalysis(datasetId: string, fieldName: string, maxDepth?: number) {
  return useQuery({
    queryKey: ['impact', datasetId, fieldName, maxDepth],
    queryFn: () => openLineageApi.getImpactAnalysis(datasetId, fieldName, { maxDepth }),
    enabled: !!datasetId && !!fieldName,
  });
}
