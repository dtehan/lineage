# Technology Stack: In-Memory Graph Engine & Progressive Depth Loading

**Project:** Lineage — Column-Level Data Lineage for Teradata
**Milestone:** In-memory graph engine with BFS/DFS traversal and progressive depth loading
**Researched:** 2026-02-20
**Confidence:** HIGH

## Context

This research covers only NEW stack additions for the in-memory graph engine milestone. The following are already validated and are NOT re-researched here:

- Python Flask 3.x backend with layered architecture
- React 18 + TypeScript + React Flow (@xyflow/react ^12)
- TanStack Query v5 + Zustand for state management
- Teradata + OpenLineage schema (OL_* tables)
- Redis 7.0.1 + Flask-Caching 2.3.1 (cache-aside, stampede prevention)
- Loguru structured logging, ELKjs Web Worker for graph layout

**Problem being solved:** Recursive CTEs take 150ms–15s+ for first-time queries. OL_COLUMN_LINEAGE has ~165 rows in test and up to 100K rows in production. Load the full graph into memory once at startup, traverse it with BFS/DFS instead of hitting Teradata per request.

---

## Recommended Stack Additions

### Backend: Python Graph Library

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| networkx | >=3.6.1 | In-memory directed graph engine: BFS/DFS traversal, depth-limited expansion | Best fit for this scale. `nx.DiGraph` stores the full OL_COLUMN_LINEAGE table as an adjacency structure. `bfs_edges(depth_limit=N)` is a generator, enabling progressive depth-by-depth streaming. Pure Python, no compilation required. Production/Stable status, maintained by NumFOCUS. |

**Why networkx over alternatives:**

- **vs. rustworkx 0.17.1:** Rustworkx is 3–100x faster for compute-intensive algorithms on large graphs (millions of nodes). At 10K–100K edges, the traversal latency will be dominated by Flask response serialization and ELKjs layout — not BFS. Rustworkx adds a Rust compilation dependency and a different API. The performance gain is not justified for this scale. (LOW confidence claim: "not justified" — revisit if profiling shows BFS > 5ms at 100K edges.)
- **vs. custom dict adjacency list:** A plain `dict[str, list[str]]` works for BFS but requires reimplementing cycle detection, reverse traversal, depth tracking, and path recording. `networkx.DiGraph` provides all of this as tested library code. Estimated 100 bytes per edge: 100K edges = ~10 MB — well within Flask process memory budget.
- **vs. graph databases (Neo4j, Memgraph):** Adds infrastructure dependency. Current Teradata + Redis is already the source of truth. No need for a third persistent store for this scale.

**Memory estimate:**
- 10K edges: ~1 MB (well within budget)
- 100K edges: ~10 MB (still within budget — a Flask process has 256 MB+ available)
- NetworkX dict-of-dict overhead is ~100 bytes per edge; acceptable for this application

### Backend: Graph Engine Initialization Pattern

No new library needed. Use the existing Flask `create_app()` factory pattern.

| Pattern | Why |
|---------|-----|
| Module-level `GraphEngine` singleton instantiated inside `create_app()` | Consistent with how `LineageRepository`, `LineageService`, and Redis cache are already initialized. Single-process Flask dev server means no multi-process memory sharing issues. If Gunicorn multi-worker is added later, use `preload_app = True` or move to Redis-backed graph (per the pitfalls doc). |

