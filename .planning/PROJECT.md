# Lineage Application - Production Readiness

## What This Is

A production-ready Teradata column-level data lineage application with interactive graph visualization, node selection, and detailed metadata panels. The application visualizes data flow between database columns with loading progress feedback, optimized viewport positioning, bidirectional path highlighting, and comprehensive table/view detail inspection capabilities.

## Core Value

The lineage application must be secure and stable for production use - no data exposure through error messages, no unbounded resource consumption, and clear security boundaries documented.

## Requirements

### Validated

<!-- Capabilities delivered and verified -->

**Pre-existing features:**
- ✓ Column-level data lineage visualization with React Flow — existing
- ✓ Recursive CTE-based upstream/downstream lineage traversal — existing
- ✓ Asset browser with hierarchical database/table/column navigation — existing
- ✓ Search functionality across databases, tables, and columns — existing
- ✓ Impact analysis showing downstream dependencies — existing
- ✓ REST API with Chi router following hexagonal architecture — existing
- ✓ Teradata repository with connection management — existing
- ✓ DBQL-based automated lineage extraction — existing
- ✓ Manual lineage mapping capability — existing
- ✓ Frontend with TypeScript, Vite, TanStack Query, Zustand — existing
- ✓ Database test suite (73 tests) — existing
- ✓ Frontend unit tests (260+) and E2E tests (21) — existing

**v1.0 Production Readiness (shipped 2026-01-30):**

*Input Validation:*
- ✓ **VALID-01**: API validates maxDepth parameter (1-20), returns 400 for invalid values — v1.0
- ✓ **VALID-02**: API validates direction parameter (upstream/downstream/both), returns 400 for invalid — v1.0
- ✓ **VALID-03**: Structured error responses with error code, message, request_id — v1.0
- ✓ **VALID-04**: Validation limits configurable via VALIDATION_MAX_DEPTH_LIMIT env vars — v1.0

*Security Hardening:*
- ✓ **SEC-01**: All default credentials removed; requires TERADATA_PASSWORD env var — v1.0
- ✓ **SEC-02**: Application fails fast at startup if credentials missing (exit code 1) — v1.0
- ✓ **SEC-03**: Database errors wrapped in generic "Internal server error" responses — v1.0
- ✓ **SEC-04**: Error responses never expose schema/SQL/connection details (18 pattern check) — v1.0
- ✓ **SEC-05**: Structured logging with log/slog captures error context with stack traces — v1.0
- ✓ **SEC-06**: Security documentation with auth proxy patterns, rate limiting, TLS/CORS requirements — v1.0

*Pagination:*
- ✓ **PAGE-01**: Asset endpoints support limit and offset query parameters — v1.0
- ✓ **PAGE-02**: Default page size 100, max 500; returns 400 for out-of-bounds — v1.0
- ✓ **PAGE-03**: Paginated responses include total_count, has_next, limit, offset metadata — v1.0
- ✓ **PAGE-04**: Database queries use OFFSET/FETCH NEXT at repository layer — v1.0
- ✓ **PAGE-05**: Frontend pagination hooks and UI controls (Pagination component) — v1.0

*DBQL Error Handling:*
- ✓ **DBQL-01**: DBQL extraction detects missing access with actionable error + fallback guidance — v1.0
- ✓ **DBQL-02**: Malformed queries logged and skipped without failing entire extraction — v1.0
- ✓ **DBQL-03**: Error logs include query_id, table_name, error_type for debugging — v1.0
- ✓ **DBQL-04**: Data validation checks completeness; summary reports succeeded/failed/skipped — v1.0

*Testing:*
- ✓ **TEST-01**: 80 validation tests cover edge cases (null, negative, strings, boundaries) — v1.0
- ✓ **TEST-02**: Integration tests verify no sensitive data in error responses — v1.0
- ✓ **TEST-03**: 6 tests verify startup fails with missing credentials — v1.0
- ✓ **TEST-04**: 20+ tests verify pagination bounds enforcement and metadata — v1.0
- ✓ **TEST-05**: 27 tests verify DBQL error handling for all failure modes — v1.0

**v2.0 Configuration Improvements (shipped 2026-01-30):**

