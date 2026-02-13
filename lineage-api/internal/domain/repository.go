package domain

import "context"

type AssetRepository interface {
	// Existing non-paginated methods
	ListDatabases(ctx context.Context) ([]Database, error)
	GetDatabase(ctx context.Context, name string) (*Database, error)
	ListTables(ctx context.Context, databaseName string) ([]Table, error)
	GetTable(ctx context.Context, databaseName, tableName string) (*Table, error)
	ListColumns(ctx context.Context, databaseName, tableName string) ([]Column, error)
	GetColumn(ctx context.Context, databaseName, tableName, columnName string) (*Column, error)

	// Paginated methods - return items, total count, and error
	ListDatabasesPaginated(ctx context.Context, limit, offset int) ([]Database, int, error)
	ListTablesPaginated(ctx context.Context, databaseName string, limit, offset int) ([]Table, int, error)
	ListColumnsPaginated(ctx context.Context, databaseName, tableName string, limit, offset int) ([]Column, int, error)
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
	TTL(ctx context.Context, key string) (int, error)
}

// OpenLineageRepository defines operations for OpenLineage-aligned data
type OpenLineageRepository interface {
	// Namespace operations
	GetNamespace(ctx context.Context, namespaceID string) (*OpenLineageNamespace, error)
	GetNamespaceByURI(ctx context.Context, uri string) (*OpenLineageNamespace, error)
	ListNamespaces(ctx context.Context) ([]OpenLineageNamespace, error)

	// Dataset operations
	GetDataset(ctx context.Context, datasetID string) (*OpenLineageDataset, error)
	ListDatasets(ctx context.Context, namespaceID string, limit, offset int) ([]OpenLineageDataset, int, error)
	SearchDatasets(ctx context.Context, query string, limit int) ([]OpenLineageDataset, error)

	// Field operations
	GetField(ctx context.Context, fieldID string) (*OpenLineageField, error)
	ListFields(ctx context.Context, datasetID string) ([]OpenLineageField, error)

	// Job operations
	GetJob(ctx context.Context, jobID string) (*OpenLineageJob, error)
	ListJobs(ctx context.Context, namespaceID string, limit, offset int) ([]OpenLineageJob, int, error)

	// Run operations
	GetRun(ctx context.Context, runID string) (*OpenLineageRun, error)
	ListRuns(ctx context.Context, jobID string, limit int) ([]OpenLineageRun, error)

	// Lineage operations (core)
	GetColumnLineage(ctx context.Context, datasetID, fieldName string, direction string, maxDepth int) ([]OpenLineageColumnLineage, error)
	GetColumnLineageGraph(ctx context.Context, datasetID, fieldName string, direction string, maxDepth int) (*OpenLineageGraph, error)

	// Dataset metadata operations
	GetDatasetStatistics(ctx context.Context, datasetID string) (*DatasetStatistics, error)
	GetDatasetDDL(ctx context.Context, datasetID string) (*DatasetDDL, error)
}
