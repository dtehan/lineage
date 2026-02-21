---
phase: 15-cache-integration
plan: 01
subsystem: api
tags: [graph-engine, cache-invalidation, threading, bfs, networkx, redis]

# Dependency graph
requires:
  - phase: 14-in-memory-graph-engine
    provides: GraphEngine singleton with _loader, _ready, _store, _warmup() and blue-green swap pattern
provides:
  - GraphEngine.invalidate() method that clears ready event, nulls store, and triggers daemon rebuild thread
  - POST /api/v2/cache/invalidate response includes graph_rebuild_triggered boolean
  - TestGraphEngineInvalidate with 5 tests proving three-layer cache consistency
affects: [15-cache-integration, lineage-service, python-server]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "GatedLoader test pattern: threading.Event gate that test controls for deterministic rebuild timing"
    - "InMemoryLoader test pattern: synchronous pre-built DiGraph loader for rebuild completion tests"
    - "invalidate() ordering contract: _ready.clear() BEFORE thread.start() to prevent race where fast thread completion is undone by late clear"

key-files:
  created: []
  modified:
    - lineage-api/graph/engine.py
    - lineage-api/routes/cache.py
    - lineage-api/tests/test_graph_engine.py

key-decisions:
  - "invalidate() ordering: _ready.clear() must happen before thread.start() to avoid race where fast test-graph rebuild completes before clear undoes _ready.set()"
  - "GatedLoader over SlowLoader: threading.Event gate is deterministic — test controls release, no time.sleep() timing dependency"
  - "graph_engine.invalidate() called after Redis flush, not before — Redis cleared first, then graph rebuild triggered"

patterns-established:
  - "GatedLoader/InMemoryLoader test helpers: reusable patterns for testing engine rebuild scenarios without DB connections"

# Metrics
duration: 2min
completed: 2026-02-20
---

# Phase 15 Plan 01: Cache Integration — Invalidate + Rebuild Summary

**GraphEngine.invalidate() added with three-layer cache consistency: Redis flush in cache route triggers in-memory graph rebuild via daemon thread, with CTE fallback active during the rebuild window**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-21T01:01:55Z
- **Completed:** 2026-02-21T01:03:32Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Added `GraphEngine.invalidate()` method with correct ordering: clears `_ready` event atomically, nulls `_store` under lock, starts daemon rebuild thread outside lock
- Updated `POST /api/v2/cache/invalidate` to call `graph_engine.invalidate()` after Redis flush and return `graph_rebuild_triggered` boolean in response body
- Added `TestGraphEngineInvalidate` class (5 tests) with `GatedLoader` and `InMemoryLoader` helpers proving three-layer consistency: Redis cleared, is_ready=False during rebuild (CTE fallback active), is_ready=True after rebuild with correct BFS results

## Task Commits

Each task was committed atomically:

1. **Task 1: Add GraphEngine.invalidate() and wire into cache invalidation endpoint** - `4143944` (feat)
2. **Task 2: Add TestGraphEngineInvalidate unit tests for three-layer consistency** - `c3a70d7` (test)

**Plan metadata:** (docs commit below)

## Files Created/Modified

- `lineage-api/graph/engine.py` - Added `invalidate()` public method after `status` property, before `# Internal helpers` comment
- `lineage-api/routes/cache.py` - Added `from graph.engine import graph_engine` import; calls `graph_engine.invalidate()` after Redis flush; returns `graph_rebuild_triggered` in response JSON
- `lineage-api/tests/test_graph_engine.py` - Added `GatedLoader` and `InMemoryLoader` helper classes; added `TestGraphEngineInvalidate` with 5 tests (25 total, up from 20)

## Decisions Made

- **invalidate() ordering contract**: `_ready.clear()` must happen before `thread.start()`. If the thread completes before the clear (possible with tiny test graphs), the clear would undo the thread's `_ready.set()`, leaving the engine permanently in fallback mode.
- **GatedLoader over SlowLoader**: `threading.Event` gate is deterministic — the test controls exactly when the rebuild proceeds. No `time.sleep()` timing dependency, no flaky tests.
- **Redis flush before graph rebuild**: `graph_engine.invalidate()` called after Redis flush completes, not before — ensures Redis is always cleared first regardless of rebuild success.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Three-layer cache invalidation complete: `POST /api/v2/cache/invalidate` now clears Redis AND triggers in-memory graph rebuild in a single call
- After invalidation, engine is in CTE fallback mode until rebuild completes — zero stale data risk
- Ready for any remaining Phase 15 cache integration plans

## Self-Check: PASSED

- lineage-api/graph/engine.py: FOUND
- lineage-api/routes/cache.py: FOUND
- lineage-api/tests/test_graph_engine.py: FOUND
- .planning/phases/15-cache-integration/15-01-SUMMARY.md: FOUND
- commit 4143944 (feat): FOUND
- commit c3a70d7 (test): FOUND

---
*Phase: 15-cache-integration*
*Completed: 2026-02-20*
