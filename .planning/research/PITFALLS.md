# Domain Pitfalls

**Domain:** Adding full system metadata scanning + standalone table rendering to existing Teradata column-level lineage app
**Researched:** 2026-02-23
**Confidence:** HIGH (verified against codebase, official Teradata docs, React Flow docs)

---

## Critical Pitfalls

Mistakes that cause rewrites, data corruption, or outright failures.

---

### Pitfall 1: No System Database Filter — OL_* Tables Flood with Internal Teradata Objects

**What goes wrong:**
The existing `populate_openlineage_datasets()` query scans `DBC.TablesV` with only two exclusions: `TableName NOT LIKE 'LIN_%'` and `TableName NOT LIKE 'OL_%'`. It applies no filter on `DatabaseName`. A full-system scan of a production Teradata instance includes dozens of system databases (`DBC`, `SYSLIB`, `SysAdmin`, `SYSBAR`, `SYSJDBC`, `Sys_Calendar`, `TDWM`, `TDStats`, `TD_SYSFNLIB`, `TD_SYSGPL`, `TD_SYSXML`, `TDMaps`, `TDPUSER`, `AllTempTables`, `dbcmngr`, `Default`, `EXTUSER`, `External_AP`, `LockLogShredder`, `PUBLIC`, `SQLJ`, `SYSSPATIAL`, `SystemFe`, `SYSUDTLIB`, `SYSUIF`, `TD_SERVER_DB`, `TDQCD`, `Crashdumps`). These contribute thousands of internal tables that have no lineage relevance, pollute the `OL_DATASET` and `OL_DATASET_FIELD` tables with noise, slow every downstream query, and appear in the AssetBrowser alongside user tables.

**Why it happens:**
The current script was written for a controlled single-database scope (`demo_user`). Extending to all databases without a system-database exclusion list was never needed before.

**Consequences:**
- `OL_DATASET` grows from hundreds to potentially tens of thousands of rows including internal Teradata objects.
- AssetBrowser's `limit: 1000` fetch retrieves system tables before user tables, making real objects hard to find.
- Search results include DBC internal tables (e.g., `DBC.Roles`, `SysAdmin.EventLog`) that users never interact with.
- In-memory graph engine warmup (`graph_engine.initialize`) loads `OL_COLUMN_LINEAGE`, but all downstream dataset metadata queries now join a much larger `OL_DATASET` table — every lookup slows proportionally.

**Prevention:**
Add a `DatabaseName NOT IN (...)` clause to both `populate_openlineage_datasets()` and `populate_openlineage_fields()` before extending to full-system scope. The canonical exclusion list (verified against Teradata community documentation) is:

```sql
AND DatabaseName NOT IN (
    'All', 'Crashdumps', 'DBC', 'dbcmngr', 'Default',
    'External_AP', 'EXTUSER', 'LockLogShredder', 'PUBLIC',
    'SQLJ', 'Sys_Calendar', 'SysAdmin', 'SYSBAR', 'SYSJDBC',
    'SYSLIB', 'SYSSPATIAL', 'SystemFe', 'SYSUDTLIB', 'SYSUIF',
    'TD_SERVER_DB', 'TD_SYSFNLIB', 'TD_SYSGPL', 'TD_SYSXML',
    'TDMaps', 'TDPUSER', 'TDQCD', 'TDStats', 'tdwm'
)
```

Make this list configurable (env var or config file) because the exact set varies by Teradata version and installed components. Also exclude `AllTempTables` and `QRYLOG` if present.

**Detection:**
After running the scan, query `SELECT DatabaseName, COUNT(*) FROM OL_DATASET GROUP BY DatabaseName ORDER BY COUNT(*) DESC`. Any entry with `DBC` or `SYS*` as the database name indicates the filter is missing.

**Phase to address:** Phase 1 (metadata population) — must be in place before the first full-system scan runs.

---

### Pitfall 2: Correlated NOT EXISTS Subquery Degrades Catastrophically at Full-System Scale

**What goes wrong:**
Both `populate_openlineage_datasets()` and `populate_openlineage_fields()` use a correlated `NOT EXISTS` subquery to skip rows that already exist in `OL_DATASET` / `OL_DATASET_FIELD`:

