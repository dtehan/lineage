# Phase 19: Layout Engine Foundation - Research

**Researched:** 2026-02-21
**Domain:** React/TypeScript graph layout engine — Web Workers, topological sort, bounding-box geometry, deterministic color hashing
**Confidence:** HIGH (all findings verified against live codebase; no external library research needed — all required tools already installed)

---

## Summary

Phase 19 is a pure bug-fix and performance-hardening pass confined to `layoutEngine.ts`, `DatabaseLineageGraph.tsx`, and `ClusterBackground.tsx`. No new libraries, no API changes, no React Flow component changes. The codebase already contains a Web Worker infrastructure (`layout.worker.ts` + `useLayoutWorker.ts`) that is fully wired and tested — but `DatabaseLineageGraph.tsx` bypasses it, calling `layoutGraph()` directly on the main thread. The six bugs are independently identifiable in the current source code.

The work decomposes naturally into two plans matching the two phase items:
- **Plan 19-01** (LFND-04 + LFND-05): Wire `DatabaseLineageGraph` to use the existing Worker infrastructure and fix the direction-change race condition with a generation counter.
- **Plan 19-02** (LFND-01 + LFND-02 + LFND-03 + LFND-06): Fix four algorithmic bugs in `layoutEngine.ts` and `ClusterBackground.tsx`.

All six fixes are isolated changes. No caller interface changes. The existing test suite (260+ Vitest unit tests + 73 database tests) provides the regression safety net.

**Primary recommendation:** Fix each of the six bugs as a targeted surgical edit to the specific lines identified below. Do not refactor surrounding code.

---

## Standard Stack

### Core (already installed — no installation needed)

| Library | Version | Purpose | Role in Phase 19 |
|---------|---------|---------|-----------------|
| `comlink` | ^4.4.2 | Type-safe Worker communication | Already used in `useLayoutWorker.ts` — DatabaseLineageGraph just needs to call it |
| `@xyflow/react` | ^12.0.0 | React Flow graph rendering | `useStore`, `ReactFlowState`, `nodeLookup` — used by ClusterBackground |
| `vitest` | ^1.1.0 | Unit test runner | Existing test suite validates all fixes |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `elkjs` | ^0.9.0 | ELK layout (fallback path only) | `layoutSimpleNodes()` — NOT touched in Phase 19 |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Generation counter for race condition | AbortController | AbortController cannot cancel a Promise already-in-flight; generation counter is simpler and sufficient for this synchronous-result pattern |
| String hash for deterministic color | CSS custom property mapping | Hash approach is self-contained in one function; CSS vars would require DOM coupling |

**Installation:** None required. All dependencies are already present.

---

## Architecture Patterns

### Recommended Project Structure

No structural changes. All edits stay within existing files:

```
lineage-ui/src/
├── utils/graph/
│   └── layoutEngine.ts          # LFND-01, LFND-03, LFND-06 fixes
├── components/domain/LineageGraph/
│   ├── DatabaseLineageGraph.tsx  # LFND-04, LFND-05 fixes
│   └── ClusterBackground.tsx    # LFND-02, LFND-06 fixes
└── workers/
    ├── layout.worker.ts          # No changes needed
    └── layout.types.ts           # No changes needed
```

### Pattern 1: Generation Counter for Async Race Condition (LFND-05)

**What:** A module-level (or ref-based) monotonically increasing integer prevents stale async results from being applied after a newer request has superseded them.

**When to use:** Any `useEffect` that fires an async operation and the direction/input can change before the Promise resolves.

**Current broken code in `DatabaseLineageGraph.tsx` (lines 163-197):**
```typescript
// BAD: `cancelled` boolean is set in cleanup, but `layoutGraph` Promise
// may have already resolved between direction change and cleanup running.
// If direction changes twice rapidly, two Promises race to setNodes().
let cancelled = false;

layoutGraph(converted.nodes, converted.edges, { ... })
  .then(({ nodes: layoutedNodes, edges: layoutedEdges }) => {
    if (cancelled) return;  // BUG: too late if Promise already resolved
    setNodes(layoutedNodes);
    ...
  });

return () => {
  cancelled = true;  // Only prevents future .then() — cannot undo already-resolved
  reset();
};
```

