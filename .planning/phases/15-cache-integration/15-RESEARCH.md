# Phase 15: Cache Integration - Research

**Researched:** 2026-02-20
**Domain:** Three-layer cache invalidation (Redis + in-memory graph rebuild), atomic ETL trigger endpoint
**Confidence:** HIGH (all findings grounded in direct codebase inspection; no external library changes needed)

## Summary

Phase 15 is an integration phase, not a greenfield implementation. The two components it must connect — the Redis invalidation endpoint (`POST /api/v2/cache/invalidate` in `routes/cache.py`) and the in-memory graph engine (`graph.engine.GraphEngine`) — already exist and work independently. The work is wiring them together so that a single `POST /cache/invalidate` call atomically clears Redis AND triggers an in-memory graph rebuild.

The critical question for this phase is what "trigger a graph rebuild" means precisely. The existing `GraphEngine` does not have an `invalidate()` or `rebuild()` method — it only has `initialize()`, which creates a new `GraphLoader` bound to a connection and starts a background thread. Phase 15 must add a public `invalidate()` method that: (1) clears the `_ready` Event so the engine reverts to CTE fallback during the rebuild window, and (2) starts a new background thread that calls `_warmup()`. The blue-green swap pattern already handles the reference swap atomically — the new method reuses the exact same `_warmup()` path.

The three-layer consistency requirement (CACHE-03) is the tricky one: during the rebuild gap after Redis is flushed but before the new graph is ready, the application must serve correct results via the CTE fallback and must NOT serve stale pre-ETL results from the old in-memory graph. The correct approach is to clear `_ready` (or atomically swap `_store` to None under the lock) before starting the rebuild thread. This is a 3-line change to `GraphEngine`. The existing `traverse_upstream`/`traverse_downstream` already return `[]` when `store is None`, and `LineageService` already falls back to CTE when `is_ready` is False — the fallback gap is already implemented. Phase 15 just needs to ensure the invalidation sequence clears the old graph before the new one is ready.

**Primary recommendation:** Add `GraphEngine.invalidate()` (clears ready event + launches rebuild thread), then call it from `routes/cache.py`'s `invalidate_cache()` after the Redis flush. Test with a unit test that proves the three-layer sequence: old graph cleared, CTE fallback active, new graph populated.

## User Constraints

No CONTEXT.md exists for Phase 15. All prior decisions are carried forward from phase description.

### Locked Decisions (from prior decisions in phase description)
- Blue-green graph swap pattern: build new graph into separate variable, atomically swap reference, never destroy old before new is ready
- Gunicorn worker model (`--workers 1 --threads N`) decided and validated in Phase 14
- BFS/CTE semantic equivalence tests written and passing in Phase 14 — CTE path remains active as fallback
- `graph_engine.initialize()` is non-blocking by design: daemon thread warmup, app serves CTE immediately
- Lock held only for reference copy/swap operations — never during BFS traversal or GraphStore.build()

### Claude's Discretion
- Exact signature and naming of the `invalidate()` method on `GraphEngine`
- Whether to clear `_ready` before or after launching the rebuild thread (must be before — see Critical Sequencing section)
- Response body shape of the updated `/cache/invalidate` endpoint (add `graph_rebuild_triggered: bool` field)
- Whether to reset `_store` to `None` or simply clear `_ready` during invalidation (both achieve fallback, but `None` store is cleaner for `status` reporting)
- Test structure: unit tests (preferred, no DB required) vs integration tests

