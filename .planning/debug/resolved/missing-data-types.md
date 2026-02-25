---
status: resolved
trigger: "missing-data-types - Column data types missing from application"
created: 2026-02-25T00:00:00Z
updated: 2026-02-25T00:02:00Z
---

## Current Focus

hypothesis: RESOLVED
test: N/A
expecting: N/A
next_action: N/A

## Symptoms

expected: Column data types (e.g., VARCHAR, INTEGER, DECIMAL) should be displayed for table columns throughout the application - in the lineage graph, detail panels, API responses, and stored in the OL_DATASET_FIELD table.
actual: Data types are missing/not showing. They were there previously.
errors: None reported
reproduction: User just noticed types are gone
started: Commit a55efdc (Feb 7, 2026) - "fix(19): resolve 3 animation/interaction bugs from UAT"

## Eliminated

- hypothesis: "The git diff change (removing 'DBC' from SYSTEM_DATABASES) caused the issue"
  evidence: That change is unrelated to data type population
  timestamp: 2026-02-25

- hypothesis: "API layer is dropping field_type"
  evidence: API correctly reads field_type from OL_DATASET_FIELD and maps to columnType
  timestamp: 2026-02-25

- hypothesis: "UI layer is not rendering data types"
  evidence: UI correctly reads columnType from node.metadata and renders it in ColumnRow and DetailPanel
  timestamp: 2026-02-25

## Evidence

- timestamp: 2026-02-25
  checked: git diff of populate_lineage.py (modified file)
  found: Only change is removing 'DBC' from SYSTEM_DATABASES list - unrelated to field types
  implication: The current modification is not the cause

- timestamp: 2026-02-25
  checked: git log for populate_lineage.py in chronological order
  found: 8 commits; function update_view_column_types was added in commit 5ed677b then removed in a55efdc
  implication: The removal of update_view_column_types broke view column type population

- timestamp: 2026-02-25
  checked: commit a55efdc (fix(19)) diff for populate_lineage.py
  found: update_view_column_types() function was deleted, DBC.ColumnsV was kept with comment "NULL for view column types is acceptable for now"
  implication: This commit broke column type display for view columns specifically

- timestamp: 2026-02-25
  checked: commit 5ed677b (fix(populate)) diff
  found: update_view_column_types() function added to query OL_DATASET_FIELD for UNKNOWN types, use HELP COLUMN to get actual types, update the records
  implication: This was the working fix that was then removed

- timestamp: 2026-02-25
  checked: CLAUDE.md documentation
  found: "The populate_lineage.py script uses DBC.ColumnsJQV instead of DBC.ColumnsV because ColumnsJQV provides complete column type information for both tables AND views"
  implication: The INTENDED fix is to use DBC.ColumnsJQV (not the HELP COLUMN workaround). The pre-flight check already tests for ColumnsJQV availability.

- timestamp: 2026-02-25
  checked: populate_openlineage_fields() current implementation
  found: Uses DBC.ColumnsV which returns NULL for view ColumnType, causing COALESCE fallback to 'UNKNOWN'
  implication: All view columns show 'UNKNOWN' type (or worse, NULL if field_type is not populated)

- timestamp: 2026-02-25
  checked: run_preflight_checks() in current populate_lineage.py
  found: Already checks for DBC.ColumnsJQV availability with "SELECT 1 FROM DBC.ColumnsJQV WHERE 1=0"
  implication: The pre-flight check was added in anticipation of switching to ColumnsJQV, but the switch was never made in populate_openlineage_fields()

## Resolution

root_cause: In commit a55efdc (Feb 7, 2026), the update_view_column_types() function was removed from populate_lineage.py as part of a UI bug fix commit. The function had previously fixed view column types using HELP COLUMN. CLAUDE.md documents that the intended approach is DBC.ColumnsJQV. The pre-flight checks already test for ColumnsJQV. But populate_openlineage_fields() still used DBC.ColumnsV which returns NULL for view column types, causing all view column types to show as 'UNKNOWN' or not populate correctly.

fix: Replaced DBC.ColumnsV with DBC.ColumnsJQV in populate_openlineage_fields(). ColumnsJQV provides complete column type information for both tables AND views, eliminating the need for the HELP COLUMN workaround. Updated docstring to explain why ColumnsJQV is used. Updated dry-run print statement to match.

verification: Code change verified by reading the file. The fix requires re-running populate_lineage.py (with --full-refresh to clear old UNKNOWN entries) to update OL_DATASET_FIELD records in the database.

files_changed:
  - database/scripts/populate/populate_lineage.py
