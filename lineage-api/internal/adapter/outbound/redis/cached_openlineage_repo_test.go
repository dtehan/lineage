package redis

import (
	"context"
	"encoding/json"
	"errors"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/lineage-api/internal/domain"
	"github.com/lineage-api/internal/domain/mocks"
)

// newTestCachedRepo creates a CachedOpenLineageRepository with fresh mocks for testing.
func newTestCachedRepo() (*CachedOpenLineageRepository, *mocks.MockOpenLineageRepository, *mocks.MockCacheRepository) {
	mockInner := mocks.NewMockOpenLineageRepository()
	mockCache := mocks.NewMockCacheRepository()
	ttls := CacheTTLConfig{
		LineageTTL:    300,
		AssetTTL:      300,
		StatisticsTTL: 300,
		DDLTTL:        300,
		SearchTTL:     300,
	}
	repo := NewCachedOpenLineageRepository(mockInner, mockCache, ttls)
	return repo, mockInner, mockCache
}

// testGraph returns a realistic OpenLineageGraph for test cases.
func testGraph() *domain.OpenLineageGraph {
	return &domain.OpenLineageGraph{
		Nodes: []domain.OpenLineageNode{
			{ID: "n1", Type: "field", Namespace: "teradata://host:1025", Dataset: "db.table1", Field: "col_a"},
			{ID: "n2", Type: "field", Namespace: "teradata://host:1025", Dataset: "db.table2", Field: "col_b"},
		},
		Edges: []domain.OpenLineageEdge{
			{
				ID:                    "e1",
				Source:                "n1",
				Target:                "n2",
				TransformationType:    domain.TransformationDirect,
				TransformationSubtype: domain.SubtypeIdentity,
				ConfidenceScore:       0.95,
			},
		},
	}
}

// testDataset returns a realistic OpenLineageDataset for test cases.
func testDataset() *domain.OpenLineageDataset {
	return &domain.OpenLineageDataset{
		ID:          "42",
		NamespaceID: "1",
		Name:        "demo_user.customers",
		SourceType:  "TABLE",
		IsActive:    true,
	}
}

// --- GetColumnLineageGraph tests ---

func TestCachedGetColumnLineageGraph_CacheMiss_PopulatesCache(t *testing.T) {
	repo, mockInner, mockCache := newTestCachedRepo()
	ctx := context.Background()

	graph := testGraph()
	mockInner.GraphData["42/customer_id"] = graph

	result, err := repo.GetColumnLineageGraph(ctx, "42", "customer_id", "both", 5)

	require.NoError(t, err)
	require.NotNil(t, result)
	assert.Len(t, result.Nodes, 2)
	assert.Len(t, result.Edges, 1)
	assert.Equal(t, "n1", result.Nodes[0].ID)

	// Cache was queried (miss) and then populated
	assert.Len(t, mockCache.GetCalls, 1)
	assert.Equal(t, "ol:lineage:graph:42|customer_id|both", mockCache.GetCalls[0])
	assert.Len(t, mockCache.SetCalls, 1)
	assert.Equal(t, "ol:lineage:graph:42|customer_id|both", mockCache.SetCalls[0])
}

func TestCachedGetColumnLineageGraph_CacheHit_SkipsInner(t *testing.T) {
	repo, _, mockCache := newTestCachedRepo()
	ctx := context.Background()

	// Pre-populate the mock cache with JSON-serialized graph data
	graph := testGraph()
	data, err := json.Marshal(graph)
	require.NoError(t, err)
	mockCache.Data["ol:lineage:graph:42|customer_id|upstream"] = data

	// Inner repo has NO data -- proves it is not called
	result, err := repo.GetColumnLineageGraph(ctx, "42", "customer_id", "upstream", 5)

	require.NoError(t, err)
	require.NotNil(t, result)
	assert.Len(t, result.Nodes, 2)
	assert.Len(t, result.Edges, 1)

	// Cache was queried (hit), no set
	assert.Len(t, mockCache.GetCalls, 1)
	assert.Empty(t, mockCache.SetCalls)
}

func TestCachedGetColumnLineageGraph_InnerError_NotCached(t *testing.T) {
	repo, mockInner, mockCache := newTestCachedRepo()
	ctx := context.Background()

	mockInner.GetColumnLineageGraphErr = errors.New("teradata connection lost")

	result, err := repo.GetColumnLineageGraph(ctx, "42", "customer_id", "both", 5)

	assert.Error(t, err)
	assert.Nil(t, result)
	assert.Contains(t, err.Error(), "teradata connection lost")

	// Cache miss occurred, but no set (error not cached)
	assert.Len(t, mockCache.GetCalls, 1)
	assert.Empty(t, mockCache.SetCalls)
}

func TestCachedGetColumnLineageGraph_NilResult_NotCached(t *testing.T) {
	repo, mockInner, mockCache := newTestCachedRepo()
	ctx := context.Background()

	// Set the graph data entry to nil explicitly to make mock return nil
	mockInner.GraphData["42/customer_id"] = nil

	result, err := repo.GetColumnLineageGraph(ctx, "42", "customer_id", "both", 5)

	require.NoError(t, err)
	assert.Nil(t, result)

	// Cache miss occurred, but no set (nil not cached)
	assert.Len(t, mockCache.GetCalls, 1)
	assert.Empty(t, mockCache.SetCalls)
}

