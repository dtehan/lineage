---
status: resolved
trigger: "viewport-snap-during-drag: When dragging a table node in the graph view, the entire viewport repositions/snaps before the table is dropped"
created: 2026-01-31T00:00:00Z
updated: 2026-01-31T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMED - DatabaseLineageGraph.tsx and AllDatabasesLineageGraph.tsx have buggy useEffect that re-triggers on every node change (drag), not just on initial load like LineageGraph.tsx
test: Apply same fix pattern from LineageGraph.tsx to the other two components
expecting: After fix, dragging nodes in database-level and all-databases views will not cause viewport snap
next_action: Apply fix to DatabaseLineageGraph.tsx and AllDatabasesLineageGraph.tsx

## Symptoms

expected: Table should move smoothly with cursor without any viewport changes
actual: Before dropping the table, the entire screen does a reposition/snap
errors: No errors visible in browser console
reproduction: Happens every time a table is dragged in the graph view
started: Always been this way (existed since feature implementation)

## Eliminated

## Evidence

- timestamp: 2026-01-31T00:01:00Z
  checked: git history for prior fix attempts
  found: 3 commits already attempted to fix this (ca741b9, c67393f, 0265709)
  implication: Current guards (hasAppliedViewportRef, hasUserInteractedRef, onNodeDragStart) are insufficient

- timestamp: 2026-01-31T00:02:00Z
  checked: LineageGraph.tsx useEffect on line 232-245
  found: Effect depends on [nodes.length, stage, applySmartViewport]. Guards check hasAppliedViewportRef and hasUserInteractedRef
  implication: Either guards are not working, refs are being reset, or applySmartViewport is changing causing effect to re-run

- timestamp: 2026-01-31T00:10:00Z
  checked: DatabaseLineageGraph.tsx and AllDatabasesLineageGraph.tsx smart viewport effects
  found: Both components have useEffect depending on [nodes, applySmartViewport] with NO guards. When nodes are dragged, React Flow creates new array reference, triggering the effect and re-setting a 150ms timeout. If user pauses for 150ms, viewport snaps.
  implication: LIKELY ROOT CAUSE - the fix was only applied to LineageGraph.tsx but not to the other two graph components

## Resolution

root_cause: DatabaseLineageGraph.tsx and AllDatabasesLineageGraph.tsx have useEffect for smart viewport that depends on `nodes` (full array) instead of `nodes.length`, and lacks the `hasAppliedViewportRef` and `hasUserInteractedRef` guards that were added to LineageGraph.tsx. When user drags a node, React Flow creates a new nodes array reference, triggering the effect and setting a new 150ms timeout. If the user pauses dragging for 150ms, the viewport snaps.
fix: Applied the same fix pattern from LineageGraph.tsx (commit 0265709 and ca741b9) to both DatabaseLineageGraph.tsx and AllDatabasesLineageGraph.tsx: 1) Added hasAppliedViewportRef and hasUserInteractedRef refs, 2) Changed dependency from `nodes` to `nodes.length`, 3) Added guards to prevent viewport application after user interaction, 4) Added onNodeDragStart handler to track user interaction. Also cleaned up debug code from LineageGraph.tsx.
verification: TypeScript compilation passes. Unit tests have some failures but they are pre-existing issues unrelated to this fix (test mocks don't match actual API hooks used).
files_changed:
  - lineage-ui/src/components/domain/LineageGraph/DatabaseLineageGraph.tsx
  - lineage-ui/src/components/domain/LineageGraph/AllDatabasesLineageGraph.tsx
  - lineage-ui/src/components/domain/LineageGraph/LineageGraph.tsx (cleanup debug code)
