# Go Coding Standards

This document defines the coding standards for the Data Lineage Application Go backend. These standards ensure consistency, maintainability, and alignment with Go best practices and the project architecture.

---

## Table of Contents

1. [Code Formatting](#code-formatting)
2. [Naming Conventions](#naming-conventions)
3. [Error Handling](#error-handling)
4. [Project Structure](#project-structure)
5. [Testing Conventions](#testing-conventions)
6. [Documentation Standards](#documentation-standards)
7. [Concurrency Patterns](#concurrency-patterns)
8. [Dependency Management](#dependency-management)

---

## Code Formatting

### Required Tools

All Go code MUST be formatted using the standard Go toolchain:

```bash
# Format code
gofmt -w .

# Organize imports (preferred)
goimports -w .

# Lint code
golangci-lint run
```

### Editor Configuration

Configure your editor to run `goimports` on save. Example VS Code settings:

```json
{
  "go.formatTool": "goimports",
  "editor.formatOnSave": true,
  "[go]": {
    "editor.defaultFormatter": "golang.go"
  }
}
```

### Line Length

- Aim for 100 characters per line maximum
- Go does not enforce line length, but readability is important
- Break long function signatures across multiple lines:

```go
// Good
func NewLineageService(
    lineageRepo domain.LineageRepository,
    assetRepo domain.AssetRepository,
    cache domain.CacheRepository,
) *LineageService {
    // ...
}

// Avoid - hard to read
func NewLineageService(lineageRepo domain.LineageRepository, assetRepo domain.AssetRepository, cache domain.CacheRepository) *LineageService {
```

### Import Organization

Imports MUST be organized in three groups, separated by blank lines:

```go
import (
    // Standard library
    "context"
    "encoding/json"
    "fmt"
    "net/http"

    // Third-party packages
    "github.com/go-chi/chi/v5"
    "github.com/redis/go-redis/v9"

    // Internal packages
    "github.com/your-org/lineage-api/internal/application"
    "github.com/your-org/lineage-api/internal/domain"
)
```

---

## Naming Conventions

### Packages

- Use short, lowercase, single-word names
- Avoid underscores and mixed caps
- Package name should describe its purpose

```go
// Good
package domain
package teradata
package http

// Avoid
package lineageService
package http_handlers
package TeradataRepo
```

### Files

- Use lowercase with underscores for multi-word files
- Group related functionality in appropriately named files

```
entities.go         // Domain entities
repository.go       // Repository interfaces
asset_service.go    // Asset-related service
lineage_service.go  // Lineage-related service
asset_repo.go       // Asset repository implementation
```

### Variables

- Use camelCase for local variables and parameters
- Use short names for short-lived variables
- Use descriptive names for package-level and long-lived variables

```go
// Good - short scope
for i, db := range databases {
    // ...
}

// Good - longer scope
func (s *LineageService) GetLineageGraph(ctx context.Context, req GetLineageRequest) {
    cacheKey := fmt.Sprintf("lineage:%s:%s:%d", req.AssetID, req.Direction, req.MaxDepth)
    // ...
}

// Good - context is always ctx
func (h *Handler) ListDatabases(w http.ResponseWriter, r *http.Request) {
    ctx := r.Context()
    // ...
}
```

### Constants

- Use MixedCaps or SCREAMING_SNAKE_CASE depending on export status
- Group related constants using `const` blocks

```go
// Exported constants - MixedCaps
const (
    DefaultMaxDepth    = 5
    DefaultCacheTTL    = 300 // seconds
    MaxLineageDepth    = 20
)

// Private constants
const (
    defaultTimeout = 60 * time.Second
)

// Enum-like constants using iota (project pattern)
type AssetType string

const (
    AssetTypeDatabase AssetType = "database"
    AssetTypeTable    AssetType = "table"
    AssetTypeColumn   AssetType = "column"
)
```

### Functions and Methods

- Use MixedCaps (exported) or mixedCaps (unexported)
- Use verbs or verb phrases for function names
- Receiver names should be short (1-2 characters), consistent, and reflect the type

```go
// Good - clear verb-based names
func (s *LineageService) GetLineageGraph(ctx context.Context, req GetLineageRequest) (*LineageGraphResponse, error)
func (r *LineageRepository) GetUpstreamLineage(ctx context.Context, columnID string, maxDepth int) ([]domain.ColumnLineage, error)

// Good - consistent receiver names
func (s *LineageService) GetUpstreamLineage(...)   // s for service
func (r *LineageRepository) GetUpstreamLineage(...) // r for repository
func (h *Handler) ListDatabases(...)                // h for handler

// Avoid - inconsistent or overly long receivers
func (service *LineageService) GetLineageGraph(...)
func (this *Handler) ListDatabases(...)
```

### Interfaces

- Use "-er" suffix for single-method interfaces
- Use descriptive names for multi-method interfaces
- Place interfaces near where they are used (in domain package for this project)

```go
// Single-method interface
type Reader interface {
    Read(p []byte) (n int, err error)
}

// Multi-method interfaces (project pattern)
type AssetRepository interface {
    ListDatabases(ctx context.Context) ([]Database, error)
    GetDatabase(ctx context.Context, name string) (*Database, error)
    ListTables(ctx context.Context, databaseName string) ([]Table, error)
    // ...
}

type CacheRepository interface {
    Get(ctx context.Context, key string, dest any) error
    Set(ctx context.Context, key string, value any, ttlSeconds int) error
    Delete(ctx context.Context, key string) error
    Exists(ctx context.Context, key string) (bool, error)
}
```

### Structs and Types

- Use MixedCaps for exported types
- Use descriptive names that indicate purpose
- Follow the project's domain-driven design patterns

```go
// Domain entities (from project spec)
type Database struct {
    ID              string    `json:"id"`
    Name            string    `json:"name"`
    OwnerName       string    `json:"ownerName,omitempty"`
    CreateTimestamp time.Time `json:"createTimestamp,omitempty"`
    CommentString   string    `json:"commentString,omitempty"`
}

// DTOs - suffix with Request/Response
type GetLineageRequest struct {
    AssetID   string `json:"assetId"`
    Direction string `json:"direction"`
    MaxDepth  int    `json:"maxDepth"`
}

type LineageGraphResponse struct {
    AssetID string             `json:"assetId"`
    Graph   domain.LineageGraph `json:"graph"`
}
```

---

## Error Handling

### Error Wrapping

Always wrap errors with context using `fmt.Errorf` and `%w`:

```go
// Good - provides context
graph, err := s.lineageRepo.GetLineageGraph(ctx, req.AssetID, req.MaxDepth)
if err != nil {
    return nil, fmt.Errorf("failed to get lineage graph: %w", err)
}

// Avoid - loses context
if err != nil {
    return nil, err
}
```

### Error Messages

- Start with lowercase
- Do not end with punctuation
- Be descriptive but concise
- Include relevant identifiers

```go
// Good
return nil, fmt.Errorf("failed to get lineage graph for asset %s: %w", req.AssetID, err)
return nil, fmt.Errorf("failed to query upstream lineage: %w", err)

// Avoid
return nil, fmt.Errorf("Error getting lineage graph!: %w", err)
return nil, fmt.Errorf("failed: %w", err)
```

### Custom Error Types

Define custom error types for domain-specific errors:

```go
// Custom error types
type NotFoundError struct {
    Resource string
    ID       string
}

func (e *NotFoundError) Error() string {
    return fmt.Sprintf("%s not found: %s", e.Resource, e.ID)
}

// Sentinel errors for specific conditions
var (
    ErrAssetNotFound  = errors.New("asset not found")
    ErrInvalidDepth   = errors.New("invalid depth parameter")
    ErrCycleDetected  = errors.New("cycle detected in lineage graph")
)
```

### Error Handling in HTTP Handlers

Use consistent error response patterns (from project spec):

```go
func (h *Handler) GetLineage(w http.ResponseWriter, r *http.Request) {
    ctx := r.Context()
    assetID := chi.URLParam(r, "assetId")

    response, err := h.lineageService.GetLineageGraph(ctx, req)
    if err != nil {
        // Check for specific error types
        var notFound *NotFoundError
        if errors.As(err, &notFound) {
            respondError(w, http.StatusNotFound, err.Error())
            return
        }
        // Default to internal server error
        respondError(w, http.StatusInternalServerError, err.Error())
        return
    }

    respondJSON(w, http.StatusOK, response)
}

// Helper functions (from project spec)
func respondJSON(w http.ResponseWriter, status int, data any) {
    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(status)
    json.NewEncoder(w).Encode(data)
}

func respondError(w http.ResponseWriter, status int, message string) {
    respondJSON(w, status, map[string]string{"error": message})
}
```

### Handling Deferred Cleanup Errors

```go
func (r *LineageRepository) GetUpstreamLineage(ctx context.Context, columnID string, maxDepth int) ([]domain.ColumnLineage, error) {
    rows, err := r.db.QueryContext(ctx, query, columnID, maxDepth)
    if err != nil {
        return nil, fmt.Errorf("failed to query upstream lineage: %w", err)
    }
    defer rows.Close() // Error here is typically logged, not returned

    return r.scanLineageRows(rows)
}
```

---

## Project Structure

### Directory Layout

Follow the established project structure (from specification):

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

### Layer Responsibilities

| Layer | Package | Responsibility |
|-------|---------|----------------|
| Domain | `internal/domain` | Core entities, repository interfaces, business rules |
| Application | `internal/application` | Use cases, DTOs, orchestration |
| Adapter (Inbound) | `internal/adapter/inbound/http` | HTTP handlers, routing, request/response |
| Adapter (Outbound) | `internal/adapter/outbound/teradata` | Database implementation |
| Adapter (Outbound) | `internal/adapter/outbound/redis` | Cache implementation |
| Infrastructure | `internal/infrastructure` | Config, logging, cross-cutting concerns |

### Dependency Direction

Dependencies MUST flow inward:
- `cmd` depends on all internal packages
- `adapter` depends on `application` and `domain`
- `application` depends only on `domain`
- `domain` has no internal dependencies

```go
// Good - adapter depends on domain
package teradata

import "github.com/your-org/lineage-api/internal/domain"

type LineageRepository struct {
    db *sql.DB
}

func (r *LineageRepository) GetLineageGraph(ctx context.Context, assetID string, depth int) (*domain.LineageGraph, error) {
    // Implementation
}

// Bad - domain depending on adapter (NEVER do this)
package domain

import "github.com/your-org/lineage-api/internal/adapter/outbound/teradata" // WRONG!
```

---

## Testing Conventions

### Test File Organization

- Test files MUST be named `*_test.go`
- Place tests in the same package as the code being tested
- Use `_test` package suffix for black-box testing of exported API

```
lineage_service.go
lineage_service_test.go      # White-box tests (same package)
lineage_service_export_test.go # Black-box tests (application_test package)
```

### Test Function Naming

Use the format `Test<FunctionName>_<Scenario>`:

```go
func TestLineageService_GetLineageGraph(t *testing.T) {
    // Basic happy path
}

func TestLineageService_GetLineageGraph_WithCache(t *testing.T) {
    // Tests cache hit scenario
}

func TestLineageService_GetLineageGraph_CacheMiss(t *testing.T) {
    // Tests cache miss scenario
}

func TestLineageService_GetLineageGraph_InvalidAssetID(t *testing.T) {
    // Tests error case
}
```

### Table-Driven Tests

Prefer table-driven tests for comprehensive coverage:

```go
func TestGetNodeLabel(t *testing.T) {
    tests := []struct {
        name     string
        node     domain.LineageNode
        expected string
    }{
        {
            name: "column node",
            node: domain.LineageNode{
                Type:         "column",
                DatabaseName: "sales",
                TableName:    "orders",
                ColumnName:   "amount",
            },
            expected: "orders.amount",
        },
        {
            name: "table node",
            node: domain.LineageNode{
                Type:         "table",
                DatabaseName: "sales",
                TableName:    "orders",
            },
            expected: "sales.orders",
        },
        {
            name: "database node",
            node: domain.LineageNode{
                Type:         "database",
                DatabaseName: "sales",
            },
            expected: "sales",
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            result := getNodeLabel(tt.node)
            if result != tt.expected {
                t.Errorf("getNodeLabel() = %v, want %v", result, tt.expected)
            }
        })
    }
}
```

### Mocking

Use interfaces for dependency injection and create mock implementations for testing:

```go
// Mock implementation for testing
type mockLineageRepository struct {
    getLineageGraphFunc func(ctx context.Context, assetID string, depth int) (*domain.LineageGraph, error)
}

func (m *mockLineageRepository) GetLineageGraph(ctx context.Context, assetID string, depth int) (*domain.LineageGraph, error) {
    return m.getLineageGraphFunc(ctx, assetID, depth)
}

func TestLineageService_GetLineageGraph(t *testing.T) {
    mockRepo := &mockLineageRepository{
        getLineageGraphFunc: func(ctx context.Context, assetID string, depth int) (*domain.LineageGraph, error) {
            return &domain.LineageGraph{
                Nodes: []domain.LineageNode{{ID: "test"}},
                Edges: []domain.LineageEdge{},
            }, nil
        },
    }

    service := NewLineageService(mockRepo, nil, nil)
    result, err := service.GetLineageGraph(context.Background(), GetLineageRequest{
        AssetID:  "test-asset",
        MaxDepth: 5,
    })

    if err != nil {
        t.Fatalf("unexpected error: %v", err)
    }
    if len(result.Graph.Nodes) != 1 {
        t.Errorf("expected 1 node, got %d", len(result.Graph.Nodes))
    }
}
```

### Test Helpers

Create test helpers for common setup:

```go
// testhelpers_test.go
func setupTestService(t *testing.T) (*LineageService, *mockLineageRepository, *mockCacheRepository) {
    t.Helper()

    mockLineage := &mockLineageRepository{}
    mockCache := &mockCacheRepository{}
    service := NewLineageService(mockLineage, nil, mockCache)

    return service, mockLineage, mockCache
}

func assertNoError(t *testing.T, err error) {
    t.Helper()
    if err != nil {
        t.Fatalf("unexpected error: %v", err)
    }
}
```

---

## Documentation Standards

### Package Documentation

Every package MUST have a doc comment in a file named `doc.go`:

```go
// Package domain defines the core domain entities and repository interfaces
// for the data lineage application. This package contains the business logic
// that is independent of external concerns like databases or HTTP.
//
// The main entities are:
//   - Database: represents a Teradata database
//   - Table: represents a table or view
//   - Column: represents a column in a table
//   - ColumnLineage: represents a lineage relationship between columns
//   - LineageGraph: represents the complete lineage graph with nodes and edges
package domain
```

### Function Documentation

Document exported functions with godoc-style comments:

```go
// GetLineageGraph retrieves the complete lineage graph for an asset.
// It first checks the cache for existing results before querying the database.
//
// The direction parameter controls which lineage is included:
//   - "upstream": only source columns
//   - "downstream": only target columns
//   - "both": both upstream and downstream
//
// Returns a LineageGraphResponse containing the asset ID and graph data,
// or an error if the query fails.
func (s *LineageService) GetLineageGraph(ctx context.Context, req GetLineageRequest) (*LineageGraphResponse, error) {
    // ...
}
```

### Struct Documentation

Document structs and their fields:

```go
// LineageNode represents a single node in the lineage graph.
// Nodes can be databases, tables, or columns depending on the Type field.
type LineageNode struct {
    // ID is the unique identifier for the node (e.g., "db.table.column")
    ID string `json:"id"`

    // Type indicates the node type: "database", "table", or "column"
    Type string `json:"type"`

    // DatabaseName is always populated
    DatabaseName string `json:"databaseName"`

    // TableName is populated for table and column nodes
    TableName string `json:"tableName,omitempty"`

    // ColumnName is only populated for column nodes
    ColumnName string `json:"columnName,omitempty"`

    // Metadata contains additional node-specific information
    Metadata map[string]any `json:"metadata,omitempty"`
}
```

### TODO Comments

Use TODO comments for future work with your name/team and issue reference:

```go
// TODO(team): Add support for filtered lineage queries - Issue #123
// TODO(dan): Optimize cache key generation for large graphs
```

---

## Concurrency Patterns

### Context Usage

Always accept and propagate context:

```go
// Good - context flows through all layers
func (h *Handler) GetLineage(w http.ResponseWriter, r *http.Request) {
    ctx := r.Context()
    response, err := h.lineageService.GetLineageGraph(ctx, req)
    // ...
}

func (s *LineageService) GetLineageGraph(ctx context.Context, req GetLineageRequest) (*LineageGraphResponse, error) {
    graph, err := s.lineageRepo.GetLineageGraph(ctx, req.AssetID, req.MaxDepth)
    // ...
}

func (r *LineageRepository) GetLineageGraph(ctx context.Context, assetID string, depth int) (*domain.LineageGraph, error) {
    rows, err := r.db.QueryContext(ctx, query, assetID, depth)
    // ...
}
```

### Goroutines

When using goroutines, always handle synchronization and errors:

```go
// Good - proper synchronization with errgroup
func (s *LineageService) GetLineageGraph(ctx context.Context, req GetLineageRequest) (*LineageGraphResponse, error) {
    g, ctx := errgroup.WithContext(ctx)

    var upstream, downstream []domain.ColumnLineage

    g.Go(func() error {
        var err error
        upstream, err = s.lineageRepo.GetUpstreamLineage(ctx, req.AssetID, req.MaxDepth)
        return err
    })

    g.Go(func() error {
        var err error
        downstream, err = s.lineageRepo.GetDownstreamLineage(ctx, req.AssetID, req.MaxDepth)
        return err
    })

    if err := g.Wait(); err != nil {
        return nil, fmt.Errorf("failed to get lineage: %w", err)
    }

    // Combine results
    return buildGraphResponse(req.AssetID, upstream, downstream), nil
}
```

### Channel Patterns

Use appropriate channel patterns:

```go
// Buffered channel for known size
results := make(chan *domain.LineageNode, len(nodeIDs))

// Done channel for cancellation
done := make(chan struct{})
defer close(done)

// Select with context cancellation
select {
case result := <-results:
    // Process result
case <-ctx.Done():
    return nil, ctx.Err()
}
```

### Connection Pool Settings

Follow project specification for database connections:

```go
func NewConnection(cfg Config) (*sql.DB, error) {
    db, err := sql.Open("odbc", connStr)
    if err != nil {
        return nil, fmt.Errorf("failed to open connection: %w", err)
    }

    // Connection pool settings (from project spec)
    db.SetMaxOpenConns(25)
    db.SetMaxIdleConns(5)

    if err := db.Ping(); err != nil {
        return nil, fmt.Errorf("failed to ping database: %w", err)
    }

    return db, nil
}
```

---

## Dependency Management

### Go Modules

This project uses Go modules. Required dependencies (from specification):

```go
// go.mod
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

### Adding Dependencies

```bash
# Add a new dependency
go get github.com/package/name@latest

# Add a specific version
go get github.com/package/name@v1.2.3

# Tidy up unused dependencies
go mod tidy
```

### Vendoring

For production deployments, consider vendoring dependencies:

```bash
go mod vendor
```

### Version Pinning

Pin major versions in imports where necessary:

```go
import (
    "github.com/go-chi/chi/v5"           // v5 major version
    "github.com/redis/go-redis/v9"       // v9 major version
)
```

### Dependency Selection Criteria

When choosing dependencies, prefer:
1. Standard library when possible
2. Well-maintained, widely-used packages
3. Packages with clear documentation
4. Packages with stable APIs

The project uses these specific packages:
- **Chi v5**: Lightweight, idiomatic HTTP router
- **Viper**: Configuration management
- **go-redis v9**: Redis client
- **ODBC driver**: Teradata connectivity

---

## Makefile Commands

Include a Makefile for common operations:

```makefile
.PHONY: build test lint fmt run

# Build the application
build:
	go build -o bin/server ./cmd/server

# Run tests
test:
	go test -v ./...

# Run tests with coverage
test-cover:
	go test -coverprofile=coverage.out ./...
	go tool cover -html=coverage.out

# Lint code
lint:
	golangci-lint run

# Format code
fmt:
	goimports -w .

# Run the server
run:
	go run ./cmd/server

# Clean build artifacts
clean:
	rm -rf bin/ coverage.out
```

---

## Quick Reference

| Category | Convention |
|----------|------------|
| Package names | Short, lowercase, single word |
| File names | Lowercase with underscores |
| Variables | camelCase |
| Constants | MixedCaps or SCREAMING_SNAKE_CASE |
| Functions | MixedCaps (exported) / mixedCaps (unexported) |
| Interfaces | "-er" suffix or descriptive names |
| Structs | MixedCaps, descriptive names |
| Test functions | `Test<Function>_<Scenario>` |
| Error messages | Lowercase, no punctuation, descriptive |
| Context | Always first parameter, named `ctx` |
| HTTP response/request | `w http.ResponseWriter, r *http.Request` |
