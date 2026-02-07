# Architecture Patterns: Interactive Graph Features

**Domain:** React Flow + Zustand integration for node selection, path highlighting, and detail panel
**Researched:** 2026-02-01
**Confidence:** HIGH

## Executive Summary

Research confirms the existing architecture is **already well-positioned** for interactive graph features. The codebase has implemented most of the core infrastructure:

- `useLineageStore` already contains `selectedAssetId`, `highlightedNodeIds`, `highlightedEdgeIds`, panel state
- `useLineageHighlight` hook already implements DFS traversal with cycle detection
- `DetailPanel` component exists with column and edge detail rendering
- `TableNode` and `ColumnRow` components already respond to selection/highlight state

**Recommendation:** Extend existing patterns rather than introduce new architecture. Focus on enhancing what exists.

---

## Current Architecture Analysis

### State Management: Already Centralized in Zustand

The existing `useLineageStore` (lines 1-194) already manages:

```typescript
// Selection state (lines 33-34, 51-59)
selectedAssetId: string | null;
selectedEdgeId: string | null;
highlightedNodeIds: Set<string>;
highlightedEdgeIds: Set<string>;

// Panel state (lines 63-67)
isPanelOpen: boolean;
panelContent: 'node' | 'edge' | null;
openPanel: (content: 'node' | 'edge') => void;
closePanel: () => void;
```

**Architecture Decision (Confirmed):** Selection and highlight state lives in Zustand, not React Flow's internal state. This is correct because:
1. Panel visibility depends on selection state
2. Multiple components (TableNode, ColumnRow, LineageEdge, DetailPanel) consume highlight state
3. Zustand provides fine-grained subscriptions without re-rendering entire tree

### Path Highlighting: Already Implemented

The `useLineageHighlight` hook (lines 1-160) implements:

```typescript
// Adjacency maps built from edges (lines 30-54)
const { upstreamMap, downstreamMap } = useMemo(() => {
  // ... builds Map<columnId, Set<connectedColumnIds>>
}, [edges]);

// DFS traversal with cycle detection (lines 57-81, 84-108)
const getUpstreamNodes = useCallback((nodeId: string): Set<string> => {
  const visited = new Set<string>();
  const stack = [nodeId];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (visited.has(current)) continue;  // Cycle detection
    visited.add(current);
    // ... traverse
  }
}, [upstreamMap]);
```

**Architecture Decision (Confirmed):** DFS with visited set is correct for:
- Handling cyclic graphs (common in real lineage data)
- O(V+E) time complexity
- Memory efficient (stack-based, not recursive)

### Component Integration: Already Wired

**LineageGraph.tsx** (lines 1-607):
- Uses `useLineageHighlight` hook (line 109)
- Triggers highlight on selection change (lines 249-255)
- Passes highlight state to DetailPanel (lines 584-591)

**TableNode.tsx** (lines 1-188):
- Reads `highlightedNodeIds` from store (line 25)
- Applies visual dimming for non-highlighted nodes (line 41, 96)
- Delegates column click to `setSelectedAssetId` (lines 81-86)

**ColumnRow.tsx** (lines 1-104):
- Receives `isSelected`, `isHighlighted`, `isDimmed` props
- Applies appropriate styling classes (lines 32-42)

**LineageEdge.tsx** (lines 1-207):
- Reads `highlightedEdgeIds` from store (line 85)
- Applies opacity dimming for non-highlighted edges (line 108)
- Shows animated dash effect for highlighted edges (line 111)

---

## Recommended Architecture for Enhancement

### 1. State Management Strategy

**Keep using Zustand for:**
- `selectedAssetId` / `selectedEdgeId` - global selection state
- `highlightedNodeIds` / `highlightedEdgeIds` - computed highlight sets
- `isPanelOpen` / `panelContent` - panel visibility

**Do NOT use React Flow internal state for selection because:**
- React Flow's `selected` property on nodes is designed for multi-select drag operations
- Our selection model is single-select with path highlighting
- Panel visibility logic requires external access to selection

**Recommended addition to useLineageStore:**

```typescript
// For column click navigation (future feature)
focusedColumnId: string | null;
setFocusedColumnId: (id: string | null) => void;
```

### 2. Data Fetching Strategy for Detail Panel

**Current implementation (lines 302-348 in LineageGraph.tsx):**
```typescript
const getColumnDetail = useCallback((columnId: string): ColumnDetail | null => {
  const node = storeNodes.find((n) => n.id === columnId);
  // ... builds detail from cached graph data
}, [storeNodes, storeEdges]);
```

**Recommendation:** This is sufficient for basic metadata. For extended metadata (DDL, usage stats), add a TanStack Query hook:

```typescript
// New hook: useColumnMetadata
export function useColumnMetadata(columnId: string | null) {
  return useQuery({
    queryKey: ['column-metadata', columnId],
    queryFn: () => openLineageApi.getDataset(columnId!.split('.').slice(0, 2).join('.')),
    enabled: !!columnId,
    staleTime: 5 * 60 * 1000,  // Cache 5 minutes
  });
}
```

