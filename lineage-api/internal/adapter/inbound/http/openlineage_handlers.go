package http

import (
	"log/slog"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/lineage-api/internal/application"
	"github.com/lineage-api/internal/infrastructure/logging"
)

// OpenLineageHandler handles OpenLineage API requests
type OpenLineageHandler struct {
	service *application.OpenLineageService
}

// NewOpenLineageHandler creates new OpenLineage handlers
func NewOpenLineageHandler(service *application.OpenLineageService) *OpenLineageHandler {
	return &OpenLineageHandler{service: service}
}

// ListNamespaces handles GET /api/v2/openlineage/namespaces
func (h *OpenLineageHandler) ListNamespaces(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	namespaces, err := h.service.ListNamespaces(ctx)
	if err != nil {
		requestID := middleware.GetReqID(ctx)
		slog.ErrorContext(ctx, "failed to list namespaces",
			"request_id", requestID,
			"error", err,
			"stack", logging.CaptureStack(),
			"method", r.Method,
			"path", r.URL.Path,
		)
		respondError(w, r, http.StatusInternalServerError, "Internal server error")
		return
	}

	respondJSON(w, http.StatusOK, map[string]any{
		"namespaces": namespaces,
	})
}

// GetNamespace handles GET /api/v2/openlineage/namespaces/{namespaceId}
func (h *OpenLineageHandler) GetNamespace(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	namespaceID := chi.URLParam(r, "namespaceId")

	ns, err := h.service.GetNamespace(ctx, namespaceID)
	if err != nil {
		requestID := middleware.GetReqID(ctx)
		slog.ErrorContext(ctx, "failed to get namespace",
			"request_id", requestID,
			"namespace_id", namespaceID,
			"error", err,
			"stack", logging.CaptureStack(),
			"method", r.Method,
			"path", r.URL.Path,
		)
		respondError(w, r, http.StatusInternalServerError, "Internal server error")
		return
	}

	if ns == nil {
		respondError(w, r, http.StatusNotFound, "Namespace not found")
		return
	}

	respondJSON(w, http.StatusOK, ns)
}

// ListDatasets handles GET /api/v2/openlineage/namespaces/{namespaceId}/datasets
func (h *OpenLineageHandler) ListDatasets(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	namespaceID := chi.URLParam(r, "namespaceId")

	// Parse pagination params
	limit, offset, validationErrors := parseAndValidatePaginationParams(r)
	if len(validationErrors) > 0 {
		respondValidationError(w, r, validationErrors)
		return
	}

	datasets, err := h.service.ListDatasets(ctx, namespaceID, limit, offset)
	if err != nil {
		requestID := middleware.GetReqID(ctx)
		slog.ErrorContext(ctx, "failed to list datasets",
			"request_id", requestID,
			"namespace_id", namespaceID,
			"error", err,
			"stack", logging.CaptureStack(),
			"method", r.Method,
			"path", r.URL.Path,
		)
		respondError(w, r, http.StatusInternalServerError, "Internal server error")
		return
	}

	respondJSON(w, http.StatusOK, datasets)
}

// GetDataset handles GET /api/v2/openlineage/datasets/{datasetId}
func (h *OpenLineageHandler) GetDataset(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	datasetID := chi.URLParam(r, "datasetId")

	ds, err := h.service.GetDataset(ctx, datasetID)
	if err != nil {
		requestID := middleware.GetReqID(ctx)
		slog.ErrorContext(ctx, "failed to get dataset",
			"request_id", requestID,
			"dataset_id", datasetID,
			"error", err,
			"stack", logging.CaptureStack(),
			"method", r.Method,
			"path", r.URL.Path,
		)
		respondError(w, r, http.StatusInternalServerError, "Internal server error")
		return
	}

	if ds == nil {
		respondError(w, r, http.StatusNotFound, "Dataset not found")
		return
	}

	respondJSON(w, http.StatusOK, ds)
}

