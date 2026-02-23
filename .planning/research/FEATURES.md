# Feature Research: System Catalog Population and Standalone Table Rendering

**Domain:** Data lineage / metadata catalog — full system catalog + table rendering without lineage
**Researched:** 2026-02-23
**Confidence:** HIGH (existing codebase examined directly; DBC view patterns from official Teradata docs and DataHub connector source; UX patterns from DataHub, OpenMetadata official docs; backend error paths confirmed in source)

---

## Context

This research covers the NEW milestone: adding complete metadata population and standalone table rendering to the existing lineage app.

**What already exists (do NOT rebuild):**
- `AssetBrowser` — hierarchical database/table/column browser backed by OL_* tables
- `populate_lineage.py` — already populates OL_DATASET from `DBC.TablesV WHERE TableKind IN ('T', 'V', 'O')` and OL_DATASET_FIELD from `DBC.ColumnsV`; it already queries ALL Teradata tables system-wide but applies filters excluding `LIN_%` and `OL_%` tables; no system database exclusion exists yet
- `get_table_lineage_graph()` backend — throws `DatasetNotFoundError("No fields found for dataset")` when OL_DATASET_FIELD is empty, which causes frontend "Failed to load lineage" error
- `LineageGraph.tsx` — renders error state when backend 404s; this is the broken experience for tables without lineage

**Core problem being solved:**
1. Asset Browser only shows databases/tables that happen to be in OL_DATASET (populated by DBQL lineage extraction). Users want EVERY database, table, view, and column visible.
2. When a user navigates to a table with no lineage, the app shows "Failed to load lineage" error instead of rendering the table as a standalone node with its columns.

---

## How Reference Tools Handle These Problems

### Pattern 1: Catalog-First, Lineage-Optional (DataHub, OpenMetadata)

Both DataHub and OpenMetadata separate catalog population from lineage extraction. The Teradata connector for DataHub extracts all tables/views from `dbc.tables` and `DBC.TablesV` by default (`include_tables: true`, `include_views: true`). Lineage extraction is separately controlled via `include_table_lineage` (default: false). Assets exist in the catalog regardless of whether lineage has been populated. [MEDIUM confidence — DataHub docs verified]

**Implication:** The catalog (OL_DATASET, OL_DATASET_FIELD) should be populated independently of lineage (OL_COLUMN_LINEAGE). The populate script already does this structurally — the gap is system database filtering and the lineage service not gracefully handling zero-field/zero-edge cases.

### Pattern 2: System Database Exclusion via Allowlist/Denylist

DataHub's Teradata connector uses `database_pattern` with default deny regex excluding ~40 system databases: All, Crashdumps, DBC, dbcmngr, Default, External_AP, EXTUSER, GLOBAL_FUNCTIONS, LockLogShredder, PUBLIC, SQLJ, SYSBAR, SYSJDBC, SYSLIB, SYSSPATIAL, SYSUDTLIB, SYSUIF, SysAdmin, Sys_Calendar, SystemFe, TDBCMgmt, TDMaps, TDPUSER, TDQCD, TDStats, TD_ANALYTICS_DB, TD_SERVER_DB, TD_SYSFNLIB, TD_SYSGPL, TD_SYSXML, TDaaS_*, dbcmngr, mldb, system, tapidb, tdwm, val, dbc. [HIGH confidence — DataHub GitHub source + Teradata community docs]

**Implication:** The populate script needs a configurable system-database exclusion list as a `DatabaseName NOT IN (...)` clause on the DBC.TablesV query.

### Pattern 3: Standalone Table Renders as Single Node (DataHub, Atlan, OpenMetadata)

