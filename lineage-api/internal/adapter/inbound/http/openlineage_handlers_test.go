package http

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/lineage-api/internal/application"
	"github.com/lineage-api/internal/domain"
	"github.com/lineage-api/internal/domain/mocks"
)

// setupOpenLineageTestHandler creates an OpenLineageHandler with a mock repository.
// Follows the same pattern as setupTestHandler in handlers_test.go.
func setupOpenLineageTestHandler() (*OpenLineageHandler, *mocks.MockOpenLineageRepository) {
	olRepo := mocks.NewMockOpenLineageRepository()
	olService := application.NewOpenLineageService(olRepo)
	olHandler := NewOpenLineageHandler(olService)
	return olHandler, olRepo
}

// ptrInt64 returns a pointer to the given int64 value.
func ptrInt64(v int64) *int64 { return &v }

// =============================================================================
// Statistics Endpoint Tests (TEST-05)
// =============================================================================

// TestGetDatasetStatistics_Success verifies the handler returns 200 with statistics
// JSON for a known dataset of type TABLE.
func TestGetDatasetStatistics_Success(t *testing.T) {
	handler, olRepo := setupOpenLineageTestHandler()

	datasetID := "ns1/sales_db.customers"

	// Setup: dataset must exist for the service to proceed to statistics lookup
	olRepo.Datasets = []domain.OpenLineageDataset{
		{ID: datasetID, NamespaceID: "ns1", Name: "sales_db.customers"},
	}
	olRepo.Statistics[datasetID] = &domain.DatasetStatistics{
		DatasetID:    datasetID,
		DatabaseName: "sales_db",
		TableName:    "customers",
		SourceType:   "TABLE",
		CreatorName:  "admin",
		RowCount:     ptrInt64(1500),
		SizeBytes:    ptrInt64(52428800),
	}

	req := newTestRequestWithRequestID("GET", "/api/v2/openlineage/datasets/"+datasetID+"/statistics", map[string]string{"datasetId": datasetID})
	w := httptest.NewRecorder()

	handler.GetDatasetStatistics(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, "application/json", w.Header().Get("Content-Type"))

	var response application.DatasetStatisticsResponse
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.Equal(t, "TABLE", response.SourceType)
	assert.Equal(t, "admin", response.CreatorName)
	require.NotNil(t, response.RowCount)
	assert.Equal(t, int64(1500), *response.RowCount)
	require.NotNil(t, response.SizeBytes)
	assert.Equal(t, int64(52428800), *response.SizeBytes)
	assert.Equal(t, "sales_db", response.DatabaseName)
	assert.Equal(t, "customers", response.TableName)
}

// TestGetDatasetStatistics_ViewSuccess verifies the handler returns 200 for a VIEW
// dataset where SizeBytes is nil (views have null size).
func TestGetDatasetStatistics_ViewSuccess(t *testing.T) {
	handler, olRepo := setupOpenLineageTestHandler()

	datasetID := "ns1/analytics_db.customer_summary"

	olRepo.Datasets = []domain.OpenLineageDataset{
		{ID: datasetID, NamespaceID: "ns1", Name: "analytics_db.customer_summary"},
	}
	olRepo.Statistics[datasetID] = &domain.DatasetStatistics{
		DatasetID:    datasetID,
		DatabaseName: "analytics_db",
		TableName:    "customer_summary",
		SourceType:   "VIEW",
		CreatorName:  "analyst",
		RowCount:     ptrInt64(500),
		SizeBytes:    nil, // Views have null size
	}

	req := newTestRequestWithRequestID("GET", "/api/v2/openlineage/datasets/"+datasetID+"/statistics", map[string]string{"datasetId": datasetID})
	w := httptest.NewRecorder()

	handler.GetDatasetStatistics(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var response application.DatasetStatisticsResponse
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.Equal(t, "VIEW", response.SourceType)
	assert.Nil(t, response.SizeBytes, "views should have null sizeBytes")
	require.NotNil(t, response.RowCount)
	assert.Equal(t, int64(500), *response.RowCount)
}

// TestGetDatasetStatistics_NotFound verifies the handler returns 404 when the
// dataset does not exist.
func TestGetDatasetStatistics_NotFound(t *testing.T) {
	handler, _ := setupOpenLineageTestHandler()

	// No datasets or statistics configured -- "nonexistent" will not be found
	req := newTestRequestWithRequestID("GET", "/api/v2/openlineage/datasets/nonexistent/statistics", map[string]string{"datasetId": "nonexistent"})
	w := httptest.NewRecorder()

	handler.GetDatasetStatistics(w, req)

	assert.Equal(t, http.StatusNotFound, w.Code)

	var resp map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &resp)
	require.NoError(t, err)
	assert.Equal(t, "Dataset not found", resp["error"])
}

