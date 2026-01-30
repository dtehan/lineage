package http

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/lineage-api/internal/application"
	"github.com/lineage-api/internal/domain"
	"github.com/lineage-api/internal/domain/mocks"
)

// sensitivePatterns contains strings that should NEVER appear in error responses.
// These patterns represent database internals, connection details, and SQL fragments
// that could leak information to attackers.
var sensitivePatterns = []string{
	// Database driver/connection errors
	"teradatasql",
	"SQLState",
	"clearscape.teradata.com",
	"Connection refused",
	"connection refused",
	// Credentials and user info
	"demo_user",
	"password",
	// Internal table names (lineage schema)
	"LIN_DATABASE",
	"LIN_TABLE",
	"LIN_COLUMN",
	"LIN_COLUMN_LINEAGE",
	"LIN_TABLE_LINEAGE",
	"LIN_TRANSFORMATION",
	"LIN_QUERY",
	"LIN_WATERMARK",
	// SQL fragments
	"SELECT",
	"FROM",
	"WHERE",
	"INSERT",
	"UPDATE",
	"DELETE",
}

// Helper function to add chi URL params to request context
func withChiURLParams(r *http.Request, params map[string]string) *http.Request {
	rctx := chi.NewRouteContext()
	for key, value := range params {
		rctx.URLParams.Add(key, value)
	}
	return r.WithContext(context.WithValue(r.Context(), chi.RouteCtxKey, rctx))
}

// newTestRequestWithRequestID creates a request with Chi route context and a request ID.
// This is required for testing error responses which include request_id from middleware.
func newTestRequestWithRequestID(method, path string, params map[string]string) *http.Request {
	req := httptest.NewRequest(method, path, nil)
	rctx := chi.NewRouteContext()
	for key, value := range params {
		rctx.URLParams.Add(key, value)
	}
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = context.WithValue(ctx, middleware.RequestIDKey, "test-request-id-12345")
	return req.WithContext(ctx)
}

func setupTestHandler() (*Handler, *mocks.MockAssetRepository, *mocks.MockLineageRepository, *mocks.MockSearchRepository) {
	assetRepo := mocks.NewMockAssetRepository()
	lineageRepo := mocks.NewMockLineageRepository()
	searchRepo := mocks.NewMockSearchRepository()

	assetService := application.NewAssetService(assetRepo)
	lineageService := application.NewLineageService(lineageRepo)
	searchService := application.NewSearchService(searchRepo)

	handler := NewHandler(assetService, lineageService, searchService)

	return handler, assetRepo, lineageRepo, searchRepo
}

// TC-API-001: GET /api/v1/assets/databases - Success
func TestListDatabases_Success(t *testing.T) {
	handler, assetRepo, _, _ := setupTestHandler()

	assetRepo.Databases = []domain.Database{
		{ID: "db-001", Name: "database1"},
		{ID: "db-002", Name: "database2"},
	}

	req := httptest.NewRequest("GET", "/api/v1/assets/databases", nil)
	w := httptest.NewRecorder()

	handler.ListDatabases(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, "application/json", w.Header().Get("Content-Type"))

	var response application.DatabaseListResponse
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.Len(t, response.Databases, 2)
	assert.Equal(t, 2, response.Total)
}

