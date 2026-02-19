---
status: diagnosed
phase: 10-view-lineage-show-data-flow-through-views-to-source-tables
source: 10-01-SUMMARY.md
started: 2026-02-19T17:00:00Z
updated: 2026-02-19T17:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Column lineage — view nodes render with VIEW styling
expected: Open a column lineage graph where a view sits in the lineage path (either as the starting column's table, an upstream source, or a downstream target). The view's table card should have an orange border, an eye icon in the header, and a VIEW badge — distinct from plain table nodes which have no badge.
result: pass

### 2. Table lineage — view nodes render with VIEW styling
expected: Open a table lineage graph where a view appears as a node. The view card should display an orange border, eye icon, and VIEW badge — the same visual treatment as in column lineage.
result: pass

### 3. View as lineage starting point
expected: Click on a view's column or table to open its lineage graph. The root node (the view itself) should display orange border, eye icon, and VIEW badge — not a plain table style.
result: pass

### 4. Nested view chain renders correctly
expected: If your data has a chain like table → view → view → consumer table, open the lineage for the consumer. All intermediate view nodes in the chain should show VIEW styling (orange border, eye icon, VIEW badge), while plain table nodes show default styling.
result: issue
reported: "we are only seeing the lineage downstream of the view, we are not seeing the lineage upstream of the view"
severity: major

### 5. Tables still render as plain table nodes
expected: Open any lineage graph containing regular (non-view) tables. Those nodes should render without orange borders, without eye icons, and without a VIEW badge — confirming graceful degradation where non-view datasets keep their default TABLE appearance.
result: pass

## Summary

total: 5
passed: 4
issues: 1
pending: 0
skipped: 0

## Gaps

- truth: "Nested view chains (table -> view -> view -> consumer) render all intermediate views correctly, showing upstream source tables through the view chain"
  status: failed
  reason: "User reported: we are only seeing the lineage downstream of the view, we are not seeing the lineage upstream of the view"
  severity: major
  test: 4
  root_cause: "OL_COLUMN_LINEAGE contains zero records for view-chain edges. The CTE traversal logic and frontend adapter are both correct. The test data setup (fixtures and insert_cte_test_data.py) only has TABLE→TABLE flows — no view datasets exist in OL_DATASET with source_type='VIEW' and no view-chain lineage records exist in OL_COLUMN_LINEAGE. Views V_REGIONAL_PERFORMANCE and V_SALES_SUMMARY are dropped in setup_test_data.py but never re-created with CREATE VIEW DDL."
  artifacts:
    - path: "database/fixtures/lineage_mappings.py"
      issue: "Zero view-involving entries; all flows are TABLE→TABLE"
    - path: "database/scripts/setup/setup_test_data.py"
      issue: "V_REGIONAL_PERFORMANCE and V_SALES_SUMMARY dropped but no CREATE VIEW statements exist"
    - path: "database/scripts/utils/insert_cte_test_data.py"
      issue: "All test datasets use TABLE type; no view-chain lineage patterns"
    - path: "database/scripts/populate/populate_test_metadata.py"
      issue: "All test datasets inserted with source_type='TABLE'"
  missing:
    - "Add CREATE VIEW DDL for at least one view chain in setup_test_data.py (e.g. V_SALES_SUMMARY → STG_SALES, V_REGIONAL_PERFORMANCE → V_SALES_SUMMARY)"
    - "Insert view-chain lineage records into OL_COLUMN_LINEAGE via fixtures/lineage_mappings.py or insert_cte_test_data.py"
    - "Register view datasets in OL_DATASET with source_type='VIEW' via populate_test_metadata.py"
  debug_session: ".planning/debug/view-chain-upstream-lineage-not-visible.md"
