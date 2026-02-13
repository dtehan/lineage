# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-12)

**Core value:** Enable new teams to deploy and operate the lineage application using documentation alone.
**Current focus:** v6.0 Redis Caching Layer - Phase 29 complete, ready for Phase 30

## Current Position

Milestone: v6.0 Redis Caching Layer (ACTIVE)
Phase: 29 of 31 (Cache Keys, TTL & Full Coverage)
Plan: 2 of 2 in current phase
Status: Phase complete
Last activity: 2026-02-12 -- Completed 29-02-PLAN.md (full cache coverage + per-type TTL)

Progress: [████░░░░░░] 34%

## Performance Metrics

**Velocity:**
- Total plans completed: 68 (v1.0: 13, v2.0: 11, v2.1: 5, v3.0: 11, v4.0: 15, v5.0: 9, v6.0: 4)
- Average plan duration: ~3.3 min
- Total execution time: ~225 min

**By Milestone:**

| Milestone | Phases | Plans | Duration |
|-----------|--------|-------|----------|
| v1.0 | 6 | 13 | 8 days |
| v2.0 | 2 | 11 | ~2 hours |
| v2.1 | 2 | 5 | 1 day |
| v3.0 | 6 | 11 | ~2.5 hours |
| v4.0 | 5 | 15 | 2 days |
| v5.0 | 4 | 9 | ~30 min |
| v6.0 | 4 | ~7 | ~14 min |

**Recent Trend:**
- v6.0 Plan 28-01: 2 min
- v6.0 Plan 28-02: 4 min
- v6.0 Plan 29-01: 2 min
- v6.0 Plan 29-02: 6 min
- Trend: Stable velocity

*Updated after each plan completion*

## Accumulated Context

### Decisions

All decisions logged in PROJECT.md Key Decisions table.

Recent decisions:
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
- [28-01]: Fail-fast (log.Fatalf) on Redis connection failure -- Phase 30 adds graceful degradation
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
Stopped at: Phase 29 complete -- ready for Phase 30 (graceful degradation)
Resume file: None
