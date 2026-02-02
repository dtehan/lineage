# Feature Research: Interactive Graph Visualization for Data Lineage

**Domain:** Data lineage visualization - interactive graph features
**Researched:** 2026-02-01
**Confidence:** HIGH (validated against existing implementation + ecosystem research)

## Current State Analysis

The existing implementation already includes substantial interactive features:

| Feature | Status | Location |
|---------|--------|----------|
| Column-level click selection | BUILT | `ColumnRow.tsx`, `useLineageStore.selectedAssetId` |
| Bidirectional path highlighting | BUILT | `useLineageHighlight.ts` with upstream/downstream traversal |
| Visual dimming of unrelated nodes | BUILT | `TableNode.tsx` opacity=0.2 for dimmed |
| Detail panel (slide-out) | BUILT | `DetailPanel.tsx` with column/edge metadata |
| Edge selection | BUILT | `onEdgeClick` handler, edge detail in panel |
| Keyboard shortcuts | BUILT | `useKeyboardShortcuts.ts` (Esc, F, +/-, /, Ctrl+G) |
| Pane click to deselect | BUILT | `onPaneClick` -> `clearHighlight()` |

This research focuses on **improvements and additions** to these existing features, categorized by user expectation.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Dependencies | Notes |
|---------|--------------|------------|--------------|-------|
| **Clear selection indicator** | Users need visual feedback when something is selected | LOW | EXISTING | Currently uses blue highlight + border; matches industry standard |
| **Click-to-deselect** | Users expect clicking empty space clears selection | LOW | EXISTING | Implemented via `clearHighlight()` |
| **Hover preview** | Before committing to click, users want to preview impact scope | MEDIUM | useLineageHighlight | dbt Explorer, Amundsen, Collibra show counts on hover |
| **Upstream/downstream count badges** | Users need quick assessment of lineage impact | LOW | useLineageHighlight | Show "3 upstream, 12 downstream" on hover or in panel |
| **Panel close on Escape** | Standard keyboard behavior | LOW | EXISTING | Already implemented in useKeyboardShortcuts |
| **Fit to selection** | After selecting, center viewport on highlighted path | MEDIUM | React Flow fitBounds API | Users expect to see full selected path without manual panning |
| **Breadcrumb context** | Show current selection hierarchy (database > table > column) | LOW | Selection state | Standard for hierarchical navigation in data tools |
| **Smooth transitions** | State changes should not be jarring | LOW | CSS transitions | Add 200-300ms transitions; currently instant opacity changes |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required, but valuable.

| Feature | Value Proposition | Complexity | Dependencies | Notes |
|---------|-------------------|------------|--------------|-------|
| **Animated path highlighting** | Smooth opacity transitions make state changes feel polished; reduces cognitive load | LOW | CSS transitions | Use 200-300ms ease-out for opacity changes |
| **Edge flow animation** | Animated dashes showing data flow direction reinforce lineage understanding | MEDIUM | Custom edge styling | dbt docs uses this; CSS `stroke-dasharray` animation |
| **Selection history navigation** | Back/forward through previous selections like browser history | MEDIUM | Zustand store extension | Power users exploring large lineages need to retrace steps; NO competitor offers this |
| **Column-level keyboard navigation** | Arrow keys to move between columns, Tab between tables | MEDIUM | Focus management | Accessibility requirement that becomes power-user feature; Palantir supports this |
| **Mini-map selection sync** | Mini-map highlights corresponding area during selection | LOW | React Flow MiniMap | Users with large graphs need orientation assistance |
| **Contextual actions menu** | Right-click menu with "Show upstream only", "Copy name", etc. | MEDIUM | Custom context menu | Reduces toolbar hunting; desktop app convention |
| **Multi-column selection in same table** | Shift+click to select multiple related columns | HIGH | Selection state refactor | Useful for comparing related columns; Palantir supports this |
| **Lineage diff mode** | Compare lineage between two columns side-by-side | HIGH | Major UI redesign | Unique differentiator for change management use case |
| **Smart zoom on selection** | Auto-zoom to fit selected path while maintaining readable sizes | MEDIUM | Viewport calculations | Goes beyond basic "fit view" to optimize readability |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Arbitrary multi-select** | "Let me select any 5 unrelated columns" | Creates confusing non-contiguous highlighting; unclear what "path" means | Allow multi-select only within same lineage path or same table |
| **Node editing from UI** | "Let me fix lineage errors directly" | Lineage data should be authoritative from source; UI edits create drift | Link to governance workflow; add "report issue" button |
| **Real-time lineage updates** | "Show me when lineage changes" | Complex infrastructure; most changes happen during ETL, not in real-time | Add "refresh" button; show "last updated" timestamp |
| **Infinite depth expansion** | "Show me everything connected" | Graph becomes unreadable past 5-6 levels; performance degrades exponentially | Keep depth slider (existing); add "focus mode" for progressive loading |
| **Drag-and-drop reorganization** | "Let me arrange nodes manually" | Manual layouts don't persist; conflicts with automatic layout | Allow temporary drag but auto-reset; or "save layout" as power feature |
| **Full-text search in detail panel** | "Let me search SQL/descriptions" | Detail panel is for quick reference; search belongs in main search | Enhance main search to include metadata; keep panel focused |
| **Auto-open panel on every selection** | "Always show me details" | Disrupts flow when quickly exploring multiple nodes | Keep current behavior; add toggle in settings |

