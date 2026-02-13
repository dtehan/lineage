# Technology Stack: Redis Response Caching

**Project:** Teradata Column-Level Data Lineage Application (v6.0 milestone)
**Researched:** 2026-02-12
**Confidence:** HIGH (verified via GitHub releases, official Redis docs, and codebase analysis)

## Executive Summary

The project already has go-redis v9.4.0 as a dependency with a working `CacheRepository` adapter, `NoOpCache` fallback, and a `domain.CacheRepository` interface. The caching infrastructure is structurally ready -- what's missing is (1) upgrading go-redis to a current stable release, (2) adding connection pool hardening, (3) integrating caching into the service layer using the cache-aside pattern, and (4) implementing cache key strategy and TTL configuration.

**Key finding:** No new libraries are needed. The existing go-redis/v9 dependency and `encoding/json` serialization are sufficient. The `go-redis/cache` wrapper library (which adds TinyLFU and MessagePack) is unnecessary complexity for this use case. The existing `CacheRepository` interface and `NoOpCache` already provide the graceful degradation pattern -- the work is wiring caching into the service layer and adding production-ready connection configuration.

## Recommended Stack

### Core Redis Client

| Technology | Current | Target | Purpose | Why |
|------------|---------|--------|---------|-----|
| [redis/go-redis](https://github.com/redis/go-redis) | v9.4.0 | v9.7.0 | Redis client | Already a dependency. v9.7.0 (latest stable in the v9.7.x line, March 2025) includes critical connection pool fixes (zombie element cleanup, CVE-2025-29923 network error handling fix). Upgrading beyond v9.7.x to v9.17.x is a larger jump that pulls in RESP3/typed errors/Redis 8.4 support -- unnecessary for simple caching. |

**Confidence:** HIGH -- verified via [GitHub releases page](https://github.com/redis/go-redis/releases).

**Upgrade rationale:** v9.4.0 (current) predates critical fixes:
- v9.5.0+: Connection pool turn management fix preventing leaks under load
- v9.7.0: SETINFO CVE fix (CVE-2025-29923), improved context timeout handling
- These are stability fixes, not breaking API changes

**Why not v9.17.x:** The v9.17.x line adds Redis 8.4 support, RESP3 push notifications, typed errors, and CAS/CAD commands. None of these are needed for response caching. Staying on v9.7.x minimizes upgrade risk while capturing the critical pool fixes. The jump from v9.4.0 to v9.7.0 is a small, safe step.

### Serialization

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| encoding/json | stdlib | Cache value serialization | Already used in the existing `CacheRepository.Get/Set` methods. All domain entities and DTOs already have `json:"..."` struct tags. Zero additional dependencies. |

**Why NOT MessagePack:**
- MessagePack is 2-3x faster and 50% smaller than JSON in benchmarks
- BUT: For this project, cached values are lineage graphs and asset listings -- typically 5-50KB payloads
- At this size, JSON serialization adds ~0.5-2ms overhead vs MessagePack's ~0.2-0.8ms
- The serialization cost is dwarfed by the 150-500ms Teradata query it replaces
- Adding `vmihailenco/msgpack/v5` means a new dependency, adding `msgpack:"..."` tags to all entities, and dual-serialization concerns
- The ROI is negative: more complexity for negligible performance gain

**Why NOT Protocol Buffers:**
- Proto requires `.proto` schema files, code generation step, and a build pipeline change
- Dramatically overengineered for caching internal API responses
- Only justified when cache payloads are large (>1MB) or when cross-language cache sharing is needed

**Confidence:** HIGH -- this is a straightforward engineering judgment based on payload sizes and query latencies.

### Connection Pool Configuration

| Setting | Value | Rationale |
|---------|-------|-----------|
| PoolSize | `10 * runtime.GOMAXPROCS(0)` (default) | go-redis default is 10 connections per CPU. For a single-server API caching use case, this is more than adequate. Do not override. |
| MinIdleConns | 2 | Keep 2 warm connections to avoid cold-start latency on first cache hit after idle period. |
| DialTimeout | 5 * time.Second | Generous timeout for initial connection. Cloud Redis instances can have variable latency. |
| ReadTimeout | 3 * time.Second | Redis cache reads should be fast. 3s catches network issues without being too aggressive. |
| WriteTimeout | 3 * time.Second | Same rationale as ReadTimeout. Cache writes are non-critical. |
| PoolTimeout | 4 * time.Second | Slightly longer than Read/WriteTimeout to allow pool contention to resolve before failing. |
| MaxRetries | 1 | Retry once on transient failure, but don't block the request chain. Cache is optional. |
| ConnMaxIdleTime | 5 * time.Minute | Close idle connections after 5 minutes to prevent stale TCP state. Default is 30 min which is too long for optional caching. |

**Confidence:** HIGH -- based on [official go-redis debugging guide](https://redis.uptrace.dev/guide/go-redis-debugging.html) and [Redis official connection pools documentation](https://redis.io/docs/latest/develop/clients/pools-and-muxing/).

**Critical warning from official docs:** "Do NOT disable DialTimeout, ReadTimeout, and WriteTimeout, because go-redis executes some background checks without using a context and instead relies on connection timeouts."

### Health Check / Graceful Degradation

| Component | Already Exists | Needs Work |
|-----------|---------------|------------|
| `NoOpCache` | YES -- `redis/cache.go` line 82-110 | No changes needed |
| `CacheRepository` interface | YES -- `domain/repository.go` line 31-36 | No changes needed |
| Ping-based health check | YES -- `NewCacheRepository()` pings on init | Need to add periodic health check or lazy reconnect |
| Startup fallback | PARTIAL -- main.go doesn't create cache at all | Wire into main.go with NoOpCache fallback |

**Pattern: Lazy initialization with fallback.**

The existing code already defines the pattern correctly:
1. `NewCacheRepository(cfg)` attempts connection with a 5-second timeout
2. On failure, fall back to `NewNoOpCache()` which silently swallows all cache operations
3. Application continues operating without cache -- all queries go directly to Teradata

What's missing is the wiring in `main.go` (currently Redis is configured but never instantiated) and periodic reconnection attempts when Redis comes back online.

### TTL Configuration

| Data Type | Recommended TTL | Rationale |
|-----------|----------------|-----------|
| Lineage graphs | 4 hours (14400s) | Lineage metadata changes infrequently (ETL schedules, schema changes). 4 hours balances freshness with cache hit rate. |
| Asset listings (databases, tables) | 2 hours (7200s) | Schema metadata is relatively stable but DDL changes should be reflected within a few hours. |
| Dataset fields (columns) | 2 hours (7200s) | Same reasoning as asset listings. Column metadata changes with schema changes. |
| Search results | 30 minutes (1800s) | Search patterns change more frequently as users explore. Shorter TTL prevents stale search results. |
| Dataset statistics | 1 hour (3600s) | Row counts and sizes change with ETL runs, moderate freshness needed. |
| Dataset DDL | 4 hours (14400s) | DDL rarely changes. Long TTL is safe. |

**Configuration approach:** Define TTLs as environment variables with sensible defaults:

```
CACHE_TTL_LINEAGE=14400
CACHE_TTL_ASSETS=7200
CACHE_TTL_SEARCH=1800
CACHE_TTL_STATISTICS=3600
CACHE_TTL_DDL=14400
CACHE_ENABLED=true
```

**Confidence:** MEDIUM -- TTL values are opinionated recommendations based on typical data lineage tool usage patterns. They should be tunable and validated against actual usage metrics.

## Cache Key Strategy

### Key Format

Use hierarchical, deterministic key format: `lineage:v2:{resource_type}:{composite_params}`

| Endpoint | Cache Key Pattern | Example |
|----------|------------------|---------|
| GET /api/v2/openlineage/lineage/{datasetId}/{fieldName} | `lineage:v2:graph:{datasetId}:{fieldName}:{direction}:{maxDepth}` | `lineage:v2:graph:42:customer_id:both:5` |
| GET /api/v2/openlineage/namespaces | `lineage:v2:namespaces` | `lineage:v2:namespaces` |
| GET /api/v2/openlineage/namespaces/{id}/datasets | `lineage:v2:datasets:{namespaceId}:{limit}:{offset}` | `lineage:v2:datasets:1:20:0` |
| GET /api/v2/openlineage/datasets/{id} | `lineage:v2:dataset:{datasetId}` | `lineage:v2:dataset:42` |
| GET /api/v2/openlineage/datasets/search | `lineage:v2:search:{query}:{limit}` | `lineage:v2:search:customer:20` |
| GET /api/v2/openlineage/datasets/{id}/statistics | `lineage:v2:stats:{datasetId}` | `lineage:v2:stats:42` |
| GET /api/v2/openlineage/datasets/{id}/ddl | `lineage:v2:ddl:{datasetId}` | `lineage:v2:ddl:42` |

**Key prefix `lineage:v2:`** provides namespace isolation and versioning. If the API response shape changes, bump to `v3:` to avoid deserializing stale formats.

### Cache Invalidation

**Primary strategy: TTL-based expiry.** For a read-heavy lineage application where metadata changes through scheduled ETL runs (not user writes), TTL-based invalidation is sufficient.

**Pattern-based invalidation for force-refresh:** Use SCAN-based deletion for specific prefixes:
- `lineage:v2:graph:{datasetId}:*` -- Invalidate all lineage variants for a dataset
- `lineage:v2:datasets:*` -- Invalidate all dataset listings
- `lineage:v2:*` -- Nuclear option: flush all cached data

**Do NOT use Redis KEYS command for pattern matching** -- it blocks the server. Always use SCAN with cursor-based iteration.

## Architecture Integration

### Where Caching Lives in Hexagonal Architecture

```
                    HTTP Handler (adapter/inbound)
                           |
                    Service Layer (application)  <-- Cache logic lives HERE
                      /         \
              CacheRepository   Teradata Repository
              (adapter/outbound) (adapter/outbound)
```

**Caching belongs in the service layer (application), NOT in:**
- **HTTP handlers** -- Handlers should not know about caching. They call service methods and return responses.
- **Repository layer** -- Repositories should return fresh data. Caching is a cross-cutting concern that belongs in business logic orchestration.
- **Middleware** -- HTTP-level response caching (e.g., ETag, Cache-Control headers) is a separate concern from data caching. Don't conflate them.

**Implementation pattern:** Inject `CacheRepository` into each service alongside its primary repository:

```go
type OpenLineageService struct {
    repo  domain.OpenLineageRepository
    cache domain.CacheRepository
    ttl   TTLConfig
}

func (s *OpenLineageService) GetLineageGraph(ctx context.Context, datasetID, fieldName, direction string, maxDepth int) (*OpenLineageLineageResponse, error) {
    // 1. Build cache key
    key := fmt.Sprintf("lineage:v2:graph:%s:%s:%s:%d", datasetID, fieldName, direction, maxDepth)

    // 2. Try cache
    var cached OpenLineageLineageResponse
    if err := s.cache.Get(ctx, key, &cached); err == nil {
        return &cached, nil
    }

    // 3. Cache miss: query Teradata
    graph, err := s.repo.GetColumnLineageGraph(ctx, datasetID, fieldName, direction, maxDepth)
    if err != nil {
        return nil, err
    }

    response := s.buildResponse(datasetID, fieldName, direction, maxDepth, graph)

    // 4. Populate cache (fire-and-forget, don't fail the request on cache write errors)
    _ = s.cache.Set(ctx, key, response, s.ttl.Lineage)

    return response, nil
}
```

**Cache write errors are silently swallowed.** Cache is an optimization, not a correctness requirement. If Redis is down, the NoOpCache handles this transparently (Get returns miss, Set is a no-op).

### Force-Refresh Support (UI bypass)

Support a `Cache-Control: no-cache` request header or `?refresh=true` query parameter to skip cache reads:

```go
func (s *OpenLineageService) GetLineageGraph(ctx context.Context, datasetID, fieldName, direction string, maxDepth int, skipCache bool) (*OpenLineageLineageResponse, error) {
    key := fmt.Sprintf("lineage:v2:graph:%s:%s:%s:%d", datasetID, fieldName, direction, maxDepth)

    if !skipCache {
        var cached OpenLineageLineageResponse
        if err := s.cache.Get(ctx, key, &cached); err == nil {
            return &cached, nil
        }
    }
    // ... query Teradata and populate cache
}
```

## What NOT to Add

| Avoid | Why | Do Instead |
|-------|-----|------------|
| `go-redis/cache` library | Adds TinyLFU local cache + MessagePack serialization. Unnecessary complexity for a low-traffic internal tool. The project already has the cache interface it needs. | Use the existing `CacheRepository` with `encoding/json` |
| In-process local cache (TinyLFU, go-cache, ristretto) | Two-layer caching adds invalidation complexity. For a single-server deployment, Redis alone is sufficient. | Single-layer Redis cache |
| MessagePack serialization | Marginal perf gain (~1ms per 10KB payload) doesn't justify adding a dependency + struct tags. JSON is already wired. | Keep `encoding/json` |
| HTTP-level response caching middleware | Caches serialized HTTP responses, breaking force-refresh and invalidation. Service-layer caching gives more control. | Service-layer cache-aside pattern |
| Redis Cluster / Sentinel | Overkill for a single-server internal tool. Adds operational complexity. | Single Redis instance with NoOpCache fallback |
| Cache warming on startup | Adds startup latency and complexity. Lazy population via cache-aside is simpler and handles cold starts naturally. | Let cache populate organically via requests |
| Pub/Sub for cache invalidation | No distributed servers to coordinate. TTL-based expiry is sufficient. | TTL-based expiry + force-refresh endpoint |

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Redis client | redis/go-redis v9 | redigo | go-redis is already a dependency, modern API with context support, better maintained |
| Redis client | redis/go-redis v9 | rueidis | rueidis is faster but requires rewriting all cache code. go-redis is already integrated. |
| Serialization | encoding/json | vmihailenco/msgpack | Negligible perf gain for cache payloads this small. Extra dependency + struct tags. |
| Serialization | encoding/json | encoding/gob | Gob is Go-specific, not human-debuggable. JSON cache values can be inspected with redis-cli. |
| Cache location | Service layer | HTTP middleware | Middleware caches raw bytes, can't do selective invalidation or composite keys. |
| Cache location | Service layer | Repository decorator | Viable but puts caching too close to data access. Service layer has richer context for key construction. |
| Cache strategy | Cache-aside (lazy) | Write-through | No write path in this read-only lineage API. Cache-aside is the natural fit. |
| TTL management | Environment variables | Redis config (maxmemory-policy) | Environment variables give per-data-type TTL control. Redis eviction policy is a blunt instrument. |

## Installation / Upgrade

```bash
# Upgrade go-redis from v9.4.0 to v9.7.0
cd /Users/Daniel.Tehan/Code/lineage/lineage-api
go get github.com/redis/go-redis/v9@v9.7.0
go mod tidy
```

No new dependencies are needed. All other required packages are already in the project.

## Version Compatibility

| Package | Version | Go Version | Notes |
|---------|---------|------------|-------|
| redis/go-redis | v9.7.0 | Go 1.18+ | Project uses Go 1.23, fully compatible |
| encoding/json | stdlib | Any | Standard library |
| spf13/viper | v1.21.0 | Already in use | For reading CACHE_TTL_* environment variables |

## Existing Code Assets (No Changes Needed)

These files are already correct and will be used as-is:

| File | What It Provides |
|------|-----------------|
| `internal/domain/repository.go` (lines 31-36) | `CacheRepository` interface with Get/Set/Delete/Exists |
| `internal/adapter/outbound/redis/cache.go` (lines 21-42) | `CacheRepository` struct wrapping go-redis client |
| `internal/adapter/outbound/redis/cache.go` (lines 44-65) | Get/Set/Delete/Exists implementations using JSON marshal |
| `internal/adapter/outbound/redis/cache.go` (lines 81-110) | `NoOpCache` for graceful degradation |
| `internal/adapter/outbound/redis/cache_test.go` | NoOpCache unit tests |
| `internal/infrastructure/config/config.go` | Redis config loading (REDIS_ADDR, REDIS_PASSWORD, REDIS_DB) |

## Files That Need Changes

| File | Change Needed |
|------|--------------|
| `internal/adapter/outbound/redis/cache.go` | Add connection pool options (timeouts, MinIdleConns) to `NewCacheRepository`. Add `DeleteByPattern` method using SCAN. |
| `internal/infrastructure/config/config.go` | Add `CacheConfig` struct with TTL values and `CACHE_ENABLED` flag. |
| `internal/application/openlineage_service.go` | Inject `CacheRepository`, add cache-aside logic to `GetLineageGraph`, `ListDatasets`, `SearchDatasets`, etc. |
| `internal/application/lineage_service.go` | Inject `CacheRepository`, add cache-aside for `GetLineageGraph`, `GetUpstreamLineage`, `GetDownstreamLineage`. |
| `internal/application/asset_service.go` | Inject `CacheRepository`, add cache-aside for listing operations. |
| `cmd/server/main.go` | Wire Redis cache creation with NoOpCache fallback. Pass cache to services. |
| `internal/adapter/inbound/http/handlers.go` | Extract `refresh` query param / `Cache-Control: no-cache` header, pass to service. |
| `go.mod` | Upgrade go-redis version |

## Sources

- [redis/go-redis GitHub releases](https://github.com/redis/go-redis/releases) - Version history, v9.7.0 release notes - HIGH confidence
- [Redis official go-redis guide](https://redis.io/docs/latest/develop/clients/go/) - Connection options, best practices - HIGH confidence
- [go-redis debugging guide (Uptrace)](https://redis.uptrace.dev/guide/go-redis-debugging.html) - Pool configuration, timeout recommendations - HIGH confidence
- [Redis connection pools documentation](https://redis.io/docs/latest/develop/clients/pools-and-muxing/) - Pool sizing guidance - HIGH confidence
- [go-redis/cache GitHub](https://github.com/go-redis/cache) - Evaluated and rejected for this use case - MEDIUM confidence
- [Redis caching patterns guide](https://redis.io/tutorials/howtos/solutions/microservices/caching/) - Cache-aside, write-through patterns - MEDIUM confidence
- [DragonflyDB: Golang delete Redis keys by prefix](https://www.dragonflydb.io/code-examples/golang-redis-delete-by-prefix) - SCAN-based pattern deletion - MEDIUM confidence

---
*Stack research for: Redis response caching in Go REST API*
*Researched: 2026-02-12*
