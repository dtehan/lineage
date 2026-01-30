// OpenLineage v2 API Types
// Aligned with OpenLineage spec v2-0-2

export interface OpenLineageNamespace {
  id: string;
  uri: string;
  description?: string;
  specVersion: string;
  createdAt: string;
}

export interface OpenLineageDataset {
  id: string;
  namespace: string;
  name: string;
  description?: string;
  sourceType?: string;
  fields?: OpenLineageField[];
  createdAt: string;
  updatedAt: string;
}

export interface OpenLineageField {
  id: string;
  name: string;
  type?: string;
  description?: string;
  ordinalPosition: number;
  nullable: boolean;
}

export interface OpenLineageTransformation {
  type: 'DIRECT' | 'INDIRECT';
  subtype: TransformationSubtype;
  description?: string;
}

export type TransformationSubtype =
  | 'IDENTITY'
  | 'TRANSFORMATION'
  | 'AGGREGATION'
  | 'JOIN'
  | 'FILTER'
  | 'GROUP_BY'
  | 'SORT'
  | 'WINDOW'
  | 'CONDITIONAL';

export interface OpenLineageNode {
  id: string;
  type: 'dataset' | 'field';
  namespace?: string;
  dataset: string;
  field?: string;
  metadata?: Record<string, unknown>;
}

export interface OpenLineageEdge {
  id: string;
  source: string;
  target: string;
  transformationType: 'DIRECT' | 'INDIRECT';
  transformationSubtype: TransformationSubtype;
  confidenceScore?: number;
}

export interface OpenLineageGraph {
  nodes: OpenLineageNode[];
  edges: OpenLineageEdge[];
}

export interface OpenLineageLineageResponse {
  datasetId: string;
  fieldName: string;
  direction: 'upstream' | 'downstream' | 'both';
  maxDepth: number;
  graph: OpenLineageGraph;
}

// API Response Types

export interface NamespacesResponse {
  namespaces: OpenLineageNamespace[];
}

export interface DatasetsResponse {
  datasets: OpenLineageDataset[];
  total: number;
  pagination?: {
    total_count: number;
    limit: number;
    offset: number;
    has_next: boolean;
  };
}

export interface DatasetSearchResponse {
  datasets: OpenLineageDataset[];
  query: string;
  count: number;
}

// Direction type for lineage queries
export type LineageDirection = 'upstream' | 'downstream' | 'both';

// Query parameters for lineage API
export interface LineageQueryParams {
  direction?: LineageDirection;
  maxDepth?: number;
}

// Pagination parameters
export interface OpenLineagePaginationParams {
  limit?: number;
  offset?: number;
}