func TestCachedGetColumnLineageGraph_EmptyGraph_IsCached(t *testing.T) {
	repo, _, mockCache := newTestCachedRepo()
	ctx := context.Background()

	// MockOpenLineageRepository returns non-nil empty graph by default (no entry in GraphData)
	// This is a valid result (no lineage found) and should be cached
	result, err := repo.GetColumnLineageGraph(ctx, "99", "unknown_col", "both", 5)

	require.NoError(t, err)
	require.NotNil(t, result)
	assert.Empty(t, result.Nodes)
	assert.Empty(t, result.Edges)

	// Cache miss then set -- empty graphs are valid results
	assert.Len(t, mockCache.GetCalls, 1)
	assert.Len(t, mockCache.SetCalls, 1)
}

func TestCachedGetColumnLineageGraph_CacheSetError_Swallowed(t *testing.T) {
	repo, mockInner, mockCache := newTestCachedRepo()
	ctx := context.Background()

	mockInner.GraphData["42/customer_id"] = testGraph()
	mockCache.SetErr = errors.New("redis write timeout")

	result, err := repo.GetColumnLineageGraph(ctx, "42", "customer_id", "both", 5)

	// Result returned successfully despite cache set failure
	require.NoError(t, err)
	require.NotNil(t, result)
	assert.Len(t, result.Nodes, 2)

	// Set was attempted (and failed)
	assert.Len(t, mockCache.SetCalls, 1)
}

func TestCachedGetColumnLineageGraph_CacheGetError_FallsThrough(t *testing.T) {
	repo, mockInner, mockCache := newTestCachedRepo()
	ctx := context.Background()

	mockCache.GetErr = errors.New("redis connection refused")
	mockInner.GraphData["42/customer_id"] = testGraph()

	result, err := repo.GetColumnLineageGraph(ctx, "42", "customer_id", "both", 5)

	// Result returned from inner repo
	require.NoError(t, err)
	require.NotNil(t, result)
	assert.Len(t, result.Nodes, 2)

	// Cache.Get was attempted (returned error), then Set was called
	assert.Len(t, mockCache.GetCalls, 1)
	assert.Len(t, mockCache.SetCalls, 1)
}

func TestCachedGetColumnLineageGraph_DepthNotInKey(t *testing.T) {
	repo, mockInner, mockCache := newTestCachedRepo()
	ctx := context.Background()

	mockInner.GraphData["42/customer_id"] = testGraph()

	// First call with depth=3
	_, err := repo.GetColumnLineageGraph(ctx, "42", "customer_id", "both", 3)
	require.NoError(t, err)

	// Second call with depth=10 -- should hit cache (same key)
	_, err = repo.GetColumnLineageGraph(ctx, "42", "customer_id", "both", 10)
	require.NoError(t, err)

	// Both calls used the same cache key (depth excluded)
	assert.Equal(t, "ol:lineage:graph:42|customer_id|both", mockCache.GetCalls[0])
	assert.Equal(t, "ol:lineage:graph:42|customer_id|both", mockCache.GetCalls[1])

	// First call was a miss+set, second call was a hit (no second set)
	assert.Len(t, mockCache.SetCalls, 1)
}

func TestCachedGetColumnLineageGraph_DirectionInKey(t *testing.T) {
	repo, mockInner, mockCache := newTestCachedRepo()
	ctx := context.Background()

	mockInner.GraphData["42/customer_id"] = testGraph()

	_, err := repo.GetColumnLineageGraph(ctx, "42", "customer_id", "upstream", 5)
	require.NoError(t, err)

	_, err = repo.GetColumnLineageGraph(ctx, "42", "customer_id", "downstream", 5)
	require.NoError(t, err)

	// Different cache keys for different directions
	assert.Equal(t, "ol:lineage:graph:42|customer_id|upstream", mockCache.GetCalls[0])
	assert.Equal(t, "ol:lineage:graph:42|customer_id|downstream", mockCache.GetCalls[1])

	// Both were cache misses (different keys), so 2 sets
	assert.Len(t, mockCache.SetCalls, 2)
}

// --- GetDataset tests ---

func TestCachedGetDataset_CacheMiss_PopulatesCache(t *testing.T) {
	repo, mockInner, mockCache := newTestCachedRepo()
	ctx := context.Background()

	ds := testDataset()
	mockInner.Datasets = []domain.OpenLineageDataset{*ds}

	result, err := repo.GetDataset(ctx, "42")

	require.NoError(t, err)
	require.NotNil(t, result)
	assert.Equal(t, "42", result.ID)
	assert.Equal(t, "demo_user.customers", result.Name)

	// Cache miss then set
	assert.Len(t, mockCache.GetCalls, 1)
	assert.Equal(t, "ol:dataset:get:42", mockCache.GetCalls[0])
	assert.Len(t, mockCache.SetCalls, 1)
	assert.Equal(t, "ol:dataset:get:42", mockCache.SetCalls[0])
}

func TestCachedGetDataset_CacheHit_SkipsInner(t *testing.T) {
	repo, _, mockCache := newTestCachedRepo()
	ctx := context.Background()

	// Pre-populate cache
	ds := testDataset()
	data, err := json.Marshal(ds)
	require.NoError(t, err)
	mockCache.Data["ol:dataset:get:42"] = data

	result, err := repo.GetDataset(ctx, "42")

	require.NoError(t, err)
	require.NotNil(t, result)
	assert.Equal(t, "42", result.ID)
	assert.Equal(t, "demo_user.customers", result.Name)

	// Hit, no set
	assert.Len(t, mockCache.GetCalls, 1)
	assert.Empty(t, mockCache.SetCalls)
}

