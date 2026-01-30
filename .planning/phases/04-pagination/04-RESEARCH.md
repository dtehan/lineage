# Phase 4: Pagination - Research

**Researched:** 2026-01-29
**Domain:** REST API pagination with Go backend, TanStack Query frontend, Teradata database
**Confidence:** HIGH

## Summary

This phase implements pagination for asset listing endpoints (databases, tables, columns). The implementation requires changes across three layers: HTTP handlers (query parameter parsing and validation), repository layer (SQL with LIMIT OFFSET), and DTOs (response metadata). The frontend uses TanStack Query v5 which is already installed.

The existing codebase has established patterns from Phase 3 (input validation) that should be followed: package-level validation configuration via `SetValidationConfig`, field-level error responses via `ValidationErrorResponse`, and table-driven tests. The Python server (`python_server.py`) already has working pagination examples for database/table lineage endpoints that can serve as reference for the response structure.

**Primary recommendation:** Add pagination to asset endpoints by extending existing validation patterns, using Teradata LIMIT OFFSET syntax in repositories, and updating frontend hooks to pass pagination params with `keepPreviousData` for smooth UX.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Go stdlib | 1.21+ | HTTP handling, strconv | Already used, no new deps |
| Chi router | v5.0.11 | URL params, middleware | Already installed |
| TanStack Query | ^5.17.0 | Data fetching with pagination | Already installed |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Existing validation.go | - | Parameter validation pattern | Extend for limit/offset |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| LIMIT OFFSET | Cursor-based pagination | Cursor is better for large datasets, but LIMIT OFFSET is simpler and matches existing Python implementation |
| Manual validation | go-playground/validator | Decision from 03-01: only 2 params don't justify dependency |

**Installation:**
No new packages required - all dependencies already present.

## Architecture Patterns

### Recommended Project Structure
```
lineage-api/
├── internal/
│   ├── adapter/inbound/http/
│   │   ├── validation.go        # ADD: pagination validation vars/funcs
│   │   ├── handlers.go          # MODIFY: asset handlers accept pagination
│   │   └── handlers_test.go     # ADD: pagination tests
│   ├── application/
│   │   └── dto.go               # ADD: PaginatedResponse fields
│   └── adapter/outbound/teradata/
│       └── asset_repo.go        # MODIFY: LIMIT OFFSET queries
lineage-ui/
├── src/
│   ├── api/hooks/
│   │   └── useAssets.ts         # MODIFY: accept pagination params
│   └── types/
│       └── index.ts             # ADD: pagination metadata types
```

### Pattern 1: Pagination Parameter Validation
**What:** Extend existing validation pattern from Phase 3 for limit/offset parameters
**When to use:** All asset listing endpoints
**Example:**
```go
// Source: Existing validation.go pattern
var (
    paginationMinLimit     = 1
    paginationMaxLimit     = 500
    paginationDefaultLimit = 100
    paginationMinOffset    = 0
)

func SetPaginationConfig(minLimit, maxLimit, defaultLimit int) {
    paginationMinLimit = minLimit
    paginationMaxLimit = maxLimit
    paginationDefaultLimit = defaultLimit
}

func parseAndValidatePaginationParams(r *http.Request) (limit, offset int, errors []FieldError) {
    errors = make([]FieldError, 0)

    // Parse limit
    limitStr := r.URL.Query().Get("limit")
    if limitStr == "" {
        limit = paginationDefaultLimit
    } else {
        var err error
        limit, err = strconv.Atoi(limitStr)
        if err != nil {
            errors = append(errors, FieldError{
                Field:   "limit",
                Message: fmt.Sprintf("limit must be an integer (got: %q)", limitStr),
            })
        } else if limit < paginationMinLimit || limit > paginationMaxLimit {
            errors = append(errors, FieldError{
                Field:   "limit",
                Message: fmt.Sprintf("limit must be between %d and %d (got: %d)",
                    paginationMinLimit, paginationMaxLimit, limit),
            })
        }
    }

    // Parse offset
    offsetStr := r.URL.Query().Get("offset")
    if offsetStr == "" {
        offset = 0
    } else {
        var err error
        offset, err = strconv.Atoi(offsetStr)
        if err != nil {
            errors = append(errors, FieldError{
                Field:   "offset",
                Message: fmt.Sprintf("offset must be an integer (got: %q)", offsetStr),
            })
        } else if offset < paginationMinOffset {
            errors = append(errors, FieldError{
                Field:   "offset",
                Message: fmt.Sprintf("offset must be >= %d (got: %d)", paginationMinOffset, offset),
            })
        }
    }

    return limit, offset, errors
}
```

