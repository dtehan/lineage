---
phase: 13-multi-select-group-move-in-lineage-graph
plan: 01
subsystem: ui
tags: [react-flow, zustand, multi-select, group-move, lineage-graph]

# Dependency graph
requires:
  - phase: 12-prevent-database-cluster-overlap
    provides: stable lineage graph layout foundation
provides:
  - Multi-select mode toggle in Zustand store with state clear-on-enter behavior
  - useMultiSelect hook bridging React Flow selection with Zustand store
  - TableNode shows blue ring ring-2 ring-blue-400 ring-offset-2 when RF-selected
  - Toolbar has MousePointerClick toggle button with active/inactive styling
  - ReactFlow multiSelectionKeyCode/onSelectionChange/onSelectionDragStart wired
  - Escape key handler exits multi-select mode
affects: [LineageGraph, TableNode, Toolbar, useLineageStore]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Multi-select mode entered via toolbar button or Cmd+click; exits via Escape or toolbar toggle"
    - "Entering multi-select clears ALL selection/highlight state to prevent dimming interference"
    - "multiSelectionKeyCode=null when mode active (RF handles selection natively); 'Meta' otherwise (Cmd+click)"
    - "useLineageStore.getState() used inside useCallback to avoid stale closure in onSelectionChange"

key-files:
  created:
    - lineage-ui/src/components/domain/LineageGraph/hooks/useMultiSelect.ts
  modified:
    - lineage-ui/src/stores/useLineageStore.ts
    - lineage-ui/src/components/domain/LineageGraph/hooks/index.ts
    - lineage-ui/src/components/domain/LineageGraph/hooks/useKeyboardShortcuts.ts
    - lineage-ui/src/components/domain/LineageGraph/LineageGraph.tsx
    - lineage-ui/src/components/domain/LineageGraph/TableNode/TableNode.tsx
    - lineage-ui/src/components/domain/LineageGraph/Toolbar.tsx

key-decisions:
  - "multiSelectionKeyCode=null when isMultiSelectMode active so RF treats every click as selection toggle (no modifier required)"
  - "Entering multi-select mode clears highlightedNodeIds, highlightedEdgeIds, selectedAssetId, selectedEdgeId, isTableSelection, isPanelOpen, panelContent - prevents dimming overlay interfering with multi-select ring visibility"
  - "ring-blue-400 ring-offset-2 used for multi-select ring (lighter than border-blue-500 used for column selection) to make them visually distinguishable"
  - "onNodeClick returns early when event.metaKey || event.ctrlKey || isMultiSelectMode to let RF handle selection natively without triggering column selection"
  - "selectionOnDrag=false prevents accidental box-selection when panning"

patterns-established:
  - "React Flow multi-select: set multiSelectionKeyCode=null to enable click-to-select without modifier"
  - "Zustand store state clear on mode transition pattern: toggle action clears related state in one atomic set()"

# Metrics
duration: 4min
completed: 2026-02-19
---

# Phase 13 Plan 01: Multi-Select and Group Move Summary

**React Flow multi-select wired to Zustand store: Cmd+click or toolbar toggle selects multiple table nodes with blue ring, group drag moves them together, Escape exits cleanly**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-02-19T22:58:48Z
- **Completed:** 2026-02-19T23:02:18Z
- **Tasks:** 2
- **Files modified:** 7 (1 created, 6 modified)

## Accomplishments
- Multi-select mode state (isMultiSelectMode + toggleMultiSelectMode) added to Zustand store with full selection/highlight clear on enter
- useMultiSelect hook created bridging React Flow's onSelectionChange/onSelectionDragStart with Zustand store
- TableNode renders blue ring (ring-2 ring-blue-400 ring-offset-2) when React Flow `selected` prop is true
- Toolbar has MousePointerClick toggle button with active (blue background) and inactive styling, data-testid="multi-select-toggle"
- Escape key handler updated to exit multi-select mode alongside clearing highlights
- onNodeClick skips column selection when Cmd/Ctrl held or multi-select mode active

## Task Commits

Each task was committed atomically:

1. **Task 1: Add multi-select state to Zustand store and create useMultiSelect hook** - `ff56f8e` (feat)
2. **Task 2: Wire multi-select props to ReactFlow, add visual feedback to TableNode, and add toolbar toggle** - `c446ec8` (feat)

**Plan metadata:** (docs commit below)

## Files Created/Modified
- `lineage-ui/src/stores/useLineageStore.ts` - Added isMultiSelectMode state + toggleMultiSelectMode action with full state clear on enter
- `lineage-ui/src/components/domain/LineageGraph/hooks/useMultiSelect.ts` - New hook: reads isMultiSelectMode, handles onSelectionChange (clears column selection when nodes selected) and onSelectionDragStart (marks user interacted)
- `lineage-ui/src/components/domain/LineageGraph/hooks/index.ts` - Added export for useMultiSelect
- `lineage-ui/src/components/domain/LineageGraph/hooks/useKeyboardShortcuts.ts` - Escape handler now exits multi-select mode; added isMultiSelectMode/toggleMultiSelectMode to deps array
- `lineage-ui/src/components/domain/LineageGraph/LineageGraph.tsx` - Import useMultiSelect; add toggleMultiSelectMode from store; call useMultiSelect hook; update onNodeClick to check isMultiSelectMode; add multiSelectionKeyCode/selectionOnDrag/onSelectionChange/onSelectionDragStart to ReactFlow; pass isMultiSelectMode+onToggleMultiSelectMode to Toolbar
- `lineage-ui/src/components/domain/LineageGraph/TableNode/TableNode.tsx` - Add selected prop to TableNodeProps; destructure selected; compute multiSelectRing class; apply to outer div
- `lineage-ui/src/components/domain/LineageGraph/Toolbar.tsx` - Import MousePointerClick from lucide-react; add isMultiSelectMode/onToggleMultiSelectMode props; add toggle button before refresh button

## Decisions Made
- multiSelectionKeyCode=null when isMultiSelectMode active so React Flow treats every click as selection toggle (no modifier required)
- Entering multi-select mode clears all highlight/selection state atomically to prevent dimming interfering with the ring visual
- ring-blue-400 ring-offset-2 chosen (lighter than border-blue-500 for column selection) to make ring vs border distinguishable
- onNodeClick returns early on metaKey/ctrlKey/isMultiSelectMode to let React Flow manage selection natively
- selectionOnDrag=false prevents accidental box-selection drag

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

Pre-existing test failures (32 failed / 556 passed) confirmed identical before and after changes. All failures are in AssetBrowser, accessibility, and DatabaseLineageGraph test suites unrelated to this plan's changes.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Multi-select and group move fully implemented and TypeScript-clean
- Users can Cmd+click or use toolbar button to select multiple table nodes
- Dragging any selected node moves the whole group (React Flow built-in)
- Escape key and toolbar button both exit multi-select mode cleanly
- All existing unit tests passing at pre-change levels (556 passing)
- Phase 13 plan 01 complete; no further plans defined for phase 13

## Self-Check: PASSED

All files exist and all commits found:
- useMultiSelect.ts: FOUND
- useLineageStore.ts: FOUND
- LineageGraph.tsx: FOUND
- TableNode.tsx: FOUND
- Toolbar.tsx: FOUND
- Commit ff56f8e: FOUND
- Commit c446ec8: FOUND

---
*Phase: 13-multi-select-group-move-in-lineage-graph*
*Completed: 2026-02-19*
