# Technology Stack: Database Lineage Graph Layout Fix

**Project:** Lineage — Column-Level Data Lineage for Teradata
**Milestone:** Fix database-level graph layout (connected components flow left-to-right; disconnected components arrange in compact grid)
**Researched:** 2026-02-21
**Confidence:** HIGH for ELKjs options, HIGH for "no new dependencies" conclusion

---

## Context

This research covers ONLY what is needed for the database lineage layout fix milestone. The following are already validated and are NOT re-researched here:

- React Flow (@xyflow/react ^12.0.0) — graph rendering
- ELKjs 0.9.3 (via elkjs ^0.9.0) — layout algorithm library
- Comlink ^4.4.2 — Web Worker communication
- Custom topological layout in `layoutGraph()` — handles column/table lineage correctly
- `layoutSimpleNodes()` in `layoutEngine.ts` — the fallback path used by database-level graphs (table nodes without columns)
- `topoSortDatabases()` + `separateDatabaseClusters()` — post-layout cluster separation (used in column/table lineage, NOT yet applied to database-level graphs)

**Problem being solved:** When `DatabaseLineageGraph` or `AllDatabasesLineageGraph` renders, the API returns table-type nodes (not column nodes). `layoutGraph()` detects zero column groups and falls back to `layoutSimpleNodes()`. That fallback calls ELK's `layered` algorithm but does not set `separateConnectedComponents` or handle disconnected components — so all disconnected tables stack into a single vertical column, which looks broken.

**Two sub-problems:**
1. Connected tables (with lineage edges between them) should flow left-to-right in topological order
2. Disconnected tables (no edges to other tables in the graph) should arrange in a compact grid, not a vertical single column

---

## Recommended Approach: ELKjs Options Only — No New Dependencies

**Verdict: Zero new npm packages needed.** ELKjs 0.9.3 (already installed) has all required capabilities. The fix is configuration of existing ELK options inside `layoutSimpleNodes()`.

---

## ELKjs Algorithm Options for This Problem

### Option Set 1: Connected Component Layout (layered algorithm + separateConnectedComponents)

The ELK `layered` algorithm already handles the left-to-right hierarchical flow correctly when nodes are connected. The missing option is `separateConnectedComponents`, which causes ELK to treat each disconnected subgraph independently before packing them together.

| ELK Option Key | Value | Purpose | Source |
|----------------|-------|---------|--------|
| `elk.algorithm` | `'layered'` | Hierarchical layout, already in use | HIGH — official ELK docs |
| `elk.direction` | `'RIGHT'` | Left-to-right flow direction, already in use | HIGH — official ELK docs |
| `elk.separateConnectedComponents` | `'true'` | Layout each disconnected subgraph independently before arranging them | HIGH — eclipse.dev/elk/reference/options |
| `elk.spacing.componentComponent` | `'80'` | Gap between disconnected components after layout. Default is 20px — too tight for table node cards | HIGH — eclipse.dev/elk/reference/options |
| `elk.layered.spacing.nodeNodeBetweenLayers` | `'100'` | Horizontal gap between layers (upstream/downstream separation). Already in use | HIGH — ELK layered reference |
| `elk.spacing.nodeNode` | `'40'` | Vertical gap between nodes within the same layer. Already in use | HIGH — ELK layered reference |
| `elk.layered.crossingMinimization.strategy` | `'LAYER_SWEEP'` | Reduce edge crossings. Already in use | HIGH — ELK layered reference |
| `elk.layered.nodePlacement.strategy` | `'NETWORK_SIMPLEX'` | Better vertical node positioning. Already in use | HIGH — ELK layered reference |
| `elk.aspectRatio` | `'1.7'` | Guides component packing arrangement toward a landscape (wide) shape rather than a tall column. 1.7 ≈ 16:9 ratio | MEDIUM — eclipse.dev/elk/reference/options/org-eclipse-elk-aspectRatio |

**What `separateConnectedComponents: true` does:**
ELK first computes a layout for each connected subgraph independently (each subgraph gets its own left-to-right layered arrangement), then packs all subgraphs into the canvas using the `spacing.componentComponent` gap. The `aspectRatio` hint guides how they pack — wider values push toward horizontal rows of component groups rather than a single vertical column.