```sql
AND NOT EXISTS (
    SELECT 1 FROM {DATABASE}.OL_DATASET od
    WHERE od.dataset_id = ? || '/' || TRIM(DatabaseName) || '.' || TRIM(TableName)
)
```

For a fresh population of a small scope (hundreds of tables), this works acceptably. At full-system scale (10,000–50,000 tables across all databases), the correlated subquery executes once per candidate row from `DBC.TablesV`. Teradata evaluates this as a row-by-row filter requiring repeated index lookups into `OL_DATASET`. Combined with the `? || '/' || TRIM(...)` string concatenation (which prevents index use on `dataset_id`), this can take hours on large systems and may exhaust spool space.

**Why it happens:**
The existing approach was designed for idempotent incremental runs on a small object set. Correlated subqueries in `NOT EXISTS` clauses are quadratic in practice when the outer table is large and the inner table is not indexed on the derived key expression.

**Consequences:**
- Population script times out or runs for hours on large Teradata systems.
- Spool space exhaustion (error 2646) mid-run, leaving `OL_DATASET` and `OL_DATASET_FIELD` in a partially populated state.
- Subsequent API requests fail because some datasets exist without their fields.

**Prevention:**
Replace the correlated `NOT EXISTS` pattern with a hash-join approach for the initial full-population pass. For a first-time (empty table) run, drop the `NOT EXISTS` guard entirely — just insert everything. For incremental re-runs, use a `LEFT JOIN ... WHERE od.dataset_id IS NULL` pattern which Teradata can execute as a hash join rather than a row-by-row correlated lookup:

```sql
INSERT INTO {DATABASE}.OL_DATASET (...)
SELECT ...
FROM DBC.TablesV src
LEFT JOIN {DATABASE}.OL_DATASET existing
    ON existing.dataset_id = ? || '/' || TRIM(src.DatabaseName) || '.' || TRIM(src.TableName)
WHERE existing.dataset_id IS NULL
  AND src.TableKind IN ('T', 'V', 'O')
  -- system DB exclusions here
```

Add a `--full-refresh` mode that truncates `OL_DATASET` and `OL_DATASET_FIELD` before inserting (safe for metadata-only tables since lineage is stored separately in `OL_COLUMN_LINEAGE`).

**Detection:**
Monitor the Teradata query workload during population (`DBC.DBQLogTbl`). If the metadata INSERT statements are consuming more than 10 minutes of CPU time, the correlated subquery is the likely cause.

**Phase to address:** Phase 1 (metadata population) — test against full-system query plan with `EXPLAIN` before running in production.

---

### Pitfall 3: `hasNoLineageData` Guard Shows Empty State Instead of Standalone Table Node

**What goes wrong:**
`LineageGraph.tsx` (line 679) checks `data.graph.edges?.length === 0` and renders a "No Lineage Data Available" empty-state message instead of the graph. This fires for ANY table with zero lineage edges — including tables that exist in `OL_DATASET`/`OL_DATASET_FIELD` but have not yet had lineage extracted. After full metadata population, thousands of tables will have zero lineage edges. If a user navigates to one of these tables via the AssetBrowser, they see:

> "No lineage relationships have been discovered for table {datasetId}."

But they also see nothing about the table's schema — no column list, no data types. The feature request is to render a standalone table node card with columns listed, not the empty-state message. The current code explicitly blocks the graph render path when `edges.length === 0`.

**Why it happens:**
The empty-state guard was added to prevent the ELK layout from hanging on a single-node zero-edge graph (see the comment at line 279: "certain ELK configurations can cause ELK to hang indefinitely"). This is correct for the old ELK path, but the layout engine was subsequently replaced with a custom topological layout (`layoutEngine.ts`) that already handles zero-edge graphs safely — the ELK hang no longer applies. The guard is now over-broad: it blocks all zero-edge graphs from rendering, including legitimate standalone tables.

**Consequences:**
After full metadata population, every newly catalogued table without lineage becomes unreachable in graph view. Users cannot see column schemas for tables that exist but have no lineage yet.

**Prevention:**
The fix requires two changes:

1. In `LineageGraph.tsx`: Replace the `hasNoLineageData` binary guard with a conditional that distinguishes "table exists, zero edges" from "table not found". When `data.graph.nodes.length > 0 && data.graph.edges.length === 0`, proceed to the graph render path (the custom layout handles this correctly). When `data` is null or `data.graph.nodes.length === 0`, show the empty state.

