# Phase 22: Selection Features - Research

**Researched:** 2026-02-06
**Domain:** React Flow viewport control, breadcrumb UI, Zustand state persistence
**Confidence:** HIGH

## Summary

This phase enhances the selection interaction in the lineage graph with two capabilities: (1) a "Fit to selection" button that centers the viewport on the highlighted lineage path, and (2) a breadcrumb in the DetailPanel header showing the selection hierarchy (database > table > column). It also requires selection state to persist when the user changes graph depth (if the selected column still exists in the new graph).

The research investigated three areas: (a) React Flow's `fitBounds` API for programmatic viewport control, (b) breadcrumb UI patterns using the existing Tailwind/lucide-react stack, and (c) selection persistence across depth changes via the Zustand store. The codebase uses `@xyflow/react` v12.10.0, which provides `fitBounds(bounds: Rect, options?: FitBoundsOptions)` and `getNodesBounds(nodes)` -- exactly the APIs needed. The highlighted path is already tracked in `useLineageStore` as `highlightedNodeIds` and `highlightedEdgeIds`, so "fit to selection" means computing bounds of highlighted nodes and calling `fitBounds`.

The DetailPanel already displays `databaseName.tableName` and `columnName` in the entity header (lines 173-179 of DetailPanel.tsx). The breadcrumb replaces this with a structured `database > table > column` display using `ChevronRight` separators. No new dependencies are required -- all needed APIs exist in the installed packages.

For selection persistence, the current flow is: user changes depth -> `maxDepth` changes in Zustand -> `useOpenLineageTableLineage` refetches with new depth -> `useEffect` sets new nodes/edges -> existing `selectedAssetId` remains in Zustand. The issue is that `clearHighlight()` is NOT called on depth change (good), but the highlight path must be recomputed after the new graph loads. Currently the highlight recomputation happens via the `useEffect` that watches `selectedAssetId` (line 249 of LineageGraph.tsx), but this only triggers when `selectedAssetId` changes. After a depth change, `selectedAssetId` stays the same so the highlight is not recomputed. The fix is to also watch `edges` (or `nodes.length`) in that effect to re-highlight when the graph structure changes.

**Primary recommendation:** Use React Flow's `fitBounds` with `getNodesBounds` on highlighted React Flow nodes, add a breadcrumb component to the DetailPanel header, and fix the highlight recomputation to trigger on graph changes (not just selection changes).

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @xyflow/react | 12.10.0 (installed) | `fitBounds`, `getNodesBounds`, `useReactFlow` for viewport control | Already installed; provides exact API needed (SELECT-01, SELECT-02) |
| zustand | ^4.4.0 (installed) | `useLineageStore` for selection state persistence across depth changes | Already the state management solution; `selectedAssetId` persists natively |
| lucide-react | ^0.300.0 (installed) | `ChevronRight` icon for breadcrumb separators, `Crosshair` or `Focus` for fit-to-selection button | Already used throughout codebase |
| tailwindcss | ^3.4.0 (installed) | All styling for breadcrumb and button | Already the sole styling approach |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @xyflow/system | (peer of @xyflow/react) | `Rect`, `FitBoundsOptions` types | TypeScript type imports for bounds calculation |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `fitBounds` with `getNodesBounds` | `fitView({ nodes: [...] })` with node filter | `fitView` with a `nodes` array filter would also work, but `fitBounds` gives more control over padding and is the canonical API for fitting to a specific region. However, `fitView` with `nodes` filter is simpler and avoids manual bounds calculation. Both are valid; `fitView` with `nodes` is recommended for simplicity. |
| Custom breadcrumb | `react-aria-components` Breadcrumbs | Overkill -- 3 static segments with no navigation; simple inline spans with chevrons suffice |

**Installation:**
No new dependencies required.

## Architecture Patterns