**What this fixes without any new dependencies:**
- Isolated tables (zero edges) each become a 1-node component, packed into a grid-like arrangement
- Connected tables flow left-to-right in correct topological order within each component
- Cross-component gaps are controlled by `spacing.componentComponent`

### Option Set 2: Aspect Ratio to Control Grid Shape

The `elk.aspectRatio` option (type: Double, greater than 0) is supported by ELK Layered, Box, DisCo, and other algorithms. When `separateConnectedComponents` is true, ELK uses the aspect ratio hint to decide how to arrange the packed components. Setting it to approximately 1.7 (widescreen) avoids the single-column stacking problem.

This is a hint, not a hard constraint. ELK will try to produce a layout close to this ratio. Confidence is MEDIUM because the exact behavior with `separateConnectedComponents` was not directly tested — it is documented but the interaction is inferred from the ELK option documentation.

---

## Alternative ELK Algorithms Considered and Rejected

### DisCo Algorithm (`org.eclipse.elk.disco`)

ELK DisCo is specifically designed for "arranging unconnected subgraphs." It uses polyomino-based packing. Its key option `elk.disco.componentCompaction.componentLayoutAlgorithm` lets you specify a secondary algorithm (e.g., `layered`) to apply inside each component.

**Why not DisCo:** DisCo is designed for graphs where ALL components are disconnected. In the database lineage view, some tables are connected (they have lineage edges between them) and some are isolated. Using DisCo with `componentLayoutAlgorithm: 'layered'` works in theory, but the `layered` algorithm has already proven to hang on dense column-level graphs in this codebase (see `layoutEngine.ts` comment: "Replaces ELK which hangs indefinitely on dense column-level graphs"). Even though database-level graphs are simpler (fewer nodes, table-level edges only), the risk of the same hang on a large real Teradata database with hundreds of tables is not justified. The `layered + separateConnectedComponents` path is safer because it uses the same algorithm that already works for the `layoutSimpleNodes()` fallback.

**Confidence:** MEDIUM — DisCo would likely work at this node count (tens to low hundreds of tables), but it is untested in this codebase and adds an algorithm switch that complicates future maintenance.

### Box Algorithm (`org.eclipse.elk.box`)

ELK Box "packs unconnected boxes." It does not route edges or respect directionality. It would arrange all tables as a compact grid but would lose all left-to-right topological ordering for connected tables.

**Why not Box:** The database lineage view has edges between tables. Box ignores edges entirely. It would show a compact grid but with edges drawn as chaos across the grid. Worse than the current single-column layout for understanding lineage.

### Stress / Force (`org.eclipse.elk.stress`, `org.eclipse.elk.force`)

Force-directed layouts create organic blob arrangements. They do not enforce left-to-right directionality and produce non-deterministic results. Not appropriate for a directed acyclic graph representing data flow.

---

## Exact Configuration: What to Change in `layoutSimpleNodes()`

The fix is a targeted change to the `layoutOptions` object inside `layoutSimpleNodes()` in `/Users/Daniel.Tehan/Code/lineage/lineage-ui/src/utils/graph/layoutEngine.ts`.

**Current configuration (lines 619–631):**
```typescript
const elkGraph: ElkNode = {
  id: 'root',
  layoutOptions: {
    'elk.algorithm': 'layered',
    'elk.direction': direction,
    'elk.spacing.nodeNode': String(nodeSpacing),
    'elk.layered.spacing.nodeNodeBetweenLayers': String(layerSpacing),
    'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
    'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
  },
  children: elkNodes,
  edges: elkEdges,
};
```

**Recommended configuration:**
```typescript
const elkGraph: ElkNode = {
  id: 'root',
  layoutOptions: {
    'elk.algorithm': 'layered',
    'elk.direction': direction,
    'elk.separateConnectedComponents': 'true',
    'elk.spacing.componentComponent': '80',
    'elk.aspectRatio': '1.7',
    'elk.spacing.nodeNode': String(nodeSpacing),
    'elk.layered.spacing.nodeNodeBetweenLayers': String(layerSpacing),
    'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
    'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
  },
  children: elkNodes,
  edges: elkEdges,
};
```

**Three options added:**
1. `elk.separateConnectedComponents: 'true'` — the core fix for disconnected table layout
2. `elk.spacing.componentComponent: '80'` — adequate gap between clusters (default 20px is too tight for table node cards which are 280–400px wide)
3. `elk.aspectRatio: '1.7'` — guides packing toward widescreen rather than tall column

