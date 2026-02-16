/**
 * Web Worker Layout Performance Benchmarks
 *
 * Benchmarks the layout computation that runs in the Web Worker.
 * Note: Vitest runs in Node.js/jsdom which doesn't support Web Workers with import.meta.url,
 * so we benchmark the underlying layoutGraph function directly. The Worker adds ~1-5ms overhead
 * for structured clone serialization (measured via JSON.stringify/parse as a baseline).
 *
 * Web Worker adds structured clone overhead (~1-5ms for 600 nodes based on JSON.stringify/parse baseline).
 * Actual Worker communication uses structured clone algorithm which is typically 2-3x faster than JSON
 * for typed arrays but similar for plain objects.
 *
 * Run with: npx vitest bench src/__tests__/performance/workerLayout.bench.ts --run
 */

import { bench, describe } from 'vitest';
import { layoutGraph } from '../../utils/graph/layoutEngine';
import { generateGraph } from './fixtures/graphGenerators';

// Pre-generate graphs for consistent benchmarking
const graph200 = generateGraph(200);
const graph600 = generateGraph(600);

describe('Worker Layout Baseline', () => {
  bench(
    'layoutGraph 200 nodes (Worker payload)',
    async () => {
      const result = await layoutGraph(graph200.nodes, graph200.edges);
      if (result.nodes.length === 0) {
        throw new Error('No nodes');
      }
    },
    { time: 5000 }
  );

  bench(
    'layoutGraph 600 nodes (Worker payload)',
    async () => {
      const result = await layoutGraph(graph600.nodes, graph600.edges);
      if (result.nodes.length === 0) {
        throw new Error('No nodes');
      }
    },
    { time: 15000 }
  );
});

describe('Serialization Overhead Estimate', () => {
  const graph600 = generateGraph(600);

  bench(
    'JSON serialize/deserialize 600-node result',
    () => {
      // Simulates structured clone overhead for Worker communication
      const serialized = JSON.stringify({
        nodes: graph600.nodes,
        edges: graph600.edges,
      });
      const deserialized = JSON.parse(serialized);
      if (!deserialized.nodes) {
        throw new Error('Parse failed');
      }
    },
    { time: 3000 }
  );
});