### Recommended Project Structure
```
src/
  components/
    domain/
      LineageGraph/
        DetailPanel.tsx                # MODIFY: Replace entity header with breadcrumb component
        DetailPanel/
          SelectionBreadcrumb.tsx       # NEW: Breadcrumb component for panel header
        Toolbar.tsx                     # MODIFY: Add "Fit to selection" button
        hooks/
          useFitToSelection.ts          # NEW: Hook encapsulating fitBounds logic
          index.ts                      # MODIFY: Export new hook
        LineageGraph.tsx                # MODIFY: Wire up fit-to-selection, fix highlight persistence
  stores/
    useLineageStore.ts                 # NO CHANGES needed (selectedAssetId already persists)
```

### Pattern 1: Fit to Selection via fitView with nodes filter
**What:** Use `reactFlowInstance.fitView({ nodes: [...highlightedNodeIds], padding: 0.15, duration: 300 })` to animate the viewport to the highlighted path nodes. The `nodes` option in `FitViewOptions` accepts an array of `{ id: string }` objects to filter which nodes to fit.
**When to use:** When user clicks "Fit to selection" button in toolbar (SELECT-01, SELECT-02).
**Example:**
```typescript
// Source: @xyflow/react v12.10.0 FitViewOptionsBase type definition
// and reactflow.dev/examples/interaction/zoom-transitions

import { useReactFlow } from '@xyflow/react';
import { useLineageStore } from '../../../../stores/useLineageStore';

export function useFitToSelection() {
  const reactFlowInstance = useReactFlow();
  const { highlightedNodeIds } = useLineageStore();

  const fitToSelection = useCallback(() => {
    if (highlightedNodeIds.size === 0) return;

    // Convert highlighted column IDs to their parent table node IDs
    // In this codebase, React Flow nodes are tableNodes (not individual columns)
    // The highlightedNodeIds contains column-level IDs like "ns1/db.table.column"
    // We need to find which tableNode contains those columns
    const allNodes = reactFlowInstance.getNodes();
    const highlightedTableNodeIds = new Set<string>();

    for (const node of allNodes) {
      if (node.type === 'tableNode' && node.data?.columns) {
        const columns = node.data.columns as Array<{ id: string }>;
        if (columns.some(col => highlightedNodeIds.has(col.id))) {
          highlightedTableNodeIds.add(node.id);
        }
      }
    }

    if (highlightedTableNodeIds.size === 0) return;

    // Use fitView with nodes filter -- simpler than manual getNodesBounds + fitBounds
    reactFlowInstance.fitView({
      nodes: Array.from(highlightedTableNodeIds).map(id => ({ id })),
      padding: 0.15,
      duration: 300,
    });
  }, [reactFlowInstance, highlightedNodeIds]);

  return { fitToSelection, hasSelection: highlightedNodeIds.size > 0 };
}
```

### Pattern 2: Alternative approach using getNodesBounds + fitBounds
**What:** Manually compute bounds of highlighted nodes and call `fitBounds` for exact control.
**When to use:** If `fitView` with nodes filter has issues or more precise padding control is needed.
**Example:**
```typescript
// Source: @xyflow/system types - FitBounds = (bounds: Rect, options?: FitBoundsOptions) => Promise<boolean>
// Rect = { x: number, y: number, width: number, height: number }
// FitBoundsOptions = { padding?: number, duration?: number, ease?: (t: number) => number }

import { useReactFlow, getNodesBounds } from '@xyflow/react';

const fitToSelection = useCallback(() => {
  const allNodes = reactFlowInstance.getNodes();
  const highlightedNodes = allNodes.filter(node => {
    if (node.type === 'tableNode' && node.data?.columns) {
      return node.data.columns.some((col: any) => highlightedNodeIds.has(col.id));
    }
    return false;
  });

  if (highlightedNodes.length === 0) return;

  const bounds = getNodesBounds(highlightedNodes);
  reactFlowInstance.fitBounds(bounds, { padding: 0.15, duration: 300 });
}, [reactFlowInstance, highlightedNodeIds]);
```