```python
# lineage-api/graph/engine.py  (new module)
import networkx as nx
from loguru import logger

class GraphEngine:
    """In-memory lineage graph with BFS/DFS traversal."""

    def __init__(self):
        self._graph: nx.DiGraph = nx.DiGraph()
        self._loaded = False

    def load(self, connection) -> int:
        """Load all active edges from OL_COLUMN_LINEAGE into memory."""
        with connection.cursor() as cur:
            cur.execute("""
                LOCKING ROW FOR ACCESS
                SELECT
                    source_dataset, source_field,
                    target_dataset, target_field,
                    transformation_type, source_namespace, target_namespace
                FROM OL_COLUMN_LINEAGE
                WHERE is_active = 'Y'
            """)
            rows = cur.fetchall()

        self._graph.clear()
        for row in rows:
            src = f"{row[0].strip()}.{row[1].strip()}"
            tgt = f"{row[2].strip()}.{row[3].strip()}"
            self._graph.add_edge(src, tgt,
                transformation_type=row[4] or "DIRECT",
                source_namespace=row[5] or "",
                target_namespace=row[6] or ""
            )

        self._loaded = True
        logger.info("Graph engine loaded", nodes=self._graph.number_of_nodes(),
                    edges=self._graph.number_of_edges())
        return self._graph.number_of_edges()

    def bfs_upstream(self, node: str, depth: int):
        """Yield edges in BFS order traversing upstream (reverse direction)."""
        return nx.bfs_edges(self._graph, node, reverse=True, depth_limit=depth)

    def bfs_downstream(self, node: str, depth: int):
        """Yield edges in BFS order traversing downstream."""
        return nx.bfs_edges(self._graph, node, depth_limit=depth)

    @property
    def loaded(self) -> bool:
        return self._loaded
```

### Backend: Progressive/Streaming HTTP Response

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Flask `Response` + `stream_with_context` | Flask 3.x (built-in) | Stream BFS results depth-by-depth as NDJSON | Zero new dependency. Flask's generator-based streaming supports chunked transfer encoding natively. `stream_with_context` keeps request context alive across generator yields. |
| NDJSON format (`application/x-ndjson`) | Standard | Wire format for progressive graph chunks | Each depth level yields one JSON object per line. Client parses incrementally. Simpler than SSE (no event parsing overhead) and avoids the "multiple JSON objects in one chunk" parsing bug. |

**Why NDJSON over SSE:**
- SSE (Server-Sent Events via `EventSource`) adds a structured event envelope (`data:`, `event:`, `id:` fields) and requires the client to use `EventSource` or a custom fetch loop with header parsing. For a depth-by-depth graph load, the structure is: yield depth-1 data, yield depth-2 data, yield done signal. This is a simple stream, not a real-time event feed. NDJSON over regular `fetch` is less code and no new browser API surface.
- SSE also adds automatic reconnection behavior, which is counterproductive for a one-shot graph load query.
- `EventSource` doesn't support custom request headers (needed for future auth).

**Why not WebSockets:**
WebSockets are bidirectional and require connection lifecycle management. Graph loading is a one-shot server-to-client stream. WebSocket adds complexity (connection handshake, keepalive) with no benefit for this use case.

**Flask streaming pattern:**
```python
# lineage-api/routes/openlineage.py (modified)
from flask import Response, stream_with_context, request
import json

@openlineage_bp.route('/api/v2/openlineage/lineage/<dataset_id>/<field_name>/stream')
def stream_column_lineage(dataset_id, field_name):
    direction = request.args.get('direction', 'both')
    max_depth = int(request.args.get('maxDepth', 5))

    def generate():
        for depth in range(1, max_depth + 1):
            chunk = graph_engine.get_depth_slice(dataset_id, field_name, direction, depth)
            yield json.dumps({"depth": depth, "nodes": chunk["nodes"], "edges": chunk["edges"]}) + "\n"
        yield json.dumps({"depth": "done", "nodes": [], "edges": []}) + "\n"

    return Response(
        stream_with_context(generate()),
        mimetype='application/x-ndjson'
    )
```

### Frontend: Incremental Graph Rendering

No new libraries required. Use the existing React Flow + TanStack Query + Zustand stack.

