package domain

import "context"

type AssetRepository interface {
	ListDatabases(ctx context.Context) ([]Database, error)
	GetDatabase(ctx context.Context, name string) (*Database, error)
	ListTables(ctx context.Context, databaseName string) ([]Table, error)
	GetTable(ctx context.Context, databaseName, tableName string) (*Table, error)
	ListColumns(ctx context.Context, databaseName, tableName string) ([]Column, error)
	GetColumn(ctx context.Context, databaseName, tableName, columnName string) (*Column, error)
}

type LineageRepository interface {
	GetLineageGraph(ctx context.Context, assetID string, direction string, depth int) (*LineageGraph, error)
	GetUpstreamLineage(ctx context.Context, columnID string, maxDepth int) ([]ColumnLineage, error)
	GetDownstreamLineage(ctx context.Context, columnID string, maxDepth int) ([]ColumnLineage, error)
	GetDirectLineage(ctx context.Context, columnID string) ([]ColumnLineage, error)
}

type SearchRepository interface {
	Search(ctx context.Context, query string, assetTypes []AssetType, limit int) ([]SearchResult, error)
}

type CacheRepository interface {
	Get(ctx context.Context, key string, dest any) error
	Set(ctx context.Context, key string, value any, ttlSeconds int) error
	Delete(ctx context.Context, key string) error
	Exists(ctx context.Context, key string) (bool, error)
}
