---
phase: 17-observability
plan: 01
subsystem: api
tags: [flask, server-timing, observability, middleware, cors]

# Dependency graph
requires:
  - phase: 14-in-memory-graph-engine
    provides: GraphEngine with BFS traversal, status endpoint, is_ready flag
  - phase: 15-cache-integration
    provides: Graph invalidation pattern
provides:
  - Server-Timing response headers on all lineage API responses (bfs_upstream, db_upstream, bfs_downstream, db_downstream, bfs_total, db_total, db_lineage)
  - Graph status endpoint enhanced with last_rebuild_iso ISO 8601 UTC timestamp
  - CORS expose_headers=['Server-Timing'] for JavaScript cross-origin access
  - record_timing() helper for service-layer instrumentation
affects:
  - 17-02 (future observability plans building on timing infrastructure)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Server-Timing middleware follows same init_X_middleware(app) pattern as correlation_id.py"
    - "record_timing() silently no-ops outside Flask app context (try/except RuntimeError) — safe for background threads and tests"
    - "Table lineage uses single aggregate timing metric (bfs_total/db_total) over entire field loop — prevents N per-field metrics in header"

key-files:
  created:
    - lineage-api/middleware/timing.py
    - lineage-api/tests/test_timing.py
  modified:
    - lineage-api/python_server.py
    - lineage-api/graph/engine.py
    - lineage-api/services/lineage_service.py

key-decisions:
  - "record_timing() catches RuntimeError (not just hasattr check) to handle being called outside Flask app context — required for existing tests that call service methods without app context"
  - "Table lineage uses single aggregate metric (bfs_total/db_total) for the entire field loop — one header entry per request, not per field, keeps Server-Timing header readable"
  - "expose_headers=['Server-Timing'] added to existing CORS() call (not a second call) per plan spec"

patterns-established:
  - "Timing middleware: init_timing_middleware(app) registered immediately after init_correlation_id_middleware(app) in create_app()"
  - "Service instrumentation: t0 = time.perf_counter() before operation, record_timing(name, (time.perf_counter() - t0) * 1000) after"

# Metrics
duration: 3min
completed: 2026-02-21
---

# Phase 17 Plan 01: Server-Timing Middleware and Graph Status ISO Timestamp Summary

**W3C Server-Timing headers on all lineage API responses showing BFS vs CTE path latency, plus ISO 8601 last_rebuild_iso field on graph status endpoint**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-21T02:02:45Z
- **Completed:** 2026-02-21T02:05:44Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Created `lineage-api/middleware/timing.py` with `init_timing_middleware()` and `record_timing()` helper following the exact pattern of `correlation_id.py`
- Registered timing middleware in `python_server.py` with `expose_headers=['Server-Timing']` on CORS config
- Instrumented `LineageService` with 7 `record_timing()` calls covering BFS and CTE paths in all three lineage methods
- Added `last_rebuild_iso` ISO 8601 UTC field to `GraphEngine.status` using `datetime.fromtimestamp(store.loaded_at, tz=timezone.utc).isoformat()`
- Created 6 unit tests: 3 for middleware header emission, 3 for LineageService timing key verification

## Task Commits

Each task was committed atomically:

1. **Task 1: Create Server-Timing middleware, register it, configure CORS, and enhance graph status** - `32bcf78` (feat)
2. **Task 2: Instrument LineageService with timing and write unit tests** - `9565252` (feat)

**Plan metadata:** (docs commit below)

## Files Created/Modified

- `lineage-api/middleware/timing.py` - Server-Timing middleware with `init_timing_middleware(app)` and `record_timing(name, elapsed_ms)` helper
- `lineage-api/python_server.py` - Import and register `init_timing_middleware`; add `expose_headers=['Server-Timing']` to CORS
- `lineage-api/graph/engine.py` - Add `last_rebuild_iso` field to `status` property using `datetime`/`timezone` from datetime module
- `lineage-api/services/lineage_service.py` - Add `import time` and `from middleware.timing import record_timing`; 7 record_timing calls across all lineage methods
- `lineage-api/tests/test_timing.py` - 6 unit tests: TestTimingMiddleware (3) and TestLineageServiceTiming (3)

## Decisions Made

- `record_timing()` catches `RuntimeError` (not just `hasattr(g, 'timing')`) to handle being called outside Flask app context. The existing `test_lineage_service.py` tests call service methods directly without an app context — `hasattr(g, 'timing')` raises `RuntimeError` in that case since `g` itself is unbound. Wrapping in `try/except RuntimeError` preserves silent no-op semantics for both background threads and test contexts.
- Table lineage records a single aggregate metric (`bfs_total` or `db_total`) for the entire field loop. Using per-field metrics would generate N header entries for an N-column table, making the Server-Timing header unreadable. One aggregate metric shows total cost of the table-level operation.
- `expose_headers` added to the existing `CORS()` call (not a second call) per plan specification to avoid duplicate CORS configuration.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed record_timing() to handle RuntimeError outside app context**

- **Found during:** Task 2 (running existing tests after instrumenting LineageService)
- **Issue:** The existing `test_lineage_service.py` tests call `get_column_lineage_graph()` and `get_table_lineage_graph()` without a Flask app context. When `record_timing()` calls `hasattr(g, 'timing')`, Flask raises `RuntimeError: Working outside of application context` because `g` itself is unbound outside an app context — `hasattr()` doesn't catch this.
- **Fix:** Wrapped the entire body of `record_timing()` in `try/except RuntimeError` so it silently no-ops when called outside any Flask context.
- **Files modified:** `lineage-api/middleware/timing.py`
- **Verification:** All 4 previously failing tests in `test_lineage_service.py` now pass; all 6 new timing tests continue to pass
- **Committed in:** `9565252` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug)
**Impact on plan:** Fix was necessary for correctness — the original `hasattr` guard was insufficient for the no-op semantics described in the plan docstring. No scope creep.

## Issues Encountered

None beyond the auto-fixed deviation above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Server-Timing infrastructure is complete and ready for Phase 17 Plan 02
- All 41 backend unit tests pass (6 new + 35 existing)
- `GET /api/v2/graph/status` now returns `last_rebuild_iso` ISO timestamp
- Every lineage API response will include Server-Timing header when graph engine routes requests through BFS or CTE paths

---
*Phase: 17-observability*
*Completed: 2026-02-21*