| Pattern | Technology | Why |
|---------|------------|-----|
| Depth-by-depth accumulation | `fetch` + `ReadableStream` + custom hook | Axios does not natively support streaming. Use native `fetch` with `response.body.getReader()` to consume NDJSON. Parse each newline-delimited JSON object as it arrives. |
| Incremental node/edge accumulation | Zustand `useLineageStore.setGraph()` | Existing store already holds `nodes` and `edges`. Extend with an `appendGraph(newNodes, newEdges)` action that merges depth slices into the existing graph state without replacing it. |
| Progressive React Flow rendering | `useReactFlow().setNodes()` + `hidden` property | React Flow's `hidden` property defers rendering of nodes not yet visible. As each depth arrives, toggle `hidden: false` for new nodes. O(1) node access via `getNode()`. |
| No layout re-run on each depth | ELKjs Web Worker (existing) | Run ELKjs layout once after all depths loaded, or after each depth with incremental addition. Avoid running layout for every single node addition — batch by depth. |

**Why native `fetch` over Axios for streaming:**
Axios buffers the entire response before resolving the Promise. For streaming NDJSON, use `fetch()` with `response.body.getReader()`. The existing Axios `apiClient` remains for all non-streaming endpoints (search, metadata, impact analysis). Add one custom hook for the streaming lineage endpoint only.

**Frontend streaming hook pattern:**
```typescript
// lineage-ui/src/api/hooks/useLineageStream.ts (new file)
import { useCallback, useRef } from 'react';
import { useLineageStore } from '../../stores/useLineageStore';

export function useLineageStream() {
  const appendGraph = useLineageStore((s) => s.appendGraph);
  const abortRef = useRef<AbortController | null>(null);

  const streamLineage = useCallback(async (
    datasetId: string,
    fieldName: string,
    direction: string,
    maxDepth: number
  ) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const url = `/api/v2/openlineage/lineage/${encodeURIComponent(datasetId)}/${encodeURIComponent(fieldName)}/stream?direction=${direction}&maxDepth=${maxDepth}`;
    const response = await fetch(url, { signal: ctrl.signal });

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';  // Keep incomplete last line
      for (const line of lines) {
        if (!line.trim()) continue;
        const chunk = JSON.parse(line);
        if (chunk.depth !== 'done') {
          appendGraph(chunk.nodes, chunk.edges);
        }
      }
    }
  }, [appendGraph]);

  return { streamLineage, abort: () => abortRef.current?.abort() };
}
```

---

## What NOT to Add

| Library | Why to Avoid |
|---------|-------------|
| rustworkx | Overkill at 10K–100K edges. Adds Rust compilation build dependency. Different API from networkx. Performance gain materializes only at millions of nodes and when BFS is the bottleneck. |
| Flask-SSE (singingwolfboy/flask-sse) | Requires Redis pub/sub for SSE. Already have Redis, but SSE adds complexity for a use case (one-shot graph load) that plain NDJSON serves better. |
| WebSockets (Flask-SocketIO) | Bidirectional protocol with connection lifecycle overhead. Graph loading is server-to-client one-shot stream. Wrong tool. |
| graph-tool | C++ extension, complex installation, GPL license. Research-oriented library. Not suited for a Flask service needing simple BFS. |
| igraph (python-igraph) | Better performance than networkx, but requires C library. Installation on macOS/Linux varies. Benefit doesn't justify the dev environment complexity at this scale. |
| ndjson-readablestream (npm) | Unnecessary npm dependency. Native `fetch` + manual line splitting handles NDJSON with ~10 lines of TypeScript. |
| TanStack DB | Experimental (v0.5 as of 2026). Designed for synchronized client-side collections, not one-shot graph streaming. Current TanStack Query v5 handles the progressive loading pattern via `appendGraph`. |
| GraphQL subscriptions | Architectural overhaul. The existing REST API is a deliberate and correct choice for this application. |

---

## Installation

```bash
# Backend: Add networkx to requirements.txt
# No other new Python dependencies required

pip install networkx>=3.6.1

# Frontend: No new npm packages required
# Native fetch API handles NDJSON streaming
# Existing React Flow, Zustand, TanStack Query handle incremental rendering
```

