/**
 * Hover Highlight Computation Performance Benchmarks
 *
 * Measures the time to compute connected nodes for hover/click highlighting.
 * This benchmarks the core algorithm used by useLineageHighlight: given a node ID,
 * traverse the adjacency map (upstream + downstream) to find all connected nodes.
 *
 * These benchmarks measure pure JavaScript computation time, not browser render time.
 * Values are for relative comparison (regression detection), not absolute performance targets.
 *
 * Run with: npx vitest bench src/__tests__/performance/hoverHighlight.bench.ts --run
 */

import { bench, describe } from 'vitest';
import { generateGraph, generateLayeredGraph } from './fixtures/graphGenerators';

/**
 * Builds upstream and downstream adjacency maps from edges.
 * This mirrors the internal data structure of useLineageHighlight.
 */
function buildAdjacencyMaps(edges: Array<{ source: string; target: string }>) {
  const upstream = new Map<string, Set<string>>();
  const downstream = new Map<string, Set<string>>();

  for (const edge of edges) {
    if (!upstream.has(edge.target)) upstream.set(edge.target, new Set());
    upstream.get(edge.target)!.add(edge.source);

    if (!downstream.has(edge.source)) downstream.set(edge.source, new Set());
    downstream.get(edge.source)!.add(edge.target);
  }

  return { upstream, downstream };
}

/**
 * BFS traversal to find all connected nodes from a starting node.
 * This is the same algorithm used by the highlight hook when a user
 * hovers or clicks a column in the lineage graph.
 */
function computeConnectedNodes(
  nodeId: string,
  maps: ReturnType<typeof buildAdjacencyMaps>
): Set<string> {
  const visited = new Set<string>();
  const queue = [nodeId];

  while (queue.length > 0) {
    const current = queue.pop()!;
    if (visited.has(current)) continue;
    visited.add(current);

    for (const neighbor of maps.upstream.get(current) ?? []) {
      queue.push(neighbor);
    }
    for (const neighbor of maps.downstream.get(current) ?? []) {
      queue.push(neighbor);
    }
  }

  return visited;
}

// Pre-generate graphs outside bench callbacks to avoid including
// generation time in benchmark measurements
const graph50 = generateGraph(50);
const graph100 = generateGraph(100);
const graph200 = generateGraph(200);

const maps50 = buildAdjacencyMaps(
  graph50.edges.map((e) => ({ source: e.source, target: e.target }))
);
const maps100 = buildAdjacencyMaps(
  graph100.edges.map((e) => ({ source: e.source, target: e.target }))
);
const maps200 = buildAdjacencyMaps(
  graph200.edges.map((e) => ({ source: e.source, target: e.target }))
);

// Pick middle nodes for traversal (exercises both upstream and downstream paths)
const midNode50 = graph50.nodes[Math.floor(graph50.nodes.length / 2)].id;
const midNode100 = graph100.nodes[Math.floor(graph100.nodes.length / 2)].id;
const midNode200 = graph200.nodes[Math.floor(graph200.nodes.length / 2)].id;

// Pre-generate layered graphs
const deepGraph = generateLayeredGraph(20, 5); // 100 nodes, deep
const wideGraph = generateLayeredGraph(5, 20); // 100 nodes, wide

const deepMaps = buildAdjacencyMaps(
  deepGraph.edges.map((e) => ({ source: e.source, target: e.target }))
);
const wideMaps = buildAdjacencyMaps(
  wideGraph.edges.map((e) => ({ source: e.source, target: e.target }))
);

const deepFirstNode = deepGraph.nodes[0].id;
const wideFirstNode = wideGraph.nodes[0].id;

describe('Hover Highlight Computation', () => {
  bench(
    'highlight computation 50 nodes',
    () => {
      computeConnectedNodes(midNode50, maps50);
    },
    { time: 5000 }
  );

  bench(
    'highlight computation 100 nodes',
    () => {
      computeConnectedNodes(midNode100, maps100);
    },
    { time: 5000 }
  );

  bench(
    'highlight computation 200 nodes',
    () => {
      computeConnectedNodes(midNode200, maps200);
    },
    { time: 5000 }
  );
});

describe('Adjacency Map Construction', () => {
  bench(
    'build adjacency maps 100 nodes',
    () => {
      buildAdjacencyMaps(
        graph100.edges.map((e) => ({ source: e.source, target: e.target }))
      );
    },
    { time: 5000 }
  );

  bench(
    'build adjacency maps 200 nodes',
    () => {
      buildAdjacencyMaps(
        graph200.edges.map((e) => ({ source: e.source, target: e.target }))
      );
    },
    { time: 5000 }
  );
});

describe('Deep Graph Highlight', () => {
  bench(
    'highlight on deep graph (20 layers x 5 wide)',
    () => {
      computeConnectedNodes(deepFirstNode, deepMaps);
    },
    { time: 5000 }
  );

  bench(
    'highlight on wide graph (5 layers x 20 wide)',
    () => {
      computeConnectedNodes(wideFirstNode, wideMaps);
    },
    { time: 5000 }
  );
});
