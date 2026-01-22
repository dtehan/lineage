import { describe, it, expect } from 'vitest';
import {
  getNodeWidth,
  getNodeHeight,
  getNodeLabel,
  getEdgeColor,
  groupByTable,
  getReactFlowNodeType,
  layoutGraph,
} from './layoutEngine';
import type { LineageNode, LineageEdge } from '../../types';

// TC-UNIT-001: getNodeWidth Function
describe('getNodeWidth', () => {
  it('returns minimum width of 150 for short labels', () => {
    const node: LineageNode = {
      id: '1',
      type: 'column',
      databaseName: 'db',
      tableName: 't',
      columnName: 'col',
    };
    // label will be "t.col" = 5 chars, width = max(150, 5*8+40) = max(150, 80) = 150
    expect(getNodeWidth(node)).toBe(150);
  });

  it('returns calculated width for long labels', () => {
    const node: LineageNode = {
      id: '1',
      type: 'column',
      databaseName: 'database',
      tableName: 'very_long_table_name',
      columnName: 'very_long_column_name',
    };
    // label will be "very_long_table_name.very_long_column_name" = 42 chars
    // width = max(150, 42*8+40) = max(150, 376) = 376
    const label = getNodeLabel(node);
    const expectedWidth = Math.max(150, label.length * 8 + 40);
    expect(getNodeWidth(node)).toBe(expectedWidth);
  });
});

// TC-UNIT-002: getNodeHeight Function
describe('getNodeHeight', () => {
  it('returns 40 for column nodes', () => {
    const node: LineageNode = {
      id: '1',
      type: 'column',
      databaseName: 'db',
      tableName: 'table',
      columnName: 'col',
    };
    expect(getNodeHeight(node)).toBe(40);
  });

  it('returns 60 for table nodes', () => {
    const node: LineageNode = {
      id: '1',
      type: 'table',
      databaseName: 'db',
      tableName: 'table',
    };
    expect(getNodeHeight(node)).toBe(60);
  });

  it('returns 60 for database nodes', () => {
    const node: LineageNode = {
      id: '1',
      type: 'database',
      databaseName: 'db',
    };
    expect(getNodeHeight(node)).toBe(60);
  });
});

// TC-UNIT-003: getNodeLabel Function
describe('getNodeLabel', () => {
  it('returns "table.column" for column nodes', () => {
    const node: LineageNode = {
      id: '1',
      type: 'column',
      databaseName: 'db1',
      tableName: 'table1',
      columnName: 'col1',
    };
    expect(getNodeLabel(node)).toBe('table1.col1');
  });

  it('returns "database.table" for table nodes', () => {
    const node: LineageNode = {
      id: '1',
      type: 'table',
      databaseName: 'db1',
      tableName: 'table1',
    };
    expect(getNodeLabel(node)).toBe('db1.table1');
  });

  it('returns database name for database nodes', () => {
    const node: LineageNode = {
      id: '1',
      type: 'database',
      databaseName: 'db1',
    };
    expect(getNodeLabel(node)).toBe('db1');
  });
});

// TC-UNIT-004: getEdgeColor Function
describe('getEdgeColor', () => {
  it('returns green for DIRECT transformation', () => {
    const edge: LineageEdge = {
      id: '1',
      source: 'a',
      target: 'b',
      transformationType: 'DIRECT',
    };
    expect(getEdgeColor(edge)).toBe('#10b981');
  });

  it('returns amber for AGGREGATION transformation', () => {
    const edge: LineageEdge = {
      id: '1',
      source: 'a',
      target: 'b',
      transformationType: 'AGGREGATION',
    };
    expect(getEdgeColor(edge)).toBe('#f59e0b');
  });

  it('returns purple for CALCULATION transformation', () => {
    const edge: LineageEdge = {
      id: '1',
      source: 'a',
      target: 'b',
      transformationType: 'CALCULATION',
    };
    expect(getEdgeColor(edge)).toBe('#8b5cf6');
  });

  it('returns slate for unknown or missing transformation type', () => {
    const edge: LineageEdge = {
      id: '1',
      source: 'a',
      target: 'b',
    };
    expect(getEdgeColor(edge)).toBe('#64748b');
  });
});