**Updated requirements.txt additions:**
```
# In-memory graph engine for BFS/DFS lineage traversal
networkx>=3.6.1
```

---

## Integration Points with Existing Architecture

### Backend Integration

| Existing Component | Change |
|-------------------|--------|
| `python_server.py` → `create_app()` | Add `GraphEngine` instantiation after `init_cache(app)`. Call `graph_engine.load(connection)` at startup. Pass `graph_engine` to a new `GraphLineageService` (or extend `LineageService`). |
| `LineageService` | Add new methods that delegate to `GraphEngine` instead of `LineageRepository` CTEs. Keep CTE methods as fallback if graph not loaded. |
| `LineageRepository` (CTE methods) | Retain as-is. Used for cache warm-up fallback and correctness verification during development. |
| Redis cache | Graph engine bypasses Redis for traversal (in-memory is faster). Redis remains for expensive metadata queries (dataset info, field types). Cache invalidation: call `graph_engine.load()` after lineage mutation (populate_lineage.py runs). |
| Routes (`routes/openlineage.py`) | Add new streaming endpoints alongside existing endpoints. Existing endpoints remain unchanged — they serve cached or CTE results. |

### Frontend Integration

| Existing Component | Change |
|-------------------|--------|
| `useLineageStore` | Add `appendGraph(nodes, edges)` action that merges new nodes/edges deduplicating by `id`. Add `isStreaming: boolean` and `streamingDepth: number` state. |
| `useLineage.ts` | Keep existing `useQuery`-based hook. Add new `useLineageStream.ts` hook for streaming endpoint. Caller chooses which to use based on feature flag or depth. |
| `LineageGraph` component | No change to React Flow rendering logic. The `setGraph`/`appendGraph` state updates trigger existing React Flow re-renders. |
| ELKjs Web Worker | Run layout after each complete depth batch, not per-node. Existing worker interface unchanged — just call it more frequently during streaming. |

---

## Version Compatibility

| Package | Current | Recommended | Notes |
|---------|---------|-------------|-------|
| networkx | not installed | >=3.6.1 | Latest stable: 3.6.1 (Dec 8, 2025). Requires Python >=3.11. Flask app already on Python 3.x — verify >=3.11. |
| Flask | >=3.0.0 | unchanged | `stream_with_context` and generator responses are stable in Flask 3.x. |
| @xyflow/react | ^12.0.0 | unchanged | `setNodes`, `addNodes`, `hidden` property all available in v12. |
| @tanstack/react-query | ^5.17.0 | unchanged | Not used for streaming endpoint; `useLineageStream` uses native fetch. |

**Python version check:** networkx 3.6.1 requires Python !=3.14.1, >=3.11. Confirm Flask server uses Python 3.11+.

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Graph library | networkx 3.6.1 | rustworkx 0.17.1 | 3–100x faster but only matters at millions of edges; adds Rust build dependency; different API |
| Graph library | networkx 3.6.1 | custom dict adjacency | Saves ~10 MB RAM at 100K edges but requires reimplementing BFS, cycle detection, reverse traversal, path tracking |
| Streaming format | NDJSON over HTTP | SSE (EventSource) | SSE structured protocol overhead unnecessary; EventSource doesn't support custom headers; auto-reconnect counterproductive for one-shot loads |
| Streaming format | NDJSON over HTTP | WebSocket | Bidirectional connection overhead for a unidirectional stream; requires Flask-SocketIO |
| Frontend streaming | native fetch | Axios streaming | Axios buffers full response before resolving; native fetch with ReadableStream is the correct API for streaming |
| Graph init | startup singleton in `create_app()` | lazy load on first request | First request still bears Teradata load latency. Startup load amortizes cost; consistent with how Redis cache is initialized. |

---

## Confidence Assessment