### Pattern 2: Paginated Response DTO
**What:** Standardized response structure with pagination metadata
**When to use:** All paginated list responses
**Example:**
```go
// Source: Existing dto.go pattern + python_server.py pagination structure
type PaginationMeta struct {
    TotalCount int  `json:"total_count"`
    Limit      int  `json:"limit"`
    Offset     int  `json:"offset"`
    HasNext    bool `json:"has_next"`
}

type DatabaseListResponse struct {
    Databases  []domain.Database `json:"databases"`
    Pagination PaginationMeta    `json:"pagination"`
}

type TableListResponse struct {
    Tables     []domain.Table `json:"tables"`
    Pagination PaginationMeta `json:"pagination"`
}

type ColumnListResponse struct {
    Columns    []domain.Column `json:"columns"`
    Pagination PaginationMeta `json:"pagination"`
}
```

### Pattern 3: Teradata LIMIT OFFSET Query
**What:** SQL pagination with count query
**When to use:** Repository layer for list operations
**Example:**
```go
// Source: Teradata documentation (teradatapoint.com)
func (r *AssetRepository) ListDatabasesPaginated(ctx context.Context, limit, offset int) ([]domain.Database, int, error) {
    // First get total count
    countQuery := `
        SELECT COUNT(*)
        FROM demo_user.LIN_DATABASE
        WHERE is_active = 'Y'
    `
    var totalCount int
    err := r.db.QueryRowContext(ctx, countQuery).Scan(&totalCount)
    if err != nil {
        return nil, 0, fmt.Errorf("failed to count databases: %w", err)
    }

    // Then get paginated results
    query := `
        SELECT
            database_id,
            database_name,
            owner_name,
            create_timestamp,
            comment_string
        FROM demo_user.LIN_DATABASE
        WHERE is_active = 'Y'
        ORDER BY database_name
        LIMIT ? OFFSET ?
    `

    rows, err := r.db.QueryContext(ctx, query, limit, offset)
    // ... scan rows

    return databases, totalCount, nil
}
```

### Pattern 4: TanStack Query v5 Pagination
**What:** Frontend hooks with pagination state
**When to use:** Asset browser and list components
**Example:**
```typescript
// Source: TanStack Query v5 docs - placeholderData with keepPreviousData
import { useQuery, keepPreviousData } from '@tanstack/react-query';

interface PaginationMeta {
  total_count: number;
  limit: number;
  offset: number;
  has_next: boolean;
}

interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationMeta;
}

export function useDatabases(limit = 100, offset = 0) {
  return useQuery({
    queryKey: ['databases', { limit, offset }],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: String(limit),
        offset: String(offset)
      });
      const { data } = await apiClient.get<PaginatedResponse<Database>>(
        `/assets/databases?${params}`
      );
      return data;
    },
    placeholderData: keepPreviousData, // Smooth transitions between pages
  });
}
```

### Anti-Patterns to Avoid
- **Mixing `Total` and `Pagination` fields:** Keep backward compat by using `pagination.total_count` not top-level `total`
- **Fetching all then slicing in Go:** Always push LIMIT OFFSET to database
- **Missing ORDER BY:** Required for consistent pagination results
- **Negative offset validation only in SQL:** Validate in handler before repository call

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Pagination validation | Custom parsing | Extend validation.go pattern | Consistent with Phase 3, includes field errors |
| Response structure | Ad-hoc JSON | PaginationMeta DTO | Frontend type safety, consistent API |
| UI page transitions | Loading spinners | keepPreviousData | Prevents UI flicker between pages |
| SQL pagination | ROW_NUMBER() | LIMIT OFFSET | Simpler, matches existing Python impl |

**Key insight:** The codebase already has pagination working in Python for database lineage endpoints - follow that response structure for consistency.

## Common Pitfalls

### Pitfall 1: Breaking Existing Response Format
**What goes wrong:** Changing `total` to `pagination.total_count` breaks existing frontend code
**Why it happens:** Not considering backward compatibility during API changes
**How to avoid:**
- Keep existing `Total` field temporarily if needed, OR
- Update frontend hooks in same PR
- Run E2E tests before merge
**Warning signs:** Frontend tests failing after backend changes