// TC-UNIT-005: groupByTable Function
describe('groupByTable', () => {
  it('groups column nodes by their parent table', () => {
    const nodes: LineageNode[] = [
      { id: '1', type: 'column', databaseName: 'db1', tableName: 'table1', columnName: 'col1' },
      { id: '2', type: 'column', databaseName: 'db1', tableName: 'table1', columnName: 'col2' },
      { id: '3', type: 'column', databaseName: 'db1', tableName: 'table2', columnName: 'col1' },
      { id: '4', type: 'table', databaseName: 'db1', tableName: 'table1' },
    ];

    const groups = groupByTable(nodes);

    expect(groups.size).toBe(2);
    expect(groups.get('db1.table1')?.length).toBe(2);
    expect(groups.get('db1.table2')?.length).toBe(1);
  });

  it('excludes non-column nodes', () => {
    const nodes: LineageNode[] = [
      { id: '1', type: 'table', databaseName: 'db1', tableName: 'table1' },
      { id: '2', type: 'database', databaseName: 'db1' },
    ];

    const groups = groupByTable(nodes);
    expect(groups.size).toBe(0);
  });
});

// TC-UNIT-006: getReactFlowNodeType Function
describe('getReactFlowNodeType', () => {
  it('returns "columnNode" for column type', () => {
    const node: LineageNode = {
      id: '1',
      type: 'column',
      databaseName: 'db',
      tableName: 'table',
      columnName: 'col',
    };
    expect(getReactFlowNodeType(node)).toBe('columnNode');
  });

  it('returns "tableNode" for table type', () => {
    const node: LineageNode = {
      id: '1',
      type: 'table',
      databaseName: 'db',
      tableName: 'table',
    };
    expect(getReactFlowNodeType(node)).toBe('tableNode');
  });

  it('returns "databaseNode" for database type', () => {
    const node: LineageNode = {
      id: '1',
      type: 'database',
      databaseName: 'db',
    };
    expect(getReactFlowNodeType(node)).toBe('databaseNode');
  });
});

// TC-GRAPH-001, TC-GRAPH-002, TC-GRAPH-003: layoutGraph tests
describe('layoutGraph', () => {
  it('positions nodes based on ELK layout', async () => {
    const nodes: LineageNode[] = [
      { id: '1', type: 'column', databaseName: 'db', tableName: 't', columnName: 'a' },
      { id: '2', type: 'column', databaseName: 'db', tableName: 't', columnName: 'b' },
    ];
    const edges: LineageEdge[] = [
      { id: 'e1', source: '1', target: '2' },
    ];

    const result = await layoutGraph(nodes, edges);

    expect(result.nodes).toHaveLength(2);
    expect(result.edges).toHaveLength(1);

    // Verify nodes have positions
    result.nodes.forEach(node => {
      expect(node.position).toBeDefined();
      expect(typeof node.position.x).toBe('number');
      expect(typeof node.position.y).toBe('number');
    });
  });

  it('assigns correct node types', async () => {
    const nodes: LineageNode[] = [
      { id: '1', type: 'column', databaseName: 'db', tableName: 't', columnName: 'col' },
    ];
    const edges: LineageEdge[] = [];

    const result = await layoutGraph(nodes, edges);

    expect(result.nodes[0].type).toBe('columnNode');
  });

  it('animates edges with low confidence scores', async () => {
    const nodes: LineageNode[] = [
      { id: '1', type: 'column', databaseName: 'db', tableName: 't', columnName: 'a' },
      { id: '2', type: 'column', databaseName: 'db', tableName: 't', columnName: 'b' },
    ];
    const edges: LineageEdge[] = [
      { id: 'e1', source: '1', target: '2', confidenceScore: 0.5 },
    ];

    const result = await layoutGraph(nodes, edges);

    expect(result.edges[0].animated).toBe(true);
  });

  it('does not animate edges with high confidence scores', async () => {
    const nodes: LineageNode[] = [
      { id: '1', type: 'column', databaseName: 'db', tableName: 't', columnName: 'a' },
      { id: '2', type: 'column', databaseName: 'db', tableName: 't', columnName: 'b' },
    ];
    const edges: LineageEdge[] = [
      { id: 'e1', source: '1', target: '2', confidenceScore: 0.95 },
    ];

    const result = await layoutGraph(nodes, edges);

    expect(result.edges[0].animated).toBe(false);
  });
});

