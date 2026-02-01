# Phase 18: Frontend Rendering Performance - Research

**Researched:** 2026-01-31
**Domain:** React Flow graph visualization, ELK.js layout performance, frontend benchmarking
**Confidence:** HIGH

## Summary

This research investigates how to benchmark and optimize the frontend rendering pipeline for large lineage graphs (100+ nodes). The current implementation uses React Flow (@xyflow/react v12) with ELK.js (v0.9) for automatic layout calculation. The phase focuses on measuring performance at 50, 100, and 200 node thresholds, identifying bottlenecks, and ensuring zoom/pan interactions remain under 100ms.

The standard approach for React Flow performance optimization centers on three areas: (1) virtualization via `onlyRenderVisibleElements`, (2) component memoization, and (3) state decoupling. For ELK.js, the key optimization is using Web Workers to offload layout calculation from the main thread. The existing codebase already uses `memo()` on TableNode and LineageEdge components, and conditionally enables `onlyRenderVisibleElements` at 50+ nodes.

**Primary recommendation:** Create an automated benchmark suite using Vitest's `bench` function with `performance.now()` timing, measuring both ELK layout time and React Flow render time separately for 50/100/200 node graphs. Use the results to determine whether to optimize layout (Web Workers) or rendering (threshold tuning) first.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @xyflow/react | ^12.0.0 | Graph visualization | Already in use; industry standard for React graph UIs |
| elkjs | ^0.9.0 | Automatic graph layout | Already in use; ELK layered algorithm is optimal for directed graphs |
| Vitest | ^1.1.0 | Benchmarking | Built-in `bench` function via Tinybench; already configured |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| performance.now() | Web API | High-resolution timing | Measuring execution time within benchmarks |
| React Profiler | Built-in | Component render timing | Measuring React-specific render durations |
| Chrome DevTools | Browser | Performance profiling | Visual profiling of interactions |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Vitest bench | Benchmark.js | Benchmark.js more mature but separate dependency |
| ELK.js bundled | ELK.js Web Worker | Web Worker version prevents UI blocking but adds complexity |
| jsdom | happy-dom | happy-dom is faster for Vitest but may need test adjustments |

**Installation:**
No new packages needed - all tools already available in the project.

## Architecture Patterns

### Recommended Benchmark Structure
```
lineage-ui/
├── src/
│   └── __tests__/
│       └── performance/           # NEW: Performance benchmarks
│           ├── layoutEngine.bench.ts    # ELK.js layout benchmarks
│           ├── graphRender.bench.ts     # React Flow render benchmarks
│           └── fixtures/                # Test graph generators
│               └── graphGenerators.ts   # 50/100/200 node graph factories
```

### Pattern 1: Vitest Benchmark Files
**What:** Separate `.bench.ts` files for performance tests
**When to use:** Testing ELK layout and React Flow rendering performance
**Example:**
```typescript
// Source: Vitest documentation
import { bench, describe } from 'vitest';
import { layoutGraph } from '../../utils/graph/layoutEngine';
import { generateGraph } from './fixtures/graphGenerators';

describe('ELK Layout Performance', () => {
  const graph50 = generateGraph(50);
  const graph100 = generateGraph(100);
  const graph200 = generateGraph(200);

  bench('layout 50 nodes', async () => {
    await layoutGraph(graph50.nodes, graph50.edges);
  }, { time: 5000 });

  bench('layout 100 nodes', async () => {
    await layoutGraph(graph100.nodes, graph100.edges);
  }, { time: 5000 });

  bench('layout 200 nodes', async () => {
    await layoutGraph(graph200.nodes, graph200.edges);
  }, { time: 5000 });
});
```

