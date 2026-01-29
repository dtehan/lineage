# Architecture Research: Integrating Cross-Cutting Concerns in Hexagonal Architecture

**Domain:** Go API with Hexagonal/Clean Architecture
**Researched:** 2026-01-29
**Confidence:** HIGH

## Executive Summary

This research addresses how to integrate validation, error handling, pagination, and configuration into an existing hexagonal architecture Go API without violating separation of concerns. The key insight is that these concerns are **not monolithic** - they have different aspects that belong in different layers.

**Core principle:** Each layer validates what it owns and wraps errors at layer boundaries.

---

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        HTTP ADAPTER (Inbound)                                │
│  ┌─────────────────┐  ┌──────────────┐  ┌─────────────────┐                 │
│  │  Router/Mux     │  │  Middleware  │  │    Handlers     │                 │
│  │  (Chi router)   │  │  (logging,   │  │  (parse params, │                 │
│  │                 │  │   recovery)  │  │   call service) │                 │
│  └────────┬────────┘  └──────────────┘  └────────┬────────┘                 │
│           │                                      │                           │
│           │  INPUT VALIDATION:                   │  ERROR MAPPING:           │
│           │  - HTTP syntax (maxDepth is int)     │  - Domain errors → HTTP   │
│           │  - Required params present           │  - Hide internal details  │
│           │  - Value ranges (0 < maxDepth ≤ 20)  │  - Structured responses   │
├───────────┴──────────────────────────────────────┴───────────────────────────┤
│                        APPLICATION LAYER                                      │
│  ┌─────────────────┐  ┌──────────────────┐  ┌─────────────────┐             │
│  │  DTOs           │  │  Services        │  │  Validators     │             │
│  │  (requests,     │  │  (orchestrate    │  │  (business rule │             │
│  │   responses)    │  │   use cases)     │  │   validation)   │             │
│  └─────────────────┘  └────────┬─────────┘  └─────────────────┘             │
│                                │                                             │
│           BUSINESS VALIDATION:  │  ERROR WRAPPING:                          │
│           - Logical consistency │  - Add context to errors                  │
│           - Cross-field rules   │  - Classify error types                   │
│           - Pagination bounds   │  - Never expose DB details                │
├────────────────────────────────┴─────────────────────────────────────────────┤
│                        DOMAIN LAYER                                          │
│  ┌─────────────────┐  ┌──────────────────┐  ┌─────────────────┐             │
│  │  Entities       │  │  Repository      │  │  Domain Errors  │             │
│  │  (Database,     │  │  Interfaces      │  │  (ErrNotFound,  │             │
│  │   Table, etc.)  │  │  (ports)         │  │   ErrInvalid)   │             │
│  └─────────────────┘  └──────────────────┘  └─────────────────┘             │
│                                                                              │
│           INVARIANT PROTECTION:                                              │
│           - Entity construction rules                                        │
│           - Business rule enforcement                                        │
├──────────────────────────────────────────────────────────────────────────────┤
│                        OUTBOUND ADAPTERS                                     │
│  ┌──────────────────────┐  ┌──────────────────────┐                         │
│  │  Teradata Repo       │  │  Redis Cache         │                         │
│  │  (implements ports)  │  │  (implements ports)  │                         │
│  └──────────────────────┘  └──────────────────────┘                         │
│                                                                              │
│           TECHNICAL ERROR WRAPPING:                                          │
│           - Wrap SQL errors with context                                     │
│           - Map DB errors to domain errors                                   │
├──────────────────────────────────────────────────────────────────────────────┤
│                        INFRASTRUCTURE                                        │
│  ┌──────────────────────┐  ┌──────────────────────┐                         │
│  │  Configuration       │  │  Logging             │                         │
│  │  (centralized        │  │  (structured         │                         │
│  │   limits, defaults)  │  │   logging)           │                         │
│  └──────────────────────┘  └──────────────────────┘                         │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Layer Assignments for Each Concern

### 1. Input Validation

**Validation is NOT one thing** - it's a stack where each layer guards what it owns.

| Validation Type | Layer | Responsibility | Example |
|-----------------|-------|----------------|---------|
| HTTP Syntax | HTTP Adapter | Parse params, check types | `maxDepth` is valid integer |
| Required Fields | HTTP Adapter | Required params present | `assetId` not empty |
| Value Bounds | HTTP Adapter | Within allowed ranges | `0 < maxDepth <= 20` |
| Business Rules | Application | Logical consistency | Direction is "upstream", "downstream", or "both" |
| Invariants | Domain | Entity cannot exist in invalid state | Column cannot have negative position |