// TC-API-002: GET /api/v1/assets/databases/{database}/tables - Success
func TestListTables_Success(t *testing.T) {
	handler, assetRepo, _, _ := setupTestHandler()

	assetRepo.Tables = []domain.Table{
		{ID: "tbl-001", DatabaseName: "test_db", TableName: "users", TableKind: "T"},
		{ID: "tbl-002", DatabaseName: "test_db", TableName: "orders", TableKind: "T"},
	}

	req := httptest.NewRequest("GET", "/api/v1/assets/databases/test_db/tables", nil)
	req = withChiURLParams(req, map[string]string{"database": "test_db"})
	w := httptest.NewRecorder()

	handler.ListTables(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var response application.TableListResponse
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.Len(t, response.Tables, 2)
	assert.Equal(t, 2, response.Total)
}

// TC-API-003: GET /api/v1/assets/databases/{database}/tables/{table}/columns - Success
func TestListColumns_Success(t *testing.T) {
	handler, assetRepo, _, _ := setupTestHandler()

	assetRepo.Columns = []domain.Column{
		{ID: "col-001", DatabaseName: "test_db", TableName: "users", ColumnName: "id", ColumnType: "INTEGER", ColumnPosition: 1},
		{ID: "col-002", DatabaseName: "test_db", TableName: "users", ColumnName: "name", ColumnType: "VARCHAR", ColumnPosition: 2},
	}

	req := httptest.NewRequest("GET", "/api/v1/assets/databases/test_db/tables/users/columns", nil)
	req = withChiURLParams(req, map[string]string{"database": "test_db", "table": "users"})
	w := httptest.NewRecorder()

	handler.ListColumns(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var response application.ColumnListResponse
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.Len(t, response.Columns, 2)
	assert.Equal(t, 2, response.Total)
}

// TC-API-010: GET /api/v1/lineage/{assetId} - Default Parameters
func TestGetLineage_DefaultParameters(t *testing.T) {
	handler, _, lineageRepo, _ := setupTestHandler()

	lineageRepo.UpstreamData["col-001"] = []domain.ColumnLineage{}
	lineageRepo.DownstreamData["col-001"] = []domain.ColumnLineage{}
	
	req := httptest.NewRequest("GET", "/api/v1/lineage/col-001", nil)
	req = withChiURLParams(req, map[string]string{"assetId": "col-001"})
	w := httptest.NewRecorder()

	handler.GetLineage(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var response application.LineageGraphResponse
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.Equal(t, "col-001", response.AssetID)
	assert.NotNil(t, response.Nodes)
}

// TC-API-011: GET /api/v1/lineage/{assetId}?direction=upstream
func TestGetLineage_UpstreamDirection(t *testing.T) {
	handler, _, lineageRepo, _ := setupTestHandler()

	lineageRepo.UpstreamData["col-001"] = []domain.ColumnLineage{
		{LineageID: "lin-001", SourceColumnID: "col-src-001", TargetColumnID: "col-001", Depth: 1},
	}
	lineageRepo.DownstreamData["col-001"] = []domain.ColumnLineage{}
	
	req := httptest.NewRequest("GET", "/api/v1/lineage/col-001?direction=upstream", nil)
	req = withChiURLParams(req, map[string]string{"assetId": "col-001"})
	w := httptest.NewRecorder()

	handler.GetLineage(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

// TC-API-012: GET /api/v1/lineage/{assetId}?direction=downstream
func TestGetLineage_DownstreamDirection(t *testing.T) {
	handler, _, lineageRepo, _ := setupTestHandler()

	lineageRepo.DownstreamData["col-001"] = []domain.ColumnLineage{
		{LineageID: "lin-001", SourceColumnID: "col-001", TargetColumnID: "col-tgt-001", Depth: 1},
	}
	lineageRepo.UpstreamData["col-001"] = []domain.ColumnLineage{}
	
	req := httptest.NewRequest("GET", "/api/v1/lineage/col-001?direction=downstream", nil)
	req = withChiURLParams(req, map[string]string{"assetId": "col-001"})
	w := httptest.NewRecorder()

	handler.GetLineage(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var response application.LineageGraphResponse
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.Equal(t, "col-001", response.AssetID)
	assert.NotNil(t, response.Nodes)
}

// TC-API-013: GET /api/v1/lineage/{assetId}?maxDepth=3
func TestGetLineage_MaxDepthParameter(t *testing.T) {
	handler, _, lineageRepo, _ := setupTestHandler()

	lineageRepo.UpstreamData["col-001"] = []domain.ColumnLineage{
		{LineageID: "lin-001", Depth: 1},
		{LineageID: "lin-002", Depth: 2},
		{LineageID: "lin-003", Depth: 3},
		{LineageID: "lin-004", Depth: 4}, // Should be filtered out by maxDepth=3
	}
	lineageRepo.DownstreamData["col-001"] = []domain.ColumnLineage{}
	
	req := httptest.NewRequest("GET", "/api/v1/lineage/col-001?maxDepth=3", nil)
	req = withChiURLParams(req, map[string]string{"assetId": "col-001"})
	w := httptest.NewRecorder()

	handler.GetLineage(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

// TC-API-014: GET /api/v1/lineage/{assetId}/upstream - Success
func TestGetUpstreamLineage_Success(t *testing.T) {
	handler, _, lineageRepo, _ := setupTestHandler()

	lineageRepo.UpstreamData["col-001"] = []domain.ColumnLineage{
		{LineageID: "lin-001", SourceColumnID: "col-src-001", TargetColumnID: "col-001", Depth: 1},
	}

	req := httptest.NewRequest("GET", "/api/v1/lineage/col-001/upstream", nil)
	req = withChiURLParams(req, map[string]string{"assetId": "col-001"})
	w := httptest.NewRecorder()

	handler.GetUpstreamLineage(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var response application.LineageResponse
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.Len(t, response.Lineage, 1)
}

// TC-API-015: GET /api/v1/lineage/{assetId}/downstream - Success
func TestGetDownstreamLineage_Success(t *testing.T) {
	handler, _, lineageRepo, _ := setupTestHandler()

	lineageRepo.DownstreamData["col-001"] = []domain.ColumnLineage{
		{LineageID: "lin-001", SourceColumnID: "col-001", TargetColumnID: "col-tgt-001", Depth: 1},
	}

	req := httptest.NewRequest("GET", "/api/v1/lineage/col-001/downstream", nil)
	req = withChiURLParams(req, map[string]string{"assetId": "col-001"})
	w := httptest.NewRecorder()

	handler.GetDownstreamLineage(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var response application.LineageResponse
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.Len(t, response.Lineage, 1)
}

// TC-API-016: GET /api/v1/lineage/{assetId}/impact - Success
func TestGetImpactAnalysis_Success(t *testing.T) {
	handler, _, lineageRepo, _ := setupTestHandler()

	lineageRepo.DownstreamData["col-001"] = []domain.ColumnLineage{
		{LineageID: "lin-001", SourceColumnID: "col-001", TargetColumnID: "col-tgt-001", TargetDatabase: "db1", TargetTable: "tbl1", TargetColumn: "col1", Depth: 1},
		{LineageID: "lin-002", SourceColumnID: "col-tgt-001", TargetColumnID: "col-tgt-002", TargetDatabase: "db1", TargetTable: "tbl2", TargetColumn: "col2", Depth: 2},
	}

	req := httptest.NewRequest("GET", "/api/v1/lineage/col-001/impact", nil)
	req = withChiURLParams(req, map[string]string{"assetId": "col-001"})
	w := httptest.NewRecorder()

	handler.GetImpactAnalysis(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var response application.ImpactAnalysisResponse
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.Equal(t, "col-001", response.SourceAsset)
	assert.Len(t, response.ImpactedAssets, 2)
	assert.NotNil(t, response.Summary)
	assert.Equal(t, 2, response.Summary.TotalImpacted)
}

// TC-API-020: GET /api/v1/search?q={query} - Success
func TestSearch_Success(t *testing.T) {
	handler, _, _, searchRepo := setupTestHandler()

	searchRepo.Results = []domain.SearchResult{
		{ID: "col-001", Type: domain.AssetTypeColumn, DatabaseName: "test_db", TableName: "users", ColumnName: "test_col", MatchedOn: "column_name", Score: 1.0},
	}

	req := httptest.NewRequest("GET", "/api/v1/search?q=test", nil)
	w := httptest.NewRecorder()

	handler.Search(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var response application.SearchResponse
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.Equal(t, "test", response.Query)
	assert.Len(t, response.Results, 1)
	assert.Equal(t, 1, response.Total)
}

// TC-ERR-001: Search Without Query Parameter
// Note: Current implementation returns 200 with empty results for empty query
func TestSearch_MissingQueryParameter(t *testing.T) {
	handler, _, _, _ := setupTestHandler()

	req := httptest.NewRequest("GET", "/api/v1/search", nil)
	w := httptest.NewRecorder()

	handler.Search(w, req)

	// Implementation returns 200 with empty results for empty query
	assert.Equal(t, http.StatusOK, w.Code)

	var response application.SearchResponse
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.Equal(t, "", response.Query)
}

// TC-API-021: GET /api/v1/search?q={query}&type=database
func TestSearch_WithTypeFilter(t *testing.T) {
	handler, _, _, searchRepo := setupTestHandler()

	searchRepo.Results = []domain.SearchResult{
		{ID: "db-001", Type: domain.AssetTypeDatabase, DatabaseName: "test_db"},
	}

	req := httptest.NewRequest("GET", "/api/v1/search?q=test&type=database", nil)
	w := httptest.NewRecorder()

	handler.Search(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var response application.SearchResponse
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.Len(t, response.Results, 1)
	assert.Equal(t, domain.AssetTypeDatabase, response.Results[0].Type)
}

// TC-API-022: GET /api/v1/search?q={query}&type=table&type=column
func TestSearch_WithMultipleTypeFilters(t *testing.T) {
	handler, _, _, searchRepo := setupTestHandler()

	searchRepo.Results = []domain.SearchResult{
		{ID: "tbl-001", Type: domain.AssetTypeTable, DatabaseName: "test_db", TableName: "users"},
		{ID: "col-001", Type: domain.AssetTypeColumn, DatabaseName: "test_db", TableName: "users", ColumnName: "email"},
	}

	req := httptest.NewRequest("GET", "/api/v1/search?q=test&type=table&type=column", nil)
	w := httptest.NewRecorder()

	handler.Search(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var response application.SearchResponse
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.Len(t, response.Results, 2)

	// Verify only tables and columns are returned
	for _, result := range response.Results {
		assert.Contains(t, []domain.AssetType{domain.AssetTypeTable, domain.AssetTypeColumn}, result.Type)
	}
}

// TC-API-023: GET /api/v1/search?q={query}&limit=10
func TestSearch_WithLimit(t *testing.T) {
	handler, _, _, searchRepo := setupTestHandler()

	// Create more results than limit
	searchRepo.Results = make([]domain.SearchResult, 20)
	for i := 0; i < 20; i++ {
		searchRepo.Results[i] = domain.SearchResult{ID: "col-" + string(rune('0'+i)), Type: domain.AssetTypeColumn}
	}

	req := httptest.NewRequest("GET", "/api/v1/search?q=test&limit=10", nil)
	w := httptest.NewRecorder()

	handler.Search(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var response application.SearchResponse
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.LessOrEqual(t, len(response.Results), 10)
}

// TC-ERR-002: Invalid maxDepth Parameter (UPDATED: now returns 400)
func TestGetLineage_InvalidMaxDepth(t *testing.T) {
	// Ensure validation config is set
	SetValidationConfig(1, 20, 5)

	handler, _, _, _ := setupTestHandler()

	req := newTestRequestWithRequestID("GET", "/api/v1/lineage/col-001?maxDepth=invalid", map[string]string{"assetId": "col-001"})
	w := httptest.NewRecorder()

	handler.GetLineage(w, req)

	// Should return 400 with validation error
	assert.Equal(t, http.StatusBadRequest, w.Code)

	var response ValidationErrorResponse
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)
	assert.Equal(t, "VALIDATION_ERROR", response.Code)
	assert.Contains(t, w.Body.String(), "maxDepth")
}

// TC-HEALTH-001: Health Endpoint Returns Healthy
func TestHealthEndpoint(t *testing.T) {
	handler, _, _, _ := setupTestHandler()

	router := NewRouter(handler, nil)

	req := httptest.NewRequest("GET", "/health", nil)
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, "application/json", w.Header().Get("Content-Type"))

	var response map[string]string
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.Equal(t, "ok", response["status"])
}

// TC-ERR-003: Invalid limit Parameter
func TestSearch_InvalidLimit(t *testing.T) {
	handler, _, _, searchRepo := setupTestHandler()

	searchRepo.Results = []domain.SearchResult{
		{ID: "col-001", Type: domain.AssetTypeColumn},
	}

	req := httptest.NewRequest("GET", "/api/v1/search?q=test&limit=invalid", nil)
	w := httptest.NewRecorder()

	handler.Search(w, req)

	// Should use default limit (50) and succeed
	assert.Equal(t, http.StatusOK, w.Code)

	var response application.SearchResponse
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)
	assert.NotNil(t, response.Results)
}

// TC-ERR-010: Non-existent Database
func TestListTables_NonExistentDatabase(t *testing.T) {
	handler, assetRepo, _, _ := setupTestHandler()

	// Empty tables list simulates database not found
	assetRepo.Tables = []domain.Table{}

	req := httptest.NewRequest("GET", "/api/v1/assets/databases/nonexistent/tables", nil)
	req = withChiURLParams(req, map[string]string{"database": "nonexistent"})
	w := httptest.NewRecorder()

	handler.ListTables(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var response application.TableListResponse
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)
	assert.Empty(t, response.Tables)
	assert.Equal(t, 0, response.Total)
}

// TC-ERR-011: Non-existent Table
func TestListColumns_NonExistentTable(t *testing.T) {
	handler, assetRepo, _, _ := setupTestHandler()

	// Empty columns list simulates table not found
	assetRepo.Columns = []domain.Column{}

	req := httptest.NewRequest("GET", "/api/v1/assets/databases/test_db/tables/nonexistent/columns", nil)
	req = withChiURLParams(req, map[string]string{"database": "test_db", "table": "nonexistent"})
	w := httptest.NewRecorder()

	handler.ListColumns(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var response application.ColumnListResponse
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)
	assert.Empty(t, response.Columns)
	assert.Equal(t, 0, response.Total)
}

// TC-ERR-012: Non-existent Asset ID for Lineage
func TestGetLineage_NonExistentAssetID(t *testing.T) {
	handler, _, lineageRepo, _ := setupTestHandler()

	// Empty lineage data simulates asset not found
	lineageRepo.UpstreamData["nonexistent-id"] = []domain.ColumnLineage{}
	lineageRepo.DownstreamData["nonexistent-id"] = []domain.ColumnLineage{}
	
	req := httptest.NewRequest("GET", "/api/v1/lineage/nonexistent-id", nil)
	req = withChiURLParams(req, map[string]string{"assetId": "nonexistent-id"})
	w := httptest.NewRecorder()

	handler.GetLineage(w, req)

	// Should return empty graph, not error
	assert.Equal(t, http.StatusOK, w.Code)

	var response application.LineageGraphResponse
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)
	assert.Equal(t, "nonexistent-id", response.AssetID)
	// Graph should have at least the root node
	assert.NotNil(t, response.Nodes)
}

// TC-ERR-030: CORS Preflight Request
func TestCORSPreflightRequest(t *testing.T) {
	handler, _, _, _ := setupTestHandler()
	router := NewRouter(handler, nil)

	req := httptest.NewRequest("OPTIONS", "/api/v1/assets/databases", nil)
	req.Header.Set("Origin", "http://localhost:3000")
	req.Header.Set("Access-Control-Request-Method", "GET")
	req.Header.Set("Access-Control-Request-Headers", "Content-Type")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	// CORS should respond to preflight
	assert.Contains(t, []int{http.StatusOK, http.StatusNoContent}, w.Code)

	// Verify CORS headers
	assert.Contains(t, w.Header().Get("Access-Control-Allow-Origin"), "http://localhost:3000")
	assert.Contains(t, w.Header().Get("Access-Control-Allow-Methods"), "GET")
}

// TC-ERR-031: Request from Allowed Origin
func TestCORSAllowedOrigin(t *testing.T) {
	handler, assetRepo, _, _ := setupTestHandler()
	assetRepo.Databases = []domain.Database{{ID: "db-001", Name: "test"}}
	router := NewRouter(handler, nil)

	req := httptest.NewRequest("GET", "/api/v1/assets/databases", nil)
	req.Header.Set("Origin", "http://localhost:5173")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	// Origin should be allowed
	assert.Equal(t, "http://localhost:5173", w.Header().Get("Access-Control-Allow-Origin"))
}

// TC-HEALTH-002: Health Check Response Time (verification via simple execution)
func TestHealthEndpoint_ResponseFormat(t *testing.T) {
	handler, _, _, _ := setupTestHandler()
	router := NewRouter(handler, nil)

	req := httptest.NewRequest("GET", "/health", nil)
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, "application/json", w.Header().Get("Content-Type"))

	var response map[string]string
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)
	assert.Equal(t, "ok", response["status"])
}

// TC-HEALTH-003: Health Check Under Load (simulated)
func TestHealthEndpoint_MultipleRequests(t *testing.T) {
	handler, _, _, _ := setupTestHandler()
	router := NewRouter(handler, nil)

	// Send multiple health check requests
	for i := 0; i < 10; i++ {
		req := httptest.NewRequest("GET", "/health", nil)
		w := httptest.NewRecorder()

		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
	}
}

// Test router registers all expected routes
func TestRouterRegistersRoutes(t *testing.T) {
	handler, _, _, _ := setupTestHandler()
	router := NewRouter(handler, nil)

	testCases := []struct {
		method string
		path   string
	}{
		{"GET", "/health"},
		{"GET", "/api/v1/assets/databases"},
		{"GET", "/api/v1/assets/databases/test_db/tables"},
		{"GET", "/api/v1/assets/databases/test_db/tables/users/columns"},
		{"GET", "/api/v1/lineage/col-001"},
		{"GET", "/api/v1/lineage/col-001/upstream"},
		{"GET", "/api/v1/lineage/col-001/downstream"},
		{"GET", "/api/v1/lineage/col-001/impact"},
		{"GET", "/api/v1/search?q=test"},
	}

	for _, tc := range testCases {
		t.Run(tc.method+" "+tc.path, func(t *testing.T) {
			req := httptest.NewRequest(tc.method, tc.path, nil)
			w := httptest.NewRecorder()

			router.ServeHTTP(w, req)

			// Should not return 404 (route exists)
			assert.NotEqual(t, http.StatusNotFound, w.Code, "Route %s %s should exist", tc.method, tc.path)
		})
	}
}

// ============================================================================
// VALIDATION TESTS (VALID-01, VALID-02, VALID-03, TEST-01)
// ============================================================================

// TEST-01: maxDepth validation edge cases
func TestGetLineage_MaxDepthValidation(t *testing.T) {
	// Setup - ensure validation config is set
	SetValidationConfig(1, 20, 5)

	tests := []struct {
		name          string
		maxDepthParam string
		expectStatus  int
		expectError   bool
	}{
		// Valid cases
		{"valid min boundary", "1", http.StatusOK, false},
		{"valid max boundary", "20", http.StatusOK, false},
		{"valid mid-range", "10", http.StatusOK, false},
		{"empty uses default", "", http.StatusOK, false},

		// Invalid: below minimum
		{"zero", "0", http.StatusBadRequest, true},
		{"negative", "-1", http.StatusBadRequest, true},
		{"large negative", "-999", http.StatusBadRequest, true},

		// Invalid: above maximum
		{"above max", "21", http.StatusBadRequest, true},
		{"way above max", "100", http.StatusBadRequest, true},
		{"extreme value", "999999", http.StatusBadRequest, true},

		// Invalid: non-integer
		{"string value", "abc", http.StatusBadRequest, true},
		{"float value", "5.5", http.StatusBadRequest, true},
		{"null string", "null", http.StatusBadRequest, true},
		{"special chars", "5%3B%20DROP%20TABLE", http.StatusBadRequest, true}, // URL encoded "5; DROP TABLE"
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			handler, _, lineageRepo, _ := setupTestHandler()

			// Setup mock data for successful cases
			lineageRepo.UpstreamData["col-001"] = []domain.ColumnLineage{}
			lineageRepo.DownstreamData["col-001"] = []domain.ColumnLineage{}

			url := "/api/v1/lineage/col-001"
			if tt.maxDepthParam != "" {
				url += "?maxDepth=" + tt.maxDepthParam
			}

			req := newTestRequestWithRequestID("GET", url, map[string]string{"assetId": "col-001"})
			w := httptest.NewRecorder()

			handler.GetLineage(w, req)

			assert.Equal(t, tt.expectStatus, w.Code, "status code mismatch for %s", tt.name)

			if tt.expectError {
				var response ValidationErrorResponse
				err := json.Unmarshal(w.Body.Bytes(), &response)
				require.NoError(t, err, "response should be valid JSON")
				assert.Equal(t, "VALIDATION_ERROR", response.Code)
				assert.Contains(t, w.Body.String(), "maxDepth")
			}
		})
	}
}

// TEST-01: direction validation edge cases
func TestGetLineage_DirectionValidation(t *testing.T) {
	SetValidationConfig(1, 20, 5)

	tests := []struct {
		name         string
		direction    string
		expectStatus int
		expectError  bool
	}{
		// Valid cases
		{"upstream lowercase", "upstream", http.StatusOK, false},
		{"downstream lowercase", "downstream", http.StatusOK, false},
		{"both lowercase", "both", http.StatusOK, false},
		{"empty uses default both", "", http.StatusOK, false},

		// Invalid: wrong case
		{"wrong case UPSTREAM", "UPSTREAM", http.StatusBadRequest, true},
		{"wrong case Both", "Both", http.StatusBadRequest, true},
		{"wrong case Downstream", "Downstream", http.StatusBadRequest, true},

		// Invalid: unknown values
		{"invalid value", "invalid", http.StatusBadRequest, true},
		{"typo upsteam", "upsteam", http.StatusBadRequest, true},
		{"number", "1", http.StatusBadRequest, true},
		{"special chars", "up%3Bstream", http.StatusBadRequest, true}, // URL encoded "up;stream"
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			handler, _, lineageRepo, _ := setupTestHandler()

			// Setup mock data for successful cases
			lineageRepo.UpstreamData["col-001"] = []domain.ColumnLineage{}
			lineageRepo.DownstreamData["col-001"] = []domain.ColumnLineage{}

			url := "/api/v1/lineage/col-001"
			if tt.direction != "" {
				url += "?direction=" + tt.direction
			}

			req := newTestRequestWithRequestID("GET", url, map[string]string{"assetId": "col-001"})
			w := httptest.NewRecorder()

			handler.GetLineage(w, req)

			assert.Equal(t, tt.expectStatus, w.Code, "status code mismatch for %s", tt.name)

			if tt.expectError {
				var response ValidationErrorResponse
				err := json.Unmarshal(w.Body.Bytes(), &response)
				require.NoError(t, err)
				assert.Equal(t, "VALIDATION_ERROR", response.Code)
				assert.Contains(t, w.Body.String(), "direction")
			}
		})
	}
}

// VALID-03: Validation error response structure
func TestValidationErrorResponse_Structure(t *testing.T) {
	SetValidationConfig(1, 20, 5)
	handler, _, _, _ := setupTestHandler()

	// Send request with multiple validation errors
	req := newTestRequestWithRequestID("GET", "/api/v1/lineage/col-001?maxDepth=-1&direction=invalid", map[string]string{"assetId": "col-001"})
	w := httptest.NewRecorder()

	handler.GetLineage(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
	assert.Equal(t, "application/json", w.Header().Get("Content-Type"))

	var response ValidationErrorResponse
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	// VALID-03 requirements
	assert.Equal(t, "VALIDATION_ERROR", response.Code, "must include error code")
	assert.Equal(t, "Validation failed", response.Error, "must include error message")
	assert.NotEmpty(t, response.RequestID, "must include request ID")
	assert.GreaterOrEqual(t, len(response.Details), 2, "should report multiple field errors")

	// Verify field-level details
	fields := make(map[string]bool)
	for _, detail := range response.Details {
		fields[detail.Field] = true
		assert.NotEmpty(t, detail.Message, "each field error must have message")
	}
	assert.True(t, fields["maxDepth"], "should include maxDepth error")
	assert.True(t, fields["direction"], "should include direction error")
}

// Test validation for upstream lineage endpoint
func TestGetUpstreamLineage_MaxDepthValidation(t *testing.T) {
	SetValidationConfig(1, 20, 5)
	handler, _, _, _ := setupTestHandler()

	// Invalid maxDepth should return 400
	req := newTestRequestWithRequestID("GET", "/api/v1/lineage/col-001/upstream?maxDepth=999", map[string]string{"assetId": "col-001"})
	w := httptest.NewRecorder()

	handler.GetUpstreamLineage(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
	assert.Contains(t, w.Body.String(), "maxDepth")
}

// Test validation for downstream lineage endpoint
func TestGetDownstreamLineage_MaxDepthValidation(t *testing.T) {
	SetValidationConfig(1, 20, 5)
	handler, _, _, _ := setupTestHandler()

	req := newTestRequestWithRequestID("GET", "/api/v1/lineage/col-001/downstream?maxDepth=-5", map[string]string{"assetId": "col-001"})
	w := httptest.NewRecorder()

	handler.GetDownstreamLineage(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

// Test validation for impact analysis endpoint
func TestGetImpactAnalysis_MaxDepthValidation(t *testing.T) {
	SetValidationConfig(1, 20, 5)
	handler, _, _, _ := setupTestHandler()

	req := newTestRequestWithRequestID("GET", "/api/v1/lineage/col-001/impact?maxDepth=abc", map[string]string{"assetId": "col-001"})
	w := httptest.NewRecorder()

	handler.GetImpactAnalysis(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

// Test that empty parameters use defaults (not errors)
func TestGetLineage_EmptyParametersUseDefaults(t *testing.T) {
	SetValidationConfig(1, 20, 5)
	handler, _, lineageRepo, _ := setupTestHandler()

	// Setup mock data
	lineageRepo.UpstreamData["col-001"] = []domain.ColumnLineage{}
	lineageRepo.DownstreamData["col-001"] = []domain.ColumnLineage{}

	// Request with no query params
	req := newTestRequestWithRequestID("GET", "/api/v1/lineage/col-001", map[string]string{"assetId": "col-001"})
	w := httptest.NewRecorder()

	handler.GetLineage(w, req)

	// Should succeed with defaults
	assert.Equal(t, http.StatusOK, w.Code)

	var response application.LineageGraphResponse
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)
	assert.Equal(t, "col-001", response.AssetID)
}

// Test that upstream endpoint accepts valid maxDepth and defaults
func TestGetUpstreamLineage_ValidMaxDepthAndDefaults(t *testing.T) {
	SetValidationConfig(1, 20, 5)
	handler, _, lineageRepo, _ := setupTestHandler()

	lineageRepo.UpstreamData["col-001"] = []domain.ColumnLineage{}

	tests := []struct {
		name  string
		param string
	}{
		{"no param uses default", ""},
		{"valid boundary 1", "?maxDepth=1"},
		{"valid boundary 20", "?maxDepth=20"},
		{"valid mid-range", "?maxDepth=10"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := newTestRequestWithRequestID("GET", "/api/v1/lineage/col-001/upstream"+tt.param, map[string]string{"assetId": "col-001"})
			w := httptest.NewRecorder()

			handler.GetUpstreamLineage(w, req)

			assert.Equal(t, http.StatusOK, w.Code, "should succeed for %s", tt.name)
		})
	}
}

// Test that downstream endpoint accepts valid maxDepth and defaults
func TestGetDownstreamLineage_ValidMaxDepthAndDefaults(t *testing.T) {
	SetValidationConfig(1, 20, 5)
	handler, _, lineageRepo, _ := setupTestHandler()

	lineageRepo.DownstreamData["col-001"] = []domain.ColumnLineage{}

	tests := []struct {
		name  string
		param string
	}{
		{"no param uses default", ""},
		{"valid boundary 1", "?maxDepth=1"},
		{"valid boundary 20", "?maxDepth=20"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := newTestRequestWithRequestID("GET", "/api/v1/lineage/col-001/downstream"+tt.param, map[string]string{"assetId": "col-001"})
			w := httptest.NewRecorder()

			handler.GetDownstreamLineage(w, req)

			assert.Equal(t, http.StatusOK, w.Code, "should succeed for %s", tt.name)
		})
	}
}

// Test that impact endpoint accepts valid maxDepth and defaults
func TestGetImpactAnalysis_ValidMaxDepthAndDefaults(t *testing.T) {
	SetValidationConfig(1, 20, 5)
	handler, _, lineageRepo, _ := setupTestHandler()

	lineageRepo.DownstreamData["col-001"] = []domain.ColumnLineage{}

	tests := []struct {
		name  string
		param string
	}{
		{"no param uses default", ""},
		{"valid boundary 1", "?maxDepth=1"},
		{"valid boundary 20", "?maxDepth=20"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := newTestRequestWithRequestID("GET", "/api/v1/lineage/col-001/impact"+tt.param, map[string]string{"assetId": "col-001"})
			w := httptest.NewRecorder()

			handler.GetImpactAnalysis(w, req)

			assert.Equal(t, http.StatusOK, w.Code, "should succeed for %s", tt.name)
		})
	}
}

// =============================================================================
// Error Response Security Tests (SEC-03, SEC-04, TEST-02)
// =============================================================================

// TestErrorResponseNoSensitiveData verifies that error responses do not leak
// sensitive database information such as table names, SQL queries, or connection details.
// This test simulates a realistic database error with sensitive details.
func TestErrorResponseNoSensitiveData(t *testing.T) {
	handler, assetRepo, _, _ := setupTestHandler()

	// Create a realistic database error with sensitive details
	sensitiveErr := errors.New(
		"teradatasql.Error: [SQLState HY000] [Version 17.20.0] " +
			"Failed to connect to 'test-host.env.clearscape.teradata.com:1025' " +
			"as user 'demo_user' password='****': Connection refused. " +
			"Query: SELECT * FROM LIN_DATABASE WHERE database_name = 'test'",
	)
	assetRepo.ListDatabasesErr = sensitiveErr

	req := newTestRequestWithRequestID("GET", "/api/v1/assets/databases", nil)
	w := httptest.NewRecorder()

	handler.ListDatabases(w, req)

	// Verify HTTP 500 status
	assert.Equal(t, http.StatusInternalServerError, w.Code)

	// Parse response body
	var resp map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &resp)
	require.NoError(t, err)

	// Verify generic error message (not the actual error)
	assert.Equal(t, "Internal server error", resp["error"])

	// Verify request_id is present
	assert.NotEmpty(t, resp["request_id"])

	// Verify NO sensitive data in response body
	body := w.Body.String()
	for _, pattern := range sensitivePatterns {
		assert.NotContains(t, body, pattern, "Response should not contain sensitive pattern: %s", pattern)
	}
}

// TestErrorResponseHasRequestID verifies that all error responses include
// a request_id field for correlation with server logs.
func TestErrorResponseHasRequestID(t *testing.T) {
	handler, assetRepo, _, _ := setupTestHandler()

	assetRepo.ListDatabasesErr = errors.New("any internal error")

	req := newTestRequestWithRequestID("GET", "/api/v1/assets/databases", nil)
	w := httptest.NewRecorder()

	handler.ListDatabases(w, req)

	var resp map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &resp)
	require.NoError(t, err)

	// Verify request_id field exists and is a non-empty string
	requestID, ok := resp["request_id"].(string)
	assert.True(t, ok, "request_id should be a string")
	assert.NotEmpty(t, requestID, "request_id should not be empty")
	assert.Equal(t, "test-request-id-12345", requestID, "request_id should match the one set in context")
}

// TestAllHandlersReturnGenericError verifies that ALL handler endpoints return
// generic "Internal server error" messages and never expose internal details.
// This is a table-driven test covering all 8 handlers.
func TestAllHandlersReturnGenericError(t *testing.T) {
	// Create an error that contains sensitive information
	testErr := errors.New("internal database error: SELECT * FROM LIN_TABLE WHERE id = 1")

	tests := []struct {
		name        string
		setupMocks  func(*mocks.MockAssetRepository, *mocks.MockLineageRepository, *mocks.MockSearchRepository)
		method      string
		path        string
		params      map[string]string
		handlerFunc func(h *Handler, w http.ResponseWriter, r *http.Request)
	}{
		{
			name: "ListDatabases",
			setupMocks: func(ar *mocks.MockAssetRepository, lr *mocks.MockLineageRepository, sr *mocks.MockSearchRepository) {
				ar.ListDatabasesErr = testErr
			},
			method:      "GET",
			path:        "/api/v1/assets/databases",
			params:      nil,
			handlerFunc: func(h *Handler, w http.ResponseWriter, r *http.Request) { h.ListDatabases(w, r) },
		},
		{
			name: "ListTables",
			setupMocks: func(ar *mocks.MockAssetRepository, lr *mocks.MockLineageRepository, sr *mocks.MockSearchRepository) {
				ar.ListTablesErr = testErr
			},
			method:      "GET",
			path:        "/api/v1/assets/databases/test_db/tables",
			params:      map[string]string{"database": "test_db"},
			handlerFunc: func(h *Handler, w http.ResponseWriter, r *http.Request) { h.ListTables(w, r) },
		},
		{
			name: "ListColumns",
			setupMocks: func(ar *mocks.MockAssetRepository, lr *mocks.MockLineageRepository, sr *mocks.MockSearchRepository) {
				ar.ListColumnsErr = testErr
			},
			method:      "GET",
			path:        "/api/v1/assets/databases/test_db/tables/users/columns",
			params:      map[string]string{"database": "test_db", "table": "users"},
			handlerFunc: func(h *Handler, w http.ResponseWriter, r *http.Request) { h.ListColumns(w, r) },
		},
		{
			name: "GetLineage",
			setupMocks: func(ar *mocks.MockAssetRepository, lr *mocks.MockLineageRepository, sr *mocks.MockSearchRepository) {
				lr.GetLineageGraphErr = testErr
			},
			method:      "GET",
			path:        "/api/v1/lineage/col-001",
			params:      map[string]string{"assetId": "col-001"},
			handlerFunc: func(h *Handler, w http.ResponseWriter, r *http.Request) { h.GetLineage(w, r) },
		},
		{
			name: "GetUpstreamLineage",
			setupMocks: func(ar *mocks.MockAssetRepository, lr *mocks.MockLineageRepository, sr *mocks.MockSearchRepository) {
				lr.GetUpstreamLineageErr = testErr
			},
			method:      "GET",
			path:        "/api/v1/lineage/col-001/upstream",
			params:      map[string]string{"assetId": "col-001"},
			handlerFunc: func(h *Handler, w http.ResponseWriter, r *http.Request) { h.GetUpstreamLineage(w, r) },
		},
		{
			name: "GetDownstreamLineage",
			setupMocks: func(ar *mocks.MockAssetRepository, lr *mocks.MockLineageRepository, sr *mocks.MockSearchRepository) {
				lr.GetDownstreamLineageErr = testErr
			},
			method:      "GET",
			path:        "/api/v1/lineage/col-001/downstream",
			params:      map[string]string{"assetId": "col-001"},
			handlerFunc: func(h *Handler, w http.ResponseWriter, r *http.Request) { h.GetDownstreamLineage(w, r) },
		},
		{
			name: "GetImpactAnalysis",
			setupMocks: func(ar *mocks.MockAssetRepository, lr *mocks.MockLineageRepository, sr *mocks.MockSearchRepository) {
				lr.GetDownstreamLineageErr = testErr // Impact analysis uses downstream
			},
			method:      "GET",
			path:        "/api/v1/lineage/col-001/impact",
			params:      map[string]string{"assetId": "col-001"},
			handlerFunc: func(h *Handler, w http.ResponseWriter, r *http.Request) { h.GetImpactAnalysis(w, r) },
		},
		{
			name: "Search",
			setupMocks: func(ar *mocks.MockAssetRepository, lr *mocks.MockLineageRepository, sr *mocks.MockSearchRepository) {
				sr.SearchErr = testErr
			},
			method:      "GET",
			path:        "/api/v1/search?q=test",
			params:      nil,
			handlerFunc: func(h *Handler, w http.ResponseWriter, r *http.Request) { h.Search(w, r) },
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			handler, assetRepo, lineageRepo, searchRepo := setupTestHandler()
			tt.setupMocks(assetRepo, lineageRepo, searchRepo)

			req := newTestRequestWithRequestID(tt.method, tt.path, tt.params)
			w := httptest.NewRecorder()

			tt.handlerFunc(handler, w, req)

			// Verify HTTP 500 status
			assert.Equal(t, http.StatusInternalServerError, w.Code, "%s should return 500", tt.name)

			// Parse response
			var resp map[string]interface{}
			err := json.Unmarshal(w.Body.Bytes(), &resp)
			require.NoError(t, err, "%s response should be valid JSON", tt.name)

			// Verify generic error message
			assert.Equal(t, "Internal server error", resp["error"], "%s should return generic error", tt.name)

			// Verify request_id is present
			assert.NotEmpty(t, resp["request_id"], "%s should include request_id", tt.name)

			// Verify no sensitive data leaked
			body := w.Body.String()
			assert.NotContains(t, body, "LIN_TABLE", "%s should not leak LIN_TABLE", tt.name)
			assert.NotContains(t, body, "SELECT", "%s should not leak SELECT", tt.name)
			assert.NotContains(t, body, "FROM", "%s should not leak FROM", tt.name)
		})
	}
}

// =============================================================================
// Pagination Validation Tests (PAGE-01, PAGE-02, TEST-04)
// =============================================================================

// TEST-04: pagination validation for ListDatabases
func TestListDatabases_PaginationValidation(t *testing.T) {
	SetPaginationConfig(1, 500, 100)

	tests := []struct {
		name         string
		limitParam   string
		offsetParam  string
		expectStatus int
		expectError  bool
	}{
		// Valid cases
		{"default values", "", "", http.StatusOK, false},
		{"valid limit", "50", "", http.StatusOK, false},
		{"valid limit and offset", "50", "100", http.StatusOK, false},
		{"min limit", "1", "0", http.StatusOK, false},
		{"max limit", "500", "0", http.StatusOK, false},
		{"large offset", "100", "1000", http.StatusOK, false},

		// Invalid limit
		{"limit zero", "0", "", http.StatusBadRequest, true},
		{"limit negative", "-1", "", http.StatusBadRequest, true},
		{"limit above max", "501", "", http.StatusBadRequest, true},
		{"limit way above max", "10000", "", http.StatusBadRequest, true},
		{"limit non-integer", "abc", "", http.StatusBadRequest, true},
		{"limit float", "50.5", "", http.StatusBadRequest, true},

		// Invalid offset
		{"offset negative", "100", "-1", http.StatusBadRequest, true},
		{"offset non-integer", "100", "abc", http.StatusBadRequest, true},
		{"offset float", "100", "10.5", http.StatusBadRequest, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			handler, assetRepo, _, _ := setupTestHandler()
			assetRepo.Databases = []domain.Database{{ID: "db-001", Name: "test"}}
			assetRepo.DatabaseCount = 1

			url := "/api/v1/assets/databases"
			params := []string{}
			if tt.limitParam != "" {
				params = append(params, "limit="+tt.limitParam)
			}
			if tt.offsetParam != "" {
				params = append(params, "offset="+tt.offsetParam)
			}
			if len(params) > 0 {
				url += "?" + strings.Join(params, "&")
			}

			req := newTestRequestWithRequestID("GET", url, nil)
			w := httptest.NewRecorder()

			handler.ListDatabases(w, req)

			assert.Equal(t, tt.expectStatus, w.Code, "status code mismatch for %s", tt.name)
			if tt.expectError {
				var response ValidationErrorResponse
				err := json.Unmarshal(w.Body.Bytes(), &response)
				require.NoError(t, err)
				assert.Equal(t, "VALIDATION_ERROR", response.Code)
			}
		})
	}
}

// TEST-04: pagination validation for ListTables
func TestListTables_PaginationValidation(t *testing.T) {
	SetPaginationConfig(1, 500, 100)

	tests := []struct {
		name         string
		limitParam   string
		offsetParam  string
		expectStatus int
		expectError  bool
	}{
		{"default values", "", "", http.StatusOK, false},
		{"valid params", "50", "100", http.StatusOK, false},
		{"limit zero", "0", "", http.StatusBadRequest, true},
		{"limit above max", "501", "", http.StatusBadRequest, true},
		{"offset negative", "100", "-1", http.StatusBadRequest, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			handler, assetRepo, _, _ := setupTestHandler()
			assetRepo.Tables = []domain.Table{{ID: "tbl-001", DatabaseName: "test_db", TableName: "users"}}
			assetRepo.TableCount = 1

			url := "/api/v1/assets/databases/test_db/tables"
			params := []string{}
			if tt.limitParam != "" {
				params = append(params, "limit="+tt.limitParam)
			}
			if tt.offsetParam != "" {
				params = append(params, "offset="+tt.offsetParam)
			}
			if len(params) > 0 {
				url += "?" + strings.Join(params, "&")
			}

			req := newTestRequestWithRequestID("GET", url, map[string]string{"database": "test_db"})
			w := httptest.NewRecorder()

			handler.ListTables(w, req)

			assert.Equal(t, tt.expectStatus, w.Code, "status code mismatch for %s", tt.name)
			if tt.expectError {
				assert.Contains(t, w.Body.String(), "VALIDATION_ERROR")
			}
		})
	}
}

// TEST-04: pagination validation for ListColumns
func TestListColumns_PaginationValidation(t *testing.T) {
	SetPaginationConfig(1, 500, 100)

	tests := []struct {
		name         string
		limitParam   string
		offsetParam  string
		expectStatus int
		expectError  bool
	}{
		{"default values", "", "", http.StatusOK, false},
		{"valid params", "50", "100", http.StatusOK, false},
		{"limit zero", "0", "", http.StatusBadRequest, true},
		{"offset negative", "100", "-1", http.StatusBadRequest, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			handler, assetRepo, _, _ := setupTestHandler()
			assetRepo.Columns = []domain.Column{{ID: "col-001", DatabaseName: "test_db", TableName: "users", ColumnName: "id"}}
			assetRepo.ColumnCount = 1

			url := "/api/v1/assets/databases/test_db/tables/users/columns"
			params := []string{}
			if tt.limitParam != "" {
				params = append(params, "limit="+tt.limitParam)
			}
			if tt.offsetParam != "" {
				params = append(params, "offset="+tt.offsetParam)
			}
			if len(params) > 0 {
				url += "?" + strings.Join(params, "&")
			}

			req := newTestRequestWithRequestID("GET", url, map[string]string{"database": "test_db", "table": "users"})
			w := httptest.NewRecorder()

			handler.ListColumns(w, req)

			assert.Equal(t, tt.expectStatus, w.Code, "status code mismatch for %s", tt.name)
			if tt.expectError {
				assert.Contains(t, w.Body.String(), "VALIDATION_ERROR")
			}
		})
	}
}

// PAGE-03: Pagination metadata in response
func TestListDatabases_PaginationMetadata(t *testing.T) {
	SetPaginationConfig(1, 500, 100)
	handler, assetRepo, _, _ := setupTestHandler()

	// Setup: 25 databases, request page with offset 10, limit 10
	for i := 0; i < 25; i++ {
		assetRepo.Databases = append(assetRepo.Databases, domain.Database{
			ID:   fmt.Sprintf("db-%03d", i),
			Name: fmt.Sprintf("database_%d", i),
		})
	}
	assetRepo.DatabaseCount = 25

	req := newTestRequestWithRequestID("GET", "/api/v1/assets/databases?limit=10&offset=10", nil)
	w := httptest.NewRecorder()

	handler.ListDatabases(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var response application.DatabaseListResponse
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	// Verify pagination metadata
	require.NotNil(t, response.Pagination, "pagination should be present")
	assert.Equal(t, 25, response.Pagination.TotalCount, "total_count should be 25")
	assert.Equal(t, 10, response.Pagination.Limit, "limit should be 10")
	assert.Equal(t, 10, response.Pagination.Offset, "offset should be 10")
	assert.True(t, response.Pagination.HasNext, "has_next should be true (10+10 < 25)")

	// Verify we got 10 items
	assert.Len(t, response.Databases, 10)
}

// PAGE-03: has_next is false on last page
func TestListDatabases_HasNextFalseOnLastPage(t *testing.T) {
	SetPaginationConfig(1, 500, 100)
	handler, assetRepo, _, _ := setupTestHandler()

	// Setup: 25 databases, request last page (offset 20, limit 10 = items 20-24)
	for i := 0; i < 25; i++ {
		assetRepo.Databases = append(assetRepo.Databases, domain.Database{
			ID:   fmt.Sprintf("db-%03d", i),
			Name: fmt.Sprintf("database_%d", i),
		})
	}
	assetRepo.DatabaseCount = 25

	req := newTestRequestWithRequestID("GET", "/api/v1/assets/databases?limit=10&offset=20", nil)
	w := httptest.NewRecorder()

	handler.ListDatabases(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var response application.DatabaseListResponse
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	require.NotNil(t, response.Pagination)
	assert.False(t, response.Pagination.HasNext, "has_next should be false on last page (20+10 >= 25)")
	assert.Len(t, response.Databases, 5, "should return remaining 5 items")
}

// PAGE-02: Default page size is 100
func TestListDatabases_DefaultPageSize(t *testing.T) {
	SetPaginationConfig(1, 500, 100)
	handler, assetRepo, _, _ := setupTestHandler()

	assetRepo.Databases = []domain.Database{{ID: "db-001", Name: "test"}}
	assetRepo.DatabaseCount = 1

	req := newTestRequestWithRequestID("GET", "/api/v1/assets/databases", nil)
	w := httptest.NewRecorder()

	handler.ListDatabases(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var response application.DatabaseListResponse
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	require.NotNil(t, response.Pagination)
	assert.Equal(t, 100, response.Pagination.Limit, "default limit should be 100")
	assert.Equal(t, 0, response.Pagination.Offset, "default offset should be 0")
}

// Verify multiple validation errors are reported
func TestListDatabases_MultipleValidationErrors(t *testing.T) {
	SetPaginationConfig(1, 500, 100)
	handler, _, _, _ := setupTestHandler()

	// Both limit and offset invalid
	req := newTestRequestWithRequestID("GET", "/api/v1/assets/databases?limit=abc&offset=-5", nil)
	w := httptest.NewRecorder()

	handler.ListDatabases(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)

	var response ValidationErrorResponse
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.Equal(t, "VALIDATION_ERROR", response.Code)
	assert.GreaterOrEqual(t, len(response.Details), 2, "should report both errors")

	// Verify both fields are mentioned
	fields := make(map[string]bool)
	for _, detail := range response.Details {
		fields[detail.Field] = true
	}
	assert.True(t, fields["limit"], "should include limit error")
	assert.True(t, fields["offset"], "should include offset error")
}
