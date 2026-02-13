# Architecture Patterns: Redis Caching Integration

**Domain:** Response caching for Teradata column-level lineage API (Go backend)
**Researched:** 2026-02-12
**Confidence:** HIGH

## Executive Summary

The existing codebase is **excellently prepared** for Redis caching integration. The foundation already exists:

- `domain.CacheRepository` interface is defined in `internal/domain/repository.go` (lines 31-36)
- `redis.CacheRepository` implements this interface in `internal/adapter/outbound/redis/cache.go` (lines 21-79)
- `redis.NoOpCache` provides graceful fallback when Redis is unavailable (lines 82-110)
- `redis.Config` is loaded from environment variables via `infrastructure/config/config.go` (lines 70-74)
- `MockCacheRepository` exists in `internal/domain/mocks/repositories.go` (lines 387-479) with call tracking

What is missing is the **cache decorator layer** that connects this infrastructure to the existing repository interfaces. The recommended approach is the **Repository Decorator pattern** implemented in the **outbound adapter layer**, keeping the domain and application layers completely unaware of caching.

---

## Current Architecture Analysis

### Existing Request Flow (No Cache)

```
HTTP Request
    |
    v
[HTTP Handler] ----validates----> [Application Service] ----calls----> [Teradata Repository]
    |                                    |                                      |
    | (Chi router, validation,           | (DTO transformation,                | (SQL execution,
    |  error mapping)                    |  business logic)                    |  row scanning)
    |                                    |                                      |
    v                                    v                                      v
HTTP Response <--- JSON serialize <--- DTO <--- domain entity <--- SQL result
```

### Key Observation: Services Are Thin Pass-Throughs

Examining the application services reveals they are minimal orchestrators:

- `AssetService.ListDatabases()` -- directly delegates to `assetRepo.ListDatabases()` (1 line)
- `LineageService.GetLineageGraph()` -- delegates to `lineageRepo.GetLineageGraph()`, wraps result in DTO
- `OpenLineageService.GetLineageGraph()` -- delegates to `repo.GetColumnLineageGraph()`, transforms to response DTO
- `OpenLineageService.GetDataset()` -- delegates to `repo.GetDataset()` + `repo.ListFields()`, transforms

This thin service layer means caching does NOT belong in the service layer. The services have no caching-specific logic to add. Placing cache logic there would bloat simple delegation methods with cache key generation, hit/miss branching, and error handling.

### Existing Domain Interface: CacheRepository

```go
// domain/repository.go (lines 31-36)
type CacheRepository interface {
    Get(ctx context.Context, key string, dest any) error
    Set(ctx context.Context, key string, value any, ttlSeconds int) error
    Delete(ctx context.Context, key string) error
    Exists(ctx context.Context, key string) (bool, error)
}
```

This is a **generic key-value cache interface**. It handles serialization (JSON marshal/unmarshal) internally. This is the right abstraction -- it does not leak Redis specifics into the domain.

### Existing Redis Implementation

```go
// adapter/outbound/redis/cache.go
type CacheRepository struct { client *redis.Client }  // Redis-backed
type NoOpCache struct{}                                // No-op fallback
```

The `NoOpCache` returns `ErrCacheMiss` on `Get`, returns `nil` on `Set`/`Delete`, and returns `false` on `Exists`. This means code using `CacheRepository` can treat it uniformly regardless of whether Redis is available -- a cache miss simply means "go to the database," which is exactly the fallback behavior.

### What Is NOT Wired Up

Looking at `cmd/server/main.go`, the Redis cache is **never instantiated**. The config loads `Redis.Addr`, `Redis.Password`, `Redis.DB` from environment variables, but `main.go` creates repositories and services without any cache involvement:

```go
// main.go (lines 46-61) - NO cache in the dependency chain
assetRepo := teradata.NewAssetRepository(db)
lineageRepo := teradata.NewLineageRepository(db, assetRepo)
searchRepo := teradata.NewSearchRepository(db)
assetService := application.NewAssetService(assetRepo)
lineageService := application.NewLineageService(lineageRepo)
searchService := application.NewSearchService(searchRepo)
```

---

## Recommended Architecture: Repository Decorator Pattern

### Why Repository Decorator (Not Service-Level, Not Middleware)

Three possible locations for caching logic were evaluated:

