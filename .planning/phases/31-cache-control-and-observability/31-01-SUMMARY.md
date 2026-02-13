---
phase: 31-cache-control-and-observability
plan: 01
subsystem: api
tags: [redis, cache, middleware, chi, http-headers, context-propagation]

# Dependency graph
requires:
  - phase: 28-redis-infrastructure
    provides: CacheRepository interface, Redis and NoOpCache implementations
  - phase: 29-cache-integration
    provides: CachedOpenLineageRepository with 9 cached methods, cache key builders
  - phase: 30-graceful-degradation
    provides: NoOpCache fallback pattern, CachedOpenLineageRepository wired in main.go
provides:
  - TTL method on CacheRepository interface (Redis and NoOpCache)
  - CacheMetadata context type for propagating cache status through request lifecycle
  - CacheControl Chi middleware injecting X-Cache and X-Cache-TTL response headers
  - Cache bypass via ?refresh=true query parameter
  - CORS ExposedHeaders updated for browser access to cache headers
affects: [frontend-cache-indicators, api-monitoring, operator-dashboards]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Context-based metadata propagation: middleware seeds, repository populates, middleware reads back"
    - "ResponseWriter wrapper pattern for header injection before write"
    - "Cache bypass via query parameter with context signal propagation"

key-files:
  created:
    - "lineage-api/internal/adapter/outbound/redis/cache_metadata.go"
    - "lineage-api/internal/adapter/inbound/http/cache_middleware.go"
    - "lineage-api/internal/adapter/inbound/http/cache_middleware_test.go"
  modified:
    - "lineage-api/internal/domain/repository.go"
    - "lineage-api/internal/adapter/outbound/redis/cache.go"
    - "lineage-api/internal/adapter/outbound/redis/cache_test.go"
    - "lineage-api/internal/adapter/outbound/redis/cached_openlineage_repo.go"
    - "lineage-api/internal/adapter/outbound/redis/cached_openlineage_repo_test.go"
    - "lineage-api/internal/adapter/inbound/http/router.go"
    - "lineage-api/internal/domain/mocks/repositories.go"

key-decisions:
  - "CacheMetadata uses pointer in context so repository writes are visible to middleware without re-injecting"
  - "contextKey type is unexported; only exported helper functions cross package boundaries"
  - "Middleware mounted only on v2 route group -- v1, health, jobs, runs get no X-Cache headers"
  - "X-Cache-TTL only set on HIT with TTL >= 0; MISS responses omit TTL header entirely"
  - "Bypass signal stored as separate context key (not on CacheMetadata) for cleaner separation"

patterns-established:
  - "Context metadata propagation: seed in middleware, populate in repository, read back in middleware"
  - "ResponseWriter wrapper with Unwrap() for http.ResponseController compatibility"

# Metrics
duration: 5min
completed: 2026-02-12
---

# Phase 31 Plan 01: Cache Control & Observability Summary

**X-Cache HIT/MISS headers, X-Cache-TTL, and ?refresh=true bypass on all 9 cached v2 API endpoints via context-based CacheMetadata propagation and Chi middleware**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-13T02:56:40Z
- **Completed:** 2026-02-13T03:02:00Z
- **Tasks:** 3
- **Files modified:** 10

## Accomplishments
- TTL method added to CacheRepository interface with Redis and NoOpCache implementations
- CacheMetadata context type enables middleware-to-repository-to-middleware data flow
- CacheControl middleware injects X-Cache (HIT/MISS) and X-Cache-TTL headers on v2 responses
- ?refresh=true query parameter bypasses cache read and stores fresh data
- 16 new tests across middleware (8) and repository (8) layers
- CORS updated so browser JavaScript can read custom cache headers

## Task Commits

Each task was committed atomically:

1. **Task 1: Add TTL to CacheRepository interface, implement on Redis and NoOpCache, create CacheMetadata context type** - `caade53` (feat)
2. **Task 2: Update CachedOpenLineageRepository to read bypass signal and write metadata to context** - `f55604c` (feat)
3. **Task 3: Create CacheControl middleware, update CORS and router, add middleware tests** - `4ac087f` (feat)

## Files Created/Modified
- `lineage-api/internal/domain/repository.go` - Added TTL method to CacheRepository interface
- `lineage-api/internal/adapter/outbound/redis/cache.go` - TTL implementation for Redis and NoOpCache
- `lineage-api/internal/adapter/outbound/redis/cache_metadata.go` - CacheMetadata struct and context helpers
- `lineage-api/internal/adapter/outbound/redis/cache_test.go` - NoOpCache.TTL test
- `lineage-api/internal/domain/mocks/repositories.go` - TTL on MockCacheRepository
- `lineage-api/internal/adapter/outbound/redis/cached_openlineage_repo.go` - Bypass and metadata in all 9 methods
- `lineage-api/internal/adapter/outbound/redis/cached_openlineage_repo_test.go` - 8 new bypass/metadata tests
- `lineage-api/internal/adapter/inbound/http/cache_middleware.go` - CacheControl middleware and ResponseWriter wrapper
- `lineage-api/internal/adapter/inbound/http/cache_middleware_test.go` - 8 middleware tests
- `lineage-api/internal/adapter/inbound/http/router.go` - CORS ExposedHeaders + CacheControl on v2 routes

## Decisions Made
- CacheMetadata uses pointer in context so repository writes are visible to middleware without re-injecting into context
- contextKey type is unexported; only exported helper functions (NewCacheMetadataContext, GetCacheMetadata, etc.) cross package boundaries
- Middleware mounted only on v2 route group -- v1, health, jobs, runs produce no X-Cache headers
- X-Cache-TTL only set on HIT with TTL >= 0; MISS responses omit TTL header entirely
- Bypass signal stored as separate context key (not on CacheMetadata struct) for cleaner separation of concerns

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Cache observability backend is complete
- Frontend can now read X-Cache and X-Cache-TTL headers from v2 API responses via CORS
- Ready for optional frontend cache status indicators
- All existing tests pass with zero regressions

---
*Phase: 31-cache-control-and-observability*
*Completed: 2026-02-12*
