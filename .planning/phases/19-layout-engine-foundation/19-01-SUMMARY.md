---
phase: 19-layout-engine-foundation
plan: 01
subsystem: ui
tags: [react, web-worker, comlink, react-flow, elkjs, layout-engine]

# Dependency graph
requires: []
provides:
  - "Worker-based layout in DatabaseLineageGraph via useLayoutWorker hook"
  - "Generation-counter race-condition protection for rapid direction changes"
affects:
  - "20-layout-engine-algorithm"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Worker layout via useLayoutWorker hook (Comlink) instead of direct layoutGraph() call"
    - "Generation counter (useRef(0)) for Promise race-condition protection"
    - "Fixed progress milestones (35/90) instead of onProgress callback across Worker boundary"

key-files:
  created: []
  modified:
    - lineage-ui/src/components/domain/LineageGraph/DatabaseLineageGraph.tsx

key-decisions:
  - "Emit fixed progress milestones (35 before Worker, 90 after) rather than passing onProgress callback — functions are not structured-clone-able across Worker boundary"
  - "Generation counter (not boolean cancelled flag) protects against stale layout results from rapid direction changes"

patterns-established:
  - "Worker layout pattern: use useLayoutWorker hook, pass direction option only (no callbacks), guard .then()/.catch() with generation counter"

# Metrics
duration: 5min
completed: 2026-02-22
---

# Phase 19 Plan 01: Layout Engine Foundation - Worker Migration Summary

**DatabaseLineageGraph now runs ELKjs layout in a Web Worker via useLayoutWorker hook, replacing the main-thread layoutGraph() call and broken cancelled-boolean race guard with a generation counter**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-22T01:53:51Z
- **Completed:** 2026-02-22T01:58:46Z
- **Tasks:** 1 of 1
- **Files modified:** 1

## Accomplishments

- Migrated DatabaseLineageGraph layout from main-thread `layoutGraph()` to Web Worker via `useLayoutWorker` hook (Comlink-based)
- Replaced `let cancelled = false` race guard with generation counter (`useRef(0)`) — discards stale results when direction changes rapidly
- Added `direction` to useEffect dependency array so layout re-runs when direction changes
- Preserved loading UX with fixed progress milestones: 35% before Worker call, 90% after Worker completes

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire useLayoutWorker and generation counter into DatabaseLineageGraph** - `451c173` (feat)

**Plan metadata:** (docs commit below)

## Files Created/Modified

- `lineage-ui/src/components/domain/LineageGraph/DatabaseLineageGraph.tsx` - Replaced direct layoutGraph() with workerLayoutGraph() via useLayoutWorker hook; added generationRef for race protection; removed cancelled boolean; added direction to dependency array

## Decisions Made

- Emit fixed progress milestones (35 before Worker, 90 after) rather than passing onProgress callback — functions cannot cross Worker boundary via structured clone (Comlink limitation)
- Generation counter pattern chosen over boolean cancelled flag: counter increments on each new layout request, stale results in `.then()`/`.catch()` are silently discarded by comparing against `generationRef.current`

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

Pre-existing test failures exist in `DatabaseLineageGraph.test.tsx`, `AssetBrowser.test.tsx`, and `accessibility.test.tsx` — these failures were present before this plan's changes and are unrelated to the layout migration. Verified by running tests against the original codebase (git stash / git stash pop).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Worker-based layout foundation is complete for DatabaseLineageGraph
- Phase 20 (layout algorithm improvements: BFS connected component analysis, separateDatabaseClusters bug fix) can now build on this Worker infrastructure
- The Worker runs all expensive layout computation off the main thread — Phase 20 algorithm changes will add ~5ms per 500 tables of BFS overhead, which is acceptable in the Worker context

---
*Phase: 19-layout-engine-foundation*
*Completed: 2026-02-22*

## Self-Check: PASSED

- FOUND: lineage-ui/src/components/domain/LineageGraph/DatabaseLineageGraph.tsx
- FOUND: .planning/phases/19-layout-engine-foundation/19-01-SUMMARY.md
- FOUND: commit 451c173
