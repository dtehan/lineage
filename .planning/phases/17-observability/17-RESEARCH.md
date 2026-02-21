# Phase 17: Observability - Research

**Researched:** 2026-02-20
**Domain:** HTTP timing headers (Server-Timing), Flask middleware, browser Performance API, frontend per-stage timing display
**Confidence:** HIGH

---

## Summary

Phase 17 adds three observability layers to the lineage pipeline: API timing headers (OBS-01), a graph metrics endpoint enhancement (OBS-02), and frontend per-stage timing display (OBS-03). All three are additive changes to existing infrastructure — no architectural shifts are required.

The backend already has the correlation ID middleware pattern (before_request/after_request hooks), a working `graph_engine.status` dict with node/edge/memory/timestamp data, and a `/api/v2/graph/status` endpoint. The frontend already has `useLoadingProgress` with stage tracking, `elapsedTime`, and the `LoadingProgress` component with a `showTiming` prop. The gap is: (1) no request-level timing is captured per sub-operation (DB query vs BFS), (2) those timings are not surfaced in response headers, and (3) the frontend does not yet display per-stage completed durations to the user.

The standard approach for API timing is the W3C-standardized `Server-Timing` HTTP response header. It is supported by all modern browsers, readable via `PerformanceServerTiming` from resource timing entries, and also accessible directly via Axios `response.headers['server-timing']`. Flask can populate it from a before/after_request middleware pattern identical to the existing correlation_id middleware. CORS requires `expose_headers=['Server-Timing', 'Timing-Allow-Origin']` to make the header visible to cross-origin clients.

**Primary recommendation:** Use the W3C `Server-Timing` header for OBS-01 (not custom `X-Timing-*` headers — Server-Timing is the standardized approach). Add timing instrumentation directly in LineageService for the CTE vs BFS paths. For OBS-03, record timestamps at fetch-complete and layout-complete in `useLoadingProgress` and display them in the `ProgressBanner` or `LoadingProgress` component once each stage finishes.

---

## Standard Stack

### Core — Backend
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Python stdlib `time` | 3.x | `time.perf_counter()` for sub-ms precision timing | Built-in; monotonic; high-resolution; recommended over `time.time()` for measuring durations |
| Flask `g` + after_request hook | 3.0.x (installed) | Store per-request timings and inject `Server-Timing` header | Existing pattern (correlation_id.py); no new dependencies |
| `psutil` | 5.9.x (installed) | Process memory (already used in GraphStore.build) | Already in requirements.txt |

### Core — Frontend
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `performance.now()` (browser built-in) | Web API | Sub-millisecond timestamps for fetch/layout/render stage durations | No import; standard across all browsers; higher precision than `Date.now()` |
| `useLoadingProgress` (internal hook) | existing | Stage state machine for fetch/layout/rendering | Already wires into LineageGraph; extend to record completed durations |
| `LoadingProgress` / `ProgressBanner` (internal components) | existing | Displays progress to user | Already rendered in LineageGraph; extend to show per-stage times |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Axios interceptors | 1.6.x (installed) | Optional: parse `server-timing` header globally | Only needed if timing data feeds into frontend display; can also read from individual responses |
| W3C `PerformanceServerTiming` API | browser built-in | Read Server-Timing from resource timing entries | Alternative to axios header parsing; works without touching API client code |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `Server-Timing` header | Custom `X-Timing-*` headers | Server-Timing is W3C standard, readable in Chrome DevTools Network tab natively; X-Timing-* are opaque strings that only our code understands |
| `time.perf_counter()` | `time.time()` | `time.time()` is not monotonic and lower resolution — wrong tool for measuring short durations |
| Middleware injection | Inline header setting per route | Middleware is DRY and consistent; per-route would require touching every endpoint |
| `performance.now()` | `Date.now()` | `performance.now()` is monotonic and sub-millisecond; `Date.now()` has 1ms resolution and can go backwards |

**Installation:** No new packages required for either frontend or backend. All libraries already installed.

---

## Architecture Patterns

### Recommended Project Structure

```
lineage-api/
├── middleware/
│   ├── correlation_id.py         # Existing — model for new timing middleware
│   └── timing.py                 # NEW: Server-Timing header middleware
├── services/
│   └── lineage_service.py        # Instrument DB query vs BFS timing here

lineage-ui/src/
├── hooks/
│   └── useLoadingProgress.ts     # Extend: record per-stage completed durations
├── components/common/
│   └── LoadingProgress.tsx       # Extend: display completed stage times
├── components/domain/LineageGraph/
│   └── ProgressBanner.tsx        # Extend or replace: show per-stage times inline
```

