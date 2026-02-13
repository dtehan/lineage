import axios from 'axios';
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
  LineageQueryParams,
} from '../types/openlineage';

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8080/api/v1',
  timeout: 120000, // 2 minutes for large lineage queries
  headers: {
    'Content-Type': 'application/json',
  },
});

// Separate client for v2 API endpoints (OpenLineage-aligned)
const apiClientV2 = axios.create({
  baseURL: '', // Use relative URLs to work with Vite proxy
  timeout: 120000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// OpenLineage v2 API methods

export const openLineageApi = {
  // Namespaces
  async getNamespaces(options?: { refresh?: boolean }): Promise<NamespacesResponse> {
    const response = await apiClientV2.get<NamespacesResponse>(
      '/api/v2/openlineage/namespaces',
      { params: options?.refresh ? { refresh: 'true' } : undefined }
    );
    return response.data;
  },

  async getNamespace(namespaceId: string, options?: { refresh?: boolean }): Promise<OpenLineageNamespace> {
    const response = await apiClientV2.get<OpenLineageNamespace>(
      `/api/v2/openlineage/namespaces/${encodeURIComponent(namespaceId)}`,
      { params: options?.refresh ? { refresh: 'true' } : undefined }
    );
    return response.data;
  },

  // Datasets
  async getDatasets(
    namespaceId: string,
    params?: OpenLineagePaginationParams,
    options?: { refresh?: boolean }
  ): Promise<DatasetsResponse> {
    const response = await apiClientV2.get<DatasetsResponse>(
      `/api/v2/openlineage/namespaces/${encodeURIComponent(namespaceId)}/datasets`,
      { params: { ...params, ...(options?.refresh ? { refresh: 'true' } : {}) } }
    );
    return response.data;
  },

  async getDataset(datasetId: string, options?: { refresh?: boolean }): Promise<OpenLineageDataset> {
    const response = await apiClientV2.get<OpenLineageDataset>(
      `/api/v2/openlineage/datasets/${encodeURIComponent(datasetId)}`,
      { params: options?.refresh ? { refresh: 'true' } : undefined }
    );
    return response.data;
  },

  async searchDatasets(query: string, limit?: number, options?: { refresh?: boolean }): Promise<DatasetSearchResponse> {
    const response = await apiClientV2.get<DatasetSearchResponse>('/api/v2/openlineage/datasets/search', {
      params: { q: query, limit, ...(options?.refresh ? { refresh: 'true' } : {}) },
    });
    return response.data;
  },

  async unifiedSearch(query: string, limit?: number): Promise<UnifiedSearchResponse> {
    const response = await apiClientV2.get<UnifiedSearchResponse>('/api/v2/openlineage/search', {
      params: { q: query, limit },
    });
    return response.data;
  },

  // Statistics and DDL
  async getDatasetStatistics(datasetId: string, options?: { refresh?: boolean }): Promise<DatasetStatisticsResponse> {
    const response = await apiClientV2.get<DatasetStatisticsResponse>(
      `/api/v2/openlineage/datasets/${encodeURIComponent(datasetId)}/statistics`,
      { params: options?.refresh ? { refresh: 'true' } : undefined }
    );
    return response.data;
  },

  async getDatasetDDL(datasetId: string, options?: { refresh?: boolean }): Promise<DatasetDDLResponse> {
    const response = await apiClientV2.get<DatasetDDLResponse>(
      `/api/v2/openlineage/datasets/${encodeURIComponent(datasetId)}/ddl`,
      { params: options?.refresh ? { refresh: 'true' } : undefined }
    );
    return response.data;
  },

  // Lineage
  async getLineageGraph(
    datasetId: string,
    fieldName: string,
    params?: LineageQueryParams
  ): Promise<OpenLineageLineageResponse> {
    const { refresh, ...queryParams } = params || {};
    const response = await apiClientV2.get<OpenLineageLineageResponse>(
      `/api/v2/openlineage/lineage/${encodeURIComponent(datasetId)}/${encodeURIComponent(fieldName)}`,
      { params: { ...queryParams, ...(refresh ? { refresh: 'true' } : {}) } }
    );
    return response.data;
  },

  // Table-level lineage (all columns)
  async getTableLineageGraph(
    datasetId: string,
    params?: LineageQueryParams
  ): Promise<OpenLineageLineageResponse> {
    const { refresh, ...queryParams } = params || {};
    const response = await apiClientV2.get<OpenLineageLineageResponse>(
      `/api/v2/openlineage/lineage/table/${encodeURIComponent(datasetId)}`,
      { params: { ...queryParams, ...(refresh ? { refresh: 'true' } : {}) } }
    );
    return response.data;
  },

  // Database-level lineage (all tables and their relationships)
  async getDatabaseLineageGraph(
    databaseName: string,
    params?: LineageQueryParams
  ): Promise<DatabaseLineageResponse> {
    const { refresh, ...queryParams } = params || {};
    const response = await apiClientV2.get<DatabaseLineageResponse>(
      `/api/v2/openlineage/lineage/database/${encodeURIComponent(databaseName)}`,
      { params: { ...queryParams, ...(refresh ? { refresh: 'true' } : {}) } }
    );
    return response.data;
  },
};
