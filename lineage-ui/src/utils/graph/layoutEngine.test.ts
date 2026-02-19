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
  separateDatabaseClusters,
  topoSortDatabases,
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

// Unit tests for separateDatabaseClusters post-layout function
describe('separateDatabaseClusters', () => {
  // Helper to build a minimal Node for testing
  function makeNode(id: string, x: number, y: number): Node {
    return { id, type: 'tableNode', position: { x, y }, data: {} };
  }

  // Helper to build TableNodeData with a known width/height
  function makeTableData(id: string, db: string, tableName: string): TableNodeData {
    return {
      id,
      databaseName: db,
      tableName,
      columns: [{ id: 'c1', name: 'col', dataType: 'INT', isPrimaryKey: false, isForeignKey: false, hasUpstreamLineage: false, hasDownstreamLineage: false }],
      isExpanded: true,
      assetType: 'table',
    };
  }

  it('returns nodes unchanged when there is only one database', () => {
    const nodes = [makeNode('db.t1', 100, 0), makeNode('db.t2', 400, 0)];
    const tableData = [makeTableData('db.t1', 'db', 't1'), makeTableData('db.t2', 'db', 't2')];
    const result = separateDatabaseClusters(nodes, tableData, 'RIGHT', 60);
    expect(result[0].position.x).toBe(100);
    expect(result[1].position.x).toBe(400);
  });

  it('does not shift nodes when bounding boxes already have sufficient gap', () => {
    // db_a nodes at x=0-280, db_b nodes at x=700 — gap > 2*60=120
    const nodes = [makeNode('db_a.t1', 0, 0), makeNode('db_b.t1', 700, 0)];
    const tableData = [makeTableData('db_a.t1', 'db_a', 't1'), makeTableData('db_b.t1', 'db_b', 't1')];
    const result = separateDatabaseClusters(nodes, tableData, 'RIGHT', 60);
    // db_b box starts at 700-60=640, db_a box ends at ~280+60=340; no overlap
    expect(result.find(n => n.id === 'db_b.t1')!.position.x).toBe(700);
  });

  it('shifts the later database right when bounding boxes overlap (direction=RIGHT)', () => {
    // db_a node at x=0 (width ~280), db_b node at x=200 — boxes overlap
    const nodes = [makeNode('db_a.t1', 0, 0), makeNode('db_b.t1', 200, 0)];
    const tableData = [makeTableData('db_a.t1', 'db_a', 't1'), makeTableData('db_b.t1', 'db_b', 't1')];
    const result = separateDatabaseClusters(nodes, tableData, 'RIGHT', 60);
    const aNode = result.find(n => n.id === 'db_a.t1')!;
    const bNode = result.find(n => n.id === 'db_b.t1')!;
    // After separation, db_b box near edge >= db_a box far edge
    const aWidth = calculateTableNodeWidth('t1', tableData[0].columns);
    const aBoxFarEdge = aNode.position.x + aWidth + 60;
    const bBoxNearEdge = bNode.position.x - 60;
    expect(bBoxNearEdge).toBeGreaterThanOrEqual(aBoxFarEdge);
  });

  it('shifts along y-axis when direction=DOWN', () => {
    // db_a at y=0, db_b at y=50 — boxes overlap in y
    const nodes = [makeNode('db_a.t1', 0, 0), makeNode('db_b.t1', 0, 50)];
    const tableData = [makeTableData('db_a.t1', 'db_a', 't1'), makeTableData('db_b.t1', 'db_b', 't1')];
    const result = separateDatabaseClusters(nodes, tableData, 'DOWN', 60);
    const aNode = result.find(n => n.id === 'db_a.t1')!;
    const bNode = result.find(n => n.id === 'db_b.t1')!;
    // x unchanged — only y shifted
    expect(aNode.position.x).toBe(0);
    expect(bNode.position.x).toBe(0);
    const aHeight = calculateTableNodeHeight(1, true);
    const aBoxFarEdge = aNode.position.y + aHeight + 60;
    const bBoxNearEdge = bNode.position.y - 60;
    expect(bBoxNearEdge).toBeGreaterThanOrEqual(aBoxFarEdge);
  });
});

// Unit tests for topoSortDatabases
describe('topoSortDatabases', () => {
  function makeMap(pairs: [string, string][]): Map<string, string> {
    return new Map(pairs);
  }

  it('places upstream database before downstream database', () => {
    // bronze → silver (bronze feeds silver)
    const columnToTable = makeMap([['c1', 'bronze.t1'], ['c2', 'silver.t2']]);
    const tableToDb = makeMap([['bronze.t1', 'bronze'], ['silver.t2', 'silver']]);
    const edges = [{ id: 'e1', source: 'c1', target: 'c2' }];
    const order = topoSortDatabases(new Set(['bronze', 'silver']), edges, columnToTable, tableToDb);
    expect(order.indexOf('bronze')).toBeLessThan(order.indexOf('silver'));
  });

  it('orders a three-stage pipeline correctly (bronze → silver → gold)', () => {
    const columnToTable = makeMap([
      ['c1', 'bronze.t1'], ['c2', 'silver.t2'], ['c3', 'silver.t2'], ['c4', 'gold.t3'],
    ]);
    const tableToDb = makeMap([
      ['bronze.t1', 'bronze'], ['silver.t2', 'silver'], ['gold.t3', 'gold'],
    ]);
    const edges = [
      { id: 'e1', source: 'c1', target: 'c2' },
      { id: 'e2', source: 'c3', target: 'c4' },
    ];
    const order = topoSortDatabases(new Set(['bronze', 'silver', 'gold']), edges, columnToTable, tableToDb);
    expect(order.indexOf('bronze')).toBeLessThan(order.indexOf('silver'));
    expect(order.indexOf('silver')).toBeLessThan(order.indexOf('gold'));
  });

  it('returns all databases even when some have no cross-db edges', () => {
    const columnToTable = makeMap([['c1', 'a.t1'], ['c2', 'b.t2']]);
    const tableToDb = makeMap([['a.t1', 'a'], ['b.t2', 'b']]);
    const edges = [{ id: 'e1', source: 'c1', target: 'c2' }];
    const order = topoSortDatabases(new Set(['a', 'b', 'isolated']), edges, columnToTable, tableToDb);
    expect(order).toHaveLength(3);
    expect(order).toContain('isolated');
  });
});

