import ELK, { ElkNode, ElkExtendedEdge, ElkPort } from 'elkjs/lib/elk.bundled.js';
import type { Node, Edge } from '@xyflow/react';
import type { LineageNode, LineageEdge } from '../../types';
import type { ColumnDefinition } from '../../components/domain/LineageGraph/TableNode/ColumnRow';
import type { AssetType } from '../../components/domain/LineageGraph/TableNode/TableNodeHeader';

// Re-define TableNodeData here to avoid circular dependencies
export interface TableNodeData {
  id: string;
  databaseName: string;
  tableName: string;
  columns: ColumnDefinition[];
  isExpanded: boolean;
  assetType: AssetType;
  [key: string]: unknown;
}

const elk = new ELK();

interface LayoutOptions {
  direction?: 'RIGHT' | 'LEFT' | 'DOWN' | 'UP';
  nodeSpacing?: number;
  layerSpacing?: number;
}

// Constants for node sizing
const HEADER_HEIGHT = 40;
const COLUMN_ROW_HEIGHT = 28;
const NODE_PADDING = 8;
const MIN_NODE_WIDTH = 280;
const MAX_NODE_WIDTH = 400;

/**
 * Maps tableKind values from Teradata to AssetType
 * T = Table, V = View, M = Materialized View
 */
function mapTableKindToAssetType(tableKind: string | undefined): AssetType {
  switch (tableKind) {
    case 'V':
      return 'view';
    case 'M':
      return 'materialized_view';
    default:
      return 'table';
  }
}

/**
 * Groups column nodes by their parent table
 */
export function groupColumnsByTable(nodes: LineageNode[]): Map<string, LineageNode[]> {
  const groups = new Map<string, LineageNode[]>();

  for (const node of nodes) {
    if (node.type === 'column' && node.tableName && node.databaseName) {
      const tableKey = `${node.databaseName}.${node.tableName}`;
      if (!groups.has(tableKey)) {
        groups.set(tableKey, []);
      }
      groups.get(tableKey)!.push(node);
    }
  }

  return groups;
}

/**
 * Gets the table key for a column node ID
 */
function getTableKeyFromColumnId(
  columnId: string,
  columnToTableMap: Map<string, string>
): string | undefined {
  return columnToTableMap.get(columnId);
}

/**
 * Calculates the height of a table node based on column count
 */
export function calculateTableNodeHeight(columnCount: number, isExpanded: boolean): number {
  if (!isExpanded) {
    return HEADER_HEIGHT + 32; // Header + collapsed message
  }
  return HEADER_HEIGHT + (columnCount * COLUMN_ROW_HEIGHT) + NODE_PADDING;
}

/**
 * Calculates the width of a table node based on content
 */
export function calculateTableNodeWidth(tableName: string, columns: ColumnDefinition[]): number {
  // Calculate based on longest column name + data type
  const maxColumnLength = Math.max(
    ...columns.map(
      (col) => col.name.length + (col.dataType?.length || 0)
    )
  );

  const estimatedWidth = Math.max(
    MIN_NODE_WIDTH,
    tableName.length * 8 + 100,
    maxColumnLength * 7 + 80
  );

  return Math.min(estimatedWidth, MAX_NODE_WIDTH);
}

/**
 * Creates ELK ports for a table node's columns
 */
function createElkPorts(tableId: string, columns: ColumnDefinition[]): ElkPort[] {
  return columns.flatMap((column, index) => [
    {
      id: `${tableId}-${column.id}-target`,
      properties: {
        'port.side': 'WEST',
        'port.index': String(index),
      },
    },
    {
      id: `${tableId}-${column.id}-source`,
      properties: {
        'port.side': 'EAST',
        'port.index': String(index),
      },
    },
  ]);
}

/**
 * Transforms LineageNodes to TableNodeData format
 */
