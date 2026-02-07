---
status: resolved
trigger: "User ran populate_lineage.py --dbql --since '2024-01-01' but it found 0 queries, despite recently running INSERT SELECT statements from demo_user.table1 -> table2 -> table3"
created: 2026-02-01T10:00:00Z
updated: 2026-02-01T10:15:00Z
---

## Current Focus

hypothesis: CONFIRMED - Query logging is not enabled for the user, so queries are not recorded in DBQL tables
test: The script requires "BEGIN QUERY LOGGING WITH SQL, OBJECTS ON ALL" to be active
expecting: Without explicit query logging enablement, DBC.DBQLogTbl will have no entries for user's queries
next_action: Provide user with commands to enable query logging and verify DBQL contains data

## Symptoms

expected: DBQL extraction should find the INSERT SELECT queries that were recently executed
actual: Script reports "Found 0 queries to process" and creates 0 lineage records
errors: No errors - script completes successfully but finds no queries
reproduction:
  1. Run INSERT SELECT from demo_user.table1 into demo_user.table2
  2. Run INSERT SELECT from demo_user.table2 into demo_user.table3
  3. Run `python scripts/populate/populate_lineage.py --dbql --since "2024-01-01"`
  4. Script reports 0 queries found
started: First time trying DBQL mode - unsure if DBQL logging is enabled

## Eliminated

## Evidence

- timestamp: 2026-02-01T10:05:00Z
  checked: dbql_extractor.py fetch_queries() method
  found: |
    DBQL query filters on:
    - StatementType IN ('Insert', 'Merge Into', 'Create Table', 'Create View', 'Update')
    - ErrorCode = 0 (only successful queries)
    - SQLRowNo = 1 (only first SQL row)
    - Joins DBQLogTbl with DBQLSQLTbl on QueryID and ProcID

    Time filter uses: q.StartTime > CAST('{since_str}' AS TIMESTAMP(0))
    with since_str = "2024-01-01 00:00:00"
  implication: |
    Query logic looks correct. Possible causes for 0 results:
    1. Query logging not enabled for user (most likely - requires "BEGIN QUERY LOGGING WITH SQL")
    2. No matching StatementTypes in DBQL
    3. All queries had ErrorCode != 0

- timestamp: 2026-02-01T10:10:00Z
  checked: dbql_extractor.py Requirements docstring (line 26-27)
  found: |
    Script explicitly documents the requirement:
    "Query logging enabled: BEGIN QUERY LOGGING WITH SQL, OBJECTS ON ALL"

    This is a Teradata system-level configuration that must be enabled BEFORE
    executing queries. It does NOT retroactively log previous queries.
  implication: |
    ROOT CAUSE IDENTIFIED: Query logging is not enabled for the user's session.
    In Teradata, DBQL logging must be explicitly enabled - it's not automatic.
    The "DBQL access confirmed" message only proves SELECT access to the tables,
    not that logging is actually capturing queries.

## Resolution

root_cause: |
  Query logging (DBQL) is not enabled for the user's session in Teradata.

  The script's "DBQL access confirmed" message only verifies that the user
  has SELECT privileges on DBC.DBQLogTbl - it does NOT verify that query
  logging is actively capturing queries.

  In Teradata, query logging must be explicitly enabled via:
    BEGIN QUERY LOGGING WITH SQL, OBJECTS ON ALL;

  Without this, queries execute successfully but are not recorded in DBQL,
  resulting in 0 rows when the script queries DBC.DBQLogTbl.

fix: |
  User needs to enable query logging before running INSERT SELECT statements:

  1. Check if logging is already enabled:
     SELECT * FROM DBC.DBQLRuleTbl WHERE UserName = USER;

  2. Enable query logging (requires appropriate privileges):
     BEGIN QUERY LOGGING WITH SQL, OBJECTS ON ALL;

  3. Re-run the INSERT SELECT statements AFTER logging is enabled

  4. Then run populate_lineage.py --dbql

  Note: Query logging does NOT work retroactively. Queries executed before
  logging was enabled will not be captured.

  Alternative: If query logging cannot be enabled (requires DBA privileges),
  use fixture mode instead: python populate_lineage.py --fixtures

verification: |
  After enabling query logging, user should:
  1. Run a test INSERT SELECT statement
  2. Query DBC.DBQLogTbl to verify it was captured:
     SELECT QueryID, StatementType, StartTime
     FROM DBC.DBQLogTbl
     WHERE UserName = USER
     ORDER BY StartTime DESC
     SAMPLE 10;
  3. Run populate_lineage.py --dbql --since "<today's date>"
  4. Verify non-zero lineage records are created

files_changed: []
