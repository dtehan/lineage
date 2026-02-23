# Lineage - Column-Level Data Lineage for Teradata

## What This Is

A column-level data lineage application for Teradata databases that visualizes data flow between database columns. Users can browse databases/tables/columns, view upstream and downstream lineage graphs, and perform impact analysis for change management. Built with Python Flask backend, React TypeScript frontend, and OpenLineage-aligned schema.

## Core Value

Enable accurate impact analysis for database changes by visualizing complete column-level lineage across Teradata databases.

## Current Milestone: v6.0 Full System Catalog

**Goal:** Make every database, table, view, and column on the Teradata system browsable and renderable — even without lineage data.

**Target features:**
- Complete metadata population of all system objects into OL_* tables
- Standalone table rendering for tables with no lineage relationships

## Current State

**Shipped:** v5.0 Database Lineage Layout (Feb 22, 2026)

**What's working:**
- **Database Lineage Layout:** Connected tables flow left-to-right in topological order; disconnected tables in compact alphabetical grid; section label + hide toggle + header count badges
- **In-Memory Graph Engine:** networkx DiGraph with BFS traversal serves all lineage in <100ms; blue-green swap for zero-downtime rebuilds; CTE fallback during warm-up
- **Progressive Depth Loading:** Depth-1 graph renders instantly, full-depth expands in background with zero layout jitter via useProgressiveLineage hook
- **Three-Layer Cache:** Redis cache-aside + in-memory graph + CTE fallback; single `/cache/invalidate` call clears all layers atomically
- **Full Observability:** Server-Timing headers on all lineage responses; per-stage frontend timing (fetch/layout/render); graph status endpoint with node count, edge count, memory usage
- **Redis Graph Persistence:** Cold restart restores graph from Redis in <1s; memory stable across ETL rebuild cycles
- **Complete Wildcard Lineage:** `SELECT *`, `t1.*`, `INSERT INTO...SELECT *`, `CREATE TABLE AS SELECT *` expand to actual column names with confidence scoring (0.70)
- **View Lineage:** Views surface as orange intermediate nodes; ViewLineageExtractor auto-populates column-level lineage from DBC.TablesV.RequestText via SQLGlot
- **Graph Usability:** Alphabetical column sort, non-overlapping cluster boxes, multi-select with group drag, draggable minimap viewport
- **Impact Analysis:** Complete downstream impact visualization with TanStack Table UI
- **Production Ready:** ~18,616 Python + ~24,000+ TypeScript LOC; graceful degradation throughout; structured JSON logging

## Future Considerations

- Security Hardening: Authentication, rate limiting, input validation for multi-user deployment
- Feature Expansion: Version tracking, batch operations, data quality metrics
- Production Validation: CI benchmarking, multi-worker Gunicorn support, load testing
- BigQuery Compatibility: SELECT * EXCEPT, SELECT * REPLACE syntax

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

**v4.0 Requirements (22/22 satisfied):**
- ✓ In-memory graph engine: networkx DiGraph with BFS traversal <100ms, CTE fallback, blue-green swap — v4.0
- ✓ Progressive depth loading: depth-1 instant, full-depth background expand, zero layout jitter — v4.0
- ✓ Three-layer cache invalidation: Redis + in-memory graph + CTE fallback in single operation — v4.0
- ✓ Server-Timing headers on all lineage API responses with BFS/CTE timing — v4.0
- ✓ Graph status endpoint: node count, edge count, last rebuild time, memory usage — v4.0
- ✓ Frontend per-stage timing display (fetch/layout/render) — v4.0
- ✓ Redis graph serialization: cold restart restores in <1s, memory stable across rebuild cycles — v4.0

**v5.0 Requirements (15/15 satisfied):**
- ✓ O(V+E) Kahn sort without sort-per-iteration degradation — v5.0
- ✓ ClusterBackground pre-calculated dimensions (no stale ResizeObserver) — v5.0
- ✓ separateDatabaseClusters handles non-contiguous node groups — v5.0
- ✓ Database lineage layout runs in Web Worker (later removed — direct call faster) — v5.0
- ✓ Direction-change cancellation via generation counter — v5.0
- ✓ Deterministic cluster colors via djb2 hash — v5.0
- ✓ Connected component detection (BFS) — v5.0
- ✓ Connected tables flow left-to-right in topological order — v5.0
- ✓ Disconnected tables in compact alphabetical grid — v5.0
- ✓ No node overlap between connected and disconnected sections — v5.0
- ✓ ELK separateConnectedComponents on layoutSimpleNodes fallback — v5.0
- ✓ Both DatabaseLineageGraph and AllDatabasesLineageGraph benefit — v5.0
- ✓ Section label "Tables without lineage connections (N)" — v5.0
- ✓ Hide-isolated toggle in toolbar — v5.0
- ✓ Header count badges for lineage vs isolated tables — v5.0

### Active

<!-- Current scope. Building toward these. -->

- [ ] Complete metadata population — all databases, tables, views, columns registered in OL_* tables
- [ ] Standalone table rendering — tables with no lineage display as single node with columns

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- Security hardening (auth, rate limiting, input validation) — Defer to future milestone; internal tool usage only for now
- Missing features (version tracking, batch operations, quality metrics) — Defer to future milestone
- Test coverage expansion — Will add tests as part of implementation but not as separate initiative
- SELECT * EXCEPT / SELECT * REPLACE (BigQuery syntax) — Teradata-specific, not applicable
- Data normalization (TRIM removal from CTE joins) — Low impact now that in-memory engine bypasses CTEs; can be done independently later

