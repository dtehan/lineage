---
phase: 20-backend-statistics-and-ddl-api
plan: 04
subsystem: api, ui
tags: [teradata, dbc, row-count, ddl, show-table, prism-react-renderer, syntax-highlighting]

# Dependency graph
requires:
  - phase: 20-01
    provides: "Statistics and DDL endpoint skeleton with DBC queries"
  - phase: 20-03
    provides: "Dataset ID format mismatch fix (OR name = ? fallback)"
  - phase: 21-01
    provides: "Frontend DDLTab component with prism-react-renderer"
provides:
  - "Row count display works when any index has statistics (not just IndexNumber=1)"
  - "Table DDL via SHOW TABLE displayed with syntax highlighting"
  - "tableDdl field on DatasetDDL struct/response"
affects: [UAT-verification, frontend-detail-panel]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "MAX aggregate on DBC.TableStatsV for robust row count retrieval"
    - "SHOW TABLE command for table DDL extraction in Teradata"

key-files:
  created: []
  modified:
    - "lineage-api/python_server.py"
    - "lineage-api/internal/adapter/outbound/teradata/openlineage_repo.go"
    - "lineage-api/internal/domain/entities.go"
    - "lineage-ui/src/types/openlineage.ts"
    - "lineage-ui/src/components/domain/LineageGraph/DetailPanel/DDLTab.tsx"
    - "lineage-ui/src/components/domain/LineageGraph/DetailPanel.test.tsx"

key-decisions:
  - "Use MAX(RowCount) without IndexNumber filter for robust statistics retrieval"
  - "Use Teradata SHOW TABLE command for CREATE TABLE DDL extraction"
  - "tableDdl field added with omitempty to avoid breaking existing clients"
  - "Explicit showRows.Close() instead of defer inside conditional block"

patterns-established:
  - "SHOW TABLE multi-row result concatenation with newline join"

# Metrics
duration: 3min
completed: 2026-02-07
---

# Phase 20 Plan 04: Row Count Fix and Table DDL Summary

**MAX(RowCount) without IndexNumber filter for robust statistics, SHOW TABLE DDL with syntax highlighting for tables**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-07T22:25:20Z
- **Completed:** 2026-02-07T22:28:33Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Statistics tab now displays actual row count by querying MAX(RowCount) from DBC.TableStatsV without IndexNumber=1 restriction
- DDL tab displays CREATE TABLE DDL for tables using Teradata SHOW TABLE command with SQL syntax highlighting
- Both Python and Go backends updated consistently with graceful error handling
- Frontend renders three cases: view SQL, table DDL, or fallback message

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix row count query and add table DDL in Python and Go backends** - `912d30b` (fix)
2. **Task 2: Update frontend to display table DDL with syntax highlighting** - `b48a8fc` (feat)

## Files Created/Modified
- `lineage-api/python_server.py` - MAX(RowCount) query fix + SHOW TABLE DDL for tables
- `lineage-api/internal/adapter/outbound/teradata/openlineage_repo.go` - Same fixes in Go backend
- `lineage-api/internal/domain/entities.go` - TableDDL field on DatasetDDL struct
- `lineage-ui/src/types/openlineage.ts` - tableDdl field on DatasetDDLResponse
- `lineage-ui/src/components/domain/LineageGraph/DetailPanel/DDLTab.tsx` - Three-way conditional rendering for view/table/fallback
- `lineage-ui/src/components/domain/LineageGraph/DetailPanel.test.tsx` - Updated fallback test + new table DDL test

## Decisions Made
- **MAX(RowCount) over all indexes:** The original query filtered on IndexNumber=1, which returns no rows when statistics are only collected on non-primary indexes or when index numbering differs. MAX across all indexes captures whichever index has statistics.
- **SHOW TABLE for DDL:** Teradata's SHOW TABLE command returns the full CREATE TABLE DDL as multi-row text output. Each row is a fragment that must be joined with newlines.
- **omitempty on tableDdl:** The new field uses `omitempty` so existing clients that don't expect it won't receive an empty string.
- **Explicit Close() for showRows:** Used explicit `showRows.Close()` after the scan loop instead of defer inside the conditional block for clarity.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-existing test failure in `TC-PANEL-07: Tab state resets on selection change` (edge details rendering) - unrelated to this plan, did not regress or fix.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Row count and table DDL gaps are closed
- Ready for UAT re-verification to confirm statistics show actual values and DDL tab renders for tables
- All 11 Go handler tests pass, 49/50 DetailPanel tests pass (1 pre-existing failure unrelated)

---
*Phase: 20-backend-statistics-and-ddl-api*
*Completed: 2026-02-07*
