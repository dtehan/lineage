# Project Research Summary

**Project:** Teradata Column-Level Data Lineage — v6.0 System Catalog Population and Standalone Table Rendering
**Domain:** Teradata metadata catalog + data lineage visualization
**Researched:** 2026-02-23
**Confidence:** HIGH

## Executive Summary

The v6.0 milestone targets two tightly coupled gaps in the existing lineage application: full-system metadata population (scanning ALL user databases rather than only `demo_user`) and standalone table rendering (showing a table card with columns when no lineage edges exist, rather than an error state). These are not new subsystems — the architecture already supports both. The existing `populate_lineage.py` already scans all of `DBC.TablesV`; the gap is a missing system-database exclusion filter. The existing `LineageGraph.tsx` already receives a valid `{nodes, edges}` response from the backend for zero-edge tables; the gap is a single over-broad guard that blocks the render path. This milestone is primarily about removing constraints, not building new capabilities.

The recommended approach is surgical: add a `DatabaseName NOT IN (...)` exclusion clause to the populate script before any full-system scan runs, fix the `lineage_service.py` error throw for no-field tables, change the `hasNoLineageData` guard in `LineageGraph.tsx` from `edges.length === 0` to `nodes.length === 0`, and address the `AssetBrowser` 1000-row limit before triggering the first full population. Only one new library is required (`tqdm` for CLI progress during multi-database scans). All stack components, schema tables, and API endpoints already exist and require only targeted modifications.

The primary risks are operational rather than architectural. Running a full-system DBC scan without the system-database exclusion list will flood `OL_DATASET` with Teradata internal objects that are difficult to clean up. Running `populate_lineage.py` without changing the default `--skip-clear` behavior on a multi-hour catalog population will silently destroy the catalog on any accidental re-run. Both are preventable with pre-flight configuration changes that must be in place before the first full scan runs.

---

## Key Findings

### Recommended Stack

See `.planning/research/STACK.md` for full rationale and alternative analysis.

The existing stack requires no architectural changes for v6.0. The one new dependency is `tqdm>=4.67.3` (not currently in the project venv), which provides operator-visible progress during multi-database catalog scans that may run 5-10 minutes. All other components — `teradatasql`, Flask, `@xyflow/react` 12.10.0, ELKjs, TanStack Query, Zustand — are already installed and require no version changes.

**Core technologies (all currently installed):**
- `teradatasql` — DBC.DatabasesV / DBC.TablesV / DBC.ColumnsJQV queries — no version change needed
- `Flask` — existing `/api/v2/openlineage/` blueprint handles the standalone table endpoint without new routes
- `@xyflow/react` 12.10.0 — renders single `TableNode` with `edges={[]}` out of the box; no upgrade needed
- `elkjs` 0.9.3 — `layoutSimpleNodes()` handles isolated nodes; `layoutGraph()` already has `placeIsolatedGrid` for zero-edge cases
- `tqdm>=4.67.3` — NEW: add to `requirements.txt` for catalog scan progress; zero npm additions required

**Net new dependencies:** 1 Python library (`tqdm`). Zero frontend dependencies.

### Expected Features

See `.planning/research/FEATURES.md` for full feature landscape, competitor analysis, and dependency tree.

Reference tools (DataHub, OpenMetadata, Atlan) universally separate catalog population from lineage extraction and render standalone table cards for assets without lineage. The pattern is: assets exist in the catalog regardless of lineage status, and "no lineage" is a valid success state shown with an informational banner, never an error.

**Must have (table stakes for this milestone):**
- System database exclusion in `populate_lineage.py` — blocks all other catalog features; without this, DBC/SysAdmin pollute the browser
- Backend: `get_table_lineage_graph()` returns `{nodes:[root], edges:[]}` instead of throwing `DatasetNotFoundError` when no fields exist
- Frontend: single-node graph renders as valid state (not error) — fixing the backend throw automatically fixes the frontend error display
- Frontend: "No lineage connections" informational banner when `nodes.length > 0 && edges.length === 0`
- AssetBrowser lazy-load by database — must be in place before full catalog population to avoid the 1000-row silent truncation problem

**Should have (after validation):**
- "Has lineage" indicator per table in AssetBrowser — green dot distinguishing catalog-only tables from lineage-connected tables
- Configurable `CATALOG_EXCLUDE_DATABASES` env var — different Teradata installs have different system database sets
- `--catalog-only` flag for `populate_lineage.py` — skip `OL_COLUMN_LINEAGE` steps during schema-only refreshes
- Table count badge per database (T: N, V: N) in AssetBrowser — sets user expectations before tree expansion