// TC-GRAPH-004: Complex Graph Layout
describe('TC-GRAPH-004: Complex Graph Layout', () => {
  it('handles diamond pattern graph (A->B, A->C, B->D, C->D) with no overlaps', async () => {
    const nodes: LineageNode[] = [
      { id: 'A', type: 'column', databaseName: 'db', tableName: 't1', columnName: 'colA' },
      { id: 'B', type: 'column', databaseName: 'db', tableName: 't2', columnName: 'colB' },
      { id: 'C', type: 'column', databaseName: 'db', tableName: 't2', columnName: 'colC' },
      { id: 'D', type: 'column', databaseName: 'db', tableName: 't3', columnName: 'colD' },
    ];
    const edges: LineageEdge[] = [
      { id: 'e1', source: 'A', target: 'B' },
      { id: 'e2', source: 'A', target: 'C' },
      { id: 'e3', source: 'B', target: 'D' },
      { id: 'e4', source: 'C', target: 'D' },
    ];

    const result = await layoutGraph(nodes, edges);

    expect(result.nodes).toHaveLength(4);
    expect(result.edges).toHaveLength(4);

    // Verify all nodes have unique positions (no overlaps)
    const positions = result.nodes.map(n => `${n.position.x},${n.position.y}`);
    const uniquePositions = new Set(positions);
    expect(uniquePositions.size).toBe(4);

    // Verify layout has proper layering (A should have lower x than B/C, which should have lower x than D)
    const nodePositions = new Map(result.nodes.map(n => [n.id, n.position]));
    const posA = nodePositions.get('A')!;
    const posB = nodePositions.get('B')!;
    const posC = nodePositions.get('C')!;
    const posD = nodePositions.get('D')!;

    // In a RIGHT direction layout, x increases from source to target
    expect(posA.x).toBeLessThan(posB.x);
    expect(posA.x).toBeLessThan(posC.x);
    expect(posB.x).toBeLessThan(posD.x);
    expect(posC.x).toBeLessThan(posD.x);
  });

  it('handles fan-out pattern (A->B, A->C, A->D, A->E)', async () => {
    const nodes: LineageNode[] = [
      { id: 'A', type: 'column', databaseName: 'db', tableName: 't1', columnName: 'source' },
      { id: 'B', type: 'column', databaseName: 'db', tableName: 't2', columnName: 'target1' },
      { id: 'C', type: 'column', databaseName: 'db', tableName: 't2', columnName: 'target2' },
      { id: 'D', type: 'column', databaseName: 'db', tableName: 't2', columnName: 'target3' },
      { id: 'E', type: 'column', databaseName: 'db', tableName: 't2', columnName: 'target4' },
    ];
    const edges: LineageEdge[] = [
      { id: 'e1', source: 'A', target: 'B' },
      { id: 'e2', source: 'A', target: 'C' },
      { id: 'e3', source: 'A', target: 'D' },
      { id: 'e4', source: 'A', target: 'E' },
    ];

    const result = await layoutGraph(nodes, edges);

    expect(result.nodes).toHaveLength(5);

    // A should be to the left of all targets
    const nodePositions = new Map(result.nodes.map(n => [n.id, n.position]));
    const posA = nodePositions.get('A')!;

    ['B', 'C', 'D', 'E'].forEach(id => {
      const pos = nodePositions.get(id)!;
      expect(posA.x).toBeLessThan(pos.x);
    });
  });

  it('handles fan-in pattern (A->E, B->E, C->E, D->E)', async () => {
    const nodes: LineageNode[] = [
      { id: 'A', type: 'column', databaseName: 'db', tableName: 't1', columnName: 'src1' },
      { id: 'B', type: 'column', databaseName: 'db', tableName: 't1', columnName: 'src2' },
      { id: 'C', type: 'column', databaseName: 'db', tableName: 't1', columnName: 'src3' },
      { id: 'D', type: 'column', databaseName: 'db', tableName: 't1', columnName: 'src4' },
      { id: 'E', type: 'column', databaseName: 'db', tableName: 't2', columnName: 'target' },
    ];
    const edges: LineageEdge[] = [
      { id: 'e1', source: 'A', target: 'E' },
      { id: 'e2', source: 'B', target: 'E' },
      { id: 'e3', source: 'C', target: 'E' },
      { id: 'e4', source: 'D', target: 'E' },
    ];

    const result = await layoutGraph(nodes, edges);

    expect(result.nodes).toHaveLength(5);

    // E should be to the right of all sources
    const nodePositions = new Map(result.nodes.map(n => [n.id, n.position]));
    const posE = nodePositions.get('E')!;

    ['A', 'B', 'C', 'D'].forEach(id => {
      const pos = nodePositions.get(id)!;
      expect(pos.x).toBeLessThan(posE.x);
    });
  });

  it('handles linear chain (A->B->C->D)', async () => {
    const nodes: LineageNode[] = [
      { id: 'A', type: 'column', databaseName: 'db', tableName: 't1', columnName: 'col1' },
      { id: 'B', type: 'column', databaseName: 'db', tableName: 't2', columnName: 'col2' },
      { id: 'C', type: 'column', databaseName: 'db', tableName: 't3', columnName: 'col3' },
      { id: 'D', type: 'column', databaseName: 'db', tableName: 't4', columnName: 'col4' },
    ];
    const edges: LineageEdge[] = [
      { id: 'e1', source: 'A', target: 'B' },
      { id: 'e2', source: 'B', target: 'C' },
      { id: 'e3', source: 'C', target: 'D' },
    ];

    const result = await layoutGraph(nodes, edges);

    const nodePositions = new Map(result.nodes.map(n => [n.id, n.position]));
    const posA = nodePositions.get('A')!;
    const posB = nodePositions.get('B')!;
    const posC = nodePositions.get('C')!;
    const posD = nodePositions.get('D')!;

    // Verify strict ordering
    expect(posA.x).toBeLessThan(posB.x);
    expect(posB.x).toBeLessThan(posC.x);
    expect(posC.x).toBeLessThan(posD.x);
  });
});

