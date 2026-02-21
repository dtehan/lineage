---
phase: 14-in-memory-graph-engine
verified: 2026-02-21T00:47:56Z
status: passed
score: 14/14 must-haves verified
re_verification: false
---

# Phase 14: In-Memory Graph Engine Verification Report

**Phase Goal:** The application serves all lineage traversals from an in-memory networkx DiGraph, eliminating recursive CTE database round-trips while falling back transparently to the existing CTE path during warm-up or on engine failure.
**Verified:** 2026-02-21T00:47:56Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | GraphStore holds a networkx DiGraph with node_count, edge_count, loaded_at, and memory_bytes metadata | VERIFIED | `lineage-api/graph/store.py` — `@dataclass GraphStore` with all four fields plus `build()` classmethod capturing psutil RSS |
| 2 | GraphLoader.load() queries all active OL_COLUMN_LINEAGE rows and returns a populated DiGraph | VERIFIED | `lineage-api/graph/loader.py` — `LOCKING ROW FOR ACCESS SELECT ... FROM OL_COLUMN_LINEAGE WHERE is_active = 'Y'`; returns `nx.DiGraph` |
| 3 | Node IDs in the DiGraph use 'dataset_name.field_name' format matching LineageService._build_node() key format | VERIFIED | `loader.py` lines 82-83: `f"{source_dataset}.{source_field}"` / `f"{target_dataset}.{target_field}"`; `engine.py` splits via `rsplit(".", 1)` |
| 4 | Edge attributes in the DiGraph include transformation_type matching CTE result format | VERIFIED | `loader.py` line 85: `G.add_edge(src_id, tgt_id, transformation_type=transformation_type)`; default "DIRECT" for NULL |
| 5 | networkx and psutil are declared in requirements.txt | VERIFIED | `requirements.txt` contains `networkx>=3.4.0` and `psutil>=5.9.0` |
| 6 | GraphEngine.traverse_upstream() returns edges in the same dict format as LineageRepository CTE results | VERIFIED | `engine.py` `_bfs_edges()` returns dicts with source_dataset, source_field, target_dataset, target_field, transformation_type |
| 7 | GraphEngine.traverse_downstream() returns edges in the same dict format as LineageRepository CTE results | VERIFIED | Same `_bfs_edges()` method; `reverse=False` for downstream direction |
| 8 | Blue-green swap acquires lock only for reference assignment, never during BFS traversal | VERIFIED | `engine.py` `_swap()`: `GraphStore.build(graph)` runs outside lock; `with self._lock: self._store = new_store` guards only the assignment |
| 9 | LineageService delegates to GraphEngine when is_ready is True, falls back to CTE when False | VERIFIED | `lineage_service.py` lines 82 and 168: `use_graph = graph_engine.is_ready` guards both `get_column_lineage_graph` and `get_table_lineage_graph`; CTE paths are intact |
| 10 | graph_engine.initialize() is called during create_app() with the shared database connection | VERIFIED | `python_server.py` line 78: `graph_engine.initialize(connection)` called after `connection = get_db_connection()`, before repository instantiation |
| 11 | BFS results include source_namespace and target_namespace resolved via dataset_repo | VERIFIED | `lineage_service.py` `_enrich_bfs_results()` and `_resolve_namespace()`: per-request cache resolves namespaces before `_add_lineage_results()` |
| 12 | GET /api/v2/graph/status returns JSON with ready, node_count, edge_count, last_rebuild_time, and memory_bytes | VERIFIED | `routes/graph.py` Blueprint at `/api/v2/graph/status`; delegates to `graph_engine.status` which returns all five fields |
| 13 | BFS traversal produces identical nodes, edges, and transformation types to CTE for CYCLE5, NESTED_DIAMOND, FANOUT10 test patterns | VERIFIED | 20 unit tests pass (all ok): diamond both-paths test, cycle no-infinite-loop test, fanout 10-edges test, depth limit tests |
| 14 | GraphEngine falls back to CTE when not initialized (is_ready=False) | VERIFIED | `engine.py`: `_ready` Event not set until `_warmup()` succeeds; `traverse_upstream/downstream` return `[]` when `store is None`; `lineage_service.py` branches on `use_graph` |

