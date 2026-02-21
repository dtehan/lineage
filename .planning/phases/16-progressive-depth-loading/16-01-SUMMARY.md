---
phase: 16-progressive-depth-loading
plan: 01
subsystem: ui
tags: [react, tanstack-query, zustand, hooks, progressive-loading]

# Dependency graph
requires: []
provides:
  - useProgressiveLineage hook that fires depth-1 immediately and full-depth after depth-1 resolves
  - appendGraph Zustand action that merges nodes/edges by ID without duplicates
affects: [16-02-progressive-depth-wiring, LineageGraph]

# Tech tracking
tech-stack:
  added: []
  patterns: [two-stage enabled chaining with TanStack Query, ID-based deduplication in Zustand set()]

key-files:
  created:
    - lineage-ui/src/api/hooks/useOpenLineage.test.ts
  modified:
    - lineage-ui/src/api/hooks/useOpenLineage.ts
    - lineage-ui/src/stores/useLineageStore.ts
    - lineage-ui/src/stores/useLineageStore.test.ts

key-decisions:
  - "useProgressiveLineage uses TanStack Query enabled chaining (enabled: isEnabled && !!depth1Query.data && maxDepth > 1) — no custom state machine required"
  - "When maxDepth=1, fullDepthQuery shares the same cache key as depth1Query so TanStack serves cached data, but no second network request fires (enabled guard prevents fetch)"
  - "appendGraph uses Set-based deduplication over existing IDs for O(n) merge with existing-first ordering"

patterns-established:
  - "Two-stage query chaining pattern: depth1Query.data as gate for enabled on fullDepthQuery"
  - "appendGraph as the canonical way to incrementally extend the graph store without duplicates"

# Metrics
duration: 3min
completed: 2026-02-21
---

# Phase 16 Plan 01: Progressive Lineage Data Layer Summary

**useProgressiveLineage TanStack Query hook with two-stage enabled chaining plus Zustand appendGraph merge action — 9 hook tests and 4 store tests all green**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-21T01:29:42Z
- **Completed:** 2026-02-21T01:32:44Z
- **Tasks:** 1
- **Files modified:** 4

## Accomplishments
- `useProgressiveLineage` hook exported from `useOpenLineage.ts` — depth-1 fires immediately; full-depth fires only when `depth1Query.data` resolves and `maxDepth > 1`
- `appendGraph` action added to `useLineageStore` — merges new nodes/edges without duplicating existing IDs, preserves existing-first order
- Created `useOpenLineage.test.ts` with 9 tests covering all progressive lifecycle cases (immediate load, disabled until ready, sequential fire, maxDepth=1 single-call, error propagation, isFetchingFullDepth flag, disabled via option)
- Added 4 `appendGraph` tests to `useLineageStore.test.ts` (add, deduplicate, empty state, order preservation)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add useProgressiveLineage hook and appendGraph store action with tests** - `689aa12` (feat)

**Plan metadata:** _(to be committed with this summary)_

## Files Created/Modified
- `lineage-ui/src/api/hooks/useOpenLineage.ts` - Added `useProgressiveLineage` hook at bottom of file
- `lineage-ui/src/api/hooks/useOpenLineage.test.ts` - New file: 9 tests for useProgressiveLineage using vi.spyOn pattern
- `lineage-ui/src/stores/useLineageStore.ts` - Added `appendGraph` to LineageState interface and implementation
- `lineage-ui/src/stores/useLineageStore.test.ts` - Added 4 appendGraph test cases in new describe block

## Decisions Made
- `useProgressiveLineage` uses TanStack Query's native `enabled` dependency chaining rather than a custom state machine — simpler and idiomatic
- When `maxDepth=1`, the full-depth query shares the same cache key as depth-1, so TanStack Query returns cached data without a second network request (the `enabled: maxDepth > 1` guard prevents the fetch)
- `appendGraph` uses `Set` for O(n) deduplication rather than `find()` for O(n^2) — important for large graphs

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed incorrect test assertion for TC-PROG-004 (maxDepth=1 case)**
- **Found during:** Task 1 (test execution)
- **Issue:** Test asserted `fullDepthQuery.data` would be `undefined` when `maxDepth=1`, but TanStack Query serves cached data for the full-depth query because it shares the same cache key as depth-1 (both use `maxDepth: 1` in the query key). The hook behavior is correct (no second network request), but the assertion was wrong.
- **Fix:** Removed the `toBeUndefined()` assertion (which tested cache internals, not hook contract) and added a comment explaining the cache-sharing behavior. The `getLineageGraphSpy` called-once assertion still verifies no second network request occurs.
- **Files modified:** lineage-ui/src/api/hooks/useOpenLineage.test.ts
- **Verification:** All 9 tests pass after fix
- **Committed in:** 689aa12 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - incorrect test assertion)
**Impact on plan:** Minor test correction. Hook implementation is exactly as specified. No scope creep.

## Issues Encountered
None beyond the test assertion correction documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `useProgressiveLineage` hook ready for consumption by `LineageGraph.tsx` in Plan 16-02
- `appendGraph` action ready for Plan 16-02's incremental graph update logic
- No blockers

## Self-Check: PASSED

All expected files found. Task commit 689aa12 verified in git log.

---
*Phase: 16-progressive-depth-loading*
*Completed: 2026-02-21*
