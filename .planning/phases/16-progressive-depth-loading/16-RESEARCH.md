# Phase 16: Progressive Depth Loading - Research

**Researched:** 2026-02-20
**Domain:** TanStack Query v5 chained queries, Zustand graph state, React Flow node stability, frontend loading UX
**Confidence:** HIGH

---

## Summary

Phase 16 implements a two-stage load pattern: show depth-1 lineage within 200ms, then automatically expand to the full-depth graph in the background. The API already accepts a `maxDepth` parameter, so no backend changes are required — this is entirely a frontend concern.

The architecture is a sequential two-query pattern in TanStack Query: query-1 fetches depth-1 (fires immediately on column click, hits the in-memory GraphEngine for <100ms response), and query-2 fetches full-depth (fires only after query-1 completes, using the `enabled` option). ELKjs layout runs exactly once — only after query-2 resolves. When query-1 resolves, nodes are stored in Zustand without triggering layout, then query-2 data is merged and layout fires once.

The key constraint is zero layout jitter: nodes visible in depth-1 must not change position when deeper nodes are added. This is satisfied by the "layout once on final data" decision already locked in prior research. No position-stability algorithm (like fixedNodePositions in ELK) is needed because the approach defers layout entirely to when the full dataset is available.

**Primary recommendation:** Use two sequential `useQuery` calls with `enabled: !!depth1Data` for the second query. Add `appendGraph()` action to Zustand for merging depth data without triggering re-layout. Update `useLoadingProgress` stages to cover the two-stage UX (depth-1 complete, full-depth loading).

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @tanstack/react-query | 5.90.19 (installed) | Sequential queries with `enabled` chaining | Already used; v5 `enabled` with data deps is idiomatic two-request polling |
| zustand | ^4.4.0 (installed) | Graph state + appendGraph action | Already used; single mutation to merge nodes/edges without layout side effects |
| @xyflow/react | ^12.0.0 (installed) | React Flow node rendering | Already used; `useNodesState`/`useEdgesState` hook pair |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| useLoadingProgress (internal) | existing hook | Stage tracking | Extend stages for depth-1 vs full-depth |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Two useQuery calls | SSE / streaming | SSE requires async Gunicorn workers (breaking change); polling is zero infrastructure |
| Deferred layout | ELK fixedNodePositions | Position stability requires enumerating existing node IDs before layout; deferred layout is simpler |
| Zustand appendGraph | setNodes directly in component | Local component state bypasses store, breaks DetailPanel and highlight features that read from store |

**Installation:** No new packages required. All libraries already installed.

---

## Architecture Patterns

### Recommended Project Structure

No new files needed unless the hook complexity warrants extraction:

```
lineage-ui/src/
├── api/hooks/
│   └── useOpenLineage.ts          # Add useProgressiveLineage hook here
├── stores/
│   └── useLineageStore.ts         # Add appendGraph() action
├── hooks/
│   └── useLoadingProgress.ts      # Extend LoadingStage type
└── components/domain/LineageGraph/
    └── LineageGraph.tsx            # Wire progressive loading
```

### Pattern 1: TanStack Query v5 Chained Queries with `enabled`

**What:** Query-2 is enabled only when query-1 data exists. TanStack Query v5 handles this cleanly because `enabled` accepts a boolean expression that can reference the previous query's `data`.

**When to use:** Any two-step fetch where step-2 depends on step-1 completing successfully.

**Example:**
```typescript
// Source: TanStack Query v5 docs — dependent queries pattern
function useProgressiveLineage(
  datasetId: string,
  fieldName: string,
  direction: LineageDirection,
  maxDepth: number,
  options?: { enabled?: boolean }
) {
  const enabled = (options?.enabled ?? true) && !!datasetId && !!fieldName;

  // Step 1: depth-1 fetch (fires immediately)
  const depth1Query = useQuery({
    queryKey: openLineageKeys.lineage(datasetId, fieldName, direction, 1),
    queryFn: () =>
      openLineageApi.getLineageGraph(datasetId, fieldName, {
        direction,
        maxDepth: 1,
      }),
    enabled,
    staleTime: 30_000,
  });

  // Step 2: full-depth fetch (fires only after depth-1 resolves)
  const fullDepthQuery = useQuery({
    queryKey: openLineageKeys.lineage(datasetId, fieldName, direction, maxDepth),
    queryFn: () =>
      openLineageApi.getLineageGraph(datasetId, fieldName, {
        direction,
        maxDepth,
      }),
    // Only fire after depth-1 has data AND full depth differs from 1
    enabled: enabled && !!depth1Query.data && maxDepth > 1,
    staleTime: 30_000,
  });

  return { depth1Query, fullDepthQuery };
}
```