---

### Pattern 1: Server-Timing Header via Flask Middleware

**What:** A before_request hook stores `g.timing = {}` and an after_request hook serialises `g.timing` into a `Server-Timing` response header.

**When to use:** Any route that should expose timing breakdowns. The middleware is registered globally but only injects the header when `g.timing` contains data, so non-instrumented routes produce an empty (or absent) header.

**Example:**
```python
# lineage-api/middleware/timing.py
import time
from flask import g, request, Flask


def init_timing_middleware(app: Flask):
    """Register Server-Timing header middleware.

    Registers before_request and after_request hooks:
    - before_request: initialises g.timing = {} and g.request_start
    - after_request: serialises g.timing dict into Server-Timing header

    Service layer populates g.timing via helper:
        record_timing("db_query", elapsed_ms)
        record_timing("bfs_traversal", elapsed_ms)

    Server-Timing format (W3C spec):
        Server-Timing: db_query;dur=45.2, bfs_traversal;dur=3.1
    """

    @app.before_request
    def _before():
        g.timing = {}
        g.request_start = time.perf_counter()

    @app.after_request
    def _after(response):
        # Only inject if any timings were recorded
        if not getattr(g, 'timing', {}):
            return response

        parts = []
        for name, dur_ms in g.timing.items():
            parts.append(f"{name};dur={dur_ms:.1f}")

        response.headers['Server-Timing'] = ', '.join(parts)
        return response
```

```python
# lineage-api/middleware/timing.py — helper for service layer
def record_timing(name: str, elapsed_ms: float) -> None:
    """Record a named timing into the current request context.

    Args:
        name: Metric name (no spaces/special chars, e.g. 'db_query')
        elapsed_ms: Duration in milliseconds
    """
    from flask import g
    if not hasattr(g, 'timing'):
        return  # Outside request context (e.g., background threads)
    g.timing[name] = elapsed_ms
```

---

### Pattern 2: Timing Instrumentation in LineageService

**What:** Wrap the CTE query call and BFS call in `perf_counter` pairs, then call `record_timing()`.

**When to use:** In `get_column_lineage_graph()` and `get_table_lineage_graph()` for the two paths. Database-level lineage uses CTE only — instrument that path too.

**Example:**
```python
# In lineage_service.py — get_column_lineage_graph()
import time
from middleware.timing import record_timing

# Upstream — BFS path
if use_graph:
    t0 = time.perf_counter()
    bfs_edges = graph_engine.traverse_upstream(...)
    record_timing("bfs_upstream", (time.perf_counter() - t0) * 1000)
    upstream_records = self._enrich_bfs_results(bfs_edges)
else:
    t0 = time.perf_counter()
    upstream_records = self.lineage_repo.get_upstream_lineage(...)
    record_timing("db_upstream", (time.perf_counter() - t0) * 1000)
```

---

### Pattern 3: Graph Status Endpoint Enhancement

**What:** The existing `/api/v2/graph/status` route returns `graph_engine.status`. The status dict already contains `node_count`, `edge_count`, `last_rebuild_time`, `memory_bytes`, and `ready`. No new endpoint needed — the existing endpoint already satisfies OBS-02 requirements.

**Verification:** Compare `graph_engine.status` against OBS-02 requirements:
- node count: `store.node_count` — present
- edge count: `store.edge_count` — present
- last rebuild timestamp: `store.loaded_at` — present (Unix float)
- process memory usage: `store.memory_bytes` — present (process RSS)

The endpoint is already accessible without connecting to the server host. OBS-02 is satisfied by documenting that `/api/v2/graph/status` already meets requirements. The plan for 17-01 should confirm this and add any missing fields (e.g., a human-readable ISO timestamp alongside the Unix float).

---

### Pattern 4: CORS Expose Headers

**What:** `Server-Timing` must be listed in `Access-Control-Expose-Headers` for cross-origin clients (browser fetches from `:3000` to `:8080`).

**How:** Update the `CORS()` call in `python_server.py`:
```python
CORS(app, origins=[...], expose_headers=['Server-Timing'])
```

Without this, `response.headers['server-timing']` in Axios will be `undefined` even though the header is set on the server.

---

### Pattern 5: Frontend Per-Stage Timing Display

**What:** Record `performance.now()` timestamps at the start/end of each stage, compute completed durations, and show them in the loading UI once a stage is done.

**When to use:** In `useLoadingProgress` — the hook already knows when stages transition. Extend it to capture and expose durations.