| Area | Confidence | Basis |
|------|------------|-------|
| networkx as graph library | HIGH | Official docs, PyPI (3.6.1 Dec 2025), verified BFS API with depth_limit |
| NDJSON over Flask generator | HIGH | Official Flask streaming docs, NDJSON spec, pattern proven in production LLM streaming |
| native fetch for streaming | HIGH | MDN ReadableStream API, well-established pattern |
| Memory estimate (100 bytes/edge) | MEDIUM | NetworkX mailing list, community analysis — not official benchmark |
| rustworkx performance claim (3–100x) | HIGH | Official rustworkx benchmark page, academic paper |
| "networkx sufficient at 100K edges" | MEDIUM | Extrapolated from lineage analysis article (9s for 100K traversals with BFS — likely overkill for single-column traversal) |
| Multi-worker memory sharing caution | HIGH | Gunicorn official documentation, Flask deployment docs |

---

## Sources

**NetworkX:**
- [networkx PyPI — Latest version 3.6.1, Dec 2025](https://pypi.org/project/networkx/) (HIGH confidence)
- [NetworkX bfs_edges API — depth_limit parameter](https://networkx.org/documentation/stable/reference/algorithms/generated/networkx.algorithms.traversal.breadth_first_search.bfs_edges.html) (HIGH confidence)
- [Data Lineage Analysis with Python and NetworkX — Rittman Mead, 2024](https://www.rittmanmead.com/blog/2024/08/data-lineage-analysis-with-python-and-networkx/) (MEDIUM confidence — real-world lineage use case with BFS performance data)
- [NetworkX memory overhead discussion — Google Groups](https://groups.google.com/g/networkx-discuss/c/5zZ_OBu-wYA) (MEDIUM confidence)

**rustworkx:**
- [rustworkx PyPI — Version 0.17.1, Aug 2025](https://pypi.org/project/rustworkx/) (HIGH confidence)
- [rustworkx Benchmark Comparisons](https://www.rustworkx.org/benchmarks.html) (HIGH confidence)
- [rustworkx GitHub — Qiskit/rustworkx](https://github.com/Qiskit/rustworkx) (HIGH confidence)

**Flask Streaming:**
- [Flask Streaming Documentation — Official 3.1.x](https://flask.palletsprojects.com/en/stable/patterns/streaming/) (HIGH confidence)
- [Streaming JSON with Flask — Al4 Blog](https://blog.al4.co.nz/2016/01/streaming-json-with-flask/) (MEDIUM confidence)
- [NDJSON 101: Streaming Over HTTP — APIdog](https://apidog.com/blog/ndjson/) (MEDIUM confidence)

**Frontend Streaming:**
- [Streaming Data with Fetch and NDJSON — David Walsh](https://davidwalsh.name/streaming-data-fetch-ndjson) (MEDIUM confidence)
- [Fetching JSON over Streaming HTTP — Pamela Fox](http://blog.pamelafox.org/2023/08/fetching-json-over-streaming-http.html) (MEDIUM confidence)
- [MDN: Using Readable Streams](https://developer.mozilla.org/en-US/docs/Web/API/Streams_API/Using_readable_streams) (HIGH confidence)

**React Flow:**
- [React Flow Performance Documentation](https://reactflow.dev/learn/advanced-use/performance) (HIGH confidence)
- [React Flow Large Graph Discussion](https://github.com/xyflow/xyflow/discussions/4975) (MEDIUM confidence)

**Multi-worker Memory:**
- [Sharing data across Gunicorn workers — JG Lee, Medium](https://medium.com/@jgleeee/sharing-data-across-workers-in-a-gunicorn-flask-application-2ad698591875) (MEDIUM confidence)
- [Flask Gunicorn Deployment Docs](https://flask.palletsprojects.com/en/stable/deploying/gunicorn/) (HIGH confidence)

---

*Stack research for: In-memory graph engine with BFS/DFS traversal and progressive depth loading*
*Researched: 2026-02-20*
*Confidence: HIGH for core choices (networkx, Flask NDJSON streaming, native fetch). MEDIUM for memory estimates at production scale.*
