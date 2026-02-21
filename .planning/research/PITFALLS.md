# Pitfalls Research

**Domain:** In-memory graph engine + progressive loading added to existing Flask+React lineage app
**Researched:** 2026-02-20
**Confidence:** HIGH

---

## Critical Pitfalls

### Pitfall 1: Multi-Worker Inconsistency — Each Gunicorn Worker Builds Its Own Graph

**What goes wrong:**
The in-memory graph is a Python dict (or networkx/igraph object) stored as a module-level singleton. Gunicorn spawns N worker processes using `fork()`. Each worker gets its own independent address space. Worker 1 builds the graph from Teradata and serves fast BFS traversals. Worker 2 hasn't built the graph yet — its first request triggers a full Teradata load. Worker 3 built the graph 2 minutes after Worker 1, so it reflects newer ETL data. Users hitting different workers see different lineage results for identical queries. This is functionally indistinguishable from "the app is broken" for end users.

**Why it happens:**
Gunicorn's process model is the exact wrong architecture for in-memory singletons. Each worker process is allocated its own address space — modifying a global variable in one process does not affect the same variable in other processes. Developers test with a single worker in development, everything works, and the problem only surfaces in multi-worker production. The existing Redis cache masks this because Redis is shared, but an in-memory graph is not Redis.

**How to avoid:**
1. Design the graph as a read-only structure built once at startup using Gunicorn's `--preload` flag — the master builds the graph, workers inherit it via copy-on-write, and reads don't trigger CoW page duplication
2. Use `--preload` only if DB connections are NOT opened at import time (they aren't in this app's `create_app()` factory pattern — the connection opens inside the factory, which is safe)
3. Limit to `--workers 1` with `--threads N` if the preload pattern proves unreliable — threads share address space natively
4. Accept that writes (ETL-triggered graph rebuilds) cannot propagate to forked workers without an external coordination mechanism (Redis pub/sub for rebuild notifications)
5. Test explicitly with `--workers 4` in staging — single-worker dev hides this entirely

**Warning signs:**
- Lineage results differ between requests for the same column at the same depth
- Some requests are fast (graph hit) and others are slow (graph miss) with no obvious pattern
- Log shows "building graph" multiple times per restart
- App works perfectly in `flask run` but fails mysteriously in production Gunicorn

**Phase to address:**
Phase 1 (In-Memory Graph Engine) — architectural decision must be made before any code is written. The choice of preload vs. threads vs. external coordination shapes everything else.

---

### Pitfall 2: Graph Rebuild Race Condition During ETL Updates

**What goes wrong:**
ETL job finishes at 2 AM, calls `/api/v2/cache/invalidate` (which already exists), then triggers graph rebuild. The graph rebuild is implemented as: acquire lock → drop old graph dict → load new rows from Teradata → build new adjacency dicts → release lock. A request arrives at `acquire lock` while the rebuild is in progress — it blocks. Then ETL is delayed, the rebuild takes 45 seconds on 100K rows, and 30 blocked requests pile up behind the lock. When the lock releases, 30 BFS traversals execute simultaneously on the fresh graph, CPU spikes to 100%, and the app becomes unresponsive for users.

**Why it happens:**
"Replace the graph atomically" sounds simple but is a two-phase operation: tear down + rebuild. Any gap between those phases is a window for blocked or failed requests. Developers don't anticipate rebuild time at production data scale (100K rows = non-trivial load time).

**How to avoid:**
1. Use a read-write lock pattern (`readerwriterlock` library) — allow unlimited concurrent reads, block only during write (rebuild)
2. Blue-green graph pattern: build the new graph into a separate variable (`_graph_building`), then atomically swap the reference (`_graph_active = _graph_building`) — zero downtime during rebuild
3. Never destroy the old graph before the new one is fully built — serve stale data during rebuild rather than blocking or erroring
4. Log rebuild start/end times and row counts — rebuild time is a key operational metric
5. Add a circuit breaker: if rebuild takes > 60s, abandon it and keep the old graph

**Warning signs:**
- Requests queue up immediately after ETL runs
- "Building graph" log entry followed by timeout errors
- CPU spike immediately after rebuild completes (pent-up requests)
- P99 latency spikes on ETL schedule cadence

**Phase to address:**
Phase 1 (In-Memory Graph Engine) — rebuild concurrency must be designed into the initial architecture, not added as a patch after production incidents.

---

### Pitfall 3: Memory Leak in Long-Running Flask Process from Graph Object Accumulation

**What goes wrong:**
The graph is rebuilt every ETL cycle. Each rebuild allocates a new set of Python dicts for adjacency lists (or a new networkx Graph object). The old graph object is dereferenced but Python's garbage collector doesn't immediately reclaim memory — especially if any request-handler closures or cache entries hold references to the old graph. After 10 ETL cycles, the process RSS grows from 400 MB to 1.2 GB. With Gunicorn workers, this multiplies by worker count. The app runs for 3 weeks until the server OOMs. This is invisible in dev (one rebuild) and staging (manual restarts).

**Why it happens:**
Python's GC collects objects with zero references, but cyclic references (common in graph data structures — node A points to edge, edge points to node A) require GC cycle collection, which is not immediate. Networkx graphs have cyclic internal structures. Closures in request handlers that capture a reference to the old graph prevent collection even after the graph variable is reassigned.

