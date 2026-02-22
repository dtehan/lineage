# Phase 21: UX Polish - Research

**Researched:** 2026-02-21
**Domain:** React UI state management, React Flow graph overlay, Zustand store extension, Tailwind CSS
**Confidence:** HIGH

## Summary

Phase 21 is a pure frontend UX polish pass on top of the two-zone layout built in Phase 20. All three requirements are in the UI layer only — no backend changes are needed, no new libraries are required, and nothing about the layout algorithm changes. The phase ships one plan (21-01) covering three tightly coupled features: a section label overlay for the isolated grid zone, a toolbar toggle to hide/show isolated tables, and an isolated table count badge in the database-level header.

The key architectural question is where isolated-table count data comes from. The `detectConnectedComponents` function in `layoutEngine.ts` already computes the isolated set during layout. The label and toggle need that count at render time — either by re-running detection on the rendered React Flow nodes (O(V+E) but fast), or by surfacing it out of the layout result and storing it. The correct pattern is to extract the count from the layout result and store it in `useUIStore`, keeping concerns separated. The toggle state also belongs in `useUIStore` because it is a display preference, not a lineage data concept, and `useUIStore` already holds sidebar and searchQuery display preferences.

The section label is a positioned overlay element rendered inside the React Flow `<ReactFlow>` wrapper — not a React Flow node. It uses the same coordinate system as React Flow nodes, which means it must be positioned using React Flow's viewport transform (`useReactFlow().getViewport()`) or placed as a sibling `<div>` outside the flow canvas with fixed pixel coordinates. The simplest correct approach is a `<Panel>` component from `@xyflow/react` placed with a known y-offset derived from the connected-section bottom — but `<Panel>` is viewport-pinned, not canvas-pinned. The correct approach is to render a React Flow **node** of a custom type (`sectionLabelNode`) at the computed position, or to render a `<div>` with absolute CSS that reacts to the React Flow viewport transform. The cleanest, most maintainable approach for this project is a custom React Flow node type (`sectionLabelNode`) that is included in the node list returned from layout — it renders as a non-interactive label strip.

**Primary recommendation:** Add `isolatedTableCount` and `hideIsolatedTables` to `useUIStore`. Surface isolated count from `layoutGraph` result metadata. Render the section label as a custom `sectionLabelNode` React Flow node type positioned at the grid zone start. Add hide toggle to `Toolbar` as a boolean prop/callback.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Zustand | ^4.4.0 | Global UI state | Already used for sidebarOpen, searchQuery — the right store for display prefs |
| @xyflow/react | ^12.0.0 | Graph canvas and node types | Already in use; custom node type is the standard way to add non-data UI elements to the canvas |
| lucide-react | ^0.300.0 | Icons | Already used across all toolbar buttons |
| Tailwind CSS | ^3.4.0 | Styling | Already used everywhere; no custom CSS needed |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Vitest + @testing-library/react | ^1.1.0 | Unit tests | Every new component and store addition must have tests |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom `sectionLabelNode` React Flow node | Absolute-positioned `<div>` synchronized to viewport transform | Custom node is simpler — no need to listen to viewport pan/zoom events; RF handles transform automatically |
| `useUIStore` for toggle state | Local component state in `DatabaseLineageGraph` | Store allows toggle to persist across direction/depth changes; survives re-renders |
| Surfacing count from layout result | Re-running `detectConnectedComponents` in the component | Layout already computes it; re-running wastes CPU and creates a second source of truth |

**Installation:** No new packages required.

## Architecture Patterns

### Recommended Project Structure

No new files are needed. All changes are in existing files:

```
lineage-ui/src/
├── stores/
│   └── useUIStore.ts               # Add: isolatedTableCount, hideIsolatedTables, setters
├── utils/graph/
│   └── layoutEngine.ts             # Add: isolatedCount to LayoutResult
├── components/domain/LineageGraph/
│   ├── DatabaseLineageGraph.tsx    # Add: sectionLabelNode type, hide filter, header count display
│   ├── Toolbar.tsx                 # Add: hideIsolatedTables prop + toggle button
│   └── Toolbar.test.tsx            # Add: tests for new toggle
└── (test files alongside each modified file)
```

