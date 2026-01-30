import axios from 'axios';
import type {
  OpenLineageNamespace,
  OpenLineageDataset,
  OpenLineageLineageResponse,
  NamespacesResponse,
  DatasetsResponse,
  DatasetSearchResponse,
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
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8080',
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
};
