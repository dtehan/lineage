# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-15)

**Core value:** Enable accurate impact analysis for database changes by visualizing complete column-level lineage across Teradata databases
**Current focus:** v1.0 shipped - Planning next milestone

## Current Position

Milestone: v1.0 Code Quality & Missing Features
Status: Shipped (2026-02-15)
Last activity: 2026-02-15 — Milestone v1.0 archived

Progress: [██████████] 100% (v1.0 complete)

## Performance Metrics

**Velocity:**
- Total plans completed: 12
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

### Pending Todos

None yet.

### Blockers/Concerns

**v1.0 Shipped - No active blockers**

**Next Milestone Planning:**
- Define v1.1 or v2.0 goals
- Gather requirements for next iteration
- Consider: Performance optimization, security hardening, or new features

### Codebase Insights
- OpenLineage schema (OL_* tables) aligned with spec v2-0-2
- Recursive CTEs handle lineage traversal with path-based cycle detection
- Frontend uses React Flow + ELKjs for graph layout
- DBQL extraction via SQLGlot for Teradata SQL parsing
- 73 database tests validate CTE correctness and schema integrity
- Flask Blueprints organize routes by feature area (health, openlineage)
- Application Factory pattern enables testable app instances
- python_server.py reduced from 1454 lines to 77 lines via layered architecture
- TanStack Table used for sortable Impact Analysis data display
- 559 total frontend tests (542 existing + 17 new Impact Analysis tests)
- Exception hierarchy (LineageException base, DatasetNotFoundError 404, others 500)
- loguru configured for dual-sink structured JSON logging (stdout + rotating file)
- Rotating file sink at logs/lineage-api.log with 100 MB rotation, 30-day retention, gzip compression
- Sanitization utility filters passwords/tokens from error messages
- Correlation ID middleware generates UUID per request and binds via contextualize()
- Global error handlers catch domain exceptions and return consistent {"error": string} responses
- Services raise DatasetNotFoundError instead of ValueError for middleware handling
- Route handlers contain zero try/except blocks - all exception handling delegated to middleware
- 25 API tests validate endpoints, error contract, and correlation ID propagation
- SQL parser consolidated to single canonical location at lineage-api/utils/sql_parser.py
- TeradataSQLParser class provides SQLGlot-based column-level lineage extraction (684 lines)
- DBQL extraction warns when SQL text exceeds VARCHAR(32000) limit (aggregate + per-query)
- Regression validation script (validate_migration.py) for OL_COLUMN_LINEAGE data integrity
- CLEANUP-05 verified: Backend detects RequestTxtOverFlow, frontend displays yellow truncation banner

### Technical Decisions
- Using DBC.ColumnsJQV (requires QVCI enabled) for complete view column metadata
- DBQL mode is default for production lineage extraction
- Fixtures mode available for demo/testing with hardcoded mappings

### Known Constraints
- QVCI must be enabled on Teradata system for ColumnsJQV queries
- Teradata connection pool size: 1 (single connection per request)
- Recursive CTE depth limited to 5 (default) or 10 (max recommended)

## Session Continuity

Last session: 2026-02-15 (milestone completion)
Stopped at: v1.0 milestone archived and tagged
Resume file: None

**Milestone v1.0 Complete:** 3 phases, 12 plans shipped

---
*State initialized: 2026-02-14*
*Last updated: 2026-02-15 (v1.0 milestone complete)*
