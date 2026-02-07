// Package mocks provides mock implementations for testing.
package mocks

import (
	"context"
	"errors"
	"strings"
	"sync"

	"github.com/lineage-api/internal/domain"
)

// ErrNotFound is returned when an item is not found.
var ErrNotFound = errors.New("not found")

// MockAssetRepository is a mock implementation of domain.AssetRepository.
type MockAssetRepository struct {
	mu        sync.RWMutex
	Databases []domain.Database
	Tables    []domain.Table
	Columns   []domain.Column

	// Pagination support - allows setting total count independently of slice length
	DatabaseCount int
	TableCount    int
	ColumnCount   int

	// Error injection
	ListDatabasesErr error
	GetDatabaseErr   error
	ListTablesErr    error
	GetTableErr      error
	ListColumnsErr   error
	GetColumnErr     error
}

// NewMockAssetRepository creates a new MockAssetRepository.
func NewMockAssetRepository() *MockAssetRepository {
	return &MockAssetRepository{
		Databases: []domain.Database{},
		Tables:    []domain.Table{},
		Columns:   []domain.Column{},
	}
}

// ListDatabases returns all databases.
func (m *MockAssetRepository) ListDatabases(ctx context.Context) ([]domain.Database, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if m.ListDatabasesErr != nil {
		return nil, m.ListDatabasesErr
	}
	return m.Databases, nil
}

// GetDatabase returns a database by name.
func (m *MockAssetRepository) GetDatabase(ctx context.Context, name string) (*domain.Database, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if m.GetDatabaseErr != nil {
		return nil, m.GetDatabaseErr
	}

	for i := range m.Databases {
		if m.Databases[i].Name == name {
			return &m.Databases[i], nil
		}
	}
	return nil, ErrNotFound
}

// ListTables returns all tables for a database.
func (m *MockAssetRepository) ListTables(ctx context.Context, databaseName string) ([]domain.Table, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if m.ListTablesErr != nil {
		return nil, m.ListTablesErr
	}

	var result []domain.Table
	for _, t := range m.Tables {
		if t.DatabaseName == databaseName {
			result = append(result, t)
		}
	}
	return result, nil
}

// GetTable returns a table by database and table name.
func (m *MockAssetRepository) GetTable(ctx context.Context, databaseName, tableName string) (*domain.Table, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if m.GetTableErr != nil {
		return nil, m.GetTableErr
	}

	for i := range m.Tables {
		if m.Tables[i].DatabaseName == databaseName && m.Tables[i].TableName == tableName {
			return &m.Tables[i], nil
		}
	}
	return nil, ErrNotFound
}

// ListColumns returns all columns for a table.
func (m *MockAssetRepository) ListColumns(ctx context.Context, databaseName, tableName string) ([]domain.Column, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if m.ListColumnsErr != nil {
		return nil, m.ListColumnsErr
	}

	var result []domain.Column
	for _, c := range m.Columns {
		if c.DatabaseName == databaseName && c.TableName == tableName {
			result = append(result, c)
		}
	}
	return result, nil
}

// GetColumn returns a column by database, table, and column name.
func (m *MockAssetRepository) GetColumn(ctx context.Context, databaseName, tableName, columnName string) (*domain.Column, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if m.GetColumnErr != nil {
		return nil, m.GetColumnErr
	}

	for i := range m.Columns {
		if m.Columns[i].DatabaseName == databaseName &&
			m.Columns[i].TableName == tableName &&
			m.Columns[i].ColumnName == columnName {
			return &m.Columns[i], nil
		}
	}
	return nil, ErrNotFound
}

// ListDatabasesPaginated returns paginated databases.
func (m *MockAssetRepository) ListDatabasesPaginated(ctx context.Context, limit, offset int) ([]domain.Database, int, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if m.ListDatabasesErr != nil {
		return nil, 0, m.ListDatabasesErr
	}

	total := m.DatabaseCount
	if total == 0 {
		total = len(m.Databases)
	}

	// Apply pagination
	start := offset
	if start > len(m.Databases) {
		return []domain.Database{}, total, nil
	}
	end := start + limit
	if end > len(m.Databases) {
		end = len(m.Databases)
	}

	return m.Databases[start:end], total, nil
}

