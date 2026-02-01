---
phase: 18
plan: 02
subsystem: frontend-ux
tags: [progress-ui, large-graph-warning, eta-display, depth-suggestion, user-experience]

dependency_graph:
  requires:
    - 18-01 (benchmark results for thresholds)
  provides:
    - elapsed-time-tracking
    - eta-calculation
    - large-graph-warning-component
    - depth-suggestion-ui
  affects:
    - user-experience-with-large-graphs
    - loading-feedback

tech_stack:
  added: []
  patterns:
    - session-storage-dismissal
    - linear-eta-extrapolation
    - timing-interval-updates

file_tracking:
  created:
    - lineage-ui/src/components/domain/LineageGraph/LargeGraphWarning.tsx
    - lineage-ui/src/components/domain/LineageGraph/LargeGraphWarning.test.tsx
  modified:
    - lineage-ui/src/hooks/useLoadingProgress.ts
    - lineage-ui/src/hooks/useLoadingProgress.test.ts
    - lineage-ui/src/components/common/LoadingProgress.tsx
    - lineage-ui/src/components/common/LoadingProgress.test.tsx
    - lineage-ui/src/components/domain/LineageGraph/LineageGraph.tsx
    - lineage-ui/src/utils/graph/layoutEngine.ts
    - lineage-ui/src/components/domain/LineageGraph/DatabaseLineageGraph.tsx

decisions:
  - id: virtualization-threshold
    choice: Keep onlyRenderVisibleElements threshold at 50 nodes
    reason: Benchmarks show render time scales roughly linearly up to 100 nodes (~14ms), then super-linearly. 50 provides buffer before render becomes noticeable.
  - id: eta-threshold
    choice: Only show ETA after 10% progress
    reason: Prevents wild extrapolation during early progress where estimates would be inaccurate
  - id: large-graph-threshold
    choice: 200 nodes triggers warning
    reason: Per CONTEXT.md specification, warn at 200+ nodes as preventive measure
  - id: depth-suggestion-heuristic
    choice: suggestedDepth = max(3, currentDepth - 2)
    reason: Simple heuristic that typically halves node count, with minimum depth of 3 for usability

metrics:
  duration: 8 min
  completed: 2026-02-01
---

# Phase 18 Plan 02: Large Graph UX Enhancements Summary

Enhanced large graph user experience with ETA progress display, 200+ node warnings, and depth reduction suggestions based on benchmark findings from Plan 01.

## What Was Built

### 1. Enhanced Progress UI with Elapsed Time and ETA

**useLoadingProgress.ts Enhancements:**
- Added `elapsedTime` (ms since loading started)
- Added `estimatedTimeRemaining` (null until 10% progress, then linear extrapolation)
- Added `formatDuration()` helper: formats ms to human-readable strings ("5s", "1m 30s")
- Timer updates elapsed time every 100ms while loading
- Timing clears on reset or completion

**LoadingProgress.tsx Enhancements:**
- New props: `elapsedTime`, `estimatedTimeRemaining`, `showTiming`
- When `showTiming=true`: displays "Elapsed: 5s | ETA: ~10s"
- Uses tilde (~) prefix for ETA to indicate estimate
- Subtle styling (muted color, smaller text than message)
- Responsive text sizes across sm/md/lg variants

### 2. Large Graph Warning Component

**LargeGraphWarning.tsx:**
- Non-blocking amber banner for 200+ node graphs
- Shows node count and message about potential render time
- Depth suggestion when currentDepth > suggestedDepth
- Quick-apply button for depth reduction
- Dismissible with session persistence (sessionStorage)
- Accessible: role="alert", aria-live="polite", labeled buttons

### 3. LineageGraph Integration

- Warning appears between Toolbar and graph area
- Timing shown during layout and rendering stages
- Wired depth suggestion to setMaxDepth from store
- Documented VIRTUALIZATION_THRESHOLD constant (50 nodes)