## Context

**Codebase State (v5.0):**
- Backend: Python Flask with layered architecture (repositories, services, blueprints) + GraphEngine (networkx BFS) + WildcardResolver + ViewLineageExtractor
- Frontend: React 18 + TypeScript + React Flow + TanStack Query/Table; custom topological layout engine with two-zone layout, progressive depth loading, per-stage timing, multi-select with group drag
- Database: Teradata with OpenLineage schema (OL_* tables) + 9 indexes on OL_COLUMN_LINEAGE; views surfaced as intermediate nodes
- Graph Engine: networkx DiGraph with BFS traversal, blue-green swap, CTE fallback, Redis serialization
- Layout Engine: Custom O(V+E) topological sort with per-component layering, isolated grid placement, ELK fallback with separateConnectedComponents
- Caching: Redis 7.0.1 with Flask-Caching 2.3.1 (cache-aside + in-memory graph + CTE fallback)
- LOC: ~18,616 Python + ~24,000+ TypeScript
- Testing: 400+ tests (73 DB + 20 API + 260+ frontend + 21 E2E + 85 layout engine + graph engine + progressive loading tests)

**Technical Stack:**
- OpenLineage spec v2-0-2 implementation
- DBQL-based lineage extraction using SQLGlot parser + WildcardResolver (batch DBC.ColumnsJQV)
- ViewLineageExtractor: SQLGlot parsing of DBC.TablesV.RequestText for view-chain lineage
- In-memory graph engine (networkx DiGraph + BFS) with CTE fallback; recursive CTEs with composite indexes as backup
- React Flow + custom topological layout engine (O(V+E) Kahn sort + per-component layering + isolated grid) with ELK fallback
- Progressive depth loading via TanStack Query enabled chaining
- Server-Timing headers + frontend per-stage timing for full-stack observability
- Loguru for structured JSON logging with correlation IDs
- Redis: cache-aside with hierarchical keys, stampede prevention, graph snapshot persistence

**Recent Changes (v5.0):**
- **Layout Engine:** Custom O(V+E) Kahn sort replacing ELK for database lineage; per-component topological layering via detectConnectedComponents + kahnSort; placeIsolatedGrid for disconnected tables
- **Two-Zone Layout:** Connected tables flow left-to-right in topological order; isolated tables in compact alphabetical grid below with 80px gap separation
- **Deterministic Clusters:** djb2 hash for stable cluster colors; pre-calculated dimensions replacing stale ResizeObserver values
- **UX Polish:** SectionLabelNode canvas label, Eye/EyeOff hide-isolated toggle, header count badges (N in lineage / N isolated)
- **Draggable Minimap:** Shared LineageMiniMap component with pannable/zoomable viewport (standalone phase)

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
| networkx DiGraph over plain dicts (v4.0) | Maintainability over memory; optimize only if production RSS exceeds targets | ✓ Good — BFS/subgraph operations clean and correct |
| Polling over SSE for progressive loading (v4.0) | SSE incompatible with sync Gunicorn workers; polling achieves same UX | ✓ Good — Zero infrastructure risk |
| Blue-green graph swap from day one (v4.0) | Atomically swap reference, never destroy old before new is ready | ✓ Good — Zero-downtime rebuilds |
| Defer ELKjs layout to final depth only (v4.0) | Prevents layout jitter, avoids re-render storm | ✓ Good — No position-stability algorithm needed |
| BFS subgraph reachability over bfs_edges (v4.0) | Correctly returns diamond convergence edges that BFS tree traversal misses | ✓ Good — Matches CTE semantics |
| GRAPH_KEY outside lineage:graph:* namespace (v4.0) | invalidate_all() pattern doesn't accidentally delete engine snapshot | ✓ Good — Clean namespace separation |
| No TTL on Redis graph snapshot (v4.0) | Persists until explicitly invalidated by ETL; routine restarts restore from Redis | ✓ Good — Reliable cold-start behavior |
| Binary-search splice for Kahn sort (v5.0) | Queue stays sorted at O(log n) per push; eliminates O(n log n) re-sort inside while loop | ✓ Good — O(V+E) layout at 400+ nodes |
| djb2 hash for cluster colors (v5.0) | Deterministic unsigned 32-bit; color stable across page refreshes regardless of Map iteration order | ✓ Good — Consistent visual identity |
| Per-component topological layering (v5.0) | Each connected component gets independent Kahn + longest-path; prevents isolated tables at layer 0 | ✓ Good — Correct two-zone separation |
| ELK DisCo explicitly rejected (v5.0) | Known hang risk on dense graphs; custom topological layout is proven and correct | ✓ Good — No hang risk |
| Direct main-thread layout over Worker (v5.0) | Custom O(V+E) layout completes in ~15ms for 10K nodes; Worker overhead unnecessary | ✓ Good — Simpler architecture, no silent failures |
| Render-time filtering for hide toggle (v5.0) | visibleNodes/visibleEdges useMemo avoids expensive layout re-run on toggle | ✓ Good — Instant toggle response |

---
*Last updated: 2026-02-23 after v6.0 milestone start*