// TC-GRAPH-007: Edge Animation for Low Confidence (extended tests)
describe('TC-GRAPH-007: Edge Animation for Low Confidence', () => {
  it('animates edge when confidence score is below 0.8', async () => {
    const nodes: LineageNode[] = [
      { id: '1', type: 'column', databaseName: 'db', tableName: 't', columnName: 'a' },
      { id: '2', type: 'column', databaseName: 'db', tableName: 't', columnName: 'b' },
    ];
    const edges: LineageEdge[] = [
      { id: 'e1', source: '1', target: '2', confidenceScore: 0.5 },
    ];

    const result = await layoutGraph(nodes, edges);
    expect(result.edges[0].animated).toBe(true);
  });

  it('does not animate edge when confidence score is 0.8 or above', async () => {
    const nodes: LineageNode[] = [
      { id: '1', type: 'column', databaseName: 'db', tableName: 't', columnName: 'a' },
      { id: '2', type: 'column', databaseName: 'db', tableName: 't', columnName: 'b' },
    ];
    const edges: LineageEdge[] = [
      { id: 'e1', source: '1', target: '2', confidenceScore: 0.8 },
    ];

    const result = await layoutGraph(nodes, edges);
    expect(result.edges[0].animated).toBe(false);
  });

  it('does not animate edge when confidence score is undefined', async () => {
    const nodes: LineageNode[] = [
      { id: '1', type: 'column', databaseName: 'db', tableName: 't', columnName: 'a' },
      { id: '2', type: 'column', databaseName: 'db', tableName: 't', columnName: 'b' },
    ];
    const edges: LineageEdge[] = [
      { id: 'e1', source: '1', target: '2' },
    ];

    const result = await layoutGraph(nodes, edges);
    expect(result.edges[0].animated).toBe(false);
  });
});

