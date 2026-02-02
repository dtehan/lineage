# Phase 19: Animation & Transitions - Research

**Researched:** 2026-02-01
**Domain:** CSS animations, transitions, React component animation patterns
**Confidence:** HIGH

## Summary

This phase focuses on establishing smooth CSS animation patterns for the lineage graph. The codebase already uses Tailwind CSS with basic transitions (e.g., `transition-all`, `transition-colors`) and has partial animation support in edges (dash animation via keyframes). The requirements are straightforward CSS transition enhancements: opacity fades for node highlighting (ANIM-01, ANIM-02), panel slide animations (ANIM-03), and consistent ease-out timing (ANIM-04).

The standard approach uses native CSS transitions with `transform` and `opacity` properties for GPU-accelerated performance. No additional libraries are needed since Tailwind CSS already includes comprehensive transition utilities. The main work involves adding consistent transition durations (200-300ms per requirements), using `ease-out` timing functions, implementing `translateX` for panel slides, and ensuring accessibility via `prefers-reduced-motion`.

**Primary recommendation:** Use Tailwind's built-in `transition-opacity duration-200 ease-out` pattern for node highlighting, and `transform transition-transform duration-300 ease-out` for the DetailPanel slide animation.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Tailwind CSS | ^3.4.0 | Utility-first CSS framework | Already in use; provides transition-*, duration-*, ease-* utilities |
| Native CSS Transitions | N/A | Browser transition API | No JS overhead, GPU-accelerated for transform/opacity |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @xyflow/react | ^12.0.0 | Graph visualization | Already in use; node/edge styling via CSS classes |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| CSS transitions | Framer Motion | Overkill for simple opacity/transform; adds bundle size |
| CSS transitions | react-transition-group | Extra complexity for simple state-based transitions |
| CSS transitions | GSAP | Professional animation library; unnecessary for this scope |

**Installation:**
```bash
# No new packages required - Tailwind CSS already included
```

## Architecture Patterns

### Current State Analysis

The codebase already has transition foundations:

```typescript
// TableNode.tsx - line 93
className={`... transition-all duration-200 ...`}

// ColumnRow.tsx - line 33
const base = 'relative flex items-center justify-between h-7 px-3 transition-all cursor-pointer';

// LineageEdge.tsx - line 139
style={{ ...transition: 'stroke-width 0.2s, opacity 0.2s'... }}
```

Current gaps:
1. **DetailPanel has no slide animation** - appears/disappears instantly via conditional render
2. **Opacity changes use inline style** - `style={{ opacity: isTableDimmed ? 0.2 : 1 }}` bypasses CSS transitions
3. **Inconsistent timing** - some use `duration-200`, edges use `0.2s` inline

### Recommended Pattern: CSS Transition Classes

**What:** Replace inline opacity styles with CSS classes that include transition properties
**When to use:** For any state-driven visual change (highlighting, dimming, selection)
**Example:**
```typescript
// Source: Tailwind CSS documentation
// Before (instant):
style={{ opacity: isDimmed ? 0.2 : 1 }}

// After (animated):
className={`transition-opacity duration-200 ease-out ${isDimmed ? 'opacity-20' : 'opacity-100'}`}
```

### Pattern 1: Opacity Transitions for Highlighting/Dimming

**What:** Apply smooth opacity changes when nodes highlight or dim
**When to use:** ANIM-01 (highlight), ANIM-02 (dim unrelated)
**Example:**
```typescript
// Source: Tailwind CSS transition-opacity documentation
// TableNode.tsx
<div
  className={`
    min-w-[280px] max-w-[400px]
    ${getBackgroundColor()} rounded-lg border-2 shadow-md
    transition-opacity duration-200 ease-out
    ${getBorderColor()}
    ${isTableDimmed ? 'opacity-20' : 'opacity-100'}
  `}
  data-testid={`table-node-${id}`}
>
```

### Pattern 2: Transform-Based Panel Slide

**What:** Panel slides in from right edge using translateX
**When to use:** ANIM-03 (panel slide)
**Example:**
```typescript
// Source: MDN CSS transitions, CodyHouse slide-in panel pattern
// DetailPanel.tsx - Always render, control visibility with transform

export const DetailPanel: React.FC<DetailPanelProps> = ({
  isOpen,
  onClose,
  selectedColumn,
  selectedEdge,
  ...
}) => {
  return (
    <div
      data-testid="detail-panel"
      className={`
        fixed right-0 top-0 h-full w-96
        bg-white shadow-xl border-l border-slate-200 z-50
        overflow-y-auto
        transition-transform duration-300 ease-out
        ${isOpen ? 'translate-x-0' : 'translate-x-full'}
      `}
      role="dialog"
      aria-label={selectedColumn ? 'Column details' : 'Edge details'}
      aria-hidden={!isOpen}
    >
      {/* Panel content */}
    </div>
  );
};
```

