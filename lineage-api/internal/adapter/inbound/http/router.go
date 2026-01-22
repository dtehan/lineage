package http

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
)

// NewRouter creates a new router with all routes configured.
func NewRouter(handler *Handler) http.Handler {
	r := chi.NewRouter()

	// Middleware
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(60 * time.Second))

	// CORS
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"http://localhost:3000", "http://localhost:5173"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	// Health check
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		respondJSON(w, http.StatusOK, map[string]string{"status": "healthy"})
	})

	// API v1
	r.Route("/api/v1", func(r chi.Router) {
		// Assets
		r.Route("/assets", func(r chi.Router) {
			r.Get("/databases", handler.ListDatabases)
			r.Get("/databases/{database}/tables", handler.ListTables)
			r.Get("/databases/{database}/tables/{table}/columns", handler.ListColumns)
		})

		// Lineage
		r.Route("/lineage/{assetId}", func(r chi.Router) {
			r.Get("/", handler.GetLineage)
			r.Get("/upstream", handler.GetUpstreamLineage)
			r.Get("/downstream", handler.GetDownstreamLineage)
			r.Get("/impact", handler.GetImpactAnalysis)
		})

		// Search
		r.Get("/search", handler.Search)
	})

	return r
}