// ListTablesPaginated returns paginated tables for a database.
func (m *MockAssetRepository) ListTablesPaginated(ctx context.Context, databaseName string, limit, offset int) ([]domain.Table, int, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if m.ListTablesErr != nil {
		return nil, 0, m.ListTablesErr
	}

	// Filter by database
	var filtered []domain.Table
	for _, t := range m.Tables {
		if t.DatabaseName == databaseName {
			filtered = append(filtered, t)
		}
	}

	total := m.TableCount
	if total == 0 {
		total = len(filtered)
	}

	// Apply pagination
	start := offset
	if start > len(filtered) {
		return []domain.Table{}, total, nil
	}
	end := start + limit
	if end > len(filtered) {
		end = len(filtered)
	}

	return filtered[start:end], total, nil
}

// ListColumnsPaginated returns paginated columns for a table.
func (m *MockAssetRepository) ListColumnsPaginated(ctx context.Context, databaseName, tableName string, limit, offset int) ([]domain.Column, int, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if m.ListColumnsErr != nil {
		return nil, 0, m.ListColumnsErr
	}

	// Filter by database and table
	var filtered []domain.Column
	for _, c := range m.Columns {
		if c.DatabaseName == databaseName && c.TableName == tableName {
			filtered = append(filtered, c)
		}
	}

	total := m.ColumnCount
	if total == 0 {
		total = len(filtered)
	}

	// Apply pagination
	start := offset
	if start > len(filtered) {
		return []domain.Column{}, total, nil
	}
	end := start + limit
	if end > len(filtered) {
		end = len(filtered)
	}

	return filtered[start:end], total, nil
}

// MockLineageRepository is a mock implementation of domain.LineageRepository.
type MockLineageRepository struct {
	mu              sync.RWMutex
	UpstreamData    map[string][]domain.ColumnLineage
	DownstreamData  map[string][]domain.ColumnLineage
	DirectData      map[string][]domain.ColumnLineage
	GraphData       map[string]*domain.LineageGraph

	// Error injection
	GetLineageGraphErr      error
	GetUpstreamLineageErr   error
	GetDownstreamLineageErr error
	GetDirectLineageErr     error
}

// NewMockLineageRepository creates a new MockLineageRepository.
func NewMockLineageRepository() *MockLineageRepository {
	return &MockLineageRepository{
		UpstreamData:   make(map[string][]domain.ColumnLineage),
		DownstreamData: make(map[string][]domain.ColumnLineage),
		DirectData:     make(map[string][]domain.ColumnLineage),
		GraphData:      make(map[string]*domain.LineageGraph),
	}
}

// GetLineageGraph returns the full lineage graph for an asset.
func (m *MockLineageRepository) GetLineageGraph(ctx context.Context, assetID string, direction string, depth int) (*domain.LineageGraph, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if m.GetLineageGraphErr != nil {
		return nil, m.GetLineageGraphErr
	}

	// If GraphData is set for this asset, use it directly
	if graph, ok := m.GraphData[assetID]; ok {
		return graph, nil
	}

	upstream := m.UpstreamData[assetID]
	downstream := m.DownstreamData[assetID]

	return buildGraphFromLineage(assetID, upstream, downstream), nil
}

// GetUpstreamLineage returns upstream lineage.
func (m *MockLineageRepository) GetUpstreamLineage(ctx context.Context, columnID string, maxDepth int) ([]domain.ColumnLineage, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if m.GetUpstreamLineageErr != nil {
		return nil, m.GetUpstreamLineageErr
	}

	// Filter by depth
	var result []domain.ColumnLineage
	for _, l := range m.UpstreamData[columnID] {
		if l.Depth <= maxDepth {
			result = append(result, l)
		}
	}
	return result, nil
}

// GetDownstreamLineage returns downstream lineage.
func (m *MockLineageRepository) GetDownstreamLineage(ctx context.Context, columnID string, maxDepth int) ([]domain.ColumnLineage, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if m.GetDownstreamLineageErr != nil {
		return nil, m.GetDownstreamLineageErr
	}

	// Filter by depth
	var result []domain.ColumnLineage
	for _, l := range m.DownstreamData[columnID] {
		if l.Depth <= maxDepth {
			result = append(result, l)
		}
	}
	return result, nil
}

