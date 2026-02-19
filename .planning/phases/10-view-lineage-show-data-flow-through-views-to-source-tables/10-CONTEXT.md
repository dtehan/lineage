# Phase 10: View Lineage - Context

**Gathered:** 2026-02-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Surface views as visible intermediate nodes in the lineage graph so users can trace data flow through views to their underlying source tables and columns. When lineage passes through a view, the view appears in the graph with its column list, and lineage edges connect at the column level — exactly like table nodes. Views are first-class objects in the lineage visualization.

</domain>

<decisions>
## Implementation Decisions

### Lineage path through views
- Views appear as intermediate nodes in the lineage path — not hidden or collapsed
- A view in the path looks like: Source table → View → Target table
- Lineage edges connect at the column level (not just table-to-table)
- The view card shows the columns it exposes, same as a table card

### View node content
- View cards display the list of columns the view exposes
- Column-level lineage edges flow in and out of view columns (same as table columns)
- No visual simplification — full column-level detail, not just a labeled box

### View as starting point
- When a user explores lineage from a view, both directions are shown:
  - Upstream: traces back through the view definition to source tables
  - Downstream: shows what tables/views SELECT from this view
- Same behavior as exploring from a regular table

### Nested views
- Lineage traces all the way to base tables — full transitive lineage
- If view A selects from view B which selects from table C, the graph shows: Table C → View B → View A (and whatever consumes View A)
- No manual click-through required — full chain rendered automatically

### Claude's Discretion
- Visual differentiation of views vs tables (label, icon, color — pick something clear but consistent with existing graph style)
- How the backend API exposes view lineage (new endpoint or extension of existing lineage endpoint)
- Loading/performance strategy for deep view chains

</decisions>

<specifics>
## Specific Ideas

- The user's mental model: "a view selects data from tables or other views — that should show in the lineage"
- Views should behave identically to tables as nodes — same card format, same column-level edges, just visually marked as a view

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 10-view-lineage-show-data-flow-through-views-to-source-tables*
*Context gathered: 2026-02-19*
