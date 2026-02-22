---
phase: 20-mixed-layout-strategy
plan: 02
subsystem: ui
tags: [graph-layout, isolated-grid, elk, connected-components, layoutEngine]

# Dependency graph
requires:
  - phase: 20-01
    provides: "detectConnectedComponents + per-component layoutGraph with isolated placeholder positions"
provides:
  - "placeIsolatedGrid(): compact alphabetical grid placement for isolated tables, direction-aware, row-wrapping"
  - "layoutGraph() two-zone layout: connected section + isolated grid zone with gridGap separation"
  - "layoutSimpleNodes() ELK config: separateConnectedComponents + componentComponent spacing + aspectRatio"
affects: [20-03-plan, database-lineage-graph, all-databases-lineage-graph]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Two-zone layout: connected hierarchical section (primary) + isolated grid zone (secondary) separated by gridGap=80"
    - "placeIsolatedGrid: primary/secondary axis abstraction makes function direction-agnostic"
    - "maxRowWidth = max(1200, maxConnectedPrimaryExtent): grid width adapts to connected footprint"
    - "ELK separateConnectedComponents on layoutSimpleNodes fallback: same componentComponent spacing as nodeSpacing*2"

key-files:
  created: []
  modified:
    - lineage-ui/src/utils/graph/layoutEngine.ts
    - lineage-ui/src/utils/graph/layoutEngine.test.ts

key-decisions:
  - "gridGap = componentGap (80px): same gap as between connected components for visual consistency"
  - "maxRowWidth = max(1200, maxConnectedPrimaryExtent): ensures isolated grid is never narrower than 1200px even with small connected sections"
  - "placeIsolatedGrid is internal (not exported): callers use layoutGraph which handles the full two-zone layout"
  - "Pre-existing DatabaseLineageGraph.tsx TypeScript direction type error confirmed unrelated and unchanged"

patterns-established:
  - "placeIsolatedGrid: receives isolated[], tableNodeData, startPrimary, nodeSpacing, isHorizontal, maxRowWidth — never rebuilds adjacency"
  - "Grid wrapping check: currentPrimary > 0 && currentPrimary + primarySize > maxRowWidth (first node never wraps)"
  - "rowMaxSecondary tracks tallest node per row for correct next-row y offset"

# Metrics
duration: 3min
completed: 2026-02-22
---

# Phase 20 Plan 02: Isolated Table Grid Placement and ELK Fallback Fix Summary

**placeIsolatedGrid() two-zone layout with alphabetical row-wrapping grid and ELK separateConnectedComponents for the layoutSimpleNodes fallback path**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-02-22T02:49:26Z
- **Completed:** 2026-02-22T02:52:18Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Added `placeIsolatedGrid()` internal helper that places isolated tables in a compact alphabetical row-wrapping grid, direction-aware (horizontal: rows flow along x, vertical: rows flow along y), with maxRowWidth adapting to connected section footprint
- Replaced temporary sequential isolated placement in `layoutGraph()` with `placeIsolatedGrid()` — isolated tables now appear in a proper grid zone separated by gridGap=80 from the connected section
- Added `elk.separateConnectedComponents: 'true'`, `elk.spacing.componentComponent`, and `elk.aspectRatio: '1.7'` to `layoutSimpleNodes()` ELK config — fallback path now separates disconnected table/database nodes visually
- All 83 tests pass (76 from Plan 20-01 + 5 isolated grid tests + 2 ELK fallback tests)

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement placeIsolatedGrid() and integrate into layoutGraph()** - `1b38e9a` (feat)
2. **Task 2: Fix layoutSimpleNodes ELK config for component separation (MLST-05)** - `7957da9` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `lineage-ui/src/utils/graph/layoutEngine.ts` - Added `placeIsolatedGrid()` internal function; replaced temporary isolated placement with grid call; added three ELK layout options to `layoutSimpleNodes`
- `lineage-ui/src/utils/graph/layoutEngine.test.ts` - 7 new tests: 5 isolated grid layout tests + 2 ELK fallback component separation tests (83 total tests)

## Decisions Made
- `gridGap = componentGap (80px)` for visual consistency with inter-component spacing
- `maxRowWidth = max(1200, maxConnectedPrimaryExtent)` ensures grid never collapses to tiny width when connected section is small
- `placeIsolatedGrid` kept internal (not exported) — `layoutGraph` is the public contract; callers don't need to know about the internal grid strategy
- Pre-existing TypeScript error in `DatabaseLineageGraph.tsx` (direction type mismatch) confirmed unrelated to this plan — acknowledged in Plan 20-01 summary, no action taken

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-existing TypeScript build error in `DatabaseLineageGraph.tsx(182,7)`: `Type '"upstream" | "downstream" | "both"' is not assignable to type '"RIGHT" | "LEFT" | "DOWN" | "UP" | undefined'`. This error existed before Plan 20-01 and is unrelated to layoutEngine.ts changes. Build of layoutEngine.ts itself is clean.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `placeIsolatedGrid` integrated into `layoutGraph` — two-zone layout complete for MLST-03 and MLST-04
- `layoutSimpleNodes` ELK config fixed for MLST-05 — fallback path separates disconnected components
- All 83 tests pass; ready for Plan 20-03
- `DatabaseLineageGraph.tsx` and `AllDatabasesLineageGraph.tsx` benefit from the fix with no caller changes (MLST-06)

## Self-Check: PASSED

- layoutEngine.ts: FOUND — `function placeIsolatedGrid` at line 463
- layoutEngine.test.ts: FOUND — 83 tests, all passing
- 20-02-SUMMARY.md: FOUND (this file)
- Commit 1b38e9a (Task 1): FOUND
- Commit 7957da9 (Task 2): FOUND
- `separateConnectedComponents` in layoutEngine.ts: FOUND at line 843

---
*Phase: 20-mixed-layout-strategy*
*Completed: 2026-02-22*