| Location | Pros | Cons | Verdict |
|----------|------|------|---------|
| **HTTP Middleware** | Simple, applies broadly | Cannot cache at domain entity level; only caches serialized JSON; cannot differentiate endpoints; no type safety | REJECTED |
| **Service Layer** | Service can add business-aware cache decisions | Bloats thin services; mixes caching concern with orchestration; every service method needs cache boilerplate | REJECTED |
| **Repository Decorator** | Transparent to service; implements same interface; composable; testable; follows hexagonal principles | Requires one decorator per repository interface | RECOMMENDED |

The repository decorator pattern is the canonical approach in hexagonal architecture because:

1. **Domain layer stays clean** -- no cache imports, no cache awareness
2. **Service layer stays clean** -- delegates to repository interface, unaware of caching
3. **Substitutability** -- swap `CachedOpenLineageRepository` for `OpenLineageRepository` via dependency injection
4. **Testability** -- test cache logic independently with mock repositories
5. **Granularity** -- cache only the methods that benefit from caching

### Cache Stores Domain Entities, Not DTOs

The cache should store **domain entities** (what repositories return), not DTOs (what services return). Rationale:

- Repositories return `domain.OpenLineageGraph`, `domain.OpenLineageDataset`, etc.
- Services transform these to DTOs (`OpenLineageGraphResponse`, `OpenLineageDatasetResponse`)
- If we cache DTOs, the cache is coupled to the presentation layer
- If we cache domain entities, the cache is reusable across any service that consumes the repository
- Domain entities already have `json` struct tags, so JSON serialization works naturally

### Architectural Position

```
                    ┌──────────────────────────────────┐
                    │         Domain Layer              │
                    │  repository.go (interfaces)       │
                    │  entities.go (types)              │
                    │  CacheRepository interface        │
                    └──────────────────┬───────────────┘
                                       │ implements
                    ┌──────────────────┴───────────────┐
                    │      Application Layer            │
                    │  OpenLineageService               │
                    │  LineageService                    │
                    │  AssetService                     │
                    │  (all unaware of caching)         │
                    └──────────────────┬───────────────┘
                                       │ calls interface
          ┌────────────────────────────┼────────────────────────────┐
          │                            │                            │
          ▼                            ▼                            ▼
┌─────────────────────┐  ┌─────────────────────┐  ┌──────────────────────────┐
│  Teradata Repos     │  │  Cached Repos       │  │  Redis CacheRepository   │
│  (outbound adapter) │  │  (outbound adapter) │  │  (outbound adapter)      │
│                     │  │                     │  │                          │
│  OpenLineageRepo    │  │  CachedOLRepo       │  │  Get/Set/Delete/Exists   │
│  AssetRepo          │  │  CachedAssetRepo    │  │  NoOpCache fallback      │
│  LineageRepo        │  │  CachedLineageRepo  │  │                          │
│  SearchRepo         │  │  CachedSearchRepo   │  │                          │
└─────────────────────┘  └──────────┬──────────┘  └──────────────────────────┘
                                    │
                                    │ wraps (composition)
                                    ▼
                          Teradata Repo + CacheRepository
```

### File Location

Cached repositories belong in a new package under the outbound adapter layer:

```
internal/adapter/outbound/cached/
    openlineage_repo.go       // CachedOpenLineageRepository
    openlineage_repo_test.go  // Tests with MockCacheRepository + MockOpenLineageRepository
    asset_repo.go             // CachedAssetRepository
    asset_repo_test.go
    lineage_repo.go           // CachedLineageRepository
    lineage_repo_test.go
    search_repo.go            // CachedSearchRepository (if search is cacheable)
    search_repo_test.go
    keys.go                   // Cache key generation functions
    keys_test.go
```

Rationale for a separate `cached/` package rather than placing decorators inside the `teradata/` package:
- **Separation of concerns** -- caching is not Teradata-specific
- **Testability** -- cached repos can be tested with any repository mock, not just Teradata
- **Clarity** -- package name communicates the pattern
- **Composability** -- could wrap other data source adapters in future

---

## Detailed Data Flow

### Cache Hit Path

