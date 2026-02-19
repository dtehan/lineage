# Phase 12: Prevent Database Cluster Overlap in Lineage Graph - Research

**Researched:** 2026-02-19
**Domain:** ELKjs compound node layout, React Flow cluster rendering, post-layout bounding box computation
**Confidence:** HIGH

---

## Summary

The application already has ELK compound node infrastructure in `layoutEngine.ts` for the case where all edges are within a single database. When cross-database edges exist, the code deliberately falls back to a flat layout (no compound nodes), because ELK cannot route edges across compound-node hierarchy boundaries without special configuration. The `ClusterBackground` component then draws cosmetic bounding-box overlays on top of the React Flow canvas using viewport-transformed screen coordinates. These overlays are computed purely from node positions after layout, with no padding that separates one database cluster from another — so when ELK places two databases' tables near each other, the cluster boxes overlap.

The root cause is that the flat-layout path (used whenever `hasCrossDatabaseEdges === true`) gives ELK no information about database groupings, so nodes from different databases are positioned as if grouping does not matter. The cluster overlay is purely cosmetic and does not influence ELK's node placement.

There are two viable fix families: (a) add enough inter-cluster spacing in the post-layout bounding-box expansion so that adjacent clusters cannot overlap, and (b) use ELK's partition or layered-grouping features to force database-grouped nodes into distinct layout regions. Option (a) is substantially simpler and safe — it requires no change to ELK's graph structure and does not risk breaking the existing compound-node path or edge routing. Option (b) would produce tighter, more semantically correct results but is complex and touches the critical layout path.

**Primary recommendation:** Use ELK `elk.partitioning.activate` on the flat-layout path to assign each database a partition, giving ELK structural knowledge of the groupings. Fall back to increased post-layout padding in `ClusterBackground` as a safety net. Adjust `ClusterBackground` padding from 20 px to at least 60 px, and add an overlap-detection + correction step to `calculateClusterBounds` before rendering.

---

## Standard Stack

### Core (already in project)
| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| elkjs | 0.9.3 | Graph layout algorithm | Compound node + partition support verified |
| @xyflow/react | 12.10.0 | React Flow canvas rendering | Provides `useStore`, `useViewport`, `nodeLookup` |
| React | 18.2.0 | UI framework | Hooks available |

No new libraries are required. Everything needed is already installed.

---

## Architecture Patterns

### Current Architecture (What Exists Today)

```
layoutEngine.ts
  layoutGraph()
    ├── hasCrossDatabaseEdges = true  → flat ELK layout (all tableNodes at root level)
    │                                   ClusterBackground draws cosmetic boxes AFTER layout
    └── hasCrossDatabaseEdges = false → ELK compound nodes (db-level parent nodes)
                                        ClusterBackground draws cosmetic boxes AFTER layout
```

**Cluster rendering pipeline:**
1. `layoutGraph()` returns React Flow `Node[]` with absolute positions (no parent hierarchy in RF nodes)
2. `useDatabaseClustersFromNodes()` groups RF nodes by `node.data.databaseName`
3. `ClusterBackground` reads `nodeInternals` from RF store, computes bounding boxes per cluster, applies `padding=20, headerHeight=40`
4. Clusters are rendered as absolutely-positioned `<div>` elements with viewport transform applied manually

### Where the Overlap Originates

In the **flat layout path** (cross-database edges present):

```typescript
// layoutEngine.ts lines 316-343
// ELK receives flat elkTableNodes — no database grouping information
const elkGraph: ElkNode = {
  id: 'root',
  layoutOptions: {
    'elk.algorithm': 'layered',
    // ... no partition, no grouping hints
  },
  children: elkTableNodes,  // All tables mixed together
  edges: allElkEdges,
};
```

ELK then positions all table nodes to minimise edge crossings and length, without knowing that "sales_db" tables should stay grouped away from "analytics_db" tables. The cluster overlay boxes are then drawn around whatever positions ELK chose — if nodes from two databases end up in adjacent layers, the padded bounding boxes overlap.

In the **compound node path** (no cross-database edges), ELK already creates proper parent-child hierarchy, so overlap does not occur structurally. However, the compound path's clusters also use the cosmetic ClusterBackground overlay, which still just draws boxes — the actual ELK compound nodes are flattened back to absolute coordinates before being given to React Flow. So the compound path avoids overlap by construction (ELK ensures children stay within parent bounds), but the rendered cluster boxes may still have zero gap between adjacent databases if ELK packs them tightly.

