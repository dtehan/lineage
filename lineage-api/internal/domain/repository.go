package domain

import "context"

// AssetRepository defines the interface for asset data access.
type AssetRepository interface {
	// Database operations
	ListDatabases(ctx context.Context) ([]Database, error)
	GetDatabase(ctx context.Context, name string) (*Database, error)

	// Table operations
	ListTables(ctx context.Context, databaseName string) ([]Table, error)
	GetTable(ctx context.Context, databaseName, tableName string) (*Table, error)

	// Column operations
	ListColumns(ctx context.Context, databaseName, tableName string) ([]Column, error)
	GetColumn(ctx context.Context, databaseName, tableName, columnName string) (*Column, error)
}

// LineageRepository defines the interface for lineage data access.
type LineageRepository interface {
	// GetLineageGraph returns the full lineage graph for an asset.
	GetLineageGraph(ctx context.Context, assetID string, depth int) (*LineageGraph, error)

	// GetUpstreamLineage returns upstream lineage (sources).
	GetUpstreamLineage(ctx context.Context, columnID string, maxDepth int) ([]ColumnLineage, error)

	// GetDownstreamLineage returns downstream lineage (targets/impact).
	GetDownstreamLineage(ctx context.Context, columnID string, maxDepth int) ([]ColumnLineage, error)

	// GetDirectLineage returns direct relationships only.
	GetDirectLineage(ctx context.Context, columnID string) ([]ColumnLineage, error)
}

// SearchRepository defines the interface for search data access.
type SearchRepository interface {
	Search(ctx context.Context, query string, assetTypes []AssetType, limit int) ([]SearchResult, error)
}

// CacheRepository defines the interface for cache operations.
type CacheRepository interface {
	Get(ctx context.Context, key string, dest any) error
	Set(ctx context.Context, key string, value any, ttlSeconds int) error
	Delete(ctx context.Context, key string) error
	Exists(ctx context.Context, key string) (bool, error)
}
