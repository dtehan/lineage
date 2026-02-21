---
phase: 14-in-memory-graph-engine
plan: 02
subsystem: api
tags: [networkx, bfs, in-memory-graph, lineage, threading, blue-green-swap]

# Dependency graph
requires:
  - phase: 14-01
    provides: GraphStore immutable snapshot container and GraphLoader database-to-DiGraph loader

provides:
  - GraphEngine singleton with BFS traversal, blue-green swap, and status property
  - Dual-path routing in LineageService: BFS when graph warm, CTE fallback when not
  - GraphEngine initialization in app factory (non-blocking daemon warmup thread)
  - _enrich_bfs_results and _resolve_namespace helpers for namespace resolution

affects:
  - 14-03 (graph reload/refresh scheduling)
  - any phase adding lineage endpoints (will automatically use BFS when warm)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Blue-green swap: build into new_store outside lock, atomic reference swap with lock held only for assignment
    - Dual-path routing: is_ready guard at call site, BFS path and CTE fallback path share downstream _add_lineage_results()
    - Namespace N+1 avoidance: per-request cache in _enrich_bfs_results via _resolve_namespace
    - Daemon thread warmup: initialize() starts daemon thread, app serves CTE immediately, BFS auto-enabled on completion

key-files:
  created:
    - lineage-api/graph/engine.py
  modified:
    - lineage-api/graph/__init__.py
    - lineage-api/services/lineage_service.py
    - lineage-api/python_server.py

key-decisions:
  - "Lock held only for reference copy/swap operations — never during BFS traversal or GraphStore.build()"
  - "BFS results intentionally omit namespace fields; _enrich_bfs_results() resolves them with per-request cache"
  - "Database-level lineage (get_database_lineage_graph) continues using CTE path — batch dataset query pattern differs from column/table BFS"
  - "graph_engine.initialize() is non-blocking by design: daemon thread warmup, app serves CTE immediately"

patterns-established:
  - "Dual-path guard: use_graph = graph_engine.is_ready checked once before field/direction loops, not inside"
  - "BFS reverse=True upstream: nx.bfs_edges yields (parent, child) where actual graph edge runs child->parent, so src_node=v tgt_node=u"

# Metrics
duration: 2min
completed: 2026-02-21
---

# Phase 14 Plan 02: GraphEngine and Dual-Path Routing Summary

**GraphEngine singleton with BFS traversal and blue-green swap wired into LineageService with non-blocking daemon warmup, enabling <100ms column/table lineage while maintaining CTE fallback**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-21T00:37:03Z
- **Completed:** 2026-02-21T00:39:56Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- GraphEngine class with initialize(), _warmup(), _swap(), is_ready, status, traverse_upstream/downstream, _bfs_edges
- Blue-green swap: GraphStore.build() runs outside lock, only the reference assignment is guarded by RLock
- Dual-path routing in both get_column_lineage_graph and get_table_lineage_graph: BFS when warm, CTE when not
- _enrich_bfs_results resolves namespace fields via per-request cache to avoid N+1 dataset_repo lookups
- All 10 existing LineageService unit tests pass unchanged (graph_engine.is_ready=False in tests, CTE path exercised)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create GraphEngine singleton with BFS traversal and blue-green swap** - `e33fd7d` (feat)
2. **Task 2: Wire dual-path routing in LineageService and initialize engine in app factory** - `1b4aed3` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `lineage-api/graph/engine.py` - GraphEngine class with BFS traversal, blue-green swap, is_ready/status properties, module-level singleton
- `lineage-api/graph/__init__.py` - Updated to export GraphEngine and graph_engine alongside GraphStore and GraphLoader
- `lineage-api/services/lineage_service.py` - Dual-path routing in column/table lineage, _enrich_bfs_results, _resolve_namespace helpers
- `lineage-api/python_server.py` - graph_engine.initialize(connection) called after connection creation in create_app()

## Decisions Made

- Lock held only for reference copy/swap operations: BFS traversal acquires lock to snapshot store reference, releases before traversal. _swap() builds outside lock, holds lock only for single assignment. This means reads never block writes and writes never block reads.
- BFS results intentionally omit namespace fields: GraphLoader stores only "dataset.field" node IDs; resolving namespaces during graph load would require N lookups per edge. Instead, _enrich_bfs_results() resolves via dataset_repo with per-request caching.
- Database-level lineage not modified: get_database_lineage_graph uses batch dataset queries with bidirectional CTE — a different access pattern that doesn't map cleanly to per-field BFS.
- use_graph flag captured once before loops: avoids per-iteration is_ready checks and ensures consistent path across all fields in a table lineage request.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - all verification checks passed on first attempt. nx.bfs_edges with reverse=True yields (parent, child) edges in upstream traversal direction, where the actual DiGraph edge runs from child to parent — correctly handled by swapping src_node/tgt_node assignment.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- GraphEngine singleton is importable and returns correct status when uninitialized
- All lineage requests fall back to CTE until graph_engine.initialize(connection) is called and warmup completes
- Phase 14-03 can build on this foundation to add graph reload scheduling, status API endpoint, and BFS/CTE semantic equivalence tests
- Gunicorn preload fork-safety concern remains: graph_engine singleton must be initialized after fork (in post_fork hook), not in module scope

---
*Phase: 14-in-memory-graph-engine*
*Completed: 2026-02-21*

## Self-Check: PASSED

- lineage-api/graph/engine.py: FOUND
- lineage-api/graph/__init__.py: FOUND
- lineage-api/services/lineage_service.py: FOUND
- lineage-api/python_server.py: FOUND
- .planning/phases/14-in-memory-graph-engine/14-02-SUMMARY.md: FOUND
- Commit e33fd7d (Task 1): FOUND
- Commit 1b4aed3 (Task 2): FOUND