### Pattern 3: Accessibility with Reduced Motion

**What:** Disable or minimize animations for users who prefer reduced motion
**When to use:** Always, as a baseline accessibility requirement
**Example:**
```css
/* Source: W3C WCAG 2.1 Technique C39 */
/* index.css */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

Or using Tailwind's variants:
```typescript
// Source: Tailwind CSS animation documentation
className="transition-opacity duration-200 motion-reduce:transition-none"
```

### Recommended File Structure

No new files needed. Modifications to existing files:

```
lineage-ui/src/
├── index.css                    # Add prefers-reduced-motion media query
├── components/domain/LineageGraph/
│   ├── DetailPanel.tsx          # Add slide animation
│   ├── TableNode/
│   │   ├── TableNode.tsx        # Convert opacity to CSS classes
│   │   └── ColumnRow.tsx        # Add opacity transition
│   └── LineageEdge.tsx          # Verify consistent timing
```

### Anti-Patterns to Avoid
- **Animating layout properties:** Never animate `width`, `height`, `margin`, `padding`, `top`, `left` - they trigger expensive layout recalculation. Use `transform` and `opacity` instead.
- **Inline style for dynamic values:** Don't use `style={{ opacity: 0.2 }}` when the value comes from state - CSS transitions won't apply. Use CSS classes instead.
- **Using `transition: all`:** Be specific about which properties to transition. `transition-all` can cause unexpected transitions and performance issues.
- **Conditional render for animated elements:** Don't use `{isOpen && <Panel />}` if the panel should animate. The element must be in the DOM to transition.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Smooth opacity fade | Manual `setTimeout` or `requestAnimationFrame` | CSS `transition-opacity` | Browser-optimized, GPU-accelerated |
| Panel slide animation | JavaScript animation with position tracking | CSS `transform: translateX` | No JS execution, 60fps performance |
| Easing curves | Custom bezier math | Tailwind `ease-out` class | Pre-defined, consistent, tested |
| Reduced motion support | Manual event listeners for accessibility | CSS `@media (prefers-reduced-motion)` | Automatic system detection |

**Key insight:** CSS transitions are specifically designed for state-driven animations between two values. They outperform JavaScript for these simple use cases because the browser can optimize the interpolation on the GPU without main thread involvement.

## Common Pitfalls

### Pitfall 1: Inline Styles Bypass Transitions
**What goes wrong:** Opacity set via `style={{ opacity: value }}` doesn't animate even with `transition` class
**Why it happens:** CSS transitions only work when the property is controlled by CSS, not inline styles
**How to avoid:** Use CSS classes (`opacity-20`, `opacity-100`) instead of inline styles for transitioned properties
**Warning signs:** Instant visual changes when you expect smooth transitions

### Pitfall 2: Conditional Rendering Prevents Exit Animations
**What goes wrong:** Panel disappears instantly on close because React unmounts it
**Why it happens:** `{isOpen && <Panel />}` removes the element from DOM before animation can play
**How to avoid:** Always render the panel, use `translate-x-full` to move it off-screen
**Warning signs:** Enter animation works but exit doesn't

### Pitfall 3: Wrong Properties Cause Jank
**What goes wrong:** Animation stutters or causes layout shifts
**Why it happens:** Animating `width`, `height`, `left`, `top` triggers layout recalculation
**How to avoid:** Only animate `transform` (translate, scale, rotate) and `opacity`
**Warning signs:** Animation drops below 60fps, other elements shift during animation

### Pitfall 4: Missing Duration or Timing Function
**What goes wrong:** Transition feels wrong or doesn't happen
**Why it happens:** Tailwind's `transition-*` classes don't include duration by default
**How to avoid:** Always pair with `duration-*` class (e.g., `transition-opacity duration-200`)
**Warning signs:** Instant changes or linear (mechanical) feeling transitions

### Pitfall 5: Safari Performance Issues
**What goes wrong:** Animations are choppy on Safari/iOS
**Why it happens:** Safari handles CSS animations differently, especially on mobile
**How to avoid:** Add `will-change: transform` or use `transform-gpu` class as last resort; test on Safari
**Warning signs:** Smooth on Chrome, choppy on Safari

## Code Examples

Verified patterns from official sources:

### Node Opacity Transition (ANIM-01, ANIM-02)
```typescript
// Source: Tailwind CSS transition-opacity documentation
// Replace inline style={{ opacity: ... }} with classes

