# Phase 14: In-Memory Graph Engine - Research

**Researched:** 2026-02-20
**Domain:** In-memory graph traversal, Python threading, Gunicorn worker model
**Confidence:** HIGH (core stack verified via official docs and direct codebase inspection)

## Summary

Phase 14 replaces recursive CTE database round-trips with BFS traversal over a `networkx.DiGraph` that is loaded once at startup and rebuilt in the background. The existing codebase already has clean separation: `LineageRepository` does SQL, `LineageService` builds nodes/edges, `routes/openlineage.py` dispatches calls. The in-memory engine slots in as a new code path inside `LineageService` (or via a `GraphEngine` singleton that `LineageService` delegates to), with fallback to the existing CTE path while the graph warms up.

The two critical engineering decisions for this phase are the Gunicorn worker model (multi-process workers cannot share in-memory state — only `--workers 1 --threads N` with the `gthread` worker class solves this without external state stores) and the thread-safe blue-green swap pattern (build new DiGraph into a local variable, acquire a lock, reassign the module-level reference, release). Both are well-understood patterns with verified implementations.

NetworkX 3.4+ (the system-installed version is 3.4.2) supports `bfs_edges(G, source, reverse=False, depth_limit=N)` natively. Python 3.9 (the project venv) is fully supported. The BFS output is a sequence of `(u, v)` edge tuples — edge attributes (`transformation_type`) must be fetched from `G[u][v]` after traversal, exactly as the CTE results return them. The `depth_limit` parameter mirrors the `max_depth` argument already used in CTE queries.

Memory footprint for 100K edges in a Python networkx DiGraph is estimated at 50-150 MB RSS based on the nested-dict memory model (~500 bytes per edge in Python objects vs 32 bytes in C-based igraph). A one-day measurement spike is required at the start of Phase 14 to confirm this estimate against production data before committing to networkx. The prior decision document already calls this out.

**Primary recommendation:** Use `--workers 1 --threads N` (gthread worker) for Gunicorn to ensure a single shared in-memory graph. Build `GraphEngine` as a module-level singleton with a `threading.RLock` protecting the graph reference swap, a `threading.Event` for warm-up status signaling, and a daemon background thread for initial load and periodic rebuilds.

## User Constraints

No CONTEXT.md exists for this phase. All decisions below come from the prior decisions recorded in the phase description.

### Locked Decisions
- networkx DiGraph chosen over plain dicts — maintainability over memory; optimize only if production RSS exceeds targets
- Polling (two TanStack Query fetches) chosen over SSE for the status endpoint
- Blue-green graph swap pattern required from day one
- Defer ELKjs layout to final depth only (no change to frontend in this phase)
- Gunicorn worker model (`--preload` or `--workers 1 --threads N`) must be decided and validated in Phase 14
- BFS/CTE semantic equivalence tests must be written and passing before CTE path is retired

### Claude's Discretion
- Specific threading primitives for the swap lock and warm-up event
- Whether `GraphEngine` lives as a class or module-level functions
- File/module organization within `lineage-api/`
- How `load_all_lineage()` batches the initial DB load

### Deferred Ideas (OUT OF SCOPE)
- SSE-based status streaming
- Multi-process shared memory (mmap, multiprocessing.Manager)
- igraph or other C-extension graph libraries
- Graph persistence to disk between restarts

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| networkx | 3.4.2 (system), add to requirements.txt | DiGraph, BFS traversal | Already decided; Python-native, excellent API |
| threading | stdlib | Background thread, RLock, Event | Zero dependencies, sufficient for single-process |
| psutil | any recent | RSS memory measurement for status endpoint | Standard process introspection library |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| collections.deque | stdlib | BFS queue if hand-rolling traversal | Only if networkx BFS doesn't meet depth semantics |
| time | stdlib | last_rebuild_time timestamp in status endpoint | Trivial — no library needed |
| loguru | already in requirements.txt | Structured logging for graph load events | Already used throughout the codebase |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| networkx DiGraph | plain dict of dicts | Lower memory, but no traversal algorithms — hand-roll BFS |
| networkx DiGraph | igraph (C extension) | 10-20x less memory per edge, but C dependency and API unfamiliar |
| threading.RLock | threading.Lock | Lock is sufficient here (no re-entrant callers), but RLock is more defensive |
| --workers 1 --threads N | --preload + multiple workers | preload COW does not share mutable post-fork writes; threads within one worker share memory |