**Fixed pattern:**
```typescript
// GOOD: Generation counter approach
// Place ref at component level (survives renders, not affected by closure):
const generationRef = useRef(0);

// Inside the useEffect:
const generation = ++generationRef.current;

layoutGraph(converted.nodes, converted.edges, { onProgress: (p) => setProgress(p) })
  .then(({ nodes: layoutedNodes, edges: layoutedEdges }) => {
    if (generation !== generationRef.current) return; // Stale — ignore
    setStage('rendering');
    setNodes(layoutedNodes);
    setEdges(layoutedEdges);
    setGraph(converted.nodes, converted.edges);
    ...
  })
  .catch((err) => {
    if (generation !== generationRef.current) return;
    ...
  });
```

The `cancelled` boolean approach works only when the cleanup runs synchronously before the Promise resolves. With async Promises and React StrictMode double-invocation, the generation counter is the correct pattern.

### Pattern 2: Worker Migration (LFND-04)

**What:** `DatabaseLineageGraph.tsx` currently calls `layoutGraph()` directly. The Worker infrastructure in `useLayoutWorker.ts` is already built and tested — it just needs to be called.

**Current code (DatabaseLineageGraph.tsx line 172):**
```typescript
// ON MAIN THREAD — blocks React rendering during layout
layoutGraph(converted.nodes, converted.edges, {
  onProgress: (p) => setProgress(p),
})
```

**Fixed pattern:**
```typescript
// Add hook at component top:
const { layoutGraph: workerLayoutGraph } = useLayoutWorker();

// In useEffect — runs in Worker thread, main thread stays responsive:
workerLayoutGraph(converted.nodes, converted.edges, {
  // Note: onProgress callback cannot be passed to Worker (functions are not
  // structured-clone-able). Remove onProgress or use a fixed progress value.
})
.then(...)
```

**Important constraint:** The `onProgress` callback in `LayoutOptions` cannot be passed across the Worker boundary via structured clone. The Worker API in `layout.types.ts` accepts `LayoutOptions` including `onProgress`, but Comlink will silently drop non-serializable values. The fix should either:
1. Remove `onProgress` from the Worker call and set progress to fixed values (35 → 90) around the Worker call, OR
2. Keep a manual progress tick before/after the Worker call.

Looking at the existing `LayoutOptions` type:
```typescript
export interface LayoutOptions {
  direction?: 'RIGHT' | 'LEFT' | 'DOWN' | 'UP';
  nodeSpacing?: number;
  layerSpacing?: number;
  onProgress?: (progress: number) => void;  // Cannot cross Worker boundary
}
```

The correct approach: pass only serializable options to the Worker, emit fixed progress milestones manually before and after the Worker call.

### Pattern 3: O(V+E) Kahn Sort Fix (LFND-01)

**What:** The current Kahn sort in `layoutEngine.ts` (lines 419-428) calls `topoQueue.sort()` inside the while loop. This degrades from O(V+E) to O(V·E·logV) for large graphs.

**Current broken code (layoutEngine.ts lines 419-428):**
```typescript
topoQueue.sort();          // Initial sort — OK
while (topoQueue.length > 0) {
  topoQueue.sort();        // BUG: O(V·logV) per iteration = O(V²·logV) total
  const current = topoQueue.shift()!;
  topoOrder.push(current);
  for (const target of tableAdj.get(current) || new Set<string>()) {
    const nd = inDegCopy.get(target)! - 1;
    inDegCopy.set(target, nd);
    if (nd === 0) topoQueue.push(target);
  }
}
```

**Fixed pattern — insert in sorted position:**
```typescript
topoQueue.sort();  // Initial sort only
while (topoQueue.length > 0) {
  const current = topoQueue.shift()!;  // Already sorted — no re-sort needed
  topoOrder.push(current);
  for (const target of tableAdj.get(current) || new Set<string>()) {
    const nd = inDegCopy.get(target)! - 1;
    inDegCopy.set(target, nd);
    if (nd === 0) {
      // Insert in sorted position to maintain O(V+E) overall
      // Binary search insertion keeps this O(V·logV) total, not O(V²·logV)
      const insertIdx = topoQueue.findIndex(id => id > target);
      if (insertIdx === -1) topoQueue.push(target);
      else topoQueue.splice(insertIdx, 0, target);
    }
  }
}
```

