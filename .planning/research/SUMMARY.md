# Project Research Summary

**Project:** Lineage — v5.0 Database Lineage Layout
**Domain:** Graph layout engineering — mixed connected/disconnected node arrangement in React Flow + ELKjs
**Researched:** 2026-02-21
**Confidence:** HIGH

## Executive Summary

The v5.0 Database Lineage Layout milestone targets a single, well-scoped problem: the database lineage graph stacks all tables into a vertical column because the layout engine does not distinguish connected tables (which have lineage edges) from isolated tables (which have none). When `DatabaseLineageGraph` or `AllDatabasesLineageGraph` renders, the API returns table-type nodes with no column sub-nodes, causing `layoutGraph()` to fall through to `layoutSimpleNodes()` — an ELKjs layered path that lacks `separateConnectedComponents` — or through the custom topological layout path which assigns all zero-in-degree tables to layer 0 and stacks them vertically. Both paths produce the same broken output. The fix requires two coordinated changes inside `layoutEngine.ts`: adding `elk.separateConnectedComponents: 'true'`, `elk.spacing.componentComponent: '80'`, and `elk.aspectRatio: '1.7'` to the `layoutSimpleNodes()` ELK options; and refactoring the main topological layout path in `layoutGraph()` to detect connected components, run per-component Kahn sort and longest-path layering, then place isolated tables in a deterministic alphabetical grid below the connected section.

No new npm packages are needed. All required capabilities exist in the installed versions: ELKjs 0.9.3 has the configuration options needed for `layoutSimpleNodes`, and the existing O(V+E) topological layout needs only structural refactoring for `layoutGraph`. The architecture research confirms all changes are confined to a single file — `lineage-ui/src/utils/graph/layoutEngine.ts` — with no interface changes to callers, no API changes, and no changes to React Flow components or the Web Worker wrapper. Both `DatabaseLineageGraph.tsx` and `AllDatabasesLineageGraph.tsx` benefit automatically because they both call the same `layoutGraph()` entry point.

The primary risk is not the algorithm logic itself but a cluster of pre-existing bugs that become critical at database-lineage scale: the Kahn sort-per-iteration performance degradation (`topoQueue.sort()` inside the while-loop), `ClusterBackground` reading stale `node.measured` dimensions from React Flow's ResizeObserver, the `separateDatabaseClusters` bounding-box assumption breaking for non-contiguous node groups, and `DatabaseLineageGraph` running layout on the main thread. These must be addressed in Phase 1 before the mixed layout strategy is introduced in Phase 2, or the improvements will ship with latent defects that surface at real Teradata database sizes (200–500 tables).

## Key Findings

### Recommended Stack

See `.planning/research/STACK.md` for full rationale and algorithm alternatives analysis.

The stack does not change for this milestone. ELKjs 0.9.3 (already installed) supports `separateConnectedComponents`, `spacing.componentComponent`, and `aspectRatio` — all required for the `layoutSimpleNodes()` configuration fix. The custom O(V+E) topological layout in `layoutGraph()` handles the main path and needs structural refactoring, not an algorithm replacement. Zero new packages. Zero `npm install`.

**Core technologies (unchanged — configuration changes only):**
- **ELKjs 0.9.3** (`layoutSimpleNodes` path): Add 3 options: `separateConnectedComponents: 'true'`, `spacing.componentComponent: '80'`, `aspectRatio: '1.7'`. All supported since ELK 0.7.x. No version bump needed.
- **Custom topological layout** (`layoutGraph` main path): Extract `detectConnectedComponents()` as a local BFS function; refactor the layer-assignment loop to run per component; add isolated table grid placement as the final step.
- **React Flow @xyflow/react ^12.0.0**: No changes to components or node/edge formats.
- **Comlink ^4.4.2 / layout.worker.ts**: No interface changes. Worker wraps `layoutGraph()` — internal improvements are transparent.

Alternatives explicitly rejected: ELK DisCo (untested in codebase, known hang risk on dense graphs), ELK Box (ignores edges — loses all directional ordering), dagre (EOL), d3-dag (adds duplicate layout dependency), bespoke custom grid implementation (unnecessary when ELK handles it for the simple path).

### Expected Features

See `.planning/research/FEATURES.md` for full feature landscape, competitor analysis, and implementation pseudocode.

No production lineage tool (Snowflake, Databricks, DataHub, Atlan) shows all database tables in a single view — they all use progressive disclosure from a selected anchor. This application's database-level overview is a genuine differentiator. The dbt-docs approach (Dagre, all zero-in-degree nodes cluster at left) produces the same vertical tower problem and is explicitly worse than the two-zone approach. The two-zone layout (hierarchical DAG + isolated grid) is novel and not solved the same way anywhere in the market.

