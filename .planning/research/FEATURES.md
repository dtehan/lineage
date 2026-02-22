# Feature Research: Database Lineage Layout Improvement

**Domain:** Database-level lineage graph layout for mixed connected/disconnected node sets
**Researched:** 2026-02-21
**Confidence:** HIGH (ELK algorithm research confirmed via official docs; tool UX patterns from official documentation + direct observation; layout algorithms from published academic and library sources)

---

## Context

This research covers the new milestone: v5.0 Database Lineage Layout. The goal is to fix the database lineage graph view which currently stacks all tables in a single vertical column regardless of lineage connections.

**What already exists (do not rebuild):**
- `layoutGraph()` in `layoutEngine.ts` — custom topological layering with Kahn's algorithm + longest-path layering, O(V+E)
- `layoutSimpleNodes()` — ELKjs layered algorithm fallback for non-column (table-type) nodes; currently called for database-level graphs since columns are not rendered
- `separateDatabaseClusters()` — post-layout cluster box non-overlap logic using topological database ordering
- `topoSortDatabases()` — Kahn's topological sort for database-level ordering (cross-database case)
- `DatabaseLineageGraph.tsx` — React Flow component for database view
- `lineage_service.py:get_database_lineage_graph()` — BFS path serves all tables including isolated ones; already returns both connected and isolated table nodes

**Current problem:** The database lineage API returns all tables as column-level field nodes (type `"field"`). These get passed to `layoutGraph()` which calls `groupColumnsByTable()`, produces one "table card" per Teradata table, then runs Kahn's topological sort. Tables with no lineage edges get `inDegree=0` and all land in layer 0, stacking vertically. Tables in the same layer stack vertically with `nodeSpacing=40` between them. The result: 50+ tables in one vertical tower on the left side.

**Correct behavior desired:**
- Tables that have lineage edges flow left-to-right (upstream left, downstream right)
- Tables with no lineage edges appear in a compact grid, not a vertical tower
- No node overlap in either section

---

## How Real Tools Handle This Problem

### Pattern 1: Show Only Connected Nodes (Snowflake, Databricks Unity Catalog)

Most production lineage tools avoid the mixed-graph problem entirely: they only show the selected asset and its connected neighbors, not all tables in a database. Snowflake reveals objects incrementally, "one step at a time upstream or downstream from your selection." Databricks shows "one level by default" with expand buttons. Neither shows all tables in a schema simultaneously.

**Implication for this project:** This pattern sidesteps the problem by not having a "database overview" mode at all. Our application has already committed to showing all tables in the database (including those without lineage) as a database-level overview. This is a deliberate differentiator — it shows isolation patterns and data inventory alongside lineage flow.

### Pattern 2: Filter to Lineage-Connected Only (DataHub, Atlan)

DataHub and Atlan track a `"hasLineage"` metadata flag per asset. Their database/schema views let users filter to "only show tables with lineage" before rendering the graph. The disconnected tables are accessible in the catalog browser, not the lineage graph. This cleanly avoids the mixed-graph layout problem.

**Implication for this project:** A "hide tables without lineage" toggle is a viable anti-junk approach, but it discards the inventory visibility that makes this view valuable. Better to show both with distinct layout zones.

### Pattern 3: Separate Layout Zones (dbt docs, some academic systems)

dbt-docs (the closest match to what this project needs) uses Dagre for horizontal layout. The DAG-connected nodes flow left-to-right. Isolated nodes (sources with no upstream, sinks with no downstream, orphaned models) are placed by the layout algorithm wherever they land — often they cluster at the left edge at y=0 if there are multiple zero-in-degree nodes. dbt-docs does not explicitly separate "connected" from "disconnected" nodes into visually distinct zones.

Academic research (Eclipse ELK, polyomino packing papers, igraph community) recognizes that disconnected components are the hardest layout case. ELK provides `separateConnectedComponents` and the ELK DisCo algorithm specifically for packing disconnected subgraphs compactly.

### Pattern 4: Organic/Force Layout with Component Packing (Cytoscape.js, igraph)

Cytoscape.js's organic (CoSE) layout considers each disconnected component separately, runs the force algorithm per component, then packs components together. The igraph library recommends force-directed layout for disconnected graphs because it handles multiple components naturally. However, force-directed layout does not produce left-to-right lineage order, which is a hard requirement for this application.

---

## Feature Landscape

### Table Stakes

