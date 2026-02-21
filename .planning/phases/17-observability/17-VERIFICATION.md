---
phase: 17-observability
verified: 2026-02-21T02:15:40Z
status: passed
score: 6/6 must-haves verified
re_verification: false
---

# Phase 17: Observability Verification Report

**Phase Goal:** Developers and operators can see exactly where time is spent in the lineage pipeline — from database query (or in-memory traversal) through layout to render — via API response headers and a metrics endpoint.
**Verified:** 2026-02-21T02:15:40Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Every lineage API response includes a Server-Timing header showing db_upstream/db_downstream or bfs_upstream/bfs_downstream timing metrics with millisecond durations | VERIFIED | `lineage-api/services/lineage_service.py` calls `record_timing()` at 7 sites; middleware serializes to `Server-Timing` header; 6/6 unit tests pass |
| 2 | GET /api/v2/graph/status returns node_count, edge_count, last_rebuild_time, last_rebuild_iso, memory_bytes, and ready status | VERIFIED | `lineage-api/graph/engine.py` status property returns all 6 fields; route at `lineage-api/routes/graph.py` returns `graph_engine.status` directly |
| 3 | Server-Timing header is readable from JavaScript in cross-origin requests (CORS expose_headers configured) | VERIFIED | `python_server.py` line 64: `expose_headers=["Server-Timing"]` on the single CORS() call |
| 4 | After a graph finishes loading, per-stage timing (fetch, layout, render durations in milliseconds) is visible to the user in a subtle display beneath the toolbar | VERIFIED | `LineageGraph.tsx` renders "Loaded in:" bar when `stage === 'complete'` and `stageDurations` is non-empty; uses `formatMs()` |
| 5 | The ProgressBanner shows completed stage durations while full-depth is expanding (e.g. "Fetch: 85ms \| Layout: 12ms \| Expanding to full depth...") | VERIFIED | `ProgressBanner.tsx` accepts `stageDurations` prop and renders timing text with `STAGE_LABELS` map and `formatMs()`; banner test confirms "Fetch: 85ms \| Layout: 12ms" text |
| 6 | useLoadingProgress.stageDurations accumulates correct per-stage durations using performance.now() across stage transitions | VERIFIED | `useLoadingProgress.ts` uses `stageStartTimeRef` with `performance.now()` inside `setStageState` updater; 41/41 hook tests pass including 6 stageDurations tests |

**Score:** 6/6 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `lineage-api/middleware/timing.py` | Server-Timing middleware with record_timing() helper | VERIFIED | 94 lines; contains `init_timing_middleware()`, `record_timing()`, W3C header serialization; uses `time.perf_counter()` |
| `lineage-api/tests/test_timing.py` | Unit tests for timing middleware and lineage service instrumentation | VERIFIED | 202 lines (>50 min); 6 tests in 2 classes: TestTimingMiddleware (3), TestLineageServiceTiming (3); all pass |
| `lineage-ui/src/hooks/useLoadingProgress.ts` | stageDurations field in UseLoadingProgressReturn | VERIFIED | Contains `stageDurations`, `stageStartTimeRef`, `formatMs`, `setStageDurations`; exported from hook return |
| `lineage-ui/src/components/domain/LineageGraph/ProgressBanner.tsx` | Timing display in progress banner | VERIFIED | Contains `stageDurations` prop, `STAGE_LABELS` map, `timingText` rendering with `formatMs()` |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `middleware/timing.py` | `services/lineage_service.py` | `record_timing()` called in BFS and CTE paths | WIRED | 7 calls confirmed: bfs_upstream, db_upstream, bfs_downstream, db_downstream, bfs_total, db_total, db_lineage |
| `middleware/timing.py` | `python_server.py` | `init_timing_middleware(app)` called in create_app() | WIRED | Line 31 import, line 70 call — immediately after `init_correlation_id_middleware(app)` |
| `hooks/useLoadingProgress.ts` | `LineageGraph.tsx` | `stageDurations` destructured from `useLoadingProgress()` | WIRED | Line 176: `stageDurations` destructured; passed to ProgressBanner line 763; used in post-render bar lines 767-774 |
| `LineageGraph.tsx` | `ProgressBanner.tsx` | `stageDurations` passed as prop | WIRED | Line 763: `stageDurations={stageDurations}` on `<ProgressBanner>` |

---

### Requirements Coverage

All OBS objectives from the phase goal are satisfied:

| Objective | Status | Evidence |
|-----------|--------|---------|
| OBS-01: Server-Timing headers on lineage API responses | SATISFIED | 7 record_timing() calls in lineage_service.py; middleware emits header |
| OBS-02: Metrics endpoint with last_rebuild_iso | SATISFIED | graph/engine.py status property includes all required fields |
| OBS-03: Per-stage timing visible to users | SATISFIED | useLoadingProgress.stageDurations + ProgressBanner + post-render bar |

---

### Anti-Patterns Found

No blockers or warnings detected.

| File | Pattern | Severity | Verdict |
|------|---------|----------|---------|
| `middleware/timing.py` | None | — | Clean implementation |
| `lineage_service.py` | None | — | All 7 timing calls wrap real operations |
| `useLoadingProgress.ts` | None | — | No stubs; performance.now() used correctly |
| `ProgressBanner.tsx` | None | — | Conditional render guards (timingText check) correct |
| `LineageGraph.tsx` | None | — | Post-render bar guarded by `stage === 'complete' && Object.keys(stageDurations).length > 0` |

---

### Test Results

**Backend (Python):**
- `tests/test_timing.py`: 6/6 passed
- `tests/test_lineage_service.py`: 10/10 passed (no regressions)
- `tests/test_graph_engine.py`: 25/25 passed (no regressions)

**Frontend (Vitest):**
- `src/hooks/useLoadingProgress.test.ts`: 41/41 passed
- `src/components/domain/LineageGraph/LineageGraph.test.tsx`: 27/27 passed
- Full suite: 594 passing, 26 failing — confirmed pre-existing failures in `accessibility.test.tsx`, `AssetBrowser.test.tsx`, `DatabaseLineageGraph.test.tsx` (same count and files as before phase 17; no regressions introduced)

---

### Human Verification Required

These behaviors were confirmed programmatically but are worth a quick manual check in a running environment:

**1. Server-Timing header visible in browser DevTools**
- Test: Load a lineage graph, open Network tab, click the lineage API response
- Expected: Response headers show `Server-Timing: bfs_upstream;dur=X.XX, bfs_downstream;dur=X.XX, total;dur=X.XX` (or `db_upstream`/`db_downstream` if graph not warmed up)
- Why human: Requires a live Teradata connection

**2. Per-stage timing bar visible after graph loads**
- Test: Load any column or table lineage graph until complete
- Expected: A faint monospace line reads "Loaded in: Fetch Xms / Layout Xms / Render Xms" between toolbar and graph
- Why human: Requires a live frontend environment

**3. ProgressBanner timing display during background full-depth fetch**
- Test: Load a lineage graph and observe the blue banner while it expands to full depth
- Expected: Banner reads "Fetch: Xms | Layout: Xms | Expanding to full depth..."
- Why human: Requires progressive loading to be triggerable

---

### Gaps Summary

No gaps. All must-have truths are verified, all artifacts are substantive and wired, and no anti-patterns block goal achievement.

---

_Verified: 2026-02-21T02:15:40Z_
_Verifier: Claude (gsd-verifier)_