**Must have (table stakes) for v5.0:**
- Hierarchical left-to-right layout for connected tables — every lineage tool does this; missing it makes the database view feel broken compared to the column-level view
- Compact grid for isolated/disconnected tables — primary user complaint; 50+ tables in a vertical tower requires excessive scrolling
- No node overlap — fundamental correctness expectation; currently broken for the disconnected portion
- Disconnected tables visually distinct from connected flow — without distinction, users cannot tell what is lineage and what is inventory

**Should have (v5.1 after validation):**
- Visual section label "Tables without lineage connections (N)" — makes the two-zone layout self-explanatory; without it users may think the grid section is a bug
- "Hide tables without lineage" toggle — one boolean in `useUIStore`; reduces clutter for lineage-focused exploration; DataHub and Atlan offer this
- Isolated table count in database header — "X tables in lineage flow / Y tables with no lineage" sets user expectations before graph exploration

**Defer (v2+):**
- Pagination for the disconnected grid — breaks spatial memory; React Flow's `onlyRenderVisibleElements` is the correct scale mechanism
- Animating isolated nodes into grid positions — documented jank at 200+ nodes; `disableTransitions` mechanism already exists for this
- Backend API changes to tag `has_lineage` per node — entirely solvable in the frontend layout step; no API change is needed or justified

### Architecture Approach

See `.planning/research/ARCHITECTURE.md` for full component boundary analysis, data flow diagrams, and build order pseudocode.

All changes are internal to `layoutGraph()` in `src/utils/graph/layoutEngine.ts`. The call chain from `DatabaseLineageGraph.tsx` → `convertOpenLineageGraph()` → `layoutGraph()` → `setNodes()`/`setEdges()` remains identical in every caller. The improvement inserts two new steps after `tableAdj` is built: `detectConnectedComponents()` (BFS on the undirected table graph, returns `string[][]`) and isolated table grid placement. The existing Kahn sort and longest-path layering are refactored to run per component rather than on the full graph. `separateDatabaseClusters()` remains the final post-layout step, but requires a bounding-box fix to handle non-contiguous node groups before mixed layout is introduced.

**Major components and their changes:**

1. **`detectConnectedComponents()`** (NEW local function in `layoutEngine.ts`) — BFS on `tableAdj` (undirected); returns `string[][]`; runs after `tableAdj` is fully populated, before the topo sort loop; O(V+E)
2. **Per-component layout loop** (REFACTOR of existing lines 437–497) — extracts Kahn sort and longest-path layering into named helper functions; runs once per connected component (2+ tables); translates each component by a cumulative stacking offset along the secondary axis
3. **Isolated table grid** (NEW block after component loop) — alphabetical sort for determinism; `cols = Math.max(1, Math.min(4, ceil(sqrt(count))))` auto-sizing; placed at `startY = maxConnectedComponentY + ISOLATED_SECTION_GAP`; non-overlap guaranteed by formula
4. **`separateDatabaseClusters()`** (FIX for non-contiguous groups) — must compute bounding box per `(database, component)` pair before the mixed layout is introduced; current assumption that all tables in a database are contiguous breaks by design
5. **`layoutSimpleNodes()`** (3-LINE CONFIG CHANGE) — add `separateConnectedComponents: 'true'`, `spacing.componentComponent: '80'`, `aspectRatio: '1.7'` to the ELK options object; handles the fallback path when `layoutGraph` delegates to ELK

### Critical Pitfalls

See `.planning/research/PITFALLS.md` for all 12 pitfalls with file/line references, warning signs, recovery strategies, and phase mappings.

1. **`separateDatabaseClusters` breaks with non-contiguous node groups** — When a database has both connected tables (hierarchical section) and isolated tables (grid section), the bounding-box computation spans both sections, making cluster boxes artificially wide and encroaching on adjacent databases. Fix before introducing mixed layout: compute bounding box per `(database, component)` pair. Phase 1 prerequisite.

2. **`ClusterBackground` reads stale `node.measured` dimensions** — `ClusterBackground.tsx` reads `node.measured?.width/height` from React Flow's ResizeObserver-populated store. Cluster boxes render at wrong sizes and flash to correct sizes. With `onlyRenderVisibleElements` active (triggers at 30–50 nodes), off-screen cluster boxes disappear entirely. Fix: pre-set `width` and `height` on all nodes in `layoutedNodes` using existing `calculateTableNodeWidth()`/`calculateTableNodeHeight()`, then compute cluster bounds from those pre-calculated values.

