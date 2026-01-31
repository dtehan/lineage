# Phase 9: Pagination Component - Research

**Researched:** 2026-01-31
**Domain:** React UI Components / Pagination
**Confidence:** HIGH

## Summary

This phase enhances the existing minimal Pagination component to become a full-featured, accessible navigation control for large data sets. The research examined the existing codebase patterns, lucide-react icon availability, WCAG accessibility requirements, and responsive design best practices.

The codebase already has a `Pagination.tsx` component with basic Previous/Next functionality using lucide-react icons. The component uses Tailwind CSS with a slate color palette and follows the project's established patterns (ghost button styling, consistent spacing). The enhancement requires adding First/Last page buttons (using `ChevronsLeft`/`ChevronsRight` icons), page size selector dropdown, page number display, and improved accessibility markup.

**Primary recommendation:** Extend the existing `Pagination.tsx` component rather than replacing it, maintaining backward compatibility with current consumers while adding the new features specified in CONTEXT.md decisions.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | ^18.2.0 | UI framework | Already in project |
| lucide-react | ^0.300.0 | Icon library | Already used throughout codebase, has `ChevronsLeft`/`ChevronsRight` |
| tailwindcss | ^3.4.0 | Styling | Already used throughout codebase |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @testing-library/react | ^14.2.0 | Testing | Unit tests for component |
| @testing-library/user-event | ^14.5.0 | Interaction testing | Testing clicks, keyboard |
| vitest-axe | ^0.1.0 | A11y testing | Accessibility verification |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| lucide-react | heroicons | Project already uses lucide-react consistently |
| Custom dropdown | Headless UI | Additional dependency; native `<select>` sufficient for page size |
| react-responsive-pagination | Custom component | Would require new dependency; simple custom implementation preferred |

**Installation:**
No new packages needed. All required dependencies are already in place.

## Architecture Patterns

### Recommended Project Structure
```
src/
├── components/
│   └── common/
│       ├── Pagination.tsx       # Enhanced pagination component
│       └── Pagination.test.tsx  # Comprehensive tests
```

### Pattern 1: Controlled Component with Offset-Based Pagination
**What:** Pagination receives offset/limit/totalCount from parent, calls onPageChange with new offset
**When to use:** Standard pattern already in use; maintain for backward compatibility
**Example:**
```typescript
// Existing interface (maintain backward compatibility)
interface PaginationProps {
  totalCount: number;
  limit: number;
  offset: number;
  onPageChange: (offset: number) => void;
  className?: string;
}

// Extended interface for new features
interface EnhancedPaginationProps extends PaginationProps {
  pageSize?: number;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: number[];
  showPageSizeSelector?: boolean;
  showFirstLast?: boolean;
  showPageInfo?: boolean;
  isLoading?: boolean;
}
```

### Pattern 2: Page Number Calculation
**What:** Calculate current page from offset/limit
**When to use:** Display "Page X of Y" information
**Example:**
```typescript
const currentPage = Math.floor(offset / limit) + 1;
const totalPages = Math.ceil(totalCount / limit);
```

### Pattern 3: Ghost Button Styling (per CONTEXT.md decisions)
**What:** Transparent background with border on hover, minimal look
**When to use:** All pagination buttons
**Example:**
```typescript
const ghostButtonClass = `
  px-2 py-1.5 rounded-md
  text-slate-700
  bg-transparent
  border border-transparent
  hover:border-slate-300
  disabled:opacity-50 disabled:cursor-not-allowed
  disabled:hover:border-transparent
  transition-colors
`;
```

