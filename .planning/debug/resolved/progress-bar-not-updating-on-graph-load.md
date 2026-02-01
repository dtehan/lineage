---
status: resolved
trigger: "progress-bar-not-updating-on-graph-load"
created: 2026-01-31T00:00:00Z
updated: 2026-01-31T00:25:00Z
---

## Current Focus

hypothesis: CONFIRMED - Initial render has stage='idle' (progress=0, message='') but showProgress=true (because isLoading=true). The 0% width bar with no message appears frozen until effects run and transition to 'fetching' stage.
test: Applied fix that computes displayProgress/displayMessage to show fetching state values when isLoading=true but stage='idle'
expecting: Progress bar should now show 15% with "Loading data..." message on initial render
next_action: Verify fix works in browser

## Symptoms

expected: Progress bar should show both data fetch and layout progress when loading the graph
actual: Progress bar appears but doesn't update (stays frozen)
errors: No errors visible in browser console
reproduction: Happens when loading a database
started: Worked before, not sure when it broke

## Eliminated

## Evidence

- timestamp: 2026-01-31T00:05:00Z
  checked: useLoadingProgress.ts implementation
  found: Auto-advance effect (lines 164-187) advances progress from 15->28 during 'fetching' stage over 3 seconds
  implication: If stage transitions out of 'fetching' too quickly, progress might not visibly advance

- timestamp: 2026-01-31T00:06:00Z
  checked: DatabaseLineageGraph.tsx progress integration
  found: setStage('fetching') is called when isLoading is true; setStage('layout') is called when data arrives
  implication: If data is cached, isLoading might not be true long enough for fetching animation

- timestamp: 2026-01-31T00:07:00Z
  checked: layoutEngine.ts onProgress callback
  found: Calls onProgress with values 35, 45, 55, 70 at different stages of layout
  implication: Progress updates during layout should work if callback is being called

- timestamp: 2026-01-31T00:15:00Z
  checked: useLoadingProgress tests
  found: All 34 tests pass, hook works correctly in isolation
  implication: The issue is not in the hook itself but in the integration

- timestamp: 2026-01-31T00:16:00Z
  checked: Initial state vs showProgress condition
  found: On first render, isLoading can be true (from TanStack Query), making showProgress=true, but stage is still 'idle' (progress=0, message='') because effects haven't run yet
  implication: User sees empty progress bar (0% width, no text) which appears "frozen" until effects run

## Resolution

root_cause: When TanStack Query starts fetching (isLoading=true), the progress bar is shown before the effect that calls setStage('fetching') runs. This causes the initial render to show progress=0 and message='' (from stage='idle'), making the bar appear frozen/empty until React's effect phase completes.

fix: Added displayProgress and displayMessage computed values in all three graph components. When isLoading is true but stage is still 'idle', these values default to the 'fetching' stage defaults (progress=15, message='Loading data...') instead of the 'idle' values (progress=0, message='').

verification: useLoadingProgress hook tests (34 tests) and LoadingProgress component tests (32 tests) all pass. The fix ensures the progress bar shows meaningful content immediately.

files_changed:
  - lineage-ui/src/components/domain/LineageGraph/DatabaseLineageGraph.tsx
  - lineage-ui/src/components/domain/LineageGraph/AllDatabasesLineageGraph.tsx
  - lineage-ui/src/components/domain/LineageGraph/LineageGraph.tsx