**How to avoid:**
1. Use Python's `gc.collect()` explicitly after graph swaps to force immediate cycle collection
2. Track process RSS before and after each rebuild with `resource.getrusage(resource.RUSAGE_SELF).ru_maxrss` — log it as a metric
3. Use `tracemalloc` or `memray` to profile memory in staging with simulated ETL cycles
4. Prefer plain Python dicts over networkx for the adjacency structure — networkx adds 5-10x memory overhead per node/edge due to attribute dicts (pure adjacency: `{node_id: set(neighbor_ids)}` is far leaner)
5. Set Gunicorn `--max-requests N` and `--max-requests-jitter M` to recycle workers after N requests, capping leak accumulation
6. Avoid storing the full `OL_COLUMN_LINEAGE` row data in the graph — store only the IDs and transformation type; fetch metadata on demand from Redis/DB

**Warning signs:**
- Process RSS grows monotonically after each ETL cycle
- `gc.get_count()` shows growing generation-2 count between rebuilds
- Memory reported as "available" in Redis (`INFO memory`) stays flat while Flask process RSS grows
- Workers being killed by OOM killer in production logs

**Phase to address:**
Phase 1 (In-Memory Graph Engine) — data structure choice (plain dict vs networkx) and GC discipline must be established at design time, not retrofitted.

---

### Pitfall 4: Stale In-Memory Graph After ETL — Three-Layer Consistency Problem

**What goes wrong:**
The system now has three sources of truth: Teradata (authoritative), Redis (cached query results), and the in-memory graph (derived from Teradata). ETL updates Teradata. The cache invalidation endpoint clears Redis. But the in-memory graph is not rebuilt — it silently serves pre-ETL lineage. Users hit the "Refresh" button, which calls `?refresh=true`, which bypasses Redis, which triggers a BFS on the in-memory graph — which is still stale. The user sees "fresh" data that is actually old. This is worse than obvious staleness because the user was explicitly told data is refreshed.

**Why it happens:**
Cache invalidation was designed for the two-layer system (Redis + Teradata). Adding the in-memory graph creates a third layer that the existing `/invalidate` endpoint knows nothing about. Developers wire the invalidation for Redis but forget the in-memory graph because it doesn't behave like a cache — it behaves like application state.

**How to avoid:**
1. Extend the existing `/api/v2/cache/invalidate` endpoint to ALSO trigger graph rebuild (or mark graph as stale) — single invalidation call clears all layers atomically from the caller's perspective
2. Add a `graph_version` integer that increments on each rebuild — Redis cache keys should embed this version so that Redis entries from the old graph are automatically invalid after rebuild
3. Document the three-layer architecture explicitly: Teradata → in-memory graph → Redis → client. Every layer's invalidation path must be tested
4. Test this flow explicitly: run ETL mock → call invalidate → call lineage API → verify result reflects ETL changes (not cached pre-ETL state)
5. Add a `X-Graph-Version` response header so clients can detect graph generation changes

**Warning signs:**
- Cache invalidation tests pass but lineage results don't change after ETL
- `?refresh=true` queries return same results as cached queries after ETL
- Graph rebuild logs don't appear after ETL-triggered invalidations
- Users report "data hasn't updated" after being told cache was cleared

**Phase to address:**
Phase 1 (In-Memory Graph Engine) for the architecture; Phase 3 (integration) for the explicit test that proves all three layers invalidate together.

---

### Pitfall 5: Progressive Depth Loading Causes Layout Thrash and Edge Jitter

**What goes wrong:**
Progressive loading delivers depth-1 results immediately, then depth-2 results as a second response, then depth-3. Each new depth batch triggers `setNodes` + `setEdges` + `layoutGraph()` (the custom topological layout). The depth-1 layout positions table nodes at x=0, y=0 and x=400, y=0. When depth-2 results arrive, new upstream tables are inserted and Kahn's algorithm re-runs — existing table nodes are reassigned different layer positions because their topological rank changed. The depth-1 nodes visibly jump from x=400 to x=800 (they were pushed right by the new upstream). Users see nodes teleporting as they watch, which is disorienting and looks like a bug. Edge splines also recalculate and animate to new endpoints.

**Why it happens:**
Topological layout assigns positions based on the global graph structure — adding any upstream node changes the relative depth of all downstream nodes. This is a fundamental property of layered layout algorithms, not a bug. The existing `layoutGraph()` function recalculates all positions from scratch on every call. It has no concept of "stable positions for already-rendered nodes."

**How to avoid:**
1. Show a loading skeleton/placeholder for the full expected graph extent during depth-1 load — do not commit node positions until the full requested depth is loaded
2. If incremental display is required, add a "position stability" pass: if a node's new computed position is within N pixels of its current position, keep its current position to avoid imperceptible-but-jarring micro-jumps
3. Disable CSS transitions during graph refreshes (`toggleTransitions(false)` — already used in the codebase) to prevent animated node teleporting
4. Consider a two-phase UX: depth-1 shows immediately with a "Loading more..." indicator; the full graph (all depths) replaces it once complete — no visible incremental updates
5. For the Zustand store update, batch all depth results into a single `setNodes`/`setEdges` call rather than updating on each depth response

**Warning signs:**
- Node positions change during graph load (visible teleport/jump)
- Edges animate to new endpoints as depth batches arrive
- User feedback: "nodes are moving around while I'm reading them"
- React Profiler shows multiple full layout cycles during a single graph load