3. **Main-thread `layoutGraph()` blocks UI for large databases** — `DatabaseLineageGraph.tsx` runs `layoutGraph()` synchronously on the main thread. Adding connected component BFS to a 500-table database raises total synchronous work to ~80ms — visible frame drops. The Web Worker (`useLayoutWorker`, `layout.worker.ts`, Comlink) already exists and wraps the same `layoutGraph()` function. Route database lineage layout through the worker before adding new algorithm steps.

4. **Kahn sort-per-iteration degrades non-linearly** — `topoQueue.sort()` inside the while-loop is O(V log V) per iteration, O(V² log V) worst case. Harmless at 50 tables; measurable jank at 400+ tables. Fix: sort only newly discovered zero-in-degree candidates before appending to the queue, not the full queue on every dequeue.

5. **Grid placement causes edge crossings through the isolated node section** — Hierarchical bezier edges can visually pass through the isolated table grid if the grid shares the same X/Y band. Fix: place the isolated grid strictly outside the primary axis extent — for direction=RIGHT, place isolated tables below the full hierarchical section's `maxY + ISOLATED_SECTION_GAP`.

## Implications for Roadmap

The milestone naturally splits into two required phases plus one optional polish phase. Phase 1 fixes the foundation; Phase 2 implements the mixed layout. The dependency is hard: Phase 2 on top of the unfixed foundation produces incorrect cluster boxes, layout jank, and invisible cluster boxes during pan — all visible to users.

### Phase 1: Layout Engine Foundation

**Rationale:** Four pre-existing defects become critical blockers at database-lineage scale. These are not new features — they are bugs that become visible only when the database view handles real Teradata database sizes. Fixing them first ensures any subsequent work is built on a stable base and benchmarks are meaningful.

**Delivers:** Correct and performant layout engine infrastructure. Layout still uses a single strategy (no connected-component split yet), but works correctly at 200–500 node scale, with correct cluster boxes, no main-thread blocking, and stable performance characteristics.

**Addresses (PITFALLS.md):**
- Fix `topoQueue.sort()` inside while-loop — move sort to per-layer discovery only (Pitfall 1)
- Pre-calculate `width`/`height` on all `layoutedNodes`; fix `ClusterBackground` to use pre-calculated bounds (Pitfalls 2 and 4)
- Fix `separateDatabaseClusters` bounding-box for non-contiguous groups — must be done before Phase 2 (Pitfall 3)
- Migrate database lineage layout to `useLayoutWorker` — existing worker infrastructure, low risk (Pitfall 5)
- Fix direction-change cancellation with generation counter ref pattern (Pitfall 9)
- Fix non-deterministic database cluster colors with name-hash (Pitfall 10)

**Avoids downstream:** Without Pitfall 3 fixed, Phase 2's grid section causes cluster boxes to expand across the wrong tables; without Pitfall 2 fixed, off-screen cluster boxes disappear when panning; without the worker migration, Phase 2's BFS analysis pushes main-thread layout time above 16ms.

### Phase 2: Mixed Layout Strategy (Connected + Disconnected)

**Rationale:** With the foundation correct, introduce the two-zone layout. The connected component detection, per-component layout, isolated grid, and ELK config fix are all implemented together because they address the same root cause from two paths (`layoutGraph` main path + `layoutSimpleNodes` fallback path) and should ship as a unified change.

**Delivers:** Target v5.0 behavior — connected tables flow left-to-right in topological order within each lineage chain; isolated tables appear in a compact alphabetical grid below the connected section; no node overlap; no edge crossings through the grid; both `DatabaseLineageGraph` and `AllDatabasesLineageGraph` correct automatically.

**Implements:**
- `detectConnectedComponents()` — BFS on undirected `tableAdj`; local function in `layoutEngine.ts`
- Per-component layout loop — refactor existing Kahn + longest-path to run on component subgraphs; translate by cumulative stacking offset
- Isolated table grid — alphabetical sort; auto-sizing column count; placed below all connected components with `ISOLATED_SECTION_GAP`
- `layoutSimpleNodes` ELK config — add 3 options: `separateConnectedComponents: 'true'`, `spacing.componentComponent: '80'`, `aspectRatio: '1.7'`
- Column-wrapping for dense same-depth layers exceeding the `maxNodesPerColumn` threshold (Pitfall 11)

