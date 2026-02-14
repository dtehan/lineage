# Project Research Summary

**Project:** Teradata Data Lineage Application - Impact Analysis & Backend Refactoring
**Domain:** Enterprise Data Governance (Lineage Analysis)
**Researched:** 2026-02-13
**Confidence:** HIGH

## Executive Summary

This project enhances an existing Teradata column-level lineage application by adding Impact Analysis capabilities and refactoring a 1454-line monolithic Flask backend into a service/repository architecture. The application helps data engineers understand downstream dependencies before making schema changes, preventing production breaks through blast radius analysis.

Research reveals this is a classic data governance tool expansion requiring careful incremental refactoring. The recommended approach is three-phase: (1) extract shared lineage traversal logic and implement Impact Analysis, (2) migrate exception handling to structured logging with middleware-based error responses, and (3) consolidate duplicate SQL parsers while preserving DBQL extraction. The critical risk is breaking existing functionality during refactoring - the codebase has 73 passing database tests and 20 API tests that must continue passing. The mitigation is strangler fig pattern: small, tested commits with characterization tests before extraction.

The application already has strong foundations (recursive CTE lineage traversal, OpenLineage schema, React Flow visualization, TanStack Query integration). Impact Analysis reuses this infrastructure rather than building from scratch. The key architectural insight is that Impact Analysis is downstream lineage traversal plus aggregation - not a separate feature requiring new queries.

## Key Findings

### Recommended Stack

The recommended stack focuses on minimal new dependencies with maximum leverage of existing patterns. Core additions are loguru for structured logging (replacing print statements and traceback), pytest-mock/pytest-flask for service layer testing, and TanStack Table for Impact Analysis UI. Notably, the research explicitly recommends AGAINST adding a dependency injection framework (Flask-Injector, python-dependency-injector) - the application size doesn't justify the complexity, and Flask's request context makes manual dependency injection via factory functions sufficient.

**Core technologies:**
- **loguru (>=0.7.3)**: Structured logging with zero-config JSON output - replaces bare exception handlers with proper context capture while avoiding stdlib logging complexity
- **Flask Blueprints (stdlib)**: Modular application structure for service/repository pattern - official Flask pattern with zero dependencies
- **TanStack Table (^8.21.3)**: Headless data table for Impact Analysis UI - ecosystem consistency with existing TanStack Query, no charting library needed (Impact Analysis is tabular data only)
- **pytest-mock (>=3.15.1)**: Service layer unit tests with automatic cleanup - mock repositories without manual teardown
- **NO new frameworks**: Explicitly avoid SQLAlchemy (raw teradatasql driver works), Flask-Injector (overkill), recharts/visx (no charts needed)

**Critical version notes:**
- Application already uses Flask >=3.0.0, React 18.2.0, Python >=3.5
- loguru compatible with existing teradatasql driver (no conflicts)
- TanStack Table v8 is successor to deprecated react-table v7

### Expected Features

Impact Analysis is fundamentally a specialized view of existing lineage data, not a separate system. Users expect three categories of features: operational necessities (downstream impact list, direct vs indirect classification, column-level granularity), visibility enhancements (error states, retry mechanisms, loading contexts), and secondary conveniences (depth filtering, transformation type breakdown, export reports).

**Must have (table stakes):**
- **Downstream Impact List** - Shows what breaks when you change a column (core deliverable)
- **Direct vs Indirect Dependencies** - Visual distinction and depth calculation (standard dependency analysis pattern)
- **Column-Level Impact** - Count affected columns per table, not just table-level (differentiator for column-level lineage tools)
- **Affected Asset Count Summary** - Blast radius quantification (tables/columns/databases impacted)
- **Error State Handling** - Graceful degradation with inline errors and retry buttons (already implemented in DDLTab.tsx pattern)

**Should have (competitive):**
- **Depth-Based Filtering** - Control blast radius scope via maxDepth slider (API already supports, just add UI control)
- **Transformation Type Breakdown** - Show HOW data flows (IDENTITY, AGGREGATION, JOIN) from existing OL_COLUMN_LINEAGE.transformation_type field
- **Export Impact Report** - CSV/PDF for stakeholder communication (deferred to Phase 3)
- **Impact Severity Scoring** - Classify assets as CRITICAL/MEDIUM/LOW based on downstream consumer count (deferred)

**Defer (v2+):**
- **What-If Analysis Preview** - Simulate impact without persisting changes (high complexity, requires separate graph computation)
- **Real-Time Lineage Sync** - Change detection on DBC views (out of scope, requires event streams)
- **Affected Job/Process Identification** - Map to OL_JOB/OL_RUN tables (medium complexity, OL_JOB not fully utilized yet)
- **Change History Tracking** - Lineage drift detection (requires historical snapshots)

