---
phase: 11-sort-columns-alphabetically-in-lineage-graph-nodes
plan: 01
subsystem: ui
tags: [react, typescript, react-flow, elkjs, layout, sorting]

# Dependency graph
requires:
  - phase: 10-view-lineage-show-data-flow-through-views-to-source-tables
    provides: lineage graph components (LineageGraph, DatabaseLineageGraph, AllDatabasesLineageGraph) and layoutEngine
provides:
  - Alphabetical column sorting in layoutEngine.ts transformToTableNodes
  - Alphabetical column sorting in DetailPanel across all three graph components
  - Unit tests proving alphabetical sort correctness

affects: [any future phase touching layoutEngine, TableNode, DetailPanel]

# Tech tracking
tech-stack:
  added: []
  patterns: [localeCompare alphabetical sort on ColumnDefinition.name and ColumnDetail.columnName]

key-files:
  created: []
  modified:
    - lineage-ui/src/utils/graph/layoutEngine.ts
    - lineage-ui/src/utils/graph/layoutEngine.test.ts
    - lineage-ui/src/components/domain/LineageGraph/LineageGraph.tsx
    - lineage-ui/src/components/domain/LineageGraph/DatabaseLineageGraph.tsx
    - lineage-ui/src/components/domain/LineageGraph/AllDatabasesLineageGraph.tsx

key-decisions:
  - "Sort applied after .map() in transformToTableNodes so original columnNodes array is not mutated"
  - "Sort happens before createElkPorts so ELK port indices automatically match sorted display order"
  - "DetailPanel sort uses columnName field (ColumnDetail type) vs layoutEngine sort using name field (ColumnDefinition type)"

patterns-established:
  - "Column sort pattern: .sort((a, b) => a.name.localeCompare(b.name)) in layoutEngine"
  - "DetailPanel sort pattern: getTableColumns(id).sort((a, b) => a.columnName.localeCompare(b.columnName))"

# Metrics
duration: ~2min
completed: 2026-02-19
---

# Phase 11 Plan 01: Sort Columns Alphabetically in Lineage Graph Nodes Summary

**Alphabetical column sort via localeCompare in layoutEngine.ts transformToTableNodes and in DetailPanel across all three graph components, with 3 new unit tests — human verified**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-02-19T00:49:20Z
- **Completed:** 2026-02-19 (human verification approved)
- **Tasks:** 2 of 2 complete
- **Files modified:** 5

## Accomplishments
- Added `.sort((a, b) => a.name.localeCompare(b.name))` after `.map()` in `transformToTableNodes` in layoutEngine.ts — columns are sorted before `createElkPorts` consumes them so ELK port indices match sorted display order automatically
- Added `.sort((a, b) => a.columnName.localeCompare(b.columnName))` to `getTableColumns(selectedAssetId)` in LineageGraph.tsx, DatabaseLineageGraph.tsx, and AllDatabasesLineageGraph.tsx DetailPanel blocks
- Added 3 new unit tests in layoutEngine.test.ts: basic alphabetical sort, case-insensitive sort, and per-table independent sort
- 546 tests pass (3 more than before — the 3 new sort tests); 32 pre-existing failures unchanged (accessibility + component tests unrelated to this change)
- Human verified: columns display alphabetically in graph nodes and DetailPanel, edges connect to correct rows

## Task Commits

Each task was committed atomically:

1. **Task 1: Add alphabetical column sorting to layoutEngine and all graph components** - `1266dd1` (feat)
2. **Task 2: Verify alphabetical column sorting in lineage graph** - human-verified (checkpoint:human-verify approved)

**Plan metadata:** (see final docs commit)

## Files Created/Modified
- `lineage-ui/src/utils/graph/layoutEngine.ts` - Added `.sort((a, b) => a.name.localeCompare(b.name))` after `.map()` in `transformToTableNodes` (line 197)
- `lineage-ui/src/utils/graph/layoutEngine.test.ts` - Added `describe('column sorting')` block with 3 tests
- `lineage-ui/src/components/domain/LineageGraph/LineageGraph.tsx` - Added sort to `getTableColumns(selectedAssetId)` in `selectedColumns` block (line 576)
- `lineage-ui/src/components/domain/LineageGraph/DatabaseLineageGraph.tsx` - Same pattern (line 411)
- `lineage-ui/src/components/domain/LineageGraph/AllDatabasesLineageGraph.tsx` - Same pattern (line 464)

## Decisions Made
- Sort applied after `.map()` — creates a new array, so original `columnNodes` is not mutated
- Sort placed before `createElkPorts` is called in `layoutGraph` so ELK port indices automatically align with sorted display order
- `ColumnDetail.columnName` (not `name`) used for DetailPanel sorts — consistent with the existing type definition

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. Pre-existing test failures (32 in accessibility.test.tsx, AssetBrowser.test.tsx, LineageGraph.test.tsx, DatabaseLineageGraph.test.tsx, AllDatabasesLineageGraph.test.tsx) were confirmed to exist before this change by running tests on the stashed baseline.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Phase 11 is fully complete. This is the final planned phase in the roadmap.

All planned features delivered:
- Column-level lineage graph with alphabetical sorting
- View lineage extraction via SQLGlot
- Wildcard column expansion
- Complete OpenLineage schema with recursive CTE traversal

## Self-Check: PASSED

All files verified present:
- FOUND: lineage-ui/src/utils/graph/layoutEngine.ts
- FOUND: lineage-ui/src/utils/graph/layoutEngine.test.ts
- FOUND: lineage-ui/src/components/domain/LineageGraph/LineageGraph.tsx
- FOUND: lineage-ui/src/components/domain/LineageGraph/DatabaseLineageGraph.tsx
- FOUND: lineage-ui/src/components/domain/LineageGraph/AllDatabasesLineageGraph.tsx

All commits verified present:
- FOUND: 1266dd1 (feat: sort columns alphabetically)
- FOUND: 87ccf19 (docs: partial summary at checkpoint)

---
*Phase: 11-sort-columns-alphabetically-in-lineage-graph-nodes*
*Completed: 2026-02-19*
