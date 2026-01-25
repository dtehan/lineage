import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { apiClient } from '../client';
import type {
  LineageGraph,
  ImpactAnalysisResponse,
  DatabaseLineageResponse,
  AllDatabasesLineageResponse
} from '../../types';

interface LineageOptions {
  direction?: 'upstream' | 'downstream' | 'both';
  maxDepth?: number;
}

interface DatabaseLineageOptions extends LineageOptions {
  pageSize?: number;
}

interface AllDatabasesLineageOptions extends LineageOptions {
  pageSize?: number;
  databases?: string[];
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

export function useDatabaseLineage(
  databaseName: string,
  options: DatabaseLineageOptions = {}
) {
  const { direction = 'both', maxDepth = 3, pageSize = 50 } = options;

  return useInfiniteQuery({
    queryKey: ['database-lineage', databaseName, direction, maxDepth, pageSize],
    queryFn: async ({ pageParam = 1 }) => {
      const params = new URLSearchParams({
        direction,
        maxDepth: String(maxDepth),
        page: String(pageParam),
        pageSize: String(pageSize),
      });
      const { data } = await apiClient.get<DatabaseLineageResponse>(
        `/lineage/database/${encodeURIComponent(databaseName)}?${params}`
      );
      return data;
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      if (lastPage.pagination.page < lastPage.pagination.totalPages) {
        return lastPage.pagination.page + 1;
      }
      return undefined;
    },
    enabled: !!databaseName,
  });
}

export function useAllDatabasesLineage(options: AllDatabasesLineageOptions = {}) {
  const { direction = 'both', maxDepth = 2, pageSize = 20, databases = [] } = options;

  return useInfiniteQuery({
    queryKey: ['all-databases-lineage', direction, maxDepth, pageSize, databases],
    queryFn: async ({ pageParam = 1 }) => {
      const params = new URLSearchParams({
        direction,
        maxDepth: String(maxDepth),
        page: String(pageParam),
        pageSize: String(pageSize),
      });

      // Add database filter params
      databases.forEach(db => params.append('database', db));

      const { data } = await apiClient.get<AllDatabasesLineageResponse>(
        `/lineage/all-databases?${params}`
      );
      return data;
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      if (lastPage.pagination.page < lastPage.pagination.totalPages) {
        return lastPage.pagination.page + 1;
      }
      return undefined;
    },
  });
}