// GetDirectLineage returns direct relationships only.
func (m *MockLineageRepository) GetDirectLineage(ctx context.Context, columnID string) ([]domain.ColumnLineage, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if m.GetDirectLineageErr != nil {
		return nil, m.GetDirectLineageErr
	}

	return m.DirectData[columnID], nil
}

// MockSearchRepository is a mock implementation of domain.SearchRepository.
type MockSearchRepository struct {
	mu      sync.RWMutex
	Results []domain.SearchResult

	// Error injection
	SearchErr error
}

// NewMockSearchRepository creates a new MockSearchRepository.
func NewMockSearchRepository() *MockSearchRepository {
	return &MockSearchRepository{
		Results: []domain.SearchResult{},
	}
}

// Search searches for assets.
func (m *MockSearchRepository) Search(ctx context.Context, query string, assetTypes []domain.AssetType, limit int) ([]domain.SearchResult, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if m.SearchErr != nil {
		return nil, m.SearchErr
	}

	// Filter by asset types if specified
	var results []domain.SearchResult
	for _, r := range m.Results {
		if len(assetTypes) == 0 {
			results = append(results, r)
		} else {
			for _, t := range assetTypes {
				if r.Type == t {
					results = append(results, r)
					break
				}
			}
		}
	}

	// Apply limit
	if limit > 0 && len(results) > limit {
		results = results[:limit]
	}

	return results, nil
}

// MockCacheRepository is a mock implementation of domain.CacheRepository.
type MockCacheRepository struct {
	mu    sync.RWMutex
	Data  map[string][]byte

	// Error injection
	GetErr    error
	SetErr    error
	DeleteErr error
	ExistsErr error

	// Tracking
	GetCalls    []string
	SetCalls    []string
	DeleteCalls []string
}

// NewMockCacheRepository creates a new MockCacheRepository.
func NewMockCacheRepository() *MockCacheRepository {
	return &MockCacheRepository{
		Data:        make(map[string][]byte),
		GetCalls:    []string{},
		SetCalls:    []string{},
		DeleteCalls: []string{},
	}
}

// ErrCacheMiss is returned when a key is not found in the cache.
var ErrCacheMiss = errors.New("cache miss")

// Get retrieves a value from the cache.
func (m *MockCacheRepository) Get(ctx context.Context, key string, dest any) error {
	m.mu.Lock()
	m.GetCalls = append(m.GetCalls, key)
	m.mu.Unlock()

	m.mu.RLock()
	defer m.mu.RUnlock()

	if m.GetErr != nil {
		return m.GetErr
	}

	if _, exists := m.Data[key]; !exists {
		return ErrCacheMiss
	}

	// For testing, we just return nil if the key exists
	// In a real implementation, we'd unmarshal the data
	return nil
}

// Set stores a value in the cache.
func (m *MockCacheRepository) Set(ctx context.Context, key string, value any, ttlSeconds int) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.SetCalls = append(m.SetCalls, key)

	if m.SetErr != nil {
		return m.SetErr
	}

	m.Data[key] = []byte("cached")
	return nil
}

// Delete removes a value from the cache.
func (m *MockCacheRepository) Delete(ctx context.Context, key string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.DeleteCalls = append(m.DeleteCalls, key)

	if m.DeleteErr != nil {
		return m.DeleteErr
	}

	delete(m.Data, key)
	return nil
}

// Exists checks if a key exists in the cache.
func (m *MockCacheRepository) Exists(ctx context.Context, key string) (bool, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if m.ExistsErr != nil {
		return false, m.ExistsErr
	}

	_, exists := m.Data[key]
	return exists, nil
}

