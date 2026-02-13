# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-12)

**Core value:** Enable new teams to deploy and operate the lineage application using documentation alone.
**Current focus:** v6.0 Redis Caching Layer - Phase 31 complete, milestone complete

## Current Position

Milestone: v6.0 Redis Caching Layer (COMPLETE)
Phase: 31 of 31 (Cache Control & Observability)
Plan: 2 of 2 in current phase
Status: Milestone complete
Last activity: 2026-02-12 -- Completed 31-02-PLAN.md (UI refresh buttons for cache bypass)

Progress: [██████████] 100%

## Performance Metrics

**Velocity:**
- Total plans completed: 71 (v1.0: 13, v2.0: 11, v2.1: 5, v3.0: 11, v4.0: 15, v5.0: 9, v6.0: 7)
- Average plan duration: ~3.3 min
- Total execution time: ~236 min

**By Milestone:**

| Milestone | Phases | Plans | Duration |
|-----------|--------|-------|----------|
| v1.0 | 6 | 13 | 8 days |
| v2.0 | 2 | 11 | ~2 hours |
| v2.1 | 2 | 5 | 1 day |
| v3.0 | 6 | 11 | ~2.5 hours |
| v4.0 | 5 | 15 | 2 days |
| v5.0 | 4 | 9 | ~30 min |
| v6.0 | 4 | 7 | ~25 min |

**Recent Trend:**
- v6.0 Plan 28-01: 2 min
- v6.0 Plan 28-02: 4 min
- v6.0 Plan 29-01: 2 min
- v6.0 Plan 29-02: 6 min
- v6.0 Plan 30-01: 2 min
- v6.0 Plan 31-01: 5 min
- v6.0 Plan 31-02: 4 min
- Trend: Stable velocity

*Updated after each plan completion*

## Accumulated Context

### Decisions

All decisions logged in PROJECT.md Key Decisions table.

Recent decisions:
- [31-02]: Manual fetch + setQueryData (not invalidateQueries) ensures ?refresh=true is sent to backend for cache bypass
- [31-02]: Refresh button disabled during isLoading (initial) but enabled during isFetching (refetch)
- [31-02]: Asset browser refresh fetches namespaces and datasets in parallel with Promise.all
- [31-02]: Lineage toolbar refresh targets exact TanStack query key matching hook's key pattern
- [31-01]: CacheMetadata uses pointer in context -- repository writes visible to middleware without re-injecting
- [31-01]: contextKey type unexported; only exported helper functions cross package boundaries
- [31-01]: CacheControl middleware mounted only on v2 route group -- v1/health/jobs/runs get no X-Cache headers
- [31-01]: X-Cache-TTL only on HIT with TTL >= 0; MISS responses omit TTL header
- [31-01]: Bypass signal stored as separate context key (not on CacheMetadata) for separation of concerns
- [30-01]: defer redisRepo.Close() inside else block only -- no cleanup needed for NoOpCache path
- [30-01]: slog.Warn (not slog.Error) for Redis unavailability -- cache is optional infrastructure
- [30-01]: slog.Info on Redis success so operators can confirm cache is active
- [30-01]: NoOpCache.Close() returns nil -- satisfies io.Closer pattern for uniform resource cleanup
- [29-02]: CacheTTLConfig defined in redis package (not config) to avoid import cycle; config uses type alias
- [29-02]: ListDatasets uses wrapper struct for multi-return caching (slice + total count)
- [29-02]: .gitignore pattern /bin/server (not bare 'server') to avoid blocking cmd/server/
- [29-01]: DatasetSearchKey normalizes to uppercase + trims whitespace -- matches Teradata case-insensitive LIKE
- [29-01]: Pipe delimiter for composite params -- colons for structure, pipes for values; no collision risk
- [29-01]: No TTL validation -- zero/negative are intentional operator overrides
- [28-02]: Depth excluded from cache key -- deeper queries produce supersets
- [28-02]: Direction included in cache key -- different graphs per direction
- [28-02]: nil results NOT cached; empty (non-nil) graphs ARE cached
- [28-02]: Cache errors logged and swallowed -- never propagated to API callers
- [28-01]: go-redis v9.7.3 specifically (not v9.7.0 which contains CVE-2025-29923)
- [v6.0 roadmap]: 4 phases derived from 5 requirement categories (cache infra + integration merged into Phase 28)
- [v6.0 roadmap]: Phase 30 (degradation) depends only on Phase 28, not 29 -- could parallelize but sequential is simpler
- [v6.0 roadmap]: Research phases 4-6 (hardening, pagination, compatibility) excluded -- not in v6.0 requirements scope

### Pending Todos

1. Views not showing their column types (2026-01-31, area: ui)
2. Optimize view column type extraction to in-database process (2026-02-01, area: database)
3. Refactor COLUMN_LINEAGE_MAPPINGS to test fixtures (2026-02-01, area: database)

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-02-12
Stopped at: Completed 31-02-PLAN.md (UI refresh buttons for cache bypass)
Resume file: None
