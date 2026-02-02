# Technology Stack: Interactive Graph Features

**Project:** Lineage v4.0 — Interactive Graph Features
**Researched:** 2026-02-01
**Confidence:** HIGH (existing codebase analysis + official docs verification)

## Executive Summary

**The existing stack is sufficient for v4.0 interactive features. No new dependencies required.**

The codebase already has comprehensive infrastructure for node selection, path highlighting, and detail panels. The v4.0 milestone is primarily implementation work using existing capabilities, not stack additions.

## Current Stack (Verified from package.json)

| Technology | Version | Purpose |
|------------|---------|---------|
| @xyflow/react | ^12.0.0 | Graph visualization, node/edge rendering |
| zustand | ^4.4.0 | State management for selection/highlighting |
| tailwindcss | ^3.4.0 | Styling, transitions, responsive design |
| lucide-react | ^0.300.0 | Icons |
| react | ^18.2.0 | UI framework |

## Existing Infrastructure for v4.0 Features

### Node Selection (ALREADY IMPLEMENTED)

**Location:** `useLineageStore.ts` lines 32-34, 51-53

```typescript
// Already exists in store
selectedAssetId: string | null;
setSelectedAssetId: (id: string | null) => void;
selectedEdgeId: string | null;
setSelectedEdge: (id: string | null) => void;
```

**Usage:** `TableNode.tsx` and `ColumnRow.tsx` already handle click-to-select with `handleColumnClick` callback.

### Path Highlighting (ALREADY IMPLEMENTED)

**Location:** `useLineageStore.ts` lines 55-60

```typescript
// Already exists in store
highlightedNodeIds: Set<string>;
highlightedEdgeIds: Set<string>;
setHighlightedNodeIds: (ids: Set<string>) => void;
setHighlightedPath: (nodeIds: Set<string>, edgeIds: Set<string>) => void;
clearHighlight: () => void;
```

**Location:** `hooks/useLineageHighlight.ts` (160 lines)

```typescript
// Already provides bidirectional traversal
getUpstreamNodes: (nodeId: string) => Set<string>;
getDownstreamNodes: (nodeId: string) => Set<string>;
getConnectedNodes: (nodeId: string) => Set<string>;
getConnectedEdges: (nodeId: string) => Set<string>;
highlightPath: (selectedNodeId: string) => { highlightedNodes, highlightedEdges };
```

**Visual dimming:** `TableNode.tsx` line 40-41 already dims unrelated tables:
```typescript
const isTableDimmed = hasSelection && !hasHighlightedColumn && selectedAssetId !== null;
// Applied via: style={{ opacity: isTableDimmed ? 0.2 : 1 }}
```

### Detail Panel (ALREADY IMPLEMENTED)

**Location:** `DetailPanel.tsx` (262 lines)

Already includes:
- Slide-out panel from right (`fixed right-0 top-0 h-full w-96`)
- Column metadata display (data type, nullable, primary key, description)
- Lineage stats (upstream/downstream counts)
- Edge details (source, target, transformation type, confidence)
- SQL viewer with copy button
- "View Full Lineage" and "Impact Analysis" action buttons
- Close button with X icon
- Scrollable content area

**Panel state in store:**
```typescript
isPanelOpen: boolean;
panelContent: 'node' | 'edge' | null;
openPanel: (content: 'node' | 'edge') => void;
closePanel: () => void;
```

### CSS Transitions (ALREADY IN USE)

**Edges:** `LineageEdge.tsx` line 139
```typescript
transition: 'stroke-width 0.2s, opacity 0.2s',
```

**Nodes:** `TableNode.tsx` line 93
```typescript
transition-all duration-200
```

**Animation:** `LineageEdge.tsx` lines 188-206 defines `animate-dash` keyframe.

## Recommendations: What to NOT Add

### DO NOT Add: Framer Motion or React Spring

**Rationale:**
- Bundle size increase (~30kb for framer-motion)
- CSS transitions already handle slide-out panel smoothly
- Existing `transition-all duration-200` pattern works well
- No complex physics-based animations needed for this milestone