All ELK option values must be passed as strings in the JavaScript API.

---

## ELKjs Timeout Risk Assessment

The existing `layoutGraph()` abandoned ELK for column/table lineage because it "hangs indefinitely on dense column-level graphs." That was a graph with potentially thousands of column nodes and thousands of edges.

The `layoutSimpleNodes()` path used by database lineage operates at the table level: tens to low hundreds of tables, with table-level edges (far fewer than column-level). ELK `layered` at this scale does not hang. The `layoutSimpleNodes()` function already calls ELK successfully today — the only issue is the single-column layout artifact. Adding `separateConnectedComponents` does not increase layout computation time meaningfully at this node count.

**Risk: LOW.** No timeout mitigation needed for this configuration change.

---

## What NOT to Add

| Avoid | Why | Instead |
|-------|-----|---------|
| `@elkg/layout-options` or any ELK option helper library | Does not exist as a standard package; option keys are passed as plain strings | Pass options as string key-value pairs directly |
| dagre / @dagrejs/dagre | Dagre was EOL/unmaintained as of 2023. This codebase uses ELKjs intentionally. Adding dagre adds a second layout dependency with lower capability | Use ELK layered algorithm with proper options |
| d3-dag | Adds D3 as a layout dependency alongside ELK. No benefit for this specific fix | Extend existing ELKjs configuration |
| A separate grid layout implementation | The custom topological layout in `layoutGraph()` has ~100 lines of bespoke positioning code. Duplicating that pattern for the disconnected case is unnecessary when ELK handles it natively | `elk.separateConnectedComponents` in `layoutSimpleNodes()` |
| DisCo algorithm for all database graphs | Untested in this codebase; risk of hang on large graphs; maintenance overhead of switching algorithms per view | `layered + separateConnectedComponents` handles both cases |

---

## Integration with Existing Architecture

### Where the Fix Lives

Single file, single function:
- File: `/Users/Daniel.Tehan/Code/lineage/lineage-ui/src/utils/graph/layoutEngine.ts`
- Function: `layoutSimpleNodes()` (lines 583–707)
- Change: Add 3 ELK options to the `layoutOptions` object

No changes needed to:
- `DatabaseLineageGraph.tsx` — calls `layoutGraph()` which delegates to `layoutSimpleNodes()`
- `AllDatabasesLineageGraph.tsx` — same
- `layout.worker.ts` — the Web Worker wraps `layoutGraph()`, no change needed
- `ClusterBackground.tsx` — reads node positions from React Flow store after layout, not affected
- `topoSortDatabases()` / `separateDatabaseClusters()` — these already exist and work; they're called for multi-database column lineage. They are NOT called for database-level graphs (the `layoutSimpleNodes()` path has no post-layout cluster separation). If post-layout cluster separation is still needed after the ELK fix, it can be added — but the `separateConnectedComponents` option should handle component separation sufficiently.

### ELKjs Web Worker Compatibility

`layoutSimpleNodes()` is called inside the Web Worker via `layout.worker.ts` → `layoutGraph()`. The ELK options change is pure configuration — no new imports, no new Worker messages, no new Comlink types. The Worker path is fully compatible.

### Test Impact

The existing test suite in `layoutEngine.test.ts` covers `layoutGraph()` with column nodes. The `layoutSimpleNodes()` path is tested indirectly when table/database nodes are passed (see "assigns databaseNode type for database nodes in fallback" test). Adding tests for the multi-component arrangement would be valuable — specifically:
- Table nodes with no edges should be positioned without vertical single-column stacking
- Table nodes with edges should flow left-to-right (existing tests already cover this via `layoutGraph()` — but `layoutSimpleNodes()` has no equivalent test for direction ordering)

---

## Version Compatibility

| Package | Installed | Notes |
|---------|-----------|-------|
| elkjs | 0.9.3 | `separateConnectedComponents`, `spacing.componentComponent`, and `aspectRatio` are all core ELK options supported since ELK 0.7.x. No version bump needed. |
| @xyflow/react | ^12.0.0 | No changes to React Flow usage. |
| comlink | ^4.4.2 | No changes to Worker communication. |

---

## Installation

No new packages. Zero `npm install` required.

---

## Alternatives Considered

| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| ELK `layered` + `separateConnectedComponents: true` | ELK `disco` with `componentLayoutAlgorithm: layered` | DisCo is designed for fully-disconnected graphs; in this codebase ELK has a history of hanging on complex graphs; `layered + separateConnectedComponents` reuses the same proven algorithm path |
| ELK `layered` + `separateConnectedComponents: true` | ELK `box` | Box ignores edges — produces compact grid but loses all directional left-to-right ordering |
| `elk.aspectRatio: '1.7'` hint for grid shape | Custom post-layout grid rearrangement | ELK handles it natively; custom code adds maintenance burden and is fragile to graph size changes |
| Tune `spacing.componentComponent: '80'` | Leave at default 20px | 20px is insufficient for table node cards (280–400px wide); components would visually merge |

---

## Confidence Assessment

| Claim | Confidence | Basis |
|-------|------------|-------|
| `separateConnectedComponents` fixes disconnected-table vertical stacking | HIGH | Official ELK option documentation; option is specifically described as treating disconnected subgraphs independently |
| `spacing.componentComponent` controls inter-component gap when `separateConnectedComponents` is true | HIGH | Official ELK option docs explicitly state "only relevant if separateConnectedComponents is activated" |
| `aspectRatio: 1.7` guides packing toward widescreen | MEDIUM | Official ELK docs describe it as a hint for overall proportions; exact interaction with `separateConnectedComponents` packing is inferred from documentation, not tested in this codebase |
| ELK will not hang at database-level node counts (tens to low hundreds of tables) | HIGH | Current `layoutSimpleNodes()` already calls ELK successfully; hang issue was specific to thousands of column nodes |
| No new npm packages needed | HIGH | All required ELK algorithms and options are in the already-installed elkjs 0.9.3 |
| DisCo algorithm would work for this use case | MEDIUM | DisCo is documented for this purpose; untested in this codebase; risk profile is higher than using already-working `layered` algorithm |

---

## Sources

- [ELK Layered Algorithm Reference — eclipse.dev](https://eclipse.dev/elk/reference/algorithms/org-eclipse-elk-layered.html) — layered algorithm options (HIGH confidence)
- [ELK separateConnectedComponents Option — eclipse.dev](https://eclipse.dev/elk/reference/options/org-eclipse-elk-separateConnectedComponents.html) — option behavior true vs false (HIGH confidence)
- [ELK spacing.componentComponent Option — eclipse.dev](https://eclipse.dev/elk/reference/options/org-eclipse-elk-spacing-componentComponent.html) — default 20px, only active with separateConnectedComponents (HIGH confidence)
- [ELK aspectRatio Option — eclipse.dev](https://eclipse.dev/elk/reference/options/org-eclipse-elk-aspectRatio.html) — Double, width/height quotient, supported by layered (MEDIUM confidence for interaction with component packing)
- [ELK DisCo Algorithm Reference — eclipse.dev](https://eclipse.dev/elk/reference/algorithms/org-eclipse-elk-disco.html) — DisCo purpose and options (HIGH confidence for description; MEDIUM confidence for suitability in this codebase)
- [ELK Box Algorithm Reference — eclipse.dev](https://eclipse.dev/elk/reference/algorithms/org-eclipse-elk-box.html) — Box algorithm for edge-free graphs (HIGH confidence)
- [ELK Options Reference Index — eclipse.dev](https://eclipse.dev/elk/reference/options.html) — full options list (HIGH confidence)
- [elkjs GitHub — kieler/elkjs](https://github.com/kieler/elkjs) — confirms included algorithms: layered, stress, mrtree, radial, force, disco (HIGH confidence)
- [elkjs npm — installed version 0.9.3](https://www.npmjs.com/package/elkjs) — version confirmed via `npm list elkjs` in this repository (HIGH confidence)
- [layoutEngine.ts — existing codebase](https://github.com) — analysis of `layoutSimpleNodes()` current options and `layoutGraph()` ELK hang comment (HIGH confidence — first-party)
- [considerModelOrder.components ELK option — eclipse.dev](https://eclipse.dev/elk/reference/options/org-eclipse-elk-layered-considerModelOrder-components.html) — component ordering strategies (HIGH confidence; not needed for this fix but documents available ordering customization)

---

*Stack research for: Database lineage graph layout fix — connected left-to-right, disconnected compact grid*
*Researched: 2026-02-21*
*Confidence: HIGH for core approach (ELKjs options only, no new packages). MEDIUM for aspectRatio interaction with component packing.*
