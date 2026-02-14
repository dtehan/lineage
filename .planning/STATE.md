# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-13)

**Core value:** Enable accurate impact analysis for database changes by visualizing complete column-level lineage across Teradata databases
**Current focus:** Phase 1 - Foundation Refactoring & Impact Analysis Core

## Current Position

Phase: 1 of 3 (Foundation Refactoring & Impact Analysis Core)
Plan: 4 of 6 in current phase
Status: Executing
Last activity: 2026-02-14 — Completed plan 01-04 (Impact Analysis API Endpoint and Testing)

Progress: [███████░░░] 67%

## Performance Metrics

**Velocity:**
- Total plans completed: 4
- Average duration: 3.1 min
- Total execution time: 0.21 hours

**By Phase:**

| Phase | Plans | Total    | Avg/Plan |
|-------|-------|----------|----------|
| 01    | 4     | 12.4 min | 3.1 min  |

**Recent Trend:**
- Last 4 plans: 01-01 (3 min), 01-02 (2 min), 01-03 (3.4 min), 01-04 (4.5 min)
- Trend: Stable velocity with slight increase

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- OpenLineage schema alignment (impacts ARCH requirements)
- DBQL-based extraction over SQL parsing (impacts CLEANUP requirements)
- Defer security to v2.0 (allows focus on Impact Analysis and observability)
- [Phase 01-01]: Added TRIM() to CTE join conditions to prevent silent failures on Teradata CHAR columns
- [Phase 01-01]: Include depth column in lineage CTE output for Impact Analysis (Plan 04) BFS traversal
- [Phase 01-02]: Service layer returns dict shapes matching current API responses for backward compatibility
- [Phase 01-02]: ImpactService default max_depth of 5 (conservative, matching column lineage)
- [Phase 01-02]: Binary impact classification: direct (depth=1) vs indirect (depth>1)
- [Phase 01-03]: Single database connection created at app startup and shared across repositories (simpler than per-request pattern)
- [Phase 01-03]: Route Blueprints use module-level service injection via init_services() function
- [Phase 01-03]: Preserved exact error handling contract (ValueError -> 404, all exceptions -> 500)
- [Phase 01-04]: maxDepth parameter clamped between 1 and 10 for performance protection
- [Phase 01-04]: API tests use dynamic data discovery instead of hardcoded values for portability

### Pending Todos

None yet.

### Blockers/Concerns

**Phase 1 Research Flags:**
- BFS depth calculation for multi-path graphs needs validation (multiple transformation paths to same column)
- Performance testing required with 1000+ table databases before production deploy
- maxDepth default value for Impact Analysis unclear (start with 5 matching column lineage)

**Phase 3 Research Flags:**
- DBQL integration tests require sample query logs with Teradata-specific syntax
- May need production DBQL snapshot for representative test data

### Codebase Insights
- OpenLineage schema (OL_* tables) aligned with spec v2-0-2
- Recursive CTEs handle lineage traversal with path-based cycle detection
- Frontend uses React Flow + ELKjs for graph layout
- DBQL extraction via SQLGlot for Teradata SQL parsing
- 73 database tests validate CTE correctness and schema integrity
- Flask Blueprints organize routes by feature area (health, openlineage)
- Application Factory pattern enables testable app instances
- python_server.py reduced from 1454 lines to 77 lines via layered architecture

### Technical Decisions
- Using DBC.ColumnsJQV (requires QVCI enabled) for complete view column metadata
- DBQL mode is default for production lineage extraction
- Fixtures mode available for demo/testing with hardcoded mappings

### Known Constraints
- QVCI must be enabled on Teradata system for ColumnsJQV queries
- Teradata connection pool size: 1 (single connection per request)
- Recursive CTE depth limited to 5 (default) or 10 (max recommended)

## Session Continuity

Last session: 2026-02-14 (plan 01-04 execution)
Stopped at: Completed 01-04-PLAN.md (Impact Analysis API Endpoint and Testing)
Resume file: None

---
*State initialized: 2026-02-14*
*Last updated: 2026-02-14*
