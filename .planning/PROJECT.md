# Lineage - Column-Level Data Lineage for Teradata

## What This Is

A column-level data lineage application for Teradata databases that visualizes data flow between database columns. Users can browse databases/tables/columns, view upstream and downstream lineage graphs, and perform impact analysis for change management. Built with Python Flask backend, React TypeScript frontend, and OpenLineage-aligned schema.

## Core Value

Enable accurate impact analysis for database changes by visualizing complete column-level lineage across Teradata databases.

## Current State

**Shipped:** v3.0 Wildcard Expansion & Graph Enhancements (Feb 19, 2026)

**What's working:**
- **Complete Wildcard Lineage:** `SELECT *`, `t1.*`, `INSERT INTO...SELECT *`, `CREATE TABLE AS SELECT *` all expand to actual column names with confidence scoring (0.70)
- **View Lineage:** Views surface as orange intermediate nodes; ViewLineageExtractor auto-populates column-level lineage from DBC.TablesV.RequestText via SQLGlot; `--views` flag on populate_lineage.py
- **Graph Usability:** Columns sorted alphabetically in all nodes and DetailPanel; cross-database cluster boxes guaranteed non-overlapping with upstream databases on left; multi-select (Cmd+click or toolbar) with group drag
- **Performance Optimized:** Composite indexes, LOCKING hints, Web Worker ELKjs layout (142ms for 600-node graphs), Redis cache-aside with stampede prevention
- **Impact Analysis:** Complete downstream impact visualization with TanStack Table UI
- **Production Ready:** ~16,253 Python + ~23,031 TypeScript LOC; graceful degradation throughout; structured JSON logging

## Next Milestone Goals

**Future considerations:**
- Performance Validation: Automated CI benchmarking and regression detection
- Security Hardening: Authentication, rate limiting, input validation for multi-user deployment
- Feature Expansion: Version tracking, batch operations, data quality metrics
- BigQuery Compatibility: SELECT * EXCEPT, SELECT * REPLACE syntax (tracked as v4.0 requirements)

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

**v3.0 Requirements:**
- ✓ `SELECT *` expanded to actual column names via batch DBC.ColumnsJQV metadata — v3.0
- ✓ Ordinal position matching for `INSERT INTO...SELECT *` and `CREATE TABLE AS SELECT *` — v3.0
- ✓ Qualified wildcards (`t1.*`, `t2.*`) resolved with schema evolution detection — v3.0
- ✓ Per-expansion audit logging (table, column count, timestamp) — v3.0
- ✓ Recursive view expansion (3 levels deep) with circular reference detection — v3.0
- ✓ ViewLineageExtractor: view-chain column lineage from DBC.TablesV.RequestText via SQLGlot — v3.0
- ✓ Cross-database cluster boxes non-overlapping with topological left-to-right ordering — v3.0
- ✓ Multi-select and group move (Cmd+click or toolbar toggle, blue ring, group drag) — v3.0
- ✓ Alphabetical column sort in all graph nodes and DetailPanel — v3.0

### Active

<!-- Current scope. Building toward these. -->

None — all phases complete. Use `/gsd:new-milestone` to start next milestone.

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- Security hardening (auth, rate limiting, input validation) — Defer to future milestone; internal tool usage only for now
- Missing features (version tracking, batch operations, quality metrics) — Defer to future milestone
- Test coverage expansion — Will add tests as part of implementation but not as separate initiative
- SELECT * EXCEPT / SELECT * REPLACE (BigQuery syntax) — Teradata-specific, tracked as v4.0 requirements

## Context

**Codebase State (v3.0):**
- Backend: Python Flask with layered architecture (repositories, services, blueprints) + WildcardResolver + ViewLineageExtractor
- Frontend: React 18 + TypeScript + React Flow + TanStack Query/Table; multi-select with group drag, alphabetical column sort, cluster separation
- Database: Teradata with OpenLineage schema (OL_* tables) + 9 indexes on OL_COLUMN_LINEAGE; views surfaced as intermediate nodes
- Caching: Redis 7.0.1 with Flask-Caching 2.3.1 (cache-aside pattern, stampede prevention)
- LOC: ~16,253 Python + ~23,031 TypeScript
- Testing: 400+ tests (73 DB + 20 API + 260+ frontend + 21 E2E + new wildcard/view tests)

**Technical Stack:**
- OpenLineage spec v2-0-2 implementation
- DBQL-based lineage extraction using SQLGlot parser + WildcardResolver (batch DBC.ColumnsJQV)
- ViewLineageExtractor: SQLGlot parsing of DBC.TablesV.RequestText for view-chain lineage
- Recursive CTEs with composite index optimization, statistics collection, LOCKING hints
- React Flow + ELKjs (Web Worker) for non-blocking graph layout with ELK partitioning
- Loguru for structured JSON logging with correlation IDs
- Redis cache-aside with hierarchical keys and distributed lock stampede prevention

**Recent Changes (v3.0):**
- **Wildcard Layer:** WildcardResolver batch-queries DBC.ColumnsJQV (100 tables/query), in-memory cache, confidence 0.70 for expanded lineage
- **View Layer:** ViewLineageExtractor populates OL_COLUMN_LINEAGE from view SQL; `--views` flag added to populate_lineage.py; views rendered as orange nodes with VIEW badge
- **Graph Layer:** ELK partitioning + topoSortDatabases (Kahn's) + post-layout separateDatabaseClusters() prevents overlap; ClusterBackground padding 20→60; alphabetical sort in layoutEngine + DetailPanel
- **Interaction Layer:** isMultiSelectMode in Zustand store; useMultiSelect hook; Cmd+click or toolbar toggle; blue ring on selected nodes; group drag built-in; Escape to exit

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
| In-memory dict cache for WildcardResolver (v3.0) | Single extraction run lifetime (<5 min); external cache adds complexity with no benefit | ✓ Good — Minimal overhead, no infra dependency |
| Batch size 100 for DBC.ColumnsJQV queries (v3.0) | Prevents query explosion for large DBQL workloads; tunable based on production monitoring | ✓ Good — Safe default with explicit limit |
| Confidence score 0.70 for wildcard-expanded lineage (v3.0) | Reflects expansion uncertainty vs explicit (0.95) and expression (0.85) lineage | ✓ Good — Graduated confidence model |
| Skip multi-table unqualified SELECT * with warning (v3.0) | Ambiguous attribution — fail-safe over guessing wrong source | ✓ Good — Prevents silent incorrect lineage |
| ELK partitioning + post-layout bounding-box shift (v3.0) | Partitioning alone cannot guarantee padded boxes don't overlap at same y-range | ✓ Good — Reliable non-overlap guarantee |
| topoSortDatabases (Kahn's algorithm) for cluster ordering (v3.0) | Users expect upstream databases LEFT per lineage convention; alphabetical ordering violated this | ✓ Good — Intuitive left-to-right data flow |
| multiSelectionKeyCode=null when toolbar multi-select active (v3.0) | RF treats every click as selection toggle without requiring Cmd modifier | ✓ Good — Consistent UX in toolbar mode |
| REPLACE VIEW → CREATE VIEW normalization for SQLGlot (v3.0) | Teradata stores view definitions as REPLACE VIEW in RequestText, SQLGlot needs CREATE VIEW | ✓ Good — Required for correct parsing |

---
*Last updated: 2026-02-19 after v3.0 milestone*