### Deferred Ideas (OUT OF SCOPE)
- Redis pub/sub coordination for multi-instance invalidation
- Partial graph invalidation (invalidating only edges related to a specific dataset — the full graph reload is the chosen approach)
- Cache warming after rebuild (pre-populating Redis from BFS results)
- SSE-based progress streaming for rebuild status

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| threading | stdlib | Background rebuild thread, RLock, Event | Already used throughout GraphEngine; zero new dependencies |
| networkx | 3.4.2 (already in requirements.txt) | DiGraph rebuilt via existing GraphLoader.load() | Already in use; no change |
| psutil | already in requirements.txt | RSS measurement in GraphStore.build() | Already in use; no change |
| Flask-Caching / redis-py | already in requirements.txt | Redis flush via existing `invalidate_all()` / `invalidate_dataset()` | Already implemented in cache/invalidation.py |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| loguru | already in requirements.txt | Log invalidation events with timing | Already used in GraphEngine |
| unittest | stdlib | Unit tests for invalidate() method | Consistent with test_graph_engine.py pattern |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| GraphEngine.invalidate() method | A separate rebuild endpoint (`POST /api/v2/graph/rebuild`) | Separate endpoint splits the atomicity guarantee — ETL job would need two calls; single endpoint is the stated requirement |
| Clearing `_ready` then starting thread | Starting thread then clearing `_ready` | Thread race: new thread might complete before old `_ready` is cleared, making the clear a no-op; clear FIRST is the safe order |
| Reset `_store = None` during invalidation | Only clear `_ready` | Resetting `_store` to `None` is cleaner: `status` will report `ready: False` with zeroed counters, giving accurate monitoring during the rebuild gap; also ensures `traverse_*` returns `[]` even if `_ready` check is bypassed |

**Installation:** No new packages required. All dependencies already in requirements.txt.

## Architecture Patterns

### Recommended File Changes

```
lineage-api/
├── graph/
│   └── engine.py          # ADD: invalidate() method
├── routes/
│   └── cache.py           # MODIFY: invalidate_cache() to call graph_engine.invalidate()
└── tests/
    └── test_graph_engine.py  # ADD: TestGraphEngineInvalidate class (3-5 tests)
```

No new files. Three existing files modified/extended.

### Pattern 1: GraphEngine.invalidate() Method

**What:** Public method that atomically clears the active store and ready event, then starts a background rebuild thread. Reuses the existing `_warmup()` path — invalidate is just a re-trigger of the startup sequence.

**Critical sequencing:** Clear BEFORE launching thread. If the thread completes very quickly (e.g., tiny graph in tests), it could set `_ready` before the clear executes, leaving the engine in a permanently-stale state.

**When to use:** Called from `invalidate_cache()` in `routes/cache.py` after the Redis flush completes.

```python
# lineage-api/graph/engine.py — new method on GraphEngine
def invalidate(self) -> bool:
    """
    Trigger an in-memory graph rebuild.

    Atomically clears the active GraphStore and ready Event, then
    starts a background thread to rebuild the graph from OL_COLUMN_LINEAGE.

    During the rebuild window, is_ready returns False and all traversal
    calls return [], causing LineageService to fall back to CTE queries.
    Once rebuild completes, _swap() sets the new store and _ready.set()
    re-enables BFS traversal.

    Returns:
        bool: True if rebuild was triggered, False if no loader is
              configured (engine was never initialized).
    """
    if self._loader is None:
        logger.warning("Graph engine: invalidate() called but engine not initialized")
        return False

    # CRITICAL: Clear before launching thread.
    # Clears ready event FIRST so is_ready returns False immediately.
    # Resets store to None so status reports zeroed counters during rebuild.
    self._ready.clear()
    with self._lock:
        self._store = None

    thread = threading.Thread(
        target=self._warmup,
        daemon=True,
        name="graph-rebuild",
    )
    thread.start()
    logger.info("Graph engine: rebuild triggered by cache invalidation")
    return True
```

**Why `_ready.clear()` not `_ready = threading.Event()`:** The existing `_warmup()` method calls `self._ready.set()` when complete. Reusing the same Event object means no changes to `_warmup()`. Creating a new Event object would require `_warmup()` to reference the current `self._ready` at thread-start time, not at the time `_ready.set()` is called — this is safe since threads close over `self`, but clearing is simpler.

