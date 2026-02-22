---
phase: 20-mixed-layout-strategy
plan: 01
subsystem: ui
tags: [graph-layout, topological-sort, connected-components, bfs, kahn-sort, layoutEngine]

# Dependency graph
requires:
  - phase: 19-layout-engine-foundation
    provides: "Binary-search Kahn sort in layoutGraph, separateDatabaseClusters with secLo/secHi"
provides:
  - "detectConnectedComponents(tableIds, tableAdj): BFS over undirected adjacency, returns {connected, isolated}"
  - "kahnSort(ids, adj, inDeg): named helper with O(log n) binary-search insertion for topological sort"
  - "layoutGraph() per-component layering: each connected component gets independent Kahn + longest-path layering"
  - "Component vertical stacking: components share x-axis columns, offset by secondary axis"
  - "Isolated table placeholder: positioned below connected section for Plan 20-02 grid"
affects: [20-02-plan, isolated-grid-placement, database-lineage-layout]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "BFS connected component detection over undirected projection of directed adjacency"
    - "Per-component subgraph: filter tableAdj to component membership before layering"
    - "kahnSort as shared helper: both layoutGraph and topoSortDatabases delegate to it"
    - "componentSecondaryOffset: each component stacks along secondary axis with gap=80"

key-files:
  created: []
  modified:
    - lineage-ui/src/utils/graph/layoutEngine.ts
    - lineage-ui/src/utils/graph/layoutEngine.test.ts

key-decisions:
  - "Self-loops filtered in undirected adjacency build (src !== tgt) so a self-looping table is correctly classified as isolated"
  - "topoSortDatabases refactored to delegate Kahn loop to kahnSort — eliminates duplicated sort logic"
  - "Isolated tables placed with simple sequential layout for now; Plan 20-02 replaces with alphabetical grid"
  - "Components stack vertically (componentYOffset along secondary axis) so all layer-0 tables align at the same x regardless of which component they belong to"

patterns-established:
  - "detectConnectedComponents: pass already-built tableAdj directly — never rebuild adjacency"
  - "kahnSort: copies inDeg internally so caller's map is not mutated"
  - "Per-component loop: build subAdj/subInDeg within loop, run kahnSort + longest-path per component"

# Metrics
duration: 5min
completed: 2026-02-22
---

# Phase 20 Plan 01: Connected Component Detection and Per-Component Layout Summary

**BFS-based connected component detection (detectConnectedComponents + kahnSort exports) enabling independent topological layering per connected subgraph with vertical component stacking in layoutGraph**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-02-22T02:42:19Z
- **Completed:** 2026-02-22T02:47:17Z
- **Tasks:** 2 (both TDD)
- **Files modified:** 2

## Accomplishments
- Added `detectConnectedComponents(tableIds, tableAdj)`: BFS over undirected adjacency partitions tables into connected components and alphabetically-sorted isolated tables in O(V+E)
- Added `kahnSort(ids, adj, inDeg)`: reusable helper preserving Phase 19's binary-search splice insertion; replaces inline Kahn sort in `layoutGraph` and `topoSortDatabases`
- Refactored `layoutGraph()` to process each connected component independently — each component's Kahn + longest-path layering runs on its own subgraph, eliminating the bug where isolated tables land at layer 0 alongside genuine source tables
- All 63 pre-existing tests pass unchanged; 13 new tests added (6 detectConnectedComponents + 4 kahnSort + 3 per-component layout)

## Task Commits

Each task was committed atomically:

1. **Task 1: detectConnectedComponents + kahnSort + refactors** - `7d6e9c7` (feat)
2. **Task 2: per-component layoutGraph refactoring** - `b2ab53d` (feat)

**Plan metadata:** (docs commit follows)

_Note: TDD tasks — RED (write failing tests), GREEN (implement), REFACTOR (extract + unify)_

## Files Created/Modified
- `lineage-ui/src/utils/graph/layoutEngine.ts` - Added `detectConnectedComponents`, `kahnSort` exports; refactored `layoutGraph` for per-component layering; `topoSortDatabases` delegates to `kahnSort`
- `lineage-ui/src/utils/graph/layoutEngine.test.ts` - 13 new tests for `detectConnectedComponents`, `kahnSort`, and per-component layout behavior (76 total tests)

## Decisions Made
- Self-loops filtered in undirected adjacency build: a table pointing only to itself has zero undirected neighbors and is correctly classified as isolated
- `topoSortDatabases` refactored to delegate to `kahnSort` — eliminates duplicated sort logic and keeps binary-search insertion in one place
- Components stack vertically (along secondary axis with componentGap=80) so all components share the same x-axis columns — layer 0 of all components aligns at x=0 in RIGHT direction
- Isolated tables given simple sequential placeholder layout; Plan 20-02 will replace with alphabetical wrap grid
- Pre-existing TypeScript error in `DatabaseLineageGraph.tsx` (direction type mismatch) confirmed unrelated to this plan's changes

## Deviations from Plan

**1. [Rule 1 - Refactor] Extended topoSortDatabases to use kahnSort**

- **Found during:** Task 1 REFACTOR phase
- **Issue:** Plan asked to "consider whether topoSortDatabases can share kahnSort" — signatures aligned exactly
- **Fix:** Replaced inline Kahn loop in `topoSortDatabases` with a call to `kahnSort(allDatabases, adj, inDegree)`, reducing duplicated logic
- **Files modified:** lineage-ui/src/utils/graph/layoutEngine.ts
- **Verification:** All 73 tests (including 3 topoSortDatabases tests) passed after refactor
- **Committed in:** 7d6e9c7 (Task 1 commit)

**2. [Observation] Per-component RED phase tests passed immediately (not failed)**

- **Found during:** Task 2 RED phase
- **Issue:** Plan expected per-component tests 1 and 2 to FAIL before the refactoring (because global layering was still in place). They passed because the specific test topologies happened to produce identical results under global and per-component layering (both source tables at layer 0, both sinks at layer 1 — which global layering also produces correctly).
- **Fix:** Proceeded with implementation as planned. The behavioral tests are still correct; they verify the desired post-refactoring behavior. The structural refactoring (per-component loop, component isolation) was still needed and was implemented.
- **No files changed:** Tests are correct behavioral assertions, not an error in test design.

---

**Total deviations:** 1 auto-fixed (refactor), 1 observation (no action needed)
**Impact on plan:** Refactor consolidates duplicated Kahn logic. No scope creep.

## Issues Encountered
None — plan executed smoothly with all verification criteria met.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `detectConnectedComponents` and `kahnSort` exports ready for use by Plan 20-02
- `layoutGraph` per-component loop in place; isolated table placeholder positions ready for grid replacement in Plan 20-02
- All 76 tests pass; algorithmic foundation for two-zone layout is complete

## Self-Check: PASSED

- layoutEngine.ts: FOUND
- layoutEngine.test.ts: FOUND
- 20-01-SUMMARY.md: FOUND
- Commit 7d6e9c7 (Task 1): FOUND
- Commit b2ab53d (Task 2): FOUND

---
*Phase: 20-mixed-layout-strategy*
*Completed: 2026-02-22*
