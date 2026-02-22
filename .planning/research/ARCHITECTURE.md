# Architecture Research: In-Memory Graph Engine + Progressive Loading

**Domain:** Data lineage graph — in-memory traversal engine + depth-progressive API
**Researched:** 2026-02-20
**Confidence:** HIGH (backend integration points), MEDIUM (progressive loading API contract), HIGH (frontend TanStack Query patterns)

## Context

This document covers **only** the integration of two new features into the existing Flask repository/service architecture:

1. **In-memory graph engine** — load all `OL_COLUMN_LINEAGE` rows into a Python adjacency structure at startup, traverse in Python instead of via Teradata recursive CTEs
2. **Progressive depth loading** — API returns depth-1 results immediately, then depth-2, then depth-N, letting the frontend render incrementally rather than waiting for full traversal

The existing stack (Flask, LineageRepository, LineageService, Redis, TanStack Query, React Flow) is unchanged in structure. This milestone adds a new layer between the repository and the database, and changes the API contract for lineage endpoints.

---

## System Overview

### Current Architecture (what exists)

```
Frontend (React + TanStack Query)
    |
    | REST GET /api/v2/openlineage/lineage/{id}/{field}?maxDepth=5
    v
Blueprint (routes/openlineage.py)
    |
    v
LineageService
    |  get_column_lineage_graph()
    |  get_table_lineage_graph()
    v
LineageRepository (cache-aside via Redis)
    |  _cache_get_or_compute()
    |  get_upstream_lineage()    --> Teradata recursive CTE
    |  get_downstream_lineage()  --> Teradata recursive CTE
    |  get_database_lineage()    --> Teradata recursive CTE
    v
Teradata (OL_COLUMN_LINEAGE, OL_DATASET, OL_NAMESPACE, OL_DATASET_FIELD)
```

### Target Architecture (after this milestone)

```
Frontend (React + TanStack Query)
    |
    | SSE stream OR polling: GET /api/v2/openlineage/lineage/{id}/{field}/stream?maxDepth=5
    | (existing endpoint stays for backward compat)
    v
Blueprint (routes/openlineage.py) -- MODIFIED: new /stream route
    |
    v
LineageService -- MODIFIED: new get_progressive_lineage_stream()
    |
    v
GraphEngine (NEW singleton in lineage-api/graph/)
    |  traverse_upstream(node, depth=1)
    |  traverse_downstream(node, depth=1)
    |  -- walks in-memory adjacency dict, no DB roundtrip
    v
GraphStore (in-memory, loaded at startup)
    | adj_forward: dict[node_id, set[edge]]
    | adj_backward: dict[node_id, set[edge]]
    | node_meta: dict[node_id, NodeMeta]
    |
    | ALSO: Redis still caches full-depth serialized results
    |       for non-streaming callers
    v
Teradata (one-time full load of OL_COLUMN_LINEAGE on startup)
           -- LineageRepository.load_all_lineage() (NEW method)
```

### Component Responsibilities

| Component | Status | Responsibility | Communicates With |
|-----------|--------|----------------|-------------------|
| `graph/store.py` (GraphStore) | NEW | Holds all lineage edges + node metadata in memory. Adjacency dicts. Thread-safe reads. | Loaded once by GraphEngine at startup |
| `graph/engine.py` (GraphEngine) | NEW | Traverses GraphStore by depth, yields layers. Cycle detection. Returns edge lists per depth level. | GraphStore (reads), LineageService (called by) |
| `graph/loader.py` (GraphLoader) | NEW | Queries Teradata for full OL_COLUMN_LINEAGE + OL_DATASET + OL_DATASET_FIELD, builds GraphStore. Runs once at startup, again on invalidation. | LineageRepository (delegates full-load query) |
| `LineageRepository` | MODIFIED | Adds `load_all_lineage()` method returning all active rows. Existing CTE methods remain for fallback. | Teradata, GraphLoader |
| `LineageService` | MODIFIED | Adds `get_progressive_lineage_stream()` generator. Existing methods remain, optionally backed by GraphEngine. | GraphEngine (new), LineageRepository (existing) |
| `routes/openlineage.py` | MODIFIED | Adds `/lineage/{id}/{field}/stream` SSE route. Existing routes unchanged. | LineageService |
| `cache/invalidation.py` | MODIFIED | Adds `invalidate_graph_store()` — triggers GraphLoader to reload after ETL runs. | GraphLoader, Redis |
| Frontend `useOpenLineage.ts` hooks | MODIFIED | New `useProgressiveLineage()` hook reads from SSE stream, accumulates depth slices into TanStack Query cache via `setQueryData`. | Backend SSE endpoint |
| Frontend `useLoadingProgress.ts` | MODIFIED | Adds `depth_loading` stage between `fetching` and `layout`. | LineageGraph.tsx |

---

## Where to Place the In-Memory Graph

### Decision: Module-Level Singleton in Flask Process

**Use a module-level singleton** (`graph/engine.py` exposes `get_graph_engine()` returning a cached instance), **not** `flask.g`, `app.extensions`, or a separate process.

**Rationale:**

Flask's `g` is request-scoped — it dies after each request, making it wrong for persistent state. `app.extensions` is a valid option but adds indirection with no benefit here. A separate process (Celery worker) adds deployment complexity for a read-only in-memory structure.