**Example (hook extension):**
```typescript
// In useLoadingProgress.ts — add to UseLoadingProgressReturn
export interface UseLoadingProgressReturn {
  // ... existing fields ...
  /** Duration in ms for each completed stage (null if not completed yet) */
  stageDurations: Partial<Record<LoadingStage, number>>;
}

// Inside the hook — track start time per stage
const stageStartTimeRef = useRef<number | null>(null);
const [stageDurations, setStageDurations] = useState<Partial<Record<LoadingStage, number>>>({});

const setStage = useCallback((newStage: LoadingStage) => {
  setStageState((prevStage) => {
    // Record duration for the stage being exited
    if (stageStartTimeRef.current !== null && prevStage !== 'idle') {
      const elapsed = performance.now() - stageStartTimeRef.current;
      setStageDurations((prev) => ({ ...prev, [prevStage]: elapsed }));
    }
    // Record start time for the new stage
    stageStartTimeRef.current = newStage !== 'idle' && newStage !== 'complete'
      ? performance.now()
      : null;
    // ... existing logic ...
    return newStage;
  });
}, []);
```

**Display in ProgressBanner (once graph is visible):**
```tsx
// ProgressBanner.tsx — show completed stage times after depth-1 renders
// When isFetchingFullDepth is true (depth-1 done, full-depth in progress),
// show: "Fetch: 85ms | Layout: 210ms | Expanding to full depth..."
```

---

### Anti-Patterns to Avoid

- **Timing inside background threads:** `flask.g` is request-scoped. The `GraphEngine._warmup()` thread cannot call `record_timing()`. Only time operations that happen within a request context (BFS and CTE queries run in request threads).
- **`time.time()` for durations:** Non-monotonic. Use `time.perf_counter()` and multiply by 1000 for ms.
- **Exposing timing in production without auth consideration:** Server-Timing reveals infrastructure details. For this internal tool context this is acceptable, but the design doc should note it.
- **Storing durations in component state for each RAF tick:** Keep `stageDurations` in a ref until stage completes, then move to state to trigger a single render.
- **Reading `server-timing` via `PerformanceServerTiming` for cross-origin:** The `Timing-Allow-Origin` header is required for cross-origin resource timing access. Using `response.headers['server-timing']` in Axios interceptors is simpler and already works via `Access-Control-Expose-Headers`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Server-Timing format serialization | Custom header string building | W3C format: `name;dur=X.X` | The spec is simple enough to build directly — one helper function is all that's needed; no library required |
| Per-request timing storage | Thread-local vars or class instances | Flask `g` object | `g` is already per-request and thread-safe in Flask; it's the correct mechanism |
| Frontend elapsed time display | New timer hook | Extend `useLoadingProgress` | Hook already manages elapsed time and stage transitions; adding `stageDurations` is one extra state field |
| Cross-origin header exposure | Manual `after_request` CORS headers | Flask-CORS `expose_headers` param | Flask-CORS already handles `Access-Control-Allow-*` headers; adding to its config is the correct integration point |

**Key insight:** The entire implementation reuses existing patterns (correlation_id middleware → timing middleware; `useLoadingProgress` stages → duration tracking). No new infrastructure is required.

---

## Common Pitfalls

### Pitfall 1: Server-Timing Header Not Visible to Browser (CORS)
**What goes wrong:** `Server-Timing` header is set on the Flask response but `response.headers['server-timing']` in Axios returns `undefined`.
**Why it happens:** The browser's CORS security model restricts which response headers are accessible to JavaScript. By default, only a small set of "safe" headers are exposed. `Server-Timing` is not in the safe list.
**How to avoid:** Add `expose_headers=['Server-Timing']` to the `CORS()` call in `python_server.py`.
**Warning signs:** Header appears in browser DevTools Network tab under "Response Headers" but is `undefined` in JavaScript.

### Pitfall 2: Timing `record_timing()` from Background Thread
**What goes wrong:** `record_timing()` is called from a thread (e.g., BFS spawned in a background thread), causing a `RuntimeError: Working outside of request context`.
**Why it happens:** Flask's `g` is request-scoped and only accessible from request-handling threads.
**How to avoid:** All BFS and CTE calls in `LineageService` run in the request thread (they are synchronous calls in route handlers). Never call `record_timing()` from daemon threads (`GraphEngine._warmup`).
**Warning signs:** `RuntimeError: Working outside of request context` in logs.