**Phase to address:**
Phase 2 (Progressive Loading) — the UX model (skeleton vs. incremental vs. deferred) must be decided before implementation, as it fundamentally changes the API contract.

---

### Pitfall 6: SSE/Streaming Incompatible with Standard Gunicorn Sync Workers

**What goes wrong:**
Progressive depth loading is implemented using Server-Sent Events (SSE) or chunked HTTP streaming — the backend sends depth-1 results, then depth-2, then depth-3 over a single long-lived HTTP connection. This works in development (`flask run`, single-threaded). In production with Gunicorn sync workers, the SSE connection holds a worker thread for the entire streaming duration (potentially 5-10 seconds). With 4 sync workers and 4 concurrent users loading large graphs, all workers are busy and new requests queue indefinitely. The app appears hung for new users.

**Why it happens:**
Gunicorn's default sync worker model handles one request per worker at a time. SSE connections are long-lived by design. WSGI servers are synchronous by nature — they don't support concurrent request handling within a single worker without async primitives. This is a well-documented Flask-SSE limitation: "Server-sent events do not work with Flask's built-in development server because it handles HTTP requests one at a time."

**How to avoid:**
1. Do not use SSE with standard Gunicorn sync workers — it will starve the worker pool
2. If streaming is required, use Gunicorn with gevent workers (`--worker-class gevent`) — gevent patches I/O to be non-blocking so a streaming response doesn't block other requests
3. Simpler alternative: use polling — client makes separate requests for depth-1, then depth-2, etc. Each is a normal stateless request that completes quickly. No streaming, no worker starvation
4. Simplest alternative: accept slight latency, keep synchronous responses but respond with depth-1 first (fast, from in-memory graph), and a separate "enrich" endpoint for additional metadata
5. If threading is used instead of multiprocessing (`--worker-class gthread`), standard SSE works within the thread budget, but requires careful analysis of thread count vs concurrent stream count

**Warning signs:**
- All Gunicorn workers show status "busy" in process monitoring during graph loads
- New requests get 504 timeouts during periods of graph-loading activity
- Works fine in dev/test (single worker) but fails in production (multi-worker)
- Gunicorn access logs show requests piling up in queue

**Phase to address:**
Phase 2 (Progressive Loading) — streaming mechanism must be validated against the production WSGI worker model before implementation, not after.

---

### Pitfall 7: TanStack Query Cache Invalidation Gets Out of Sync with In-Memory Graph Rebuild

**What goes wrong:**
The frontend uses TanStack Query with `queryClient.setQueryData` to imperatively populate the cache when the user hits "Refresh" (already implemented in `LineageGraph.tsx`). Progressive loading adds more complexity: depth-1 data is stored in query cache entry A, depth-2 in entry A (updated), depth-3 in entry A (updated again). A second component navigates to the same column while depth loading is in progress — TanStack Query returns the partial depth-1 data from cache while the background depth-3 fetch is running. The second component renders an incomplete graph. When depth-3 arrives, `setQueryData` updates the cache and both components re-render — but the second component may have already triggered a user interaction on a node that no longer exists at its previous position.

**Why it happens:**
TanStack Query's cache is keyed by `[queryKey, depth, direction]`. Progressive loading either: (a) uses the same query key for all depths and updates in-place — confusing to other observers, or (b) uses different keys per depth — creates N cache entries that diverge when any depth is invalidated. Neither model is well-suited to "streaming accumulation" because TanStack Query is designed for atomic request/response cycles.

**How to avoid:**
1. Keep the existing single-response model for TanStack Query — one cache key returns the complete graph at the requested depth. Progressive loading is a separate, ephemeral display concern managed in local component state, not in the TanStack Query cache
2. If progressive loading does populate the cache incrementally, use `queryClient.cancelQueries` before each update to prevent stale observers from re-rendering on intermediate states
3. Add a `depth` parameter to the cache key — `['openlineage', 'lineage', datasetId, fieldName, direction, maxDepth, depth]` — so each depth level is an independent, stable cache entry that doesn't conflict
4. Never call `queryClient.setQueryData` with partial results that are structurally identical to complete results — use a distinct `partial: true` flag in the data to signal incompleteness
5. Test the scenario: two browser tabs on the same column, one triggering progressive load, verify the second tab doesn't show corrupted intermediate state

**Warning signs:**
- Graph renders with missing nodes that appear a moment later
- Console shows: "setQueryData called while query is fetching" warnings
- User clicks a node that disappears because depth loading added upstream nodes and layout shifted
- Different browser tabs show different graph states for the same column

**Phase to address:**
Phase 2 (Progressive Loading) — the TanStack Query data model for progressive loading must be explicitly designed. The current pattern (`queryClient.setQueryData` in `handleRefresh`) is a good model to extend, not replace.

---

### Pitfall 8: Graph Data Structure Choice Doesn't Scale to 100K Rows per Worker

**What goes wrong:**
The in-memory graph is implemented as a networkx `DiGraph`. NetworkX is a pure Python library that stores each node and edge as nested Python dicts. For 100K `OL_COLUMN_LINEAGE` rows: each edge stores source_id, target_id, transformation_type plus internal networkx metadata — approximately 800-1000 bytes per edge in networkx. 100K edges = ~100 MB per worker, times 4 workers = 400 MB just for the graph. The full process RSS including Flask, imports, and Redis client approaches 600 MB per worker. On a 4GB server, this exhausts memory before handling any traffic.

