---
phase: 23-standalone-table-rendering
plan: 02
subsystem: ui
tags: [react, typescript, asset-browser, lineage-indicator, teradata, openlineage]

# Dependency graph
requires:
  - phase: 22-full-system-catalog
    provides: populated OL_DATASET catalog with catalog-only and lineage-connected tables; OL_COLUMN_LINEAGE with source_dataset and target_dataset string columns

provides:
  - list_datasets API response includes hasLineage boolean per dataset via EXISTS subquery on OL_COLUMN_LINEAGE
  - OpenLineageDataset TypeScript interface has optional hasLineage boolean field
  - AssetBrowser DatasetItem renders blue dot indicator (has-lineage-indicator) for tables with hasLineage===true
  - 4 new TC-COMP-033 tests covering all hasLineage states (true/false/undefined) and accessibility

affects:
  - 23-standalone-table-rendering (plan 03 if any)
  - any future plan reading list_datasets API response
  - any future plan using OpenLineageDataset type

# Tech tracking
tech-stack:
  added: []
  patterns:
    - CASE WHEN EXISTS subquery on related table for boolean flag in paginated SELECT
    - Strict equality (=== true) for optional boolean field to prevent undefined triggering indicator
    - Tooltip-wrapped accessibility span for non-text visual indicators

key-files:
  created: []
  modified:
    - lineage-api/repositories/dataset_repository.py
    - lineage-ui/src/types/openlineage.ts
    - lineage-ui/src/components/domain/AssetBrowser/AssetBrowser.tsx
    - lineage-ui/src/components/domain/AssetBrowser/AssetBrowser.test.tsx

key-decisions:
  - "has_lineage uses CASE WHEN EXISTS (SELECT 1 FROM OL_COLUMN_LINEAGE cl WHERE TRIM(cl.source_dataset) = TRIM(d.name) OR TRIM(cl.target_dataset) = TRIM(d.name)) — matches both directions with TRIM for Teradata CHAR padding"
  - "Row index 8 for has_lineage (0-indexed after dataset_id=0, dataset_name=1, namespace_id=2, namespace_uri=3, description=4, source_type=5, created_at=6, updated_at=7)"
  - "hasLineage is optional (?) in TypeScript for backward compat — endpoints not returning it default to undefined, indicator doesn't show"
  - "Indicator positioned after table name inside the table-name button, wrapped in Tooltip with 'Has lineage connections'"

patterns-established:
  - "Pattern: EXISTS subquery for has_* boolean in list query — use CASE WHEN EXISTS (correlated subquery) THEN 'Y' ELSE 'N' END, convert to bool in Python with (strip(row[N]) == 'Y') if row[N] else False"

# Metrics
duration: 2min
completed: 2026-02-23
---

# Phase 23 Plan 02: Has Lineage Indicator Summary

**Backend EXISTS subquery on OL_COLUMN_LINEAGE adds hasLineage boolean to list_datasets; AssetBrowser renders blue dot indicator with tooltip for lineage-connected tables**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-23T23:08:48Z
- **Completed:** 2026-02-23T23:10:45Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Backend list_datasets query adds CASE WHEN EXISTS subquery against OL_COLUMN_LINEAGE to produce has_lineage per dataset row; mapped to hasLineage boolean in JSON response
- TypeScript OpenLineageDataset interface gains optional hasLineage boolean field for backward compatibility
- DatasetItem component renders small blue circle (w-2 h-2 rounded-full bg-blue-500) after table name when dataset.hasLineage === true, wrapped in Tooltip with "Has lineage connections"
- 4 new TC-COMP-033 tests cover indicator shown for true, not shown for false, not shown for undefined, and correct aria-label

## Task Commits

Each task was committed atomically:

1. **Task 1: Backend — Add has_lineage field to list_datasets query and response** - `66ec478` (feat)
2. **Task 2: Frontend — Add hasLineage type and render indicator in AssetBrowser** - `5eeed49` (feat)

**Plan metadata:** see below (docs commit)

## Files Created/Modified
- `lineage-api/repositories/dataset_repository.py` - Added CASE WHEN EXISTS has_lineage subquery to inner SELECT, added has_lineage to outer SELECT, added "hasLineage" to row-to-dict mapping at row[8]
- `lineage-ui/src/types/openlineage.ts` - Added hasLineage?: boolean to OpenLineageDataset interface after sourceType
- `lineage-ui/src/components/domain/AssetBrowser/AssetBrowser.tsx` - Added has-lineage-indicator span with Tooltip inside DatasetItem table-name button, rendered conditionally on dataset.hasLineage === true
- `lineage-ui/src/components/domain/AssetBrowser/AssetBrowser.test.tsx` - Added mockDatasetsWithLineageIndicators fixture and TC-COMP-033 describe block with 4 test cases

## Decisions Made
- TRIM() on both sides of the EXISTS join to handle Teradata CHAR column padding — dataset names stored as CHAR may have trailing spaces vs VARCHAR in OL_COLUMN_LINEAGE
- Strict equality `=== true` (not truthy) ensures undefined (from older API endpoints or non-list routes) does not trigger the indicator
- Optional `?` on hasLineage in TypeScript type for backward compatibility; older API calls not returning the field don't break the interface

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Has lineage indicator live in Asset Browser; users can now see at a glance which tables have lineage data worth exploring
- Backend query performance bounded by limit:500 per database expand (Phase 22 decision); EXISTS with TRIM may not use indexes on some Teradata versions — noted as future optimization if needed
- Phase 23 plan 01 (if any) or further standalone table rendering work can proceed

## Self-Check: PASSED

- FOUND: lineage-api/repositories/dataset_repository.py
- FOUND: lineage-ui/src/types/openlineage.ts
- FOUND: lineage-ui/src/components/domain/AssetBrowser/AssetBrowser.tsx
- FOUND: lineage-ui/src/components/domain/AssetBrowser/AssetBrowser.test.tsx
- FOUND: .planning/phases/23-standalone-table-rendering/23-02-SUMMARY.md
- FOUND: commit 66ec478 (Task 1)
- FOUND: commit 5eeed49 (Task 2)

---
*Phase: 23-standalone-table-rendering*
*Completed: 2026-02-23*