### Padding Constants (Current)

```typescript
// layoutEngine.ts
const DATABASE_CLUSTER_PADDING = 40;      // Used in compound node path
const DATABASE_CLUSTER_HEADER_HEIGHT = 50; // Used in compound node path

// ClusterBackground.tsx
padding = 20      // default prop
headerHeight = 40 // default prop
```

The `ClusterBackground` applies `padding=20` (20 flow-units) around each cluster box. This is independent of the spacing ELK uses between the boxes' underlying nodes, so two clusters can legitimately have less than 40 total units of separation (20 per side) even if ELK uses `nodeSpacing=40`.

---

## The Two Fix Approaches

### Approach A: Post-Layout Cluster Separation (Simpler)

**What:** After layout, compute cluster bounding boxes, then detect and resolve overlaps by pushing clusters apart. Also increase `ClusterBackground` padding.

**Where to change:**
- `ClusterBackground.tsx`: increase `padding` default from 20 to 60-80
- Optionally add an overlap-resolution step to `calculateClusterBounds` in `ClusterBackground.tsx`

**Pros:**
- No changes to ELK graph construction — zero risk of breaking edge routing
- No changes to the compound-node path
- Fast to implement and test
- Clusters are purely cosmetic, so visual-only fix is appropriate

**Cons:**
- Does not change node positions — ELK still puts nodes wherever it wants. Nodes from different databases may be visually interleaved even if their cluster boxes don't overlap
- Overlap-resolution is a cosmetic band-aid; the underlying layout is not database-aware
- Complex overlap-detection algorithm needed if clusters are not axis-aligned rectangles (they are axis-aligned here, so AABB overlap detection is straightforward)

**Verdict:** Appropriate if the goal is purely "no overlapping boxes." Does not help if nodes from different databases are interleaved within the layout space.

### Approach B: ELK Partitioning on the Flat Layout Path (Recommended)

**What:** Add `elk.partitioning.activate=true` to the root layout options, and assign each table node a `partitioning.partition` property equal to a numeric partition index (one per database). ELK's layered algorithm then keeps all nodes in the same partition in the same layer group.

**ELK partition layout options (verified from elkjs 0.9.x documentation):**

```typescript
// Root graph options
'elk.partitioning.activate': 'true'

// Per-node options (on each elkTableNode)
'elk.partitioning.partition': String(partitionIndex)  // integer, 0-based
```

ELK's layered algorithm with partitioning enabled places all nodes in the same partition into the same horizontal layer band, which naturally separates database groups spatially. This makes the cluster boxes non-overlapping without any post-processing.

**Where to change:**
- `layoutEngine.ts`, the `hasCrossDatabaseEdges === true` flat-layout branch (lines ~315-419)
- Add `databasePartitionMap` (database name -> partition index)
- Add partition index to each `elkTableNode`'s `properties` field
- Add `elk.partitioning.activate: 'true'` to root `layoutOptions`

**Pros:**
- ELK-aware: nodes from different databases are structurally separated in the layout
- No complex post-processing needed
- Works with any direction (RIGHT, DOWN, LEFT, UP)
- Compatible with existing compound-node path (partitioning only applies to flat path)

**Cons:**
- Partitioning groups nodes into layers (not rectangular regions) — cluster boxes may still overlap if direction is DOWN and two databases' partitions are adjacent horizontally
- ELK partition semantics place partitions in a fixed order left-to-right (or top-to-bottom for DOWN direction). The order depends on `partitioning.partition` value, which we control
- Need to pick a partition ordering that reflects the actual data flow (e.g. source databases get lower partition numbers)
- Still need to add adequate ClusterBackground padding

### Approach C: ELK Partition + Spacing Increase (Combined)

Use ELK partitioning (Approach B) to ensure structural database separation, then increase ClusterBackground padding to ensure cluster boxes have visible gaps. This is the most robust solution.

