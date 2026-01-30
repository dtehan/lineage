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

type Handler struct {
	assetService   *application.AssetService
	lineageService *application.LineageService
	searchService  *application.SearchService
}

func NewHandler(
	assetService *application.AssetService,
	lineageService *application.LineageService,
	searchService *application.SearchService,
) *Handler {
	return &Handler{
		assetService:   assetService,
		lineageService: lineageService,
		searchService:  searchService,
	}
}

func (h *Handler) Health(w http.ResponseWriter, r *http.Request) {
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Handler) ListDatabases(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	// Validate pagination params
	limit, offset, validationErrors := parseAndValidatePaginationParams(r)
	if len(validationErrors) > 0 {
		respondValidationError(w, r, validationErrors)
		return
	}

	databases, totalCount, err := h.assetService.ListDatabasesPaginated(ctx, limit, offset)
	if err != nil {
		requestID := middleware.GetReqID(ctx)
		slog.ErrorContext(ctx, "failed to list databases",
			"request_id", requestID,
			"error", err,
			"stack", logging.CaptureStack(),
			"method", r.Method,
			"path", r.URL.Path,
		)
		respondError(w, r, http.StatusInternalServerError, "Internal server error")
		return
	}

	hasNext := offset+limit < totalCount

	respondJSON(w, http.StatusOK, application.DatabaseListResponse{
		Databases: databases,
		Total:     len(databases),
		Pagination: &application.PaginationMeta{
			TotalCount: totalCount,
			Limit:      limit,
			Offset:     offset,
			HasNext:    hasNext,
		},
	})
}

func (h *Handler) ListTables(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	databaseName := chi.URLParam(r, "database")

	// Validate pagination params
	limit, offset, validationErrors := parseAndValidatePaginationParams(r)
	if len(validationErrors) > 0 {
		respondValidationError(w, r, validationErrors)
		return
	}

	tables, totalCount, err := h.assetService.ListTablesPaginated(ctx, databaseName, limit, offset)
	if err != nil {
		requestID := middleware.GetReqID(ctx)
		slog.ErrorContext(ctx, "failed to list tables",
			"request_id", requestID,
			"error", err,
			"stack", logging.CaptureStack(),
			"method", r.Method,
			"path", r.URL.Path,
			"database_name", databaseName,
		)
		respondError(w, r, http.StatusInternalServerError, "Internal server error")
		return
	}

	hasNext := offset+limit < totalCount

	respondJSON(w, http.StatusOK, application.TableListResponse{
		Tables: tables,
		Total:  len(tables),
		Pagination: &application.PaginationMeta{
			TotalCount: totalCount,
			Limit:      limit,
			Offset:     offset,
			HasNext:    hasNext,
		},
	})
}

func (h *Handler) ListColumns(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	databaseName := chi.URLParam(r, "database")
	tableName := chi.URLParam(r, "table")

	// Validate pagination params
	limit, offset, validationErrors := parseAndValidatePaginationParams(r)
	if len(validationErrors) > 0 {
		respondValidationError(w, r, validationErrors)
		return
	}

	columns, totalCount, err := h.assetService.ListColumnsPaginated(ctx, databaseName, tableName, limit, offset)
	if err != nil {
		requestID := middleware.GetReqID(ctx)
		slog.ErrorContext(ctx, "failed to list columns",
			"request_id", requestID,
			"error", err,
			"stack", logging.CaptureStack(),
			"method", r.Method,
			"path", r.URL.Path,
			"database_name", databaseName,
			"table_name", tableName,
		)
		respondError(w, r, http.StatusInternalServerError, "Internal server error")
		return
	}

	hasNext := offset+limit < totalCount

	respondJSON(w, http.StatusOK, application.ColumnListResponse{
		Columns: columns,
		Total:   len(columns),
		Pagination: &application.PaginationMeta{
			TotalCount: totalCount,
			Limit:      limit,
			Offset:     offset,
			HasNext:    hasNext,
		},
	})
}