### Pattern 2: High-Resolution Timing with performance.now()
**What:** Precise timing measurement within layout function
**When to use:** Adding timing instrumentation to layoutGraph
**Example:**
```typescript
// Source: MDN Performance API documentation
export async function layoutGraph(
  rawNodes: LineageNode[],
  rawEdges: LineageEdge[],
  options: LayoutOptions = {}
): Promise<{ nodes: Node[]; edges: Edge[]; metrics?: LayoutMetrics }> {
  const metrics: LayoutMetrics = {
    prepTime: 0,
    elkTime: 0,
    transformTime: 0,
    totalTime: 0,
  };

  const totalStart = performance.now();

  // Prep phase
  const prepStart = performance.now();
  const tableGroups = groupColumnsByTable(rawNodes);
  metrics.prepTime = performance.now() - prepStart;

  // ELK layout phase
  const elkStart = performance.now();
  const layoutedGraph = await elk.layout(elkGraph);
  metrics.elkTime = performance.now() - elkStart;

  // Transform phase
  const transformStart = performance.now();
  // ... transform to React Flow format
  metrics.transformTime = performance.now() - transformStart;

  metrics.totalTime = performance.now() - totalStart;

  return { nodes: layoutedNodes, edges: layoutedEdges, metrics };
}
```

### Pattern 3: React Profiler for Render Timing
**What:** Built-in React component for measuring render performance
**When to use:** Measuring React Flow component render durations
**Example:**
```typescript
// Source: React official documentation
import { Profiler, ProfilerOnRenderCallback } from 'react';

const onRender: ProfilerOnRenderCallback = (
  id,          // Profiler tree ID
  phase,       // "mount" | "update"
  actualDuration,  // Time spent rendering
  baseDuration,    // Estimated time without memoization
  startTime,
  commitTime
) => {
  console.log({
    id,
    phase,
    actualDuration,
    baseDuration,
  });
};

// Wrap ReactFlow in Profiler for measurement
<Profiler id="LineageGraph" onRender={onRender}>
  <ReactFlow nodes={nodes} edges={edges} ... />
</Profiler>
```

### Pattern 4: Graph Generator for Consistent Test Data
**What:** Factory functions that create graphs of specific sizes
**When to use:** Generating consistent test data for benchmarks
**Example:**
```typescript
// Pattern from existing correctness.test.ts
interface TestGraph {
  nodes: LineageNode[];
  edges: LineageEdge[];
  nodeCount: number;
  edgeCount: number;
}

/**
 * Generates a multi-table lineage graph with specified node count
 * Uses fan-out pattern with multiple depth levels
 */
export function generateGraph(nodeCount: number): TestGraph {
  const nodes: LineageNode[] = [];
  const edges: LineageEdge[] = [];

  // Layer sizes for fan-out/fan-in pattern (approximation)
  const layers = Math.ceil(Math.sqrt(nodeCount));
  const nodesPerLayer = Math.ceil(nodeCount / layers);

  for (let layer = 0; layer < layers; layer++) {
    for (let i = 0; i < nodesPerLayer && nodes.length < nodeCount; i++) {
      const nodeId = `db.t${nodes.length}.col${i}`;
      nodes.push({
        id: nodeId,
        type: 'column',
        databaseName: 'db',
        tableName: `t${nodes.length}`,
        columnName: `col${i}`,
      });

      // Connect to previous layer nodes
      if (layer > 0) {
        const prevLayerStart = (layer - 1) * nodesPerLayer;
        const sourceIndex = prevLayerStart + (i % nodesPerLayer);
        if (sourceIndex < nodes.length - 1) {
          edges.push({
            id: `e_${sourceIndex}_${nodes.length - 1}`,
            source: nodes[sourceIndex].id,
            target: nodeId,
            transformationType: 'DIRECT',
          });
        }
      }
    }
  }

  return { nodes, edges, nodeCount: nodes.length, edgeCount: edges.length };
}
```

