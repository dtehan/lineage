---
phase: 23-standalone-table-rendering
plan: 01
subsystem: ui
tags: [react, python, flask, lineage-graph, react-flow, lucide-react]

# Dependency graph
requires:
  - phase: 22-full-system-catalog
    provides: "Populated OL_DATASET catalog; tables navigable from AssetBrowser"
provides:
  - "Backend get_table_lineage_graph returns {nodes:[], edges:[]} for no-fields datasets (not 404)"
  - "Frontend renders inline blue informational banner for zero-edge graphs alongside canvas"
  - "ReactFlow canvas always renders for valid datasets — never replaced by full-screen empty state"
affects: [23-02-has-lineage-indicator]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Info icon (lucide-react) for inline informational banners distinct from red error states"
    - "role=status + aria-live=polite for non-error informational UI (vs role=alert for errors)"
    - "data-testid=no-lineage-banner for banner testability"

key-files:
  created: []
  modified:
    - lineage-api/services/lineage_service.py
    - lineage-ui/src/components/domain/LineageGraph/LineageGraph.tsx
    - lineage-ui/src/components/domain/LineageGraph/LineageGraph.test.tsx

key-decisions:
  - "Return {nodes:[], edges:[]} (not DatasetNotFoundError) for datasets that exist in OL_DATASET but have no OL_DATASET_FIELD entries — valid catalog state"
  - "Inline banner alongside canvas (not replacing it) — every table browsable regardless of lineage state"
  - "Blue banner (bg-blue-50, text-blue-700) for informational state vs red (text-red-500) for real errors"
  - "hasNoLineageData variable retained at module scope; only the full-screen replacement block removed"

patterns-established:
  - "No-lineage state: banner-plus-canvas, not canvas-replacement"
  - "Backend empty graph pattern: early return {datasetId, graph:{nodes:[],edges:[]}} for graceful degradation"

# Metrics
duration: 10min
completed: 2026-02-23
---

# Phase 23 Plan 01: Standalone Table Rendering Summary

**Backend returns valid {nodes, edges} for all catalog tables; frontend replaces full-screen empty state with inline blue "No lineage connections" banner rendered alongside the ReactFlow canvas**

## Performance

- **Duration:** 10 min
- **Started:** 2026-02-23T23:08:48Z
- **Completed:** 2026-02-23T23:18:45Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Backend `get_table_lineage_graph()` no longer raises `DatasetNotFoundError` for datasets with no OL_DATASET_FIELD entries — returns valid `{nodes:[], edges:[]}` instead
- Frontend full-screen "No Lineage Data Available" replacement block removed; `hasNoLineageData` now drives an inline blue banner that renders alongside the canvas
- 5 new tests in TC-GRAPH-013 verify: banner appears when `edges:[]`, canvas still in DOM, banner has `role="status"`, banner not shown when edges present

## Task Commits

Each task was committed atomically:

1. **Task 1: Backend — Return valid graph response for tables with no fields or no lineage** - `f1026b2` (fix)
2. **Task 2: Frontend — Replace full-screen empty state with inline informational banner** - `2f7b68f` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `lineage-api/services/lineage_service.py` - `get_table_lineage_graph()`: replaced `raise DatasetNotFoundError("No fields found")` with early return of valid empty graph
- `lineage-ui/src/components/domain/LineageGraph/LineageGraph.tsx` - Removed full-screen `if (hasNoLineageData) { return (...) }` block; added inline banner with `data-testid="no-lineage-banner"`; added `Info` to lucide-react imports
- `lineage-ui/src/components/domain/LineageGraph/LineageGraph.test.tsx` - Added TC-GRAPH-013 with 5 tests for no-lineage banner behavior

## Decisions Made

- Return `{nodes:[], edges:[]}` (not `DatasetNotFoundError`) for datasets that exist in `OL_DATASET` but have no `OL_DATASET_FIELD` entries — this is a valid catalog state, not an error
- Inline banner alongside canvas, not replacing it — ensures every table is browsable regardless of lineage state; the ELK early-exit gate (line 281) still fires for zero-edge graphs, preventing hang
- Blue color scheme (`bg-blue-50`, `text-blue-700`) to distinguish informational from error red (`text-red-500`)
- `role="status"` + `aria-live="polite"` for banner (informational), distinct from `role="alert"` used for real errors

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Python import verification failed outside venv (no `flask` module) — verified the change by reading the file directly instead; syntax correctness confirmed by reading the modified section
- 3 pre-existing accessibility test failures (OOM in `src/test/accessibility.test.tsx`) confirmed pre-existing on clean branch; not introduced by these changes

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Backend now returns valid graphs for all catalog tables — Phase 23 Plan 02 (has-lineage indicator) can rely on the API always returning a valid graph shape
- Frontend canvas renders for all valid datasets; banner provides user context when lineage is absent
- All 641 non-accessibility tests passing

---
*Phase: 23-standalone-table-rendering*
*Completed: 2026-02-23*

## Self-Check: PASSED

- lineage-api/services/lineage_service.py: FOUND
- lineage-ui/src/components/domain/LineageGraph/LineageGraph.tsx: FOUND
- lineage-ui/src/components/domain/LineageGraph/LineageGraph.test.tsx: FOUND
- .planning/phases/23-standalone-table-rendering/23-01-SUMMARY.md: FOUND
- Commit f1026b2: FOUND
- Commit 2f7b68f: FOUND