2. In `layoutEngine.ts`: Verify that `layoutGraph()` with one table node and zero edges produces a valid positioned node at a reasonable canvas coordinate. The current `placeIsolatedGrid` path in `layoutGraph()` already handles isolated tables — trace through the code path: when `connected` is empty and `isolated` has one entry, `placeIsolatedGrid` is called and places the node at `(0, startSecondary)`. This is correct — no change needed.

**Detection:**
Navigate to any table that has columns registered in `OL_DATASET_FIELD` but no entries in `OL_COLUMN_LINEAGE`. The graph view should show the table node with columns; instead it shows "No Lineage Data Available."

**Phase to address:** Phase 2 (standalone table rendering) — this is the primary rendering change. Do not attempt before Phase 1 metadata population is complete, since you need populated `OL_DATASET_FIELD` records to verify column rendering works.

---

### Pitfall 4: AssetBrowser Fetches `limit: 1000` Datasets — Breaks at Full-System Scale

**What goes wrong:**
`AssetBrowser.tsx` line 80 fetches datasets with `{ limit: 1000, offset: 0 }`. On the current single-database deployment, the namespace contains hundreds of tables — well within the 1000-row limit. After full-system metadata population (all databases), a production Teradata system can have 10,000–100,000 user tables. The first page fetch returns only 1000, but the component groups them all client-side with `useMemo(() => groupByDatabase(...))`. The remaining 9,000+ tables are silently omitted. Users see only the first 1000 alphabetically — which means entire databases may be missing from the browser without any indication.

**Why it happens:**
The `list_datasets()` repository method supports pagination (`limit`, `offset`) but `AssetBrowser.tsx` uses a single page with a hardcoded limit of 1000, treating it as a full fetch. This was sufficient when only lineage-referenced objects were catalogued.

**Consequences:**
- Databases that sort alphabetically after the first 1000 tables are entirely invisible.
- No error or truncation warning is shown to the user.
- Users search for tables that "should be there" and find nothing.

**Prevention:**
Two options, in order of preference:
1. **Virtual scrolling / infinite scroll**: Use TanStack Query's `useInfiniteQuery` (already used in `AllDatabasesLineageGraph.tsx` — see `useDatabases`) to fetch pages lazily as the user scrolls. Group by database as each page arrives.
2. **Server-side database grouping**: Add a `GET /api/v2/openlineage/namespaces/{namespaceId}/databases` endpoint that returns distinct database names with counts, without fetching all tables. The browser expands a database lazily, fetching only its tables on demand.

Option 2 is simpler to implement and matches the existing tree-expand UX pattern already used in `AssetBrowser`.

**Detection:**
Run `SELECT COUNT(*) FROM OL_DATASET` after full population. If count > 1000 and the AssetBrowser shows exactly 1000 items in its listing, the limit is the problem.

**Phase to address:** Phase 1 (metadata population) — the limit issue surfaces immediately after full-system scan. Address the AssetBrowser fetch strategy before triggering the full population.

---

## Moderate Pitfalls

Mistakes that cause incorrect behavior or performance degradation, but not total failure.

---

### Pitfall 5: `OL_DATASET_FIELD` `field_id` Composite Key Is VARCHAR(512) — Borderline for Deep Paths

**What goes wrong:**
`field_id` is constructed as `namespace_id/database.table/column` which calculates to a maximum of approximately 305 characters (16 + 1 + 30 + 1 + 128 + 1 + 128). This fits within VARCHAR(512). However, Teradata allows database names up to 30 characters, table names up to 128 characters, and column names up to 128 characters — the calculation above uses the maximums. In practice, multi-level naming conventions (e.g., `project_database_region_v2.very_long_view_name_with_context.column_identifier_with_full_description`) can push close to the theoretical maximum. The VARCHAR(512) limit is safe today. However, `dataset_id` in `OL_DATASET` is VARCHAR(256) — and `dataset_id` is used as a foreign key reference in `OL_DATASET_FIELD`. A dataset name of `very_long_database_name_30ch.very_long_table_name_128ch` generates a `dataset_id` of `namespace_id(16)/database(30).table(128)` = 176 characters, safely within 256. Tested: the schema is safe at Teradata's documented maximums. This pitfall is LOW risk but worth verifying in the actual environment.

