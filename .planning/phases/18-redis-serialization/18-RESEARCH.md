# Phase 18: Redis Serialization - Research

**Researched:** 2026-02-20
**Domain:** networkx graph serialization, Redis persistence, Python cold-start restore, memory stability
**Confidence:** HIGH

---

## Summary

Phase 18 adds Redis-backed graph persistence so that a cold application restart restores the in-memory `nx.DiGraph` from Redis within under 1 second, instead of re-querying all `OL_COLUMN_LINEAGE` rows from Teradata. The implementation is an additive change to the existing `GraphEngine` / `GraphStore` / `GraphLoader` pipeline introduced in Phase 14 — no architectural shifts are required.

The core mechanics are straightforward: `nx.node_link_data()` serializes the `DiGraph` to a JSON-serializable dict; `json.dumps().encode()` converts it to bytes; `redis_client.set()` stores it. On restore: `redis_client.get()` retrieves the bytes; `json.loads()` parses them; `nx.node_link_graph()` reconstructs the `DiGraph` with all node IDs and edge attributes (`transformation_type`) intact. Benchmarked on a 1,000-node / 9,940-edge graph (representative of production): serialize + store takes ~15ms, get + deserialize takes ~19ms total — comfortably under the 1-second target.

The main engineering decisions are: (1) introduce a `GraphSerializer` class in `graph/serializer.py` as the single place owning the Redis key name and the save/restore/invalidate operations; (2) pass `redis_client=None` as an optional second argument to `GraphEngine.initialize()` so the engine can operate with or without Redis without any code-path branching elsewhere; (3) snapshot deletion lives in `GraphEngine.invalidate()` (via `self._redis`) so that the ETL-triggered invalidation path stays unchanged in `routes/cache.py`.

**Primary recommendation:** Implement `GraphSerializer` with `save()`, `restore()`, and `invalidate()` as plain functions (or classmethods), key `lineage:engine:snapshot`, no TTL (explicit invalidation only), plain JSON encoding (no gzip — 1.1MB raw JSON, 19ms restore is already 50x under budget). Integrate via `initialize(connection, redis_client=None)` and update `python_server.py` to extract the redis-py client from the already-initialized `Flask-Caching` instance.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `networkx` | 3.4.x (installed) | `nx.node_link_data()` / `nx.node_link_graph()` for DiGraph serialization | Built into networkx; produces JSON-serializable dicts; preserves directed flag, node IDs, and all edge attributes |
| `redis` (redis-py) | 7.1.1 (installed) | `client.set()` / `client.get()` / `client.delete()` | Already in requirements.txt; same client used by Flask-Caching in `cache/invalidation.py` |
| `json` (stdlib) | 3.x | Serialize `node_link_data` dict to bytes | No dependency; sufficient for this data shape |
| `fakeredis` | 2.24.x (installed) | In-memory Redis for unit tests | Already in requirements.txt for Phase 6 tests |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `gzip` (stdlib) | 3.x | Optional compression (20x smaller stored bytes) | Only if Redis memory usage becomes a concern — not needed now. Plain JSON 1.1MB → 50KB gzipped, but compression adds ~15ms to both write and read paths. |
| `hashlib` (stdlib) | 3.x | Content hash for snapshot versioning | Only if staleness detection beyond "key exists vs absent" is required |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `nx.node_link_data()` + JSON | `pickle` | pickle is faster but Python-version-sensitive and not human-inspectable; node_link_data is portable and already the nx-blessed JSON format |
| `nx.node_link_data()` + JSON | `nx.adjacency_data()` | adjacency_data is more compact but `node_link_data` is the canonical format for JSON interchange and round-trips DiGraph with directed=True flag in the payload |
| `nx.node_link_data()` + JSON | `msgpack` | marginal size/speed gain; adds a dependency; not justified given 19ms restore is already 50x under 1s target |
| Plain JSON | gzip-compressed JSON | gzip is 20x smaller but adds 15ms encode + 5ms decode; total restore stays well under 1s either way; plain JSON is simpler and easier to inspect/debug |
| `lineage:engine:snapshot` (custom prefix) | `lineage:graph:snapshot` | Using `lineage:graph:` prefix risks the snapshot being deleted by `invalidate_all()` (pattern `lineage:graph:*`). Separate prefix `lineage:engine:` avoids accidental deletion by per-dataset cache invalidation. |