```
HTTP Request: GET /api/v2/openlineage/lineage/{datasetId}/{fieldName}?direction=both&maxDepth=5
    |
    v
[OpenLineageHandler.GetLineageGraph]
    |
    v
[OpenLineageService.GetLineageGraph(ctx, datasetID, fieldName, "both", 5)]
    |
    v
[CachedOpenLineageRepository.GetColumnLineageGraph(ctx, datasetID, fieldName, "both", 5)]
    |
    |-- 1. Generate cache key: "ol:lineage:graph:{datasetID}:{fieldName}:both:5"
    |-- 2. cache.Get(ctx, key, &graph)  --> HIT (returns cached *domain.OpenLineageGraph)
    |-- 3. Return cached graph immediately (skip Teradata)
    |
    v
[OpenLineageService transforms to OpenLineageLineageResponse DTO]
    |
    v
[Handler serializes to JSON response]
```

### Cache Miss Path

```
[CachedOpenLineageRepository.GetColumnLineageGraph(ctx, datasetID, fieldName, "both", 5)]
    |
    |-- 1. Generate cache key: "ol:lineage:graph:{datasetID}:{fieldName}:both:5"
    |-- 2. cache.Get(ctx, key, &graph)  --> MISS (ErrCacheMiss or redis error)
    |-- 3. inner.GetColumnLineageGraph(ctx, datasetID, fieldName, "both", 5)  --> Teradata query
    |-- 4. cache.Set(ctx, key, graph, ttlSeconds)  --> Store result (fire-and-forget on error)
    |-- 5. Return graph from Teradata
```

### Redis Unavailable Path (Graceful Degradation)

```
[main.go startup]
    |
    |-- 1. redis.NewCacheRepository(cfg.Redis) --> error (Redis unreachable)
    |-- 2. Log warning: "Redis unavailable, using no-op cache"
    |-- 3. cache = redis.NewNoOpCache()  --> NoOpCache instance
    |-- 4. CachedOpenLineageRepository wraps inner repo + NoOpCache
    |
    v
[All requests flow through decorator, NoOpCache always returns ErrCacheMiss]
[Every request hits Teradata -- functionally identical to uncached behavior]
[No errors, no panics, no degraded responses -- just no caching benefit]
```

### Force-Refresh Path

```
HTTP Request: GET /api/v2/openlineage/lineage/{datasetId}/{fieldName}?refresh=true
    |
    v
[Handler extracts "refresh" query param, passes via context or parameter]
    |
    v
[CachedOpenLineageRepository.GetColumnLineageGraph]
    |
    |-- 1. Check for force-refresh signal
    |-- 2. Skip cache.Get (or Delete existing key first)
    |-- 3. inner.GetColumnLineageGraph --> Teradata query
    |-- 4. cache.Set --> Store fresh result
    |-- 5. Return fresh graph
```

**Implementation detail for force-refresh:** Use a context value rather than adding a parameter to the repository interface. This keeps the domain interface clean:

```go
// In the cached/ package:
type contextKey string
const forceRefreshKey contextKey = "cache_force_refresh"

func WithForceRefresh(ctx context.Context) context.Context {
    return context.WithValue(ctx, forceRefreshKey, true)
}

func isForceRefresh(ctx context.Context) bool {
    v, _ := ctx.Value(forceRefreshKey).(bool)
    return v
}
```

The HTTP handler sets this context value when `?refresh=true` is present. The cached repository checks it. The domain interface remains unchanged.

---

## Decorator Implementation Pattern

### Structure for CachedOpenLineageRepository

```go
// internal/adapter/outbound/cached/openlineage_repo.go
package cached

import (
    "context"
    "log/slog"

    "github.com/lineage-api/internal/domain"
)

// CachedOpenLineageRepository wraps an OpenLineageRepository with caching.
// It implements domain.OpenLineageRepository.
type CachedOpenLineageRepository struct {
    inner domain.OpenLineageRepository  // The real repository (Teradata)
    cache domain.CacheRepository        // The cache (Redis or NoOp)
    ttl   TTLConfig                     // TTL settings per data type
}

// TTLConfig holds TTL values (in seconds) for different data categories.
type TTLConfig struct {
    Namespace  int  // Namespaces rarely change (long TTL)
    Dataset    int  // Datasets change moderately
    Field      int  // Fields change with schema changes
    Lineage    int  // Lineage graph data (most expensive query, benefits most from cache)
    Statistics int  // Statistics change frequently (shorter TTL)
    DDL        int  // DDL changes with schema changes
    Search     int  // Search results (short TTL, user expectations of freshness)
}

// Compile-time interface check
var _ domain.OpenLineageRepository = (*CachedOpenLineageRepository)(nil)
```

### Method Implementation Pattern

Each method follows the same cache-aside pattern:

