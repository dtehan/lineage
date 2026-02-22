# Pitfalls Research

**Domain:** Adding mixed layout strategies to existing ELKjs + React Flow database lineage graph
**Researched:** 2026-02-21
**Confidence:** HIGH

---

## Critical Pitfalls

### Pitfall 1: Kahn Sort-Every-Iteration Is O(n log n) per Layer, Not O(V+E)

**What goes wrong:**
The existing `layoutGraph()` in `layoutEngine.ts` calls `topoQueue.sort()` inside the BFS while-loop — once per dequeue. Standard Kahn's algorithm is O(V+E) with a plain queue. Sorting on each iteration degrades it to O(V log V + E) in the best case, O(V² log V) in the worst case for dense graphs. For 50-table lineage this is invisible. For a database-lineage view with 400+ table nodes the sort-per-iteration is called 400+ times, and each sort operates on the full remaining queue. At 400 nodes and average fan-out of 5 this is measurable jank (10-50ms extra) in the layout-worker thread. The comment "deterministic tie-breaking" justifies the sort, but the sort only needs to happen once per layer, not once per dequeue.

**Why it happens:**
The developer correctly wanted deterministic output but applied sorting too frequently. The canonical Kahn's algorithm uses a FIFO queue — sorting is not required for correctness, only for output stability. Determinism can be achieved by sorting once at the start (all zero-in-degree nodes sorted) and sorting each layer's candidates once before pushing them, rather than sorting the entire queue repeatedly.

**How to avoid:**
Replace the inner `topoQueue.sort()` call with a sort applied only when a new batch of zero-in-degree nodes is discovered — i.e., sort the newly-added candidates before appending to the queue, not the entire queue on every iteration. In the `topoSortDatabases` function the same pattern exists and should be corrected simultaneously. Benchmark with `layoutEngine.bench.ts` at 400 nodes before and after to validate the fix.

**Warning signs:**
- `layoutEngine.bench.ts` shows non-linear scaling beyond 200 nodes — 400 nodes takes more than 2x the time of 200 nodes
- Layout worker thread spends > 50% of its time in sort operations (visible via Chrome DevTools Performance flame chart)
- The `elkTime` metric in `LayoutMetrics` grows super-linearly with node count

**Phase to address:**
Phase 1 (layout engine refactoring) — fix before adding mixed layout strategies, otherwise any benchmark comparisons are tainted by the sorting overhead.

---

### Pitfall 2: ClusterBackground Bounding Box Uses Stale `measured` Dimensions After Layout

**What goes wrong:**
`ClusterBackground.tsx` reads `node.measured?.width` and `node.measured?.height` from the React Flow store's `nodeLookup` to compute cluster bounding boxes. After a layout runs and `setNodes` is called with new positions, React Flow renders nodes with their new positions but the `measured` dimensions are only populated after the ResizeObserver fires — which happens on the next browser paint, not synchronously. If `ClusterBackground` reads `nodeLookup` immediately after `setNodes`, it may see `node.measured` as `undefined` or reflecting the pre-layout dimensions, causing cluster boxes to render at incorrect sizes before snapping to the correct size on the next paint. On large graphs (400+ nodes), the ResizeObserver firings are staggered — some nodes report measured dimensions before others, making cluster boxes visibly resize during the render sequence.

**Why it happens:**
React Flow's architecture separates position (set externally via `setNodes`) from dimensions (measured internally by ResizeObserver). There is no synchronous way to get measured dimensions after a layout call — the only correct time to read `measured` is after the component has rendered AND the ResizeObserver has fired. The `useMemo` in `ClusterBackground` subscribes to `nodeInternals` changes, which fire on every ResizeObserver update, so cluster boxes resize incrementally as nodes measure themselves.

**How to avoid:**
1. Pre-calculate node dimensions in the layout engine using the same formulas as the node components (`calculateTableNodeWidth`, `calculateTableNodeHeight`) and attach them as `width`/`height` on the node object passed to `setNodes`. React Flow uses these as initial dimensions before measurement completes, making the cluster bounding box correct from the first render.
2. Add `width` and `height` to every node in `layoutedNodes` before calling `setNodes` — the existing `calculateTableNodeWidth` and `calculateTableNodeHeight` functions already exist for this purpose.
3. Gate cluster box rendering with a `isLayoutComplete` flag that transitions to `true` only after the double-`requestAnimationFrame` in `DatabaseLineageGraph.tsx` fires (`stage === 'complete'`).

**Warning signs:**
- Cluster boxes visibly resize/reposition during graph load — start small then expand to correct size
- `ClusterBackground` re-renders many times in React Profiler during a single graph load
- Cluster boxes appear to "catch up" to node positions with a visible delay on large graphs

