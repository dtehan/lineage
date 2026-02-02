# Pitfalls Research: Interactive Graph Features

**Domain:** Interactive Graph Features for Data Lineage Visualization
**Researched:** 2026-02-01
**Confidence:** HIGH (based on codebase analysis, React Flow documentation, and verified community patterns)

## Critical Pitfalls

### Pitfall 1: Memoization-Breaking Re-renders on Selection State

**What goes wrong:**
Every node re-renders when any selection or highlight state changes. With 100+ nodes, this causes visible jank (100-300ms delays) when clicking to select or highlight a column.

**Why it happens:**
The current `TableNode` component accesses `highlightedNodeIds` and `selectedAssetId` directly from Zustand store via `useLineageStore()`. When these values change, React Flow's internal diffing sees all nodes as "potentially changed" and schedules re-renders. Even with `React.memo`, the node component re-renders because `highlightedNodeIds` is a new `Set` object on every state update.

**How to avoid:**
1. Use Zustand selectors with shallow comparison to subscribe only to relevant state slices
2. Pass highlight/selection status as props computed outside the node, or use React Flow's built-in `selected` prop
3. Store highlight state in a `Map<nodeId, boolean>` format and use selectors like:
   ```typescript
   const isHighlighted = useLineageStore(
     (state) => state.highlightedNodeIds.has(nodeId),
     shallow
   );
   ```

**Warning signs:**
- React DevTools Profiler shows all nodes re-rendering on single click
- Laggy selection feedback (>100ms delay between click and visual response)
- CPU spikes visible in Performance tab during selection

**Phase to address:**
Phase 1 (Node Selection) - establish correct patterns before building highlighting on top

**Testing strategy:**
- Add Profiler measurements in tests for graphs with 100+ nodes
- Assert that clicking one column causes <5 node re-renders (the selected node plus immediate visual neighbors)

---

### Pitfall 2: Stale Closure State in Selection Callbacks

**What goes wrong:**
Click handlers capture old state values. Users click Node A, then quickly click Node B, but the highlight path shows Node A's lineage because the second click handler still references the first selection.

**Why it happens:**
`useCallback` dependency arrays don't include all state the callback reads. The current `handleColumnClick` callback in `TableNode` uses `setSelectedAssetId` which is stable, but `highlightPath` in `LineageGraph.tsx` line 109 depends on `edges` which may have changed. When the callback fires, it uses stale edge data from closure.

**How to avoid:**
1. Move selection logic into Zustand actions that use `get()` to read fresh state:
   ```typescript
   selectAndHighlight: (columnId) => {
     set({ selectedAssetId: columnId });
     const edges = get().edges; // Always fresh
     const path = computePath(columnId, edges);
     set({ highlightedNodeIds: path.nodes, highlightedEdgeIds: path.edges });
   }
   ```
2. Use `useRef` for values needed in callbacks but that shouldn't trigger re-memoization
3. Keep the dependency array accurate - if a value is read, it must be a dependency

**Warning signs:**
- Highlight shows wrong path after rapid successive clicks
- Selection state and highlighted path don't match
- Intermittent "works sometimes" bugs with selection

**Phase to address:**
Phase 2 (Path Highlighting) - this is where the graph traversal logic runs in callbacks

**Testing strategy:**
- Write E2E test: rapidly click 3 different columns within 200ms, verify final highlight matches final selection
- Unit test: mock timing to simulate stale closure scenarios

---

### Pitfall 3: O(n*m) Graph Traversal on Every Hover

**What goes wrong:**
Hovering over edges or nodes triggers expensive graph traversal that freezes the UI. With a 200-node graph containing 500+ edges, each hover event runs a full BFS/DFS taking 50-100ms.

**Why it happens:**
The current `useLineageHighlight` hook runs `getConnectedNodes` and `getConnectedEdges` which traverse the entire graph. If this runs on every mouse move or hover event (not just click), performance degrades rapidly.

**How to avoid:**
1. Pre-compute and cache adjacency maps on graph load (current code does this correctly in `useMemo`)
2. Debounce hover events - only compute path after 150ms hover dwell
3. Use `useDeferredValue` or `startTransition` for non-urgent path calculations
4. Consider Web Worker for path computation on graphs >200 nodes

**Warning signs:**
- Mouse movement feels "sticky" or unresponsive over graph
- DevTools shows long tasks (>50ms) during hover
- `getUpstreamNodes`/`getDownstreamNodes` appear in flame charts

**Phase to address:**
Phase 2 (Path Highlighting) - the traversal happens here

**Testing strategy:**
- Performance test: measure `highlightPath` execution time with 200 nodes, 500 edges
- Assert traversal completes in <10ms for 95th percentile

---

### Pitfall 4: Memory Leak from Global Event Listeners

