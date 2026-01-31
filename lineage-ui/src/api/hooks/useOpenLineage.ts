import { useQuery, UseQueryOptions } from '@tanstack/react-query';
import { openLineageApi } from '../client';
import type {
  OpenLineageNamespace,
  OpenLineageDataset,
  OpenLineageLineageResponse,
  NamespacesResponse,
  DatasetsResponse,
  DatasetSearchResponse,
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
  lineage: (datasetId: string, fieldName: string, direction: LineageDirection, maxDepth: number) =>
    [...openLineageKeys.all, 'lineage', datasetId, fieldName, direction, maxDepth] as const,
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
