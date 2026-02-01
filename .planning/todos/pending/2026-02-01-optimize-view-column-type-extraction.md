---
created: 2026-02-01T19:45
title: Optimize view column type extraction to in-database process
area: database
files:
  - database/scripts/populate/populate_lineage.py
---

## Problem

Currently, populate_lineage.py uses HELP COLUMN command iteratively (one per view column) to extract column types for views, since DBC.ColumnsV returns NULL for view column types. This approach:

1. Requires many round-trips to the database (one per view column)
2. Is inefficient for databases with many views and columns
3. Couples data extraction to the Python script execution time

For production deployments with large schemas, this becomes a performance bottleneck.

## Solution

Refactor the view column type extraction to be an in-database process:

1. Create a stored procedure or SQL script that:
   - Queries DBC.ColumnsV for all view columns
   - Uses HELP COLUMN within a cursor or set-based operation
   - Populates a staging table with view column metadata

2. Have populate_lineage.py invoke the stored procedure and read from the staging table

3. Benefits:
   - Reduces network round-trips
   - Leverages database-side parallelism
   - Makes the process more maintainable and testable
   - Separates data extraction logic from Python orchestration

Consider whether this can be integrated into the OL_* schema setup or if it should be a separate utility procedure.