**Confidence:** HIGH — TanStack Query v5 `enabled` with data dependency is documented and actively used in the codebase (see `useOpenLineage.ts` line 155).

### Pattern 2: Zustand `appendGraph()` for Merge Without Re-Layout

**What:** A new Zustand action that merges new nodes/edges into existing graph state by deduplicating on node/edge IDs. The layout effect in `LineageGraph.tsx` is conditioned on a `isFullDepthReady` flag rather than firing on every `data` change.

**When to use:** When you need to add depth-2+ nodes to an already-rendered depth-1 graph without triggering ELK a second time.

**Example:**
```typescript
// In useLineageStore.ts — add to LineageState interface and implementation
appendGraph: (newNodes: LineageNode[], newEdges: LineageEdge[]) => void;

// Implementation: merge by ID, dedup
appendGraph: (newNodes, newEdges) =>
  set((state) => {
    const existingNodeIds = new Set(state.nodes.map(n => n.id));
    const existingEdgeIds = new Set(state.edges.map(e => e.id));
    return {
      nodes: [
        ...state.nodes,
        ...newNodes.filter(n => !existingNodeIds.has(n.id)),
      ],
      edges: [
        ...state.edges,
        ...newEdges.filter(e => !existingEdgeIds.has(e.id)),
      ],
    };
  }),
```

**Confidence:** HIGH — Zustand `set` with functional updater is the standard pattern for derived state updates.

### Pattern 3: Single ELK Layout on Full-Depth Data

**What:** The `useEffect` that calls `layoutGraph()` in `LineageGraph.tsx` is guarded by a `isLayoutReady` condition. It only fires when full-depth data has resolved, not when depth-1 data arrives. Depth-1 data is stored in Zustand via `setGraph()` but does NOT trigger layout.

**When to use:** This is the zero-jitter guarantee. Layout must run once on the final node set.

**Example:**
```typescript
// LineageGraph.tsx — modified useEffect
useEffect(() => {
  // Only layout when we have the final (full-depth) data
  if (!isLayoutReady) return;  // isLayoutReady = fullDepthData is available
  if (!fullDepthData?.graph) return;
  // ... existing layoutGraph call unchanged
}, [fullDepthData, isLayoutReady, setNodes, setEdges, setGraph, setStage, setProgress, reset]);
```

**Key insight:** `isLayoutReady` is `true` when `fullDepthData` is available. If `maxDepth === 1`, `fullDepthData` is the same as `depth1Data`, so layout fires immediately — no regression for depth-1-only use.

### Pattern 4: Loading Progress Stages for Two-Phase UX

**What:** Extend `LoadingStage` in `useLoadingProgress.ts` to add a `depth1-complete` stage that shows a checkpoint indicator between the fetch and layout stages.

**Current stages:** `idle → fetching → layout → rendering → complete`

**Proposed stages:** `idle → fetching → depth1-complete → fetching-full → layout → rendering → complete`

Or simpler alternative (lower risk): reuse the existing `fetching` stage for both requests, update the `message` string to reflect which stage is active. The progress bar advances from 15% at depth-1-complete to 30% when full-depth lands.

**Simpler approach (recommended):** Update the message string dynamically in `LineageGraph.tsx` based on which query is active, rather than adding new stages to the hook. This avoids modifying a well-tested hook and its 20+ tests.

```typescript
// In LineageGraph.tsx — dynamic message without new stages
const displayMessage = (() => {
  if (depth1Query.isLoading) return 'Loading immediate lineage...';
  if (depth1Query.isSuccess && fullDepthQuery.isLoading) return 'Expanding to full depth...';
  return message; // fallback to useLoadingProgress message
})();
```

**Confidence:** HIGH for the pattern. The "simpler approach" recommendation is based on risk-minimizing principles given the existing well-tested hook.

### Anti-Patterns to Avoid