### Architecture Approach

The recommended architecture is three-layer separation of concerns: Routes (Flask HTTP handling), Services (business logic orchestration), Repositories (Teradata SQL execution). This is NOT a ground-up rewrite - it's incremental extraction from the existing 1454-line python_server.py using strangler fig pattern. The key insight is that Impact Analysis doesn't need new SQL queries; it reuses existing recursive CTE lineage traversal with downstream direction and adds post-processing (BFS depth calculation, database/depth grouping, criticality scoring).

**Major components:**
1. **Routes Layer (api/routes/)** - Thin controllers for HTTP validation, parameter parsing, error-to-HTTP mapping - delegates to services
2. **Service Layer (services/)** - Business logic and orchestration: lineage_service (graph building), dataset_service (metadata retrieval), impact_service (aggregation and scoring)
3. **Repository Layer (repositories/)** - Teradata SQL execution: recursive CTEs, DBC view queries, connection pooling - abstracts database from services
4. **Domain Layer (domain/)** - Core models (LineageNode, LineageEdge, LineageGraph) and domain exceptions (DatasetNotFoundError, LineageTraversalError) - no dependencies on Flask or database
5. **Middleware (api/middleware/)** - Centralized exception handling with structured logging, correlation IDs, and consistent error responses

**Critical architectural constraints:**
- MUST maintain backward compatibility with existing `/api/v2/openlineage/*` endpoints (frontend depends on response format)
- SQL parser consolidation moves `database/scripts/populate/sql_parser.py` to `lineage-api/utils/sql_parser.py` (delete duplicate in `database/archive/`)
- Exception handling migration MUST preserve `{"error": string}` response contract (frontend hardcodes this field name)
- All lineage queries (column, table, database, impact) MUST use shared recursive CTE logic (avoid duplicate cycle detection bugs)

### Critical Pitfalls

Research identified eight critical pitfalls with specific mitigation strategies. The most dangerous is duplicate cycle detection logic - if Impact Analysis writes separate recursive CTEs instead of reusing existing traversal, it will produce inconsistent results on circular dependencies. Second highest risk is breaking frontend error response contract during exception handling migration - changing JSON schema breaks all TanStack Query error displays. Third is fixture-based testing hiding DBQL integration bugs - production lineage can fail silently while all tests pass.

1. **Duplicate Cycle Detection Logic** - Impact Analysis must reuse existing recursive CTE functions, not reimplement cycle detection separately; integration test must verify identical graph structure for same column
2. **Breaking Frontend Error Response Contract** - Exception handling MUST preserve `{"error": string}` schema; write contract tests before changing error handlers; ONLY add optional fields, never rename/remove
3. **SQL Parser Consolidation Breaks DBQL** - Verify DBQL extraction works after moving sql_parser.py; run `populate_lineage.py --dbql --dry-run` as regression test; maintain Teradata dialect config separately
4. **Large File Refactoring Without Incremental Testing** - Write characterization tests for ALL endpoints before extracting code; refactor one endpoint at a time, commit; use strangler fig pattern with old code commented until tests pass
5. **Impact Analysis Query Performance Degrades Production** - Test with 1000+ table databases before deploy; always enforce maxDepth limits; add query timeout to Teradata connection; consider pagination for large results

**Prevention summary:**
- Phase 1: Extract shared traversal logic BEFORE implementing Impact Analysis (prevents duplicate cycle detection)
- Phase 2: Write contract tests BEFORE changing exception handlers (prevents breaking frontend)
- Phase 3: Add DBQL integration tests BEFORE consolidating parsers (prevents silent extraction failures)
- All phases: Characterization tests before refactoring, incremental commits, validate after each step

## Implications for Roadmap

