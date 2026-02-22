# Phase 20: Mixed Layout Strategy - Research

**Researched:** 2026-02-21
**Domain:** Graph layout algorithm — connected component detection, BFS/DFS, topological layering per component, isolated-table grid placement, ELK layout options
**Confidence:** HIGH (all findings verified against live codebase and installed elkjs 0.9.3 bundle)

---

## Summary

Phase 20 implements the "two-zone" layout: tables with lineage connections flow left-to-right in topological order, and tables with no lineage connections appear in a compact alphabetical grid below the connected section. All work is confined to `layoutEngine.ts` — no caller interface changes, no API changes, no React Flow component changes.

The core algorithmic gap is that the current `layoutGraph()` function treats all tables identically: it runs Kahn + longest-path layering on the full adjacency graph, which means isolated tables (no edges) land at layer 0 alongside legitimate source tables. This causes isolated tables to appear mixed into the left column of the hierarchical layout rather than in their own zone.

Phase 20 decomposes into two plans. Plan 20-01 adds `detectConnectedComponents()` (BFS/DFS over the table adjacency graph) and refactors the existing Kahn + longest-path layering to run per-component over connected subgraphs only. Plan 20-02 adds pure-position math for the isolated table grid and fixes the `layoutSimpleNodes` ELK config with `separateConnectedComponents`, `spacing.componentComponent`, and `aspectRatio` options.

**Primary recommendation:** Implement connected component detection with BFS (simpler than DFS for this use case, same asymptotic cost), run existing Kahn + layering per connected component, stack connected sections left-to-right with a gap, then place isolated tables in an alphabetical grid starting at `y = maxConnectedY + gap`.

---

## Standard Stack

### Core (already installed — no installation needed)

| Library | Version | Purpose | Role in Phase 20 |
|---------|---------|---------|-----------------|
| No new libraries | — | — | All required functionality is implementable with TypeScript primitives and the already-installed stack |

### Supporting (already installed)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `elkjs` | 0.9.3 | ELK layout engine (fallback path) | `layoutSimpleNodes()` — fix config for MLST-05 |
| `comlink` | ^4.4.2 | Worker communication | Already wired in `useLayoutWorker.ts` — no changes needed |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom BFS component detection | ELK `separateConnectedComponents` option on main path | ELK DisCo explicitly rejected (known hang risk on dense graphs). Custom BFS adds ~5ms per 500 tables, safe in Worker |
| Alphabetical isolated grid (manual math) | ELK `box` or `rectpacking` algorithm for isolated section | ELK box/rectpacking is an additional async ELK call. Manual math is synchronous, deterministic, and zero added latency |
| Per-component Kahn sort | Single global Kahn sort with component tagging | Per-component gives correct longest-path layering within each independent chain. Global sort conflates layer depth across disconnected components, which produces incorrect x-positions |

**Installation:** None required. All dependencies already present.

---

## Architecture Patterns

### Recommended Project Structure

No structural changes. All edits stay within `layoutEngine.ts`:

```
lineage-ui/src/
├── utils/graph/
│   └── layoutEngine.ts          # All Phase 20 changes (detectConnectedComponents, per-component layering, isolated grid)
├── components/domain/LineageGraph/
│   ├── DatabaseLineageGraph.tsx  # No changes needed
│   └── AllDatabasesLineageGraph.tsx  # No changes needed
└── workers/
    └── layout.worker.ts          # No changes needed
```

### Pattern 1: detectConnectedComponents() via BFS

**What:** Traverse the undirected version of the table adjacency graph using BFS to identify which tables are reachable from each other. Returns an array of component sets (each set is a group of table IDs that share lineage connections).

**When to use:** Before Kahn sort, so isolated tables can be separated from the hierarchical layout.

**Implementation approach:**