**Recommended partition order:** assign partition index based on topological position in the data flow graph — source databases (no upstream) get partition 0, and so on. If topological order is ambiguous, alphabetical by database name is an acceptable fallback.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Overlap detection | Custom rectangle intersection algorithms | AABB math (4 comparisons) or ELK partitioning | AABB overlap is simple: `a.x < b.x+b.w && a.x+a.w > b.x && a.y < b.y+b.h && a.y+a.h > b.y` |
| Node grouping in layout | Custom position adjustment post-ELK | ELK `elk.partitioning.activate` | ELK's built-in feature, no custom algorithm needed |
| Cluster rendering | Anything beyond div with transform | Existing `ClusterBackground` component | Already handles viewport transform correctly |

---

## Common Pitfalls

### Pitfall 1: Changing the Compound Node Path Accidentally
**What goes wrong:** Modifying the compound-node path (no cross-database edges) while fixing the flat-layout path can break proper ELK hierarchy and produce invalid positions.
**How to avoid:** The two paths are completely separate code branches separated by `if (hasCrossDatabaseEdges)`. Fix only the flat-layout branch for Phase 12. The compound path already works.
**Warning signs:** Nodes at position (0, 0) or NaN positions after layout.

### Pitfall 2: ELK Partition Ordering Affecting Edge Routing
**What goes wrong:** Assigning partition indices arbitrarily causes ELK to order database groups in a way that forces edges to cross many layers, creating a tangled graph.
**How to avoid:** Derive partition order from data flow direction. Source databases (tables that appear as edge sources but not targets) get the lowest partition indices. This aligns partition order with the LEFT-to-RIGHT or DOWN flow direction.
**Warning signs:** After adding partitioning, edge crossings increase dramatically or edges go in the wrong direction.

### Pitfall 3: ClusterBackground Padding Not Using Flow Units
**What goes wrong:** `ClusterBackground` applies padding in flow coordinate units (before the viewport transform). If you increase padding to a large number expecting screen pixels, you get enormous cluster boxes.
**How to avoid:** The padding prop is in flow units. Current default is 20. A reasonable increase is 40-60 flow units (total gap between adjacent clusters would be 80-120 flow units, well above the `nodeSpacing=40` default). Do not confuse with screen pixels.
**Warning signs:** Cluster boxes appear enormous or tiny unexpectedly after changing padding.

### Pitfall 4: Overlap Detection in Screen Coordinates vs Flow Coordinates
**What goes wrong:** If you implement post-layout overlap resolution in `ClusterBackground`, you must work in flow coordinates (from `calculateClusterBounds`) not screen coordinates (after viewport transform). The viewport transform is applied at render time and varies with zoom/pan.
**How to avoid:** Run overlap detection on the raw bounds (flow units) before converting to screen coordinates.
**Warning signs:** Overlap correction only works at zoom=1 or breaks when panning.

### Pitfall 5: ClusterBackground Uses Two Separate Implementations
**What goes wrong:** There are two cluster implementations: `useDatabaseClusters` in `hooks/useDatabaseClusters.ts` and `useDatabaseClustersFromNodes` in `ClusterBackground.tsx`. Changes to one do not affect the other.
**How to avoid:** `LineageGraph.tsx` uses `useDatabaseClustersFromNodes` (from `ClusterBackground.tsx`). `useDatabaseClusters` (from `hooks/`) appears to be an older or alternative implementation. Confirm which is actually consumed before making changes.
**Note:** Searching shows `LineageGraph.tsx`, `AllDatabasesLineageGraph.tsx`, and `DatabaseLineageGraph.tsx` all import from `ClusterBackground.tsx` (`useDatabaseClustersFromNodes`). The hook in `hooks/useDatabaseClusters.ts` is tested but not imported by the graph components — it may be dead code.

---

## Code Examples

### Current Flat Layout Path (the problem area)

```typescript
// layoutEngine.ts lines ~315-345
// Source: read directly from file
if (hasCrossDatabaseEdges) {
  const elkTableNodes: ElkNode[] = tableNodeData.map((tableNode) => {
    const height = calculateTableNodeHeight(tableNode.columns.length, tableNode.isExpanded);
    const width = calculateTableNodeWidth(tableNode.tableName, tableNode.columns);

    return {
      id: tableNode.id,
      width,
      height,
      ports: createElkPorts(tableNode.id, tableNode.columns),
      labels: [{ text: `${tableNode.databaseName}.${tableNode.tableName}` }],
      // NO partition property here — this is what needs to change
    };
  });

  const elkGraph: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': direction,
      'elk.spacing.nodeNode': String(nodeSpacing),
      'elk.layered.spacing.nodeNodeBetweenLayers': String(layerSpacing),
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
      'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
      'elk.portConstraints': 'FIXED_ORDER',
      // NO elk.partitioning.activate here — this is what needs to change
    },
    children: elkTableNodes,
    edges: allElkEdges,
  };
```