*Environment Variable Consolidation:*
- ✓ **ENV-01**: TERADATA_* variables as primary with TD_* as legacy fallback across Python and Go — v2.0
- ✓ **ENV-02**: API_PORT as primary with PORT as fallback for server configuration — v2.0
- ✓ **ENV-03**: Consolidated documentation with deprecation notes in .env.example, CLAUDE.md, user_guide.md — v2.0

*OpenLineage Standard Alignment:*
- ✓ **OL-01**: OL_* database schema following OpenLineage spec v2-0-2 (9 tables) — v2.0
- ✓ **OL-02**: Namespace URI format teradata://{host}:{port} for dataset identification — v2.0
- ✓ **OL-03**: Transformation types mapped to DIRECT/INDIRECT with subtypes — v2.0
- ✓ **OL-04**: v2 API at /api/v2/openlineage/* with namespace, dataset, field, lineage endpoints — v2.0
- ✓ **OL-05**: Full-stack integration (Go backend + Python population + TypeScript frontend) — v2.0
- ✓ **OL-06**: Backwards compatibility maintained (v1 API unchanged, LIN_* tables preserved) — v2.0

**v2.1 Pagination UI - Asset Browser (shipped 2026-01-31):**

*Pagination Component:*
- ✓ **UI-01**: Reusable Pagination component with First/Last/Previous/Next navigation — v2.1
- ✓ **UI-02**: Page size selector (25, 50, 100, 200 items per page) — v2.1
- ✓ **UI-03**: Current page and total pages display — v2.1
- ✓ **UI-04**: "Showing X-Y of Z items" information display — v2.1
- ✓ **UI-05**: Component matches existing application styling — v2.1

*Asset Browser Integration:*
- ✓ **ASSET-01**: Database list pagination with persistent page state — v2.1
- ✓ **ASSET-02**: Table list pagination with persistent page state — v2.1
- ✓ **ASSET-03**: Column list pagination with persistent page state — v2.1
- ✓ **ASSET-04**: Pagination resets to page 1 on context change — v2.1
- ✓ **ASSET-05**: Scroll-into-view behavior on pagination changes — v2.1
- ✓ **ASSET-06**: Integration with usePaginatedAssets hooks — v2.1
- ✓ **ASSET-07**: Unit test coverage for pagination controls — v2.1

**v3.0 Graph Improvements (shipped 2026-01-31):**

*Graph UX - Loading Experience:*
- ✓ **UX-LOAD-01**: User sees progress bar (0-100%) during graph loading — v3.0
- ✓ **UX-LOAD-02**: User sees current stage text ("Loading data...", "Calculating layout...", "Rendering...") — v3.0
- ✓ **UX-LOAD-03**: Progress indicator replaces current spinner — v3.0
- ✓ **UX-LOAD-04**: Progress tracking covers data fetch, ELK layout, and React Flow render stages — v3.0

*Graph UX - Viewport & Zoom:*
- ✓ **UX-VIEW-01**: Graph initial viewport positioned at top-left (not centered) — v3.0
- ✓ **UX-VIEW-02**: Small graphs (<20 nodes) zoom to readable text size — v3.0
- ✓ **UX-VIEW-03**: Large graphs (>50 nodes) fit more nodes on screen with smaller zoom — v3.0
- ✓ **UX-VIEW-04**: Zoom level balances readability and content visibility — v3.0
- ✓ **UX-VIEW-05**: User can manually adjust zoom after initial fit — v3.0

*Graph UX - Space Optimization:*
- ✓ **UX-SPACE-01**: Node spacing reduced between tables (minimize gaps) — v3.0
- ✓ **UX-SPACE-02**: Layout algorithm configured for compact arrangement — v3.0
- ✓ **UX-SPACE-03**: Column text remains readable at optimized spacing — v3.0
- ✓ **UX-SPACE-04**: Scrolling required only for genuinely large graphs — v3.0

*Graph Correctness - Test Data:*
- ✓ **CORRECT-DATA-01**: Test data includes 3+ cycle patterns (2-node, 3-node, 5-node cycles) — v3.0
- ✓ **CORRECT-DATA-02**: Test data includes 3+ diamond patterns (simple, nested, wide diamonds) — v3.0
- ✓ **CORRECT-DATA-03**: Test data includes fan-out patterns (1->5, 1->10 targets) — v3.0
- ✓ **CORRECT-DATA-04**: Test data includes fan-in patterns (5->1, 10->1 sources) — v3.0
- ✓ **CORRECT-DATA-05**: Test data includes combined patterns (cycle+diamond, fan-out+fan-in) — v3.0

*Graph Correctness - Validation:*
- ✓ **CORRECT-VAL-01**: Integration tests verify cycle detection prevents infinite loops — v3.0
- ✓ **CORRECT-VAL-02**: Tests verify diamond patterns produce single node (no duplication) — v3.0
- ✓ **CORRECT-VAL-03**: Tests verify fan-out patterns include all target nodes — v3.0
- ✓ **CORRECT-VAL-04**: Tests verify fan-in patterns include all source nodes — v3.0
- ✓ **CORRECT-VAL-05**: Tests verify path tracking in CTE works for complex patterns — v3.0
- ✓ **CORRECT-VAL-06**: Tests verify node count matches expected for each pattern — v3.0
- ✓ **CORRECT-VAL-07**: Tests verify edge count matches expected for each pattern — v3.0

*Graph Performance - CTE Optimization:*
- ✓ **PERF-CTE-01**: Benchmark recursive CTE at depths 5, 10, 15, 20 — v3.0
- ✓ **PERF-CTE-02**: Profile identifies performance bottlenecks (path concat, POSITION search) — v3.0
- ✓ **PERF-CTE-03**: Implementation optimizes identified bottlenecks — v3.0
- ✓ **PERF-CTE-04**: Performance tests verify improvement at depth > 10 — v3.0
- ✓ **PERF-CTE-05**: Query hints added for Teradata optimization (LOCKING ROW FOR ACCESS) — v3.0

*Graph Performance - Frontend Rendering:*
- ✓ **PERF-RENDER-01**: Benchmark ELK.js layout time with 50, 100, 200 node graphs — v3.0
- ✓ **PERF-RENDER-02**: Benchmark React Flow render time with 50, 100, 200 node graphs — v3.0
- ✓ **PERF-RENDER-03**: Identify rendering bottlenecks (layout, node creation, edge rendering) — v3.0
- ✓ **PERF-RENDER-04**: Verify `onlyRenderVisibleElements` threshold optimization — v3.0
- ✓ **PERF-RENDER-05**: Test zoom/pan responsiveness with large graphs (target <100ms) — v3.0
- ✓ **PERF-RENDER-06**: Performance tests automated and repeatable — v3.0

## Current Milestone: v4.0 Interactive Graph Experience

**Goal:** Enable users to interact with graph nodes and view detailed metadata about tables and views.

**Target features:**
- Node selection with click interaction
- Bidirectional path highlighting (upstream + downstream lineage)
- Detail panel showing table/view metadata (columns, statistics, DDL)
- Column-level navigation from detail panel to lineage graph

### Active

<!-- Requirements for v4.0 milestone -->

**Graph Interaction:**
- [ ] **SELECT-01**: User can click table/view nodes to select them
- [ ] **SELECT-02**: Selected node highlighted with distinct visual style
- [ ] **SELECT-03**: User can deselect by clicking elsewhere or pressing ESC
- [ ] **SELECT-04**: Multi-select with ctrl/shift key support

**Path Highlighting:**
- [ ] **HIGHLIGHT-01**: Selected node emphasizes entire lineage tree (upstream + downstream)
- [ ] **HIGHLIGHT-02**: Unrelated nodes dimmed/muted during selection
- [ ] **HIGHLIGHT-03**: Connected edges highlighted along with nodes
- [ ] **HIGHLIGHT-04**: Smooth transition animation when selecting/deselecting

**Detail Panel:**
- [ ] **PANEL-01**: Detail panel slides in from right when node selected
- [ ] **PANEL-02**: Panel shows table/view name, type, database context
- [ ] **PANEL-03**: Column list with names, types, nullable indicators
- [ ] **PANEL-04**: Statistics section (row count, size, last modified, owner)
- [ ] **PANEL-05**: DDL section showing view definition SQL and comments
- [ ] **PANEL-06**: Click column in panel navigates to that column's lineage
- [ ] **PANEL-07**: Panel closes when node deselected
- [ ] **PANEL-08**: Panel scrollable for tables with many columns

**Deferred Concerns (Future Milestones):**
- Redis integration or dead code removal
- SQL parser improvements with confidence tracking
- Database extraction hardening
- E2E validation testing
- Secrets vault integration
- Search performance indexes
- Connection pooling configuration
- SQLGlot version pinning
- Selective lineage refresh

### Out of Scope

<!-- Explicitly excluded -->

- Authentication/rate limiting middleware implementation — infrastructure-level handling via proxy/gateway (documented in SECURITY.md)
- Low priority concerns (SQL injection cleanup, test TC-EXT-009, driver selection, module pinning, audit logging, export features, cycle detection) — defer to backlog
- New features or UI enhancements beyond production hardening — focus on stability/security

## Context

**Current State (v3.0 shipped):**
- Production-ready Teradata column-level lineage application with enhanced graph usability and performance
- Go backend: Chi router, hexagonal architecture, slog logging, input validation, v1 + v2 APIs, LOCKING ROW FOR ACCESS CTE optimization
- React frontend: TypeScript, React Flow, TanStack Query hooks, five-stage loading progress, smart viewport positioning, size-aware zoom
- Python DBQL extraction: Continue-on-failure pattern, structured error tracking, OL_* table population, comprehensive test patterns
- Database: LIN_* tables (custom schema) + OL_* tables (OpenLineage spec v2-0-2), 89 TEST_* records for correctness validation
- Test coverage: 73 database tests, 20 API tests, 444+ frontend tests (inc. 32 correctness, 11 viewport, 44 loading), 21 E2E tests, 16 CTE correctness tests
- Security: Structured logging, generic error responses, fail-fast credential validation, SECURITY.md deployment guide
- Configuration: Unified TERADATA_*/API_PORT variables with TD_*/PORT fallbacks for backwards compatibility
- Scalability: Pagination (default 100, max 500), maxDepth limit (1-20 configurable)
- Graph UX: Loading progress with ETA, compact layout (33% spacing reduction), top-left viewport, large graph warnings
- Performance: 19.3% CTE improvement (LOCKING ROW FOR ACCESS), benchmark suites for CTE and rendering, virtualization at 50 nodes