- **Running ELK after depth-1 data arrives:** Causes layout jitter when depth-2+ nodes are added. Position stability cannot be retroactively fixed without ELK's `fixedNodePositions` option, which requires knowing all existing node IDs upfront — complex and fragile.
- **Storing intermediate depth data in a separate Zustand slice:** Creates two sources of truth for nodes/edges. All graph state belongs in the single `nodes`/`edges` fields.
- **Using `useEffect` to watch depth-1 and immediately fire depth-2 fetch:** TanStack Query's `enabled` flag handles this declaratively without effect spaghetti.
- **Showing depth-1 rendered graph (with layout) then re-layout for full depth:** This is the "layout jitter" failure mode the phase explicitly prevents. Never render a partial layout.
- **Checking `maxDepth === 1` to skip the second query:** Wrong — the user may set maxDepth=1 intentionally. The second query should only be skipped when `depth1Query.data` is the same as full-depth data (when `maxDepth === 1`, the two queryKeys differ but the data should be equivalent — this is a cache hit).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Sequential async requests | Custom fetch chain with Promise chaining | TanStack Query `enabled` dependency | Query caching, deduplication, error handling, stale-while-revalidate all built in |
| Progress bar two-stage UX | Custom timeout/interval progress simulation | Extend existing `useLoadingProgress` hook | Already tested, already integrated in `LineageGraph.tsx` |
| Node deduplication on merge | Custom deep-equality check on nodes | Set-based ID dedup in `appendGraph()` | Node IDs are unique strings; ID-based dedup is O(n) and correct |
| Query coordination | Redux Saga / RxJS | TanStack Query `enabled` | Zero new dependencies; handles loading/error/success states |

**Key insight:** The entire progressive loading pattern is achievable by composing existing primitives (TanStack Query `enabled`, Zustand `set`, existing layoutGraph function). No new infrastructure is required.

---

## Common Pitfalls

### Pitfall 1: 200ms Budget Assumption About Network Latency

**What goes wrong:** The 200ms target is measured "from click to first visible graph nodes." If the backend is slow (warm-up not complete, CTE fallback active), depth-1 will exceed 200ms regardless of frontend changes. The 200ms target assumes the GraphEngine is warm and BFS returns in <100ms.

**Why it happens:** The requirement was written assuming Phase 14 (BFS) is always active. Phase 14's non-blocking daemon thread means BFS may not be ready for the first few requests after server restart.

**How to avoid:** Document that the 200ms target is conditional on `graph_engine.is_ready === True`. The frontend cannot control backend response time. The progressive loading UX still improves perceived performance even if the backend is slower.

**Warning signs:** Integration tests that assert 200ms will flake unless mocked.

### Pitfall 2: Query Key Collision Between Depth-1 and Full-Depth

**What goes wrong:** If `maxDepth` happens to be 1 (user set depth to 1), both queries have the same query key and TanStack Query deduplicates them into a single fetch. This is actually correct behavior, but the code must handle the case where `fullDepthQuery.data === depth1Query.data` without treating it as "still loading."

**Why it happens:** `openLineageKeys.lineage(datasetId, fieldName, direction, 1)` is the same key when `maxDepth === 1`.

**How to avoid:** Condition `fullDepthQuery.enabled` on `maxDepth > 1`. When `maxDepth === 1`, treat the single query result as both depth-1 and full-depth.

```typescript
const fullDepthQuery = useQuery({
  queryKey: openLineageKeys.lineage(datasetId, fieldName, direction, maxDepth),
  enabled: enabled && !!depth1Query.data && maxDepth > 1,
  // ...
});

// Derived: "final data" is full-depth if maxDepth > 1, else depth-1
const finalData = maxDepth > 1 ? fullDepthQuery.data : depth1Query.data;
const isLayoutReady = maxDepth > 1 ? !!fullDepthQuery.data : !!depth1Query.data;
```

### Pitfall 3: Loading Spinner Blocking Depth-1 Display

**What goes wrong:** `LineageGraph.tsx` currently shows `<LoadingProgress>` while `showProgress = isLoading || (stage !== 'idle' && stage !== 'complete')`. If the loading progress component blocks rendering until `stage === 'complete'`, the depth-1 graph will never appear until full-depth layout is done — defeating the purpose.

**Why it happens:** The current flow is: fetch → layout → render complete. There is no intermediate "show partial graph" state.

**How to avoid:** The depth-1 graph should NOT use the loading progress overlay. The depth-1 to full-depth transition shows only a subtle progress indicator (e.g., a thin banner or progress bar at the top), not a full-screen spinner. The full-screen spinner is only used for the initial load before depth-1 is available.

