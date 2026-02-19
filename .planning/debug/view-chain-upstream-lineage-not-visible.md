---
status: diagnosed
trigger: "UAT test 4 failed: Nested view chains (table -> view -> view -> consumer) render all intermediate views correctly, showing upstream source tables through the view chain"
created: 2026-02-19T17:00:00Z
updated: 2026-02-19T17:15:00Z
symptoms_prefilled: true
goal: find_root_cause_only
---

## Current Focus

hypothesis: OL_COLUMN_LINEAGE has no view-chain lineage records — no edges exist connecting source tables through intermediate views to the consumer table
test: Audit all lineage data sources (fixtures, insert_cte_test_data, populate_lineage) for view-chain records
expecting: None of the data-population scripts insert lineage records that cross dataset boundaries involving views (source_dataset = view)
next_action: COMPLETE — root cause identified

## Symptoms

expected: "Nested view chains (table -> view -> view -> consumer) render all intermediate views correctly, showing upstream source tables through the view chain"
actual: "We are only seeing the lineage downstream of the view, we are not seeing the lineage upstream of the view"
errors: []
reproduction: "Open lineage for a consumer table that sits downstream of a view chain (table -> view -> view -> consumer)"
started: UAT phase 10, test 4

## Eliminated

- hypothesis: "The lineage CTE traversal stops at view nodes (doesn't continue upstream through a view)"
  evidence: "The upstream_lineage CTE in lineage_repository.py (lines 123-171) recursively joins OL_COLUMN_LINEAGE on TRIM(cl.target_dataset) = TRIM(ul.source_dataset) AND TRIM(cl.target_field) = TRIM(ul.source_field) — it does not filter by source_type. If records exist, the CTE will traverse through views correctly."
  timestamp: 2026-02-19T17:10:00Z

- hypothesis: "The API correctly returns upstream data but the frontend drops view nodes"
  evidence: "openLineageAdapter.ts (lines 28-74) converts all field nodes regardless of type. The only effect of missing sourceType is visual (orange vs grey rendering), not omission of nodes. The adapter does not filter or skip nodes based on sourceType. Nodes would appear, just styled as tables."
  timestamp: 2026-02-19T17:10:00Z

- hypothesis: "The sourceType propagation change (phase 10) somehow affected traversal"
  evidence: "Phase 10 only added sourceType to the dataset dict inside each node — it did not modify the CTE query, the traversal logic, or the edge/node inclusion logic. The _add_lineage_results() method adds ALL records to nodes regardless of sourceType."
  timestamp: 2026-02-19T17:10:00Z

## Evidence

- timestamp: 2026-02-19T17:05:00Z
  checked: "database/fixtures/lineage_mappings.py — all 70 COLUMN_LINEAGE_MAPPINGS entries"
  found: "Every entry maps TABLE to TABLE (SRC_* -> STG_*, STG_* -> DIM_*, DIM_*/STG_* -> FACT_*, FACT_* -> RPT_*). Zero entries involve views. The medallion architecture fixtures contain no view datasets at all."
  implication: "Running populate_lineage.py --fixtures produces zero view-chain lineage records in OL_COLUMN_LINEAGE"

- timestamp: 2026-02-19T17:06:00Z
  checked: "database/scripts/utils/insert_cte_test_data.py — all CTE_TEST_INSERTS entries"
  found: "All test records use datasets like CYCLE_TEST, DIAMOND, CHAIN_TEST etc. — these are all TABLE type (verified in populate_test_metadata.py which inserts them with source_type='TABLE'). Zero entries involve view datasets."
  implication: "The CTE edge case test data also has no view-chain lineage records"