**What goes wrong:**
Keyboard shortcuts stop working or trigger twice. Memory usage grows over time. Console shows "Can't perform a React state update on an unmounted component."

**Why it happens:**
The current `useKeyboardShortcuts` hook (line 116-123) adds a `keydown` listener in `useEffect`. If the effect runs again before cleanup (due to dependency changes), multiple listeners stack up. If the component unmounts during an async operation, the listener fires on the unmounted component.

**How to avoid:**
1. Ensure cleanup function always runs by returning it from useEffect
2. Use stable callback references (useCallback with correct deps) to prevent unnecessary re-subscriptions
3. Add an `isMounted` ref guard for any async operations:
   ```typescript
   useEffect(() => {
     const mounted = { current: true };
     window.addEventListener('keydown', handleKeyDown);
     return () => {
       mounted.current = false;
       window.removeEventListener('keydown', handleKeyDown);
     };
   }, [handleKeyDown]);
   ```
4. For the detail panel's data fetching, use AbortController to cancel pending requests on unmount

**Warning signs:**
- Keyboard shortcuts trigger multiple times
- Console warnings about unmounted component state updates
- Memory profiler shows increasing detached DOM nodes

**Phase to address:**
Phase 1 (Node Selection) and Phase 3 (Detail Panel) - keyboard listeners and panel data fetching

**Testing strategy:**
- Test: mount/unmount component 10 times, verify no memory growth
- Test: rapidly open/close detail panel, verify no console warnings

---

### Pitfall 5: Z-Index Chaos with Detail Panel and Selected Nodes

**What goes wrong:**
The detail panel appears behind selected nodes, or selected nodes render on top of the panel. Tooltips from column rows appear behind the panel. Clicking the panel triggers node selection underneath it.

**Why it happens:**
React Flow manages its own stacking context with z-index. The current `DetailPanel` uses `z-50` (line 237) but React Flow nodes can have z-index up to 1000+ when selected. The CSS `position: fixed` on the panel creates a new stacking context, but pointer events can still leak through.

**How to avoid:**
1. Place the detail panel outside the `<ReactFlow>` component in DOM hierarchy
2. Use `z-index: 9999` or CSS isolation for the panel
3. Stop event propagation on panel interactions:
   ```typescript
   <div onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
   ```
4. Add `pointer-events: none` to background overlay, `pointer-events: auto` to panel content

**Warning signs:**
- Visual overlap between panel and graph elements
- Clicks on panel also select nodes underneath
- Tooltips render behind panel

**Phase to address:**
Phase 3 (Detail Panel) - panel positioning and interaction

**Testing strategy:**
- Visual regression test: panel open with selected node behind it
- E2E test: click inside panel, verify no node selection change

---

### Pitfall 6: Missing Keyboard Navigation for Accessibility

**What goes wrong:**
Users cannot navigate between columns or tables using keyboard. Screen readers announce "graphic" or nothing useful. WCAG audits fail on keyboard accessibility (2.1.1) and name/role/value (4.1.2).

**Why it happens:**
React Flow's canvas is primarily mouse-driven. Custom nodes don't have focusable elements by default. The current `ColumnRow` component is clickable via `onClick` but has no `role`, `tabIndex`, or keyboard event handlers.

**How to avoid:**
1. Add `role="button"` and `tabIndex={0}` to clickable elements:
   ```typescript
   <div
     role="button"
     tabIndex={0}
     onKeyDown={(e) => e.key === 'Enter' && onClick?.(column.id)}
     aria-pressed={isSelected}
   >
   ```
2. Implement arrow key navigation between columns within a table
3. Add ARIA labels: `aria-label={`${column.name} column, ${column.dataType} type`}`
4. Provide skip links to jump between tables
5. Consider an alternative list view for screen reader users (LineageTableView already exists)

**Warning signs:**
- Tab key skips over graph entirely
- No focus visible on columns
- axe DevTools reports violations
- Users report inability to use keyboard

**Phase to address:**
Phase 1 (Node Selection) - add keyboard handlers alongside click handlers

**Testing strategy:**
- axe-core automated testing in component tests
- Manual testing with VoiceOver/NVDA
- E2E test: select column using only keyboard

---

### Pitfall 7: Highlight Flicker During Rapid Selection Changes

**What goes wrong:**
When switching between selected columns, there's a visible flash where nothing is highlighted before the new path appears. The dimming effect makes unrelated nodes flash full-opacity briefly.

**Why it happens:**
The current implementation in `LineageGraph.tsx` (lines 249-255) has a two-step process: `setSelectedAssetId` triggers one render, then `setHighlightedPath` triggers another. Between these renders, `highlightedNodeIds.size > 0` may be false while `selectedAssetId` is already set, causing the dimming logic to misbehave.