// TestGetDatasetStatistics_InternalError verifies the handler returns 500 with a
// generic error message and does NOT leak any sensitive database information.
func TestGetDatasetStatistics_InternalError(t *testing.T) {
	handler, olRepo := setupOpenLineageTestHandler()

	datasetID := "ns1/sales_db.customers"

	// Dataset exists so service proceeds to statistics lookup
	olRepo.Datasets = []domain.OpenLineageDataset{
		{ID: datasetID, NamespaceID: "ns1", Name: "sales_db.customers"},
	}
	// Inject error on statistics retrieval
	olRepo.GetDatasetStatisticsErr = errors.New("teradatasql.Error: [SQLState HY000] db connection failed to clearscape.teradata.com demo_user SELECT FROM LIN_DATABASE")

	req := newTestRequestWithRequestID("GET", "/api/v2/openlineage/datasets/"+datasetID+"/statistics", map[string]string{"datasetId": datasetID})
	w := httptest.NewRecorder()

	handler.GetDatasetStatistics(w, req)

	assert.Equal(t, http.StatusInternalServerError, w.Code)

	var resp map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &resp)
	require.NoError(t, err)

	// Verify generic error message
	assert.Equal(t, "Internal server error", resp["error"])
	assert.NotEmpty(t, resp["request_id"])

	// Security verification: no sensitive patterns in response body
	body := w.Body.String()
	for _, pattern := range sensitivePatterns {
		assert.NotContains(t, body, pattern, "Response should not contain sensitive pattern: %s", pattern)
	}
}