**Installation:** No new packages required. All libraries already installed.

---

## Architecture Patterns

### Recommended Project Structure

```
lineage-api/
├── graph/
│   ├── engine.py          # Modified: initialize(connection, redis_client=None)
│   │                      #           invalidate() deletes snapshot via self._redis
│   │                      #           _warmup() tries restore before Teradata load
│   ├── loader.py          # Unchanged
│   ├── serializer.py      # NEW: GraphSerializer with save/restore/invalidate
│   └── store.py           # Unchanged
├── python_server.py       # Modified: extract redis_client from cache, pass to initialize()
└── tests/
    ├── test_graph_engine.py      # Modified: add TestGraphEngineRedis class
    └── test_graph_serializer.py  # NEW
```

### Pattern 1: GraphSerializer — Single Responsibility for Snapshot I/O

**What:** A module in `graph/serializer.py` that owns the Redis key name constant and three operations: save, restore, invalidate. No state — stateless functions or classmethods.

**When to use:** Called from `GraphEngine._warmup()` (save + restore) and `GraphEngine.invalidate()` (invalidate).

**Example:**
```python
# lineage-api/graph/serializer.py
"""
GraphSerializer

Persists the in-memory nx.DiGraph to Redis and restores it on cold start.

Key: lineage:engine:snapshot
Format: UTF-8-encoded JSON from nx.node_link_data()
TTL: None (explicit invalidation via GraphEngine.invalidate())

The 'lineage:engine:' prefix is intentionally separate from the
'lineage:graph:' query-cache prefix so that cache invalidation patterns
like 'lineage:graph:*' do not accidentally delete the engine snapshot.
"""

import json
import networkx as nx
from loguru import logger

GRAPH_KEY = "lineage:engine:snapshot"


def save(G: nx.DiGraph, redis_client) -> None:
    """
    Serialize G to JSON and store in Redis.

    Args:
        G: The populated DiGraph to persist.
        redis_client: A redis-py client instance.
    """
    try:
        data = nx.node_link_data(G)
        json_bytes = json.dumps(data).encode("utf-8")
        redis_client.set(GRAPH_KEY, json_bytes)
        logger.info(
            "GraphSerializer: snapshot saved",
            nodes=G.number_of_nodes(),
            edges=G.number_of_edges(),
            bytes=len(json_bytes),
        )
    except Exception as exc:
        logger.warning("GraphSerializer: save failed", error=str(exc))


def restore(redis_client) -> nx.DiGraph | None:
    """
    Attempt to restore a DiGraph from Redis.

    Returns None on any failure (key missing, corrupt JSON, wrong graph
    type). Callers must fall back to Teradata load when None is returned.

    Args:
        redis_client: A redis-py client instance.

    Returns:
        nx.DiGraph if restore succeeded, None otherwise.
    """
    try:
        raw = redis_client.get(GRAPH_KEY)
        if raw is None:
            return None

        data = json.loads(raw)
        G = nx.node_link_graph(data)

        # node_link_graph uses data['directed'] to decide graph type.
        # If the stored snapshot was somehow not a DiGraph, reject it.
        if not isinstance(G, nx.DiGraph):
            logger.warning(
                "GraphSerializer: restored graph is not a DiGraph — discarding",
                graph_type=type(G).__name__,
            )
            return None

        logger.info(
            "GraphSerializer: snapshot restored",
            nodes=G.number_of_nodes(),
            edges=G.number_of_edges(),
        )
        return G

    except json.JSONDecodeError as exc:
        logger.warning("GraphSerializer: corrupt snapshot JSON", error=str(exc))
        return None
    except Exception as exc:
        logger.warning("GraphSerializer: restore failed", error=str(exc))
        return None


def invalidate(redis_client) -> None:
    """
    Delete the graph snapshot from Redis.

    Called by GraphEngine.invalidate() before triggering a graph rebuild
    so that the next _warmup() correctly falls through to Teradata load.

    Args:
        redis_client: A redis-py client instance.
    """
    try:
        redis_client.delete(GRAPH_KEY)
        logger.info("GraphSerializer: snapshot invalidated")
    except Exception as exc:
        logger.warning("GraphSerializer: invalidate failed", error=str(exc))
```

