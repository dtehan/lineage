# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-13)

**Core value:** Enable accurate impact analysis for database changes by visualizing complete column-level lineage across Teradata databases
**Current focus:** Phase 3 - SQL Parser Consolidation & DBQL Validation (IN PROGRESS)

## Current Position

Phase: 3 of 3 (SQL Parser Consolidation & DBQL Validation)
Plan: 2 of 2 in current phase
Status: Complete
Last activity: 2026-02-15 — Completed plan 03-02 (DBQL Truncation Warnings and Validation Tooling)

Progress: [█████▓▓▓▓▓] 50%

## Performance Metrics

**Velocity:**
- Total plans completed: 11
- Average duration: 9.0 min
- Total execution time: 1.66 hours

**By Phase:**

| Phase | Plans | Total    | Avg/Plan  |
|-------|-------|----------|-----------|
| 01    | 6     | 86.0 min | 14.3 min  |
| 02    | 3     | 7.0 min  | 2.3 min   |
| 03    | 2     | 4.9 min  | 2.5 min   |

**Recent Trend:**
- Last 6 plans: 01-06 (54 min), 02-01 (2.3 min), 02-02 (2.3 min), 02-03 (2.4 min), 03-01 (2.6 min), 03-02 (2.3 min)
- Trend: Fast autonomous plans (~2-4 min), checkpoint-heavy plans take longer (50+ min)

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
- [Phase 01-05]: ImpactAnalysisApiResponse type name avoids collision with v1 API types
- [Phase 01-05]: Depth badge colors: blue (1), amber (2), slate (3+) for visual hierarchy
- [Phase 01-06]: getAllByText pattern for duplicate table values in test assertions
- [Phase 01-06]: Container queries for summary cards to avoid numeric value collisions in tests
- [Phase 02-01]: Exception hierarchy with status_code attribute for middleware HTTP mapping
- [Phase 02-01]: to_dict() returns only {"error": string} preserving existing API contract
- [Phase 02-01]: Sanitization via regex patterns with conservative filtering (passwords/tokens only)
- [Phase 02-01]: loguru with JSON serialization to stderr only (container-friendly)
- [Phase 02-02]: Use logger.contextualize() instead of logger.bind() for thread-safe correlation ID binding
- [Phase 02-02]: Register error handlers AFTER blueprint registration to ensure coverage of all routes
- [Phase 02-02]: Call configure_logging() FIRST in create_app() to ensure all startup logs use JSON format
- [Phase 02-03]: Removed all route-level try/except blocks - global handlers now catch all exceptions
- [Phase 02-03]: Preserved explicit input validation in routes (search query length check)
- [Phase 03-01]: Chose lineage-api/utils/ as canonical location for shared utilities (aligns with API-centric architecture)
- [Phase 03-01]: Removed try/except import fallback in favor of explicit sys.path configuration
- [Phase 03-02]: Two-tier warning logging for data quality: aggregate count + per-query context with target table
- [Phase 03-02]: Sample-based validation (100 records) with SHA256 hashing for fast regression checks
- [Phase 03-02]: Use LENGTH(s.SQLTextInfo) alongside CAST to detect truncation without re-parsing CLOB

### Pending Todos

None yet.

### Blockers/Concerns

**Phase 2 Complete - No blockers remaining for Phase 2 objectives**

**Human Verification Required for Phase 2:**
- Runtime log format validation (JSON logs to stderr with correlation_id field)
- Correlation ID propagation across concurrent requests
- Sanitization of sensitive data in actual error scenarios
- API test suite execution (TC-API-021 through TC-API-025)
- JSON log parsing validation with observability platforms

**Known Issues:**
- 33 pre-existing test failures in frontend test suite (unrelated to Phase 1/2 work)
- BFS depth calculation for multi-path graphs validated via testing in Plan 01-01
- Performance testing deferred to production environment (1000+ table scale)

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
- TanStack Table used for sortable Impact Analysis data display
- 559 total frontend tests (542 existing + 17 new Impact Analysis tests)
- Exception hierarchy (LineageException base, DatasetNotFoundError 404, others 500)
- loguru configured for structured JSON logging to stderr (container-friendly)
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

Last session: 2026-02-15 (plan 03-02 execution)
Stopped at: Completed 03-02-PLAN.md (DBQL Truncation Warnings and Validation Tooling)
Resume file: None

**Phase 3 Complete:** 2 of 2 plans completed in SQL Parser Consolidation & DBQL Validation phase

---
*State initialized: 2026-02-14*
*Last updated: 2026-02-15 (Plan 03-02 completed)*
