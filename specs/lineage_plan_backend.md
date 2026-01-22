# Data Lineage Application - Backend Specification

## Overview

Build a column-level data lineage web application that:
- Connects to an existing Teradata database platform
- Stores all lineage data within Teradata itself (in a `lineage` database)
- Provides a web UI for visualizing and exploring data lineage
- Supports impact analysis for change management

---

## Technology Stack

| Component | Technology | Rationale |
|-----------|------------|-----------|
| Backend | Go | User preference, performance |
| Caching | Redis | Performance for repeated queries |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     React Frontend                               │
│  (Asset Browser, Lineage Graph, Impact Analysis, Search)        │
└─────────────────────────────────┬───────────────────────────────┘
                                  │ REST API
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Go Backend                                  │
│  (Chi Router, Handlers, Services, Teradata Repository)          │
└──────────────────┬────────────────────────────┬─────────────────┘
                   │                            │
                   ▼                            ▼
          ┌───────────────┐            ┌───────────────┐
          │   Teradata    │            │     Redis     │
          │ (lineage db)  │            │    (cache)    │
          └───────────────┘            └───────────────┘
```

---

## Phase 2: Go Backend

### 2.1 Project Structure

```
lineage-api/
├── cmd/
│   └── server/
│       └── main.go                 # Application entry point
├── internal/
│   ├── domain/
│   │   ├── entities.go             # Core domain entities
│   │   └── repository.go           # Repository interfaces
│   ├── application/
│   │   ├── dto.go                  # Data transfer objects
│   │   ├── asset_service.go        # Asset use cases
│   │   ├── lineage_service.go      # Lineage use cases
│   │   └── search_service.go       # Search use cases
│   ├── adapter/
│   │   ├── inbound/
│   │   │   └── http/
│   │   │       ├── router.go       # Chi router setup
│   │   │       ├── handlers.go     # HTTP handlers
│   │   │       ├── middleware.go   # Custom middleware
│   │   │       └── response.go     # Response helpers
│   │   └── outbound/
│   │       ├── teradata/
│   │       │   ├── connection.go   # Connection pool
│   │       │   ├── asset_repo.go   # Asset repository
│   │       │   └── lineage_repo.go # Lineage repository
│   │       └── redis/
│   │           └── cache.go        # Redis cache
│   └── infrastructure/
│       ├── config/
│       │   └── config.go           # Configuration management
│       └── logging/
│           └── logger.go           # Structured logging
├── api/
│   └── openapi/
│       └── spec.yaml               # OpenAPI specification
├── go.mod
├── go.sum
└── Makefile
```

### 2.2 Domain Entities

```go
// internal/domain/entities.go
package domain

import "time"

type Database struct {
    ID               string    `json:"id"`
    Name             string    `json:"name"`
    OwnerName        string    `json:"ownerName,omitempty"`
    CreateTimestamp  time.Time `json:"createTimestamp,omitempty"`
    CommentString    string    `json:"commentString,omitempty"`
}

type Table struct {
    ID               string    `json:"id"`
    DatabaseName     string    `json:"databaseName"`
    TableName        string    `json:"tableName"`
    TableKind        string    `json:"tableKind"` // T=Table, V=View
    CreateTimestamp  time.Time `json:"createTimestamp,omitempty"`
    CommentString    string    `json:"commentString,omitempty"`
    RowCount         int64     `json:"rowCount,omitempty"`
}

type Column struct {
    ID              string `json:"id"`
    DatabaseName    string `json:"databaseName"`
    TableName       string `json:"tableName"`
    ColumnName      string `json:"columnName"`
    ColumnType      string `json:"columnType"`
    ColumnLength    int    `json:"columnLength,omitempty"`
    Nullable        bool   `json:"nullable"`
    CommentString   string `json:"commentString,omitempty"`
    ColumnPosition  int    `json:"columnPosition"`
}

type ColumnLineage struct {
    LineageID          string    `json:"lineageId"`
    SourceColumnID     string    `json:"sourceColumnId"`
    SourceDatabase     string    `json:"sourceDatabase"`
    SourceTable        string    `json:"sourceTable"`
    SourceColumn       string    `json:"sourceColumn"`
    TargetColumnID     string    `json:"targetColumnId"`
    TargetDatabase     string    `json:"targetDatabase"`
    TargetTable        string    `json:"targetTable"`
    TargetColumn       string    `json:"targetColumn"`
    TransformationType string    `json:"transformationType"`
    ConfidenceScore    float64   `json:"confidenceScore"`
    Depth              int       `json:"depth,omitempty"`
}