// TableNode.tsx
<div
  className={`
    min-w-[280px] max-w-[400px]
    ${getBackgroundColor()} rounded-lg border-2 shadow-md
    transition-opacity duration-200 ease-out
    motion-reduce:transition-none
    ${getBorderColor()}
    ${isTableDimmed ? 'opacity-20' : 'opacity-100'}
  `}
>

// ColumnRow.tsx
<div
  className={`
    ${getRowClassName()}
    transition-opacity duration-200 ease-out
    motion-reduce:transition-none
    ${isDimmed ? 'opacity-20' : 'opacity-100'}
  `}
>
```

### Panel Slide Animation (ANIM-03)
```typescript
// Source: MDN CSS transitions, Tailwind transform documentation

export const DetailPanel: React.FC<DetailPanelProps> = ({
  isOpen,
  ...props
}) => {
  // Always render - transform controls visibility
  return (
    <div
      className={`
        fixed right-0 top-0 h-full w-96
        bg-white shadow-xl border-l border-slate-200 z-50
        overflow-y-auto
        transition-transform duration-300 ease-out
        motion-reduce:transition-none
        ${isOpen ? 'translate-x-0' : 'translate-x-full'}
      `}
      aria-hidden={!isOpen}
      inert={!isOpen ? '' : undefined}
    >
      {/* Content always rendered but off-screen when closed */}
    </div>
  );
};
```

### Edge Opacity Consistency
```typescript
// Source: LineageEdge.tsx existing pattern
// Ensure consistent timing with other transitions

<BaseEdge
  style={{
    stroke: baseColor,
    strokeWidth,
    opacity: finalOpacity,
    transition: 'stroke-width 200ms ease-out, opacity 200ms ease-out',
  }}
/>
```

### Global Reduced Motion (index.css)
```css
/* Source: W3C WCAG 2.1 Technique C39 */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| jQuery `.animate()` | CSS transitions | 2015+ | No JS required for simple state transitions |
| JavaScript position tracking | CSS transform | 2015+ | GPU acceleration, 60fps performance |
| `left`/`top` animation | `translateX`/`translateY` | 2015+ | No layout recalculation, smoother |
| Ignore reduced motion | `prefers-reduced-motion` | 2019 | WCAG 2.1 accessibility requirement |
| Tailwind v3 `motion-safe` | Tailwind v4 `motion-safe`/`motion-reduce` | 2023-2024 | Better accessibility variant support |

**Deprecated/outdated:**
- `transition: all` - Be specific; causes unintended transitions
- Inline styles for animated properties - Use CSS classes
- jQuery animations - Native CSS transitions are more performant

## Open Questions

Things that couldn't be fully resolved:

1. **React Flow node position animations**
   - What we know: React Flow Pro example uses `d3-timer` and linear interpolation for node position animations
   - What's unclear: Whether this is needed for this phase (requirements are about opacity/panel, not node positions)
   - Recommendation: Out of scope for this phase; focus on CSS transitions for highlighting/dimming

2. **Edge animation timing synchronization**
   - What we know: Edges already have inline transition `0.2s`, nodes will get Tailwind `duration-200`
   - What's unclear: Whether 200ms == 0.2s works identically across all browsers
   - Recommendation: Convert edge inline style to match Tailwind timing exactly (200ms = duration-200)

## Sources

### Primary (HIGH confidence)
- [MDN CSS Transitions](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Transitions/Using) - Comprehensive transition guide
- [Tailwind CSS transition-timing-function](https://tailwindcss.com/docs/transition-timing-function) - ease-out documentation
- [Tailwind CSS animation](https://tailwindcss.com/docs/animation) - motion-safe/motion-reduce variants
- [Tailwind CSS transition-duration](https://tailwindcss.com/docs/transition-duration) - duration-200, duration-300

### Secondary (MEDIUM confidence)
- [Josh Collinsworth - Ten tips for better CSS transitions](https://joshcollinsworth.com/blog/great-transitions) - Best practices, Safari issues
- [web.dev transitions](https://web.dev/learn/css/transitions) - GPU acceleration, performance
- [CodyHouse CSS slide-in panel](https://codyhouse.co/gem/css-slide-in-panel/) - Panel slide pattern
- [W3C WCAG C39](https://www.w3.org/WAI/WCAG21/Techniques/css/C39) - prefers-reduced-motion technique

### Tertiary (LOW confidence)
- [React Flow node position animation](https://reactflow.dev/examples/nodes/node-position-animation) - Pro example (not applicable to this phase)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Using existing Tailwind CSS, well-documented patterns
- Architecture: HIGH - Straightforward CSS transitions, minimal code changes
- Pitfalls: HIGH - Well-known CSS transition gotchas, verified with official sources

**Research date:** 2026-02-01
**Valid until:** 2026-03-01 (30 days - CSS transitions are stable technology)