// TC-GRAPH-008: Edge Arrow Markers
describe('TC-GRAPH-008: Edge Arrow Markers', () => {
  it('adds arrowclosed marker to all edges', async () => {
    const nodes: LineageNode[] = [
      { id: '1', type: 'column', databaseName: 'db', tableName: 't', columnName: 'a' },
      { id: '2', type: 'column', databaseName: 'db', tableName: 't', columnName: 'b' },
    ];
    const edges: LineageEdge[] = [
      { id: 'e1', source: '1', target: '2', transformationType: 'DIRECT' },
    ];

    const result = await layoutGraph(nodes, edges);

    expect(result.edges[0].markerEnd).toBeDefined();
    expect(result.edges[0].markerEnd).toHaveProperty('type', 'arrowclosed');
  });

  it('arrow marker color matches edge stroke color for DIRECT', async () => {
    const nodes: LineageNode[] = [
      { id: '1', type: 'column', databaseName: 'db', tableName: 't', columnName: 'a' },
      { id: '2', type: 'column', databaseName: 'db', tableName: 't', columnName: 'b' },
    ];
    const edges: LineageEdge[] = [
      { id: 'e1', source: '1', target: '2', transformationType: 'DIRECT' },
    ];

    const result = await layoutGraph(nodes, edges);
    const edge = result.edges[0];

    expect(edge.markerEnd?.color).toBe('#10b981');
    expect(edge.style?.stroke).toBe('#10b981');
  });

  it('arrow marker color matches edge stroke color for AGGREGATION', async () => {
    const nodes: LineageNode[] = [
      { id: '1', type: 'column', databaseName: 'db', tableName: 't', columnName: 'a' },
      { id: '2', type: 'column', databaseName: 'db', tableName: 't', columnName: 'b' },
    ];
    const edges: LineageEdge[] = [
      { id: 'e1', source: '1', target: '2', transformationType: 'AGGREGATION' },
    ];

    const result = await layoutGraph(nodes, edges);
    const edge = result.edges[0];

    expect(edge.markerEnd?.color).toBe('#f59e0b');
    expect(edge.style?.stroke).toBe('#f59e0b');
  });

  it('arrow marker color matches edge stroke color for CALCULATION', async () => {
    const nodes: LineageNode[] = [
      { id: '1', type: 'column', databaseName: 'db', tableName: 't', columnName: 'a' },
      { id: '2', type: 'column', databaseName: 'db', tableName: 't', columnName: 'b' },
    ];
    const edges: LineageEdge[] = [
      { id: 'e1', source: '1', target: '2', transformationType: 'CALCULATION' },
    ];

    const result = await layoutGraph(nodes, edges);
    const edge = result.edges[0];

    expect(edge.markerEnd?.color).toBe('#8b5cf6');
    expect(edge.style?.stroke).toBe('#8b5cf6');
  });

  it('edge uses smoothstep type', async () => {
    const nodes: LineageNode[] = [
      { id: '1', type: 'column', databaseName: 'db', tableName: 't', columnName: 'a' },
      { id: '2', type: 'column', databaseName: 'db', tableName: 't', columnName: 'b' },
    ];
    const edges: LineageEdge[] = [
      { id: 'e1', source: '1', target: '2' },
    ];

    const result = await layoutGraph(nodes, edges);
    expect(result.edges[0].type).toBe('smoothstep');
  });

  it('edge has strokeWidth of 2', async () => {
    const nodes: LineageNode[] = [
      { id: '1', type: 'column', databaseName: 'db', tableName: 't', columnName: 'a' },
      { id: '2', type: 'column', databaseName: 'db', tableName: 't', columnName: 'b' },
    ];
    const edges: LineageEdge[] = [
      { id: 'e1', source: '1', target: '2' },
    ];

    const result = await layoutGraph(nodes, edges);
    expect(result.edges[0].style?.strokeWidth).toBe(2);
  });
});

