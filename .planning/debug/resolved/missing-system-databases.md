---
status: resolved
trigger: "User can see DBC in the Asset Browser sidebar but all other Teradata system databases (SYSLIB, SYSBAR, SystemFe, TDQCD, SysAdmin, etc.) are missing. This worked recently but stopped."
created: 2026-02-25T00:00:00Z
updated: 2026-02-25T00:00:02Z
---

## Current Focus

hypothesis: RESOLVED
test: Fix applied, DBC restored to SYSTEM_DATABASES
expecting: After --full-refresh repopulation, DBC will no longer appear in Asset Browser
next_action: Archive

## Symptoms

expected: All Teradata system databases should appear in the Asset Browser sidebar (SYSLIB, SYSBAR, SystemFe, TDQCD, SysAdmin, etc.)
actual: Only DBC is visible in the Asset Browser sidebar. All other system databases are missing.
errors: None reported
reproduction: Open the GUI, look at the Asset Browser sidebar - only DBC shows for system databases
started: Was working recently, stopped showing. Project just completed v6.0 Full System Catalog milestone.

## Eliminated

- hypothesis: Frontend filtering in AssetBrowser component hides system databases
  evidence: AssetBrowser renders all databases returned from /api/v2/openlineage/namespaces/<id>/databases with no filtering
  timestamp: 2026-02-25

- hypothesis: Backend API route filters out system databases
  evidence: list_databases() route and DatasetRepository.list_databases() do a plain SELECT from OL_DATASET with no database name filtering
  timestamp: 2026-02-25

## Evidence

- timestamp: 2026-02-25
  checked: DatasetRepository.list_databases() SQL query
  found: Plain SELECT from OL_DATASET grouped by database_name - no WHERE clause filtering by database name
  implication: The database list is determined entirely by what's stored in OL_DATASET

- timestamp: 2026-02-25
  checked: populate_lineage.py SYSTEM_DATABASES frozenset across commits
  found: |
    - Commit c892495 (original): 'DBC' was IN SYSTEM_DATABASES (line: 'All', 'Crashdumps', 'DBC', ...)
    - Commit 15e7832 (QVCI fix): 'DBC' was REMOVED from SYSTEM_DATABASES (line: 'All', 'Crashdumps', 'dbcmngr', ...)
    - HEAD current: 'DBC' is MISSING from SYSTEM_DATABASES - DBC tables get populated into OL_DATASET
    - SYSLIB, SYSBAR, SystemFe, SysAdmin, TDQCD are still IN SYSTEM_DATABASES - excluded from OL_DATASET
  implication: Only DBC appears in Asset Browser because only DBC was accidentally included in OL_DATASET

- timestamp: 2026-02-25
  checked: v6.0 Phase 22 requirements (milestones/v6.0-ROADMAP.md line 94)
  found: "Teradata system databases (DBC, SysAdmin, SYSLIB, Sys_Calendar, and others) do not appear in the Asset Browser or OL_DATASET after population"
  implication: Design intent is NO system databases in catalog. DBC should be excluded like the others.

## Resolution

root_cause: |
  Commit 15e7832 ("fix: switch populate_openlineage_fields from DBC.ColumnsV to DBC.ColumnsJQV")
  accidentally dropped 'DBC' from the SYSTEM_DATABASES exclusion frozenset in populate_lineage.py.
  The original commit c892495 included 'DBC' in SYSTEM_DATABASES (as designed per v6.0 Phase 22
  requirement that system databases not appear in OL_DATASET or the Asset Browser). The QVCI fix
  commit reformatted the file and silently removed 'DBC' from the list.

  Result: DBC tables/views were populated into OL_DATASET and appear in the browser, while all
  other system databases (SYSLIB, SYSBAR, SystemFe, SysAdmin, TDQCD, etc.) were correctly excluded.
  The inconsistent behavior confused the user into thinking the OTHER system databases were missing,
  when in fact DBC is the one that should NOT be there per the v6.0 design spec.

fix: |
  Restored 'DBC' to SYSTEM_DATABASES frozenset in populate_lineage.py line 45.
  Changed: 'All', 'Crashdumps', 'dbcmngr', ...
  To:      'All', 'Crashdumps', 'DBC', 'dbcmngr', ...

  User must run: python scripts/populate/populate_lineage.py --full-refresh
  to remove the DBC entries that were already inserted into OL_DATASET.

verification: |
  Code fix verified: SYSTEM_DATABASES now contains 'DBC' (44 entries, was 43).
  Runtime verification requires running populate_lineage.py --full-refresh and
  confirming DBC no longer appears in the Asset Browser.

files_changed:
  - database/scripts/populate/populate_lineage.py
