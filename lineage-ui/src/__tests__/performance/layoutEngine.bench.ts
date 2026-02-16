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
const graph400 = generateGraph(400);
const graph600 = generateGraph(600);

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

  bench(
    'layout 400 nodes',
    async () => {
      const result = await layoutGraph(graph400.nodes, graph400.edges);
      if (result.nodes.length === 0 && graph400.nodes.length > 0) {
        throw new Error('Layout produced no nodes');
      }
    },
    { time: 10000 }
  );

  bench(
    'layout 600 nodes',
    async () => {
      const result = await layoutGraph(graph600.nodes, graph600.edges);
      if (result.nodes.length === 0 && graph600.nodes.length > 0) {
        throw new Error('Layout produced no nodes');
      }
    },
    { time: 15000 }
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

describe('ELK Layout Depth Benchmarks', () => {
  // Generate a graph with 200 nodes at depth 20 (10 nodes per layer across 20 layers)
  const deepGraph = generateGraph(200, { depth: 20 });

  bench(
    'layout 200 nodes depth 20',
    async () => {
      const result = await layoutGraph(deepGraph.nodes, deepGraph.edges);
      if (result.nodes.length === 0) {
        throw new Error('Layout produced no nodes');
      }
    },
    { time: 10000 }
  );
});