Alternatively (simpler): collect all zero-in-degree nodes after each iteration and sort once per batch — this is textbook O(V+E) with deterministic tie-breaking.

**Note:** `topoSortDatabases()` (lines 229-250) has the same `queue.sort()` inside the loop pattern. Both occurrences need fixing.

### Pattern 4: ClusterBackground Stale Dimensions Fix (LFND-02)

**What:** `calculateClusterBounds()` in `ClusterBackground.tsx` (line 77) uses `node.measured?.width ?? node.width ?? 280`. This reads from `node.measured` which is populated by React Flow's internal ResizeObserver **after** layout. During the layout phase or on direction change, `measured` is stale or absent, causing incorrect bounding box sizes.

**Current broken code (ClusterBackground.tsx lines 72-85):**
```typescript
nodeIds.forEach((nodeId) => {
  const node = nodeInternals.get(nodeId);
  if (node && node.position) {
    const x = node.position.x;
    const y = node.position.y;
    const width = (node.measured?.width ?? node.width ?? 280) as number;   // STALE
    const height = (node.measured?.height ?? node.height ?? 100) as number; // STALE
    ...
  }
});
```

**Fix:** Pass pre-calculated dimensions from `layoutEngine.ts` (which already computes `calculateTableNodeWidth` and `calculateTableNodeHeight`) into `ClusterBackground`. This requires the cluster data to carry pre-computed dimensions, or `ClusterBackground` to look them up from the node data.

The node's `data` property (a `TableNodeData` object) already contains the table name and columns. The cluster component can compute dimensions deterministically from node data rather than relying on ResizeObserver measurements:

```typescript
// In ClusterBackground.tsx calculateClusterBounds:
// Instead of reading node.measured (stale), read node.data (always fresh from layout)
const nodeData = node.data as { tableName?: string; columns?: Array<unknown>; isExpanded?: boolean };
const width = nodeData.tableName && nodeData.columns
  ? calculateTableNodeWidth(nodeData.tableName, nodeData.columns as ColumnDefinition[])
  : (node.measured?.width ?? node.width ?? 280);
const height = nodeData.columns
  ? calculateTableNodeHeight(nodeData.columns.length, nodeData.isExpanded ?? true)
  : (node.measured?.height ?? node.height ?? 100);
```

**Important:** `calculateTableNodeWidth` and `calculateTableNodeHeight` are already exported from `layoutEngine.ts`. Import them directly into `ClusterBackground.tsx`.

### Pattern 5: Non-Contiguous Bounding Box Fix (LFND-03)

**What:** `separateDatabaseClusters()` in `layoutEngine.ts` (lines 284-299) computes `lo`/`hi` extents using only the **node position** plus a single pre-computed `size`. This is correct for single-column layout scenarios. However, when a database has nodes in **non-contiguous layout zones** (e.g., nodes at x=0 and x=800 in a RIGHT-direction layout because they have different layer depths), the bounding box `lo=0, hi=800+nodeWidth` is dramatically over-expanded. Subsequent cluster separation then applies an incorrect shift.

**Root cause:** The current `separateDatabaseClusters` loop:
```typescript
dbNodes.forEach((node) => {
  const td = tableNodeData.find((t) => t.id === node.id)!;
  const size = isHorizontal
    ? calculateTableNodeWidth(td.tableName, td.columns)
    : calculateTableNodeHeight(td.columns.length, td.isExpanded);
  const pos = isHorizontal ? node.position.x : node.position.y;
  lo = Math.min(lo, pos);
  hi = Math.max(hi, pos + size);  // Only adds width of THIS node, not the gap
});
```

When nodes from one DB span multiple layers (e.g., a source table in layer 0 at x=0 and a derived table in layer 2 at x=800), the bounding box hi becomes `800 + nodeWidth` — correctly spanning the cluster. But the PROBLEM is the cluster separation algorithm then treats this as the "rightmost edge" of the first database's cluster, placing the second database's cluster to the right of it even when the second database's tables should interleave with the first database's layer 2 tables.

