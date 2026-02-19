---
phase: 13-multi-select-group-move-in-lineage-graph
plan: 02
subsystem: ui
tags: [react-flow, zustand, multi-select, group-move, lineage-graph, testing, vitest]

# Dependency graph
requires:
  - phase: 13-multi-select-group-move-in-lineage-graph
    plan: 01
    provides: useMultiSelect hook, Toolbar toggle, TableNode blue ring, Zustand multi-select state

provides:
  - Unit tests for useMultiSelect hook (8 tests covering isMultiSelectMode, onSelectionChange, onSelectionDragStart)
  - Unit tests for Toolbar multi-select toggle (5 tests covering render/hide, click, aria-pressed, bg-blue-100)
  - Double-click on table header opens detail panel (single click reserved for RF node selection)
  - Header onClick stopPropagation removed so React Flow receives single clicks for selection ring
  - Multi-select toggle wired to all three graph components (LineageGraph, DatabaseLineageGraph, AllDatabasesLineageGraph)
  - RF multiSelectionActive set via useStoreApi for additive clicks and group drag in toolbar mode
affects: [LineageGraph, DatabaseLineageGraph, AllDatabasesLineageGraph, TableNode, TableNodeHeader, Toolbar, useMultiSelect]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "useStoreApi().setState({ multiSelectionActive: true }) enables additive click-to-select without modifier in RF toolbar mode"
    - "Double-click for panel open pattern: onDoubleClick on table header, single click defers to RF for node selection ring"
    - "Header without stopPropagation pattern: RF sees all pointer events, enabling native node selection on single click"
    - "All three graph variants (LineageGraph, DatabaseLineageGraph, AllDatabasesLineageGraph) must receive the same multi-select props for consistent behavior"

key-files:
  created:
    - lineage-ui/src/components/domain/LineageGraph/hooks/useMultiSelect.test.ts
  modified:
    - lineage-ui/src/components/domain/LineageGraph/Toolbar.test.tsx
    - lineage-ui/src/components/domain/LineageGraph/TableNode/TableNode.tsx
    - lineage-ui/src/components/domain/LineageGraph/TableNode/TableNodeHeader.tsx
    - lineage-ui/src/components/domain/LineageGraph/hooks/useMultiSelect.ts
    - lineage-ui/src/components/domain/LineageGraph/LineageGraph.tsx
    - lineage-ui/src/components/domain/LineageGraph/DatabaseLineageGraph.tsx
    - lineage-ui/src/components/domain/LineageGraph/AllDatabasesLineageGraph.tsx

key-decisions:
  - "Double-click on table header opens detail panel: single click reserved for React Flow node selection ring to avoid conflicting interactions"
  - "stopPropagation removed from header onClick: RF must receive pointer events to apply selected state and render blue ring"
  - "useStoreApi().setState({ multiSelectionActive: true }) in useMultiSelect hook: this is the RF internal flag that enables additive click-select without modifier key in toolbar toggle mode"
  - "Multi-select props threaded through all three graph components (LineageGraph, DatabaseLineageGraph, AllDatabasesLineageGraph): all graph variants must be consistent"
  - "8f1d4a4 approach (onNodesChange interception) reverted: useStoreApi direct flag set (2171efa) is simpler and more reliable"

patterns-established:
  - "useStoreApi hook pattern: call useStoreApi() inside component, use .getState()/.setState() to read/write RF internal store"
  - "Double-click for secondary actions: single click = selection, double click = detail panel open"

# Metrics
duration: ~45min (including browser verification and multiple fix iterations)
completed: 2026-02-19
---

# Phase 13 Plan 02: Multi-Select and Group Move Summary

**Unit tests written for useMultiSelect and Toolbar multi-select toggle; browser verification confirmed with fixes for double-click detail panel, header click propagation, graph component wiring, and RF multiSelectionActive flag**

## Performance