function transformToTableNodes(
  tableGroups: Map<string, LineageNode[]>,
  edges: LineageEdge[]
): { nodes: TableNodeData[]; columnToTableMap: Map<string, string> } {
  const columnToTableMap = new Map<string, string>();
  const nodes: TableNodeData[] = [];

  // Find which columns have lineage
  const columnsWithUpstream = new Set<string>();
  const columnsWithDownstream = new Set<string>();
  edges.forEach((edge) => {
    columnsWithUpstream.add(edge.target);
    columnsWithDownstream.add(edge.source);
  });

  tableGroups.forEach((columnNodes, tableKey) => {
    const firstColumn = columnNodes[0];

    const columns: ColumnDefinition[] = columnNodes.map((node) => {
      // Map column ID to table key for edge routing
      columnToTableMap.set(node.id, tableKey);

      return {
        id: node.id,
        name: node.columnName || 'unknown',
        dataType: (node.metadata?.columnType as string) || 'unknown',
        isPrimaryKey: node.metadata?.isPrimaryKey === true,
        isForeignKey: node.metadata?.isForeignKey === true,
        hasUpstreamLineage: columnsWithUpstream.has(node.id),
        hasDownstreamLineage: columnsWithDownstream.has(node.id),
      };
    });

    nodes.push({
      id: tableKey,
      databaseName: firstColumn.databaseName,
      tableName: firstColumn.tableName || 'unknown',
      columns,
      isExpanded: true,
      assetType: mapTableKindToAssetType(firstColumn.metadata?.tableKind as string | undefined),
    });
  });

  return { nodes, columnToTableMap };
}

/**
 * Main layout function - transforms LineageNodes/Edges to React Flow format
 * with table-grouped nodes and column-level edge routing
 */
export async function layoutGraph(
  rawNodes: LineageNode[],
  rawEdges: LineageEdge[],
  options: LayoutOptions = {}
): Promise<{ nodes: Node[]; edges: Edge[] }> {
  const {
    direction = 'RIGHT',
    nodeSpacing = 60,
    layerSpacing = 150,
  } = options;

  // Group columns by table
  const tableGroups = groupColumnsByTable(rawNodes);

  // If no column nodes, fall back to simple layout
  if (tableGroups.size === 0) {
    return layoutSimpleNodes(rawNodes, rawEdges, options);
  }

  // Transform to table node format
  const { nodes: tableNodeData, columnToTableMap } = transformToTableNodes(tableGroups, rawEdges);

  // Create ELK nodes with ports
  const elkNodes: ElkNode[] = tableNodeData.map((tableNode) => {
    const height = calculateTableNodeHeight(tableNode.columns.length, tableNode.isExpanded);
    const width = calculateTableNodeWidth(tableNode.tableName, tableNode.columns);

    return {
      id: tableNode.id,
      width,
      height,
      ports: createElkPorts(tableNode.id, tableNode.columns),
      labels: [{ text: `${tableNode.databaseName}.${tableNode.tableName}` }],
    };
  });

  // Create ELK edges with port references
  const elkEdges: ElkExtendedEdge[] = rawEdges
    .map((edge) => {
      const sourceTableKey = getTableKeyFromColumnId(edge.source, columnToTableMap);
      const targetTableKey = getTableKeyFromColumnId(edge.target, columnToTableMap);

      if (!sourceTableKey || !targetTableKey) {
        return null;
      }

      return {
        id: edge.id,
        sources: [`${sourceTableKey}-${edge.source}-source`],
        targets: [`${targetTableKey}-${edge.target}-target`],
      };
    })
    .filter((edge): edge is ElkExtendedEdge => edge !== null);

  // Configure and run ELK layout
  const elkGraph: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': direction,
      'elk.spacing.nodeNode': String(nodeSpacing),
      'elk.layered.spacing.nodeNodeBetweenLayers': String(layerSpacing),
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
      'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
      'elk.portConstraints': 'FIXED_ORDER',
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
    },
    children: elkNodes,
    edges: elkEdges,
  };

  const layoutedGraph = await elk.layout(elkGraph);

  // Transform to React Flow nodes
  const layoutedNodes: Node[] = (layoutedGraph.children || []).map((elkNode) => {
    const tableNode = tableNodeData.find((n) => n.id === elkNode.id)!;
    return {
      id: elkNode.id,
      type: 'tableNode',
      position: { x: elkNode.x || 0, y: elkNode.y || 0 },
      data: tableNode,
    };
  });

  // Transform to React Flow edges with handles
  const layoutedEdges: Edge[] = rawEdges
    .map((edge) => {
      const sourceTableKey = getTableKeyFromColumnId(edge.source, columnToTableMap);
      const targetTableKey = getTableKeyFromColumnId(edge.target, columnToTableMap);

      if (!sourceTableKey || !targetTableKey) {
        return null;
      }

      return {
        id: edge.id,
        source: sourceTableKey,
        sourceHandle: `${sourceTableKey}-${edge.source}-source`,
        target: targetTableKey,
        targetHandle: `${targetTableKey}-${edge.target}-target`,
        type: 'lineageEdge',
        animated: false,
        data: {
          sourceColumnId: edge.source,
          targetColumnId: edge.target,
          transformationType: edge.transformationType || 'unknown',
          confidenceScore: edge.confidenceScore,
        },
        style: {
          stroke: getEdgeColor(edge),
          strokeWidth: 2,
        },
        markerEnd: {
          type: 'arrowclosed' as const,
          color: getEdgeColor(edge),
        },
      } as Edge;
    })
    .filter((edge): edge is Edge => edge !== null);

  return { nodes: layoutedNodes, edges: layoutedEdges };
}

