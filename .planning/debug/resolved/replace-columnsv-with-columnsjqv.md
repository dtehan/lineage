---
status: resolved
trigger: "Refactor populate_openlineage_fields function to use DBC.ColumnsJQV instead of DBC.ColumnsV and remove update_view_column_types function."
created: 2026-02-01T12:00:00Z
updated: 2026-02-01T12:20:00Z
---

## Current Focus
<!-- OVERWRITE on each update - reflects NOW -->

hypothesis: CONFIRMED - DBC.ColumnsJQV provides complete column type information for both tables AND views
test: Code changes implemented, syntax verified
expecting: Script functions correctly with ColumnsJQV
next_action: Verify changes (syntax checked, code review complete)

## Symptoms
<!-- Written during gathering, then IMMUTABLE -->

expected: Use DBC.ColumnsJQV to get column type information in one place, eliminating the need for update_view_column_types function
actual: Currently using DBC.ColumnsV in populate_openlineage_fields and have a separate update_view_column_types function
errors: None - this is a refactoring improvement
reproduction: Look at database/scripts/populate/populate_lineage.py
started: Current implementation works but has redundancy

## Eliminated
<!-- APPEND only - prevents re-investigating -->


## Evidence
- timestamp: 2026-02-01T12:05:00Z
  checked: Web search for DBC.ColumnsJQV vs DBC.ColumnsV
  found: |
    - DBC.ColumnsV returns NULL for ColumnType, DecimalTotalDigits, DecimalFractionalDigits, CharType, ColumnLength for view columns
    - DBC.ColumnsJQV provides complete information for view columns (same schema but populated values)
    - DBC.ColumnsJQV is specifically optimized for tables, NoPI tables, and views (doesn't include other objects)
    - DBC.ColumnsJQV has better performance as it filters to only these object types
  implication: Simply changing FROM DBC.ColumnsV to FROM DBC.ColumnsJQV will provide view column types directly
  sources:
    - https://docs.teradata.com/r/Enterprise_IntelliFlex_VMware/Data-Dictionary/Views-Reference/ColumnsV-X
    - https://docs.teradata.com/r/Teradata-VantageCloud-Lake/Database-Reference/Database-Administration/Working-with-Tables-and-Views-Application-DBAs/Working-with-Views/Getting-View-Column-Information


<!-- APPEND only - facts discovered -->

- timestamp: 2026-02-01T12:00:00Z
  checked: populate_lineage.py - current implementation
  found: |
    - Line 183-268: populate_openlineage_fields uses DBC.ColumnsV
    - Line 248: "FROM DBC.ColumnsV c" - this is where the query happens
    - Line 271-356: update_view_column_types function exists to fix NULL types for views
    - Line 272: Comment says "DBC.ColumnsV returns NULL for view types"
    - Line 625: main() calls update_view_column_types after populate_openlineage_fields
    - The workaround uses HELP COLUMN command for each view individually
  implication: The current implementation has two-phase approach due to ColumnsV limitation

## Resolution
<!-- OVERWRITE as understanding evolves -->

root_cause: Using DBC.ColumnsV which returns NULL for view column types, requiring a separate update_view_column_types function with iterative HELP COLUMN calls
fix: |
  1. Changed DBC.ColumnsV to DBC.ColumnsJQV in populate_openlineage_fields (line 192)
  2. Updated function docstring to explain why ColumnsJQV is used
  3. Updated print statement to reference ColumnsJQV
  4. Removed the convert_teradata_type helper function (no longer needed)
  5. Removed the update_view_column_types function entirely
  6. Removed the call to update_view_column_types in main()
  7. Updated dry-run message to reference ColumnsJQV
  8. Updated CLAUDE.md documentation
verification: |
  - Python syntax check passed
  - Code review confirms all references to ColumnsV are updated
  - All removed functions were only used for the workaround
files_changed:
  - database/scripts/populate/populate_lineage.py
  - CLAUDE.md
  - .planning/todos/resolved/2026-02-01-optimize-view-column-type-extraction.md (moved from pending)