func TestCachedGetDataset_NilResult_NotCached(t *testing.T) {
	repo, _, mockCache := newTestCachedRepo()
	ctx := context.Background()

	// No datasets in mock -- GetDataset returns nil
	result, err := repo.GetDataset(ctx, "nonexistent")

	require.NoError(t, err)
	assert.Nil(t, result)

	// Miss then no set (nil not cached)
	assert.Len(t, mockCache.GetCalls, 1)
	assert.Empty(t, mockCache.SetCalls)
}

// --- ListNamespaces tests ---

func TestCachedListNamespaces_CacheMiss_PopulatesCache(t *testing.T) {
	repo, mockInner, mockCache := newTestCachedRepo()
	ctx := context.Background()

	mockInner.Namespaces = []domain.OpenLineageNamespace{
		{ID: "1", URI: "teradata://host:1025"},
		{ID: "2", URI: "teradata://other:1025"},
	}

	result, err := repo.ListNamespaces(ctx)

	require.NoError(t, err)
	assert.Len(t, result, 2)
	assert.Equal(t, "teradata://host:1025", result[0].URI)

	// Cache miss then set
	assert.Len(t, mockCache.GetCalls, 1)
	assert.Equal(t, "ol:namespace:list", mockCache.GetCalls[0])
	assert.Len(t, mockCache.SetCalls, 1)
	assert.Equal(t, "ol:namespace:list", mockCache.SetCalls[0])
}

func TestCachedListNamespaces_CacheHit_SkipsInner(t *testing.T) {
	repo, _, mockCache := newTestCachedRepo()
	ctx := context.Background()

	// Pre-populate cache
	namespaces := []domain.OpenLineageNamespace{
		{ID: "1", URI: "teradata://host:1025"},
	}
	data, err := json.Marshal(namespaces)
	require.NoError(t, err)
	mockCache.Data["ol:namespace:list"] = data

	result, err := repo.ListNamespaces(ctx)

	require.NoError(t, err)
	assert.Len(t, result, 1)
	assert.Equal(t, "teradata://host:1025", result[0].URI)

	// Hit, no set
	assert.Len(t, mockCache.GetCalls, 1)
	assert.Empty(t, mockCache.SetCalls)
}

// --- GetNamespace tests ---

func TestCachedGetNamespace_CacheMiss_PopulatesCache(t *testing.T) {
	repo, mockInner, mockCache := newTestCachedRepo()
	ctx := context.Background()

	mockInner.Namespaces = []domain.OpenLineageNamespace{
		{ID: "1", URI: "teradata://host:1025"},
	}

	result, err := repo.GetNamespace(ctx, "1")

	require.NoError(t, err)
	require.NotNil(t, result)
	assert.Equal(t, "1", result.ID)
	assert.Equal(t, "teradata://host:1025", result.URI)

	// Cache miss then set
	assert.Len(t, mockCache.GetCalls, 1)
	assert.Equal(t, "ol:namespace:get:1", mockCache.GetCalls[0])
	assert.Len(t, mockCache.SetCalls, 1)
	assert.Equal(t, "ol:namespace:get:1", mockCache.SetCalls[0])
}

func TestCachedGetNamespace_CacheHit_SkipsInner(t *testing.T) {
	repo, _, mockCache := newTestCachedRepo()
	ctx := context.Background()

	ns := domain.OpenLineageNamespace{ID: "1", URI: "teradata://host:1025"}
	data, err := json.Marshal(ns)
	require.NoError(t, err)
	mockCache.Data["ol:namespace:get:1"] = data

	result, err := repo.GetNamespace(ctx, "1")

	require.NoError(t, err)
	require.NotNil(t, result)
	assert.Equal(t, "1", result.ID)

	// Hit, no set
	assert.Len(t, mockCache.GetCalls, 1)
	assert.Empty(t, mockCache.SetCalls)
}

// --- ListDatasets tests ---

func TestCachedListDatasets_CacheMiss_PopulatesCache(t *testing.T) {
	repo, mockInner, mockCache := newTestCachedRepo()
	ctx := context.Background()

	mockInner.Datasets = []domain.OpenLineageDataset{
		{ID: "10", NamespaceID: "1", Name: "db.table1"},
		{ID: "11", NamespaceID: "1", Name: "db.table2"},
	}

	datasets, total, err := repo.ListDatasets(ctx, "1", 10, 0)

	require.NoError(t, err)
	assert.Len(t, datasets, 2)
	assert.Equal(t, 2, total)

	// Cache miss then set with wrapper key
	assert.Len(t, mockCache.GetCalls, 1)
	assert.Equal(t, "ol:dataset:list:1|10|0", mockCache.GetCalls[0])
	assert.Len(t, mockCache.SetCalls, 1)
	assert.Equal(t, "ol:dataset:list:1|10|0", mockCache.SetCalls[0])
}

func TestCachedListDatasets_CacheHit_SkipsInner(t *testing.T) {
	repo, _, mockCache := newTestCachedRepo()
	ctx := context.Background()

	// Pre-populate cache with wrapper struct
	wrapper := listDatasetsResult{
		Datasets: []domain.OpenLineageDataset{
			{ID: "10", NamespaceID: "1", Name: "db.table1"},
		},
		Total: 5,
	}
	data, err := json.Marshal(wrapper)
	require.NoError(t, err)
	mockCache.Data["ol:dataset:list:1|10|0"] = data

	datasets, total, err := repo.ListDatasets(ctx, "1", 10, 0)

	require.NoError(t, err)
	assert.Len(t, datasets, 1)
	assert.Equal(t, 5, total) // Total preserved through cache

	// Hit, no set
	assert.Len(t, mockCache.GetCalls, 1)
	assert.Empty(t, mockCache.SetCalls)
}

