# Milestones

Project milestone history tracking completed phases and shipped features.

---

## v1.0 Code Quality & Missing Features (Current)

**Status:** Planning
**Started:** 2026-02-13

### Goals
- Implement complete Impact Analysis feature
- Fix exception handling and error reporting
- Clean up tech debt (archived code, parser consolidation)
- Refactor backend for maintainability

### Phases
(To be defined in ROADMAP.md)

---

*Milestone history: 2026-02-13*

## v1.0 Code Quality & Missing Features (Shipped: 2026-02-15)

**Phases completed:** 3 phases, 12 plans

**Delivered:** 70 files modified (+9,173/-2,449 lines), 46 commits over 2 days

**Key accomplishments:**
1. Impact Analysis Feature Complete — Implemented downstream impact visualization with depth indicators, column counts, and TanStack Table UI
2. Repository & Service Layer Architecture — Extracted shared lineage traversal logic, eliminated duplicate CTEs, refactored 1454-line monolith into maintainable layers
3. Structured Exception Handling — Replaced bare exception handlers with domain exception hierarchy and loguru JSON logging with correlation IDs
4. Dual-Sink Observability — Implemented structured logging to stdout + rotating file (100 MB, 30-day retention) for production observability
5. SQL Parser Consolidation — Unified duplicate parsers into single canonical location with DBQL truncation warnings
6. Comprehensive Testing — All 73 database tests, 20 API tests, 260+ frontend tests, and 21 E2E tests passing

---


## v2.0 Performance Optimization (Shipped: 2026-02-16)

**Phases completed:** 3 phases (4-6), 8 plans

**Delivered:** 324 files modified (+44,550/-38,627 lines), 28 commits over 18 days

**Key accomplishments:**
1. Database Query Optimization — Implemented composite secondary indexes on join column pairs, collected statistics for optimizer usage, added LOCKING ROW FOR ACCESS hints, and optimized VARCHAR path columns from 4000/10000 to 500 bytes
2. Frontend Rendering Performance — Offloaded ELKjs layout computation to Web Worker (eliminating 3-5s UI freeze), validated 600-node graphs complete in 142ms, disabled CSS transitions for large graphs (>200 nodes) to prevent animation jank
3. Redis Caching Layer — Implemented cache-aside pattern on all LineageRepository methods with hierarchical keys, added stampede prevention with distributed locks, created cache management API endpoints (/invalidate, /stats) for ETL integration
4. Production-Ready Architecture — All optimizations structurally verified with comprehensive test coverage (374 tests: 73 DB + 20 API + 260+ frontend + 21 E2E), graceful degradation when Redis unavailable
5. Complete System Integration — Verified 15/15 integration points properly wired, 5/5 critical E2E user flows operational, zero broken flows or orphaned code
6. Performance Instrumentation — Established baseline measurement infrastructure (benchmark_cte.py), React Profiler for re-render tracking, cache hit rate monitoring

**Note:** Phase 7 (Performance Validation with CI automation) deferred to future milestone. Database optimization performance targets require production data validation (test data insufficient for realistic optimizer behavior).

---


## v3.0 Wildcard Expansion & Graph Enhancements (Shipped: 2026-02-19)

**Phases completed:** 7 phases (7-13), 13 plans

**Delivered:** 79 files modified (+18,781/-726 lines), 2 days (2026-02-18 → 2026-02-19)