Features users expect. Missing = the database lineage view feels broken.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Hierarchical left-to-right layout for connected tables** | Every lineage tool (dbt docs, DataHub, Databricks, Snowflake) uses left-to-right directed layout for connected data flow. Users read lineage left-to-right as "upstream → downstream." The current layout already does this for column-level views — users see the correct behavior there and expect it in the database view too. | LOW | Already implemented for column-level views via `layoutGraph()`. The database view uses `layoutSimpleNodes()` (ELKjs) instead. The fix is to route database-level graphs through the same custom topological layout path that already works, since the data is available. |
| **Compact grid for isolated/disconnected tables** | Tables with no lineage edges are currently stacked in a single vertical column. With 50+ tables, this produces an ~3000px tall column that requires excessive scrolling. A grid (N columns × M rows) uses space efficiently. This is the primary user complaint for the database view. | MEDIUM | Not a React Flow or ELK built-in — requires custom post-layout grid placement logic for the zero-edge-connected component of the graph. ELK DisCo handles component packing but is complex to configure; simpler to implement a deterministic grid packer after the topological layout runs. |
| **No node overlap** | Fundamental correctness expectation for any graph layout. Currently the vertical stacking causes nodes to overlap when cluster boxes are drawn. | LOW | Already guaranteed for the connected portion by the existing `separateDatabaseClusters()` logic. The gap is the disconnected portion — the grid packer must account for node dimensions (width × height) and spacing. |
| **Disconnected tables visually distinct from connected flow** | Users need to distinguish "these tables participate in lineage" from "these tables exist in the database but have no known lineage." Without visual distinction, the graph is confusing — why are some tables in a flow and others in a pile? | MEDIUM | Options: (a) subtle background region / section label "No lineage connections", (b) gray or desaturated node styling for isolated tables, (c) explicit visual separator between the DAG section and the grid section. Option (a) matches the existing `ClusterBackground` pattern and is lowest risk. |

### Differentiators

Features that set this database view apart. Not required for correctness, but improve usability.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Visual section label for disconnected tables** | Makes the two-zone layout self-explanatory. Users immediately understand "I'm looking at both the lineage DAG and the inventory of tables without lineage." Without this label, users may think the grid section is a bug. | LOW | A static SVG text element or absolute-positioned div below the DAG section. Can be computed from the bounding box of the connected cluster after layout. |
| **"Hide tables without lineage" toggle** | Reduces graph clutter when users only care about the flow. DataHub and Atlan offer this. For databases with 200 tables and only 20 in the lineage flow, the grid section dominates the canvas unnecessarily. | LOW | Already partially supported via the existing `assetTypeFilter` mechanism in the store. A boolean `hideIsolated` flag in `useUIStore` + filter step in the layout path. Toolbar button to toggle. |
| **Isolated table count in toolbar or header** | Shows "42 tables in lineage flow / 158 tables with no lineage" to set user expectations before they explore the graph. | LOW | Count is derivable from the graph data before layout. Add to the database header bar alongside the database name. |
| **Deterministic ordering within the disconnected grid** | Alphabetical by table name within the grid ensures the same table is always in the same position. Users navigating repeatedly shouldn't have to re-find tables. | LOW | Sort `disconnectedTables` alphabetically before computing grid positions. Already the approach in `layoutGraph()` (`tables.sort((a, b) => a.id.localeCompare(b.id))`). |
| **Grid columns count adapts to node width** | If all table names are short, pack more columns. If names are long (wide cards), use fewer. Fixed 4-column grid wastes space for wide nodes and looks wrong. | LOW | Compute `gridCols = Math.floor(availableWidth / (maxNodeWidth + nodeSpacing))` where `availableWidth` is estimated from the connected DAG bounding box or a fixed canvas width constant. |

### Anti-Features