// MockOpenLineageRepository is a mock implementation of domain.OpenLineageRepository.
type MockOpenLineageRepository struct {
	mu sync.RWMutex

	// Data
	Namespaces []domain.OpenLineageNamespace
	Datasets   []domain.OpenLineageDataset
	Fields     []domain.OpenLineageField
	Jobs       []domain.OpenLineageJob
	Runs       []domain.OpenLineageRun
	Lineages   []domain.OpenLineageColumnLineage
	Statistics map[string]*domain.DatasetStatistics
	DDLData    map[string]*domain.DatasetDDL
	GraphData  map[string]*domain.OpenLineageGraph

	// Error injection
	GetNamespaceErr          error
	GetNamespaceByURIErr     error
	ListNamespacesErr        error
	GetDatasetErr            error
	ListDatasetsErr          error
	SearchDatasetsErr        error
	GetFieldErr              error
	ListFieldsErr            error
	GetJobErr                error
	ListJobsErr              error
	GetRunErr                error
	ListRunsErr              error
	GetColumnLineageErr      error
	GetColumnLineageGraphErr error
	GetDatasetStatisticsErr  error
	GetDatasetDDLErr         error
}

// Compile-time interface check
var _ domain.OpenLineageRepository = (*MockOpenLineageRepository)(nil)

// NewMockOpenLineageRepository creates a new MockOpenLineageRepository.
func NewMockOpenLineageRepository() *MockOpenLineageRepository {
	return &MockOpenLineageRepository{
		Namespaces: []domain.OpenLineageNamespace{},
		Datasets:   []domain.OpenLineageDataset{},
		Fields:     []domain.OpenLineageField{},
		Jobs:       []domain.OpenLineageJob{},
		Runs:       []domain.OpenLineageRun{},
		Lineages:   []domain.OpenLineageColumnLineage{},
		Statistics: make(map[string]*domain.DatasetStatistics),
		DDLData:    make(map[string]*domain.DatasetDDL),
		GraphData:  make(map[string]*domain.OpenLineageGraph),
	}
}

// GetNamespace retrieves a namespace by ID.
func (m *MockOpenLineageRepository) GetNamespace(ctx context.Context, namespaceID string) (*domain.OpenLineageNamespace, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if m.GetNamespaceErr != nil {
		return nil, m.GetNamespaceErr
	}
	for i := range m.Namespaces {
		if m.Namespaces[i].ID == namespaceID {
			return &m.Namespaces[i], nil
		}
	}
	return nil, nil
}

// GetNamespaceByURI retrieves a namespace by URI.
func (m *MockOpenLineageRepository) GetNamespaceByURI(ctx context.Context, uri string) (*domain.OpenLineageNamespace, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if m.GetNamespaceByURIErr != nil {
		return nil, m.GetNamespaceByURIErr
	}
	for i := range m.Namespaces {
		if m.Namespaces[i].URI == uri {
			return &m.Namespaces[i], nil
		}
	}
	return nil, nil
}

// ListNamespaces returns all namespaces.
func (m *MockOpenLineageRepository) ListNamespaces(ctx context.Context) ([]domain.OpenLineageNamespace, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if m.ListNamespacesErr != nil {
		return nil, m.ListNamespacesErr
	}
	return m.Namespaces, nil
}

// GetDataset retrieves a dataset by ID or name.
func (m *MockOpenLineageRepository) GetDataset(ctx context.Context, datasetID string) (*domain.OpenLineageDataset, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if m.GetDatasetErr != nil {
		return nil, m.GetDatasetErr
	}
	for i := range m.Datasets {
		if m.Datasets[i].ID == datasetID || m.Datasets[i].Name == datasetID {
			return &m.Datasets[i], nil
		}
	}
	return nil, nil
}

// ListDatasets returns datasets for a namespace with pagination.
func (m *MockOpenLineageRepository) ListDatasets(ctx context.Context, namespaceID string, limit, offset int) ([]domain.OpenLineageDataset, int, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if m.ListDatasetsErr != nil {
		return nil, 0, m.ListDatasetsErr
	}
	var filtered []domain.OpenLineageDataset
	for _, ds := range m.Datasets {
		if ds.NamespaceID == namespaceID {
			filtered = append(filtered, ds)
		}
	}
	total := len(filtered)
	// Apply pagination
	start := offset
	if start > len(filtered) {
		return []domain.OpenLineageDataset{}, total, nil
	}
	end := start + limit
	if end > len(filtered) {
		end = len(filtered)
	}
	return filtered[start:end], total, nil
}

