package application

import (
	"context"
	"errors"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/your-org/lineage-api/internal/domain"
	"github.com/your-org/lineage-api/internal/domain/mocks"
)

// TC-UNIT-018: SearchService Search
func TestSearchServiceSearch(t *testing.T) {
	searchRepo := mocks.NewMockSearchRepository()
	searchRepo.Results = []domain.SearchResult{
		{ID: "db-001", Type: domain.AssetTypeDatabase, DatabaseName: "test_db", MatchedOn: "database_name", Score: 1.0},
		{ID: "tbl-001", Type: domain.AssetTypeTable, DatabaseName: "test_db", TableName: "users", MatchedOn: "table_name", Score: 0.9},
		{ID: "col-001", Type: domain.AssetTypeColumn, DatabaseName: "test_db", TableName: "users", ColumnName: "email", MatchedOn: "column_name", Score: 0.8},
	}

	service := NewSearchService(searchRepo)

	response, err := service.Search(context.Background(), SearchRequest{
		Query: "test",
		Limit: 50,
	})

	require.NoError(t, err)
	assert.Equal(t, "test", response.Query)
	assert.Len(t, response.Results, 3)
	assert.Equal(t, 3, response.Total)
}

func TestSearchServiceSearch_WithAssetTypeFilter(t *testing.T) {
	searchRepo := mocks.NewMockSearchRepository()
	searchRepo.Results = []domain.SearchResult{
		{ID: "db-001", Type: domain.AssetTypeDatabase, DatabaseName: "test_db"},
		{ID: "tbl-001", Type: domain.AssetTypeTable, DatabaseName: "test_db", TableName: "users"},
		{ID: "col-001", Type: domain.AssetTypeColumn, DatabaseName: "test_db", TableName: "users", ColumnName: "email"},
	}

	service := NewSearchService(searchRepo)

	// Filter for tables only
	response, err := service.Search(context.Background(), SearchRequest{
		Query:      "test",
		AssetTypes: []string{"table"},
		Limit:      50,
	})

	require.NoError(t, err)
	assert.Len(t, response.Results, 1)
	assert.Equal(t, domain.AssetTypeTable, response.Results[0].Type)
}

func TestSearchServiceSearch_MultipleAssetTypeFilters(t *testing.T) {
	searchRepo := mocks.NewMockSearchRepository()
	searchRepo.Results = []domain.SearchResult{
		{ID: "db-001", Type: domain.AssetTypeDatabase, DatabaseName: "test_db"},
		{ID: "tbl-001", Type: domain.AssetTypeTable, DatabaseName: "test_db", TableName: "users"},
		{ID: "col-001", Type: domain.AssetTypeColumn, DatabaseName: "test_db", TableName: "users", ColumnName: "email"},
	}

	service := NewSearchService(searchRepo)

	// Filter for tables and columns
	response, err := service.Search(context.Background(), SearchRequest{
		Query:      "test",
		AssetTypes: []string{"table", "column"},
		Limit:      50,
	})

	require.NoError(t, err)
	assert.Len(t, response.Results, 2)

	// Verify no database results
	for _, result := range response.Results {
		assert.NotEqual(t, domain.AssetTypeDatabase, result.Type)
	}
}

func TestSearchServiceSearch_WithLimit(t *testing.T) {
	searchRepo := mocks.NewMockSearchRepository()
	searchRepo.Results = []domain.SearchResult{
		{ID: "col-001", Type: domain.AssetTypeColumn},
		{ID: "col-002", Type: domain.AssetTypeColumn},
		{ID: "col-003", Type: domain.AssetTypeColumn},
		{ID: "col-004", Type: domain.AssetTypeColumn},
		{ID: "col-005", Type: domain.AssetTypeColumn},
	}

	service := NewSearchService(searchRepo)

	response, err := service.Search(context.Background(), SearchRequest{
		Query: "test",
		Limit: 3,
	})

	require.NoError(t, err)
	assert.Len(t, response.Results, 3)
}

func TestSearchServiceSearch_DefaultLimit(t *testing.T) {
	searchRepo := mocks.NewMockSearchRepository()

	service := NewSearchService(searchRepo)

	// Search with no limit specified (should default to 50)
	response, err := service.Search(context.Background(), SearchRequest{
		Query: "test",
		Limit: 0, // This should be treated as default
	})

	require.NoError(t, err)
	assert.Equal(t, "test", response.Query)
}

func TestSearchServiceSearch_Error(t *testing.T) {
	searchRepo := mocks.NewMockSearchRepository()
	searchRepo.SearchErr = errors.New("database error")

	service := NewSearchService(searchRepo)

	_, err := service.Search(context.Background(), SearchRequest{
		Query: "test",
		Limit: 50,
	})

	assert.Error(t, err)
	assert.Equal(t, "database error", err.Error())
}

func TestSearchServiceSearch_EmptyResults(t *testing.T) {
	searchRepo := mocks.NewMockSearchRepository()
	searchRepo.Results = []domain.SearchResult{}

	service := NewSearchService(searchRepo)

	response, err := service.Search(context.Background(), SearchRequest{
		Query: "nonexistent",
		Limit: 50,
	})

	require.NoError(t, err)
	assert.Empty(t, response.Results)
	assert.Equal(t, 0, response.Total)
	assert.Equal(t, "nonexistent", response.Query)
}

func TestSearchServiceSearch_ResponseEchoesQuery(t *testing.T) {
	searchRepo := mocks.NewMockSearchRepository()

	service := NewSearchService(searchRepo)

	testQueries := []string{"test", "user", "email", "orders_table"}

	for _, query := range testQueries {
		response, err := service.Search(context.Background(), SearchRequest{
			Query: query,
			Limit: 50,
		})

		require.NoError(t, err)
		assert.Equal(t, query, response.Query, "Response should echo the query")
	}
}