**Avoids:** Grid positioned in same X/Y band as hierarchical edges (Pitfall 7); ELK component-packing conflicting with `separateDatabaseClusters` (Pitfall 6 — fixed by using custom layout for the main path and ELK only for the simple path, never both simultaneously).

**Build order within Phase 2:**
1. `detectConnectedComponents()` — write and unit-test in isolation
2. Extract `kahnSort()` and `longestPathLayering()` as named helper functions — run existing tests to confirm no regression
3. Wire `detectConnectedComponents()` into the refactored per-component loop — existing tests must pass (all existing fixtures have fully connected graphs)
4. Add isolated table grid placement — write new tests: all-isolated database, mix of connected and isolated, isolated tables from multiple databases
5. Add `layoutSimpleNodes` ELK options — verify with a graph that has disconnected components

### Phase 3: UX Polish (v5.1 Optional)

**Rationale:** Validation after Phase 2 with real Teradata data will reveal UX gaps. These features are low-complexity (LOW effort each) but require Phase 2 to be stable first so their placement anchors (DAG bounding box, isolated node count) are reliable.

**Delivers:** Visual clarity and user controls for the two-zone layout.

**Implements:**
- Section label "Tables without lineage connections (N)" — absolute-positioned div or React Flow Background element; anchored to isolated grid bounding box
- "Hide tables without lineage" toggle — one boolean in `useUIStore`; filter step before layout entry; toolbar button (existing toggle button pattern in `Toolbar.tsx`)
- Isolated table count in database header — derivable from connected/disconnected split before layout; displayed alongside database name

### Phase Ordering Rationale

- Phase 1 before Phase 2 is a hard dependency: `separateDatabaseClusters` produces incorrect bounding boxes with non-contiguous nodes; this breaks every multi-database graph the moment the mixed layout is introduced
- Worker migration (Phase 1) must precede the new BFS algorithm (Phase 2): the connected component analysis adds ~5ms per 500 tables on top of existing layout work; acceptable in the worker, visible jank on the main thread
- Phase 3 is gated on Phase 2: section label position and isolated table count are only available after the two-zone layout exists
- The `layoutSimpleNodes` ELK config change (3 lines) could technically ship in Phase 1, but since it addresses the same symptom as the main path fix, shipping both together in Phase 2 creates an atomic, reviewable release

### Research Flags

All phases can proceed with standard implementation patterns. No phase requires additional research via `/gsd:research-phase`.

- **Phase 1 (all fixes):** Targeted corrections to well-understood existing code. Direct codebase analysis confirmed exact file and line locations for every fix.
- **Phase 2 (mixed layout):** Algorithm fully specified in FEATURES.md and ARCHITECTURE.md with pseudocode. ELK option changes verified against official eclipse.dev reference docs.
- **Phase 3 (UX polish):** Standard React patterns. Established patterns already exist in `ClusterBackground.tsx` (bounding box anchored rendering) and `Toolbar.tsx` (toggle buttons with `useUIStore`).

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Zero new packages. ELK options verified against official eclipse.dev reference docs. Installed version 0.9.3 confirmed via `npm list elkjs`. No version bump needed. |
| Features | HIGH | Must-have features verified by direct UX analysis of Snowflake, Databricks, DataHub, Atlan, dbt-docs. Competitor analysis confirms two-zone approach is novel and addresses a gap no major tool has solved. |
| Architecture | HIGH | Based on direct source analysis of `layoutEngine.ts`, `DatabaseLineageGraph.tsx`, `ClusterBackground.tsx`, `layout.worker.ts` in the actual codebase. All integration points confirmed first-hand with specific line references. |
| Pitfalls | HIGH | All 12 pitfalls sourced from direct codebase analysis (specific file and line references) or official React Flow and ELKjs documentation. Not inferred — specific code patterns identified and confirmed. |

**Overall confidence:** HIGH

### Gaps to Address

- **`aspectRatio` interaction with component packing (MEDIUM confidence):** `elk.aspectRatio: '1.7'` is documented as a hint that guides packing shape when `separateConnectedComponents` is active. The exact interaction was not directly tested in this codebase — it is inferred from ELK option documentation. Start with `1.7` (16:9 widescreen ratio) and adjust after visual validation with real data. Values between `1.5` and `2.5` are reasonable alternatives if the packing is too tall or too wide.

- **Secondary-axis wrapping threshold (MEDIUM confidence):** Pitfall 11 documents that layers with 10+ tables at the same topological depth create excessively tall stacks. The `maxNodesPerColumn` threshold and column count formula (`ceil(sqrt(count))`) are recommended but not yet validated against real Teradata database schemas. Validate in Phase 2 with a database that has many same-depth source tables.

