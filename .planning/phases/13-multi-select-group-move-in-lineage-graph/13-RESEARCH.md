# Phase 13: Multi-select and Group Move in Lineage Graph - Research

**Researched:** 2026-02-19
**Domain:** React Flow (@xyflow/react) multi-selection, group drag, keyboard interaction
**Confidence:** HIGH

## Summary

React Flow 12 (installed: 12.10.0) has built-in multi-select and group drag support that works almost entirely out of the box. The library tracks a `selected` boolean on every node/edge, handles multi-selection via `multiSelectionKeyCode` (defaults to `Meta` on macOS, `Control` elsewhere), exposes `onSelectionChange` for reacting to selection changes, and fires `onSelectionDragStart/Stop` for group moves. No third-party library is needed.

The primary challenge for this codebase is that TableNode is a custom component whose click handling goes through an application-level state system (`useLineageStore.selectedAssetId`) rather than through React Flow's native `selected` node property. This means the existing single-click "column select with path highlight" feature and React Flow's native multi-select are parallel systems that must be reconciled carefully. Multi-selecting table nodes for group drag must not clobber the existing column-level selection and path highlighting.

The second challenge is that the lineage graph's existing event conflict between node-level drag and pane-level pan is already solved (React Flow handles it), but the interaction between `multiSelectionKeyCode` (Meta/Cmd) and the custom keyboard shortcuts in `useKeyboardShortcuts.ts` must be checked — specifically the `Ctrl+G` / `Ctrl+F` shortcuts and their `metaKey` branch, since macOS uses the same modifier key for both multi-select and these shortcuts.

**Primary recommendation:** Enable React Flow's native multi-select by adding `multiSelectionKeyCode="Meta"` and `selectionOnDrag={false}` to the `<ReactFlow>` component, add `selected` visual styling to `TableNode`, implement group-drag position persistence via `onNodesChange`, and add a `useMultiSelect` hook that bridges the RF selection state with a toolbar "multi-select mode" toggle so users can also activate it without holding Cmd.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @xyflow/react | 12.10.0 (installed) | Multi-select, drag, selection events | Already in codebase; all needed APIs are present |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| zustand | (installed) | Store multi-select mode toggle state | Already in codebase for all lineage state |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| RF native multiSelectionKeyCode | Custom pointer event logic | RF handles browser inconsistencies, touch, keyboard; never hand-roll |
| Zustand for UI toggle | Local useState | Use Zustand for cross-component access (toolbar toggle needs to affect graph behavior) |

**Installation:** No new packages required.

## Architecture Patterns

### Recommended Project Structure

The implementation touches these existing files and adds one new hook:

```
lineage-ui/src/
├── components/domain/LineageGraph/
│   ├── LineageGraph.tsx             # Add multiSelectionKeyCode + onSelectionChange + onSelectionDragStop + onNodesChange
│   ├── TableNode/TableNode.tsx      # Add selected prop display (visual ring/outline)
│   ├── Toolbar.tsx                  # Add multi-select toggle button
│   └── hooks/
│       ├── index.ts                 # Export useMultiSelect
│       └── useMultiSelect.ts        # NEW: bridge RF selection state with store + toolbar toggle
└── stores/useLineageStore.ts        # Add: isMultiSelectMode, selectedNodeIds, setSelectedNodeIds, toggleMultiSelectMode
```

### Pattern 1: React Flow Native Multi-Select Props

**What:** React Flow handles multi-select entirely through props on `<ReactFlow>`.
**When to use:** Always — this is the only correct approach.

```typescript
// Source: @xyflow/react 12.10.0 component-props.d.ts (verified in codebase)
<ReactFlow
  // ...existing props...

  // multiSelectionKeyCode: defaults to "Meta" on macOS, "Control" elsewhere
  // The isMacOs() check is internal to RF — we can rely on the default
  // or explicitly set it for clarity
  multiSelectionKeyCode="Meta"

  // selectionKeyCode: hold Shift + drag to draw a selection box
  // Default is "Shift" — keep the default; no need to change
  selectionKeyCode="Shift"

  // selectionOnDrag=false means dragging without Shift/Meta pans the canvas (existing behavior)
  selectionOnDrag={false}

  // When any node selection changes (single click, Cmd+click, shift-drag)
  onSelectionChange={onSelectionChange}

  // Group drag events — use for "user has interacted" tracking
  onSelectionDragStart={onSelectionDragStart}
  onSelectionDragStop={onSelectionDragStop}
/>
```

