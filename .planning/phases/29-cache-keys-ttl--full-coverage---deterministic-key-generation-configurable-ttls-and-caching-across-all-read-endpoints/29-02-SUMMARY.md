---
phase: 29-cache-keys-ttl-full-coverage
plan: 02
subsystem: api
tags: [redis, caching, cache-aside, ttl, go, decorator]

# Dependency graph
requires:
  - phase: 29-01
    provides: "Cache key builder functions and CacheTTLConfig struct"
  - phase: 28
    provides: "Redis connection, CacheRepository interface, initial 2-method cache decorator"
provides:
  - "Full cache coverage across all 8 endpoint-backing repository methods"
  - "Per-data-type TTL configuration (lineage, asset, statistics, ddl, search)"
  - "CacheTTLConfig wired from environment variables through to decorator"
  - "46 tests covering cache hit/miss/nil/error for all cached and uncached methods"
affects: [30-graceful-degradation, 31-invalidation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Cache-aside with per-type TTL via CacheTTLConfig"
    - "Wrapper struct (listDatasetsResult) for multi-return value caching"
    - "Type alias in config package to break import cycle"

key-files:
  created: []
  modified:
    - "lineage-api/internal/adapter/outbound/redis/cached_openlineage_repo.go"
    - "lineage-api/internal/adapter/outbound/redis/cached_openlineage_repo_test.go"
    - "lineage-api/internal/adapter/outbound/redis/cache.go"
    - "lineage-api/internal/infrastructure/config/config.go"
    - "lineage-api/cmd/server/main.go"
    - "lineage-api/.gitignore"

key-decisions:
  - "CacheTTLConfig defined in redis package (not config) to avoid import cycle; config uses type alias"
  - "ListDatasets uses wrapper struct to cache both slice and total count in single cache entry"
  - ".gitignore pattern changed from bare 'server' to '/bin/server' to avoid blocking cmd/server/"

patterns-established:
  - "Slice-returning methods: nil not cached, empty slices cached (same as pointer pattern)"
  - "Multi-return caching: define internal wrapper struct with JSON tags"

# Metrics
duration: 6min
completed: 2026-02-12
---

# Phase 29 Plan 02: Full Cache Coverage Summary

**Cache-aside for all 8 v2 API read methods with per-type TTL config, centralized key builders, and 46 tests**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-13T01:59:53Z
- **Completed:** 2026-02-13T02:05:36Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Refactored CachedOpenLineageRepository from 2 cached methods to 8 (full endpoint coverage)
- Replaced single int TTL with per-data-type CacheTTLConfig (lineage=30m, asset=15m, statistics=15m, ddl=30m, search=5m)
- Replaced inline fmt.Sprintf key construction with centralized key builder functions from cache_keys.go
- Wired cfg.CacheTTL from environment variables through config to the decorator constructor
- Expanded test suite from 14 to 31 cached method tests (46 total in redis package)

## Task Commits

Each task was committed atomically:

1. **Task 1: Refactor decorator to use CacheTTLConfig and key builders, add all cached methods** - `4a580e9` (feat)
2. **Task 2: Update tests and wire CacheTTLConfig in main.go** - `1602e37` (feat)

**Plan metadata:** (pending)

## Files Created/Modified
- `lineage-api/internal/adapter/outbound/redis/cached_openlineage_repo.go` - 8 cached methods with centralized key builders and per-type TTL
- `lineage-api/internal/adapter/outbound/redis/cached_openlineage_repo_test.go` - 31 tests for cached methods + delegation + JSON round-trip (844 lines)
- `lineage-api/internal/adapter/outbound/redis/cache.go` - CacheTTLConfig struct added alongside Config
- `lineage-api/internal/infrastructure/config/config.go` - Type alias for redis.CacheTTLConfig
- `lineage-api/cmd/server/main.go` - cfg.CacheTTL passed to constructor (replaces hardcoded 300)
- `lineage-api/.gitignore` - Pattern fixed from `server` to `/bin/server`

## Decisions Made
- **CacheTTLConfig in redis package:** The config package already imports the redis package (for redis.Config connection settings), so placing CacheTTLConfig in redis and using a type alias (`type CacheTTLConfig = redis.CacheTTLConfig`) in config breaks the import cycle without losing ergonomics
- **listDatasetsResult wrapper:** ListDatasets returns (slice, int, error) -- a private wrapper struct bundles both values for JSON serialization into a single cache entry
- **Gitignore fix:** The bare `server` pattern blocked `cmd/server/` directory; changed to `/bin/server` to target only the compiled binary

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Import cycle: config -> redis -> config**
- **Found during:** Task 1 (refactoring decorator to use CacheTTLConfig)
- **Issue:** Plan specified importing `config.CacheTTLConfig` from the redis package, but config.go already imports redis (for `redis.Config`), creating a cycle
- **Fix:** Moved CacheTTLConfig definition to redis package (cache.go), added type alias in config package
- **Files modified:** `cache.go`, `config.go`, `cached_openlineage_repo.go`
- **Verification:** Package compiles without cycle error, config still exposes CacheTTLConfig
- **Committed in:** 4a580e9 (Task 1 commit)

**2. [Rule 3 - Blocking] .gitignore pattern `server` blocking `cmd/server/main.go`**
- **Found during:** Task 2 (committing main.go changes)
- **Issue:** `git add lineage-api/cmd/server/main.go` refused because `lineage-api/.gitignore` had bare `server` pattern matching the directory
- **Fix:** Changed pattern to `/bin/server` to target only the compiled binary
- **Files modified:** `lineage-api/.gitignore`
- **Verification:** `git add` succeeds, binary still ignored at bin/server
- **Committed in:** 1602e37 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both were infrastructure blockers resolved inline. No scope creep. All planned functionality delivered.

## Issues Encountered
None beyond the deviations documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Full cache coverage complete: all 8 v2 API read endpoints use cache-aside with deterministic keys
- Per-type TTL configurable via CACHE_TTL_LINEAGE, CACHE_TTL_ASSETS, CACHE_TTL_STATISTICS, CACHE_TTL_DDL, CACHE_TTL_SEARCH env vars
- Ready for Phase 30 (graceful degradation) -- NoOpCache fallback already exists, needs connection retry logic
- Ready for Phase 31 (cache invalidation) -- deterministic key format enables targeted invalidation

---
*Phase: 29-cache-keys-ttl-full-coverage*
*Completed: 2026-02-12*
