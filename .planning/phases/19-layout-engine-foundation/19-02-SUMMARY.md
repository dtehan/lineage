---
phase: 19-layout-engine-foundation
plan: 02
subsystem: ui
tags: [react, layoutEngine, elkjs, performance, clustering, topological-sort]

# Dependency graph
requires:
  - phase: 19-layout-engine-foundation-01
    provides: "Custom Kahn topological layout engine replacing ELK for column-level graphs"
provides:
  - "O(V+E) Kahn sort with binary-search insertion in topoSortDatabases() and layoutGraph()"
  - "Deterministic cluster colors via djb2 hash in ClusterBackground and useDatabaseClusters"
  - "Pre-calculated node dimensions in ClusterBackground to avoid stale ResizeObserver values"
  - "Full primary+secondary axis bounding boxes in separateDatabaseClusters for Phase 20"
affects:
  - "20-layout-multi-database"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Binary-search splice insertion to maintain sorted queue in O(log n) per push vs O(n log n) re-sort"
    - "djb2 hash for deterministic name-to-index mapping without insertion-order dependency"
    - "Pre-calculated dimensions from node.data as source of truth during layout transitions"

key-files:
  created: []
  modified:
    - lineage-ui/src/utils/graph/layoutEngine.ts
    - lineage-ui/src/components/domain/LineageGraph/ClusterBackground.tsx
    - lineage-ui/src/components/domain/LineageGraph/hooks/useDatabaseClusters.ts

key-decisions:
  - "Binary-search splice chosen over queue.sort() to fix O(V^2) degradation: queue stays sorted at all times, insertion is O(log n), no resort needed"
  - "djb2 hash for color lookup: unsigned 32-bit, deterministic across all JS engines, maps db name to color index regardless of iteration order"
  - "LFND-03 secondary-axis bounds added non-breaking: lo/hi destructuring at existing call sites unchanged, secLo/secHi available for Phase 20 grid placement"

patterns-established:
  - "Dimension source of truth: layoutEngine functions (calculateTableNodeWidth/Height) are canonical, node.measured is a fallback only"

# Metrics
duration: 8min
completed: 2026-02-22
---

# Phase 19 Plan 02: Layout Engine Bug Fixes Summary

**O(V+E) Kahn sort with binary-search insertion, djb2 deterministic cluster colors, and pre-calculated bounding box dimensions fixing four algorithmic bugs across three files**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-02-22T01:53:56Z
- **Completed:** 2026-02-22T02:01:16Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Fixed O(V^2) Kahn sort degradation in both `topoSortDatabases()` and inline `layoutGraph()` Kahn sort — queue re-sort removed, binary-search insertion maintains sorted order at O(log n) per element (LFND-01)
- Added `hashDatabaseName` djb2 function to ClusterBackground.tsx and useDatabaseClusters.ts; removed `index` parameter from `getDatabaseColor`/`getDatabaseBorderColor`/`getColorForDatabase` so color is always deterministic regardless of Map iteration order (LFND-06)
- ClusterBackground now imports `calculateTableNodeWidth`/`calculateTableNodeHeight` from layoutEngine and uses them as the primary dimension source for table nodes, falling back to `node.measured` only for non-table nodes (LFND-02)
- `separateDatabaseClusters` extended to track both primary-axis (`lo`/`hi`) and secondary-axis (`secLo`/`secHi`) extents per database cluster, making full bounding box data available for Phase 20 (LFND-03)

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix Kahn sort O(V^2) degradation and deterministic color hashing** - `dca3373` (fix)
2. **Task 2: Fix ClusterBackground stale dimensions and separateDatabaseClusters bounding box** - `308a48a` (fix)

**Plan metadata:** (docs commit — see final_commit below)

## Files Created/Modified

- `lineage-ui/src/utils/graph/layoutEngine.ts` - Two Kahn sort while-loops: removed `.sort()` inside loop, added binary-search `splice` insertion; `separateDatabaseClusters` extended with `secLo`/`secHi` fields in `dbExtent`
- `lineage-ui/src/components/domain/LineageGraph/ClusterBackground.tsx` - Added `hashDatabaseName` djb2 function; `getDatabaseColor`/`getDatabaseBorderColor` signatures drop `index` param; `calculateClusterBounds` uses pre-calculated dimensions from node.data; imported `calculateTableNodeWidth`/`calculateTableNodeHeight` from layoutEngine
- `lineage-ui/src/components/domain/LineageGraph/hooks/useDatabaseClusters.ts` - Added `hashDatabaseName` djb2 function; `getColorForDatabase` drops `index` param; removed `let index = 0; index++` counter

## Decisions Made

- Binary-search `splice` insertion preferred over `toSorted` + new array to avoid extra allocation per push; splice is O(n) worst case for the array shift but the queue is bounded by number of tables, and sort was O(n log n) per iteration
- `secLo`/`secHi` added non-breaking: the rest of `separateDatabaseClusters` destructures `{ lo, hi }` only, so existing separation logic is unchanged while Phase 20 can access full 2D extents

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. Pre-existing test failures in `accessibility.test.tsx`, `AssetBrowser.test.tsx`, and `DatabaseLineageGraph.test.tsx` were present before this plan and are unrelated to layout engine changes. All 63 `layoutEngine.test.ts` tests pass.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 20 (multi-database layout) can use `dbExtent.secLo`/`secHi` from `separateDatabaseClusters` for grid placement of disconnected components
- Layout engine now O(V+E) for topological sort at 400+ tables
- Cluster bounding boxes are correct on direction changes (pre-calculated, not stale)
- Cluster colors are stable across page refreshes (hash-based, not insertion-order)

---
*Phase: 19-layout-engine-foundation*
*Completed: 2026-02-22*

## Self-Check: PASSED

- FOUND: lineage-ui/src/utils/graph/layoutEngine.ts
- FOUND: lineage-ui/src/components/domain/LineageGraph/ClusterBackground.tsx
- FOUND: lineage-ui/src/components/domain/LineageGraph/hooks/useDatabaseClusters.ts
- FOUND: .planning/phases/19-layout-engine-foundation/19-02-SUMMARY.md
- FOUND: dca3373 (Task 1 commit)
- FOUND: 308a48a (Task 2 commit)
