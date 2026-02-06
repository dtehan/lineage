package application

import "github.com/lineage-api/internal/domain"

// Request DTOs
type GetLineageRequest struct {
	AssetID   string `json:"assetId"`
	Direction string `json:"direction"`
	MaxDepth  int    `json:"maxDepth"`
}

type SearchRequest struct {
	Query      string   `json:"query"`
	AssetTypes []string `json:"assetTypes,omitempty"`
	Limit      int      `json:"limit,omitempty"`
}

// PaginationMeta provides pagination information in list responses.
// Implements PAGE-03: total_count, has_next, and current page info.
type PaginationMeta struct {
	TotalCount int  `json:"total_count"`
	Limit      int  `json:"limit"`
	Offset     int  `json:"offset"`
	HasNext    bool `json:"has_next"`
}

// Response DTOs
type DatabaseListResponse struct {
	Databases  []domain.Database `json:"databases"`
	Total      int               `json:"total"`
	Pagination *PaginationMeta   `json:"pagination,omitempty"`
}

type TableListResponse struct {
	Tables     []domain.Table  `json:"tables"`
	Total      int             `json:"total"`
	Pagination *PaginationMeta `json:"pagination,omitempty"`
}

type ColumnListResponse struct {
	Columns    []domain.Column `json:"columns"`
	Total      int             `json:"total"`
	Pagination *PaginationMeta `json:"pagination,omitempty"`
}

type LineageResponse struct {
	Lineage []domain.ColumnLineage `json:"lineage"`
}

type LineageGraphResponse struct {
	AssetID string              `json:"assetId"`
	Nodes   []domain.LineageNode `json:"nodes"`
	Edges   []domain.LineageEdge `json:"edges"`
}

type ImpactAnalysisResponse struct {
	SourceAsset         string          `json:"sourceAsset"`
	TotalImpactedAssets int             `json:"totalImpactedAssets"`
	ImpactedAssets      []ImpactedAsset `json:"impactedAssets"`
	Summary             ImpactSummary   `json:"summary"`
}

type ImpactedAsset struct {
	ID           string `json:"id"`
	DatabaseName string `json:"databaseName"`
	TableName    string `json:"tableName"`
	ColumnName   string `json:"columnName,omitempty"`
	Depth        int    `json:"depth"`
	ImpactType   string `json:"impactType"`
}

type ImpactSummary struct {
	TotalImpacted int            `json:"totalImpacted"`
	ByDatabase    map[string]int `json:"byDatabase"`
	ByDepth       map[int]int    `json:"byDepth"`
	CriticalCount int            `json:"criticalCount"`
}

type SearchResponse struct {
	Results []domain.SearchResult `json:"results"`
	Total   int                   `json:"total"`
	Query   string                `json:"query"`
}

// OpenLineage API DTOs

// OpenLineageNamespaceResponse represents a namespace in API responses
type OpenLineageNamespaceResponse struct {
	ID          string `json:"id"`
	URI         string `json:"uri"`
	Description string `json:"description,omitempty"`
	SpecVersion string `json:"specVersion"`
	CreatedAt   string `json:"createdAt"`
}

// OpenLineageDatasetResponse represents a dataset in API responses
type OpenLineageDatasetResponse struct {
	ID          string                      `json:"id"`
	Namespace   string                      `json:"namespace"`
	Name        string                      `json:"name"`
	Description string                      `json:"description,omitempty"`
	SourceType  string                      `json:"sourceType,omitempty"`
	Fields      []OpenLineageFieldResponse  `json:"fields,omitempty"`
	CreatedAt   string                      `json:"createdAt"`
	UpdatedAt   string                      `json:"updatedAt"`
}

// OpenLineageFieldResponse represents a field in API responses
type OpenLineageFieldResponse struct {
	ID              string `json:"id"`
	Name            string `json:"name"`
	Type            string `json:"type,omitempty"`
	Description     string `json:"description,omitempty"`
	OrdinalPosition int    `json:"ordinalPosition"`
	Nullable        bool   `json:"nullable"`
}

// OpenLineageLineageResponse represents lineage data in API responses
type OpenLineageLineageResponse struct {
	DatasetID string                     `json:"datasetId"`
	FieldName string                     `json:"fieldName"`
	Direction string                     `json:"direction"`
	MaxDepth  int                        `json:"maxDepth"`
	Graph     *OpenLineageGraphResponse  `json:"graph"`
}

// OpenLineageGraphResponse represents a lineage graph in API responses
type OpenLineageGraphResponse struct {
	Nodes []OpenLineageNodeResponse `json:"nodes"`
	Edges []OpenLineageEdgeResponse `json:"edges"`
}

// OpenLineageNodeResponse represents a node in the lineage graph
type OpenLineageNodeResponse struct {
	ID        string         `json:"id"`
	Type      string         `json:"type"`
	Namespace string         `json:"namespace,omitempty"`
	Dataset   string         `json:"dataset"`
	Field     string         `json:"field,omitempty"`
	Metadata  map[string]any `json:"metadata,omitempty"`
}

// OpenLineageEdgeResponse represents an edge in the lineage graph
type OpenLineageEdgeResponse struct {
	ID                    string  `json:"id"`
	Source                string  `json:"source"`
	Target                string  `json:"target"`
	TransformationType    string  `json:"transformationType"`
	TransformationSubtype string  `json:"transformationSubtype"`
	ConfidenceScore       float64 `json:"confidenceScore,omitempty"`
}

// PaginatedDatasetsResponse represents paginated datasets
type PaginatedDatasetsResponse struct {
	Datasets   []OpenLineageDatasetResponse `json:"datasets"`
	Total      int                          `json:"total"`
	Pagination *PaginationMeta              `json:"pagination,omitempty"`
}

// DatasetStatisticsResponse represents statistics in API responses
type DatasetStatisticsResponse struct {
	DatasetID          string `json:"datasetId"`
	DatabaseName       string `json:"databaseName"`
	TableName          string `json:"tableName"`
	SourceType         string `json:"sourceType"`
	CreatorName        string `json:"creatorName,omitempty"`
	CreateTimestamp    *string `json:"createTimestamp,omitempty"`
	LastAlterTimestamp *string `json:"lastAlterTimestamp,omitempty"`
	RowCount           *int64  `json:"rowCount,omitempty"`
	SizeBytes          *int64  `json:"sizeBytes,omitempty"`
	TableComment       string `json:"tableComment,omitempty"`
}

// DatasetDDLResponse represents DDL info in API responses
type DatasetDDLResponse struct {
	DatasetID      string            `json:"datasetId"`
	DatabaseName   string            `json:"databaseName"`
	TableName      string            `json:"tableName"`
	SourceType     string            `json:"sourceType"`
	ViewSQL        string            `json:"viewSql,omitempty"`
	Truncated      bool              `json:"truncated"`
	TableComment   string            `json:"tableComment,omitempty"`
	ColumnComments map[string]string `json:"columnComments,omitempty"`
}