Based on research, the milestone should be structured as three sequential phases addressing distinct concerns with clear validation gates. The ordering is dependency-driven: foundation refactoring enables shared logic reuse (prevents pitfall #1), exception handling establishes observability before complex features (prevents pitfall #6), SQL parser consolidation happens last when infrastructure is stable (prevents pitfall #3).

### Phase 1: Foundation Refactoring & Impact Analysis Core
**Rationale:** Extract shared lineage traversal logic BEFORE implementing Impact Analysis to prevent duplicate cycle detection bugs (Pitfall #1). Establish service/repository layering while Impact Analysis is still simple, making it easier to test the refactoring independently.

**Delivers:**
- Repository layer with shared recursive CTE functions (upstream/downstream lineage)
- Service layer (lineage_service, dataset_service, impact_service)
- Flask blueprints replacing direct route handlers
- Impact Analysis API endpoint (`/api/v2/openlineage/lineage/{datasetId}/{fieldName}/impact`)
- Impact Analysis UI with downstream impact list, direct/indirect badges, asset count summary

**Addresses:**
- Downstream Impact List (table stakes)
- Direct vs Indirect Dependencies (table stakes)
- Column-Level Impact (table stakes)
- Affected Asset Count Summary (table stakes)

**Avoids:**
- Pitfall #1 (duplicate cycle detection) via shared traversal functions
- Pitfall #4 (large refactoring) via incremental extraction with tests
- Pitfall #5 (performance) via maxDepth enforcement and production-scale testing

**Validation gates:**
- All 73 database tests pass after repository extraction
- All 20 API tests pass after service layer extraction
- New Impact Analysis test passes (already defined at line 128 of run_api_tests.py)
- Integration test verifies Impact Analysis and column lineage return identical graphs for same column

### Phase 2: Exception Handling & Observability
**Rationale:** Establish structured logging and middleware-based error handling after foundation refactoring (when code is properly layered). This prevents exception context loss during migration (Pitfall #6) and ensures error response contract preservation (Pitfall #2) before adding complex features.

**Delivers:**
- Domain exception classes (DatasetNotFoundError, LineageTraversalError, DatabaseConnectionError)
- Middleware exception handlers with structured logging (loguru with JSON output)
- Correlation IDs for request tracing
- Replacement of all `traceback.print_exc()` with `logger.exception()` calls
- Contract tests validating `{"error": string}` response schema

**Uses:**
- loguru (>=0.7.3) for structured logging
- pytest-mock for exception handler testing
- Flask error handler registration

**Implements:**
- Error state handling (table stakes)
- Retry mechanism (table stakes via existing TanStack Query pattern)
- Loading states with context (table stakes)

**Avoids:**
- Pitfall #2 (breaking frontend contract) via contract tests before changes
- Pitfall #6 (exception context loss) via logger.exception() with correlation IDs
- Security mistakes (logging credentials) via sanitization before logging

**Validation gates:**
- Contract tests pass for all error responses
- Exception logging tests verify stack traces appear in logs
- Frontend error displays still work (manual E2E check)
- No sensitive data in logged exceptions (security review)

### Phase 3: SQL Parser Consolidation & DBQL Validation
**Rationale:** Consolidate duplicate SQL parsers AFTER core functionality and error handling are stable. This allows DBQL extraction regression testing without conflating parser bugs with refactoring bugs (Pitfall #3). Happens last because DBQL extraction is production lineage source - lowest risk tolerance.

**Delivers:**
- sql_parser.py moved to lineage-api/utils/ (delete database/archive/ copy)
- DBQL extraction integration tests using sample query logs
- Updated imports in populate_lineage.py and related scripts
- DBQL regression validation (compare record counts before/after consolidation)

**Addresses:**
- Code consolidation (removes 685-line duplicate file)
- DBQL extraction reliability
- Teradata dialect preservation

**Avoids:**
- Pitfall #3 (breaking DBQL extraction) via regression tests before/after consolidation
- Pitfall #7 (fixture-only testing) via DBQL integration tests with sample logs

**Validation gates:**
- DBQL extraction test passes with sample query logs
- `populate_lineage.py --dbql --dry-run` produces expected record count
- Fixture-based tests still pass (no regression)
- Import paths work in all calling scripts

### Phase Ordering Rationale

- **Foundation first:** Repository extraction establishes shared lineage traversal functions that Impact Analysis depends on - prevents duplicate cycle detection bugs
- **Impact Analysis in Phase 1:** Implements core feature while refactoring is fresh in memory; validates that service/repository layering works for complex recursive CTEs
- **Exception handling second:** Observability layer established after architecture is stable; error logging crucial before adding depth filtering and export features (deferred capabilities)
- **SQL parser last:** Lowest risk tolerance (production lineage source) so happens when infrastructure is proven stable; DBQL extraction bugs only discoverable via integration tests (not unit tests)

**Incremental validation:** Each phase ends with full test suite passing (73 database tests, 20 API tests, new feature tests). No phase proceeds until previous phase validation gates are green.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 1 Impact Analysis:** BFS depth calculation algorithm needs validation for graphs with multiple paths to same node (shortest path vs all paths?)
- **Phase 2 Correlation IDs:** Middleware implementation pattern for Flask (research shows multiple approaches - need specific Flask 3.x example)
- **Phase 3 DBQL Sample Logs:** Creating representative test data requires real Teradata DBQL access - may need production snapshot

Phases with standard patterns (skip research-phase):
- **Phase 1 Repository Pattern:** Well-documented Flask pattern (Cosmic Python, Flask official docs)
- **Phase 2 Domain Exceptions:** Standard Python exception hierarchy with domain-specific subclasses
- **Phase 3 File Consolidation:** Straightforward file move with import updates (no research needed)

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All core recommendations verified with official documentation (loguru PyPI, TanStack Table npm, Flask official docs); version compatibility confirmed |
| Features | HIGH | Impact Analysis requirements validated against industry tools (Atlan, Collibra, DataHub); existing codebase inspection confirms ImpactAnalysis.tsx patterns |
| Architecture | HIGH | Service/repository pattern extensively documented for Flask (Cosmic Python, Real Python, Flask docs); existing code structure analyzed (1454-line python_server.py) |
| Pitfalls | HIGH | All pitfalls sourced from authoritative guides (freeCodeCamp refactoring, OneUpTime exception handling, DataHub SQL parsing); mapped to specific code locations in python_server.py |

**Overall confidence:** HIGH

Research is grounded in official documentation and specific codebase analysis. Stack recommendations are conservative (no experimental libraries). Architecture patterns are proven for Flask applications. Pitfalls are tied to specific risks in this codebase (not generic warnings).

### Gaps to Address

Several areas require validation during implementation:

- **BFS depth calculation for Impact Analysis:** Research shows standard graph BFS algorithms but doesn't address lineage-specific case where multiple transformation paths exist to same column (e.g., via JOIN and separate AGGREGATION). Need to decide: shortest path depth or annotate all paths? Test with diamond-pattern lineage.

- **DBQL extraction test data:** DBQL integration tests require sample query logs with Teradata-specific syntax (QUALIFY, NORMALIZE, etc.). Research shows sqlglot has dialect limitations. Solution: Capture production DBQL sample during Phase 3 planning, anonymize table names, use as regression fixture.

- **Frontend error response evolution:** Research recommends RFC 9457 Problem Details for structured errors but notes it requires coordinated frontend update. Gap: No plan for eventual migration from `{"error": string}` to richer format. Solution: Add RFC 9457 to future roadmap, maintain current contract for this milestone.

- **Performance testing with 1000+ tables:** Research identifies recursive CTE performance as primary bottleneck but provides no Teradata-specific benchmarks. Gap: No baseline for "acceptable" query time. Solution: Establish performance budget during Phase 1 (e.g., Impact Analysis must return in <10s for depth 5, <30s for depth 10), load test with synthetic lineage data before production deploy.

- **maxDepth default values:** Current system uses maxDepth=3 for database lineage, maxDepth=5 for column lineage (observed in existing code). Research doesn't provide guidance on Impact Analysis default. Gap: Unclear if Impact Analysis should default to same maxDepth=5 or higher (10?) since users need full blast radius. Solution: Start with maxDepth=5 matching column lineage, add UI slider, gather user feedback.

## Sources

### Primary (HIGH confidence)
- Flask Official Documentation (Blueprints, Logging, Error Handling) - architectural patterns
- Loguru PyPI (v0.7.3) - structured logging verification
- TanStack Table npm (v8.21.3) - frontend component verification
- Cosmic Python (Repository Pattern, Service Layer) - Flask layering patterns
- OpenLineage Spec v2-0-2 - schema alignment verification (already implemented in codebase)
- pytest-mock PyPI (v3.15.1), pytest-flask PyPI (v1.3.0) - testing library verification
- Existing codebase (python_server.py, ImpactAnalysis.tsx, types/index.ts) - current implementation analysis

### Secondary (MEDIUM confidence)
- Atlan Data Lineage Guide 2026 - Impact Analysis industry patterns
- Collibra Data Lineage Features - competitive feature validation
- DataHub Impact Analysis Docs - architecture patterns for lineage analysis
- Better Stack Python Logging Guides - loguru vs structlog comparison
- Real Python Flask Blueprint Tutorial - implementation examples
- SQLForDevs Cycle Detection - recursive CTE patterns
- freeCodeCamp Refactoring Guide - incremental refactoring strategies

### Tertiary (LOW confidence - needs validation)
- pytest-mock version 3.15.1 (Sep 2025 release) - future version, confirmed available but may have API changes
- Impact Severity Scoring heuristics (>10 consumers = critical) - no industry standard found, requires validation
- BFS depth calculation for multi-path graphs - standard graph algorithms but lineage-specific interpretation unclear
- Query timeout values for Teradata - no Teradata-specific benchmarks found, needs production testing

---
*Research completed: 2026-02-13*
*Ready for roadmap: yes*
