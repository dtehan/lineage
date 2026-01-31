# Phase 9: Pagination Component - Context

**Gathered:** 2026-01-31
**Status:** Ready for planning

<domain>
## Phase Boundary

Build a reusable pagination UI component for navigating large data sets across the lineage application. This component provides Previous/Next navigation, page indicators, and page size selection. Integration with specific views (Asset Browser, Search, Lineage) happens in later phases.

</domain>

<decisions>
## Implementation Decisions

### Visual presentation
- Ghost button style: transparent background, border on hover - minimal, clean look
- Icons + text labels: Previous/Next buttons include chevron icons along with text
- Adapt for pagination context: Follow app theme but optimize sizing/spacing specifically for pagination use (not strict button matching)

### Navigation patterns
- Include First/Last page jump buttons with double chevron icons («, »)
- Include page size selector dropdown
- Page size options: 25, 50, 100, 200 items per page
- Default page size: 25 items
- No direct page input field (not selected)

### Claude's Discretion
- Mobile viewport handling (stacked vs condensed layout)
- Loading states and disabled states
- Exact spacing, padding, and typography details
- Boundary condition handling (first/last page behaviors)

</decisions>

<specifics>
## Specific Ideas

No specific requirements - open to standard approaches within the decisions above.

</specifics>

<deferred>
## Deferred Ideas

None - discussion stayed within phase scope.

</deferred>

---

*Phase: 09-pagination-component*
*Context gathered: 2026-01-31*
