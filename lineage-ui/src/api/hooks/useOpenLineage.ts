import { useQuery, UseQueryOptions } from '@tanstack/react-query';
import { openLineageApi } from '../client';
import type {
  OpenLineageNamespace,
  OpenLineageDataset,
  OpenLineageLineageResponse,
  DatabaseLineageResponse,
  NamespacesResponse,
  DatasetsResponse,
  DatasetSearchResponse,
  DatasetStatisticsResponse,
  DatasetDDLResponse,
  UnifiedSearchResponse,
  OpenLineagePaginationParams,
  LineageDirection,
} from '../../types/openlineage';

// Query key factory for consistent cache keys
export const openLineageKeys = {
  all: ['openlineage'] as const,
  namespaces: () => [...openLineageKeys.all, 'namespaces'] as const,
  namespace: (id: string) => [...openLineageKeys.namespaces(), id] as const,
  datasets: (namespaceId: string) => [...openLineageKeys.all, 'datasets', namespaceId] as const,
  datasetsPaginated: (namespaceId: string, params: OpenLineagePaginationParams) =>
    [...openLineageKeys.datasets(namespaceId), params] as const,
  dataset: (id: string) => [...openLineageKeys.all, 'dataset', id] as const,
  datasetsSearch: (query: string) => [...openLineageKeys.all, 'datasets', 'search', query] as const,
  unifiedSearch: (query: string) => [...openLineageKeys.all, 'search', query] as const,
  lineage: (datasetId: string, fieldName: string, direction: LineageDirection, maxDepth: number) =>
    [...openLineageKeys.all, 'lineage', datasetId, fieldName, direction, maxDepth] as const,
  databaseLineage: (databaseName: string, direction: LineageDirection, maxDepth: number) =>
    [...openLineageKeys.all, 'database-lineage', databaseName, direction, maxDepth] as const,
};

// Namespace hooks

export function useOpenLineageNamespaces(
  options?: Omit<UseQueryOptions<NamespacesResponse, Error>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: openLineageKeys.namespaces(),
    queryFn: () => openLineageApi.getNamespaces(),
    ...options,
  });
}

export function useOpenLineageNamespace(
  namespaceId: string,
  options?: Omit<UseQueryOptions<OpenLineageNamespace, Error>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: openLineageKeys.namespace(namespaceId),
    queryFn: () => openLineageApi.getNamespace(namespaceId),
    enabled: !!namespaceId,
    ...options,
  });
}

// Dataset hooks

export function useOpenLineageDatasets(
  namespaceId: string,
  params?: OpenLineagePaginationParams,
  options?: Omit<UseQueryOptions<DatasetsResponse, Error>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: openLineageKeys.datasetsPaginated(namespaceId, params ?? {}),
    queryFn: () => openLineageApi.getDatasets(namespaceId, params),
    enabled: !!namespaceId,
    ...options,
  });
}

export function useOpenLineageDataset(
  datasetId: string,
  options?: Omit<UseQueryOptions<OpenLineageDataset, Error>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: openLineageKeys.dataset(datasetId),
    queryFn: () => openLineageApi.getDataset(datasetId),
    enabled: !!datasetId,
    ...options,
  });
}

export function useOpenLineageDatasetSearch(
  query: string,
  limit?: number,
  options?: Omit<UseQueryOptions<DatasetSearchResponse, Error>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: openLineageKeys.datasetsSearch(query),
    queryFn: () => openLineageApi.searchDatasets(query, limit),
    enabled: query.length > 0,
    ...options,
  });
}

export function useOpenLineageUnifiedSearch(
  query: string,
  limit?: number,
  options?: Omit<UseQueryOptions<UnifiedSearchResponse, Error>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: openLineageKeys.unifiedSearch(query),
    queryFn: () => openLineageApi.unifiedSearch(query, limit),
    enabled: query.length > 0,
    ...options,
  });
}

// Statistics and DDL hooks

export function useDatasetStatistics(
  datasetId: string,
  options?: { enabled?: boolean } & Omit<UseQueryOptions<DatasetStatisticsResponse, Error>, 'queryKey' | 'queryFn'>
) {
  const { enabled = true, ...queryOptions } = options ?? {};
  return useQuery({
    queryKey: [...openLineageKeys.all, 'statistics', datasetId],
    queryFn: () => openLineageApi.getDatasetStatistics(datasetId),
    enabled: !!datasetId && enabled,
    staleTime: 5 * 60 * 1000, // Statistics change infrequently
    ...queryOptions,
  });
}

export function useDatasetDDL(
  datasetId: string,
  options?: { enabled?: boolean } & Omit<UseQueryOptions<DatasetDDLResponse, Error>, 'queryKey' | 'queryFn'>
) {
  const { enabled = true, ...queryOptions } = options ?? {};
  return useQuery({
    queryKey: [...openLineageKeys.all, 'ddl', datasetId],
    queryFn: () => openLineageApi.getDatasetDDL(datasetId),
    enabled: !!datasetId && enabled,
    staleTime: 30 * 60 * 1000, // DDL changes very rarely
    ...queryOptions,
  });
}

// Lineage hooks

export function useOpenLineageGraph(
  datasetId: string,
  fieldName: string,
  direction: LineageDirection = 'both',
  maxDepth: number = 5,
  options?: Omit<UseQueryOptions<OpenLineageLineageResponse, Error>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: openLineageKeys.lineage(datasetId, fieldName, direction, maxDepth),
    queryFn: () =>
      openLineageApi.getLineageGraph(datasetId, fieldName, { direction, maxDepth }),
    enabled: !!datasetId && !!fieldName,
    ...options,
  });
}

// Table-level lineage hook (all columns in a table)
export function useOpenLineageTableLineage(
  datasetId: string,
  direction: LineageDirection = 'both',
  maxDepth: number = 5,
  options?: Omit<UseQueryOptions<OpenLineageLineageResponse, Error>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: [...openLineageKeys.all, 'table-lineage', datasetId, direction, maxDepth],
    queryFn: () =>
      openLineageApi.getTableLineageGraph(datasetId, { direction, maxDepth }),
    enabled: !!datasetId,
    ...options,
  });
}

// Database-level lineage hook (all tables in a database)
export function useOpenLineageDatabaseLineage(
  databaseName: string,
  direction: LineageDirection = 'both',
  maxDepth: number = 3,
  options?: Omit<UseQueryOptions<DatabaseLineageResponse, Error>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: openLineageKeys.databaseLineage(databaseName, direction, maxDepth),
    queryFn: () =>
      openLineageApi.getDatabaseLineageGraph(databaseName, { direction, maxDepth }),
    enabled: !!databaseName,
    ...options,
  });
}

// Simplified hook for common use case
export function useOpenLineageFieldLineage(
  datasetId: string,
  fieldName: string,
  options?: {
    direction?: LineageDirection;
    maxDepth?: number;
  } & Omit<UseQueryOptions<OpenLineageLineageResponse, Error>, 'queryKey' | 'queryFn'>
) {
  const { direction = 'both', maxDepth = 5, ...queryOptions } = options ?? {};
  return useOpenLineageGraph(datasetId, fieldName, direction, maxDepth, queryOptions);
}