**Installation:**
```bash
pip install networkx psutil
```

Add to `requirements.txt`:
```
networkx>=3.4.0
psutil>=5.9.0
```

## Architecture Patterns

### Recommended Project Structure
```
lineage-api/
├── graph/
│   ├── __init__.py          # Exports GraphEngine, GraphStore
│   ├── engine.py            # GraphEngine singleton (BFS, blue-green swap, status)
│   ├── loader.py            # GraphLoader (loads all lineage rows into DiGraph)
│   └── store.py             # GraphStore (data container: DiGraph + metadata)
├── repositories/
│   └── lineage_repository.py  # Add load_all_lineage() method
├── services/
│   └── lineage_service.py     # Add dual-path routing: BFS or CTE fallback
└── routes/
    ├── openlineage.py          # Existing lineage endpoints (unchanged)
    └── graph.py               # NEW: GET /api/v2/graph/status endpoint
```

### Pattern 1: GraphStore — Data Container

**What:** Immutable snapshot of the graph at a point in time. Holds the DiGraph and metadata (node_count, edge_count, loaded_at, memory_bytes).

**When to use:** Always. This is the unit that gets swapped in the blue-green pattern. Never mutate the active store; build a new one and swap.

```python
# lineage-api/graph/store.py
import time
import psutil
import os
from dataclasses import dataclass, field
import networkx as nx

@dataclass
class GraphStore:
    graph: nx.DiGraph
    node_count: int
    edge_count: int
    loaded_at: float = field(default_factory=time.time)
    memory_bytes: int = 0

    @classmethod
    def build(cls, graph: nx.DiGraph) -> "GraphStore":
        process = psutil.Process(os.getpid())
        return cls(
            graph=graph,
            node_count=graph.number_of_nodes(),
            edge_count=graph.number_of_edges(),
            loaded_at=time.time(),
            memory_bytes=process.memory_info().rss,
        )
```

### Pattern 2: GraphLoader — Database to DiGraph

**What:** Queries `OL_COLUMN_LINEAGE` for all active rows (`is_active = 'Y'`) and builds a DiGraph. Nodes are `"dataset.field"` strings (matching the existing node ID format in `LineageService`). Edge attributes store `transformation_type`.

**When to use:** Called once at startup and again during rebuild.

```python
# lineage-api/graph/loader.py
import networkx as nx

class GraphLoader:
    def __init__(self, connection):
        self.connection = connection

    def load(self) -> nx.DiGraph:
        G = nx.DiGraph()
        with self.connection.cursor() as cur:
            cur.execute("""
                LOCKING ROW FOR ACCESS
                SELECT
                    source_dataset,
                    source_field,
                    target_dataset,
                    target_field,
                    transformation_type
                FROM OL_COLUMN_LINEAGE
                WHERE is_active = 'Y'
            """)
            for row in cur.fetchall():
                src = f"{row[0].strip()}.{row[1].strip()}"
                tgt = f"{row[2].strip()}.{row[3].strip()}"
                ttype = (row[4] or "DIRECT").strip()
                G.add_edge(src, tgt, transformation_type=ttype)
        return G
```

**Note:** Node IDs use `"dataset.field"` format matching `LineageService._build_node()` key format (`f"{dataset_name}.{field_name}"`). This is critical for BFS/CTE semantic equivalence — the node ID space must be identical.

### Pattern 3: GraphEngine Singleton — BFS + Blue-Green Swap