**Why it happens:**
NetworkX is the "default" Python graph library developers reach for, but it is explicitly not designed for production memory efficiency: "The heavy memory requirements of networkx limit its potential to be used as a production tool in realistic contexts with huge graphs." Its nested dict design for arbitrary attribute storage has 5-10x overhead vs. a bare adjacency list for simple traversal.

**How to avoid:**
1. Use plain Python dicts for the adjacency structure — `upstream: dict[str, list[str]]` and `downstream: dict[str, list[str]]` where keys are `"dataset.field"` strings. This is sufficient for BFS/DFS traversal. Memory: ~150 bytes per edge (string keys + list overhead) = 15 MB for 100K edges
2. Store transformation types in a separate flat dict keyed by `"source->target"` — only fetched when needed for graph rendering, not for traversal
3. If networkx features are needed (cycle detection, shortest path), load networkx lazily for specific operations, not as the persistent store
4. Benchmark memory with realistic data before committing to a structure: load a sample of 100K rows from Teradata and measure `resource.getrusage().ru_maxrss` before/after graph construction
5. Consider igraph as a middle ground if traversal performance matters more than memory: igraph uses C internals (32 bytes per edge) vs Python dicts, but still has a Python API

**Warning signs:**
- Process RSS exceeds 200 MB per worker with a small test dataset
- Gunicorn workers are OOM-killed before serving their first request
- Time to build graph from Teradata is slow (networkx's `add_edge` is slower than dict writes)
- `sys.getsizeof(graph)` returns surprisingly small number (doesn't count referenced dicts — use `objgraph` or `pympler` for real size)

**Phase to address:**
Phase 1 (In-Memory Graph Engine) — structure choice must be validated on production-scale data before building BFS/DFS traversal on top of it. The wrong structure requires a complete rewrite of traversal logic.

---

## Moderate Pitfalls

### Pitfall 9: Data Normalization During Graph Load Creates Inconsistency with Existing Cache Keys

**What goes wrong:**
One of the v4.0 goals is normalizing TRIM() at write time — stripping whitespace from dataset and field names in the adjacency structure. BFS traversal on the normalized graph uses `"demo_user.customer"` as a key. But existing Redis cache keys were built using the old `TRIM(?)` parameterized query pattern — they embed the raw string `"demo_user.customer "` (with trailing space) from Teradata. After the in-memory graph goes live, Redis cache hits use normalized keys, but any cache entries written by the old CTE path (during the transition) use un-normalized keys. The two key spaces collide: normalized graph → normalized key → Redis miss → BFS traversal; old CTE path → un-normalized key → Redis hit → returns old CTE result. Inconsistent results depending on whether the Redis key was populated before or after the migration.

**How to avoid:**
1. Flush all existing Redis cache keys when deploying the in-memory graph (extend the `invalidate_all` call to the deployment runbook)
2. Normalize cache key generation in `cache/keys.py` at the same time as normalization is added to the graph loader — both must use the same normalized form
3. Add normalization at the boundary where data enters the system (the `populate_lineage.py` ingest), not at query time — then there is only one key space by definition

**Warning signs:**
- Cache hit rates drop to near-zero after deployment despite Redis containing entries
- Some queries return correct results, others return old results, with no apparent pattern
- `cache/keys.py` and the graph loader use different whitespace handling

**Phase to address:**
Phase 1 (normalization) and Phase 3 (integration) — verify cache key alignment explicitly in integration testing.

---

### Pitfall 10: BFS Depth Limiting Differs from Recursive CTE Depth Semantics

**What goes wrong:**
The existing recursive CTE counts depth as "hops from the starting column." BFS in Python counts depth as "levels from the starting node." These are equivalent for simple graphs. But the CTE uses `depth < max_depth` (exclusive upper bound) and the BFS implementation uses `depth <= max_depth` (inclusive). Off-by-one: CTE with `max_depth=5` returns columns 4 hops away; BFS with `max_depth=5` returns columns 5 hops away. Users who are accustomed to "depth 5 shows my full lineage" find that the in-memory graph now shows one extra level. The graph is technically "more correct" but it breaks user expectations and increases response size unexpectedly.

**How to avoid:**
1. Write explicit test cases for boundary depths before replacing the CTE: verify that BFS and CTE return identical results for `max_depth=1`, `max_depth=3`, `max_depth=5` on the same test data
2. Match the CTE's exclusive depth bound in BFS: `if current_depth >= max_depth: continue` (not `>`
3. Use the existing `insert_cte_test_data.py` patterns (CYCLE5, NESTED_DIAMOND, FANOUT10) to verify BFS produces identical output to CTE before the cutover

**Warning signs:**
- Integration tests comparing BFS output to baseline CTE output fail only at boundary depths
- User reports seeing "more columns than expected" at the same depth settings
- Response payload size increases by ~20% after migration (one extra depth level)

**Phase to address:**
Phase 1 (In-Memory Graph Engine) — BFS semantics must match CTE semantics exactly before the old path is removed.

---

### Pitfall 11: Graph Singleton Initialization Blocks First Request (Cold Start)

**What goes wrong:**
The in-memory graph is loaded lazily on first request — the first user to access lineage after a restart waits 30-60 seconds while the app loads 100K rows from Teradata and builds adjacency dicts. All subsequent requests are fast. This first-request penalty is invisible in testing (always hit when the graph is warm), but users who restart the service during business hours will get a timeout or a very slow response. They'll assume the server is broken and file an incident.

**How to avoid:**
1. Eager initialization: build the graph in the application factory (`create_app()`) before the server starts accepting requests — Flask's `@app.before_first_request` is deprecated in Flask 2.3+; use explicit initialization in the factory
2. Gunicorn `--preload` combined with graph initialization in module scope ensures the graph is ready before any worker forks
3. Add a readiness check to the `/health` endpoint that returns 503 until the graph is fully loaded — load balancers will withhold traffic until ready

**Warning signs:**
- First request after restart consistently times out or takes 30+ seconds
- Health checks pass immediately after restart but first lineage requests fail
- "Graph building" log entries appear in response to the first user request, not at startup

**Phase to address:**
Phase 1 (In-Memory Graph Engine) — eager vs. lazy initialization decision is part of the initial architecture.

---

### Pitfall 12: React Flow Re-Render Storm from setNodes Called on Each Progressive Depth Batch

**What goes wrong:**
Progressive loading calls `setNodes(prev => [...prev, ...newNodes])` and `setEdges(prev => [...prev, ...newEdges])` on each depth batch. React Flow's internal state subscribers detect changes and trigger re-renders of all mounted node components. With 50 existing nodes and 3 depth batches arriving 200ms apart, the graph re-renders 3 complete times. With `useLineageHighlight` and `useDatabaseClustersFromNodes` as computed values derived from `nodes`, those also recompute 3 times. Each full re-render of 50 nodes with column rows takes ~40ms (baseline from Phase 18 benchmarks). Three batches = 120ms of blocking render work during load, causing visible jank.

**Why it happens:**
React batches state updates from event handlers but does NOT batch state updates that arrive asynchronously (from polling or streaming). Each `setNodes` call is a separate asynchronous update that triggers its own render cycle. The existing `filteredNodesAndEdges` `useMemo` and `clusters` `useDatabaseClustersFromNodes` both depend on nodes — they recompute on every batch.

**How to avoid:**
1. Batch all depth results at the data layer — the backend returns a single response containing all depths (or the frontend waits for all polling responses before calling `setNodes`/`setEdges` once)
2. If incremental rendering is required, use React 18's `useTransition` to mark progressive updates as non-urgent — React defers them during user interactions
3. Gate the layout computation (`layoutGraph`) to run only once, on the final depth batch — not on intermediate batches. Use a `pendingDepth` counter in the component to track when the last batch arrives
4. The existing `cancelled` ref pattern in `LineageGraph.tsx` (cancelling stale layout promises) is the right model to extend — ensure it gates on batch completion, not on each arrival

**Warning signs:**
- React Profiler shows 3+ renders of `LineageGraph` during a single progressive load
- `useProfiler('LineageGraph')` `onRender` callback fires multiple times in rapid succession
- Frame drops visible during graph load when progressive updates are enabled
- `useDatabaseClustersFromNodes` is called more times than there are depth levels

**Phase to address:**
Phase 2 (Progressive Loading frontend) — batching strategy must be decided before wiring up polling or streaming on the frontend.

---

## Minor Pitfalls

### Pitfall 13: API Timing Headers Add Overhead If Not Implemented Carefully

**What goes wrong:**
The v4.0 goal includes timing headers (`X-Graph-Build-Time`, `X-BFS-Time`, etc.) for performance observability. Naive implementation wraps each BFS call with `time.perf_counter()` — fine. But if timing is also collected per-edge or per-depth (to help diagnose why a specific graph is slow), the overhead of the timing code exceeds the time saved by the in-memory graph. Python function call overhead is ~100ns; if timing is collected at each BFS dequeue (100K operations), that's 10ms of timing overhead on a 5ms BFS traversal.

**How to avoid:**
Collect timing at coarse granularity: graph load time, BFS traversal time, response serialization time. Not per-node or per-edge. Use `time.perf_counter()` with three `t0/t1/t2` checkpoints, not a decorator on inner loop functions.

**Phase to address:**
Phase 2 (API observability) — timing instrumentation design.

---

### Pitfall 14: Depth=1 "Instant" Promise is Broken If Graph Is Cold

**What goes wrong:**
The v4.0 goal promises "depth=1 instant." This is only true if the in-memory graph is warm. If the graph is cold (just rebuilt or first start), depth=1 falls back to the Teradata CTE path, which is not instant. Users who click a column immediately after an ETL rebuild see the old "slow" behavior and assume the feature didn't ship. The gap between "graph warm" and "graph cold" behavior is larger than the gap was before the migration.

**How to avoid:**
1. Guarantee that graph rebuilds happen out-of-band, never on the request path
2. During graph rebuild, continue serving from the old graph (blue-green swap) — there is no "cold" period visible to users
3. The health endpoint should not report "ready" until the graph is fully built

**Phase to address:**
Phase 1 (In-Memory Graph Engine) — warm/cold transition behavior is part of the core design.

---

## Technical Debt Patterns

Shortcuts that seem reasonable during implementation but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Use networkx for the graph because it's familiar | Faster initial development | 5-10x memory overhead; 400 MB per worker at 100K edges | Only for prototype/benchmarking, never production |
| Lazy graph initialization on first request | Simpler startup code | Cold-start penalty; first user after restart gets timeout | Never — eager init during app factory is equally simple |
| Per-depth polling without batching | Simpler streaming design | React re-render storm on each batch; jank during load | Only if graphs are small (< 20 nodes per depth level) |
| Skip blue-green graph swap; rebuild in-place | Less code | Requests fail or block during rebuild | Never — rebuild time at 100K rows is non-trivial |
| Use the same cache keys for in-memory BFS and old CTE results | No key changes needed | Cache entries from old CTE path poison in-memory BFS cache and vice versa | Never — flush Redis on migration day explicitly |
| Test progressive loading with 1 Gunicorn worker | Fast iteration | Hides multi-worker graph inconsistency; SSE worker starvation invisible | Dev only, never for staging sign-off |
| Store full edge metadata (all OL_COLUMN_LINEAGE columns) in adjacency dict | Avoids second lookup for metadata | Graph memory 3-5x larger; defeats purpose of lean adjacency structure | Only if response time is more important than memory |
| Skip BFS/CTE semantic equivalence tests | Faster to ship | Off-by-one depth bugs; users see "wrong" lineage | Never — equivalence tests are the migration correctness gate |

---

## Integration Gotchas

Common mistakes when connecting the three-layer stack (Teradata → In-Memory Graph → Redis → Frontend).

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| In-memory graph + Gunicorn | Using a module-level global in multi-worker deployment | Use `--preload` for read-only graph (CoW safe) or `--workers 1 --threads N` |
| In-memory graph + Redis | Not flushing Redis when graph normalization changes key format | Flush Redis as part of deployment runbook; add version to cache key prefix |
| In-memory graph + ETL invalidation | `/invalidate` endpoint clears Redis but not the graph | Extend invalidation endpoint to also trigger graph rebuild or graph stale flag |
| Progressive loading + TanStack Query | Using same cache key for partial and complete data | Use separate keys per depth OR local state for progressive display, TanStack Query for final result |
| Progressive loading + layoutGraph | Running layout on each depth batch | Gate layout to run only on final batch; use `cancelled` ref pattern already in codebase |
| BFS traversal + existing Redis cache | BFS results stored under different key format than CTE results | Normalize both path: use `cache/keys.py` for all key generation; BFS must use same keys as CTE |
| SSE streaming + Gunicorn sync workers | Long-lived SSE connection starves worker pool | Use polling (stateless requests) or gevent workers (`--worker-class gevent`) |
| Graph rebuild + active BFS requests | Tearing down old graph while BFS is traversing it | Blue-green swap: build new graph, swap reference atomically; never destroy old graph first |

---

## Performance Traps

Patterns that work at small scale (dev test data) but fail at production scale (100K rows).

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| NetworkX graph as persistent store | Memory exhaustion; workers OOM at startup | Plain Python dict adjacency: `dict[str, list[str]]` | > 50K edges per worker |
| Lazy graph initialization | First request timeout 30-60s; users file incident | Eager init in app factory; health returns 503 until ready | Every cold start |
| In-place graph rebuild (no blue-green swap) | Blocked requests during rebuild; pent-up CPU spike on release | Build new graph → atomic reference swap → GC old graph | Any rebuild > 1 second |
| setNodes/setEdges on each progressive batch | Multiple full re-renders during load; jank | Batch at data layer; call setNodes once with complete data | > 20 nodes per batch |
| BFS without explicit visited set | Exponential traversal on diamond/cycle patterns | Always track visited node IDs; the CTE path tracking is the equivalent | Any graph with diamonds or cycles (lineage has many) |
| Storing full row data in adjacency dict | Memory 3-5x higher than necessary | Store only IDs and transformation type; fetch metadata separately | > 30K edges in-memory |
| Global graph rebuilt on every ETL run | Unnecessary rebuilds when ETL adds no new lineage | Track ETL row count or hash; skip rebuild if unchanged | High-frequency ETL (hourly or more) |
| SSE with sync Gunicorn workers | All workers busy; new requests timeout | Polling pattern or gevent workers | > workers/4 concurrent users loading graphs |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Exposing graph rebuild endpoint publicly | Adversary triggers repeated rebuilds, exhausting Teradata connections | Protect `/invalidate` with secret token or restrict to internal network only (already a concern for the existing endpoint) |
| Storing sensitive column/table names in process memory indefinitely | In-memory graph is accessible via heap dumps; lineage data is metadata about data | Accept this risk for an internal tool; document it explicitly |
| No timeout on BFS traversal | Malicious depth=50 request triggers O(n) BFS consuming CPU for minutes | Apply `max_depth` cap at the BFS level, not just the HTTP parameter level |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Node positions shift as depth batches arrive | Disorienting; looks broken | Full-depth skeleton → single layout render; or two-phase (depth-1 immediate, then "load all" replaces) |
| "Instant" depth-1 shows incomplete lineage without clear indication | User thinks lineage is sparse; doesn't realize more is loading | Show loading indicator for additional depths alongside depth-1 result; "Showing 1 of 3 depth levels" |
| ETL rebuild causes briefly stale graph during blue-green swap | Users see data from 5 minutes ago | Show "Data last updated: N minutes ago" timestamp; users understand context |
| Graph cold-start timeout with no feedback | User sees loading spinner for 60s, assumes app is broken | 503 + "Service initializing, please retry in 30s" during cold start; use readiness probe |
| Edge jitter when new nodes added upstream shift existing layout | Perceived as animation bug | Disable transitions during progressive updates (existing `toggleTransitions(false)` mechanism) |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **In-Memory Graph:** BFS tested with production-scale data (100K edges) for memory and latency — verify worker RSS stays under target
- [ ] **BFS Semantics:** BFS and CTE produce identical results for same inputs at all depth levels — verify with CYCLE5, NESTED_DIAMOND, FANOUT10 test patterns
- [ ] **Multi-Worker Safety:** Tested with `--workers 4` in staging — verify all workers serve consistent lineage from same graph generation
- [ ] **Graph Rebuild:** Blue-green swap tested with concurrent requests — verify zero requests fail or block during ETL rebuild
- [ ] **Three-Layer Invalidation:** ETL → invalidate → verify graph rebuilt → verify Redis cleared → verify client sees updated lineage — all steps in a single test
- [ ] **Progressive Loading UX:** Node positions stable (no jumps) after all depth batches arrive — verify no position delta > 1px for previously rendered nodes
- [ ] **SSE/Polling Worker Safety:** Concurrent graph loads tested with multiple workers — verify no worker starvation under load
- [ ] **Cold Start:** Health endpoint returns 503 until graph is fully built — verify load balancer withholds traffic during initialization
- [ ] **Memory Leak:** Process RSS tracked across 3 ETL rebuild cycles — verify RSS does not grow monotonically

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Multi-worker graph inconsistency in production | MEDIUM | Restart with `--workers 1 --threads 4`; implement `--preload` properly; re-test with N workers |
| Graph rebuild blocking requests | LOW | Add blue-green swap; deploy fix; old graph continues serving during next rebuild |
| Memory leak accumulating across ETL cycles | MEDIUM | Add `--max-requests 1000` to Gunicorn; implement `gc.collect()` after swap; profile with memray |
| Stale in-memory graph after ETL (three-layer inconsistency) | LOW | Extend invalidation endpoint to trigger rebuild; flush Redis; one deploy |
| Node position jitter during progressive loading | MEDIUM | Switch to single-render model (no incremental display); one UI behavior change |
| SSE worker starvation in production | HIGH | Switch from SSE to polling; requires backend + frontend change; plan 2-4 hour incident window |
| TanStack Query partial-data cache poisoning | LOW | Clear TanStack cache on navigation; use distinct cache keys per depth; component fix |
| BFS off-by-one depth vs CTE | MEDIUM | Add equivalence test suite; fix BFS bounds; re-run all 73 DB tests |
| networkx OOM in production | HIGH | Rewrite adjacency structure to plain dicts; full graph engine rebuild; 1-3 days |

---

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Multi-worker graph inconsistency | Phase 1 (architecture) | Load test with `--workers 4`, all workers return same results |
| Graph rebuild race condition | Phase 1 (architecture) | Concurrent requests during ETL rebuild return valid results, no timeouts |
| Memory leak across rebuilds | Phase 1 (data structure design) | RSS stable across 3 simulated ETL cycles |
| Three-layer cache inconsistency | Phase 1 (design) + Phase 3 (integration test) | ETL → invalidate → lineage API returns updated data end-to-end |
| Progressive loading layout jitter | Phase 2 (UX design decision) | Node positions do not change for previously rendered nodes when new depth arrives |
| SSE/Gunicorn incompatibility | Phase 2 (architecture) | Concurrent graph loads with `--workers 4` do not starve worker pool |
| TanStack Query partial cache | Phase 2 (frontend) | Two components on same column during progressive load show same final state |
| Graph data structure memory | Phase 1 (spike: benchmark memory at 100K edges) | Worker RSS under target with production-scale data |
| BFS/CTE semantic equivalence | Phase 1 (before CTE removal) | Test suite confirms identical output for all depth values on all test patterns |
| Data normalization key mismatch | Phase 1 (normalization) + deployment runbook | Redis flush on deploy; cache hit rate normal within 5 minutes |
| Cold start penalty | Phase 1 (eager init design) | Health returns 503 until graph ready; first user request < 500ms |
| React re-render storm | Phase 2 (batching design) | React Profiler shows single render cycle per graph load, not per depth batch |

---

## Phase-Specific Research Flags

**Phase 1 (In-Memory Graph Engine):**
- HIGH confidence: multi-worker isolation is a well-understood Gunicorn behavior
- HIGH confidence: blue-green swap pattern for atomic reference replacement
- MEDIUM confidence: memory footprint at 100K edges — depends on data (column name lengths, average degree). Needs a spike with production data sample before committing to data structure
- MEDIUM confidence: preload_app safety with the existing connection lifecycle — factory pattern creates connection inside `create_app()`, not at module scope, which appears fork-safe; verify experimentally
- LOW confidence: whether `gc.collect()` timing is predictable enough to prevent RSS growth between collections — may need `--max-requests` as backup

**Phase 2 (Progressive Loading):**
- HIGH confidence: SSE+sync workers is incompatible — well-documented limitation
- MEDIUM confidence: polling interval tuning — depends on how fast BFS is at each depth; needs measurement with production data
- MEDIUM confidence: React `useTransition` effectiveness for progressive node additions — requires profiling with the actual graph component
- LOW confidence: "position stability" algorithm to prevent node jitter during incremental adds — no reference implementation found; may need custom logic

**Phase 3 (Integration):**
- HIGH confidence: three-layer invalidation test structure is straightforward to implement
- HIGH confidence: existing `/invalidate` endpoint is the right extension point
- MEDIUM confidence: end-to-end latency targets achievable — depends on Teradata connectivity and graph size in production

---

## Sources

**Gunicorn Worker Model and Shared State:**
- [Gunicorn Application Preloading - Joel Sleppy](https://www.joelsleppy.com/blog/gunicorn-application-preloading/)
- [Sharing data across workers in a Gunicorn + Flask application - Medium](https://medium.com/@jgleeee/sharing-data-across-workers-in-a-gunicorn-flask-application-2ad698591875)
- [Rippling's Gunicorn pre-fork journey - Rippling Engineering](https://www.rippling.com/blog/rippling-gunicorn-pre-fork-journey-memory-savings-and-cost-reduction)
- [How to share in memory resources between Flask methods when deploying with Gunicorn - AppSloveWorld](https://www.appsloveworld.com/coding/flask/3/how-to-share-in-memory-resources-between-flask-methods-when-deploying-with-gunico)

**Flask SSE and WSGI Streaming Limitations:**
- [Server-sent events in Flask without extra dependencies - Max Halford](https://maxhalford.github.io/blog/flask-sse-no-deps/)
- [Flask-SSE Quickstart documentation](https://flask-sse.readthedocs.io/en/latest/quickstart.html)
- [How to use Flask with gevent - iximiuz](https://iximiuz.com/en/posts/flask-gevent-tutorial/)

**Python Graph Library Memory Characteristics:**
- [graph-tool performance comparison](https://graph-tool.skewed.de/performance.html)
- [Benchmark of popular graph/network packages - timlrx](https://www.timlrx.com/blog/benchmark-of-popular-graph-network-packages/)
- [NetworkX memory issue discussion](https://groups.google.com/g/networkx-discuss/c/Etd4GpkjPdA)
- [igraph memory: 32 bytes per edge vs. NetworkX ~100+ bytes per edge](https://groups.google.com/g/networkx-discuss/c/dmfkwgY2llQ)

**React Flow Incremental Update Pitfalls:**
- [React Flow Performance documentation](https://reactflow.dev/learn/advanced-use/performance)
- [Progressive loading for big diagrams - React Flow GitHub Discussion #3033](https://github.com/xyflow/xyflow/discussions/3033)
- [Simultaneous updateNodeData/updateEdgeData freeze issue - GitHub #4779](https://github.com/xyflow/xyflow/issues/4779)
- [The Ultimate Guide to Optimize React Flow Project Performance - Synergy Codes](https://www.synergycodes.com/webbook/guide-to-optimize-react-flow-project-performance)

**TanStack Query Cache Behavior:**
- [Query Invalidation - TanStack Query v5 docs](https://tanstack.com/query/v5/docs/framework/react/guides/query-invalidation)
- [setQueryData stale time interaction - TanStack GitHub Discussion #4716](https://github.com/TanStack/query/discussions/4716)
- [invalidateQueries race condition - TanStack GitHub Issue #8060](https://github.com/TanStack/query/issues/8060)

**Python Threading and Read-Write Locks:**
- [readerwriterlock - PyPI](https://pypi.org/project/readerwriterlock/)
- [Python Thread Safety - Real Python](https://realpython.com/python-thread-lock/)
- [Data Races in Python Despite the GIL - verdagon.dev](https://verdagon.dev/blog/python-data-races)

**Redis Pub/Sub for Multi-Process Cache Invalidation:**
- [Managing In-Memory Cache Invalidation Using Redis Pub/Sub - Osmos](https://osmos-tech-blog.medium.com/managing-in-memory-cache-invalidation-using-redis-pub-sub-c2bd60c13b69)

**Python Memory Profiling:**
- [Debugging Python server memory leaks with the Fil profiler - Python Speed](https://pythonspeed.com/articles/python-server-memory-leaks/)

**Project-Specific Sources (Codebase):**
- `lineage-api/python_server.py` — app factory pattern; connection created inside `create_app()`, not module scope (fork-safe)
- `lineage-api/cache/invalidation.py` — existing Redis invalidation (SCAN-based, two-layer only)
- `lineage-api/cache/__init__.py` — Redis graceful degradation pattern (model for graph build fallback)
- `lineage-api/repositories/lineage_repository.py` — CTE depth semantics (`depth < max_depth` exclusive)
- `lineage-ui/src/components/domain/LineageGraph/LineageGraph.tsx` — `cancelled` ref pattern, `handleRefresh` with `setQueryData`, `toggleTransitions` usage
- `lineage-ui/src/utils/graph/layoutEngine.ts` — Kahn's topological sort; position assignment from global graph structure (explains jitter on partial data)
- `lineage-ui/src/components/domain/LineageGraph/LargeGraphWarning.tsx` — `LARGE_GRAPH_THRESHOLD` (existing large-graph guard; in-memory graph may increase what reaches the frontend)

---
*Pitfalls research for: Adding in-memory graph engine + progressive loading to Flask+React Teradata lineage app*
*Researched: 2026-02-20*
*Milestone: v4.0 First-Time Load Performance*