### Pattern 3: Selection Breadcrumb in Panel Header
**What:** A breadcrumb showing `database > table > column` in the DetailPanel header, using the existing `selectedColumn.databaseName`, `selectedColumn.tableName`, and `selectedColumn.columnName` props.
**When to use:** When a column is selected and the panel is open (SELECT-03, SELECT-04).
**Example:**
```typescript
// Source: existing codebase patterns (AssetBrowser uses ChevronRight for hierarchy)
import { ChevronRight, Database, Table, Columns } from 'lucide-react';

interface SelectionBreadcrumbProps {
  databaseName: string;
  tableName: string;
  columnName: string;
}

function SelectionBreadcrumb({ databaseName, tableName, columnName }: SelectionBreadcrumbProps) {
  return (
    <nav aria-label="Selection hierarchy" className="flex items-center gap-1 text-xs text-slate-500 truncate">
      <Database className="w-3 h-3 flex-shrink-0" />
      <span className="truncate" title={databaseName}>{databaseName}</span>
      <ChevronRight className="w-3 h-3 flex-shrink-0 text-slate-400" />
      <span className="truncate" title={tableName}>{tableName}</span>
      <ChevronRight className="w-3 h-3 flex-shrink-0 text-slate-400" />
      <span className="font-medium text-slate-700 truncate" title={columnName}>{columnName}</span>
    </nav>
  );
}
```

### Pattern 4: Selection Persistence Across Depth Changes
**What:** When `maxDepth` changes, the `selectedAssetId` stays in Zustand, but the highlight path must be recomputed after the new graph loads (since edges may have changed).
**When to use:** SELECT-05 requirement.
**Example:**
```typescript
// Source: LineageGraph.tsx lines 248-255 -- existing highlight effect
// Current code: watches [selectedAssetId, highlightPath, setHighlightedPath, openPanel]
// Problem: When depth changes, edges change, but selectedAssetId stays the same,
//   so this effect doesn't re-run. The highlight path becomes stale.

// Fix: Add edges dependency to the highlight recomputation effect
useEffect(() => {
  if (selectedAssetId) {
    const { highlightedNodes, highlightedEdges } = highlightPath(selectedAssetId);
    setHighlightedPath(highlightedNodes, highlightedEdges);
    // Don't re-open panel if it's already open -- only open if coming from fresh selection
    if (!isPanelOpen) {
      openPanel('node');
    }
  }
}, [selectedAssetId, highlightPath, setHighlightedPath, openPanel, isPanelOpen]);
// Note: highlightPath already changes when edges change (it's a useCallback with [edges] dep)
// The issue is that highlightPath reference changes, but the effect may not include it correctly.
// Investigation shows highlightPath depends on getConnectedNodes which depends on adjacency maps
// which depend on edges. So when edges change, highlightPath changes, triggering re-highlight.
// Actually, this SHOULD already work due to the dependency on highlightPath.
// The real issue may be that selectedAssetId's column might not exist in the new graph.
// Need to verify: after depth change, does the column still exist in storeNodes?
```