**Key finding from source (verified):** The default for `multiSelectionKeyCode` is `isMacOs() ? 'Meta' : 'Control'`, evaluated at runtime inside React Flow. On macOS this is already `Meta` (Cmd). This means Cmd+click to multi-select will work without any prop addition — but adding the prop explicitly is clearer.

### Pattern 2: Node `selected` Property

**What:** React Flow sets `node.selected = true` on all selected nodes automatically. Custom nodes receive `selected` as a prop via `NodeProps`.
**When to use:** Use to drive visual feedback on the TableNode.

```typescript
// Source: @xyflow/system NodeProps type (verified in installed codebase)
// NodeProps<NodeType> includes: Required<Pick<NodeType, ... 'selected' | 'dragging' ...>>
// TableNode already uses memo and custom props — add selected to it:

export interface TableNodeProps {
  id: string;
  data: TableNodeData;
  selected?: boolean; // React Flow passes this automatically via NodeProps
}

export const TableNode = memo(function TableNode({ id, data, selected }: TableNodeProps) {
  // Existing logic unchanged
  // Add: show a blue ring when this node is RF-selected (multi-select mode)
  const rfSelectedBorder = selected ? 'ring-2 ring-blue-400 ring-offset-1' : '';
  // ...
});
```

### Pattern 3: onNodesChange for Position Persistence

**What:** When nodes are dragged (including group drag), React Flow fires `onNodesChange` with `type: 'position'` changes. The existing `onNodesChange` from `useNodesState` already handles this — it updates local node state. No additional code needed for position persistence during a session.
**When to use:** The existing `onNodesChange` wiring is sufficient. Group drag is free.

```typescript
// Already wired in LineageGraph.tsx (verified):
const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
// <ReactFlow onNodesChange={onNodesChange} ... />
// React Flow fires position changes for all selected nodes during group drag automatically.
```

### Pattern 4: onSelectionChange for Store Sync

**What:** `onSelectionChange` fires with `{ nodes: Node[], edges: Edge[] }` whenever the RF selection changes.
**When to use:** To sync RF's internal selection into the Zustand store so other components (Toolbar, keyboard shortcuts) can read it.

```typescript
// Source: @xyflow/react component-props.d.ts (verified)
// OnSelectionChangeFunc<NodeType, EdgeType> = ({ nodes, edges }) => void

const onSelectionChange = useCallback(
  ({ nodes: selectedNodes }: { nodes: Node[] }) => {
    const ids = new Set(selectedNodes.map((n) => n.id));
    setSelectedNodeIds(ids); // new Zustand action
    // Mark user interaction to prevent smart viewport override
    hasUserInteractedRef.current = true;
  },
  [setSelectedNodeIds]
);
```

### Pattern 5: Toolbar "Multi-Select Mode" Toggle

**What:** A toolbar button that activates "multi-select mode" — where clicking nodes adds them to selection without needing to hold Cmd. This makes the feature discoverable on non-Mac systems and accessible.
**When to use:** Optional but strongly recommended for UX clarity.

Implementation approach: when `isMultiSelectMode` is true, pass `multiSelectionKeyCode={null}` to disable the Cmd requirement, so every click adds to selection. When false, restore default behavior.

```typescript
// Toolbar gets a new prop: isMultiSelectMode, onToggleMultiSelectMode
// LineageGraph.tsx:
<ReactFlow
  multiSelectionKeyCode={isMultiSelectMode ? null : 'Meta'}
  selectNodesOnDrag={!isMultiSelectMode}
  // ...
/>
```

### Anti-Patterns to Avoid