type LineageGraph struct {
    Nodes []LineageNode `json:"nodes"`
    Edges []LineageEdge `json:"edges"`
}

type LineageNode struct {
    ID           string            `json:"id"`
    Type         string            `json:"type"` // database, table, column
    DatabaseName string            `json:"databaseName"`
    TableName    string            `json:"tableName,omitempty"`
    ColumnName   string            `json:"columnName,omitempty"`
    Metadata     map[string]any    `json:"metadata,omitempty"`
}

type LineageEdge struct {
    ID                 string  `json:"id"`
    Source             string  `json:"source"`
    Target             string  `json:"target"`
    TransformationType string  `json:"transformationType,omitempty"`
    ConfidenceScore    float64 `json:"confidenceScore,omitempty"`
}

type AssetType string

const (
    AssetTypeDatabase AssetType = "database"
    AssetTypeTable    AssetType = "table"
    AssetTypeColumn   AssetType = "column"
)

type SearchResult struct {
    ID           string    `json:"id"`
    Type         AssetType `json:"type"`
    DatabaseName string    `json:"databaseName"`
    TableName    string    `json:"tableName,omitempty"`
    ColumnName   string    `json:"columnName,omitempty"`
    MatchedOn    string    `json:"matchedOn"`
    Score        float64   `json:"score"`
}
```

### 2.3 Repository Interfaces

```go
// internal/domain/repository.go
package domain

import "context"

type AssetRepository interface {
    // Database operations
    ListDatabases(ctx context.Context) ([]Database, error)
    GetDatabase(ctx context.Context, name string) (*Database, error)

    // Table operations
    ListTables(ctx context.Context, databaseName string) ([]Table, error)
    GetTable(ctx context.Context, databaseName, tableName string) (*Table, error)

    // Column operations
    ListColumns(ctx context.Context, databaseName, tableName string) ([]Column, error)
    GetColumn(ctx context.Context, databaseName, tableName, columnName string) (*Column, error)
}

type LineageRepository interface {
    // Get full lineage graph for an asset
    GetLineageGraph(ctx context.Context, assetID string, depth int) (*LineageGraph, error)

    // Get upstream lineage (sources)
    GetUpstreamLineage(ctx context.Context, columnID string, maxDepth int) ([]ColumnLineage, error)

    // Get downstream lineage (targets/impact)
    GetDownstreamLineage(ctx context.Context, columnID string, maxDepth int) ([]ColumnLineage, error)

    // Get direct relationships only
    GetDirectLineage(ctx context.Context, columnID string) ([]ColumnLineage, error)
}

type SearchRepository interface {
    Search(ctx context.Context, query string, assetTypes []AssetType, limit int) ([]SearchResult, error)
}

type CacheRepository interface {
    Get(ctx context.Context, key string, dest any) error
    Set(ctx context.Context, key string, value any, ttlSeconds int) error
    Delete(ctx context.Context, key string) error
    Exists(ctx context.Context, key string) (bool, error)
}
```

### 2.4 Application Services (DTOs)

```go
// internal/application/dto.go
package application

import "github.com/your-org/lineage-api/internal/domain"

// Request DTOs
type GetLineageRequest struct {
    AssetID   string `json:"assetId"`
    Direction string `json:"direction"` // upstream, downstream, both
    MaxDepth  int    `json:"maxDepth"`
}

type SearchRequest struct {
    Query      string   `json:"query"`
    AssetTypes []string `json:"assetTypes,omitempty"`
    Limit      int      `json:"limit,omitempty"`
}

// Response DTOs
type DatabaseListResponse struct {
    Databases []domain.Database `json:"databases"`
    Total     int               `json:"total"`
}

type TableListResponse struct {
    Tables []domain.Table `json:"tables"`
    Total  int            `json:"total"`
}

type ColumnListResponse struct {
    Columns []domain.Column `json:"columns"`
    Total   int             `json:"total"`
}

type LineageGraphResponse struct {
    AssetID string             `json:"assetId"`
    Graph   domain.LineageGraph `json:"graph"`
}

type ImpactAnalysisResponse struct {
    AssetID        string                 `json:"assetId"`
    ImpactedAssets []ImpactedAsset        `json:"impactedAssets"`
    Summary        ImpactSummary          `json:"summary"`
}

