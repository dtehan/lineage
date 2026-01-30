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

	databases, err := h.assetService.ListDatabases(ctx)
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

	respondJSON(w, http.StatusOK, application.DatabaseListResponse{
		Databases: databases,
		Total:     len(databases),
	})
}

func (h *Handler) ListTables(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	databaseName := chi.URLParam(r, "database")

	tables, err := h.assetService.ListTables(ctx, databaseName)
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

	respondJSON(w, http.StatusOK, application.TableListResponse{
		Tables: tables,
		Total:  len(tables),
	})
}

func (h *Handler) ListColumns(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	databaseName := chi.URLParam(r, "database")
	tableName := chi.URLParam(r, "table")

	columns, err := h.assetService.ListColumns(ctx, databaseName, tableName)
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

	respondJSON(w, http.StatusOK, application.ColumnListResponse{
		Columns: columns,
		Total:   len(columns),
	})
}

func (h *Handler) GetLineage(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	assetID := chi.URLParam(r, "assetId")

	direction := r.URL.Query().Get("direction")
	if direction == "" {
		direction = "both"
	}

	maxDepthStr := r.URL.Query().Get("maxDepth")
	maxDepth := 5
	if maxDepthStr != "" {
		if d, err := strconv.Atoi(maxDepthStr); err == nil {
			maxDepth = d
		}
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

	maxDepthStr := r.URL.Query().Get("maxDepth")
	maxDepth := 10
	if maxDepthStr != "" {
		if d, err := strconv.Atoi(maxDepthStr); err == nil {
			maxDepth = d
		}
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

	maxDepthStr := r.URL.Query().Get("maxDepth")
	maxDepth := 10
	if maxDepthStr != "" {
		if d, err := strconv.Atoi(maxDepthStr); err == nil {
			maxDepth = d
		}
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

	maxDepthStr := r.URL.Query().Get("maxDepth")
	maxDepth := 10
	if maxDepthStr != "" {
		if d, err := strconv.Atoi(maxDepthStr); err == nil {
			maxDepth = d
		}
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
