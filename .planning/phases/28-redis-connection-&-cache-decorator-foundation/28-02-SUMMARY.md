---
phase: 28-redis-connection-&-cache-decorator-foundation
plan: 02
subsystem: api
tags: [redis, caching, decorator-pattern, go, cache-aside]

# Dependency graph
requires:
  - phase: 28-01
    provides: Redis client wiring (CacheRepository, Config, NoOpCache) and go-redis v9.7.3
provides:
  - CachedOpenLineageRepository decorator with cache-aside for GetColumnLineageGraph and GetDataset
  - JSON round-trip capable MockCacheRepository for testing
  - Decorator wired into main.go transparently (service/handler unchanged)
  - 14 unit tests covering hit, miss, error, delegation, key structure, JSON round-trip
affects: [29-cache-invalidation-ttl-configuration, 30-graceful-degradation]

# Tech tracking
tech-stack:
  added: []
  patterns: [cache-aside decorator via Go interface embedding, fire-and-forget cache error handling]

key-files:
  created:
    - lineage-api/internal/adapter/outbound/redis/cached_openlineage_repo.go
    - lineage-api/internal/adapter/outbound/redis/cached_openlineage_repo_test.go
  modified:
    - lineage-api/internal/domain/mocks/repositories.go
    - lineage-api/cmd/server/main.go

key-decisions:
  - "5-min (300s) TTL default -- conservative to minimize staleness; Phase 29 makes configurable"
  - "Depth excluded from cache key -- deeper queries produce supersets of shallower ones"
  - "Direction included in cache key -- upstream/downstream/both produce different graphs"
  - "nil results NOT cached -- prevents caching transient 'not found' states"
  - "Empty (non-nil) graphs ARE cached -- valid result meaning no lineage found"
  - "Cache errors logged and swallowed -- never propagated to API callers"

patterns-established:
  - "Cache-aside decorator: check cache -> miss -> inner repo -> populate cache -> return"
  - "Go embedding for interface delegation: embed inner repo, override only cached methods"
  - "Fire-and-forget cache writes: Set errors logged at Warn, never returned"
  - "MockCacheRepository with real JSON round-trip: json.Marshal on Set, json.Unmarshal on Get"

# Metrics
duration: 4min
completed: 2026-02-13
---

# Phase 28 Plan 02: Cache Decorator Summary

**CachedOpenLineageRepository decorator with cache-aside pattern for lineage graph and dataset queries, wired transparently into main.go via Go interface embedding**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-13T01:29:48Z
- **Completed:** 2026-02-13T01:33:25Z
- **Tasks:** 4
- **Files modified:** 4

## Accomplishments
- CachedOpenLineageRepository implements all 15 methods of domain.OpenLineageRepository -- only GetColumnLineageGraph and GetDataset use cache-aside, 13 others delegate via embedding
- Cache errors are logged and swallowed -- Redis failures never cause API errors
- MockCacheRepository upgraded with real JSON marshal/unmarshal for realistic testing
- Decorator wired into main.go transparently -- service and handler code unchanged
- 14 unit tests covering cache hit, miss, error swallowing, nil handling, key structure, JSON round-trip, and delegation

## Task Commits

Each task was committed atomically:

1. **Task 1: Upgrade MockCacheRepository for JSON round-trip** - `391edb4` (feat)
2. **Task 2: Implement CachedOpenLineageRepository decorator** - `1e0d2f9` (feat)
3. **Task 3: Wire decorator into main.go** - `fe0fbfc` (feat)
4. **Task 4: Write unit tests for cache decorator** - `c8f9dee` (test)

## Files Created/Modified
- `lineage-api/internal/adapter/outbound/redis/cached_openlineage_repo.go` - Cache-aside decorator (106 lines) implementing domain.OpenLineageRepository
- `lineage-api/internal/adapter/outbound/redis/cached_openlineage_repo_test.go` - 14 unit tests (441 lines) covering all cache behaviors
- `lineage-api/internal/domain/mocks/repositories.go` - MockCacheRepository upgraded with json.Marshal/Unmarshal for real serialization
- `lineage-api/cmd/server/main.go` - Decorator wiring: olRepo wrapped with CachedOpenLineageRepository, passed to service

## Decisions Made
- **5-min TTL default (300s):** Conservative to minimize staleness risk while still benefiting expensive lineage queries (150-500ms). Phase 29 will make this configurable via CACHE_TTL_LINEAGE env var.
- **Depth excluded from cache key:** The same graph structure is returned regardless of depth (deeper queries produce supersets). Including depth would cause redundant cache entries.
- **Direction included in cache key:** upstream/downstream/both produce fundamentally different graphs, so they must be cached separately.
- **nil results NOT cached:** Prevents caching transient "not found" states that might resolve on retry.
- **Empty graphs ARE cached:** A non-nil empty graph is a valid result (no lineage found) and should be cached to avoid repeated expensive queries.
- **Cache errors swallowed:** Redis failures logged at Warn level but never returned to callers. The inner Teradata repo is the source of truth.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Cache decorator is fully operational with 5-min TTL
- Phase 29 (cache invalidation and TTL configuration) can build on this foundation
- Phase 30 (graceful degradation) can wrap the fail-fast behavior in main.go
- All existing tests pass with no regressions

---
*Phase: 28-redis-connection-&-cache-decorator-foundation*
*Completed: 2026-02-13*
