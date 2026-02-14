---
phase: 01-foundation-refactoring-impact-analysis-core
plan: 05
subsystem: ui
tags: [react, tanstack-query, tanstack-table, typescript, impact-analysis]

# Dependency graph
requires:
  - phase: 01-04
    provides: Impact Analysis backend endpoint (/api/v2/openlineage/impact)
  - phase: 01-03
    provides: Flask application factory with OpenLineage routes
provides:
  - Impact Analysis page with summary cards and sortable table
  - TanStack Table integration for sortable, styled data tables
  - useImpactAnalysis TanStack Query hook for API integration
  - ImpactSummaryData, ImpactAsset, ImpactAnalysisApiResponse types
affects: [testing, e2e]

# Tech tracking
tech-stack:
  added: ["@tanstack/react-table@^8.0.0"]
  patterns: ["TanStack Table for sortable tables", "Depth badges for lineage traversal levels", "Impact type badges for direct/indirect classification"]

key-files:
  created:
    - lineage-ui/src/api/hooks/useImpact.ts
    - lineage-ui/src/components/domain/ImpactAnalysis/ImpactTable.tsx
  modified:
    - lineage-ui/src/features/ImpactPage.tsx
    - lineage-ui/src/components/domain/ImpactAnalysis/ImpactAnalysis.tsx
    - lineage-ui/src/components/domain/ImpactAnalysis/ImpactSummary.tsx
    - lineage-ui/src/api/client.ts
    - lineage-ui/src/types/openlineage.ts
    - lineage-ui/src/types/index.ts

key-decisions:
  - "Used ImpactAnalysisApiResponse type name to avoid collision with existing ImpactAnalysisResponse from v1 API"
  - "Depth badge colors: blue (depth 1), amber (depth 2), slate (depth 3+) for visual distinction"
  - "Impact type badge colors: red (direct), amber (indirect) aligned with existing impact classification"
  - "Made ImpactSummary.criticalCount optional for backward compatibility with v1 API tests"

patterns-established:
  - "TanStack Table pattern: columnHelper, useReactTable, flexRender for sortable tables"
  - "Depth visualization: numeric badges with color coding by depth level"
  - "Impact Analysis page structure: header with BackButton + main content area with loading/error/success states"

# Metrics
duration: 2.6min
completed: 2026-02-14
---

# Phase 01 Plan 05: Impact Analysis Frontend UI Summary

**Impact Analysis page with TanStack Table showing downstream dependencies, sortable by database/table/column/depth with summary cards for tables/columns/databases affected**

## Performance

- **Duration:** 2.6 min
- **Started:** 2026-02-14T20:22:29Z
- **Completed:** 2026-02-14T20:25:03Z
- **Tasks:** 2 (committed together as cohesive feature)
- **Files modified:** 10

## Accomplishments
- Replaced "Feature In Development" placeholder with functional Impact Analysis page
- Integrated TanStack Table for sortable impact data (5 columns: Database, Table, Column, Depth, Impact Type)
- Added 4 summary cards showing aggregate impact metrics (tables, columns, databases, max depth)
- Connected frontend to backend via useImpactAnalysis hook using /api/v2/openlineage/impact endpoint
- Implemented loading/error states with LoadingSpinner and retry functionality

## Task Commits

1. **Tasks 1 & 2: Add types, API client, hook, and build UI components** - `6496af1` (feat)

## Files Created/Modified
- `lineage-ui/src/api/hooks/useImpact.ts` - TanStack Query hook for impact analysis API
- `lineage-ui/src/components/domain/ImpactAnalysis/ImpactTable.tsx` - TanStack Table with sortable columns, depth badges, impact type badges
- `lineage-ui/src/components/domain/ImpactAnalysis/ImpactSummary.tsx` - Summary cards for tables/columns/databases/maxDepth
- `lineage-ui/src/components/domain/ImpactAnalysis/ImpactAnalysis.tsx` - Composed view with summary + table
- `lineage-ui/src/features/ImpactPage.tsx` - Full page implementation with loading/error/success states
- `lineage-ui/src/api/client.ts` - Added getImpactAnalysis method to openLineageApi
- `lineage-ui/src/types/openlineage.ts` - Added ImpactAsset, ImpactSummaryData, ImpactSourceAsset, ImpactAnalysisApiResponse types
- `lineage-ui/src/types/index.ts` - Made ImpactSummary fields optional for backward compatibility
- `lineage-ui/package.json` - Added @tanstack/react-table dependency

## Decisions Made
- Used `ImpactAnalysisApiResponse` type name to avoid collision with existing `ImpactAnalysisResponse` from v1 API in types/index.ts
- Depth badge color scheme: depth 1 (blue), depth 2 (amber), depth 3+ (slate) for clear visual hierarchy
- Impact type badges: direct (red), indirect (amber) aligned with binary classification from Plan 02
- Made `criticalCount`, `tableCount`, `columnCount`, `databaseCount` optional in ImpactSummary type for backward compatibility with v1 API tests
- Combined Task 1 and Task 2 into single commit since they form a cohesive feature (types + components)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Impact Analysis frontend complete and connected to backend API
- Ready for Plan 06 (Refactor Python backend tests)
- UI tests should be added for Impact Analysis components in future testing phase

## Self-Check: PASSED

All files verified:
- lineage-ui/src/api/hooks/useImpact.ts: FOUND
- lineage-ui/src/components/domain/ImpactAnalysis/ImpactTable.tsx: FOUND
- lineage-ui/src/components/domain/ImpactAnalysis/ImpactSummary.tsx: FOUND
- lineage-ui/src/components/domain/ImpactAnalysis/ImpactAnalysis.tsx: FOUND
- lineage-ui/src/features/ImpactPage.tsx: FOUND

Commit verified:
- 6496af1: FOUND

---
*Phase: 01-foundation-refactoring-impact-analysis-core*
*Completed: 2026-02-14*
