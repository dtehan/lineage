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
  name?: string; // Field name (for field nodes)
  namespace?: string;
  dataset: string | { name: string; namespace: string; sourceType?: string }; // Can be string or object
  field?: string; // Alternative field name property
  metadata?: Record<string, unknown>;
}

export interface OpenLineageEdge {
  id: string;
  source: string;
  target: string;
  transformationType: 'DIRECT' | 'INDIRECT';
  transformationSubtype?: TransformationSubtype; // Optional since API doesn't always return it
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

export interface DatabaseLineageResponse {
  databaseName: string;
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

export interface DatabaseInfo {
  name: string;
  namespace: string;
  tableCount: number;
}

export interface UnifiedSearchResponse {
  databases: DatabaseInfo[];
  datasets: OpenLineageDataset[];
  query: string;
  totalCount: number;
  databaseCount: number;
  datasetCount: number;
}

// Direction type for lineage queries
export type LineageDirection = 'upstream' | 'downstream' | 'both';

// Query parameters for lineage API
export interface LineageQueryParams {
  direction?: LineageDirection;
  maxDepth?: number;
  refresh?: boolean;
}

// Dataset Statistics and DDL Response Types (Phase 20 API)

export interface DatasetStatisticsResponse {
  datasetId: string;
  databaseName: string;
  tableName: string;
  sourceType: string;
  creatorName?: string;
  createTimestamp?: string;
  lastAlterTimestamp?: string;
  rowCount?: number | null;
  sizeBytes?: number | null;
  tableComment?: string;
}

export interface DatasetDDLResponse {
  datasetId: string;
  databaseName: string;
  tableName: string;
  sourceType: string;
  viewSql?: string;
  tableDdl?: string;
  truncated: boolean;
  tableComment?: string;
  columnComments?: Record<string, string>;
}

// Pagination parameters
export interface OpenLineagePaginationParams {
  limit?: number;
  offset?: number;
}
