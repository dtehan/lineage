# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-01)

**Core value:** The lineage application must be secure and stable for production use - no data exposure through error messages, no unbounded resource consumption, and clear security boundaries documented.
**Current focus:** v4.0 Interactive Graph Experience - Phase 21 complete, ready for Phase 22

## Current Position

Milestone: v4.0 Interactive Graph Experience
Phase: 21 of 23 (Detail Panel Enhancement)
Plan: 3 of 3 (21-03 complete)
Status: Phase complete
Last activity: 2026-02-06 - Completed 21-03-PLAN.md (Test Coverage for Tabbed DetailPanel)

Progress: [######    ] 60% (3/5 phases complete in v4.0)

## Performance Metrics

**Velocity:**
- Total plans completed: 48 (v1.0: 13, v2.0: 11, v2.1: 5, v3.0: 11, v4.0: 8)
- Average duration: ~3.5 min
- Total execution time: ~167 min

**By Milestone:**

| Milestone | Phases | Plans | Duration |
|-----------|--------|-------|----------|
| v1.0 | 6 | 13 | 8 days |
| v2.0 | 2 | 11 | ~2 hours |
| v2.1 | 2 | 5 | 1 day |
| v3.0 | 6 | 11 | ~2.5 hours |
| v4.0 | 5 | TBD | In progress |

**Recent Trend:**
- Last 5 plans: 21-03 (4 min), 21-02 (6 min), 21-01 (2 min), 20-01 (4 min), 20-02 (1 min)
- Trend: Stable

*Updated after each plan completion*

## Accumulated Context

### Decisions

All decisions logged in PROJECT.md Key Decisions table.

v4.0 roadmap decisions:
- Start phase numbering at 19 (continues from v3.0 phase 18)
- 5 phases covering 29 requirements
- Animation first (establishes CSS patterns), then backend API, then frontend panel
- Testing as final phase (verifies all implemented features)

v4.0 Phase 19 decisions:
- Use Tailwind opacity classes instead of inline styles for CSS transition support
- DetailPanel always rendered in DOM, visibility controlled via CSS transform (enables exit animations)
- 200ms for opacity transitions, 300ms for panel slide (different durations for different interaction weights)
- Global prefers-reduced-motion CSS as safety net beyond per-component motion-reduce variants
- All animation CSS in index.css (no dynamic JS injection via document.createElement)
- Animation timing hierarchy: 150ms (labels), 200ms (nodes/edges), 300ms (panels)
- Custom CSS class for edge label fade-in instead of tailwindcss-animate dependency

v4.0 Phase 20 decisions:
- Generic "Internal server error" on 500 errors (API-05 security) for new endpoints, not str(e) pattern
- DBC system view queries individually wrapped in try/except for graceful permission degradation
- DDL endpoint tries RequestTxtOverFlow column first, falls back for older Teradata versions
- Views return null sizeBytes, tables return null viewSql
- Go backend: parseDatasetName helper splits namespace_id/database.table format
- Go backend: MockOpenLineageRepository implements full OpenLineageRepository interface with error injection

v4.0 Phase 21 decisions:
- 5min staleTime for statistics hook (row counts change occasionally), 30min for DDL hook (view SQL rarely changes)
- Hooks default enabled=true but accept enabled option for lazy tab fetching
- Query keys use openLineageKeys.all prefix for consistent cache invalidation
- SQL language built into prism-react-renderer bundled Prism -- no dynamic import needed
- Tab state resets to "columns" on selection change to prevent stale tab data
- effectiveDatasetId computed from prop or selectedColumn.id for graph compatibility
- Edge details remain flat layout (no tabs) -- tabs only for column selection
- Module-level vi.mock for TanStack Query hooks with vi.mocked for per-test state control
- prism-react-renderer mocked with minimal token structure for DDL tab tests

### Pending Todos

1. Views not showing their column types (2026-01-31, area: ui)
2. Optimize view column type extraction to in-database process (2026-02-01, area: database)
3. Refactor COLUMN_LINEAGE_MAPPINGS to test fixtures (2026-02-01, area: database)

### Blockers/Concerns

None

## Session Continuity

Last session: 2026-02-06
Stopped at: Completed 21-03-PLAN.md (Test Coverage for Tabbed DetailPanel) - Phase 21 complete
Resume file: None
Next: Phase 22 (Selection Features) - fit-to-selection viewport control and breadcrumb navigation
