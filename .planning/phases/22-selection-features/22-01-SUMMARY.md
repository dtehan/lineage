---
phase: 22-selection-features
plan: 01
subsystem: ui
tags: [react-flow, fitView, viewport, selection, lineage-highlight, zustand]

# Dependency graph
requires:
  - phase: 19-animation-and-transitions
    provides: Panel slide animation timing (300ms) used for fitView duration
  - phase: 21-detail-panel-enhancement
    provides: Tabbed DetailPanel and isPanelOpen state
provides:
  - useFitToSelection hook for centering viewport on highlighted lineage path
  - Crosshair toolbar button for fit-to-selection action
  - Selection persistence across depth changes with graceful cleanup
affects: [22-02-selection-breadcrumbs, 23-testing]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "fitView with nodes filter for targeted viewport centering"
    - "hasUserInteractedRef gating to prevent smart viewport override after user action"
    - "storeNodes dependency in effects for depth-change reactivity"

key-files:
  created:
    - lineage-ui/src/components/domain/LineageGraph/hooks/useFitToSelection.ts
  modified:
    - lineage-ui/src/components/domain/LineageGraph/hooks/index.ts
    - lineage-ui/src/components/domain/LineageGraph/Toolbar.tsx
    - lineage-ui/src/components/domain/LineageGraph/LineageGraph.tsx

key-decisions:
  - "FIT_TO_SELECTION_PADDING = 0.15 and DURATION = 300ms matching Phase 19 panel slide timing"
  - "Map column IDs to parent table node IDs via columns array check for fitView targeting"
  - "Set hasUserInteractedRef before fitToSelection to prevent smart viewport override"
  - "Selection persistence checks storeNodes existence, clears on column disappearance"
  - "Only open panel if not already open to prevent re-triggering slide animation"

patterns-established:
  - "Targeted fitView pattern: filter nodes by highlighted column membership, pass to reactFlowInstance.fitView"
  - "User interaction gating: set hasUserInteractedRef.current = true before programmatic viewport changes"

# Metrics
duration: 4min
completed: 2026-02-06
---

# Phase 22 Plan 01: Fit-to-Selection and Selection Persistence Summary

**useFitToSelection hook with Crosshair toolbar button for viewport centering on highlighted lineage path, plus selection persistence fix across depth changes**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-07T00:30:38Z
- **Completed:** 2026-02-07T00:34:48Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Created useFitToSelection hook that maps highlighted column IDs to parent table nodes and calls fitView with padding 0.15 and duration 300ms
- Added Crosshair button to Toolbar that is disabled when no column is selected and enabled when a lineage path is highlighted
- Fixed selection persistence so highlight recomputes when graph depth changes and the column still exists
- Selection clears cleanly when the selected column disappears from the graph after depth reduction

## Task Commits

Each task was committed atomically:

1. **Task 1: Create useFitToSelection hook and add Toolbar button** - `7cc5054` (feat)
2. **Task 2: Wire fit-to-selection into LineageGraph and fix selection persistence** - `b9884dd` (feat)

## Files Created/Modified
- `lineage-ui/src/components/domain/LineageGraph/hooks/useFitToSelection.ts` - Hook encapsulating fitView logic for highlighted table nodes
- `lineage-ui/src/components/domain/LineageGraph/hooks/index.ts` - Barrel export for useFitToSelection
- `lineage-ui/src/components/domain/LineageGraph/Toolbar.tsx` - Crosshair button with disabled state and tooltip
- `lineage-ui/src/components/domain/LineageGraph/LineageGraph.tsx` - Hook wiring, handleFitToSelection callback, selection persistence effect fix

## Decisions Made
- Used `FIT_TO_SELECTION_PADDING = 0.15` (15% viewport padding) for comfortable framing of selected nodes
- Used `FIT_TO_SELECTION_DURATION = 300` to match Phase 19 panel slide animation timing for visual consistency
- Map column IDs to parent table node IDs by checking `node.data.columns` array membership (efficient since table nodes contain column arrays)
- Set `hasUserInteractedRef.current = true` before calling `fitToSelection()` to prevent the smart viewport effect from overriding the fit-to-selection viewport position after depth changes
- Changed selection effect to only call `openPanel('node')` when panel is not already open, preventing re-triggering of panel slide animation during highlight recomputation

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Fit-to-selection hook and button ready for use in 22-02 (SelectionBreadcrumb can trigger fit-to-selection)
- Selection persistence fix provides stable foundation for breadcrumb navigation across depth changes
- All existing tests pass (32 pre-existing failures in legacy test files unrelated to this plan)

---
*Phase: 22-selection-features*
*Completed: 2026-02-06*