### Pattern 2: Updated invalidate_cache() Endpoint

**What:** Extend the existing `POST /api/v2/cache/invalidate` handler to call `graph_engine.invalidate()` after the Redis flush. The Redis flush already happens — this adds one line after the deletion count.

**When to use:** After any Redis invalidation (dataset, database, or all). The graph rebuild is always a full reload regardless of invalidation scope.

```python
# lineage-api/routes/cache.py — modification to invalidate_cache()
from graph.engine import graph_engine  # ADD this import

@cache_bp.route('/invalidate', methods=['POST'])
def invalidate_cache():
    """
    Invalidate cache entries for a dataset or database.

    Now also triggers in-memory graph rebuild as part of three-layer
    invalidation: Redis flush + graph rebuild happen in a single operation.
    """
    from cache import cache
    from cache.invalidation import invalidate_dataset, invalidate_database, invalidate_all

    data = request.get_json(silent=True)
    if not data:
        return jsonify({'error': 'Request body must be JSON'}), 400

    try:
        redis_client = cache.cache._write_client
    except Exception as e:
        logger.warning(f"Redis client unavailable for invalidation: {e}")
        return jsonify({'error': 'Cache not available', 'deleted_keys': 0}), 503

    deleted = 0

    if data.get('all'):
        deleted = invalidate_all(redis_client)
    elif data.get('dataset_name'):
        deleted = invalidate_dataset(redis_client, data['dataset_name'])
    elif data.get('database_name'):
        deleted = invalidate_database(redis_client, data['database_name'])
    else:
        return jsonify({
            'error': 'Provide dataset_name, database_name, or all=true'
        }), 400

    # Trigger in-memory graph rebuild after Redis flush
    rebuild_triggered = graph_engine.invalidate()

    return jsonify({
        'deleted_keys': deleted,
        'graph_rebuild_triggered': rebuild_triggered,
    })
```

**Response change:** Add `graph_rebuild_triggered: bool` to the response body. This is backward-compatible — callers checking only `deleted_keys` continue to work.

### Pattern 3: Three-Layer Consistency Test

**What:** Unit test proving the correct sequence: old graph unavailable immediately after `invalidate()`, rebuild completes, new graph available.

**When to use:** Added to `test_graph_engine.py` as `TestGraphEngineInvalidate` class.

```python
# lineage-api/tests/test_graph_engine.py — new test class
class TestGraphEngineInvalidate(unittest.TestCase):
    """Tests for GraphEngine.invalidate() three-layer consistency."""

    def test_invalidate_clears_ready_immediately(self):
        """After invalidate(), is_ready is False before rebuild completes."""
        G = build_test_graph([("db.a.x", "db.b.x", "DIRECT")])
        engine = make_engine_with_graph(G)
        self.assertTrue(engine.is_ready)

        # Assign a loader that will block (simulates slow DB rebuild)
        # Use a real GraphLoader with a controlled load() to ensure we
        # can check is_ready BEFORE rebuild completes.
        # Simplest: assign None-loader, which causes _warmup to fail,
        # but that resets ready anyway. Or use a threading.Event to gate.
        # Preferred: inject a slow loader via mock.
        engine._loader = SlowLoader()  # see helper below
        engine.invalidate()
        self.assertFalse(engine.is_ready)  # Cleared before thread starts

    def test_invalidate_clears_store_to_none(self):
        """After invalidate(), _store is None and status shows zeroed counters."""
        G = build_test_graph([("db.a.x", "db.b.x", "DIRECT")])
        engine = make_engine_with_graph(G)
        engine._loader = SlowLoader()
        engine.invalidate()

        status = engine.status
        self.assertFalse(status["ready"])
        self.assertEqual(status["node_count"], 0)
        self.assertIsNone(status["last_rebuild_time"])

    def test_invalidate_traverse_returns_empty_during_rebuild(self):
        """While rebuilding, traverse_upstream/downstream return [] (CTE fallback mode)."""
        G = build_test_graph([("db.a.x", "db.b.x", "DIRECT")])
        engine = make_engine_with_graph(G)
        engine._loader = SlowLoader()
        engine.invalidate()

        result = engine.traverse_upstream("db.b.x", 5)
        self.assertEqual(result, [])

    def test_invalidate_returns_false_without_loader(self):
        """invalidate() on uninitialized engine returns False."""
        engine = GraphEngine()
        result = engine.invalidate()
        self.assertFalse(result)

    def test_rebuild_completes_and_restores_ready(self):
        """After rebuild thread completes, is_ready is True and traversal works."""
        G = build_test_graph([("db.a.x", "db.b.x", "DIRECT")])
        engine = make_engine_with_graph(G)

        # Use a fast loader that returns a known graph
        engine._loader = InMemoryLoader(G)
        engine.invalidate()

        # Wait for rebuild to complete (max 2 seconds)
        engine._ready.wait(timeout=2.0)
        self.assertTrue(engine.is_ready)

        result = engine.traverse_downstream("db.a.x", 5)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["source_field"], "x")
```

