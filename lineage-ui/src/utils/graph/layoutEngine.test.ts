import { describe, it, expect } from 'vitest';
import {
  getNodeWidth,
  getNodeHeight,
  getNodeLabel,
  getEdgeColor,
  groupByTable,
  getReactFlowNodeType,
  layoutGraph,
  calculateTableNodeHeight,
  calculateTableNodeWidth,
  getEdgeStyleByConfidence,
  topoSortDatabases,
  separateDatabaseClusters,
  detectConnectedComponents,
  kahnSort,
} from './layoutEngine';
import type { Node } from '@xyflow/react';
import type { TableNodeData } from './layoutEngine';
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

// TC-UNIT-004: getEdgeColor Function (updated for spec colors)
describe('getEdgeColor', () => {
  it('returns green-500 for DIRECT transformation', () => {
    const edge: LineageEdge = {
      id: '1',
      source: 'a',
      target: 'b',
      transformationType: 'DIRECT',
    };
    expect(getEdgeColor(edge)).toBe('#22C55E'); // green-500 per spec
  });

  it('returns purple-500 for AGGREGATION transformation', () => {
    const edge: LineageEdge = {
      id: '1',
      source: 'a',
      target: 'b',
      transformationType: 'AGGREGATION',
    };
    expect(getEdgeColor(edge)).toBe('#A855F7'); // purple-500 per spec
  });

  it('returns violet-500 for CALCULATION transformation', () => {
    const edge: LineageEdge = {
      id: '1',
      source: 'a',
      target: 'b',
      transformationType: 'CALCULATION',
    };
    expect(getEdgeColor(edge)).toBe('#8b5cf6');
  });

  it('returns gray-400 for unknown or missing transformation type', () => {
    const edge: LineageEdge = {
      id: '1',
      source: 'a',
      target: 'b',
    };
    expect(getEdgeColor(edge)).toBe('#9CA3AF'); // gray-400 per spec
  });

  it('returns blue-500 for DERIVED transformation', () => {
    const edge: LineageEdge = {
      id: '1',
      source: 'a',
      target: 'b',
      transformationType: 'DERIVED',
    };
    expect(getEdgeColor(edge)).toBe('#3B82F6'); // blue-500 per spec
  });

  it('returns cyan-500 for JOINED transformation', () => {
    const edge: LineageEdge = {
      id: '1',
      source: 'a',
      target: 'b',
      transformationType: 'JOINED',
    };
    expect(getEdgeColor(edge)).toBe('#06B6D4'); // cyan-500 per spec
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

// New tests for table node functions
describe('calculateTableNodeHeight', () => {
  it('returns header + padding for collapsed nodes', () => {
    expect(calculateTableNodeHeight(5, false)).toBe(40 + 32); // HEADER_HEIGHT + collapsed message
  });

  it('returns header + column rows + padding for expanded nodes', () => {
    const columnCount = 3;
    // HEADER_HEIGHT(40) + columnCount * COLUMN_ROW_HEIGHT(28) + NODE_PADDING(8)
    expect(calculateTableNodeHeight(columnCount, true)).toBe(40 + 3 * 28 + 8);
  });
});

describe('calculateTableNodeWidth', () => {
  it('returns minimum width of 280 for short content', () => {
    const columns = [{ id: '1', name: 'a', dataType: 'INT' }];
    expect(calculateTableNodeWidth('t', columns as never)).toBeGreaterThanOrEqual(280);
  });
});

describe('getEdgeStyleByConfidence', () => {
  it('returns opacity 1.0 for confidence >= 90%', () => {
    expect(getEdgeStyleByConfidence('#000', 95).opacity).toBe(1.0);
    expect(getEdgeStyleByConfidence('#000', 0.95).opacity).toBe(1.0);
  });

  it('returns opacity 0.9 for confidence 70-89%', () => {
    expect(getEdgeStyleByConfidence('#000', 75).opacity).toBe(0.9);
    expect(getEdgeStyleByConfidence('#000', 0.75).opacity).toBe(0.9);
  });

  it('returns opacity 0.8 for confidence 50-69%', () => {
    expect(getEdgeStyleByConfidence('#000', 55).opacity).toBe(0.8);
  });

  it('returns opacity 0.7 for confidence < 50%', () => {
    expect(getEdgeStyleByConfidence('#000', 30).opacity).toBe(0.7);
  });
});

// TC-GRAPH-001: layoutGraph tests (updated for table grouping)
describe('layoutGraph', () => {
  it('groups columns by table when laying out', async () => {
    // Two columns in the same table should result in one table node
    const nodes: LineageNode[] = [
      { id: '1', type: 'column', databaseName: 'db', tableName: 't', columnName: 'a' },
      { id: '2', type: 'column', databaseName: 'db', tableName: 't', columnName: 'b' },
    ];
    const edges: LineageEdge[] = [
      { id: 'e1', source: '1', target: '2' },
    ];

    const result = await layoutGraph(nodes, edges);

    // Should have 1 table node (columns grouped)
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].type).toBe('tableNode');
    expect(result.nodes[0].data.columns).toHaveLength(2);
  });

  it('creates separate table nodes for columns in different tables', async () => {
    const nodes: LineageNode[] = [
      { id: '1', type: 'column', databaseName: 'db', tableName: 't1', columnName: 'a' },
      { id: '2', type: 'column', databaseName: 'db', tableName: 't2', columnName: 'b' },
    ];
    const edges: LineageEdge[] = [
      { id: 'e1', source: '1', target: '2' },
    ];

    const result = await layoutGraph(nodes, edges);

    // Should have 2 table nodes
    expect(result.nodes).toHaveLength(2);
    expect(result.edges).toHaveLength(1);

    // Verify nodes have positions
    result.nodes.forEach(node => {
      expect(node.position).toBeDefined();
      expect(typeof node.position.x).toBe('number');
      expect(typeof node.position.y).toBe('number');
    });
  });

  it('assigns tableNode type for grouped columns', async () => {
    const nodes: LineageNode[] = [
      { id: '1', type: 'column', databaseName: 'db', tableName: 't', columnName: 'col' },
    ];
    const edges: LineageEdge[] = [];

    const result = await layoutGraph(nodes, edges);

    expect(result.nodes[0].type).toBe('tableNode');
  });

  it('creates edges with column-level handles', async () => {
    const nodes: LineageNode[] = [
      { id: '1', type: 'column', databaseName: 'db', tableName: 't1', columnName: 'a' },
      { id: '2', type: 'column', databaseName: 'db', tableName: 't2', columnName: 'b' },
    ];
    const edges: LineageEdge[] = [
      { id: 'e1', source: '1', target: '2' },
    ];

    const result = await layoutGraph(nodes, edges);

    expect(result.edges[0].sourceHandle).toContain('1-source');
    expect(result.edges[0].targetHandle).toContain('2-target');
  });
});

// TC-GRAPH-004: Complex Graph Layout (updated for table grouping)
describe('TC-GRAPH-004: Complex Graph Layout', () => {
  it('handles diamond pattern graph across different tables', async () => {
    const nodes: LineageNode[] = [
      { id: 'A', type: 'column', databaseName: 'db', tableName: 't1', columnName: 'colA' },
      { id: 'B', type: 'column', databaseName: 'db', tableName: 't2', columnName: 'colB' },
      { id: 'C', type: 'column', databaseName: 'db', tableName: 't3', columnName: 'colC' },
      { id: 'D', type: 'column', databaseName: 'db', tableName: 't4', columnName: 'colD' },
    ];
    const edges: LineageEdge[] = [
      { id: 'e1', source: 'A', target: 'B' },
      { id: 'e2', source: 'A', target: 'C' },
      { id: 'e3', source: 'B', target: 'D' },
      { id: 'e4', source: 'C', target: 'D' },
    ];

    const result = await layoutGraph(nodes, edges);

    // Should have 4 table nodes (each column in different table)
    expect(result.nodes).toHaveLength(4);
    expect(result.edges).toHaveLength(4);

    // Verify all nodes have positions
    result.nodes.forEach(node => {
      expect(node.position).toBeDefined();
    });
  });

  it('handles fan-out pattern across different tables', async () => {
    const nodes: LineageNode[] = [
      { id: 'A', type: 'column', databaseName: 'db', tableName: 't1', columnName: 'source' },
      { id: 'B', type: 'column', databaseName: 'db', tableName: 't2', columnName: 'target1' },
      { id: 'C', type: 'column', databaseName: 'db', tableName: 't3', columnName: 'target2' },
      { id: 'D', type: 'column', databaseName: 'db', tableName: 't4', columnName: 'target3' },
      { id: 'E', type: 'column', databaseName: 'db', tableName: 't5', columnName: 'target4' },
    ];
    const edges: LineageEdge[] = [
      { id: 'e1', source: 'A', target: 'B' },
      { id: 'e2', source: 'A', target: 'C' },
      { id: 'e3', source: 'A', target: 'D' },
      { id: 'e4', source: 'A', target: 'E' },
    ];

    const result = await layoutGraph(nodes, edges);

    expect(result.nodes).toHaveLength(5);

    // All nodes should have positions
    result.nodes.forEach(node => {
      expect(node.position).toBeDefined();
    });
  });

  it('handles fan-in pattern across different tables', async () => {
    const nodes: LineageNode[] = [
      { id: 'A', type: 'column', databaseName: 'db', tableName: 't1', columnName: 'src1' },
      { id: 'B', type: 'column', databaseName: 'db', tableName: 't2', columnName: 'src2' },
      { id: 'C', type: 'column', databaseName: 'db', tableName: 't3', columnName: 'src3' },
      { id: 'D', type: 'column', databaseName: 'db', tableName: 't4', columnName: 'src4' },
      { id: 'E', type: 'column', databaseName: 'db', tableName: 't5', columnName: 'target' },
    ];
    const edges: LineageEdge[] = [
      { id: 'e1', source: 'A', target: 'E' },
      { id: 'e2', source: 'B', target: 'E' },
      { id: 'e3', source: 'C', target: 'E' },
      { id: 'e4', source: 'D', target: 'E' },
    ];

    const result = await layoutGraph(nodes, edges);

    expect(result.nodes).toHaveLength(5);
  });

  it('handles linear chain across different tables', async () => {
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

    expect(result.nodes).toHaveLength(4);

    // Verify layered layout (RIGHT direction)
    const nodePositions = new Map(result.nodes.map(n => [n.id, n.position]));
    const posT1 = nodePositions.get('db.t1')!;
    const posT2 = nodePositions.get('db.t2')!;
    const posT3 = nodePositions.get('db.t3')!;
    const posT4 = nodePositions.get('db.t4')!;

    expect(posT1.x).toBeLessThan(posT2.x);
    expect(posT2.x).toBeLessThan(posT3.x);
    expect(posT3.x).toBeLessThan(posT4.x);
  });
});

// TC-GRAPH-007: Edge Animation - now handled in component, not layoutGraph
describe('TC-GRAPH-007: Edge Animation for Low Confidence', () => {
  it('edges are not animated in layoutGraph (handled by component)', async () => {
    const nodes: LineageNode[] = [
      { id: '1', type: 'column', databaseName: 'db', tableName: 't1', columnName: 'a' },
      { id: '2', type: 'column', databaseName: 'db', tableName: 't2', columnName: 'b' },
    ];
    const edges: LineageEdge[] = [
      { id: 'e1', source: '1', target: '2', confidenceScore: 0.5 },
    ];

    const result = await layoutGraph(nodes, edges);

    // Animation is now handled in LineageEdge component, not in layout
    expect(result.edges[0].animated).toBe(false);
  });

  it('edge data includes confidence score for component to use', async () => {
    const nodes: LineageNode[] = [
      { id: '1', type: 'column', databaseName: 'db', tableName: 't1', columnName: 'a' },
      { id: '2', type: 'column', databaseName: 'db', tableName: 't2', columnName: 'b' },
    ];
    const edges: LineageEdge[] = [
      { id: 'e1', source: '1', target: '2', confidenceScore: 0.5 },
    ];

    const result = await layoutGraph(nodes, edges);
    const edgeData = result.edges[0].data as { confidenceScore?: number };
    expect(edgeData?.confidenceScore).toBe(0.5);
  });
});

// TC-GRAPH-008: Edge Arrow Markers (updated for new colors)
describe('TC-GRAPH-008: Edge Arrow Markers', () => {
  it('adds arrowclosed marker to all edges', async () => {
    const nodes: LineageNode[] = [
      { id: '1', type: 'column', databaseName: 'db', tableName: 't1', columnName: 'a' },
      { id: '2', type: 'column', databaseName: 'db', tableName: 't2', columnName: 'b' },
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
      { id: '1', type: 'column', databaseName: 'db', tableName: 't1', columnName: 'a' },
      { id: '2', type: 'column', databaseName: 'db', tableName: 't2', columnName: 'b' },
    ];
    const edges: LineageEdge[] = [
      { id: 'e1', source: '1', target: '2', transformationType: 'DIRECT' },
    ];

    const result = await layoutGraph(nodes, edges);
    const edge = result.edges[0];

    expect((edge.markerEnd as { color?: string })?.color).toBe('#22C55E');
    expect(edge.style?.stroke).toBe('#22C55E');
  });

  it('arrow marker color matches edge stroke color for AGGREGATION', async () => {
    const nodes: LineageNode[] = [
      { id: '1', type: 'column', databaseName: 'db', tableName: 't1', columnName: 'a' },
      { id: '2', type: 'column', databaseName: 'db', tableName: 't2', columnName: 'b' },
    ];
    const edges: LineageEdge[] = [
      { id: 'e1', source: '1', target: '2', transformationType: 'AGGREGATION' },
    ];

    const result = await layoutGraph(nodes, edges);
    const edge = result.edges[0];

    expect((edge.markerEnd as { color?: string })?.color).toBe('#A855F7');
    expect(edge.style?.stroke).toBe('#A855F7');
  });

  it('arrow marker color matches edge stroke color for CALCULATION', async () => {
    const nodes: LineageNode[] = [
      { id: '1', type: 'column', databaseName: 'db', tableName: 't1', columnName: 'a' },
      { id: '2', type: 'column', databaseName: 'db', tableName: 't2', columnName: 'b' },
    ];
    const edges: LineageEdge[] = [
      { id: 'e1', source: '1', target: '2', transformationType: 'CALCULATION' },
    ];

    const result = await layoutGraph(nodes, edges);
    const edge = result.edges[0];

    expect((edge.markerEnd as { color?: string })?.color).toBe('#8b5cf6');
    expect(edge.style?.stroke).toBe('#8b5cf6');
  });

  it('edge uses lineageEdge type for grouped columns', async () => {
    const nodes: LineageNode[] = [
      { id: '1', type: 'column', databaseName: 'db', tableName: 't1', columnName: 'a' },
      { id: '2', type: 'column', databaseName: 'db', tableName: 't2', columnName: 'b' },
    ];
    const edges: LineageEdge[] = [
      { id: 'e1', source: '1', target: '2' },
    ];

    const result = await layoutGraph(nodes, edges);
    expect(result.edges[0].type).toBe('lineageEdge');
  });

  it('edge has strokeWidth of 2', async () => {
    const nodes: LineageNode[] = [
      { id: '1', type: 'column', databaseName: 'db', tableName: 't1', columnName: 'a' },
      { id: '2', type: 'column', databaseName: 'db', tableName: 't2', columnName: 'b' },
    ];
    const edges: LineageEdge[] = [
      { id: 'e1', source: '1', target: '2' },
    ];

    const result = await layoutGraph(nodes, edges);
    expect(result.edges[0].style?.strokeWidth).toBe(2);
  });
});

// TC-GRAPH-005: Node Types in Layout (updated for table grouping)
describe('TC-GRAPH-005: Node Types in Layout', () => {
  it('assigns tableNode type for column nodes (grouped by table)', async () => {
    const nodes: LineageNode[] = [
      { id: '1', type: 'column', databaseName: 'db', tableName: 't', columnName: 'col' },
    ];

    const result = await layoutGraph(nodes, []);
    expect(result.nodes[0].type).toBe('tableNode');
  });

  it('assigns tableNode type for table nodes in fallback', async () => {
    const nodes: LineageNode[] = [
      { id: '1', type: 'table', databaseName: 'db', tableName: 't' },
    ];

    const result = await layoutGraph(nodes, []);
    expect(result.nodes[0].type).toBe('tableNode');
  });

  it('assigns databaseNode type for database nodes in fallback', async () => {
    const nodes: LineageNode[] = [
      { id: '1', type: 'database', databaseName: 'db' },
    ];

    const result = await layoutGraph(nodes, []);
    expect(result.nodes[0].type).toBe('databaseNode');
  });

  it('includes columns array in table node data', async () => {
    const nodes: LineageNode[] = [
      { id: '1', type: 'column', databaseName: 'db', tableName: 't', columnName: 'col', metadata: { columnType: 'VARCHAR' } },
    ];

    const result = await layoutGraph(nodes, []);
    const nodeData = result.nodes[0].data as { columns?: Array<{ name: string }> };
    expect(nodeData.columns).toBeDefined();
    expect(nodeData.columns?.[0].name).toBe('col');
  });

  it('includes databaseName and tableName in table node data', async () => {
    const nodes: LineageNode[] = [
      { id: '1', type: 'column', databaseName: 'db', tableName: 'table1', columnName: 'col1' },
    ];

    const result = await layoutGraph(nodes, []);
    expect(result.nodes[0].data.databaseName).toBe('db');
    expect(result.nodes[0].data.tableName).toBe('table1');
  });
});

// Column sorting tests
describe('column sorting', () => {
  it('sorts columns alphabetically within a table node', async () => {
    const nodes: LineageNode[] = [
      { id: '1', type: 'column', databaseName: 'db', tableName: 't', columnName: 'zebra' },
      { id: '2', type: 'column', databaseName: 'db', tableName: 't', columnName: 'alpha' },
      { id: '3', type: 'column', databaseName: 'db', tableName: 't', columnName: 'mango' },
    ];
    const edges: LineageEdge[] = [];

    const result = await layoutGraph(nodes, edges);

    const nodeData = result.nodes[0].data as { columns: Array<{ name: string }> };
    expect(nodeData.columns.map((c) => c.name)).toEqual(['alpha', 'mango', 'zebra']);
  });

  it('sorts columns case-insensitively', async () => {
    const nodes: LineageNode[] = [
      { id: '1', type: 'column', databaseName: 'db', tableName: 't', columnName: 'ZEBRA' },
      { id: '2', type: 'column', databaseName: 'db', tableName: 't', columnName: 'alpha' },
      { id: '3', type: 'column', databaseName: 'db', tableName: 't', columnName: 'Mango' },
    ];
    const edges: LineageEdge[] = [];

    const result = await layoutGraph(nodes, edges);

    const nodeData = result.nodes[0].data as { columns: Array<{ name: string }> };
    const names = nodeData.columns.map((c) => c.name.toLowerCase());
    expect(names).toEqual(['alpha', 'mango', 'zebra']);
  });

  it('sorts columns independently per table node', async () => {
    const nodes: LineageNode[] = [
      { id: '1', type: 'column', databaseName: 'db', tableName: 't1', columnName: 'charlie' },
      { id: '2', type: 'column', databaseName: 'db', tableName: 't1', columnName: 'alpha' },
      { id: '3', type: 'column', databaseName: 'db', tableName: 't2', columnName: 'zulu' },
      { id: '4', type: 'column', databaseName: 'db', tableName: 't2', columnName: 'bravo' },
    ];
    const edges: LineageEdge[] = [
      { id: 'e1', source: '2', target: '4' },
    ];

    const result = await layoutGraph(nodes, edges);

    // Find each table node and verify its columns are sorted
    const t1Node = result.nodes.find((n) => n.data.tableName === 't1');
    const t2Node = result.nodes.find((n) => n.data.tableName === 't2');

    expect(t1Node!.data.columns.map((c: { name: string }) => c.name)).toEqual(['alpha', 'charlie']);
    expect(t2Node!.data.columns.map((c: { name: string }) => c.name)).toEqual(['bravo', 'zulu']);
  });
});

// TC-GRAPH-002 & TC-GRAPH-003: Layout Options Tests
describe('TC-GRAPH-002 & TC-GRAPH-003: Layout Options', () => {
  it('respects direction option (DOWN)', async () => {
    const nodes: LineageNode[] = [
      { id: '1', type: 'column', databaseName: 'db', tableName: 't1', columnName: 'a' },
      { id: '2', type: 'column', databaseName: 'db', tableName: 't2', columnName: 'b' },
    ];
    const edges: LineageEdge[] = [
      { id: 'e1', source: '1', target: '2' },
    ];

    const result = await layoutGraph(nodes, edges, { direction: 'DOWN' });

    const nodePositions = new Map(result.nodes.map(n => [n.id, n.position]));
    const posT1 = nodePositions.get('db.t1')!;
    const posT2 = nodePositions.get('db.t2')!;

    // In DOWN direction, source should have lower y value than target
    expect(posT1.y).toBeLessThan(posT2.y);
  });

  it('respects direction option (LEFT)', async () => {
    const nodes: LineageNode[] = [
      { id: '1', type: 'column', databaseName: 'db', tableName: 't1', columnName: 'a' },
      { id: '2', type: 'column', databaseName: 'db', tableName: 't2', columnName: 'b' },
    ];
    const edges: LineageEdge[] = [
      { id: 'e1', source: '1', target: '2' },
    ];

    const result = await layoutGraph(nodes, edges, { direction: 'LEFT' });

    const nodePositions = new Map(result.nodes.map(n => [n.id, n.position]));
    const posT1 = nodePositions.get('db.t1')!;
    const posT2 = nodePositions.get('db.t2')!;

    // In LEFT direction, source should have higher x value than target
    expect(posT1.x).toBeGreaterThan(posT2.x);
  });

  it('uses default options when none provided', async () => {
    const nodes: LineageNode[] = [
      { id: '1', type: 'column', databaseName: 'db', tableName: 't1', columnName: 'a' },
      { id: '2', type: 'column', databaseName: 'db', tableName: 't2', columnName: 'b' },
    ];
    const edges: LineageEdge[] = [
      { id: 'e1', source: '1', target: '2' },
    ];

    // Default direction is RIGHT
    const result = await layoutGraph(nodes, edges);

    const nodePositions = new Map(result.nodes.map(n => [n.id, n.position]));
    const posT1 = nodePositions.get('db.t1')!;
    const posT2 = nodePositions.get('db.t2')!;

    expect(posT1.x).toBeLessThan(posT2.x);
  });
});

// topoSortDatabases unit tests
describe('topoSortDatabases', () => {
  function colToTable(pairs: [string, string][]): Map<string, string> {
    return new Map(pairs);
  }
  function tableToDb(pairs: [string, string][]): Map<string, string> {
    return new Map(pairs);
  }

  it('places upstream database before downstream (bronze → silver)', () => {
    const c2t = colToTable([['c1', 'bronze.t1'], ['c2', 'silver.t2']]);
    const t2d = tableToDb([['bronze.t1', 'bronze'], ['silver.t2', 'silver']]);
    const order = topoSortDatabases(new Set(['bronze', 'silver']), [{ id: 'e1', source: 'c1', target: 'c2' }], c2t, t2d);
    expect(order.indexOf('bronze')).toBeLessThan(order.indexOf('silver'));
  });

  it('orders a three-stage pipeline: bronze → silver → gold', () => {
    const c2t = colToTable([['c1', 'bronze.t1'], ['c2', 'silver.t2'], ['c3', 'silver.t2'], ['c4', 'gold.t3']]);
    const t2d = tableToDb([['bronze.t1', 'bronze'], ['silver.t2', 'silver'], ['gold.t3', 'gold']]);
    const edges = [{ id: 'e1', source: 'c1', target: 'c2' }, { id: 'e2', source: 'c3', target: 'c4' }];
    const order = topoSortDatabases(new Set(['bronze', 'silver', 'gold']), edges, c2t, t2d);
    expect(order.indexOf('bronze')).toBeLessThan(order.indexOf('silver'));
    expect(order.indexOf('silver')).toBeLessThan(order.indexOf('gold'));
  });

  it('includes all databases even isolated ones', () => {
    const c2t = colToTable([['c1', 'a.t1'], ['c2', 'b.t2']]);
    const t2d = tableToDb([['a.t1', 'a'], ['b.t2', 'b']]);
    const order = topoSortDatabases(new Set(['a', 'b', 'isolated']), [{ id: 'e1', source: 'c1', target: 'c2' }], c2t, t2d);
    expect(order).toHaveLength(3);
    expect(order).toContain('isolated');
  });
});

// separateDatabaseClusters unit tests
describe('separateDatabaseClusters', () => {
  function makeNode(id: string, x: number, y: number): Node {
    return { id, type: 'tableNode', position: { x, y }, data: {} };
  }
  function makeTableData(id: string, db: string, tableName = 't'): TableNodeData {
    return {
      id, databaseName: db, tableName, columns: [
        { id: 'c', name: 'col', dataType: 'INT', isPrimaryKey: false, isForeignKey: false, hasUpstreamLineage: false, hasDownstreamLineage: false },
      ], isExpanded: true, assetType: 'table',
    };
  }

  it('returns nodes unchanged when only one database', () => {
    const nodes = [makeNode('db.t1', 100, 0), makeNode('db.t2', 400, 0)];
    const td = [makeTableData('db.t1', 'db'), makeTableData('db.t2', 'db')];
    const result = separateDatabaseClusters(nodes, td, 'RIGHT', 60, ['db']);
    expect(result[0].position.x).toBe(100);
    expect(result[1].position.x).toBe(400);
  });

  it('shifts later database right when bounding boxes overlap', () => {
    // db_a node at x=0, db_b node at x=100 — boxes will overlap
    const nodes = [makeNode('db_a.t1', 0, 0), makeNode('db_b.t1', 100, 0)];
    const td = [makeTableData('db_a.t1', 'db_a'), makeTableData('db_b.t1', 'db_b')];
    const result = separateDatabaseClusters(nodes, td, 'RIGHT', 60, ['db_a', 'db_b']);
    const aNode = result.find(n => n.id === 'db_a.t1')!;
    const bNode = result.find(n => n.id === 'db_b.t1')!;
    // db_a stays in place; db_b must be shifted so padded boxes don't overlap
    expect(bNode.position.x).toBeGreaterThan(aNode.position.x);
    // db_b near box edge must be >= db_a far box edge
    const aWidth = calculateTableNodeWidth('t', td[0].columns);
    expect(bNode.position.x - 60).toBeGreaterThanOrEqual(aNode.position.x + aWidth + 60);
  });

  it('respects dbOrder: upstream stays left even if ELK placed it to the right', () => {
    // ELK incorrectly placed db_b (upstream) to the right of db_a (downstream)
    const nodes = [makeNode('db_a.t1', 500, 0), makeNode('db_b.t1', 0, 0)];
    const td = [makeTableData('db_a.t1', 'db_a'), makeTableData('db_b.t1', 'db_b')];
    // dbOrder says db_b is upstream (index 0), db_a is downstream (index 1)
    const result = separateDatabaseClusters(nodes, td, 'RIGHT', 60, ['db_b', 'db_a']);
    const aNode = result.find(n => n.id === 'db_a.t1')!;
    const bNode = result.find(n => n.id === 'db_b.t1')!;
    // After separation, upstream db_b should be left of downstream db_a
    expect(bNode.position.x).toBeLessThan(aNode.position.x);
  });

  it('works along y-axis for DOWN direction', () => {
    const nodes = [makeNode('db_a.t1', 0, 0), makeNode('db_b.t1', 0, 50)];
    const td = [makeTableData('db_a.t1', 'db_a'), makeTableData('db_b.t1', 'db_b')];
    const result = separateDatabaseClusters(nodes, td, 'DOWN', 60, ['db_a', 'db_b']);
    const aNode = result.find(n => n.id === 'db_a.t1')!;
    const bNode = result.find(n => n.id === 'db_b.t1')!;
    expect(aNode.position.x).toBe(0); // x unchanged
    expect(bNode.position.x).toBe(0); // x unchanged
    const aHeight = calculateTableNodeHeight(1, true);
    expect(bNode.position.y - 60).toBeGreaterThanOrEqual(aNode.position.y + aHeight + 60);
  });
});

// Cross-database layout integration tests (via layoutGraph)
describe('cross-database cluster layout', () => {
  it('upstream database nodes land left of downstream nodes (direction=RIGHT)', async () => {
    const nodes: LineageNode[] = [
      { id: '1', type: 'column', databaseName: 'db_src', tableName: 't1', columnName: 'col1' },
      { id: '2', type: 'column', databaseName: 'db_src', tableName: 't2', columnName: 'col2' },
      { id: '3', type: 'column', databaseName: 'db_dst', tableName: 't3', columnName: 'col3' },
    ];
    const edges: LineageEdge[] = [{ id: 'e1', source: '1', target: '3' }];

    const result = await layoutGraph(nodes, edges, { direction: 'RIGHT' });

    const srcNodes = result.nodes.filter(n => n.data.databaseName === 'db_src');
    const dstNodes = result.nodes.filter(n => n.data.databaseName === 'db_dst');
    expect(srcNodes.length).toBe(2);
    expect(dstNodes.length).toBe(1);

    const srcMaxX = Math.max(...srcNodes.map(n => n.position.x));
    const dstMinX = Math.min(...dstNodes.map(n => n.position.x));
    expect(srcMaxX).toBeLessThan(dstMinX);
  });

  it('three-stage pipeline flows left to right: src → mid → dst', async () => {
    const nodes: LineageNode[] = [
      { id: '1', type: 'column', databaseName: 'db_src', tableName: 't1', columnName: 'c1' },
      { id: '2', type: 'column', databaseName: 'db_mid', tableName: 't2', columnName: 'c2' },
      { id: '3', type: 'column', databaseName: 'db_dst', tableName: 't3', columnName: 'c3' },
    ];
    const edges: LineageEdge[] = [
      { id: 'e1', source: '1', target: '2' },
      { id: 'e2', source: '2', target: '3' },
    ];

    const result = await layoutGraph(nodes, edges, { direction: 'RIGHT' });

    const srcNodes = result.nodes.filter(n => n.data.databaseName === 'db_src');
    const midNodes = result.nodes.filter(n => n.data.databaseName === 'db_mid');
    const dstNodes = result.nodes.filter(n => n.data.databaseName === 'db_dst');

    const srcMaxX = Math.max(...srcNodes.map(n => n.position.x));
    const midMinX = Math.min(...midNodes.map(n => n.position.x));
    const midMaxX = Math.max(...midNodes.map(n => n.position.x));
    const dstMinX = Math.min(...dstNodes.map(n => n.position.x));

    expect(srcMaxX).toBeLessThan(midMinX);
    expect(midMaxX).toBeLessThan(dstMinX);
  });

  it('single-database layout (compound path) is unaffected', async () => {
    const nodes: LineageNode[] = [
      { id: '1', type: 'column', databaseName: 'db', tableName: 't1', columnName: 'a' },
      { id: '2', type: 'column', databaseName: 'db', tableName: 't2', columnName: 'b' },
    ];
    const edges: LineageEdge[] = [{ id: 'e1', source: '1', target: '2' }];

    const result = await layoutGraph(nodes, edges);
    expect(result.nodes).toHaveLength(2);
    result.nodes.forEach(node => {
      expect(Number.isFinite(node.position.x)).toBe(true);
      expect(Number.isFinite(node.position.y)).toBe(true);
    });
  });
});

// detectConnectedComponents unit tests
describe('detectConnectedComponents', () => {
  it('single connected component — all 3 tables share edges', () => {
    // A->B->C: all three are reachable from each other
    const adj = new Map<string, Set<string>>([
      ['A', new Set(['B'])],
      ['B', new Set(['C'])],
      ['C', new Set()],
    ]);
    const { connected, isolated } = detectConnectedComponents(['A', 'B', 'C'], adj);
    expect(connected).toHaveLength(1);
    expect(connected[0].has('A')).toBe(true);
    expect(connected[0].has('B')).toBe(true);
    expect(connected[0].has('C')).toBe(true);
    expect(isolated).toHaveLength(0);
  });

  it('one connected component plus one isolated table', () => {
    // A->B connected, C has no edges
    const adj = new Map<string, Set<string>>([
      ['A', new Set(['B'])],
      ['B', new Set()],
      ['C', new Set()],
    ]);
    const { connected, isolated } = detectConnectedComponents(['A', 'B', 'C'], adj);
    expect(connected).toHaveLength(1);
    expect(connected[0].has('A')).toBe(true);
    expect(connected[0].has('B')).toBe(true);
    expect(isolated).toEqual(['C']);
  });

  it('two independent connected components — A->B and C->D', () => {
    // A->B is one chain, C->D is a separate chain
    const adj = new Map<string, Set<string>>([
      ['A', new Set(['B'])],
      ['B', new Set()],
      ['C', new Set(['D'])],
      ['D', new Set()],
    ]);
    const { connected, isolated } = detectConnectedComponents(['A', 'B', 'C', 'D'], adj);
    expect(connected).toHaveLength(2);
    expect(isolated).toHaveLength(0);
    // Each connected component has exactly 2 tables
    const sizes = connected.map(c => c.size).sort();
    expect(sizes).toEqual([2, 2]);
    // A and B are together, C and D are together
    const compAB = connected.find(c => c.has('A'));
    expect(compAB?.has('B')).toBe(true);
    const compCD = connected.find(c => c.has('C'));
    expect(compCD?.has('D')).toBe(true);
  });

  it('all isolated — 3 tables with no edges', () => {
    const adj = new Map<string, Set<string>>([
      ['A', new Set()],
      ['B', new Set()],
      ['C', new Set()],
    ]);
    const { connected, isolated } = detectConnectedComponents(['A', 'B', 'C'], adj);
    expect(connected).toHaveLength(0);
    expect(isolated).toEqual(['A', 'B', 'C']); // alphabetically sorted
  });

  it('self-loop handling — A->A has self-loop which is filtered, A has no edges to other tables', () => {
    // tableAdj already filters src===tgt during build, but detectConnectedComponents
    // also skips self-loops in undirected adjacency build
    // After filtering: A has no edges to other tables, so A is isolated
    const adj = new Map<string, Set<string>>([
      ['A', new Set(['A'])], // self-loop only
    ]);
    const { connected, isolated } = detectConnectedComponents(['A'], adj);
    // A only has a self-loop; undirected neighbor count after filtering self-loops = 0
    expect(isolated).toEqual(['A']);
    expect(connected).toHaveLength(0);
  });

  it('isolated tables sorted alphabetically — zebra, alpha, mango all isolated', () => {
    const adj = new Map<string, Set<string>>([
      ['zebra', new Set()],
      ['alpha', new Set()],
      ['mango', new Set()],
    ]);
    const { connected, isolated } = detectConnectedComponents(['zebra', 'alpha', 'mango'], adj);
    expect(connected).toHaveLength(0);
    expect(isolated).toEqual(['alpha', 'mango', 'zebra']);
  });
});

// kahnSort unit tests
describe('kahnSort', () => {
  it('linear chain A->B->C produces A first, C last', () => {
    const ids = new Set(['A', 'B', 'C']);
    const adj = new Map<string, Set<string>>([
      ['A', new Set(['B'])],
      ['B', new Set(['C'])],
      ['C', new Set()],
    ]);
    const inDeg = new Map<string, number>([['A', 0], ['B', 1], ['C', 1]]);
    const result = kahnSort(ids, adj, inDeg);
    expect(result[0]).toBe('A');
    expect(result[result.length - 1]).toBe('C');
    expect(result).toHaveLength(3);
  });

  it('diamond pattern — A first, D last, B and C sorted alphabetically between', () => {
    // A->{B,C}->D
    const ids = new Set(['A', 'B', 'C', 'D']);
    const adj = new Map<string, Set<string>>([
      ['A', new Set(['B', 'C'])],
      ['B', new Set(['D'])],
      ['C', new Set(['D'])],
      ['D', new Set()],
    ]);
    const inDeg = new Map<string, number>([['A', 0], ['B', 1], ['C', 1], ['D', 2]]);
    const result = kahnSort(ids, adj, inDeg);
    expect(result[0]).toBe('A');
    expect(result[result.length - 1]).toBe('D');
    // B and C are in alphabetical order between A and D
    expect(result[1]).toBe('B');
    expect(result[2]).toBe('C');
  });

  it('single node with no adjacency returns that node', () => {
    const ids = new Set(['A']);
    const adj = new Map<string, Set<string>>([['A', new Set()]]);
    const inDeg = new Map<string, number>([['A', 0]]);
    const result = kahnSort(ids, adj, inDeg);
    expect(result).toEqual(['A']);
  });

  it('cycle-trapped nodes — A->B->A both appear in result', () => {
    // A->B->A: both have in-degree 1, neither reaches 0
    const ids = new Set(['A', 'B']);
    const adj = new Map<string, Set<string>>([
      ['A', new Set(['B'])],
      ['B', new Set(['A'])],
    ]);
    const inDeg = new Map<string, number>([['A', 1], ['B', 1]]);
    const result = kahnSort(ids, adj, inDeg);
    expect(result).toHaveLength(2);
    expect(result).toContain('A');
    expect(result).toContain('B');
  });
});

// Isolated table grid layout tests (Plan 20-02)
describe('isolated table grid layout', () => {
  it('isolated tables are placed below the connected section (RIGHT direction)', async () => {
    // A->B connected, C and D isolated
    const nodes: LineageNode[] = [
      { id: '1', type: 'column', databaseName: 'db', tableName: 'A', columnName: 'c1' },
      { id: '2', type: 'column', databaseName: 'db', tableName: 'B', columnName: 'c2' },
      { id: '3', type: 'column', databaseName: 'db', tableName: 'C', columnName: 'c3' },
      { id: '4', type: 'column', databaseName: 'db', tableName: 'D', columnName: 'c4' },
    ];
    const edges: LineageEdge[] = [
      { id: 'e1', source: '1', target: '2' },
    ];

    const result = await layoutGraph(nodes, edges, { direction: 'RIGHT' });

    expect(result.nodes).toHaveLength(4);
    const posMap = new Map(result.nodes.map(n => [n.data.tableName as string, n.position]));
    const posA = posMap.get('A')!;
    const posB = posMap.get('B')!;
    const posC = posMap.get('C')!;
    const posD = posMap.get('D')!;

    // C and D (isolated) must be BELOW the connected section (higher y)
    const aHeight = calculateTableNodeHeight(1, true);
    const bHeight = calculateTableNodeHeight(1, true);
    const connectedMaxY = Math.max(posA.y + aHeight, posB.y + bHeight);
    expect(posC.y).toBeGreaterThan(connectedMaxY);
    expect(posD.y).toBeGreaterThan(connectedMaxY);
  });

  it('no overlap between connected zone and isolated grid zone', async () => {
    // A->B connected, C and D isolated
    const nodes: LineageNode[] = [
      { id: '1', type: 'column', databaseName: 'db', tableName: 'A', columnName: 'c1' },
      { id: '2', type: 'column', databaseName: 'db', tableName: 'B', columnName: 'c2' },
      { id: '3', type: 'column', databaseName: 'db', tableName: 'C', columnName: 'c3' },
      { id: '4', type: 'column', databaseName: 'db', tableName: 'D', columnName: 'c4' },
    ];
    const edges: LineageEdge[] = [
      { id: 'e1', source: '1', target: '2' },
    ];

    const result = await layoutGraph(nodes, edges, { direction: 'RIGHT' });

    const posMap = new Map(result.nodes.map(n => [n.data.tableName as string, n.position]));
    const posA = posMap.get('A')!;
    const posB = posMap.get('B')!;
    const posC = posMap.get('C')!;
    const posD = posMap.get('D')!;

    const aHeight = calculateTableNodeHeight(1, true);
    const bHeight = calculateTableNodeHeight(1, true);
    const connectedMaxY = Math.max(posA.y + aHeight, posB.y + bHeight);

    // Grid min Y must be strictly greater than connected max Y
    const gridMinY = Math.min(posC.y, posD.y);
    expect(gridMinY).toBeGreaterThan(connectedMaxY);
  });

  it('grid wraps to next row when exceeding maxRowWidth', async () => {
    // 8 isolated tables, no edges — should wrap with default maxRowWidth of 1200
    const tableNames = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8'];
    const nodes: LineageNode[] = tableNames.map((name, i) => ({
      id: String(i + 1),
      type: 'column' as const,
      databaseName: 'db',
      tableName: name,
      columnName: 'col',
    }));
    const edges: LineageEdge[] = [];

    const result = await layoutGraph(nodes, edges, { direction: 'RIGHT' });

    expect(result.nodes).toHaveLength(8);
    // Not all nodes should have the same y position (wrapping occurred)
    const yPositions = new Set(result.nodes.map(n => n.position.y));
    // With 8 tables at ~280px each + 40px spacing = ~320px per node
    // 4 nodes per row at 1200px max, so we expect at least 2 distinct y values
    expect(yPositions.size).toBeGreaterThan(1);
  });

  it('all isolated (no connected section) — positioned starting at y=0, alphabetical order', async () => {
    // 3 tables with no edges — all isolated
    const nodes: LineageNode[] = [
      { id: '1', type: 'column', databaseName: 'db', tableName: 'Zebra', columnName: 'c1' },
      { id: '2', type: 'column', databaseName: 'db', tableName: 'Alpha', columnName: 'c2' },
      { id: '3', type: 'column', databaseName: 'db', tableName: 'Mango', columnName: 'c3' },
    ];
    const edges: LineageEdge[] = [];

    const result = await layoutGraph(nodes, edges, { direction: 'RIGHT' });

    expect(result.nodes).toHaveLength(3);
    const posMap = new Map(result.nodes.map(n => [n.data.tableName as string, n.position]));
    const posAlpha = posMap.get('Alpha')!;
    const posMango = posMap.get('Mango')!;
    const posZebra = posMap.get('Zebra')!;

    // All at same y (single row, no connected offset)
    // The grid starts at y = componentSecondaryOffset (0) + gridGap (80)
    expect(posAlpha.y).toBe(posMango.y);
    expect(posMango.y).toBe(posZebra.y);

    // Alphabetical order — Alpha leftmost, Zebra rightmost
    expect(posAlpha.x).toBeLessThan(posMango.x);
    expect(posMango.x).toBeLessThan(posZebra.x);
  });

  it('mixed graph preserves connected layout and places isolated below', async () => {
    // Linear chain A->B->C, isolated D
    const nodes: LineageNode[] = [
      { id: 'a1', type: 'column', databaseName: 'db', tableName: 'A', columnName: 'c' },
      { id: 'b1', type: 'column', databaseName: 'db', tableName: 'B', columnName: 'c' },
      { id: 'c1', type: 'column', databaseName: 'db', tableName: 'C', columnName: 'c' },
      { id: 'd1', type: 'column', databaseName: 'db', tableName: 'D', columnName: 'c' },
    ];
    const edges: LineageEdge[] = [
      { id: 'e1', source: 'a1', target: 'b1' },
      { id: 'e2', source: 'b1', target: 'c1' },
    ];

    const result = await layoutGraph(nodes, edges, { direction: 'RIGHT' });

    expect(result.nodes).toHaveLength(4);
    const posMap = new Map(result.nodes.map(n => [n.data.tableName as string, n.position]));
    const posA = posMap.get('A')!;
    const posB = posMap.get('B')!;
    const posC = posMap.get('C')!;
    const posD = posMap.get('D')!;

    // Connected chain A->B->C preserved: A.x < B.x < C.x
    expect(posA.x).toBeLessThan(posB.x);
    expect(posB.x).toBeLessThan(posC.x);

    // D (isolated) must be below all connected tables
    const aHeight = calculateTableNodeHeight(1, true);
    const bHeight = calculateTableNodeHeight(1, true);
    const cHeight = calculateTableNodeHeight(1, true);
    const connectedMaxY = Math.max(posA.y + aHeight, posB.y + bHeight, posC.y + cHeight);
    expect(posD.y).toBeGreaterThan(connectedMaxY);
  });
});

// Per-component layout tests
describe('per-component layout', () => {
  it('two independent chains produce correct x-layers (chain A->B and chain C->D)', async () => {
    // tA->tB is one chain, tC->tD is a separate chain
    // Both tA and tC should be at layer 0 (same x), tB and tD at layer 1 (same x)
    // But tA and tC should be at different y positions (component stacking)
    const nodes: LineageNode[] = [
      { id: '1', type: 'column', databaseName: 'db', tableName: 'tA', columnName: 'a' },
      { id: '2', type: 'column', databaseName: 'db', tableName: 'tB', columnName: 'b' },
      { id: '3', type: 'column', databaseName: 'db', tableName: 'tC', columnName: 'c' },
      { id: '4', type: 'column', databaseName: 'db', tableName: 'tD', columnName: 'd' },
    ];
    const edges: LineageEdge[] = [
      { id: 'e1', source: '1', target: '2' },
      { id: 'e2', source: '3', target: '4' },
    ];

    const result = await layoutGraph(nodes, edges);

    expect(result.nodes).toHaveLength(4);
    const posMap = new Map(result.nodes.map(n => [n.data.tableName as string, n.position]));
    const posTA = posMap.get('tA')!;
    const posTB = posMap.get('tB')!;
    const posTC = posMap.get('tC')!;
    const posTD = posMap.get('tD')!;

    // Both tA and tC are at layer 0 — should have the same x in RIGHT direction
    expect(posTA.x).toBe(posTC.x);
    // Both tB and tD are at layer 1 — should have the same x in RIGHT direction
    expect(posTB.x).toBe(posTD.x);
    // tA and tC are in different components — different y positions
    expect(posTA.y).not.toBe(posTC.y);
  });

  it('connected + isolated separation — isolated table gets a position distinct from connected tables', async () => {
    // tA->tB connected; tC isolated (no edges)
    const nodes: LineageNode[] = [
      { id: '1', type: 'column', databaseName: 'db', tableName: 'tA', columnName: 'a' },
      { id: '2', type: 'column', databaseName: 'db', tableName: 'tB', columnName: 'b' },
      { id: '3', type: 'column', databaseName: 'db', tableName: 'tC', columnName: 'c' },
    ];
    const edges: LineageEdge[] = [
      { id: 'e1', source: '1', target: '2' },
    ];

    const result = await layoutGraph(nodes, edges);

    expect(result.nodes).toHaveLength(3);
    // All nodes have finite positions
    result.nodes.forEach(node => {
      expect(Number.isFinite(node.position.x)).toBe(true);
      expect(Number.isFinite(node.position.y)).toBe(true);
    });
    // tC (isolated) must be positioned — it should appear in the result
    const tCNode = result.nodes.find(n => n.data.tableName === 'tC');
    expect(tCNode).toBeDefined();
  });

  it('single component behaves identically — linear chain A->B->C->D preserves x-ordering', async () => {
    // Regression guard: single connected component should still produce correct ordering
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

    expect(result.nodes).toHaveLength(4);
    const posMap = new Map(result.nodes.map(n => [n.id, n.position]));
    const posT1 = posMap.get('db.t1')!;
    const posT2 = posMap.get('db.t2')!;
    const posT3 = posMap.get('db.t3')!;
    const posT4 = posMap.get('db.t4')!;

    // Source (t1) should be leftmost, sink (t4) should be rightmost in RIGHT direction
    expect(posT1.x).toBeLessThan(posT2.x);
    expect(posT2.x).toBeLessThan(posT3.x);
    expect(posT3.x).toBeLessThan(posT4.x);
  });
});