// --- SearchDatasets tests ---

func TestCachedSearchDatasets_CacheMiss_PopulatesCache(t *testing.T) {
	repo, mockInner, mockCache := newTestCachedRepo()
	ctx := context.Background()

	mockInner.Datasets = []domain.OpenLineageDataset{
		{ID: "10", NamespaceID: "1", Name: "db.table1"},
	}

	results, err := repo.SearchDatasets(ctx, "table1", 10)

	require.NoError(t, err)
	assert.Len(t, results, 1)

	// Key is normalized to uppercase
	assert.Len(t, mockCache.GetCalls, 1)
	assert.Equal(t, "ol:dataset:search:TABLE1|10", mockCache.GetCalls[0])
	assert.Len(t, mockCache.SetCalls, 1)
	assert.Equal(t, "ol:dataset:search:TABLE1|10", mockCache.SetCalls[0])
}

func TestCachedSearchDatasets_CaseNormalization(t *testing.T) {
	repo, mockInner, mockCache := newTestCachedRepo()
	ctx := context.Background()

	mockInner.Datasets = []domain.OpenLineageDataset{
		{ID: "10", NamespaceID: "1", Name: "db.table1"},
	}

	// First call with lowercase
	_, err := repo.SearchDatasets(ctx, "table1", 10)
	require.NoError(t, err)

	// Second call with uppercase -- should hit cache (same normalized key)
	_, err = repo.SearchDatasets(ctx, "TABLE1", 10)
	require.NoError(t, err)

	// Both queries normalized to uppercase in the key
	assert.Equal(t, "ol:dataset:search:TABLE1|10", mockCache.GetCalls[0])
	assert.Equal(t, "ol:dataset:search:TABLE1|10", mockCache.GetCalls[1])

	// First was miss+set, second was hit (no second set)
	assert.Len(t, mockCache.SetCalls, 1)
}

// --- ListFields tests ---

func TestCachedListFields_CacheMiss_PopulatesCache(t *testing.T) {
	repo, mockInner, mockCache := newTestCachedRepo()
	ctx := context.Background()

	mockInner.Fields = []domain.OpenLineageField{
		{ID: "f1", DatasetID: "42", Name: "customer_id", Type: "INTEGER"},
		{ID: "f2", DatasetID: "42", Name: "name", Type: "VARCHAR"},
	}

	result, err := repo.ListFields(ctx, "42")

	require.NoError(t, err)
	assert.Len(t, result, 2)
	assert.Equal(t, "customer_id", result[0].Name)

	// Cache miss then set
	assert.Len(t, mockCache.GetCalls, 1)
	assert.Equal(t, "ol:field:list:42", mockCache.GetCalls[0])
	assert.Len(t, mockCache.SetCalls, 1)
	assert.Equal(t, "ol:field:list:42", mockCache.SetCalls[0])
}

func TestCachedListFields_CacheHit_SkipsInner(t *testing.T) {
	repo, _, mockCache := newTestCachedRepo()
	ctx := context.Background()

	fields := []domain.OpenLineageField{
		{ID: "f1", DatasetID: "42", Name: "customer_id", Type: "INTEGER"},
	}
	data, err := json.Marshal(fields)
	require.NoError(t, err)
	mockCache.Data["ol:field:list:42"] = data

	result, err := repo.ListFields(ctx, "42")

	require.NoError(t, err)
	assert.Len(t, result, 1)
	assert.Equal(t, "customer_id", result[0].Name)

	// Hit, no set
	assert.Len(t, mockCache.GetCalls, 1)
	assert.Empty(t, mockCache.SetCalls)
}

// --- GetDatasetStatistics tests ---

func TestCachedGetDatasetStatistics_CacheMiss_PopulatesCache(t *testing.T) {
	repo, mockInner, mockCache := newTestCachedRepo()
	ctx := context.Background()

	rowCount := int64(1000)
	mockInner.Statistics["42"] = &domain.DatasetStatistics{
		DatasetID:    "42",
		DatabaseName: "demo_user",
		TableName:    "customers",
		SourceType:   "TABLE",
		RowCount:     &rowCount,
	}

	result, err := repo.GetDatasetStatistics(ctx, "42")

	require.NoError(t, err)
	require.NotNil(t, result)
	assert.Equal(t, "42", result.DatasetID)
	assert.Equal(t, int64(1000), *result.RowCount)

	// Cache miss then set
	assert.Len(t, mockCache.GetCalls, 1)
	assert.Equal(t, "ol:dataset:statistics:42", mockCache.GetCalls[0])
	assert.Len(t, mockCache.SetCalls, 1)
	assert.Equal(t, "ol:dataset:statistics:42", mockCache.SetCalls[0])
}

func TestCachedGetDatasetStatistics_NilResult_NotCached(t *testing.T) {
	repo, _, mockCache := newTestCachedRepo()
	ctx := context.Background()

	// No statistics in mock -- GetDatasetStatistics returns nil
	result, err := repo.GetDatasetStatistics(ctx, "nonexistent")

	require.NoError(t, err)
	assert.Nil(t, result)

	// Miss then no set (nil not cached)
	assert.Len(t, mockCache.GetCalls, 1)
	assert.Empty(t, mockCache.SetCalls)
}

