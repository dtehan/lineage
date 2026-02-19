# Lineage - Column-Level Data Lineage for Teradata

## What This Is

A column-level data lineage application for Teradata databases that visualizes data flow between database columns. Users can browse databases/tables/columns, view upstream and downstream lineage graphs, and perform impact analysis for change management. Built with Python Flask backend, React TypeScript frontend, and OpenLineage-aligned schema.

## Core Value

Enable accurate impact analysis for database changes by visualizing complete column-level lineage across Teradata databases.

## Current State

**Shipped:** v2.0 Performance Optimization (Feb 16, 2026)

**What's working:**
- **Performance Optimized:** Database query optimizations (composite indexes, statistics, LOCKING hints), Web Worker-based graph layout (eliminating UI freeze), Redis caching layer with stampede prevention
- **Impact Analysis:** Complete downstream impact visualization with depth indicators, column counts, and TanStack Table UI
- **Structured Observability:** Exception hierarchy with correlation IDs, dual-sink JSON logging (stdout + rotating file)
- **Maintainable Architecture:** Service/repository layers, 3 shared CTE functions, 77-line application factory (down from 1454 lines)
- **Production Ready:** 374 tests passing (73 DB + 20 API + 260+ frontend + 21 E2E), graceful degradation patterns

## Current Milestone: v3.0 Wildcard Expansion

**Goal:** Enable complete column-level lineage capture for SQL queries using wildcard syntax.

**Target features:**
- Expand `*` wildcards to actual column names during DBQL extraction
- Support INSERT INTO ... SELECT * patterns
- Support CREATE TABLE AS with wildcards
- Support qualified wildcards (t1.*) in joins
- Support Teradata's SELECT * EXCEPT syntax
- Generate DIRECT transformation lineage for matched column pairs

## Next Milestone Goals

**Future considerations:**
- Performance Validation: Automated CI benchmarking and regression detection
- Security Hardening: Authentication, rate limiting, input validation for multi-user deployment
- Feature Expansion: Version tracking, batch operations, data quality metrics

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

**v1.0 Requirements:**
- ✓ Impact Analysis feature fully functional — v1.0
- ✓ Proper exception handling with logging across all API endpoints — v1.0
- ✓ Single consolidated SQL parser module — v1.0
- ✓ Backend code organized into service/repository layers — v1.0
- ✓ Statistics endpoint errors properly logged and communicated — v1.0
- ✓ View SQL truncation warnings visible to users — v1.0

**v2.0 Requirements (17/21 satisfied):**
- ✓ Composite indexes on OL_COLUMN_LINEAGE join column pairs — v2.0
- ✓ Statistics collection for optimizer usage — v2.0
- ✓ LOCKING ROW FOR ACCESS hints in all CTE queries — v2.0
- ✓ VARCHAR path column optimization (4000/10000 → 500 bytes) — v2.0
- ✓ ELKjs layout computation offloaded to Web Worker — v2.0
- ✓ React Profiler instrumentation for re-render tracking — v2.0
- ✓ CSS transition disabling for large graphs (>200 nodes) — v2.0
- ✓ Progressive loading states (fetching→layout→rendering→complete) — v2.0
- ✓ Redis cache-aside pattern on LineageRepository — v2.0
- ✓ Hierarchical cache keys with pattern-based invalidation — v2.0
- ✓ Stampede prevention with distributed locks — v2.0
- ✓ Cache management API (/invalidate, /stats) for ETL integration — v2.0
- ✓ Graceful degradation when Redis unavailable — v2.0
- ⚠️ Query execution time <15s (requires production data validation) — v2.0
- ⚠️ Integer-based cycle detection (partial: UUID lineage_ids prevent full optimization) — v2.0
- ⚠️ Cache hit rate >70% (requires production monitoring) — v2.0
- ⚠️ Repeated queries <2s (requires production timing measurement) — v2.0

### Active

<!-- Current scope. Building toward these. -->

**v3.0 Wildcard Expansion:**
- To be defined in REQUIREMENTS.md

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- Security hardening (auth, rate limiting, input validation) — Defer to future milestone; internal tool usage only for now
- Missing features (version tracking, batch operations, quality metrics) — Defer to future milestone; focus on performance first
- Test coverage expansion — Will add tests as part of implementation but not as separate initiative

## Context

**Codebase State (v2.0):**
- Backend: Python Flask with layered architecture (repositories, services, blueprints)
- Frontend: React 18 + TypeScript + React Flow + TanStack Query/Table
- Database: Teradata with OpenLineage schema (OL_* tables) + 9 indexes on OL_COLUMN_LINEAGE
- Caching: Redis 7.0.1 with Flask-Caching 2.3.1 (cache-aside pattern, stampede prevention)
- LOC: ~4,920 Python backend + ~440K total
- Testing: 374 tests passing (73 DB + 20 API + 260+ frontend + 21 E2E)

