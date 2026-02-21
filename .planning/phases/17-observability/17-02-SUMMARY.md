---
phase: 17-observability
plan: 02
subsystem: ui
tags: [react, typescript, performance-observability, hooks, testing, vitest]

# Dependency graph
requires:
  - phase: 16-progressive-depth-loading
    provides: ProgressBanner component and isFetchingFullDepth flow in LineageGraph
provides:
  - useLoadingProgress.stageDurations: per-stage ms timing via performance.now()
  - useLoadingProgress.formatMs: sub-second/second display formatter
  - ProgressBanner timing display: shows completed stage times during background fetch
  - LineageGraph post-render summary: "Loaded in: Fetch Xms / Layout Xms / Render Xms"
affects: [future observability phases, any phase using useLoadingProgress or ProgressBanner]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Stage timing via performance.now() ref inside setStage updater function — monotonic, sub-ms precision"
    - "stageDurations accumulated in React state with setStageDurations inside setStageState updater for correct prevStage capture"
    - "formatMs helper for per-stage display distinct from formatDuration (session elapsed time)"
    - "vi.mock with async importOriginal to partially mock modules while preserving real exports"

key-files:
  created: []
  modified:
    - lineage-ui/src/hooks/useLoadingProgress.ts
    - lineage-ui/src/hooks/useLoadingProgress.test.ts
    - lineage-ui/src/components/domain/LineageGraph/ProgressBanner.tsx
    - lineage-ui/src/components/domain/LineageGraph/LineageGraph.tsx
    - lineage-ui/src/components/domain/LineageGraph/LineageGraph.test.tsx

key-decisions:
  - "stageStartTimeRef set inside setStageState updater to access guaranteed-correct prevStage — avoids race with stale closure"
  - "stageDurations uses setStageDurations inside setStageState updater for correct state sequencing"
  - "formatMs is a separate export from formatDuration — formatMs for per-stage (ms/s), formatDuration for total elapsed (s/m)"
  - "ProgressBanner timing text uses joined string for display ('Fetch: 85ms | Layout: 12ms |') not separate spans"
  - "Post-render timing bar shows only when stage=complete AND stageDurations has at least one entry"
  - "Test mock uses vi.mock with async importOriginal to preserve formatMs/LoadingStage exports while mocking the hook"

patterns-established:
  - "performance.now() in useRef for sub-ms timing inside setState updater functions"
  - "Partial<Record<LoadingStage, number>> for optional per-stage accumulation"

# Metrics
duration: 8min
completed: 2026-02-21
---

# Phase 17 Plan 02: Per-stage Timing Display Summary

**Per-stage load timing (fetch/layout/render ms) surfaced to users via ProgressBanner inline display and post-render timing bar using performance.now() tracking in useLoadingProgress**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-21T02:02:46Z
- **Completed:** 2026-02-21T02:10:46Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- useLoadingProgress tracks per-stage durations via stageStartTimeRef and performance.now() inside setStage updater
- formatMs() exported helper formats milliseconds for compact display (85ms / 1.2s)
- ProgressBanner accepts stageDurations prop and shows "Fetch: 85ms | Layout: 12ms | Expanding to full depth..."
- LineageGraph shows post-render "Loaded in: Fetch Xms / Layout Xms / Render Xms" bar after stage=complete
- 10 new unit tests added across useLoadingProgress.test.ts and LineageGraph.test.tsx

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend useLoadingProgress with stageDurations tracking and unit tests** - `1272ab1` (feat)
2. **Task 2: Display per-stage timing in ProgressBanner and post-render timing summary** - `aafcb81` (feat)

**Plan metadata:** `(pending)` (docs: complete plan)

## Files Created/Modified
- `lineage-ui/src/hooks/useLoadingProgress.ts` - Added stageStartTimeRef, stageDurations state, formatMs export, stageDurations accumulation in setStage, reset clears stageDurations
- `lineage-ui/src/hooks/useLoadingProgress.test.ts` - Added formatMs tests and 6 stageDurations tests (empty start, fetching duration, layout duration, accumulates all stages, clears on reset)
- `lineage-ui/src/components/domain/LineageGraph/ProgressBanner.tsx` - Added stageDurations prop, STAGE_LABELS map, timing text display before message, aria-label for accessibility
- `lineage-ui/src/components/domain/LineageGraph/LineageGraph.tsx` - Destructures stageDurations from useLoadingProgress, passes to ProgressBanner, adds post-render timing summary block
- `lineage-ui/src/components/domain/LineageGraph/LineageGraph.test.tsx` - Added useLoadingProgress mock via vi.mock+importOriginal, defaultLoadingProgressResult, 3 new timing tests

## Decisions Made
- stageStartTimeRef is set inside the setStageState updater function to capture correct prevStage — the React state updater runs with guaranteed correct previous state, avoiding stale closures
- stageDurations accumulated via setStageDurations inside setStageState updater for correct batching
- formatMs is a separate export from the existing formatDuration — formatDuration handles session-level elapsed time (returns "<1s", "5s", "2m 5s"), formatMs handles per-stage display (returns "85ms", "1.2s")
- ProgressBanner timing combines stages into one span with " | " separators for clean display
- Post-render timing bar rendered after ProgressBanner and before graph view, only when stage=complete and stageDurations non-empty
- LineageGraph.test.tsx uses `vi.mock(module, async importOriginal => ...)` pattern to preserve real exports (formatMs, LoadingStage type) while mocking only the hook function

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Test "ProgressBanner shows stage durations during full-depth fetch" initially used `getByText(/Fetch/)` which matched both the ProgressBanner timing span and the post-render timing summary simultaneously (both visible with `stage: 'complete'` and non-empty `stageDurations`). Fixed by matching the combined "Fetch: 85ms | Layout: 12ms" string which is unique to the ProgressBanner timing span.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Per-stage timing now visible to users in two places: inline during background fetch and as a post-render summary bar
- OBS-03 objective complete: users and developers can see where time is spent during graph load
- Ready for Phase 17 Plan 03 (if any) or Phase 18

---
*Phase: 17-observability*
*Completed: 2026-02-21*

## Self-Check: PASSED

- FOUND: lineage-ui/src/hooks/useLoadingProgress.ts
- FOUND: lineage-ui/src/hooks/useLoadingProgress.test.ts
- FOUND: lineage-ui/src/components/domain/LineageGraph/ProgressBanner.tsx
- FOUND: lineage-ui/src/components/domain/LineageGraph/LineageGraph.tsx
- FOUND: lineage-ui/src/components/domain/LineageGraph/LineageGraph.test.tsx
- FOUND: .planning/phases/17-observability/17-02-SUMMARY.md
- FOUND commit 1272ab1: feat(17-02): extend useLoadingProgress with stageDurations and formatMs
- FOUND commit aafcb81: feat(17-02): display per-stage timing in ProgressBanner and post-render summary