**Milestone v1.0 Stats (Production Readiness):**
- 6 phases, 13 plans completed
- 72 files modified (+12,600 / -355 lines)
- 8 days (2026-01-21 → 2026-01-29)
- 136+ new tests (100% pass rate)
- Git range: `1b9ca2c` → `d281a13`

**Milestone v2.0 Stats (Configuration Improvements):**
- 2 phases, 11 plans completed
- 48 files modified (+8,146 / -153 lines)
- ~2 hours (2026-01-29 19:06 → 21:08)
- 25 commits
- Git range: `b32ef4e` → `28a9efa`

**Milestone v2.1 Stats (Pagination UI - Asset Browser):**
- 2 phases, 5 plans completed
- Files modified: Multiple
- 1 day (2026-01-31)

**Milestone v3.0 Stats (Graph Improvements):**
- 6 phases, 11 plans completed
- 53 files modified (+9,538 / -290 lines)
- ~2.5 hours (2026-01-31 13:54 → 16:29)
- 103 new tests (44 loading, 11 viewport, 32 correctness frontend, 16 correctness database)
- Git range: `ac6893e` → `305f2c4`

**Technical Debt:**
- Pagination bounds hardcoded (not configurable via env vars like validation bounds) — LOW priority, defaults safe
- SetPaginationConfig not called in main.go — LOW priority, follows validation pattern

