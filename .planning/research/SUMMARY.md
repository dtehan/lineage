# Project Research Summary

**Project:** Lineage — Column-Level Data Lineage for Teradata
**Domain:** In-memory graph engine with BFS/DFS traversal and progressive depth loading
**Researched:** 2026-02-20
**Confidence:** HIGH

## Executive Summary

This milestone adds an in-memory graph engine and progressive depth loading to an existing, production-quality Flask+React lineage application. The current bottleneck is the Teradata recursive CTE traversal that runs on every cold request (150ms–15s+). The recommended approach is to load all active `OL_COLUMN_LINEAGE` rows into a Python adjacency structure at Flask startup, serve all traversal requests from memory via BFS, and fall back transparently to the existing CTE path during warm-up or on engine failure. The single new dependency is `networkx>=3.6.1` (backend); no new frontend libraries are required. The existing Flask factory pattern, Redis cache, TanStack Query, React Flow, and ELKjs remain structurally unchanged.

The most critical architectural decision is the Gunicorn worker model. The in-memory graph is a per-process singleton — multi-worker deployments require either `--preload` (copy-on-write safe because the factory creates DB connections inside `create_app()`, not at import time) or `--workers 1 --threads N`. This must be decided before any code is written. A second key decision is the progressive loading UX model: "defer layout until final depth" (lower complexity, no jitter) versus "render each depth incrementally" (higher complexity, requires position-stability logic). Research strongly favors the defer-until-final approach for this application.

The primary risks are memory footprint at production scale (100K edges with networkx = ~100 MB per worker; plain dict adjacency = ~15 MB), race conditions during graph rebuild (mitigated by blue-green atomic swap), and three-layer cache inconsistency (Teradata + in-memory graph + Redis all require coordinated invalidation). All three are well-understood and have clear mitigations described in the research. The implementation is decomposed into five build-order phases with explicit test gates between each, starting with the pure-backend graph engine and ending with frontend progressive rendering.

---

## Key Findings

### Recommended Stack

The stack additions for this milestone are intentionally minimal. See `.planning/research/STACK.md` for full rationale.

**Core technologies (new additions only):**
- `networkx>=3.6.1`: In-memory directed graph engine — best fit for 10K–100K edges, provides BFS with `depth_limit`, cycle detection, and reverse traversal out of the box. Pure Python, no compilation required. At this scale, BFS latency is dominated by Flask serialization and ELKjs layout, not traversal compute, so the 3–100x performance advantage of `rustworkx` is not justified.
- `Flask Response + stream_with_context` (built-in): NDJSON streaming over HTTP — zero new dependency, handles chunked transfer encoding natively. Preferred over SSE (structured protocol overhead, no custom header support) and WebSockets (bidirectional overhead for a unidirectional stream).
- Native `fetch` + `ReadableStream` (browser built-in): Frontend NDJSON consumption — Axios buffers full responses before resolving; native fetch with `response.body.getReader()` is the correct API for streaming. Existing Axios `apiClient` remains for all non-streaming endpoints.

**Critical version requirement:** networkx 3.6.1 requires Python >=3.11. The Flask server's Python version must be verified before adding the dependency.

**What NOT to add:** rustworkx, Flask-SSE, Flask-SocketIO, graph-tool, igraph, TanStack DB, GraphQL subscriptions. Each is explicitly over-engineered for this scale and use case.

### Expected Features

See `.planning/research/FEATURES.md` for full feature landscape and competitor analysis.

**Must have (table stakes — directly achieves the <500ms / <200ms performance goal):**
- In-memory graph singleton — `networkx.DiGraph` built from all `OL_COLUMN_LINEAGE` rows at startup, stored at Flask app level; the foundation of everything else
- Graph warm-up on startup — background `threading.Thread(daemon=True)` in `create_app()` with `warm_up_status` flag (`warming`, `ready`, `failed`)
- Graceful CTE fallback — if `warm_up_status != 'ready'`, route to existing CTE path; CTE path is the safety net throughout
- Depth-1 immediate response (<200ms) — in-memory BFS to depth=1, O(edges at depth 1) in microseconds
- Full graph within 500ms — in-memory BFS to depth=5 in <50ms; bottleneck shifts to ELKjs layout and serialization
- Cache invalidation hook — extend existing `cache/invalidation.py` to signal graph rebuild on ETL
- Graph warm-up metrics — `GET /api/v2/graph/status` returns `{ status, nodeCount, edgeCount, buildTimeMs, lastBuiltAt }`, low effort / high operational value

