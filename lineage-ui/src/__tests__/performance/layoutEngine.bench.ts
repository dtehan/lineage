/**
 * ELK.js Layout Performance Benchmarks
 *
 * Measures ELK.js layout algorithm performance for different graph sizes.
 * These benchmarks help identify layout bottlenecks and enable regression detection.
 *
 * Run with: npx vitest bench src/__tests__/performance/layoutEngine.bench.ts --run
 */

import { bench, describe, beforeAll } from 'vitest';
import { layoutGraph } from '../../utils/graph/layoutEngine';
import { generateGraph } from './fixtures/graphGenerators';

// Pre-generate graphs of different sizes (outside benchmark to avoid measuring generation time)
const graph50 = generateGraph(50);
const graph100 = generateGraph(100);
const graph200 = generateGraph(200);

describe('ELK Layout Performance', () => {
  // Warm-up: Run one layout before benchmarks to initialize ELK WASM
  beforeAll(async () => {
    await layoutGraph(graph50.nodes, graph50.edges);
  });

  bench(
    'layout 50 nodes',
    async () => {
      const result = await layoutGraph(graph50.nodes, graph50.edges);
      // Access result to prevent optimization
      if (result.nodes.length === 0 && graph50.nodes.length > 0) {
        throw new Error('Layout produced no nodes');
      }
    },
    { time: 5000 }
  );

  bench(
    'layout 100 nodes',
    async () => {
      const result = await layoutGraph(graph100.nodes, graph100.edges);
      if (result.nodes.length === 0 && graph100.nodes.length > 0) {
        throw new Error('Layout produced no nodes');
      }
    },
    { time: 5000 }
  );

  bench(
    'layout 200 nodes',
    async () => {
      const result = await layoutGraph(graph200.nodes, graph200.edges);
      if (result.nodes.length === 0 && graph200.nodes.length > 0) {
        throw new Error('Layout produced no nodes');
      }
    },
    { time: 5000 }
  );
});

describe('ELK Layout Metrics', () => {
  // Run single iterations to capture detailed timing breakdown
  bench(
    'metrics breakdown 100 nodes',
    async () => {
      const result = await layoutGraph(graph100.nodes, graph100.edges);
      // Log metrics for analysis (visible in verbose mode)
      if (result.metrics) {
        // Metrics are collected - benchmark passes
        return;
      }
    },
    { time: 3000 }
  );
});
