---
phase: quick
plan: 1
subsystem: database
tags: [teradata, help-column, qvci, view-lineage, column-types, populate]

requires: []
provides:
  - HELP COLUMN-based view column type resolution (no QVCI dependency)
  - Actual data types (INTEGER, VARCHAR, DATE, etc.) for view fields in OL_DATASET_FIELD
  - Simplified _warm_cache_batch() using DBC.ColumnsV directly for tables
affects: [populate-lineage, wildcard-resolver, view-lineage]

tech-stack:
  added: []
  patterns:
    - "HELP COLUMN database.view.* for per-view type resolution without QVCI"
    - "INSERT from DBC.ColumnsV (column names/positions) then UPDATE field_type via HELP COLUMN"

key-files:
  created: []
  modified:
    - database/scripts/populate/populate_lineage.py
    - database/scripts/populate/wildcard_resolver.py
    - database/scripts/populate/test_wildcard_resolver.py

key-decisions:
  - "Use HELP COLUMN as the single approach for view column type resolution (replaces both DBC.ColumnsJQV and QVCI-disabled fallback)"
  - "View field INSERT strategy: INSERT from DBC.ColumnsV then UPDATE field_type per-view via HELP COLUMN (not per-view INSERT)"
  - "wildcard_resolver._warm_cache_batch() uses DBC.ColumnsV directly since it only processes tables (views handled via separate expansion path)"
  - "qvci_available parameter retained in populate_openlineage_fields() for API compatibility but no longer controls behavior"

patterns-established:
  - "HELP COLUMN result indices: [0]=Column Name, [1]=Type code, [4]=Max Length, [5]=Dec Total Digits, [6]=Dec Frac Digits"
  - "Type codes from HELP COLUMN are identical to DBC.ColumnsV ColumnType codes (I, CV, DA, SZ, etc.)"

requirements-completed: [QUICK-1]

duration: 45min
completed: 2026-03-04
---

# Quick Plan 1: Improve View Column Type Resolution Summary

**HELP COLUMN-based view field type resolution replaces QVCI dependency, resolving view column types (INTEGER, VARCHAR, etc.) on all Teradata environments without requiring QVCI to be enabled**

## Performance

- **Duration:** ~45 min
- **Completed:** 2026-03-04
- **Tasks:** 2 auto tasks + 1 decision checkpoint
- **Files modified:** 3

## Accomplishments

- Confirmed HELP COLUMN hypothesis: returns actual resolved types for view columns without QVCI (DBC.ColumnsV returns NULL for all view column types -- root cause of UNKNOWN types)
- Implemented `_resolve_view_field_types_via_help_column()` helper with full Python-side type mapping (mirrors SQL CASE in populate_openlineage_fields)
- Integrated HELP COLUMN into `populate_openlineage_fields()` via two-step approach: INSERT from DBC.ColumnsV then UPDATE field_type per-view
- Simplified `wildcard_resolver._warm_cache_batch()` to use DBC.ColumnsV directly (no QVCI dependency for wildcard resolution -- column names only needed)
- Downgraded QVCI pre-flight check from `[WARN]` to `[INFO]` since it no longer blocks correct type resolution
- Updated all 34 wildcard resolver unit tests (removed ColumnsJQV references, all pass)

## Task Commits

1. **Task 1: Research HELP COLUMN and create helper function** - `070bd70` (feat)
2. **Task 3: Integrate HELP COLUMN into populate workflow** - `dc24c77` (feat)

## Files Created/Modified

- `database/scripts/populate/populate_lineage.py` - Added `_resolve_view_field_types_via_help_column()`, updated `populate_openlineage_fields()` (two-step view field population), updated `run_preflight_checks()` to make QVCI check informational
- `database/scripts/populate/wildcard_resolver.py` - Simplified `_warm_cache_batch()` to use DBC.ColumnsV directly, updated docstrings
- `database/scripts/populate/test_wildcard_resolver.py` - Updated all tests referencing ColumnsJQV, renamed `test_warm_cache_qvci_fallback` to `test_warm_cache_uses_columns_v_directly`

## Decisions Made

- **Replace strategy (user decision at checkpoint):** Replace QVCI entirely with HELP COLUMN as the single approach for all environments. Simpler code, one consistent path.
- **Two-step view field population:** INSERT from DBC.ColumnsV (column names/ordinal positions -- reliable for all objects), then UPDATE field_type per-view via HELP COLUMN. Avoids per-view INSERT complexity while keeping the efficient batch INSERT for structural metadata.
- **wildcard_resolver unchanged for view path:** The `_warm_cache_batch()` already only processes tables (views are handled separately via `_expand_view_columns()`), so simplifying to DBC.ColumnsV is safe and correct.

## Deviations from Plan

None - plan executed exactly as written. The "replace" decision was made at the intended checkpoint with the expected information available from Task 1 research.

## Issues Encountered

None. HELP COLUMN hypothesis was confirmed immediately -- it returns actual resolved type codes (I, CV, DA, SZ, etc.) matching the DBC.ColumnsV/DBC.ColumnsJQV format, making the type mapping straightforward.

## User Setup Required

None - no external service configuration required. The changes are backward-compatible; `populate_lineage.py --dry-run` confirms correct operation.

## Next Phase Readiness

- View column types will now resolve correctly (not UNKNOWN) on ClearScape Analytics and any other Teradata environment where QVCI is disabled
- The `qvci_available` parameter is retained in `populate_openlineage_fields()` for API compatibility (can be removed in a future cleanup)
- No blockers

---
*Phase: quick*
*Completed: 2026-03-04*