When a user views a table that has no lineage data, commercial tools render the table card (name + columns) as a single isolated node with no edges and an informational banner: "No lineage available for this asset" or "No upstream/downstream connections found." They never show an error state. The graph renders with the table populated; the empty-edge state is a valid result, not an error. [MEDIUM confidence — DataHub and OpenMetadata UI behavior confirmed via official docs and GitHub issue #16404]

**Implication:** The backend `get_table_lineage_graph()` must not throw when there are no edges. The frontend must render a single-node graph as a valid success state (not error). The existing `get_column_lineage_graph()` already handles this correctly — it always adds the root node even if there are no lineage records, returning `{nodes: [root], edges: []}`. The table-level path throws instead.

### Pattern 4: Asset Count and Table Type Indicators in Browser

Every major catalog tool (DataHub, Atlan, OpenMetadata) shows object type icons in the browser — TABLE vs VIEW vs MATERIALIZED VIEW — and shows a count of tables per database. The existing AssetBrowser already does this. The gap is that only lineage-populated tables appear, not all tables. [HIGH confidence — directly observed in existing AssetBrowser.tsx]

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Browse ALL databases in Asset Browser** | Every data catalog (DataHub, Atlan, OpenMetadata) shows every database, not just those with lineage. The current Asset Browser is empty for any database not touched by DBQL extraction. Users click a database and find nothing — the app appears broken. | LOW | The populate script already queries DBC.TablesV globally. The fix is adding a `DatabaseName NOT IN (system_db_list)` filter so system databases (DBC, SysAdmin, Sys_Calendar, etc.) are excluded. The frontend AssetBrowser.tsx already renders whatever is in OL_DATASET — no frontend change needed. |
| **Browse ALL tables and views per database** | Follows from above. Once all databases are visible, all their tables/views must appear. Users expect to browse the full inventory, not just lineage-connected tables. | LOW | Same fix as above — OL_DATASET population already reads all TableKind IN ('T', 'V', 'O') tables. Removing DBQL-extraction-first requirement completes this. |
| **Browse ALL columns per table** | The Asset Browser already shows columns when a dataset is expanded (via `useOpenLineageDataset`). But if OL_DATASET_FIELD is not populated for that table, the column list is empty ("No fields found"). Users expect to see schema. | LOW | OL_DATASET_FIELD is already populated from DBC.ColumnsV for all tables in OL_DATASET. This works today for tables that were populated via lineage extraction. After full catalog population, all columns appear automatically — no feature change needed beyond running populate_lineage.py. |
| **Standalone table renders a node with columns, not an error** | Any tool that supports "view table" renders the table card. DataHub, Atlan, and OpenMetadata all show a single-node graph with columns listed when no lineage exists. The current behavior ("Failed to load lineage") is an error state for what is a valid use case. Users who click any table in the new full catalog will hit this error. | MEDIUM | Two-part fix: (1) Backend: `get_table_lineage_graph()` must not throw `DatasetNotFoundError` when there are no lineage edges — return `{nodes: [root_table_node], edges: []}` instead. (2) Frontend: `LineageGraph.tsx` must render a single-node graph as a valid empty-edge state, not an error. |
| **"No lineage" informational state in graph view** | Standard UX in all catalog tools: when a table has no connections, show an informational banner/message like "No lineage connections found for this table." This distinguishes "no lineage" (valid state) from "failed to load" (error state). Carbon Design System recommends positive framing: "Start exploring by adding lineage data." | LOW | A conditional banner in `LineageGraph.tsx` or `LineagePage.tsx`: when `graph.nodes.length === 1 && graph.edges.length === 0`, show an informational callout above the graph. The table node still renders. |
| **System database exclusion from catalog population** | Users browsing the Asset Browser should not see DBC, SysAdmin, Sys_Calendar, SYSJDBC, SYSLIB, etc. These are Teradata internal databases. Including them pollutes the catalog with ~40 databases and thousands of system tables that are not user data. | LOW | Add `DatabaseName NOT IN ('All','Crashdumps','DBC','dbcmngr','Default','External_AP','EXTUSER','GLOBAL_FUNCTIONS','LockLogShredder','PUBLIC','SQLJ','SYSBAR','SYSJDBC','SYSLIB','SYSSPATIAL','SYSUDTLIB','SYSUIF','SysAdmin','Sys_Calendar','SystemFe','TDBCMgmt','TDMaps','TDPUSER','TDQCD','TDStats','TD_ANALYTICS_DB','TD_SERVER_DB','TD_SYSFNLIB','TD_SYSGPL','TD_SYSXML','dbcmngr','mldb','system','tapidb','tdwm','val')` to the DBC.TablesV query in `populate_openlineage_datasets()`. |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required for correctness, but improve usability.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Configurable database include/deny list** | Different Teradata environments have different system databases. A hardcoded exclusion list will miss some system DBs on some installations (Teradata docs explicitly note the list is environment-dependent). A configurable pattern in `.env` or a config file lets admins tune without code changes. DataHub models this as `database_pattern` with allow/deny regex. | LOW | Add `CATALOG_EXCLUDE_DATABASES` and `CATALOG_INCLUDE_DATABASES` env vars (comma-separated regex patterns). Default to the known system DB list. Applied in `populate_lineage.py` before the DBC.TablesV INSERT...SELECT. |
| **"Has lineage" indicator per table in Asset Browser** | Shows users at a glance which tables have known lineage (dot/badge) vs which are catalog-only. DataHub does this. Users can quickly identify where lineage exploration is meaningful vs where the standalone-node view is expected. | LOW | JOIN OL_DATASET against OL_COLUMN_LINEAGE to compute `has_lineage: bool` per dataset. Add to the `list_datasets` API response. Render as a small badge or colored indicator in `DatasetItem` in AssetBrowser.tsx. |
| **Table count badge per database in Asset Browser** | Shows "(42 tables, 8 views)" under each database node. Sets user expectations before expanding a large database. Currently the count shows total datasets but doesn't distinguish tables from views. | LOW | OL_DATASET already has `source_type` (TABLE/VIEW). Compute counts in the existing `list_datasets` response. Update the badge in `DatabaseItem` to show `T: N, V: N`. |
| **Incremental / idempotent catalog refresh** | Running `populate_lineage.py` again should only add new tables/columns, not re-insert or corrupt existing entries. Currently this is done via `NOT EXISTS` guards in the INSERT...SELECT statements — this is already correct. But users need a way to sync new tables added to Teradata after initial population. | LOW | Already implemented via `NOT EXISTS` pattern. Document as a scheduled re-run in README. Optionally add `--catalog-only` flag to `populate_lineage.py` to run only the dataset/field population steps without touching OL_COLUMN_LINEAGE. |
| **NOPI table type display** | `TableKind = 'O'` is a NOPI (No Primary Index) table in Teradata — already included in the populate query. These should render with a distinct visual badge (NOPI) in the Asset Browser, similar to VIEW vs TABLE badges. | LOW | Add 'O' case to `getAssetTypeFromSourceType()` in AssetBrowser.tsx. Map `source_type = 'TABLE'` currently — could be `NOPI_TABLE` in the populate script `CASE WHEN` statement. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Show ALL TableKind types (M, P, G, R, F, etc.)** | Users want a "complete" catalog including macros (M), stored procedures (P), triggers (G), functions (R/F), etc. | Macros, triggers, UDFs, and stored procedures are not data assets in the lineage sense — they are code objects. Including them floods the Asset Browser with hundreds of non-navigable objects that cannot have column lineage. The existing `TableKind IN ('T', 'V', 'O')` filter is correct. | Document the scope explicitly: catalog = tables, views, NOPI tables. Stored procedures/macros are out of scope for column-level lineage. |
| **Auto-populate on every app start** | Running `populate_lineage.py` automatically on backend startup means all tables are always current. | Running `DBC.TablesV` and `DBC.ColumnsV` across all user databases can take minutes on large Teradata systems (tens of thousands of tables). Running this at startup blocks the server or causes a long delay before the catalog is usable. | Make catalog refresh a manual CLI command (`python populate_lineage.py --catalog-only`). Add a scheduled cron option in the README. Never run at startup. |
| **Live DBC query on every Asset Browser request** | Instead of using OL_DATASET, query DBC.TablesV directly at browse time so catalog is always fresh. | DBC queries are expensive. `DBC.ColumnsV` for all tables in a large Teradata system can take 30-60 seconds. The existing OL_* materialized catalog approach is correct — it trades real-time freshness for sub-second response. | Keep the OL_* materialized cache. Document re-run frequency guidance (daily or weekly cron for most environments). |
| **Pagination in Asset Browser** | Large catalogs (5000+ tables) make the sidebar slow to load all at once. | Paginating a tree-view sidebar breaks keyboard navigation, spatial memory, and the expand/collapse UX pattern. Users lose orientation after paginating. The current `limit: 1000` fetch cap is problematic for very large catalogs, but pagination is worse. | Use virtual scrolling in the sidebar tree (react-virtual or the TanStack Virtual library). This renders only visible rows while keeping the full list in memory. Frontend-only change, no API changes needed. |
| **Column-level lineage population from DBQL for all tables** | If all tables are in the catalog, shouldn't all their lineage also be populated? | DBQL lineage extraction requires executed SQL in the query log. Tables that have never been touched by a DML/DBQL statement have no lineage to extract — this is correct behavior, not a gap. Attempting to synthesize lineage for tables with no DBQL history produces noise. | Clearly communicate: catalog = all tables; lineage = tables with known data flow. The "No lineage" informational state in the graph view handles this correctly. |

---

## Feature Dependencies

```
[System database exclusion in populate_lineage.py]
    └──enables──> [ALL databases visible in Asset Browser]
                      └──enables──> [ALL tables visible per database]
                                        └──enables──> [Standalone table rendering with columns]

[Standalone table rendering with columns]
    └──requires──> [Backend: get_table_lineage_graph() returns {nodes:[root], edges:[]} instead of throwing]
    └──requires──> [Frontend: LineageGraph renders single-node graph as valid state, not error]
    └──enables──> ["No lineage" informational banner]

["No lineage" informational banner]
    └──requires──> [Frontend: detect nodes.length === 1 && edges.length === 0]
    └──optional──> ["has lineage" indicator in Asset Browser] (enhances, not required)

["Has lineage" indicator in Asset Browser]
    └──requires──> [list_datasets API returns has_lineage: bool per dataset]
    └──requires──> [OL_COLUMN_LINEAGE JOIN in DatasetRepository.list_datasets()]
    └──optional──> [Asset Browser filter: hide tables without lineage]

[Configurable database include/deny list]
    └──requires──> [System database exclusion in populate_lineage.py]
    └──optional──> enhances system database exclusion with runtime config

[Table count badge (T: N, V: N)]
    └──requires──> [ALL tables visible per database] (prerequisite to meaningful counts)
    └──reuses──> [existing source_type field in OL_DATASET]
```

### Dependency Notes

- **Backend fix required before frontend fix:** The backend must return `{nodes, edges}` (not throw) for zero-edge tables before the frontend standalone-node rendering is useful. The backend fix is the blocker.
- **Populate script is prerequisite for all catalog features:** Without system DB exclusion and full catalog population, no amount of frontend changes will show the full asset inventory.
- **No API schema changes for core features:** `get_table_lineage_graph()` already returns the same `{nodes, edges}` shape — the fix is removing the throw and returning a populated root node. Frontend already handles `nodes.length === 1`.
- **"Has lineage" indicator requires schema-level JOIN:** `list_datasets()` currently does not JOIN OL_COLUMN_LINEAGE. Adding this JOIN needs careful performance assessment — OL_COLUMN_LINEAGE can be large. Use a `EXISTS (SELECT 1 FROM OL_COLUMN_LINEAGE WHERE source_dataset = d.name OR target_dataset = d.name)` subquery, not a full JOIN.

---

## MVP Definition

### Launch With (this milestone)

Minimum viable set to deliver "browse everything, view anything" capability.

- [ ] **System database exclusion in populate script** — Add `DatabaseName NOT IN (system_db_list)` to `populate_openlineage_datasets()` in `populate_lineage.py`. Blocks all other catalog features. Without this, DBC/SysAdmin/etc. pollute the browser. [~0.5 days, backend/scripts]
- [ ] **Backend: standalone table returns valid graph** — Remove `raise DatasetNotFoundError("No fields found for dataset")` from `get_table_lineage_graph()`. Replace with: add root table node to `nodes`, return `{nodes: [root_node], edges: []}`. Mirror the pattern already used in `get_column_lineage_graph()` which adds the root node unconditionally. [~0.5 days, backend]
- [ ] **Frontend: render single-node graph as valid state** — In `LineageGraph.tsx`, when the API returns `{nodes: [N], edges: []}`, this must succeed (not error). Currently the error check is on the HTTP error from the backend throw — fixing the backend fixes the frontend automatically. Verify by tracing the error path. [~0.25 days, frontend verification]
- [ ] **Frontend: "No lineage connections" informational banner** — In `LineageGraph.tsx` or `LineagePage.tsx`, detect `nodes.length === 1 && edges.length === 0` after layout completes. Render a non-blocking info panel: "No lineage connections found for [TableName]. This table exists in the catalog but has no known upstream or downstream data flow." [~0.5 days, frontend]
- [ ] **Populate script re-run for full catalog** — After system DB exclusion is in place, document and verify that running `populate_lineage.py` populates ALL user databases/tables/columns into OL_DATASET and OL_DATASET_FIELD. [~0.25 days, testing]

### Add After Validation (v1.x)

- [ ] **"Has lineage" indicator per table in Asset Browser** — Add EXISTS subquery to `list_datasets()`, add `hasLineage: bool` to API response, render as small green dot or badge in `DatasetItem`. [~1 day, backend + frontend]
- [ ] **Configurable database include/deny list** — `CATALOG_EXCLUDE_DATABASES` env var, parsed in populate_lineage.py before DBC queries. [~0.5 days]
- [ ] **Table count badge per database (T: N, V: N)** — Extend API response or compute from existing `source_type` field on the frontend. [~0.5 days, frontend]
- [ ] **`--catalog-only` flag for populate script** — Skip OL_COLUMN_LINEAGE steps; only run namespace/dataset/field population. Useful for catalog refresh without re-running lineage extraction. [~0.25 days]

### Future Consideration (v2+)

- [ ] **Virtual scrolling in Asset Browser for large catalogs** — For environments with 5000+ tables, the current limit-1000 fetch + full tree render may be slow. TanStack Virtual or similar. [~2 days, complex UX]
- [ ] **NOPI table distinct visual badge** — Show NOPI (No Primary Index) tables with a distinct badge. Low user value unless the environment uses many NOPI tables. [~0.25 days]
- [ ] **Asset Browser filter: hide tables without lineage** — Boolean toggle in UIStore; filter OL_DATASET list to `hasLineage: true` only. [~0.5 days]

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| System database exclusion in populate script | HIGH | LOW | P1 |
| Backend: standalone table returns valid graph | HIGH | LOW | P1 |
| Frontend: "No lineage connections" informational banner | HIGH | LOW | P1 |
| Frontend: verify single-node render works | HIGH | LOW | P1 |
| "Has lineage" indicator per table in Asset Browser | MEDIUM | LOW | P2 |
| Configurable database include/deny list | MEDIUM | LOW | P2 |
| Table count badge per database (T: N, V: N) | LOW | LOW | P2 |
| `--catalog-only` flag for populate script | MEDIUM | LOW | P2 |
| Virtual scrolling in Asset Browser | LOW | HIGH | P3 |
| NOPI table distinct visual badge | LOW | LOW | P3 |

**Priority key:**
- P1: Must have for milestone launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

---

## Competitor Feature Analysis

How comparable tools handle the two core problems:

| Problem | DataHub | OpenMetadata | Atlan | Our Approach |
|---------|---------|--------------|-------|--------------|
| System DB filtering | `database_pattern` allow/deny regex, default denies ~40 system DBs | Schema filter regex patterns, user-configurable | Connection-level schema include/exclude | Hardcoded `NOT IN` list in populate script, extensible to env var config |
| Standalone table view (no lineage) | Single-node render with "No upstream lineage detected" banner | Single-node render, lineage tab shows empty state with explainer text | Single-node render, "No lineage available" callout | Fix backend throw → root node return; add info banner in frontend |
| Full catalog population | Separate ingestion pipeline (catalog), separate lineage extraction | Same — catalog ingestion and lineage ingestion are independent steps | Same pattern | populate_lineage.py already does both; just needs system DB filter and idempotent re-run |
| Browse assets without lineage | Yes — assets visible in catalog browser regardless of lineage status | Yes — same | Yes — same | Currently broken; fixed by populate script running for all user DBs |

**Key insight from all reference tools:** Catalog (schema metadata) and lineage (data flow) are always decoupled. Catalog runs first, runs independently, runs more frequently. Lineage is additive. Our current populate_lineage.py conflates the two in one script — this is acceptable and already structured correctly, but the naming creates confusion. The catalog population part already works; it just needs the system database filter.

---

## Critical Backend Bug: Current Behavior vs Expected Behavior

This is the most important finding from direct codebase inspection:

### Current Behavior (broken)
```python
# lineage_service.py:172
fields = self.dataset_repo.get_dataset_fields(dataset_id)
if not fields:
    raise DatasetNotFoundError(f"No fields found for dataset: {dataset_id}")
```
When a table has no lineage edges (but IS in OL_DATASET and OL_DATASET_FIELD), the table's columns exist but the traversal returns no edges. However, the check `if not fields` fires when `get_dataset_fields()` returns an empty list — this can happen if OL_DATASET_FIELD was not populated for the table, OR if the populate script was never run for that table. The throw propagates as HTTP 404, which renders as "Failed to load lineage" in the UI.

**Note:** If OL_DATASET_FIELD IS populated (fields do exist), `get_table_lineage_graph()` succeeds today and returns `{nodes: [field_nodes], edges: []}`. The frontend does NOT error in this case. So the bug only fires when a table is in OL_DATASET but has no rows in OL_DATASET_FIELD. This is the scenario after full catalog population where some tables may lack column data (e.g., NOPI tables, empty staging tables).

### Expected Behavior (fix)
```python
# lineage_service.py — proposed fix
fields = self.dataset_repo.get_dataset_fields(dataset_id)
if not fields:
    # Table exists but has no column metadata — return the table as a standalone node
    return {
        "datasetId": dataset_id,
        "graph": {
            "nodes": [self._build_table_node(dataset_name, namespace_uri, source_type)],
            "edges": []
        }
    }
```
This matches the pattern in `get_column_lineage_graph()` which always seeds the root node regardless of edge count.

---

## Sources

### DataHub Teradata Connector (HIGH confidence — official documentation verified)
- [DataHub Teradata Connector — docs.datahub.com](https://docs.datahub.com/docs/generated/ingestion/sources/teradata) — confirmed: `include_tables: true`, `include_views: true` defaults; `database_pattern` with deny list; lineage optional; metadata extracted from `dbc.columns`, `dbc.tables`, `DBC.TablesV`

### OpenMetadata Teradata Connector (MEDIUM confidence — official documentation)
- [OpenMetadata Teradata Connector — docs.open-metadata.org](https://docs.open-metadata.org/latest/connectors/database/teradata) — confirmed: extracts all tables/databases; catalog separate from lineage; schema filter patterns supported

### Teradata DBC Views (HIGH confidence — Teradata official docs + community)
- [TableKind Column Values — Teradata Community Knowledge Portal](https://support.teradata.com/knowledge?id=kb_article_view&sys_nb_id=37c179fb9725c550d3e9315e6253affa) — confirmed: T=TABLE, V=VIEW, O=NOPI TABLE, M=MACRO, P=STORED PROCEDURE, G=TRIGGER
- [List All Tables — dataedo.com](https://dataedo.com/kb/query/teradata/list-all-tables-in-all-databases) — confirmed: `DBC.TablesV WHERE TableKind = 'T'`; system DB exclusion `NOT IN` list documented
- [Kontext Labs DBC Views — kontext.tech](https://kontext.tech/article/269/useful-dbc-data-base-computer-system-views-in-teradata) — confirmed: DBC.DatabasesV, DBC.TablesV structure

### System Database Exclusion List (HIGH confidence — multiple sources agree)
- [DataHub Teradata source — docs.datahub.com](https://docs.datahub.com/docs/generated/ingestion/sources/teradata) — default deny list of ~40 system databases documented
- [List All Tables — dataedo.com](https://dataedo.com/kb/query/teradata/list-all-tables-in-all-databases) — `NOT IN` list matches DataHub's list with minor additions

### UX Patterns for Empty Lineage State (MEDIUM confidence — official docs + GitHub issues)
- [OpenMetadata GitHub Issue #16404](https://github.com/open-metadata/OpenMetadata/issues/16404) — confirmed: lineage graph for tables with many columns shows node; empty edge state is valid; zoom issues documented
- [Carbon Design System Empty States — carbondesignsystem.com](https://carbondesignsystem.com/patterns/empty-states-pattern/) — confirmed: positive framing for empty states, context-aware visuals

### Existing Codebase (HIGH confidence — direct source examination)
- `/Users/Daniel.Tehan/Code/lineage/lineage-api/services/lineage_service.py:172` — confirmed: `raise DatasetNotFoundError("No fields found for dataset")` is the blocker for standalone table rendering
- `/Users/Daniel.Tehan/Code/lineage/lineage-api/services/lineage_service.py:123-137` — confirmed: `get_column_lineage_graph()` always seeds root node, no throw; table path should mirror this
- `/Users/Daniel.Tehan/Code/lineage/database/scripts/populate/populate_lineage.py:96-127` — confirmed: `populate_openlineage_datasets()` already queries DBC.TablesV `WHERE TableKind IN ('T', 'V', 'O')` without system DB exclusion; this is the root cause of system DB pollution
- `/Users/Daniel.Tehan/Code/lineage/lineage-ui/src/components/domain/LineageGraph/LineageGraph.tsx:644-648` — confirmed: error state renders "Failed to load lineage" when backend throws; fix backend, frontend works automatically

---

*Feature research for: System Catalog Population and Standalone Table Rendering (new milestone)*
*Researched: 2026-02-23*