**What:** Module-level singleton holding a `GraphStore` reference, protected by `threading.RLock`. Provides `traverse_upstream()`, `traverse_downstream()`, `is_ready` flag, and `status` dict. Background thread does initial load and periodic rebuilds.

**When to use:** `LineageService` calls this instead of `LineageRepository` when `GraphEngine.is_ready` is True.

```python
# lineage-api/graph/engine.py
import threading
import networkx as nx
from loguru import logger
from graph.store import GraphStore
from graph.loader import GraphLoader

class GraphEngine:
    def __init__(self):
        self._store: GraphStore | None = None
        self._lock = threading.RLock()
        self._ready = threading.Event()
        self._loader: GraphLoader | None = None

    def initialize(self, connection):
        """Called once from create_app(). Starts background warmup thread."""
        self._loader = GraphLoader(connection)
        t = threading.Thread(target=self._warmup, daemon=True, name="graph-warmup")
        t.start()

    def _warmup(self):
        """Background thread: load graph, then swap."""
        try:
            logger.info("Graph engine: starting warmup")
            graph = self._loader.load()
            self._swap(graph)
            self._ready.set()
            logger.info(
                "Graph engine: warmup complete",
                nodes=self._store.node_count,
                edges=self._store.edge_count,
            )
        except Exception as e:
            logger.error(f"Graph engine: warmup failed: {e}")

    def _swap(self, graph: nx.DiGraph):
        """Atomically swap the active GraphStore. Thread-safe."""
        new_store = GraphStore.build(graph)
        with self._lock:
            self._store = new_store

    @property
    def is_ready(self) -> bool:
        return self._ready.is_set()

    def traverse_upstream(self, node_id: str, max_depth: int) -> list[dict]:
        """BFS upstream (reverse direction). Returns list of edge dicts."""
        with self._lock:
            store = self._store
        if store is None or node_id not in store.graph:
            return []
        return self._bfs_edges(store.graph, node_id, reverse=True, max_depth=max_depth)

    def traverse_downstream(self, node_id: str, max_depth: int) -> list[dict]:
        """BFS downstream (forward direction). Returns list of edge dicts."""
        with self._lock:
            store = self._store
        if store is None or node_id not in store.graph:
            return []
        return self._bfs_edges(store.graph, node_id, reverse=False, max_depth=max_depth)

    def _bfs_edges(self, G: nx.DiGraph, source: str, reverse: bool, max_depth: int) -> list[dict]:
        """
        Collect edges from BFS traversal, matching CTE output format.
        bfs_edges yields (u, v) — edge data fetched from G[u][v].
        For reverse traversal, bfs_edges explores predecessors (upstream).
        """
        results = []
        for u, v in nx.bfs_edges(G, source=source, reverse=reverse, depth_limit=max_depth):
            # bfs_edges with reverse=True returns edges in reverse: u is the "closer" node
            # The actual edge in the DiGraph goes source_node -> target_node
            if reverse:
                # When traversing upstream, u is target, v is source in DiGraph terms
                src_node, tgt_node = v, u
            else:
                src_node, tgt_node = u, v
            edge_data = G[src_node][tgt_node]
            src_dataset, src_field = src_node.rsplit(".", 1)
            tgt_dataset, tgt_field = tgt_node.rsplit(".", 1)
            results.append({
                "source_dataset": src_dataset,
                "source_field": src_field,
                "target_dataset": tgt_dataset,
                "target_field": tgt_field,
                "transformation_type": edge_data.get("transformation_type", "DIRECT"),
            })
        return results

    @property
    def status(self) -> dict:
        with self._lock:
            store = self._store
        if store is None:
            return {
                "ready": False,
                "node_count": 0,
                "edge_count": 0,
                "last_rebuild_time": None,
                "memory_bytes": 0,
            }
        return {
            "ready": True,
            "node_count": store.node_count,
            "edge_count": store.edge_count,
            "last_rebuild_time": store.loaded_at,
            "memory_bytes": store.memory_bytes,
        }

# Module-level singleton
graph_engine = GraphEngine()
```