**Fix:** The bounding box must use the actual rendered extent of each node. Since `calculateTableNodeWidth/Height` gives the correct size per node, the current formula is already correct for the extent calculation. The real problem is the `separateDatabaseClusters` function assumes all nodes of a database form a single contiguous strip along the primary axis — this assumption breaks when a database has tables across multiple depth layers.

**Correct fix:** The cluster separation must use the per-node `[lo_i, hi_i]` intervals and only shift later databases when their intervals actually overlap with earlier databases. The current algorithm computes one global `{lo, hi}` per database and assumes all space within that range belongs to that database — this is the false assumption. The fix is to compute `[lo, hi]` correctly as the actual hull of all node extents (which the current code already does, it just needs to be combined with the per-node sizes properly).

Looking at the test that fails: when db_a has a node at x=500 and db_b has a node at x=0 in a RIGHT direction layout, and dbOrder says db_b is upstream (index 0), the result should place db_b LEFT of db_a. The current code handles this ordering correctly. The LFND-03 bug manifests when nodes of the same database appear at non-contiguous positions (e.g., db has tables at layers 0 and 3 but not 1 and 2, while another db has tables at layers 1 and 2). In this case the bounding box for the first db spans from layer 0 to layer 3, forcing the second db entirely to the right even though its tables could fit in layers 1-2.

**Fix approach:** Accept that in these edge cases, cluster boxes will be large. The correct fix for LFND-03 is to compute per-cluster bounding boxes as the convex hull of node positions + sizes (which is what the current code does). The actual fix is to ensure the `hi` calculation accounts for the **full node dimension** including width, not just position. Verify the `hi = pos + size` calculation is correct for `RIGHT`/`LEFT` (uses width) and `DOWN`/`UP` (uses height). The code looks correct at first glance — the LFND-03 bug may be that `size` is computed once per node correctly, but the `lo`/`hi` bounds then include gap space. This needs validation with a multi-database test fixture that has non-contiguous nodes.

### Pattern 6: Deterministic Color Hashing (LFND-06)

**What:** Both `ClusterBackground.tsx` and `useDatabaseClusters.ts` use `index % FALLBACK_COLORS.length` to assign colors to unknown database names. The `index` comes from the Map iteration order, which is insertion order in JavaScript — but insertion order depends on the order nodes appear in the API response. Different renders or page refreshes can produce different insertion orders, causing the same database to get different colors.

**Fix:** Replace the `index`-based lookup with a deterministic string hash of the database name:

```typescript
// Deterministic hash function (djb2 variant, sufficient for color assignment)
function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
    hash = hash >>> 0; // Force unsigned 32-bit integer
  }
  return hash;
}

function getColorForDatabase(databaseName: string): string {
  if (DATABASE_COLORS[databaseName]) {
    return DATABASE_COLORS[databaseName];
  }
  // Deterministic: same name always maps to same color
  return FALLBACK_COLORS[hashString(databaseName) % FALLBACK_COLORS.length];
}
```

This change removes the `index` parameter from `getColorForDatabase` / `getDatabaseColor` calls throughout both files.

**Files affected:**
- `ClusterBackground.tsx`: `getDatabaseColor(name, index)` → `getDatabaseColor(name)` (remove `index` param)
- `useDatabaseClusters.ts`: `getColorForDatabase(name, index)` → `getColorForDatabase(name)` (remove `index` param)

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Worker communication | Custom postMessage protocol | `comlink` (already installed) | Type safety, error propagation, Promise-based API |
| String hash for colors | MD5/SHA, crypto.subtle | djb2 variant (3 lines) | No library needed; crypto is async and overkill for color assignment |
| O(V+E) topological sort | Custom priority queue | Sorted insertion with `findIndex` + `splice` | The graph is small enough (200-500 tables) that linear insertion is acceptable; no heap library needed |

**Key insight:** All required solutions are implementable with TypeScript primitives and already-installed libraries. The complexity is in identifying the exact lines to change, not in choosing new tools.

---

## Common Pitfalls