### Pitfall 3: Stage Duration Double-Counted
**What goes wrong:** `stageDurations['fetching']` includes time spent in the layout stage because `stageStartTimeRef` was not reset when transitioning.
**Why it happens:** `setStage` closure captures stale ref or the stage transition fires before the ref is updated.
**How to avoid:** Record the elapsed time for the _previous_ stage using the `prevStage` value inside the `setStageState` updater function (which receives the guaranteed previous value), then reset the start time immediately.
**Warning signs:** `stageDurations['fetching']` value grows larger than expected; matches total elapsed time.

### Pitfall 4: `perf_counter` Float Precision
**What goes wrong:** Sub-millisecond durations show as `0.0` in `Server-Timing` due to `:.1f` rounding.
**Why it happens:** BFS traversal can complete in <0.05ms for small graphs; rounding to 1 decimal drops it to 0.0.
**How to avoid:** Use `:.2f` format (2 decimal places) or `:.3f` for microsecond-level visibility. For Server-Timing, 2 decimal places is a good balance.
**Warning signs:** All BFS timings show `0.0` on small test datasets.

---

## Code Examples

Verified patterns from official sources:

### Server-Timing Header Format (W3C Spec)
```http
# Single metric with duration
Server-Timing: db_query;dur=45.20

# Multiple metrics
Server-Timing: db_upstream;dur=45.20, db_downstream;dur=38.10

# BFS path
Server-Timing: bfs_upstream;dur=0.85, bfs_downstream;dur=0.70
```

### Reading Server-Timing in Axios (with CORS expose_headers configured)
```typescript
// In API client or interceptor
const response = await apiClientV2.get('/api/v2/openlineage/lineage/...');
const serverTiming = response.headers['server-timing'];
// e.g. "db_upstream;dur=45.2, db_downstream;dur=38.1"

// Parse helper
function parseServerTiming(header: string | undefined): Record<string, number> {
  if (!header) return {};
  const result: Record<string, number> = {};
  for (const metric of header.split(',')) {
    const parts = metric.trim().split(';');
    const name = parts[0].trim();
    const durPart = parts.find((p) => p.trim().startsWith('dur='));
    if (durPart) {
      result[name] = parseFloat(durPart.split('=')[1]);
    }
  }
  return result;
}
```

### Graph Status Endpoint (already exists — verify matches OBS-02)
```bash
# Current response from GET /api/v2/graph/status
{
  "ready": true,
  "node_count": 1240,
  "edge_count": 3876,
  "last_rebuild_time": 1708432800.123,   # Unix timestamp (float)
  "memory_bytes": 157286400
}
```

OBS-02 requires: node count, edge count, last rebuild timestamp, process memory. All four are present. Enhancement needed: add `last_rebuild_iso` (human-readable ISO 8601 string) as a convenience field.

