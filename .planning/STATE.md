# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-15)

**Core value:** Enable accurate impact analysis for database changes by visualizing complete column-level lineage across Teradata databases
**Current focus:** Phase 4 - Database Query Optimization

## Current Position

Phase: 5 of 7 (Frontend Rendering Optimization)
Plan: 1 of 3
Status: Complete
Last activity: 2026-02-16 — Completed Phase 5 Plan 01: Web Worker for ELKjs Layout

Progress: [████░░░░░░] 57% (16 of 28 estimated plans complete across all milestones)

## Performance Metrics

**Velocity:**
- Total plans completed: 16 (12 v1.0 + 4 v2.0)
- Average duration: 7.3 min
- Total execution time: 1.98 hours

**By Phase:**

| Phase | Plans | Total    | Avg/Plan  |
|-------|-------|----------|-----------|
| 01    | 6     | 86.0 min | 14.3 min  |
| 02    | 4     | 8.0 min  | 2.0 min   |
| 03    | 2     | 4.9 min  | 2.5 min   |
| 04    | 3     | 13.0 min | 4.3 min   |
| 05    | 1     | 5.0 min  | 5.0 min   |

**Recent Trend:**
- Last 6 plans: 03-02 (2.3 min), 02-04 (1.0 min), 04-01 (4.5 min), 04-02 (3.7 min), 04-03 (4.8 min), 05-01 (5.0 min)
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
- [Phase 04]: Reduced VARCHAR path from 4000/10000 to 500 bytes based on baseline measurements (max 67 bytes, 7.5x safety margin)
- [Phase 04]: Applied LOCKING ROW FOR ACCESS to all lineage queries as default behavior for concurrent access
- [Phase 04]: Deferred index usage validation to production (test data too small for realistic cost-based optimizer analysis)
- [Phase 04]: Accepted structural correctness over measurable speedup for test environment (89-row dataset insufficient for optimizer to use indexes)
- [Phase 04]: Chose VARCHAR(500) optimization over numeric lineage_id conversion (UUID-based IDs prevent integer path optimization without schema change)
- [Phase 05]: Use Comlink for Worker communication (type-safe API, automatic structured cloning)
- [Phase 05]: Create Worker as module-level singleton (prevents Worker thread leaks, follows best practices)
- [Phase 05]: Remove onProgress callback from Worker (functions not serializable via structured clone)
- [Phase 05]: Use bundled ELK in Worker, not Worker-in-Worker pattern (Worker IS the offloaded thread)
- [Phase 05]: Mock Worker and Comlink in tests (jsdom doesn't support Workers)

### Pending Todos

None yet.

### Blockers/Concerns

**v2.0 Performance Optimization:**
- Test data (89 rows) insufficient to measure index optimization impact - need production volume
- EXPLAIN shows full table scans for test data (correct optimizer behavior, deferred to production validation)
- Optimal cache TTL unknown — need real ETL schedule and usage patterns (Phase 6)
- Path VARCHAR optimized to 500 bytes (was 4000/10000) - completed Phase 04 Plan 02

### Codebase Insights
- OpenLineage schema (OL_* tables) aligned with spec v2-0-2
- Recursive CTEs handle lineage traversal with path-based cycle detection
- Frontend uses React Flow 12.0 + ELKjs for graph layout
- DBQL extraction via SQLGlot for Teradata SQL parsing
- 16 CTE correctness tests validate lineage traversal (CYCLE5_TEST, NESTED_DIAMOND, FANOUT10_TEST)
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
- Composite indexes structurally correct but not used on 89-row test data (cost-based optimizer behavior - Phase 04)
- collect_statistics.py automates statistics collection on indexed columns (Phase 04)
- All lineage CTE queries use LOCKING ROW FOR ACCESS for concurrent access (Phase 04 Plan 02)
- Path columns optimized to VARCHAR(500) based on baseline measurements (Phase 04 Plan 02)
- Phase 04 achieved structural correctness (indexes, statistics, locking) with production validation deferred
- ELKjs layout computation now runs in Web Worker off main thread (Phase 05 Plan 01)
- Comlink 4.4.2 provides type-safe Worker communication via structured cloning (Phase 05 Plan 01)
- useLayoutWorker hook wraps singleton Worker instance (created once at module level, not per-render)
- Worker mock in tests calls real layoutGraph function (jsdom doesn't support Workers)
- Production build bundles Worker as separate 1.4MB chunk (includes ELKjs)

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

Last session: 2026-02-16 (Phase 05 Frontend Rendering Optimization)
Stopped at: Completed 05-01-PLAN.md (Web Worker for ELKjs Layout)
Resume file: None

**Milestone v1.0 Complete:** 3 phases, 12 plans shipped (2026-02-15)
**Milestone v2.0 In Progress:** Phase 05 started (1/3 plans complete)

---
*State initialized: 2026-02-14*
*Last updated: 2026-02-16 (Phase 05-01 complete - Web Worker for ELKjs Layout)*
