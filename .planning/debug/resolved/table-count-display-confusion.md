---
status: resolved
trigger: "table-count-display-confusion - The lineage graph view shows '(344 tables)' count that is confusing"
created: 2026-01-31T00:00:00Z
updated: 2026-01-31T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMED - The count displays columns, not tables, and uses misleading label "tables"
test: N/A - root cause identified
expecting: N/A
next_action: Apply fix - remove the misleading count display per user request

## Symptoms

expected: User thinks the count should be removed entirely, as it's not clear what it represents
actual: Display shows "(344 tables)" next to the database name, but only 11-50 tables are visible in the graph
errors: No error messages - this is a UX clarity issue
reproduction: Open the lineage graph view and look at the top left corner where it says "Database: demo_user (344 tables)"
started: Unknown when this was added or if it ever worked as intended

## Eliminated

## Evidence

- timestamp: 2026-01-31T00:01:00Z
  checked: DatabaseLineageGraph.tsx lines 372-376
  found: Count is rendered as `({data.graph.nodes.length} table{data.graph.nodes.length !== 1 ? 's' : ''})`
  implication: The count uses graph.nodes.length but labels it as "tables"

- timestamp: 2026-01-31T00:02:00Z
  checked: useOpenLineageDatabaseLineage hook and API endpoint
  found: API endpoint `/api/v2/openlineage/lineage/database/{databaseName}` returns nodes that are COLUMNS (fields), not tables
  implication: The nodes array contains one entry per column in the database

- timestamp: 2026-01-31T00:03:00Z
  checked: python_server.py get_openlineage_database_lineage() function
  found: Backend builds nodes dict where each field (column) becomes a node with type="field"
  implication: 344 is the count of columns across all tables in demo_user, NOT the table count

- timestamp: 2026-01-31T00:04:00Z
  checked: openLineageAdapter.ts convertOpenLineageNode()
  found: Field nodes are converted to type='column' in the frontend
  implication: The UI receives column-level nodes but displays count with misleading "tables" label

## Resolution

root_cause: The header displays `data.graph.nodes.length` (count of column nodes) but labels it as "tables". The 344 count is actually the number of columns across all tables in the database, not the number of tables. This is confusing because the label says "tables" but shows columns, and neither matches what the user sees in the graph (which shows only tables that have lineage relationships).
fix: Removed the count display from the header (lines 372-376 deleted). Header now shows "Database: {databaseName}" without any count.
verification: Code change verified in DatabaseLineageGraph.tsx. Existing tests for this component are outdated (mock wrong hook) and unrelated to this specific UI element.
files_changed:
  - lineage-ui/src/components/domain/LineageGraph/DatabaseLineageGraph.tsx