### 4. Bug Fixes (Auto-applied per Deviation Rules)

**layoutEngine.ts:**
- Fixed `process.env` reference breaking browser builds
- Changed to `import.meta.env?.MODE` for Vite compatibility

**DatabaseLineageGraph.tsx:**
- Removed incomplete/draft code that referenced non-existent hooks
- Fixed unused variable warning

## onlyRenderVisibleElements Threshold Decision

Based on Plan 01 benchmark results:

| Graph Size | Render Time | Operations/sec | vs 50 nodes |
|------------|-------------|----------------|-------------|
| 50 nodes   | 8.5ms       | 118 ops/sec    | baseline    |
| 100 nodes  | 13.9ms      | 72 ops/sec     | 1.65x slower|
| 200 nodes  | 46.2ms      | 22 ops/sec     | 5.46x slower|

**Decision:** Keep threshold at 50 nodes.

**Rationale:**
- Render time is acceptably fast up to ~100 nodes
- Super-linear growth 100->200 nodes justifies virtualization
- 50 provides buffer before render becomes noticeable
- React Flow's virtualization has minimal overhead for small graphs

## UX Flow Summary

```
User loads large graph (200+ nodes)
    │
    ├── During load:
    │     └── Progress bar shows:
    │           "Calculating layout..."
    │           "Elapsed: 3s | ETA: ~5s"
    │
    └── After load:
          └── Warning banner shows:
                "Large graph detected: 250 nodes..."
                "Try reducing depth from 10 to 5..."
                [Use depth 5] [X]
```

## Files Modified

| File | Changes |
|------|---------|
| `useLoadingProgress.ts` | Added elapsedTime, estimatedTimeRemaining, formatDuration |
| `useLoadingProgress.test.ts` | Added timing and ETA tests |
| `LoadingProgress.tsx` | Added timing display with showTiming prop |
| `LoadingProgress.test.tsx` | Added timing display tests |
| `LargeGraphWarning.tsx` | New component |
| `LargeGraphWarning.test.tsx` | New test file |
| `LineageGraph.tsx` | Integrated warning and timing |
| `layoutEngine.ts` | Fixed import.meta.env for Vite |
| `DatabaseLineageGraph.tsx` | Removed incomplete draft code |

## Commits

| Hash | Description |
|------|-------------|
| 0758f51 | Enhance progress UI with elapsed time and ETA |
| 316f554 | Add large graph warning and depth suggestion UX |
| 305f2c4 | Wire enhanced progress and fix build issues |

## Test Results

- All new timing tests pass (34 tests in useLoadingProgress)
- All LoadingProgress tests pass (32 tests)
- All LargeGraphWarning tests pass (17 tests)
- Pre-existing test failures remain (unrelated to this work)
- Production build succeeds
- Benchmarks still run successfully

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed process.env for Vite browser compatibility**
- **Found during:** Task 3 verification
- **Issue:** layoutEngine.ts used `process.env.NODE_ENV` which doesn't exist in browser
- **Fix:** Changed to `import.meta.env?.MODE` for Vite compatibility
- **Files modified:** lineage-ui/src/utils/graph/layoutEngine.ts

**2. [Rule 3 - Blocking] Removed incomplete DatabaseBrowser code**
- **Found during:** Task 3 build verification
- **Issue:** Draft code referenced non-existent hooks (useTables, useColumns)
- **Fix:** Removed unused incomplete components blocking build
- **Files modified:** lineage-ui/src/components/domain/LineageGraph/DatabaseLineageGraph.tsx

## Next Phase Readiness

Phase 18 (Frontend Rendering Performance) is now complete:
- Plan 01: Benchmark suite established
- Plan 02: Large graph UX enhancements complete

The lineage application now provides:
- Clear feedback during large graph loads
- Actionable suggestions for performance improvement
- Non-blocking warnings that inform but don't obstruct
