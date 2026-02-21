---
phase: 14-in-memory-graph-engine
plan: 03
subsystem: api
tags: [flask, networkx, bfs, graph-engine, unit-tests, blueprint]

# Dependency graph
requires:
  - phase: 14-02
    provides: GraphEngine singleton with BFS traversal and traverse_upstream/traverse_downstream methods
provides:
  - GET /api/v2/graph/status endpoint returning ready, node_count, edge_count, last_rebuild_time, memory_bytes
  - 20 unit tests for GraphEngine BFS traversal and GraphStore snapshot (no DB required)
  - Fixed BFS diamond traversal: convergence edges now correctly returned via subgraph approach
affects: [lineage-api, ci, monitoring]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Graph status route: Blueprint at /api/v2/graph, single GET /status endpoint delegating to graph_engine.status property"
    - "BFS traversal correctness: reachability-via-subgraph instead of nx.bfs_edges tree traversal — handles diamond convergence edges"
    - "Test injection: directly set engine._store and engine._ready.set() to simulate warm engine without DB connection"

key-files:
  created:
    - lineage-api/routes/graph.py
    - lineage-api/tests/test_graph_engine.py
  modified:
    - lineage-api/python_server.py
    - lineage-api/graph/engine.py

key-decisions:
  - "Subgraph reachability approach for BFS: use single_source_shortest_path_length to find all nodes within max_depth, then return all edges in induced subgraph — correctly handles diamond convergence edges that nx.bfs_edges misses"
  - "20 tests added (3 GraphStore + 17 GraphEngine) covering: status, readiness, linear chains, depth limits, CYCLE5, NESTED_DIAMOND, FANOUT10, edge cases, result format, transformation types, bidirectional traversal"

patterns-established:
  - "Graph route pattern: minimal Blueprint with single endpoint, delegates all logic to engine singleton"
  - "Engine test pattern: make_engine_with_graph() helper bypasses warmup thread by injecting GraphStore directly"

# Metrics
duration: 2min
completed: 2026-02-21
---

# Phase 14 Plan 03: Graph Status Endpoint and BFS Unit Tests Summary

**GET /api/v2/graph/status endpoint registered in Flask, 20 unit tests proving BFS correctness across CYCLE5/NESTED_DIAMOND/FANOUT10 patterns, and bug fix for diamond convergence edge loss in nx.bfs_edges**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-21T00:42:02Z
- **Completed:** 2026-02-21T00:45:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Created `routes/graph.py` Blueprint with `GET /api/v2/graph/status` endpoint exposing `graph_engine.status` as JSON
- Registered `graph_bp` in `python_server.py` alongside existing blueprints
- Created 20-test suite covering GraphStore snapshot creation and GraphEngine BFS traversal for all critical patterns
- Fixed silent correctness bug: `nx.bfs_edges` only yields BFS tree edges, causing diamond "convergence" edges (C->D in A->B, A->C, B->D, C->D) to be dropped — replaced with subgraph reachability approach

## Task Commits

Each task was committed atomically:

1. **Task 1: Create graph status endpoint and register blueprint** - `e8e6b81` (feat)
2. **Task 2: Write BFS/CTE equivalence and GraphEngine unit tests + fix BFS bug** - `3e2aae6` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `lineage-api/routes/graph.py` - New Blueprint with GET /api/v2/graph/status endpoint
- `lineage-api/python_server.py` - Import and register graph_bp
- `lineage-api/tests/test_graph_engine.py` - 20 unit tests: TestGraphStore (3) + TestGraphEngine (17)
- `lineage-api/graph/engine.py` - Fixed _bfs_edges to use subgraph reachability instead of nx.bfs_edges

## Decisions Made
- **Subgraph reachability approach:** `nx.bfs_edges` only returns BFS tree edges. For diamond patterns (A->B, A->C, B->D, C->D), when BFS visits D via B first, the edge C->D is never yielded because D is already marked visited. The fix: use `nx.single_source_shortest_path_length` to find all nodes reachable within `max_depth`, then iterate all edges in the induced subgraph. This returns all lineage edges along reachable paths without skipping convergence edges.
- **Test injection pattern:** Tests set `engine._store = GraphStore.build(G)` and `engine._ready.set()` directly, bypassing the background warmup thread. This makes all traversal tests deterministic and database-free.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed BFS traversal dropping diamond convergence edges**
- **Found during:** Task 2 (test_diamond_upstream_from_D and test_diamond_downstream_from_A failures)
- **Issue:** `nx.bfs_edges` only yields BFS spanning tree edges. In diamond A->B, A->C, B->D, C->D, downstream from A: B->D is yielded (D visited via B), but C->D is never yielded because D is already in the BFS visited set. Result: 3 edges returned instead of 4 — incorrect lineage truncation for multi-path patterns.
- **Fix:** Replaced `nx.bfs_edges` loop with reachability subgraph approach: `nx.single_source_shortest_path_length` finds all nodes within depth, `G.subgraph(reachable).edges()` returns all edges between them.
- **Files modified:** `lineage-api/graph/engine.py` (_bfs_edges method)
- **Verification:** All 20 tests pass; both diamond tests now pass; cycle tests still pass (visited set in BFS prevents infinite loops; subgraph approach is inherently cycle-safe because reachable set is finite)
- **Committed in:** 3e2aae6 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug)
**Impact on plan:** Critical correctness fix. Without this fix, multi-path lineage (diamonds, complex ETL with shared sources) would silently return incomplete results. No scope creep.

## Issues Encountered
None beyond the auto-fixed BFS bug.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Graph status endpoint operational: `GET /api/v2/graph/status` returns `{ready, node_count, edge_count, last_rebuild_time, memory_bytes}`
- BFS traversal correctness proven across all critical patterns with no database dependency
- Phase 14 complete: GraphEngine singleton (14-01), BFS dual-path routing in LineageService (14-02), status endpoint + test suite (14-03)
- Ready for Phase 15: frontend polling of graph status for warm-up UX or Phase 16: Gunicorn preload fork-safety validation

---
*Phase: 14-in-memory-graph-engine*
*Completed: 2026-02-21*