```go
func (r *CachedOpenLineageRepository) GetColumnLineageGraph(
    ctx context.Context,
    datasetID, fieldName, direction string,
    maxDepth int,
) (*domain.OpenLineageGraph, error) {
    // 1. Skip cache on force-refresh
    if !isForceRefresh(ctx) {
        // 2. Try cache
        key := LineageGraphKey(datasetID, fieldName, direction, maxDepth)
        var cached domain.OpenLineageGraph
        if err := r.cache.Get(ctx, key, &cached); err == nil {
            return &cached, nil
        }
        // Cache miss or error -- fall through to database
    }

    // 3. Query database
    graph, err := r.inner.GetColumnLineageGraph(ctx, datasetID, fieldName, direction, maxDepth)
    if err != nil {
        return nil, err
    }

    // 4. Populate cache (best-effort, do not fail on cache write error)
    key := LineageGraphKey(datasetID, fieldName, direction, maxDepth)
    if err := r.cache.Set(ctx, key, graph, r.ttl.Lineage); err != nil {
        slog.WarnContext(ctx, "failed to cache lineage graph",
            "key", key, "error", err)
    }

    return graph, nil
}
```

### Critical Design Decisions

**1. Cache errors are non-fatal.** A `cache.Get` failure triggers a database query. A `cache.Set` failure is logged but does not propagate to the caller. The user never sees a cache error.

**2. Nil results are NOT cached.** If the inner repository returns `nil` (entity not found), we do NOT cache that. Caching nil/not-found responses (negative caching) is a separate optimization that requires careful TTL management to avoid stale "not found" entries blocking real data.

**3. Only cache methods that benefit.** Not every repository method needs caching:

| Method | Cache? | Rationale |
|--------|--------|-----------|
| `GetColumnLineageGraph` | YES | Most expensive query (recursive CTE), highest latency |
| `GetColumnLineage` | YES | Same recursive CTE, different return format |
| `GetDataset` | YES | Frequently accessed, stable data |
| `ListDatasets` | YES | Paginated list, moderate query cost |
| `ListFields` | YES | Called for every dataset detail view |
| `ListNamespaces` | YES | Small result set, rarely changes |
| `GetNamespace` | YES | Stable data |
| `GetDatasetStatistics` | MAYBE | Queries DBC system views (slow), but data changes with DML |
| `GetDatasetDDL` | MAYBE | Queries DBC + SHOW TABLE (slow), but changes with DDL |
| `SearchDatasets` | NO | Search results should feel fresh; low query cost with LIKE |
| `GetJob`, `ListJobs` | YES | Stable reference data |
| `GetRun`, `ListRuns` | NO | Runs represent recent activity, freshness matters |

**4. Paginated methods need pagination parameters in cache key.** `ListDatasets(namespaceID, limit, offset)` must include all three in the cache key to avoid returning wrong pages.

---

## Cache Key Design

### Key Namespace Convention

```
ol:{entity}:{operation}:{params}
```

### Key Generation Functions

```go
// internal/adapter/outbound/cached/keys.go
package cached

import "fmt"

func NamespaceKey(namespaceID string) string {
    return fmt.Sprintf("ol:ns:%s", namespaceID)
}

func NamespaceListKey() string {
    return "ol:ns:list"
}

func DatasetKey(datasetID string) string {
    return fmt.Sprintf("ol:ds:%s", datasetID)
}

func DatasetListKey(namespaceID string, limit, offset int) string {
    return fmt.Sprintf("ol:ds:list:%s:%d:%d", namespaceID, limit, offset)
}

func FieldListKey(datasetID string) string {
    return fmt.Sprintf("ol:fields:%s", datasetID)
}

func LineageGraphKey(datasetID, fieldName, direction string, maxDepth int) string {
    return fmt.Sprintf("ol:lineage:graph:%s:%s:%s:%d", datasetID, fieldName, direction, maxDepth)
}

func LineageKey(datasetID, fieldName, direction string, maxDepth int) string {
    return fmt.Sprintf("ol:lineage:%s:%s:%s:%d", datasetID, fieldName, direction, maxDepth)
}

func StatisticsKey(datasetID string) string {
    return fmt.Sprintf("ol:stats:%s", datasetID)
}

func DDLKey(datasetID string) string {
    return fmt.Sprintf("ol:ddl:%s", datasetID)
}
```

### TTL Recommendations

