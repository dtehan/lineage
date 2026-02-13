---
phase: 30-graceful-degradation
plan: 01
subsystem: api, infra
tags: redis, go-redis, graceful-degradation, noop-cache, slog

# Dependency graph
requires:
  - phase: 28-redis-connection-cache-decorator-foundation
    provides: "CacheRepository interface, NoOpCache stub, CachedOpenLineageRepository decorator"
  - phase: 29-cache-keys-ttl-full-coverage
    provides: "CacheTTLConfig, all 9 cached methods in CachedOpenLineageRepository"
provides:
  - "Graceful degradation: app starts and serves all requests without Redis"
  - "NoOpCache with Close() for uniform cleanup interface"
  - "slog.Warn on Redis failure (not log.Fatalf), slog.Info on Redis success"
  - "Integration test proving all 9 cached methods work with NoOpCache"
affects: [31-cache-control-observability]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Try-connect-or-fallback: attempt Redis, warn on failure, substitute NoOpCache"
    - "domain.CacheRepository interface variable for polymorphic cache wiring"

key-files:
  created: []
  modified:
    - "lineage-api/cmd/server/main.go"
    - "lineage-api/internal/adapter/outbound/redis/cache.go"
    - "lineage-api/internal/adapter/outbound/redis/cache_test.go"
    - "lineage-api/internal/adapter/outbound/redis/cached_openlineage_repo_test.go"

key-decisions:
  - "defer redisRepo.Close() inside else block only -- no cleanup needed for NoOpCache path"
  - "slog.Warn (not slog.Error) for Redis unavailability -- cache is optional infrastructure"
  - "slog.Info on Redis success so operators can confirm cache is active"
  - "NoOpCache.Close() returns nil -- satisfies io.Closer pattern for uniform resource cleanup"

patterns-established:
  - "Try-connect-or-fallback: try infrastructure, log warning on failure, substitute no-op"

# Metrics
duration: 2min
completed: 2026-02-12
---

# Phase 30 Plan 01: Graceful Degradation Summary

**Try-connect-or-fallback Redis wiring with NoOpCache auto-substitution and integration test proving all 9 cached methods degrade correctly**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-13T02:32:18Z
- **Completed:** 2026-02-13T02:34:22Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Replaced fail-fast `log.Fatalf` on Redis connection failure with `slog.Warn` + NoOpCache fallback
- Added `slog.Info` confirmation when Redis connects successfully for operator visibility
- Added `Close()` method to NoOpCache for uniform cleanup interface
- Integration test proves all 9 cached repository methods return correct data through NoOpCache

## Task Commits

Each task was committed atomically:

1. **Task 1: Add Close() to NoOpCache and replace fail-fast with graceful fallback in main.go** - `796e1d1` (feat)
2. **Task 2: Add tests for NoOpCache Close() and NoOp-through-CachedRepo integration** - `76881d2` (test)

## Files Created/Modified
- `lineage-api/cmd/server/main.go` - Try-connect-or-fallback Redis wiring with domain.CacheRepository interface variable
- `lineage-api/internal/adapter/outbound/redis/cache.go` - NoOpCache Close() method
- `lineage-api/internal/adapter/outbound/redis/cache_test.go` - NoOpCache Close() test
- `lineage-api/internal/adapter/outbound/redis/cached_openlineage_repo_test.go` - Integration test proving all 9 methods work with NoOpCache

## Decisions Made
- `defer redisRepo.Close()` placed inside else block -- only runs when Redis actually connected; NoOpCache path has no resources to clean up
- Used `slog.Warn` (not `slog.Error` or `log.Fatalf`) for Redis unavailability -- cache is optional infrastructure, not a critical failure
- Used `slog.Info` on successful Redis connection so operators can confirm cache is active
- NoOpCache.Close() returns nil -- satisfies io.Closer pattern for uniform resource cleanup without branching

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Graceful degradation complete -- application now starts and serves all requests correctly regardless of Redis availability
- Ready for Phase 31 (Cache Control & Observability) -- cache status headers, bypass parameter, and UI refresh controls
- All 46 tests in redis package pass with zero regressions

---
*Phase: 30-graceful-degradation*
*Completed: 2026-02-12*