**Phase to address:**
Phase 1 (layout foundation) — the width/height pre-calculation fix prevents the problem permanently and makes cluster boxes correct from the first render.

---

### Pitfall 3: Mixed Layout Strategy Breaks the `separateDatabaseClusters` Bounding-Box Assumption

**What goes wrong:**
`separateDatabaseClusters` assumes all nodes within a database are contiguous along the primary axis after ELK/topological layout — it shifts entire database groups along X (or Y) to prevent overlap. When a mixed layout strategy is introduced (e.g., isolated tables without lineage use a grid layout, connected tables use hierarchical layout), nodes from the same database can end up in non-contiguous X ranges. Applying `separateDatabaseClusters` to a mixed layout produces incorrect shifts: the function computes `lo` and `hi` from the min/max positions of all database nodes, then applies a uniform offset. But if database A has two table-groups — one at x=0 and one at x=800 (because one is isolated, one is connected) — the shift moves both groups together, ignoring the gap between them. The bounding box becomes artificially large, making the cluster box for database A engulf the adjacent database B's territory.

**Why it happens:**
`separateDatabaseClusters` was designed for single-component lineage where all tables in a database form a contiguous block. Multi-component graphs break this assumption by design.

**How to avoid:**
Before introducing mixed layout strategies, refactor `separateDatabaseClusters` to compute the bounding box correctly for non-contiguous node groups. Two approaches:
1. Group nodes by (database, connected-component) pairs, separate each pair independently, then compute the per-database bounding box from the post-separation positions.
2. Run `separateDatabaseClusters` only after the mixed layout positions are finalized — i.e., as the absolute last step, reading actual node positions rather than pre-computed extents.

Always verify the bounding box output against `ClusterBackground`'s rendering by running the visual regression test after any `separateDatabaseClusters` change.

**Warning signs:**
- Cluster boxes for databases with isolated tables are wider than expected
- Isolated table nodes appear inside the cluster box of a different database
- `separateDatabaseClusters` produces a non-zero shift for a database that should not move (e.g., the first in topological order)

**Phase to address:**
Phase 1 (layout foundation) — `separateDatabaseClusters` must be refactored before mixed layout is introduced. Do not add connected-component analysis until the separation step handles non-contiguous node groups correctly.

---

### Pitfall 4: `onlyRenderVisibleElements` Hides Nodes Before ClusterBackground Can Measure Them

**What goes wrong:**
Both `DatabaseLineageGraph.tsx` and `AllDatabasesLineageGraph.tsx` use `onlyRenderVisibleElements={nodes.length > 50}` (or `> 30`). When this flag is active, React Flow only mounts DOM nodes for visible elements. `ClusterBackground` computes bounding boxes by reading `nodeLookup` from the React Flow store — but `nodeLookup` only contains entries for nodes that have been measured by ResizeObserver, which requires the node to be mounted in the DOM. For a database cluster where all member tables are currently off-screen (panned away), `onlyRenderVisibleElements` means those nodes are never mounted, `nodeLookup` has no `measured` dimensions for them, and `calculateClusterBounds` returns `null` — the cluster box disappears entirely as the user pans across the graph.

**Why it happens:**
`onlyRenderVisibleElements` is a correct performance optimization, but `ClusterBackground` was written assuming all nodes are always mounted. The two features are fundamentally incompatible in their current form.

**How to avoid:**
Pre-calculate cluster bounds from layout positions (not from `node.measured`) and pass them to `ClusterBackground` directly as props. Use the `width`/`height` set on node objects at layout time (from `calculateTableNodeWidth`/`calculateTableNodeHeight`) rather than the ResizeObserver-measured values from `nodeLookup`. The `viewport transform + position` math in `ClusterBackground` will still work correctly for off-screen clusters because the layout positions are accurate — only the dimension source changes.

**Warning signs:**
- Cluster boxes disappear when panning to areas of the graph with no visible nodes
- `ClusterBackground` renders 0 clusters after panning even though the graph has multiple databases
- Setting `onlyRenderVisibleElements={false}` makes cluster boxes reappear

**Phase to address:**
Phase 1 (layout foundation) — fix the dimension source before enabling large-graph optimizations. This must be resolved before testing with 200+ node database graphs, as `onlyRenderVisibleElements` will activate automatically.

---

### Pitfall 5: Connected Component Analysis Is O(V+E) but the Main-Thread Layout Blocks During It