### Pattern 1: Extending LayoutResult to Surface Isolated Count

**What:** Add `isolatedCount` to the `LayoutResult` type returned by `layoutGraph`. The function already computes `isolated.length` internally — it just needs to be returned.

**When to use:** Whenever the layout has side-channel information that callers need without re-computing.

**Example:**
```typescript
// layoutEngine.ts — extend existing LayoutResult interface
export interface LayoutResult {
  nodes: Node[];
  edges: Edge[];
  metrics?: LayoutMetrics;
  isolatedCount: number;        // NEW: number of isolated (disconnected) tables
  connectedCount: number;       // NEW: number of tables in connected components
}

// Inside layoutGraph(), at the return statement, the isolated array is already computed:
return {
  nodes: finalNodes,
  edges: layoutedEdges,
  metrics,
  isolatedCount: isolated.length,                  // from detectConnectedComponents result
  connectedCount: allTableIds.length - isolated.length,
};
```

Note: `layoutSimpleNodes` (ELK fallback path) does not run `detectConnectedComponents`, so it should return `isolatedCount: 0, connectedCount: nodes.length` or compute a reasonable default.

### Pattern 2: Storing Display Preference in useUIStore

**What:** Add `hideIsolatedTables` boolean and `isolatedTableCount` number to `useUIStore`. This is a display preference, not lineage data.

**When to use:** When a UI setting needs to persist across re-renders without being owned by a specific component.

**Example:**
```typescript
// useUIStore.ts — extend existing interface
interface UIState {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;

  // NEW for Phase 21
  hideIsolatedTables: boolean;
  toggleHideIsolatedTables: () => void;
  isolatedTableCount: number;
  setIsolatedTableCount: (count: number) => void;
  connectedTableCount: number;
  setConnectedTableCount: (count: number) => void;
}
```

The counts are written by `DatabaseLineageGraph` after layout completes (similar to how `setGraph` is called in `LineageGraph.tsx`). The toggle is read by both `Toolbar` and `DatabaseLineageGraph`.

### Pattern 3: Custom React Flow Node Type for Section Label

**What:** A non-interactive label node rendered at the start of the isolated grid zone. It is a React Flow node with `type: 'sectionLabelNode'` and `position` set to the grid zone's top-left corner. The label text includes the count: "Tables without lineage connections (N)".

**When to use:** When a visual element must be positioned in React Flow canvas-space (moves with pan/zoom) rather than viewport-space.

**Example:**
```typescript
// In DatabaseLineageGraph.tsx, after layout completes and isolated.length > 0:
// The layoutGraph result includes isolatedCount > 0.
// Insert a label node at the position of the first isolated table, offset upward by ~24px.

const labelNode: Node = {
  id: '__isolated-section-label__',
  type: 'sectionLabelNode',
  position: { x: firstIsolatedGridX, y: gridStartY - 32 },
  data: { count: isolatedCount },
  draggable: false,
  selectable: false,
  focusable: false,
};
```

The `sectionLabelNode` component renders a simple styled `<div>`:
```tsx
function SectionLabelNode({ data }: { data: { count: number } }) {
  return (
    <div className="px-3 py-1 text-sm font-medium text-slate-500 bg-slate-50 border border-slate-200 rounded-lg whitespace-nowrap pointer-events-none select-none">
      Tables without lineage connections ({data.count})
    </div>
  );
}
```

Key points:
- `draggable: false, selectable: false, focusable: false` prevent user interaction
- `pointer-events-none` in CSS ensures clicks pass through to the canvas
- No handles are needed (no edges connect to this node)
- Width is auto-sized by content; no fixed width required
- The node must be added to the `nodeTypes` map: `sectionLabelNode: SectionLabelNode`

### Pattern 4: Grid-Start Position for Label Placement

**What:** The section label needs to be positioned at the top of the isolated grid zone. Phase 20's `layoutGraph` puts isolated tables at `startSecondary = componentSecondaryOffset + gridGap` for the y-coordinate in a RIGHT-direction layout. The label goes just above this.

