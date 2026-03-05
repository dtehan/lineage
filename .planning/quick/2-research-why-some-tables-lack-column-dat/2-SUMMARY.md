---
phase: quick-2
plan: 01
subsystem: api
tags: [python, lineage, bfs, teradata, OL_DATASET_FIELD]

# Dependency graph
requires:
  - phase: quick-1
    provides: "HELP COLUMN view column type resolution"
provides:
  - "_batch_resolve_external_field_metadata batch query for external node field types"
  - "External BFS nodes now have resolved columnType and nullable from OL_DATASET_FIELD"
affects: [database-lineage, bfs-graph, lineage_service]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Batch-after-BFS: collect external field keys during Phase 2 loop, resolve in one batch query after loop completes"
    - "Two-stage batch query: first resolve dataset IDs via OL_DATASET, then fetch fields via OL_DATASET_FIELD"

key-files:
  created: []
  modified:
    - lineage-api/services/lineage_service.py
    - lineage-api/tests/test_lineage_service.py

key-decisions:
  - "Resolve external field types with a single post-loop batch query (not per-node queries), consistent with the existing _batch_resolve_dataset_metadata pattern"
  - "Track external_field_keys list during Phase 2 BFS loop — only nodes added in Phase 2 (not in Phase 1) are external and need lookup"

patterns-established:
  - "Post-loop batch resolution: accumulate keys during loop, resolve all in one query after the loop exits"

requirements-completed:
  - fix-external-node-column-types

# Metrics
duration: 2min
completed: 2026-03-05
---

# Quick Task 2: Fix External Node Column Types in BFS Database Lineage

**Batch-resolves columnType and nullable for external BFS nodes via OL_DATASET_FIELD query after traversal loop, replacing hardcoded None values for cross-database lineage columns**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-05T00:20:27Z
- **Completed:** 2026-03-05T00:22:31Z
- **Tasks:** 1 (TDD with RED + GREEN)
- **Files modified:** 2

## Accomplishments

- Added `_batch_resolve_external_field_metadata` method that resolves field_type and nullable for a list of external field keys in a single pair of DB queries
- Updated `_get_database_lineage_bfs` Phase 2 loop to track external field keys instead of unconditionally setting columnType/nullable to None
- External nodes now have their actual column types resolved from OL_DATASET_FIELD after BFS traversal completes
- Added 7 new unit tests in `TestDatabaseLineageBfsExternalNodes` class; all 17 tests pass

## Task Commits

1. **Task 1: Add batch external field type lookup and fix external nodes** - `c4ada37` (feat)

## Files Created/Modified

- `/Users/Daniel.Tehan/Code/lineage/lineage-api/services/lineage_service.py` - Added `_batch_resolve_external_field_metadata`, updated `_get_database_lineage_bfs` to track and resolve external field keys
- `/Users/Daniel.Tehan/Code/lineage/lineage-api/tests/test_lineage_service.py` - Added `TestDatabaseLineageBfsExternalNodes` with 7 test cases

## Decisions Made

- Used a post-loop batch resolution pattern: accumulate `external_field_keys` list during the Phase 2 for-loop, then call `_batch_resolve_external_field_metadata` once after the loop. This mirrors the existing `_batch_resolve_dataset_metadata` pattern and avoids N+1 queries.
- Two-stage batch query: (1) resolve dataset names to dataset_ids via OL_DATASET, (2) fetch field_type/nullable from OL_DATASET_FIELD using those IDs. Needed because OL_DATASET_FIELD is keyed on dataset_id, not dataset name.

## Deviations from Plan

None - plan executed exactly as written. The test for `test_external_node_gets_column_type` required updating to account for the 3-cursor sequence (Phase 1, _batch_resolve_dataset_metadata, _batch_resolve_external_field_metadata) — this was an oversight in the plan's mock setup, not a deviation from the implementation design.

## Issues Encountered

Minor: initial test mock for `test_external_node_gets_column_type` did not account for the `_batch_resolve_dataset_metadata` cursor call that happens before `_batch_resolve_external_field_metadata`. Fixed by adding a third mock cursor in the sequence.

## Self-Check

- [x] `lineage-api/services/lineage_service.py` modified — contains `_batch_resolve_external_field_metadata`
- [x] `lineage-api/tests/test_lineage_service.py` modified — contains `TestDatabaseLineageBfsExternalNodes`
- [x] Commit `c4ada37` exists

## Self-Check: PASSED

---
*Phase: quick-2*
*Completed: 2026-03-05*