### Pattern 4: Dual-Path Routing in LineageService

**What:** `LineageService` checks `graph_engine.is_ready`. If True, delegates BFS traversal to `GraphEngine`. If False (warming up, or engine failure), falls back to the existing `LineageRepository` CTE path.

**When to use:** Every lineage request.

```python
# In lineage_service.py — get_column_lineage_graph, get_table_lineage_graph
from graph.engine import graph_engine

# In get_upstream_lineage call sites:
if graph_engine.is_ready:
    raw_edges = graph_engine.traverse_upstream(
        f"{dataset_name}.{field_name}", max_depth
    )
    # raw_edges has same keys as CTE result minus namespace fields
    # namespace fields are filled from dataset_repo lookup (same as today)
else:
    raw_edges = self.lineage_repo.get_upstream_lineage(
        dataset_name, field_name, max_depth
    )
```

**Critical:** The BFS result dict keys must match the CTE result dict keys that `_add_lineage_results()` expects: `source_dataset`, `source_field`, `source_namespace`, `target_dataset`, `target_field`, `target_namespace`, `transformation_type`. The BFS path does not naturally return namespaces — these need a lookup from `dataset_repo` or can be omitted and handled by `_build_node` (which already handles missing namespace gracefully).

### Pattern 5: Gunicorn Worker Model

**What:** Single worker, multiple threads using `gthread` worker class.

**Command:**
```bash
gunicorn --workers 1 --threads 8 --worker-class gthread python_server:create_app()
```

**Why `--workers 1 --threads N`:**
- Gunicorn's fork-based multi-worker model creates separate process address spaces. Each worker gets its own copy of Python objects. After `fork()`, writes to `self._store` in one worker do NOT propagate to other workers.
- With `--workers 1`, all request threads share the same process memory. The `graph_engine` singleton is shared across all threads, protected by the RLock.
- `--preload` can still be used for faster startup, but only matters with single worker (COW savings not the goal here).
- `gthread` is the Gunicorn sync-with-threads worker type — it handles concurrent requests using OS threads, which is appropriate for I/O-bound workloads.

**Configuration to add to requirements.txt:**
```
gunicorn>=21.0.0
```

**NOT recommended:** `--workers N` (N > 1) with any in-memory graph. Each worker would independently load its own DiGraph, multiplying memory usage N times with no cross-worker sharing of rebuilds.

### Pattern 6: Status Endpoint

**What:** `GET /api/v2/graph/status` returns the graph engine status JSON.

```python
# lineage-api/routes/graph.py
from flask import Blueprint, jsonify
from graph.engine import graph_engine

graph_bp = Blueprint("graph", __name__, url_prefix="/api/v2/graph")

@graph_bp.route("/status", methods=["GET"])
def get_graph_status():
    return jsonify(graph_engine.status)
```

Register in `python_server.py`:
```python
from routes.graph import graph_bp
app.register_blueprint(graph_bp)
```

### Anti-Patterns to Avoid
- **Building graph in request handler:** Never build or load the graph inside a request — this blocks the response thread and defeats the purpose.
- **Multiple workers with shared graph:** `--workers N` where N > 1 with in-memory singleton breaks isolation. Each process has its own copy.
- **Mutating the active GraphStore in-place:** The blue-green pattern requires building a new DiGraph object and swapping the reference. Never call `G.add_edge()` or `G.remove_edge()` on the live graph while requests are reading it.
- **Using threading.Lock instead of reading outside lock:** Acquire the lock only long enough to copy the reference, then release before doing the BFS walk. Never hold the lock during traversal.
- **Storing namespace in the DiGraph node:** Namespace is not in `OL_COLUMN_LINEAGE` per-edge — it is in `OL_NAMESPACE` via `OL_DATASET`. Keep the DiGraph lean (source/target/transformation_type only); fetch namespace from DatasetRepository as needed.
- **Calling `graph_engine.is_ready` inside the lock:** `is_ready` uses `threading.Event.is_set()` which is already atomic. No outer lock needed for the check.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| BFS with depth limit | Custom deque-based BFS loop | `nx.bfs_edges(G, source, reverse, depth_limit)` | Tested, handles depth correctly per Wikipedia depth-limited-search spec |
| Read-write lock for graph swap | Custom ReaderWriterLock class | `threading.RLock` with short critical section | Acquiring only to copy a reference is fast enough; full RW lock adds complexity without benefit at this scale |
| Memory measurement | Custom bytecounting | `psutil.Process().memory_info().rss` | Cross-platform, one liner, already the standard |
| Atomic reference swap | Compare-and-swap machinery | `with self._lock: self._store = new_store` | Lock-protected assignment is sufficient; Python's swap-is-not-atomic problem is solved by the lock |