**Current Gap:** The existing handlers silently ignore invalid `maxDepth` values and use defaults:

```go
// Current code - problematic
maxDepthStr := r.URL.Query().Get("maxDepth")
maxDepth := 5
if maxDepthStr != "" {
    if d, err := strconv.Atoi(maxDepthStr); err == nil {
        maxDepth = d  // No validation of range!
    }
}
```

**Recommended Pattern:**

```go
// HTTP Handler - owns syntax and bounds validation
func (h *Handler) GetLineage(w http.ResponseWriter, r *http.Request) {
    maxDepth, err := parseMaxDepth(r.URL.Query().Get("maxDepth"), h.config.DefaultMaxDepth, h.config.MaxMaxDepth)
    if err != nil {
        respondError(w, http.StatusBadRequest, err.Error())
        return
    }
    // ... proceed with valid maxDepth
}

// parseMaxDepth validates and returns the depth parameter
func parseMaxDepth(s string, defaultVal, maxVal int) (int, error) {
    if s == "" {
        return defaultVal, nil
    }
    depth, err := strconv.Atoi(s)
    if err != nil {
        return 0, fmt.Errorf("maxDepth must be a valid integer")
    }
    if depth < 1 || depth > maxVal {
        return 0, fmt.Errorf("maxDepth must be between 1 and %d", maxVal)
    }
    return depth, nil
}
```

### 2. Error Handling and Wrapping

**Key Security Concern:** Database errors can leak schema information. Production APIs must hide internal details.

| Layer | Error Responsibility | Pattern |
|-------|---------------------|---------|
| Outbound Adapter | Wrap technical errors, map to domain errors | `fmt.Errorf("failed to query lineage: %w", err)` → `ErrDatabaseUnavailable` |
| Application | Add business context, classify errors | Wrap with use-case context |
| HTTP Adapter | Map domain errors to HTTP status codes | `ErrNotFound` → 404, `ErrInvalidInput` → 400 |

**Domain Errors (define in domain layer):**

```go
// internal/domain/errors.go
package domain

import "errors"

// Sentinel errors for specific conditions
var (
    ErrNotFound          = errors.New("resource not found")
    ErrInvalidInput      = errors.New("invalid input")
    ErrInvalidDepth      = errors.New("invalid depth parameter")
    ErrInvalidDirection  = errors.New("invalid direction parameter")
    ErrDatabaseError     = errors.New("database operation failed")
)

// NotFoundError provides structured not-found errors
type NotFoundError struct {
    Resource string
    ID       string
}

func (e *NotFoundError) Error() string {
    return fmt.Sprintf("%s not found: %s", e.Resource, e.ID)
}

func (e *NotFoundError) Is(target error) bool {
    return target == ErrNotFound
}
```

**Error Mapping in HTTP Adapter:**

```go
// internal/adapter/inbound/http/errors.go
package http

import (
    "errors"
    "net/http"

    "github.com/lineage-api/internal/domain"
)

// mapErrorToStatus converts domain errors to HTTP status codes
func mapErrorToStatus(err error) int {
    if errors.Is(err, domain.ErrNotFound) {
        return http.StatusNotFound
    }
    if errors.Is(err, domain.ErrInvalidInput) ||
       errors.Is(err, domain.ErrInvalidDepth) ||
       errors.Is(err, domain.ErrInvalidDirection) {
        return http.StatusBadRequest
    }
    // Default: hide internal errors from client
    return http.StatusInternalServerError
}

// sanitizeError returns a user-safe error message
func sanitizeError(err error) string {
    // For known domain errors, use their message
    if errors.Is(err, domain.ErrNotFound) ||
       errors.Is(err, domain.ErrInvalidInput) {
        return err.Error()
    }
    // For unknown/internal errors, return generic message
    return "internal server error"
}
```

**Outbound Adapter Error Wrapping:**

```go
// internal/adapter/outbound/teradata/lineage_repo.go

func (r *LineageRepository) GetUpstreamLineage(ctx context.Context, columnID string, maxDepth int) ([]domain.ColumnLineage, error) {
    rows, err := r.db.QueryContext(ctx, query, columnID, maxDepth)
    if err != nil {
        // Wrap with context but don't expose raw SQL error
        if errors.Is(err, sql.ErrNoRows) {
            return nil, &domain.NotFoundError{Resource: "column", ID: columnID}
        }
        // Log the full error for debugging, return sanitized error
        // log.Error("database query failed", "error", err, "query", "GetUpstreamLineage")
        return nil, fmt.Errorf("failed to query upstream lineage: %w", domain.ErrDatabaseError)
    }
    // ...
}
```

