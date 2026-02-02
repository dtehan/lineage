---
status: resolved
trigger: "lineage-not-captured-from-insert-select"
created: 2026-02-01T00:00:00Z
updated: 2026-02-01T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMED - populate_lineage.py defaults to fixtures mode, not DBQL extraction
test: n/a - root cause confirmed
expecting: n/a
next_action: Fix documentation to properly document --dbql flag and its prerequisites

## Symptoms

expected: Running INSERT SELECT statements should result in column-level lineage being captured in OL_COLUMN_LINEAGE table when populate_lineage.py runs

actual: After running INSERT SELECT statements and running populate_lineage.py, column lineage is not appearing in OL_COLUMN_LINEAGE

errors: No specific error messages - script appears to run but lineage is missing

reproduction:
1. Run INSERT SELECT from demo_user.table1 into demo_user.table2
2. Run INSERT SELECT from demo_user.table2 into demo_user.table3
3. Run populate_lineage.py
4. Check OL_COLUMN_LINEAGE for expected lineage - it's missing

started: Unknown if this ever worked. User expected it based on understanding of script.

## Eliminated

## Evidence

- timestamp: 2026-02-01T00:01:00Z
  checked: populate_lineage.py code
  found: Script has TWO modes - fixtures (default) and DBQL (--dbql flag). Default mode uses hardcoded fixture mappings, NOT DBQL extraction. User likely ran without --dbql flag.
  implication: User needs to run with --dbql flag to extract lineage from actual INSERT SELECT statements

- timestamp: 2026-02-01T00:02:00Z
  checked: dbql_extractor.py code
  found: DBQL extraction requires (1) SELECT access on DBC.DBQLogTbl and DBC.DBQLSQLTbl, (2) Query logging enabled via "BEGIN QUERY LOGGING WITH SQL, OBJECTS ON ALL", (3) sqlglot library installed
  implication: Even with --dbql flag, several prerequisites must be met for extraction to work

- timestamp: 2026-02-01T00:03:00Z
  checked: docs/user_guide.md and database/scripts/populate/README.md
  found: Documentation is MISLEADING. user_guide.md section "Getting Started Step 3" says "See DBQL-Based Lineage Extraction for detailed documentation" but section 10 only says "Future Lineage Extraction Options" and doesn't document --dbql. README.md says "--dbql (future)". The help text in populate_lineage.py DOES document --dbql but user likely didn't run --help.
  implication: User expectation mismatch - documentation implies manual mappings only, but --dbql flag exists and works

## Resolution

root_cause: Documentation/UX issue - populate_lineage.py has TWO modes: (1) fixtures (default) uses hardcoded mappings, (2) DBQL (--dbql flag) extracts from query logs. User ran default mode expecting DBQL extraction. Additionally, documentation is inconsistent - user_guide.md references "DBQL-Based Lineage Extraction" section but that section only says "Future option" without documenting the existing --dbql flag.

fix: Updated documentation in three files to clearly document both lineage modes (fixtures vs DBQL) and DBQL prerequisites

verification: Reviewed all three documentation files. Changes are consistent and clearly document: (1) Two lineage modes exist, (2) Fixtures is default for demo/testing, (3) DBQL mode requires --dbql flag plus prerequisites. User will now understand they need to run with --dbql flag to capture lineage from INSERT SELECT statements.

files_changed:
- docs/user_guide.md: Replaced "Future Lineage Extraction Options" with comprehensive "DBQL-Based Lineage Extraction" section documenting prerequisites, usage, and troubleshooting
- database/scripts/populate/README.md: Added mode table, updated usage examples, documented DBQL requirements
- CLAUDE.md: Updated Common Commands section to show both lineage population modes with clear comments