---

## Feature Dependencies

```
[Hover preview]
    |--enhances--> [Path highlighting] (EXISTING)
                       |--uses--> [useLineageHighlight] (EXISTING)

[Animated path highlighting]
    |--enhances--> [Path highlighting] (EXISTING)
    |--uses--> [CSS transitions]

[Edge flow animation]
    |--enhances--> [Animated path highlighting]
    |--uses--> [LineageEdge.tsx]

[Fit to selection]
    |--requires--> [Selection state] (EXISTING)
    |--uses--> [React Flow fitBounds API]

[Selection history navigation]
    |--requires--> [Selection state] (EXISTING)
    |--requires--> [History stack in Zustand store] (NEW)

[Column-level keyboard navigation]
    |--requires--> [Focus management infrastructure] (NEW)
    |--enhances--> [Selection] (EXISTING)

[Contextual actions menu]
    |--requires--> [Selection state] (EXISTING)
    |--enhances--> [Detail panel actions] (EXISTING)

[Smart zoom on selection]
    |--requires--> [Fit to selection]
    |--uses--> [Node dimension calculations]

[Multi-column selection]
    |--conflicts--> [Simple selection model] (current single-select)
    |--requires--> [Selection state refactor to Set<string>]

[Lineage diff mode]
    |--requires--> [Multi-column selection]
    |--requires--> [Split view UI] (NEW)
```

### Dependency Notes

- **Animated path highlighting requires nothing new:** Just CSS transition additions to existing opacity changes
- **Hover preview uses existing infrastructure:** `useLineageHighlight.getUpstreamNodes/getDownstreamNodes` already provides counts
- **Selection history requires store extension:** Add `selectionHistory: string[]` and `currentHistoryIndex` to Zustand
- **Multi-column selection conflicts with current model:** Would need significant refactor from `selectedAssetId: string | null` to `selectedAssetIds: Set<string>`
- **Lineage diff mode is a major feature:** Should be treated as a separate milestone, not bundled

---

## User Interaction Patterns

### Click Behaviors (Existing + Proposed)

| Target | Action | Current | Proposed |
|--------|--------|---------|----------|
| Column row | Single click | Select column, highlight path, open panel | No change (works well) |
| Column row | Double click | None | FUTURE: Zoom to full lineage for that column |
| Table header | Single click | Collapse/expand columns | No change (works well) |
| Edge | Single click | Select edge, show edge detail | No change (works well) |
| Pane (empty) | Single click | Clear selection, close panel | No change (works well) |
| Mini-map | Click | Pan viewport to area | ADD: Also highlight corresponding node |

### Keyboard Shortcuts

