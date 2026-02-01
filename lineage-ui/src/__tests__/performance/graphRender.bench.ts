/**
 * React Flow Render Performance Benchmarks
 *
 * Measures React Flow rendering time for pre-layouted graphs of varying sizes.
 * These benchmarks run in JSDOM, so absolute numbers are not representative of
 * browser performance. The value is in relative comparison (50 vs 100 vs 200 nodes).
 *
 * Run with: npx vitest bench src/__tests__/performance/graphRender.bench.ts --run
 *
 * Note: React Flow render benchmarks in JSDOM have limitations:
 * - No actual DOM painting/compositing
 * - No GPU acceleration
 * - Focus on React reconciliation and virtual DOM diffing
 */

import { bench, describe } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { createElement } from 'react';
import { ReactFlow, ReactFlowProvider } from '@xyflow/react';
import type { Node, Edge } from '@xyflow/react';
import { layoutGraph } from '../../utils/graph/layoutEngine';
import { generateGraph } from './fixtures/graphGenerators';

// Pre-layouted graph storage
interface PreparedGraph {
  nodes: Node[];
  edges: Edge[];
}

// Cache for prepared graphs (lazy initialization)
const graphCache = new Map<number, PreparedGraph>();

/**
 * Prepares a graph by generating and layouting it synchronously.
 * Uses a cache to avoid re-computing for each benchmark iteration.
 */
async function prepareGraph(nodeCount: number): Promise<PreparedGraph> {
  if (graphCache.has(nodeCount)) {
    return graphCache.get(nodeCount)!;
  }
  const generated = generateGraph(nodeCount);
  const layouted = await layoutGraph(generated.nodes, generated.edges);
  const prepared = {
    nodes: layouted.nodes,
    edges: layouted.edges,
  };
  graphCache.set(nodeCount, prepared);
  return prepared;
}

/**
 * Creates the FlowWrapper element using createElement to avoid JSX parsing issues
 */
function createFlowElement(nodes: Node[], edges: Edge[]) {
  return createElement(
    'div',
    { style: { width: '1200px', height: '800px' } },
    createElement(
      ReactFlowProvider,
      null,
      createElement(ReactFlow, {
        nodes,
        edges,
        fitView: true,
        nodesDraggable: false,
        nodesConnectable: false,
        elementsSelectable: false,
      })
    )
  );
}

describe('React Flow Render Performance', () => {
  bench(
    'render 50 nodes',
    async () => {
      const graph = await prepareGraph(50);
      render(createFlowElement(graph.nodes, graph.edges));
      cleanup();
    },
    { time: 5000 }
  );

  bench(
    'render 100 nodes',
    async () => {
      const graph = await prepareGraph(100);
      render(createFlowElement(graph.nodes, graph.edges));
      cleanup();
    },
    { time: 5000 }
  );

  bench(
    'render 200 nodes',
    async () => {
      const graph = await prepareGraph(200);
      render(createFlowElement(graph.nodes, graph.edges));
      cleanup();
    },
    { time: 5000 }
  );
});

describe('React Flow Update Performance', () => {
  bench(
    'update 100 nodes (re-render)',
    async () => {
      const graph = await prepareGraph(100);
      // Initial render
      const { rerender } = render(
        createFlowElement(graph.nodes, graph.edges)
      );

      // Update with same data (tests React reconciliation)
      rerender(
        createFlowElement([...graph.nodes], [...graph.edges])
      );
      cleanup();
    },
    { time: 5000 }
  );
});

describe('React Flow Interaction Responsiveness', () => {
  bench(
    'viewport change simulation',
    async () => {
      const graph = await prepareGraph(100);
      // Measure how quickly the component can handle a viewport change
      const modifiedNodes = graph.nodes.map((node) => ({
        ...node,
        position: {
          x: node.position.x + 100,
          y: node.position.y + 50,
        },
      }));

      render(createFlowElement(modifiedNodes, graph.edges));
      cleanup();
    },
    { time: 3000 }
  );
});