### 3. Pagination

**Where pagination belongs depends on what's being paginated:**

| Concern | Layer | Why |
|---------|-------|-----|
| Page/limit/offset parsing | HTTP Adapter | HTTP-specific parameters |
| Pagination DTO | Application | Data transfer structure |
| Paginated query execution | Outbound Adapter | Database-specific LIMIT/OFFSET |
| Total count retrieval | Outbound Adapter | Requires database access |

**Recommended Structure:**

```go
// internal/application/dto.go - Application layer owns pagination DTOs

// PaginationRequest represents client-provided pagination parameters
type PaginationRequest struct {
    Limit  int `json:"limit"`
    Offset int `json:"offset"`
}

// PaginationResponse provides pagination metadata in responses
type PaginationResponse struct {
    Limit      int `json:"limit"`
    Offset     int `json:"offset"`
    Total      int `json:"total"`
    HasMore    bool `json:"hasMore"`
}

// PaginatedResponse wraps any paginated data
type PaginatedResponse[T any] struct {
    Data       []T                `json:"data"`
    Pagination PaginationResponse `json:"pagination"`
}

// Example: Paginated database list
type DatabaseListResponse struct {
    Databases  []domain.Database  `json:"databases"`
    Pagination PaginationResponse `json:"pagination"`
}
```

**Repository Interface Update:**

```go
// internal/domain/repository.go

type AssetRepository interface {
    // Add pagination support to list methods
    ListDatabases(ctx context.Context, limit, offset int) ([]Database, int, error)  // returns items, total, error
    ListTables(ctx context.Context, databaseName string, limit, offset int) ([]Table, int, error)
    ListColumns(ctx context.Context, databaseName, tableName string, limit, offset int) ([]Column, int, error)
    // ... other methods unchanged
}
```

### 4. Configuration

**Configuration Centralization Strategy:**

| Config Type | Location | Access Pattern |
|-------------|----------|----------------|
| API limits (maxDepth, pagination) | Infrastructure config | Injected into handlers |
| Database connection | Infrastructure config | Injected into adapters |
| Cache settings | Infrastructure config | Injected into cache adapter |
| Feature flags | Infrastructure config | Injected where needed |

**Recommended Configuration Structure:**

```go
// internal/infrastructure/config/config.go

type Config struct {
    Port     string
    Teradata TeradataConfig
    Redis    RedisConfig
    API      APIConfig  // NEW: API-specific limits
}

// APIConfig holds API behavior configuration
type APIConfig struct {
    DefaultMaxDepth   int `mapstructure:"DEFAULT_MAX_DEPTH" default:"5"`
    MaxMaxDepth       int `mapstructure:"MAX_MAX_DEPTH" default:"20"`
    DefaultPageSize   int `mapstructure:"DEFAULT_PAGE_SIZE" default:"50"`
    MaxPageSize       int `mapstructure:"MAX_PAGE_SIZE" default:"1000"`

    // Valid direction values
    ValidDirections   []string `mapstructure:"VALID_DIRECTIONS" default:"[upstream,downstream,both]"`
}

// Handler receives config via dependency injection
type Handler struct {
    assetService   *application.AssetService
    lineageService *application.LineageService
    searchService  *application.SearchService
    config         *config.APIConfig  // Configuration injected here
}
```

### 5. DBQL Extraction Error Handling

DBQL extraction is a **batch/ETL process**, not a request-response operation. Error handling differs:

| Concern | Strategy |
|---------|----------|
| Individual query parse failures | Log warning, skip query, continue processing |
| Database connection failures | Retry with exponential backoff, alert after threshold |
| Partial extraction failures | Record watermark of last successful batch |
| Invalid column mappings | Log detailed error, skip mapping, mark as unresolved |

**This belongs in the extraction scripts, not the API layers.**

---

## Data Flow: Request Through Layers

### Happy Path

