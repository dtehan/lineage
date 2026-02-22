---
phase: 21-ux-polish
plan: 01
subsystem: ui
tags: [react-flow, zustand, typescript, layoutEngine, isolated-tables, UX]

# Dependency graph
requires:
  - phase: 20-02
    provides: "placeIsolatedGrid function in layoutEngine.ts with isolated node placement in two-zone layout"
provides:
  - "LayoutResult extended with isolatedCount, connectedCount, isolatedGridOrigin, isolatedNodeIds"
  - "useUIStore with hideIsolatedTables toggle, isolatedTableCount, connectedTableCount"
  - "SectionLabelNode React Flow node type rendering canvas label above isolated grid"
  - "Hide isolated tables toggle button (Eye/EyeOff) in Toolbar action buttons"
  - "Database header count badges: N in lineage (blue) and N isolated (slate)"
  - "visibleNodes/visibleEdges hide filtering without re-running layout"
affects: [future-ux-phases, lineage-graph-features]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "SectionLabelNode pattern: non-interactive React Flow node for section dividers, positioned relative to isolatedGridOrigin"
    - "useUIStore extended for layout metadata: counts written by DatabaseLineageGraph on layout completion, read by Toolbar and header"
    - "render-time filtering pattern: visibleNodes/visibleEdges useMemo filters without re-running layout"

key-files:
  created: []
  modified:
    - lineage-ui/src/utils/graph/layoutEngine.ts
    - lineage-ui/src/stores/useUIStore.ts
    - lineage-ui/src/stores/useUIStore.test.ts
    - lineage-ui/src/components/domain/LineageGraph/DatabaseLineageGraph.tsx
    - lineage-ui/src/components/domain/LineageGraph/Toolbar.tsx
    - lineage-ui/src/components/domain/LineageGraph/Toolbar.test.tsx

key-decisions:
  - "SectionLabelNode injected into allNodes array after layout (not via ELK): positioned at isolatedGridOrigin.y - 36px, type='sectionLabelNode', draggable/selectable/focusable=false"
  - "render-time filtering chosen over layout re-run: visibleNodes/visibleEdges useMemo, isolatedNodeIdsRef tracks IDs from last layout result"
  - "layout direction bug fixed: DatabaseLineageGraph was passing lineage traversal direction (upstream/downstream/both) as layout direction (RIGHT/LEFT/DOWN/UP); fixed by removing direction from layout options (defaults to RIGHT)"
  - "header count badges conditional on count > 0: badges hidden during loading (count === 0), appear after layout callback fires"

patterns-established:
  - "SectionLabelNode: pointer-events-none, select-none, draggable=false for truly non-interactive canvas overlay nodes"
  - "Toggle-button visibility gating: onToggleHideIsolatedTables && isolatedTableCount > 0 prevents rendering toggle when no isolated tables"

# Metrics
duration: 15min
completed: 2026-02-22
---

# Phase 21 Plan 01: Isolated Table UX Summary

**Canvas section label, hide-isolated toggle, and header count badges for the two-zone database lineage layout**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-02-22T07:10:00Z
- **Completed:** 2026-02-22T07:26:36Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Extended LayoutResult with isolatedCount, connectedCount, isolatedGridOrigin, isolatedNodeIds at both return sites (layoutGraph and layoutSimpleNodes)
- Added useUIStore state: hideIsolatedTables toggle + isolatedTableCount + connectedTableCount with full test coverage
- SectionLabelNode React Flow component registered in nodeTypes, injected above isolated grid after layout completes
- Eye/EyeOff hide-isolated toggle in Toolbar, conditionally rendered only when isolated tables exist (isolatedTableCount > 0)
- Database header count badges showing "N in lineage" (blue) and "N isolated" (slate) after layout
- render-time node/edge filtering via visibleNodes/visibleEdges useMemo - no layout re-runs

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend LayoutResult and useUIStore with isolated table metadata** - `411304a` (feat)
2. **Task 2: SectionLabelNode, Toolbar toggle, header badges, and hide filtering in DatabaseLineageGraph** - `76bf342` (feat)

**Plan metadata:** (docs commit to follow)

## Files Created/Modified
- `lineage-ui/src/utils/graph/layoutEngine.ts` - Added 4 fields to LayoutResult interface, capture isolatedGridOrigin after placeIsolatedGrid, return new fields at both return sites
- `lineage-ui/src/stores/useUIStore.ts` - Added hideIsolatedTables toggle, isolatedTableCount/setIsolatedTableCount, connectedTableCount/setConnectedTableCount
- `lineage-ui/src/stores/useUIStore.test.ts` - Added tests TC-STATE-010/011/012 for new store fields; reset in beforeEach
- `lineage-ui/src/components/domain/LineageGraph/DatabaseLineageGraph.tsx` - SectionLabelNode component + nodeTypes registration, useUIStore wiring, layout callback updates, visibleNodes/visibleEdges filtering, header badges, Toolbar props
- `lineage-ui/src/components/domain/LineageGraph/Toolbar.tsx` - Eye/EyeOff imports, hideIsolatedTables/onToggleHideIsolatedTables/isolatedTableCount props, hide-isolated-toggle button
- `lineage-ui/src/components/domain/LineageGraph/Toolbar.test.tsx` - 6 new tests for hide isolated tables toggle

## Decisions Made
- SectionLabelNode injected into allNodes array (not ELK): positioned at `isolatedGridOrigin.y - 36px` offset, fully non-interactive (draggable/selectable/focusable=false, pointer-events-none)
- render-time filtering chosen: `visibleNodes`/`visibleEdges` useMemo using `isolatedNodeIdsRef` avoids expensive layout re-run on toggle
- header count badges appear only when count > 0, so they're hidden during initial loading and only appear after layout callback fires
- Toggle button visibility gated on `onToggleHideIsolatedTables && isolatedTableCount > 0`: toolbar renders toggle only for database views with isolated tables

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed pre-existing TypeScript error: wrong direction type passed to layout worker**
- **Found during:** Task 2 (TypeScript verification step)
- **Issue:** `DatabaseLineageGraph.tsx` passed `direction` (type `'upstream' | 'downstream' | 'both'` from useLineageStore) to `workerLayoutGraph` options (which expected `'RIGHT' | 'LEFT' | 'DOWN' | 'UP'`). This was a type mismatch: two different concepts named "direction" conflated.
- **Fix:** Removed `direction` from `workerLayoutGraph` options object (layout always defaults to `'RIGHT'`); removed `direction` from useEffect dependency array (it affects `data` via the query hook, not the layout call directly)
- **Files modified:** `lineage-ui/src/components/domain/LineageGraph/DatabaseLineageGraph.tsx`
- **Verification:** `npx tsc --noEmit` passes with zero errors
- **Committed in:** `76bf342` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Pre-existing TypeScript error that blocked compilation. Fix is minimal and correct - layout direction was never being used (default RIGHT applied). No scope creep.

## Issues Encountered
- Full test suite hit JS heap OOM in the background runner - this is a pre-existing environment issue, not caused by our changes. Individual test file runs (`useUIStore.test.ts` and `Toolbar.test.tsx`) pass cleanly with 64/64 tests.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 21 Plan 01 complete: isolated table UX fully implemented
- Two-zone layout is now self-explanatory with section label and count badges
- Users can hide isolated tables for cleaner graph views
- Ready for Phase 21 Plan 02 (next UX polish work)

---
*Phase: 21-ux-polish*
*Completed: 2026-02-22*