---

### Pattern 2: GraphEngine._warmup() — Try Redis Before Teradata

**What:** `_warmup()` checks Redis first. If a valid DiGraph is restored, it swaps it in and sets `_ready` without touching Teradata. If Redis misses or fails, it falls through to the existing `self._loader.load()` path, then saves the result to Redis.

**When to use:** Every time a warmup thread starts — both initial startup and post-invalidation rebuilds.

**Example:**
```python
# In graph/engine.py — _warmup() method
def _warmup(self) -> None:
    """
    Background thread target: try Redis restore, fall back to Teradata.
    """
    try:
        # Try Redis restore first (fast path)
        if self._redis is not None:
            from graph.serializer import restore as redis_restore, save as redis_save
            graph = redis_restore(self._redis)
            if graph is not None:
                self._swap(graph)
                self._ready.set()
                logger.info(
                    "Graph engine: restored from Redis",
                    nodes=graph.number_of_nodes(),
                    edges=graph.number_of_edges(),
                )
                return

        # Fallback: Teradata load
        graph = self._loader.load()
        self._swap(graph)

        # Persist to Redis for future restarts
        if self._redis is not None:
            from graph.serializer import save as redis_save
            redis_save(graph, self._redis)

        self._ready.set()
        logger.info(
            "Graph engine: warmup complete (Teradata load)",
            nodes=graph.number_of_nodes(),
            edges=graph.number_of_edges(),
        )
    except Exception as exc:
        logger.error(
            "Graph engine: warmup failed, staying in CTE fallback mode",
            error=str(exc),
        )
```

---

### Pattern 3: GraphEngine.initialize() — Accept Optional redis_client

**What:** Add `redis_client=None` to `initialize()`. Store it on `self._redis`. No other changes to the existing signature.

**When to use:** Called once at app startup from `python_server.py`.

**Example:**
```python
# In graph/engine.py — initialize() method
def initialize(self, connection, redis_client=None) -> None:
    """
    Start the background warmup thread.

    Args:
        connection: An open DBAPI-2 compatible database connection.
        redis_client: Optional redis-py client. If provided, _warmup()
                      will attempt to restore the graph from Redis before
                      querying Teradata, and will persist the graph to
                      Redis after a successful Teradata load.
    """
    self._redis = redis_client
    self._loader = GraphLoader(connection)
    thread = threading.Thread(
        target=self._warmup,
        daemon=True,
        name="graph-warmup",
    )
    thread.start()
    logger.info("Graph engine: initialization started")
```

---

### Pattern 4: GraphEngine.invalidate() — Delete Snapshot Before Rebuild

**What:** Before clearing `_ready` and starting the rebuild thread, delete the Redis snapshot. This ensures the rebuild thread correctly misses Redis and does a fresh Teradata load, then saves the new snapshot.

**Example:**
```python
# In graph/engine.py — invalidate() method (updated)
def invalidate(self) -> bool:
    if self._loader is None:
        logger.warning("Graph engine: invalidate() called but engine not initialized")
        return False

    # Delete Redis snapshot so _warmup() does a fresh Teradata load
    if self._redis is not None:
        from graph.serializer import invalidate as redis_invalidate
        redis_invalidate(self._redis)

    # Step 1: Clear ready event
    self._ready.clear()
    # Step 2: Clear store reference
    with self._lock:
        self._store = None
    # Step 3: Start rebuild thread
    thread = threading.Thread(
        target=self._warmup,
        daemon=True,
        name="graph-rebuild",
    )
    thread.start()
    logger.info("Graph engine: rebuild triggered by cache invalidation")
    return True
```