### Pitfall 1: onProgress Cannot Cross Worker Boundary
**What goes wrong:** Passing `onProgress: (p) => setProgress(p)` in the LayoutOptions to the Worker causes a Comlink error or silent drop because functions cannot be structured-cloned.
**Why it happens:** Comlink uses the structured clone algorithm which cannot serialize function objects.
**How to avoid:** Strip `onProgress` from options before passing to Worker. Emit manual progress steps: `setProgress(35)` before Worker call, `setProgress(90)` in `.then()` handler.
**Warning signs:** `DataCloneError` in browser console, or progress never advancing.

### Pitfall 2: useLayoutWorker Creates Worker at Module Load
**What goes wrong:** `useLayoutWorker.ts` creates the Worker at module load time (line 17): `const workerInstance = new Worker(...)`. If the module is imported in a test environment (jsdom/Node), this throws because `Worker` is not defined in Node.
**Why it happens:** Module-level side effects execute on import, before any mocks are set up.
**How to avoid:** The existing test suite mocks this correctly (check `test/setup.ts`). No change needed — just don't add new module-level Worker instantiations.
**Warning signs:** Test failures with `Worker is not defined` in CI.

### Pitfall 3: Generation Counter Must Be a Ref, Not State
**What goes wrong:** Using `useState` for the generation counter causes re-renders on each direction change, which re-runs the effect and creates an infinite loop.
**Why it happens:** `setState` triggers re-renders, which re-trigger `useEffect` if the state value is in the deps array.
**How to avoid:** Use `useRef(0)` — refs are mutable containers that don't trigger re-renders.
**Warning signs:** Infinite re-renders or stale closure issues in the effect.

### Pitfall 4: sort() Inside While Loop is the Core LFND-01 Bug
**What goes wrong:** `topoQueue.sort()` inside the `while (topoQueue.length > 0)` loop sorts the entire queue on every iteration. At 400+ tables with ~10-20 items in the queue per iteration, this is ~400 × 15 × log(15) ≈ ~24,000 comparisons vs ~400 × 2 = ~800 for the correct approach.
**Why it happens:** The sort was added for determinism (alphabetical tie-breaking) but placed inside the loop as a defensive measure.
**How to avoid:** Sort once initially, then maintain sort order using insertion-sort behavior when new items are pushed. The queue never needs a full re-sort because only one item is removed per iteration and at most a handful of items are added.
**Warning signs:** Browser profiler shows `Array.prototype.sort` appearing in the hot path for 400+ node graphs.

### Pitfall 5: Two Color-Lookup Functions in Different Files
**What goes wrong:** Both `ClusterBackground.tsx` and `useDatabaseClusters.ts` have their own `DATABASE_COLORS` map and `FALLBACK_COLORS` array. Fixing only one file leaves the other file with index-based coloring.
**Why it happens:** The color logic was duplicated during development of these two components.
**How to avoid:** Fix both files. Better: extract to a shared utility. However, the phase constraint says "no new files unless required" — fix both files in place.
**Warning signs:** Cluster colors match on the graph view but not in useDatabaseClusters output (or vice versa).

### Pitfall 6: ClusterBackground Reads nodeLookup from React Flow Store
**What goes wrong:** `ClusterBackground` accesses node dimensions via `useStore((state) => state.nodeLookup)`. The `nodeLookup` is only updated **after** React Flow has measured nodes via ResizeObserver. Immediately after `setNodes()`, the lookup has stale or absent `measured` values.
**Why it happens:** React Flow's measurement cycle is asynchronous — it measures nodes after they render to DOM, not when they're set.
**How to avoid:** For LFND-02, use the pre-calculated node dimensions from `layoutEngine.ts` (which are based on content, not DOM measurement) instead of `node.measured`. Import `calculateTableNodeWidth` and `calculateTableNodeHeight` into `ClusterBackground.tsx`.
**Warning signs:** Cluster boxes are too small or zero-sized immediately after layout, then "jump" to correct size once React Flow measures nodes.

---

## Code Examples

Verified patterns from the live codebase:

### Current Worker Infrastructure (already working — just needs to be called)

```typescript
// /lineage-ui/src/components/domain/LineageGraph/hooks/useLayoutWorker.ts
// This hook exists and works. DatabaseLineageGraph just needs to call it:

const { layoutGraph: workerLayoutGraph } = useLayoutWorker();

// Then in useEffect replace:
// layoutGraph(converted.nodes, converted.edges, { onProgress: ... })
// With:
// workerLayoutGraph(converted.nodes, converted.edges, { direction })
```