**Prevention:**
After full population, run:
```sql
SELECT MAX(CHAR_LENGTH(dataset_id)) FROM OL_DATASET;
SELECT MAX(CHAR_LENGTH(field_id)) FROM OL_DATASET_FIELD;
```
Confirm both are well below their VARCHAR limits. If approaching the limit, extend to VARCHAR(512) and VARCHAR(1024) respectively before scaling further.

**Phase to address:** Phase 1 (metadata population) — validate post-population with the query above.

---

### Pitfall 6: `get_table_lineage_graph()` Raises `DatasetNotFoundError` When Table Has No Fields

**What goes wrong:**
`lineage_service.py` line 171 raises `DatasetNotFoundError` when `get_dataset_fields()` returns an empty list:

```python
fields = self.dataset_repo.get_dataset_fields(dataset_id)
if not fields:
    raise DatasetNotFoundError(f"No fields found for dataset: {dataset_id}")
```

A table catalogued in `OL_DATASET` but not yet in `OL_DATASET_FIELD` (e.g., if the fields population step was interrupted) triggers this error. The frontend receives a 404 and shows "Failed to load lineage: Dataset not found" — indistinguishable from the table not existing at all. After full metadata population with a potentially slow `populate_openlineage_fields()` run, partial population states are more likely.

**Prevention:**
Change the guard to a warning rather than an error: if a dataset exists but has no fields, return a graph with a single node (the table) and zero edges rather than raising. The frontend's standalone node rendering (Phase 2) handles this case. Add a `has_fields` flag to the response to let the UI distinguish "table with fields" from "table with no field metadata yet."

**Phase to address:** Phase 2 (standalone table rendering) — this surfaces when the standalone render feature is built. Fix the service layer before the UI change, not after.

---

### Pitfall 7: `fitView()` on Single Standalone Node Zooms Excessively

**What goes wrong:**
`LineageGraph.tsx` calls `applySmartViewport(nodes)` after layout completes. When there is a single table node (standalone, no edges), `fitView` with `padding: 0.2` zooms the viewport to fill the entire canvas with that one node. A table node at full zoom becomes unreadably large — the card expands to fill the viewport because `fitView` maximizes zoom to fit the node bounds. React Flow's `fitView` does not apply a maximum zoom by default; it computes the zoom needed to fill the container with the given nodes.

**Prevention:**
When rendering a standalone node (detected as `nodes.length === 1 && edges.length === 0`), use `reactFlowInstance.setViewport({ x: 50, y: 50, zoom: 1.0 })` instead of `fitView`. This positions the node at a comfortable reading zoom rather than filling the viewport. Alternatively, pass `maxZoom: 1.2` to `fitViewOptions` to cap the zoom level regardless of node count.

**Detection:**
Navigate to a standalone table with many columns. The node card should appear at approximately the same size as table nodes in a lineage graph — not full-screen.

**Phase to address:** Phase 2 (standalone table rendering).

---

### Pitfall 8: `populate_openlineage_fields()` Uses `DBC.ColumnsV` — Returns NULL Types for Views

**What goes wrong:**
The existing `populate_openlineage_fields()` function already contains this note: "ColumnsV may return NULL for view column types." The function fetches from `DBC.ColumnsV` and falls back to `COALESCE(TRIM(c.ColumnType), 'UNKNOWN')` for null types. At full-system scale, views are a significant portion of the catalog. If `QVCI` is not enabled on the system, all view column types come back as `'UNKNOWN'` — which is stored in `OL_DATASET_FIELD.field_type`. The standalone table node rendering displays `field_type` as the data type label for each column. A table card showing "UNKNOWN" for every column type is significantly less useful than showing "VARCHAR(100)" or "INTEGER".

**Why it happens:**
The CLAUDE.md documents this requirement: the script previously used `DBC.ColumnsJQV` (QVCI-required) for complete view type information, then was reverted to `DBC.ColumnsV` as a fallback. The full-system scan will encounter many views, amplifying the NULL-type problem.