**Should have (improve perceived performance once core engine is working):**
- Progressive depth loading (two-phase fetch) — depth-1 renders first, depth-5 loads in background and merges; requires `prefetchQuery` in TanStack Query after depth-1 resolves
- Incremental graph merge (frontend) — Zustand `appendGraph()` action merges new nodes/edges without replacing existing; React Flow `hidden` property reveals new nodes; ELKjs runs once on final depth
- Graph subgraph serialization to Redis — serialize `networkx.DiGraph` to Redis on warm-up; restore on restart; reduces cold-start Teradata query from O(all rows) to O(Redis GET)

**Defer to v2+:**
- Depth-expand on node click — frontier detection, expand button UI, subgraph merge logic, node position pinning; high complexity; conflicts with progressive loading as a UX model; defer until progressive loading proves out
- Stale-while-revalidate — worth implementing after Redis serialization is in place; adds concurrency primitives requiring careful testing

**Anti-features to avoid:** SSE streaming per-request with sync Gunicorn workers (starves worker pool), WebSocket for real-time updates (no real-time data to stream), Neo4j/Memgraph replacement (unnecessary infrastructure at this scale), full graph pre-computation (1M+ subgraphs prohibitive), canvas rendering (rewrites entire visualization layer), depth auto-detection without a cap (unusable graphs at depth>5).

### Architecture Approach

The existing Flask repository/service architecture is unchanged in structure. A new `lineage-api/graph/` package sits between `LineageService` and `Teradata`, providing a read-only in-memory adjacency structure. `LineageService` checks `GraphEngine.is_ready()` before deciding which path to use (dual-path strategy: GraphEngine first, CTE fallback). The SSE streaming endpoint is additive — the existing `/lineage/{id}/{field}` endpoint remains unchanged for backward compatibility. See `.planning/research/ARCHITECTURE.md` for full component boundaries, data flow diagrams, and build order.

**Major components:**

1. `graph/store.py` (GraphStore) — NEW: holds all lineage edges and node metadata in memory as adjacency dicts (`adj_forward`, `adj_backward`, `node_meta`); read-only after `build()`; thread-safe for concurrent reads via Python's GIL
2. `graph/loader.py` (GraphLoader) — NEW: queries Teradata once at startup via new `LineageRepository.load_all_lineage()` method; populates GraphStore; re-runs on cache invalidation
3. `graph/engine.py` (GraphEngine) — NEW: module-level singleton with double-checked locking; `traverse_depth_slice()` for progressive streaming; `is_ready()` check for dual-path routing; `invalidate_graph_engine()` for ETL-triggered rebuild
4. `LineageService` (modified) — adds `get_progressive_lineage_stream()` generator; existing `get_column_lineage_graph()` tries GraphEngine first, falls back to CTE on any exception; existing signature preserved
5. `routes/openlineage.py` (modified) — adds `/lineage/{id}/{field}/stream` SSE route returning cumulative NDJSON depth slices; existing routes unchanged
6. `useProgressiveLineage()` hook (new frontend) — `EventSource` + `queryClient.setQueryData()` accumulation; adds `depth_loading` stage to the existing loading progress state machine
7. `cache/invalidation.py` (modified) — adds `invalidate_graph_engine()` call alongside existing Redis invalidation; single invalidate endpoint clears all three cache layers atomically

**Key patterns to follow:**
- Module-level singleton with double-checked locking (not `flask.g`, not `app.extensions`)
- Blue-green graph swap (build new graph into separate variable, atomic reference swap, never destroy old graph first)
- Dual-path routing in `LineageService` (GraphEngine first, CTE fallback on any exception — never crash on graph unavailability)
- ELKjs layout deferred to `is_final: true` slice only (run layout once, not per depth batch)
- Cumulative SSE slices (each slice includes all nodes/edges from depth 1 through current depth; frontend replaces local state with latest slice)

### Critical Pitfalls

See `.planning/research/PITFALLS.md` for all 14 pitfalls with full warning signs and recovery strategies.

