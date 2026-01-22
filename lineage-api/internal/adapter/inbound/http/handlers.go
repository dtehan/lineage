package http

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/your-org/lineage-api/internal/application"
)

// Handler contains the HTTP handlers for the API.
type Handler struct {
	assetService   *application.AssetService
	lineageService *application.LineageService
	searchService  *application.SearchService
}

// NewHandler creates a new Handler.
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

// ListDatabases handles GET /api/v1/assets/databases
func (h *Handler) ListDatabases(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	databases, err := h.assetService.ListDatabases(ctx)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, application.DatabaseListResponse{
		Databases: databases,
		Total:     len(databases),
	})
}

// ListTables handles GET /api/v1/assets/databases/{database}/tables
func (h *Handler) ListTables(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	databaseName := chi.URLParam(r, "database")

	tables, err := h.assetService.ListTables(ctx, databaseName)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, application.TableListResponse{
		Tables: tables,
		Total:  len(tables),
	})
}

// ListColumns handles GET /api/v1/assets/databases/{database}/tables/{table}/columns
func (h *Handler) ListColumns(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	databaseName := chi.URLParam(r, "database")
	tableName := chi.URLParam(r, "table")

	columns, err := h.assetService.ListColumns(ctx, databaseName, tableName)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, application.ColumnListResponse{
		Columns: columns,
		Total:   len(columns),
	})
}

// GetLineage handles GET /api/v1/lineage/{assetId}
func (h *Handler) GetLineage(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	assetID := chi.URLParam(r, "assetId")

	direction := r.URL.Query().Get("direction")
	if direction == "" {
		direction = "both"
	}

	maxDepth := 5
	if depthStr := r.URL.Query().Get("maxDepth"); depthStr != "" {
		if d, err := strconv.Atoi(depthStr); err == nil {
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
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, response)
}

// GetUpstreamLineage handles GET /api/v1/lineage/{assetId}/upstream
func (h *Handler) GetUpstreamLineage(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	assetID := chi.URLParam(r, "assetId")

	maxDepth := 10
	if depthStr := r.URL.Query().Get("maxDepth"); depthStr != "" {
		if d, err := strconv.Atoi(depthStr); err == nil {
			maxDepth = d
		}
	}

	lineage, err := h.lineageService.GetUpstreamLineage(ctx, assetID, maxDepth)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, map[string]any{
		"assetId": assetID,
		"lineage": lineage,
	})
}

// GetDownstreamLineage handles GET /api/v1/lineage/{assetId}/downstream
func (h *Handler) GetDownstreamLineage(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	assetID := chi.URLParam(r, "assetId")

	maxDepth := 10
	if depthStr := r.URL.Query().Get("maxDepth"); depthStr != "" {
		if d, err := strconv.Atoi(depthStr); err == nil {
			maxDepth = d
		}
	}

	lineage, err := h.lineageService.GetDownstreamLineage(ctx, assetID, maxDepth)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, map[string]any{
		"assetId": assetID,
		"lineage": lineage,
	})
}

// GetImpactAnalysis handles GET /api/v1/lineage/{assetId}/impact
func (h *Handler) GetImpactAnalysis(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	assetID := chi.URLParam(r, "assetId")

	maxDepth := 10
	if depthStr := r.URL.Query().Get("maxDepth"); depthStr != "" {
		if d, err := strconv.Atoi(depthStr); err == nil {
			maxDepth = d
		}
	}

	response, err := h.lineageService.GetImpactAnalysis(ctx, assetID, maxDepth)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, response)
}

// Search handles GET /api/v1/search
func (h *Handler) Search(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	query := r.URL.Query().Get("q")
	if query == "" {
		respondError(w, http.StatusBadRequest, "query parameter 'q' is required")
		return
	}

	assetTypes := r.URL.Query()["type"]

	limit := 50
	if limitStr := r.URL.Query().Get("limit"); limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil {
			limit = l
		}
	}

	response, err := h.searchService.Search(ctx, application.SearchRequest{
		Query:      query,
		AssetTypes: assetTypes,
		Limit:      limit,
	})
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, response)
}
