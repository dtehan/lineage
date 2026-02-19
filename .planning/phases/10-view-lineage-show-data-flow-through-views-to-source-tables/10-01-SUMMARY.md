---
phase: 10-view-lineage-show-data-flow-through-views-to-source-tables
plan: 01
subsystem: api
tags: [python, flask, lineage, sourceType, views, openlineage]

# Dependency graph
requires:
  - phase: 09-view-lineage-show-data-flow-through-views-to-source-tables
    provides: View rendering infrastructure (orange border, eye icon, VIEW badge) already in frontend openLineageAdapter.ts; database lineage endpoint already propagates sourceType correctly
provides:
  - sourceType propagation in column lineage endpoint (get_column_lineage_graph)
  - sourceType propagation in table lineage endpoint (get_table_lineage_graph)
  - _get_source_type() helper with per-request caching to prevent N+1 queries
  - get_dataset_with_namespace() returns source_type for root dataset lookup
  - 10 unit tests validating all sourceType propagation paths
affects:
  - frontend openLineageAdapter.ts (reads olNode.dataset.sourceType - now populated for column/table lineage)
  - any future lineage service work (caching pattern and _build_node signature established)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pre-seed source_type_cache with root dataset from get_dataset_with_namespace() to avoid redundant OL_DATASET lookups"
    - "_get_source_type() caching helper: check cache -> call get_dataset_metadata -> default TABLE on miss"
    - "camelCase sourceType key in node dataset dict (contract with frontend openLineageAdapter.ts)"

key-files:
  created:
    - lineage-api/tests/test_lineage_service.py
  modified:
    - lineage-api/services/lineage_service.py
    - lineage-api/repositories/dataset_repository.py

key-decisions:
  - "source_type_cache is pre-seeded with root dataset from get_dataset_with_namespace() to avoid re-querying OL_DATASET for the most common node"
  - "source_type parameter defaults to TABLE in _build_node() for backward compatibility and graceful degradation"
  - "_add_lineage_results() accepts optional source_type_cache=None (creates empty dict if None) for backward compatibility"
  - "get_dataset_with_namespace() extended with source_type field (backward-compatible: callers that ignore it are unaffected)"

patterns-established:
  - "Pattern 1: sourceType propagation - all three lineage endpoints (column, table, database) now consistently use sourceType in node dataset dict"
  - "Pattern 2: Cache-then-default - _get_source_type follows check-cache -> lookup -> default-TABLE pattern used throughout database lineage"

# Metrics
duration: 2min
completed: 2026-02-19
---

# Phase 10 Plan 01: View Lineage sourceType Propagation Summary

**sourceType now flows from OL_DATASET through column and table lineage endpoints to frontend nodes, enabling view-specific rendering (orange border, eye icon, VIEW badge) for all three lineage graph types**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-19T16:56:20Z
- **Completed:** 2026-02-19T16:58:40Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Extended `get_dataset_with_namespace()` to return `source_type` from OL_DATASET alongside name and namespace_uri
- Added `source_type` parameter to `_build_node()` and `sourceType` to node `dataset` dict (camelCase, matching database lineage pattern)
- Added `_get_source_type()` helper with per-request dict cache to prevent N+1 queries to OL_DATASET
- Updated `_add_lineage_results()` to call `_get_source_type()` for every source and target dataset
- Updated `get_column_lineage_graph()` and `get_table_lineage_graph()` to extract root dataset sourceType and pre-seed cache
- Created 10 unit tests covering all sourceType propagation paths using mocks only

## Task Commits

Each task was committed atomically:

1. **Task 1: Add sourceType propagation to column and table lineage endpoints** - `3cc2a4a` (feat)
2. **Task 2: Unit tests for sourceType propagation in lineage service** - `a99fdcd` (test)

**Plan metadata:** TBD (docs: complete plan)

## Files Created/Modified
- `lineage-api/services/lineage_service.py` - Added _build_node source_type param, _get_source_type() helper, updated _add_lineage_results() and both lineage graph methods
- `lineage-api/repositories/dataset_repository.py` - Extended get_dataset_with_namespace() with d.source_type in SELECT and returned dict
- `lineage-api/tests/test_lineage_service.py` - 10 unit tests: _build_node default/VIEW, _get_source_type cache/fallback/VIEW, _add_lineage_results propagation, column lineage root and traversed nodes, table lineage root nodes and mixed types

## Decisions Made
- Pre-seed source_type_cache with root dataset from get_dataset_with_namespace() to avoid re-querying OL_DATASET for the most common node in each graph
- source_type defaults to "TABLE" in _build_node() for graceful degradation when OL_DATASET has no entry
- _add_lineage_results() optional source_type_cache parameter (None creates empty dict) maintains backward compatibility
- get_dataset_with_namespace() backward-compatible extension: callers that don't read source_type are unaffected

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All three lineage endpoints now consistently propagate sourceType: column, table, and database
- Frontend openLineageAdapter.ts reads `olNode.dataset.sourceType` - this contract is now satisfied for all endpoints
- Views will render with orange borders, eye icons, and VIEW badges when their source_type is 'VIEW' in OL_DATASET
- No frontend changes required - the rendering infrastructure was already in place

---
*Phase: 10-view-lineage-show-data-flow-through-views-to-source-tables*
*Completed: 2026-02-19*