**API Strategy:**
- Reuse existing `GET /api/v2/openlineage/datasets/{datasetId}` endpoint
- No new backend endpoint needed
- Data already includes fields with type, nullable, description

### 3. Path Highlighting Algorithm

**Current algorithm is correct.** Key characteristics:

| Aspect | Current Implementation | Status |
|--------|------------------------|--------|
| Traversal | DFS with stack | Correct |
| Cycle handling | Visited set check | Correct |
| Direction | Bidirectional (upstream + downstream) | Correct |
| Edge filtering | Filters edges where both endpoints are highlighted | Correct |

**Performance characteristics:**
- Build adjacency maps: O(E) - runs once via useMemo
- Traversal: O(V+E) per selection change
- Edge filtering: O(E) per selection change

**For graphs with 500+ nodes (virtualization threshold is 50):**
- Current implementation handles this fine
- useMemo dependency on `edges` prevents rebuild unless graph changes
- useCallback memoizes traversal functions

### 4. Component Boundaries

```
                    ┌─────────────────────────────────┐
                    │         useLineageStore         │
                    │  (selection, highlight, panel)  │
                    └───────────────┬─────────────────┘
                                    │
          ┌─────────────────────────┼─────────────────────────┐
          │                         │                         │
          ▼                         ▼                         ▼
┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│   LineageGraph   │    │    DetailPanel   │    │     Toolbar      │
│  (orchestrator)  │    │  (displays info) │    │  (controls)      │
└────────┬─────────┘    └──────────────────┘    └──────────────────┘
         │
         │ useLineageHighlight
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌────────┐  ┌────────────┐
│TableNode│  │LineageEdge │
│  │      │  │            │
│  ▼      │  │            │
│ColumnRow│  │            │
└─────────┘  └────────────┘
```

**Data flow for selection:**
1. User clicks ColumnRow
2. ColumnRow calls `onClick(column.id)` prop
3. TableNode's `handleColumnClick` calls `setSelectedAssetId(columnId)`
4. useLineageStore updates `selectedAssetId`
5. LineageGraph's useEffect (lines 249-255) reacts:
   - Calls `highlightPath(selectedAssetId)`
   - Updates `highlightedNodeIds`, `highlightedEdgeIds`
   - Calls `openPanel('node')`
6. Components re-render with new highlight state

### 5. Performance Considerations

**Current optimizations already in place:**

| Optimization | Implementation | Impact |
|--------------|----------------|--------|
| Virtualization | `onlyRenderVisibleElements` when nodes > 50 | Major for large graphs |
| Memoization | `useMemo` for adjacency maps, `useCallback` for traversals | Prevents recalc |
| Component memos | `memo(TableNode)`, `memo(ColumnRow)`, `memo(LineageEdge)` | Prevents re-render |
| Highlight as Sets | `Set<string>` instead of arrays | O(1) lookup |

**Additional recommendations for v4.0:**

1. **Debounce hover highlighting** (if implementing hover-based highlighting):
```typescript
const debouncedHighlight = useMemo(
  () => debounce((nodeId: string) => {
    const { highlightedNodes, highlightedEdges } = highlightPath(nodeId);
    setHighlightedPath(highlightedNodes, highlightedEdges);
  }, 100),
  [highlightPath, setHighlightedPath]
);
```

2. **Lazy load extended metadata** in DetailPanel:
```typescript
// Only fetch when panel is open AND user has been viewing for 500ms
useEffect(() => {
  if (!isPanelOpen || !selectedAssetId) return;
  const timer = setTimeout(() => setFetchExtendedMetadata(true), 500);
  return () => clearTimeout(timer);
}, [isPanelOpen, selectedAssetId]);
```

---

## Integration Points Summary

### New Components (None Required)
All components already exist. Enhancements can be made to existing components.

### Modified Components

| Component | Enhancement | Complexity |
|-----------|-------------|------------|
| DetailPanel | Add tabs for extended metadata (DDL, stats) | Medium |
| ColumnRow | Add double-click handler for column navigation | Low |
| useLineageStore | Add `focusedColumnId` for navigation feature | Low |

### New Hooks (Optional)

| Hook | Purpose | Required for v4.0? |
|------|---------|-------------------|
| `useColumnMetadata` | Fetch extended column metadata | Optional |
| `useTableDDL` | Fetch table DDL on demand | Optional |

### Backend Changes (None Required)
Existing endpoints provide all necessary data:
- `GET /api/v2/openlineage/datasets/{datasetId}` - Returns fields with metadata
- `GET /api/v2/openlineage/lineage/table/{datasetId}` - Returns lineage graph

---

## Build Order Recommendation

Based on existing infrastructure and dependencies:

### Phase 1: Selection Enhancement (Low Risk)
**Already functional.** Minor polish:
- Visual feedback improvements (selection ring, focus indicator)
- Keyboard navigation (arrow keys to move selection)
- Selection persistence across view changes