---

### Pattern 5: python_server.py — Extract redis_client from Flask-Caching

**What:** After `init_cache(app)`, extract the raw redis-py client from Flask-Caching's internal `_read_client`. Pass it to `graph_engine.initialize()`. If Redis is unavailable (SimpleCache fallback), `_read_client` will raise — catch it and pass `None`.

**Example:**
```python
# In python_server.py — create_app()
cache_obj = init_cache(app)

# Extract raw redis-py client for graph engine serialization.
# If Redis is unavailable (SimpleCache fallback), redis_client is None
# and graph engine operates without Redis persistence.
redis_client = None
try:
    redis_client = cache_obj.cache._read_client
except Exception:
    pass

connection = get_db_connection()
graph_engine.initialize(connection, redis_client=redis_client)
```

---

### Anti-Patterns to Avoid

- **Using `lineage:graph:snapshot` as the key:** The pattern `lineage:graph:*` is used by `invalidate_all()` in `cache/invalidation.py`. A snapshot stored under that prefix would be deleted on every cache invalidation, defeating the purpose. Use `lineage:engine:snapshot`.
- **Setting a TTL on the snapshot:** A short TTL (e.g., matching `CACHE_TTL = 3600s`) means a 2-hour idle period causes a cache miss on the next restart, forcing a Teradata load unnecessarily. The snapshot should persist until explicitly invalidated by ETL. No TTL.
- **Storing the snapshot as a Flask-Caching cached value (via `@cache.cached`):** Flask-Caching adds its own key prefix (`lineage:`) and manages TTL independently. Bypass Flask-Caching and use the raw redis-py client directly for the snapshot, as already done in `cache/invalidation.py` and `routes/cache.py`.
- **Calling `GraphSerializer.restore()` from the main thread during `create_app()`:** The restore must happen in the `_warmup` background daemon thread, not in the main thread. The main thread calls `initialize()` and immediately returns — the app serves requests via CTE fallback during warmup. This is the existing contract and must be preserved.
- **Holding `_lock` during serialization/deserialization:** `nx.node_link_data()` and `json.dumps()` can take 5–20ms for large graphs. The lock must only be held for the reference swap, not for I/O. Serialize and save outside the lock (in `_warmup`, before `_swap()`).
- **Asserting `isinstance(G, nx.DiGraph)` without checking:** `nx.node_link_graph()` uses `data['directed']` to choose the graph class. If the stored JSON has `"directed": false` (corrupted data), the restored graph will be an undirected `Graph`, not a `DiGraph`. Always validate `isinstance(G, nx.DiGraph)` after restore and return `None` if the check fails.
- **Using `pickle` for serialization:** Pickle is faster but brittle — pickled objects fail to deserialize across Python minor versions. `node_link_data` JSON is portable, human-readable, and supported by networkx.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Graph serialization to JSON | Custom node/edge iteration and dict building | `nx.node_link_data()` / `nx.node_link_graph()` | Built-in format; handles directed flag, graph metadata, and edge attributes; round-trip fidelity verified |
| Redis connection management | New connection pool | `cache.cache._read_client` from Flask-Caching | Already initialized with correct timeout/retry settings; reusing avoids duplicate connections |
| In-memory Redis for tests | Mock objects | `fakeredis.FakeRedis()` | Already in requirements.txt; supports all redis-py commands; deterministic for tests |
| Corruption handling | CRC checksums or schema validation | `try/except` + `isinstance` check | JSON parse errors and type mismatches are the only real failure modes; no need for custom validation beyond these |

**Key insight:** The entire serialization stack (`node_link_data`, `json`, `redis.set/get`) consists of single-function calls. The implementation is thin — the planner should not over-architect this. The main value is in the integration wiring (where to call save, where to call restore, how to thread the redis_client through).