**Score:** 14/14 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `lineage-api/graph/__init__.py` | Package exports for GraphStore, GraphLoader, GraphEngine, graph_engine | VERIFIED | Exports all four; module docstring present |
| `lineage-api/graph/store.py` | GraphStore dataclass with build() classmethod | VERIFIED | 64 lines; `@dataclass GraphStore` with `build()` capturing psutil RSS |
| `lineage-api/graph/loader.py` | GraphLoader class with load() method | VERIFIED | 94 lines; `class GraphLoader` with `load()` containing OL_COLUMN_LINEAGE SQL |
| `lineage-api/graph/engine.py` | GraphEngine singleton with BFS traversal, blue-green swap, status property | VERIFIED | 294 lines; full implementation with subgraph reachability BFS fix for diamond patterns |
| `lineage-api/routes/graph.py` | GET /api/v2/graph/status endpoint with graph_bp Blueprint | VERIFIED | 19 lines; Blueprint registered, route delegating to `graph_engine.status` |
| `lineage-api/tests/test_graph_engine.py` | Unit tests for GraphEngine BFS/CTE equivalence and status | VERIFIED | 20 tests; TestGraphStore (3) + TestGraphEngine (17); all pass |
| `lineage-api/services/lineage_service.py` | Dual-path routing with is_ready guard | VERIFIED | `use_graph = graph_engine.is_ready` in both column and table lineage methods |
| `lineage-api/python_server.py` | GraphEngine initialization in app factory | VERIFIED | `graph_engine.initialize(connection)` at line 78; `graph_bp` registered at line 97 |
| `requirements.txt` | networkx and psutil dependencies | VERIFIED | `networkx>=3.4.0` and `psutil>=5.9.0` present |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `lineage-api/graph/loader.py` | OL_COLUMN_LINEAGE table | `LOCKING ROW FOR ACCESS SELECT` | WIRED | SQL query confirmed at lines 61-72 of loader.py |
| `lineage-api/graph/store.py` | `lineage-api/graph/loader.py` | `GraphStore.build()` called in `_swap()` | WIRED | `engine.py` line 214: `new_store = GraphStore.build(graph)` |
| `lineage-api/graph/engine.py` | `lineage-api/graph/store.py` | `GraphStore.build()` in `_swap()` | WIRED | Confirmed; build runs outside lock |
| `lineage-api/graph/engine.py` | `lineage-api/graph/loader.py` | `_loader.load()` in `_warmup()` | WIRED | `engine.py` line 189: `graph = self._loader.load()` |
| `lineage-api/services/lineage_service.py` | `lineage-api/graph/engine.py` | `graph_engine.traverse_upstream/downstream` | WIRED | Lines 87-90 and 99-103 in lineage_service.py; import confirmed at line 21 |
| `lineage-api/python_server.py` | `lineage-api/graph/engine.py` | `graph_engine.initialize(connection)` | WIRED | Lines 31 (import) and 78 (call) in python_server.py |
| `lineage-api/routes/graph.py` | `lineage-api/graph/engine.py` | `graph_engine.status` property | WIRED | `routes/graph.py` line 10 (import) and line 18 (call) |
| `lineage-api/python_server.py` | `lineage-api/routes/graph.py` | `app.register_blueprint(graph_bp)` | WIRED | `python_server.py` line 26 (import) and line 97 (registration) |
| `lineage-api/tests/test_graph_engine.py` | `lineage-api/graph/engine.py` | Test BFS traversal via `traverse_upstream/downstream` | WIRED | 20 tests pass; traverse methods exercised in 15+ test cases |

### Requirements Coverage

Requirements GRAPH-01 through GRAPH-08 are addressed as follows:

| Requirement | Status | Evidence |
|-------------|--------|----------|
| GRAPH-01 to GRAPH-05 (BFS traversal, CTE fallback, blue-green swap) | SATISFIED | GraphEngine implemented with all three mechanisms |
| GRAPH-06 to GRAPH-07 (column/table lineage BFS routing) | SATISFIED | Dual-path routing in both `get_column_lineage_graph` and `get_table_lineage_graph` |
| GRAPH-08 (status endpoint, BFS/CTE equivalence tests) | SATISFIED | `GET /api/v2/graph/status` registered; 20 tests covering all three test patterns (CYCLE5, NESTED_DIAMOND, FANOUT10) |

### Anti-Patterns Found

None. Scan of `lineage-api/graph/`, `lineage-api/routes/graph.py`, `lineage-api/services/lineage_service.py`, and `lineage-api/python_server.py` found no TODO/FIXME/PLACEHOLDER markers, no empty implementations, and no stub handlers. The two `return []` instances in `engine.py` are correct fallback behaviour (node not in graph or store not yet set).

### Notable Bug Fix (Auto-Corrected in Phase)

Plan 14-03 identified and fixed a silent correctness bug during test execution: `nx.bfs_edges` only yields BFS spanning tree edges, which causes "convergence" edges in diamond patterns (A->B, A->C, B->D, C->D) to be silently dropped when D is reached via B before C arrives. The fix replaces `nx.bfs_edges` with a subgraph reachability approach using `nx.single_source_shortest_path_length` — all nodes reachable within `max_depth` are found, then all edges between them in the induced subgraph are returned. This is verified correct by the `test_diamond_upstream_from_D` and `test_diamond_downstream_from_A` tests.

### Human Verification Required

The following items cannot be fully verified programmatically:

#### 1. Startup Latency Under Real Database Load

**Test:** Start the application with a real Teradata connection populated with OL_COLUMN_LINEAGE rows. Observe application startup: confirm it serves the first lineage request immediately via CTE (before warmup completes), and subsequent requests use BFS once `GET /api/v2/graph/status` shows `ready: true`.
**Expected:** No request blocking during warmup; first request returns CTE result; later requests (post-warmup) return identical BFS result.
**Why human:** Requires a live Teradata connection with actual data volume; timing behaviour cannot be simulated in unit tests.

#### 2. BFS vs CTE Result Identity at Runtime

**Test:** After warmup completes, make identical lineage requests using both paths (toggle `is_ready` off and back on via test harness, or compare pre/post-warmup responses for the same column).
**Expected:** Nodes, edges, and transformation types are identical between BFS and CTE responses.
**Why human:** Unit tests prove equivalence on synthetic graphs; production data with real CHAR padding, NULL transformation types, and multi-hop paths requires runtime verification.

#### 3. Gunicorn Preload Fork-Safety

**Test:** Start the app with `gunicorn --preload --workers 2`. Verify all workers serve correct lineage and `graph_engine.is_ready` eventually becomes True in each worker.
**Expected:** Each worker initialises its own graph engine post-fork; no shared state across workers causes incorrect results.
**Why human:** The 14-02 SUMMARY notes this as a known concern: "graph_engine singleton must be initialized after fork (in post_fork hook), not in module scope." The current implementation calls `initialize()` inside `create_app()` which is called by each worker — this is likely correct, but runtime validation under Gunicorn is needed.

### Gaps Summary

No gaps. All 14 observable truths are verified, all 9 required artifacts exist and are substantive, and all 9 key links are wired. The 20-test suite passes with no failures. The phase goal is achieved.

---

_Verified: 2026-02-21T00:47:56Z_
_Verifier: Claude (gsd-verifier)_