```typescript
/**
 * Detects connected components in the table adjacency graph.
 * Uses undirected BFS (edges treated bidirectionally for reachability).
 * O(V+E) time and space.
 *
 * @returns Array of Sets, each Set contains table IDs in one component.
 *          Components with a single node and no edges are isolated tables.
 */
export function detectConnectedComponents(
  tableIds: string[],
  tableAdj: Map<string, Set<string>>   // directed adjacency from layoutGraph
): { connected: Set<string>[]; isolated: string[] } {
  const visited = new Set<string>();
  const components: Set<string>[] = [];

  // Build undirected adjacency for reachability
  const undirected = new Map<string, Set<string>>();
  for (const id of tableIds) undirected.set(id, new Set());
  tableAdj.forEach((targets, src) => {
    targets.forEach((tgt) => {
      undirected.get(src)!.add(tgt);
      undirected.get(tgt)!.add(src);
    });
  });

  for (const startId of tableIds) {
    if (visited.has(startId)) continue;
    const component = new Set<string>();
    const queue: string[] = [startId];
    visited.add(startId);
    while (queue.length > 0) {
      const current = queue.shift()!;
      component.add(current);
      for (const neighbor of undirected.get(current) || []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
    components.push(component);
  }

  // Partition: connected (size > 1 or has at least one edge) vs isolated (no edges)
  const isolated: string[] = [];
  const connected: Set<string>[] = [];
  for (const comp of components) {
    if (comp.size === 1) {
      const [id] = comp;
      if ((tableAdj.get(id)?.size ?? 0) === 0 && !hasIncomingEdge(id, tableAdj)) {
        isolated.push(id);
      } else {
        connected.push(comp);  // Table has self-loop or is in a cycle — treat as connected
      }
    } else {
      connected.push(comp);
    }
  }
  isolated.sort(); // Alphabetical for determinism
  return { connected, isolated };
}
```

**Important edge case:** A table with zero outgoing AND zero incoming edges is isolated. A table with a self-loop or participating in a cycle is still connected. Use the undirected BFS result — component size > 1 means connected by definition. For component size == 1, check if the table appears in any edge (source or target) to distinguish true isolates from cycle participants.

**Simpler approach (avoids `hasIncomingEdge` helper):** A component is isolated if and only if `comp.size === 1` AND `undirected.get(id).size === 0`. The undirected adjacency already captures all neighbors.

```typescript
// Simpler partition — use undirected neighbor count:
for (const comp of components) {
  const ids = [...comp];
  if (ids.length === 1 && undirected.get(ids[0])!.size === 0) {
    isolated.push(ids[0]);
  } else {
    connected.push(comp);
  }
}
```

### Pattern 2: Per-Component Layering

**What:** Refactor the current `layoutGraph()` layering block to run Kahn + longest-path over each connected component's subgraph independently.

**Current code structure in `layoutGraph()` (lines 410-524):**
```
1. Build tableAdj, tableInDeg for all tables
2. Kahn sort → topoOrder (global)
3. Longest-path layering → layerMap (global)
4. Group tables by layer → layerBuckets
5. Position tables: for each layer, stack tables vertically
```

**Phase 20 refactored structure:**
```
1. Build tableAdj, tableInDeg for all tables (unchanged)
2. detectConnectedComponents(tableAdj) → { connected, isolated }
3. For each connected component:
   a. Run Kahn sort on subgraph → componentTopoOrder
   b. Run longest-path layering → componentLayerMap
   c. Group by layer → componentLayerBuckets
   d. Position tables: for each layer, stack vertically
   e. Track component bounding box (maxX, maxY)
   f. Offset next component to start after previous component's right edge + gap
4. Position isolated tables in alphabetical grid BELOW all connected sections
5. Combine all positioned nodes
```