### Pattern 4: Responsive Stacking
**What:** Horizontal layout on desktop, stacked on mobile
**When to use:** Mobile viewport handling (Claude's discretion)
**Example:**
```typescript
<div className="flex flex-col sm:flex-row items-center justify-between gap-2 sm:gap-4">
  {/* Page info - full width on mobile */}
  <span className="text-sm text-slate-600 w-full sm:w-auto text-center sm:text-left">
    Showing {start}-{end} of {totalCount}
  </span>
  {/* Controls - centered on mobile */}
  <div className="flex items-center gap-1">
    {/* buttons */}
  </div>
</div>
```

### Anti-Patterns to Avoid
- **Inline button styles:** Use shared className variables/functions for consistency
- **Direct DOM manipulation:** Use React state for all UI updates
- **Missing aria-labels:** Every icon-only button needs descriptive aria-label
- **Hardcoded page sizes:** Accept pageSizeOptions prop for flexibility

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Page number calculation | Custom math everywhere | Single helper function | Avoid off-by-one errors, maintain consistency |
| Icon sizing | Different sizes per icon | Consistent `w-4 h-4` class | Matches existing codebase pattern |
| Focus ring styling | Custom focus states | `focus:ring-2 focus:ring-blue-500 focus:outline-none` | Established Tailwind pattern in codebase |
| Disabled state styling | Custom opacity/cursor | `disabled:opacity-50 disabled:cursor-not-allowed` | Consistent with Button.tsx |

**Key insight:** The codebase already has established patterns in Button.tsx and Toolbar.tsx for button variants, disabled states, and select dropdowns. Follow these exactly.

## Common Pitfalls

### Pitfall 1: Off-by-One Page Calculations
**What goes wrong:** Showing "Page 0" or incorrect page counts
**Why it happens:** Mixing 0-indexed offsets with 1-indexed page numbers
**How to avoid:** Use consistent formulas:
- `currentPage = Math.floor(offset / limit) + 1`
- `totalPages = Math.ceil(totalCount / limit)`
- `newOffset = (pageNumber - 1) * limit`
**Warning signs:** Tests show "Page 0" or page count doesn't match expected

### Pitfall 2: Missing Boundary Conditions
**What goes wrong:** First/Last buttons enabled when already at boundary
**Why it happens:** Not checking edge cases in disabled logic
**How to avoid:** Test these exact conditions:
- First page: offset === 0
- Last page: offset + limit >= totalCount
- Single page: totalCount <= limit
- Empty data: totalCount === 0
**Warning signs:** Buttons clickable when they shouldn't be

### Pitfall 3: Accessibility Violations
**What goes wrong:** Screen readers can't navigate or understand state
**Why it happens:** Missing nav landmark, aria-current, aria-labels
**How to avoid:** Follow WCAG pagination pattern:
- Wrap in `<nav aria-label="Pagination">`
- Use `aria-label` on all icon buttons
- Add `aria-disabled` when disabled
- Consider `aria-live="polite"` for page changes
**Warning signs:** vitest-axe tests fail, manual screen reader testing reveals issues

### Pitfall 4: Page Size Change Resets to Wrong Page
**What goes wrong:** User on page 5, changes page size, ends up at wrong position
**Why it happens:** Not recalculating offset when limit changes
**How to avoid:** When page size changes, keep user at same approximate data position:
```typescript
const handlePageSizeChange = (newSize: number) => {
  // Calculate which item user is viewing
  const currentFirstItem = offset + 1;
  // Calculate new offset to keep that item visible
  const newOffset = Math.floor((currentFirstItem - 1) / newSize) * newSize;
  onPageSizeChange?.(newSize);
  onPageChange(newOffset);
};
```
**Warning signs:** User loses their place when changing page size

### Pitfall 5: Mobile Touch Targets Too Small
**What goes wrong:** Buttons hard to tap on mobile
**Why it happens:** Using minimal padding that works for mouse but not fingers
**How to avoid:** Ensure minimum 44x44px touch targets (WCAG 2.5.5):
- Use `min-w-[44px] min-h-[44px]` for icon-only buttons
- Or add sufficient padding: `p-2.5` or larger
**Warning signs:** User complaints about tapping accuracy on mobile

## Code Examples

Verified patterns from official sources and existing codebase:

### Lucide-react Double Chevron Icons
```typescript
// Source: https://lucide.dev/icons/
import {
  ChevronLeft,      // Single chevron <
  ChevronRight,     // Single chevron >
  ChevronsLeft,     // Double chevron <<
  ChevronsRight     // Double chevron >>
} from 'lucide-react';

// Usage in JSX
<ChevronsLeft className="w-4 h-4" />  // First page
<ChevronLeft className="w-4 h-4" />   // Previous page
<ChevronRight className="w-4 h-4" />  // Next page
<ChevronsRight className="w-4 h-4" /> // Last page
```

### Native Select Dropdown (from Toolbar.tsx pattern)
```typescript
// Source: lineage-ui/src/components/domain/LineageGraph/Toolbar.tsx
<div className="relative">
  <label htmlFor="page-size-select" className="sr-only">
    Items per page
  </label>
  <select
    id="page-size-select"
    value={pageSize}
    onChange={(e) => onPageSizeChange(Number(e.target.value))}
    className="appearance-none pl-3 pr-8 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
  >
    {pageSizeOptions.map((size) => (
      <option key={size} value={size}>{size} per page</option>
    ))}
  </select>
  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
</div>
```

### Accessible Navigation Wrapper
```typescript
// Source: WCAG guidelines, https://design-system.w3.org/components/pagination.html
<nav
  aria-label="Pagination"
  className="flex items-center justify-between"
  role="navigation"
>
  {/* Pagination controls */}
</nav>
```

### Ghost Button Style (per CONTEXT.md decisions)
```typescript
// Transparent background, border on hover, consistent with decisions
const buttonBaseClass = `
  inline-flex items-center justify-center
  min-w-[36px] min-h-[36px]
  px-2 py-1.5
  rounded-md
  text-slate-700
  bg-transparent
  border border-transparent
  hover:border-slate-300 hover:bg-slate-50
  focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1
  disabled:opacity-50 disabled:cursor-not-allowed
  disabled:hover:border-transparent disabled:hover:bg-transparent
  transition-colors
`;
```

### Page Info Text Display
```typescript
// Source: Existing Pagination.tsx pattern
const start = Math.min(offset + 1, totalCount);
const end = Math.min(offset + limit, totalCount);

<span className="text-sm text-slate-600" data-testid="pagination-info">
  Showing {start}-{end} of {totalCount} items
</span>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Numbered page links | Previous/Next with page info | Common UX pattern | Simpler, cleaner UI for most use cases |
| Fixed page size | Selectable page size | Modern pattern | Better user control |
| Icon-only buttons | Icons + text labels | Accessibility focus | Better for all users |

**Deprecated/outdated:**
- None relevant for this phase. The approach is standard React patterns.

## Open Questions

Things that couldn't be fully resolved:

1. **Empty state handling**
   - What we know: When totalCount is 0, component should handle gracefully
   - What's unclear: Show "0 items" or hide pagination entirely?
   - Recommendation: Show "Showing 0 items" text, disable all navigation buttons

2. **Loading state during page change**
   - What we know: Parent may pass isLoading prop
   - What's unclear: Should buttons be disabled during loading, or show spinner?
   - Recommendation: Add optional isLoading prop, disable buttons when true, maintain consistent behavior

## Sources

### Primary (HIGH confidence)
- Codebase: `lineage-ui/src/components/common/Pagination.tsx` - existing component patterns
- Codebase: `lineage-ui/src/components/common/Button.tsx` - ghost button variant
- Codebase: `lineage-ui/src/components/domain/LineageGraph/Toolbar.tsx` - select dropdown pattern
- [Lucide Icons](https://lucide.dev/icons/) - ChevronsLeft/ChevronsRight availability confirmed

### Secondary (MEDIUM confidence)
- [W3C Design System - Pagination](https://design-system.w3.org/components/pagination.html) - ARIA patterns
- [U.S. Web Design System - Pagination](https://designsystem.digital.gov/components/pagination/) - Accessibility tests
- [Accessibility Matters - Pagination](https://a11ymatters.com/pattern/pagination/) - WCAG compliance patterns

### Tertiary (LOW confidence)
- None - all findings verified with primary or secondary sources

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries already in use, verified in package.json
- Architecture: HIGH - patterns extracted directly from codebase
- Pitfalls: HIGH - based on WCAG guidelines and common React patterns
- Code examples: HIGH - verified against codebase and lucide-react docs

**Research date:** 2026-01-31
**Valid until:** 2026-03-01 (30 days - stable domain, established patterns)