// Cross-database cluster separation integration tests (via layoutGraph)
describe('cross-database cluster separation', () => {
  it('separates databases spatially (direction=RIGHT)', async () => {
    const nodes: LineageNode[] = [
      { id: '1', type: 'column', databaseName: 'db_alpha', tableName: 't1', columnName: 'col1' },
      { id: '2', type: 'column', databaseName: 'db_alpha', tableName: 't2', columnName: 'col2' },
      { id: '3', type: 'column', databaseName: 'db_beta', tableName: 't3', columnName: 'col3' },
    ];
    const edges: LineageEdge[] = [
      { id: 'e1', source: '1', target: '3' },
    ];

    const result = await layoutGraph(nodes, edges, { direction: 'RIGHT' });

    // Find nodes by database
    const alphaNodes = result.nodes.filter(n => n.data.databaseName === 'db_alpha');
    const betaNodes = result.nodes.filter(n => n.data.databaseName === 'db_beta');

    expect(alphaNodes.length).toBe(2);
    expect(betaNodes.length).toBe(1);

    // All alpha nodes should be to the left of all beta nodes (alphabetical partition: alpha=0, beta=1)
    const alphaMaxX = Math.max(...alphaNodes.map(n => n.position.x));
    const betaMinX = Math.min(...betaNodes.map(n => n.position.x));

    expect(alphaMaxX).toBeLessThan(betaMinX);
  });

  it('separates databases spatially (direction=DOWN)', async () => {
    const nodes: LineageNode[] = [
      { id: '1', type: 'column', databaseName: 'db_alpha', tableName: 't1', columnName: 'col1' },
      { id: '2', type: 'column', databaseName: 'db_beta', tableName: 't2', columnName: 'col2' },
    ];
    const edges: LineageEdge[] = [
      { id: 'e1', source: '1', target: '2' },
    ];

    const result = await layoutGraph(nodes, edges, { direction: 'DOWN' });

    const alphaNodes = result.nodes.filter(n => n.data.databaseName === 'db_alpha');
    const betaNodes = result.nodes.filter(n => n.data.databaseName === 'db_beta');

    // In DOWN direction, alpha (partition 0) should be above beta (partition 1)
    const alphaMaxY = Math.max(...alphaNodes.map(n => n.position.y));
    const betaMinY = Math.min(...betaNodes.map(n => n.position.y));

    expect(alphaMaxY).toBeLessThan(betaMinY);
  });

  it('single-database layout (compound path) is unaffected', async () => {
    const nodes: LineageNode[] = [
      { id: '1', type: 'column', databaseName: 'db', tableName: 't1', columnName: 'a' },
      { id: '2', type: 'column', databaseName: 'db', tableName: 't2', columnName: 'b' },
      { id: '3', type: 'column', databaseName: 'db', tableName: 't3', columnName: 'c' },
    ];
    const edges: LineageEdge[] = [
      { id: 'e1', source: '1', target: '2' },
      { id: 'e2', source: '2', target: '3' },
    ];

    const result = await layoutGraph(nodes, edges);

    expect(result.nodes).toHaveLength(3);
    result.nodes.forEach(node => {
      expect(node.position.x).toBeDefined();
      expect(node.position.y).toBeDefined();
      expect(Number.isFinite(node.position.x)).toBe(true);
      expect(Number.isFinite(node.position.y)).toBe(true);
    });
  });

  it('separates three databases into distinct spatial regions', async () => {
    const nodes: LineageNode[] = [
      { id: '1', type: 'column', databaseName: 'db_a', tableName: 't1', columnName: 'c1' },
      { id: '2', type: 'column', databaseName: 'db_b', tableName: 't2', columnName: 'c2' },
      { id: '3', type: 'column', databaseName: 'db_c', tableName: 't3', columnName: 'c3' },
    ];
    const edges: LineageEdge[] = [
      { id: 'e1', source: '1', target: '2' },
      { id: 'e2', source: '2', target: '3' },
    ];

    const result = await layoutGraph(nodes, edges, { direction: 'RIGHT' });

    const dbANodes = result.nodes.filter(n => n.data.databaseName === 'db_a');
    const dbBNodes = result.nodes.filter(n => n.data.databaseName === 'db_b');
    const dbCNodes = result.nodes.filter(n => n.data.databaseName === 'db_c');

    // With alphabetical partitioning and RIGHT direction: db_a < db_b < db_c
    const aMaxX = Math.max(...dbANodes.map(n => n.position.x));
    const bMinX = Math.min(...dbBNodes.map(n => n.position.x));
    const bMaxX = Math.max(...dbBNodes.map(n => n.position.x));
    const cMinX = Math.min(...dbCNodes.map(n => n.position.x));

    expect(aMaxX).toBeLessThan(bMinX);
    expect(bMaxX).toBeLessThan(cMinX);
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
