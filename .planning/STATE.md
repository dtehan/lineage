# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-23)

**Core value:** Enable accurate impact analysis for database changes by visualizing complete column-level lineage across Teradata databases
**Current focus:** v6.0 Full System Catalog — Phase 23: Standalone Table Rendering

## Current Position

Phase: 23 of 23 (Standalone Table Rendering)
Plan: 1 of 2 in current phase
Status: In progress
Last activity: 2026-02-23 — Phase 23 plan 01 complete: standalone table rendering fix (backend empty graph + inline banner)

Progress:

v1.0: ██████████ 100% (3/3 phases) — shipped 2026-02-15
v2.0: ██████████ 100% (3/3 phases) — shipped 2026-02-16
v3.0: ██████████ 100% (7/7 phases) — shipped 2026-02-19
v4.0: ██████████ 100% (5/5 phases) — shipped 2026-02-21
Draggable Minimap: ██████████ 100% (1/1 plans) — complete 2026-02-22
v5.0: ██████████ 100% (3/3 phases) — shipped 2026-02-22
v6.0: █████░░░░░ 50% (1/2 phases)

## Performance Metrics

**Velocity:**
- Total plans completed: 46 (v1.0: 12, v2.0: 8, v3.0: 7, v4.0: 9, draggable-minimap: 1, v5.0: 5, v6.0: 4)

**By Milestone:**

| Milestone | Phases | Plans | Status |
|-----------|--------|-------|--------|
| v1.0 Code Quality | 3 | 12 | Shipped 2026-02-15 |
| v2.0 Performance | 3 | 8 | Shipped 2026-02-16 |
| v3.0 Wildcard Expansion | 7 | 7 | Shipped 2026-02-19 |
| v4.0 First-Time Load | 5 | 9 | Shipped 2026-02-21 |
| Draggable Minimap Viewport | 1 | 1 | Complete 2026-02-22 |
| v5.0 Database Lineage Layout | 3 | 5 | Shipped 2026-02-22 |
| v6.0 Full System Catalog | 2 | 4 | In progress |

## Accumulated Context

### Decisions

Recent decisions affecting current work:
- [v6.0 Roadmap]: AssetBrowser lazy-load (BROW-01) placed in Phase 22 alongside population (POP-01/02) — the 1000-row limit silently breaks the browse experience the moment full population runs; deferring it to Phase 23 would make Phase 22 unverifiable
- [v6.0 Roadmap]: "Has lineage" indicator (BROW-02) placed in Phase 23 alongside rendering fixes — logically follows the standalone rendering work and requires Phase 22's populated catalog to be meaningful
- [v6.0 Research]: Phase 22 pre-flight required before any scan: verify QVCI status (`SELECT 1 FROM DBC.ColumnsJQV WHERE 1=0`), validate LEFT JOIN IS NULL plan with EXPLAIN, confirm system DB exclusion list covers target system's DBC.DatabasesV output
- [Phase 22]: Route ordering: /namespaces/<id>/databases placed before /datasets/<path:id> wildcard to prevent Flask routing conflict
- [Phase 22]: LIKE pattern uses '{database_filter}.%' dot suffix for exact database-name prefix matching, not substring matching
- [Phase 22]: 43 Teradata system databases excluded from user catalog via SYSTEM_DATABASES frozenset with parameterised NOT IN clauses
- [Phase 22]: Default populate_lineage.py run is safe (incremental via NOT EXISTS guards); --full-refresh required for destructive repopulation
- [Phase 22]: QVCI check failure is a warning not a hard failure; pre-flight proceeds regardless to allow population of table columns
- [Phase 22]: Tables fetched per-database with limit:500 on expand (not limit:1000 globally) — each database loads independently, eliminating silent truncation
- [Phase 22]: Server-provided totalCount shown per-database before expand — accurate count without fetching datasets
- [Phase 22]: Removed 13 speculative pagination tests that tested unimplemented pagination UI (pagination-info/prev/next testids never existed in component)
- [Phase 23-02]: has_lineage uses CASE WHEN EXISTS (SELECT 1 FROM OL_COLUMN_LINEAGE cl WHERE TRIM(cl.source_dataset) = TRIM(d.name) OR TRIM(cl.target_dataset) = TRIM(d.name)) — TRIM for Teradata CHAR padding
- [Phase 23-02]: hasLineage is optional (?) in TypeScript type — endpoints not returning it default to undefined; strict === true prevents indicator showing for undefined
- [Phase 23-02]: Indicator positioned after table name inside DatasetItem button, wrapped in Tooltip with 'Has lineage connections'
- [Phase 23-01]: Return {nodes:[],edges:[]} (not DatasetNotFoundError) for datasets with no OL_DATASET_FIELD entries — valid catalog state, not an error
- [Phase 23-01]: Inline banner alongside canvas (not replacing it) — every table browsable; blue color for informational vs red for errors

### Pending Todos

None.

### Blockers/Concerns

- [Phase 22 pre-flight]: QVCI status on target system unknown until live query — if disabled (error 9719), view column types degrade to UNKNOWN; plan to display "—" in UI instead
- [Phase 22 pre-flight]: Full scan runtime unknown until first test run — do not run during business hours; budget for uncertainty

## Session Continuity

Last session: 2026-02-23
Stopped at: Completed 23-01-PLAN.md — standalone table rendering fix executed (2 tasks, 3 files, 33 tests pass).
Resume file: None
