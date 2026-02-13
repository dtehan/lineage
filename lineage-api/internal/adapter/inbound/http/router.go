package http

import (
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
)

func NewRouter(h *Handler, olHandler *OpenLineageHandler) *chi.Mux {
	r := chi.NewRouter()

	// Middleware
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.RequestID)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"http://localhost:3000", "http://localhost:5173"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-Request-ID"},
		ExposedHeaders:   []string{"Link", "X-Cache", "X-Cache-TTL"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	// Health check
	r.Get("/health", h.Health)

	// API v1 routes (backward compatible)
	r.Route("/api/v1", func(r chi.Router) {
		// Asset routes
		r.Route("/assets", func(r chi.Router) {
			r.Get("/databases", h.ListDatabases)
			r.Get("/databases/{database}/tables", h.ListTables)
			r.Get("/databases/{database}/tables/{table}/columns", h.ListColumns)
		})

		// Lineage routes
		r.Route("/lineage", func(r chi.Router) {
			r.Get("/{assetId}", h.GetLineage)
			r.Get("/{assetId}/upstream", h.GetUpstreamLineage)
			r.Get("/{assetId}/downstream", h.GetDownstreamLineage)
			r.Get("/{assetId}/impact", h.GetImpactAnalysis)
		})

		// Search routes
		r.Get("/search", h.Search)
	})

	// API v2 routes - OpenLineage aligned
	if olHandler != nil {
		r.Route("/api/v2/openlineage", func(r chi.Router) {
			r.Use(CacheControl)

			// Namespace routes
			r.Get("/namespaces", olHandler.ListNamespaces)
			r.Get("/namespaces/{namespaceId}", olHandler.GetNamespace)
			r.Get("/namespaces/{namespaceId}/datasets", olHandler.ListDatasets)

			// Dataset routes
			r.Get("/datasets/search", olHandler.SearchDatasets)
			r.Get("/datasets/{datasetId}", olHandler.GetDataset)
			r.Get("/datasets/{datasetId}/statistics", olHandler.GetDatasetStatistics)
			r.Get("/datasets/{datasetId}/ddl", olHandler.GetDatasetDDL)

			// Lineage routes
			r.Get("/lineage/{datasetId}/{fieldName}", olHandler.GetLineageGraph)
		})
	}

	return r
}