**Prevention:**
Verify QVCI status before running the full-system scan:
```sql
SELECT 1 FROM DBC.ColumnsJQV WHERE 1=0;
```
If this query succeeds, switch `populate_openlineage_fields()` back to `DBC.ColumnsJQV`. If it raises error 9719 (QVCI disabled), accept `'UNKNOWN'` for view column types and surface a warning in the population script output. Display "—" in the standalone node UI instead of "UNKNOWN" when `field_type` is null or the string "UNKNOWN".

**Phase to address:** Phase 1 (metadata population) — check QVCI status as a pre-flight step before running the full scan.

---

### Pitfall 9: `NOT IN` System Database List With 27+ Constants Degrades Teradata Query Plan

**What goes wrong:**
Teradata's optimizer can struggle with `NOT IN` clauses containing large literal lists, particularly when combined with `DBC` view scans. A `NOT IN (27 literals)` clause may not be applied as a filter push-down — instead Teradata materializes the full `DBC.TablesV` result set into spool before applying the exclusion. `DBC.TablesV` on a large system returns millions of rows (one per column per table). The spool exhaustion risk from Pitfall 2 compounds with a large `NOT IN` list.

**Prevention:**
Create a helper table or volatile table of excluded database names, then use `NOT EXISTS` or `LEFT JOIN ... IS NULL` against that table — this allows Teradata to use a hash join rather than a linear scan. Alternatively, use a `LIKE` pattern filter first (`DatabaseName NOT LIKE 'SYS%' AND DatabaseName NOT LIKE 'TD_%'`) to eliminate the largest categories, with a specific `NOT IN` for the remaining exceptions. This is a secondary optimization; Pitfall 2's LEFT JOIN approach already mitigates the primary spool risk.

**Phase to address:** Phase 1 (metadata population) — validate with `EXPLAIN` before running.

---

### Pitfall 10: Existing Tests Break When OL_DATASET Contains Full-System Objects

**What goes wrong:**
The 73 database tests (`database/tests/run_tests.py`) and 20 backend API tests (`lineage-api/tests/run_api_tests.py`) currently operate against a controlled dataset. Many tests assert specific counts (e.g., "expect N datasets in namespace") or check that search returns specific results. After full metadata population:
- Count assertions fail because `OL_DATASET` now contains thousands of rows instead of tens.
- Search tests return unexpected results because system tables (if not filtered) appear.
- The `AssetBrowser` test (line 104: `{ limit: 1000, offset: 0 }`) becomes a test of truncation behavior rather than correct behavior.

**Prevention:**
Run full-system population against a separate test namespace or schema, not the same `demo_user` database used by the test suite. Add a `--namespace` flag to `populate_lineage.py` to target a specific Teradata database. The existing test infrastructure uses `demo_user` — keep test data isolated there and use a separate database for the full catalog.

**Phase to address:** Phase 1 (metadata population) — design the isolation boundary before running the first full scan.

---

## Minor Pitfalls

---

### Pitfall 11: `TableNode` Renders an Empty Column List When `OL_DATASET_FIELD` Has No Rows for the Table

**What goes wrong:**
`TableNode.tsx` renders a list of `ColumnRow` components from the `columns` prop. When a table exists in `OL_DATASET` but has zero rows in `OL_DATASET_FIELD` (partial population, or table with no columns in `DBC.ColumnsV`), the node renders with only the header and no column rows — visually indistinguishable from a collapsed table node. The user cannot tell whether the table has no columns, the columns have not been catalogued yet, or the node is collapsed.

**Prevention:**
When `columns.length === 0` in the standalone node rendering path, show a single placeholder row: "No column metadata available" in italics. This distinguishes "no columns" from "collapsed" and avoids the ambiguity.

**Phase to address:** Phase 2 (standalone table rendering).

---

### Pitfall 12: Re-running `populate_lineage.py` Without `--skip-clear` Deletes the Entire Catalog

**What goes wrong:**
`clear_openlineage_data()` without `lineage_only=True` deletes `OL_COLUMN_LINEAGE`, `OL_DATASET_FIELD`, and `OL_DATASET`. Running the standard populate command (`python populate_lineage.py`) clears the full catalog before repopulating. After full-system population (potentially hours of runtime), an accidental re-run without `--skip-clear` destroys the entire catalog and forces a full re-scan. This is especially dangerous because the default mode already includes `--skip-clear=False`.

