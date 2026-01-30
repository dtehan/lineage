---
phase: 08-open-lineage-standard-alignment
plan: 06
subsystem: frontend
tags: [openlineage, typescript, react, tanstack-query, hooks]

# Dependency graph
requires:
  - phase: 08-05
    provides: OpenLineage API service layer and v2 endpoints
provides:
  - OpenLineage TypeScript types (11 interfaces/types)
  - OpenLineage API client methods (6 methods)
  - OpenLineage React hooks (8 hooks)
  - Type re-exports from types index
affects: [08-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Query key factory for hierarchical TanStack Query cache management"
    - "Separate axios client instance for v2 API endpoints"
    - "Enabled flags for conditional data fetching"

key-files:
  created:
    - lineage-ui/src/types/openlineage.ts
    - lineage-ui/src/api/hooks/useOpenLineage.ts
  modified:
    - lineage-ui/src/api/client.ts
    - lineage-ui/src/types/index.ts

key-decisions:
  - "TypeScript types mirror backend DTO structure exactly (camelCase JSON)"
  - "Separate apiClientV2 axios instance without /api/v1 baseURL"
  - "Query key factory (openLineageKeys) for consistent cache invalidation"
  - "Hooks use enabled flag to prevent invalid requests"
  - "Re-export OpenLineage types from types/index.ts barrel"

patterns-established:
  - "Query key factory pattern for TanStack Query cache management"
  - "Separate v2 API client for OpenLineage endpoints"
  - "UseQueryOptions spreading for hook composition"

# Metrics
duration: 2min
completed: 2026-01-30
---

# Phase 8 Plan 6: Frontend Types and Hooks Summary

**OpenLineage TypeScript types and TanStack Query hooks for consuming v2 API endpoints with type-safe data fetching**

## Performance

- **Duration:** 2 min
- **Started:** 2026-01-30T03:38:33Z
- **Completed:** 2026-01-30T03:40:55Z
- **Tasks:** 4
- **Files created:** 2
- **Files modified:** 2

## Accomplishments
- Created 11 TypeScript interfaces/types for OpenLineage data structures
- Added 6 API client methods for v2 endpoints (namespaces, datasets, lineage)
- Created 8 React hooks with TanStack Query integration
- Added query key factory for hierarchical cache key management
- Re-exported types from types/index.ts for convenient imports

## Task Commits

Each task was committed atomically:

1. **Task 1: Create OpenLineage TypeScript types** - `e57be0f` (feat)
2. **Task 2: Add OpenLineage API client methods** - `4c552af` (feat)
3. **Task 3: Create OpenLineage React hooks** - `a298680` (feat)
4. **Task 4: Export new types and hooks** - `3aafaf2` (feat)

## Files Created/Modified

### Created
- `lineage-ui/src/types/openlineage.ts` - 11 TypeScript interfaces/types for OpenLineage data
- `lineage-ui/src/api/hooks/useOpenLineage.ts` - 8 React hooks for data fetching

### Modified
- `lineage-ui/src/api/client.ts` - Added v2 axios client and 6 API methods
- `lineage-ui/src/types/index.ts` - Added re-export for OpenLineage types

## TypeScript Types Created

| Type | Purpose |
|------|---------|
| `OpenLineageNamespace` | Namespace entity |
| `OpenLineageDataset` | Dataset entity with fields |
| `OpenLineageField` | Field/column entity |
| `OpenLineageTransformation` | Transformation type/subtype |
| `TransformationSubtype` | 9 subtype values |
| `OpenLineageNode` | Lineage graph node |
| `OpenLineageEdge` | Lineage graph edge |
| `OpenLineageGraph` | Graph with nodes/edges |
| `OpenLineageLineageResponse` | Full lineage API response |
| `LineageDirection` | upstream/downstream/both |
| `OpenLineagePaginationParams` | Pagination query params |

## React Hooks Created

| Hook | Purpose |
|------|---------|
| `useOpenLineageNamespaces` | Fetch all namespaces |
| `useOpenLineageNamespace` | Fetch single namespace |
| `useOpenLineageDatasets` | Fetch datasets with pagination |
| `useOpenLineageDataset` | Fetch single dataset by ID |
| `useOpenLineageDatasetSearch` | Search datasets by query |
| `useOpenLineageGraph` | Fetch lineage graph for field |
| `useOpenLineageFieldLineage` | Simplified lineage hook |
| `openLineageKeys` | Query key factory |

## Decisions Made
- TypeScript types mirror backend DTO structure exactly (camelCase JSON fields)
- Separate apiClientV2 axios instance avoids /api/v1 prefix for v2 endpoints
- Query key factory (openLineageKeys) enables hierarchical cache invalidation
- Hooks use `enabled` flag to prevent requests with empty IDs
- OpenLineage types re-exported from types/index.ts barrel export

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

**Pre-existing TypeScript errors in codebase:**
- Test files have TanStack Query mock type mismatches (AssetBrowser.test.tsx)
- layoutEngine.ts has React Flow Node type incompatibilities
- These are unrelated to new OpenLineage code and existed before this plan

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Types and hooks ready for component integration
- All existing v1 types and hooks remain unchanged
- Ready for UI component updates to use OpenLineage data (08-07)

---
*Phase: 08-open-lineage-standard-alignment*
*Completed: 2026-01-30*