**Key accomplishments:**
1. Wildcard Resolver — `SELECT *` expanded to actual column names via batch DBC.ColumnsJQV with in-memory caching, ordinal-position matching for INSERT INTO, and confidence score 0.70
2. Qualified Wildcard Expansion — `t1.*, t2.*` patterns resolved with schema evolution detection (column count diffing) and per-expansion audit logging
3. Recursive View Expansion — view definitions fetched from DBC.TablesV.RequestText and recursively expanded up to 3 levels deep with circular reference detection and cache reuse
4. ViewLineageExtractor — column-level lineage automatically derived from Teradata view SQL via SQLGlot; `--views` flag on populate_lineage.py enables view-chain lineage population
5. Cross-Database Cluster Separation — ELK partitioning + topological sort (Kahn's algorithm) + post-layout bounding-box shift guarantees non-overlapping cluster boxes with upstream databases on left
6. Multi-Select and Group Move — Cmd+click or toolbar toggle selects multiple table nodes with blue ring; group drag moves selection together; Escape exits cleanly

---


## v4.0 First-Time Load Performance (Shipped: 2026-02-21)

**Phases completed:** 5 phases (14-18), 9 plans

**Delivered:** 71 files modified (+11,996/-1,807 lines), 2 days (2026-02-20 → 2026-02-21)

**Key accomplishments:**
1. In-Memory Graph Engine — networkx DiGraph with BFS traversal replaces recursive CTE database round-trips, serving lineage in <100ms with blue-green swap for zero-downtime rebuilds
2. Three-Layer Cache Invalidation — Single `/cache/invalidate` call clears Redis, rebuilds in-memory graph, and falls back to CTE during rebuild gap
3. Progressive Depth Loading — Depth-1 graph renders instantly via useProgressiveLineage hook, full-depth expands in background with zero layout jitter
4. Full-Stack Observability — Server-Timing headers on all lineage responses, per-stage frontend timing (fetch/layout/render), enhanced graph status endpoint
5. Redis Graph Serialization — Cold restart restores graph from Redis in <1s instead of re-querying Teradata; memory stable across ETL rebuild cycles
6. UAT Validated — 11/11 acceptance tests passed with 0 issues

---


## v5.0 Database Lineage Layout (Shipped: 2026-02-22)

**Phases completed:** 3 phases (19-21), 5 plans

**Delivered:** 34 files modified (+6,659/-1,320 lines), 27 commits over 1 day (2026-02-21 → 2026-02-22)

**Key accomplishments:**
1. O(V+E) Kahn Sort & Deterministic Colors — Fixed quadratic sort degradation via binary-search insertion, replaced iteration-order cluster colors with djb2 hash for stable colors across page refreshes
2. Connected Component Detection — BFS-based partitioning of table adjacency graph into independent lineage chains and isolated tables, enabling per-component topological layering
3. Two-Zone Database Layout — Connected tables flow left-to-right in topological order within each lineage chain; disconnected tables appear in a compact alphabetical grid below, separated by 80px gap
4. ELK Fallback Fix — Enabled separateConnectedComponents on layoutSimpleNodes path with component spacing and 1.7 aspect ratio
5. Isolated Table UX — Canvas section label "Tables without lineage connections (N)", Eye/EyeOff hide-isolated toggle in toolbar, database header count badges for lineage vs isolated tables

---


## v6.0 Full System Catalog (Shipped: 2026-02-23)

**Phases completed:** 2 phases (22-23), 5 plans, 10 tasks

**Delivered:** 37 files modified (+4,966/-1,400 lines), 26 commits over 1 day (2026-02-23)

**Key accomplishments:**
1. Full System Catalog Population — 43 Teradata system databases excluded via SYSTEM_DATABASES frozenset; safe-by-default re-run with `--full-refresh` flag and pre-flight QVCI/coverage checks
2. Per-Database Lazy-Loading API — `GET /databases` endpoint with table/view/total counts via STRTOK; `?database=` filter on datasets using LIKE pattern for exact prefix matching
3. Two-Phase AssetBrowser — Databases list on mount, tables per-database on expand; eliminates silent 1000-row truncation with server-provided totalCount per database
4. Standalone Table Rendering — Valid `{nodes, edges}` response for all catalog tables; inline blue "No lineage connections" banner alongside canvas instead of error state
5. Has-Lineage Indicator — Blue dot per table in Asset Browser distinguishing lineage-connected from catalog-only tables via EXISTS subquery on OL_COLUMN_LINEAGE

---