### Anti-Patterns to Avoid
- **Computing bounds from column-level IDs directly:** The React Flow nodes are `tableNode` type with columns as data inside them, NOT individual column nodes. You must map `highlightedNodeIds` (column IDs) to their parent `tableNode` IDs before calling `fitView`/`fitBounds`.
- **Calling fitBounds before nodes are measured:** React Flow measures node dimensions asynchronously. If you call `fitBounds` immediately after setting nodes, dimensions may be zero. Use the callback pattern or wait for `onNodesInitialized`.
- **Overwriting clearHighlight behavior:** The `clearHighlight()` function sets `selectedAssetId: null`. Don't change this -- it's the intentional "deselect" action. For depth changes, the key is NOT to call `clearHighlight` (which it doesn't currently).
- **Creating a new Zustand action for persistence:** The `selectedAssetId` already persists across depth changes because `setMaxDepth` only updates `maxDepth`, not `selectedAssetId`. No new store actions needed.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Viewport animation to bounds | Manual `setViewport` with interpolation | `fitBounds(bounds, { duration: 300 })` or `fitView({ nodes, duration: 300 })` | React Flow handles d3-zoom transitions, easing, and edge cases (min/max zoom constraints) |
| Node bounds calculation | Manual min/max over node positions | `getNodesBounds(nodes)` from `@xyflow/react` | Utility accounts for node dimensions, not just positions |
| Breadcrumb navigation component | Full breadcrumb with routing | Simple inline spans with ChevronRight separators | These breadcrumbs are display-only (no navigation), so a full breadcrumb component is overkill |

**Key insight:** React Flow v12 provides all viewport manipulation APIs out of the box. The `fitView` with `nodes` filter option is the simplest path -- it combines bounds calculation and viewport animation in a single call. No manual bounds calculation needed.

## Common Pitfalls

### Pitfall 1: Highlighted IDs Are Column-Level, React Flow Nodes Are Table-Level
**What goes wrong:** Calling `fitView({ nodes: highlightedNodeIds })` fails because `highlightedNodeIds` contains column IDs (e.g., `ns1/db.table.column`), but React Flow only knows about `tableNode` IDs (e.g., `ns1/db.table`).
**Why it happens:** The `useLineageHighlight` hook works on column-level IDs from edge data. The layout engine creates `tableNode` React Flow nodes that contain columns as data.
**How to avoid:** Map column IDs to parent table node IDs by iterating through React Flow nodes and checking if any column in `node.data.columns` is in the highlighted set.
**Warning signs:** `fitView` does nothing because no nodes match the provided IDs.

### Pitfall 2: Highlight Path Not Recomputed After Depth Change
**What goes wrong:** User selects a column, changes depth, and the highlighted path is stale or incomplete (missing new upstream/downstream columns discovered at the new depth).
**Why it happens:** The highlight effect in `LineageGraph.tsx` (line 249) watches `selectedAssetId`. When depth changes, `selectedAssetId` stays the same, so the effect might not re-run. However, `highlightPath` (from `useLineageHighlight`) is a `useCallback` that depends on adjacency maps derived from `edges`. When new data arrives and edges change, `highlightPath` gets a new reference, which SHOULD trigger the effect.
**How to avoid:** Verify that the dependency chain works: depth change -> new API data -> new edges -> new `highlightPath` reference -> effect re-runs. If it doesn't work due to React batching or stale closures, add `edges.length` or a data version counter to the effect dependencies.
**Warning signs:** After changing depth, old highlight remains (missing new nodes), or highlight disappears entirely.

### Pitfall 3: Selected Column Doesn't Exist in New Graph
**What goes wrong:** User selects a column at depth 5, reduces depth to 1, and the selected column's table is no longer in the graph. The panel shows stale data.
**Why it happens:** The column was at depth 4, which is beyond the new depth of 1. The column's data is no longer in `storeNodes`.
**How to avoid:** After graph data changes, check if `selectedAssetId` still exists in the new `storeNodes`. If not, either (a) clear the selection, or (b) keep the panel open but show a "column no longer in current view" message. Option (a) is simpler and matches the "if possible" qualifier in SELECT-05.
**Warning signs:** Panel shows metadata for a column that's not visible in the graph; "View Full Lineage" buttons don't work.

### Pitfall 4: Fit to Selection Called With No Selection
**What goes wrong:** The "Fit to selection" button is clickable when nothing is selected, causing `fitBounds` to receive empty bounds.
**Why it happens:** Button is always visible but no guard against empty `highlightedNodeIds`.
**How to avoid:** Disable the button when `highlightedNodeIds.size === 0`. Use the same disabled styling as other toolbar buttons (`disabled:opacity-50`).
**Warning signs:** Clicking "Fit to selection" with no selection causes viewport to jump to (0,0) or throws an error.

### Pitfall 5: Breadcrumb Overflow in Narrow Panel
**What goes wrong:** Long database/table/column names overflow the 384px (w-96) panel width.
**Why it happens:** The breadcrumb contains three text segments plus separators.
**How to avoid:** Use `truncate` class on each segment and wrap the breadcrumb in a container with `overflow-hidden`. Use `title` attributes for full names on hover.
**Warning signs:** Text wraps to multiple lines or extends beyond panel boundaries.

### Pitfall 6: Viewport Animation Conflicts with Smart Viewport
**What goes wrong:** After depth change, the `useSmartViewport` effect fires and repositions the viewport, overriding the user's "fit to selection" intent.
**Why it happens:** `useSmartViewport` runs after layout completes and sets viewport to top-left. The `hasAppliedViewportRef` guard only prevents re-application, not conflict with manual viewport changes.
**How to avoid:** Set `hasUserInteractedRef.current = true` when "fit to selection" is clicked. This is already the mechanism used by `onNodeDragStart` to prevent smart viewport from overriding user actions.
**Warning signs:** After fit-to-selection, the viewport jumps away to the top-left of the graph.

## Code Examples

### Fit to Selection Hook
```typescript
// Source: @xyflow/react v12.10.0 -- installed at node_modules/@xyflow/react
// FitViewOptionsBase has nodes?: (NodeType | { id: string })[], padding?, duration?, maxZoom?, minZoom?
// Verified from: node_modules/@xyflow/system/dist/esm/types/general.d.ts lines 134-144

import { useCallback } from 'react';
import { useReactFlow, type Node } from '@xyflow/react';
import { useLineageStore } from '../../../../stores/useLineageStore';

const FIT_TO_SELECTION_PADDING = 0.15;
const FIT_TO_SELECTION_DURATION = 300; // ms, matches panel slide animation

export function useFitToSelection() {
  const reactFlowInstance = useReactFlow();
  const highlightedNodeIds = useLineageStore(state => state.highlightedNodeIds);

  const fitToSelection = useCallback(() => {
    if (highlightedNodeIds.size === 0) return;

    // Map column IDs to parent table node IDs
    const allNodes = reactFlowInstance.getNodes();
    const tableNodeIds: { id: string }[] = [];

    for (const node of allNodes) {
      if (node.type === 'tableNode') {
        const columns = (node.data as any)?.columns as Array<{ id: string }> | undefined;
        if (columns?.some(col => highlightedNodeIds.has(col.id))) {
          tableNodeIds.push({ id: node.id });
        }
      }
    }

    if (tableNodeIds.length === 0) return;

    reactFlowInstance.fitView({
      nodes: tableNodeIds,
      padding: FIT_TO_SELECTION_PADDING,
      duration: FIT_TO_SELECTION_DURATION,
    });
  }, [reactFlowInstance, highlightedNodeIds]);

  const hasSelection = highlightedNodeIds.size > 0;

  return { fitToSelection, hasSelection };
}
```

### Toolbar "Fit to Selection" Button
```typescript
// Source: existing Toolbar.tsx pattern -- Focus icon already used for "Fit to view"
// New button sits next to existing "Fit to view" button
// Uses Crosshair icon from lucide-react to distinguish from Focus (fit all)

import { Crosshair } from 'lucide-react';

// In ToolbarProps, add:
//   onFitToSelection?: () => void;
//   hasSelection?: boolean;

// In Toolbar JSX, after the existing Fit to View button:
{onFitToSelection && (
  <Tooltip content="Center viewport on selected lineage path" position="bottom">
    <button
      onClick={onFitToSelection}
      disabled={isLoading || !hasSelection}
      className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
      aria-label="Fit to selection"
    >
      <Crosshair className="w-4 h-4" />
    </button>
  </Tooltip>
)}
```

### Selection Breadcrumb Component
```typescript
// Source: codebase pattern from AssetBrowser.tsx (ChevronRight for hierarchy display)
// and DetailPanel.tsx lines 173-179 (current entity header)

import React from 'react';
import { ChevronRight, Database, Table as TableIcon, Columns } from 'lucide-react';

interface SelectionBreadcrumbProps {
  databaseName: string;
  tableName: string;
  columnName: string;
}

export const SelectionBreadcrumb: React.FC<SelectionBreadcrumbProps> = ({
  databaseName,
  tableName,
  columnName,
}) => {
  return (
    <nav
      aria-label="Selection hierarchy"
      className="flex items-center gap-1 text-xs overflow-hidden"
    >
      <Database className="w-3 h-3 flex-shrink-0 text-slate-400" />
      <span className="text-slate-500 truncate max-w-[80px]" title={databaseName}>
        {databaseName}
      </span>
      <ChevronRight className="w-3 h-3 flex-shrink-0 text-slate-300" />
      <TableIcon className="w-3 h-3 flex-shrink-0 text-slate-400" />
      <span className="text-slate-500 truncate max-w-[80px]" title={tableName}>
        {tableName}
      </span>
      <ChevronRight className="w-3 h-3 flex-shrink-0 text-slate-300" />
      <Columns className="w-3 h-3 flex-shrink-0 text-blue-500" />
      <span className="font-medium text-slate-700 truncate" title={columnName}>
        {columnName}
      </span>
    </nav>
  );
};
```

### Selection Persistence Fix
```typescript
// Source: LineageGraph.tsx lines 248-255 (existing highlight effect)
// The fix ensures highlight recomputation when graph changes after depth adjustment

// BEFORE (existing code):
useEffect(() => {
  if (selectedAssetId) {
    const { highlightedNodes, highlightedEdges } = highlightPath(selectedAssetId);
    setHighlightedPath(highlightedNodes, highlightedEdges);
    openPanel('node');
  }
}, [selectedAssetId, highlightPath, setHighlightedPath, openPanel]);

// AFTER (with graph-change awareness):
// 1. Check if selectedAssetId still exists in current storeNodes
// 2. If yes, recompute highlight (highlightPath reference changes when edges change)
// 3. If no, clear the selection
useEffect(() => {
  if (selectedAssetId) {
    // Verify selected column still exists in current graph
    const stillExists = storeNodes.some(n => n.id === selectedAssetId);
    if (stillExists) {
      const { highlightedNodes, highlightedEdges } = highlightPath(selectedAssetId);
      setHighlightedPath(highlightedNodes, highlightedEdges);
      if (!isPanelOpen) {
        openPanel('node');
      }
    } else {
      // Column no longer in graph (e.g., depth was reduced)
      clearHighlight();
      closePanel();
    }
  }
}, [selectedAssetId, highlightPath, setHighlightedPath, openPanel, isPanelOpen,
    storeNodes, clearHighlight, closePanel]);
```

### React Flow Type Reference
```typescript
// Source: verified from node_modules/@xyflow/system/dist/esm/types/general.d.ts

// Rect (bounds object for fitBounds):
type Rect = { x: number; y: number; width: number; height: number };

// FitBoundsOptions:
type FitBoundsOptions = {
  duration?: number;
  ease?: (t: number) => number;
  interpolate?: 'smooth' | 'linear';
  padding?: number;  // Fraction of viewport (0.1 = 10% padding)
};

// FitViewOptions (for fitView with node filter):
type FitViewOptions = {
  padding?: Padding;  // number | string with units | per-side object
  includeHiddenNodes?: boolean;
  minZoom?: number;
  maxZoom?: number;
  duration?: number;
  ease?: (t: number) => number;
  interpolate?: 'smooth' | 'linear';
  nodes?: (Node | { id: string })[];  // Filter: only fit these nodes
};
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual viewport math with `setViewport` | `fitView({ nodes: [...] })` with node filter | @xyflow/react v12 | Single API call handles bounds calculation, zoom constraints, and animation |
| `fitBounds` with manual `getNodesBounds` | `fitView` with `nodes` option | FitViewOptions `nodes` field available since v12 | Simpler code -- no need for separate bounds calculation step |
| Breadcrumbs via routing library | Inline display-only breadcrumbs | Current project pattern | No routing needed for display-only hierarchy text |

**Deprecated/outdated:**
- `getRectOfNodes` is the old name for `getNodesBounds` -- use `getNodesBounds` instead
- `getTransformForBounds` was replaced by `getViewportForBounds` in v12

## Open Questions

1. **Should "Fit to selection" use `fitView` or `fitBounds`?**
   - What we know: Both work. `fitView({ nodes: [...] })` is simpler (one call). `getNodesBounds` + `fitBounds` gives explicit control over the bounds rect. Both support `duration` and `padding`.
   - What's unclear: Whether `fitView` with the `nodes` option correctly handles the padding as a viewport fraction or as pixels. The type says `Padding` which can be a number, a string with units (`"20px"`, `"10%"`), or per-side values.
   - Recommendation: Use `fitView({ nodes, padding: 0.15, duration: 300 })`. If padding behavior is wrong, fall back to `getNodesBounds` + `fitBounds`. Test with a real graph to validate.

2. **Breadcrumb location: panel header vs. above tabs?**
   - What we know: The requirement says "panel header shows selection hierarchy breadcrumb." Currently the panel header has "Column Details" text and a close button. Below that is an entity header with `databaseName.tableName` and `Selected: columnName`.
   - What's unclear: Whether the breadcrumb replaces the existing entity header section (lines 172-179 of DetailPanel.tsx), or goes into the sticky header (line 230-241), or is a new section.
   - Recommendation: Replace the existing entity header section (the `px-4 py-2 border-b` div) with the breadcrumb. This keeps the structural hierarchy the same while upgrading the display format. The sticky header retains "Column Details" and the close button.

3. **Should "fit to selection" also be a keyboard shortcut?**
   - What we know: The requirements specify a button (SELECT-01). The keyboard shortcuts hook already handles `F` for "fit to view."
   - What's unclear: Whether `Shift+F` or another shortcut should fit to selection.
   - Recommendation: Add as a follow-up if desired, not required by current requirements. Could use `Shift+F` to distinguish from `F` (fit all).

## Sources

### Primary (HIGH confidence)
- **@xyflow/react v12.10.0 installed source** (`node_modules/@xyflow/system/dist/esm/types/general.d.ts`) -- verified `FitBounds`, `FitBoundsOptions`, `FitViewOptionsBase`, `Rect` types directly from installed package
- **Existing codebase** -- `LineageGraph.tsx`, `useLineageStore.ts`, `useLineageHighlight.ts`, `useSmartViewport.ts`, `Toolbar.tsx`, `DetailPanel.tsx`, `TableNode.tsx`, `ColumnRow.tsx` -- all architecture patterns derived from actual code inspection
- **React Flow zoom transitions example** (https://reactflow.dev/examples/interaction/zoom-transitions) -- confirmed `duration` option works with `fitBounds` and `fitView`

### Secondary (MEDIUM confidence)
- **React Flow useReactFlow API reference** (https://reactflow.dev/api-reference/hooks/use-react-flow) -- method signatures for `fitView`, `fitBounds`, `getNodes`
- **React Flow FitViewOptions type reference** (https://reactflow.dev/api-reference/types/fit-view-options) -- `nodes` filter option, `padding`, `duration`
- **GitHub Discussion #1851** (https://github.com/xyflow/xyflow/discussions/1851) -- clarification of fitView vs fitBounds use cases

### Tertiary (LOW confidence)
- **React Flow getNodesBounds utility** (https://reactflow.dev/api-reference/utils/get-nodes-bounds) -- WebFetch extracted API docs; verified against installed types

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- All APIs verified from installed package type definitions; no new dependencies
- Architecture: HIGH -- All patterns derived from existing codebase inspection; clear mapping from requirements to code changes
- Pitfalls: HIGH -- The column-ID-to-table-node mapping issue identified from actual code inspection of how `useLineageHighlight` works vs how React Flow nodes are structured
- Code examples: HIGH -- Types verified from `node_modules/@xyflow/system/dist/esm/types/general.d.ts`; patterns match existing codebase conventions

**Research date:** 2026-02-06
**Valid until:** 2026-03-06 (stable domain -- React Flow viewport APIs, Zustand state patterns)