type ImpactedAsset struct {
    ID           string `json:"id"`
    DatabaseName string `json:"databaseName"`
    TableName    string `json:"tableName"`
    ColumnName   string `json:"columnName,omitempty"`
    Depth        int    `json:"depth"`
    ImpactType   string `json:"impactType"` // direct, indirect
}

type ImpactSummary struct {
    TotalImpacted     int            `json:"totalImpacted"`
    ByDatabase        map[string]int `json:"byDatabase"`
    ByDepth           map[int]int    `json:"byDepth"`
    CriticalCount     int            `json:"criticalCount"`
}

type SearchResponse struct {
    Results []domain.SearchResult `json:"results"`
    Total   int                   `json:"total"`
    Query   string                `json:"query"`
}
```

### 2.5 Application Services

```go
// internal/application/lineage_service.go
package application

import (
    "context"
    "fmt"

    "github.com/your-org/lineage-api/internal/domain"
)

type LineageService struct {
    lineageRepo domain.LineageRepository
    assetRepo   domain.AssetRepository
    cache       domain.CacheRepository
}

func NewLineageService(
    lineageRepo domain.LineageRepository,
    assetRepo domain.AssetRepository,
    cache domain.CacheRepository,
) *LineageService {
    return &LineageService{
        lineageRepo: lineageRepo,
        assetRepo:   assetRepo,
        cache:       cache,
    }
}

func (s *LineageService) GetLineageGraph(ctx context.Context, req GetLineageRequest) (*LineageGraphResponse, error) {
    // Check cache first
    cacheKey := fmt.Sprintf("lineage:%s:%s:%d", req.AssetID, req.Direction, req.MaxDepth)
    var cached LineageGraphResponse
    if err := s.cache.Get(ctx, cacheKey, &cached); err == nil {
        return &cached, nil
    }

    // Fetch from repository
    graph, err := s.lineageRepo.GetLineageGraph(ctx, req.AssetID, req.MaxDepth)
    if err != nil {
        return nil, fmt.Errorf("failed to get lineage graph: %w", err)
    }

    response := &LineageGraphResponse{
        AssetID: req.AssetID,
        Graph:   *graph,
    }

    // Cache the result
    _ = s.cache.Set(ctx, cacheKey, response, 300) // 5 minute TTL

    return response, nil
}

func (s *LineageService) GetUpstreamLineage(ctx context.Context, columnID string, maxDepth int) ([]domain.ColumnLineage, error) {
    return s.lineageRepo.GetUpstreamLineage(ctx, columnID, maxDepth)
}

func (s *LineageService) GetDownstreamLineage(ctx context.Context, columnID string, maxDepth int) ([]domain.ColumnLineage, error) {
    return s.lineageRepo.GetDownstreamLineage(ctx, columnID, maxDepth)
}

func (s *LineageService) GetImpactAnalysis(ctx context.Context, columnID string, maxDepth int) (*ImpactAnalysisResponse, error) {
    downstream, err := s.lineageRepo.GetDownstreamLineage(ctx, columnID, maxDepth)
    if err != nil {
        return nil, fmt.Errorf("failed to get downstream lineage: %w", err)
    }

    // Build impact analysis
    impactedAssets := make([]ImpactedAsset, 0, len(downstream))
    byDatabase := make(map[string]int)
    byDepth := make(map[int]int)

    for _, lineage := range downstream {
        asset := ImpactedAsset{
            ID:           lineage.TargetColumnID,
            DatabaseName: lineage.TargetDatabase,
            TableName:    lineage.TargetTable,
            ColumnName:   lineage.TargetColumn,
            Depth:        lineage.Depth,
            ImpactType:   "direct",
        }
        if lineage.Depth > 1 {
            asset.ImpactType = "indirect"
        }
        impactedAssets = append(impactedAssets, asset)
        byDatabase[lineage.TargetDatabase]++
        byDepth[lineage.Depth]++
    }

    return &ImpactAnalysisResponse{
        AssetID:        columnID,
        ImpactedAssets: impactedAssets,
        Summary: ImpactSummary{
            TotalImpacted: len(impactedAssets),
            ByDatabase:    byDatabase,
            ByDepth:       byDepth,
        },
    }, nil
}
```

### 2.6 HTTP Handlers

```go
// internal/adapter/inbound/http/handlers.go
package http