**Top 5 requiring architectural decisions before any code is written:**

1. **Multi-worker graph inconsistency** — each Gunicorn worker builds its own independent graph; some workers serve stale data while others serve fresh; invisible in single-worker dev. Mitigation: use `--preload` (master builds graph, workers inherit via copy-on-write) or `--workers 1 --threads N`. Must be validated in staging with `--workers 4`.

2. **NetworkX memory overhead at 100K edges** — networkx stores ~800–1000 bytes per edge (nested dicts); 100K edges = ~100 MB per worker; plain Python dict adjacency stores ~150 bytes per edge = ~15 MB total. Mitigation: benchmark with production-scale data before committing to data structure; prefer plain dicts for the persistent store.

3. **Graph rebuild race condition** — in-place rebuild (drop old graph, load new, build) blocks or fails concurrent requests during the gap. Mitigation: blue-green swap — build new graph into separate variable, atomically swap reference, never destroy old graph before new one is fully built.

4. **Three-layer cache inconsistency** — ETL updates Teradata; `/invalidate` clears Redis; but in-memory graph is not rebuilt, silently serving pre-ETL lineage even after user hits "Refresh". Mitigation: extend existing `/invalidate` endpoint to also trigger graph rebuild; all three layers must be invalidated atomically from the caller's perspective.

5. **Progressive loading layout jitter** — topological layout assigns positions based on global graph structure; adding any upstream node at depth N changes relative positions of all downstream nodes; users see existing nodes visibly jump between depth batches. Mitigation: defer all layout until `is_final: true`; show depth progress spinner during earlier slices; never commit node positions until the full requested depth is loaded.

**Additional pitfalls to track:**
- SSE/streaming incompatible with standard Gunicorn sync workers (starves worker pool at concurrent load) — use polling or gthread workers
- TanStack Query cache poisoning with partial progressive data — use local component state for progressive display, TanStack Query only for final complete result
- BFS depth semantics must exactly match existing CTE depth semantics (off-by-one appears as "wrong" lineage) — write equivalence tests before removing CTE path
- Cold-start penalty if graph initialized lazily — use eager init in `create_app()`; health endpoint returns 503 until graph is ready
- React re-render storm from `setNodes`/`setEdges` on each progressive batch — batch at data layer; use React 18 `useTransition` for non-urgent updates

---

## Implications for Roadmap

Based on the dependency graph in FEATURES.md and the build order in ARCHITECTURE.md, five phases are recommended. Each phase has an explicit test gate before the next begins.

### Phase 1: In-Memory Graph Engine (Backend Core)

**Rationale:** Everything else depends on a working, production-safe in-memory graph. The architectural decisions about worker model, data structure, memory footprint, and blue-green swap must be made and validated here — retrofitting them is HIGH recovery cost per the pitfalls research. This phase also establishes the dual-path routing that makes all subsequent changes non-breaking.

**Delivers:** GraphStore + GraphLoader + GraphEngine singleton; `load_all_lineage()` in LineageRepository; dual-path routing in LineageService (GraphEngine first, CTE fallback); eager startup initialization with graceful error catch; health endpoint returning 503 until graph is ready; graph status endpoint (`GET /api/v2/graph/status`).

**Addresses (FEATURES.md P1):** In-memory graph singleton, graph warm-up on startup, graceful CTE fallback, depth-1 immediate response, full graph <500ms, graph warm-up metrics.

**Avoids (PITFALLS.md):** Multi-worker inconsistency (worker model decision upfront), networkx memory overhead (data structure benchmark spike before committing), graph rebuild race condition (blue-green swap from day one), cold-start penalty (eager init), three-layer invalidation (extend `/invalidate` endpoint).

**Test gate:** BFS output matches CTE output exactly for all depth values on CYCLE5, NESTED_DIAMOND, FANOUT10 test patterns; worker RSS under target with 100K edge sample; all 73 existing database tests pass; all 20 existing API tests pass.

### Phase 2: Cache Invalidation Integration

**Rationale:** ETL-triggered invalidation is the highest-risk integration point for correctness. A working graph engine that serves stale data after ETL is worse than no graph engine (it misleads users who explicitly refresh). Low implementation effort but high test effort — the three-layer consistency test is the key artifact.