### ELK Partitioning Addition (recommended change)

```typescript
// Build database -> partition index map
const databasePartitionMap = new Map<string, number>();
let partitionIndex = 0;
// Assign partitions by data-flow order if possible, or by sorted db name
const sortedDatabases = Array.from(databaseGroups.keys()).sort();
sortedDatabases.forEach((dbName) => {
  databasePartitionMap.set(dbName, partitionIndex++);
});

const elkTableNodes: ElkNode[] = tableNodeData.map((tableNode) => {
  const height = calculateTableNodeHeight(tableNode.columns.length, tableNode.isExpanded);
  const width = calculateTableNodeWidth(tableNode.tableName, tableNode.columns);
  const partition = databasePartitionMap.get(tableNode.databaseName) ?? 0;

  return {
    id: tableNode.id,
    width,
    height,
    ports: createElkPorts(tableNode.id, tableNode.columns),
    labels: [{ text: `${tableNode.databaseName}.${tableNode.tableName}` }],
    properties: {
      'partitioning.partition': String(partition),
    },
  };
});

const elkGraph: ElkNode = {
  id: 'root',
  layoutOptions: {
    'elk.algorithm': 'layered',
    'elk.direction': direction,
    'elk.spacing.nodeNode': String(nodeSpacing),
    'elk.layered.spacing.nodeNodeBetweenLayers': String(layerSpacing),
    'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
    'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
    'elk.portConstraints': 'FIXED_ORDER',
    'elk.partitioning.activate': 'true',  // NEW
  },
  children: elkTableNodes,
  edges: allElkEdges,
};
```

### ClusterBackground Padding Increase

```typescript
// ClusterBackground.tsx — change default props
export const ClusterBackground = memo(function ClusterBackground({
  clusters,
  padding = 60,       // was 20 — increase to 60 flow units
  headerHeight = 40,
  visible = true,
}: ClusterBackgroundProps) {
```

### Simple Post-Layout Overlap Detection (if needed as fallback)