**Key insight:** networkx already solves the hard traversal problems. The implementation work is mostly wiring (loader, singleton, dual-path routing, status endpoint) not algorithmic.

## Common Pitfalls

### Pitfall 1: Multi-Worker Memory Isolation
**What goes wrong:** Deploy with `--workers 4`. Each worker loads its own 200MB DiGraph. Total RSS = 800MB. Worse, graph rebuilds in worker 1 are invisible to workers 2-4 — they serve stale data forever.
**Why it happens:** `fork()` creates isolated address spaces. The in-memory graph cannot be shared across processes without IPC (pipes, shared memory, Redis).
**How to avoid:** Enforce `--workers 1` in the Gunicorn startup command. Document this constraint clearly. Validate in staging before production.
**Warning signs:** Load-balanced responses show different `node_count` values from the same process at the same time, or memory usage is N × expected.

### Pitfall 2: BFS Traversal Edge Direction Confusion
**What goes wrong:** `nx.bfs_edges(G, source, reverse=True)` yields edges in (u, v) order where u is closer to source in the reverse-traversal tree. The DiGraph edge goes from v → u. Swapping source/target in the result dict produces upstream edges that look like downstream edges in the API response.
**Why it happens:** BFS always yields edges parent-first (the already-visited node first). With reverse=True, the parent in the BFS tree is the downstream node.
**How to avoid:** When reverse=True (upstream traversal), swap u and v when constructing the result dict: `src_node, tgt_node = v, u`. Covered by the equivalence tests (GRAPH-08).
**Warning signs:** BFS/CTE equivalence test failures for upstream direction.

### Pitfall 3: Node Not Found in DiGraph
**What goes wrong:** `nx.bfs_edges(G, source="db.table.col")` raises `NetworkXError` if source node is not in the graph.
**Why it happens:** The DiGraph only contains nodes that have lineage edges. Orphan columns (no upstream, no downstream) exist only in `OL_DATASET_FIELD`, not in `OL_COLUMN_LINEAGE`. Requesting lineage for an orphan would throw.
**How to avoid:** Check `node_id in G` before calling `bfs_edges`. Return empty list (same as CTE returns empty rows). This is already modeled in the code example above.
**Warning signs:** 500 errors on columns that have no lineage connections.

### Pitfall 4: Lock Held During BFS
**What goes wrong:** Acquire `self._lock` before BFS traversal and hold it for the entire walk. All concurrent requests serialize on the lock. Latency degrades to worse than the CTE path.
**Why it happens:** Naive "protect everything with a lock" approach.
**How to avoid:** Acquire the lock only to copy the `store` reference, release it, then traverse the copy. The DiGraph is never mutated during traversal (blue-green ensures this), so traversing without holding the lock is safe.
**Warning signs:** All requests serialize. Latency high even on warm graph.