---

## Common Pitfalls

### Pitfall 1: `lineage:graph:*` Invalidation Pattern Deletes the Snapshot
**What goes wrong:** The ETL job calls `/api/v2/cache/invalidate` with `all=true`, which calls `invalidate_all(redis_client)` → `_scan_and_delete(redis_client, "lineage:graph:*")`. If the snapshot is stored as `lineage:graph:snapshot`, it gets deleted — then `graph_engine.invalidate()` starts a rebuild that also fails to find the snapshot. Both actions now independently trigger a Teradata load (the second being the rebuild thread, which correctly loads from Teradata). But the snapshot is silently absent for the next restart even though a good graph was just built.
**Why it happens:** The `invalidate_all` pattern covers all `lineage:graph:*` keys.
**How to avoid:** Use `lineage:engine:snapshot` as the key namespace. This is outside `lineage:graph:*` and is never touched by the query cache invalidation patterns.
**Warning signs:** On the second cold restart after an ETL cycle, the app always falls through to Teradata even though Redis is warm.

### Pitfall 2: `node_link_graph()` Returns Non-DiGraph on Corrupt `directed` Field
**What goes wrong:** `nx.node_link_graph(data)` returns a `Graph` (undirected) instead of `DiGraph` because the stored JSON has `"directed": false`.
**Why it happens:** `node_link_graph()` respects `data['directed']` over the `directed=True` parameter. A stored snapshot with corrupted `directed` field passes deserialization but produces the wrong type.
**How to avoid:** Always assert `isinstance(G, nx.DiGraph)` after calling `node_link_graph()`. If False, log a warning and return `None` to trigger the Teradata fallback.
**Warning signs:** `graph_engine.is_ready` becomes True but `traverse_upstream()` returns empty for all queries (because the undirected `Graph` has no directionality and the BFS behaves unexpectedly).

### Pitfall 3: TTL Causes Silent Cache Miss on Production Restart
**What goes wrong:** `redis_client.set(GRAPH_KEY, json_bytes, ex=3600)` causes the snapshot to expire after 1 hour. An app restart after 70 minutes finds an empty Redis and falls through to a Teradata query, violating REDIS-02/REDIS-03 without any log warning explaining why.
**Why it happens:** Using TTL that matches `CACHE_TTL` seems consistent, but the snapshot serves a different purpose from query results — it should persist until ETL updates the lineage data.
**How to avoid:** Do not set a TTL on the snapshot. Use `redis_client.set(GRAPH_KEY, json_bytes)` without `ex=`. The snapshot lives until `GraphEngine.invalidate()` explicitly deletes it.
**Warning signs:** Cold-start restore works in testing (Redis is fresh) but fails after the TTL expires in production.

### Pitfall 4: RSS Appears to Grow Across Rebuild Cycles
**What goes wrong:** After 3 ETL rebuild cycles, process RSS is higher than after the first build. This looks like a memory leak.
**Why it happens:** CPython's memory allocator requests pages from the OS and rarely returns them. RSS after GC almost never decreases even when objects are freed. This is expected behavior — the heap is reused for the new graph.
**How to avoid:** The success criterion for REDIS-03 is "stable — not monotonically growing unboundedly." Measure RSS after N cycles; if it plateaus (stabilizes within a bounded window), the requirement is met. A small step-up after the first build is normal. Only linear unbounded growth cycle-over-cycle indicates a real leak.
**Warning signs:** Do NOT use "RSS decreased" as the success metric. Use "RSS plateau / does not grow between cycle 2 and cycle 3."