**Required test helpers** (add to `test_graph_engine.py`):

```python
class SlowLoader:
    """Loader that blocks indefinitely — simulates slow DB rebuild for testing."""
    def load(self):
        import time
        time.sleep(60)  # Long enough that the test can check is_ready before it wakes
        return nx.DiGraph()

class InMemoryLoader:
    """Loader that returns a pre-built graph — used for fast rebuild tests."""
    def __init__(self, G: nx.DiGraph):
        self._graph = G

    def load(self) -> nx.DiGraph:
        return self._graph
```

**Note on SlowLoader:** This approach is fragile if the OS schedules the thread immediately. A safer alternative is to gate the loader on a `threading.Event` that the test controls. However, since `invalidate()` clears `_ready` synchronously before starting the thread, `is_ready` will be False immediately after `invalidate()` returns regardless of thread scheduling. The test for `is_ready` immediately after `invalidate()` is deterministic.

### Anti-Patterns to Avoid

- **Launching the rebuild thread before clearing `_ready`:** Race condition — thread might complete before the clear, leaving the engine permanently in the wrong state. Always clear `_ready` synchronously in the calling thread before spawning the rebuild thread.
- **Calling `_ready.set()` in `invalidate()` before rebuild completes:** Defeats the purpose. The `_ready.set()` call must remain exclusively in `_warmup()`.
- **Holding the lock while starting the thread:** `thread.start()` after `with self._lock:` would hold the lock for an indeterminate time while OS creates the thread. The lock must be released before `thread.start()`. The pattern: acquire lock, clear store, release lock, then start thread.
- **Not resetting `_store` to `None`:** If only `_ready` is cleared but `_store` still holds the old graph, calls to `traverse_*` that bypass the `is_ready` check (or a future caller who reads `_store` directly) would see stale data. Resetting `_store` to `None` under the lock provides defense in depth.
- **Scope-based Redis invalidation triggering partial graph rebuild:** The in-memory graph is always a full rebuild — there is no partial graph update. Scope-based Redis invalidation (by dataset or database) is correct for Redis but always triggers a full graph reload, not a partial one.
- **Starting a second rebuild thread if one is already running:** If two ETL jobs call `/cache/invalidate` within seconds of each other, two rebuild threads could race to swap the graph. This is safe (both will call `_swap()` under the lock, and the last one wins — both graphs are correct), but wasteful. For now, accept this behavior; it's not a correctness issue.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Atomic store clear + thread start | Custom CAS machinery | Clear `_ready`, `with self._lock: self._store = None`, then `thread.start()` | Lock-protected assignment is sufficient; Python assignment under lock is atomic |
| Rebuild progress tracking | Custom percentage-complete counter | `is_ready` Event (False = in progress, True = complete) | Binary state is sufficient; percentage adds complexity with no UX benefit in Phase 15 |
| Partial graph invalidation | Track which nodes/edges changed | Full reload from DB | Partial invalidation requires change-set tracking in OL_COLUMN_LINEAGE that doesn't exist; full reload is correct and simple |