### Anti-Patterns to Avoid
- **Inline node/edge component definitions:** Causes new references on every render, defeating memoization
- **Accessing nodes/edges arrays in child components:** Triggers re-renders when any node changes
- **Complex CSS on nodes:** Shadows, gradients, and animations cause expensive repaints
- **Blocking layout calculation:** Running ELK on main thread freezes UI for large graphs

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Benchmark timing | Manual Date.now() loops | Vitest `bench` | Tinybench handles warmup, iterations, statistics |
| Render profiling | Custom timing hooks | React Profiler | Built-in, accurate, handles concurrent mode |
| Layout offloading | Custom Web Worker | ELK.js workerUrl | ELK has built-in Web Worker support |
| Node virtualization | Custom viewport culling | `onlyRenderVisibleElements` | React Flow handles this internally |
| Graph generation | Hardcoded test data | Generator functions | Flexible, consistent, parameterized |

**Key insight:** The React Flow and ELK.js libraries have built-in performance features (virtualization, Web Workers) that should be leveraged before building custom solutions.

## Common Pitfalls

### Pitfall 1: Measuring in Development Mode
**What goes wrong:** React development mode adds significant overhead (strict mode double-renders, profiler instrumentation)
**Why it happens:** Forgetting that dev builds are ~10x slower than production
**How to avoid:** Run benchmarks with `npm run build && npm run preview` or configure Vitest to use production React
**Warning signs:** Dramatically different timings between local and CI

### Pitfall 2: Not Warming Up ELK.js
**What goes wrong:** First layout call is much slower due to WASM initialization
**Why it happens:** ELK.js has startup overhead that amortizes over subsequent calls
**How to avoid:** Run one warm-up layout before starting benchmark iterations
**Warning signs:** First iteration is 2-5x slower than subsequent ones

### Pitfall 3: State Updates During Measurement
**What goes wrong:** Zustand store updates trigger cascading re-renders
**Why it happens:** Graph loading updates multiple store slices (nodes, edges, selectedId, etc.)
**How to avoid:** Use batch updates, measure only the rendering phase, not state updates
**Warning signs:** Profiler shows many "update" phases during initial load

### Pitfall 4: Incorrect onlyRenderVisibleElements Threshold
**What goes wrong:** Virtualization overhead exceeds benefit for small graphs
**Why it happens:** Viewport calculation has a cost; not worth it for < ~50 nodes
**How to avoid:** Benchmark with virtualization on/off at different thresholds
**Warning signs:** Small graphs render slower with virtualization enabled

### Pitfall 5: Measuring Layout + Render Together
**What goes wrong:** Cannot identify which phase is the bottleneck
**Why it happens:** Layout and render are sequential but different optimizations apply
**How to avoid:** Measure ELK time and React render time separately
**Warning signs:** Total time is slow but cannot determine if layout or render is the cause

## Code Examples

Verified patterns from official sources:

### Vitest Benchmark Configuration
```typescript
// vitest.config.ts update for benchmarks
// Source: Vitest documentation
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    benchmark: {
      include: ['**/*.bench.ts'],
      reporters: ['default', 'json'],
      outputFile: './benchmark-results.json',
    },
  },
});
```

### Running Benchmarks
```bash
# Source: Vitest documentation
# Run benchmarks
npm run vitest bench

# Run specific benchmark file
npm run vitest bench src/__tests__/performance/layoutEngine.bench.ts

# Compare against baseline
npm run vitest bench --compare baseline.json
```

### React Flow onlyRenderVisibleElements
```typescript
// Source: React Flow documentation
// Current implementation in LineageGraph.tsx (line 433)
<ReactFlow
  nodes={filteredNodesAndEdges.filteredNodes}
  edges={filteredNodesAndEdges.filteredEdges}
  // ... other props
  onlyRenderVisibleElements={filteredNodesAndEdges.filteredNodes.length > 50}
/>
```

### ELK.js Web Worker Setup
```typescript
// Source: ELK.js GitHub documentation
import ELK from 'elkjs';

// Current: Bundled version (blocks main thread)
const elk = new ELK();

// Optimized: Web Worker version
const elk = new ELK({
  workerUrl: './node_modules/elkjs/lib/elk-worker.min.js'
});

// Layout call is the same, but runs in background
const layoutedGraph = await elk.layout(elkGraph);
```