### Pitfall 5: Namespace Missing from BFS Result
**What goes wrong:** `_add_lineage_results()` in `LineageService` expects `source_namespace` and `target_namespace` in each edge dict. BFS results do not contain namespace (it is not stored in `OL_COLUMN_LINEAGE` per-edge). This causes `KeyError` or empty namespace in node dicts.
**Why it happens:** The CTE query joins implicitly through dataset_name — namespace is fetched separately from `dataset_repo.get_dataset_metadata()`. BFS skips the DB query entirely.
**How to avoid:** Either (a) add namespace fields to the BFS result dict (fetched from `dataset_repo`) before calling `_add_lineage_results`, or (b) modify `_add_lineage_results` to tolerate missing namespace and always fall back to `dataset_repo` for namespace resolution. Option (b) is already what the code does — `source_namespace` from the record is passed through to `_build_node` as the `namespace` argument, but `_build_node` does not validate it. Verify this path doesn't cause empty namespaces in API responses.
**Warning signs:** API responses with empty `namespace` fields on nodes, or nodes missing the `namespace` key entirely.

### Pitfall 6: Gunicorn --preload With Background Thread
**What goes wrong:** Using `--preload` starts the app in the master process, then forks workers. If the background warmup thread starts before the fork, the thread is NOT inherited by child processes (fork does not inherit threads). The DiGraph loads in the master, never in the workers.
**Why it happens:** `os.fork()` creates a copy of only the calling thread. Background threads are silently dropped.
**How to avoid:** With `--workers 1 --threads N`, there is only one process (the worker). The background thread starts inside that single process and is safe. If `--preload` is used with `--workers 1`, confirm `initialize()` is called via Flask's `with app.app_context()` post-fork hook, not before. The simplest approach: do not use `--preload` unless memory savings are needed, and if used, validate that the warmup thread actually starts in the worker process.
**Warning signs:** Graph engine never reaches `is_ready=True`; all requests fall back to CTE path permanently.

### Pitfall 7: rsplit(".", 1) on Dataset Names Without Periods
**What goes wrong:** `node_id.rsplit(".", 1)` fails silently or produces wrong output if the node ID has an unexpected format.
**Why it happens:** The node ID format in `LineageService` is `f"{dataset_name}.{field_name}"` where `dataset_name` is `"database.tablename"` (two dot-separated parts). So the node ID is actually `"database.tablename.fieldname"` — three parts. `rsplit(".", 1)` splits off only the last part, giving `("database.tablename", "fieldname")` which is correct.
**How to avoid:** Verify with the actual data before writing the split. Use `rsplit(".", 1)` not `split(".")` — this handles `"database.tablename.fieldname"` correctly.
**Warning signs:** Incorrect `source_dataset` values in BFS results (e.g., `"demo_user"` instead of `"demo_user.MY_TABLE"`).

## Code Examples

Verified patterns from official sources and the existing codebase:

### Loading All Active Lineage Edges
```python
# Source: OL_COLUMN_LINEAGE schema + lineage_repository.py patterns
# lineage-api/graph/loader.py
with self.connection.cursor() as cur:
    cur.execute("""
        LOCKING ROW FOR ACCESS
        SELECT source_dataset, source_field, target_dataset, target_field, transformation_type
        FROM OL_COLUMN_LINEAGE
        WHERE is_active = 'Y'
    """)
    G = nx.DiGraph()
    for row in cur.fetchall():
        src = f"{row[0].strip()}.{row[1].strip()}"
        tgt = f"{row[2].strip()}.{row[3].strip()}"
        G.add_edge(src, tgt, transformation_type=(row[4] or "DIRECT").strip())
```

### Upstream BFS (Reverse Traversal)
```python
# Source: networkx docs — bfs_edges with reverse=True
# Equivalent to CTE upstream traversal: follows target_column → source_column
import networkx as nx

G = nx.DiGraph()
G.add_edge("db.src.col_a", "db.tgt.col_b", transformation_type="DIRECT")

# Upstream from col_b: finds col_a
edges = list(nx.bfs_edges(G, source="db.tgt.col_b", reverse=True, depth_limit=5))
# yields: [("db.tgt.col_b", "db.src.col_a")]
# Note: with reverse=True, u is "tgt" side, v is "src" side — swap to match CTE convention
for u, v in edges:
    edge_data = G[v][u]   # DiGraph edge goes src → tgt, so G[v][u] is the forward edge
    print(f"source={v}, target={u}, type={edge_data['transformation_type']}")
```

