import ELK, { ElkNode, ElkExtendedEdge } from 'elkjs/lib/elk.bundled.js';
import type { Node, Edge } from '@xyflow/react';
import type { LineageNode, LineageEdge } from '../../types';

const elk = new ELK();

interface LayoutOptions {
  direction?: 'RIGHT' | 'LEFT' | 'DOWN' | 'UP';
  nodeSpacing?: number;
  layerSpacing?: number;
}

export async function layoutGraph(
  nodes: LineageNode[],
  edges: LineageEdge[],
  options: LayoutOptions = {}
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

export function groupByTable(nodes: LineageNode[]): Map<string, LineageNode[]> {
  const groups = new Map<string, LineageNode[]>();
  for (const node of nodes) {
    if (node.type === 'column' && node.tableName) {
      const key = `${node.databaseName}.${node.tableName}`;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(node);
    }
  }
  return groups;
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

export function getEdgeColor(edge: LineageEdge): string {
  if (edge.transformationType === 'DIRECT') return '#10b981';
  if (edge.transformationType === 'AGGREGATION') return '#f59e0b';
  if (edge.transformationType === 'CALCULATION') return '#8b5cf6';
  return '#64748b';
}