- **Managing node positions manually during group drag:** React Flow handles this internally through `onNodesChange`. Never intercept drag events to reposition nodes manually — it breaks RF's internal state.
- **Calling setNodes directly to mark nodes as selected:** Use RF's internal selection mechanism. Setting `node.selected = true` by hand outside of RF change handlers can cause stale state.
- **Blocking node drag events to implement group behavior:** RF's group drag is already built in when `multiSelectionActive` is true in RF store. Never prevent default on drag events.
- **Using `selectionOnDrag: true` without understanding the conflict with pan:** When `selectionOnDrag=true`, left-click drag draws a selection box instead of panning. The existing behavior (left-click drag = pan) should be preserved; Shift+drag for box-select and Cmd+click for individual node add are the correct UX patterns here.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Multi-node group drag | Custom drag event system | RF's built-in `multiSelectionActive` + `onNodesChange` | RF handles touch, mouse, browser differences, edge snapping |
| Multi-node selection box | Custom selection rectangle overlay | RF's `selectionKeyCode` + Shift+drag | RF handles partial/full intersection modes via `selectionMode` prop |
| Keyboard modifier detection | `event.metaKey && isMac()` logic | RF's `multiSelectionKeyCode` prop | RF abstracts cross-platform modifier key detection internally |
| Selected node visual state | Custom "which nodes are selected" tracking | `node.selected` prop on custom node component | RF sets this automatically; no need to track separately |

**Key insight:** Every element of group selection and drag is provided by React Flow 12 at zero extra cost. The effort for this phase is entirely in (1) wiring the props, (2) making the TableNode visually respond to `selected`, (3) resolving the interaction conflict between RF multi-select and the existing column-level selection model, and (4) adding the toolbar toggle for discoverability.

## Common Pitfalls

### Pitfall 1: Cmd+Click Conflict with Existing Column-Level Selection

**What goes wrong:** When the user Cmd+clicks a table node to add it to a multi-select group, the existing `onNodeClick` handler fires, which calls `setSelectedAssetId` and triggers path highlight and panel open for the table's columns. This creates a confusing dual-selection state.

**Why it happens:** The existing click model (column selection via Zustand) and RF's native selection model (`node.selected`) are independent systems. RF fires `onNodeClick` even when multi-selection is active.

**How to avoid:** In `onNodeClick`, check if the click event has `metaKey` (or if `isMultiSelectMode` is active) and skip the column selection logic when it does.

```typescript
const onNodeClick = useCallback(
  (event: React.MouseEvent, node: Node) => {
    // If multi-select modifier is held, let RF handle selection only
    if (event.metaKey || event.ctrlKey || isMultiSelectMode) return;
    if (node.type !== 'tableNode') {
      setSelectedAssetId(node.id);
    }
  },
  [setSelectedAssetId, isMultiSelectMode]
);
```

**Warning signs:** Panel opens every time user Cmd+clicks, or path highlight fires during group drag.

### Pitfall 2: onPaneClick Clears RF Selection

**What goes wrong:** The existing `onPaneClick` calls `clearHighlight()` — but it should also deselect all RF nodes when not in multi-select mode.

**Why it happens:** RF's pane click behavior already deselects all nodes natively. But if `clearHighlight` is also needed, it must not conflict with RF's deselection.

**How to avoid:** This is mostly a non-issue because RF handles pane click deselection automatically. Verify that `onPaneClick` only runs custom logic (clear Zustand state) and does not interfere with RF's own deselection.

### Pitfall 3: Keyboard Shortcut Conflicts on macOS

**What goes wrong:** The existing `useKeyboardShortcuts` hook handles `event.metaKey && event.key === 'f'` (focus search) and `event.metaKey && event.key === 'g'` (toggle clusters). On macOS, `Meta` is also the `multiSelectionKeyCode`. Pressing Cmd+click should trigger multi-select, not a keyboard shortcut.

**Why it happens:** `keydown` event fires before `mousedown` in some timing sequences. The `useKeyboardShortcuts` listener is on `window`, so `event.key === 'Meta'` fires when the Cmd key is pressed alone.

**How to avoid:** The existing shortcuts only fire on `event.key === 'f'` or `'g'` — not on `Meta` alone. So Cmd+click (which fires a `click` event, not a `keydown`) will not conflict. However, verify that holding Cmd and pressing 'g' does not both toggle clusters AND add a node to multi-select simultaneously. In practice these should not conflict since the shortcut is keyboard-triggered and multi-select is mouse-triggered.

