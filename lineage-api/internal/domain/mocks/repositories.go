// Package mocks provides mock implementations for testing.
package mocks

import (
	"context"
	"errors"
	"sync"

	"github.com/lineage-api/internal/domain"
)

// ErrNotFound is returned when an item is not found.
var ErrNotFound = errors.New("not found")

// MockAssetRepository is a mock implementation of domain.AssetRepository.
type MockAssetRepository struct {
	mu         sync.RWMutex
	Databases  []domain.Database
	Tables     []domain.Table
	Columns    []domain.Column

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
