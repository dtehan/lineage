package http

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/lineage-api/internal/application"
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
		respondError(w, http.StatusInternalServerError, err.Error())
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
		respondError(w, http.StatusInternalServerError, err.Error())
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
		respondError(w, http.StatusInternalServerError, err.Error())
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
		respondError(w, http.StatusInternalServerError, err.Error())
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
		respondError(w, http.StatusInternalServerError, err.Error())
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
		respondError(w, http.StatusInternalServerError, err.Error())
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
		respondError(w, http.StatusInternalServerError, err.Error())
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
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, response)
}