**Specifically:** The `showProgress` logic must change so that once depth-1 data is rendered (nodes are visible in React Flow), the full-screen spinner is replaced by an inline progress indicator for the background full-depth expansion.

### Pitfall 4: `appendGraph` Triggering ELK via Zustand Subscription

**What goes wrong:** If any component subscribes to `useLineageStore(state => state.nodes)` and calls `layoutGraph` on change, adding nodes via `appendGraph()` will trigger a re-layout.

**Why it happens:** The current `LineageGraph.tsx` does NOT subscribe to store nodes to trigger layout (it subscribes to `data` from TanStack Query). But a naive implementation could accidentally create this coupling.

**How to avoid:** Layout is triggered by the TanStack Query `fullDepthQuery.data` change, NOT by Zustand `nodes` changes. `appendGraph()` writes to the store for the DetailPanel and highlight features, but the layout effect must be conditioned on `fullDepthQuery.data`, not on `state.nodes`.

### Pitfall 5: React Flow `useNodesState` vs Zustand Nodes

**What goes wrong:** React Flow manages its own copy of nodes via `useNodesState`. Zustand stores a separate "legacy format" copy for the DetailPanel and highlights. When progressive loading adds new nodes, both need updating without layout conflicts.

**Why it happens:** The existing code already maintains this dual-state pattern: `setNodes(layoutedNodes)` updates React Flow, `setGraph(legacyNodes, legacyEdges)` updates Zustand. This is intentional but creates two places to update.

**How to avoid:** The layout effect already handles this correctly — it calls both `setNodes` and `setGraph`. For progressive loading, the pre-layout phase (while full-depth is loading) should call `setGraph` (Zustand) with depth-1 data but NOT call `setNodes` (React Flow). React Flow nodes are only set after layout completes on the full dataset.

---

## Code Examples

### Sequential Two-Query Hook (complete implementation sketch)

```typescript
// Source: TanStack Query v5 official docs, verified against installed 5.90.19
// File: lineage-ui/src/api/hooks/useOpenLineage.ts (add to existing file)

export function useProgressiveLineage(
  datasetId: string,
  fieldName: string,
  direction: LineageDirection,
  maxDepth: number,
  options?: { enabled?: boolean }
) {
  const isEnabled = (options?.enabled ?? true) && !!datasetId && !!fieldName;

  const depth1Query = useQuery({
    queryKey: openLineageKeys.lineage(datasetId, fieldName, direction, 1),
    queryFn: () =>
      openLineageApi.getLineageGraph(datasetId, fieldName, { direction, maxDepth: 1 }),
    enabled: isEnabled,
    staleTime: 30_000,
  });

  const fullDepthQuery = useQuery({
    queryKey: openLineageKeys.lineage(datasetId, fieldName, direction, maxDepth),
    queryFn: () =>
      openLineageApi.getLineageGraph(datasetId, fieldName, { direction, maxDepth }),
    enabled: isEnabled && !!depth1Query.data && maxDepth > 1,
    staleTime: 30_000,
  });

  const isDepth1Ready = !!depth1Query.data;
  const isFullDepthReady = maxDepth <= 1 ? isDepth1Ready : !!fullDepthQuery.data;
  const finalData = isFullDepthReady
    ? (maxDepth <= 1 ? depth1Query.data : fullDepthQuery.data)
    : null;

  return {
    depth1Query,
    fullDepthQuery,
    isDepth1Ready,
    isFullDepthReady,
    finalData,
    isLoading: depth1Query.isLoading,
    isFetchingFullDepth: maxDepth > 1 && isDepth1Ready && fullDepthQuery.isLoading,
    error: depth1Query.error ?? fullDepthQuery.error,
  };
}
```

### Loading Progress Message Override

```typescript
// In LineageGraph.tsx — replace single query usage with progressive hook
// Dynamic message without new LoadingStage values

const { depth1Query, fullDepthQuery, isDepth1Ready, isFullDepthReady, finalData, error } =
  useProgressiveLineage(datasetId, fieldName, direction, maxDepth, {
    enabled: !isTableView && !!datasetId && !!fieldName,
  });

const isFetchingFullDepth = maxDepth > 1 && isDepth1Ready && fullDepthQuery.isLoading;

// Override message during full-depth background fetch
const displayMessage = isFetchingFullDepth
  ? 'Expanding to full depth...'
  : message; // from useLoadingProgress

// Show full-screen spinner only during initial (depth-1) load
const showProgress = depth1Query.isLoading || (stage !== 'idle' && stage !== 'complete');
```