### Generation Counter (LFND-05 fix location: DatabaseLineageGraph.tsx)

```typescript
// Add at component top alongside other refs:
const generationRef = useRef(0);

// Inside useEffect that runs layout:
const generation = ++generationRef.current;

workerLayoutGraph(converted.nodes, converted.edges, { direction })
  .then(({ nodes: layoutedNodes, edges: layoutedEdges }) => {
    if (generation !== generationRef.current) return; // Stale result — discard
    // ... rest of .then() handler
  })
  .catch((err) => {
    if (generation !== generationRef.current) return;
    // ... rest of .catch() handler
  });
```

### Kahn Sort Fix (LFND-01 fix location: layoutEngine.ts, two occurrences)

```typescript
// BEFORE (inside while loop — O(V²·logV)):
while (topoQueue.length > 0) {
  topoQueue.sort();  // REMOVE THIS LINE
  const current = topoQueue.shift()!;
  ...
  if (nd === 0) topoQueue.push(target);  // After push, re-sort is needed for determinism
}

// AFTER (sort once, maintain order on insert):
while (topoQueue.length > 0) {
  const current = topoQueue.shift()!;  // Queue is already sorted
  topoOrder.push(current);
  for (const target of tableAdj.get(current) || new Set<string>()) {
    const nd = inDegCopy.get(target)! - 1;
    inDegCopy.set(target, nd);
    if (nd === 0) {
      // Insert in sorted position for determinism
      let lo = 0, hi = topoQueue.length;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (topoQueue[mid] < target) lo = mid + 1;
        else hi = mid;
      }
      topoQueue.splice(lo, 0, target);
    }
  }
}
```

### Deterministic Color Hash (LFND-06)

```typescript
// Replace the index-based color lookup in BOTH ClusterBackground.tsx and useDatabaseClusters.ts:

function hashDatabaseName(name: string): number {
  let h = 5381;
  for (let i = 0; i < name.length; i++) {
    h = ((h << 5) + h) ^ name.charCodeAt(i);
    h = h >>> 0; // unsigned
  }
  return h;
}

// Then:
function getDatabaseColor(databaseName: string): string {  // remove index param
  if (DATABASE_COLORS[databaseName]) return DATABASE_COLORS[databaseName];
  return FALLBACK_COLORS[hashDatabaseName(databaseName) % FALLBACK_COLORS.length];
}
```

### Pre-Calculated Dimensions for ClusterBackground (LFND-02)