**Warning signs:** Toolbar shortcuts fire when user is trying to Cmd+click-drag nodes.

### Pitfall 4: Smart Viewport Override During Group Drag

**What goes wrong:** After group drag, the `hasAppliedViewportRef` logic might re-run `applySmartViewport` if a data refresh happens.

**Why it happens:** The `hasUserInteractedRef` flag guards against this but must be set in `onSelectionDragStart` as well.

**How to avoid:** In `onSelectionDragStart`, set `hasUserInteractedRef.current = true` (same as existing `onNodeDragStart`).

### Pitfall 5: TableNode `selected` Prop Not Passed in Current Implementation

**What goes wrong:** `TableNode` is typed with `{ id, data }` only — it doesn't accept or use the `selected` prop from NodeProps. Without visual feedback, multi-select is invisible to users.

**Why it happens:** The current implementation doesn't use RF's native selection at all, so `selected` was never needed.

**How to avoid:** Update `TableNodeProps` to include `selected?: boolean` and add a visual indicator (e.g., a blue ring around the card) when selected. This is distinct from the existing path-highlight border (green) and the column-selected border (blue-500 on the inner border).

## Code Examples

Verified patterns from official sources:

### Enabling Multi-Select (minimal change to LineageGraph.tsx)

```typescript
// Source: @xyflow/react 12.10.0 component-props.d.ts (installed version)
<ReactFlow
  nodes={filteredNodesAndEdges.filteredNodes}
  edges={filteredNodesAndEdges.filteredEdges}
  onNodesChange={onNodesChange}
  onEdgesChange={onEdgesChange}
  onNodeClick={onNodeClick}          // Modified to skip when metaKey
  onEdgeClick={onEdgeClick}
  onPaneClick={onPaneClick}
  onNodeDragStart={onNodeDragStart}  // Existing; already sets hasUserInteractedRef
  onSelectionDragStart={onSelectionDragStart} // NEW: sets hasUserInteractedRef
  onSelectionChange={onSelectionChange}       // NEW: syncs to Zustand store
  multiSelectionKeyCode="Meta"       // Explicit; same as RF's macOS default
  selectionOnDrag={false}            // Keep default pan behavior for left-drag
  // ...rest of existing props unchanged
/>
```

### TableNode with Selected Visual

```typescript
// Source: @xyflow/system NodeProps type (installed version)
// NodeProps includes selected as Required<Pick<...>>
// TableNode receives it automatically when registered as a nodeType

export const TableNode = memo(function TableNode({ id, data, selected }: TableNodeProps) {
  // ...existing logic...

  // Multi-select ring: shown when RF has this node in its selection
  // Distinct from: getBorderColor() which shows path-highlight in green/blue
  const multiSelectRing = selected ? 'ring-2 ring-blue-400 ring-offset-1' : '';

  return (
    <div
      className={`
        min-w-[280px] max-w-[400px]
        ${getBackgroundColor()} rounded-lg border-2 shadow-md
        transition-opacity duration-200 ease-out motion-reduce:transition-none
        ${getBorderColor()}
        ${isTableDimmed ? 'opacity-20' : 'opacity-100'}
        ${multiSelectRing}
      `}
      // ...rest unchanged
    >
```

### New Zustand Store Additions

```typescript
// In useLineageStore.ts — extend LineageState interface:
interface LineageState {
  // ...existing...

  // Multi-select state
  isMultiSelectMode: boolean;
  toggleMultiSelectMode: () => void;
  selectedNodeIds: Set<string>;         // RF-selected table node IDs
  setSelectedNodeIds: (ids: Set<string>) => void;
}

// In create():
isMultiSelectMode: false,
toggleMultiSelectMode: () => set((state) => ({ isMultiSelectMode: !state.isMultiSelectMode })),
selectedNodeIds: new Set<string>(),
setSelectedNodeIds: (ids) => set({ selectedNodeIds: ids }),
```

### Keyboard Shortcut for Multi-Select Mode

Add to `useKeyboardShortcuts.ts` (alongside existing shortcuts):