**What goes wrong:**
The current `layoutGraph` function runs on the main thread in `DatabaseLineageGraph.tsx` (not in the worker). Adding connected component analysis (union-find or BFS-based) to determine which tables are isolated vs. connected increases the sequential work in `layoutGraph`. For a database with 500 tables and 2000 edges, connected component analysis adds ~5ms. Harmless alone. But combined with the existing topological sort, layering, and separation steps, the total synchronous work grows from ~8ms to ~15ms — still safe. The problem is that database lineage graphs can have more nodes than column/table lineage: a database could have 1000 tables with sparse lineage. At 1000 nodes, all steps compound: sort (O(V log V)), layering (O(V+E)), connected components (O(V+E)), grid placement for isolated nodes (O(isolated_count)) = ~80ms of synchronous blocking. The main thread freezes the UI for 80ms during layout, causing perceptible jank.

**Why it happens:**
`DatabaseLineageGraph.tsx` calls `layoutGraph` directly on the main thread (unlike the column/table lineage views which use `useLayoutWorker`). The comment in the code says "topological layout is O(V+E), completes in ms" — which was true before adding connected component analysis on large database graphs.

**How to avoid:**
Route database lineage layout through `useLayoutWorker` (the existing Comlink worker) instead of calling `layoutGraph` directly. The worker is already set up and accepts the same function signature. This eliminates the main-thread blocking entirely. Before doing this, verify that `layoutGraph` does not use any browser-only APIs that would fail in a Worker context (`performance.now()` is available in workers; `import.meta.env` is Vite-specific but also available in workers built by Vite).

**Warning signs:**
- Chrome DevTools shows > 16ms Long Tasks in the main thread during database lineage load
- Frame drops occur when switching to a database with 200+ tables
- `useProfiler('DatabaseLineageGraph')` shows render duration > 50ms on first mount

**Phase to address:**
Phase 1 (layout foundation) — move database lineage layout to the worker before adding connected component analysis. The worker migration is low-risk and eliminates an entire class of future performance problems.

---

### Pitfall 6: ELK `separateConnectedComponents` Option Interacts Badly with Custom Post-Layout Steps

