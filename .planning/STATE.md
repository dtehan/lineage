# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-15)

**Core value:** Enable accurate impact analysis for database changes by visualizing complete column-level lineage across Teradata databases
**Current focus:** Phase 4 - Database Query Optimization

## Current Position

Phase: 4 of 7 (Database Query Optimization)
Plan: 0 of TBD (planning needed)
Status: Ready to plan
Last activity: 2026-02-15 — v2.0 Performance Optimization milestone roadmap created

Progress: [███░░░░░░░] 43% (12 of 28 estimated plans complete across all milestones)

## Performance Metrics

**Velocity:**
- Total plans completed: 12 (v1.0 milestone)
- Average duration: 8.3 min
- Total execution time: 1.67 hours

**By Phase:**

| Phase | Plans | Total    | Avg/Plan  |
|-------|-------|----------|-----------|
| 01    | 6     | 86.0 min | 14.3 min  |
| 02    | 4     | 8.0 min  | 2.0 min   |
| 03    | 2     | 4.9 min  | 2.5 min   |

**Recent Trend:**
- Last 6 plans: 02-01 (2.3 min), 02-02 (2.3 min), 02-03 (2.4 min), 03-01 (2.6 min), 03-02 (2.3 min), 02-04 (1.0 min)
- Trend: Fast autonomous plans (~1-3 min), checkpoint-heavy plans take longer (50+ min)

*Updated after each plan completion*

## Accumulated Context

### Decisions

v1.0 decisions archived. See PROJECT.md Key Decisions table for historical context.

Recent decisions affecting v2.0 work:
- Repository pattern enables performance optimization at data layer (Phase 4, 6)
- Structured logging with correlation IDs supports performance measurement (Phase 4, 5, 6, 7)

### Pending Todos

None yet.

### Blockers/Concerns

**v2.0 Performance Optimization:**
- Actual OL_COLUMN_LINEAGE row count unknown — affects index strategy (Phase 4)
- Production graph depth distribution unknown — affects path sizing optimization (Phase 4)
- Optimal cache TTL unknown — need real ETL schedule and usage patterns (Phase 6)

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

Last session: 2026-02-15 (v2.0 roadmap creation)
Stopped at: Roadmap and STATE.md created for v2.0 milestone, ready to plan Phase 4
Resume file: None

**Milestone v1.0 Complete:** 3 phases, 12 plans shipped (2026-02-15)
**Milestone v2.0 Started:** 4 phases planned, 21 requirements mapped

---
*State initialized: 2026-02-14*
*Last updated: 2026-02-15 (v2.0 milestone roadmap created)*
