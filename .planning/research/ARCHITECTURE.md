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