**Deployment Assumptions:**
- Application deployed behind authentication proxy or within internal network
- Rate limiting handled at infrastructure layer (API gateway, load balancer)
- Secrets management via environment variables with OS-level protection
- HTTPS/TLS 1.2+ with security headers (HSTS, X-Content-Type-Options, X-Frame-Options, etc.)

**Known Issues:**
- 5 high-priority concerns remain (Redis integration, SQL parser improvements, extraction brittleness, E2E validation, secrets vault)
- 4 medium-priority concerns remain (search performance, connection pooling, SQLGlot pinning, lineage refresh)
- ✓ Graph correctness validated in v3.0 (removed from concerns)
- ✓ CTE performance optimized in v3.0 (removed from concerns)
- ✓ Large graph testing completed in v3.0 (removed from concerns)

## Constraints

- **Backwards Compatibility**: Breaking changes acceptable; frontend and backend maintained together
- **Testing**: All requirements must have automated tests (unit/integration/E2E)
- **Approach**: Fix one concern at a time with atomic commits and focused plans
- **Performance**: maxDepth limited to 20 to prevent expensive recursive CTE queries (configurable via VALIDATION_MAX_DEPTH_LIMIT)
- **Scalability**: Pagination default page size of 100, max 500 (balanced for UI and API performance)
- **Security**: All errors must use generic responses; no sensitive data in error messages

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Document auth/rate limiting instead of implementing | Assumes deployment behind auth proxy or internal network; avoids premature security implementation | ✓ Complete - SECURITY.md provides deployment patterns (Traefik, Nginx, K8s examples) |
| Fix one concern at a time with tests | Ensures each fix is verifiable and atomic commits maintain clear history | ✓ Complete - 13 plans with 136+ tests |
| MaxDepth limit of 20 | Conservative limit prevents performance issues on large lineage graphs per CONCERNS.md guidance (20-50 range) | ✓ Complete - Configurable via VALIDATION_MAX_DEPTH_LIMIT |
| Pagination page size of 100 | Balanced between UI usability and API payload size; within CONCERNS.md guidance (50-500 range) | ✓ Complete - Default 100, max 500 enforced |
| Breaking changes acceptable | Simplifies fixes; frontend and backend maintained together in same repo | ✓ Complete - Frontend updated with backend changes (pagination DTOs, error types) |
| Fix order: error handling → security → validation → pagination → DBQL | Dependencies: logging infrastructure first, then credentials, then validation pattern, then scale features | ✓ Complete - Phases 1-6 followed dependency order |
| Use slog (Go 1.21+ stdlib) for logging | Standard library, future-proof, JSON structured logging with stack traces | ✓ Complete - All handlers use slog.ErrorContext with logging.CaptureStack() |
| Pagination bounds hardcoded (not env configurable) | Acceptable tech debt - system works correctly with safe defaults (100/500) | ⚠️ Tech Debt - Consider adding PAGINATION_MAX_LIMIT env vars for consistency with validation pattern |
| Standardize on TERADATA_* as primary env vars (v2.0) | Clear naming convention, backwards compatible with TD_* fallbacks | ✓ Complete - Python and Go both use priority lookup pattern |
| Implement OpenLineage spec v2-0-2 exactly (v2.0) | Future-proof interoperability with external lineage tools, industry standard | ✓ Complete - OL_* schema + v2 API endpoints |
| Create OL_* alongside LIN_* tables (v2.0) | Backwards compatibility, gradual migration path, no breaking changes | ✓ Complete - Both schemas coexist, v1 API unchanged |
| Expose v2 API at /api/v2/openlineage/* (v2.0) | API versioning, non-breaking change, clear separation of concerns | ✓ Complete - v1 and v2 routes registered in same router |
| Five-stage loading progress (v3.0) | Clear user feedback on data fetch, layout, and render operations | ✓ Complete - Progress bar with stage text and ETA display |
| Top-left viewport positioning (v3.0) | Show root/source nodes first instead of centering entire graph | ✓ Complete - Users see starting point immediately |
| Size-aware zoom (v3.0) | Balance readability (small graphs 1.0x) and overview (large graphs 0.5x) | ✓ Complete - Interpolated zoom based on node count |
| 33% spacing reduction (v3.0) | Fit more content on screen without sacrificing readability | ✓ Complete - nodeSpacing 60→40, layerSpacing 150→100 |
| LOCKING ROW FOR ACCESS hint (v3.0) | Reduce lock contention for read-heavy CTE queries | ✓ Complete - 19.3% performance improvement verified |
| Virtualization at 50 nodes (v3.0) | Balance small graph simplicity with large graph performance | ✓ Complete - onlyRenderVisibleElements threshold verified optimal |
| Comprehensive test patterns (v3.0) | Validate correctness with cycles, diamonds, fans, combined scenarios | ✓ Complete - 89 TEST_* records, 48 passing correctness tests |

---
*Last updated: 2026-02-01 after v4.0 milestone initialization*