### Phase 2: Path Highlighting Polish (Low Risk)
**Already functional.** Minor polish:
- Animation smoothing for highlight transitions
- Consider hover-based preview highlighting
- Clear highlight button/shortcut

### Phase 3: Detail Panel Enhancement (Medium Risk)
**Partially functional.** Needs:
- Tabbed interface for different data types
- Extended metadata fetching hook
- Error states for failed metadata fetch
- Loading states for extended data

### Phase 4: Column Navigation (Medium Risk)
**Not implemented.** Needs:
- Double-click handler on ColumnRow
- Navigation action that changes graph focus
- View transitions / animation

---

## Patterns to Follow

### Pattern 1: Zustand Selector with useShallow

**What:** Prevent re-renders when selecting multiple values from store
**When:** Component needs multiple store values
**Example:**

```typescript
import { useShallow } from 'zustand/react/shallow';

const { selectedAssetId, highlightedNodeIds } = useLineageStore(
  useShallow((state) => ({
    selectedAssetId: state.selectedAssetId,
    highlightedNodeIds: state.highlightedNodeIds,
  }))
);
```

### Pattern 2: Effect-Based State Derivation

**What:** Compute derived state (highlight sets) in useEffect, not during render
**When:** Expensive computation based on selection change
**Current implementation (correct):**

```typescript
// LineageGraph.tsx lines 249-255
useEffect(() => {
  if (selectedAssetId) {
    const { highlightedNodes, highlightedEdges } = highlightPath(selectedAssetId);
    setHighlightedPath(highlightedNodes, highlightedEdges);
    openPanel('node');
  }
}, [selectedAssetId, highlightPath, setHighlightedPath, openPanel]);
```

### Pattern 3: Lazy Data Fetching for Panel

**What:** Only fetch extended data when needed
**When:** User opens panel and stays on it
**Example:**

```typescript
const [shouldFetch, setShouldFetch] = useState(false);

useEffect(() => {
  if (!isPanelOpen) {
    setShouldFetch(false);
    return;
  }
  const timer = setTimeout(() => setShouldFetch(true), 300);
  return () => clearTimeout(timer);
}, [isPanelOpen, selectedAssetId]);

const { data: metadata } = useColumnMetadata(shouldFetch ? selectedAssetId : null);
```

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: React Flow Selection for Application Selection

**Problem:** Using React Flow's `selected` node property for single-select with panel
**Why bad:** React Flow selection is designed for multi-select drag operations, not application-level selection
**Do this instead:** Use Zustand store for application selection state

### Anti-Pattern 2: Recursive Graph Traversal

**Problem:** Recursive functions for graph traversal in graphs with cycles
**Why bad:** Stack overflow on cyclic graphs
**Do this instead:** Iterative DFS with visited set (already implemented correctly)

### Anti-Pattern 3: Storing Highlight State in Components

**Problem:** Each TableNode/ColumnRow maintaining own highlight state
**Why bad:** State synchronization nightmare, unnecessary re-renders
**Do this instead:** Single source of truth in Zustand, components read via selectors

### Anti-Pattern 4: Fetching Data on Every Selection

**Problem:** Calling API on every column click
**Why bad:** Unnecessary network requests, poor UX with loading spinners
**Do this instead:** Use cached graph data for basic info, lazy-load extended metadata

---

## Scalability Considerations

| Graph Size | Current Behavior | Recommendation |
|------------|------------------|----------------|
| < 50 nodes | Full render, fast selection | No changes needed |
| 50-200 nodes | Virtualization enabled, smooth | No changes needed |
| 200-500 nodes | May see slight delay on highlight | Consider limiting traversal depth |
| > 500 nodes | Large graph warning shown | Suggest reducing depth, filtering by database |

**For very large graphs (500+ nodes):**
1. Current `LargeGraphWarning` component already prompts user to reduce depth
2. Consider adding option to highlight only direct connections (not full path)
3. Consider server-side path computation for extremely large graphs

---

## Sources

- [Using a State Management Library - React Flow](https://reactflow.dev/learn/advanced-use/state-management) - Official Zustand integration guide
- [Computing Flows - React Flow](https://reactflow.dev/learn/advanced-use/computing-flows) - Graph traversal utilities (getIncomers, getOutgoers)
- [Highlight path of selected node - GitHub Issue #984](https://github.com/wbkd/react-flow/issues/984) - Community patterns for path highlighting
- [Performance - React Flow](https://reactflow.dev/learn/advanced-use/performance) - Virtualization and optimization
- [State Management Trends in React 2025](https://makersden.io/blog/react-state-management-in-2025) - Zustand best practices
- Existing codebase: `lineage-ui/src/components/domain/LineageGraph/hooks/useLineageHighlight.ts`
- Existing codebase: `lineage-ui/src/stores/useLineageStore.ts`
- Existing tests: `lineage-ui/src/components/domain/LineageGraph/hooks/useLineageHighlight.test.ts`

---

*Architecture research for: Interactive Graph Features (v4.0)*
*Researched: 2026-02-01*