| Data Category | TTL | Rationale |
|---------------|-----|-----------|
| Namespaces | 1 hour (3600s) | Infrastructure-level, almost never changes |
| Datasets (list) | 15 minutes (900s) | New tables can be added, moderate staleness acceptable |
| Dataset (single) | 30 minutes (1800s) | Metadata is relatively stable |
| Fields | 30 minutes (1800s) | Schema changes are infrequent |
| Lineage graph | 30 minutes (1800s) | Lineage mappings change only when ETL processes are re-analyzed |
| Statistics | 5 minutes (300s) | Row counts and sizes change with DML activity |
| DDL | 30 minutes (1800s) | DDL changes are infrequent |

---

## Dependency Wiring in main.go

### Updated Startup Flow

```go
// cmd/server/main.go

// 1. Initialize cache (Redis or NoOp fallback)
var cache domain.CacheRepository
redisCacheRepo, err := redis.NewCacheRepository(cfg.Redis)
if err != nil {
    log.Printf("Redis unavailable, running without cache: %v", err)
    cache = redis.NewNoOpCache()
} else {
    log.Printf("Redis connected at %s", cfg.Redis.Addr)
    cache = redisCacheRepo
    defer redisCacheRepo.Close()
}

// 2. Create base repositories (unchanged)
assetRepo := teradata.NewAssetRepository(db)
lineageRepo := teradata.NewLineageRepository(db, assetRepo)
searchRepo := teradata.NewSearchRepository(db)
olRepo := teradata.NewOpenLineageRepository(db)

// 3. Wrap with cache decorators
ttlConfig := cached.TTLConfig{
    Namespace: 3600, Dataset: 1800, Field: 1800,
    Lineage: 1800, Statistics: 300, DDL: 1800, Search: 0,
}
cachedOLRepo := cached.NewCachedOpenLineageRepository(olRepo, cache, ttlConfig)
// Similarly for other repos if desired

// 4. Create services (they receive the cached decorator, same interface)
olService := application.NewOpenLineageService(cachedOLRepo)
```

### Key Insight: No Service or Handler Changes

Because the cached repository implements the same `domain.OpenLineageRepository` interface, the service and handler layers require **zero changes**. The cache is invisible to everything above the adapter layer.

---

## Error Handling Strategy

### Principle: Cache Errors Are Never User-Visible

| Scenario | Behavior |
|----------|----------|
| Redis connection refused at startup | Log warning, use `NoOpCache`, application runs uncached |
| Redis goes down mid-operation (Get fails) | Treat as cache miss, query Teradata, log warning |
| Redis goes down mid-operation (Set fails) | Log warning, return Teradata result as normal |
| Redis returns corrupted data (unmarshal fails) | Treat as cache miss, query Teradata, log error |
| Teradata fails (regardless of cache) | Return error to caller (this is the real failure) |
| Cache hit with stale data | Return cached data (TTL handles staleness) |

### Sentinel Error Usage

The existing `redis.ErrCacheMiss` and the standard `redis.Nil` from the `go-redis` library serve as sentinel errors for cache misses. The decorator should handle both:

```go
if err := r.cache.Get(ctx, key, &result); err == nil {
    return &result, nil  // Cache hit
}
// Any error (ErrCacheMiss, redis.Nil, network error) = fall through to database
```

There is no need to distinguish cache miss from cache error in the decorator. Both result in a database query. The distinction only matters for logging/metrics.

---

## Testing Strategy

### Unit Testing the Decorator

Tests use the existing `MockCacheRepository` and `MockOpenLineageRepository`:

```go
func TestCachedRepo_CacheHit(t *testing.T) {
    mockCache := mocks.NewMockCacheRepository()
    mockRepo := mocks.NewMockOpenLineageRepository()

    // Pre-populate cache
    mockCache.Data["ol:ns:list"] = []byte(`[...]`)

    cachedRepo := cached.NewCachedOpenLineageRepository(mockRepo, mockCache, defaultTTL)

    result, err := cachedRepo.ListNamespaces(ctx)

    assert.NoError(t, err)
    // Verify mockRepo was NOT called (cache hit)
    // Verify mockCache.GetCalls contains the expected key
}

func TestCachedRepo_CacheMiss_PopulatesCache(t *testing.T) {
    mockCache := mocks.NewMockCacheRepository()
    mockRepo := mocks.NewMockOpenLineageRepository()
    mockRepo.Namespaces = []domain.OpenLineageNamespace{...}

    cachedRepo := cached.NewCachedOpenLineageRepository(mockRepo, mockCache, defaultTTL)

    result, err := cachedRepo.ListNamespaces(ctx)

    assert.NoError(t, err)
    assert.NotEmpty(t, result)
    // Verify mockCache.SetCalls contains the expected key (cache was populated)
}

func TestCachedRepo_CacheError_FallsThrough(t *testing.T) {
    mockCache := mocks.NewMockCacheRepository()
    mockCache.GetErr = errors.New("redis connection refused")
    mockRepo := mocks.NewMockOpenLineageRepository()
    mockRepo.Namespaces = []domain.OpenLineageNamespace{...}

    cachedRepo := cached.NewCachedOpenLineageRepository(mockRepo, mockCache, defaultTTL)

    result, err := cachedRepo.ListNamespaces(ctx)

    assert.NoError(t, err)  // Cache error is invisible to caller
    assert.NotEmpty(t, result)  // Data came from Teradata
}
```