### Pitfall 2: COUNT(*) Performance on Large Tables
**What goes wrong:** COUNT(*) query becomes slow on tables with millions of rows
**Why it happens:** Teradata scans entire table for count
**How to avoid:**
- For this lineage app (metadata, not data), row counts are small (hundreds to thousands)
- If needed later, cache counts or use approximate counts
**Warning signs:** Slow API response times on list endpoints

### Pitfall 3: Off-by-One in has_next Calculation
**What goes wrong:** `has_next` is true when there are exactly `limit` remaining items
**Why it happens:** Incorrect math: `has_next = offset + len(results) < totalCount`
**How to avoid:** `has_next = offset + limit < totalCount` (use limit, not result length)
**Warning signs:** Empty last page when clicking "next"

### Pitfall 4: Missing Validation for limit > max
**What goes wrong:** User requests limit=10000, database query becomes expensive
**Why it happens:** Only checking for non-integer, not bounds
**How to avoid:** Validate `limit > paginationMaxLimit` returns 400
**Warning signs:** Slow queries with large limit values

### Pitfall 5: Frontend Not Resetting Offset on Filter Change
**What goes wrong:** User changes database filter, but offset stays at 200, shows no results
**Why it happens:** queryKey doesn't include filter, so old page state persists
**How to avoid:** Include all filters in queryKey; reset offset when filters change
**Warning signs:** Empty results after changing filters

## Code Examples

Verified patterns from official sources:

### Backend Handler Update
```go
// Source: Existing handlers.go pattern extended
func (h *Handler) ListDatabases(w http.ResponseWriter, r *http.Request) {
    ctx := r.Context()

    // Validate pagination params - returns 400 if invalid
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
        )
        respondError(w, r, http.StatusInternalServerError, "Internal server error")
        return
    }

    hasNext := offset + limit < totalCount

    respondJSON(w, http.StatusOK, application.DatabaseListResponse{
        Databases: databases,
        Pagination: application.PaginationMeta{
            TotalCount: totalCount,
            Limit:      limit,
            Offset:     offset,
            HasNext:    hasNext,
        },
    })
}
```

### Repository with COUNT and LIMIT OFFSET
```go
// Source: Teradata SQL documentation
func (r *AssetRepository) ListDatabasesPaginated(ctx context.Context, limit, offset int) ([]domain.Database, int, error) {
    // Get total count
    countQuery := `SELECT COUNT(*) FROM demo_user.LIN_DATABASE WHERE is_active = 'Y'`
    var totalCount int
    if err := r.db.QueryRowContext(ctx, countQuery).Scan(&totalCount); err != nil {
        return nil, 0, fmt.Errorf("failed to count databases: %w", err)
    }

    // Get page of results
    query := `
        SELECT
            database_id, database_name, owner_name, create_timestamp, comment_string
        FROM demo_user.LIN_DATABASE
        WHERE is_active = 'Y'
        ORDER BY database_name
        LIMIT ? OFFSET ?
    `
    rows, err := r.db.QueryContext(ctx, query, limit, offset)
    if err != nil {
        return nil, 0, fmt.Errorf("failed to query databases: %w", err)
    }
    defer rows.Close()

    var databases []domain.Database
    // ... scan loop
    return databases, totalCount, rows.Err()
}
```

### Service Layer Pass-Through
```go
// Source: Existing asset_service.go pattern
func (s *AssetService) ListDatabasesPaginated(ctx context.Context, limit, offset int) ([]domain.Database, int, error) {
    return s.assetRepo.ListDatabasesPaginated(ctx, limit, offset)
}
```

### Domain Repository Interface Update
```go
// Source: Existing repository.go pattern
type AssetRepository interface {
    // Existing non-paginated methods (keep for backward compat if needed)
    ListDatabases(ctx context.Context) ([]Database, error)

    // New paginated methods
    ListDatabasesPaginated(ctx context.Context, limit, offset int) ([]Database, int, error)
    ListTablesPaginated(ctx context.Context, databaseName string, limit, offset int) ([]Table, int, error)
    ListColumnsPaginated(ctx context.Context, databaseName, tableName string, limit, offset int) ([]Column, int, error)

    // ... other existing methods
}
```

### Frontend Hook with Pagination
```typescript
// Source: TanStack Query v5 docs
export function useDatabases(limit = 100, offset = 0, enabled = true) {
  return useQuery({
    queryKey: ['databases', { limit, offset }],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('limit', String(limit));
      params.set('offset', String(offset));
      const { data } = await apiClient.get<{
        databases: Database[];
        pagination: {
          total_count: number;
          limit: number;
          offset: number;
          has_next: boolean;
        };
      }>(`/assets/databases?${params}`);
      return data;
    },
    enabled,
    placeholderData: keepPreviousData,
  });
}
```

