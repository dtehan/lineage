package main

import (
	"context"
	"log"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	httpAdapter "github.com/lineage-api/internal/adapter/inbound/http"
	"github.com/lineage-api/internal/adapter/outbound/teradata"
	"github.com/lineage-api/internal/application"
	"github.com/lineage-api/internal/infrastructure/config"
	"github.com/lineage-api/internal/infrastructure/logging"
)

func main() {
	// Initialize structured JSON logging
	logger := logging.NewLogger(slog.LevelInfo)
	logging.SetDefault(logger)

	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Failed to load configuration: %v", err)
	}

	// Initialize validation configuration from loaded config
	httpAdapter.SetValidationConfig(
		cfg.Validation.MinMaxDepth,
		cfg.Validation.MaxDepthLimit,
		cfg.Validation.DefaultMaxDepth,
	)

	// Database connection
	db, err := teradata.NewConnection(cfg.Teradata)
	if err != nil {
		log.Fatalf("Failed to connect to Teradata: %v", err)
	}
	defer db.Close()

	// Repositories
	assetRepo := teradata.NewAssetRepository(db)
	lineageRepo := teradata.NewLineageRepository(db, assetRepo)
	searchRepo := teradata.NewSearchRepository(db)

	// Services
	assetService := application.NewAssetService(assetRepo)
	lineageService := application.NewLineageService(lineageRepo)
	searchService := application.NewSearchService(searchRepo)

	// HTTP Handler
	handler := httpAdapter.NewHandler(assetService, lineageService, searchService)

	// OpenLineage handler (nil until repository implementation is available)
	// TODO: Wire up OpenLineageHandler when OpenLineageRepository is implemented
	var olHandler *httpAdapter.OpenLineageHandler = nil

	router := httpAdapter.NewRouter(handler, olHandler)

	// Server
	server := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      router,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 60 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Graceful shutdown
	go func() {
		log.Printf("Server starting on port %s", cfg.Port)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server error: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down server...")
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		log.Fatalf("Server forced to shutdown: %v", err)
	}

	log.Println("Server exited")
}