**When to use:** When you need the position of the isolated zone boundary.

The cleanest approach: after calling `layoutGraph`, inspect the returned `nodes` to find the minimum `y` of all isolated table nodes. The isolated table node IDs are the table keys (e.g., `"demo_user.ISOLATED_TABLE"`) and they are NOT in the `connected` components. However, without re-running `detectConnectedComponents`, the caller cannot easily distinguish connected from isolated nodes by position alone.

**Better approach:** Return `isolatedGridStartY` (or `isolatedGridOrigin: { x, y }`) from `layoutGraph` in the `LayoutResult`, computed internally where `placeIsolatedGrid` is called. This is the only place that knows `startSecondary`.

```typescript
// Extend LayoutResult further:
export interface LayoutResult {
  nodes: Node[];
  edges: Edge[];
  metrics?: LayoutMetrics;
  isolatedCount: number;
  connectedCount: number;
  isolatedGridOrigin?: { x: number; y: number }; // undefined if no isolated tables
}
```

Alternatively: after layout, find `Math.min(...isolatedNodes.map(n => n.position.y)) - gridGap/2` by scanning the returned nodes. Since isolated nodes are alphabetically sorted and start at `startSecondary`, the minimum y among all grid nodes is `startSecondary`. This works but requires the caller to know which nodes are isolated — which requires either the isolatedGridOrigin or a separate list of isolated node IDs.

**Recommended:** Return `isolatedGridOrigin` from `layoutGraph` and use it directly in `DatabaseLineageGraph` to position the label node.

### Pattern 5: Hiding Isolated Tables

**What:** When `hideIsolatedTables` is true, filter isolated table nodes and the section label node out of the React Flow nodes before passing to `<ReactFlow>`.

**When to use:** On every render, after layout, when the toggle is active.

**Example:**
```typescript
// In DatabaseLineageGraph, after layout:
const visibleNodes = useMemo(() => {
  if (!hideIsolatedTables || isolatedNodeIds.size === 0) return nodes;
  return nodes.filter(
    n => !isolatedNodeIds.has(n.id) && n.id !== '__isolated-section-label__'
  );
}, [nodes, hideIsolatedTables, isolatedNodeIds]);
```

`isolatedNodeIds` is a `Set<string>` stored in component state, populated when the layout result is received (by extracting from `LayoutResult.isolatedNodeIds` or by re-running `detectConnectedComponents` — the latter is acceptable since it is O(V+E) and completes in <1ms for typical graphs).

**Note:** Hiding does NOT re-run the layout. The nodes simply aren't passed to React Flow. This means edges connecting to isolated tables (cross-database edges where isolated external tables are shown) are also hidden — which is the correct behavior since there would be dangling edges.

**Edge filtering for hidden nodes:** Any edge whose `source` or `target` is in `isolatedNodeIds` must also be filtered:
```typescript
const visibleEdges = useMemo(() => {
  if (!hideIsolatedTables || isolatedNodeIds.size === 0) return edges;
  return edges.filter(
    e => !isolatedNodeIds.has(e.source) && !isolatedNodeIds.has(e.target)
  );
}, [edges, hideIsolatedTables, isolatedNodeIds]);
```

### Pattern 6: Database Header Isolated Count

**What:** The database header in `DatabaseLineageGraph` currently shows `"Database: {databaseName}"`. UXPL-03 requires showing both connected and isolated table counts.

**Current header (DatabaseLineageGraph.tsx line 450-455):**
```tsx
<div className="flex items-center gap-2">
  <Database className="w-5 h-5 text-blue-600" />
  <span className="font-medium text-blue-800">Database: {databaseName}</span>
</div>
```

**Extended header (Phase 21 target):**
```tsx
<div className="flex items-center gap-2">
  <Database className="w-5 h-5 text-blue-600" />
  <span className="font-medium text-blue-800">Database: {databaseName}</span>
  {connectedTableCount > 0 && (
    <span className="text-xs text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">
      {connectedTableCount} in lineage
    </span>
  )}
  {isolatedTableCount > 0 && (
    <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
      {isolatedTableCount} isolated
    </span>
  )}
</div>
```

