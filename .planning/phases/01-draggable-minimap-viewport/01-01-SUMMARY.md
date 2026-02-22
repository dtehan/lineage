---
phase: 01-draggable-minimap-viewport
plan: 01
subsystem: ui
tags: [react-flow, minimap, xyflow, lineage-graph, typescript]

# Dependency graph
requires: []
provides:
  - Shared LineageMiniMap component with pannable and zoomable interactive props
  - Cursor feedback CSS (grab/grabbing) for minimap interaction
  - Unified minimap behavior across all three graph views
affects: [LineageGraph, DatabaseLineageGraph, AllDatabasesLineageGraph]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Shared wrapper component pattern: extract common React Flow panel props into a dedicated component to avoid duplication across graph views"
    - "CSS className hook pattern: use a component-specific class as a CSS hook for pseudo-state styling that the library does not natively provide"

key-files:
  created:
    - lineage-ui/src/components/domain/LineageGraph/LineageMiniMap.tsx
  modified:
    - lineage-ui/src/components/domain/LineageGraph/LineageGraph.tsx
    - lineage-ui/src/components/domain/LineageGraph/DatabaseLineageGraph.tsx
    - lineage-ui/src/components/domain/LineageGraph/AllDatabasesLineageGraph.tsx
    - lineage-ui/src/index.css
    - lineage-ui/src/components/domain/LineageGraph/LineageGraph.test.tsx

key-decisions:
  - "Accept nodeColor as the only prop on LineageMiniMap - it is the only prop that differs between the three graph views; all other props are fixed defaults"
  - "Use className hook (lineage-minimap--interactive) for cursor CSS because React Flow does not add cursor styles automatically when pannable={true}"
  - "maskStrokeColor=#3b82f6 (blue) on viewport indicator signals draggability without custom SVG or overlay"

patterns-established:
  - "LineageMiniMap: shared wrapper for React Flow MiniMap with interactive defaults - import from ./LineageMiniMap in any graph component"

# Metrics
duration: 5min
completed: 2026-02-22
---

# Phase 01 Plan 01: Draggable Minimap Viewport Summary

**Shared LineageMiniMap wrapper with pannable/zoomable props, blue viewport stroke border, and grab cursor CSS - enabling drag-to-pan and scroll-to-zoom across all three graph views**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-22T00:46:02Z
- **Completed:** 2026-02-22T00:51:00Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Created `LineageMiniMap.tsx` as a shared component wrapping `@xyflow/react`'s `MiniMap` with `pannable={true}`, `zoomable={true}`, and a blue viewport stroke border (`maskStrokeColor="#3b82f6"`)
- Eliminated duplicate `<MiniMap />` usage across `LineageGraph.tsx`, `DatabaseLineageGraph.tsx`, and `AllDatabasesLineageGraph.tsx` by replacing all three with `<LineageMiniMap />`
- Added `cursor: grab` / `cursor: grabbing` CSS via `.lineage-minimap--interactive` class hook to provide visual drag feedback that React Flow does not add natively
- Added a new integration test verifying minimap toggle shows `LineageMiniMap` and updates `aria-expanded`

## Task Commits

Each task was committed atomically:

1. **Task 1: Create shared LineageMiniMap component and integrate into all graph views** - `1bced3d` (feat)
2. **Task 2: Update tests to verify interactive minimap behavior** - `b66d947` (test)

**Plan metadata:** (docs commit, see below)

## Files Created/Modified

- `lineage-ui/src/components/domain/LineageGraph/LineageMiniMap.tsx` - New shared minimap component with pannable, zoomable, blue stroke border, and cursor class
- `lineage-ui/src/components/domain/LineageGraph/LineageGraph.tsx` - Replaced `<MiniMap />` with `<LineageMiniMap nodeColor={...} />`, removed MiniMap from xyflow import
- `lineage-ui/src/components/domain/LineageGraph/DatabaseLineageGraph.tsx` - Replaced `<MiniMap />` with `<LineageMiniMap />`, removed MiniMap from xyflow import
- `lineage-ui/src/components/domain/LineageGraph/AllDatabasesLineageGraph.tsx` - Replaced `<MiniMap />` with `<LineageMiniMap />`, removed MiniMap from xyflow import
- `lineage-ui/src/index.css` - Added grab/grabbing cursor rules for `.lineage-minimap--interactive` class
- `lineage-ui/src/components/domain/LineageGraph/LineageGraph.test.tsx` - Added minimap toggle integration test with `fireEvent.click`

## Decisions Made

- `nodeColor` is the only prop on `LineageMiniMap` because it is the only prop that differs between graph views. `LineageGraph` passes a custom callback that highlights the focused field in blue; `DatabaseLineageGraph` and `AllDatabasesLineageGraph` use the default flat grey.
- CSS class hook approach used for cursor feedback because React Flow's `pannable` prop does not add cursor styles automatically. The `.lineage-minimap--interactive .react-flow__minimap-svg` selector targets the SVG element precisely.
- `maskStrokeColor="#3b82f6"` (Tailwind blue-500) chosen for the viewport indicator border to match the application's existing primary color and signal interactivity.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

Pre-existing test failures in `DatabaseLineageGraph.test.tsx` (6 failures around `useDatabaseLineage` mock) and `AllDatabasesLineageGraph.test.tsx` (JS heap out of memory) were confirmed pre-existing by stashing changes and re-running. These failures are unrelated to this plan's scope.

## Next Phase Readiness

- Interactive minimap is complete and ready for end-to-end verification in the browser
- All three graph views share the same `LineageMiniMap` component - future minimap changes only need to update one file
- No blockers

## Self-Check: PASSED

---
*Phase: 01-draggable-minimap-viewport*
*Completed: 2026-02-22*