**Key design decision — component stacking direction:** In RIGHT direction, connected components can be placed side-by-side horizontally (each component's layered columns flow right, then the next component starts at `maxX + componentGap`). However, this may cause very wide layouts when there are many small components. The more natural choice is to stack connected components vertically (each component's leftmost column starts at x=0, but the component is offset downward by the previous component's height + gap). This matches the "two-zone" requirement more cleanly: all connected section occupies the top zone, all isolated tables form the bottom zone.

**Recommended approach — components stacked vertically within a shared x-range:**

Each component runs its own Kahn + longest-path layering, producing layer columns at x=0, x=layerWidth+gap, x=2*(layerWidth+gap), etc. Multiple components share the same x-axis (layer 0 of component A is at the same x as layer 0 of component B) but are offset along the y-axis. This is simpler and produces a layout where all upstream tables (layer 0) align vertically, all intermediate tables align vertically, etc.

```typescript
// After detecting components:
let componentYOffset = 0;
const componentGap = 80; // vertical gap between components

for (const component of connected) {
  // Build sub-adjacency for this component
  const subAdj = filterAdjForComponent(tableAdj, component);
  const subInDeg = buildInDegree(subAdj);

  // Kahn sort for this component
  const topoOrder = kahnSort(component, subAdj, subInDeg);

  // Longest-path layering
  const layerMap = longestPathLayering(topoOrder, subAdj);

  // Group by layer and position
  const maxY = positionComponentNodes(layerMap, tableNodeData, isHorizontal,
                                       primaryCursor, componentYOffset, nodeSpacing, layerSpacing, layoutedNodes);

  componentYOffset = maxY + componentGap;
}
```

### Pattern 3: Isolated Table Grid Placement

**What:** After all connected components are positioned, place isolated tables in a compact alphabetical grid starting below the connected section.

**When to use:** When `isolated.length > 0` after `detectConnectedComponents()`.

**Grid layout math:**

```typescript
/**
 * Places isolated tables in a compact alphabetical grid.
 * Grids flow left-to-right first, then wrap to next row.
 * Grid starts at y = connectedSectionHeight + gridGap.
 */
function placeIsolatedGrid(
  isolated: string[],           // sorted alphabetically
  tableNodeData: TableNodeData[],
  startY: number,               // top of grid zone
  nodeSpacing: number,
  maxRowWidth: number = 1200,   // wrap to next row when this wide
): Node[] {
  const nodes: Node[] = [];
  let currentX = 0;
  let currentY = startY;
  let rowHeight = 0;

  for (const tableId of isolated) {
    const td = tableNodeData.find((t) => t.id === tableId)!;
    const width = calculateTableNodeWidth(td.tableName, td.columns);
    const height = calculateTableNodeHeight(td.columns.length, td.isExpanded);

    // Wrap to next row if this node would exceed maxRowWidth
    if (currentX > 0 && currentX + width > maxRowWidth) {
      currentY += rowHeight + nodeSpacing;
      currentX = 0;
      rowHeight = 0;
    }

    nodes.push({
      id: tableId,
      type: 'tableNode',
      position: { x: currentX, y: currentY },
      data: tableNodeData.find((t) => t.id === tableId),
    } as Node);

    rowHeight = Math.max(rowHeight, height);
    currentX += width + nodeSpacing;
  }

  return nodes;
}
```

**maxRowWidth determination:** The value should adapt to the connected section's total width so the grid roughly matches its footprint. A simple heuristic: use the maximum x-extent of the connected nodes, with a floor of 1200px. This avoids an overly narrow grid when the connected section is wide.

### Pattern 4: ELK layoutSimpleNodes Config Fix (MLST-05)

**What:** The `layoutSimpleNodes()` fallback uses ELK's `layered` algorithm with no component separation. When the input has both connected and isolated nodes, ELK places isolated nodes as if they were in layer 0 of the flow — mixed with genuine source tables.

**Current ELK config (layoutSimpleNodes, lines 648-655):**
```typescript
layoutOptions: {
  'elk.algorithm': 'layered',
  'elk.direction': direction,
  'elk.spacing.nodeNode': String(nodeSpacing),
  'elk.layered.spacing.nodeNodeBetweenLayers': String(layerSpacing),
  'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
  'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
},
```

**Fixed ELK config for MLST-05:**
```typescript
layoutOptions: {
  'elk.algorithm': 'layered',
  'elk.direction': direction,
  'elk.spacing.nodeNode': String(nodeSpacing),
  'elk.layered.spacing.nodeNodeBetweenLayers': String(layerSpacing),
  'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
  'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
  'elk.separateConnectedComponents': 'true',           // MLST-05: separate isolated nodes
  'elk.spacing.componentComponent': String(nodeSpacing * 2),  // gap between components
  'elk.aspectRatio': '1.7',                            // encourage wider layouts
},
```

**Verified option keys (from elkjs 0.9.3 bundle):**
- `org.eclipse.elk.separateConnectedComponents` (short: `elk.separateConnectedComponents`) — confirmed present: "Whether each connected component should be processed separately."
- `org.eclipse.elk.spacing.componentComponent` (short: `elk.spacing.componentComponent`) — confirmed present, description: "Only relevant if 'separateConnectedComponents' is activated."
- `org.eclipse.elk.aspectRatio` (short: `elk.aspectRatio`) — confirmed present.

**Important:** The `layoutSimpleNodes` fallback does NOT get the custom topological sort treatment (that's only for `tableGroups.size > 0` path). The ELK fix for MLST-05 is the appropriate fix for the simple-node fallback path.

**Note on ELK DisCo:** `org.eclipse.elk.disco` is present in the bundle but explicitly rejected per prior decisions due to known hang risk on dense graphs. Do not use `elk.algorithm: 'disco'` or any `disco.*` option.

### Pattern 5: separateDatabaseClusters Integration

**What:** After Phase 20 positions nodes in two zones (connected + isolated grid), the existing `separateDatabaseClusters()` function must still be called for multi-database graphs. However, its current logic computes a single bounding box per database using all nodes of that database — if a database has both connected and isolated tables, its bounding box will span both zones.

**Risk:** The `secLo`/`secHi` secondary bounds added in Phase 19 were explicitly described as "available for Phase 20 grid placement". However, the current `separateDatabaseClusters` only shifts databases along the PRIMARY axis (x for RIGHT direction). The isolated grid is placed below the connected section (along the SECONDARY axis, y for RIGHT direction). This means `separateDatabaseClusters` may over-expand cluster bounding boxes vertically when a database has isolated tables in the grid zone.

**Mitigation options:**
1. Call `separateDatabaseClusters` only on connected nodes, then place isolated nodes separately (they aren't part of any cluster's bounding box contribution).
2. Accept the over-expanded bounding box for now — `ClusterBackground` draws based on actual node positions, not the extent data in `dbExtent`.

**Recommended:** Option 2. `ClusterBackground` computes its own bounding boxes from React Flow node positions via `calculateClusterBounds()`. The `dbExtent` in `separateDatabaseClusters` is only used for shift calculation, not for visual rendering. So if the shift calculation over-estimates, clusters get shifted more than necessary — a visual artifact but not a correctness bug. This is acceptable for Phase 20. A future phase can make `separateDatabaseClusters` component-aware.

**More careful option (if Option 2 produces bad results):** Pass only connected nodes to `separateDatabaseClusters`, then add isolated node positions after the cluster separation pass. Since isolated tables by definition have no edges, they don't affect the cluster flow order.

### Anti-Patterns to Avoid

- **Running Kahn sort globally then splitting into components:** Gives wrong results. Longest-path layering must run within each component's subgraph. A global layer 0 node in component A should not push a global layer 0 node in component B to layer 1.
- **Using ELK for the main column-level path:** Phase 19 established this causes hangs on dense graphs. The custom topological sort is the only safe approach for the main path.
- **Using ELK DisCo for component separation:** Explicitly rejected. Known hang risk.
- **Placing isolated nodes at x=0, y=0 (same as connected layer 0):** Causes overlap between isolated and connected sections. Always offset isolated grid by connected section height + gridGap.
- **Alphabetical sort after BFS:** Sort isolated tables alphabetically AFTER detection, not during BFS (BFS visit order is non-deterministic for ties).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Component separation in ELK fallback | Custom BFS + two-pass ELK | `elk.separateConnectedComponents: true` option | ELK handles this natively in layoutSimpleNodes path |
| Grid packing for isolated nodes | Bin-packing algorithm | Simple left-to-right wrap with fixed maxRowWidth | Tables are uniform-ish in size; bin packing is overkill; simple wrap is O(n) |
| Connected component detection | Union-Find / disjoint sets | BFS over undirected adjacency | The table graph is small (< 500 nodes); BFS is O(V+E) and simpler to implement and test |

**Key insight:** The heavy lifting (topological sort, longest-path layering) already exists and is tested. Phase 20 only adds the component detection + per-component invocation wrapper around existing code. This is refactoring, not new algorithm development.

---

## Common Pitfalls

### Pitfall 1: Per-Component Layer Numbering Conflict

**What goes wrong:** When running Kahn + layering per component independently, each component produces layers 0, 1, 2, ... Starting from x=0 for each component causes them all to stack on the same x columns.

**Why it happens:** The layering is relative (component-local), not absolute.

**How to avoid:** Use the `componentYOffset` approach — each component's tables start at the same x=0 for their layer 0, but are offset downward (for RIGHT direction) by the previous component's total height + gap. The x-positions (layer columns) are shared across components, which gives the visual effect of all components using the same left-to-right columnar layout.

**Alternative:** Use a `componentXOffset` approach where each component's layer 0 starts AFTER the previous component's rightmost column. This gives side-by-side components but can produce very wide layouts.

**Recommended:** componentYOffset (components stack vertically), not componentXOffset (components stack horizontally). The success criteria says "left-to-right columns representing topological depth" — this is satisfied as long as within each component, lower depth is to the left. Stacking components vertically is consistent with this.

**Warning signs:** Two unrelated tables at the same x,y position after layout.

### Pitfall 2: Isolated Table Overlap with Connected Section

**What goes wrong:** Isolated tables placed at `y = 0` overlap with connected tables in layer 0.

**Why it happens:** The connected section's y-range starts at 0 and grows downward. If isolated grid also starts at 0, they collide.

**How to avoid:** Track `maxConnectedY` (the maximum y + height of any connected node after all components are positioned). Start isolated grid at `maxConnectedY + gridGap` where `gridGap >= 80`.

**Warning signs:** Overlap detected visually; unit test with mixed connected + isolated nodes that checks `min(isolated.y) > max(connected.y + height)`.

### Pitfall 3: Empty Connected Components

**What goes wrong:** `connected` array from `detectConnectedComponents()` includes single-node components that share an edge (e.g., self-loop).

**Why it happens:** The undirected BFS sees a self-loop as a neighbor relationship where src == tgt. The undirected neighbor set for a self-looping node has size 1 (itself), but via undirected adjacency, `undirected.get(id).has(id)` is true, making the BFS consider it "visited" immediately.

**How to avoid:** In the undirected adjacency build, skip self-loops: `if (src !== tgt) { ... add to undirected ... }`.

**Warning signs:** A node with a self-loop appears in `isolated` even though it has edges.

### Pitfall 4: tableAdj Already Built — Don't Rebuild

**What goes wrong:** Phase 20 needs the `tableAdj` map that is already built inside `layoutGraph()` at lines 413-430. If `detectConnectedComponents` builds a second adjacency, you double the O(E) work and risk inconsistency.

**How to avoid:** Pass the already-built `tableAdj` directly to `detectConnectedComponents`. The function signature should accept `tableAdj: Map<string, Set<string>>` and `tableIds: string[]`.

**Warning signs:** Two adjacency builds for the same edges in the profiler.

### Pitfall 5: AllDatabasesLineageGraph Still Calls layoutGraph Synchronously

**What goes wrong:** `AllDatabasesLineageGraph.tsx` calls `layoutGraph()` directly (not via Worker), while `DatabaseLineageGraph.tsx` uses the Worker. Phase 19's Worker migration only covered `DatabaseLineageGraph`.

**Why it happens:** `AllDatabasesLineageGraph.tsx` was noted in Phase 19 research as not yet migrated. Phase 20 adds ~5ms of component analysis; on the main thread this is acceptable for small graphs but could cause jank for large all-databases views.

**How to avoid:** This is a pre-existing condition from Phase 19. Phase 20 does not need to fix it (it's not in the success criteria). However, the ~5ms BFS for 500 tables is negligible even on main thread. The Worker migration for AllDatabasesLineageGraph is a potential future task, not Phase 20 scope.

**Warning signs:** Noticeable jank when loading AllDatabasesLineageGraph with 200+ tables after Phase 20.

### Pitfall 6: Kahn Sort Refactor Must Preserve O(V+E) Binary-Search Insertion

**What goes wrong:** When splitting Kahn sort into per-component invocations, the inner binary-search insertion must still be used, not a naive `push + sort`.

**Why it happens:** The Phase 19 fix (binary-search splice) is in the existing Kahn sort loop. If Phase 20 extracts this into a helper function, the helper must preserve the sorted insertion approach.

**How to avoid:** Extract the Kahn sort logic into a named helper function `kahnSort(tableIds: Set<string>, adj: Map<string, Set<string>>, inDeg: Map<string, number>): string[]` that includes the binary-search splice insertion. Both the per-component path and the existing `topoSortDatabases` can be unified on this helper.

**Warning signs:** `layoutEngine.test.ts` Kahn sort tests fail after refactoring.

---

## Code Examples

Verified patterns from the live codebase:

### Existing tableAdj Build (layoutGraph.ts lines 413-430 — do not duplicate)

```typescript
// Already in layoutGraph() — pass this to detectConnectedComponents:
const tableAdj = new Map<string, Set<string>>();
const tableInDeg = new Map<string, number>();
for (const t of tableNodeData) {
  tableAdj.set(t.id, new Set());
  tableInDeg.set(t.id, 0);
}
for (const edge of rawEdges) {
  const src = columnToTableMap.get(edge.source);
  const tgt = columnToTableMap.get(edge.target);
  if (!src || !tgt || src === tgt) continue;
  if (!tableAdj.get(src)!.has(tgt)) {
    tableAdj.get(src)!.add(tgt);
    tableInDeg.set(tgt, (tableInDeg.get(tgt) || 0) + 1);
  }
}
```

### ELK layoutSimpleNodes Fix (MLST-05)

```typescript
// In layoutSimpleNodes() layoutOptions object — add three properties:
'elk.separateConnectedComponents': 'true',
'elk.spacing.componentComponent': String(nodeSpacing * 2),
'elk.aspectRatio': '1.7',
```

These property names are verified against the elkjs 0.9.3 bundle:
- `elk.separateConnectedComponents` → aliased from `org.eclipse.elk.separateConnectedComponents`
- `elk.spacing.componentComponent` → aliased from `org.eclipse.elk.spacing.componentComponent`
- `elk.aspectRatio` → aliased from `org.eclipse.elk.aspectRatio`

### detectConnectedComponents (new export from layoutEngine.ts)

```typescript
/**
 * Returns:
 * - connected: array of Sets, each with 2+ tables that share lineage edges
 * - isolated: alphabetically sorted array of single tables with no edges
 */
export function detectConnectedComponents(
  tableIds: string[],
  tableAdj: Map<string, Set<string>>
): { connected: Set<string>[]; isolated: string[] } {
  // Build undirected adjacency (skip self-loops)
  const undirected = new Map<string, Set<string>>();
  for (const id of tableIds) undirected.set(id, new Set());
  tableAdj.forEach((targets, src) => {
    targets.forEach((tgt) => {
      if (src !== tgt) {
        undirected.get(src)!.add(tgt);
        undirected.get(tgt)!.add(src);
      }
    });
  });

  const visited = new Set<string>();
  const components: Set<string>[] = [];

  for (const startId of tableIds) {
    if (visited.has(startId)) continue;
    const component = new Set<string>();
    const queue: string[] = [startId];
    visited.add(startId);
    while (queue.length > 0) {
      const current = queue.shift()!;
      component.add(current);
      for (const neighbor of undirected.get(current) ?? []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
    components.push(component);
  }

  const isolated: string[] = [];
  const connected: Set<string>[] = [];
  for (const comp of components) {
    const ids = [...comp];
    if (ids.length === 1 && undirected.get(ids[0])!.size === 0) {
      isolated.push(ids[0]);
    } else {
      connected.push(comp);
    }
  }
  isolated.sort();
  return { connected, isolated };
}
```

### Grid Placement for Isolated Tables

```typescript
// Place isolated tables in an alphabetical grid below all connected nodes.
// startY = max y-position of all connected nodes + their heights + gridGap
const GRID_GAP = 80;

function placeIsolatedGrid(
  isolated: string[],
  tableNodeData: TableNodeData[],
  startY: number,
  nodeSpacing: number,
): Node[] {
  const nodes: Node[] = [];
  let currentX = 0;
  let currentY = startY;
  let rowHeight = 0;

  // Determine max row width from connected section (or use 1200px floor)
  // For simplicity, use a fixed wrap width that covers typical viewport
  const maxRowWidth = 1200;

  for (const tableId of isolated) {
    const td = tableNodeData.find((t) => t.id === tableId)!;
    const width = calculateTableNodeWidth(td.tableName, td.columns);
    const height = calculateTableNodeHeight(td.columns.length, td.isExpanded);

    if (currentX > 0 && currentX + width > maxRowWidth) {
      currentY += rowHeight + nodeSpacing;
      currentX = 0;
      rowHeight = 0;
    }

    nodes.push({
      id: tableId,
      type: 'tableNode',
      position: { x: currentX, y: currentY },
      data: td,
    } as Node);

    rowHeight = Math.max(rowHeight, height);
    currentX += width + nodeSpacing;
  }

  return nodes;
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Global Kahn sort (all tables together) | Per-component Kahn sort (Phase 20) | Phase 20 | Isolated tables no longer appear mixed with source tables in layer 0 |
| No component separation in layoutSimpleNodes | `separateConnectedComponents: true` (Phase 20) | Phase 20 | ELK fallback path also separates isolated nodes |
| Full adjacency for layering | Subgraph adjacency per component (Phase 20) | Phase 20 | Layer depths are correct relative to each component, not global |

**Deprecated/outdated after Phase 20:**
- Single-pass global `topoOrder` + `layerMap` for all tables: replaced by per-component invocation of the same algorithm.

---

## Open Questions

1. **Component stacking: vertical vs horizontal**
   - What we know: The success criteria says "left-to-right columns representing topological depth" — within each component this must hold; across components the relationship is not specified
   - What's unclear: Whether multiple connected components should be stacked vertically (component A above component B, both with layer 0 at x=0) or horizontally (component A on the left, component B on the right after a gap)
   - Recommendation: Use vertical stacking (`componentYOffset`) for components. This keeps the layer 0 / layer 1 / etc. columns visually aligned across components, which helps users understand data flow depth. The isolated grid at the bottom is unambiguously below.

2. **Isolated table grid maxRowWidth**
   - What we know: The grid must be compact and alphabetical
   - What's unclear: Whether maxRowWidth should be dynamic (match connected section width) or fixed (1200px)
   - Recommendation: Compute maxRowWidth dynamically as `max(1200, maxConnectedX)` where `maxConnectedX` is the rightmost x-position of any connected node. This makes the grid proportional to the connected section footprint.

3. **Direction support for isolated grid**
   - What we know: The current layoutGraph supports RIGHT, LEFT, UP, DOWN directions for connected nodes
   - What's unclear: How to place the isolated grid for UP/DOWN vs LEFT/RIGHT directions
   - Recommendation: For RIGHT/LEFT directions, place isolated grid BELOW connected section (y offset). For UP/DOWN directions, place isolated grid to the RIGHT of connected section (x offset). The planner should specify the direction-aware grid placement in the plan.

4. **separateDatabaseClusters interaction with two-zone layout**
   - What we know: `separateDatabaseClusters` shifts databases along the primary axis; isolated tables in the secondary axis shouldn't affect primary-axis cluster ordering
   - What's unclear: Whether `separateDatabaseClusters` should be called only on connected nodes, or on all nodes
   - Recommendation: Call `separateDatabaseClusters` on ALL nodes (connected + isolated). The isolated tables' y-positions are in a different zone and won't trigger incorrect x-shifts because the bounding box calculation (`lo`, `hi` on primary axis = x) correctly computes the x-extent of each database's nodes. Isolated tables in the grid zone at y=1200 but x=0-1200 will participate in the x-extent calculation, potentially merging a database's bounding box across both zones. This is acceptable — the visual result is that the cluster box for a database with isolated tables will be tall, encompassing both zones. Consider calling `separateDatabaseClusters` only on connected nodes if this over-expansion is visually jarring.

---

## Sources

### Primary (HIGH confidence — live codebase + bundle analysis)

- `/lineage-ui/src/utils/graph/layoutEngine.ts` — Full source reviewed. tableAdj build at lines 413-430; Kahn sort at lines 432-462; longest-path at lines 463-476; layer buckets at lines 480-524; layoutSimpleNodes ELK config at lines 648-655; separateDatabaseClusters at lines 271-358.
- `/lineage-ui/src/components/domain/LineageGraph/AllDatabasesLineageGraph.tsx` — Calls `layoutGraph()` directly (not via Worker); confirmed no worker migration for this component.
- `/lineage-ui/src/utils/graph/layoutEngine.test.ts` — 63 existing tests covering all public functions; all must continue to pass after Phase 20.
- `/lineage-ui/node_modules/elkjs/lib/elk.bundled.js` (version 0.9.3) — Confirmed presence of `org.eclipse.elk.separateConnectedComponents`, `org.eclipse.elk.spacing.componentComponent`, `org.eclipse.elk.aspectRatio`. Confirmed DisCo algorithm present but not used.
- `/lineage-ui/src/components/domain/LineageGraph/DatabaseLineageGraph.tsx` — Uses Worker (Phase 19 complete). No changes needed.
- `.planning/phases/19-layout-engine-foundation/19-VERIFICATION.md` — Phase 19 verified complete. `secLo`/`secHi` added to `dbExtent` in `separateDatabaseClusters` for Phase 20 use.

### Secondary (MEDIUM confidence)

- Prior decisions in phase context: "ELK DisCo explicitly rejected: known hang risk on dense graphs" — honored throughout this research.
- Prior decisions: "Binary-search splice insertion chosen for Kahn sort" — preserved in per-component extraction recommendation.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified against installed package.json and live imports; no new packages needed
- Architecture patterns: HIGH — all patterns grounded in the current layoutEngine.ts source code with specific line numbers
- ELK option keys: HIGH — verified by searching elkjs 0.9.3 bundle directly
- Component stacking direction: MEDIUM — the "components stacked vertically" recommendation is a design choice with reasonable justification but the planner may choose differently based on visual preference
- separateDatabaseClusters interaction: MEDIUM — the "call on all nodes" recommendation is simpler but may produce over-expanded cluster boxes for databases with mixed connected + isolated tables

**Research date:** 2026-02-21
**Valid until:** 2026-03-21 (stable codebase, no fast-moving dependencies)