```
HTTP Request: GET /api/v1/lineage/db.table.col?direction=upstream&maxDepth=10
    │
    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ HTTP Handler                                                            │
│  1. Parse URL params (assetId from path, direction/maxDepth from query) │
│  2. Validate syntax (maxDepth is int, direction is valid enum)          │
│  3. Validate bounds (1 <= maxDepth <= 20)                               │
│  4. Build DTO: GetLineageRequest{AssetID, Direction, MaxDepth}          │
└─────────────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Application Service                                                      │
│  1. Receive DTO                                                          │
│  2. Optionally validate business rules                                   │
│  3. Call repository through port interface                               │
│  4. Transform domain result to response DTO                              │
└─────────────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Teradata Repository (Outbound Adapter)                                   │
│  1. Execute recursive CTE query with maxDepth                            │
│  2. Scan rows into domain entities                                       │
│  3. Wrap any SQL errors with context                                     │
│  4. Return domain.LineageGraph                                           │
└─────────────────────────────────────────────────────────────────────────┘
    │
    ▼
HTTP Response: 200 OK with LineageGraphResponse JSON
```

### Error Path

```
HTTP Request: GET /api/v1/lineage/invalid.asset?maxDepth=999
    │
    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ HTTP Handler                                                            │
│  1. Parse maxDepth="999" → int 999                                      │
│  2. Validate bounds: 999 > maxMaxDepth(20) → FAIL                       │
│  3. Return 400 Bad Request: "maxDepth must be between 1 and 20"         │
└─────────────────────────────────────────────────────────────────────────┘
    │
    ▼
HTTP Response: 400 Bad Request
{
    "error": "maxDepth must be between 1 and 20"
}
```

---

## Patterns to Follow

### Pattern 1: Validation Middleware for Common Params

**What:** Centralize validation of common query parameters in middleware
**When:** Parameters used across multiple endpoints (pagination, depth limits)
**Trade-offs:** Cleaner handlers vs. slightly more complex middleware chain

```go
// internal/adapter/inbound/http/middleware/validation.go

func ValidatePagination(config *config.APIConfig) func(next http.Handler) http.Handler {
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            limit, err := parseIntParam(r, "limit", config.DefaultPageSize, 1, config.MaxPageSize)
            if err != nil {
                respondError(w, http.StatusBadRequest, err.Error())
                return
            }
            offset, err := parseIntParam(r, "offset", 0, 0, math.MaxInt32)
            if err != nil {
                respondError(w, http.StatusBadRequest, err.Error())
                return
            }

            // Store in context for handler access
            ctx := context.WithValue(r.Context(), paginationKey, PaginationParams{Limit: limit, Offset: offset})
            next.ServeHTTP(w, r.WithContext(ctx))
        })
    }
}
```

### Pattern 2: Domain Error Types with `errors.Is` Support

**What:** Custom error types that work with Go 1.13+ error wrapping
**When:** Need to distinguish error types across layer boundaries
**Trade-offs:** More code vs. type-safe error handling

```go
// Domain errors implement Is() for errors.Is() support
type NotFoundError struct {
    Resource string
    ID       string
}

func (e *NotFoundError) Error() string {
    return fmt.Sprintf("%s not found: %s", e.Resource, e.ID)
}

func (e *NotFoundError) Is(target error) bool {
    return target == ErrNotFound
}

// Usage in handler:
if errors.Is(err, domain.ErrNotFound) {
    respondError(w, http.StatusNotFound, err.Error())
    return
}
```

### Pattern 3: Configuration Injection

**What:** Inject configuration at construction time, not runtime
**When:** Always - avoids global state and enables testing
**Trade-offs:** More constructor parameters vs. explicit dependencies

```go
// Construction with config injection
func NewHandler(
    assetService *application.AssetService,
    lineageService *application.LineageService,
    searchService *application.SearchService,
    apiConfig *config.APIConfig,  // Config injected here
) *Handler {
    return &Handler{
        assetService:   assetService,
        lineageService: lineageService,
        searchService:  searchService,
        config:         apiConfig,
    }
}

// main.go wiring
cfg, _ := config.Load()
handler := http.NewHandler(assetSvc, lineageSvc, searchSvc, &cfg.API)
```

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Validation in Domain Layer for HTTP Concerns

**What people do:** Put `maxDepth` range validation in domain entities
**Why it's wrong:** HTTP parameter bounds are not domain invariants. The domain doesn't care about API limits.
**Do this instead:** Validate HTTP concerns in HTTP adapter, domain invariants in domain entities

### Anti-Pattern 2: Exposing Raw Database Errors

**What people do:** Return `err.Error()` directly to clients
**Why it's wrong:** Leaks schema information, SQL syntax, connection details
**Do this instead:** Log full error internally, return sanitized error to client