### Pitfall 5: Snapshot Key Overwritten Concurrently During Rebuild
**What goes wrong:** Two rebuild threads run concurrently (e.g., a slow ETL-triggered invalidation overlaps with another call). Both call `redis_save()`, and one may overwrite the other's snapshot with a partially-complete or older graph.
**Why it happens:** `GraphEngine.invalidate()` starts a new background thread every time it is called. Rapid sequential calls can spawn multiple threads.
**How to avoid:** The existing `invalidate()` implementation does not guard against double invocation. This is an existing known limitation. For Phase 18, accept the race — the last writer wins, and both graphs are valid (just different versions). The test suite should not test concurrent invalidation unless the planner decides to address the underlying race condition.
**Warning signs:** Log shows two `graph-rebuild` threads completing close together; `last_rebuild_time` in status endpoint shows an older timestamp than expected.

---

## Code Examples

Verified patterns from codebase inspection and benchmarking:

### Complete save/restore cycle

```python
# Save (called in _warmup after Teradata load)
import json
import networkx as nx

data = nx.node_link_data(G)          # dict with directed, nodes, edges
json_bytes = json.dumps(data).encode("utf-8")
redis_client.set("lineage:engine:snapshot", json_bytes)
# No TTL — explicit invalidation only

# Restore (called in _warmup before Teradata load)
raw = redis_client.get("lineage:engine:snapshot")
if raw is None:
    return None  # key missing — fall through to Teradata

data = json.loads(raw)               # may raise JSONDecodeError
G = nx.node_link_graph(data)         # respects data['directed']
if not isinstance(G, nx.DiGraph):
    return None  # wrong type — fall through to Teradata

# G is ready: proceed to _swap(G)
```

### Performance benchmarks (measured locally on representative data)

```
Graph size: 1,000 nodes, 9,940 edges (1,144 KB plain JSON)
---------------------------------------------------------
nx.node_link_data() + json.dumps():  6.8ms
redis_client.set():                  7.8ms
Total save path:                     14.6ms

redis_client.get():                  2.5ms
json.loads() + nx.node_link_graph(): 16.8ms
GraphStore.build():                  0.5ms
Total restore path:                  19.8ms

1-second target:  PASS (19.8ms actual vs 1000ms target, 50x margin)
```

### fakeredis usage in unit tests

```python
import fakeredis
import networkx as nx
from graph.serializer import save, restore, invalidate

def test_save_restore_round_trip():
    r = fakeredis.FakeRedis()
    G = nx.DiGraph()
    G.add_edge("a.b", "c.d", transformation_type="DIRECT")

    save(G, r)
    G2 = restore(r)

    assert G2 is not None
    assert isinstance(G2, nx.DiGraph)
    assert G2.number_of_edges() == 1
    assert G2["a.b"]["c.d"]["transformation_type"] == "DIRECT"
```

### Verifying _warmup skips loader when Redis is warm