**Evidence:** CSS transitions are sufficient for slide-out panels. Per [Tailwind docs](https://tailwindcss.com/docs/transition-property), `transition-transform duration-300` provides smooth panel slides without JS animation libraries.

### DO NOT Add: Headless UI or Radix UI

**Rationale:**
- DetailPanel is already custom-built with proper accessibility (`role="dialog"`, `aria-label`)
- No complex component primitives needed (no dropdowns, modals, popovers)
- Adding a component library for one panel creates unnecessary complexity

### DO NOT Add: tailwindcss-animate Plugin

**Rationale:**
- `animate-in slide-in-from-right` is nice but overkill
- Simple CSS transform + transition achieves the same result
- Already have custom keyframes in LineageEdge.tsx

## Recommended Stack Changes: NONE

The existing stack handles all v4.0 requirements:

| Feature | Existing Solution |
|---------|-------------------|
| Node selection | Zustand `selectedAssetId` + click handlers |
| Bidirectional path highlighting | `useLineageHighlight` hook |
| Dimming unrelated nodes | `isTableDimmed` opacity logic |
| Detail panel | `DetailPanel.tsx` component |
| Panel open/close state | Zustand `isPanelOpen`, `openPanel`, `closePanel` |
| Smooth transitions | Tailwind `transition-all duration-200` |

## Implementation Focus (Not Stack)

The v4.0 work is implementation refinement, not stack changes:

1. **Panel animation enhancement** — Add `transform translate-x-full` + `transition-transform` for slide effect
2. **Column navigation** — Wire "View Full Lineage" button to re-select different column
3. **Table-level selection** — Extend `selectedAssetId` to support table nodes (not just columns)
4. **Panel content expansion** — Add DDL tab, statistics section if API supports it

## React Flow v12 Selection Features Available

Already using `@xyflow/react` ^12.0.0. These APIs are available if needed:

| Feature | API | Current Usage |
|---------|-----|---------------|
| Selection change events | `onSelectionChange` prop | Not used (using Zustand instead) |
| Selection hook | `useOnSelectionChange()` | Not used (custom selection logic) |
| Multi-select | `multiSelectionKeyCode` prop | Default (Meta/Ctrl) |
| Selection box | `selectionOnDrag` prop | Not enabled |

**Recommendation:** Continue using Zustand for selection state. The custom `useLineageHighlight` hook provides lineage-aware path traversal that React Flow's `useOnSelectionChange` does not.

## Alternative Considered: React Flow Built-in Selection

**Option:** Use React Flow's `selected` prop on nodes/edges instead of Zustand.

**Why NOT:**
- Our highlighting is lineage-path-aware (bidirectional traversal)
- React Flow selection is just "clicked items"
- Would need to sync RF selection -> Zustand -> path calculation -> back to RF
- Current approach is simpler: click -> Zustand -> highlight calculation -> render

## Performance Notes for Large Graphs

Existing optimizations that support interactive features:

| Optimization | Location | Impact |
|--------------|----------|--------|
| Virtualization | `onlyRenderVisibleElements={nodes.length > 50}` | Only render visible nodes |
| Memoization | `TableNode`, `ColumnRow`, `LineageEdge` wrapped in `memo()` | Prevent re-renders |
| Set-based lookups | `highlightedNodeIds: Set<string>` | O(1) membership checks |
| Adjacency maps | `useLineageHighlight` builds maps once | O(E) traversal, not O(E*V) |

These ensure interactive features remain responsive on graphs with 100+ nodes.

## Panel Animation Implementation (CSS Only)

The DetailPanel currently uses `fixed right-0` positioning. To add slide animation:

```typescript
// Current (no animation):
className="fixed right-0 top-0 h-full w-96 ..."

// Enhanced (with slide animation):
className={`
  fixed top-0 h-full w-96
  transform transition-transform duration-300 ease-out
  ${isOpen ? 'right-0 translate-x-0' : '-right-96 translate-x-full'}
`}
```

This uses Tailwind's built-in transition utilities. No additional libraries needed.

For accessibility, add `motion-reduce:transition-none` for users who prefer reduced motion:
```typescript
className="... transition-transform duration-300 motion-reduce:transition-none"
```

## Sources

- Package.json: `/Users/Daniel.Tehan/Code/lineage/lineage-ui/package.json`
- React Flow v12 docs: [useOnSelectionChange](https://reactflow.dev/api-reference/hooks/use-on-selection-change)
- React Flow v12 props: [ReactFlow component](https://reactflow.dev/api-reference/react-flow)
- Tailwind transitions: [transition-property docs](https://tailwindcss.com/docs/transition-property)
- CSS vs Framer Motion: [Motion Magazine comparison](https://motion.dev/blog/do-you-still-need-framer-motion)
- Animation best practices: [Tailwind Animation Utilities](https://tailkits.com/blog/tailwind-animation-utilities/)

## Conclusion

**No new dependencies needed.** The v4.0 milestone is achievable with the existing stack. Focus implementation effort on:

1. Adding slide animation to DetailPanel (CSS only)
2. Extending selection to table-level (not just column)
3. Wiring column click in panel to re-query lineage
4. Possibly adding DDL/statistics sections to panel content

All infrastructure exists. This is refinement work, not architecture work.
