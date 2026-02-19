---
phase: 12-prevent-database-cluster-overlap-in-lineage-graph-visualization
plan: 01
subsystem: ui
tags: [elkjs, react-flow, layout, graph, partitioning, clustering, topological-sort]

# Dependency graph
requires:
  - phase: 11-sort-columns-alphabetically-in-lineage-graph-nodes
    provides: sorted column layout in layoutEngine.ts used as foundation for this phase

provides:
  - ELK partitioning on flat-layout path for spatial database separation in cross-database graphs
  - post-layout separateDatabaseClusters() function guaranteeing non-overlapping padded bounding boxes
  - topoSortDatabases() ordering databases by lineage flow direction (upstream left, downstream right)
  - Increased ClusterBackground padding (20 -> 60) providing visible gap between cluster boxes
  - 11 new unit tests: 4 for cross-database spatial separation, 4 for separateDatabaseClusters(), 3 for topoSortDatabases()

affects:
  - lineage graph visualization
  - ClusterBackground rendering
  - layoutEngine flat-layout path

# Tech tracking
tech-stack:
  added: []
  patterns:
    - ELK partitioning.activate + partitioning.partition properties on flat-layout nodes for structural separation
    - Post-layout separateDatabaseClusters() measures actual bounding boxes and shifts groups to eliminate overlap
    - topoSortDatabases() uses Kahn's algorithm with alphabetical tie-breaking for deterministic lineage-flow ordering
    - Upstream databases (no incoming cross-db edges) assigned lower partition indices and placed LEFT

key-files:
  created:
    - .planning/phases/12-prevent-database-cluster-overlap-in-lineage-graph-visualization/12-01-SUMMARY.md
  modified:
    - lineage-ui/src/utils/graph/layoutEngine.ts
    - lineage-ui/src/components/domain/LineageGraph/ClusterBackground.tsx
    - lineage-ui/src/utils/graph/layoutEngine.test.ts

key-decisions:
  - "ELK partitioning used on flat-layout path only (hasCrossDatabaseEdges=true branch); compound-node path unchanged"
  - "Post-layout separateDatabaseClusters() added because ELK partitioning controls layer ordering but cannot guarantee padded bounding boxes won't overlap when databases share the same y-range"
  - "topoSortDatabases() replaces alphabetical partition assignment to order databases by actual lineage flow (upstream left, downstream right)"
  - "Kahn's algorithm with alphabetical tie-breaking ensures deterministic partition order for testability"
  - "separateDatabaseClusters() accepts explicit dbOrder parameter to enforce lineage-flow ordering in the post-layout shift step"
  - "ClusterBackground default padding increased from 20 to 60 flow units for visible gaps between clusters"

patterns-established:
  - "Flat-layout ELK nodes carry partitioning.partition property (String index) for database-level grouping"
  - "elk.partitioning.activate: 'true' on root graph enables the partition separation"
  - "Post-layout bounding box measurement + axis shift is the reliable pattern for guaranteed non-overlap when ELK cannot fully enforce spatial separation"
  - "Topological sort of data-flow graph nodes produces correct left-to-right visual ordering for lineage"

# Metrics
duration: ~25min
completed: 2026-02-19
---

# Phase 12 Plan 01: Prevent Database Cluster Overlap Summary

**ELK partitioning + post-layout separateDatabaseClusters() with topological database ordering ensures cross-database lineage graphs show non-overlapping cluster boxes with upstream databases on the left and downstream on the right**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-02-19T21:36:34Z
- **Completed:** 2026-02-19T22:05:00Z
- **Tasks:** 3/3 (human verification approved)
- **Files modified:** 3

## Accomplishments

- Added `topoSortDatabases()` using Kahn's algorithm to order databases by lineage flow direction so upstream databases (no incoming cross-db edges) are placed LEFT and downstream databases are placed RIGHT
- Added database partition map and `partitioning.partition` property to each flat-layout `elkTableNode`, with `elk.partitioning.activate: 'true'` on root elkGraph
- Added `separateDatabaseClusters()` post-layout function that measures actual padded bounding boxes and shifts database groups along the primary axis to guarantee non-overlap
- Increased `ClusterBackground` default `padding` prop from 20 to 60 flow units
- Added 11 new unit tests: 4 for cross-database spatial separation, 4 for `separateDatabaseClusters()`, and 3 for `topoSortDatabases()`
- Human verified: cluster boxes are non-overlapping, lineage flows left-to-right across database boundaries for all database views

## Task Commits

Each task was committed atomically:

1. **Task 1: Add ELK partitioning to flat-layout path and increase ClusterBackground padding** - `0b1f45e` (feat)
2. **Task 2: Add unit tests for cross-database partition separation** - `3c7d5c1` (test)
3. **Fix: Replace ELK-only approach with post-layout cluster separation** - `adc26fa` (fix)
4. **Fix: Order database clusters by lineage flow direction** - `858566b` (fix)
5. **Final: Combined three-part fix re-committed after revert** - `2e0bd3d` (feat)
6. **Task 3: Human visual verification** - approved (no code commit required)

