---
phase: 31-cache-control-and-observability
plan: 02
subsystem: ui
tags: [react, tanstack-query, cache-bypass, refresh, lucide-react]

# Dependency graph
requires:
  - phase: 31-01
    provides: Backend ?refresh=true cache bypass parameter on all v2 endpoints
provides:
  - Refresh button in lineage graph toolbar (RefreshCw icon)
  - Refresh button in asset browser header
  - API client methods with optional refresh parameter
  - TanStack Query cache update after cache-bypass fetch
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Cache bypass via manual fetch + setQueryData (not invalidateQueries) to control exactly when refresh=true is sent"
    - "isFetching vs isLoading distinction for refresh spinner (spin only during refetch, not initial load)"

key-files:
  modified:
    - lineage-ui/src/types/openlineage.ts
    - lineage-ui/src/api/client.ts
    - lineage-ui/src/components/domain/LineageGraph/Toolbar.tsx
    - lineage-ui/src/components/domain/LineageGraph/LineageGraph.tsx
    - lineage-ui/src/components/domain/AssetBrowser/AssetBrowser.tsx

key-decisions:
  - "Manual fetch + setQueryData instead of invalidateQueries -- ensures refresh=true is sent to backend for cache bypass"
  - "Refresh button disabled during isLoading (initial load) but enabled during isFetching (background refetch)"
  - "Asset browser refresh fetches both namespaces and datasets in parallel with Promise.all"
  - "Lineage toolbar refresh targets exact TanStack query key matching hook's key pattern"

patterns-established:
  - "Cache bypass pattern: call API directly with refresh=true, then setQueryData to update TanStack cache"
  - "Refresh button convention: RefreshCw icon with animate-spin class during isFetching"

# Metrics
duration: 4min
completed: 2026-02-12
---

# Phase 31 Plan 02: UI Refresh Buttons Summary

**RefreshCw buttons in lineage toolbar and asset browser sending ?refresh=true for cache bypass with TanStack Query cache updates**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-13T03:05:45Z
- **Completed:** 2026-02-13T03:10:09Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Added refresh parameter support to all API client methods (lineage, namespaces, datasets, statistics, DDL, search)
- Added RefreshCw refresh button to lineage graph toolbar that fetches data with ?refresh=true and updates TanStack Query cache
- Added RefreshCw refresh button to asset browser header that bypasses cache for namespaces and datasets
- Both buttons show spinning animation during refetch and are disabled during initial load

## Task Commits

Each task was committed atomically:

1. **Task 1: Add refresh parameter support to API client and types** - `6ecb1af` (feat)
2. **Task 2: Add refresh button to lineage toolbar and asset browser, wire up cache bypass** - `7ac90b5` (feat)

## Files Created/Modified
- `lineage-ui/src/types/openlineage.ts` - Added refresh?: boolean to LineageQueryParams
- `lineage-ui/src/api/client.ts` - All API methods accept optional refresh parameter, pass ?refresh=true when set
- `lineage-ui/src/components/domain/LineageGraph/Toolbar.tsx` - Added RefreshCw button with onRefresh/isFetching props
- `lineage-ui/src/components/domain/LineageGraph/LineageGraph.tsx` - Wired handleRefresh callback using openLineageApi + setQueryData
- `lineage-ui/src/components/domain/AssetBrowser/AssetBrowser.tsx` - Added RefreshCw button in header, handleRefresh with Promise.all

## Decisions Made
- Used manual fetch + setQueryData pattern (not invalidateQueries) to ensure ?refresh=true is sent to the backend for actual cache bypass
- Refresh button disabled during isLoading (initial load) but active during background refetch, preventing double-fetch on mount
- Asset browser refresh fetches namespaces and datasets in parallel using Promise.all for speed
- Lineage toolbar refresh targets the exact TanStack query key `['openlineage', 'table-lineage', datasetId, direction, maxDepth]` matching the hook

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - all 5 files modified cleanly, TypeScript compilation passed on both tasks, and test results showed zero regressions (6 pre-existing test failures in legacy test files remain unchanged).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- v6.0 Redis Caching Layer milestone is now fully complete
- Cache infrastructure (Phase 28), integration (Phase 29), graceful degradation (Phase 30), and cache control + observability (Phase 31) all delivered
- Users can force fresh data via UI refresh buttons when Teradata data changes

---
*Phase: 31-cache-control-and-observability*
*Completed: 2026-02-12*
