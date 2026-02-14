# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-12)

**Core value:** Enable new teams to deploy and operate the lineage application using documentation alone.
**Current focus:** v6.0 Redis Caching Layer - Milestone complete

## Current Position

Milestone: v6.0 Redis Caching Layer (COMPLETE)
Phase: 33 of 33 (Remove Go Backend)
Plan: 3 of 3 in current phase
Status: Phase complete -- all plans executed
Last activity: 2026-02-13 -- Completed 33-03-PLAN.md

Progress: [██████████] 100% (33/33 phases complete)

## Performance Metrics

**Velocity:**
- Total plans completed: 76 (v1.0: 13, v2.0: 11, v2.1: 5, v3.0: 11, v4.0: 15, v5.0: 9, v6.0: 12)
- Average plan duration: ~3.3 min
- Total execution time: ~250 min

**By Milestone:**

| Milestone | Phases | Plans | Duration |
|-----------|--------|-------|----------|
| v1.0 | 6 | 13 | 8 days |
| v2.0 | 2 | 11 | ~2 hours |
| v2.1 | 2 | 5 | 1 day |
| v3.0 | 6 | 11 | ~2.5 hours |
| v4.0 | 5 | 15 | 2 days |
| v5.0 | 4 | 9 | ~30 min |
| v6.0 | 6 | 12 | ~39 min |

**Recent Trend:**
- v6.0 Plan 28-01: 2 min
- v6.0 Plan 28-02: 4 min
- v6.0 Plan 29-01: 2 min
- v6.0 Plan 29-02: 6 min
- v6.0 Plan 30-01: 2 min
- v6.0 Plan 31-01: 5 min
- v6.0 Plan 31-02: 4 min
- v6.0 Plan 32-01: 2 min
- v6.0 Plan 32-02: 3 min
- v6.0 Plan 33-01: 3 min
- v6.0 Plan 33-02: 2 min
- v6.0 Plan 33-03: 4 min
- Trend: Stable velocity

*Updated after each plan completion*

## Accumulated Context

### Decisions

All decisions logged in PROJECT.md Key Decisions table.

Recent decisions:
- [33-03]: Removed entire Optional prerequisites table from operations_guide.md (Go/Redis were only items)
- [33-03]: Removed entire Redis Cache Setup section (5.5) from operations_guide.md
- [33-03]: Removed Go ODBC troubleshooting sections (6 entries) from operations_guide.md
- [33-03]: Replaced Go hexagonal architecture with simple Python Flask description in developer_manual.md
- [33-03]: Removed caching section, config.yaml, and Go server settings from user_guide.md
- [33-03]: Replaced Go router.go CORS code block with python_server.py reference in SECURITY.md
- [33-02]: Updated API endpoints to list all 11 v2 routes verified against python_server.py
- [33-02]: Removed references to deleted spec files (coding_standards_go.md, lineage_plan_backend.md, test_plan_backend.md)
- [33-02]: Fixed test command paths from run_api_tests.py to tests/run_api_tests.py
- [33-01]: Only stage Go-specific spec deletions (4 files), not all spec deletions already in working tree from prior work
- [33-01]: Debug files were untracked so only physical rm needed, no git rm
- [32-02]: Documentation-only changes -- no code modifications needed
- [32-01]: Log messages in ops guide use actual slog output format from main.go (not generic placeholders)
- [32-01]: Cache TTL table in user guide shows both human-readable duration and env var with numeric default
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

### Roadmap Evolution

- Phase 32 added (2026-02-12): Update documentation -- All repository documentation and READMEs updated to reflect Redis caching implementation
- Phase 33 added (2026-02-13): Remove Go Backend -- Remove all Go backend code and documentation references, keeping only the Python backend

### Pending Todos

1. Views not showing their column types (2026-01-31, area: ui)
2. Optimize view column type extraction to in-database process (2026-02-01, area: database)
3. Refactor COLUMN_LINEAGE_MAPPINGS to test fixtures (2026-02-01, area: database)

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-02-13
Stopped at: Completed Phase 33 -- v6.0 milestone complete
Resume file: None