### Downstream BFS (Forward Traversal)
```python
# Source: networkx docs — bfs_edges
# Equivalent to CTE downstream traversal: follows source_column → target_column
edges = list(nx.bfs_edges(G, source="db.src.col_a", reverse=False, depth_limit=5))
# yields: [("db.src.col_a", "db.tgt.col_b")]
for u, v in edges:
    edge_data = G[u][v]
    print(f"source={u}, target={v}, type={edge_data['transformation_type']}")
```

### Blue-Green Graph Swap (Thread-Safe)
```python
# Source: Python docs threading.RLock + swap atomicity article
import threading

class GraphEngine:
    def __init__(self):
        self._store = None
        self._lock = threading.RLock()

    def _swap(self, new_graph):
        new_store = GraphStore.build(new_graph)
        with self._lock:          # Only hold lock for the reference swap
            self._store = new_store   # Reference assignment is atomic after lock

    def _read_store(self):
        with self._lock:
            return self._store    # Copy reference while holding lock, traverse outside
```

### Daemon Background Thread for Warmup
```python
# Source: Python docs threading.Thread + Flask background thread pattern
import threading

def initialize(self, connection):
    self._loader = GraphLoader(connection)
    t = threading.Thread(
        target=self._warmup,
        daemon=True,         # Exits when main process exits — no blocking shutdown
        name="graph-warmup"
    )
    t.start()
```

### Memory Measurement
```python
# Source: psutil docs
import psutil, os
process = psutil.Process(os.getpid())
rss_bytes = process.memory_info().rss
```