func TestCachedGetDatasetStatistics_CacheHit_SkipsInner(t *testing.T) {
	repo, _, mockCache := newTestCachedRepo()
	ctx := context.Background()

	rowCount := int64(500)
	stats := domain.DatasetStatistics{
		DatasetID:    "42",
		DatabaseName: "demo_user",
		TableName:    "customers",
		SourceType:   "TABLE",
		RowCount:     &rowCount,
	}
	data, err := json.Marshal(stats)
	require.NoError(t, err)
	mockCache.Data["ol:dataset:statistics:42"] = data

	result, err := repo.GetDatasetStatistics(ctx, "42")

	require.NoError(t, err)
	require.NotNil(t, result)
	assert.Equal(t, int64(500), *result.RowCount)

	// Hit, no set
	assert.Len(t, mockCache.GetCalls, 1)
	assert.Empty(t, mockCache.SetCalls)
}

// --- GetDatasetDDL tests ---

func TestCachedGetDatasetDDL_CacheMiss_PopulatesCache(t *testing.T) {
	repo, mockInner, mockCache := newTestCachedRepo()
	ctx := context.Background()

	mockInner.DDLData["42"] = &domain.DatasetDDL{
		DatasetID:    "42",
		DatabaseName: "demo_user",
		TableName:    "customers",
		SourceType:   "TABLE",
		TableDDL:     "CREATE TABLE customers (id INTEGER, name VARCHAR(100))",
	}

	result, err := repo.GetDatasetDDL(ctx, "42")

	require.NoError(t, err)
	require.NotNil(t, result)
	assert.Equal(t, "42", result.DatasetID)
	assert.Contains(t, result.TableDDL, "CREATE TABLE")

	// Cache miss then set
	assert.Len(t, mockCache.GetCalls, 1)
	assert.Equal(t, "ol:dataset:ddl:42", mockCache.GetCalls[0])
	assert.Len(t, mockCache.SetCalls, 1)
	assert.Equal(t, "ol:dataset:ddl:42", mockCache.SetCalls[0])
}

func TestCachedGetDatasetDDL_CacheHit_SkipsInner(t *testing.T) {
	repo, _, mockCache := newTestCachedRepo()
	ctx := context.Background()

	ddl := domain.DatasetDDL{
		DatasetID:    "42",
		DatabaseName: "demo_user",
		TableName:    "customers",
		SourceType:   "TABLE",
		TableDDL:     "CREATE TABLE customers (id INTEGER)",
	}
	data, err := json.Marshal(ddl)
	require.NoError(t, err)
	mockCache.Data["ol:dataset:ddl:42"] = data

	result, err := repo.GetDatasetDDL(ctx, "42")

	require.NoError(t, err)
	require.NotNil(t, result)
	assert.Contains(t, result.TableDDL, "CREATE TABLE")

	// Hit, no set
	assert.Len(t, mockCache.GetCalls, 1)
	assert.Empty(t, mockCache.SetCalls)
}

func TestCachedGetDatasetDDL_NilResult_NotCached(t *testing.T) {
	repo, _, mockCache := newTestCachedRepo()
	ctx := context.Background()

	// No DDL data in mock -- returns nil
	result, err := repo.GetDatasetDDL(ctx, "nonexistent")

	require.NoError(t, err)
	assert.Nil(t, result)

	// Miss then no set (nil not cached)
	assert.Len(t, mockCache.GetCalls, 1)
	assert.Empty(t, mockCache.SetCalls)
}

// --- Delegation tests ---

func TestCachedRepo_UncachedMethods_DelegateToInner(t *testing.T) {
	repo, mockInner, mockCache := newTestCachedRepo()
	ctx := context.Background()

	// Populate inner with test data for uncached methods
	mockInner.Namespaces = []domain.OpenLineageNamespace{
		{ID: "1", URI: "teradata://host:1025"},
	}
	mockInner.Fields = []domain.OpenLineageField{
		{ID: "f1", DatasetID: "42", Name: "customer_id"},
	}
	mockInner.Jobs = []domain.OpenLineageJob{
		{ID: "j1", NamespaceID: "1", Name: "etl_job"},
	}
	mockInner.Runs = []domain.OpenLineageRun{
		{ID: "r1", JobID: "j1"},
	}

	// GetNamespaceByURI -- uncached (not an endpoint method)
	ns, err := repo.GetNamespaceByURI(ctx, "teradata://host:1025")
	require.NoError(t, err)
	require.NotNil(t, ns)
	assert.Equal(t, "1", ns.ID)

	// GetField -- uncached (not an endpoint method)
	field, err := repo.GetField(ctx, "f1")
	require.NoError(t, err)
	require.NotNil(t, field)
	assert.Equal(t, "customer_id", field.Name)

	// GetJob -- uncached
	job, err := repo.GetJob(ctx, "j1")
	require.NoError(t, err)
	require.NotNil(t, job)
	assert.Equal(t, "etl_job", job.Name)

	// ListJobs -- uncached
	jobs, total, err := repo.ListJobs(ctx, "1", 10, 0)
	require.NoError(t, err)
	assert.Len(t, jobs, 1)
	assert.Equal(t, 1, total)

	// GetRun -- uncached
	run, err := repo.GetRun(ctx, "r1")
	require.NoError(t, err)
	require.NotNil(t, run)
	assert.Equal(t, "j1", run.JobID)

	// ListRuns -- uncached
	runs, err := repo.ListRuns(ctx, "j1", 10)
	require.NoError(t, err)
	assert.Len(t, runs, 1)

	// No cache interactions for uncached methods
	assert.Empty(t, mockCache.GetCalls)
	assert.Empty(t, mockCache.SetCalls)
}