### Test Pattern for Pagination Validation
```go
// Source: Existing handlers_test.go pattern
func TestListDatabases_PaginationValidation(t *testing.T) {
    SetPaginationConfig(1, 500, 100)

    tests := []struct {
        name         string
        limitParam   string
        offsetParam  string
        expectStatus int
        expectError  bool
    }{
        // Valid cases
        {"default values", "", "", http.StatusOK, false},
        {"valid limit", "50", "", http.StatusOK, false},
        {"valid limit and offset", "50", "100", http.StatusOK, false},
        {"min limit", "1", "0", http.StatusOK, false},
        {"max limit", "500", "0", http.StatusOK, false},

        // Invalid limit
        {"limit zero", "0", "", http.StatusBadRequest, true},
        {"limit negative", "-1", "", http.StatusBadRequest, true},
        {"limit above max", "501", "", http.StatusBadRequest, true},
        {"limit non-integer", "abc", "", http.StatusBadRequest, true},

        // Invalid offset
        {"offset negative", "100", "-1", http.StatusBadRequest, true},
        {"offset non-integer", "100", "abc", http.StatusBadRequest, true},
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            handler, assetRepo, _, _ := setupTestHandler()
            assetRepo.Databases = []domain.Database{{ID: "db-001", Name: "test"}}
            assetRepo.DatabaseCount = 1

            url := "/api/v1/assets/databases"
            params := []string{}
            if tt.limitParam != "" {
                params = append(params, "limit="+tt.limitParam)
            }
            if tt.offsetParam != "" {
                params = append(params, "offset="+tt.offsetParam)
            }
            if len(params) > 0 {
                url += "?" + strings.Join(params, "&")
            }

            req := newTestRequestWithRequestID("GET", url, nil)
            w := httptest.NewRecorder()

            handler.ListDatabases(w, req)

            assert.Equal(t, tt.expectStatus, w.Code)
            if tt.expectError {
                assert.Contains(t, w.Body.String(), "VALIDATION_ERROR")
            }
        })
    }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| All results in one response | LIMIT OFFSET pagination | This phase | Prevents large payloads, enables virtual scrolling |
| TanStack Query v4 keepPreviousData | v5 placeholderData: keepPreviousData | TanStack Query v5 | Same functionality, different API |
| Separate total in response | total_count in pagination object | This phase | Cleaner API structure |

**Deprecated/outdated:**
- TanStack Query v4 `keepPreviousData` option: Use `placeholderData: keepPreviousData` function in v5
- Direct `isPreviousData`: Use `isPlaceholderData` in v5

## Open Questions

Things that couldn't be fully resolved:

1. **Cursor-based pagination for future**
   - What we know: LIMIT OFFSET works fine for small datasets
   - What's unclear: If dataset grows to 100K+ rows, OFFSET becomes slow
   - Recommendation: Implement LIMIT OFFSET now, document cursor-based as future option

2. **Frontend infinite scroll vs explicit pagination**
   - What we know: Requirements say "load additional pages as needed"
   - What's unclear: Should AssetBrowser use infinite scroll or page buttons?
   - Recommendation: Use explicit pagination controls first (simpler), can add infinite scroll later

## Sources

### Primary (HIGH confidence)
- Existing codebase files: handlers.go, validation.go, dto.go, asset_repo.go
- Teradata documentation: [SQL SELECT LIMIT](https://www.teradatapoint.com/sql/sql-select-limit.htm) - LIMIT OFFSET syntax
- TanStack Query v5 migration guide: placeholderData pattern

### Secondary (MEDIUM confidence)
- [REST API Pagination Best Practices](https://medium.com/@khdevnet/restful-api-pagination-best-practices-a-developers-guide-5b177a9552ef) - Response structure patterns
- [Go Pagination Guide](https://dev.to/siddheshk02/how-to-paginate-api-responses-in-go-4cga) - offset calculation formula

### Tertiary (LOW confidence)
- General web search for common pitfalls - needs validation in implementation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Using only existing libraries
- Architecture: HIGH - Following established codebase patterns
- Pitfalls: MEDIUM - Based on common patterns, may discover more during implementation

**Research date:** 2026-01-29
**Valid until:** 60 days (stable domain, no fast-moving dependencies)
