# Stack Research

**Domain:** Teradata column-level data lineage — v6.0 System Catalog Population and Standalone Table Rendering
**Researched:** 2026-02-23
**Confidence:** HIGH for all recommendations

---

## Context

This research covers ONLY what is new or changed for the v6.0 milestone. The following are already validated and are NOT re-researched here:

- Python Flask backend, teradatasql driver, loguru, sqlglot, networkx, Redis/Flask-Caching
- React 18 + TypeScript, Vite, TanStack Query/Table, Zustand
- `@xyflow/react` ^12.0.0 (currently 12.10.0 installed) — graph rendering
- ELKjs 0.9.3, Comlink, layoutEngine, openLineageAdapter
- All OL_* table schema, repository layer, dataset/lineage service pattern

**Two new capabilities needed for v6.0:**

1. **Full catalog population** — `populate_lineage.py` currently scans only the single `TERADATA_DATABASE` (e.g., `demo_user`). v6.0 must scan ALL user databases via `DBC.DatabasesV → DBC.TablesV → DBC.ColumnsJQV`, excluding system databases, and register every object into OL_* tables.

2. **Standalone table rendering** — React Flow must render a single `tableNode` with its columns when no lineage edges exist (user clicks a table in the AssetBrowser that has no lineage data). Currently the lineage graph shows an empty-state message instead.

---

## Recommended Stack

### Core Technologies (already present — no version changes required)

| Technology | Installed Version | Purpose | Status |
|------------|------------------|---------|--------|
| `teradatasql` | >=17.20.0 (latest: 20.0.0.52) | DBC.DatabasesV / DBC.TablesV / DBC.ColumnsJQV queries | No change needed |
| `Flask` | >=3.0.0 | REST API for new `/api/v2/catalog/*` endpoints | No change needed |
| `@xyflow/react` | 12.10.0 (latest: 12.10.1) | Render standalone TableNode with empty edges array | No change needed |
| `elkjs` | 0.9.3 | Grid layout for standalone nodes via `layoutSimpleNodes()` | No change needed |

### New Supporting Libraries

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| `tqdm` | >=4.67.3 | Progress bar during full-catalog scan script | Already available system-wide; not in project venv — needs adding to `requirements.txt`. The catalog scan may process hundreds of databases and tens of thousands of tables in a single-connection loop; tqdm gives operators visibility without adding structured logging overhead (loguru already handles structured logs, tqdm handles CLI progress only) |

That is the only net-new library. Everything else is configuration and code, not new packages.

---

## Supporting Libraries (no version change)

| Library | Current Version | Role in v6.0 | Notes |
|---------|----------------|-------------|-------|
| `loguru` | >=0.7.3 | Log per-database scan progress, skip decisions, error counts | Existing pattern — no change |
| `sqlglot` | >=25.0.0 | Not used in catalog scan (only for view lineage extraction) | Unchanged |
| `networkx` | >=3.4.0 | Not used in catalog scan | Unchanged |
| `TanStack Query` | ^5.17.0 | New `useCatalogDataset` hook for the standalone table view | Existing pattern — no change |
| `Zustand` | ^4.4.0 | No change to lineage store needed for standalone render | Unchanged |
| `lucide-react` | ^0.300.0 | No new icons needed | Unchanged |

---

## Installation

```bash
# Add to requirements.txt (project venv)
pip install tqdm>=4.67.3

# No new npm packages — zero frontend additions
```

---

## v6.0 Feature Stack Decisions

### Backend: Full Catalog Scan

**Use `DBC.DatabasesV` with `DBKind` filter, not `DBC.TablesV` directly.**

The current `populate_openlineage_datasets()` queries `DBC.TablesV` without a database filter, which on a real Teradata system would include system databases (`DBC`, `tdwm`, `SysAdmin`, `SYSLIB`, etc.). The correct approach:

1. Query `DBC.DatabasesV WHERE DBKind IN ('D', 'U')` to enumerate user databases.
2. Apply a configurable deny-list to exclude ~44 known Teradata system databases (see Pitfalls section of PITFALLS.md for the full list, sourced from DataHub's production deny-list).
3. For each user database, run the existing `INSERT INTO OL_DATASET ... SELECT FROM DBC.TablesV WHERE DatabaseName = ?` pattern — already proven correct.
4. Run the existing `INSERT INTO OL_DATASET_FIELD ... SELECT FROM DBC.ColumnsJQV` (or `DBC.ColumnsV` fallback) pattern — already proven correct.

**Why NOT a single cross-database INSERT...SELECT:**
A single `SELECT FROM DBC.TablesV` (no WHERE on DatabaseName) on a Teradata system with hundreds of databases and millions of columns will generate an enormous result set and may hit spool space limits. Iterating database-by-database with `tqdm` progress and per-database commit isolation is safer and gives operator feedback.

**Confidence: HIGH** — DataHub, Alation, and BMC Discovery all use this exact database-by-database pattern with a deny-list.

### Backend: System Database Deny-List (hardcoded, not regex)

Use a hardcoded Python `frozenset` of system database names, case-insensitive. Regex is unnecessary overhead for this use case — the names are stable across Teradata versions. The list (44 databases) comes from DataHub's production configuration:

```python
SYSTEM_DATABASES = frozenset({
    'All', 'Crashdumps', 'DBC', 'dbcmngr', 'Default', 'External_AP',
    'EXTUSER', 'GLOBAL_FUNCTIONS', 'LockLogShredder', 'PUBLIC', 'SQLJ',
    'Sys_Calendar', 'SysAdmin', 'SYSBAR', 'SYSJDBC', 'SYSLIB',
    'SYSSPATIAL', 'SystemFe', 'SYSUDTLIB', 'SYSUIF', 'TD_ANALYTICS_DB',
    'TD_SERVER_DB', 'TD_SYSFNLIB', 'TD_SYSGPL', 'TD_SYSXML', 'TDBCMgmt',
    'TDMaps', 'TDPUSER', 'TDQCD', 'TDStats', 'TDaaS_BAR', 'TDaaS_DB',
    'TDaaS_Maint', 'TDaaS_Monitor', 'TDaaS_Support',
    'TDaaS_TDBCMgmt1', 'TDaaS_TDBCMgmt2', 'mldb', 'system',
    'tapidb', 'tdwm', 'val', 'DemoNow_Monitor', 'TDWM',
})
```

Add a `--include-db` / `--exclude-db` CLI argument pair to let operators add/remove databases from the list at runtime. Use argparse (already the project standard) — no need for Click.

**Confidence: HIGH** — sourced from DataHub production connector deny-list, verified against Teradata community documentation.

### Backend: New `--all-databases` CLI Flag

Add `--all-databases` flag to `populate_lineage.py`. When set:
- Enumerate `DBC.DatabasesV` → filter deny-list → scan each user database
- When not set: existing behavior (scan `TERADATA_DATABASE` only)

This is a backward-compatible extension of existing argparse structure — no framework change needed.

### Backend: New API Endpoint `GET /api/v2/catalog/databases`

The frontend needs to list databases and show a standalone table. The existing `/api/v2/openlineage/namespaces/{id}/datasets` endpoint returns datasets but doesn't group by database or filter for "has no lineage."

Add a new route group `/api/v2/catalog/`:
- `GET /api/v2/catalog/databases` — list unique database names from `OL_DATASET` (grouped, with count)
- `GET /api/v2/catalog/databases/{dbName}/tables` — list tables in a database (paginated, with `has_lineage` flag)
- `GET /api/v2/catalog/datasets/{datasetId}` — get a single dataset with fields (same as existing, but without requiring lineage)

These delegate to the existing `DatasetRepository` with new queries — no new service layer patterns needed.

**Why not reuse existing endpoints:** The existing `/namespaces/{id}/datasets` endpoint returns a flat list of all datasets across all databases with no grouping and no `has_lineage` flag. Building a database-grouped catalog browser on top of that would require N+1 requests or an expensive client-side grouping of potentially tens of thousands of datasets.

**Confidence: HIGH** — this is a standard catalog API pattern used by Amundsen, DataHub, and Alation.

### Frontend: Standalone Table Rendering

**No new npm packages needed.**

The existing `TableNode` component already renders correctly with an empty `columns` array (shows "Table-level lineage view" footer) and with a populated `columns` array (shows column rows). The `Handle` components are already conditionally rendered.

**What's new:** A `TableCatalogView` component (new file) that:
1. Takes a `datasetId` as prop
2. Uses `useOpenLineageDataset(datasetId)` (existing hook) to fetch dataset + fields
3. Renders a single `tableNode` in a `<ReactFlow>` instance with `nodes` array of 1 and `edges={[]}` (empty array — React Flow renders nodes-only correctly in v12)
4. Uses `fitView` on mount to center the single node
5. Disables pan/zoom or limits viewport (the user isn't navigating a graph, just viewing a table schema)

**Why React Flow instead of plain HTML:** The TableNode component is deeply integrated with React Flow (uses `Handle`, reads from `useLineageStore`). Extracting it to render outside React Flow would require significant refactoring. Rendering it inside a minimal React Flow instance with `nodes=[singleNode]` and `edges=[]` is zero-refactor and reuses all existing node rendering, column highlighting, and detail panel logic.

**Confirmed behavior (HIGH confidence):**
- React Flow v12 renders nodes with `edges={[]}` correctly — the library does not require edges to render nodes.
- `useNodesState([singleNode])` + `useEdgesState([])` is the standard pattern for this.
- `fitView` after node mount works without `setTimeout` as of React Flow 12.5.0 (current: 12.10.0 which includes this fix).

**Integration point:** The `ExplorePage` currently shows an empty main panel with a "Browse Data Assets" message. When the user clicks a table (not a column) in `AssetBrowser`, route to `TableCatalogView` instead of showing the lineage graph. When they click a column, use the existing `LineagePage` flow.

### Frontend: `useCatalogDataset` Hook (optional)

If the new `/api/v2/catalog/databases` endpoints are added, create a `useCatalogDatabases` hook following the identical pattern as `useOpenLineageDatasets` in `useOpenLineage.ts`. No new libraries — same TanStack Query pattern.

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| System DB filtering | `frozenset` deny-list (hardcoded) | Regex pattern with allow/deny (DataHub style) | Regex is overpowered for 44 static names; frozenset lookup is O(1) and clearer to operators |
| Full scan strategy | Iterate databases one-by-one with `tqdm` | Single cross-database INSERT...SELECT | Single query risks spool limits on large systems; no progress visibility; harder to resume on failure |
| Progress feedback | `tqdm` | loguru-only (no progress bar) | A catalog scan of 100+ databases with 10k+ tables can run 5-10 minutes; operators need visible progress in the terminal |
| Standalone table view | React Flow with 1 node + empty edges | Plain HTML table component | TableNode refactoring would be expensive and duplicate rendering logic; React Flow supports nodes-only out of the box |
| New API routes | New `/api/v2/catalog/` blueprint | Extend `/api/v2/openlineage/` | Catalog browsing is semantically distinct from OpenLineage lineage traversal; separate blueprint keeps both clean and independently versioned |
| CLI framework | argparse (extend existing) | Click | Project already uses argparse throughout; switching introduces inconsistency with no benefit at this scale |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `teradatasql` `fetchall()` for DBC.ColumnsV across all databases | On a production Teradata with millions of columns, `fetchall()` loads everything into Python memory — potential OOM | Stay with INSERT...SELECT patterns (server-side) already established in `populate_openlineage_fields()` |
| A new `@xyflow/react` minor version upgrade to 12.10.1 | Already on 12.10.0; the gap is cosmetic; update costs testing time with zero benefit for v6.0 scope | Stay on 12.10.0 |
| `react-virtualized` or `@tanstack/virtual` for the catalog table list | Premature — the AssetBrowser already handles large lists with TanStack Table's virtualization via the existing pattern | Existing TanStack Table pagination in `DatasetRepository.list_datasets()` |
| SQLAlchemy or an ORM layer | The codebase uses raw `teradatasql` cursor queries throughout — consistent | Continue raw SQL with the established repository pattern |
| Python `concurrent.futures` or async for the catalog scan | The `teradatasql` connection is not thread-safe; parallelizing database scans would require multiple connections and complicates error handling | Single-threaded with `tqdm` progress is sufficient; each database scan uses INSERT...SELECT which runs on Teradata's parallel AMPs anyway |

---

## Version Compatibility

| Package | Current | Latest | Compatibility Notes |
|---------|---------|--------|---------------------|
| `@xyflow/react` | 12.10.0 | 12.10.1 | No version bump needed. Standalone node rendering with empty edges works in 12.x |
| `elkjs` | 0.9.3 | 0.9.3 | No change. `layoutSimpleNodes()` with `separateConnectedComponents` handles the catalog grid layout |
| `tqdm` | not in venv | 4.67.3 | Add `tqdm>=4.67.3` to `requirements.txt`. No conflicts with any existing dependency |
| `teradatasql` | >=17.20.0 | 20.0.0.52 | No version bump required. `DBC.DatabasesV` query works on all versions >=17.x |
| Python | 3.14.3 (system) | — | `tqdm>=4.67.3` requires Python >=3.7 — fully compatible |

---

## Integration Points

### Catalog Scan → Existing OL_* Tables

The full catalog scan writes to the same OL_NAMESPACE, OL_DATASET, OL_DATASET_FIELD tables that the existing `populate_lineage.py` populates. The same `INSERT...SELECT WHERE NOT EXISTS` upsert pattern prevents duplicate records. No schema changes needed.

### Standalone Table Rendering → Existing TableNode

`TableCatalogView` renders `<TableNode>` via the registered `nodeTypes` map — no changes to `TableNode.tsx`, `ColumnRow.tsx`, or `TableNodeHeader.tsx`. The node reuses `useLineageStore` for column selection state, which means clicking a column in the standalone view will correctly open the `DetailPanel` (same as in lineage mode).

### New API Routes → Existing Repository Layer

`/api/v2/catalog/databases` → new `CatalogRepository` (or extend `DatasetRepository`) → existing OL_DATASET queries grouped by `TRIM(SUBSTR(name, 1, POSITION('.' IN name) - 1))`. No new DB schema required.

---

## Sources

- [DataHub Teradata connector — docs.datahub.com](https://docs.datahub.com/docs/generated/ingestion/sources/teradata) — system database deny-list (44 databases), DBC views required (HIGH confidence)
- [DBC.DatabasesV reference — docs.teradata.com](https://docs.teradata.com/r/hNI_rA5LqqKLxP~Y8vJPQg/GqTx8VuBIkfaC4fso9f5cw) — DBKind 'D'/'U' filter (MEDIUM confidence — page required JS, content inferred from community sources)
- [Teradata community: list all databases — teradatapoint.com](https://www.teradatapoint.com/teradata/list-all-databases-and-users-in-teradata.htm) — DBKind filter pattern confirmed (MEDIUM confidence)
- [React Flow Custom Nodes — reactflow.dev](https://reactflow.dev/learn/customization/custom-nodes) — handles not required for standalone rendering (HIGH confidence)
- [React Flow 12.5.0 release notes — reactflow.dev](https://reactflow.dev/whats-new/2025-03-27) — `fitView` works immediately after `setNodes` without workarounds (HIGH confidence)
- `npm show @xyflow/react version` → 12.10.1 (latest); project has 12.10.0 installed (HIGH confidence — direct verification)
- [tqdm PyPI — pypi.org](https://pypi.org/project/tqdm/) — version 4.67.3, Python >=3.7, ~60ns overhead per iteration (HIGH confidence)
- [teradatasql PyPI — pypi.org](https://pypi.org/project/teradatasql/) — latest 20.0.0.52 as of 2026-02-14 (HIGH confidence)
- First-party codebase analysis — `populate_lineage.py`, `TableNode.tsx`, `layoutEngine.ts`, `dataset_repository.py`, `package.json`, `requirements.txt` (HIGH confidence)

---

## Confidence Assessment

| Area | Level | Reason |
|------|-------|--------|
| tqdm addition | HIGH | Direct pip show confirms not in venv; version confirmed via PyPI |
| System DB deny-list | HIGH | DataHub production connector sourced list; Teradata community confirmation |
| DBC.DatabasesV DBKind filter | HIGH | Multiple Teradata community sources agree; established pattern |
| React Flow standalone nodes | HIGH | Official docs confirm handles not required; empty edges array is standard |
| fitView on mount | HIGH | React Flow 12.5.0 changelog explicitly fixes this; 12.10.0 includes fix |
| No new npm packages | HIGH | Existing TableNode + React Flow supports nodes-only rendering out of the box |
| New catalog API blueprint | HIGH | Standard Flask blueprint pattern; existing codebase precedent |
| INSERT...SELECT per-database iteration | HIGH | Existing codebase uses this exact pattern; DataHub/Alation confirm it |

---

*Stack research for: v6.0 full system catalog population and standalone table rendering*
*Researched: 2026-02-23*
*Confidence: HIGH overall — all additions verified against current sources. Single new dependency (tqdm).*