```typescript
// In ClusterBackground.tsx, import from layoutEngine:
import { calculateTableNodeWidth, calculateTableNodeHeight } from '../../../utils/graph/layoutEngine';
import type { TableNodeData } from '../../../utils/graph/layoutEngine';

// In calculateClusterBounds, replace stale measured dimensions:
const nodeData = node.data as TableNodeData | undefined;
let width: number;
let height: number;

if (nodeData?.tableName && nodeData?.columns) {
  width = calculateTableNodeWidth(nodeData.tableName, nodeData.columns);
  height = calculateTableNodeHeight(nodeData.columns.length, nodeData.isExpanded ?? true);
} else {
  // Fallback for non-table nodes (database nodes, etc.)
  width = (node.measured?.width ?? node.width ?? 280) as number;
  height = (node.measured?.height ?? node.height ?? 100) as number;
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| ELK layout for column graphs | Custom topological layout (Kahn + longest-path) | Already implemented (pre-Phase 19) | O(V+E) vs potential ELK hang on dense graphs |
| Main-thread layout | Worker via Comlink | Already built, not yet wired for DatabaseLineageGraph | DatabaseLineageGraph still runs on main thread |
| Index-based cluster colors | Still index-based (bug) | Phase 19 fixes this | Same DB always gets same color after fix |

**Deprecated/outdated:**
- `ELK.layout()` for column-level graphs: replaced by the custom topological sort. The `layoutSimpleNodes()` function still uses ELK for table-level fallback graphs. This is intentional and not changed in Phase 19.

---

## Open Questions

1. **LFND-03 exact failure mode**
   - What we know: `separateDatabaseClusters` computes `{lo, hi}` correctly as position + node size; the algorithm then uses these extents to shift databases apart
   - What's unclear: The exact scenario where "non-contiguous node groups across layout zones" causes incorrect behavior. The current test `'shifts later database right when bounding boxes overlap'` passes. The bug may only manifest with 3+ databases where database A has tables in layers 0 and 3, database B has tables in layers 1-2, and the bounding box of A falsely encompasses B's territory.
   - Recommendation: Create a test fixture with this specific topology (A at layers 0,3; B at layers 1,2) and observe whether the cluster boxes overlap or over-separate. The fix may be as simple as using the correct `size` (width vs height based on direction) — verify the current code uses `calculateTableNodeWidth` for horizontal and `calculateTableNodeHeight` for vertical, which it does.

2. **Worker onProgress approach**
   - What we know: `onProgress` callback cannot cross the Worker boundary via structured clone
   - What's unclear: Whether the current `LoadingProgress` component needs granular progress updates or if fixed milestones (35% before Worker, 90% after) are sufficient UX
   - Recommendation: Use fixed milestones. The topological layout is fast (sub-ms for 500 tables); the loading bar is primarily cosmetic.

3. **useDatabaseClusters.ts vs ClusterBackground.tsx duplication**
   - What we know: Both files implement the same color logic independently. `ClusterBackground.tsx` has `getDatabaseColor(name, index)` and `useDatabaseClusters.ts` has `getColorForDatabase(name, index)`.
   - What's unclear: Which one is actually used in production. `DatabaseLineageGraph.tsx` imports `useDatabaseClustersFromNodes` from `ClusterBackground.tsx` (not from `useDatabaseClusters.ts`). The `useDatabaseClusters.ts` hook may be unused in the DatabaseLineageGraph flow.
   - Recommendation: Fix both for correctness. Do not consolidate into a shared module in Phase 19 (that's scope creep). Verify which hook is called in `DatabaseLineageGraph.tsx` and `AllDatabasesLineageGraph.tsx`.

---

## Sources

### Primary (HIGH confidence — live codebase)

- `/lineage-ui/src/utils/graph/layoutEngine.ts` — Contains all six bugs. Kahn sort at lines 419-428; topoSortDatabases Kahn sort at lines 229-250; separateDatabaseClusters at lines 262-340; onProgress at line 25.
- `/lineage-ui/src/components/domain/LineageGraph/DatabaseLineageGraph.tsx` — Main thread layout call at line 172; cancelled-boolean race at lines 164-197; missing Worker import.
- `/lineage-ui/src/components/domain/LineageGraph/ClusterBackground.tsx` — Stale measured dimensions at lines 72-85; index-based color at lines 42-47, 114, 207.
- `/lineage-ui/src/components/domain/LineageGraph/hooks/useDatabaseClusters.ts` — Index-based color at lines 46-51, 121.
- `/lineage-ui/src/components/domain/LineageGraph/hooks/useLayoutWorker.ts` — Existing Worker infrastructure; Worker created at line 17; `layout()` method exposed via Comlink.
- `/lineage-ui/src/workers/layout.worker.ts` — Worker implementation; calls `layoutGraph` directly.
- `/lineage-ui/src/workers/layout.types.ts` — `LayoutWorkerAPI` interface; `onProgress` in `LayoutOptions` is serialization-problematic.
- `/lineage-ui/src/utils/graph/layoutEngine.test.ts` — 73+ existing tests; all must continue to pass after fixes.

### Secondary (MEDIUM confidence)

- Comlink structured clone limitation: Functions are not structured-clone-able per MDN Web Docs (Web Workers communication spec). The `onProgress` callback cannot cross the Worker boundary.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified against package.json and live imports
- Architecture: HIGH — all patterns verified against live codebase line numbers
- Pitfalls: HIGH — each pitfall is visible in the current source code
- LFND-03 exact failure scenario: MEDIUM — the bug is described in requirements but the exact reproduction case in the current codebase was not observed in tests (existing tests pass for the described scenarios)

**Research date:** 2026-02-21
**Valid until:** 2026-03-21 (stable codebase, no fast-moving dependencies)