```typescript
// Escape should also exit multi-select mode
if (event.key === 'Escape') {
  clearHighlight();
  closePanel();
  setSearchQuery('');
  if (isMultiSelectMode) toggleMultiSelectMode(); // NEW
  // ...rest of existing Escape handling
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `reactflow` package | `@xyflow/react` | RF v11 → v12 (2023) | API is the same, package renamed |
| `useStoreApi` to access selection | `onSelectionChange` prop | RF v12 | Prefer prop-based approach |
| Manual node position tracking | RF `onNodesChange` position events | RF v10+ | Always use RF's system |

**Deprecated/outdated:**
- `getNodes().filter(n => n.selected)` in a render: Instead use `onSelectionChange` callback and store result in state.
- Custom selection box overlay: RF's `selectionKeyCode` + `selectionMode` fully replaces this.

## Open Questions

1. **Should Escape key deselect all RF nodes as well as clear path highlight?**
   - What we know: RF deselects on pane click automatically. Pressing Escape currently calls `clearHighlight()` + `closePanel()`.
   - What's unclear: Whether RF has a programmatic "deselect all" API that should be called from the Escape handler.
   - Recommendation: Check `reactFlowInstance.getNodes()` → `setNodes(nodes.map(n => ({...n, selected: false})))` — but this bypasses RF internals. Better: check if RF exposes `unselectNodesAndEdges` (it does, in the internal store). For the planner: this is a detail to resolve during implementation — the Escape key may not need to explicitly deselect RF nodes since clicking on the pane (which Escape effectively simulates) already does this.

2. **Should group-moved nodes be snapped back to alignment after drag?**
   - What we know: ELK layout is only run once (on data load). After group drag, nodes are free-positioned.
   - What's unclear: Phase goal says "drag the selection as a group" — no re-layout after group move is mentioned.
   - Recommendation: No snap-back. Accept free positioning after group drag. This matches standard graph tool UX (Lucidchart, draw.io, etc.).

3. **Interaction between multi-select and the path highlight dimming system**
   - What we know: When `highlightedNodeIds.size > 0`, non-highlighted tables dim to `opacity-20`. Multi-selecting nodes would also need a way to show they're selected clearly.
   - What's unclear: Should multi-selecting a node clear the existing path highlight, or can both states coexist?
   - Recommendation: Cmd+click (or multi-select mode click) should clear `selectedAssetId` and path highlight state, making multi-select the active UI mode. This prevents the confusing state of dimmed + selected simultaneously. Plan task should address this explicitly.

## Sources

### Primary (HIGH confidence)
- `/Users/Daniel.Tehan/Code/lineage/lineage-ui/node_modules/@xyflow/react/dist/esm/types/component-props.d.ts` — All ReactFlow props: `multiSelectionKeyCode`, `selectionKeyCode`, `selectionOnDrag`, `selectionMode`, `onSelectionChange`, `onSelectionDragStart/Stop`
- `/Users/Daniel.Tehan/Code/lineage/lineage-ui/node_modules/@xyflow/system/dist/esm/types/nodes.d.ts` — NodeProps includes `selected` and `dragging` as Required picks
- `/Users/Daniel.Tehan/Code/lineage/lineage-ui/node_modules/@xyflow/react/dist/esm/index.js` — Runtime default: `multiSelectionKeyCode = isMacOs() ? 'Meta' : 'Control'`, `SelectionMode` enum values confirmed
- `/Users/Daniel.Tehan/Code/lineage/lineage-ui/node_modules/@xyflow/system/dist/esm/types/general.d.ts` — `SelectionMode.Full` and `SelectionMode.Partial` confirmed

### Secondary (MEDIUM confidence)
- Existing codebase analysis: `LineageGraph.tsx`, `TableNode.tsx`, `useKeyboardShortcuts.ts`, `useLineageStore.ts`, `layoutEngine.ts` — all read directly to understand current architecture

### Tertiary (LOW confidence)
- None — all critical claims verified from installed source files

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified from installed node_modules source files, no external search needed
- Architecture: HIGH — based on direct codebase reading of all affected files
- Pitfalls: MEDIUM-HIGH — pitfalls 1-4 are derived from reading the actual code interaction points; pitfall 5 is definitively verified from NodeProps type

**Research date:** 2026-02-19
**Valid until:** 2026-03-19 (React Flow 12.x is stable; check changelog before planning if >30 days)
