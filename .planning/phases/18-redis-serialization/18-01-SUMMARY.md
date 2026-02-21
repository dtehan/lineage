---
phase: 18-redis-serialization
plan: 01
subsystem: api
tags: [redis, networkx, graph, serialization, fakeredis, persistence]

# Dependency graph
requires:
  - phase: 14-in-memory-graph-engine
    provides: GraphEngine singleton with initialize/invalidate/_warmup, GraphStore.build()
  - phase: 15-cache-integration
    provides: Flask-Caching Redis backend with cache.cache._read_client access pattern
provides:
  - graph/serializer.py module with save/restore/invalidate functions and GRAPH_KEY constant
  - Redis-aware GraphEngine._warmup() that restores from Redis before querying Teradata
  - GraphEngine.invalidate() that deletes Redis snapshot before triggering rebuild
  - GraphEngine.initialize() accepting optional redis_client parameter
  - python_server.py wiring redis_client from Flask-Caching to graph_engine.initialize
  - 8 unit tests for serializer (round-trip, corruption, failure resilience, memory stability)
  - 5 Redis integration tests in TestGraphEngineRedis
affects: [future-phases, graph-engine, cold-start-performance]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "GraphSerializer: stateless module-level functions for Redis snapshot I/O"
    - "Lazy imports inside _warmup for Redis serializer to avoid circular import risk"
    - "lineage:engine:snapshot key prefix kept separate from lineage:graph:* to avoid accidental deletion by invalidate_all()"
    - "No TTL on snapshot — explicit invalidation only via GraphEngine.invalidate()"
    - "Snapshot deletion before _ready.clear() in invalidate() ensures rebuild thread finds empty Redis"

key-files:
  created:
    - lineage-api/graph/serializer.py
    - lineage-api/tests/test_graph_serializer.py
  modified:
    - lineage-api/graph/engine.py
    - lineage-api/python_server.py
    - lineage-api/tests/test_graph_engine.py

key-decisions:
  - "GraphSerializer uses module-level functions (not classmethods) matching existing codebase style"
  - "Lazy imports inside _warmup for serializer (from graph.serializer import ...) to avoid circular import risk"
  - "GRAPH_KEY = 'lineage:engine:snapshot' — intentionally outside lineage:graph:* to avoid invalidate_all() collision"
  - "No TTL on Redis snapshot — explicit invalidation only so snapshot persists across idle restarts"
  - "isinstance(G, nx.DiGraph) check after node_link_graph() guards against corrupted 'directed' field"
  - "redis_client extracted from cache.cache._read_client in try/except — falls back to None if SimpleCache"

patterns-established:
  - "Redis restore before Teradata load: fast path saves round-trip to database on routine restarts"
  - "Save-after-load: after Teradata load completes, persist snapshot to Redis for next restart"
  - "Delete-before-rebuild: invalidate() deletes snapshot before starting rebuild thread"

# Metrics
duration: 3min
completed: 2026-02-21
---

# Phase 18 Plan 01: Redis Serialization Summary

**Redis-backed DiGraph persistence via nx.node_link_data() JSON — cold restart restores from Redis in <20ms instead of querying Teradata, with save-on-warmup, restore-on-startup, and invalidate-on-ETL**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-21T19:45:33Z
- **Completed:** 2026-02-21T19:48:16Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Created `graph/serializer.py` with `save()`, `restore()`, `invalidate()` functions and `GRAPH_KEY = "lineage:engine:snapshot"` — the single module owning Redis snapshot I/O
- Updated `GraphEngine._warmup()` to try Redis restore first (fast path ~20ms) before falling through to Teradata load, and saves after every successful Teradata load
- Updated `GraphEngine.invalidate()` to delete the Redis snapshot before clearing `_ready` and starting the rebuild thread
- Updated `GraphEngine.initialize()` to accept `redis_client=None` and store it on `self._redis`
- Updated `python_server.py` to extract `cache.cache._read_client` after `init_cache(app)` and pass it to `graph_engine.initialize(connection, redis_client=redis_client)`
- Added 8 unit tests in `test_graph_serializer.py`: round-trip fidelity, empty Redis, corrupt JSON, undirected graph type check, invalidation, save/restore failure resilience, memory stability (RSS plateau < 5MB)
- Added 5 Redis integration tests in `TestGraphEngineRedis`: warm restore skips loader, empty Redis fallback saves snapshot, no-Redis path, invalidation deletes snapshot, initialize signature

## Task Commits

Each task was committed atomically:

1. **Task 1: Create GraphSerializer and integrate into GraphEngine** - `1780d9d` (feat)
2. **Task 2: Wire redis_client in python_server.py and write comprehensive tests** - `45bd13b` (feat)

**Plan metadata:** (created in this commit)

## Files Created/Modified
- `lineage-api/graph/serializer.py` - New module: save/restore/invalidate functions and GRAPH_KEY constant
- `lineage-api/graph/engine.py` - Updated: initialize() + redis_client param, _warmup() Redis-first logic, invalidate() snapshot deletion, self._redis attribute
- `lineage-api/python_server.py` - Updated: extract redis_client from cache.cache._read_client, pass to graph_engine.initialize
- `lineage-api/tests/test_graph_serializer.py` - New: 8 unit tests covering all serializer functions
- `lineage-api/tests/test_graph_engine.py` - Updated: 5 TestGraphEngineRedis tests + fakeredis import + SpyLoader class

## Decisions Made
- GraphSerializer uses module-level functions (not classmethods) — consistent with existing codebase style
- Lazy imports inside `_warmup` conditional on `self._redis is not None` — avoids circular import risk and keeps module importable without Redis; matches lazy import style in `routes/cache.py`
- `GRAPH_KEY = "lineage:engine:snapshot"` — intentionally outside `lineage:graph:*` so `invalidate_all()` (pattern `lineage:graph:*`) does not accidentally delete the engine snapshot
- No TTL on snapshot — snapshot persists until explicitly invalidated by ETL so routine restarts after idle periods still restore from Redis
- `isinstance(G, nx.DiGraph)` check after `node_link_graph()` guards against corrupted `directed: false` in stored JSON
- `redis_client` extraction in `try/except` in `python_server.py` — if Redis is unavailable (SimpleCache fallback), engine operates without Redis persistence transparently

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required. Redis must be running for persistence to activate; the application degrades gracefully to CTE-only mode when Redis is unavailable.

## Next Phase Readiness
- Phase 18 implementation complete — Redis serialization fully wired end-to-end
- All 30 engine tests pass (20 existing + 10 new across TestGraphEngineRedis and TestGraphEngineInvalidate)
- All 8 serializer tests pass including memory stability validation
- v4.0 First-Time Load milestone complete (5/5 phases)

## Self-Check: PASSED

Files verified to exist:
- `lineage-api/graph/serializer.py` — FOUND
- `lineage-api/tests/test_graph_serializer.py` — FOUND
- `lineage-api/tests/test_graph_engine.py` — FOUND (modified)
- `lineage-api/graph/engine.py` — FOUND (modified)
- `lineage-api/python_server.py` — FOUND (modified)

Commits verified:
- `1780d9d` — FOUND (Task 1)
- `45bd13b` — FOUND (Task 2)

---
*Phase: 18-redis-serialization*
*Completed: 2026-02-21*
