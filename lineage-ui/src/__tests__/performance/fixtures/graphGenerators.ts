/**
 * Graph Generator Utilities for Performance Benchmarks
 *
 * These utilities generate consistent test graphs of varying sizes
 * for benchmarking ELK.js layout and React Flow rendering performance.
 *
 * The generators create multi-table lineage graphs with cross-table edges
 * to exercise both the flat layout (cross-database) and compound node
 * layout paths in layoutEngine.
 */

import type { LineageNode, LineageEdge } from '../../../types';

export interface GeneratedGraph {
  nodes: LineageNode[];
  edges: LineageEdge[];
  nodeCount: number;
  edgeCount: number;
}

/**
 * Creates a column node for a specific table
 */
function createColumnNode(
  db: string,
  table: string,
  column: string,
  metadata?: Record<string, unknown>
): LineageNode {
  return {
    id: `${db}.${table}.${column}`,
    type: 'column',
    databaseName: db,
    tableName: table,
    columnName: column,
    metadata: {
      columnType: 'VARCHAR(100)',
      ...metadata,
    },
  };
}

/**
 * Creates an edge between two columns
 */
function createEdge(
  sourceId: string,
  targetId: string,
  transformationType: string = 'DIRECT'
): LineageEdge {
  return {
    id: `e_${sourceId}_${targetId}`,
    source: sourceId,
    target: targetId,
    transformationType,
    confidenceScore: 0.95,
  };
}

/**
 * Generates a multi-table lineage graph with the specified total column count.
 *
 * Creates a layered graph structure where:
 * - Number of layers = sqrt(nodeCount)
 * - Columns per layer = nodeCount / layers
 * - Each column is in a separate table (cross-table edges)
 * - Edges connect each column to 1-2 columns in the next layer
 *
 * This structure tests both layout algorithm performance and edge routing.
 *
 * @param nodeCount - Total number of column nodes to create
 * @returns Generated graph with nodes, edges, and counts
 */
export function generateGraph(nodeCount: number): GeneratedGraph {
  const nodes: LineageNode[] = [];
  const edges: LineageEdge[] = [];

  // Calculate layer dimensions
  const layerCount = Math.max(2, Math.floor(Math.sqrt(nodeCount)));
  const nodesPerLayer = Math.ceil(nodeCount / layerCount);

  let nodeIndex = 0;
  const layerNodes: string[][] = [];

  // Create nodes in layers, each column in its own table
  for (let layer = 0; layer < layerCount && nodeIndex < nodeCount; layer++) {
    const currentLayerNodes: string[] = [];

    for (let col = 0; col < nodesPerLayer && nodeIndex < nodeCount; col++) {
      const tableIndex = nodeIndex;
      const tableName = `TABLE_${tableIndex}`;
      const columnName = `col_${layer}_${col}`;
      const nodeId = `benchmark_db.${tableName}.${columnName}`;

      nodes.push(
        createColumnNode('benchmark_db', tableName, columnName, {
          columnType: 'VARCHAR(255)',
          isPrimaryKey: col === 0,
        })
      );

      currentLayerNodes.push(nodeId);
      nodeIndex++;
    }

    layerNodes.push(currentLayerNodes);
  }

  // Create edges between adjacent layers
  // Each node connects to 1-2 nodes in the next layer
  const transformTypes = ['DIRECT', 'DERIVED', 'AGGREGATED', 'JOINED'];

  for (let layer = 0; layer < layerNodes.length - 1; layer++) {
    const currentLayer = layerNodes[layer];
    const nextLayer = layerNodes[layer + 1];

    currentLayer.forEach((sourceId, sourceIdx) => {
      // Connect to corresponding node in next layer
      const primaryTarget = nextLayer[sourceIdx % nextLayer.length];
      const transType = transformTypes[sourceIdx % transformTypes.length];
      edges.push(createEdge(sourceId, primaryTarget, transType));

      // Add secondary edge for some nodes (creates fan-out/fan-in patterns)
      if (sourceIdx % 3 === 0 && nextLayer.length > 1) {
        const secondaryTarget = nextLayer[(sourceIdx + 1) % nextLayer.length];
        if (secondaryTarget !== primaryTarget) {
          edges.push(createEdge(sourceId, secondaryTarget, 'DERIVED'));
        }
      }
    });
  }

  return {
    nodes,
    edges,
    nodeCount: nodes.length,
    edgeCount: edges.length,
  };
}