- **Duration:** ~45 min (including browser verification session with fix iterations)
- **Started:** 2026-02-19T23:06:00Z
- **Completed:** 2026-02-19T23:46:58Z
- **Tasks:** 2 (1 auto + 1 human-verify)
- **Files modified:** 8 (1 created, 7 modified)

## Accomplishments
- useMultiSelect.test.ts created with 8 passing tests covering all hook behaviors
- Toolbar.test.tsx updated with 5 new tests in a multi-select toggle describe block
- All 569 pre-existing passing tests continue to pass after tests added
- Browser verification confirmed multi-select and group move work correctly after 5 fix commits:
  - Single click selects node (blue ring), double click opens detail panel
  - stopPropagation removed from header so RF receives clicks natively
  - Multi-select toggle wired to all three graph components
  - RF multiSelectionActive set via useStoreApi for additive clicks in toolbar mode

## Task Commits

Each task was committed atomically:

1. **Task 1: Add unit tests for useMultiSelect hook and update Toolbar tests** - `e3dd8a7` (test)

Verification fix commits (during human-verify checkpoint):

2. **feat: change table header to double-click for detail panel** - `5dd87ac` (feat)
3. **fix: remove stopPropagation from header onClick so RF can select node** - `11e10db` (fix)
4. **fix: wire multi-select toggle to DatabaseLineageGraph and AllDatabasesLineageGraph** - `1fc06f4` (fix)
5. **fix: make toolbar multi-select additive by intercepting RF deselect changes** - `8f1d4a4` (fix - approach later superseded)
6. **fix: set RF multiSelectionActive via storeApi to enable additive click and group drag** - `2171efa` (fix)

**Plan metadata:** (docs commit below)

## Files Created/Modified
- `lineage-ui/src/components/domain/LineageGraph/hooks/useMultiSelect.test.ts` - New: 8 unit tests for useMultiSelect hook (isMultiSelectMode, onSelectionDragStart, onSelectionChange cases)
- `lineage-ui/src/components/domain/LineageGraph/Toolbar.test.tsx` - Added describe block with 5 multi-select toggle tests (render, click, aria-pressed, bg-blue-100 active styling)
- `lineage-ui/src/components/domain/LineageGraph/TableNode/TableNode.tsx` - onNodeClick renamed to onNodeDoubleClick prop, wired to onDoubleClick handler
- `lineage-ui/src/components/domain/LineageGraph/TableNode/TableNodeHeader.tsx` - Renamed prop to onNodeDoubleClick; removed stopPropagation from onClick so RF receives single clicks
- `lineage-ui/src/components/domain/LineageGraph/hooks/useMultiSelect.ts` - Added useStoreApi to set multiSelectionActive when isMultiSelectMode toggles; iterated through two approaches (onNodesChange interception then storeApi)
- `lineage-ui/src/components/domain/LineageGraph/LineageGraph.tsx` - Pass isMultiSelectMode + onToggleMultiSelectMode to Toolbar and useStoreApi logic
- `lineage-ui/src/components/domain/LineageGraph/DatabaseLineageGraph.tsx` - Wired isMultiSelectMode and onToggleMultiSelectMode from store through to Toolbar
- `lineage-ui/src/components/domain/LineageGraph/AllDatabasesLineageGraph.tsx` - Wired isMultiSelectMode and onToggleMultiSelectMode from store through to Toolbar

## Decisions Made
- **Double-click opens detail panel:** Single click on table header must reach React Flow so it can apply the selected state and render the blue ring. Double-click was chosen as the gesture for opening the detail panel — still discoverable and keeps the primary gesture (click) for node selection.
- **stopPropagation removal:** The original TableNodeHeader had `e.stopPropagation()` on onClick. This blocked React Flow from receiving pointer events, preventing node selection ring from rendering. Removing it was required for the selection ring to work.
- **useStoreApi approach:** `useStoreApi().setState({ multiSelectionActive: true })` directly sets the RF internal flag. This is cleaner than intercepting onNodesChange (the 8f1d4a4 approach) because it correctly enables both additive clicks AND group drag behavior.
- **All three graph components:** LineageGraph, DatabaseLineageGraph, and AllDatabasesLineageGraph all render their own ReactFlow instance and their own Toolbar. All three needed the multi-select props threaded through.