### frontend `performance.now()` usage
```typescript
// Correct: monotonic, sub-millisecond
const t0 = performance.now();
await doExpensiveOperation();
const durationMs = performance.now() - t0;

// Wrong: Date.now() is 1ms resolution and non-monotonic
const t0 = Date.now(); // Don't use for duration measurement
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Custom `X-Timing-*` headers | W3C `Server-Timing` header | ~2017 (spec), widely available since March 2023 | DevTools show Server-Timing natively; no custom parsing required for developer visibility |
| `time.time()` for duration | `time.perf_counter()` | Python 3.3+ | Monotonic and higher resolution for measuring sub-second durations |
| Manual timing display strings | `stageDurations` map from hook | (new for this project) | Stage durations can be reused by multiple display components |

**Deprecated/outdated:**
- `performance.timing` (Navigation Timing v1): replaced by `PerformanceNavigationTiming` in the Navigation Timing v2 API. Not relevant for our use case since we measure fetch/layout/render within an SPA, not page load.

---

## What OBS-02 Already Satisfies

The existing `/api/v2/graph/status` endpoint (`routes/graph.py`) already returns all four fields required by OBS-02:

| OBS-02 Requirement | Field in `graph_engine.status` | Status |
|--------------------|-------------------------------|--------|
| node count | `node_count` | Present |
| edge count | `edge_count` | Present |
| last rebuild timestamp | `last_rebuild_time` (Unix float) | Present |
| process memory usage | `memory_bytes` (process RSS) | Present |

Plan 17-01 should confirm this endpoint is complete and only add convenience fields (e.g., ISO timestamp string). The majority of 17-01 work is the timing middleware (OBS-01).

---

## Plan Breakdown Recommendation

**17-01: Backend timing headers and metrics endpoint**
- Create `lineage-api/middleware/timing.py` (pattern shown above)
- Register timing middleware in `python_server.py` after correlation_id
- Add `expose_headers=['Server-Timing']` to CORS config
- Instrument `get_column_lineage_graph()` and `get_table_lineage_graph()` in `lineage_service.py` with `record_timing()` calls for both CTE and BFS paths
- Confirm `/api/v2/graph/status` satisfies OBS-02; add `last_rebuild_iso` convenience field
- Tests: assert `Server-Timing` header present in lineage responses; assert BFS timing name differs from DB timing name; assert metrics endpoint returns all four required fields

**17-02: Frontend per-stage timing display**
- Extend `useLoadingProgress` with `stageDurations: Partial<Record<LoadingStage, number>>` — record duration when a stage exits using `performance.now()`
- Update `LoadingProgress` or `ProgressBanner` to show completed stage durations
- Parse `server-timing` header from lineage API responses; expose `fetchDuration` (total fetch time) and individual DB/BFS breakdown in the UI (or developer tooltip)
- Tests: unit test `stageDurations` accumulation; snapshot/render tests for timing display

---

## Open Questions

1. **Server-Timing display to end users vs developers only**
   - What we know: The ProgressBanner already shows a message to users; per-stage timing is developer-useful but may be noise for non-technical users.
   - What's unclear: Should timing be always-visible or gated behind a dev mode flag?
   - Recommendation: Show simple human-readable stage times always (e.g. "Fetch: 85ms | Layout: 210ms") — these are useful to end users to understand what's slow. The raw `server-timing` header is for developer tooling.

2. **Server-Timing for table/database lineage endpoints**
   - What we know: `get_table_lineage_graph()` uses BFS for each field in a loop, so there could be N BFS calls per request.
   - What's unclear: Should we record per-field timing or just total BFS time?
   - Recommendation: Record total traversal time (aggregate all BFS calls in the table lineage method) as `bfs_total` rather than N individual metrics, to keep the header readable.

3. **Where to display server-timing in the frontend**
   - What we know: `ProgressBanner` shows a loading message while full-depth is being fetched. `LoadingProgress` shows during the initial load.
   - What's unclear: The server timing is known after fetch completes, which is when the loading spinner dismisses — there is a brief window where timing data exists but no spinner is shown.
   - Recommendation: Show completed-stage durations in a subtle "after-render" display (e.g., a small tooltip or faded text beneath the graph toolbar showing "Loaded in: Fetch 85ms / Layout 210ms / Render 35ms"). This keeps the data accessible without cluttering the graph view.

---

## Sources

### Primary (HIGH confidence)
- [MDN — Server-Timing header](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Server-Timing) — header format, syntax, security notes
- [MDN — PerformanceServerTiming](https://developer.mozilla.org/en-US/docs/Web/API/PerformanceServerTiming) — JS API to read Server-Timing from resource entries
- [W3C — Server Timing specification](https://www.w3.org/TR/server-timing/) — normative spec
- [Python docs — time.perf_counter](https://docs.python.org/3/library/time.html) — monotonic high-resolution timer
- Direct codebase reading: `lineage-api/middleware/correlation_id.py`, `graph/store.py`, `graph/engine.py`, `routes/graph.py`, `services/lineage_service.py`
- Direct codebase reading: `lineage-ui/src/hooks/useLoadingProgress.ts`, `components/common/LoadingProgress.tsx`, `components/domain/LineageGraph/ProgressBanner.tsx`, `LineageGraph.tsx`

### Secondary (MEDIUM confidence)
- [SuperFastPython — time.perf_counter vs time.time](https://superfastpython.com/time-time-vs-time-perf_counter/) — practical comparison confirming perf_counter for duration measurement
- [Codemzy — accessing axios response headers including CORS](https://www.codemzy.com/blog/get-axios-response-headers) — CORS expose_headers requirement confirmed
- [Flask-Cors documentation](https://flask-cors.readthedocs.io/en/latest/configuration.html) — expose_headers parameter

### Tertiary (LOW confidence — validate before use)
- Community patterns for timing middleware flask g.start_time — generally confirmed by multiple sources, LOW only because not from official Flask docs specifically

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries are already in use; no new dependencies; patterns confirmed via official docs
- Architecture: HIGH — all patterns follow existing codebase conventions (correlation_id middleware, g object, useLoadingProgress)
- Pitfalls: HIGH — CORS expose_headers pitfall is well-documented; threading pitfall is inherent to Flask g semantics; both confirmed from official sources

**Research date:** 2026-02-20
**Valid until:** 2026-03-22 (stable APIs; 30 days)
