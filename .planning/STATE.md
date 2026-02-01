# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-01-31)

**Core value:** The lineage application must be secure and stable for production use - no data exposure through error messages, no unbounded resource consumption, and clear security boundaries documented.
**Current focus:** v3.0 Graph Improvements - Phase 18 in progress

## Current Position

Phase: 18 of 18 (Frontend Rendering Performance)
Plan: 1 of 2 (Performance Benchmark Suite)
Status: Plan 18-01 complete, ready for Plan 18-02
Last activity: 2026-02-01 - Completed 18-01-PLAN.md (Performance Benchmark Suite)

Progress: [█████████░] 97% (39 plans complete out of ~40)

## Performance Metrics

**Velocity:**
- Total plans completed: 39 (v1.0: 13, v2.0: 11, v2.1: 5, v3.0: 10)
- Average duration: ~3 min
- Total execution time: ~139 min

**By Milestone:**

| Milestone | Phases | Plans | Duration |
|-----------|--------|-------|----------|
| v1.0 | 6 | 13 | 8 days |
| v2.0 | 2 | 11 | ~2 hours |
| v2.1 | 2 | 5 | 1 day |
| v3.0 | 8 | 10 | In progress |

**Recent Trend:**
- Last 5 plans: 18-01 (7 min), 17-02 (3 min), 17-01 (5 min), 16-02 (2 min), 16-01 (5 min)
- Trend: Good velocity - Phase 18 Performance Benchmarks complete

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [v2.1]: Pagination UI always visible (not hidden based on count)
- [v2.1]: scrollIntoView with JSDOM typeof guard; skip-initial-mount ref pattern
- [v3.0]: Five loading stages: idle (0%), fetching (0-30%), layout (30-70%), rendering (70-95%), complete (100%)
- [v3.0]: STAGE_CONFIG pattern for stage-based state configuration
- [v3.0]: Test pattern naming convention: TEST_{PATTERN_TYPE}_{SEQUENCE}
- [v3.0]: 33% reduction in layout spacing (nodeSpacing: 60->40, layerSpacing: 150->100)
- [v3.0]: Size-aware zoom: small (<=20 nodes) = 1.0, large (>=50 nodes) = 0.5, interpolated between
- [v3.0]: Top-left viewport positioning shows root/source nodes first
- [v3.0]: onProgress callback pattern for ELK layout progress (35%, 45%, 55%, 70%)
- [v3.0]: Use unidirectional CTE queries for cycle tests (ClearScape 20.0 dual recursive CTE limitation)
- [v3.0]: Integration test directory at src/__tests__/integration/ for correctness validation
- [v3.0]: CTE benchmark: 3 iterations per test, VARCHAR(4000) path matches Go implementation
- [v3.0]: LOCKING ROW FOR ACCESS hint for read-heavy CTE queries (19% improvement)
- [v3.0]: vitest bench with 5000ms time option for statistical significance
- [v3.0]: LayoutMetrics interface for prepTime/elkTime/transformTime breakdown

### Pending Todos

None yet.

### Blockers/Concerns

- Pre-existing test failures in LineageGraph.test.tsx (unrelated to current work)
- Pre-existing TypeScript errors in DatabaseLineageGraph.tsx (unrelated to current work)
- CTE Performance: All-rows scans remain (index optimization deferred - requires DBA access)

## Session Continuity

Last session: 2026-02-01
Stopped at: Completed 18-01-PLAN.md (Performance Benchmark Suite)
Resume file: None - Plan 18-01 complete, ready for Plan 18-02