**How to avoid:**
1. Batch state updates in a single Zustand action:
   ```typescript
   selectColumn: (columnId) => set({
     selectedAssetId: columnId,
     highlightedNodeIds: computeHighlight(columnId).nodes,
     highlightedEdgeIds: computeHighlight(columnId).edges,
   });
   ```
2. Use React's automatic batching (React 18+) by ensuring updates happen in the same event handler
3. Use `unstable_batchedUpdates` if updates come from outside React event system

**Warning signs:**
- Visual flicker on selection change
- Brief "flash" of full opacity on all nodes
- Inconsistent dimming behavior

**Phase to address:**
Phase 2 (Path Highlighting) - when implementing the visual dimming

**Testing strategy:**
- Visual regression test capturing frames during selection change
- Assert no frame shows zero highlighted nodes during a selection switch

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Inline style objects for dimming | Quick implementation | Creates new object every render, breaks memoization | Never - use CSS classes or memoized styles |
| `Set<string>` for highlight state | Simple API | Creates new reference on every change, hard to compare | Acceptable if using proper selectors |
| Computing path in render | Simple code structure | Runs on every render, not just selection change | Never - always compute in event handler or effect |
| Skipping keyboard handlers | Faster initial implementation | Accessibility lawsuit risk, excludes users | Never - add basic keyboard support from start |
| Global CSS for animations | Quick styling | Pollutes global namespace, hard to tree-shake | MVP only, refactor to CSS modules or Tailwind |

---

## Integration Gotchas

Common mistakes when integrating with existing React Flow setup.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| React Flow + Zustand | Subscribing to entire store in nodes | Use granular selectors with shallow comparison |
| TanStack Query + Detail Panel | Fetching on every panel open | Use `enabled: isPanelOpen && !!selectedId` to prevent unnecessary fetches |
| React Flow selection + Custom selection | Fighting React Flow's built-in selection | Either use RF's selection exclusively or disable it with `selectionOnDrag={false}` |
| CSS transitions + State changes | Transitions blocking JS on main thread | Use `will-change` sparingly, prefer `transform` over layout properties |
| Existing `useLineageHighlight` hook | Calling traversal in render path | Only call `highlightPath` in event handlers, memoize adjacency maps |

---

## Performance Traps

Patterns that work at small scale but fail as graph size grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Non-memoized nodeTypes object | All nodes re-render on any parent update | Define `nodeTypes` outside component or in useMemo | Immediately with >10 nodes |
| Computing highlight in node component | Each node traverses graph independently | Compute once at top level, pass down as prop | At 50+ nodes |
| Large Sets in Zustand without selectors | Full re-render cascade on any set change | Use selectors: `state.highlightedNodeIds.has(id)` | At 20+ nodes |
| Styled-components or emotion inside nodes | Runtime CSS injection per render | Use static CSS classes or Tailwind | At 100+ nodes |
| React Flow's `onNodesChange` with full replace | Entire graph re-layouts | Use `setNodes(prev => ...)` functional update | At 50+ nodes with frequent updates |
| Dimming via filter: blur() | GPU-intensive per node | Use opacity only, or single overlay div | At 30+ nodes |

---

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No visual feedback until path computed | Users think click didn't register | Add immediate "selected" state, then show path |
| Dimming too aggressive (opacity 0.1) | Context is lost, hard to maintain orientation | Use opacity 0.3-0.4, or blur instead of dim |
| Panel covers graph content | Users lose context of selection | Use slide-out that pushes content, or resizable panel |
| No way to clear selection | Users get stuck with unwanted highlight | Click on empty canvas, Escape key, or clear button |
| Path highlighting includes unrelated nodes | Confusing lineage visualization | Only highlight direct path, not all connected |
| No loading state in detail panel | Panel opens empty, feels broken | Show skeleton loader while fetching metadata |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Node Selection:** Often missing keyboard handler - verify Tab can focus and Enter can select
- [ ] **Node Selection:** Often missing multi-select - verify Shift+click works (if required)
- [ ] **Path Highlighting:** Often missing edge highlight - verify edges glow, not just nodes
- [ ] **Path Highlighting:** Often missing bidirectional - verify both upstream and downstream show
- [ ] **Path Highlighting:** Often missing cycle handling - verify cycles don't cause infinite loop
- [ ] **Detail Panel:** Often missing loading state - verify skeleton shows during data fetch
- [ ] **Detail Panel:** Often missing error state - verify error message if fetch fails
- [ ] **Detail Panel:** Often missing close on Escape - verify Escape key closes panel
- [ ] **Detail Panel:** Often missing click-outside-to-close - verify clicking graph closes panel
- [ ] **Accessibility:** Often missing focus indicators - verify visible focus ring on all interactive elements
- [ ] **Performance:** Often missing memoization - verify React DevTools shows minimal re-renders
- [ ] **Performance:** Often missing large graph testing - verify 150+ node graphs still responsive

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Memoization-breaking re-renders | MEDIUM | Refactor to selectors, add `React.memo` with custom comparator |
| Stale closure bugs | LOW | Move logic to Zustand actions, fix dependency arrays |
| Memory leaks | LOW | Add cleanup functions, use AbortController |
| Z-index chaos | LOW | Restructure DOM, add pointer-event stops |
| Missing accessibility | MEDIUM | Add ARIA attributes, keyboard handlers, focus management |
| Highlight flicker | LOW | Batch state updates in single action |
| Performance at scale | HIGH | May require architecture changes (virtualization, web workers) |