The counts come from `useUIStore` (`isolatedTableCount` and `connectedTableCount`), which are set after layout completes.

**UXPL-03 says "before the user opens the graph"** — this means in the header that is visible during loading and after load. The `DatabaseLineageGraph` component has a header section that is always rendered (not inside the `showProgress` guard), so the counts can appear immediately after layout completes. During loading, counts are 0/undefined and the badges are not shown (conditional render).

### Anti-Patterns to Avoid

- **Re-running layout to get counts:** Do NOT call `layoutGraph` a second time to extract isolated count. Layout is async and expensive. Surface counts from the existing layout call.
- **Storing counts in `useLineageStore`:** That store holds lineage data and graph state. Display preferences and UI-derived counts belong in `useUIStore`.
- **Using React Flow `<Panel>` for the section label:** `<Panel>` is viewport-pinned (stays at a fixed screen position regardless of pan/zoom). The label must be canvas-pinned to stay above the isolated grid zone during pan/zoom.
- **Using absolute-positioned HTML div synchronized to viewport transform:** This requires listening to React Flow's `onMove` event and applying the transform manually. Much harder than a custom node type.
- **Filtering nodes before layout:** The isolated table nodes must be included in the layout so their positions are computed. Filtering happens after layout, at render time.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Persisting toggle state | Custom React context or local state | Zustand `useUIStore` | Already used for sidebar; consistent pattern; survives re-renders |
| Canvas-space label positioning | Manually computing CSS transform | Custom React Flow node type | React Flow handles pan/zoom transform automatically for nodes |
| Icon for hide toggle | SVG from scratch | `lucide-react` EyeOff/Eye | Matches existing toolbar icon style; already installed |

**Key insight:** React Flow's node system is the correct abstraction for any element that must stay positioned relative to the canvas — not custom CSS math on viewport transforms.

## Common Pitfalls

### Pitfall 1: Panel vs. Node for Section Label

**What goes wrong:** Using `<Panel position="top-left">` from `@xyflow/react` for the section label. The label appears at a fixed screen position regardless of zoom level, so it detaches from the isolated grid zone when the user pans.

**Why it happens:** `Panel` is designed for viewport-pinned UI overlays (like zoom controls), not canvas-space elements.

**How to avoid:** Use a custom node type with `draggable: false, selectable: false`. Position it at the computed grid start coordinates.

**Warning signs:** Label does not move when user pans the canvas; label covers unrelated nodes after a pan.

### Pitfall 2: Section Label Node Causes Test Failures

**What goes wrong:** Existing tests that check node count or node IDs will break if the section label node is unconditionally included.

**Why it happens:** The label node (`__isolated-section-label__`) is an extra node that tests don't expect.

**How to avoid:** Only add the label node when `isolatedCount > 0`. In tests, the mock for `layoutGraph` returns `isolatedCount: 0` by default, so no label node is injected. Alternatively, filter it out by `id` in assertions.

**Warning signs:** `expect(nodes).toHaveLength(N)` tests fail by 1; `getByText('Tables without lineage')` appears in snapshots unexpectedly.

### Pitfall 3: Edge Filtering Omits Cross-Database Isolated Nodes

**What goes wrong:** When hiding isolated tables, edges connecting to external (cross-database) isolated nodes are not filtered, causing React Flow to emit warnings about edges with missing source/target nodes.

**Why it happens:** `isolatedNodeIds` is computed from the internal database's isolated tables but external dataset nodes (from other databases that appear in the lineage but have no connections within this database) may also be "isolated" from the layout perspective.

**How to avoid:** Filter edges by checking both `source` and `target` against all hidden node IDs, including both internally isolated and the label node.

**Warning signs:** React Flow console warning: "Couldn't create edge for source/target id: ...".

### Pitfall 4: Count Displayed Before Layout Completes