### Status Response Format
```python
# Source: phase requirements (GRAPH-08 / SC-5)
{
    "ready": True,
    "node_count": 45231,
    "edge_count": 98743,
    "last_rebuild_time": 1708432800.0,   # Unix timestamp
    "memory_bytes": 156000000            # Process RSS in bytes
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Recursive CTE (Teradata round-trip) | In-memory BFS (networkx DiGraph) | Phase 14 | <100ms vs 500ms-2s per traversal |
| No graph status visibility | `GET /api/v2/graph/status` endpoint | Phase 14 | Operations can monitor warm-up state |
| All requests blocked during startup latency | Background warmup + CTE fallback | Phase 14 | Zero downtime graph initialization |

**Deprecated/outdated after this phase:**
- Recursive CTE queries in `LineageRepository` are NOT removed in this phase — they remain as fallback path until GRAPH-08 equivalence is proven and explicitly retired in a future phase.

## Open Questions

1. **Reverse=True edge direction convention in networkx bfs_edges**
   - What we know: `bfs_edges(G, source, reverse=True)` yields `(u, v)` tuples where BFS explores predecessors. Based on the source code, with `reverse=True`, the traversal follows edges backward (from target to source in DiGraph terms), and the yielded tuple has the already-visited (downstream) node as `u` and the newly discovered (upstream) node as `v`.
   - What's unclear: The exact yielded tuple ordering for reverse traversal is not shown clearly in the official docs. The WebFetch showed the function source code but no reverse=True example.
   - Recommendation: Write a 5-line Python test at the start of Plan 14-01 to validate the exact `(u, v)` tuple convention before writing production code. This is the single highest-risk ambiguity in Phase 14.

2. **Memory footprint at production scale (100K edges)**
   - What we know: networkx uses nested Python dicts (~500 bytes per edge estimated). System networkx 3.4.2 is installed but not yet in requirements.txt.
   - What's unclear: Actual RSS at demo_user scale (how many active OL_COLUMN_LINEAGE rows exist in production?).
   - Recommendation: Execute the one-day spike at the start of Phase 14 as planned. Script: load all active rows into a DiGraph and measure `psutil.Process().memory_info().rss` before and after. If RSS delta > 300MB, escalate to project decision.

3. **Gunicorn --preload + background thread fork behavior**
   - What we know: `fork()` does not inherit threads. If warmup starts before fork, the thread dies in the master and is never started in workers.
   - What's unclear: Whether Gunicorn `--preload` with `--workers 1` actually forks at all (it should still create a single worker process via fork).
   - Recommendation: Validate with a minimal test harness in staging. The safe path: call `graph_engine.initialize()` inside the Flask `@app.before_serving` hook (Gunicorn's `post_fork` server hook), which runs after fork. Alternatively, call it inside `create_app()` and accept that with `--workers 1` there is only one post-fork worker anyway.

4. **`source_namespace` in BFS results**
   - What we know: `OL_COLUMN_LINEAGE` does not store `source_namespace` or `target_namespace` per edge. The CTE queries return them from the row data. `_add_lineage_results()` reads `record["source_namespace"]` and `record["target_namespace"]` directly.
   - What's unclear: Whether the namespace is actually needed in the node dict for the frontend, or whether an empty string is acceptable.
   - Recommendation: At the start of Plan 14-02, check what the frontend does with `node.dataset.namespace`. If it's used only for display, an empty string BFS fallback is fine. If it's used for routing or deduplication, BFS results need a dataset_repo lookup per unique dataset. The `_get_source_type()` pattern in `LineageService` already does a cached dataset_repo lookup — the same cache can provide namespace.

## Sources

### Primary (HIGH confidence)
- NetworkX 3.6.1 official docs — `DiGraph`, `bfs_edges`, `bfs_tree`, `edge_bfs` (https://networkx.org/documentation/stable/)
- Python 3.14 stdlib threading docs — `Thread`, `RLock`, `Event`, `Lock` (https://docs.python.org/3/library/threading.html)
- Existing codebase: `/lineage-api/repositories/lineage_repository.py` — CTE query structure and output dict format
- Existing codebase: `/lineage-api/services/lineage_service.py` — node/edge building, `_add_lineage_results()` interface
- Existing codebase: `/lineage-api/python_server.py` — Flask app factory, service wiring
- Existing codebase: `/database/scripts/setup/setup_lineage_schema.py` — OL_COLUMN_LINEAGE schema
- Existing codebase: `/database/tests/test_correctness.py` — CYCLE5, NESTED_DIAMOND, FANOUT10 test pattern definitions

### Secondary (MEDIUM confidence)
- psutil docs (https://psutil.readthedocs.io/) — `Process.memory_info().rss`
- Gunicorn worker model: `--workers 1 --threads N` vs `--preload` (https://gunicorn.org, multiple guides)
- Python swap atomicity article (https://emptysqua.re/blog/pythons-swap-is-not-atomic/) — verified: lock + reference assignment is sufficient
- NetworkX memory model: nested-dict design means significant per-edge overhead vs C-extension alternatives (https://memgraph.github.io/networkx-guide/biggest-challenges/)

### Tertiary (LOW confidence)
- Memory estimate for 100K edges (~500 bytes per edge → ~50MB): derived from igraph benchmark (32 bytes/edge) scaled by Python dict overhead factor. Not directly verified with networkx at this scale. **Requires measurement spike.**
- Gunicorn `gthread` concurrent request handling for I/O-bound work: from community guides, not official Gunicorn benchmark documentation.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — networkx 3.4.2 already installed system-wide; stdlib threading verified via official Python docs; `bfs_edges` API verified via official networkx docs
- Architecture: HIGH — based on direct codebase inspection of existing node/edge format, repository patterns, service patterns; BFS edge direction has one LOW-confidence ambiguity (open question 1)
- Pitfalls: HIGH for multi-worker/threading pitfalls (verified via multiple sources); MEDIUM for namespace pitfall (requires code walkthrough to confirm)

**Research date:** 2026-02-20
**Valid until:** 2026-03-20 (stable libraries, 30-day window)