**Defer to v2+:**
- Virtual scrolling in AssetBrowser for 5000+ table environments (TanStack Virtual)
- NOPI table (`TableKind = 'O'`) distinct visual badge
- Auto-populate catalog on server startup (anti-pattern: blocks startup for minutes on large systems)
- Live DBC queries on every AssetBrowser request (anti-pattern: 30-60 second response times)

### Architecture Approach

See `.planning/research/ARCHITECTURE.md` for full component boundary analysis, data flow diagrams, and build order.

All v6.0 changes are modifications to existing components — no new services, no new API blueprint required for the core features. The ARCHITECTURE.md covers three research topics: (1) the in-memory graph engine and progressive loading (v4.0, already complete), (2) connected component layout (v5.0, already complete), and (3) full system catalog integration (v6.0 — this milestone). The catalog integration research confirms the architecture is already correct; the primary work is targeted modifications to four existing files.

**Components involved in v6.0 (all existing, modified not new):**
1. `database/scripts/populate/populate_lineage.py` — add `DatabaseName NOT IN (...)` filter; change default clear behavior; add `--exclude-system` / `--full-refresh` flags
2. `lineage-api/services/lineage_service.py` — remove `raise DatasetNotFoundError` when fields is empty; return single-node graph instead (mirrors pattern in `get_column_lineage_graph()`)
3. `lineage-ui/src/components/domain/LineageGraph/LineageGraph.tsx` — change `hasNoLineageData` guard from `edges.length === 0` to `nodes.length === 0`; add informational banner; fix `fitView` zoom for single-node graphs
4. `lineage-ui/src/components/domain/AssetBrowser/AssetBrowser.tsx` — migrate from `{limit: 1000}` flat fetch to lazy-load per database using existing `limit`/`offset` API parameters

### Critical Pitfalls

See `.planning/research/PITFALLS.md` for all 13 pitfalls with file/line references, detection queries, and phase mappings.

1. **No system database filter before full scan** — running `populate_lineage.py` against all databases without `DatabaseName NOT IN (...)` floods `OL_DATASET` with Teradata internal objects (`DBC`, `SysAdmin`, `SYSLIB`, `Sys_Calendar`, etc.). Prevention: add the 27+ database exclusion list before any full scan runs. This is a hard prerequisite — Phase 1 must not proceed without it.

2. **Correlated NOT EXISTS degrades at full scale** — the existing `NOT EXISTS (SELECT 1 FROM OL_DATASET WHERE dataset_id = ?)` pattern becomes row-by-row at 10,000-50,000 tables, risking spool exhaustion (error 2646). Prevention: replace with `LEFT JOIN ... WHERE existing.dataset_id IS NULL` (hash join). Validate with `EXPLAIN` before running in production.

3. **`hasNoLineageData` guard blocks standalone table render** — the guard at `LineageGraph.tsx` line 679 fires for `edges.length === 0`. The original reason (ELK hang on single-node graphs) no longer applies — the layout engine was replaced with a custom O(V+E) algorithm. Prevention: change the empty-state condition to `nodes.length === 0` only.

4. **AssetBrowser `limit: 1000` silently truncates full catalog** — only the first 1000 datasets alphabetically appear after full-system population. No warning shown. Prevention: migrate to lazy-load-by-database before triggering the first full scan.

5. **Re-running populate without `--full-refresh` protection destroys catalog** — `clear_openlineage_data()` without `lineage_only=True` deletes everything. Accidental re-run after a multi-hour full scan forces a complete re-scan. Prevention: change the default to append mode; require explicit `--full-refresh` flag with confirmation prompt.

---

## Implications for Roadmap

Based on combined research, a 2-phase structure is strongly indicated by the dependency chain: catalog population must be complete and validated before standalone table rendering can be properly tested, and the AssetBrowser fix must precede full population to avoid the silent truncation problem.

### Phase 1: Metadata Population Foundation

**Rationale:** The system-database exclusion filter and AssetBrowser lazy-load are hard prerequisites for all other features. Full catalog population is the foundation that makes standalone table rendering meaningful — without it, there are no catalog-only tables to render. All pitfalls categorized as "Phase 1" in PITFALLS.md are blocking before any scan runs.

**Delivers:** All user databases/tables/views/columns visible in AssetBrowser; system databases excluded; populate script safe to re-run; full catalog queryable via existing API

**Addresses (from FEATURES.md):**
- Browse ALL databases in AssetBrowser (P1)
- Browse ALL tables and views per database (P1)
- Browse ALL columns per table (P1)
- System database exclusion from catalog population (P1)

**Avoids (from PITFALLS.md):**
- Pitfall 1: System database filter in place before any full scan
- Pitfall 2: LEFT JOIN pattern replaces correlated NOT EXISTS; validated with EXPLAIN
- Pitfall 4: AssetBrowser lazy-load implemented before full population triggers
- Pitfall 9: NOT IN list optimized or replaced with LIKE prefix filter to avoid plan degradation
- Pitfall 10: Test isolation — full scan targets separate namespace from `demo_user` test database
- Pitfall 12: Default changed to append mode; `--full-refresh` flag added with confirmation