**Plan metadata:** `docs(12-01)` commit (this summary)

## Files Created/Modified

- `lineage-ui/src/utils/graph/layoutEngine.ts` - Added `topoSortDatabases()`, partition map, `partitioning.partition` per elkTableNode, `elk.partitioning.activate`, and `separateDatabaseClusters()` function (flat-layout path only)
- `lineage-ui/src/components/domain/LineageGraph/ClusterBackground.tsx` - Changed default `padding` prop from 20 to 60
- `lineage-ui/src/utils/graph/layoutEngine.test.ts` - Added `cross-database cluster separation` describe block (4 tests), `separateDatabaseClusters` tests (4), `topoSortDatabases` tests (3)

## Decisions Made

- ELK partitioning applied only to the `hasCrossDatabaseEdges === true` flat-layout branch; compound-node path is completely unchanged
- Post-layout `separateDatabaseClusters()` was needed because ELK partitioning controls layer ordering but cannot guarantee padded bounding boxes won't overlap when databases share the same y-range — bounding box measurement + axis shifting is the reliable guarantee
- `topoSortDatabases()` replaces alphabetical partition assignment because users expect upstream (source) databases on the left and downstream (target) databases on the right, matching the natural direction of lineage flow
- Kahn's algorithm with alphabetical tie-breaking ensures deterministic ordering suitable for unit tests
- `separateDatabaseClusters()` accepts an explicit `dbOrder` parameter so both ELK partition assignment and the post-layout shift step enforce the same lineage-flow order

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] ELK partitioning alone insufficient to prevent bounding box overlap**
- **Found during:** Post-Task 2 visual testing (before Task 3 checkpoint)
- **Issue:** ELK partitioning controls layer assignment but cannot guarantee padded bounding boxes won't visually overlap when two databases have tables at similar y-positions within their respective layers. The original plan stated "Do NOT add any post-layout overlap detection/correction. ELK partitioning handles the structural separation" — this assumption proved incorrect.
- **Fix:** Added `separateDatabaseClusters()` which measures each database's actual padded bounding box extent after layout and shifts groups along the primary axis so boxes are strictly non-overlapping
- **Files modified:** `lineage-ui/src/utils/graph/layoutEngine.ts`, `lineage-ui/src/utils/graph/layoutEngine.test.ts`
- **Verification:** 4 new unit tests pass; human verified no overlap in running application
- **Committed in:** `adc26fa` (then `2e0bd3d` as final combined commit)

**2. [Rule 1 - Bug] Alphabetical partition order placed databases incorrectly relative to lineage flow**
- **Found during:** Same post-Task 2 testing session
- **Issue:** Alphabetical partition ordering placed databases left-to-right by name regardless of data flow direction. Users expect upstream (source) databases on the left and downstream (target) databases on the right to match lineage visualization conventions.
- **Fix:** Added `topoSortDatabases()` using Kahn's algorithm on cross-database edge graph, replacing alphabetical sort for partition assignment. Both ELK partition indices and `separateDatabaseClusters()` dbOrder parameter now use topological order.
- **Files modified:** `lineage-ui/src/utils/graph/layoutEngine.ts`, `lineage-ui/src/utils/graph/layoutEngine.test.ts`
- **Verification:** 3 new unit tests pass; human verified lineage flows left-to-right in running application
- **Committed in:** `858566b` (then `2e0bd3d` as final combined commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 bugs discovered during integration testing before human verify checkpoint)
**Impact on plan:** Both fixes were necessary for the feature to work correctly. The plan's "no post-layout correction needed" assumption was invalidated by actual ELK behavior. No scope creep — fixes directly address the plan's stated goal of non-overlapping cluster boxes.

## Issues Encountered

- ELK's `partitioning.activate` controls layer order but padded ClusterBackground boxes can still overlap if tables from different databases share the same y-range within their respective partitions. Post-layout bounding box measurement and axis shifting was required as the reliable solution.
- Implementation was temporarily reverted mid-session while a cleaner combined commit approach was used. Final state in `2e0bd3d` is the canonical implementation.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 12 complete. All 12 phases of the roadmap are now done.
- The lineage graph now correctly visualizes cross-database lineage with non-overlapping, left-to-right ordered cluster boxes
- No known blockers or concerns

## Self-Check: PASSED

- `lineage-ui/src/utils/graph/layoutEngine.ts` - FOUND: contains `topoSortDatabases`, `separateDatabaseClusters`, `partitioning.activate`
- `lineage-ui/src/components/domain/LineageGraph/ClusterBackground.tsx` - FOUND: contains `padding = 60`
- `lineage-ui/src/utils/graph/layoutEngine.test.ts` - FOUND: contains cross-database cluster separation tests
- Final commit `2e0bd3d` - FOUND in git log

---
*Phase: 12-prevent-database-cluster-overlap-in-lineage-graph-visualization*
*Completed: 2026-02-19*