Features to explicitly avoid.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Force-directed layout for the whole graph** | Force-directed layout (d3-force, CoSE) handles disconnected components naturally, but destroys the left-to-right lineage order that users depend on. The connected tables would land wherever the physics simulation settles, not in upstream-to-downstream order. This breaks the fundamental lineage mental model. | Keep topological layering for connected tables. Use a deterministic grid for isolated tables only. |
| **ELK DisCo algorithm for component packing** | ELK DisCo is the "correct" academic solution for packing disconnected subgraphs, but elkjs's bundled algorithm for DisCo hangs indefinitely on dense column-level graphs (discovered in v3.0). The codebase already replaced ELKjs with a custom O(V+E) topological layout for this reason. Using DisCo for the isolated-grid portion reintroduces the hang risk. | Write a simple deterministic grid packer: `x = (i % cols) * (nodeWidth + spacing)`, `y = (Math.floor(i / cols)) * (nodeHeight + spacing)`. Zero risk, correct result. |
| **Separate API call to split connected vs disconnected tables** | It might seem cleaner to have the backend tag nodes as "has_lineage=true/false" and send them separately. Adding a new API field creates a v6 schema migration, breaks the existing OpenLineage adapter, and adds backend complexity for a problem that is entirely solvable in the frontend layout step. | Split connected vs disconnected entirely in the layout engine: connected tables are those with at least one edge in the raw edge list; disconnected tables have no edges. This is O(nodes + edges) and requires no API change. |
| **Pagination for the disconnected grid** | Some large databases have 500+ tables. Paginating the grid (showing 50 at a time) seems like it would scale better. But pagination in a graph view requires hover state, z-index management, and breaks the spatial memory users build when navigating. | Use `onlyRenderVisibleElements={nodes.length > 50}` (already in `DatabaseLineageGraph.tsx`) for React Flow viewport culling. The minimap provides navigation for the full canvas. If graphs are genuinely too large, a future "filter by table name" search (already in toolbar) addresses it. |
| **Animating isolated nodes into grid position** | CSS transitions on node position changes look polished but cause jank for 100+ nodes (documented in v2.0 research: transition disabling at 200+ nodes). | Apply the same `disableTransitions` logic already in use for large graphs. No animation for the initial layout. |
| **Unified ELKjs layout for both sections** | One ELKjs call for the whole graph (connected + disconnected) seems like the simplest approach. ELKjs `separateConnectedComponents: true` should handle this. But ELKjs hangs on dense graphs (why it was replaced in v3.0). The database graph can have 200+ nodes with many edges. | Two-section approach: custom topological layout for connected tables (existing, proven), deterministic grid for disconnected tables (new, simple). Merge the two node sets with a spatial offset between sections. |

---

## Feature Dependencies

```
[Split nodes into connected vs disconnected] (O(V+E), pure JS)
    └──requires──> [Edge set from API response] (already available)
    └──enables──> [Topological layout for connected subset]
    └──enables──> [Grid layout for disconnected subset]

[Topological layout for connected tables]
    └──requires──> [Split nodes into connected vs disconnected]
    └──reuses──> [layoutGraph() existing topological layering] (already proven for column-level views)
    └──reuses──> [separateDatabaseClusters()] (for multi-database connected tables)
    └──enables──> [Connected DAG bounding box calculation]

[Grid layout for disconnected tables]
    └──requires──> [Split nodes into connected vs disconnected]
    └──requires──> [Connected DAG bounding box] (to place grid below/beside connected section)
    └──enables──> [Merged final node array]

[Connected DAG bounding box]
    └──requires──> [Topological layout for connected tables]
    └──enables──> [Grid layout for disconnected tables] (placement anchor)
    └──enables──> [Visual section label] (position anchor for label element)

[Merged final node array]
    └──requires──> [Topological layout for connected tables]
    └──requires──> [Grid layout for disconnected tables]
    └──enables──> [React Flow render]

[Visual section label]
    └──requires──> [Grid layout for disconnected tables]
    └──optional──> renders via ClusterBackground or absolute-positioned div

["Hide tables without lineage" toggle]
    └──requires──> [Split nodes into connected vs disconnected]
    └──optional──> adds boolean to useUIStore; filter step before layout entry point
```

### Dependency Notes

- **All work is in `layoutEngine.ts` and `DatabaseLineageGraph.tsx`:** No backend changes required. The API already returns all tables (connected and disconnected). The split is purely a frontend layout concern.
- **`layoutGraph()` must handle the "no columns, only tables" case:** Currently `layoutGraph()` calls `groupColumnsByTable()` which returns an empty map for table-type nodes, causing fallback to `layoutSimpleNodes()`. The database graph uses table-type nodes with no columns. The fix path is either: (a) teach `layoutGraph()` to handle table nodes directly (apply the topological layout to them), or (b) factor the topological layout logic into a shared function that both the column path and the table-only path can call. Option (b) is lower risk — it extracts already-proven code.
- **Grid placement needs a spatial gap from the DAG section:** If the connected DAG occupies x=0..2000, the grid section should start at x=2000 + `GRID_GAP_PX` (e.g. 200px). This prevents visual ambiguity. The gap also provides space for the section label.
- **`separateDatabaseClusters()` only applies to connected tables:** Disconnected tables from the same database all go in the grid. The cluster box logic should not wrap disconnected tables (they have no lineage direction to imply cluster position).