import (
    "encoding/json"
    "net/http"
    "strconv"

    "github.com/go-chi/chi/v5"
    "github.com/your-org/lineage-api/internal/application"
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

// Asset Handlers

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

// Lineage Handlers

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

// Search Handler

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

// Helper functions

func respondJSON(w http.ResponseWriter, status int, data any) {
    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(status)
    json.NewEncoder(w).Encode(data)
}

func respondError(w http.ResponseWriter, status int, message string) {
    respondJSON(w, status, map[string]string{"error": message})
}
```

### 2.7 Router Setup

```go
// internal/adapter/inbound/http/router.go
package http

import (
    "net/http"
    "time"

    "github.com/go-chi/chi/v5"
    "github.com/go-chi/chi/v5/middleware"
    "github.com/go-chi/cors"
)

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
```

### 2.8 Teradata Repository Implementation

```go
// internal/adapter/outbound/teradata/connection.go
package teradata

import (
    "database/sql"
    "fmt"

    _ "github.com/alexbrainman/odbc"
)

type Config struct {
    Host     string
    Port     int
    User     string
    Password string
    Database string
}

func NewConnection(cfg Config) (*sql.DB, error) {
    connStr := fmt.Sprintf(
        "DRIVER={Teradata};DBCNAME=%s;UID=%s;PWD=%s;DATABASE=%s",
        cfg.Host,
        cfg.User,
        cfg.Password,
        cfg.Database,
    )

    db, err := sql.Open("odbc", connStr)
    if err != nil {
        return nil, fmt.Errorf("failed to open connection: %w", err)
    }

    db.SetMaxOpenConns(25)
    db.SetMaxIdleConns(5)

    if err := db.Ping(); err != nil {
        return nil, fmt.Errorf("failed to ping database: %w", err)
    }

    return db, nil
}
```

```go
// internal/adapter/outbound/teradata/lineage_repo.go
package teradata

import (
    "context"
    "database/sql"
    "fmt"

    "github.com/your-org/lineage-api/internal/domain"
)

type LineageRepository struct {
    db *sql.DB
}

func NewLineageRepository(db *sql.DB) *LineageRepository {
    return &LineageRepository{db: db}
}

func (r *LineageRepository) GetLineageGraph(ctx context.Context, assetID string, depth int) (*domain.LineageGraph, error) {
    // Get both upstream and downstream, then combine into graph
    upstream, err := r.GetUpstreamLineage(ctx, assetID, depth)
    if err != nil {
        return nil, err
    }

    downstream, err := r.GetDownstreamLineage(ctx, assetID, depth)
    if err != nil {
        return nil, err
    }

    return r.buildGraph(assetID, upstream, downstream), nil
}

func (r *LineageRepository) GetUpstreamLineage(ctx context.Context, columnID string, maxDepth int) ([]domain.ColumnLineage, error) {
    query := `
        WITH RECURSIVE upstream_lineage AS (
            SELECT
                lineage_id,
                source_column_id,
                source_database,
                source_table,
                source_column,
                target_column_id,
                target_database,
                target_table,
                target_column,
                transformation_type,
                confidence_score,
                1 AS depth,
                CAST(target_column_id || '->' || source_column_id AS VARCHAR(10000)) AS path
            FROM lineage.LIN_COLUMN_LINEAGE
            WHERE target_column_id = ?
              AND is_active = 'Y'

            UNION ALL

            SELECT
                cl.lineage_id,
                cl.source_column_id,
                cl.source_database,
                cl.source_table,
                cl.source_column,
                cl.target_column_id,
                cl.target_database,
                cl.target_table,
                cl.target_column,
                cl.transformation_type,
                cl.confidence_score,
                ul.depth + 1,
                ul.path || '->' || cl.source_column_id
            FROM lineage.LIN_COLUMN_LINEAGE cl
            JOIN upstream_lineage ul ON cl.target_column_id = ul.source_column_id
            WHERE cl.is_active = 'Y'
              AND ul.depth < ?
              AND POSITION(cl.source_column_id IN ul.path) = 0
        )
        SELECT DISTINCT
            lineage_id,
            source_column_id,
            source_database,
            source_table,
            source_column,
            target_column_id,
            target_database,
            target_table,
            target_column,
            transformation_type,
            confidence_score,
            depth
        FROM upstream_lineage
        ORDER BY depth, source_database, source_table, source_column
    `

    rows, err := r.db.QueryContext(ctx, query, columnID, maxDepth)
    if err != nil {
        return nil, fmt.Errorf("failed to query upstream lineage: %w", err)
    }
    defer rows.Close()

    return r.scanLineageRows(rows)
}

func (r *LineageRepository) GetDownstreamLineage(ctx context.Context, columnID string, maxDepth int) ([]domain.ColumnLineage, error) {
    query := `
        WITH RECURSIVE downstream_lineage AS (
            SELECT
                lineage_id,
                source_column_id,
                source_database,
                source_table,
                source_column,
                target_column_id,
                target_database,
                target_table,
                target_column,
                transformation_type,
                confidence_score,
                1 AS depth,
                CAST(source_column_id || '->' || target_column_id AS VARCHAR(10000)) AS path
            FROM lineage.LIN_COLUMN_LINEAGE
            WHERE source_column_id = ?
              AND is_active = 'Y'

            UNION ALL

            SELECT
                cl.lineage_id,
                cl.source_column_id,
                cl.source_database,
                cl.source_table,
                cl.source_column,
                cl.target_column_id,
                cl.target_database,
                cl.target_table,
                cl.target_column,
                cl.transformation_type,
                cl.confidence_score,
                dl.depth + 1,
                dl.path || '->' || cl.target_column_id
            FROM lineage.LIN_COLUMN_LINEAGE cl
            JOIN downstream_lineage dl ON cl.source_column_id = dl.target_column_id
            WHERE cl.is_active = 'Y'
              AND dl.depth < ?
              AND POSITION(cl.target_column_id IN dl.path) = 0
        )
        SELECT DISTINCT
            lineage_id,
            source_column_id,
            source_database,
            source_table,
            source_column,
            target_column_id,
            target_database,
            target_table,
            target_column,
            transformation_type,
            confidence_score,
            depth
        FROM downstream_lineage
        ORDER BY depth, target_database, target_table, target_column
    `

    rows, err := r.db.QueryContext(ctx, query, columnID, maxDepth)
    if err != nil {
        return nil, fmt.Errorf("failed to query downstream lineage: %w", err)
    }
    defer rows.Close()

    return r.scanLineageRows(rows)
}

func (r *LineageRepository) GetDirectLineage(ctx context.Context, columnID string) ([]domain.ColumnLineage, error) {
    query := `
        SELECT
            lineage_id,
            source_column_id,
            source_database,
            source_table,
            source_column,
            target_column_id,
            target_database,
            target_table,
            target_column,
            transformation_type,
            confidence_score,
            1 AS depth
        FROM lineage.LIN_COLUMN_LINEAGE
        WHERE (source_column_id = ? OR target_column_id = ?)
          AND is_active = 'Y'
    `

    rows, err := r.db.QueryContext(ctx, query, columnID, columnID)
    if err != nil {
        return nil, fmt.Errorf("failed to query direct lineage: %w", err)
    }
    defer rows.Close()

    return r.scanLineageRows(rows)
}

func (r *LineageRepository) scanLineageRows(rows *sql.Rows) ([]domain.ColumnLineage, error) {
    var results []domain.ColumnLineage
    for rows.Next() {
        var l domain.ColumnLineage
        err := rows.Scan(
            &l.LineageID,
            &l.SourceColumnID,
            &l.SourceDatabase,
            &l.SourceTable,
            &l.SourceColumn,
            &l.TargetColumnID,
            &l.TargetDatabase,
            &l.TargetTable,
            &l.TargetColumn,
            &l.TransformationType,
            &l.ConfidenceScore,
            &l.Depth,
        )
        if err != nil {
            return nil, fmt.Errorf("failed to scan row: %w", err)
        }
        results = append(results, l)
    }
    return results, rows.Err()
}

func (r *LineageRepository) buildGraph(rootID string, upstream, downstream []domain.ColumnLineage) *domain.LineageGraph {
    nodeMap := make(map[string]domain.LineageNode)
    var edges []domain.LineageEdge

    // Add root node
    nodeMap[rootID] = domain.LineageNode{
        ID:   rootID,
        Type: "column",
    }

    // Process upstream
    for _, l := range upstream {
        // Add source node
        if _, exists := nodeMap[l.SourceColumnID]; !exists {
            nodeMap[l.SourceColumnID] = domain.LineageNode{
                ID:           l.SourceColumnID,
                Type:         "column",
                DatabaseName: l.SourceDatabase,
                TableName:    l.SourceTable,
                ColumnName:   l.SourceColumn,
            }
        }
        // Add target node
        if _, exists := nodeMap[l.TargetColumnID]; !exists {
            nodeMap[l.TargetColumnID] = domain.LineageNode{
                ID:           l.TargetColumnID,
                Type:         "column",
                DatabaseName: l.TargetDatabase,
                TableName:    l.TargetTable,
                ColumnName:   l.TargetColumn,
            }
        }
        // Add edge
        edges = append(edges, domain.LineageEdge{
            ID:                 l.LineageID,
            Source:             l.SourceColumnID,
            Target:             l.TargetColumnID,
            TransformationType: l.TransformationType,
            ConfidenceScore:    l.ConfidenceScore,
        })
    }

    // Process downstream
    for _, l := range downstream {
        if _, exists := nodeMap[l.SourceColumnID]; !exists {
            nodeMap[l.SourceColumnID] = domain.LineageNode{
                ID:           l.SourceColumnID,
                Type:         "column",
                DatabaseName: l.SourceDatabase,
                TableName:    l.SourceTable,
                ColumnName:   l.SourceColumn,
            }
        }
        if _, exists := nodeMap[l.TargetColumnID]; !exists {
            nodeMap[l.TargetColumnID] = domain.LineageNode{
                ID:           l.TargetColumnID,
                Type:         "column",
                DatabaseName: l.TargetDatabase,
                TableName:    l.TargetTable,
                ColumnName:   l.TargetColumn,
            }
        }
        edges = append(edges, domain.LineageEdge{
            ID:                 l.LineageID,
            Source:             l.SourceColumnID,
            Target:             l.TargetColumnID,
            TransformationType: l.TransformationType,
            ConfidenceScore:    l.ConfidenceScore,
        })
    }

    // Convert map to slice
    nodes := make([]domain.LineageNode, 0, len(nodeMap))
    for _, node := range nodeMap {
        nodes = append(nodes, node)
    }

    return &domain.LineageGraph{
        Nodes: nodes,
        Edges: edges,
    }
}
```

### 2.9 Main Entry Point

```go
// cmd/server/main.go
package main

import (
    "context"
    "log"
    "net/http"
    "os"
    "os/signal"
    "syscall"
    "time"

    "github.com/spf13/viper"

    "github.com/your-org/lineage-api/internal/application"
    httpAdapter "github.com/your-org/lineage-api/internal/adapter/inbound/http"
    "github.com/your-org/lineage-api/internal/adapter/outbound/teradata"
    "github.com/your-org/lineage-api/internal/adapter/outbound/redis"
)

func main() {
    // Load configuration
    viper.SetConfigName("config")
    viper.SetConfigType("yaml")
    viper.AddConfigPath(".")
    viper.AddConfigPath("/etc/lineage-api/")
    viper.AutomaticEnv()

    if err := viper.ReadInConfig(); err != nil {
        log.Printf("Warning: config file not found, using environment variables")
    }

    // Database connection
    dbCfg := teradata.Config{
        Host:     viper.GetString("TERADATA_HOST"),
        Port:     viper.GetInt("TERADATA_PORT"),
        User:     viper.GetString("TERADATA_USER"),
        Password: viper.GetString("TERADATA_PASSWORD"),
        Database: viper.GetString("TERADATA_DATABASE"),
    }

    db, err := teradata.NewConnection(dbCfg)
    if err != nil {
        log.Fatalf("Failed to connect to Teradata: %v", err)
    }
    defer db.Close()

    // Redis connection
    redisCfg := redis.Config{
        Addr:     viper.GetString("REDIS_ADDR"),
        Password: viper.GetString("REDIS_PASSWORD"),
        DB:       viper.GetInt("REDIS_DB"),
    }
    cache, err := redis.NewCacheRepository(redisCfg)
    if err != nil {
        log.Printf("Warning: Redis not available, caching disabled: %v", err)
        cache = redis.NewNoOpCache()
    }

    // Repositories
    assetRepo := teradata.NewAssetRepository(db)
    lineageRepo := teradata.NewLineageRepository(db)
    searchRepo := teradata.NewSearchRepository(db)

    // Services
    assetService := application.NewAssetService(assetRepo)
    lineageService := application.NewLineageService(lineageRepo, assetRepo, cache)
    searchService := application.NewSearchService(searchRepo)

    // HTTP Handler
    handler := httpAdapter.NewHandler(assetService, lineageService, searchService)
    router := httpAdapter.NewRouter(handler)

    // Server
    server := &http.Server{
        Addr:         ":" + viper.GetString("PORT"),
        Handler:      router,
        ReadTimeout:  15 * time.Second,
        WriteTimeout: 60 * time.Second,
        IdleTimeout:  60 * time.Second,
    }

    // Graceful shutdown
    go func() {
        log.Printf("Server starting on %s", server.Addr)
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
```

---

## Configuration

### Go Configuration (config.yaml)
```yaml
# config.yaml
port: 8080

teradata:
  host: ${TERADATA_HOST}
  port: 1025
  user: ${TERADATA_USER}
  password: ${TERADATA_PASSWORD}
  database: lineage

redis:
  addr: ${REDIS_ADDR:localhost:6379}
  password: ${REDIS_PASSWORD:}
  db: 0
```

### Go Module (go.mod)
```
module github.com/your-org/lineage-api

go 1.21

require (
    github.com/go-chi/chi/v5 v5.0.11
    github.com/go-chi/cors v1.2.1
    github.com/alexbrainman/odbc v0.0.0-20230814102256-1421b829acc9
    github.com/redis/go-redis/v9 v9.4.0
    github.com/spf13/viper v1.18.2
)
```

### Build Tags

The project uses build tags to support compilation with and without ODBC:

```bash
# Development build (no ODBC required, uses stub driver)
go build ./...
go test ./...

# Production build (requires ODBC driver and headers)
go build -tags teradata ./...
```

**Build Tag Files:**
- `driver_odbc.go` (`//go:build teradata`) - Imports ODBC driver for production
- `driver_stub.go` (`//go:build !teradata`) - Stub driver for development/testing

This allows:
1. Running tests and development without ODBC installed
2. Full Teradata connectivity when built with `-tags teradata`
3. Clear error message at runtime if stub driver is used accidentally

---

## Implementation Status

**Phase 2: Go Backend - COMPLETED** (2026-01-19)

### Implemented Components

| Component | Status | Notes |
|-----------|--------|-------|
| Project Structure | ✅ Complete | Hexagonal architecture with clean separation |
| Domain Entities | ✅ Complete | Database, Table, Column, ColumnLineage, LineageGraph, SearchResult |
| Repository Interfaces | ✅ Complete | AssetRepository, LineageRepository, SearchRepository, CacheRepository |
| Application DTOs | ✅ Complete | Request/Response types for all endpoints |
| Asset Service | ✅ Complete | List/Get operations for databases, tables, columns |
| Lineage Service | ✅ Complete | Graph traversal with caching |
| Search Service | ✅ Complete | Multi-type search with filtering |
| HTTP Handlers | ✅ Complete | Chi router with all API endpoints |
| Redis Cache | ✅ Complete | With NoOpCache fallback |
| Teradata Repositories | ✅ Complete | Build with `-tags teradata` for ODBC support |
| Unit Tests | ✅ Complete | 93 tests passing |
| Mock Implementations | ✅ Complete | For isolated testing |
| Build Tag System | ✅ Complete | Optional ODBC dependency via build tags |

### Test Results

```
ok  	github.com/your-org/lineage-api/internal/domain                  (17 tests)
ok  	github.com/your-org/lineage-api/internal/application             (30 tests)
ok  	github.com/your-org/lineage-api/internal/adapter/inbound/http    (33 tests)
ok  	github.com/your-org/lineage-api/internal/adapter/outbound/redis  (6 tests)
ok  	github.com/your-org/lineage-api/internal/adapter/outbound/teradata (7 tests)
```

---

## Verification Checklist

### Backend
- [x] `go build ./...` compiles without errors (no ODBC required for development)
- [x] `go build -tags teradata ./...` compiles with ODBC support (requires ODBC headers)
- [x] `go test ./...` runs all 93 unit tests successfully
- [x] `curl http://localhost:8080/health` returns `{"status":"healthy"}` (tested via unit tests)
- [x] `curl http://localhost:8080/api/v1/assets/databases` returns database list (tested via unit tests)
- [x] `curl http://localhost:8080/api/v1/lineage/{columnId}` returns lineage graph (tested via unit tests)

### Prerequisites for Full Runtime
- Teradata ODBC driver installed (for database connectivity, build with `-tags teradata`)
- Redis server (optional, falls back to NoOpCache if unavailable)