func (h *Handler) GetLineage(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	assetID := chi.URLParam(r, "assetId")

	// Validate parameters - returns 400 if invalid
	direction, maxDepth, validationErrors := parseAndValidateLineageParams(r)
	if len(validationErrors) > 0 {
		respondValidationError(w, r, validationErrors)
		return
	}

	req := application.GetLineageRequest{
		AssetID:   assetID,
		Direction: direction,
		MaxDepth:  maxDepth,
	}

	response, err := h.lineageService.GetLineageGraph(ctx, req)
	if err != nil {
		requestID := middleware.GetReqID(ctx)
		slog.ErrorContext(ctx, "failed to get lineage",
			"request_id", requestID,
			"error", err,
			"stack", logging.CaptureStack(),
			"method", r.Method,
			"path", r.URL.Path,
			"asset_id", assetID,
		)
		respondError(w, r, http.StatusInternalServerError, "Internal server error")
		return
	}

	respondJSON(w, http.StatusOK, response)
}

func (h *Handler) GetUpstreamLineage(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	assetID := chi.URLParam(r, "assetId")

	// Validate maxDepth - returns 400 if invalid
	maxDepth, validationErrors := parseAndValidateMaxDepth(r, 10) // Default 10 for upstream
	if len(validationErrors) > 0 {
		respondValidationError(w, r, validationErrors)
		return
	}

	response, err := h.lineageService.GetUpstreamLineage(ctx, assetID, maxDepth)
	if err != nil {
		requestID := middleware.GetReqID(ctx)
		slog.ErrorContext(ctx, "failed to get upstream lineage",
			"request_id", requestID,
			"error", err,
			"stack", logging.CaptureStack(),
			"method", r.Method,
			"path", r.URL.Path,
			"asset_id", assetID,
		)
		respondError(w, r, http.StatusInternalServerError, "Internal server error")
		return
	}

	respondJSON(w, http.StatusOK, response)
}

func (h *Handler) GetDownstreamLineage(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	assetID := chi.URLParam(r, "assetId")

	// Validate maxDepth - returns 400 if invalid
	maxDepth, validationErrors := parseAndValidateMaxDepth(r, 10) // Default 10 for downstream
	if len(validationErrors) > 0 {
		respondValidationError(w, r, validationErrors)
		return
	}

	response, err := h.lineageService.GetDownstreamLineage(ctx, assetID, maxDepth)
	if err != nil {
		requestID := middleware.GetReqID(ctx)
		slog.ErrorContext(ctx, "failed to get downstream lineage",
			"request_id", requestID,
			"error", err,
			"stack", logging.CaptureStack(),
			"method", r.Method,
			"path", r.URL.Path,
			"asset_id", assetID,
		)
		respondError(w, r, http.StatusInternalServerError, "Internal server error")
		return
	}

	respondJSON(w, http.StatusOK, response)
}

func (h *Handler) GetImpactAnalysis(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	assetID := chi.URLParam(r, "assetId")

	// Validate maxDepth - returns 400 if invalid
	maxDepth, validationErrors := parseAndValidateMaxDepth(r, 10) // Default 10 for impact
	if len(validationErrors) > 0 {
		respondValidationError(w, r, validationErrors)
		return
	}

	response, err := h.lineageService.GetImpactAnalysis(ctx, assetID, maxDepth)
	if err != nil {
		requestID := middleware.GetReqID(ctx)
		slog.ErrorContext(ctx, "failed to get impact analysis",
			"request_id", requestID,
			"error", err,
			"stack", logging.CaptureStack(),
			"method", r.Method,
			"path", r.URL.Path,
			"asset_id", assetID,
		)
		respondError(w, r, http.StatusInternalServerError, "Internal server error")
		return
	}

	respondJSON(w, http.StatusOK, response)
}

func (h *Handler) Search(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	query := r.URL.Query().Get("q")

	limitStr := r.URL.Query().Get("limit")
	limit := 50
	if limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil {
			limit = l
		}
	}

	assetTypes := r.URL.Query()["type"]

	req := application.SearchRequest{
		Query:      query,
		AssetTypes: assetTypes,
		Limit:      limit,
	}

	response, err := h.searchService.Search(ctx, req)
	if err != nil {
		requestID := middleware.GetReqID(ctx)
		slog.ErrorContext(ctx, "failed to search",
			"request_id", requestID,
			"error", err,
			"stack", logging.CaptureStack(),
			"method", r.Method,
			"path", r.URL.Path,
			"query", query,
		)
		respondError(w, r, http.StatusInternalServerError, "Internal server error")
		return
	}

	respondJSON(w, http.StatusOK, response)
}