**What goes wrong:** The header shows `0 isolated` during the loading spinner phase because `isolatedTableCount` is initialized to 0 in `useUIStore`.

**Why it happens:** `setIsolatedTableCount` is called after layout completes (in the `.then()` callback), but the header renders during loading.

**How to avoid:** Make the count badges conditional: only render when count > 0 OR when layout is complete. Use `stage === 'complete'` gating or only show badges when `isolatedTableCount + connectedTableCount > 0`.

**Warning signs:** "0 isolated" badge flickers on screen during loading.

### Pitfall 5: hideIsolatedTables Toggle Not Reset on Database Change

**What goes wrong:** User enables "hide isolated tables" in database A, navigates to database B — the toggle is still active, hiding all isolated tables in database B without the user intending this.

**Why it happens:** `useUIStore` state persists across navigation since it's a Zustand singleton store.

**How to avoid:** Either (a) reset `hideIsolatedTables` to `false` in the `useEffect` that resets other state when `databaseName` changes, or (b) accept that persistence across databases is desirable (a reasonable UX choice). The requirement says "user can toggle" — it doesn't specify reset behavior. Document the decision.

**Warning signs:** Users confused that the toggle state carries over between databases.

## Code Examples

### Adding to useUIStore

```typescript
// Source: existing useUIStore.ts pattern (sidebarOpen, searchQuery)
// Extend the UIState interface and create initial values in the same style

interface UIState {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;

  // Phase 21: isolated table UX
  hideIsolatedTables: boolean;
  toggleHideIsolatedTables: () => void;
  isolatedTableCount: number;
  setIsolatedTableCount: (count: number) => void;
  connectedTableCount: number;
  setConnectedTableCount: (count: number) => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: true,
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  searchQuery: '',
  setSearchQuery: (query) => set({ searchQuery: query }),

  // Phase 21
  hideIsolatedTables: false,
  toggleHideIsolatedTables: () =>
    set((state) => ({ hideIsolatedTables: !state.hideIsolatedTables })),
  isolatedTableCount: 0,
  setIsolatedTableCount: (count) => set({ isolatedTableCount: count }),
  connectedTableCount: 0,
  setConnectedTableCount: (count) => set({ connectedTableCount: count }),
}));
```

### Extending LayoutResult

```typescript
// Source: layoutEngine.ts — current LayoutResult interface
export interface LayoutResult {
  nodes: Node[];
  edges: Edge[];
  metrics?: LayoutMetrics;
  isolatedCount: number;               // NEW
  connectedCount: number;              // NEW
  isolatedGridOrigin?: { x: number; y: number }; // NEW — undefined when no isolated tables
}

// In layoutGraph(), at the end, before return:
const isolatedGridOrigin = isolated.length > 0
  ? {
      x: isHorizontal ? 0 : startSecondary,
      y: isHorizontal ? startSecondary : 0,
    }
  : undefined;

return {
  nodes: finalNodes,
  edges: layoutedEdges,
  metrics,
  isolatedCount: isolated.length,
  connectedCount: allTableIds.length - isolated.length,
  isolatedGridOrigin,
};
```

### SectionLabelNode Component

```tsx
// In DatabaseLineageGraph.tsx (or extracted to SectionLabelNode.tsx)
interface SectionLabelNodeData {
  count: number;
}

function SectionLabelNode({ data }: NodeProps<Node<SectionLabelNodeData>>) {
  return (
    <div className="px-3 py-1.5 text-sm font-medium text-slate-500 bg-slate-50/90 border border-slate-200 rounded-lg whitespace-nowrap select-none pointer-events-none shadow-sm">
      Tables without lineage connections ({data.count})
    </div>
  );
}

// Add to nodeTypes
const nodeTypes = {
  tableNode: TableNode,
  sectionLabelNode: SectionLabelNode,
};
```

### Toolbar Hide Toggle Button