**Delivers:** Extended `/api/v2/cache/invalidate` endpoint that clears Redis AND triggers graph rebuild atomically; `invalidate_graph_engine()` in `graph/engine.py`; three-layer consistency integration test (ETL mock → invalidate → lineage API returns updated data); `graph_version` integer in Redis keys to auto-invalidate stale CTE entries after rebuild.

**Addresses (FEATURES.md):** Cache invalidation rebuild hook.

**Avoids (PITFALLS.md):** Three-layer cache inconsistency (explicit end-to-end test is the verification artifact), data normalization key mismatch (flush Redis on deploy + normalize cache key generation simultaneously).

**Test gate:** POST `/cache/invalidate` → lineage API reflects ETL changes; Redis cache hit rate returns to normal within 5 minutes; no stale pre-ETL results visible after invalidation.

### Phase 3: SSE Streaming Route (API Contract Addition)

**Rationale:** The streaming endpoint is additive (existing endpoint unchanged). The critical decision is the streaming mechanism: NDJSON over `stream_with_context` versus polling. This must be validated against the production WSGI worker model before implementation — SSE with sync workers is a HIGH-cost pitfall if discovered post-deployment.

**Delivers:** New `/lineage/{id}/{field}/stream` route returning cumulative NDJSON depth slices with `is_final` signal; `get_progressive_lineage_stream()` generator in LineageService; `X-Accel-Buffering: no` header for Nginx; validated against `--workers 1 --threads 8` (gthread mode) under concurrent load.

**Addresses (FEATURES.md):** Progressive depth loading (backend half).

**Avoids (PITFALLS.md):** SSE/Gunicorn worker starvation (validate worker model before implementation), Nginx buffering (X-Accel-Buffering header).

**Test gate:** `curl -N` to stream endpoint shows incremental depth slices with correct `is_final` signal; concurrent graph loads with multiple threads do not starve the worker pool; existing endpoint backward compatibility confirmed.

### Phase 4: Frontend Progressive Loading

**Rationale:** Frontend progressive loading is the highest-complexity phase and depends on Phase 3's streaming contract being stable. Two critical design decisions: (1) ELKjs layout deferred to `is_final: true` only — not per depth batch, avoiding jitter and re-render storm; (2) progressive state held in local component state rather than TanStack Query cache — avoiding partial-data cache poisoning.

**Delivers:** `useProgressiveLineage()` hook using `EventSource` + `queryClient.setQueryData()`; `depth_loading` stage added to `useLoadingProgress` state machine; `LineageGraph.tsx` updated to consume streaming hook and defer `layoutGraph()` to `is_final: true` slice; depth progress indicator ("Loading depth X of Y...") visible during streaming; React 18 `useTransition` for non-urgent depth updates.

**Addresses (FEATURES.md P2):** Progressive depth loading (frontend half), incremental graph merge.

**Avoids (PITFALLS.md):** Layout jitter (defer ELK to final slice), React re-render storm (batch via `useTransition`), TanStack Query partial cache poisoning (local state for progressive display).

**Test gate:** E2E test — open lineage for deep graph, verify depth slices appear progressively without node position changes for already-rendered nodes; React Profiler shows single layout cycle per graph load; two browser tabs on same column show identical final state.

### Phase 5: Redis Serialization and Production Hardening

**Rationale:** The v1.x "should have" work from FEATURES.md — higher-value optimizations after the core engine is validated in production. Redis serialization reduces cold-start Teradata query from O(all rows) to O(Redis GET). Memory leak tracking across ETL rebuild cycles ensures long-running stability.

**Delivers:** `nx.node_link_data(G)` → JSON → Redis serialization on graph build; Redis-to-GraphStore restore on startup (if cache is fresh); process RSS tracked across 3 simulated ETL rebuild cycles (verified stable); `gc.collect()` after each graph swap; Gunicorn `--max-requests` safety net documented in deployment runbook.

**Addresses (FEATURES.md P2):** Graph subgraph serialization to Redis.

**Avoids (PITFALLS.md):** Memory leak from cyclic graph object accumulation (`gc.collect()` after swap, `--max-requests` as backstop), cold-start penalty (Redis serialization reduces Teradata load time on restart).

**Test gate:** Cold start with serialized Redis cache completes in <1s; process RSS is stable (not monotonically growing) across 3 simulated ETL rebuild cycles.