// --- JSON round-trip tests ---

func TestCachedGetColumnLineageGraph_JSONRoundTrip(t *testing.T) {
	repo, mockInner, mockCache := newTestCachedRepo()
	ctx := context.Background()

	// Create graph with realistic data including metadata map and enum types
	original := &domain.OpenLineageGraph{
		Nodes: []domain.OpenLineageNode{
			{
				ID:        "n1",
				Type:      "field",
				Namespace: "teradata://host:1025",
				Dataset:   "demo_user.src_customers",
				Field:     "customer_id",
				Metadata: map[string]any{
					"fieldType":       "INTEGER",
					"ordinalPosition": float64(1), // JSON numbers are float64
					"nullable":        false,
				},
			},
			{
				ID:        "n2",
				Type:      "field",
				Namespace: "teradata://host:1025",
				Dataset:   "demo_user.stg_customers",
				Field:     "cust_id",
				Metadata: map[string]any{
					"fieldType":       "INTEGER",
					"ordinalPosition": float64(1),
					"nullable":        true,
				},
			},
		},
		Edges: []domain.OpenLineageEdge{
			{
				ID:                    "e1",
				Source:                "n1",
				Target:                "n2",
				TransformationType:    domain.TransformationDirect,
				TransformationSubtype: domain.SubtypeIdentity,
				ConfidenceScore:       0.95,
			},
			{
				ID:                    "e2",
				Source:                "n1",
				Target:                "n2",
				TransformationType:    domain.TransformationIndirect,
				TransformationSubtype: domain.SubtypeAggregation,
				ConfidenceScore:       0.80,
			},
		},
	}
	mockInner.GraphData["42/customer_id"] = original

	// First call: cache miss -> inner -> set
	result1, err := repo.GetColumnLineageGraph(ctx, "42", "customer_id", "both", 5)
	require.NoError(t, err)
	require.NotNil(t, result1)

	// Second call: cache hit -> get (data was serialized+deserialized)
	result2, err := repo.GetColumnLineageGraph(ctx, "42", "customer_id", "both", 5)
	require.NoError(t, err)
	require.NotNil(t, result2)

	// Round-tripped data must match original
	assert.Equal(t, len(original.Nodes), len(result2.Nodes))
	assert.Equal(t, len(original.Edges), len(result2.Edges))

	// Verify node metadata survived round-trip
	assert.Equal(t, original.Nodes[0].Metadata["fieldType"], result2.Nodes[0].Metadata["fieldType"])
	assert.Equal(t, original.Nodes[0].Metadata["ordinalPosition"], result2.Nodes[0].Metadata["ordinalPosition"])
	assert.Equal(t, original.Nodes[0].Metadata["nullable"], result2.Nodes[0].Metadata["nullable"])

	// Verify edge transformation types survived round-trip
	assert.Equal(t, domain.TransformationDirect, result2.Edges[0].TransformationType)
	assert.Equal(t, domain.SubtypeIdentity, result2.Edges[0].TransformationSubtype)
	assert.Equal(t, 0.95, result2.Edges[0].ConfidenceScore)

	assert.Equal(t, domain.TransformationIndirect, result2.Edges[1].TransformationType)
	assert.Equal(t, domain.SubtypeAggregation, result2.Edges[1].TransformationSubtype)

	// Verify the second call was a cache hit (only 1 set call total)
	assert.Len(t, mockCache.SetCalls, 1)
	assert.Len(t, mockCache.GetCalls, 2) // 1 miss + 1 hit
}

func TestCachedGetDataset_JSONRoundTrip(t *testing.T) {
	repo, mockInner, mockCache := newTestCachedRepo()
	ctx := context.Background()

	original := testDataset()
	mockInner.Datasets = []domain.OpenLineageDataset{*original}

	// First call: miss -> inner -> set
	result1, err := repo.GetDataset(ctx, "42")
	require.NoError(t, err)
	require.NotNil(t, result1)

	// Second call: hit -> get (JSON round-trip)
	result2, err := repo.GetDataset(ctx, "42")
	require.NoError(t, err)
	require.NotNil(t, result2)

	assert.Equal(t, original.ID, result2.ID)
	assert.Equal(t, original.Name, result2.Name)
	assert.Equal(t, original.SourceType, result2.SourceType)
	assert.Equal(t, original.IsActive, result2.IsActive)

	assert.Len(t, mockCache.SetCalls, 1)
	assert.Len(t, mockCache.GetCalls, 2)
}

// --- Cache metadata and bypass tests ---

func TestCachedGetColumnLineageGraph_BypassSkipsCacheRead(t *testing.T) {
	repo, mockInner, mockCache := newTestCachedRepo()

	// Pre-populate cache -- would be a hit under normal conditions
	graph := testGraph()
	data, err := json.Marshal(graph)
	require.NoError(t, err)
	mockCache.Data["ol:lineage:graph:42|customer_id|both"] = data
	mockInner.GraphData["42/customer_id"] = graph

	// Request with bypass
	ctx := NewCacheMetadataContext(context.Background())
	ctx = WithCacheBypass(ctx)

	result, err := repo.GetColumnLineageGraph(ctx, "42", "customer_id", "both", 5)

	require.NoError(t, err)
	require.NotNil(t, result)

	// Cache.Get was NOT called (bypass skipped it)
	assert.Empty(t, mockCache.GetCalls)
	// Cache.Set WAS called (fresh data stored)
	assert.Len(t, mockCache.SetCalls, 1)

	// Metadata reflects miss
	md := GetCacheMetadata(ctx)
	require.NotNil(t, md)
	assert.False(t, md.Hit)
	assert.True(t, md.Touched)
	assert.Equal(t, 300, md.TTL) // LineageTTL from test config
}

