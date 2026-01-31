import axios from 'axios';
import type {
  OpenLineageNamespace,
  OpenLineageDataset,
  OpenLineageLineageResponse,
  DatabaseLineageResponse,
  NamespacesResponse,
  DatasetsResponse,
  DatasetSearchResponse,
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
  async getNamespaces(): Promise<NamespacesResponse> {
    const response = await apiClientV2.get<NamespacesResponse>('/api/v2/openlineage/namespaces');
    return response.data;
  },

  async getNamespace(namespaceId: string): Promise<OpenLineageNamespace> {
    const response = await apiClientV2.get<OpenLineageNamespace>(
      `/api/v2/openlineage/namespaces/${encodeURIComponent(namespaceId)}`
    );
    return response.data;
  },

  // Datasets
  async getDatasets(namespaceId: string, params?: OpenLineagePaginationParams): Promise<DatasetsResponse> {
    const response = await apiClientV2.get<DatasetsResponse>(
      `/api/v2/openlineage/namespaces/${encodeURIComponent(namespaceId)}/datasets`,
      { params }
    );
    return response.data;
  },

  async getDataset(datasetId: string): Promise<OpenLineageDataset> {
    const response = await apiClientV2.get<OpenLineageDataset>(
      `/api/v2/openlineage/datasets/${encodeURIComponent(datasetId)}`
    );
    return response.data;
  },

  async searchDatasets(query: string, limit?: number): Promise<DatasetSearchResponse> {
    const response = await apiClientV2.get<DatasetSearchResponse>('/api/v2/openlineage/datasets/search', {
      params: { q: query, limit },
    });
    return response.data;
  },

  async unifiedSearch(query: string, limit?: number): Promise<UnifiedSearchResponse> {
    const response = await apiClientV2.get<UnifiedSearchResponse>('/api/v2/openlineage/search', {
      params: { q: query, limit },
    });
    return response.data;
  },

  // Lineage
  async getLineageGraph(
    datasetId: string,
    fieldName: string,
    params?: LineageQueryParams
  ): Promise<OpenLineageLineageResponse> {
    const response = await apiClientV2.get<OpenLineageLineageResponse>(
      `/api/v2/openlineage/lineage/${encodeURIComponent(datasetId)}/${encodeURIComponent(fieldName)}`,
      { params }
    );
    return response.data;
  },

  // Table-level lineage (all columns)
  async getTableLineageGraph(
    datasetId: string,
    params?: LineageQueryParams
  ): Promise<OpenLineageLineageResponse> {
    const response = await apiClientV2.get<OpenLineageLineageResponse>(
      `/api/v2/openlineage/lineage/table/${encodeURIComponent(datasetId)}`,
      { params }
    );
    return response.data;
  },

  // Database-level lineage (all tables and their relationships)
  async getDatabaseLineageGraph(
    databaseName: string,
    params?: LineageQueryParams
  ): Promise<DatabaseLineageResponse> {
    const response = await apiClientV2.get<DatabaseLineageResponse>(
      `/api/v2/openlineage/lineage/database/${encodeURIComponent(databaseName)}`,
      { params }
    );
    return response.data;
  },
};