/**
 * Fallback layout for non-column nodes (databases, tables without columns)
 */
async function layoutSimpleNodes(
  nodes: LineageNode[],
  edges: LineageEdge[],
  options: LayoutOptions
): Promise<{ nodes: Node[]; edges: Edge[] }> {
  const {
    direction = 'RIGHT',
    nodeSpacing = 50,
    layerSpacing = 150,
  } = options;

  const elkNodes: ElkNode[] = nodes.map((node) => ({
    id: node.id,
    width: getNodeWidth(node),
    height: getNodeHeight(node),
    labels: [{ text: getNodeLabel(node) }],
  }));

  const elkEdges: ElkExtendedEdge[] = edges.map((edge) => ({
    id: edge.id,
    sources: [edge.source],
    targets: [edge.target],
  }));

  const elkGraph: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': direction,
      'elk.spacing.nodeNode': String(nodeSpacing),
      'elk.layered.spacing.nodeNodeBetweenLayers': String(layerSpacing),
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
      'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
    },
    children: elkNodes,
    edges: elkEdges,
  };

  const layoutedGraph = await elk.layout(elkGraph);

  const layoutedNodes: Node[] = (layoutedGraph.children || []).map((elkNode) => {
    const originalNode = nodes.find((n) => n.id === elkNode.id)!;
    return {
      id: elkNode.id,
      type: getReactFlowNodeType(originalNode),
      position: { x: elkNode.x || 0, y: elkNode.y || 0 },
      data: {
        ...originalNode,
        label: getNodeLabel(originalNode),
      },
    };
  });

  const layoutedEdges: Edge[] = edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    type: 'smoothstep',
    animated: edge.confidenceScore !== undefined && edge.confidenceScore < 0.8,
    data: {
      transformationType: edge.transformationType,
      confidenceScore: edge.confidenceScore,
    },
    style: {
      stroke: getEdgeColor(edge),
      strokeWidth: 2,
    },
    markerEnd: {
      type: 'arrowclosed' as const,
      color: getEdgeColor(edge),
    },
  }));

  return { nodes: layoutedNodes, edges: layoutedEdges };
}

// Legacy helper functions for backward compatibility
export function groupByTable(nodes: LineageNode[]): Map<string, LineageNode[]> {
  return groupColumnsByTable(nodes);
}

export function getNodeWidth(node: LineageNode): number {
  const label = getNodeLabel(node);
  return Math.max(150, label.length * 8 + 40);
}

export function getNodeHeight(node: LineageNode): number {
  return node.type === 'column' ? 40 : 60;
}

export function getNodeLabel(node: LineageNode): string {
  if (node.type === 'column') {
    return `${node.tableName}.${node.columnName}`;
  }
  if (node.type === 'table') {
    return `${node.databaseName}.${node.tableName}`;
  }
  return node.databaseName;
}

export function getReactFlowNodeType(node: LineageNode): string {
  return `${node.type}Node`;
}

/**
 * Returns edge color based on transformation type per spec Section 2.1
 */
export function getEdgeColor(edge: LineageEdge): string {
  const type = edge.transformationType?.toLowerCase();

  switch (type) {
    case 'direct':
      return '#22C55E'; // green-500
    case 'derived':
      return '#3B82F6'; // blue-500
    case 'aggregated':
    case 'aggregation':
      return '#A855F7'; // purple-500
    case 'joined':
      return '#06B6D4'; // cyan-500
    case 'calculation':
      return '#8b5cf6'; // violet-500 (legacy)
    default:
      return '#9CA3AF'; // gray-400 (unknown)
  }
}

/**
 * Applies confidence-based color fading per spec Section 2.4
 */
export function getEdgeStyleByConfidence(
  baseColor: string,
  confidence: number
): { color: string; opacity: number } {
  // Confidence is expected as 0-100 or 0-1
  const normalizedConfidence = confidence > 1 ? confidence : confidence * 100;

  const opacity =
    normalizedConfidence >= 90
      ? 1.0
      : normalizedConfidence >= 70
        ? 0.9
        : normalizedConfidence >= 50
          ? 0.8
          : 0.7;

  // Note: For full saturation adjustment, you'd need to convert to HSL
  // For now, we just adjust opacity
  return { color: baseColor, opacity };
}