**Key insight:** Phase 15 is one new method on GraphEngine (10-15 lines) and two lines added to the cache route. The test infrastructure is the largest piece of work.

## Common Pitfalls

### Pitfall 1: Clear-Then-Start Race Condition (Reversed Order)

**What goes wrong:** `thread.start()` executes, `_ready.clear()` executes. Thread completes before the clear runs. `_ready` is cleared after it was just set by the completed thread. Engine is stuck in `is_ready = False` permanently until next rebuild.

**Why it happens:** Assuming `thread.start()` is always slower than the next line of the calling thread. This is true for large graphs but false for tiny test graphs.

**How to avoid:** Always: clear `_ready` FIRST, then start thread. Never invert this order.

**Warning signs:** Tests pass in isolation but fail intermittently in CI (graph small enough that rebuild thread finishes instantly).

### Pitfall 2: Lock Held Across Thread Start

**What goes wrong:**
```python
with self._lock:
    self._store = None
    self._ready.clear()
    thread.start()   # WRONG: lock held while OS allocates thread
```
Thread start time is unpredictable. If the OS creates the thread quickly, and the thread immediately tries to acquire `self._lock` (e.g., in `_swap()`), it will block — but that's OK because the lock will be released when `with self._lock:` exits. However, the issue is the duration: `thread.start()` while holding the lock delays all concurrent `traverse_*` callers (which acquire the lock to read `_store`).

**How to avoid:** Release the lock before calling `thread.start()`. Only the store-clearing operation needs the lock. Correct pattern:
```python
self._ready.clear()          # Event.clear() is atomic, no lock needed
with self._lock:
    self._store = None       # Lock only for reference assignment
# Lock released here
thread = threading.Thread(target=self._warmup, daemon=True, name="graph-rebuild")
thread.start()               # Outside the lock
```

**Warning signs:** Request latency spikes at invalidation time; lock contention visible in profiling.

### Pitfall 3: Multiple Rebuild Threads After Rapid Invalidation

**What goes wrong:** Two ETL jobs call `/cache/invalidate` within milliseconds. Two rebuild threads start. Both load the graph from DB. Both call `_swap()` under the lock. The second swap wins. Result is two full DB queries executed concurrently — doubles Teradata load during already-expensive ETL window.

**Why it happens:** No guard against concurrent rebuild threads.

**How to avoid for Phase 15:** Accept the behavior — both swaps are correct (both load fresh data), the cost is one extra DB query. Add a guard in a future phase if measured as a problem. Document the known behavior.

**Warning signs:** Two "GraphLoader: loaded graph" log lines within the same second after a single ETL run.

### Pitfall 4: Redis Unavailable When invalidate() is Called

**What goes wrong:** Redis is down. The current code in `routes/cache.py` returns `503` early when `cache.cache._write_client` raises. The graph rebuild is never triggered even though the DB was updated by ETL.

**Why it happens:** Redis failure aborts the endpoint before reaching the `graph_engine.invalidate()` call.

**How to avoid:** The current 503 behavior is correct for Redis unavailability — there is nothing to flush. If ETL wants to force a graph rebuild without Redis flushing, that is a separate use case not in scope for Phase 15. The current code already handles this correctly by returning early on Redis error, leaving the graph stale but consistent (it will be rebuilt on next successful invalidation or next app restart).

**Warning signs:** ETL teams report graph not rebuilding after Redis maintenance window.

### Pitfall 5: `_loader` is None After App Restart Scenario

**What goes wrong:** `invalidate()` is called before `graph_engine.initialize()` runs (e.g., during test setup, or a request arrives before `create_app()` completes in an unusual deployment).