```tsx
// In Toolbar.tsx — extend ToolbarProps interface
export interface ToolbarProps {
  // ... existing props ...
  hideIsolatedTables?: boolean;
  onToggleHideIsolatedTables?: () => void;
  isolatedTableCount?: number;
}

// In the action buttons section (alongside existing onToggleMultiSelectMode):
{onToggleHideIsolatedTables && (isolatedTableCount ?? 0) > 0 && (
  <Tooltip
    content={hideIsolatedTables
      ? `Show ${isolatedTableCount} tables without lineage connections`
      : `Hide ${isolatedTableCount} tables without lineage connections`}
    position="bottom"
  >
    <button
      onClick={onToggleHideIsolatedTables}
      className={`p-2 rounded-lg transition-colors ${
        hideIsolatedTables
          ? 'bg-slate-200 text-slate-700 hover:bg-slate-300'
          : 'text-slate-600 hover:bg-slate-100'
      }`}
      aria-label={hideIsolatedTables ? 'Show isolated tables' : 'Hide isolated tables'}
      aria-pressed={hideIsolatedTables}
      data-testid="hide-isolated-toggle"
    >
      {hideIsolatedTables ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
    </button>
  </Tooltip>
)}
```

### Wiring in DatabaseLineageGraph

```tsx
// After layout result arrives in workerLayoutGraph().then(...):
workerLayoutGraph(converted.nodes, converted.edges, { direction })
  .then(({ nodes: layoutedNodes, edges: layoutedEdges, isolatedCount, connectedCount, isolatedGridOrigin }) => {
    if (generation !== generationRef.current) return;
    setProgress(90);
    setStage('rendering');

    // Store counts in useUIStore
    setIsolatedTableCount(isolatedCount);
    setConnectedTableCount(connectedCount);

    // Build isolated node IDs set for hide filtering
    // ... (see Pitfall 3 — need to track which node IDs are isolated)

    // Insert section label node if there are isolated tables
    let allNodes = layoutedNodes;
    if (isolatedCount > 0 && isolatedGridOrigin) {
      const labelNode: Node = {
        id: '__isolated-section-label__',
        type: 'sectionLabelNode',
        position: {
          x: isolatedGridOrigin.x,
          y: isolatedGridOrigin.y - 36,
        },
        data: { count: isolatedCount },
        draggable: false,
        selectable: false,
        focusable: false,
      };
      allNodes = [labelNode, ...layoutedNodes];
    }

    setNodes(allNodes);
    setEdges(layoutedEdges);
    setGraph(converted.nodes, converted.edges);
    requestAnimationFrame(() => requestAnimationFrame(() => setStage('complete')));
  });
```

### Tracking Isolated Node IDs

The layout result does not currently expose which node IDs are isolated (only the count and grid origin). To implement hiding, we need to know which React Flow node IDs are the isolated ones. Options:

**Option A:** Return `isolatedNodeIds: string[]` from `layoutGraph`. Cost: one more field on `LayoutResult`. The isolated array is already computed in `layoutGraph`, so this is free.

**Option B:** After layout, derive isolated nodes by comparing all returned node IDs against those that are reachable via edges. Cost: O(V+E) re-computation in the caller. Fragile if edge structure changes.

**Recommended: Option A.** Add `isolatedNodeIds: string[]` to `LayoutResult`. Keep the planner's decision authority.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| ELK for all layout | Custom topo sort (Phase 20) | Phase 20 | layoutGraph now has internal knowledge of connected/isolated split |
| No isolated section | Two-zone grid layout (Phase 20) | Phase 20 | Grid exists but has no label |
| useUIStore only has sidebar + searchQuery | Extended with display preferences | Phase 21 | Natural extension point |

**Deprecated/outdated:**
- The old `useLineage.ts` → `useDatabaseLineage` infinite query hook: `DatabaseLineageGraph.tsx` now uses `useOpenLineageDatabaseLineage` from `useOpenLineage.ts`, NOT the old paginated hook. Tests still mock the old hook but `DatabaseLineageGraph.tsx` itself imports from `useOpenLineage.ts`.

## Open Questions