### Anti-Pattern 3: Pagination Logic in Domain

**What people do:** Put LIMIT/OFFSET in domain interfaces or entities
**Why it's wrong:** Pagination is a presentation/transport concern, not domain logic
**Do this instead:** Repository methods accept limit/offset, domain stays unaware

### Anti-Pattern 4: Global Configuration Access

**What people do:** `config.Get("maxDepth")` called anywhere in code
**Why it's wrong:** Hidden dependencies, hard to test, global state
**Do this instead:** Inject config at construction time

---

## Implementation Order

Based on dependencies between components:

### Phase 1: Foundation (No Dependencies)

1. **Domain errors** (`internal/domain/errors.go`)
   - Define sentinel errors and custom error types
   - No dependencies on other new code

2. **API configuration** (extend `internal/infrastructure/config/config.go`)
   - Add `APIConfig` struct with limits
   - No dependencies on other new code

### Phase 2: Error Infrastructure (Depends on Phase 1)

3. **Error mapping** (`internal/adapter/inbound/http/errors.go`)
   - `mapErrorToStatus()`, `sanitizeError()` functions
   - Depends on: domain errors

4. **Repository error wrapping** (update existing repos)
   - Wrap SQL errors, map to domain errors
   - Depends on: domain errors

### Phase 3: Validation Infrastructure (Depends on Phases 1-2)

5. **Validation helpers** (`internal/adapter/inbound/http/validation.go`)
   - Parameter parsing and validation functions
   - Depends on: API config, error types

6. **Handler updates** (update existing handlers)
   - Integrate validation, error mapping
   - Depends on: validation helpers, error mapping

### Phase 4: Pagination (Depends on Phases 1-3)

7. **Pagination DTOs** (extend `internal/application/dto.go`)
   - Request/Response structures for pagination
   - Depends on: API config (for defaults)

8. **Repository pagination** (update repository interfaces)
   - Add limit/offset to list methods
   - Depends on: pagination DTOs

9. **Handler pagination** (update list handlers)
   - Parse pagination params, format responses
   - Depends on: all above

---

## Component Boundaries Summary

| Component | Talks To | Never Talks To |
|-----------|----------|----------------|
| HTTP Handlers | Application Services, Config | Database directly, Redis directly |
| Application Services | Domain Repositories (via interfaces), Domain Entities | HTTP concerns, Database drivers |
| Domain | Nothing external | HTTP, Database, Cache - anything infrastructure |
| Outbound Adapters | Database drivers, Cache clients | HTTP handlers, Application services (except via interfaces) |
| Config | Viper/env loading | Application logic |

---

## Roadmap Implications

**Suggested Phase Structure:**

1. **Phase 1: Error Handling Foundation** (lowest risk, highest value)
   - Domain errors, error mapping, repository wrapping
   - Rationale: Fixes security issue immediately, foundation for other work

2. **Phase 2: Input Validation** (depends on Phase 1)
   - Validation helpers, handler updates
   - Rationale: Uses error types from Phase 1

3. **Phase 3: Configuration Centralization** (parallel with Phase 2)
   - API config structure, injection updates
   - Rationale: Enables configurable limits for validation

4. **Phase 4: Pagination** (depends on Phases 1-3)
   - DTOs, repository updates, handler updates
   - Rationale: Largest scope, benefits from validation/error foundations

---

## Sources

- [Applying Hexagonal Architecture to a Mid-Size Go Backend](https://sams96.github.io/go-project-layout/) - Feb 2025
- [Where To Put Validation in Clean Architecture](https://medium.com/@michaelmaurice410/where-to-put-validation-in-clean-architecture-so-its-obvious-fast-and-never-leaks-161bfd62f1dc)
- [Domain-Driven Hexagon](https://github.com/Sairyss/domain-driven-hexagon) - Reference architecture
- [Error Handling and Logging in Go Applications 2025](https://www.securegyan.com/error-handling-and-logging-in-go-applications/) - Security considerations
- [A practical guide to error handling in Go](https://www.datadoghq.com/blog/go-error-handling/) - Datadog
- [Hexagonal Architecture/Ports And Adapters: Clarifying Key Concepts Using Go](https://dev.to/buarki/hexagonal-architectureports-and-adapters-clarifying-key-concepts-using-go-14oo)
- Existing project: `specs/coding_standards_go.md` - Project coding standards

---

*Architecture research for: Hexagonal Architecture Production Fixes*
*Researched: 2026-01-29*