**Why it happens:** `initialize()` is called inside `create_app()`. If `invalidate()` is somehow called before that, `self._loader` is `None`.

**How to avoid:** The `invalidate()` method guards against this: `if self._loader is None: return False`. The route handler should log this as a warning and return `graph_rebuild_triggered: false` in the response. This is already handled in the implementation pattern above.

**Warning signs:** `invalidate_cache()` response always shows `graph_rebuild_triggered: false`.

## Code Examples

Verified patterns from codebase inspection:

### Existing `_ready.set()` call location in `_warmup()` (do not change)
```python
# lineage-api/graph/engine.py — existing _warmup() (lines 181-201)
def _warmup(self) -> None:
    try:
        graph = self._loader.load()
        self._swap(graph)
        self._ready.set()           # <-- This stays here, in _warmup only
        logger.info("Graph engine: warmup complete", ...)
    except Exception as exc:
        logger.error("Graph engine: warmup failed, staying in CTE fallback mode", ...)
```

### Existing `_swap()` — no change needed
```python
# lineage-api/graph/engine.py — existing _swap() (lines 203-216)
def _swap(self, graph: nx.DiGraph) -> None:
    new_store = GraphStore.build(graph)
    with self._lock:
        self._store = new_store    # Only the assignment is guarded
```

### New `invalidate()` method — correct clear-before-start pattern
```python
# lineage-api/graph/engine.py — new method
def invalidate(self) -> bool:
    if self._loader is None:
        logger.warning("Graph engine: invalidate() called but engine not initialized")
        return False
    # Step 1: Clear ready event (atomic, no lock needed for Event)
    self._ready.clear()
    # Step 2: Clear store reference under lock
    with self._lock:
        self._store = None
    # Step 3: Start rebuild thread OUTSIDE lock
    thread = threading.Thread(
        target=self._warmup,
        daemon=True,
        name="graph-rebuild",
    )
    thread.start()
    logger.info("Graph engine: rebuild triggered by cache invalidation")
    return True
```

### Modified `invalidate_cache()` route — add import and two lines
```python
# lineage-api/routes/cache.py — add at top of file
from graph.engine import graph_engine

# lineage-api/routes/cache.py — inside invalidate_cache(), after deleted = ...
rebuild_triggered = graph_engine.invalidate()
return jsonify({'deleted_keys': deleted, 'graph_rebuild_triggered': rebuild_triggered})
```

### Test helper: InMemoryLoader for fast rebuild tests
```python
class InMemoryLoader:
    """Returns a pre-built DiGraph synchronously — for testing rebuild completion."""
    def __init__(self, G: nx.DiGraph):
        self._graph = G

    def load(self) -> nx.DiGraph:
        return self._graph
```