- **Edge crossing severity with real data (MEDIUM confidence):** The `ISOLATED_SECTION_GAP` constant (recommended ≥200px) was chosen conservatively. The actual gap needed depends on the edge density and graph shape of the target Teradata database. Validate visually with a database that has both connected and isolated tables during Phase 2 testing.

## Sources

### Primary (HIGH confidence)

- [ELK separateConnectedComponents — eclipse.dev](https://eclipse.dev/elk/reference/options/org-eclipse-elk-separateConnectedComponents.html) — option behavior true vs false
- [ELK spacing.componentComponent — eclipse.dev](https://eclipse.dev/elk/reference/options/org-eclipse-elk-spacing-componentComponent.html) — default 20px; only active with separateConnectedComponents
- [ELK aspectRatio — eclipse.dev](https://eclipse.dev/elk/reference/options/org-eclipse-elk-aspectRatio.html) — Double type; width/height quotient; supported by layered algorithm
- [ELK Layered Algorithm Reference — eclipse.dev](https://eclipse.dev/elk/reference/algorithms/org-eclipse-elk-layered.html) — all layered options
- [ELK Options Reference Index — eclipse.dev](https://eclipse.dev/elk/reference/options.html) — full options list
- [elkjs GitHub — kieler/elkjs](https://github.com/kieler/elkjs) — confirms bundled algorithms: layered, stress, mrtree, radial, force, disco
- `/lineage-ui/src/utils/graph/layoutEngine.ts` — `layoutSimpleNodes()` current config; `layoutGraph()` main path; `topoQueue.sort()` inside while-loop; `separateDatabaseClusters`
- `/lineage-ui/src/components/domain/LineageGraph/DatabaseLineageGraph.tsx` — main-thread layout call; `onlyRenderVisibleElements`; cancelled boolean pattern
- `/lineage-ui/src/components/domain/LineageGraph/AllDatabasesLineageGraph.tsx` — `onlyRenderVisibleElements={nodes.length > 30}`
- `/lineage-ui/src/components/domain/LineageGraph/ClusterBackground.tsx` — `node.measured` dependency; `calculateClusterBounds`
- `/lineage-ui/src/components/domain/LineageGraph/hooks/useDatabaseClusters.ts` — color assignment by iteration index
- `/lineage-ui/src/workers/layout.worker.ts` — existing worker wraps `layoutGraph()`
- [React Flow Performance Guide — reactflow.dev](https://reactflow.dev/learn/advanced-use/performance) — memoization, re-render strategy
- [React Flow Layout Issue #991](https://github.com/xyflow/xyflow/issues/991) — layout with dynamic dimensions
- [Kahn's Algorithm — GeeksforGeeks](https://www.geeksforgeeks.org/dsa/topological-sorting-indegree-based-solution/) — standard O(V+E) implementation without sort inside loop

### Secondary (MEDIUM confidence)

- [Snowflake Data Lineage — docs.snowflake.com](https://docs.snowflake.com/en/user-guide/ui-snowsight-lineage) — neighborhood view, progressive reveal only; no all-tables view
- [Databricks Unity Catalog Lineage — docs.databricks.com](https://docs.databricks.com/aws/en/data-governance/unity-catalog/data-lineage) — 1-depth default; no schema-level overview
- [DataHub UI Lineage — docs.datahub.com](https://docs.datahub.com/docs/features/feature-guides/ui-lineage) — entity-centric; has-lineage filter available
- [Atlan View Lineage — docs.atlan.com](https://docs.atlan.com/product/capabilities/lineage/how-tos/view-lineage) — "Has lineage" filter; no disconnected-node layout behavior documented
- [dbt-docs Graph Visualization — deepwiki.com](https://deepwiki.com/dbt-labs/dbt-docs/3.4-graph-visualization) — dagre layout; zero-in-degree nodes cluster at left; same vertical tower problem
- [Evaluating Graph Layout Algorithms — Wiley/CGF 2024](https://onlinelibrary.wiley.com/doi/10.1111/cgf.15073) — systematic layout algorithm review
- [React Flow Large Node Count Discussion #4975](https://github.com/xyflow/xyflow/discussions/4975) — CSS class pattern vs style updates for interaction performance
- [Cambridge Intelligence: Graph Visualization UX](https://cambridge-intelligence.com/graph-visualization-ux-how-to-avoid-wrecking-your-graph-visualization/) — "snowstorm" anti-pattern for isolated nodes; grouping as mitigation

---
*Research completed: 2026-02-21*
*Ready for roadmap: yes*