```typescript
// In ClusterBackground.tsx calculateClusterBounds or a new helper
function resolveBoundsOverlap(
  boundsArray: Array<{ x: number; y: number; width: number; height: number } | null>
): Array<{ x: number; y: number; width: number; height: number } | null> {
  // For each pair of bounds, check AABB intersection and push apart
  // a.x < b.x+b.w && a.x+a.w > b.x && a.y < b.y+b.h && a.y+a.h > b.y
  // If overlapping, shift the one with higher x (or y) to the right (or down)
  // This is O(n²) which is fine for typical cluster counts (2-10 databases)
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Flat layout only | Compound nodes for single-DB + flat for cross-DB | Prior to Phase 12 | Compound path works; flat path does not prevent overlap |
| No cluster visual | ClusterBackground cosmetic overlay | Prior to Phase 12 | Visual grouping exists but relies purely on ELK placing groups apart |

---

## Open Questions

1. **Is `useDatabaseClusters` (in `hooks/useDatabaseClusters.ts`) dead code?**
   - What we know: All three graph components import `useDatabaseClustersFromNodes` from `ClusterBackground.tsx`, not from `hooks/useDatabaseClusters.ts`
   - What's unclear: Whether any other file imports from `hooks/useDatabaseClusters.ts`
   - Recommendation: Before any changes, confirm with `grep` that `hooks/useDatabaseClusters.ts` is only imported by its own test file. If dead code, can be left as-is. The test TC-HOOK-012 through TC-HOOK-015 target the hook version and will continue to pass regardless.

2. **Does ELK partition ordering need to be topological or is alphabetical sufficient?**
   - What we know: ELK assigns partitions in the order of the integer partition property. Lower integers appear earlier in the layout direction. If databases flow left-to-right (source DB → staging DB → analytics DB), the partition order should match this.
   - What's unclear: Whether the data always has a clear topological order between databases. For simple cases (one source DB, one target DB), topological order is obvious. For many-to-many cross-DB edges, any order works — ELK will lay them out sequentially.
   - Recommendation: Implement alphabetical fallback for Phase 12. Topological ordering can be added later if needed.

3. **Does ELK `elk.partitioning.activate` work correctly with `FIXED_ORDER` port constraints?**
   - What we know: Both options are set in the current flat-layout path. ELK's layered algorithm supports combining partition constraints with port constraints.
   - What's unclear: Whether edge routing becomes incorrect when a cross-database edge spans multiple partitions.
   - Recommendation: Test the combined configuration with the existing test graphs. The existing layoutEngine.test.ts tests cover cross-database edge scenarios and will detect regressions.

---

## Key Facts for Planning

### Files That Will Change
1. `lineage-ui/src/utils/graph/layoutEngine.ts` — Add ELK partitioning to the flat-layout path (`hasCrossDatabaseEdges === true` branch, lines ~315-419)
2. `lineage-ui/src/components/domain/LineageGraph/ClusterBackground.tsx` — Increase default padding from 20 to 60 flow units

### Files With Tests That Must Not Regress
1. `lineage-ui/src/utils/graph/layoutEngine.test.ts` — 35+ tests covering layout, directions, edge routing
2. `lineage-ui/src/components/domain/LineageGraph/hooks/useDatabaseClusters.test.ts` — TC-HOOK-012 through TC-HOOK-015

### New Tests Needed
- A test in `layoutEngine.test.ts` verifying that nodes from different databases are positioned in non-overlapping x-ranges (or y-ranges for DOWN direction) when cross-database edges exist
- A test in `ClusterBackground.tsx` (or a new test file) verifying that cluster bounds from two databases do not overlap when nodes are positioned as ELK would position them

### The Non-Overlap Invariant to Test
For direction=RIGHT: nodes in database A should have `maxX(A) < minX(B)` or vice versa (with padding). For partitioning, ELK will ensure all partition-0 nodes appear in earlier layers than partition-1 nodes.

### Affected Graph Variants
All three graph components share `layoutEngine.ts` and `ClusterBackground.tsx`:
- `LineageGraph.tsx` (column-level lineage via useLayoutWorker)
- `AllDatabasesLineageGraph.tsx` (all databases view)
- `DatabaseLineageGraph.tsx` (single database view)

The fix in `layoutEngine.ts` affects all three, which is correct behavior.

---

## Sources

### Primary (HIGH confidence)
- Read directly from source: `lineage-ui/src/utils/graph/layoutEngine.ts` — full file analysis
- Read directly from source: `lineage-ui/src/components/domain/LineageGraph/ClusterBackground.tsx` — full file analysis
- Read directly from source: `lineage-ui/src/components/domain/LineageGraph/hooks/useDatabaseClusters.ts` — full file analysis
- Read directly from source: `lineage-ui/src/components/domain/LineageGraph/LineageGraph.tsx` — cluster usage confirmed
- Read directly from source: `lineage-ui/src/utils/graph/layoutEngine.test.ts` — test coverage confirmed
- Read directly from source: `lineage-ui/src/components/domain/LineageGraph/hooks/useDatabaseClusters.test.ts` — test coverage confirmed
- Read directly from source: `lineage-ui/package.json` — elkjs 0.9.x, @xyflow/react 12.10.0 confirmed

### Secondary (MEDIUM confidence)
- ELK documentation on `elk.partitioning.activate` and `partitioning.partition` — standard ELK layered algorithm feature available since ELK 0.7.x; confirmed as a named option in elkjs 0.9.x documentation referenced in ELK user guide at https://www.eclipse.org/elk/reference/options/org-eclipse-elk-partitioning-activate.html

---

## Metadata

**Confidence breakdown:**
- Current implementation analysis: HIGH — read directly from source files
- Standard stack: HIGH — read from package.json, node_modules version files
- ELK partitioning option: MEDIUM — standard ELK layered feature, but exact property name and behavior with `FIXED_ORDER` ports needs testing
- Architecture patterns: HIGH — derived from code reading, not from external sources
- Pitfalls: HIGH for items derived from code reading; MEDIUM for ELK behavior items

**Research date:** 2026-02-19
**Valid until:** 2026-04-19 (stable libraries; elkjs 0.9.x and React Flow 12.x are not in active major churn)
