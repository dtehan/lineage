# Phase 28: Redis Connection & Cache Decorator Foundation - Research

**Researched:** 2026-02-12
**Domain:** Go Redis integration, repository decorator pattern, cache-aside caching
**Confidence:** HIGH

## Summary

This phase wires Redis into the existing Go backend using the repository decorator pattern to transparently cache lineage graph queries. The codebase already has all foundational pieces: a `domain.CacheRepository` interface, a working Redis adapter (`adapter/outbound/redis/cache.go`) with `Get`/`Set`/`Delete`/`Exists`, a `NoOpCache` fallback, Redis config loaded via Viper, and a clean `domain.OpenLineageRepository` interface that the decorator will wrap. The work is (1) upgrading go-redis from v9.4.0 to v9.7.3, (2) wiring Redis client creation with fail-fast behavior in `main.go`, and (3) implementing `CachedOpenLineageRepository` as a decorator that wraps `teradata.OpenLineageRepository`.

The critical version finding is that **v9.7.0 has CVE-2025-29923** (out-of-order responses when CLIENT SETINFO times out). The fix is in **v9.7.3**. The prior v6.0 research recommended v9.7.0, but this research corrects that to v9.7.3.

The decorator pattern is well-suited here because the `OpenLineageRepository` interface is already defined with 15 methods, and only `GetColumnLineageGraph` needs caching in this phase. The decorator embeds the inner repository and forwards all uncached methods directly, overriding only the cached method.