### ELK.js measureExecutionTime Option
```typescript
// Source: ELK.js GitHub documentation
const elkGraph: ElkNode = {
  id: 'root',
  layoutOptions: {
    'elk.algorithm': 'layered',
    'elk.measureExecutionTime': 'true', // Returns timing in ms
  },
  children: elkNodes,
  edges: elkEdges,
};

// After layout, check graph.timing for ELK-internal measurements
```

### Progress UI with ETA
```typescript
// Pattern for enhanced progress indicator
// Building on existing useLoadingProgress hook

interface EnhancedProgress {
  stage: LoadingStage;
  progress: number;
  message: string;
  estimatedTimeRemaining?: number; // ms
  elapsedTime: number; // ms
}

// In layout function, track timing
const startTime = performance.now();
// ... after ELK layout
const elkElapsed = performance.now() - startTime;
// Estimate remaining time based on historical data or node count
const estimatedTotal = elkElapsed * (nodeCount > 100 ? 1.5 : 1.2);
const estimatedRemaining = estimatedTotal - elkElapsed;
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| dagre.js | ELK.js layered | 2023-2024 | Better hierarchical layout, more configuration options |
| react-flow | @xyflow/react v12 | 2024 | Package rename, performance improvements |
| Manual viewport culling | onlyRenderVisibleElements | React Flow v11+ | Built-in virtualization |
| console.time() | performance.now() | Long established | Sub-millisecond precision |
| Jest benchmarks | Vitest bench | 2024-2025 | Native ESM, faster, built-in |

**Deprecated/outdated:**
- **dagre.js:** Still works but ELK provides better results for layered graphs
- **Manual date/time benchmarking:** Use Vitest bench or performance.now()
- **react-flow package name:** Now @xyflow/react

## Open Questions

Things that couldn't be fully resolved:

1. **Optimal onlyRenderVisibleElements threshold**
   - What we know: Currently set at 50 nodes
   - What's unclear: Whether 50 is optimal or should be higher/lower
   - Recommendation: Benchmark at 25, 50, 75, 100 thresholds and compare

2. **Web Worker benefit for typical graph sizes**
   - What we know: Web Workers prevent UI blocking
   - What's unclear: Whether the overhead is worth it for graphs < 200 nodes
   - Recommendation: Benchmark bundled vs worker versions

3. **ETA calculation accuracy**
   - What we know: Can measure elapsed time and estimate total
   - What's unclear: How to accurately predict layout time before running it
   - Recommendation: Build a simple model based on node/edge count from benchmark data

## Sources

### Primary (HIGH confidence)
- [React Flow Performance Documentation](https://reactflow.dev/learn/advanced-use/performance) - Virtualization, memoization patterns
- [Vitest Documentation - Features](https://vitest.dev/guide/features) - bench function, Tinybench integration
- [MDN Performance.now()](https://developer.mozilla.org/en-US/docs/Web/API/Performance/now) - High-precision timing API
- [React Profiler Documentation](https://react.dev/reference/react/Profiler) - Component render measurement

### Secondary (MEDIUM confidence)
- [ELK.js GitHub](https://github.com/kieler/elkjs) - Web Worker support, configuration options
- [React Performance Tracks](https://react.dev/reference/dev-tools/react-performance-tracks) - Chrome DevTools integration (React 19.2+)
- [Synergy Codes React Flow Optimization Guide](https://www.synergycodes.com/webbook/guide-to-optimize-react-flow-project-performance) - Community best practices

### Tertiary (LOW confidence)
- Various DEV.to articles on React Flow optimization - Community patterns, needs validation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All tools already in project, well-documented
- Architecture: HIGH - Patterns from official documentation
- Pitfalls: MEDIUM - Based on common patterns, some from community sources

**Research date:** 2026-01-31
**Valid until:** 60 days (stable libraries, well-established patterns)