func TestCachedGetColumnLineageGraph_CacheHitSetsMetadata(t *testing.T) {
	repo, _, mockCache := newTestCachedRepo()

	graph := testGraph()
	data, err := json.Marshal(graph)
	require.NoError(t, err)
	mockCache.Data["ol:lineage:graph:42|customer_id|upstream"] = data
	mockCache.TTLValue = 850

	ctx := NewCacheMetadataContext(context.Background())

	result, err := repo.GetColumnLineageGraph(ctx, "42", "customer_id", "upstream", 5)

	require.NoError(t, err)
	require.NotNil(t, result)

	md := GetCacheMetadata(ctx)
	require.NotNil(t, md)
	assert.True(t, md.Hit)
	assert.True(t, md.Touched)
	assert.Equal(t, 850, md.TTL)
}

func TestCachedGetColumnLineageGraph_CacheMissSetsMetadata(t *testing.T) {
	repo, mockInner, _ := newTestCachedRepo()

	mockInner.GraphData["42/customer_id"] = testGraph()

	ctx := NewCacheMetadataContext(context.Background())

	result, err := repo.GetColumnLineageGraph(ctx, "42", "customer_id", "both", 5)

	require.NoError(t, err)
	require.NotNil(t, result)

	md := GetCacheMetadata(ctx)
	require.NotNil(t, md)
	assert.False(t, md.Hit)
	assert.True(t, md.Touched)
	assert.Equal(t, 300, md.TTL) // LineageTTL from test config
}

func TestCachedGetColumnLineageGraph_NilMetadataDoesNotPanic(t *testing.T) {
	repo, mockInner, _ := newTestCachedRepo()
	mockInner.GraphData["42/customer_id"] = testGraph()

	// Plain context with no metadata -- should not panic
	ctx := context.Background()

	result, err := repo.GetColumnLineageGraph(ctx, "42", "customer_id", "both", 5)
	require.NoError(t, err)
	require.NotNil(t, result)
}

func TestCachedGetDataset_BypassSkipsCacheRead(t *testing.T) {
	repo, mockInner, mockCache := newTestCachedRepo()

	ds := testDataset()
	data, err := json.Marshal(ds)
	require.NoError(t, err)
	mockCache.Data["ol:dataset:get:42"] = data
	mockInner.Datasets = []domain.OpenLineageDataset{*ds}

	ctx := NewCacheMetadataContext(context.Background())
	ctx = WithCacheBypass(ctx)

	result, err := repo.GetDataset(ctx, "42")
	require.NoError(t, err)
	require.NotNil(t, result)

	assert.Empty(t, mockCache.GetCalls)
	assert.Len(t, mockCache.SetCalls, 1)

	md := GetCacheMetadata(ctx)
	require.NotNil(t, md)
	assert.False(t, md.Hit)
	assert.True(t, md.Touched)
	assert.Equal(t, 300, md.TTL) // AssetTTL
}

func TestCachedListNamespaces_BypassAndMetadata(t *testing.T) {
	repo, mockInner, mockCache := newTestCachedRepo()

	mockInner.Namespaces = []domain.OpenLineageNamespace{
		{ID: "1", URI: "teradata://host:1025"},
	}

	// Pre-populate cache
	data, err := json.Marshal(mockInner.Namespaces)
	require.NoError(t, err)
	mockCache.Data["ol:namespace:list"] = data

	ctx := NewCacheMetadataContext(context.Background())
	ctx = WithCacheBypass(ctx)

	result, err := repo.ListNamespaces(ctx)
	require.NoError(t, err)
	assert.Len(t, result, 1)

	// Bypass: no Get calls, one Set call
	assert.Empty(t, mockCache.GetCalls)
	assert.Len(t, mockCache.SetCalls, 1)

	md := GetCacheMetadata(ctx)
	require.NotNil(t, md)
	assert.False(t, md.Hit)
	assert.True(t, md.Touched)
}

func TestCachedSearchDatasets_CacheHitSetsMetadata(t *testing.T) {
	repo, _, mockCache := newTestCachedRepo()

	datasets := []domain.OpenLineageDataset{
		{ID: "10", NamespaceID: "1", Name: "db.table1"},
	}
	data, err := json.Marshal(datasets)
	require.NoError(t, err)
	mockCache.Data["ol:dataset:search:TABLE1|10"] = data
	mockCache.TTLValue = 200

	ctx := NewCacheMetadataContext(context.Background())

	result, err := repo.SearchDatasets(ctx, "table1", 10)
	require.NoError(t, err)
	assert.Len(t, result, 1)

	md := GetCacheMetadata(ctx)
	require.NotNil(t, md)
	assert.True(t, md.Hit)
	assert.True(t, md.Touched)
	assert.Equal(t, 200, md.TTL)
}

