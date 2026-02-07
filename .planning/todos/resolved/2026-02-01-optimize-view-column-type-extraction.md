---
created: 2026-02-01T19:45
resolved: 2026-02-01
title: Optimize view column type extraction to in-database process
area: database
files:
  - database/scripts/populate/populate_lineage.py
resolution: Replaced DBC.ColumnsV with DBC.ColumnsJQV which provides complete column type info for views directly, eliminating the need for the iterative HELP COLUMN workaround
---

## Problem

Currently, populate_lineage.py uses HELP COLUMN command iteratively (one per view column) to extract column types for views, since DBC.ColumnsV returns NULL for view column types. This approach:

1. Requires many round-trips to the database (one per view column)
2. Is inefficient for databases with many views and columns
3. Couples data extraction to the Python script execution time

For production deployments with large schemas, this becomes a performance bottleneck.

## Solution

~~Refactor the view column type extraction to be an in-database process:~~

**Actual solution:** Use DBC.ColumnsJQV instead of DBC.ColumnsV.

DBC.ColumnsJQV provides the same schema as ColumnsV but returns complete column type information for views (ColumnType, ColumnLength, DecimalTotalDigits, DecimalFractionalDigits, CharType, etc. are all populated for view columns).

This is a much simpler solution than the stored procedure approach originally proposed:
- Single query instead of iterative HELP COLUMN calls
- No stored procedure or staging table needed
- No additional round-trips
- All data extraction happens in one INSERT...SELECT

Changes made:
- Changed `FROM DBC.ColumnsV c` to `FROM DBC.ColumnsJQV c` in populate_openlineage_fields()
- Removed the entire update_view_column_types() function
- Removed the convert_teradata_type() helper function (only used by update_view_column_types)
- Updated docstrings and CLAUDE.md documentation