- timestamp: 2026-02-19T17:07:00Z
  checked: "database/scripts/populate/populate_lineage.py — populate_lineage_from_dbql() path"
  found: "DBQL extraction parses executed SQL from query logs to discover lineage. This would capture view-through lineage IF (1) DBQL is enabled on the instance, (2) queries were executed that SELECTed from views, AND (3) the DBQL SQL parser correctly handles view column expansion. The RESEARCH.md mentions Phase 9's WildcardResolver handles view wildcard expansion during DBQL extraction."
  implication: "DBQL mode can produce view-chain records only if all three conditions are met. In a demo/test environment using --fixtures mode, there are zero view-chain records."

- timestamp: 2026-02-19T17:08:00Z
  checked: "database/scripts/setup/setup_test_data.py — TABLES_TO_DROP list and DDL arrays"
  found: "TABLES_TO_DROP includes V_REGIONAL_PERFORMANCE and V_SALES_SUMMARY (view names), but the setup script only creates tables (SOURCE_TABLES_DDL, STAGING_TABLES_DDL, DIMENSION_TABLES_DDL, FACT_TABLES_DDL). There are no CREATE VIEW statements in the script. The two view names in TABLES_TO_DROP are dropped but never re-created."
  implication: "The test data setup creates tables only — no views exist in the test environment. V_REGIONAL_PERFORMANCE and V_SALES_SUMMARY are dropped and never re-created, so they don't exist."

- timestamp: 2026-02-19T17:09:00Z
  checked: "lineage_repository.py get_upstream_lineage() CTE (lines 123-171)"
  found: "The CTE starts with WHERE TRIM(target_dataset) = TRIM(?) AND UPPER(TRIM(target_field)) = UPPER(TRIM(?)). For a consumer table to show upstream lineage through a view chain, there must be OL_COLUMN_LINEAGE records where target_dataset is the consumer AND source_dataset is a view, PLUS further records where target_dataset is that view AND source_dataset is the upstream table. If those intermediate records do not exist, the recursive join has nothing to traverse."
  implication: "The CTE is correct and would traverse the view chain IF the records existed. The problem is the records don't exist."

- timestamp: 2026-02-19T17:10:00Z
  checked: "lineage_service.py _add_lineage_results() (lines 424-470)"
  found: "Method adds all records from get_upstream_lineage(). Since get_upstream_lineage() returns empty list (no view-chain records exist), _add_lineage_results() has nothing to add. The root node (the consumer table/view) is still added at lines 85-89, which is why 'we are only seeing the lineage downstream of the view' — the root node appears but nothing upstream of it."
  implication: "Service layer is correct — it faithfully represents what the repository returns, which is empty due to missing data."

## Resolution

root_cause: |
  OL_COLUMN_LINEAGE contains no lineage records representing the view chain
  (table -> view -> view -> consumer). The test/demo data has never been populated
  with view-chain lineage edges.

  Specifically:
  1. The fixtures (lineage_mappings.py) contain only table-to-table lineage — no views
  2. The CTE test data (insert_cte_test_data.py) uses only TABLE-type datasets
  3. The test table setup (setup_test_data.py) drops V_REGIONAL_PERFORMANCE and
     V_SALES_SUMMARY but never re-creates them — views don't exist in the environment
  4. DBQL mode cannot produce view-chain records unless DBQL is enabled, queries through
     views were actually executed, and Phase 9's view expansion was applied

  When a user opens lineage for a "consumer table downstream of a view chain", the
  get_upstream_lineage() CTE correctly queries OL_COLUMN_LINEAGE but finds zero matching
  records (because no such records were ever inserted). The CTE returns an empty list.
  The service then has no upstream nodes to add — only the root node appears.

  The symptom "we are only seeing the lineage downstream of the view" likely means the
  user opened lineage from a VIEW (e.g., V_SALES_SUMMARY), and saw downstream edges
  (from the view to something consuming it) but no upstream edges (from source tables
  into the view). This matches perfectly: lineage was populated for TABLE->TABLE flows
  only, so the view's incoming edges (TABLE->VIEW) were never inserted.

fix: "Not applied (diagnose-only mode)"

verification: "Not performed (diagnose-only mode)"

files_changed: []
