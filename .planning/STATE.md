# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-15)

**Core value:** Enable accurate impact analysis for database changes by visualizing complete column-level lineage across Teradata databases
**Current focus:** Phase 4 - Database Query Optimization

## Current Position

Phase: 4 of 7 (Database Query Optimization)
Plan: 1 of TBD (in progress)
Status: Executing
Last activity: 2026-02-16 — Completed plan 04-01: baseline performance and composite indexes

Progress: [███░░░░░░░] 46% (13 of 28 estimated plans complete across all milestones)

## Performance Metrics

**Velocity:**
- Total plans completed: 13 (12 v1.0 + 1 v2.0)
- Average duration: 8.1 min
- Total execution time: 1.75 hours

**By Phase:**

| Phase | Plans | Total    | Avg/Plan  |
|-------|-------|----------|-----------|
| 01    | 6     | 86.0 min | 14.3 min  |
| 02    | 4     | 8.0 min  | 2.0 min   |
| 03    | 2     | 4.9 min  | 2.5 min   |
| 04    | 1     | 4.5 min  | 4.5 min   |

**Recent Trend:**
- Last 6 plans: 02-02 (2.3 min), 02-03 (2.4 min), 03-01 (2.6 min), 03-02 (2.3 min), 02-04 (1.0 min), 04-01 (4.5 min)
- Trend: Fast autonomous plans (~1-5 min), checkpoint-heavy plans take longer (50+ min)

*Updated after each plan completion*

## Accumulated Context

### Decisions

v1.0 decisions archived. See PROJECT.md Key Decisions table for historical context.

Recent decisions affecting v2.0 work:
- Repository pattern enables performance optimization at data layer (Phase 4, 6)
- Structured logging with correlation IDs supports performance measurement (Phase 4, 5, 6, 7)
- Composite secondary indexes on join column pairs for CTE optimization (Phase 4, Plan 01)
- Statistics collection required immediately after index creation for optimizer usage (Phase 4, Plan 01)
- Kept single-column indexes alongside composite indexes per research guidance (Phase 4, Plan 01)

### Pending Todos

None yet.

### Blockers/Concerns

**v2.0 Performance Optimization:**
- Test data (169 rows) insufficient to measure index optimization impact - need production volume
- Production graph depth distribution unknown — affects path sizing optimization (Phase 4)
- Optimal cache TTL unknown — need real ETL schedule and usage patterns (Phase 6)
- Path VARCHAR(4000) is 60-250x oversized (actual: 16-67 bytes) - optimization opportunity

### Codebase Insights
- OpenLineage schema (OL_* tables) aligned with spec v2-0-2
- Recursive CTEs handle lineage traversal with path-based cycle detection
- Frontend uses React Flow 12.0 + ELKjs for graph layout
- DBQL extraction via SQLGlot for Teradata SQL parsing
- 73 database tests validate CTE correctness (CYCLE5_TEST, NESTED_DIAMOND, FANOUT10_TEST)
- benchmark_cte.py exists for performance measurement (depths, iterations, timing)
- Repository layer (LineageRepository) uses shared CTE functions
- Flask Blueprints organize routes by feature area (health, openlineage)
- Application Factory pattern enables testable app instances
- python_server.py reduced from 1454 lines to 77 lines via layered architecture
- 374 total tests: 73 DB + 20 API + 260+ frontend + 21 E2E
- Exception hierarchy (LineageException base, DatasetNotFoundError 404, others 500)
- loguru configured for dual-sink structured JSON logging (stdout + rotating file)
- Correlation ID middleware generates UUID per request
- OL_COLUMN_LINEAGE has 9 indexes: 6 single-column + 2 composite + 1 primary (Phase 04)
- Composite indexes match exact CTE join patterns: (target_dataset, target_field) and (source_dataset, source_field)
- collect_statistics.py automates statistics collection on indexed columns (Phase 04)

### Technical Decisions
- Using DBC.ColumnsJQV (requires QVCI enabled) for complete view column metadata
- DBQL mode is default for production lineage extraction
- React Flow virtualization threshold: 50 nodes
- Zustand for state management (already optimal pattern)

### Known Constraints
- QVCI must be enabled on Teradata system for ColumnsJQV queries
- Recursive CTE depth limited to 5 (default) or 10 (max recommended)
- Teradata connection pool size: 1 (single connection per request)

## Session Continuity

Last session: 2026-02-16 (Phase 04 Plan 01 execution)
Stopped at: Completed 04-01: baseline performance metrics, composite indexes, statistics collection
Resume file: None

**Milestone v1.0 Complete:** 3 phases, 12 plans shipped (2026-02-15)
**Milestone v2.0 In Progress:** Phase 04 started, 1 plan complete

---
*State initialized: 2026-02-14*
*Last updated: 2026-02-16 (Phase 04 Plan 01 complete)*