**Must validate before Phase 2:**
- `SELECT DISTINCT DatabaseName FROM OL_DATASET` — no DBC/SYS* entries
- Population performance with `EXPLAIN` — no correlated subquery plan
- AssetBrowser shows all databases when OL_DATASET has >1000 rows
- QVCI status check (Pitfall 8): `SELECT 1 FROM DBC.ColumnsJQV WHERE 1=0`
- `SELECT MAX(CHAR_LENGTH(dataset_id)) FROM OL_DATASET` — safe below 256 (Pitfall 5)

### Phase 2: Standalone Table Rendering

**Rationale:** Depends entirely on Phase 1. Without populated `OL_DATASET_FIELD` records across all databases, there is nothing to verify column rendering against. The backend fix (service layer) must lead the build order — fixing the `DatasetNotFoundError` throw automatically resolves the frontend error state for tables that have fields. The frontend guard change is the final unblock.

**Delivers:** Tables with no lineage render a valid schema card with columns; "No lineage connections" informational banner; no error states for catalog-only tables; correct viewport zoom on single-node graphs

**Addresses (from FEATURES.md):**
- Standalone table renders a node with columns, not an error (P1)
- "No lineage" informational state in graph view (P1)

**Avoids (from PITFALLS.md):**
- Pitfall 3: `hasNoLineageData` guard changed to `nodes.length === 0`
- Pitfall 6: `DatasetNotFoundError` replaced with single-node response in `lineage_service.py`
- Pitfall 7: `fitView` zoom capped at `maxZoom: 1.2` for single-node graphs
- Pitfall 11: Placeholder row "No column metadata available" when `columns.length === 0`

**Build order within this phase:**
1. Fix `lineage_service.py` — remove throw, return single-node graph (backend only, testable independently)
2. Verify API contract: `GET /api/v2/openlineage/lineage/table/:datasetId` returns `{nodes: [...], edges: []}` for a no-lineage table
3. Fix `LineageGraph.tsx` guard — change condition to `nodes.length === 0`, add informational banner
4. Fix `fitView` zoom for single-node case (`maxZoom: 1.2` or `setViewport({zoom: 1.0})`)
5. Add "No column metadata" placeholder to `TableNode.tsx` when `columns.length === 0`

### Phase 3: UX Enhancements (After Validation)

**Rationale:** These features add value but none are blocking. They require Phase 1 and Phase 2 to be complete and validated in a real environment. The "has lineage" indicator requires a JOIN against `OL_COLUMN_LINEAGE`, and the table count badge requires the full dataset count to be meaningful.

**Delivers:** "Has lineage" indicator per table; configurable database exclusion list; `--catalog-only` populate flag; table count badges per database

**Addresses (from FEATURES.md):**
- "Has lineage" indicator per table in AssetBrowser (P2)
- Configurable database include/deny list (P2)
- `--catalog-only` flag for populate script (P2)
- Table count badge per database (P2)

### Phase Ordering Rationale

- Phase 1 before Phase 2 is a hard dependency: `OL_DATASET_FIELD` must be populated for standalone rendering to show columns. Testing Phase 2 against an empty or partial catalog produces false negatives.
- AssetBrowser lazy-load is in Phase 1 (not Phase 2) because the 1000-row limit will silently break the browse experience the moment Phase 1 completes. Deferring it to Phase 2 means Phase 1 cannot be properly validated.
- QVCI check is a Phase 1 pre-flight because view column types are set at population time. Fixing after population requires a full re-scan.
- `lineage_service.py` backend fix leads Phase 2 because the frontend error state is caused by the backend throw — fixing the backend first allows the frontend guard change to be verified without a simultaneous two-sided change.

### Research Flags

Phases needing attention during implementation:

- **Phase 1 — Teradata query planning:** The LEFT JOIN IS NULL pattern needs an `EXPLAIN` validation against the actual production Teradata instance before running in production. Spool allocation varies by system. The system-database exclusion list covers 44 databases sourced from DataHub's production connector, but the exact set varies by Teradata version and installed components. Verify against the target system's `DBC.DatabasesV` output before committing the list.
- **Phase 1 — QVCI status:** Cannot be determined from research alone — requires a live database query. If QVCI is disabled (error 9719 on `DBC.ColumnsJQV`), view column types degrade to "UNKNOWN". Document the result and adjust the UI display to show "—" instead of "UNKNOWN".

Phases with standard patterns (skip additional research):

