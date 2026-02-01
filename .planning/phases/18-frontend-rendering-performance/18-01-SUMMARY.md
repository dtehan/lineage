---
phase: 18
plan: 01
subsystem: frontend-performance
tags: [benchmarks, elk-layout, react-flow, performance, vitest]

dependency_graph:
  requires: []
  provides:
    - graph-generators
    - layout-metrics
    - benchmark-suite
  affects:
    - 18-02 (optimization implementation)

tech_stack:
  added:
    - vitest-bench (experimental benchmark API)
  patterns:
    - graph-generator-factories
    - timing-metrics-instrumentation
    - cache-on-first-access

file_tracking:
  created:
    - lineage-ui/src/__tests__/performance/fixtures/graphGenerators.ts
    - lineage-ui/src/__tests__/performance/layoutEngine.bench.ts
    - lineage-ui/src/__tests__/performance/graphRender.bench.ts
  modified:
    - lineage-ui/src/utils/graph/layoutEngine.ts
    - lineage-ui/vitest.config.ts
    - lineage-ui/package.json

decisions:
  - id: bench-timing
    choice: Use vitest bench with 5000ms time option
    reason: Provides enough iterations for statistical significance

metrics:
  duration: 7 min
  completed: 2026-02-01
---

# Phase 18 Plan 01: Performance Benchmark Suite Summary

Automated benchmark suite for measuring ELK.js layout and React Flow rendering performance with large graphs (50, 100, 200 nodes).

## What Was Built

### Graph Generator Utilities

Created `graphGenerators.ts` with factory functions for generating test graphs:

- **`generateGraph(nodeCount)`**: Creates multi-table lineage graphs with cross-table edges
  - Uses layer pattern: sqrt(nodeCount) layers with nodeCount/layers columns per layer
  - Each column in separate table to test cross-database edge layout path
  - Returns `{ nodes, edges, nodeCount, edgeCount }`

- **`generateLayeredGraph(depth, breadth)`**: Creates graphs with specific dimensions
  - Useful for testing deep (many layers) vs wide (many nodes per layer) graphs

- **`generateSingleDatabaseGraph(nodeCount)`**: Creates same-database graphs
  - Tests compound node layout path (database clustering)

### Layout Timing Metrics

Added `LayoutMetrics` interface and instrumentation to `layoutEngine.ts`:

```typescript
interface LayoutMetrics {
  prepTime: number;      // groupColumnsByTable + transformToTableNodes
  elkTime: number;       // elk.layout() call
  transformTime: number; // mapping ELK results to React Flow format
  totalTime: number;     // end-to-end
}
```

Metrics are only collected when `NODE_ENV !== 'production'` to avoid overhead in production.

### Benchmark Files

**ELK Layout Benchmarks (`layoutEngine.bench.ts`):**
- Warm-up run to initialize ELK WASM
- 50/100/200 node layout benchmarks
- Metrics breakdown benchmark

**React Flow Render Benchmarks (`graphRender.bench.ts`):**
- 50/100/200 node render benchmarks
- Update/re-render performance test
- Viewport change simulation
- Uses cached graph preparation to isolate render time from layout time

### Configuration

- Updated `vitest.config.ts` with benchmark configuration
- Added `bench` and `bench:run` npm scripts

## Baseline Performance Results

### ELK Layout Performance

| Graph Size | Mean Time | Operations/sec | vs 50 nodes |
|------------|-----------|----------------|-------------|
| 50 nodes   | 14.9ms    | 67 ops/sec     | baseline    |
| 100 nodes  | 22.9ms    | 44 ops/sec     | 1.53x slower|
| 200 nodes  | 50.3ms    | 20 ops/sec     | 3.38x slower|

**Scaling Analysis:**
- 50 -> 100 nodes (2x): 1.54x time increase (sub-linear)
- 100 -> 200 nodes (2x): 2.20x time increase (slightly super-linear)
- Layout scales reasonably well with graph size

### React Flow Render Performance (JSDOM)

| Graph Size | Mean Time | Operations/sec | vs 50 nodes |
|------------|-----------|----------------|-------------|
| 50 nodes   | 7.5ms     | 133 ops/sec    | baseline    |
| 100 nodes  | 14.4ms    | 69 ops/sec     | 1.92x slower|
| 200 nodes  | 41.8ms    | 24 ops/sec     | 5.57x slower|

**Scaling Analysis:**
- 50 -> 100 nodes (2x): 1.92x time increase (roughly linear)
- 100 -> 200 nodes (2x): 2.90x time increase (super-linear)
- Render scales worse than layout for large graphs

### Bottleneck Identification

For a 100-node graph:
- **Layout time: ~23ms**
- **Render time: ~14ms**
- **Total: ~37ms**

**Current bottleneck is ELK layout** (62% of total time), but render time grows faster as graph size increases.

## Recommendations for Plan 02

Based on benchmark results, prioritize optimizations in this order:

1. **ELK Layout Optimizations**
   - Investigate Web Worker offloading for layout calculation
   - Consider incremental/partial layout for graph updates
   - Evaluate ELK options that trade accuracy for speed

2. **React Flow Render Optimizations**
   - Implement virtualization for off-screen nodes
   - Memoize node and edge components
   - Use `useMemo` for computed styles and positions

3. **Combined Optimizations**
   - Cache layouted graphs to skip re-layout on re-render
   - Debounce rapid viewport changes
   - Progressive rendering for initial load

## Files Modified

| File | Changes |
|------|---------|
| `graphGenerators.ts` | New file - graph factory functions |
| `layoutEngine.bench.ts` | New file - ELK layout benchmarks |
| `graphRender.bench.ts` | New file - React Flow render benchmarks |
| `layoutEngine.ts` | Added LayoutMetrics, timing instrumentation |
| `vitest.config.ts` | Added benchmark configuration |
| `package.json` | Added bench/bench:run scripts |

## Commits

| Hash | Description |
|------|-------------|
| 9e5e5d5 | Graph generators and ELK layout benchmarks |
| 3c110c4 | React Flow render benchmarks and npm scripts |

## Running Benchmarks

```bash
# Run all benchmarks (watch mode)
npm run bench

# Run all benchmarks (single run)
npm run bench:run

# Run specific benchmark file
npx vitest bench src/__tests__/performance/layoutEngine.bench.ts --run
```

## Deviations from Plan

None - plan executed exactly as written.

## Next Phase Readiness

Phase 18 Plan 02 (Performance Optimizations) can begin with:
- Baseline metrics established
- Graph generators ready for testing optimizations
- Benchmark suite ready for regression detection