| Key | Current | Proposed Addition |
|-----|---------|-------------------|
| Escape | Clear selection, close panel, clear search | No change |
| F | Fit entire graph to view | No change |
| +/= | Zoom in | No change |
| - | Zoom out | No change |
| / | Focus search input | No change |
| Ctrl+F | Focus search (override browser find) | No change |
| Ctrl+G | Toggle database clusters | No change |
| C | None | **NEW (P1):** Center/fit to current selection |
| Arrow Up | None | **NEW (P2):** Navigate to previous column in table |
| Arrow Down | None | **NEW (P2):** Navigate to next column in table |
| Tab | None | **NEW (P2):** Move focus to next table |
| Shift+Tab | None | **NEW (P2):** Move focus to previous table |
| Enter | None | **NEW (P2):** Open detail panel for current selection |
| [ | None | **NEW (P2):** Go back in selection history |
| ] | None | **NEW (P2):** Go forward in selection history |

### Hover Behaviors (Proposed)

| Target | Current | Proposed |
|--------|---------|----------|
| Column row | Subtle background color change | **NEW (P1):** Show tooltip badge: "3 upstream, 12 downstream" |
| Table header | Pointer cursor | **NEW:** Show tooltip: "X columns, Y with lineage relationships" |
| Edge | Slight stroke color change | **NEW:** Show tooltip with transformation type |

---

## MVP Definition

### Phase 1: v4.0 Launch With

Minimum for interactive graph to feel polished.

- [x] **Column click selection** - EXISTING
- [x] **Bidirectional path highlighting** - EXISTING
- [x] **Detail panel with metadata** - EXISTING
- [x] **Click-to-deselect (pane click)** - EXISTING
- [x] **Keyboard shortcuts (Escape, F, +/-, /)** - EXISTING
- [ ] **Animated transitions** - Add 200ms CSS transitions for opacity/highlight changes
- [ ] **Hover preview badges** - Show upstream/downstream counts on column hover
- [ ] **Fit to selection (C key)** - Viewport centers on highlighted path
- [ ] **Breadcrumb context** - Show database > table > column in panel header

### Phase 2: v4.1 Add After Validation

Features to add once core is working smoothly.

- [ ] **Edge flow animation** - Trigger: Users ask "which direction is data flowing?"
- [ ] **Selection history navigation** - Trigger: Users complain about losing their place
- [ ] **Contextual actions menu** - Trigger: Users request specific actions repeatedly
- [ ] **Column-level keyboard navigation** - Trigger: Accessibility audit or power user requests

### Phase 3: v5+ Future Consideration

Features to defer until product-market fit established.

- [ ] **Multi-column selection** - Requires selection model refactor
- [ ] **Lineage diff mode** - Major feature, separate milestone
- [ ] **Smart zoom algorithms** - Complex heuristics needed

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority | Phase |
|---------|------------|---------------------|----------|-------|
| Animated transitions | MEDIUM | LOW | P1 | v4.0 |
| Hover preview badges | HIGH | MEDIUM | P1 | v4.0 |
| Fit to selection | HIGH | LOW | P1 | v4.0 |
| Breadcrumb context | MEDIUM | LOW | P1 | v4.0 |
| Edge flow animation | MEDIUM | MEDIUM | P2 | v4.1 |
| Selection history | MEDIUM | MEDIUM | P2 | v4.1 |
| Contextual menu | MEDIUM | MEDIUM | P2 | v4.1 |
| Keyboard navigation | HIGH | HIGH | P2 | v4.1 |
| Multi-column selection | LOW | HIGH | P3 | v5+ |
| Lineage diff mode | HIGH | HIGH | P3 | v5+ |

**Priority key:**
- P1: Must have for v4.0 milestone (low-medium cost, clear user value)
- P2: Should have, add in follow-up release
- P3: Nice to have, future consideration

---

## Competitor Feature Analysis

| Feature | dbt Explorer | Apache Atlas | Amundsen | Collibra | Our Approach |
|---------|--------------|--------------|----------|----------|--------------|
| Selection level | Table/model | Entity | Table | Any asset | **Column** (finer granularity) |
| Path highlighting | Upstream OR downstream tabs | Full lineage shown | Upstream/downstream tabs | Impact highlighting | **Bidirectional simultaneous** (EXISTING) |
| Detail panel | Right slide-out | Tab/modal | Right slide-out | Right slide-out | Right slide-out (EXISTING) |
| Hover effects | Basic highlight | None | None | Preview highlight | Add preview badges (P1) |
| Edge animation | Dash animation | None | None | Flow animation | Add dash animation (P2) |
| Keyboard nav | Limited | None | None | Full support | Add column nav (P2) |
| Selection history | None | None | None | None | **Add (P2) - differentiator** |
| Column-level lineage | Explorer only | None | Yes | Yes | **Yes (EXISTING)** |

