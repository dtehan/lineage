---
status: resolved
trigger: "view-column-data-types-unknown"
created: 2026-01-31T12:00:00Z
updated: 2026-01-31T12:35:00Z
---

## Current Focus

hypothesis: CONFIRMED - Root cause found and fix implemented
test: Verify view column types are now displayed correctly in the lineage graph
expecting: View columns should show proper types (VARCHAR, INTEGER, etc.) instead of UNKNOWN
next_action: Check API response and frontend display

## Symptoms

expected: Data types should display for all columns (both tables and views should show data types consistently)
actual: All views show "UNKNOWN" for column data types instead of the actual type (VARCHAR, INTEGER, etc.)
errors: No errors in browser console or network tab - data is just missing
reproduction: Load any view in the lineage graph and observe that all columns show "UNKNOWN" as their data type
started: Has been this way for a while - views have never shown data types correctly
scope: All views are affected (not just specific ones)

## Eliminated

## Evidence

- timestamp: 2026-01-31T12:05:00Z
  checked: DBC.ColumnsV metadata for views
  found: ColumnType, ColumnLength, DecimalTotalDigits, DecimalFractionalDigits all return NULL for view columns
  implication: Teradata doesn't store explicit type metadata for views in DBC.ColumnsV - this is documented behavior

- timestamp: 2026-01-31T12:05:00Z
  checked: OL_DATASET_FIELD table for views
  found: All view fields have field_type = 'UNKNOWN' because NULL ColumnType triggers COALESCE fallback in populate_lineage.py
  implication: The CASE statement in populate_openlineage_fields falls through to ELSE branch for views

- timestamp: 2026-01-31T12:08:00Z
  checked: HELP COLUMN command for views
  found: HELP COLUMN demo_user.view_name.* returns Type column with correct values (CV=VARCHAR, I=INTEGER, etc.)
  implication: Can use HELP COLUMN to get view column types, but need different approach than bulk INSERT...SELECT

- timestamp: 2026-01-31T12:08:00Z
  checked: DBC.ColumnsQV (Query Virtual Columns Intersection)
  found: Feature disabled in ClearScape environment (Error 9719)
  implication: Cannot use ColumnsQV as alternative

- timestamp: 2026-01-31T12:20:00Z
  checked: Fix implementation - added update_view_column_types function
  found: Function successfully updates view column types using HELP COLUMN
  implication: 850 view columns updated, all demo_user views now have correct types

- timestamp: 2026-01-31T12:25:00Z
  checked: Verification query for demo_user views
  found: All 43 view fields now show correct types (VARCHAR, INTEGER, DATE, TIMESTAMP, etc.)
  implication: Fix is working correctly at the database level

## Resolution

root_cause: DBC.ColumnsV returns NULL for ColumnType, ColumnLength, DecimalTotalDigits, and DecimalFractionalDigits for view columns. This is documented Teradata behavior - views don't store explicit column type metadata because the column types are derived from the underlying SQL query at runtime. The populate_lineage.py script's CASE statement falls through to COALESCE(TRIM(c.ColumnType), 'UNKNOWN') which results in 'UNKNOWN' for all view columns.

fix: Added new function update_view_column_types() in populate_lineage.py that uses Teradata's HELP COLUMN command to retrieve the actual derived column types for views, then updates the OL_DATASET_FIELD table. The HELP COLUMN command returns the computed column types that Teradata derives from the view's underlying query.

verification:
- Database verification: All 43 demo_user view fields now have correct types (INTEGER, VARCHAR, DATE, TIMESTAMP, etc.)
- API verification: /api/v2/openlineage/lineage/database/demo_user returns nodes with correct columnType and sourceType=VIEW
- Example: demo_user.customer.customer_key now shows type=INTEGER, sourceType=VIEW instead of UNKNOWN

files_changed:
- database/populate_lineage.py: Added update_view_column_types() function, integrated into main population flow