func TestCachedGetDatasetDDL_BypassPopulatesCache(t *testing.T) {
	repo, mockInner, mockCache := newTestCachedRepo()

	mockInner.DDLData["42"] = &domain.DatasetDDL{
		DatasetID: "42", DatabaseName: "demo_user", TableName: "customers",
		SourceType: "TABLE", TableDDL: "CREATE TABLE customers (id INTEGER)",
	}

	// Pre-populate cache to prove bypass skips it
	data, err := json.Marshal(mockInner.DDLData["42"])
	require.NoError(t, err)
	mockCache.Data["ol:dataset:ddl:42"] = data

	ctx := NewCacheMetadataContext(context.Background())
	ctx = WithCacheBypass(ctx)

	result, err := repo.GetDatasetDDL(ctx, "42")
	require.NoError(t, err)
	require.NotNil(t, result)

	assert.Empty(t, mockCache.GetCalls)
	assert.Len(t, mockCache.SetCalls, 1)

	md := GetCacheMetadata(ctx)
	require.NotNil(t, md)
	assert.False(t, md.Hit)
	assert.True(t, md.Touched)
	assert.Equal(t, 300, md.TTL) // DDLTTL
}

// --- Graceful degradation integration test ---

// TestCachedRepoWithNoOpCache_AllMethodsReturnData proves the complete graceful
// degradation path: when the application starts without Redis, NoOpCache always
// returns cache miss, and every cached method falls through to the inner repository
// and returns correct data. This is the core guarantee of Phase 30.
func TestCachedRepoWithNoOpCache_AllMethodsReturnData(t *testing.T) {
	mockInner := mocks.NewMockOpenLineageRepository()
	noopCache := NewNoOpCache()
	ttls := CacheTTLConfig{LineageTTL: 300, AssetTTL: 300, StatisticsTTL: 300, DDLTTL: 300, SearchTTL: 300}

	repo := NewCachedOpenLineageRepository(mockInner, noopCache, ttls)
	ctx := context.Background()

	// Seed inner repo with representative data for all cached methods
	mockInner.Namespaces = []domain.OpenLineageNamespace{
		{ID: "1", URI: "teradata://host:1025"},
	}
	mockInner.Datasets = []domain.OpenLineageDataset{
		{ID: "42", NamespaceID: "1", Name: "demo_user.customers", SourceType: "TABLE", IsActive: true},
	}
	mockInner.Fields = []domain.OpenLineageField{
		{ID: "f1", DatasetID: "42", Name: "customer_id", Type: "INTEGER"},
	}
	mockInner.GraphData["42/customer_id"] = testGraph()
	rowCount := int64(1000)
	mockInner.Statistics["42"] = &domain.DatasetStatistics{
		DatasetID: "42", DatabaseName: "demo_user", TableName: "customers",
		SourceType: "TABLE", RowCount: &rowCount,
	}
	mockInner.DDLData["42"] = &domain.DatasetDDL{
		DatasetID: "42", DatabaseName: "demo_user", TableName: "customers",
		SourceType: "TABLE", TableDDL: "CREATE TABLE customers (id INTEGER)",
	}

	// 1. ListNamespaces
	t.Run("ListNamespaces", func(t *testing.T) {
		result, err := repo.ListNamespaces(ctx)
		require.NoError(t, err)
		assert.Len(t, result, 1)
		assert.Equal(t, "teradata://host:1025", result[0].URI)
	})

	// 2. GetNamespace
	t.Run("GetNamespace", func(t *testing.T) {
		result, err := repo.GetNamespace(ctx, "1")
		require.NoError(t, err)
		require.NotNil(t, result)
		assert.Equal(t, "1", result.ID)
	})

	// 3. ListDatasets
	t.Run("ListDatasets", func(t *testing.T) {
		datasets, total, err := repo.ListDatasets(ctx, "1", 10, 0)
		require.NoError(t, err)
		assert.Len(t, datasets, 1)
		assert.Equal(t, 1, total)
	})

	// 4. GetDataset
	t.Run("GetDataset", func(t *testing.T) {
		result, err := repo.GetDataset(ctx, "42")
		require.NoError(t, err)
		require.NotNil(t, result)
		assert.Equal(t, "demo_user.customers", result.Name)
	})

	// 5. SearchDatasets
	t.Run("SearchDatasets", func(t *testing.T) {
		results, err := repo.SearchDatasets(ctx, "customers", 10)
		require.NoError(t, err)
		assert.Len(t, results, 1)
	})

	// 6. ListFields
	t.Run("ListFields", func(t *testing.T) {
		result, err := repo.ListFields(ctx, "42")
		require.NoError(t, err)
		assert.Len(t, result, 1)
		assert.Equal(t, "customer_id", result[0].Name)
	})

	// 7. GetColumnLineageGraph
	t.Run("GetColumnLineageGraph", func(t *testing.T) {
		result, err := repo.GetColumnLineageGraph(ctx, "42", "customer_id", "both", 5)
		require.NoError(t, err)
		require.NotNil(t, result)
		assert.Len(t, result.Nodes, 2)
		assert.Len(t, result.Edges, 1)
	})

	// 8. GetDatasetStatistics
	t.Run("GetDatasetStatistics", func(t *testing.T) {
		result, err := repo.GetDatasetStatistics(ctx, "42")
		require.NoError(t, err)
		require.NotNil(t, result)
		assert.Equal(t, int64(1000), *result.RowCount)
	})

	// 9. GetDatasetDDL
	t.Run("GetDatasetDDL", func(t *testing.T) {
		result, err := repo.GetDatasetDDL(ctx, "42")
		require.NoError(t, err)
		require.NotNil(t, result)
		assert.Contains(t, result.TableDDL, "CREATE TABLE")
	})
}