- **Phase 2 — React Flow single-node render:** Confirmed behavior in React Flow 12.x. `edges={[]}` with a single node is a supported, documented pattern. `fitView` with `maxZoom` is a documented API parameter.
- **Phase 2 — `lineage_service.py` fix:** The fix is a direct mirror of the pattern already used in `get_column_lineage_graph()`. No novel patterns.
- **Phase 3 — "Has lineage" indicator:** EXISTS subquery against `OL_COLUMN_LINEAGE` is a standard SQL pattern; the performance caveat (use EXISTS not JOIN) is documented in FEATURES.md.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Single new dependency (tqdm) confirmed via PyPI. All other components already installed and verified. Zero frontend additions required. |
| Features | HIGH | Codebase directly examined. The `hasNoLineageData` guard, `DatasetNotFoundError` throw, and `limit: 1000` limit are all confirmed in source at specific line numbers. Reference tool patterns (DataHub, OpenMetadata) verified via official docs. |
| Architecture | HIGH | Direct source analysis of `layoutEngine.ts`, `lineage_service.py`, `LineageGraph.tsx`, `populate_lineage.py`. Integration points are explicit file/line references. No new subsystems required. |
| Pitfalls | HIGH | Critical pitfalls sourced from direct codebase inspection with exact line numbers. System database list from DataHub production connector (44 databases). Spool exhaustion risk from official Teradata correlated subquery documentation. |

**Overall confidence: HIGH**

### Gaps to Address

- **Production system database list validation:** The 44-database exclusion list covers most installs. However, Teradata CLOUD editions (`TDaaS_*` databases) and custom installations may have additional system databases. Before running in production, query `DBC.DatabasesV WHERE DBKind = 'D'` and compare against the exclusion list. Add any unrecognized infrastructure databases to the list.

- **QVCI status on target system:** Research cannot determine this remotely. If QVCI is disabled (error 9719), view column types will be "UNKNOWN" in `OL_DATASET_FIELD`. The standalone table rendering must display "—" not "UNKNOWN" in this case. Plan for this as a likely condition on older or locked-down Teradata systems.

- **Population script runtime at full scale:** The research estimates "minutes to hours" depending on database and table count. Until a test run is attempted, the runtime is unknown. Do not run the first full scan during business hours; budget for uncertainty in scheduling.

- **AssetBrowser lazy-load design decision:** FEATURES.md recommends lazy-load-by-database using existing `limit`/`offset` API. Two valid approaches exist: (1) TanStack infinite scroll (`useInfiniteQuery`), or (2) a new `GET /api/v2/catalog/databases` endpoint returning distinct database names with counts. Option 2 is simpler and matches the existing tree-expand UX. The exact API contract needs to be decided at planning time.

---

## Sources

### Primary (HIGH confidence)
- Direct codebase analysis — `populate_lineage.py`, `lineage_service.py`, `LineageGraph.tsx`, `AssetBrowser.tsx`, `layoutEngine.ts`, `TableNode.tsx`, `dataset_repository.py` — confirmed line-level findings
- [DataHub Teradata Connector — docs.datahub.com](https://docs.datahub.com/docs/generated/ingestion/sources/teradata) — system database deny list (44 databases), DBC view patterns, catalog/lineage separation
- [React Flow FitViewOptions API — reactflow.dev](https://reactflow.dev/api-reference/types/fit-view-options) — `maxZoom` parameter; single-node rendering confirmed
- [tqdm PyPI — pypi.org](https://pypi.org/project/tqdm/) — version 4.67.3, Python >=3.7 compatible
- [Teradata Data Dictionary: List all tables — dataedo.com](https://dataedo.com/kb/query/teradata/list-all-tables-in-all-databases) — system database NOT IN list, DBC.TablesV usage

### Secondary (MEDIUM confidence)
- [OpenMetadata Teradata Connector — docs.open-metadata.org](https://docs.open-metadata.org/latest/connectors/database/teradata) — catalog/lineage decoupling pattern
- [Correlated Subqueries — Teradata Documentation](https://docs.teradata.com/r/2_MC9vCtAJRlKle2Rpb0mA/ODWfNd~BHQoI4RhZ2zP9Xw) — spool risk for correlated NOT EXISTS
- [Teradata Community: list all databases — teradatapoint.com](https://www.teradatapoint.com/teradata/list-all-databases-and-users-in-teradata.htm) — DBKind filter pattern
- [OpenMetadata GitHub Issue #16404](https://github.com/open-metadata/OpenMetadata/issues/16404) — standalone node render for tables with many columns; empty edge state is valid

### Tertiary (LOW confidence)
- [DBC.DatabasesV reference — docs.teradata.com](https://docs.teradata.com/r/hNI_rA5LqqKLxP~Y8vJPQg/GqTx8VuBIkfaC4fso9f5cw) — DBKind 'D'/'U' filter (page required JS; content inferred from community sources)

---
*Research completed: 2026-02-23*
*Ready for roadmap: yes*