**Technical Stack:**
- OpenLineage spec v2-0-2 implementation
- DBQL-based lineage extraction using SQLGlot parser
- Recursive CTEs with composite index optimization, statistics collection, LOCKING hints
- React Flow + ELKjs (Web Worker) for non-blocking graph layout
- Loguru for structured JSON logging with correlation IDs
- Redis cache-aside with hierarchical keys and distributed lock stampede prevention

**Recent Changes (v2.0):**
- **Database Layer:** Composite secondary indexes on (target_dataset, target_field) and (source_dataset, source_field), VARCHAR(500) path optimization, LOCKING ROW FOR ACCESS for concurrent queries
- **Frontend Layer:** ELKjs offloaded to Web Worker (600-node graphs in 142ms), React Profiler instrumentation, CSS transition disabling for >200 nodes
- **Caching Layer:** Redis cache-aside on all 3 LineageRepository methods, stampede prevention with redis-lock, pattern-based invalidation (POST /invalidate), cache monitoring (GET /stats)
- **Testing:** All 374 tests maintained passing throughout optimization work
- **Integration:** 15/15 integration points verified, 5/5 E2E user flows operational

## Constraints

- **Tech Stack**: Python Flask, React TypeScript, Teradata — No framework changes
- **Database**: Must maintain OpenLineage schema compatibility — No breaking changes to OL_* tables
- **Testing**: All changes must maintain existing test coverage — Tests should pass before commits
- **QVCI**: Teradata QVCI must be enabled — Required for DBC.ColumnsJQV queries

## Key Decisions

<!-- Decisions that constrain future work. Add throughout project lifecycle. -->

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| OpenLineage schema alignment | Industry standard for lineage metadata; enables future tool integration | ✓ Good — Enables interoperability |
| DBQL-based extraction over SQL parsing | More reliable; uses Teradata's own query logs rather than parsing SQL strings | ✓ Good — Accurate lineage |
| React Flow for graph visualization | Best-in-class React graph library; handles auto-layout and interactivity | ✓ Good — Excellent UX |
| Defer security to future milestone | Internal tool; focus on performance before hardening | ✓ Good — Enabled rapid v2.0 delivery |
| Repository pattern for data access | Extract duplicate CTEs, enable testing, separate concerns | ✓ Good — Reduced 1454-line file to 77 lines |
| Domain exception hierarchy | Map exceptions to HTTP status codes, preserve error contract | ✓ Good — Clean error handling |
| Loguru for structured logging | JSON logs with correlation IDs for observability | ✓ Good — Production-ready logging |
| TanStack Table for Impact Analysis | Sortable, accessible data tables with minimal code | ✓ Good — Rich UX with low overhead |
| Composite indexes on join column pairs (v2.0) | Match exact CTE join patterns for optimizer usage | ✓ Good — Structurally correct, awaiting production validation |
| Statistics collection on indexed columns (v2.0) | Required for cost-based optimizer to choose indexes | ✓ Good — Collected via automated script |
| VARCHAR(500) path optimization (v2.0) | Reduce from 4000/10000 based on baseline max 67 bytes (7.5x margin) | ✓ Good — Reduces CTE memory overhead |
| Keep UUID lineage_ids vs numeric (v2.0) | Integer-based paths blocked by existing UUID schema | ⚠️ Revisit — Non-breaking migration would enable further optimization |
| ELKjs Web Worker with Comlink (v2.0) | Offload layout to background thread, eliminate UI freeze | ✓ Good — 600-node graphs complete in 142ms off main thread |
| Module-level singleton Worker (v2.0) | Prevent Worker thread leaks, follows best practices | ✓ Good — Clean lifecycle management |
| 200-node threshold for transition disabling (v2.0) | Based on Phase 18 benchmarks showing animation jank | ✓ Good — Prevents jank on large graphs |
| Redis cache-aside at repository layer (v2.0) | Cache CTE results (bottleneck), not fast indexed lookups | ✓ Good — Targets actual performance bottleneck |
| Hierarchical cache keys (v2.0) | Enable pattern-based invalidation (dataset/database granularity) | ✓ Good — Supports ETL-triggered cache clearing |
| redis-lock for stampede prevention (v2.0) | Distributed locks prevent concurrent cache misses from overwhelming DB | ✓ Good — Production-safe concurrency pattern |
| SCAN over KEYS for invalidation (v2.0) | Non-blocking iteration vs blocking KEYS * | ✓ Good — Production-safe Redis operations |
| Defer Phase 7 CI automation (v2.0) | Focus on delivering optimizations, defer regression detection automation | ✓ Good — Structural work complete, monitoring can be manual initially |

---
*Last updated: 2026-02-18 after v3.0 milestone started*