---

### Phase Ordering Rationale

- **Phase 1 before Phase 3:** The streaming endpoint requires `get_progressive_lineage_stream()` in LineageService, which requires a working GraphEngine.
- **Phase 2 before Phase 4:** Progressive loading on the frontend will stream stale data if the invalidation integration is broken. Correctness must be verified before the UX layer is built on top.
- **Phase 3 before Phase 4:** The frontend hook is written against the Phase 3 API contract; the contract must be stable before the hook is implemented.
- **Phase 5 after Phase 4:** Redis serialization and memory hardening are optimizations on a working system; building them speculatively before the core engine is validated adds risk without benefit.
- **Pitfalls 1–4 must all be addressed in Phase 1:** These are architectural decisions, not features. Retrofitting any of them after Phase 1 is a HIGH recovery cost per the pitfalls recovery table. No code should be written before the worker model, data structure, blue-green swap, and invalidation extension are all designed.

---

### Research Flags

**Phases needing deeper design discussion before implementation:**

- **Phase 1 (data structure choice):** MEDIUM confidence on memory footprint at 100K edges. Research recommends a one-day spike — load a sample of 100K rows from Teradata and measure worker RSS before committing to plain dicts vs networkx. This prevents a HIGH-cost rewrite if the wrong structure is chosen.
- **Phase 1 (Gunicorn preload fork-safety):** MEDIUM confidence that `--preload` is fork-safe with the existing connection lifecycle. The factory creates connections inside `create_app()` (not module scope), which appears safe — but must be verified experimentally in staging before production deployment.
- **Phase 3 (SSE vs polling decision):** HIGH confidence that SSE with sync Gunicorn workers is incompatible. If `--worker-class gthread` is not acceptable for the deployment, fall back to two-request polling model (depth-1 then depth-5 as separate sequential requests). Polling eliminates Pitfall 6 entirely. Decision point before Phase 3 implementation begins.
- **Phase 4 (layout stability approach):** LOW confidence on "position stability" algorithm if incremental rendering is ever needed. No reference implementation found. The research recommendation is to defer layout to `is_final: true` and avoid the problem entirely.

**Phases with standard patterns (research-phase likely not needed):**

- **Phase 2 (cache invalidation integration):** Extending an existing endpoint with a known pattern. The work is test writing, not discovery.
- **Phase 5 (Redis serialization):** `nx.node_link_data()` serialization is documented; the pattern mirrors the existing Redis cache-aside pattern already in the codebase.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Core choices (networkx, Flask NDJSON streaming, native fetch) verified against official docs and PyPI. Version compatibility confirmed. Memory estimates at production scale are MEDIUM (community benchmarks, not official). |
| Features | HIGH | Industry tool analysis (DataHub, Amazon DataZone, Databricks Unity Catalog) provides strong basis for prioritization. P1/P2/P3 split is well-grounded in competitor behavior. Anti-feature list is well-argued. |
| Architecture | HIGH (backend), MEDIUM (progressive loading API contract) | Backend integration points verified against actual codebase files. Progressive loading pattern (SSE + setQueryData accumulation) sourced from community patterns, not official TanStack docs — needs validation in implementation. |
| Pitfalls | HIGH (critical pitfalls), MEDIUM (minor pitfalls) | Multi-worker isolation, SSE + sync workers, and BFS/CTE semantics are all well-documented. Memory leak GC timing and position stability algorithm are MEDIUM/LOW confidence. |

**Overall confidence:** HIGH for architectural direction. MEDIUM for production-scale memory and performance claims that require empirical validation with production data.

---

### Gaps to Address

- **Memory footprint with production data:** Research provides estimates (15–100 MB per worker depending on data structure) but extrapolated from community benchmarks. A one-day spike loading production-scale data into a test Flask process is the validation step. Address at the start of Phase 1.

- **Gunicorn preload fork-safety:** The factory creates DB connections inside `create_app()`, which should be fork-safe for `--preload`. Needs experimental verification before committing to deployment model. Address in Phase 1 staging test.

- **BFS traversal performance at production scale:** Research estimates <1ms BFS for 100K edges (based on lineage analysis blog benchmarks). Actual performance depends on graph connectivity structure (high-fanout columns may behave differently). Address in Phase 1 performance test with FANOUT10 extended to production-scale data.