// TestGetDatasetStatistics_URLDecoding verifies the handler correctly decodes
// URL-encoded datasetId values (e.g., "/" encoded as "%2F").
func TestGetDatasetStatistics_URLDecoding(t *testing.T) {
	handler, olRepo := setupOpenLineageTestHandler()

	// The decoded dataset ID -- Chi URL params are already decoded when accessed
	decodedID := "ns1/sales_db.customers"

	olRepo.Datasets = []domain.OpenLineageDataset{
		{ID: decodedID, NamespaceID: "ns1", Name: "sales_db.customers"},
	}
	olRepo.Statistics[decodedID] = &domain.DatasetStatistics{
		DatasetID:    decodedID,
		DatabaseName: "sales_db",
		TableName:    "customers",
		SourceType:   "TABLE",
		RowCount:     ptrInt64(100),
	}

	// URL-encoded path, but Chi provides decoded params
	req := newTestRequestWithRequestID("GET", "/api/v2/openlineage/datasets/ns1%2Fsales_db.customers/statistics", map[string]string{"datasetId": decodedID})
	w := httptest.NewRecorder()

	handler.GetDatasetStatistics(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var response application.DatasetStatisticsResponse
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.Equal(t, decodedID, response.DatasetID)
	assert.Equal(t, "TABLE", response.SourceType)
}

// =============================================================================
// DDL Endpoint Tests (TEST-05)
// =============================================================================

// TestGetDatasetDDL_ViewSuccess verifies the handler returns 200 with DDL JSON
// for a VIEW dataset, including viewSql and tableComment.
func TestGetDatasetDDL_ViewSuccess(t *testing.T) {
	handler, olRepo := setupOpenLineageTestHandler()

	datasetID := "ns1/analytics_db.customer_view"

	olRepo.Datasets = []domain.OpenLineageDataset{
		{ID: datasetID, NamespaceID: "ns1", Name: "analytics_db.customer_view"},
	}
	olRepo.DDLData[datasetID] = &domain.DatasetDDL{
		DatasetID:    datasetID,
		DatabaseName: "analytics_db",
		TableName:    "customer_view",
		SourceType:   "VIEW",
		ViewSQL:      "CREATE VIEW customer_view AS SELECT id, name FROM customers",
		Truncated:    false,
		TableComment: "Summary view",
	}

	req := newTestRequestWithRequestID("GET", "/api/v2/openlineage/datasets/"+datasetID+"/ddl", map[string]string{"datasetId": datasetID})
	w := httptest.NewRecorder()

	handler.GetDatasetDDL(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var response application.DatasetDDLResponse
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.Equal(t, "VIEW", response.SourceType)
	assert.Contains(t, response.ViewSQL, "CREATE VIEW")
	assert.Equal(t, "Summary view", response.TableComment)
	assert.False(t, response.Truncated)
}

// TestGetDatasetDDL_TableSuccess verifies the handler returns 200 for a TABLE
// dataset where ViewSQL is empty (tables have no view SQL).
func TestGetDatasetDDL_TableSuccess(t *testing.T) {
	handler, olRepo := setupOpenLineageTestHandler()

	datasetID := "ns1/sales_db.orders"

	olRepo.Datasets = []domain.OpenLineageDataset{
		{ID: datasetID, NamespaceID: "ns1", Name: "sales_db.orders"},
	}
	olRepo.DDLData[datasetID] = &domain.DatasetDDL{
		DatasetID:    datasetID,
		DatabaseName: "sales_db",
		TableName:    "orders",
		SourceType:   "TABLE",
		ViewSQL:      "", // Tables have no view SQL
		Truncated:    false,
		TableComment: "Order transactions",
	}

	req := newTestRequestWithRequestID("GET", "/api/v2/openlineage/datasets/"+datasetID+"/ddl", map[string]string{"datasetId": datasetID})
	w := httptest.NewRecorder()

	handler.GetDatasetDDL(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	// Parse as raw JSON to verify viewSql is absent (omitempty)
	var rawResp map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &rawResp)
	require.NoError(t, err)

	assert.Equal(t, "TABLE", rawResp["sourceType"])
	_, hasViewSql := rawResp["viewSql"]
	assert.False(t, hasViewSql, "viewSql should be omitted for tables (omitempty)")
	assert.Equal(t, "Order transactions", rawResp["tableComment"])
}

// TestGetDatasetDDL_TruncatedWarning verifies the handler returns truncated=true
// when the DDL text was truncated by the database.
func TestGetDatasetDDL_TruncatedWarning(t *testing.T) {
	handler, olRepo := setupOpenLineageTestHandler()

	datasetID := "ns1/analytics_db.complex_view"

	olRepo.Datasets = []domain.OpenLineageDataset{
		{ID: datasetID, NamespaceID: "ns1", Name: "analytics_db.complex_view"},
	}
	olRepo.DDLData[datasetID] = &domain.DatasetDDL{
		DatasetID:    datasetID,
		DatabaseName: "analytics_db",
		TableName:    "complex_view",
		SourceType:   "VIEW",
		ViewSQL:      "CREATE VIEW complex_view AS SELECT ... (truncated)",
		Truncated:    true,
	}

	req := newTestRequestWithRequestID("GET", "/api/v2/openlineage/datasets/"+datasetID+"/ddl", map[string]string{"datasetId": datasetID})
	w := httptest.NewRecorder()

	handler.GetDatasetDDL(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var response application.DatasetDDLResponse
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.True(t, response.Truncated, "truncated flag should be true")
}

// TestGetDatasetDDL_NotFound verifies the handler returns 404 when the dataset
// does not exist.
func TestGetDatasetDDL_NotFound(t *testing.T) {
	handler, _ := setupOpenLineageTestHandler()

	// No datasets or DDL configured
	req := newTestRequestWithRequestID("GET", "/api/v2/openlineage/datasets/nonexistent/ddl", map[string]string{"datasetId": "nonexistent"})
	w := httptest.NewRecorder()

	handler.GetDatasetDDL(w, req)

	assert.Equal(t, http.StatusNotFound, w.Code)

	var resp map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &resp)
	require.NoError(t, err)
	assert.Equal(t, "Dataset not found", resp["error"])
}

// TestGetDatasetDDL_InternalError verifies the handler returns 500 with a generic
// error message and does NOT leak any sensitive database information.
func TestGetDatasetDDL_InternalError(t *testing.T) {
	handler, olRepo := setupOpenLineageTestHandler()

	datasetID := "ns1/sales_db.orders"

	// Dataset exists so service proceeds to DDL lookup
	olRepo.Datasets = []domain.OpenLineageDataset{
		{ID: datasetID, NamespaceID: "ns1", Name: "sales_db.orders"},
	}
	// Inject error on DDL retrieval
	olRepo.GetDatasetDDLErr = errors.New("teradatasql.Error: [SQLState HY000] db connection failed to clearscape.teradata.com demo_user SELECT FROM LIN_DATABASE")

	req := newTestRequestWithRequestID("GET", "/api/v2/openlineage/datasets/"+datasetID+"/ddl", map[string]string{"datasetId": datasetID})
	w := httptest.NewRecorder()

	handler.GetDatasetDDL(w, req)

	assert.Equal(t, http.StatusInternalServerError, w.Code)

	var resp map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &resp)
	require.NoError(t, err)

	// Verify generic error message
	assert.Equal(t, "Internal server error", resp["error"])
	assert.NotEmpty(t, resp["request_id"])

	// Security verification: no sensitive patterns in response body
	body := w.Body.String()
	for _, pattern := range sensitivePatterns {
		assert.NotContains(t, body, pattern, "Response should not contain sensitive pattern: %s", pattern)
	}
}

// TestGetDatasetDDL_WithColumnComments verifies the handler returns column comments
// in the DDL response when they are present.
func TestGetDatasetDDL_WithColumnComments(t *testing.T) {
	handler, olRepo := setupOpenLineageTestHandler()

	datasetID := "ns1/sales_db.customers"

	olRepo.Datasets = []domain.OpenLineageDataset{
		{ID: datasetID, NamespaceID: "ns1", Name: "sales_db.customers"},
	}
	olRepo.DDLData[datasetID] = &domain.DatasetDDL{
		DatasetID:    datasetID,
		DatabaseName: "sales_db",
		TableName:    "customers",
		SourceType:   "TABLE",
		Truncated:    false,
		TableComment: "Customer master data",
		ColumnComments: map[string]string{
			"id":    "Primary key",
			"name":  "Customer full name",
			"email": "Contact email address",
		},
	}

	req := newTestRequestWithRequestID("GET", "/api/v2/openlineage/datasets/"+datasetID+"/ddl", map[string]string{"datasetId": datasetID})
	w := httptest.NewRecorder()

	handler.GetDatasetDDL(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var response application.DatasetDDLResponse
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	require.NotNil(t, response.ColumnComments)
	assert.Len(t, response.ColumnComments, 3)
	assert.Equal(t, "Primary key", response.ColumnComments["id"])
	assert.Equal(t, "Customer full name", response.ColumnComments["name"])
	assert.Equal(t, "Contact email address", response.ColumnComments["email"])
}