// TC-GRAPH-005: React Flow Node Types (layoutGraph specific tests)
describe('TC-GRAPH-005: Node Types in Layout', () => {
  it('assigns columnNode type for column nodes', async () => {
    const nodes: LineageNode[] = [
      { id: '1', type: 'column', databaseName: 'db', tableName: 't', columnName: 'col' },
    ];

    const result = await layoutGraph(nodes, []);
    expect(result.nodes[0].type).toBe('columnNode');
  });

  it('assigns tableNode type for table nodes', async () => {
    const nodes: LineageNode[] = [
      { id: '1', type: 'table', databaseName: 'db', tableName: 't' },
    ];

    const result = await layoutGraph(nodes, []);
    expect(result.nodes[0].type).toBe('tableNode');
  });

  it('assigns databaseNode type for database nodes', async () => {
    const nodes: LineageNode[] = [
      { id: '1', type: 'database', databaseName: 'db' },
    ];

    const result = await layoutGraph(nodes, []);
    expect(result.nodes[0].type).toBe('databaseNode');
  });

  it('includes original node data in result', async () => {
    const nodes: LineageNode[] = [
      { id: '1', type: 'column', databaseName: 'db', tableName: 't', columnName: 'col', metadata: { custom: 'value' } },
    ];

    const result = await layoutGraph(nodes, []);
    expect(result.nodes[0].data.databaseName).toBe('db');
    expect(result.nodes[0].data.tableName).toBe('t');
    expect(result.nodes[0].data.columnName).toBe('col');
    expect(result.nodes[0].data.metadata).toEqual({ custom: 'value' });
  });

  it('includes label in node data', async () => {
    const nodes: LineageNode[] = [
      { id: '1', type: 'column', databaseName: 'db', tableName: 'table1', columnName: 'col1' },
    ];

    const result = await layoutGraph(nodes, []);
    expect(result.nodes[0].data.label).toBe('table1.col1');
  });
});

// TC-GRAPH-002 & TC-GRAPH-003: Layout Options Tests
describe('TC-GRAPH-002 & TC-GRAPH-003: Layout Options', () => {
  it('respects direction option (DOWN)', async () => {
    const nodes: LineageNode[] = [
      { id: '1', type: 'column', databaseName: 'db', tableName: 't', columnName: 'a' },
      { id: '2', type: 'column', databaseName: 'db', tableName: 't', columnName: 'b' },
    ];
    const edges: LineageEdge[] = [
      { id: 'e1', source: '1', target: '2' },
    ];

    const result = await layoutGraph(nodes, edges, { direction: 'DOWN' });

    const node1 = result.nodes.find(n => n.id === '1')!;
    const node2 = result.nodes.find(n => n.id === '2')!;

    // In DOWN direction, source should have lower y value than target
    expect(node1.position.y).toBeLessThan(node2.position.y);
  });

  it('respects direction option (LEFT)', async () => {
    const nodes: LineageNode[] = [
      { id: '1', type: 'column', databaseName: 'db', tableName: 't', columnName: 'a' },
      { id: '2', type: 'column', databaseName: 'db', tableName: 't', columnName: 'b' },
    ];
    const edges: LineageEdge[] = [
      { id: 'e1', source: '1', target: '2' },
    ];

    const result = await layoutGraph(nodes, edges, { direction: 'LEFT' });

    const node1 = result.nodes.find(n => n.id === '1')!;
    const node2 = result.nodes.find(n => n.id === '2')!;

    // In LEFT direction, source should have higher x value than target
    expect(node1.position.x).toBeGreaterThan(node2.position.x);
  });

  it('uses default options when none provided', async () => {
    const nodes: LineageNode[] = [
      { id: '1', type: 'column', databaseName: 'db', tableName: 't', columnName: 'a' },
      { id: '2', type: 'column', databaseName: 'db', tableName: 't', columnName: 'b' },
    ];
    const edges: LineageEdge[] = [
      { id: 'e1', source: '1', target: '2' },
    ];

    // Default direction is RIGHT
    const result = await layoutGraph(nodes, edges);

    const node1 = result.nodes.find(n => n.id === '1')!;
    const node2 = result.nodes.find(n => n.id === '2')!;

    expect(node1.position.x).toBeLessThan(node2.position.x);
  });
});
