---
phase: 14-viewport-and-space-optimization
plan: 01
subsystem: ui
tags: [react-flow, elkjs, layout, graph-visualization]

# Dependency graph
requires:
  - phase: 05-layout-infrastructure
    provides: ELK.js layout engine with table grouping
provides:
  - Compact ELK layout configuration with 40px node spacing and 100px layer spacing
affects: [14-02-viewport-focus]

# Tech tracking
tech-stack:
  added: []
  patterns: [compact-layout-defaults]

key-files:
  created: []
  modified:
    - lineage-ui/src/utils/graph/layoutEngine.ts

key-decisions:
  - "33% reduction in spacing (60->40 node, 150->100 layer) for compact layout"

patterns-established:
  - "Compact layout: nodeSpacing=40, layerSpacing=100 as defaults"

# Metrics
duration: 3min
completed: 2026-01-31
---

# Phase 14 Plan 01: Compact Node Spacing Summary

**Reduced ELK.js layout spacing from 60/150 to 40/100 for more compact graph visualization with less whitespace between tables**

## Performance

- **Duration:** 3 min
- **Started:** 2026-01-31T13:55:00Z
- **Completed:** 2026-01-31T13:58:00Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Reduced nodeSpacing default from 60px to 40px (33% reduction)
- Reduced layerSpacing default from 150px to 100px (33% reduction)
- Updated both main layoutGraph function and layoutSimpleNodes fallback
- All 50 layout engine tests pass

## Task Commits

Each task was committed atomically:

1. **Task 1: Reduce ELK layout spacing constants** - `51d6326` (feat)
2. **Task 2: Update layout tests to reflect new spacing defaults** - No commit needed (tests don't assert specific spacing values)

## Files Created/Modified
- `lineage-ui/src/utils/graph/layoutEngine.ts` - Updated default nodeSpacing (60->40) and layerSpacing (150->100) in both layoutGraph and layoutSimpleNodes functions

## Decisions Made
- Reduced both spacing values by 33% (60->40 for nodeSpacing, 150->100 for layerSpacing) as specified in plan
- The compound node layout (database clusters) uses multipliers on these values: nodeSpacing*2 (now 80 instead of 120) and layerSpacing*1.5 (now 150 instead of 225)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Compact layout is active and ready
- Ready for 14-02 viewport focus improvements
- Column text remains readable at the new spacing (28px row height unchanged)

---
*Phase: 14-viewport-and-space-optimization*
*Completed: 2026-01-31*
