---
phase: 16-progressive-depth-loading
plan: 02
subsystem: ui
tags: [react, tanstack-query, progressive-loading, react-flow, vitest]

# Dependency graph
requires:
  - phase: 16-01
    provides: useProgressiveLineage hook and appendGraph store action
provides:
  - LineageGraph.tsx wired to useProgressiveLineage for two-stage column lineage loading
  - ProgressBanner component for inline background-fetch indicator
  - 6 new progressive loading tests including the spinner-dismissal-on-depth-1 blocker fix test
affects: [end-users, LineageGraph, useProgressiveLineage]

# Tech tracking
tech-stack:
  added: []
  patterns: [two-pass layout on depth-1 then full-depth data, ProgressBanner inline banner pattern]

key-files:
  created:
    - lineage-ui/src/components/domain/LineageGraph/ProgressBanner.tsx
  modified:
    - lineage-ui/src/components/domain/LineageGraph/LineageGraph.tsx
    - lineage-ui/src/components/domain/LineageGraph/LineageGraph.test.tsx

key-decisions:
  - "columnData = isFullDepthReady ? columnFinalData : (isDepth1Ready ? depth1Query.data : null) — returns depth-1 data immediately so spinner dismisses and layout fires on depth-1, not full-depth"
  - "ProgressBanner placed below the showProgress early-return — only reachable when spinner is dismissed (depth-1 laid out and visible)"
  - "getByText used in ProgressBanner test (not getByRole with name) — role=status accessible name requires aria-label, not derived from text content"

patterns-established:
  - "Two-pass layout: depth-1 triggers first layout immediately, full-depth arrival triggers second layout via data reference change in useEffect dependency"
  - "Inline progress banner pattern: ProgressBanner renders conditionally between Toolbar and graph, never blocks graph rendering"

# Metrics
duration: 5min
completed: 2026-02-21
---

# Phase 16 Plan 02: Progressive Depth Loading Wiring Summary

**useProgressiveLineage wired into LineageGraph with two-pass layout (depth-1 then full-depth) and inline ProgressBanner — spinner dismisses on depth-1 arrival, 6 new tests including the blocker-fix test all green**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-02-21T01:34:52Z
- **Completed:** 2026-02-21T01:39:41Z
- **Tasks:** 2
- **Files modified:** 3 (1 created + 2 modified)

## Accomplishments
- `LineageGraph.tsx` now uses `useProgressiveLineage` for column lineage (depth-1 fires immediately, full-depth fires in background)
- Two-pass layout: `data` derives from `depth1Query.data` as soon as depth-1 resolves — layout fires on depth-1 data first, then re-fires when full-depth arrives via `data` reference change in the useEffect
- Full-screen spinner dismisses when depth-1 resolves (not waiting for full-depth) — the blocker fix from the revised plan
- `ProgressBanner` component created: thin inline banner with spinner icon, shown between Toolbar and graph during background full-depth fetch
- 6 new progressive loading tests: spinner during depth-1, spinner dismissal on depth-1 (KEY blocker-fix test), ProgressBanner visible during background fetch, no banner for table lineage, layout fires on depth-1, layout re-fires on full-depth arrival

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire useProgressiveLineage into LineageGraph and create ProgressBanner** - `30a8ac3` (feat)
2. **Task 2: Update LineageGraph tests for progressive loading** - `d5b2f8e` (feat)

**Plan metadata:** _(to be committed with this summary)_

## Files Created/Modified
- `lineage-ui/src/components/domain/LineageGraph/ProgressBanner.tsx` - New inline progress banner component with `role="status"`, `aria-live="polite"`, spinning SVG indicator, and configurable message/visible props
- `lineage-ui/src/components/domain/LineageGraph/LineageGraph.tsx` - Replaced `useOpenLineageGraph` with `useProgressiveLineage`; added `columnData` derivation for two-stage data; added `ProgressBanner` render below the `showProgress` early-return; updated `handleRefresh` to invalidate depth-1 cache when `maxDepth > 1`
- `lineage-ui/src/components/domain/LineageGraph/LineageGraph.test.tsx` - Switched mock from `useOpenLineageGraph` to `useProgressiveLineage`; added `defaultProgressiveResult` helper; added 6 Progressive Depth Loading tests

## Decisions Made
- `columnData` returns `depth1Query.data` immediately when `isDepth1Ready && !isFullDepthReady` — this is the critical fix that dismisses the spinner on depth-1 arrival rather than waiting for full-depth
- ProgressBanner placed after the `if (showProgress)` early return — guarantees the banner is only reachable when the spinner is dismissed and depth-1 graph is rendered
- Test assertion for ProgressBanner uses `getByText` not `getByRole('status', { name: ... })` — the `role="status"` accessible name requires `aria-label`, and text content alone does not contribute to accessible name computation

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed ProgressBanner test accessible name query**
- **Found during:** Task 2 (test execution)
- **Issue:** Test asserted `getByRole('status', { name: /expanding to full depth/i })` but `role="status"` accessible name is not derived from text content — it requires `aria-label` attribute. The assertion was wrong; the component renders correctly.
- **Fix:** Changed test assertion to `getByText(/Expanding to full depth/i)` which correctly finds the text content
- **Files modified:** lineage-ui/src/components/domain/LineageGraph/LineageGraph.test.tsx
- **Verification:** All 24 tests pass after fix
- **Committed in:** d5b2f8e (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - incorrect test assertion for accessible name)
**Impact on plan:** Minor test assertion correction. Component implementation is exactly as specified. No scope creep.

## Issues Encountered
None beyond the test assertion correction documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Progressive depth loading is fully wired end-to-end: clicking a column fires depth-1 immediately, shows graph within ~200ms (spinner during initial fetch only), then auto-expands to full depth with inline ProgressBanner
- Phase 16 is complete — both plans executed successfully
- No blockers

## Self-Check: PASSED

All expected files verified:
- `lineage-ui/src/components/domain/LineageGraph/ProgressBanner.tsx` — FOUND (created)
- `lineage-ui/src/components/domain/LineageGraph/LineageGraph.tsx` — FOUND (modified)
- `lineage-ui/src/components/domain/LineageGraph/LineageGraph.test.tsx` — FOUND (modified)
- Commit `30a8ac3` — FOUND in git log
- Commit `d5b2f8e` — FOUND in git log

---
*Phase: 16-progressive-depth-loading*
*Completed: 2026-02-21*