1. **Should `hideIsolatedTables` persist across database navigation?**
   - What we know: `useUIStore` is a Zustand singleton — state persists across navigation within the session.
   - What's unclear: The requirements do not specify whether the toggle should reset when the user navigates to a different database view.
   - Recommendation: Preserve across navigation (consistent with how `sidebarOpen` works). Document this. If it becomes a UX complaint, it's easy to reset in the `useEffect` that already resets other state on `databaseName` change.

2. **Does `AllDatabasesLineageGraph` need the same treatment?**
   - What we know: Phase 20 fixed `layoutSimpleNodes` (the ELK fallback used by `AllDatabasesLineageGraph`) to use `separateConnectedComponents`. The requirements (UXPL-01, UXPL-02, UXPL-03) only mention the database lineage view, not all-databases.
   - What's unclear: Whether the section label and toggle should also appear in `AllDatabasesLineageGraph`.
   - Recommendation: Scope to `DatabaseLineageGraph` only for this phase. `AllDatabasesLineageGraph` uses ELK and doesn't expose isolated count from the layout.

3. **Worker layout — does `workerLayoutGraph` return `LayoutResult` or a subset?**
   - What we know: `DatabaseLineageGraph.tsx` uses `workerLayoutGraph` (from `useLayoutWorker`). The worker wraps `layoutGraph`. If `LayoutResult` is extended with `isolatedCount`/`isolatedNodeIds`/`isolatedGridOrigin`, those fields must survive the structured-clone boundary across the Worker postMessage.
   - What's unclear: Whether the `useLayoutWorker` hook's interface explicitly types its return value, or just passes through the `LayoutResult` shape.
   - Recommendation: Check `useLayoutWorker.ts` during implementation. `string[]` and `number` and `{ x, y }` are all structured-clone-safe, so no issues expected. The planner should include a verification step for this.

## Sources

### Primary (HIGH confidence)

- Codebase: `/Users/Daniel.Tehan/Code/lineage/lineage-ui/src/utils/graph/layoutEngine.ts` — Full source of Phase 20 layout engine, `detectConnectedComponents`, `placeIsolatedGrid`, `LayoutResult` interface
- Codebase: `/Users/Daniel.Tehan/Code/lineage/lineage-ui/src/stores/useUIStore.ts` — Current UIStore with sidebar + searchQuery pattern
- Codebase: `/Users/Daniel.Tehan/Code/lineage/lineage-ui/src/stores/useLineageStore.ts` — Reference for how display preferences are structured in stores
- Codebase: `/Users/Daniel.Tehan/Code/lineage/lineage-ui/src/components/domain/LineageGraph/DatabaseLineageGraph.tsx` — Current database lineage component, header, and toolbar wiring
- Codebase: `/Users/Daniel.Tehan/Code/lineage/lineage-ui/src/components/domain/LineageGraph/Toolbar.tsx` — Current toolbar with existing props and button pattern
- Codebase: `/Users/Daniel.Tehan/Code/lineage/lineage-ui/src/components/domain/AssetBrowser/AssetBrowser.tsx` — Current database header count pattern (datasets.length badge)
- Phase 20 summary: `.planning/phases/20-mixed-layout-strategy/20-02-SUMMARY.md` — Confirms what was built, key constants (gridGap=80, maxRowWidth, componentGap)

### Secondary (MEDIUM confidence)

- `@xyflow/react` node type documentation: Custom node type pattern with `draggable: false, selectable: false` is a well-established React Flow pattern for non-interactive canvas elements. Confirmed by examining `TableNode`, `LineageEdge`, `ClusterBackground` usage in the codebase.
- Zustand `create` pattern: Verified against existing `useUIStore.ts` and `useLineageStore.ts` — `(set) => ({...})` with direct field additions.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in use, no new dependencies
- Architecture: HIGH — patterns derived directly from existing codebase patterns (useUIStore, custom node types, Toolbar props)
- Pitfalls: HIGH — derived from direct code reading of the layout engine and React Flow integration patterns
- Open Questions: MEDIUM — depend on implementation details of `useLayoutWorker` not fully read

**Research date:** 2026-02-21
**Valid until:** 2026-03-21 (stable stack; no fast-moving dependencies)