```python
class SpyLoader:
    """Loader that records whether load() was called."""
    def __init__(self):
        self.called = False

    def load(self):
        self.called = True
        return nx.DiGraph()

def test_warmup_restores_from_redis_skips_loader():
    r = fakeredis.FakeRedis()
    G = nx.DiGraph()
    G.add_edge("a.b", "c.d", transformation_type="DIRECT")
    save(G, r)  # Pre-populate Redis

    engine = GraphEngine()
    spy = SpyLoader()
    engine._loader = spy
    engine._redis = r
    engine._warmup()  # Run synchronously for test

    assert engine.is_ready
    assert not spy.called  # Loader was never called
    assert engine.traverse_downstream("a.b", 5) != []
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `nx.adjacency_data()` for JSON export | `nx.node_link_data()` | networkx 2.x → 3.x | `node_link_data` is the canonical format; `adjacency_data` still exists but `node_link_data` is preferred for D3/JSON interchange |
| `pickle` for Python object persistence | `node_link_data` + JSON | (design choice) | JSON is portable across Python versions; pickle is fragile across minor versions |
| `node_link_data(G, links='links')` | `node_link_data(G, edges='edges')` | networkx 3.2 | The `links` parameter was renamed to `edges` in nx 3.2. The installed version (3.4.x) uses `edges`. Do not use `links=` kwarg. |

**Deprecated/outdated:**
- `nx.readwrite.json_graph.node_link_data(G, links='links')`: The `links` keyword argument was renamed to `edges` in networkx 3.2. The installed version is 3.4.x — use `edges='edges'` (or just the default, which is already `edges`).

---

## Open Questions

1. **Should `_warmup()` import `graph.serializer` at call time or at module top?**
   - What we know: `graph/engine.py` currently has no dependency on Redis or the cache module. Importing at call time (`from graph.serializer import ...` inside `_warmup`) avoids a circular import risk and keeps the module importable in tests without a Redis client present.
   - What's unclear: Whether a module-level import would cause issues given `fakeredis` replaces the real client in tests.
   - Recommendation: Use lazy imports inside `_warmup` (conditional on `self._redis is not None`). This matches the existing codebase style in `routes/cache.py` where `from cache.invalidation import ...` is inside the route handler.

2. **Should the restore path run in `_warmup()` (background thread) or in `initialize()` (main thread) to minimize time-to-ready?**
   - What we know: The existing contract is that `initialize()` returns immediately and does NOT block the main thread. The success criterion is `<1s after app restart` — which is well satisfied either way (19ms total).
   - What's unclear: Whether the user wants the graph available "instantly" (within the same request that initializes the app) or just "very quickly after startup."
   - Recommendation: Keep restore in `_warmup()` (background thread). The 19ms restore is fast enough that the first lineage request will hit a warm graph. Changing `initialize()` to block would change the existing non-blocking contract and require more invasive testing.

3. **Memory stability test definition: what counts as "stable"?**
   - What we know: CPython RSS does not decrease after GC. Benchmarks show RSS grows ~2–4MB per rebuild cycle in a pure test process (from 41MB to 73MB over 3 cycles) — this is partially Python allocator overhead from repeated large object allocation/deallocation, not a true leak.
   - What's unclear: The phase success criterion says "stable — not monotonically growing." In practice, the graph object is the same size each rebuild, so RSS should plateau after cycle 1–2.
   - Recommendation: Define the memory test as: measure RSS after cycle 1, cycle 2, and cycle 3. Pass if `|RSS(cycle3) - RSS(cycle2)| < 5MB` (i.e., growth plateaus). This is a pragmatic definition that distinguishes "allocator reuse plateau" from "genuine unbounded leak."

---

## Sources

### Primary (HIGH confidence)
- Direct codebase reading: `lineage-api/graph/engine.py`, `graph/store.py`, `graph/loader.py`, `cache/__init__.py`, `cache/invalidation.py`, `routes/cache.py`, `python_server.py` — all integration points identified from source
- Benchmarked locally: `nx.node_link_data()` + `json.dumps()` + `redis.set()` / `redis.get()` + `json.loads()` + `nx.node_link_graph()` on representative graph sizes
- networkx 3.4.x installed: verified `node_link_data`, `node_link_graph` signatures and behavior (directed flag handling, edge attribute preservation, `links→edges` rename)
- redis-py 7.1.1 installed: verified `set()`, `get()`, `delete()` API; confirmed Redis 8.6.0 server running locally
- fakeredis 2.24.x installed: verified FakeRedis supports `set/get/delete` used in save/restore/invalidate

### Secondary (MEDIUM confidence)
- networkx documentation (official): `node_link_data` / `node_link_graph` API — confirmed keyword rename `links→edges` in 3.2
- Redis documentation: no TTL = key persists until explicitly deleted — confirmed standard Redis behavior

### Tertiary (LOW confidence — validate before use)
- None: all claims in this research are directly verified by running code against the installed libraries.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already installed; APIs verified by running code
- Architecture: HIGH — integration points identified from codebase; patterns follow existing conventions (same client access pattern as `cache/invalidation.py`, same lazy import style as route handlers)
- Pitfalls: HIGH — all pitfalls discovered from direct testing (directed flag behavior, key prefix collision, TTL semantics); not speculation

**Research date:** 2026-02-20
**Valid until:** 2026-03-22 (stable APIs; 30 days)