## Deviations from Plan

### Auto-fixed Issues (during human-verify checkpoint)

**1. [Rule 1 - Bug] Table header single click was preventing node selection ring**
- **Found during:** Task 2 (browser verification)
- **Issue:** stopPropagation on header onClick blocked RF from receiving click events; node selection ring never rendered
- **Fix:** Removed stopPropagation; changed detail panel open to double-click gesture
- **Files modified:** TableNodeHeader.tsx, TableNode.tsx
- **Verification:** Single click now shows blue ring; double click opens detail panel
- **Committed in:** 5dd87ac, 11e10db

**2. [Rule 2 - Missing] DatabaseLineageGraph and AllDatabasesLineageGraph had no multi-select wiring**
- **Found during:** Task 2 (browser verification - toolbar button missing in database/all-databases views)
- **Issue:** Multi-select toggle only wired in LineageGraph.tsx; the other two graph components were not updated in plan 01
- **Fix:** Threaded isMultiSelectMode + onToggleMultiSelectMode from Zustand store through both components' Toolbar
- **Files modified:** DatabaseLineageGraph.tsx, AllDatabasesLineageGraph.tsx
- **Verification:** Toolbar toggle appears and functions in all three graph views
- **Committed in:** 1fc06f4

**3. [Rule 1 - Bug] Toolbar mode click-to-select was not additive (each click replaced selection)**
- **Found during:** Task 2 (browser verification - multi-select toggle not working correctly)
- **Issue:** Without multiSelectionKeyCode=null at runtime and RF multiSelectionActive set, clicking a second node in toolbar mode deselected the first
- **Fix:** Use useStoreApi().setState({ multiSelectionActive }) synced to isMultiSelectMode so RF enables additive click natively; this also enables group drag
- **Files modified:** useMultiSelect.ts, LineageGraph.tsx, DatabaseLineageGraph.tsx, AllDatabasesLineageGraph.tsx
- **Verification:** Clicking multiple nodes without holding Cmd adds each to selection; dragging any selected node moves all
- **Committed in:** 8f1d4a4 (intermediate approach), 2171efa (final approach)

---

**Total deviations:** 3 auto-fixed (2 bugs, 1 missing wiring)
**Impact on plan:** All fixes were required for the feature to function as described. The interaction model changed slightly (double-click for panel) which is an improvement over the original design.

## Issues Encountered

The intermediate fix (8f1d4a4 — onNodesChange interception) did not fully solve the additive click problem because intercepting deselect changes still required RF to be in multiSelectionActive mode for group drag to work. This was superseded by 2171efa which sets the RF internal flag directly via useStoreApi. The intermediate commit remains in history as part of the iteration.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 13 is fully complete — multi-select and group move work correctly in all three graph views
- All 13 planned phases are now complete
- Users can: Cmd+click to add nodes to selection, use toolbar toggle for modifier-free additive selection, drag any selected node to move the group, Escape to exit multi-select mode
- Single click on table header selects node (blue ring); double click opens detail panel
- Existing column selection and path highlighting are unaffected when multi-select is inactive

## Self-Check: PASSED

All files exist and all commits found:
- useMultiSelect.test.ts: FOUND
- Toolbar.test.tsx: FOUND
- TableNode.tsx: FOUND
- TableNodeHeader.tsx: FOUND
- useMultiSelect.ts: FOUND
- LineageGraph.tsx: FOUND
- DatabaseLineageGraph.tsx: FOUND
- AllDatabasesLineageGraph.tsx: FOUND
- Commit e3dd8a7: FOUND
- Commit 5dd87ac: FOUND
- Commit 11e10db: FOUND
- Commit 1fc06f4: FOUND
- Commit 8f1d4a4: FOUND
- Commit 2171efa: FOUND

---
*Phase: 13-multi-select-group-move-in-lineage-graph*
*Completed: 2026-02-19*