**Prevention:**
For full-system catalog, default the behavior to `--skip-clear` (i.e., always append unless explicitly told to clear). Add a `--full-refresh` flag that explicitly clears and re-populates. Warn prominently when `--full-refresh` is used with a "This will delete N datasets and N fields. Confirm? [y/N]" prompt.

**Phase to address:** Phase 1 (metadata population) — change defaults before running any full-system scan.

---

### Pitfall 13: Graph Engine Warmup Loads All Lineage Edges — Unaffected by Metadata Scale, But Duration May Confuse

**What goes wrong:**
The in-memory graph engine (`graph_engine.initialize`) loads `OL_COLUMN_LINEAGE` into a NetworkX DiGraph on startup. Full metadata population does NOT affect this — `OL_COLUMN_LINEAGE` is populated separately by DBQL extraction and view lineage, not by the catalog scan. However, after full-system metadata scan, the `OL_DATASET` and `OL_DATASET_FIELD` tables are much larger. The database-lineage BFS path in `lineage_service.py` queries `OL_DATASET` for all tables in a database (`search_pattern = f"{database_name}.%"`). With full-system metadata, this query retrieves many more rows per database, increasing the metadata enrichment time for the database-lineage API.

**Prevention:**
Index `OL_DATASET.name` on the pattern `database_name.%` (a prefix scan). The existing `idx_ol_dataset_name` index on `name` should support this. Verify with `EXPLAIN` that the existing index is used after full population.

**Phase to address:** Phase 1 (metadata population) — verify with `EXPLAIN` post-population.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Full DBC scan (all databases) | No system DB filter includes Teradata internal objects | Add `DatabaseName NOT IN (...)` exclusion list before first run |
| Full DBC scan (all databases) | Correlated NOT EXISTS degrades at 10K+ rows | Switch to LEFT JOIN IS NULL pattern; test with EXPLAIN |
| Full DBC scan (all databases) | Script default clears catalog on re-run | Change default to --skip-clear; add --full-refresh with confirmation |
| Full DBC scan (all databases) | ColumnsV returns NULL types for views if QVCI disabled | Verify QVCI status pre-flight; display "—" instead of "UNKNOWN" |
| AssetBrowser after full scan | limit:1000 silently truncates full catalog | Switch to lazy load by database or increase limit with pagination |
| Standalone table rendering | `hasNoLineageData` guard blocks standalone table render | Allow graph render when nodes>0 && edges==0; guard only nodes==0 |
| Standalone table rendering | `fitView` on single node zooms excessively | Use fixed viewport zoom (1.0) for single-node graphs |
| Standalone table rendering | Service raises DatasetNotFoundError for no-field tables | Return single-node graph instead of error when dataset exists but has no fields |
| Test suite after full scan | Test count assertions break with full catalog | Run full population against isolated namespace/database separate from test data |

---

## Integration Pitfalls

Mistakes specific to connecting these two features to the existing system.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Full scan + existing lineage tests | Running full scan in same `demo_user` database breaks test expectations | Use a separate Teradata database for the full catalog; keep `demo_user` as the test namespace |
| Full scan + AssetBrowser | AssetBrowser limit:1000 fetches only first page alphabetically | Migrate to lazy-load-by-database before triggering full population |
| Standalone render + `hasNoLineageData` guard | Guard blocks graph render for any zero-edge result | Change condition from `edges.length === 0` to `nodes.length === 0` for empty state |
| Standalone render + `get_table_lineage_graph` | Service raises 404 when table has no fields in OL_DATASET_FIELD | Return single-node graph instead of raising; let frontend decide how to display |
| Full scan + `clear_openlineage_data` | Re-running populate without skip-clear destroys multi-hour catalog | Default to append mode; require explicit `--full-refresh` flag |
| Full scan + QVCI disabled | DBC.ColumnsV returns NULL for view column types | Detect QVCI status at script start; display "—" in UI for unknown types |

---

## "Looks Done But Isn't" Checklist

