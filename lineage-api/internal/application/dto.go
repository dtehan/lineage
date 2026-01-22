// Package application contains the application services and DTOs.
package application

import "github.com/your-org/lineage-api/internal/domain"

// GetLineageRequest represents a request to get lineage data.
type GetLineageRequest struct {
	AssetID   string `json:"assetId"`
	Direction string `json:"direction"` // upstream, downstream, both
	MaxDepth  int    `json:"maxDepth"`
}

// SearchRequest represents a search request.
type SearchRequest struct {
	Query      string   `json:"query"`
	AssetTypes []string `json:"assetTypes,omitempty"`
	Limit      int      `json:"limit,omitempty"`
}

// DatabaseListResponse represents the response for database listing.
type DatabaseListResponse struct {
	Databases []domain.Database `json:"databases"`
	Total     int               `json:"total"`
}

// TableListResponse represents the response for table listing.
type TableListResponse struct {
	Tables []domain.Table `json:"tables"`
	Total  int            `json:"total"`
}

// ColumnListResponse represents the response for column listing.
type ColumnListResponse struct {
	Columns []domain.Column `json:"columns"`
	Total   int             `json:"total"`
}

// LineageGraphResponse represents the response for lineage graph.
type LineageGraphResponse struct {
	AssetID string              `json:"assetId"`
	Graph   domain.LineageGraph `json:"graph"`
}

// ImpactAnalysisResponse represents the response for impact analysis.
type ImpactAnalysisResponse struct {
	AssetID        string          `json:"assetId"`
	ImpactedAssets []ImpactedAsset `json:"impactedAssets"`
	Summary        ImpactSummary   `json:"summary"`
}

// ImpactedAsset represents an asset impacted by a change.
type ImpactedAsset struct {
	ID           string `json:"id"`
	DatabaseName string `json:"databaseName"`
	TableName    string `json:"tableName"`
	ColumnName   string `json:"columnName,omitempty"`
	Depth        int    `json:"depth"`
	ImpactType   string `json:"impactType"` // direct, indirect
}

// ImpactSummary represents a summary of impact analysis.
type ImpactSummary struct {
	TotalImpacted int            `json:"totalImpacted"`
	ByDatabase    map[string]int `json:"byDatabase"`
	ByDepth       map[int]int    `json:"byDepth"`
	CriticalCount int            `json:"criticalCount"`
}

// SearchResponse represents the response for search.
type SearchResponse struct {
	Results []domain.SearchResult `json:"results"`
	Total   int                   `json:"total"`
	Query   string                `json:"query"`
}