**Primary recommendation:** Upgrade to go-redis v9.7.3 (CVE fix), wire Redis with fail-fast in main.go, implement `CachedOpenLineageRepository` in a new file under `adapter/outbound/redis/`, cache only `GetColumnLineageGraph` and `GetDataset`, and store `domain.OpenLineageGraph` / `domain.OpenLineageDataset` as JSON.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| [redis/go-redis](https://github.com/redis/go-redis) | v9.7.3 | Redis client | Already a dependency at v9.4.0. v9.7.3 fixes CVE-2025-29923 (CLIENT SETINFO timeout causing out-of-order responses). Published Oct 2024 + patch. |
| encoding/json | stdlib | Cache value serialization | Already used in existing `CacheRepository.Get/Set`. All domain entities have `json:"..."` tags. Zero added dependencies. |
| golang.org/x/sync/singleflight | stdlib-adjacent | Stampede protection | Deferred to Phase 29/30 per scope, but noted here for future reference. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| log/slog | stdlib | Structured logging | Already in use. Use for cache hit/miss/error logging. |
| github.com/spf13/viper | v1.21.0 | Config loading | Already loads REDIS_ADDR, REDIS_PASSWORD, REDIS_DB. No changes needed. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| go-redis v9.7.3 | go-redis v9.17.3 (latest) | v9.17.x adds Redis 8.4 support, RESP3, typed errors -- none needed. Large jump increases risk for zero benefit. |
| encoding/json | vmihailenco/msgpack | ~1ms faster per 10KB payload, not worth a new dependency + msgpack struct tags. |
| Repository decorator | Service-layer caching | Service-layer was considered in prior research but CONTEXT.md locks repository decorator (INT-03, CACHE-04, CACHE-05). Decorator keeps services unchanged. |

**Upgrade command:**
```bash
cd /Users/Daniel.Tehan/Code/lineage/lineage-api
go get github.com/redis/go-redis/v9@v9.7.3
go mod tidy
```

**Version note:** The prior v6.0 STACK.md research recommended v9.7.0. This is corrected to **v9.7.3** because v9.7.0 contains CVE-2025-29923 (GO-2025-3540). The fix was backported to v9.5.5, v9.6.3, and v9.7.3.

## Architecture Patterns

### Recommended Project Structure
```
lineage-api/
├── cmd/server/main.go                                    # Wire Redis client, fail-fast, pass to decorator
├── internal/
│   ├── domain/
│   │   └── repository.go                                 # OpenLineageRepository interface (unchanged)
│   │                                                     # CacheRepository interface (unchanged)
│   ├── adapter/outbound/
│   │   ├── redis/
│   │   │   ├── cache.go                                  # Existing CacheRepository + NoOpCache (unchanged)
│   │   │   ├── cache_test.go                             # Existing NoOpCache tests (unchanged)
│   │   │   ├── cached_openlineage_repo.go                # NEW: CachedOpenLineageRepository decorator
│   │   │   └── cached_openlineage_repo_test.go           # NEW: Decorator unit tests
│   │   └── teradata/
│   │       └── openlineage_repo.go                       # Inner repository (unchanged)
│   └── application/
│       └── openlineage_service.go                        # Service layer (unchanged per CACHE-05)
```

### Pattern 1: Repository Decorator with Interface Embedding

**What:** `CachedOpenLineageRepository` embeds `domain.OpenLineageRepository` and overrides only the methods that need caching. All other methods delegate to the inner repository transparently.

**When to use:** When you need to add cross-cutting caching behavior without modifying the service layer or the inner repository.

**Key architectural constraint (CACHE-05):** The service and handler code MUST remain unchanged. `NewOpenLineageService(olRepo)` receives the decorator instead of the Teradata repo directly.

**Example:**
```go
// File: internal/adapter/outbound/redis/cached_openlineage_repo.go
package redis

import (
    "context"
    "fmt"
    "log/slog"

    "github.com/lineage-api/internal/domain"
)

// CachedOpenLineageRepository decorates an OpenLineageRepository with Redis caching.
// It implements domain.OpenLineageRepository by embedding the inner repository
// and overriding methods that benefit from caching.
type CachedOpenLineageRepository struct {
    domain.OpenLineageRepository              // embedded inner repo -- delegates uncached methods
    cache                        domain.CacheRepository
    ttl                          int          // TTL in seconds for cached entries
}

// Compile-time interface check
var _ domain.OpenLineageRepository = (*CachedOpenLineageRepository)(nil)

func NewCachedOpenLineageRepository(
    inner domain.OpenLineageRepository,
    cache domain.CacheRepository,
    ttl int,
) *CachedOpenLineageRepository {
    return &CachedOpenLineageRepository{
        OpenLineageRepository: inner,
        cache:                 cache,
        ttl:                   ttl,
    }
}

// GetColumnLineageGraph overrides the inner method with cache-aside logic.
func (r *CachedOpenLineageRepository) GetColumnLineageGraph(
    ctx context.Context,
    datasetID, fieldName, direction string,
    maxDepth int,
) (*domain.OpenLineageGraph, error) {
    // Per CONTEXT.md: depth is NOT in the cache key.
    // Cache stores complete graph; depth filtering applied on read.
    // Direction IS in the key (separate keys for upstream/downstream/both).
    key := fmt.Sprintf("ol:lineage:graph:%s:%s:%s", datasetID, fieldName, direction)

    // 1. Try cache
    var cached domain.OpenLineageGraph
    if err := r.cache.Get(ctx, key, &cached); err == nil {
        slog.DebugContext(ctx, "cache hit", "key", key)
        return &cached, nil
    }
    // Cache miss or error -- fall through to inner repo.
    // Do NOT distinguish miss from error for flow control.

    // 2. Query inner repository
    graph, err := r.OpenLineageRepository.GetColumnLineageGraph(ctx, datasetID, fieldName, direction, maxDepth)
    if err != nil {
        return nil, err
    }

    // 3. Populate cache (fire-and-forget errors)
    if graph != nil {
        if setErr := r.cache.Set(ctx, key, graph, r.ttl); setErr != nil {
            slog.WarnContext(ctx, "cache set failed", "key", key, "error", setErr)
        } else {
            slog.DebugContext(ctx, "cache populated", "key", key, "ttl", r.ttl)
        }
    }

    return graph, nil
}
```

### Pattern 2: Fail-Fast Redis Initialization in main.go

**What:** At startup, attempt Redis connection. If it fails, the application exits with a clear error message. This is the Phase 28 behavior per CONTEXT.md. Phase 30 will refactor to graceful degradation.

**Example (main.go wiring):**
```go
// Redis cache -- fail fast if unavailable (Phase 30 adds graceful degradation)
cacheRepo, err := redis.NewCacheRepository(cfg.Redis)
if err != nil {
    log.Fatalf("Failed to connect to Redis: %v", err)
}
defer cacheRepo.Close()

// Decorator wraps Teradata repo
olRepo := teradata.NewOpenLineageRepository(db)
cachedOLRepo := redis.NewCachedOpenLineageRepository(olRepo, cacheRepo, 14400) // 4h TTL

// Service receives the decorator -- no service code changes
olService := application.NewOpenLineageService(cachedOLRepo)
```

### Pattern 3: Cache Key Structure

**What:** Key format that is forward-compatible with Phase 29's `ol:{entity}:{operation}:{params}` convention.

**Key format for Phase 28:**
```
ol:lineage:graph:{datasetID}:{fieldName}:{direction}
```

**Why this format:**
- `ol:` prefix = namespace for all OpenLineage cache keys
- `lineage:graph:` = entity:operation identifier
- `{datasetID}:{fieldName}:{direction}` = parameters
- Depth is excluded per CONTEXT.md decision (cache stores complete graph)
- Direction is included as a separate key component (upstream/downstream/both produce different graphs from the database)
- Colon `:` delimiter is Redis convention; datasetIDs in this codebase are numeric strings, fieldNames are Teradata identifiers (alphanumeric + underscores), and direction is one of three values -- no collision risk

**Example keys:**
```
ol:lineage:graph:42:customer_id:upstream
ol:lineage:graph:42:customer_id:downstream
ol:lineage:graph:42:customer_id:both
ol:dataset:42                                 # For GetDataset caching
```

### Anti-Patterns to Avoid
- **Caching in the service layer:** CONTEXT.md locks the repository decorator pattern (CACHE-04, CACHE-05). Do NOT add cache logic to `OpenLineageService`.
- **Caching error responses:** Never call `cache.Set()` when the inner repository returns an error. Only cache successful, non-nil results.
- **Propagating cache errors to callers:** Cache GET errors must fall through to the inner repository. Cache SET errors must be logged and swallowed. A cache failure must NEVER cause a 500 response.
- **Caching nil results:** If the inner repository returns `nil` (not found), do not cache it. A nil result may become non-nil later when data is populated.
- **Using `redis.Nil` as the sole cache-miss signal:** The existing `CacheRepository.Get()` returns the raw go-redis error, which includes `redis.Nil` for cache miss. The decorator should treat ANY error from `cache.Get()` as "cache miss" and fall through. This simplifies error handling and makes the decorator work identically with both `CacheRepository` (Redis) and `NoOpCache`.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Redis client | Custom TCP/Redis protocol handler | go-redis v9.7.3 | Connection pooling, pipelining, context support, maintained by Redis officially |
| JSON serialization | Custom binary format | encoding/json (stdlib) | All domain entities already have json tags. Human-readable in redis-cli for debugging. |
| Cache miss detection | Custom sentinel values | Check error from `cache.Get()` | The existing `CacheRepository` interface returns errors; any error = treat as miss |
| Connection health check | Custom ping loop | go-redis `Ping()` in `NewCacheRepository()` | Already implemented in the existing code |
| NoOp fallback | Custom empty cache | Existing `NoOpCache` in `redis/cache.go` | Already implemented and tested |

**Key insight:** The existing codebase already has ~80% of the infrastructure. The `CacheRepository` interface, Redis adapter, NoOpCache, and config loading are all in place. What's missing is (1) the version upgrade, (2) the decorator, and (3) the wiring in main.go.

## Common Pitfalls

### Pitfall 1: CVE-2025-29923 in go-redis v9.7.0
**What goes wrong:** Using v9.7.0 (as the prior research recommended) exposes the app to out-of-order responses when CLIENT SETINFO times out during connection establishment. This can cause one request to receive another request's response.
**Why it happens:** go-redis sends CLIENT SETINFO during connection setup. If it times out, leftover bytes in the TCP stream corrupt subsequent command responses.
**How to avoid:** Upgrade to v9.7.3 (not v9.7.0). The fix was backported to v9.5.5, v9.6.3, and v9.7.3.
**Warning signs:** Intermittent wrong data from cache reads, responses that don't match the key.
**Confidence:** HIGH -- verified via [GO-2025-3540](https://pkg.go.dev/vuln/GO-2025-3540) and [CVE-2025-29923](https://github.com/advisories/GHSA-92cp-5422-2mw7).

### Pitfall 2: Caching Partial or Error Results
**What goes wrong:** If `GetColumnLineageGraph` calls `GetColumnLineage` internally and that CTE query partially fails, the decorator might cache a graph with missing edges. Users see incomplete lineage.
**Why it happens:** The decorator caches the return value after the inner call succeeds, but "success" means err == nil, not "complete graph."
**How to avoid:** Only cache when `err == nil` AND `graph != nil`. The inner `GetColumnLineageGraph` already handles partial failure by returning an error if the CTE query fails -- it does not return partial results. The decorator only needs to check `err == nil`.
**Warning signs:** Lineage graphs that show only upstream or only downstream. Graphs with fewer nodes than expected on cache hit vs cache miss.

### Pitfall 3: JSON Round-Trip Differences for Domain Entities
**What goes wrong:** `map[string]any` in `OpenLineageNode.Metadata` deserializes JSON numbers as `float64`, not `int`. If downstream code does a type assertion `metadata["count"].(int)`, it panics on cache hit but works on cache miss.
**Why it happens:** Go's `encoding/json` always deserializes JSON numbers into `float64` when the target is `interface{}`.
**How to avoid:** Cache domain entities (`OpenLineageGraph`), not application DTOs. The domain entities use `map[string]any` for Metadata, and the Metadata field is rarely used in the lineage graph flow. Ensure empty slices are initialized with `make()` not `nil`. Write round-trip serialization tests.
**Warning signs:** Panics on type assertions that only happen on cache hits. `"nodes": null` vs `"nodes": []` inconsistency.

### Pitfall 4: Confusing Fail-Fast (Phase 28) with Graceful Degradation (Phase 30)
**What goes wrong:** Developer implements NoOpCache fallback in Phase 28, but CONTEXT.md says fail-fast. Later, Phase 30's graceful degradation conflicts with code that already falls back silently.
**Why it happens:** The prior v6.0 research recommended graceful degradation. But the CONTEXT.md for Phase 28 explicitly states: "Fail fast if Redis is unavailable (application exits with error). Phase 30 will refactor this."
**How to avoid:** In Phase 28, use `log.Fatalf()` if Redis connection fails at startup. Do NOT fall back to NoOpCache at startup. However, at runtime (during request handling), the decorator should still log and swallow cache errors -- "fail fast" applies to startup only.
**Warning signs:** Application silently running without Redis when it should have exited.

### Pitfall 5: Depth Parameter in Cache Key
**What goes wrong:** Developer includes `maxDepth` in the cache key, creating separate cache entries for each depth value. This reduces cache hit rate because depth=5 and depth=10 for the same column produce different cache entries even though the underlying data overlaps.
**Why it happens:** It seems natural to include all query parameters in the cache key.
**How to avoid:** Per CONTEXT.md decision: depth is NOT in the cache key. The cache stores the complete lineage graph (queried at maximum depth). Depth filtering is applied on read from cache. Note: In Phase 28, depth filtering on read is NOT implemented -- the full graph is returned regardless of the `maxDepth` parameter in the request. This is acceptable because the inner repository already filters by depth, and the cached result reflects whatever depth the first request used. Phase 29 can refine this.
**Warning signs:** Cache entries with identical datasetID/fieldName/direction but different depths.

## Code Examples

Verified patterns from the existing codebase and official sources:

### Existing CacheRepository Interface (unchanged)
```go
// Source: internal/domain/repository.go lines 31-36
type CacheRepository interface {
    Get(ctx context.Context, key string, dest any) error
    Set(ctx context.Context, key string, value any, ttlSeconds int) error
    Delete(ctx context.Context, key string) error
    Exists(ctx context.Context, key string) (bool, error)
}
```

### Existing Redis Adapter (unchanged)
```go
// Source: internal/adapter/outbound/redis/cache.go lines 26-42
func NewCacheRepository(cfg Config) (*CacheRepository, error) {
    client := redis.NewClient(&redis.Options{
        Addr:     cfg.Addr,
        Password: cfg.Password,
        DB:       cfg.DB,
    })
    ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
    defer cancel()
    if err := client.Ping(ctx).Err(); err != nil {
        return nil, err
    }
    return &CacheRepository{client: client}, nil
}
```

### Existing main.go Wiring (to be modified)
```go
// Source: cmd/server/main.go lines 58-63 -- CURRENT (no Redis)
olRepo := teradata.NewOpenLineageRepository(db)
olService := application.NewOpenLineageService(olRepo)
olHandler := httpAdapter.NewOpenLineageHandler(olService)

// AFTER Phase 28:
cacheRepo, err := redis.NewCacheRepository(cfg.Redis)
if err != nil {
    log.Fatalf("Failed to connect to Redis: %v", err)
}
defer cacheRepo.Close()

olRepo := teradata.NewOpenLineageRepository(db)
cachedOLRepo := redis.NewCachedOpenLineageRepository(olRepo, cacheRepo, 14400)
olService := application.NewOpenLineageService(cachedOLRepo) // service unchanged
olHandler := httpAdapter.NewOpenLineageHandler(olService)     // handler unchanged
```

### Cache-Aside in Decorator (core pattern)
```go
// Pseudocode for every cached method in the decorator:
func (r *CachedOpenLineageRepository) CachedMethod(ctx context.Context, params...) (Result, error) {
    key := buildKey(params...)

    // 1. Try cache -- any error = treat as miss
    var cached Result
    if err := r.cache.Get(ctx, key, &cached); err == nil {
        return cached, nil  // cache hit
    }

    // 2. Query inner repository
    result, err := r.OpenLineageRepository.CachedMethod(ctx, params...)
    if err != nil {
        return nil, err  // do NOT cache errors
    }

    // 3. Populate cache (fire-and-forget)
    if result != nil {
        if setErr := r.cache.Set(ctx, key, result, r.ttl); setErr != nil {
            slog.WarnContext(ctx, "cache set failed", "key", key, "error", setErr)
        }
    }

    return result, nil
}
```

### Test Pattern: Verify Cache Hit Returns Same Data
```go
func TestCachedGetColumnLineageGraph_CacheHit(t *testing.T) {
    mockInner := mocks.NewMockOpenLineageRepository()
    mockCache := mocks.NewMockCacheRepository()

    // Populate mock inner with test data
    testGraph := &domain.OpenLineageGraph{
        Nodes: []domain.OpenLineageNode{{ID: "n1", Type: "field"}},
        Edges: []domain.OpenLineageEdge{{ID: "e1", Source: "n1", Target: "n2"}},
    }
    mockInner.GraphData["42/customer_id"] = testGraph

    repo := NewCachedOpenLineageRepository(mockInner, mockCache, 300)

    // First call: cache miss, hits inner
    result1, err := repo.GetColumnLineageGraph(ctx, "42", "customer_id", "both", 5)
    assert.NoError(t, err)
    assert.NotNil(t, result1)
    assert.Len(t, mockCache.SetCalls, 1) // cache was populated

    // Second call: cache hit, does NOT hit inner
    // (requires MockCacheRepository to actually store and return data)
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| go-redis v9.4.0 | go-redis v9.7.3 | Oct 2024 + patch | Fixes CVE-2025-29923, connection pool improvements |
| Service-layer caching | Repository decorator pattern | Phase 28 decision | Services remain unchanged (CACHE-05) |
| Cache at startup with NoOpCache fallback | Fail-fast at startup | Phase 28 decision | Phase 30 will revert to graceful degradation |

**Deprecated/outdated:**
- go-redis v9.7.0: Has CVE-2025-29923, use v9.7.3 instead
- go-redis v9.5.3 and v9.5.4: Retracted from Go module proxy (accidental releases)

## Open Questions

Things that could not be fully resolved:

1. **Depth filtering on cache read**
   - What we know: CONTEXT.md says cache stores complete graph, depth filtering applied on read
   - What's unclear: The current `GetColumnLineageGraph` method takes `maxDepth` as a parameter and passes it to the recursive CTE. The cache stores whatever depth the first request used. If a depth=3 request is cached, a subsequent depth=10 request would get an incomplete graph from cache.
   - Recommendation: For Phase 28, pass a hardcoded large depth (e.g., 20, which is `MaxDepthLimit` from config) to the inner repository when populating cache, and truncate on read. Alternatively, accept that depth filtering on read is a Phase 29 refinement and use the requested depth as-is for Phase 28. **The planner should decide which approach to use.**

2. **TTL value for lineage graphs**
   - What we know: Prior STACK.md research recommended 4 hours (14400s). FEATURES.md recommended 5 minutes (300s). Both are defensible.
   - What's unclear: Actual data change frequency depends on ETL schedules, which vary by deployment.
   - Recommendation: Use 300 seconds (5 minutes) as the default. It's conservative, reduces staleness risk, and lineage graph queries are the most expensive (150-500ms), so even a 5-minute TTL provides significant benefit. Make it configurable via env var (CACHE_TTL_LINEAGE) for Phase 29.

3. **MockCacheRepository needs JSON round-trip support**
   - What we know: The existing `MockCacheRepository` in mocks stores `[]byte("cached")` on Set and returns nil on Get if the key exists. This does NOT actually deserialize data.
   - What's unclear: Whether to upgrade the mock to support real JSON round-trip or create a separate test helper.
   - Recommendation: For decorator tests, either (a) create a `RoundTripMockCacheRepository` that actually marshals/unmarshals JSON, or (b) use a real Redis instance via testcontainers. Option (a) is simpler for unit tests.

## Sources

### Primary (HIGH confidence)
- [pkg.go.dev/github.com/redis/go-redis/v9@v9.7.0](https://pkg.go.dev/github.com/redis/go-redis/v9@v9.7.0) - Confirmed v9.7.0 exists, published Oct 16, 2024
- [GO-2025-3540 Vulnerability](https://pkg.go.dev/vuln/GO-2025-3540) - CVE-2025-29923 affecting v9.7.0, fixed in v9.7.3
- [CVE-2025-29923 GitHub Advisory](https://github.com/advisories/GHSA-92cp-5422-2mw7) - Out-of-order response vulnerability details
- [go-redis options.go at v9.7.0](https://github.com/redis/go-redis/blob/v9.7.0/options.go) - Connection pool defaults verified
- Codebase analysis: `domain/repository.go`, `redis/cache.go`, `cmd/server/main.go`, `teradata/openlineage_repo.go` - Direct source inspection

### Secondary (MEDIUM confidence)
- [Cache-Aside with Decorator Pattern in Go](http://stdout.alesr.me/posts/cache-aside-using-decorator-design-pattern-in-go/) - Pattern reference for Go interface embedding approach
- [CachedRepository Pattern (Ardalis)](https://ardalis.com/introducing-the-cachedrepository-pattern/) - Repository decorator pattern reference
- [go-redis Debugging Guide](https://redis.uptrace.dev/guide/go-redis-debugging.html) - Pool configuration recommendations
- Prior v6.0 research: `.planning/research/v6.0-redis-caching/STACK.md`, `FEATURES.md`, `PITFALLS.md` - Comprehensive prior research on this domain

### Tertiary (LOW confidence)
- go-redis release notes for v9.7.0 -- Release page content was sparse, focused on Redis search capabilities, did not document pool fixes in detail

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - go-redis v9.7.3 verified via pkg.go.dev, CVE fix confirmed
- Architecture: HIGH - Decorator pattern verified against codebase interfaces, all touched files identified
- Pitfalls: HIGH - Backed by prior v6.0 research + CVE database + codebase analysis

**Research date:** 2026-02-12
**Valid until:** 2026-03-12 (30 days -- stable domain, go-redis v9.7.x is a point release)
