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

// Response DTOs
type DatabaseListResponse struct {
	Databases []domain.Database `json:"databases"`
	Total     int               `json:"total"`
}

type TableListResponse struct {
	Tables []domain.Table `json:"tables"`
	Total  int            `json:"total"`
}

type ColumnListResponse struct {
	Columns []domain.Column `json:"columns"`
	Total   int             `json:"total"`
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
