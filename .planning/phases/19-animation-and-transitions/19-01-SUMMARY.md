---
phase: 19-animation-transitions
plan: 01
subsystem: ui
tags: [css-transitions, tailwind, accessibility, prefers-reduced-motion, animation]

# Dependency graph
requires: []
provides:
  - CSS transition patterns for node opacity (200ms ease-out)
  - CSS transform slide animation for DetailPanel (300ms ease-out)
  - Global prefers-reduced-motion accessibility support
  - motion-reduce Tailwind variant usage pattern
affects: [19-02, 19-03, 20, 23]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Tailwind CSS classes for opacity transitions instead of inline styles"
    - "CSS transform-based panel slide animation (translate-x-full/translate-x-0)"
    - "Always-rendered DOM with CSS visibility control for exit animations"
    - "motion-reduce:transition-none on animated components"
    - "Global @media (prefers-reduced-motion: reduce) fallback in index.css"

key-files:
  created: []
  modified:
    - lineage-ui/src/components/domain/LineageGraph/TableNode/TableNode.tsx
    - lineage-ui/src/components/domain/LineageGraph/TableNode/ColumnRow.tsx
    - lineage-ui/src/components/domain/LineageGraph/DetailPanel.tsx
    - lineage-ui/src/components/domain/LineageGraph/DetailPanel.test.tsx
    - lineage-ui/src/index.css

key-decisions:
  - "Use Tailwind opacity-20/opacity-100 classes instead of inline styles for CSS transition support"
  - "Always render DetailPanel in DOM, control visibility via CSS transform instead of conditional render"
  - "Use translate-x-full/translate-x-0 for GPU-accelerated panel slide animation"
  - "Add both per-component motion-reduce and global prefers-reduced-motion fallback"

patterns-established:
  - "Animation pattern: Use Tailwind transition-* classes with motion-reduce:transition-none"
  - "Panel pattern: Always render, control with CSS transform + aria-hidden for exit animations"
  - "Accessibility pattern: Global prefers-reduced-motion media query as safety net"

# Metrics
duration: 3min
completed: 2026-02-06
---

# Phase 19 Plan 01: Animation & Transitions Summary

**Smooth CSS transitions for node opacity (200ms) and detail panel slide (300ms) with prefers-reduced-motion accessibility**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-06T22:38:57Z
- **Completed:** 2026-02-06T22:41:38Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments
- Converted inline opacity styles to Tailwind CSS classes with 200ms transition-opacity for smooth node/column dimming
- Refactored DetailPanel from conditional render to always-rendered DOM with 300ms CSS transform slide animation
- Added global prefers-reduced-motion support (WCAG 2.1 SC 2.3.3) disabling all animations for users who prefer reduced motion

## Task Commits

Each task was committed atomically:

1. **Task 1: Convert node/column opacity to CSS transitions** - `1bca6f3` (feat)
2. **Task 2: Add slide animation to DetailPanel** - `2bcb1f3` (feat)
3. **Task 3: Add reduced-motion accessibility support** - `f0b8a97` (feat)

## Files Created/Modified
- `lineage-ui/src/components/domain/LineageGraph/TableNode/TableNode.tsx` - Replaced inline opacity with Tailwind opacity-20/opacity-100 classes and transition-opacity
- `lineage-ui/src/components/domain/LineageGraph/TableNode/ColumnRow.tsx` - Replaced inline opacity with Tailwind opacity-20/opacity-100 classes and transition-opacity
- `lineage-ui/src/components/domain/LineageGraph/DetailPanel.tsx` - Removed conditional render, added CSS transform slide animation with translate-x-full/translate-x-0
- `lineage-ui/src/components/domain/LineageGraph/DetailPanel.test.tsx` - Updated panel visibility test to verify aria-hidden and translate-x-full instead of DOM absence
- `lineage-ui/src/index.css` - Added global @media (prefers-reduced-motion: reduce) rule

## Decisions Made
- Used Tailwind `opacity-20`/`opacity-100` classes instead of inline styles because inline styles bypass CSS transitions
- Changed `transition-all` to `transition-opacity` in TableNode for more targeted (and performant) transitions
- DetailPanel always renders in DOM with `translate-x-full` off-screen positioning, enabling smooth exit animations that conditional rendering prevents
- Added `aria-hidden={!isOpen}` to closed panel for screen reader accessibility
- Used 200ms for opacity transitions (quick, subtle) and 300ms for panel slide (substantial, noticeable)
- Added global `prefers-reduced-motion` CSS as safety net beyond per-component `motion-reduce:transition-none`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated DetailPanel test for new rendering behavior**
- **Found during:** Task 2 (Add slide animation to DetailPanel)
- **Issue:** Test `does not render when isOpen is false` asserted `queryByTestId('detail-panel')` was not in DOM, but panel is now always rendered
- **Fix:** Changed test to verify panel is present with `aria-hidden="true"` and `translate-x-full` class
- **Files modified:** DetailPanel.test.tsx
- **Verification:** All 16 DetailPanel tests pass
- **Committed in:** `2bcb1f3` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Test update necessary to match new rendering behavior. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Animation patterns established for v4.0 phases to follow
- CSS transition classes (transition-opacity, transition-transform) and motion-reduce pattern ready for reuse
- DetailPanel always-rendered pattern enables future animation enhancements
- Ready for 19-02 (edge animation consistency) and 19-03 (test updates)

---
*Phase: 19-animation-transitions*
*Completed: 2026-02-06*