---

## MVP Definition

### v5.0 Launch With

Minimum viable feature set for a correct, non-embarrassing database lineage view.

- [ ] **Split connected vs disconnected tables** — Partition `tableNodeData` into `connectedTables` (any edge in/out) and `disconnectedTables` (no edges). O(nodes + edges). Pure JS, no API change.
- [ ] **Topological layout for connected tables** — Extract the topological layering logic from `layoutGraph()` (the Kahn's + longest-path portion, lines 386–511) into a shared `layoutTableDAG(tables, edges)` function. Call it for the connected subset. Reuses proven code.
- [ ] **Deterministic grid for disconnected tables** — Sort disconnected tables alphabetically. Compute grid positions: `x = (i % cols) * (cardWidth + nodeSpacing)`, `y = floor(i / cols) * (cardHeight + nodeSpacing)`. Offset the entire grid below or to the right of the connected DAG's bounding box.
- [ ] **No overlap guarantee** — Connected section: existing `separateDatabaseClusters()` handles multi-database cases. Disconnected section: grid formula guarantees non-overlap by construction (deterministic cell assignment).
- [ ] **Correct React Flow node format** — Disconnected tables must produce `{ type: 'tableNode', data: TableNodeData, position: {x, y} }` in the same format as connected tables so the existing `TableNode` component renders them correctly.

### After Validation (v5.1)

Features to add once the layout is correct and usable.

- [ ] **Visual section label for disconnected grid** — Static text label "Tables without lineage connections (N)" placed above the grid section. Positioned using the grid bounding box. Rendered as a React Flow background element or absolute-positioned div.
- [ ] **"Hide tables without lineage" toggle** — Boolean in `useUIStore`. If true, skip disconnected tables before layout entry. Toolbar button (similar to existing "Show database clusters" toggle). Hides the grid section entirely.
- [ ] **Isolated table count in database header** — "X tables in lineage flow / Y tables with no lineage" alongside the database name in the blue header bar. Derived from the connected/disconnected split before layout.

---

## Complexity Assessment by Category

| Category | Complexity | Notes |
|----------|-----------|-------|
| **Connected/disconnected split logic** | LOW (0.5 days) | Pure JS: iterate edges, build set of nodes with connections; O(V+E) |
| **Extract shared topological layout function** | LOW (0.5–1 day) | Refactoring existing, proven code from `layoutGraph()`; no new algorithm |
| **Deterministic grid packer** | LOW (0.5 days) | Simple modular arithmetic; no external library needed |
| **Spatial offset between DAG and grid sections** | LOW (0.5 days) | Compute DAG bounding box (max x + padding), offset grid x by that amount |
| **"Hide without lineage" toggle** | LOW (0.5 days) | 1 boolean in store, 1 filter step in layout, 1 toolbar button |
| **Section label rendering** | LOW (0.5 days) | Absolute-positioned div or React Flow `Background` subcomponent |
| **Test coverage** | MEDIUM (1–2 days) | `layoutEngine.test.ts` already exists; add cases for: all-disconnected, all-connected, mixed, empty |

**Total estimated scope:** 2–4 days frontend-only work. No backend changes required.

---

## Competitor Feature Analysis

How comparable tools handle the mixed connected/disconnected case:

| Tool | "All tables in DB" view? | Layout for connected | Layout for disconnected | Our v5.0 approach |
|------|--------------------------|----------------------|-------------------------|-------------------|
| Snowflake (Snowsight) | No — node-centric, expand neighbors | Hierarchical, progressive | Not shown | Not applicable |
| Databricks Unity Catalog | No — 1-depth expand from selected | Left-to-right hierarchical | Not shown | Not applicable |
| DataHub | No — entity-centric graph | Left-to-right directed | "Has lineage" filter, not shown by default | Closest model: show both with filter toggle |
| Atlan | No — entity-centric | Left-to-right directed | "Has lineage" filter available | Closest model: show both with filter toggle |
| dbt Explorer | Yes — full DAG of all models | Left-to-right with dagre | Land in leftmost layer (not explicitly separated) | Better than dbt: explicit grid, not vertical stack |
| dbt-docs (OSS) | Yes — full DAG | Left-to-right with dagre | Zero-in-degree nodes cluster at left | Our v5.0 does this correctly |
| OpenMetadata | Yes — schema-level lineage | Left-to-right | Not explicitly handled, can cause layout issues | Our v5.0 improves on this |

**Key insight:** No major commercial tool shows all database tables simultaneously in a single lineage view — they all use progressive disclosure from a selected anchor node. This application's database-level view is a genuine differentiator. The layout challenge is novel because no major tool has solved it the same way.

**Key insight from dbt-docs:** dbt-docs places all zero-in-degree nodes (sources, isolated models) at the leftmost layer in the same DAG. They can stack vertically. With 50 models in that layer, it produces the same vertical tower problem we have. Our two-zone approach (DAG + grid) is strictly better than the dbt-docs behavior.

---

## Implementation Notes

### Splitting Connected vs Disconnected Tables

```typescript
// In layoutEngine.ts — runs before layout, O(V+E)
function splitConnectedTables(
  tableNodeData: TableNodeData[],
  rawEdges: LineageEdge[],
  columnToTableMap: Map<string, string>
): { connected: TableNodeData[]; disconnected: TableNodeData[] } {
  const tablesWithEdges = new Set<string>();
  for (const edge of rawEdges) {
    const src = columnToTableMap.get(edge.source);
    const tgt = columnToTableMap.get(edge.target);
    if (src && src !== tgt) tablesWithEdges.add(src);
    if (tgt && src !== tgt) tablesWithEdges.add(tgt);
  }
  return {
    connected: tableNodeData.filter(t => tablesWithEdges.has(t.id)),
    disconnected: tableNodeData.filter(t => !tablesWithEdges.has(t.id)),
  };
}
```

### Deterministic Grid Placement

```typescript
// Grid packing for disconnected tables — placed below the connected DAG
function layoutDisconnectedGrid(
  tables: TableNodeData[],
  startX: number,   // left edge of grid (usually 0 or aligned with DAG)
  startY: number,   // top edge of grid (below the connected DAG + gap)
  nodeSpacing: number
): Node[] {
  const sorted = [...tables].sort((a, b) => a.id.localeCompare(b.id));
  const cols = Math.max(1, Math.min(4, Math.ceil(Math.sqrt(sorted.length))));

  return sorted.map((table, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const width = calculateTableNodeWidth(table.tableName, table.columns);
    const height = calculateTableNodeHeight(table.columns.length, table.isExpanded);

    return {
      id: table.id,
      type: 'tableNode',
      position: {
        x: startX + col * (width + nodeSpacing),
        y: startY + row * (height + nodeSpacing),
      },
      data: table,
    } as Node;
  });
}
```

### Connected DAG Bounding Box Calculation

```typescript
// After connected tables are laid out, compute the bounding box
function computeBoundingBox(nodes: Node[], tableNodeData: TableNodeData[]): {
  maxX: number; maxY: number; minX: number; minY: number;
} {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const node of nodes) {
    const td = tableNodeData.find(t => t.id === node.id);
    const w = td ? calculateTableNodeWidth(td.tableName, td.columns) : 300;
    const h = td ? calculateTableNodeHeight(td.columns.length, true) : 100;
    minX = Math.min(minX, node.position.x);
    minY = Math.min(minY, node.position.y);
    maxX = Math.max(maxX, node.position.x + w);
    maxY = Math.max(maxY, node.position.y + h);
  }
  return { minX, minY, maxX, maxY };
}
```

### Integration into `layoutGraph()`

The main `layoutGraph()` function currently falls through to `layoutSimpleNodes()` for table-type nodes (because `groupColumnsByTable()` returns an empty map). The integration point is:

1. After `transformToTableNodes()` produces `tableNodeData`, call `splitConnectedTables()`.
2. Run the existing topological layout on `connected` tables only.
3. Run `layoutDisconnectedGrid()` on `disconnected` tables with `startY = dagBoundingBox.maxY + GRID_SECTION_GAP`.
4. Merge both node arrays: `[...connectedNodes, ...disconnectedNodes]`.
5. Pass merged array to React Flow.

This change is contained entirely within `layoutEngine.ts`. No changes to `DatabaseLineageGraph.tsx`, no API changes, no store changes.

---

## Dependencies on Existing Architecture

| New Feature | Depends On | Status |
|-------------|-----------|--------|
| Split connected/disconnected | `tableNodeData`, `rawEdges`, `columnToTableMap` | All available in `layoutGraph()` |
| Topological layout for connected subset | Existing Kahn's + longest-path logic (lines 386–511 in `layoutEngine.ts`) | Extract into shared function — no rewrite |
| Grid packer for disconnected tables | `calculateTableNodeWidth()`, `calculateTableNodeHeight()` | Already in `layoutEngine.ts` |
| Spatial offset between sections | Connected DAG bounding box | Computed post-layout; no external dependency |
| "Hide without lineage" toggle | `useUIStore` store, `Toolbar.tsx` | Established patterns — add one boolean |
| Section label | React Flow `Background` or absolute div pattern | `ClusterBackground.tsx` already does this for cluster boxes |

---

## Sources

### ELK Layout Options (HIGH confidence)
- [ELK separateConnectedComponents — eclipse.dev](https://eclipse.dev/elk/reference/options/org-eclipse-elk-separateConnectedComponents.html) — confirmed: ELK can process each connected component independently, then pack results
- [ELK DisCo componentLayoutAlgorithm — eclipse.dev](https://eclipse.dev/elk/reference/options/org-eclipse-elk-disco-componentCompaction-componentLayoutAlgorithm.html) — confirms ELK DisCo algorithm exists for packing disconnected components
- [ELK Layout Options reference — eclipse.dev](https://eclipse.dev/elk/reference/options.html) — full option reference

### Graph Visualization UX (HIGH confidence from official documentation)
- [Snowflake Data Lineage — docs.snowflake.com](https://docs.snowflake.com/en/user-guide/ui-snowsight-lineage) — confirmed: neighborhood view, progressive reveal only, isolated tables not shown
- [Databricks Unity Catalog Lineage — docs.databricks.com](https://docs.databricks.com/aws/en/data-governance/unity-catalog/data-lineage) — confirmed: 1-depth default, expand on click, no all-tables view
- [DataHub UI Lineage Management — docs.datahub.com](https://docs.datahub.com/docs/features/feature-guides/ui-lineage) — confirmed: entity-centric, has lineage filtering, no schema-level all-tables view
- [Atlan View Lineage — docs.atlan.com](https://docs.atlan.com/product/capabilities/lineage/how-tos/view-lineage) — confirmed: "Has lineage" filter in Properties menu; no explicit disconnected-node layout behavior documented

### dbt-docs Graph Layout (MEDIUM confidence — deepwiki analysis)
- [dbt-docs Graph Visualization — deepwiki.com](https://deepwiki.com/dbt-labs/dbt-docs/3.4-graph-visualization) — confirmed: dagre algorithm for fullscreen mode, vertical preset for sidebar; no explicit isolated-node treatment beyond placing at zero-in-degree layer

### Graph Layout Research (HIGH confidence — peer-reviewed and official library sources)
- [Evaluating Graph Layout Algorithms — Wiley/Computer Graphics Forum, 2024](https://onlinelibrary.wiley.com/doi/10.1111/cgf.15073) — systematic review of layout methods; confirms topological layouts for DAGs, component packing for disconnected graphs
- [Graph Visualization UX — cambridge-intelligence.com](https://cambridge-intelligence.com/graph-visualization-ux-how-to-avoid-wrecking-your-graph-visualization/) — "snowstorm" anti-pattern for isolated nodes; grouping and clustering as mitigation
- [React Flow Layouting Overview — reactflow.dev](https://reactflow.dev/learn/layouting/layouting) — confirmed: dagre has sub-flow issues; ELK is most configurable option
- [igraph disconnected graph layout discussion — igraph.discourse.group](https://igraph.discourse.group/t/best-layout-algorithm-for-large-graph-with-disconnected-components/177) — organic layout considers each disconnected component separately before packing

### Existing Codebase (HIGH confidence — direct source examination)
- `/Users/Daniel.Tehan/Code/lineage/lineage-ui/src/utils/graph/layoutEngine.ts` — confirmed: `layoutGraph()` falls through to `layoutSimpleNodes()` (ELKjs) for table-type nodes; topological layout only applies to column-type nodes
- `/Users/Daniel.Tehan/Code/lineage/lineage-api/services/lineage_service.py` — confirmed: `_get_database_lineage_bfs()` already returns all tables including isolated ones; no API change needed
- `/Users/Daniel.Tehan/Code/lineage/lineage-ui/src/components/domain/LineageGraph/DatabaseLineageGraph.tsx` — confirmed: calls `layoutGraph()` directly; no pre-processing of connected vs disconnected

---

*Feature research for: v5.0 Database Lineage Layout (database-level graph layout improvement)*
*Researched: 2026-02-21*