### Layout Effect Gated on Full-Depth Data

```typescript
// Layout fires ONLY when finalData (full-depth) is available
useEffect(() => {
  if (!finalData?.graph) return;
  // ... identical to current layoutGraph call
}, [finalData, setNodes, setEdges, setGraph, setStage, setProgress, reset]);
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single depth fetch, full spinner | Two sequential queries, depth-1 visible first | Phase 16 (this phase) | 200ms first-paint vs 1-3s |
| ELK after every data update | ELK once on final data | Phase 16 (this phase) | Zero layout jitter |
| `LoadingStage` with 4 stages | Same 4 stages + dynamic message override | Phase 16 (this phase) | No test churn in useLoadingProgress |

**Deprecated/outdated:**
- Single `useOpenLineageGraph` call in `LineageGraph.tsx` for column lineage: Replaced by `useProgressiveLineage` hook

---

## Open Questions

1. **Table-level lineage progressive loading**
   - What we know: `LineageGraph.tsx` uses `useOpenLineageTableLineage` for `fieldName === '_all'`. Phase description focuses on "clicking a column" (column lineage path).
   - What's unclear: Should table-level lineage also use progressive loading? Table queries are more expensive (all columns) so depth-1 is more valuable here, but the requirements only mention "clicking a column."
   - Recommendation: Implement progressive loading for column lineage only (PROG-01 requirement). Table lineage can remain a single full-depth query. Mark as a potential follow-up.

2. **Cache hit behavior for depth-1 followed by full-depth**
   - What we know: TanStack Query uses the queryKey for caching. `maxDepth: 1` and `maxDepth: 5` have different query keys, so they are independently cached.
   - What's unclear: If a user navigates back to the same column, should depth-1 flash before showing the cached full-depth result?
   - Recommendation: Use `staleTime: 30_000` on both queries. On cache hit, both `isSuccess` immediately — depth-1 resolves in the same render cycle as full-depth, so no flash occurs. Verify in implementation.

3. **Progress indicator component placement**
   - What we know: `LoadingProgress` is a full-screen centered overlay (in `showProgress` branch). There's no non-blocking progress indicator.
   - What's unclear: The PROG-05 requirement says "loading indicator shows the two-stage progress." Should this be: (a) the existing full-screen spinner updated with new messages, or (b) a new small inline indicator while the graph is already visible?
   - Recommendation: Option (b) — small inline progress bar shown only during the full-depth background fetch, positioned in the toolbar area. The full-screen spinner only covers the depth-1 loading phase. Plan 16-02 should create a simple `<ProgressBanner>` component or extend `<Toolbar>` to show inline progress.

---

## Sources

### Primary (HIGH confidence)
- TanStack Query v5 installed: `node_modules/@tanstack/react-query` v5.90.19 — confirmed `enabled` option supports boolean data dependencies
- Codebase: `lineage-ui/src/api/hooks/useOpenLineage.ts` — confirmed existing query key factory and hook patterns
- Codebase: `lineage-ui/src/components/domain/LineageGraph/LineageGraph.tsx` — confirmed layout effect structure, dual-state (React Flow + Zustand), `useLoadingProgress` integration
- Codebase: `lineage-ui/src/stores/useLineageStore.ts` — confirmed existing `setGraph` action, no `appendGraph` exists yet
- Codebase: `lineage-ui/src/hooks/useLoadingProgress.ts` — confirmed 4 existing `LoadingStage` values, auto-advance simulation in `fetching` stage
- Codebase: `lineage-api/services/lineage_service.py` — confirmed `max_depth` parameter flows to BFS/CTE, depth-1 is valid
- Codebase: `lineage-api/graph/engine.py` — confirmed BFS traversal with `max_depth` cutoff via `single_source_shortest_path_length`

### Secondary (MEDIUM confidence)
- TanStack Query v5 dependent queries pattern: `enabled: !!firstQuery.data` — standard documented pattern, verified against installed version

### Tertiary (LOW confidence)
- 200ms depth-1 target: Dependent on `graph_engine.is_ready === True`. Unverified against actual BFS response times in the target environment. Planner should note this caveat.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already installed and in use
- Architecture: HIGH — patterns verified against existing codebase code
- Pitfalls: HIGH — derived from reading actual implementation, not assumptions

**Research date:** 2026-02-20
**Valid until:** 2026-03-20 (stable libraries; TanStack Query v5 API unlikely to change)