**What goes wrong:**
If ELK is used for any layout pass (e.g., for isolated component grid arrangement via `elk.algorithm: 'disco'`), the `elk.separateConnectedComponents: true` option tells ELK to process each connected component independently then pack them. The packing algorithm positions components relative to the ELK graph's `(0,0)` origin. The custom `separateDatabaseClusters` post-processing step then tries to shift groups along the primary axis — but ELK's component packing has already handled separation. Applying `separateDatabaseClusters` on top of ELK-packed components double-shifts nodes: ELK places component A at x=0 and component B at x=500; `separateDatabaseClusters` then sees them as "overlapping" (because the bounding box check uses the node positions without accounting for ELK's packing gaps) and shifts component B further right to x=700. The resulting layout has unnecessary whitespace.

**Why it happens:**
The two separation systems do not know about each other. `separateDatabaseClusters` was written for the custom topological layout path which has no component-packing. If ELK is reintroduced for any part of the pipeline, the post-processing steps must be conditionally disabled or redesigned.

**How to avoid:**
Establish a clear rule: either use ELK's component-packing OR the custom `separateDatabaseClusters` — never both for the same layout pass. Document this as an invariant in `layoutEngine.ts`. If ELK's disco algorithm is used for grid-packing isolated components, disable `separateDatabaseClusters` for those nodes and only apply it to the hierarchical component group.

**Warning signs:**
- Isolated table nodes (no lineage) appear far to the right of the main hierarchical graph with a large empty gap between them
- The gap between database clusters grows disproportionately when some tables have no lineage
- Adding `elk.separateConnectedComponents: false` to ELK options reduces whitespace noticeably

**Phase to address:**
Phase 2 (mixed layout strategy) — this pitfall only manifests when both ELK component-handling and the custom separation step are active simultaneously. Establish the invariant in Phase 1 documentation before Phase 2 implementation begins.

---

### Pitfall 7: Grid Layout for Isolated Nodes Creates Inter-Database Edge Crossings

**What goes wrong:**
A mixed layout places connected tables in a hierarchical left-to-right layout and isolated tables (no edges) in a grid below or to the side. When a database has 50 tables in the hierarchical region and 30 isolated tables in the grid region, edges from the hierarchical region that pass near the grid region visually cross through the grid cells. React Flow renders all edges using the same coordinate space — edges from database A's hierarchical section can visually intersect with database B's isolated-node grid if the two regions overlap on the Y axis. Users misread these visual crossings as lineage relationships.

**Why it happens:**
Grid layout for isolated nodes does not account for edge routing from the hierarchical region. The custom topological layout does not use ELK's edge routing (it produces no edge bend-points). React Flow renders edges as straight bezier curves between source and target handles. Straight bezier curves from deep-hierarchy nodes to other deep-hierarchy nodes will pass through any grid region that occupies the same vertical band.

**How to avoid:**
1. Place isolated nodes outside the primary layout axis entirely: if the main layout is left-to-right (direction=RIGHT), place isolated nodes below the entire hierarchical section (increment Y by the hierarchical section's max height + padding). This ensures no hierarchical edges cross through the isolated region.
2. Use a minimum Y-separation constant equal to the cluster box padding (currently 60px) plus the tallest node height in the hierarchical section.
3. Do not use a grid that shares the same X range as any hierarchical layer.

**Warning signs:**
- Visual inspection of the database lineage graph shows edges passing through isolated node grid cells
- Users report confusion about whether isolated nodes are "connected" to the lineage
- Zooming out reveals edge paths that appear to terminate inside the grid region

**Phase to address:**
Phase 2 (mixed layout strategy) — grid placement algorithm must account for edge routing before implementation. Verify visually with a test database that has both connected and isolated tables.

---

## Moderate Pitfalls

### Pitfall 8: `applySmartViewport` with 150ms Timeout Is Too Short for Large Database Graphs

**What goes wrong:**
Both `DatabaseLineageGraph.tsx` and `AllDatabasesLineageGraph.tsx` use `setTimeout(..., 150)` to delay `applySmartViewport` after layout completes — the comment says "to ensure React Flow has measured node dimensions." For column/table lineage with 20-50 nodes, 150ms is sufficient. For a database-lineage view with 400 nodes, React Flow's ResizeObserver fires for each node individually. On a slow machine or when the browser is under CPU load, not all 400 nodes will have reported their measured dimensions within 150ms. `applySmartViewport` calls `fitView` on nodes with zero or pre-measurement dimensions, producing a viewport that does not contain all nodes. The user sees nodes outside the viewport on initial load.

**How to avoid:**
Replace the fixed timeout with a measurement-completion gate. Two options:
1. Use `reactFlowInstance.getNodes()` filtered to `node.measured !== undefined` — if the count matches the total node count, measurement is complete.
2. Pre-set `width` and `height` on nodes at layout time (the pre-calculation fix from Pitfall 2), which makes `fitView` correct from the first render without waiting for ResizeObserver.

The pre-calculation approach (option 2) is preferred because it eliminates the timing dependency entirely.

**Warning signs:**
- `fitView` on initial load shows only part of the graph for large databases (200+ tables)
- Increasing the timeout to 500ms makes the problem disappear
- The issue is more frequent on slower machines or when the browser tab is in the background during load

**Phase to address:**
Phase 1 (layout foundation) — the pre-calculation fix resolves this as a side-effect. If the timeout cannot be eliminated immediately, increase it to `Math.max(150, nodes.length * 0.5)` as a temporary workaround.

---

### Pitfall 9: Layout Cancellation Race Condition When User Changes Direction Mid-Layout

**What goes wrong:**
`DatabaseLineageGraph.tsx` uses a `cancelled` boolean ref inside the layout effect to cancel stale results. When the user changes direction (e.g., RIGHT to DOWN) rapidly, the following sequence occurs: (1) layout for RIGHT starts, (2) user changes direction, (3) layout for DOWN starts, (4) layout for RIGHT completes and checks `cancelled` — but `cancelled` is `false` because the cleanup function resets it per-effect. The RIGHT layout resolves and calls `setNodes`/`setEdges` with RIGHT-direction positions, overwriting the in-progress DOWN layout computation. The graph briefly shows RIGHT-direction positions before DOWN layout completes and overwrites again. On slow machines, this creates a visible position-flash.

**Why it happens:**
The `cancelled` ref is reset in the cleanup function (`return () => { cancelled = true; reset(); }`). But if two effects fire in rapid succession, the first effect's cleanup may not run before the second effect starts — React batches cleanup/setup in a specific order but the async layout promise from the first effect can still resolve after the second effect's promise starts. The `cancelled` ref from the first effect is a closure over a different boolean than the second effect's `cancelled` variable.

**How to avoid:**
Use a single abort signal or generation counter at the module level (or in a ref outside the effect): `const layoutGeneration = useRef(0)`. At the start of each layout effect, increment the generation. At the end of the async layout, check if the current generation matches the expected generation before calling `setNodes`. This correctly handles multiple in-flight layout computations.

**Warning signs:**
- Rapidly clicking direction change buttons causes the graph to visually flash between two layout directions before settling
- React Profiler shows two `setNodes` calls within 100ms of each other when direction is changed quickly
- `ProgressBanner` shows stale progress percentages after direction change

**Phase to address:**
Phase 1 (layout foundation) — fix the cancellation pattern before adding mixed layout strategies, which will have longer computation times and make the race condition more pronounced.

---

### Pitfall 10: Database Color Assignment Is Non-Deterministic Across Re-Renders

**What goes wrong:**
`useDatabaseClustersFromNodes` assigns colors to databases using `FALLBACK_COLORS[index % FALLBACK_COLORS.length]` where `index` is incremented as the `Map.forEach` iteration order. JavaScript `Map` iteration order is insertion order. If the API returns databases in a different order on each request (due to Teradata query result ordering), database A gets the blue color on one render and the green color on the next. The user sees cluster colors change between page loads, which is disorienting and breaks visual memory (users learn "sales_db is blue").

**How to avoid:**
Hash the database name to a stable color index. A simple implementation: `const hash = databaseName.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0); return FALLBACK_COLORS[hash % FALLBACK_COLORS.length]`. This makes the color deterministic for any given database name regardless of iteration order. The existing `DATABASE_COLORS` hardcoded map is correct for known databases — only the fallback path needs the hash.

**Warning signs:**
- Cluster box colors change between page loads for the same database
- Two databases with similar names get the same color (hash collision — inspect and adjust the hash function)
- `useDatabaseClusters.test.ts` tests that check specific colors fail non-deterministically

**Phase to address:**
Phase 1 (layout foundation) — this is a pre-existing bug that becomes more visible when database lineage is a primary view. Fix before UX testing begins.

---

### Pitfall 11: Secondary-Axis Stacking Creates Excessively Tall Layers for Databases with Many Tables

**What goes wrong:**
The topological layout stacks all tables within the same layer along the secondary axis (Y for direction=RIGHT). A database that contains 30 tables all at the same topological depth (e.g., all are source tables with no upstream) produces a single layer that is 30 * (node_height + node_spacing) pixels tall — approximately 30 * (200 + 40) = 7,200px. The adjacent database has 3 tables, stacked to 720px. The cluster box for the 30-table database dwarfs the 3-table database, making the layout look unbalanced. Users cannot see all tables without excessive scrolling in one direction.

**Why it happens:**
The secondary-axis stacking is linear with no wrapping or column limit. This is sufficient for column/table lineage where layers typically have 1-5 nodes. Database lineage layers can have 10-50 nodes.

**How to avoid:**
For layers exceeding a configurable threshold (e.g., 10 nodes), introduce column-wrapping within the layer: arrange tables in a sub-grid of N columns × ceil(count/N) rows, where N is determined by `Math.ceil(Math.sqrt(tableCount))`. Each sub-grid column advances the secondary cursor by the widest node in that column. The primary cursor advances by the widest sub-grid plus layer spacing. This produces more balanced layouts without requiring ELK.

**Warning signs:**
- A single database dominates the vertical (or horizontal) extent of the graph by 10x or more
- `fitView` produces a tiny zoom level to fit the entire graph (graph is too tall/wide)
- Users scroll in one direction to see all tables in a single layer but find nothing else in that direction

**Phase to address:**
Phase 2 (mixed layout strategy) — the column-wrapping logic is part of the "grid for dense layers" feature. Design the wrapping threshold and column count formula before implementation.

---

### Pitfall 12: React Flow Edge Re-Renders When Highlighting Changes All Edge Objects

**What goes wrong:**
`useLineageHighlight` updates the `style` property of every edge in the graph whenever a node is selected — highlighted edges get a different color/width, non-highlighted edges get dimmed styles. This is done by mapping over all edges and creating new objects with updated styles. React Flow re-renders every edge component because they receive new object references for `style`. On a database lineage graph with 1000 edges, this is 1000 edge re-renders per click. The existing edge type `lineageEdge` uses a custom `LineageEdge.tsx` component — if it is not wrapped in `React.memo` with a correct comparison function, all 1000 edges re-render even though only a small subset changed their highlight state.

**Why it happens:**
Spread-cloning edges (`edges.map(e => ({ ...e, style: newStyle }))`) always creates new object references. React Flow compares nodes/edges by reference equality. `React.memo` on the edge component helps only if the props it receives do not change — but since `style` changes on every edge, `React.memo` does not prevent re-renders.

**How to avoid:**
Move highlight state out of edge `style` objects and into CSS classes via the `className` prop. Set `className="highlighted"` or `className="dimmed"` on edges instead of changing `style`. With CSS classes, the `className` string is the same primitive reference for all non-changed edges, preventing re-renders. Add `.highlighted` and `.dimmed` CSS rules to the React Flow stylesheet.

**Warning signs:**
- React Profiler shows all 1000 edges re-rendering on each node click
- Node click response time degrades linearly with edge count (> 16ms at 500 edges)
- `LineageEdge` appears in the React Profiler "Flamegraph" as the top-cost component during interactions

**Phase to address:**
Phase 2 or 3 — this is an existing issue that becomes critical at database-lineage scale. Fix before UX testing with large databases.

---

## Technical Debt Patterns

Shortcuts that seem reasonable during implementation but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Sort inside Kahn's while-loop for determinism | Simpler code, stable output | O(V log V) per iteration — non-linear scaling past 200 nodes | Never in production; sort once per layer discovery instead |
| Call `layoutGraph` on main thread in DatabaseLineageGraph | Avoids worker wiring complexity | Blocks UI during layout for 400+ table databases | Dev-only while validating algorithm correctness; must move to worker before production |
| Read `node.measured` for cluster bounding boxes | Uses authoritative post-render dimensions | Cluster boxes wrong/invisible when `onlyRenderVisibleElements` is active | Never for database lineage; always pre-calculate from layout dimensions |
| Fixed 150ms timeout before `applySmartViewport` | Simple, works for small graphs | Unreliable for 400+ nodes — `fitView` runs before measurement completes | Only when node count is guaranteed < 50 |
| Linear secondary-axis stacking (no wrapping) | Simple algorithm | Excessively tall/wide single layers for databases with many same-depth tables | Only when max layer size is guaranteed < 10 nodes |
| Color by insertion order in `Map.forEach` | Easy to implement | Non-deterministic colors across page loads; user mental model breaks | Never; use name-hash for stable color assignment |

---

## Integration Gotchas

Common mistakes when connecting the mixed layout strategy to the existing system.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Mixed layout + `separateDatabaseClusters` | Running separation after ELK component-packing adds double-shift | Disable `separateDatabaseClusters` for nodes that ELK has already packed; use one system per layout pass |
| Connected component analysis + topological sort | Running connected component detection on the full graph then topo-sorting each component separately — losing inter-component edges | Run topo-sort on the full graph first (inter-component edges are preserved); then use component membership only for secondary-axis placement decisions |
| Grid layout for isolated nodes + hierarchical edges | Placing isolated-node grids in the same X/Y range as hierarchical edges | Place isolated grids outside the primary axis extent (below or to the right of the full hierarchical section) |
| `onlyRenderVisibleElements` + ClusterBackground | Cluster boxes disappear for off-screen databases | Pre-calculate bounds from layout positions, not from `node.measured` |
| Database lineage layout + Web Worker | Main-thread layout blocks on 400+ tables | Route all database lineage layout through `useLayoutWorker` — the worker already handles the same `layoutGraph` function |
| `separateDatabaseClusters` + non-contiguous database groups | Bounding box encompasses gap between isolated and connected tables from same database | Compute extents per (database, component) pair, not per database |
| Direction change + in-flight layout | Cancelled layout resolves and overwrites new layout positions | Use generation counter pattern instead of simple boolean `cancelled` ref |

---

## Performance Traps

Patterns that work at small scale (20-50 tables) but fail at database-lineage scale (200-500 tables).

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Sort inside Kahn's while-loop | Layout time scales non-linearly; 400 nodes takes 4x longer than expected | Sort only newly discovered zero-indegree candidates; not the full queue | > 100 nodes in a single layout pass |
| Main-thread `layoutGraph` for database views | > 16ms Long Tasks in DevTools; frame drops during layout | Move to `useLayoutWorker` (worker already exists) | > 200 table nodes |
| Linear secondary-axis stacking | Single layer fills entire viewport height; user must scroll 5000px | Column-wrap layers exceeding N nodes | > 10 nodes in a single layer |
| Read `node.measured` for cluster bounds | Cluster boxes resize incrementally during render; wrong size with `onlyRenderVisibleElements` | Pre-set `width`/`height` on layouted nodes; compute bounds from those | Any time `onlyRenderVisibleElements` is active (30+ nodes) |
| Update all edge objects on highlight change | 1000 edge re-renders per click; interaction latency > 100ms | Use `className` instead of `style` for highlight state | > 200 edges visible |
| Fixed 150ms `applySmartViewport` timeout | `fitView` shows partial graph on initial load for large databases | Pre-calculate node dimensions; or use measurement-complete gate | > 200 nodes on a slow device |
| Rebuilding cluster bounds every render in `useDatabaseClustersFromNodes` | `useMemo` recomputes on every `setNodes` call during load | Memoize on stable layout output, not on live React Flow node state | > 30 nodes with `showDatabaseClusters` enabled |

---

## UX Pitfalls

Common user experience mistakes specific to database lineage graph views.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No wrapping for large same-depth layers | Users must scroll vertically 5000+ pixels to see all source tables | Column-wrap layers > 10 nodes; configure via `maxNodesPerColumn` option |
| Isolated nodes mixed into hierarchical layout | Users mistake proximity for lineage; visual noise obscures actual relationships | Separate isolated nodes into a distinct visual region with a label ("No lineage data") |
| Database color changes between page loads | Users lose visual memory ("sales_db was blue"); must re-learn layout every visit | Hash database name to stable color index |
| Cluster boxes disappear during pan on large graphs | Users lose database context when panning; do not know which table belongs to which database | Fix cluster bounds computation to use pre-calculated layout dimensions |
| No indication that only N of M tables are shown (pagination) | Users believe graph is complete when it is partial | Show "Showing 50 of 320 tables — Load More" consistently; do not run layout until load decision is made |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Layout worker migration:** Database lineage layout calls `layoutGraph` via `useLayoutWorker` — verify DevTools shows no Long Tasks > 16ms during layout of 400+ node databases
- [ ] **Cluster bounds pre-calculation:** All nodes in `layoutedNodes` have `width` and `height` set — verify `ClusterBackground` cluster boxes are correct from first render without resize flash
- [ ] **Kahn sort fix:** `topoQueue.sort()` is not inside the while-loop — verify `layoutEngine.bench.ts` shows linear scaling from 100 to 400 nodes
- [ ] **Cluster separation with non-contiguous groups:** Test a database that has both isolated tables and connected tables — verify cluster box width matches only the connected table extent, not the full combined extent
- [ ] **`onlyRenderVisibleElements` compatibility:** Pan to a database cluster where all member tables are off-screen — verify cluster box remains visible and correct
- [ ] **Direction change cancellation:** Rapidly change direction three times — verify only the final direction's layout is applied (no position flash from intermediate layouts)
- [ ] **Isolated node grid placement:** Add a database with 20 isolated tables and 5 connected tables — verify isolated nodes appear below (or to the right of) the hierarchical section with no edge crossings through the grid
- [ ] **Color stability:** Reload the database lineage page five times — verify the same database always gets the same cluster color
- [ ] **Edge highlight performance:** Select a node with 100+ connected edges — verify the interaction response is < 100ms and React Profiler shows no full edge-list re-render

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Kahn sort-per-iteration degrading performance | LOW | Remove `sort()` from inside while-loop; sort only new candidates before push; validate with bench |
| ClusterBackground resize flash | LOW | Pre-set `width`/`height` on layouted nodes before `setNodes`; one change in `layoutGraph` return value |
| Mixed layout breaks `separateDatabaseClusters` | MEDIUM | Refactor to compute bounding box per (database, component) pair; add regression test with non-contiguous database |
| `onlyRenderVisibleElements` hides cluster bounds | MEDIUM | Switch `ClusterBackground` to use pre-calculated layout dimensions instead of `nodeLookup`; remove dependency on React Flow store for bounds |
| Main-thread layout jank on large databases | LOW | Wrap existing `layoutGraph(...)` call in `await workerApi.layout(...)` in `DatabaseLineageGraph.tsx`; worker already handles same API |
| Grid and hierarchical nodes overlap with edge crossings | HIGH | Redesign grid placement to be strictly outside primary-axis extent; requires re-testing all layout configurations |
| Non-deterministic database colors | LOW | Replace `index` counter with name-hash in `getColorForDatabase`; add test for color stability across reorders |
| Direction change race condition causing position flash | LOW | Replace `cancelled` boolean with generation counter ref; one change in layout effect |
| Edge highlight re-render storm | MEDIUM | Move highlight state from `style` to `className` on edges; add CSS rules for `.highlighted`/`.dimmed`; validate with React Profiler |

---

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Kahn sort-per-iteration performance | Phase 1 (layout engine refactor) | `layoutEngine.bench.ts` shows linear scaling 100→400 nodes |
| Cluster bounds from stale `measured` dimensions | Phase 1 (layout foundation) | Cluster boxes correct from first render; no resize flash on load |
| `separateDatabaseClusters` breaks with non-contiguous groups | Phase 1 (before mixed layout) | Test database with isolated + connected tables; cluster box width correct |
| `onlyRenderVisibleElements` hides cluster bounds | Phase 1 (layout foundation) | Pan to off-screen database; cluster box remains visible |
| Main-thread layout blocks on 400+ nodes | Phase 1 (worker migration) | No Long Tasks > 16ms in DevTools during database lineage load |
| ELK component-packing conflicts with custom separation | Phase 2 (mixed layout design) | Document invariant: ELK packing XOR `separateDatabaseClusters`, never both |
| Grid placement causes edge crossings | Phase 2 (mixed layout implementation) | Visual inspection of database with isolated + connected tables; no edges cross grid cells |
| Secondary-axis stacking creates excessively tall layers | Phase 2 (layout improvement) | No layer exceeds `maxNodesPerColumn` in secondary direction; configured via option |
| `applySmartViewport` timeout unreliable for large graphs | Phase 1 (foundation) | `fitView` shows all nodes on initial load for 400-node database graph |
| Direction change race condition | Phase 1 (layout foundation) | Rapid direction changes settle to correct final direction without position flash |
| Non-deterministic database colors | Phase 1 (pre-existing bug fix) | Same database always gets same color across five reloads |
| Edge highlight re-render storm | Phase 2 or 3 (performance) | Node click interaction < 100ms with 500+ edges; validated with React Profiler |

---

## Sources

**ELKjs Layout Algorithm and Configuration:**
- [ELK Layout Options Reference](https://eclipse.dev/elk/reference/options.html) — `elk.separateConnectedComponents`, `elk.spacing.componentComponent`, `elk.algorithm: disco`
- [ELK Layered Algorithm Reference](https://eclipse.dev/elk/reference/algorithms/org-eclipse-elk-layered.html) — Sugiyama algorithm phases
- [ELK Separate Connected Components Option](https://eclipse.dev/elk/reference/options/org-eclipse-elk-separateConnectedComponents.html)
- [React Flow Layouting Overview](https://reactflow.dev/learn/layouting/layouting) — ELKjs complexity warning; async requirement; dagre subflow limitations

**React Flow Performance and Node Positioning:**
- [React Flow Performance Guide](https://reactflow.dev/learn/advanced-use/performance) — unnecessary re-renders, memoization strategy, hidden property pattern
- [React Flow initialize→measure→layout→render Discussion #2973](https://github.com/xyflow/xyflow/discussions/2973) — ResizeObserver timing issue, opacity:0 workaround, dimension uncertainty
- [React Flow Layout Issue #991](https://github.com/xyflow/xyflow/issues/991) — layout with dynamic width/height values
- [React Flow Large Node Count Discussion #4975](https://github.com/xyflow/xyflow/discussions/4975) — 80+ nodes with event handlers; CSS class pattern vs style updates
- [React Flow `getNodesBounds` utility](https://reactflow.dev/api-reference/utils/get-nodes-bounds) — official API for bounding box calculation

**Graph Layout Theory:**
- [Topological Sorting - Wikipedia](https://en.wikipedia.org/wiki/Topological_sorting) — O(V+E) standard complexity for Kahn's algorithm
- [Kahn's Algorithm - GeeksforGeeks](https://www.geeksforgeeks.org/dsa/topological-sorting-indegree-based-solution/) — standard O(V+E) implementation without sort inside loop
- [Connected Components Grid Layout](https://cambridge-intelligence.com/layouts/) — grid-based isolated component packing

**Project-Specific Sources (Codebase):**
- `lineage-ui/src/utils/graph/layoutEngine.ts` — `topoQueue.sort()` inside while-loop (Pitfall 1); `separateDatabaseClusters` bounding-box assumption (Pitfall 3); `topoSortDatabases` same sort-per-iteration issue
- `lineage-ui/src/components/domain/LineageGraph/ClusterBackground.tsx` — `calculateClusterBounds` reads `node.measured` from `nodeLookup` (Pitfall 2, Pitfall 4); `padding = 60` constant matches `CLUSTER_BOX_PADDING` in layoutEngine
- `lineage-ui/src/components/domain/LineageGraph/DatabaseLineageGraph.tsx` — calls `layoutGraph` on main thread (Pitfall 5); 150ms `applySmartViewport` timeout (Pitfall 8); `cancelled` boolean ref pattern (Pitfall 9)
- `lineage-ui/src/components/domain/LineageGraph/AllDatabasesLineageGraph.tsx` — `onlyRenderVisibleElements={nodes.length > 30}` (Pitfall 4)
- `lineage-ui/src/components/domain/LineageGraph/hooks/useDatabaseClusters.ts` — color assignment by iteration index (Pitfall 10)
- `lineage-ui/src/components/domain/LineageGraph/hooks/useLayoutWorker.ts` — existing worker infrastructure available for database lineage layout migration
- `lineage-ui/src/utils/graph/disableTransitions.ts` — `TRANSITION_THRESHOLD = 200`; existing mechanism for large-graph animation suppression

---
*Pitfalls research for: Adding mixed layout strategies (hierarchical + grid) to existing ELKjs + React Flow database lineage graph*
*Researched: 2026-02-21*
*Milestone: Database lineage graph layout improvement*