---

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Memoization-breaking re-renders | Phase 1: Node Selection | Profiler shows <5 re-renders on selection |
| Stale closure state | Phase 2: Path Highlighting | Rapid-click E2E test passes |
| O(n*m) traversal | Phase 2: Path Highlighting | Performance test <10ms at 200 nodes |
| Memory leak from listeners | Phase 1 + Phase 3 | Memory profiler shows no growth |
| Z-index with panel | Phase 3: Detail Panel | Visual regression tests pass |
| Missing keyboard navigation | Phase 1: Node Selection | axe-core reports no violations |
| Highlight flicker | Phase 2: Path Highlighting | No intermediate frames without highlight |

---

## Sources

**React Flow Performance:**
- [React Flow Performance Guide](https://reactflow.dev/learn/advanced-use/performance) - Official documentation on memoization and re-render prevention (HIGH confidence)
- [Ultimate Guide to Optimize React Flow Project Performance](https://www.synergycodes.com/blog/guide-to-optimize-react-flow-project-performance) - Synergy Codes ebook on virtualization and event handling (HIGH confidence)
- [How I optimize my React Flow application](https://dev.to/tuannq/how-i-optimize-my-react-flow-application-5aoe) - Community optimization patterns (MEDIUM confidence)

**Zustand State Management:**
- [Avoiding stale state - Zustand Discussion #1394](https://github.com/pmndrs/zustand/discussions/1394) - Official guidance on preventing stale closures (HIGH confidence)
- [Stale Callback Values in React](https://brainsandbeards.com/blog/2024-stale-callback-values-in-react/) - Comprehensive explanation of closure issues (MEDIUM confidence)
- [How to fix stale React useState's state in a callback](https://dushkin.tech/posts/stale_state_react/) - Practical solutions (MEDIUM confidence)

**React Memoization:**
- [Fixing memoization-breaking re-renders in React - Sentry](https://blog.sentry.io/fixing-memoization-breaking-re-renders-in-react/) - Common memoization mistakes (HIGH confidence)
- [How to useMemo and useCallback: you can remove most of them](https://www.developerway.com/posts/how-to-use-memo-use-callback) - When memoization helps vs hurts (MEDIUM confidence)
- [How To Avoid Performance Pitfalls in React - DigitalOcean](https://www.digitalocean.com/community/tutorials/how-to-avoid-performance-pitfalls-in-react-with-memo-usememo-and-usecallback) (MEDIUM confidence)

**Memory Leaks:**
- [How to Fix Memory Leaks in React Applications](https://www.freecodecamp.org/news/fix-memory-leaks-in-react-apps/) - Event listener cleanup patterns (HIGH confidence)
- [React Hook on Unmount: Best Practices](https://www.dhiwise.com/post/react-hook-on-unmount-best-practices) - Cleanup function patterns (MEDIUM confidence)

**Accessibility:**
- [Building usable and accessible diagrams with React Flow](https://www.synergycodes.com/blog/building-usable-and-accessible-diagrams-with-react-flow) - WCAG compliance for diagrams (HIGH confidence)
- [How to build accessible graph visualization tools](https://cambridge-intelligence.com/build-accessible-data-visualization-apps-with-keylines/) - Keyboard navigation and screen reader patterns (MEDIUM confidence)

**React Flow GitHub Issues:**
- [Z-Index Discussion #4285](https://github.com/xyflow/xyflow/discussions/4285) - Node layering behavior (HIGH confidence)
- [Selection Box Issue #5211](https://github.com/xyflow/xyflow/issues/5211) - Zustand interaction bugs (MEDIUM confidence)

**Codebase Analysis:**
- `/Users/Daniel.Tehan/Code/lineage/lineage-ui/src/stores/useLineageStore.ts` - Current Zustand store patterns
- `/Users/Daniel.Tehan/Code/lineage/lineage-ui/src/components/domain/LineageGraph/hooks/useLineageHighlight.ts` - Current traversal implementation
- `/Users/Daniel.Tehan/Code/lineage/lineage-ui/src/components/domain/LineageGraph/TableNode/TableNode.tsx` - Current node implementation with potential re-render issues

---
*Pitfalls research for: Interactive Graph Features (Node Selection, Path Highlighting, Detail Panel)*
*Researched: 2026-02-01*