/**
 * Generates a graph with specific depth (layers) and breadth (nodes per layer).
 *
 * Useful for testing:
 * - Deep graphs (many layers, few nodes per layer) - tests recursive layout
 * - Wide graphs (few layers, many nodes per layer) - tests parallel node placement
 *
 * @param depth - Number of layers
 * @param breadth - Nodes per layer
 * @returns Generated graph with nodes, edges, and counts
 */
export function generateLayeredGraph(
  depth: number,
  breadth: number
): GeneratedGraph {
  const nodes: LineageNode[] = [];
  const edges: LineageEdge[] = [];
  const layerNodes: string[][] = [];

  // Create nodes layer by layer
  for (let layer = 0; layer < depth; layer++) {
    const currentLayerNodes: string[] = [];

    for (let col = 0; col < breadth; col++) {
      const nodeIndex = layer * breadth + col;
      const tableName = `TBL_${nodeIndex}`;
      const columnName = `col_${layer}_${col}`;
      const nodeId = `layered_db.${tableName}.${columnName}`;

      nodes.push(
        createColumnNode('layered_db', tableName, columnName, {
          columnType: 'INTEGER',
        })
      );

      currentLayerNodes.push(nodeId);
    }

    layerNodes.push(currentLayerNodes);
  }

  // Connect adjacent layers with edges
  const transformTypes = ['DIRECT', 'DERIVED', 'AGGREGATED', 'JOINED'];

  for (let layer = 0; layer < depth - 1; layer++) {
    const currentLayer = layerNodes[layer];
    const nextLayer = layerNodes[layer + 1];

    currentLayer.forEach((sourceId, idx) => {
      // Each node connects to corresponding node in next layer
      const targetIdx = idx % nextLayer.length;
      const transType = transformTypes[idx % transformTypes.length];
      edges.push(createEdge(sourceId, nextLayer[targetIdx], transType));

      // Add cross-connections for more realistic graph structure
      if (idx > 0 && idx % 2 === 0) {
        const altTargetIdx = (targetIdx + 1) % nextLayer.length;
        edges.push(createEdge(sourceId, nextLayer[altTargetIdx], 'JOINED'));
      }
    });
  }

  return {
    nodes,
    edges,
    nodeCount: nodes.length,
    edgeCount: edges.length,
  };
}

/**
 * Generates a single-database graph where all tables are in the same database.
 * This tests the compound node layout path (database clustering).
 *
 * @param nodeCount - Total number of column nodes
 * @returns Generated graph
 */
export function generateSingleDatabaseGraph(nodeCount: number): GeneratedGraph {
  const nodes: LineageNode[] = [];
  const edges: LineageEdge[] = [];

  // Create tables with multiple columns each (more realistic)
  const columnsPerTable = 5;
  const tableCount = Math.ceil(nodeCount / columnsPerTable);

  let nodeIndex = 0;

  for (let t = 0; t < tableCount && nodeIndex < nodeCount; t++) {
    const tableName = `FACT_${t}`;

    for (let c = 0; c < columnsPerTable && nodeIndex < nodeCount; c++) {
      const columnName = `field_${c}`;
      nodes.push(
        createColumnNode('single_db', tableName, columnName, {
          columnType: c === 0 ? 'INTEGER' : 'VARCHAR(100)',
          isPrimaryKey: c === 0,
        })
      );
      nodeIndex++;
    }
  }

  // Create edges within and between tables
  const transformTypes = ['DIRECT', 'DERIVED', 'AGGREGATED'];

  for (let t = 0; t < tableCount - 1; t++) {
    // Connect first column of each table to first column of next table
    const sourceTable = `FACT_${t}`;
    const targetTable = `FACT_${t + 1}`;
    const sourceId = `single_db.${sourceTable}.field_0`;
    const targetId = `single_db.${targetTable}.field_0`;

    edges.push(createEdge(sourceId, targetId, transformTypes[t % 3]));

    // Add some within-table edges
    if (columnsPerTable > 1) {
      const withinSource = `single_db.${sourceTable}.field_0`;
      const withinTarget = `single_db.${sourceTable}.field_1`;
      edges.push(createEdge(withinSource, withinTarget, 'DERIVED'));
    }
  }

  return {
    nodes,
    edges,
    nodeCount: nodes.length,
    edgeCount: edges.length,
  };
}
