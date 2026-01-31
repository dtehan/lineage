import type { OpenLineageNode, OpenLineageEdge } from '../../types/openlineage';
import type { LineageNode, LineageEdge } from '../../types';

/**
 * Adapter to convert OpenLineage V2 graph format to legacy LineageNode/LineageEdge format
 * This allows the existing layout engine and components to work with OpenLineage data
 */

/**
 * Parse database name from dataset name (e.g., "demo_user.customers" -> "demo_user")
 */
function parseDatabaseName(datasetName: string): string {
  const parts = datasetName.split('.');
  return parts.length > 1 ? parts[0] : datasetName;
}

/**
 * Parse table name from dataset name (e.g., "demo_user.customers" -> "customers")
 */
function parseTableName(datasetName: string): string {
  const parts = datasetName.split('.');
  return parts.length > 1 ? parts.slice(1).join('.') : datasetName;
}

/**
 * Convert OpenLineage node to legacy LineageNode format
 */
export function convertOpenLineageNode(olNode: OpenLineageNode): LineageNode {
  // OpenLineage nodes are either dataset or field level
  if (olNode.type === 'field') {
    // Field node -> column node
    // Handle dataset being either a string or object
    const datasetName = typeof olNode.dataset === 'string'
      ? olNode.dataset
      : olNode.dataset.name;

    // Extract sourceType from dataset object if available
    const sourceType = typeof olNode.dataset === 'object' && olNode.dataset.sourceType
      ? olNode.dataset.sourceType
      : undefined;

    // The field name can be in olNode.field or olNode.name
    const fieldName = olNode.field || olNode.name || 'unknown';

    return {
      id: olNode.id,
      type: 'column',
      databaseName: parseDatabaseName(datasetName),
      tableName: parseTableName(datasetName),
      columnName: fieldName,
      metadata: {
        ...olNode.metadata,
        sourceType, // Add sourceType from dataset to column metadata
      },
    };
  } else {
    // Dataset node -> table node
    // For dataset nodes, the name is directly on the node (not nested in .dataset)
    const datasetName = olNode.name || (typeof olNode.dataset === 'string'
      ? olNode.dataset
      : olNode.dataset?.name) || 'unknown';

    return {
      id: olNode.id,
      type: 'table',
      databaseName: parseDatabaseName(datasetName),
      tableName: parseTableName(datasetName),
      metadata: {
        ...olNode.metadata,
        sourceType: (olNode as any).sourceType, // Add sourceType for dataset nodes
      },
    };
  }
}

/**
 * Convert OpenLineage edge to legacy LineageEdge format
 */
export function convertOpenLineageEdge(olEdge: OpenLineageEdge): LineageEdge {
  return {
    id: olEdge.id,
    source: olEdge.source,
    target: olEdge.target,
    transformationType: olEdge.transformationType.toLowerCase() as 'direct' | 'indirect',
    confidenceScore: olEdge.confidenceScore,
  };
}

/**
 * Convert entire OpenLineage graph to legacy format
 */
export function convertOpenLineageGraph(
  nodes: OpenLineageNode[],
  edges: OpenLineageEdge[]
): { nodes: LineageNode[]; edges: LineageEdge[] } {
  return {
    nodes: nodes.map(convertOpenLineageNode),
    edges: edges.map(convertOpenLineageEdge),
  };
}
