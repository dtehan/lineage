---
phase: 24-efficient-incremental-ol-database-updates
plan: 03
subsystem: database
tags: [python, teradata, incremental, watermark, populate, altertimestamp]

# Dependency graph
requires:
  - phase: 24-01
    provides: WatermarkStore class with get/set/clear/clear_all for OL_POPULATE_LOG
  - phase: 24-02
    provides: ViewLineageExtractor.since param, DBQLExtractor auto-managed watermark
provides:
  - "Fully incremental populate_lineage.py orchestrator with all 4 watermark paths wired"
  - "populate_openlineage_datasets() filters by AlterTimeStamp when watermark exists"
  - "populate_openlineage_fields() filters by AlterTimeStamp, deletes/re-inserts changed table fields"
  - "HELP COLUMN view type resolution scoped to changed views only in incremental mode"
  - "cleanup_stale_datasets() soft-deletes datasets for dropped tables/views"
  - "--reset-watermark SOURCE CLI flag resets specific or all watermarks and exits"
  - "--no-cleanup CLI flag skips stale dataset deactivation"
  - "--full-refresh clears all watermarks before running"
  - "9 integration tests verifying AlterTimeStamp filtering with mocked cursor"
affects: [populate-lineage, incremental-updates, watermark-management]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "AlterTimeStamp incremental filter pattern: COALESCE(AlterTimeStamp, CreateTimeStamp) > CAST(? AS TIMESTAMP(0))"
    - "Delete-then-reinsert for changed table fields: find changed tables via AlterTimeStamp != CreateTimeStamp, delete OL_DATASET_FIELD rows, reinsert fresh"
    - "Stale dataset soft-delete: UPDATE is_active='N' WHERE NOT EXISTS in DBC.TablesV"
    - "Lazy import mock pattern: patch.object on the module where class is defined, reload consuming module"

key-files:
  created:
    - database/tests/test_incremental_populate.py
  modified:
    - database/scripts/populate/populate_lineage.py

key-decisions:
  - "View lineage patch target: ViewLineageExtractor is imported lazily inside populate_lineage_from_views(), so tests use patch.object on the view_lineage_extractor module rather than the populate_lineage module namespace"
  - "view_list query parameter order: view_alter_ts_filter param placed before namespace_id in the combined params list to match SQL WHERE clause ordering (filter before EXISTS subquery)"
  - "No module-level import of ViewLineageExtractor in populate_lineage.py -- lazy import preserved to keep startup fast and avoid import chain issues on environments without sqlglot"

patterns-established:
  - "Incremental population pattern: read watermark -> filter query by COALESCE(AlterTimeStamp, CreateTimeStamp) -> write watermark after success"
  - "Changed-field refresh pattern: query changed tables (AlterTimeStamp != CreateTimeStamp) -> DELETE existing field rows -> INSERT fresh with AlterTimeStamp filter"

requirements-completed: [INC-05, INC-06, INC-07, INC-08]

# Metrics
duration: 4min
completed: 2026-03-05
---

# Phase 24 Plan 03: Incremental Population Orchestration Summary

**Fully incremental populate_lineage.py with AlterTimeStamp watermark filtering for datasets, fields, view resolution, and stale cleanup -- all 4 sources wired with read/write watermark lifecycle**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-05T03:02:13Z
- **Completed:** 2026-03-05T03:06:35Z
- **Tasks:** 3
- **Files modified:** 2

## Accomplishments
- populate_openlineage_datasets() and populate_openlineage_fields() now accept `since` and filter DBC.TablesV by COALESCE(AlterTimeStamp, CreateTimeStamp) > watermark
- Changed table fields are deleted and re-inserted on incremental runs (capturing column additions/removals accurately)
- HELP COLUMN view type resolution scoped to only changed views when `since` is set (prevents unnecessary per-view queries)
- WatermarkStore wired into main(): reads before population, writes after each source completes
- --reset-watermark, --no-cleanup, and updated --full-refresh behavior with watermark clearing
- cleanup_stale_datasets() soft-deletes OL_DATASET rows for tables/views no longer in DBC.TablesV
- 9 integration tests covering AlterTimeStamp filtering, delete/reinsert, stale cleanup, view lineage passthrough, and full-refresh watermark clearing

## Task Commits

Each task was committed atomically:

1. **Task 1: Add incremental dataset and field population with AlterTimeStamp filtering** - `168ce93` (feat)
2. **Task 2: Wire watermarks into main(), add CLI flags, add stale cleanup** - `c7f2286` (feat)
3. **Task 3: Create integration tests for incremental population logic** - `3e02d83` (test)

## Files Created/Modified
- `database/scripts/populate/populate_lineage.py` - Added WatermarkStore/Optional imports, incremental filtering in datasets/fields functions, cleanup_stale_datasets(), since passthrough in populate_lineage_from_views(), CLI flags, watermark lifecycle in main()
- `database/tests/test_incremental_populate.py` - 9 integration tests for incremental population logic with mocked cursor

## Decisions Made
- **ViewLineageExtractor patch path:** The class is imported lazily inside `populate_lineage_from_views()` to avoid startup cost. Tests use `patch.object(vle_mod, 'ViewLineageExtractor')` and reload the consuming module, rather than patching a non-existent module-level attribute.
- **view_list query param order:** AlterTimeStamp filter param placed in `view_list_params` before `namespace_id` to match the SQL WHERE clause ordering (filter condition comes before EXISTS subquery param).
- **No lazy import change needed:** The lazy import of ViewLineageExtractor is preserved -- this is intentional for startup performance on environments without sqlglot installed.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- The `patch('scripts.populate.populate_lineage.ViewLineageExtractor')` patch path in the plan spec does not work because ViewLineageExtractor is a lazy import (not a module-level name). Fixed by using `patch.object` on the source module and reloading the consuming module. This is a standard Python mocking pattern for lazy imports.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 4 incremental population paths are fully wired (Plan 03 completes the phase)
- Phase 24 is complete: WatermarkStore (Plan 01) + extractor since params (Plan 02) + main orchestration (Plan 03)
- The incremental system is production-ready: subsequent populate runs will only process changed data

---
*Phase: 24-efficient-incremental-ol-database-updates*
*Completed: 2026-03-05*