The gunicorn multi-worker isolation problem (workers don't share memory) is **accepted as a constraint**: deploy with `--workers 1 --threads N` (threading mode). This is already the typical deployment for this app (single Teradata connection, no horizontal scale requirement). Each worker loads its own GraphStore independently on startup.

```python
# lineage-api/graph/engine.py
import threading
from graph.store import GraphStore
from graph.loader import GraphLoader

_engine_instance: "GraphEngine | None" = None
_engine_lock = threading.Lock()

def get_graph_engine() -> "GraphEngine":
    global _engine_instance
    if _engine_instance is None:
        with _engine_lock:
            if _engine_instance is None:  # double-checked locking
                _engine_instance = GraphEngine()
                _engine_instance.initialize()
    return _engine_instance

def invalidate_graph_engine():
    """Called after ETL run. Forces next get_graph_engine() to reload."""
    global _engine_instance
    with _engine_lock:
        _engine_instance = None
```

**Thread safety:** GraphStore is read-only after initialization. Multiple request threads read concurrently without locks. The `_engine_lock` protects only the initialization path (double-checked locking). This is safe for CPython's GIL.

**Alternative rejected: `app.extensions`**

```python
# Rejected — valid but adds indirection for no benefit
app.extensions["graph_engine"] = GraphEngine()
# Requires flask.current_app in every caller, harder to test
```

---

## Replacing CTE Calls Transparently

### Dual-Path Strategy: GraphEngine First, CTE Fallback

The `LineageService` checks whether `GraphEngine` is ready before deciding which path to use. This preserves all existing CTE behavior during startup and on engine failure.

```python
# lineage-api/services/lineage_service.py (MODIFIED)

from graph.engine import get_graph_engine

class LineageService:
    def get_column_lineage_graph(self, dataset_id, field_name, direction="both", max_depth=5):
        """Existing signature preserved. Internally may use GraphEngine."""
        try:
            engine = get_graph_engine()
            if engine.is_ready():
                return self._get_graph_from_engine(engine, dataset_id, field_name, direction, max_depth)
        except Exception as e:
            logger.warning("graph_engine_unavailable", error=str(e))
            # fall through to CTE path

        # Original CTE path (unchanged)
        return self._get_graph_from_cte(dataset_id, field_name, direction, max_depth)

    def _get_graph_from_engine(self, engine, dataset_id, field_name, direction, max_depth):
        """Traverse in-memory graph. Returns same shape as CTE path."""
        dataset_name = self.dataset_repo.get_dataset_name(dataset_id)  # still needs DB for name resolution
        edges = engine.traverse(dataset_name, field_name, direction, max_depth)
        return self._build_response_from_edges(dataset_id, field_name, edges)

    def get_progressive_lineage_stream(self, dataset_id, field_name, direction="both", max_depth=5):
        """NEW: Generator yielding graph slices by depth. For SSE route."""
        engine = get_graph_engine()
        dataset_name = self.dataset_repo.get_dataset_name(dataset_id)

        accumulated_nodes = {}
        accumulated_edges = []

        for depth_level in range(1, max_depth + 1):
            new_edges = engine.traverse_depth_slice(dataset_name, field_name, direction, depth_level)
            if not new_edges and depth_level > 1:
                break  # No more reachable nodes at this depth

            new_nodes, new_edge_dicts = self._edges_to_nodes_and_edges(new_edges, accumulated_nodes)
            accumulated_nodes.update(new_nodes)
            accumulated_edges.extend(new_edge_dicts)

            yield {
                "depth": depth_level,
                "is_final": depth_level == max_depth or not new_edges,
                "graph": {
                    "nodes": list(accumulated_nodes.values()),
                    "edges": accumulated_edges
                }
            }
```

### What LineageRepository.load_all_lineage() Looks Like (NEW method)

```python
# lineage-api/repositories/lineage_repository.py (MODIFIED — add one method)

def load_all_lineage(self):
    """
    Full table scan of OL_COLUMN_LINEAGE. Called once at startup by GraphLoader.
    NOT cached in Redis — GraphStore IS the cache.

    Returns:
        Iterator of dicts with: source_dataset, source_field, target_dataset,
        target_field, transformation_type, namespace
    """
    with self.connection.cursor() as cur:
        cur.execute("""
            LOCKING ROW FOR ACCESS
            SELECT
                source_namespace, source_dataset, source_field,
                target_namespace, target_dataset, target_field,
                transformation_type
            FROM OL_COLUMN_LINEAGE
            WHERE is_active = 'Y'
        """)
        for row in cur:
            yield {
                "source_namespace": self._strip(row[0]) or "",
                "source_dataset":   self._strip(row[1]) or "",
                "source_field":     self._strip(row[2]) or "",
                "target_namespace": self._strip(row[3]) or "",
                "target_dataset":   self._strip(row[4]) or "",
                "target_field":     self._strip(row[5]) or "",
                "transformation_type": self._strip(row[6]) or "DIRECT",
            }
```

The existing `get_upstream_lineage()`, `get_downstream_lineage()`, `get_database_lineage()` methods remain **unchanged**. They are the fallback path.

---

## GraphStore Structure and Memory Footprint

### Adjacency Dict Layout

```python
# lineage-api/graph/store.py

from dataclasses import dataclass
from typing import NamedTuple

class EdgeRef(NamedTuple):
    neighbor_id: str       # "dataset.field" key
    transformation_type: str

@dataclass(slots=True)
class NodeMeta:
    dataset_name: str
    field_name: str
    namespace: str
    source_type: str       # "TABLE" or "VIEW"
    field_type: str | None

class GraphStore:
    """
    Read-only after build(). Thread-safe for concurrent reads.

    adj_forward[node_id] = set of EdgeRef to downstream neighbors
    adj_backward[node_id] = set of EdgeRef to upstream neighbors
    node_meta[node_id] = NodeMeta
    """
    def __init__(self):
        self.adj_forward: dict[str, set[EdgeRef]] = {}
        self.adj_backward: dict[str, set[EdgeRef]] = {}
        self.node_meta: dict[str, NodeMeta] = {}
        self._ready = False

    def build(self, edge_iter, meta_iter):
        """Populate from iterators. Replaces entire store atomically."""
        fwd = {}
        bwd = {}
        meta = {}

        for edge in edge_iter:
            src_id = f"{edge['source_dataset']}.{edge['source_field']}"
            tgt_id = f"{edge['target_dataset']}.{edge['target_field']}"
            fwd.setdefault(src_id, set()).add(EdgeRef(tgt_id, edge["transformation_type"]))
            bwd.setdefault(tgt_id, set()).add(EdgeRef(src_id, edge["transformation_type"]))
            # Ensure node entries exist
            meta.setdefault(src_id, NodeMeta(edge["source_dataset"], edge["source_field"],
                                             edge["source_namespace"], "TABLE", None))
            meta.setdefault(tgt_id, NodeMeta(edge["target_dataset"], edge["target_field"],
                                             edge["target_namespace"], "TABLE", None))

        for node in meta_iter:  # from OL_DATASET_FIELD join OL_DATASET
            node_id = f"{node['dataset_name']}.{node['field_name']}"
            if node_id in meta:
                meta[node_id] = NodeMeta(node["dataset_name"], node["field_name"],
                                         node["namespace"], node["source_type"], node["field_type"])

        self.adj_forward = fwd
        self.adj_backward = bwd
        self.node_meta = meta
        self._ready = True

    def is_ready(self) -> bool:
        return self._ready
```

### Memory Footprint Estimate for 100K Rows

Measured against Python dict overhead benchmarks and igraph's published 32 bytes/edge (C implementation). Pure Python dicts cost substantially more — approximately 150-300 bytes per edge for a dict-of-set structure.

| Component | Estimate |
|-----------|----------|
| 100K edges in `adj_forward` dict-of-sets | ~25-35 MB |
| 100K entries mirrored in `adj_backward` | ~25-35 MB |
| Node metadata (NodeMeta dataclass with `slots=True`) | ~15-25 MB for ~50K unique nodes |
| String interning overhead (dataset/field names repeated) | -5 MB savings if using `sys.intern()` |
| **Total estimate** | **~60-90 MB** |

**Verdict:** Acceptable for a single-process Flask deployment. A typical production server with 8 GB RAM running gunicorn with 1-2 workers fits this comfortably.

**Optimization levers if footprint is a concern:**
- Use `__slots__` on NodeMeta (already shown above — reduces per-instance overhead ~30%)
- `sys.intern()` on dataset/field name strings (avoids duplicate string objects)
- Switch to igraph C library if memory becomes critical (32 bytes/edge vs ~300 bytes) — LOW confidence this will be needed at 100K rows

---

## Progressive Loading: API Contract Change

### New SSE Endpoint

The existing endpoint `/api/v2/openlineage/lineage/{datasetId}/{fieldName}` is **not changed**. A new parallel endpoint streams depth slices:

```
GET /api/v2/openlineage/lineage/{datasetId}/{fieldName}/stream?direction=both&maxDepth=5
```

Returns `Content-Type: text/event-stream` with NDJSON depth slices:

```
data: {"depth":1,"is_final":false,"graph":{"nodes":[...],"edges":[...]}}

data: {"depth":2,"is_final":false,"graph":{"nodes":[...],"edges":[...]}}

data: {"depth":3,"is_final":true,"graph":{"nodes":[...],"edges":[...]}}

```

Each slice is **cumulative** — `graph.nodes` and `graph.edges` include all nodes/edges from depth 1 through current depth. Frontend simply replaces its local state with the latest slice.

### Flask SSE Route

```python
# lineage-api/routes/openlineage.py (add alongside existing routes)

from flask import Response, stream_with_context
import json

@openlineage_bp.route("/lineage/<path:dataset_id>/<field_name>/stream", methods=["GET"])
def get_column_lineage_stream(dataset_id, field_name):
    """Progressive depth streaming for lineage graph."""
    direction = request.args.get("direction", "both")
    max_depth = int(request.args.get("maxDepth", "5"))

    def generate():
        try:
            for slice_data in lineage_service.get_progressive_lineage_stream(
                dataset_id, field_name, direction, max_depth
            ):
                yield f"data: {json.dumps(slice_data)}\n\n"
        except DatasetNotFoundError as e:
            yield f"data: {json.dumps({'error': str(e), 'type': 'not_found'})}\n\n"
        except Exception as e:
            logger.error("stream_error", error=str(e), dataset_id=dataset_id)
            yield f"data: {json.dumps({'error': 'Internal error', 'type': 'stream_error'})}\n\n"

    return Response(
        stream_with_context(generate()),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # Disables Nginx buffering
        }
    )
```

**Note on Flask dev server:** SSE requires a WSGI server that supports streaming. Flask dev server works for development (one request at a time). Gunicorn with `--timeout 120` handles streaming correctly. Add `--worker-class gthread` if threading is used.

### Existing Endpoint Backward Compatibility

The existing `/lineage/{datasetId}/{fieldName}` route continues to work. When GraphEngine is ready, it returns the full traversal from in-memory (faster). When not ready, it falls through to the CTE. Redis cache layer is unchanged — full-depth results are still cached with the existing key scheme.

---

## Frontend: TanStack Query Handles Incremental Data

### Pattern: setQueryData Accumulation in EventSource Handler

TanStack Query has no native SSE support. The pattern is: open an `EventSource` manually, call `queryClient.setQueryData()` on each depth slice to update the cache, and have `useQuery` read from that same cache key.

```typescript
// lineage-ui/src/api/hooks/useOpenLineage.ts (MODIFIED — add progressive variant)

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';

export function useProgressiveLineage(
  datasetId: string,
  fieldName: string,
  direction: string,
  maxDepth: number,
  options: { enabled?: boolean } = {}
) {
  const queryClient = useQueryClient();
  const queryKey = ['lineage-stream', datasetId, fieldName, direction, maxDepth];
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!options.enabled || !datasetId || !fieldName) return;

    // Close any previous connection
    eventSourceRef.current?.close();

    const url = `/api/v2/openlineage/lineage/${encodeURIComponent(datasetId)}/${encodeURIComponent(fieldName)}/stream?direction=${direction}&maxDepth=${maxDepth}`;
    const es = new EventSource(url);
    eventSourceRef.current = es;

    // Mark loading started
    queryClient.setQueryData(queryKey, (old: any) => ({
      ...old,
      isStreaming: true,
      currentDepth: 0,
    }));

    es.onmessage = (event) => {
      const slice = JSON.parse(event.data);

      if (slice.error) {
        queryClient.setQueryData(queryKey, { error: slice.error, isStreaming: false });
        es.close();
        return;
      }

      // Replace with latest cumulative slice
      queryClient.setQueryData(queryKey, {
        graph: slice.graph,
        currentDepth: slice.depth,
        isStreaming: !slice.is_final,
        isFinal: slice.is_final,
      });

      if (slice.is_final) {
        es.close();
      }
    };

    es.onerror = () => {
      queryClient.setQueryData(queryKey, (old: any) => ({
        ...old,
        isStreaming: false,
        streamError: true,
      }));
      es.close();
    };

    return () => {
      es.close();
    };
  }, [datasetId, fieldName, direction, maxDepth, options.enabled]);

  return queryClient.getQueryState(queryKey);
}
```

### Loading Stage Machine Extension

`useLoadingProgress.ts` gains a `depth_loading` stage between `fetching` and `layout`. This maps to the stream receiving partial depth slices.

```typescript
// Existing stages: idle → fetching → layout → rendering → complete
// New stages:      idle → fetching → depth_loading → layout → rendering → complete

export type LoadingStage = 'idle' | 'fetching' | 'depth_loading' | 'layout' | 'rendering' | 'complete';

export const STAGE_CONFIG: Record<LoadingStage, StageConfig> = {
  idle:          { min: 0,   max: 0,   message: '' },
  fetching:      { min: 5,   max: 15,  message: 'Connecting...' },
  depth_loading: { min: 15,  max: 60,  message: 'Loading depth {depth} of {maxDepth}...' },
  layout:        { min: 60,  max: 80,  message: 'Calculating layout...' },
  rendering:     { min: 80,  max: 95,  message: 'Rendering graph...' },
  complete:      { min: 100, max: 100, message: '' },
};
```

`LineageGraph.tsx` updates `setStage('depth_loading')` when the first SSE slice arrives, and calls `layoutGraph()` on each slice (or debounces layout calls to avoid thrashing ELK on every depth increment).

**Recommended layout strategy:** Run ELK layout only on the final depth slice (`is_final: true`). Show a spinner with depth progress during earlier slices. This avoids repeated expensive ELK computation and visible layout jumps.

---

## Graph Refresh and Invalidation Lifecycle

### When Does GraphStore Become Stale?

GraphStore becomes stale when `OL_COLUMN_LINEAGE` changes — typically after an ETL run via `populate_lineage.py`. The existing Redis invalidation API (`/api/v2/cache/invalidate`) handles Redis. GraphStore needs a parallel signal.

### Invalidation Options

**Option A: On-demand via existing cache invalidation endpoint (RECOMMENDED)**

Extend `routes/cache.py` to also call `invalidate_graph_engine()` when cache is cleared. ETL pipelines already call the invalidation endpoint after loading. No new mechanism required.

```python
# lineage-api/routes/cache.py (MODIFIED)
from graph.engine import invalidate_graph_engine

@cache_bp.route("/cache/invalidate", methods=["POST"])
def invalidate_cache():
    # ... existing Redis invalidation logic ...
    invalidate_graph_engine()  # Add this line
    return jsonify({"status": "ok", "message": "Cache and graph store invalidated"})
```

Next request to GraphEngine triggers reload from Teradata. Reload is blocking on first request — subsequent requests wait for the new instance via the module-level lock. This is acceptable for ETL-triggered invalidation (infrequent, expected delay).

**Option B: TTL-based expiry (LOWER confidence, not recommended)**

Automatically expire GraphStore after N hours. Adds complexity (background thread timer), unclear TTL value, inconsistent with Redis invalidation lifecycle. Rejected.

**Option C: Polling for table row count changes (REJECTED)**

Adds a Teradata query every N seconds. Expensive, fragile. Rejected.

### Reload Behavior

When `invalidate_graph_engine()` sets `_engine_instance = None`, the next call to `get_graph_engine()` triggers `GraphLoader.load()`. During reload:
- Existing CTE fallback path in `LineageService` serves requests (graceful degradation)
- Reload typically takes 2-10 seconds for 100K rows depending on Teradata query time
- After reload, all subsequent requests use the new GraphStore

---

## Component Boundaries and Build Order

### New vs Modified Components

| Component | File | Status | What Changes |
|-----------|------|--------|--------------|
| GraphStore | `lineage-api/graph/store.py` | NEW | Adjacency dicts, NodeMeta, `build()` method |
| GraphLoader | `lineage-api/graph/loader.py` | NEW | Queries Teradata, populates GraphStore |
| GraphEngine | `lineage-api/graph/engine.py` | NEW | BFS traversal by depth, cycle detection, singleton accessor |
| `__init__.py` | `lineage-api/graph/__init__.py` | NEW | Package init |
| LineageRepository | `lineage-api/repositories/lineage_repository.py` | MODIFIED | Add `load_all_lineage()` method |
| LineageService | `lineage-api/services/lineage_service.py` | MODIFIED | Add `get_progressive_lineage_stream()`, dual-path in existing methods |
| openlineage routes | `lineage-api/routes/openlineage.py` | MODIFIED | Add `/stream` route |
| cache routes | `lineage-api/routes/cache.py` | MODIFIED | Add `invalidate_graph_engine()` call |
| python_server.py | `lineage-api/python_server.py` | MODIFIED | Call `get_graph_engine().initialize()` in `create_app()` |
| cache/invalidation.py | `lineage-api/cache/invalidation.py` | MODIFIED | Add graph store invalidation |
| useOpenLineage.ts | `lineage-ui/src/api/hooks/useOpenLineage.ts` | MODIFIED | Add `useProgressiveLineage()` |
| useLoadingProgress.ts | `lineage-ui/src/hooks/useLoadingProgress.ts` | MODIFIED | Add `depth_loading` stage |
| LineageGraph.tsx | `lineage-ui/src/components/domain/LineageGraph/LineageGraph.tsx` | MODIFIED | SSE stream consumption, layout debounce on final slice |

### Build Order (dependency-driven)

**Phase 1: GraphStore + GraphLoader (backend only, no API change)**

1. Create `lineage-api/graph/` package
2. Implement `GraphStore` (pure Python, no dependencies)
3. Add `LineageRepository.load_all_lineage()` method
4. Implement `GraphLoader` using `load_all_lineage()`
5. Implement `GraphEngine` with BFS traversal and `is_ready()` check
6. Add `get_graph_engine()` singleton accessor
7. Wire `create_app()` to call `get_graph_engine().initialize()` (with error catch — startup must not fail if Teradata is slow)
8. **Test:** Verify GraphStore loads correctly; verify `traverse()` returns same edges as CTE (regression test against existing CTE output)

**Phase 2: Dual-Path LineageService (transparent CTE replacement)**

1. Modify `LineageService.get_column_lineage_graph()` to try GraphEngine first, fall back to CTE
2. Modify `LineageService.get_table_lineage_graph()` same pattern
3. Add `LineageService.get_progressive_lineage_stream()` generator
4. **Test:** All existing API tests pass. GraphEngine path returns identical response shape.

**Phase 3: SSE Streaming Route (API contract addition)**

1. Add `/stream` route to `routes/openlineage.py`
2. Verify `stream_with_context` works with gunicorn threading mode
3. **Test:** `curl -N` to stream endpoint shows incremental depth slices; verify `is_final` signals correctly

**Phase 4: Cache Invalidation Integration**

1. Modify `routes/cache.py` to call `invalidate_graph_engine()` on cache clear
2. Verify GraphStore reloads after invalidation; CTE fallback serves during reload
3. **Test:** POST `/cache/invalidate`, confirm next lineage request reloads graph

**Phase 5: Frontend Progressive Loading**

1. Add `useProgressiveLineage()` hook
2. Add `depth_loading` stage to `useLoadingProgress`
3. Modify `LineageGraph.tsx` to use streaming hook for progressive display
4. Layout debounce: only run ELK on `is_final: true` slice
5. **Test:** E2E — open lineage for deep graph, verify depth slices appear progressively

---

## Data Flow Diagrams

### Startup Flow (GraphStore Initialization)

```
create_app()
    |
    v
get_graph_engine().initialize()
    |
    v
GraphLoader.load(lineage_repo, dataset_repo)
    |
    ├─→ lineage_repo.load_all_lineage()      --> SELECT * FROM OL_COLUMN_LINEAGE WHERE is_active='Y'
    |       returns: iterator of edge dicts
    |
    ├─→ dataset_repo.load_all_field_meta()   --> SELECT OL_DATASET_FIELD JOIN OL_DATASET JOIN OL_NAMESPACE
    |       returns: iterator of node meta
    |
    v
GraphStore.build(edge_iter, meta_iter)
    |
    v
_engine_instance._ready = True
```

### Progressive Request Flow

```
Frontend EventSource opens stream
    |
    v
GET /lineage/{id}/{field}/stream?maxDepth=5
    |
    v
lineage_service.get_progressive_lineage_stream()
    |
    v
For depth=1 to 5:
    engine.traverse_depth_slice(dataset, field, direction, depth)
        |
        v
    BFS on GraphStore.adj_forward / adj_backward (in-memory, microseconds)
        |
        v
    Yield depth slice JSON
        |
        v
    SSE: "data: {...depth:1, is_final:false, graph:{...}}\n\n"
    |
    v
Frontend EventSource.onmessage
    |
    v
queryClient.setQueryData(queryKey, cumulativeGraph)
    |
    v
LineageGraph re-renders with new nodes/edges
    |
    v
[On is_final=true]: run ELK layout → React Flow renders final graph
```

### Invalidation Flow

```
ETL: populate_lineage.py completes
    |
    v
POST /api/v2/cache/invalidate
    |
    ├─→ Redis: invalidate_all() -- existing
    |
    └─→ invalidate_graph_engine()  -- NEW
            |
            v
        _engine_instance = None

Next lineage request:
    |
    v
get_graph_engine() -- instance is None, acquires lock
    |
    v
GraphLoader.load() -- reloads from Teradata (2-10s)
    |
    v
GraphStore rebuilt, _ready = True
```

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Storing GraphStore in `flask.g`

**What people do:** Put the graph in `g` because it's the "Flask way" for globals.

**Why it's wrong:** `flask.g` is **request-scoped** — it is destroyed after each request. A graph that costs 5-10 seconds to initialize cannot be rebuilt per request.

**Do this instead:** Module-level singleton with double-checked locking. Initialized once in `create_app()`.

### Anti-Pattern 2: Running ELK Layout on Every Depth Slice

**What people do:** As each SSE depth slice arrives, run `layoutGraph()` to show the incremental graph.

**Why it's wrong:** ELK layout for 50-node graphs takes 100-200ms. Running it 5 times (once per depth) adds 500ms-1s of CPU blocking on the Web Worker. Users see the graph jumping positions between depths.

**Do this instead:** Buffer all depth slices until `is_final: true`, then run layout once on the complete graph. Show depth progress in the loading indicator. Optionally render a placeholder spinner with the depth count during streaming.

### Anti-Pattern 3: Multiple Workers with Shared In-Memory State

**What people do:** Deploy with `gunicorn --workers 4` expecting the in-memory graph to be shared.

**Why it's wrong:** Gunicorn workers are separate processes with separate memory spaces. Each worker loads its own GraphStore independently. With 4 workers and a 90 MB GraphStore, that's 360 MB total — not the 90 MB you'd expect.

**Do this instead:** Use `--workers 1 --threads 8` (gthread mode). One worker, multiple threads sharing one GraphStore. Or, if multi-worker is required, externalize the graph into Redis (stored as serialized adjacency data — trades startup cost for shared state).

### Anti-Pattern 4: Blocking Startup on GraphStore Load Failure

**What people do:** Call `GraphEngine.initialize()` in `create_app()` and let the exception propagate, crashing the server if Teradata is slow or unavailable.

**Why it's wrong:** The existing CTE path provides a working fallback. Crashing startup because the graph optimization layer isn't ready is unnecessary.

**Do this instead:**
```python
def create_app():
    # ...
    try:
        get_graph_engine().initialize()
        logger.info("graph_engine_ready")
    except Exception as e:
        logger.warning("graph_engine_startup_failed", error=str(e),
                       note="Will fall back to CTE queries")
    # Server starts either way
```

### Anti-Pattern 5: SSE Endpoint Without Nginx Buffering Disabled

**What people do:** Add SSE endpoint, deploy behind Nginx, wonder why clients receive all events at once after stream closes.

**Why it's wrong:** Nginx buffers upstream responses by default. SSE events are held until the buffer fills or stream closes, defeating the progressive loading purpose.

**Do this instead:** Add `X-Accel-Buffering: no` response header (shown in route above). Configure `proxy_buffering off` in Nginx upstream block for the `/stream` path.

---

## Scaling Considerations

| Scale | GraphStore Approach | API Approach |
|-------|---------------------|--------------|
| Single user, dev | Module singleton, reload on startup | SSE or polling both fine |
| 10-50 concurrent users | `--workers 1 --threads 16` | SSE works; Flask CTE fallback handles burst |
| 50-200 concurrent users | Consider externalizing GraphStore to Redis (serialized) | SSE with timeout; consider Server-Sent Events proxy |
| 200+ concurrent users | Dedicated graph service (separate Flask process or FastAPI + asyncio) | Websockets or dedicated streaming service |

**First bottleneck at scale:** GraphStore reload time (2-10 seconds blocking new requests). Fix: async reload in background thread with atomic swap — serve old store while new one loads.

**Second bottleneck:** SSE connections are long-lived HTTP connections. Flask/gunicorn holds a thread per open SSE connection. 100 concurrent users = 100 threads. Fix: switch to gevent worker type for async SSE, or use a dedicated EventSource proxy (Redis pub/sub + EventSource endpoint).

---

## Integration Points Summary

### Backend: New vs Existing

| Boundary | What Exists | What Changes |
|----------|-------------|--------------|
| `LineageRepository` ↔ Teradata | CTE queries via `get_upstream_lineage()`, etc. | Add `load_all_lineage()` — single SELECT * for startup |
| `LineageService` ↔ `LineageRepository` | Service calls repo methods | Service now checks GraphEngine first; repo methods are fallback |
| `LineageService` ↔ `GraphEngine` | Does not exist | New: service calls `engine.traverse()` and `engine.traverse_depth_slice()` |
| `routes/openlineage.py` ↔ `LineageService` | Existing route calls `get_column_lineage_graph()` | Add `/stream` route calling new generator method |
| `routes/cache.py` ↔ invalidation | Invalidates Redis keys | Add call to `invalidate_graph_engine()` |
| `create_app()` ↔ `GraphEngine` | No graph initialization | Add `get_graph_engine().initialize()` call with error catch |

### Frontend: New vs Existing

| Boundary | What Exists | What Changes |
|----------|-------------|--------------|
| `useOpenLineage.ts` ↔ backend | `useQuery` calling existing REST endpoints | Add `useProgressiveLineage()` using `EventSource` + `setQueryData` |
| `useLoadingProgress.ts` ↔ `LineageGraph.tsx` | Stages: `idle → fetching → layout → rendering → complete` | Add `depth_loading` stage between `fetching` and `layout` |
| `LineageGraph.tsx` ↔ layout | Calls `layoutGraph()` once after data fetch | Optionally: defer `layoutGraph()` until `is_final` slice, buffer intermediate slices |
| TanStack Query cache ↔ graph state | `queryKey: ['lineage', datasetId, fieldName, direction, maxDepth]` | New key for stream: `['lineage-stream', ...]`; existing key unchanged |

---

## Sources

**Flask Streaming (HIGH confidence)**
- [Flask Streaming Patterns — Official Flask Docs](https://flask.palletsprojects.com/en/stable/patterns/streaming/) — `stream_with_context`, generator response pattern

**TanStack Query SSE Patterns (MEDIUM confidence)**
- [React Query and Server-Sent Events — Fragmented Thought (2025)](https://fragmentedthought.com/blog/2025/react-query-caching-with-server-side-events) — `setQueryData` accumulation pattern for SSE
- [SSE Protocol — TanStack AI Docs](https://tanstack.com/ai/latest/docs/protocol/sse-protocol) — official TanStack SSE documentation
- [TanStack Query Discussion #418 — GitHub](https://github.com/TanStack/query/discussions/418) — community patterns for stream-based flows

**Gunicorn Worker Isolation (HIGH confidence)**
- [Sharing data across workers in Gunicorn + Flask — Medium](https://medium.com/@jgleeee/sharing-data-across-workers-in-a-gunicorn-flask-application-2ad698591875) — worker isolation constraint verified

**Flask Thread Safety (HIGH confidence)**
- [Thread Safety — Flask contexts — TestDriven.io](https://testdriven.io/blog/flask-contexts-advanced/) — module-level singleton pattern with threading

**Python Graph Memory (MEDIUM confidence)**
- [NetworkX Memory Benchmark — GraphScope Issue #999](https://github.com/alibaba/GraphScope/issues/999) — 100-380 bytes/edge in NetworkX
- [igraph Memory: 32 bytes/edge](https://graph-tool.skewed.de/performance.html) — C library comparison
- [TiML benchmark — popular graph packages](https://www.timlrx.com/blog/benchmark-of-popular-graph-network-packages) — NetworkX vs igraph performance

**Existing Codebase (HIGH confidence)**
- `lineage-api/repositories/lineage_repository.py` — existing CTE methods, cache pattern
- `lineage-api/services/lineage_service.py` — existing graph building, dual-path integration point
- `lineage-api/python_server.py` — application factory, dependency injection pattern
- `lineage-ui/src/hooks/useLoadingProgress.ts` — existing stage machine
- `lineage-ui/src/api/hooks/useOpenLineage.ts` — existing TanStack Query hooks

---
*Architecture research for: In-memory graph engine + progressive depth loading integration*
*Researched: 2026-02-20*
*Context: Adding to existing Flask repository/service architecture; Teradata lineage application v4.0 milestone*

---

# Architecture Research: Database Lineage Graph Layout Improvement

**Domain:** Database lineage graph — connected component detection, hybrid hierarchical/grid layout
**Researched:** 2026-02-21
**Confidence:** HIGH (based on direct code analysis of the existing codebase)

## Context

This section covers the specific question: how should connected component detection, hierarchical layout for connected tables, and grid layout for isolated tables integrate with the existing layout architecture?

**The short answer:** All changes go inside `layoutGraph()` in `src/utils/graph/layoutEngine.ts`. No new files are needed. No interface changes are required. No callers change. The improvement is entirely internal to the layout function.

---

## Existing Layout Architecture (what exists today)

### Call Path for Database Lineage

```
DatabaseLineageGraph.tsx
    |
    | useOpenLineageDatabaseLineage (TanStack Query)
    | GET /api/v2/openlineage/lineage/database/{name}
    v
data.graph.nodes (OpenLineageNode[]), data.graph.edges (OpenLineageEdge[])
    |
    v
convertOpenLineageGraph()          -- openLineageAdapter.ts
    | produces LineageNode[], LineageEdge[]
    v
layoutGraph(nodes, edges, options) -- layoutEngine.ts (MAIN THREAD, not Worker)
    |
    ├─ groupColumnsByTable()
    |    produces: Map<"db.table", LineageNode[]>
    |
    ├─ transformToTableNodes()
    |    produces: TableNodeData[], columnToTableMap
    |
    ├─ build tableAdj (directed, table-level)
    |    Map<tableId, Set<tableId>>
    |
    ├─ Kahn topological sort → topoOrder[]
    |
    ├─ longest-path layering → layerMap
    |
    ├─ position tables by layer (primary axis = layer, secondary = stack within layer)
    |
    └─ separateDatabaseClusters()  -- post-layout DB cluster shifting
    |
    v
Node[], Edge[]  → setNodes(), setEdges()
    |
    v
React Flow renders
    |
    v
useDatabaseClustersFromNodes(nodes) -- ClusterBackground.tsx
ClusterBackground draws bounding boxes
```

**Critical implementation detail:** `DatabaseLineageGraph.tsx` calls `layoutGraph()` directly on the main thread (line 172). The Web Worker (`layout.worker.ts`) exists and wraps `layoutGraph()` via Comlink, but `DatabaseLineageGraph` does not use it. The comment states: "Run layout on main thread (topological layout is O(V+E), completes in ms)."

### Current Problem

The current layout treats all tables as a single connected graph. When a database has many tables with no lineage edges (isolated tables — no known lineage), they all fall into layer 0 and stack vertically on top of each other, making the graph unusable.

---

## Where to Make the Change

### Answer to Question 1: Where should connected component detection happen?

**Inside `layoutGraph()` in `layoutEngine.ts`, after `tableAdj` is built (line ~410), before the topological sort loop (line ~413).**

Not before passing to ELK (ELK is not used in this path — it was replaced with custom O(V+E) topological layout). Not in a pre-processing step outside `layoutGraph()` (the table adjacency graph only exists inside `layoutGraph()`).

The boundary is: connected component detection operates on `tableAdj` (table-level directed graph), which is constructed from the column-level `rawEdges` via `columnToTableMap`. This map is built inside `layoutGraph()` as part of `transformToTableNodes()`. Performing component detection upstream of `layoutGraph()` would require duplicating `groupColumnsByTable()` and `transformToTableNodes()` — unnecessary.

### Answer to Question 2: How to combine hierarchical and grid layout?

**Per-component topological layout, then isolated table grid placement, then `separateDatabaseClusters()` as before.**

The existing longest-path layering algorithm is correct for connected components — it correctly positions tables that have lineage relationships. The improvement is:

1. Detect connected components on `tableAdj`
2. For each component with 2+ tables: run Kahn sort + longest-path layering on the component subgraph only (not the full graph), producing positions in a local coordinate space
3. Stack connected components vertically (along the secondary axis), with a configurable gap between components
4. Collect isolated tables (1-node components) and place them in a grid below all connected components
5. Run `separateDatabaseClusters()` as before — it reads final `databaseName` from `TableNodeData` and shifts DB groups; it does not care how positions were computed

### Answer to Question 3: Separate ELK configuration or pre/post-processing?

**Neither. This is internal restructuring of the custom O(V+E) topological layout. ELK is not involved.**

ELK was abandoned for this path (see comment at line 386 of `layoutEngine.ts`). The `elk` singleton at line 18 is still imported but only used in `layoutSimpleNodes()` — the fallback path for `LineageNode[]` inputs that have no column nodes. The main path (lines 349–578) does not call `elk.layout()` at all.

---

## System Overview After Improvement

```
layoutGraph() internal structure (AFTER):

    groupColumnsByTable()
    transformToTableNodes()
    build tableAdj
        |
        v
    detectConnectedComponents(tableIds, tableAdj)
        returns: string[][]
        -- each inner array is one component's table IDs
        -- undirected connectivity (follow edges both directions)
        |
        v
    For each component with 2+ tables:
        Kahn sort on component subgraph → componentTopoOrder
        longest-path layering on component → componentLayerMap
        position tables in local coordinates (primaryCursor, secondaryCursor)
        translate by component offset → accumulate into layoutedNodes
        advance componentOffset by (component height + COMPONENT_GAP)
        |
    Collect isolated tables (1-node components)
    Place in grid (ISOLATED_GRID_COLUMNS wide, ISOLATED_GRID_GAP between cells)
    starting y = maxConnectedComponentY + ISOLATED_SECTION_GAP
        |
        v
    Build layoutedEdges (unchanged)
        |
        v
    separateDatabaseClusters() (unchanged)
```

### Component Responsibilities

| Component | Responsibility | Change |
|-----------|----------------|--------|
| `layoutGraph()` | Orchestrates entire layout pipeline | YES — add component detection step, refactor layer-assignment loop |
| `detectConnectedComponents()` | BFS on undirected table graph | NEW — local function inside `layoutEngine.ts` |
| Per-component layout loop | Topo sort + layering on subgraph | REFACTOR — existing loop body extracted to work on a subgraph |
| Isolated table grid | Grid placement for 1-node components | NEW — simple grid logic after component loop |
| `separateDatabaseClusters()` | Post-layout DB cluster shifting | NO CHANGE — reads final positions |
| `ClusterBackground` | Renders bounding boxes | NO CHANGE — reads from React Flow node store |
| `DatabaseLineageGraph.tsx` | Calls `layoutGraph()` | NO CHANGE — identical call site |

---

## Architectural Patterns

### Pattern 1: Pre-processing Inside the Layout Function

**What:** `detectConnectedComponents()` runs inside `layoutGraph()` after the table adjacency graph is built, before the topological sort. It is a local helper function in the same file.

**When to use:** When a preprocessing step depends on data structures (like `tableAdj`) that only exist inside the layout function, and externalizing them would require duplicating logic.

**Trade-offs:** `layoutGraph()` grows slightly larger. Mitigate with clear section comments and small, well-named helper functions extracted as local functions.

**Example:**

```typescript
// Inside layoutGraph(), at line ~410, after tableAdj is fully populated:

function detectConnectedComponents(
  tableIds: string[],
  tableAdj: Map<string, Set<string>>
): string[][] {
  const visited = new Set<string>();
  const components: string[][] = [];

  for (const tableId of tableIds) {
    if (visited.has(tableId)) continue;
    const component: string[] = [];
    const queue = [tableId];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      component.push(current);

      // Follow forward edges
      for (const neighbor of tableAdj.get(current) || new Set<string>()) {
        if (!visited.has(neighbor)) queue.push(neighbor);
      }
      // Follow reverse edges (undirected connectivity)
      for (const [src, targets] of tableAdj) {
        if (targets.has(current) && !visited.has(src)) queue.push(src);
      }
    }

    components.push(component);
  }

  return components;
}

// Usage inside layoutGraph():
const allTableIds = tableNodeData.map(t => t.id);
const components = detectConnectedComponents(allTableIds, tableAdj);
const connectedComponents = components.filter(c => c.length > 1);
const isolatedTables = components.filter(c => c.length === 1).map(c => c[0]);
```

### Pattern 2: Per-Component Subgraph Layout

**What:** The existing topological sort and layering runs on the full table graph. Refactor so it runs on a subgraph (one component at a time). Each component produces positions in local coordinates. The component is then translated by a cumulative offset.

**Trade-offs:** The refactoring is a restructuring of existing logic, not new logic. Risk of regression is low if existing tests pass after the change. Determinism is preserved because components are sorted by their smallest table ID before layout.

**Example:**

```typescript
// Pseudocode for the per-component loop (replaces lines 437-497):

let secondaryOffset = 0; // stacking offset along secondary axis

// Sort components for determinism: by smallest table ID in component
connectedComponents.sort((a, b) => a[0].localeCompare(b[0]));

for (const component of connectedComponents) {
  const componentSet = new Set(component);

  // Build component-local adjacency
  const compAdj = new Map<string, Set<string>>();
  const compInDeg = new Map<string, number>();
  for (const id of component) {
    compAdj.set(id, new Set());
    compInDeg.set(id, 0);
  }
  for (const id of component) {
    for (const tgt of tableAdj.get(id) || new Set<string>()) {
      if (componentSet.has(tgt)) {
        compAdj.get(id)!.add(tgt);
        compInDeg.set(tgt, (compInDeg.get(tgt) || 0) + 1);
      }
    }
  }

  // Kahn sort on component
  const compTopoOrder = kahnSort(component, compAdj, compInDeg);

  // Longest-path layering on component
  const compLayerMap = longestPathLayering(compTopoOrder, compAdj);

  // Position tables (local coordinates)
  const compNodes = positionByLayer(compLayerMap, tableNodeData, nodeSpacing, layerSpacing, isHorizontal);

  // Translate by secondaryOffset (stacking components vertically)
  const translated = compNodes.map(node => ({
    ...node,
    position: {
      x: isHorizontal ? node.position.x : node.position.x + secondaryOffset,
      y: isHorizontal ? node.position.y + secondaryOffset : node.position.y,
    }
  }));

  // Advance offset past this component
  const compSecondaryExtent = Math.max(...compNodes.map(n =>
    isHorizontal ? n.position.y + (tableNodeData.find(t => t.id === n.id)?.columns.length ?? 0) * COLUMN_ROW_HEIGHT : 0
  ));
  secondaryOffset += compSecondaryExtent + COMPONENT_GAP;

  layoutedNodes.push(...translated);
}
```

### Pattern 3: Grid Placement for Isolated Tables

**What:** Single-node components (isolated tables — no lineage) are placed in a grid below all connected components. Grid width is configurable via `LayoutOptions.isolatedGridColumns` (default 4).

**Trade-offs:** Simple and predictable. Isolated tables are visually distinct from connected components. The grid is ordered alphabetically for determinism.

**Example:**

```typescript
const ISOLATED_SECTION_GAP = 100; // gap between connected components and isolated grid
const isolatedGridColumns = options.isolatedGridColumns ?? 4;

if (isolatedTables.length > 0) {
  const startY = secondaryOffset + ISOLATED_SECTION_GAP; // below all connected components
  isolatedTables.sort(); // alphabetical for determinism

  isolatedTables.forEach((tableId, index) => {
    const col = index % isolatedGridColumns;
    const row = Math.floor(index / isolatedGridColumns);
    const td = tableNodeData.find(t => t.id === tableId)!;
    const width = calculateTableNodeWidth(td.tableName, td.columns);
    const height = calculateTableNodeHeight(td.columns.length, td.isExpanded);

    layoutedNodes.push({
      id: tableId,
      type: 'tableNode',
      position: {
        x: isHorizontal ? col * (width + nodeSpacing) : startY + row * (height + nodeSpacing),
        y: isHorizontal ? startY + row * (height + nodeSpacing) : col * (width + nodeSpacing),
      },
      data: td,
    } as Node);
  });
}
```

---

## Data Flow

### Request Flow (After Improvement — only `layoutGraph()` changes)

```
DatabaseLineageGraph.tsx
    |
    v (identical to before)
convertOpenLineageGraph() → LineageNode[], LineageEdge[]
    |
    v (identical call site)
layoutGraph(nodes, edges, options)
    |
    ├─ groupColumnsByTable()              [unchanged]
    ├─ transformToTableNodes()            [unchanged]
    ├─ build tableAdj                     [unchanged]
    |
    ├─ detectConnectedComponents()        [NEW]
    |     → connectedComponents: string[][]
    |     → isolatedTables: string[]
    |
    ├─ for each connected component:      [REFACTORED from single loop]
    |     Kahn sort on component subgraph
    |     longest-path layering
    |     position in local coordinates
    |     translate by stacking offset
    |
    ├─ place isolatedTables in grid       [NEW]
    |
    ├─ build layoutedEdges                [unchanged]
    |
    └─ separateDatabaseClusters()         [unchanged]
    |
    v (identical to before)
setNodes(), setEdges()
    v
React Flow renders
    v
ClusterBackground draws bounding boxes   [unchanged]
```

---

## Integration Points

### What Changes and What Does Not

| File | Change | Notes |
|------|--------|-------|
| `src/utils/graph/layoutEngine.ts` | YES — core change | Add `detectConnectedComponents()` as local function; refactor layer-assignment into per-component loop; add isolated table grid |
| `src/utils/graph/layoutEngine.test.ts` | YES — new tests | Unit tests for `detectConnectedComponents()`; tests for isolated table grid; regression tests for existing patterns |
| `src/components/domain/LineageGraph/DatabaseLineageGraph.tsx` | NO | Call site to `layoutGraph()` is identical |
| `src/components/domain/LineageGraph/AllDatabasesLineageGraph.tsx` | NO | Also benefits from the improvement automatically |
| `src/components/domain/LineageGraph/ClusterBackground.tsx` | NO | Reads final node positions — unaffected |
| `src/components/domain/LineageGraph/hooks/useDatabaseClusters.ts` | NO | Secondary hook not used by `DatabaseLineageGraph` |
| `src/utils/graph/openLineageAdapter.ts` | NO | Format conversion unchanged |
| `src/workers/layout.worker.ts` | NO | Wraps `layoutGraph()` — improvement is inside, Worker gets it automatically |
| `LayoutOptions` interface | MAYBE | Add optional `isolatedGridColumns?: number` if callers need to tune |
| `LayoutResult` interface | NO | Same shape returned |

### Existing Tests — Regression Surface

All existing tests in `layoutEngine.test.ts` must pass without modification. The following test groups are the regression surface:

| Test Group | What it verifies | Risk |
|------------|------------------|------|
| `layoutGraph` — column grouping | Two columns same table → one node | Low (grouping unchanged) |
| `layoutGraph` — separate tables | One table per column, correct edge handles | Low |
| `TC-GRAPH-004` — diamond/fan/chain patterns | All 4-5 node patterns, positions correct | Medium — refactoring the loop |
| `TC-GRAPH-002/003` — direction options | DOWN and LEFT directions produce correct ordering | Medium |
| `cross-database cluster layout` | Upstream DB left of downstream DB | Low — `separateDatabaseClusters()` unchanged |
| `topoSortDatabases` | DB-level ordering | No change — function unchanged |
| `separateDatabaseClusters` | Cluster separation | No change — function unchanged |

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Component Detection at Column Level

**What people might try:** Detect connected components on the raw `LineageNode[]` input before `groupColumnsByTable()`.

**Why it's wrong:** Component connectivity must be defined at the table level, not the column level. A table with 10 columns may have lineage through 1 column — all 10 columns belong to the same table node and that table is connected. Column-level component detection would misclassify tables where only some columns have lineage.

**Do this instead:** Run after `transformToTableNodes()` and `tableAdj` is built. Operate on table keys (`db.tableName`), not column IDs.

### Anti-Pattern 2: Using ELK for Connected Components

**What people might try:** Use ELK's compound node or partition features to lay out components separately.

**Why it's wrong:** ELK is not used in the main layout path. The custom O(V+E) topological algorithm replaced ELK because ELK hangs on dense graphs (see comment line 386 of `layoutEngine.ts`). Adding ELK back for a subset of the work would reintroduce the hang risk and adds unnecessary complexity.

**Do this instead:** Extend the existing custom topological algorithm to handle components.

### Anti-Pattern 3: Modifying ClusterBackground for Isolated Tables

**What people might try:** Render isolated tables differently in `ClusterBackground` or add a new overlay.

**Why it's wrong:** `ClusterBackground` is a rendering layer that draws bounding boxes around nodes already in their final positions. If isolated tables are correctly placed in a grid by `layoutGraph()`, `ClusterBackground` will draw correct bounding boxes around them automatically — it groups by `databaseName`, not by lineage connectivity.

**Do this instead:** Fix the positions in `layoutGraph()`. Rendering requires no changes.

### Anti-Pattern 4: Separate Layout Function for Database Lineage

**What people might try:** Create `layoutDatabaseGraph()` called specifically from `DatabaseLineageGraph.tsx`.

**Why it's wrong:** `AllDatabasesLineageGraph` also calls `layoutGraph()` and has the same isolated table problem. A database-specific fork misses this consumer and creates diverging code paths to maintain.

**Do this instead:** Improve `layoutGraph()` so both consumers benefit.

---

## Build Order

Build in this sequence (each step is independently testable):

1. **`detectConnectedComponents()` function** — write and unit-test in isolation. Input: `string[]` of table IDs, `Map<string, Set<string>>` adjacency. Output: `string[][]`. Test: linear chain, diamond, fan, disconnected, single isolated node, all isolated.

2. **Refactor layer-assignment into per-component loop** — extract Kahn sort + longest-path into named helper functions `kahnSort()` and `longestPathLayering()`. Run existing tests to confirm no regression before adding component logic.

3. **Wire `detectConnectedComponents()` into the refactored loop** — run existing tests. All prior tests should pass since all existing test fixtures have fully connected graphs (every table in a test has lineage edges).

4. **Add isolated table grid placement** — add grid positioning block after the component loop. Write new tests: all-isolated database, mix of connected and isolated, isolated tables from multiple databases.

5. **Optional: `isolatedGridColumns` in `LayoutOptions`** — add if product needs the grid width to be configurable. Non-breaking (optional parameter with default of 4).

---

## Sources

**Direct code analysis (HIGH confidence)**
- `/Users/Daniel.Tehan/Code/lineage/lineage-ui/src/utils/graph/layoutEngine.ts` — full layout pipeline, lines 349–578 (main path), lines 583–707 (ELK fallback)
- `/Users/Daniel.Tehan/Code/lineage/lineage-ui/src/components/domain/LineageGraph/DatabaseLineageGraph.tsx` — call site at line 172; Worker is NOT used
- `/Users/Daniel.Tehan/Code/lineage/lineage-ui/src/components/domain/LineageGraph/ClusterBackground.tsx` — reads React Flow store, not layout output directly
- `/Users/Daniel.Tehan/Code/lineage/lineage-ui/src/workers/layout.worker.ts` — wraps `layoutGraph()` via Comlink
- `/Users/Daniel.Tehan/Code/lineage/lineage-ui/src/utils/graph/layoutEngine.test.ts` — existing test coverage confirms current behavior expectations

---
*Architecture research for: database lineage graph layout improvement (connected components + grid)*
*Researched: 2026-02-21*
*Context: Subsequent milestone — fixing database lineage graph layout in existing column-level lineage application*
