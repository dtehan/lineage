---
phase: 24-efficient-incremental-ol-database-updates
plan: 01
subsystem: database
tags: [teradata, watermark, incremental, populate, sql]

# Dependency graph
requires: []
provides:
  - WatermarkStore class for tracking incremental populate runs
  - OL_POPULATE_LOG DDL in setup_lineage_schema.py
  - migrate_add_populate_log.py for existing deployments
  - Unit tests for WatermarkStore with mocked cursor
affects:
  - 24-02 (dataset/field incremental populate will use WatermarkStore)
  - 24-03 (view lineage incremental populate will use WatermarkStore)
  - 24-04 (DBQL incremental populate will use WatermarkStore)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "UPDATE-then-conditional-INSERT upsert pattern for Teradata watermarks"
    - "CURRENT_TIMESTAMP(0) from SQL (not Python datetime.now()) to avoid timezone drift"
    - "Exception-safe watermark methods — failures never abort populate runs"
    - "TDD with unittest.mock.MagicMock for Teradata cursor"

key-files:
  created:
    - database/scripts/populate/watermark_store.py
    - database/scripts/setup/migrate_add_populate_log.py
    - database/tests/test_watermark_store.py
  modified:
    - database/scripts/setup/setup_lineage_schema.py

key-decisions:
  - "WatermarkStore uses CURRENT_TIMESTAMP(0) from Teradata SQL, not Python datetime.now(), to avoid timezone mismatch between Python process and Teradata server"
  - "All WatermarkStore methods are exception-safe (catch-all) so watermark failures never abort populate runs"
  - "UPDATE-then-conditional-INSERT pattern (not MERGE) for upsert, matching proven archive/extract_dbql_lineage.py approach"
  - "OL_POPULATE_LOG added at top of tables_to_drop list so it is dropped first in fresh setup (no dependencies)"

patterns-established:
  - "Exception-safe watermark pattern: wrap all DB ops in try/except, return None on failure, pass silently on write failures"
  - "Upsert via UPDATE then conditional INSERT with NOT EXISTS (avoids MERGE syntax complexity)"

requirements-completed: [INC-01, INC-02]

# Metrics
duration: 12min
completed: 2026-03-05
---

# Phase 24 Plan 01: Watermark Infrastructure Summary

**WatermarkStore class with get/set/clear methods backed by OL_POPULATE_LOG Teradata table, enabling exception-safe incremental populate tracking for DATASETS, FIELDS, VIEW_LINEAGE, and DBQL sources**

## Performance

- **Duration:** 12 min
- **Started:** 2026-03-05T02:54:32Z
- **Completed:** 2026-03-05T03:07:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- WatermarkStore class with get/set/clear/clear_all methods — all exception-safe, never abort populate runs
- OL_POPULATE_LOG DDL added to setup_lineage_schema.py for fresh installs
- migrate_add_populate_log.py standalone migration for existing deployments (skips if table exists, no drops)
- 12 unit tests passing with unittest.mock.MagicMock cursor (covers all 8 behaviors from plan)

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): Failing tests for WatermarkStore** - `be012ab` (test)
2. **Task 1 (GREEN): WatermarkStore class + DDL + migration script** - `7ad1c1c` (feat)

_Note: TDD tasks have two commits (test RED then feat GREEN)_

## Files Created/Modified

- `database/scripts/populate/watermark_store.py` - WatermarkStore class with SOURCE_* constants, get/set/clear/clear_all methods
- `database/scripts/setup/setup_lineage_schema.py` - OL_POPULATE_LOG DDL added to OL_DDL_STATEMENTS, table added to tables_to_drop list
- `database/scripts/setup/migrate_add_populate_log.py` - Standalone migration for existing deployments with --dry-run support
- `database/tests/test_watermark_store.py` - 12 unit tests verifying all WatermarkStore behaviors

## Decisions Made

- **CURRENT_TIMESTAMP(0) from SQL:** Used Teradata server-side timestamp in all SET operations to avoid timezone mismatch between Python process and Teradata server clock.
- **Exception-safe design:** All WatermarkStore methods catch all exceptions silently — watermark failures must never abort a populate run (non-critical infrastructure).
- **UPDATE-then-conditional-INSERT:** Matched the proven pattern from archive/extract_dbql_lineage.py. UPDATE fires first, then INSERT with NOT EXISTS guard prevents duplicate rows.
- **OL_POPULATE_LOG at top of tables_to_drop:** Ensures it is dropped first during fresh schema setup since no other tables depend on it.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

Existing deployments: run `python database/scripts/setup/migrate_add_populate_log.py` to add OL_POPULATE_LOG. Fresh installs: table is included automatically in setup_lineage_schema.py.

## Next Phase Readiness

- WatermarkStore is ready for use by all three incremental populate paths
- Plans 24-02, 24-03, 24-04 can import `from scripts.populate.watermark_store import WatermarkStore`
- No blockers

---
*Phase: 24-efficient-incremental-ol-database-updates*
*Completed: 2026-03-05*