// SearchDatasets searches datasets by name.
func (m *MockOpenLineageRepository) SearchDatasets(ctx context.Context, query string, limit int) ([]domain.OpenLineageDataset, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if m.SearchDatasetsErr != nil {
		return nil, m.SearchDatasetsErr
	}
	var results []domain.OpenLineageDataset
	for _, ds := range m.Datasets {
		if strings.Contains(strings.ToUpper(ds.Name), strings.ToUpper(query)) {
			results = append(results, ds)
			if limit > 0 && len(results) >= limit {
				break
			}
		}
	}
	return results, nil
}

// GetField retrieves a field by ID.
func (m *MockOpenLineageRepository) GetField(ctx context.Context, fieldID string) (*domain.OpenLineageField, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if m.GetFieldErr != nil {
		return nil, m.GetFieldErr
	}
	for i := range m.Fields {
		if m.Fields[i].ID == fieldID {
			return &m.Fields[i], nil
		}
	}
	return nil, nil
}

// ListFields returns fields for a dataset.
func (m *MockOpenLineageRepository) ListFields(ctx context.Context, datasetID string) ([]domain.OpenLineageField, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if m.ListFieldsErr != nil {
		return nil, m.ListFieldsErr
	}
	var results []domain.OpenLineageField
	for _, f := range m.Fields {
		if f.DatasetID == datasetID {
			results = append(results, f)
		}
	}
	return results, nil
}

// GetJob retrieves a job by ID.
func (m *MockOpenLineageRepository) GetJob(ctx context.Context, jobID string) (*domain.OpenLineageJob, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if m.GetJobErr != nil {
		return nil, m.GetJobErr
	}
	for i := range m.Jobs {
		if m.Jobs[i].ID == jobID {
			return &m.Jobs[i], nil
		}
	}
	return nil, nil
}

// ListJobs returns jobs for a namespace with pagination.
func (m *MockOpenLineageRepository) ListJobs(ctx context.Context, namespaceID string, limit, offset int) ([]domain.OpenLineageJob, int, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if m.ListJobsErr != nil {
		return nil, 0, m.ListJobsErr
	}
	var filtered []domain.OpenLineageJob
	for _, j := range m.Jobs {
		if j.NamespaceID == namespaceID {
			filtered = append(filtered, j)
		}
	}
	total := len(filtered)
	start := offset
	if start > len(filtered) {
		return []domain.OpenLineageJob{}, total, nil
	}
	end := start + limit
	if end > len(filtered) {
		end = len(filtered)
	}
	return filtered[start:end], total, nil
}

// GetRun retrieves a run by ID.
func (m *MockOpenLineageRepository) GetRun(ctx context.Context, runID string) (*domain.OpenLineageRun, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if m.GetRunErr != nil {
		return nil, m.GetRunErr
	}
	for i := range m.Runs {
		if m.Runs[i].ID == runID {
			return &m.Runs[i], nil
		}
	}
	return nil, nil
}

// ListRuns returns runs for a job.
func (m *MockOpenLineageRepository) ListRuns(ctx context.Context, jobID string, limit int) ([]domain.OpenLineageRun, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if m.ListRunsErr != nil {
		return nil, m.ListRunsErr
	}
	var results []domain.OpenLineageRun
	for _, run := range m.Runs {
		if run.JobID == jobID {
			results = append(results, run)
			if limit > 0 && len(results) >= limit {
				break
			}
		}
	}
	return results, nil
}

// GetColumnLineage returns column lineage for a dataset field.
func (m *MockOpenLineageRepository) GetColumnLineage(ctx context.Context, datasetID, fieldName string, direction string, maxDepth int) ([]domain.OpenLineageColumnLineage, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if m.GetColumnLineageErr != nil {
		return nil, m.GetColumnLineageErr
	}
	var results []domain.OpenLineageColumnLineage
	for _, l := range m.Lineages {
		if l.TargetDataset == datasetID && l.TargetField == fieldName {
			results = append(results, l)
		}
		if l.SourceDataset == datasetID && l.SourceField == fieldName {
			results = append(results, l)
		}
	}
	return results, nil
}

