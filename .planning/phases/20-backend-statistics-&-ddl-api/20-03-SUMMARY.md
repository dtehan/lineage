---
phase: 20-backend-statistics-and-ddl-api
plan: 03
subsystem: api
tags: [teradata, openlineage, dataset-id, statistics, ddl, python, go]

# Dependency graph
requires:
  - phase: 20-backend-statistics-and-ddl-api (plans 01-02)
    provides: Statistics and DDL endpoints that query DBC system views
provides:
  - Statistics and DDL endpoints accept dataset name ("database.table") OR full dataset_id ("namespace_hash/database.table")
  - Canonical dataset_id always returned in responses regardless of input format
affects: [20-UAT, frontend-detail-panel]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "OR name fallback pattern: WHERE dataset_id = ? OR name = ? for flexible ID lookup"
    - "Resolved ID passthrough: service layer resolves name to canonical ID before passing to repo"

key-files:
  created: []
  modified:
    - lineage-api/python_server.py
    - lineage-api/internal/adapter/outbound/teradata/openlineage_repo.go
    - lineage-api/internal/application/openlineage_service.go
    - lineage-api/internal/domain/mocks/repositories.go

key-decisions:
  - "OR clause on both dataset_id and name columns for flexible lookup"
  - "resolved_name used for parsing instead of raw input to avoid namespace prefix issues"
  - "Service layer passes ds.ID (canonical) to repo methods, not raw user input"
  - "parseDatasetName made format-agnostic: handles both namespace/db.table and db.table"
  - "Mock GetDataset matches by ID or Name for test compatibility"

patterns-established:
  - "Flexible dataset lookup: all dataset-by-ID queries use OR name = ? fallback"
  - "ID resolution at service layer: service resolves to canonical ID, repo always gets canonical"

# Metrics
duration: 3min
completed: 2026-02-07
---

# Phase 20 Plan 03: Fix Dataset ID Format Mismatch Summary

**OR-clause dataset lookup in Python and Go backends so statistics/DDL endpoints accept "database.table" name format alongside full dataset_id**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-07T21:44:27Z
- **Completed:** 2026-02-07T21:47:11Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Python Flask statistics and DDL endpoints now match by dataset_id OR "name" column
- Go backend GetDataset, GetDatasetStatistics, GetDatasetDDL all resolve by ID or name
- parseDatasetName made format-agnostic (no longer requires "/" in input)
- Service layer passes resolved canonical ID to repo methods
- All 11 existing Go handler tests pass without modification
- Response always contains canonical dataset_id regardless of input format

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix Python Flask statistics and DDL endpoints** - `b2461e1` (fix)
2. **Task 2: Fix Go backend service/repo/mock layers** - `9a2d40b` (fix)

## Files Created/Modified
- `lineage-api/python_server.py` - Statistics and DDL endpoints: OR "name" = ? in OL_DATASET lookup, use resolved_name for parsing
- `lineage-api/internal/adapter/outbound/teradata/openlineage_repo.go` - GetDataset, GetDatasetStatistics, GetDatasetDDL: OR "name" = ? queries; parseDatasetName handles both formats
- `lineage-api/internal/application/openlineage_service.go` - GetDatasetStatistics and GetDatasetDDL pass ds.ID (resolved) to repo instead of raw input
- `lineage-api/internal/domain/mocks/repositories.go` - Mock GetDataset matches by ID or Name

## Decisions Made
- Used OR clause on dataset_id and "name" columns rather than a separate resolution step, keeping changes minimal
- parseDatasetName now treats "/" as optional, making it format-agnostic for both name and dataset_id inputs
- Service layer acts as ID resolver: the raw user input stops at the service, repo always receives canonical dataset_id
- Mock updated to match by Name field too, so tests with name-only lookups work correctly

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- UAT tests 1-4 (statistics/DDL functionality) should now pass -- the root cause (404 from name format mismatch) is resolved
- UAT tests 5-9 (error handling) can be retested for verification
- Frontend DetailPanel sends "database.table" format which now resolves correctly

---
*Phase: 20-backend-statistics-and-ddl-api*
*Completed: 2026-02-07*