// SearchDatasets handles GET /api/v2/openlineage/datasets/search
func (h *OpenLineageHandler) SearchDatasets(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	query := r.URL.Query().Get("q")

	if query == "" {
		respondValidationError(w, r, []FieldError{{
			Field:   "q",
			Message: "Query parameter 'q' is required",
		}})
		return
	}

	limit := paginationDefaultLimit
	if l := r.URL.Query().Get("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 && parsed <= paginationMaxLimit {
			limit = parsed
		}
	}

	datasets, err := h.service.SearchDatasets(ctx, query, limit)
	if err != nil {
		requestID := middleware.GetReqID(ctx)
		slog.ErrorContext(ctx, "failed to search datasets",
			"request_id", requestID,
			"query", query,
			"error", err,
			"stack", logging.CaptureStack(),
			"method", r.Method,
			"path", r.URL.Path,
		)
		respondError(w, r, http.StatusInternalServerError, "Internal server error")
		return
	}

	respondJSON(w, http.StatusOK, map[string]any{
		"datasets": datasets,
		"query":    query,
		"count":    len(datasets),
	})
}

// GetLineageGraph handles GET /api/v2/openlineage/lineage/{datasetId}/{fieldName}
func (h *OpenLineageHandler) GetLineageGraph(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	datasetID := chi.URLParam(r, "datasetId")
	fieldName := chi.URLParam(r, "fieldName")

	// Parse and validate direction
	direction := r.URL.Query().Get("direction")
	if direction == "" {
		direction = "both"
	}
	if direction != "upstream" && direction != "downstream" && direction != "both" {
		respondValidationError(w, r, []FieldError{{
			Field:   "direction",
			Message: "direction must be one of: upstream, downstream, both",
		}})
		return
	}

	// Validate maxDepth
	maxDepth, validationErrors := parseAndValidateMaxDepth(r, validationDefaultMaxDepth)
	if len(validationErrors) > 0 {
		respondValidationError(w, r, validationErrors)
		return
	}

	lineage, err := h.service.GetLineageGraph(ctx, datasetID, fieldName, direction, maxDepth)
	if err != nil {
		requestID := middleware.GetReqID(ctx)
		slog.ErrorContext(ctx, "failed to get lineage graph",
			"request_id", requestID,
			"dataset_id", datasetID,
			"field_name", fieldName,
			"direction", direction,
			"max_depth", maxDepth,
			"error", err,
			"stack", logging.CaptureStack(),
			"method", r.Method,
			"path", r.URL.Path,
		)
		respondError(w, r, http.StatusInternalServerError, "Internal server error")
		return
	}

	respondJSON(w, http.StatusOK, lineage)
}

// GetDatasetStatistics handles GET /api/v2/openlineage/datasets/{datasetId}/statistics
func (h *OpenLineageHandler) GetDatasetStatistics(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	datasetID := chi.URLParam(r, "datasetId")

	stats, err := h.service.GetDatasetStatistics(ctx, datasetID)
	if err != nil {
		requestID := middleware.GetReqID(ctx)
		slog.ErrorContext(ctx, "failed to get dataset statistics",
			"request_id", requestID,
			"dataset_id", datasetID,
			"error", err,
			"stack", logging.CaptureStack(),
			"method", r.Method,
			"path", r.URL.Path,
		)
		respondError(w, r, http.StatusInternalServerError, "Internal server error")
		return
	}

	if stats == nil {
		respondError(w, r, http.StatusNotFound, "Dataset not found")
		return
	}

	respondJSON(w, http.StatusOK, stats)
}

// GetDatasetDDL handles GET /api/v2/openlineage/datasets/{datasetId}/ddl
func (h *OpenLineageHandler) GetDatasetDDL(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	datasetID := chi.URLParam(r, "datasetId")

	ddl, err := h.service.GetDatasetDDL(ctx, datasetID)
	if err != nil {
		requestID := middleware.GetReqID(ctx)
		slog.ErrorContext(ctx, "failed to get dataset DDL",
			"request_id", requestID,
			"dataset_id", datasetID,
			"error", err,
			"stack", logging.CaptureStack(),
			"method", r.Method,
			"path", r.URL.Path,
		)
		respondError(w, r, http.StatusInternalServerError, "Internal server error")
		return
	}

	if ddl == nil {
		respondError(w, r, http.StatusNotFound, "Dataset not found")
		return
	}

	respondJSON(w, http.StatusOK, ddl)
}
