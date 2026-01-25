export interface Database {
  id: string;
  name: string;
  ownerName?: string;
  createTimestamp?: string;
  commentString?: string;
}

export interface Table {
  id: string;
  databaseName: string;
  tableName: string;
  tableKind: string;
  createTimestamp?: string;
  commentString?: string;
  rowCount?: number;
}

export interface Column {
  id: string;
  databaseName: string;
  tableName: string;
  columnName: string;
  columnType: string;
  columnLength?: number;
  nullable: boolean;
  commentString?: string;
  columnPosition: number;
}

export interface LineageNode {
  id: string;
  type: 'database' | 'table' | 'column';
  databaseName: string;
  tableName?: string;
  columnName?: string;
  metadata?: Record<string, unknown>;
}

export interface LineageEdge {
  id: string;
  source: string;
  target: string;
  transformationType?: string;
  confidenceScore?: number;
}

export interface LineageGraph {
  nodes: LineageNode[];
  edges: LineageEdge[];
}

export interface ImpactedAsset {
  id: string;
  databaseName: string;
  tableName: string;
  columnName?: string;
  depth: number;
  impactType: 'direct' | 'indirect';
}

export interface ImpactSummary {
  totalImpacted: number;
  byDatabase: Record<string, number>;
  byDepth: Record<number, number>;
  criticalCount: number;
}

export interface ImpactAnalysisResponse {
  assetId: string;
  impactedAssets: ImpactedAsset[];
  summary: ImpactSummary;
}

export interface SearchResult {
  id: string;
  type: 'database' | 'table' | 'column';
  databaseName: string;
  tableName?: string;
  columnName?: string;
  matchedOn: string;
  score: number;
}

export interface PaginationInfo {
  page: number;
  pageSize: number;
  totalTables: number;
  totalPages: number;
}

export interface DatabaseLineageResponse {
  databaseName: string;
  graph: LineageGraph;
  pagination: PaginationInfo;
}

export interface AllDatabasesLineageResponse {
  graph: LineageGraph;
  pagination: PaginationInfo;
  appliedFilters: {
    databases: string[] | 'all';
  };
}
