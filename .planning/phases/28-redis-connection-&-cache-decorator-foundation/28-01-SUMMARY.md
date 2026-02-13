---
phase: 28-redis-connection-cache-decorator-foundation
plan: 01
subsystem: infra
tags: [redis, go-redis, caching, dependency-upgrade, cve-patch]

# Dependency graph
requires:
  - phase: 27-openlineage-api
    provides: "OpenLineage API with config infrastructure and main.go wiring"
provides:
  - "go-redis v9.7.3 dependency (CVE-2025-29923 patched)"
  - "Redis client creation with fail-fast in main.go"
  - "Redis connection lifecycle (defer Close)"
affects:
  - 28-02 (cache decorator wiring uses cacheRepo created here)
  - 29-cache-key-strategy-ttl-config (builds on Redis connection)
  - 30-graceful-degradation (replaces fail-fast with NoOpCache fallback)

# Tech tracking
tech-stack:
  added: ["go-redis/v9 v9.7.3 (upgraded from v9.4.0)"]
  patterns: ["fail-fast Redis connection in main.go"]

key-files:
  created: []
  modified:
    - "lineage-api/go.mod"
    - "lineage-api/go.sum"
    - "lineage-api/cmd/server/main.go"

key-decisions:
  - "Fail-fast (log.Fatalf) on Redis connection failure -- Phase 30 adds graceful degradation"
  - "Blank identifier _ = cacheRepo to avoid unused variable error until 28-02 wires decorator"
  - "go-redis v9.7.3 specifically (not v9.7.0 which contains CVE-2025-29923)"

patterns-established:
  - "Redis client created after Teradata connection, before repository wiring"
  - "defer cacheRepo.Close() for shutdown lifecycle"

# Metrics
duration: 2min
completed: 2026-02-13
---

# Phase 28 Plan 01: Redis Connection Foundation Summary

**Upgraded go-redis to v9.7.3 (CVE-2025-29923 fix) and wired fail-fast Redis client creation into main.go**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-13T01:23:58Z
- **Completed:** 2026-02-13T01:26:11Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Upgraded go-redis from v9.4.0 to v9.7.3, patching CVE-2025-29923 (out-of-order response bug when CLIENT SETINFO times out)
- Wired Redis client creation into main.go with fail-fast behavior (log.Fatalf on connection failure)
- Redis connection lifecycle managed via defer cacheRepo.Close()
- Project compiles successfully with blank identifier workaround for unused cacheRepo variable

## Task Commits

Each task was committed atomically:

1. **Task 1: Upgrade go-redis from v9.4.0 to v9.7.3** - `ba6066d` (chore)
2. **Task 2: Create Redis client with fail-fast in main.go** - `ae4989c` (feat)

## Files Created/Modified
- `lineage-api/go.mod` - Updated go-redis dependency from v9.4.0 to v9.7.3
- `lineage-api/go.sum` - Updated checksums for new dependency version
- `lineage-api/cmd/server/main.go` - Added redisAdapter import, Redis client creation with fail-fast, defer Close

## Decisions Made
- Used go-redis v9.7.3 specifically (not v9.7.0 which contains CVE-2025-29923, not latest which could introduce untested changes)
- Fail-fast with log.Fatalf on Redis connection failure -- Phase 30 will replace this with graceful degradation using NoOpCache
- Added `_ = cacheRepo` blank identifier to satisfy Go unused variable check until Plan 28-02 wires the decorator

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- `go build ./cmd/server/` produced a `server` binary in the lineage-api directory that was already tracked in git (from initial commit). Built with `-o /dev/null` for verification to avoid modifying the tracked binary.

## User Setup Required

None - no external service configuration required. Redis connection configuration already exists in the config infrastructure from Phase 27.

## Next Phase Readiness
- Redis client creation is in place, ready for Plan 28-02 to create the CachedOpenLineageRepository decorator and wire it into the service layer
- The `cacheRepo` variable is created and available in main.go scope
- OpenLineage repository wiring is untouched, ready for decorator wrapping in 28-02

---
*Phase: 28-redis-connection-cache-decorator-foundation*
*Completed: 2026-02-13*