- **SSE vs polling final decision:** Research recommends NDJSON over `stream_with_context`. If gthread mode is not acceptable for the deployment, polling is the fallback. This is a deployment constraint question. Address at the start of Phase 3 planning.

- **ELKjs incremental layout (if ever needed):** The current `layoutEngine.ts` uses Kahn's topological sort, which reassigns all positions from scratch. If incremental display is ever required, an incremental layout algorithm would be needed. Not needed for the current recommendation (defer to final slice) but documented as a future constraint.

---

## Sources

### Primary (HIGH confidence)
- [networkx PyPI 3.6.1, Dec 2025](https://pypi.org/project/networkx/) — version, Python requirements
- [NetworkX bfs_edges API — depth_limit parameter](https://networkx.org/documentation/stable/reference/algorithms/generated/networkx.algorithms.traversal.breadth_first_search.bfs_edges.html) — BFS with depth limiting
- [Flask Streaming Documentation — Official 3.1.x](https://flask.palletsprojects.com/en/stable/patterns/streaming/) — `stream_with_context`, generator responses
- [MDN: Using Readable Streams](https://developer.mozilla.org/en-US/docs/Web/API/Streams_API/Using_readable_streams) — native fetch streaming
- [React Flow Performance Documentation](https://reactflow.dev/learn/advanced-use/performance) — `onlyRenderVisibleElements`, 1000+ node limits
- [DataHub Lineage Features](https://docs.datahub.com/docs/features/feature-guides/lineage) — depth control, max_hops, 3+ hop warnings
- [Amazon DataZone Lineage Visualization](https://aws.amazon.com/blogs/big-data/amazon-datazone-introduces-openlineage-compatible-data-lineage-visualization-in-preview/) — depth-1 default, expand pattern
- [rustworkx Benchmark Comparisons](https://www.rustworkx.org/benchmarks.html) — 3–100x performance claims vs networkx
- [Gunicorn Application Preloading — Joel Sleppy](https://www.joelsleppy.com/blog/gunicorn-application-preloading/) — preload fork-safety
- [Sharing data across Gunicorn workers — Medium](https://medium.com/@jgleeee/sharing-data-across-workers-in-a-gunicorn-flask-application-2ad698591875) — worker isolation constraint
- Existing codebase: `lineage_repository.py`, `lineage_service.py`, `python_server.py`, `cache/invalidation.py`, `useLoadingProgress.ts`, `layoutEngine.ts`, `LineageGraph.tsx`

### Secondary (MEDIUM confidence)
- [Data Lineage Analysis with Python and NetworkX — Rittman Mead, 2024](https://www.rittmanmead.com/blog/2024/08/data-lineage-analysis-with-python-and-networkx/) — BFS performance at 100K iterations, real-world lineage use case
- [Benchmark of popular graph/network packages — timlrx.com](https://www.timlrx.com/blog/benchmark-of-popular-graph-network-packages/) — networkx vs alternatives at various scales
- [React Query and Server-Sent Events — Fragmented Thought, 2025](https://fragmentedthought.com/blog/2025/react-query-caching-with-server-side-events) — `setQueryData` accumulation pattern for SSE
- [Server-sent events in Flask without extra dependencies — Max Halford](https://maxhalford.github.io/blog/flask-sse-no-deps/) — SSE + sync worker starvation documentation
- [Progressive loading for big diagrams — React Flow GitHub Discussion #3033](https://github.com/xyflow/xyflow/discussions/3033) — viewport-based rendering, throttled recalculation
- [NetworkX memory overhead discussion — Google Groups](https://groups.google.com/g/networkx-discuss/c/5zZ_OBu-wYA) — ~100 bytes/edge estimate
- [Using Threads with Flask — Michael Toohig](https://michaeltoohig.com/blog/using-threads-with-flask/) — `threading.Thread(daemon=True)` pattern in `create_app()`

### Tertiary (LOW confidence)
- "Position stability" algorithm for incremental node addition — no reference implementation found; custom logic required if this path is ever taken
- `gc.collect()` timing predictability after graph swaps — may not prevent all RSS growth; `--max-requests` is the backstop

---
*Research completed: 2026-02-20*
*Ready for roadmap: yes*
