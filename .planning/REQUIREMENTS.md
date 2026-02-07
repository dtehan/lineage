# Requirements: Lineage Application v4.0

**Defined:** 2026-02-01
**Core Value:** The lineage application must be secure and stable for production use - no data exposure through error messages, no unbounded resource consumption, and clear security boundaries documented.

## v4.0 Requirements

Requirements for Interactive Graph Experience milestone. Focus on animation polish and detail panel enhancement.

### Animation & Transitions

- [x] **ANIM-01**: Smooth opacity transitions (200-300ms) when highlighting/unhighlighting nodes
- [x] **ANIM-02**: Smooth transitions (200-300ms) when dimming unrelated nodes during selection
- [x] **ANIM-03**: Panel slides in/out with smooth animation (not instant)
- [x] **ANIM-04**: Transition timing feels natural (ease-out curve, no jarring jumps)

### Selection Enhancement

- [x] **SELECT-01**: "Fit to selection" button centers viewport on highlighted path
- [x] **SELECT-02**: Fit-to-selection uses React Flow fitBounds API with padding
- [x] **SELECT-03**: Breadcrumb shows selection hierarchy (database > table > column) in panel header
- [x] **SELECT-04**: Breadcrumb updates immediately on selection change
- [x] **SELECT-05**: Selection state persists when changing graph depth (if possible)

### Detail Panel - Backend API

- [x] **API-01**: GET /api/v2/openlineage/datasets/{id}/statistics returns row count, size, last modified
- [x] **API-02**: Statistics endpoint returns owner, table/view type, created date
- [x] **API-03**: GET /api/v2/openlineage/datasets/{id}/ddl returns view definition SQL
- [x] **API-04**: DDL endpoint returns table comments, column comments
- [x] **API-05**: Endpoints return 404 for missing datasets, 500 with generic errors (security)
- [x] **API-06**: Endpoints support both table and view dataset types

### Detail Panel - Frontend

- [x] **PANEL-01**: Tabbed interface with "Columns", "Statistics", "DDL" tabs
- [x] **PANEL-02**: Statistics tab shows table metadata (row count, size, dates, owner, type)
- [x] **PANEL-03**: DDL tab shows view SQL with syntax highlighting
- [x] **PANEL-04**: DDL tab shows table/column comments if available
- [x] **PANEL-05**: Column list: click column name navigates to that column's lineage graph
- [x] **PANEL-06**: Loading states for statistics and DDL tabs (separate from main panel)
- [x] **PANEL-07**: Error states if statistics/DDL fetch fails (graceful degradation)
- [x] **PANEL-08**: Panel scrollable independently per tab (large SQL, many columns)

### Testing

- [x] **TEST-01**: Unit tests for hover tooltip with different node types
- [x] **TEST-02**: Integration tests for fit-to-selection viewport calculations
- [x] **TEST-03**: E2E tests for panel navigation (column click → new lineage)
- [x] **TEST-04**: Performance tests for hover on 100+ node graphs
- [x] **TEST-05**: API tests for statistics and DDL endpoints
- [x] **TEST-06**: Frontend tests for panel tab switching and error states

## Future Requirements

Deferred to v4.1 or later milestones.

### Advanced Features (v4.1+)

- **FUTURE-01**: Hover preview tooltip with lineage counts ("X upstream, Y downstream")
- **FUTURE-02**: Edge flow animation with CSS stroke-dasharray
- **FUTURE-03**: Selection history navigation (back/forward buttons)
- **FUTURE-04**: Column-level keyboard navigation (arrow keys, Tab)
- **FUTURE-05**: Contextual actions menu (right-click)
- **FUTURE-06**: Multi-column selection with Shift+click
- **FUTURE-07**: Smart zoom on selection (optimize readability)

## Out of Scope

Explicitly excluded from v4.0. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Arbitrary multi-select | Creates confusing non-contiguous highlighting; unclear semantics |
| Node editing from UI | Lineage data should be authoritative from source; UI edits create drift |
| Real-time lineage updates | Complex infrastructure; most changes happen during ETL, not real-time |
| Auto-open panel on every selection | Disrupts exploration flow; current manual open is better UX |
| Full-text search in panel | Search belongs in main search bar; panel is for quick reference |
| Mini-map selection sync | Nice-to-have; defer to later milestone |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| ANIM-01 | Phase 19 | Complete |
| ANIM-02 | Phase 19 | Complete |
| ANIM-03 | Phase 19 | Complete |
| ANIM-04 | Phase 19 | Complete |
| SELECT-01 | Phase 22 | Complete |
| SELECT-02 | Phase 22 | Complete |
| SELECT-03 | Phase 22 | Complete |
| SELECT-04 | Phase 22 | Complete |
| SELECT-05 | Phase 22 | Complete |
| API-01 | Phase 20 | Complete |
| API-02 | Phase 20 | Complete |
| API-03 | Phase 20 | Complete |
| API-04 | Phase 20 | Complete |
| API-05 | Phase 20 | Complete |
| API-06 | Phase 20 | Complete |
| PANEL-01 | Phase 21 | Complete |
| PANEL-02 | Phase 21 | Complete |
| PANEL-03 | Phase 21 | Complete |
| PANEL-04 | Phase 21 | Complete |
| PANEL-05 | Phase 21 | Complete |
| PANEL-06 | Phase 21 | Complete |
| PANEL-07 | Phase 21 | Complete |
| PANEL-08 | Phase 21 | Complete |
| TEST-01 | Phase 23 | Complete |
| TEST-02 | Phase 23 | Complete |
| TEST-03 | Phase 23 | Complete |
| TEST-04 | Phase 23 | Complete |
| TEST-05 | Phase 23 | Complete |
| TEST-06 | Phase 23 | Complete |

**Coverage:**
- v4.0 requirements: 29 total
- Mapped to phases: 29
- Unmapped: 0

---
*Requirements defined: 2026-02-01*
*Last updated: 2026-02-06 (Phase 22 complete)*