### Test helper: GatedLoader for timing-sensitive tests
```python
class GatedLoader:
    """Blocks load() on a threading.Event — test controls when rebuild proceeds."""
    def __init__(self):
        self._gate = threading.Event()
        self._graph = nx.DiGraph()

    def release(self, G: nx.DiGraph = None):
        """Allow load() to proceed, optionally with a specific graph."""
        if G is not None:
            self._graph = G
        self._gate.set()

    def load(self) -> nx.DiGraph:
        self._gate.wait()  # Blocks until test calls release()
        return self._graph
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `/cache/invalidate` only flushes Redis | `/cache/invalidate` flushes Redis AND rebuilds in-memory graph | Phase 15 | Single ETL trigger clears all three cache layers atomically |
| No `invalidate()` method on GraphEngine | `GraphEngine.invalidate()` available for external trigger | Phase 15 | Cache integration is explicit API, not ad-hoc re-initialization |
| CTE fallback only during app startup warmup | CTE fallback also active during post-invalidation rebuild gap | Phase 15 | CACHE-03: no stale pre-ETL data served during rebuild window |

**Deprecated/outdated after this phase:**
- Calling `graph_engine.initialize(connection)` again to force a rebuild — `invalidate()` is the correct post-startup trigger; `initialize()` is for app startup only.

## Open Questions

1. **Should the route handler wait for rebuild completion before responding?**
   - What we know: The rebuild is async (background daemon thread). The route can respond immediately with `graph_rebuild_triggered: true` without waiting. This is consistent with the existing non-blocking `initialize()` design.
   - What's unclear: ETL jobs may want to poll `GET /api/v2/graph/status` to confirm rebuild, or they may just fire-and-forget. The phase description doesn't specify.
   - Recommendation: Respond immediately (non-blocking). ETL jobs that need confirmation can poll `GET /api/v2/graph/status` until `ready: true`. The existing status endpoint already supports this use case. Do not add synchronous rebuild as it would block the request for potentially seconds.

2. **Should scope-based invalidation (`dataset_name` / `database_name`) skip the graph rebuild?**
   - What we know: The graph rebuild is always a full reload of all active `OL_COLUMN_LINEAGE` rows. A dataset-scoped Redis flush might be followed by a full graph rebuild even though only one table's lineage changed.
   - What's unclear: Whether ETL jobs do frequent partial invalidations (e.g., one table at a time) or bulk invalidations. Frequent full rebuilds on partial changes could be wasteful.
   - Recommendation: Always trigger full graph rebuild for all invalidation scopes in Phase 15. The scope distinction is a Phase 18 optimization problem if it matters. Record this as a known tradeoff.

3. **Test coverage: unit tests only, or integration test with Flask test client?**
   - What we know: Existing tests use `unittest` without a Flask test client (no HTTP layer). The `run_api_tests.py` is a separate live-server test file.
   - What's unclear: Whether testing that `invalidate_cache()` calls `graph_engine.invalidate()` requires HTTP-level testing or can be unit-tested by calling the function directly.
   - Recommendation: Unit tests only for `GraphEngine.invalidate()` behavior (no DB, no Redis). A separate integration smoke test in `run_api_tests.py` can verify the endpoint response shape includes `graph_rebuild_triggered`. This follows the existing test split.

## Sources

### Primary (HIGH confidence)
- Direct codebase: `lineage-api/graph/engine.py` — full GraphEngine implementation; `initialize()`, `_warmup()`, `_swap()`, `_ready` Event, `_lock` RLock patterns
- Direct codebase: `lineage-api/routes/cache.py` — current `invalidate_cache()` implementation; Redis client access pattern
- Direct codebase: `lineage-api/cache/invalidation.py` — `invalidate_all()`, `invalidate_dataset()`, `invalidate_database()` implementations
- Direct codebase: `lineage-api/services/lineage_service.py` — `use_graph = graph_engine.is_ready` guard; CTE fallback when False
- Direct codebase: `lineage-api/tests/test_graph_engine.py` — `make_engine_with_graph()` test injection pattern; `TestGraphEngine` structure
- Phase 14 RESEARCH.md: Locked decisions on blue-green swap, thread safety, lock scope
- Phase 14 VERIFICATION.md: Confirmed all 14 must-haves including CTE fallback behavior
- Python stdlib docs: `threading.Event.clear()` is thread-safe atomic operation (no lock needed)

### Secondary (MEDIUM confidence)
- Python threading model: `Event.clear()` is atomic (backed by a Condition variable) — confirmed in Python docs but exact atomicity guarantee relies on CPython GIL behavior

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries; all code paths inspected directly
- Architecture: HIGH — `invalidate()` method design is a direct extension of existing `initialize()` + `_warmup()` pattern; clear-before-start ordering is established Python threading practice
- Pitfalls: HIGH — race conditions are concrete (clear-before-start, lock scope) and directly verifiable in the codebase; Redis failure path already handled by existing 503 return

**Research date:** 2026-02-20
**Valid until:** 2026-03-20 (stable codebase, 30-day window; no external library changes)