### Competitive Positioning

**Already ahead on:**
1. Column-level granularity (dbt docs is table-level only)
2. Bidirectional simultaneous highlighting (competitors use tabs)
3. Custom table node visualization with expandable columns
4. Inline column click within table cards

**Differentiate further with:**
1. **Animation polish** - Smooth transitions competitors lack
2. **Selection history** - NO competitor offers this; valuable for exploration
3. **Comprehensive keyboard navigation** - Only Collibra has full support

---

## Implementation Notes

### Animated Path Highlighting (P1, LOW complexity)

Current implementation uses instant opacity changes. Add CSS transitions:

**In TableNode.tsx:**
```css
/* Add transition to existing inline style */
style={{
  opacity: isTableDimmed ? 0.2 : 1,
  transition: 'opacity 200ms ease-out'
}}
```

**In ColumnRow.tsx:**
```css
/* Add to className */
transition-all duration-200 ease-out
```

**In LineageEdge.tsx (already partially done):**
```typescript
// Line 139 already has:
transition: 'stroke-width 0.2s, opacity 0.2s',
// Just ensure opacity transitions are smooth
```

### Hover Preview Badges (P1, MEDIUM complexity)

Extend existing Tooltip component to show lineage counts on hover:

```typescript
// In ColumnRow.tsx, wrap the column with lineage-aware tooltip
const { getUpstreamNodes, getDownstreamNodes } = useLineageHighlight({ nodes, edges });

const upstreamCount = useMemo(() =>
  getUpstreamNodes(column.id).size,
  [column.id, getUpstreamNodes]
);
const downstreamCount = useMemo(() =>
  getDownstreamNodes(column.id).size,
  [column.id, getDownstreamNodes]
);

// Show in tooltip on hover
<Tooltip content={`${upstreamCount} upstream, ${downstreamCount} downstream`}>
  ...
</Tooltip>
```

**Performance consideration:** Pre-calculate counts during initial layout, not on every hover. Store in node data or use memoization.

### Fit to Selection (P1, LOW complexity)

Use React Flow's `fitBounds` API to center on highlighted nodes:

```typescript
// In LineageGraph.tsx, add to useKeyboardShortcuts or as separate handler
const fitToSelection = useCallback(() => {
  const highlightedNodes = nodes.filter(n => {
    // For table nodes, check if any column is highlighted
    const nodeData = n.data as TableNodeData;
    return nodeData.columns?.some(col => highlightedNodeIds.has(col.id));
  });

  if (highlightedNodes.length > 0) {
    const bounds = getNodesBounds(highlightedNodes);
    reactFlowInstance.fitBounds(bounds, {
      padding: 0.3,
      duration: 300
    });
  }
}, [nodes, highlightedNodeIds, reactFlowInstance]);

// Add 'C' key handler in useKeyboardShortcuts
if (event.key === 'c' || event.key === 'C') {
  event.preventDefault();
  fitToSelection();
  return;
}
```

### Breadcrumb Context (P1, LOW complexity)

Add to DetailPanel header to show selection hierarchy:

```typescript
// In DetailPanel.tsx, add breadcrumb below title
const breadcrumb = selectedColumn
  ? `${selectedColumn.databaseName} > ${selectedColumn.tableName} > ${selectedColumn.columnName}`
  : null;

<div className="text-xs text-slate-400 font-mono truncate mt-1">
  {breadcrumb}
</div>
```

### Selection History Navigation (P2, MEDIUM complexity)

Add to Zustand store:

```typescript
// In useLineageStore.ts
selectionHistory: string[];  // Array of selectedAssetIds
historyIndex: number;        // Current position in history
pushSelection: (id: string) => void;  // Add to history
navigateBack: () => void;
navigateForward: () => void;

// Implementation
pushSelection: (id) => set((state) => {
  // Trim forward history when pushing new selection
  const newHistory = [...state.selectionHistory.slice(0, state.historyIndex + 1), id];
  return {
    selectionHistory: newHistory,
    historyIndex: newHistory.length - 1,
    selectedAssetId: id
  };
}),
navigateBack: () => set((state) => {
  if (state.historyIndex > 0) {
    const newIndex = state.historyIndex - 1;
    return {
      historyIndex: newIndex,
      selectedAssetId: state.selectionHistory[newIndex]
    };
  }
  return state;
}),
```

### Edge Flow Animation (P2, MEDIUM complexity)

Add CSS animation to highlighted edges:

```css
/* In LineageEdge.tsx or global CSS */
.lineage-edge-highlighted path {
  stroke-dasharray: 5;
  animation: flowAnimation 1s linear infinite;
}

@keyframes flowAnimation {
  from { stroke-dashoffset: 10; }
  to { stroke-dashoffset: 0; }
}
```

Direction note: Ensure dashoffset direction matches data flow (source -> target).

---

## Sources

### Industry Research
- [Atlan - Data Lineage Explained](https://atlan.com/data-lineage-explained/)
- [Monte Carlo - Ultimate Guide to Data Lineage](https://www.montecarlodata.com/blog-data-lineage/)
- [Secoda - Top 16 Data Lineage Tools 2025](https://www.secoda.co/blog/top-data-lineage-tools)

### Tool-Specific Documentation
- [dbt Labs - Getting Started with Data Lineage](https://www.getdbt.com/blog/getting-started-with-data-lineage)
- [dbt Explorer Documentation](https://docs.getdbt.com/docs/explore/explore-projects)
- [dbt-docs Graph Visualization - DeepWiki](https://deepwiki.com/dbt-labs/dbt-docs/3.4-graph-visualization)
- [Cloudera - Apache Atlas Lineage](https://community.cloudera.com/t5/Community-Articles/Using-Apache-Atlas-to-view-Data-Lineage/ta-p/246305)
- [Amundsen Data Catalog 2025](https://atlan.com/amundsen-data-catalog/)
- [Amundsen Column Lineage](https://www.restack.io/docs/amundsen-knowledge-amundsen-column-lineage)
- [Palantir Data Lineage Navigation](https://www.palantir.com/docs/foundry/data-lineage/navigation)

### UX Patterns
- [Cambridge Intelligence - Graph Visualization UX](https://cambridge-intelligence.com/graph-visualization-ux-how-to-avoid-wrecking-your-graph-visualization/)
- [Cambridge Intelligence - Accessible Graph Visualization](https://cambridge-intelligence.com/build-accessible-data-visualization-apps-with-keylines/)
- [PatternFly - Primary-Detail Layout](https://www.patternfly.org/patterns/primary-detail/design-guidelines/)
- [Mobbin - Drawer UI Design](https://mobbin.com/glossary/drawer)

### React Flow / XYFlow
- [React Flow API Reference](https://reactflow.dev/api-reference/react-flow)
- [React Flow useOnSelectionChange](https://reactflow.dev/api-reference/hooks/use-on-selection-change)
- [XYFlow GitHub - Path Highlighting Discussion](https://github.com/wbkd/react-flow/issues/984)
- [XYFlow GitHub - Select Connected Edges](https://github.com/xyflow/xyflow/discussions/3176)

### Accessibility
- [everviz - Keyboard Navigation in Visualizations](https://www.everviz.com/blog/keyboard-navigation-and-accessibility-with-visualizations/)
- [Elementary Data - Column Level Lineage](https://docs.elementary-data.com/cloud/features/data-lineage/column-level-lineage)

---

## Quality Gate Checklist

- [x] Categories are clear (table stakes vs differentiators vs anti-features)
- [x] Complexity noted for each feature (LOW/MEDIUM/HIGH)
- [x] Dependencies on existing features identified (with EXISTING markers)
- [x] User interaction patterns documented (click behaviors, keyboard shortcuts)
- [x] Implementation notes for P1 features provided
- [x] Competitive analysis shows differentiation opportunities

---
*Feature research for: Interactive Graph Visualization - Data Lineage v4.0*
*Researched: 2026-02-01*
