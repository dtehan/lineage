---
status: verifying
trigger: "populate_lineage.py fails with Error 6706: The string contains an untranslatable character when populating OL_DATASET from DBC.TablesV"
created: 2026-02-01T00:00:00Z
updated: 2026-02-01T00:00:00Z
---

## Current Focus

hypothesis: DatabaseName, TableName, or ColumnName in DBC.ColumnsV contains untranslatable characters (not CommentString as initially thought)
test: Filter out rows with problematic characters in identifier columns using TRANSLATE_CHK
expecting: Should identify which column(s) have the problematic characters
next_action: Add TRANSLATE_CHK filters for DatabaseName, TableName, and ColumnName

## Symptoms

expected: Script should extract metadata from DBC.TablesV and DBC.ColumnsV and populate OL_DATASET, OL_DATASET_FIELD, and OL_COLUMN_LINEAGE tables successfully
actual: Script fails during OL_DATASET population with Teradata error 6706 (untranslatable character)
errors: |
  teradatasql.OperationalError: [Version 20.0.0.50] [Session 86662] [Teradata Database] [Error 6706] The string contains an untranslatable character.
    File "/Users/Daniel.Tehan/Code/lineage/database/scripts/populate/populate_lineage.py", line 151, in populate_openlineage_datasets
      cursor.execute("""
reproduction: Run `python scripts/populate/populate_lineage.py` from the database directory
started: Unknown if it worked before

## Eliminated

## Evidence

- timestamp: 2026-02-01T00:01:00Z
  checked: populate_lineage.py line 151 - the INSERT...SELECT query
  found: Query selects from DBC.TablesV including CAST(CommentString AS VARCHAR(2000)) AS description
  implication: CommentString from DBC.TablesV likely contains untranslatable characters (non-ASCII)

- timestamp: 2026-02-01T00:02:00Z
  checked: Web search for Teradata Error 6706 solutions
  found: |
    - Error occurs when querying DBC dictionary tables containing Unicode/Cyrillic characters
    - TRANSLATE_CHK function can identify rows with untranslatable characters
    - Solutions: use TRANSLATE_CHK to filter, or handle with COALESCE to replace bad data with NULL
  implication: Need to wrap CommentString with character translation handling

- timestamp: 2026-02-01T00:03:00Z
  checked: Applied TRANSLATE_CHK fix to CommentString in both dataset and field queries
  found: OL_DATASET now succeeds (4973 datasets), but OL_DATASET_FIELD still fails with Error 6706
  implication: Either TRANSLATE_CHK is not filtering properly, or another column in DBC.ColumnsV has untranslatable characters

- timestamp: 2026-02-01T00:04:00Z
  checked: Added WHERE filter to exclude rows where TRANSLATE_CHK fails
  found: Still failing with Error 6706
  implication: The issue may be with ColumnName, DatabaseName, TableName, or ColumnType - need to check all string columns

- timestamp: 2026-02-01T00:05:00Z
  checked: Set field_description to NULL (removed CommentString completely from query)
  found: Still fails with Error 6706
  implication: CONFIRMED - The issue is NOT CommentString. Must be DatabaseName, TableName, or ColumnName containing untranslatable characters

## Resolution

root_cause: CommentString column in DBC.TablesV (and DBC.ColumnsV) contains Unicode or special characters that cannot be translated to the session character set, causing Teradata Error 6706 during INSERT...SELECT operations
fix: Use CASE expression with TRANSLATE_CHK function to return NULL when CommentString contains untranslatable characters, otherwise return the casted value
verification: pending
files_changed:
  - database/scripts/populate/populate_lineage.py