- [ ] **System DB filter in place:** After full scan, query `SELECT DISTINCT DatabaseName FROM OL_DATASET` — verify no `DBC`, `SYS*`, or `TD_*` databases appear.
- [ ] **Population performance validated:** Run population against full DBC with `EXPLAIN` first; confirm no correlated subquery plans; confirm no spool exhaustion on test run.
- [ ] **Standalone table renders columns:** Navigate to a table with fields but no lineage — verify a single node card appears with all columns listed, not the "No Lineage Data Available" message.
- [ ] **Standalone node viewport:** Standalone table should display at zoom 1.0 (approximately the same scale as a node in a multi-table graph), not zoomed to fill the screen.
- [ ] **AssetBrowser completeness:** After full scan with 5,000+ datasets, the AssetBrowser should display all databases (not just the first 1000 alphabetically). Confirm by checking for databases that sort late alphabetically.
- [ ] **No `DatasetNotFoundError` for populated tables:** Request the lineage API for a table that exists in `OL_DATASET` but has zero `OL_DATASET_FIELD` entries — confirm a 200 response with a single-node graph, not a 404.
- [ ] **Re-run safety:** Run `populate_lineage.py` twice. Confirm the second run does not delete and re-populate from scratch unless `--full-refresh` is explicitly passed.
- [ ] **Test isolation:** Run `database/tests/run_tests.py` after full catalog population — confirm all previously passing tests still pass (no count assertion failures from larger dataset).

---

## Sources

**Teradata System Database Exclusion:**
- [Teradata Data Dictionary: List all tables in all databases](https://dataedo.com/kb/query/teradata/list-all-tables-in-all-databases) — provides canonical list of system databases to exclude from `DBC.TablesV` queries (verified 2025)
- [System User DBC - Teradata Vantage Analytics Database](https://docs.teradata.com/r/Enterprise_IntelliFlex_VMware/Database-Administration/Databases-and-Users-in-Teradata-All-DBAs/The-System-Users/System-User-DBC) — official docs on DBC system user scope

**Teradata Performance (Spool/Subqueries):**
- [Teradata Spool Space 101: Understanding, Managing, and Troubleshooting](https://www.dwhpro.com/teradata-spool-space-no-more-spool-space/) — correlated subquery spool risks
- [Correlated Subqueries - Teradata Documentation](https://docs.teradata.com/r/2_MC9vCtAJRlKle2Rpb0mA/ODWfNd~BHQoI4RhZ2zP9Xw) — official Teradata correlated subquery behavior and optimization
- [Monte Carlo Teradata Integration Docs](https://docs.getmontecarlo.com/docs/teradata) — metadata scanning patterns for production Teradata systems; spool allocation recommendation for metadata collection accounts

**React Flow:**
- [React Flow Performance Guide](https://reactflow.dev/learn/advanced-use/performance) — fitView behavior, node sizing, avoiding unnecessary re-renders
- [React Flow FitViewOptions API](https://reactflow.dev/api-reference/types/fit-view-options) — `maxZoom` parameter for preventing over-zoom on single nodes
- [React Flow Common Errors](https://reactflow.dev/learn/troubleshooting/common-errors) — container dimension requirements

**Project-Specific Sources (Codebase):**
- `database/scripts/populate/populate_lineage.py` — existing NOT EXISTS pattern (Pitfall 2); missing DatabaseName filter (Pitfall 1); clear_openlineage_data default (Pitfall 12)
- `database/scripts/setup/setup_lineage_schema.py` — VARCHAR sizes for dataset_id (256), field_id (512) — verified safe at Teradata max identifier lengths (Pitfall 5)
- `lineage-ui/src/components/domain/LineageGraph/LineageGraph.tsx` lines 679-706 — `hasNoLineageData` guard (Pitfall 3); ELK hang comment at line 279 (historical context for why guard was added)
- `lineage-ui/src/components/domain/AssetBrowser/AssetBrowser.tsx` line 80 — hardcoded `limit: 1000` (Pitfall 4)
- `lineage-api/services/lineage_service.py` lines 171-172 — `DatasetNotFoundError` for no-fields tables (Pitfall 6)
- `CLAUDE.md` — QVCI requirement documentation; `DBC.ColumnsJQV` vs `DBC.ColumnsV` context (Pitfall 8)

---
*Pitfalls research for: Adding full system metadata scanning + standalone table rendering to existing Teradata column-level lineage app*
*Researched: 2026-02-23*
*Milestone: Complete metadata population and standalone table rendering*