// GetColumnLineageGraph returns a graph representation of column lineage.
func (m *MockOpenLineageRepository) GetColumnLineageGraph(ctx context.Context, datasetID, fieldName string, direction string, maxDepth int) (*domain.OpenLineageGraph, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if m.GetColumnLineageGraphErr != nil {
		return nil, m.GetColumnLineageGraphErr
	}
	key := datasetID + "/" + fieldName
	if graph, ok := m.GraphData[key]; ok {
		return graph, nil
	}
	return &domain.OpenLineageGraph{
		Nodes: []domain.OpenLineageNode{},
		Edges: []domain.OpenLineageEdge{},
	}, nil
}

// GetDatasetStatistics returns statistics for a dataset.
func (m *MockOpenLineageRepository) GetDatasetStatistics(ctx context.Context, datasetID string) (*domain.DatasetStatistics, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if m.GetDatasetStatisticsErr != nil {
		return nil, m.GetDatasetStatisticsErr
	}
	if stats, ok := m.Statistics[datasetID]; ok {
		return stats, nil
	}
	return nil, nil
}

// GetDatasetDDL returns DDL information for a dataset.
func (m *MockOpenLineageRepository) GetDatasetDDL(ctx context.Context, datasetID string) (*domain.DatasetDDL, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if m.GetDatasetDDLErr != nil {
		return nil, m.GetDatasetDDLErr
	}
	if ddl, ok := m.DDLData[datasetID]; ok {
		return ddl, nil
	}
	return nil, nil
}

// Helper function to build a graph from lineage data
func buildGraphFromLineage(rootID string, upstream, downstream []domain.ColumnLineage) *domain.LineageGraph {
	nodeMap := make(map[string]domain.LineageNode)
	var edges []domain.LineageEdge

	// Add root node
	nodeMap[rootID] = domain.LineageNode{
		ID:   rootID,
		Type: "column",
	}

	// Process upstream
	for _, l := range upstream {
		if _, exists := nodeMap[l.SourceColumnID]; !exists {
			nodeMap[l.SourceColumnID] = domain.LineageNode{
				ID:           l.SourceColumnID,
				Type:         "column",
				DatabaseName: l.SourceDatabase,
				TableName:    l.SourceTable,
				ColumnName:   l.SourceColumn,
			}
		}
		if _, exists := nodeMap[l.TargetColumnID]; !exists {
			nodeMap[l.TargetColumnID] = domain.LineageNode{
				ID:           l.TargetColumnID,
				Type:         "column",
				DatabaseName: l.TargetDatabase,
				TableName:    l.TargetTable,
				ColumnName:   l.TargetColumn,
			}
		}
		edges = append(edges, domain.LineageEdge{
			ID:                 l.LineageID,
			Source:             l.SourceColumnID,
			Target:             l.TargetColumnID,
			TransformationType: l.TransformationType,
			ConfidenceScore:    l.ConfidenceScore,
		})
	}

	// Process downstream
	for _, l := range downstream {
		if _, exists := nodeMap[l.SourceColumnID]; !exists {
			nodeMap[l.SourceColumnID] = domain.LineageNode{
				ID:           l.SourceColumnID,
				Type:         "column",
				DatabaseName: l.SourceDatabase,
				TableName:    l.SourceTable,
				ColumnName:   l.SourceColumn,
			}
		}
		if _, exists := nodeMap[l.TargetColumnID]; !exists {
			nodeMap[l.TargetColumnID] = domain.LineageNode{
				ID:           l.TargetColumnID,
				Type:         "column",
				DatabaseName: l.TargetDatabase,
				TableName:    l.TargetTable,
				ColumnName:   l.TargetColumn,
			}
		}
		edges = append(edges, domain.LineageEdge{
			ID:                 l.LineageID,
			Source:             l.SourceColumnID,
			Target:             l.TargetColumnID,
			TransformationType: l.TransformationType,
			ConfidenceScore:    l.ConfidenceScore,
		})
	}

	// Convert map to slice
	nodes := make([]domain.LineageNode, 0, len(nodeMap))
	for _, node := range nodeMap {
		nodes = append(nodes, node)
	}

	return &domain.LineageGraph{
		Nodes: nodes,
		Edges: edges,
	}
}