### Note on MockCacheRepository Limitation

The current `MockCacheRepository.Get()` method (lines 417-436 in mocks) does not actually deserialize data into `dest`. It just returns nil if the key exists. For full decorator testing, the mock will need enhancement to store and return actual JSON-serialized data. This is a minor enhancement to the existing mock.

---

## Patterns to Follow

### Pattern 1: Cache-Aside with Composition

**What:** Decorator struct embeds the inner repository interface and a cache interface
**When:** Adding caching to any repository
**Why:** Transparent to consumers, testable, composable

### Pattern 2: Non-Fatal Cache Operations

**What:** All cache errors are logged, never returned
**When:** Any cache Get/Set operation
**Why:** Cache is an optimization, not a requirement

### Pattern 3: Context-Based Cache Control

**What:** Use `context.Value` for cache bypass signals
**When:** Force-refresh, admin operations
**Why:** Avoids changing domain interfaces for cross-cutting concerns

### Pattern 4: Typed Cache Keys with Dedicated Functions

**What:** Key generation in a separate file with strongly-typed functions
**When:** Any cache key construction
**Why:** Prevents typo-based key collisions, makes key format discoverable

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Caching in the Service Layer

**What:** Adding `if cache.Get(key); hit { return cached } ... cache.Set(key, result)` to every service method
**Why bad:** Violates single responsibility. Services become a mix of orchestration and caching logic. Every service method grows by 10-15 lines of boilerplate. Tests become complex (mock both repo AND cache).
**Instead:** Use repository decorator. Services stay thin.

### Anti-Pattern 2: HTTP Response Middleware Caching

**What:** Caching serialized JSON responses at the HTTP layer
**Why bad:** Loses type safety. Cannot selectively cache by endpoint without complex URL pattern matching. Cannot reuse cached data across different services. Cache invalidation requires URL knowledge.
**Instead:** Cache domain entities in the repository decorator.

### Anti-Pattern 3: Modifying Domain Interfaces for Cache

**What:** Adding `GetCached()`, `RefreshCache()`, or cache-specific parameters to repository interfaces
**Why bad:** Pollutes the domain layer with infrastructure concerns. Every repository implementation must handle cache parameters. Violates hexagonal architecture principles.
**Instead:** Use context values for cache hints. Decorator handles cache logic transparently.

### Anti-Pattern 4: Caching Nil/Not-Found Results

**What:** Storing "not found" in cache to prevent repeated empty queries
**Why bad:** If an entity is created after the negative cache entry, users see stale "not found" until TTL expires. For lineage data where new tables/columns can be added, this creates confusing user experiences.
**Instead:** Only cache positive results. Let "not found" always hit the database. Consider negative caching as a separate future optimization with very short TTLs if needed.

### Anti-Pattern 5: Single Global TTL

**What:** Using one TTL value for all cached data
**Why bad:** Namespaces (rarely change) and statistics (change frequently) have very different staleness tolerances. A TTL appropriate for statistics would cause excessive cache misses for namespaces, and vice versa.
**Instead:** Use `TTLConfig` with per-category TTL values.

---

## Scalability Considerations

| Concern | Current (No Cache) | With Redis Cache | At Scale |
|---------|-------------------|------------------|----------|
| Lineage query latency | 200-2000ms (recursive CTE) | <5ms cache hit | Cache hit ratio improves with repeated queries |
| Teradata connection load | Every request = DB query | Cache hits bypass DB | Significant DB load reduction |
| Redis memory usage | N/A | ~1-10MB for typical lineage dataset | Monitor with Redis INFO memory |
| Cache coherence | N/A | TTL-based expiration | Acceptable for read-heavy lineage data |
| Multi-instance consistency | N/A | Redis is shared across instances | Natural benefit of centralized cache |

---

## Build Order Recommendation

Based on dependency analysis and existing infrastructure:

### Step 1: Cache Key Module (Low Risk, No Dependencies)
- Create `internal/adapter/outbound/cached/keys.go`
- Create `internal/adapter/outbound/cached/keys_test.go`
- Pure functions, fully testable in isolation

### Step 2: TTL Configuration
- Add `TTLConfig` struct to the cached package
- Wire TTL defaults into `infrastructure/config/config.go`
- Add `CACHE_TTL_*` environment variables

### Step 3: CachedOpenLineageRepository (Highest Value)
- Start with `GetColumnLineageGraph` (most expensive query, biggest win)
- Add `GetDataset`, `ListDatasets`, `ListFields`, `ListNamespaces`
- Comprehensive tests using existing mocks

### Step 4: Wire into main.go
- Add Redis initialization with NoOpCache fallback
- Replace `olRepo` with `cachedOLRepo` in service construction
- Zero changes to services or handlers

### Step 5: CachedAssetRepository and CachedLineageRepository
- Apply same pattern to v1 API repositories
- Lower priority since v2 (OpenLineage) is the primary API

### Step 6: Force-Refresh Support
- Add context helper functions
- Add `?refresh=true` query parameter handling in handlers
- Decorator checks context for refresh signal

### Step 7: Observability
- Add cache hit/miss counters (structured logging initially, metrics later)
- Add `X-Cache: HIT` / `X-Cache: MISS` response header for debugging
- Monitor cache hit ratio in logs

---

## Component Boundaries Summary

| Component | Responsibility | Changes Needed |
|-----------|---------------|----------------|
| `domain/repository.go` | Define interfaces | NONE -- CacheRepository already exists |
| `domain/entities.go` | Define types | NONE -- entities already have json tags |
| `application/*_service.go` | Orchestration | NONE -- receives same interface |
| `adapter/inbound/http/*` | HTTP handling | MINOR -- add refresh param parsing |
| `adapter/outbound/redis/` | Redis client | NONE -- already implemented |
| `adapter/outbound/cached/` | Cache decorators | NEW -- this is the core work |
| `adapter/outbound/teradata/` | SQL execution | NONE -- unchanged |
| `cmd/server/main.go` | Wiring | MINOR -- add cache init + decorator wiring |
| `infrastructure/config/` | Configuration | MINOR -- add TTL config |
| `domain/mocks/` | Test mocks | MINOR -- enhance MockCacheRepository |

---

## Sources

- Existing codebase: `internal/domain/repository.go` -- CacheRepository interface (HIGH confidence)
- Existing codebase: `internal/adapter/outbound/redis/cache.go` -- Redis + NoOpCache implementation (HIGH confidence)
- Existing codebase: `internal/domain/mocks/repositories.go` -- MockCacheRepository (HIGH confidence)
- Existing codebase: `cmd/server/main.go` -- Current dependency wiring (HIGH confidence)
- Existing codebase: `internal/application/openlineage_service.go` -- Service layer pattern (HIGH confidence)
- [Cache-Aside using Decorator Design Pattern in Go](http://stdout.alesr.me/posts/cache-aside-using-decorator-design-pattern-in-go/) -- Decorator pattern reference (MEDIUM confidence)
- [Repository Pattern in Golang: Redis and External API as providers](https://jorzel.github.io/repository-pattern-in-golang-redis-and-external-api-as-providers/) -- Redis repository composition (MEDIUM confidence)
- [Go Project Structure: Clean Architecture Patterns](https://dasroot.net/posts/2026/01/go-project-structure-clean-architecture/) -- 2026 Go architecture patterns (MEDIUM confidence)
- [Hexagonal Architecture in Go](https://skoredin.pro/blog/golang/hexagonal-architecture-go) -- Adapter layer organization (MEDIUM confidence)
- [Redis Go Client Error Handling](https://redis.io/docs/latest/develop/clients/go/error-handling/) -- go-redis error handling (HIGH confidence)
- Existing `go.mod`: go-redis/v9 v9.4.0 confirmed as dependency (HIGH confidence)

---

*Architecture research for: Redis Caching Integration (v6.0 milestone)*
*Researched: 2026-02-12*
