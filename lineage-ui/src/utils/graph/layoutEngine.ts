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

export interface LayoutOptions {
  direction?: 'RIGHT' | 'LEFT' | 'DOWN' | 'UP';
  nodeSpacing?: number;
  layerSpacing?: number;
  onProgress?: (progress: number) => void;
}

/**
 * Layout performance metrics for benchmarking and profiling.
 * Only populated when NODE_ENV !== 'production'.
 */
export interface LayoutMetrics {
  /** Time spent grouping columns and transforming to table nodes (ms) */
  prepTime: number;
  /** Time spent in ELK.js layout algorithm (ms) */
  elkTime: number;
  /** Time spent mapping ELK results to React Flow format (ms) */
  transformTime: number;
  /** Total layout time (ms) */
  totalTime: number;
}

/** Result type for layoutGraph with optional metrics */
export interface LayoutResult {
  nodes: Node[];
  edges: Edge[];
  metrics?: LayoutMetrics;
}

// Constants for node sizing
const HEADER_HEIGHT = 40;
const COLUMN_ROW_HEIGHT = 28;
const NODE_PADDING = 8;
const MIN_NODE_WIDTH = 280;
const MAX_NODE_WIDTH = 400;

/**
 * Maps tableKind/sourceType values from Teradata to AssetType
 * Handles both single-letter codes (T, V, M) and full words (TABLE, VIEW, MATERIALIZED_VIEW)
 */
function mapTableKindToAssetType(tableKind: string | undefined): AssetType {
  if (!tableKind) return 'table';

  const normalized = tableKind.toUpperCase();

  switch (normalized) {
    case 'V':
    case 'VIEW':
      return 'view';
    case 'M':
    case 'MATERIALIZED VIEW':
    case 'MATERIALIZED_VIEW':
      return 'materialized_view';
    case 'T':
    case 'TABLE':
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

    const columns: ColumnDefinition[] = columnNodes
      .map((node) => {
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
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    nodes.push({
      id: tableKey,
      databaseName: firstColumn.databaseName,
      tableName: firstColumn.tableName || 'unknown',
      columns,
      isExpanded: true,
      assetType: mapTableKindToAssetType(
        (firstColumn.metadata?.sourceType || firstColumn.metadata?.tableKind) as string | undefined
      ),
    });
  });

  return { nodes, columnToTableMap };
}

// Constants for database cluster padding
const DATABASE_CLUSTER_PADDING = 40;
const DATABASE_CLUSTER_HEADER_HEIGHT = 50;

// Padding used by ClusterBackground — must stay in sync with ClusterBackground default
const CLUSTER_SEPARATION_PADDING = 60;

/**
 * Topologically sorts database names based on lineage edge flow.
 * Upstream databases (no incoming cross-db edges) come first (index 0 = leftmost).
 * Ties are broken alphabetically for determinism.
 *
 * @param allDatabases - all database names present in the graph
 * @param edges - raw lineage edges
 * @param columnToTableMap - maps column id → "db.table" key
 * @param tableToDatabase - maps "db.table" key → database name
 */
export function topoSortDatabases(
  allDatabases: Set<string>,
  edges: LineageEdge[],
  columnToTableMap: Map<string, string>,
  tableToDatabase: Map<string, string>
): string[] {
  // Build database-level directed graph: sourceDb → Set<targetDb>
  const dbGraph = new Map<string, Set<string>>();
  allDatabases.forEach((db) => dbGraph.set(db, new Set()));

  edges.forEach((edge) => {
    const sourceKey = columnToTableMap.get(edge.source);
    const targetKey = columnToTableMap.get(edge.target);
    if (!sourceKey || !targetKey) return;
    const sourceDb = tableToDatabase.get(sourceKey);
    const targetDb = tableToDatabase.get(targetKey);
    if (!sourceDb || !targetDb || sourceDb === targetDb) return;
    dbGraph.get(sourceDb)!.add(targetDb);
  });

  // Kahn's algorithm for topological sort
  const inDegree = new Map<string, number>();
  allDatabases.forEach((db) => inDegree.set(db, 0));
  dbGraph.forEach((targets) => {
    targets.forEach((target) => {
      inDegree.set(target, (inDegree.get(target) || 0) + 1);
    });
  });

  // Queue starts with all roots (in-degree 0), sorted alphabetically for determinism
  const queue: string[] = Array.from(allDatabases)
    .filter((db) => inDegree.get(db) === 0)
    .sort();

  const order: string[] = [];
  while (queue.length > 0) {
    queue.sort(); // keep alphabetical tie-breaking stable
    const db = queue.shift()!;
    order.push(db);
    dbGraph.get(db)?.forEach((target) => {
      const newDegree = (inDegree.get(target) || 0) - 1;
      inDegree.set(target, newDegree);
      if (newDegree === 0) queue.push(target);
    });
  }

  // Append any remaining databases (cycles or isolated)
  allDatabases.forEach((db) => {
    if (!order.includes(db)) order.push(db);
  });

  return order;
}

/**
 * Post-layout step to prevent database cluster bounding boxes from overlapping.
 * ELK partitioning controls layer order but cannot guarantee that padded bounding
 * boxes (used by ClusterBackground) won't overlap when databases share y-ranges.
 * This function shifts each database group along the primary axis so the padded
 * bounding boxes are strictly non-overlapping, respecting the provided lineage order.
 *
 * @param dbOrder - databases in lineage-flow order (upstream first). When provided,
 *   groups are placed in this order rather than sorted by current x/y position.
 */
export function separateDatabaseClusters(
  nodes: Node[],
  tableNodeData: TableNodeData[],
  direction: 'RIGHT' | 'LEFT' | 'UP' | 'DOWN',
  clusterPadding: number,
  dbOrder?: string[]
): Node[] {
  if (nodes.length === 0) return nodes;

  // Group nodes by database
  const dbNodeMap = new Map<string, Node[]>();
  nodes.forEach((node) => {
    const tableNode = tableNodeData.find((t) => t.id === node.id);
    if (!tableNode) return;
    const db = tableNode.databaseName;
    if (!dbNodeMap.has(db)) dbNodeMap.set(db, []);
    dbNodeMap.get(db)!.push(node);
  });

  if (dbNodeMap.size <= 1) return nodes;

  const isHorizontal = direction === 'RIGHT' || direction === 'LEFT';

  // For each database, compute bounding extent along the primary axis (position + node size)
  const dbExtent = new Map<string, { lo: number; hi: number }>();
  dbNodeMap.forEach((dbNodes, db) => {
    let lo = Infinity;
    let hi = -Infinity;
    dbNodes.forEach((node) => {
      const td = tableNodeData.find((t) => t.id === node.id)!;
      const width = calculateTableNodeWidth(td.tableName, td.columns);
      const height = calculateTableNodeHeight(td.columns.length, td.isExpanded);
      const primary = isHorizontal ? node.position.x : node.position.y;
      const size = isHorizontal ? width : height;
      lo = Math.min(lo, primary);
      hi = Math.max(hi, primary + size);
    });
    dbExtent.set(db, { lo, hi });
  });

  // Determine the ordering of databases.
  // When dbOrder is provided (topological/lineage order), use it directly.
  // Fallback: sort by current lo position (preserves whatever ELK decided).
  const sortedDbs = dbOrder
    ? Array.from(dbNodeMap.keys()).sort((a, b) => {
        const ai = dbOrder.indexOf(a);
        const bi = dbOrder.indexOf(b);
        if (ai === -1 && bi === -1) return 0;
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      })
    : Array.from(dbExtent.keys()).sort(
        (a, b) => dbExtent.get(a)!.lo - dbExtent.get(b)!.lo
      );

  // Place the first database at its current position, then stack subsequent ones
  // so their padded boxes begin exactly where the previous one ends.
  // Each cluster box occupies [lo - clusterPadding, hi + clusterPadding].
  const offsets = new Map<string, number>();
  offsets.set(sortedDbs[0], 0);

  // Cursor = far edge of the most recently placed cluster box
  let cursor = dbExtent.get(sortedDbs[0])!.hi + clusterPadding;

  for (let i = 1; i < sortedDbs.length; i++) {
    const currDb = sortedDbs[i];
    const currExtent = dbExtent.get(currDb)!;

    // Near edge of current cluster box (with padding, before any offset)
    const currBoxNearEdge = currExtent.lo - clusterPadding;

    if (currBoxNearEdge < cursor) {
      // Overlap (or insufficient gap): push currDb right so its box starts at cursor
      offsets.set(currDb, cursor - currBoxNearEdge);
    } else {
      offsets.set(currDb, 0);
    }

    cursor = currExtent.hi + (offsets.get(currDb) || 0) + clusterPadding;
  }

  // Apply offsets — only shift along the primary axis
  return nodes.map((node) => {
    const tableNode = tableNodeData.find((t) => t.id === node.id);
    if (!tableNode) return node;
    const offset = offsets.get(tableNode.databaseName) || 0;
    if (offset === 0) return node;

    return {
      ...node,
      position: {
        x: isHorizontal ? node.position.x + offset : node.position.x,
        y: isHorizontal ? node.position.y : node.position.y + offset,
      },
    };
  });
}

/**
 * Groups table nodes by their database name
 */
function groupTablesByDatabase(tableNodes: TableNodeData[]): Map<string, TableNodeData[]> {
  const groups = new Map<string, TableNodeData[]>();

  for (const tableNode of tableNodes) {
    const dbName = tableNode.databaseName;
    if (!groups.has(dbName)) {
      groups.set(dbName, []);
    }
    groups.get(dbName)!.push(tableNode);
  }

  return groups;
}

/**
 * Main layout function - transforms LineageNodes/Edges to React Flow format
 * with table-grouped nodes and column-level edge routing.
 * Uses ELK compound nodes to ensure tables stay within their database boundaries.
 *
 * Returns timing metrics when NODE_ENV !== 'production' for performance profiling.
 */
export async function layoutGraph(
  rawNodes: LineageNode[],
  rawEdges: LineageEdge[],
  options: LayoutOptions = {}
): Promise<LayoutResult> {
  const {
    direction = 'RIGHT',
    nodeSpacing = 40,
    layerSpacing = 100,
    onProgress,
  } = options;

  // Track timing for performance metrics (non-production only)
  // Use import.meta.env for Vite compatibility in browser environments
  const collectMetrics = import.meta.env?.MODE !== 'production';
  const startTime = collectMetrics ? performance.now() : 0;
  let prepEndTime = 0;
  let elkEndTime = 0;

  // Group columns by table
  const tableGroups = groupColumnsByTable(rawNodes);
  onProgress?.(35); // Entered layout stage

  // If no column nodes, fall back to simple layout
  if (tableGroups.size === 0) {
    return layoutSimpleNodes(rawNodes, rawEdges, options, collectMetrics ? startTime : undefined);
  }

  // Transform to table node format
  const { nodes: tableNodeData, columnToTableMap } = transformToTableNodes(tableGroups, rawEdges);
  onProgress?.(45); // Data transformed

  // Record prep phase completion
  if (collectMetrics) {
    prepEndTime = performance.now();
  }

  // Group tables by database for compound node layout
  const databaseGroups = groupTablesByDatabase(tableNodeData);

  // Build a map of tableKey -> databaseName for edge routing
  const tableToDatabase = new Map<string, string>();
  tableNodeData.forEach((t) => tableToDatabase.set(t.id, t.databaseName));

  // Check if there are cross-database edges
  let hasCrossDatabaseEdges = false;
  const allElkEdges: ElkExtendedEdge[] = [];

  rawEdges.forEach((edge) => {
    const sourceTableKey = getTableKeyFromColumnId(edge.source, columnToTableMap);
    const targetTableKey = getTableKeyFromColumnId(edge.target, columnToTableMap);

    if (!sourceTableKey || !targetTableKey) {
      return;
    }

    const sourceDb = tableToDatabase.get(sourceTableKey);
    const targetDb = tableToDatabase.get(targetTableKey);

    if (sourceDb !== targetDb) {
      hasCrossDatabaseEdges = true;
    }

    allElkEdges.push({
      id: edge.id,
      sources: [`${sourceTableKey}-${edge.source}-source`],
      targets: [`${targetTableKey}-${edge.target}-target`],
    });
  });

  
  // If there are cross-database edges, use flat layout (no compound nodes)
  // This avoids ELK's limitation with cross-hierarchy edge routing
  if (hasCrossDatabaseEdges) {
    // Build database -> partition index map using LINEAGE-FLOW ORDER (topological sort).
    // Upstream databases (pure sources) receive lower indices → placed LEFT in RIGHT-direction layout.
    const allDatabases = new Set<string>(databaseGroups.keys());
    const dbTopoOrder = topoSortDatabases(allDatabases, rawEdges, columnToTableMap, tableToDatabase);
    const databasePartitionMap = new Map<string, number>();
    dbTopoOrder.forEach((dbName, index) => {
      databasePartitionMap.set(dbName, index);
    });

    // Create flat table nodes (no database grouping) with partition assignments
    const elkTableNodes: ElkNode[] = tableNodeData.map((tableNode) => {
      const height = calculateTableNodeHeight(tableNode.columns.length, tableNode.isExpanded);
      const width = calculateTableNodeWidth(tableNode.tableName, tableNode.columns);

      return {
        id: tableNode.id,
        width,
        height,
        ports: createElkPorts(tableNode.id, tableNode.columns),
        labels: [{ text: `${tableNode.databaseName}.${tableNode.tableName}` }],
        properties: {
          'partitioning.partition': String(databasePartitionMap.get(tableNode.databaseName) ?? 0),
        },
      };
    });

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
        'elk.partitioning.activate': 'true',
      },
      children: elkTableNodes,
      edges: allElkEdges,
    };

    onProgress?.(55); // Graph built, starting ELK layout
    const layoutedGraph = await elk.layout(elkGraph);

    // Record ELK completion time
    if (collectMetrics) {
      elkEndTime = performance.now();
    }

    onProgress?.(70); // Layout complete, entering render

    // Transform to React Flow nodes
    const layoutedNodes: Node[] = (layoutedGraph.children || [])
      .map((elkNode) => {
        const tableNode = tableNodeData.find((n) => n.id === elkNode.id);
        if (tableNode) {
          return {
            id: elkNode.id,
            type: 'tableNode',
            position: { x: elkNode.x || 0, y: elkNode.y || 0 },
            data: tableNode,
          } as Node;
        }
        return null;
      })
      .filter((n): n is Node => n !== null);

    // Transform to React Flow edges
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

    // Post-layout: shift database groups so their padded bounding boxes don't overlap,
    // and ensure they appear in lineage-flow order (upstream LEFT, downstream RIGHT).
    const separatedNodes = separateDatabaseClusters(
      layoutedNodes,
      tableNodeData,
      direction,
      CLUSTER_SEPARATION_PADDING,
      dbTopoOrder
    );

    // Calculate and return metrics
    const endTime = collectMetrics ? performance.now() : 0;
    const metrics: LayoutMetrics | undefined = collectMetrics
      ? {
          prepTime: prepEndTime - startTime,
          elkTime: elkEndTime - prepEndTime,
          transformTime: endTime - elkEndTime,
          totalTime: endTime - startTime,
        }
      : undefined;

    return { nodes: separatedNodes, edges: layoutedEdges, metrics };
  }

  // No cross-database edges - use compound node layout for database clustering
  const internalEdgesByDb = new Map<string, ElkExtendedEdge[]>();

  rawEdges.forEach((edge) => {
    const sourceTableKey = getTableKeyFromColumnId(edge.source, columnToTableMap);
    const targetTableKey = getTableKeyFromColumnId(edge.target, columnToTableMap);

    if (!sourceTableKey || !targetTableKey) {
      return;
    }

    const sourceDb = tableToDatabase.get(sourceTableKey);

    const elkEdge: ElkExtendedEdge = {
      id: edge.id,
      sources: [`${sourceTableKey}-${edge.source}-source`],
      targets: [`${targetTableKey}-${edge.target}-target`],
    };

    if (sourceDb) {
      if (!internalEdgesByDb.has(sourceDb)) {
        internalEdgesByDb.set(sourceDb, []);
      }
      internalEdgesByDb.get(sourceDb)!.push(elkEdge);
    }
  });

  // Create ELK compound nodes (database clusters containing table nodes)
  const elkDatabaseNodes: ElkNode[] = [];

  databaseGroups.forEach((tables, databaseName) => {
    // Create child table nodes for this database
    const childTableNodes: ElkNode[] = tables.map((tableNode) => {
      const height = calculateTableNodeHeight(tableNode.columns.length, tableNode.isExpanded);
      const width = calculateTableNodeWidth(tableNode.tableName, tableNode.columns);

      return {
        id: tableNode.id,
        width,
        height,
        ports: createElkPorts(tableNode.id, tableNode.columns),
        labels: [{ text: tableNode.tableName }],
      };
    });

    const internalEdges = internalEdgesByDb.get(databaseName) || [];
    const hasInternalEdges = internalEdges.length > 0;

    // Choose algorithm based on whether there are internal edges
    const innerLayoutOptions: Record<string, string> = {
      'elk.padding': `[top=${DATABASE_CLUSTER_HEADER_HEIGHT},left=${DATABASE_CLUSTER_PADDING},bottom=${DATABASE_CLUSTER_PADDING},right=${DATABASE_CLUSTER_PADDING}]`,
      'elk.spacing.nodeNode': String(nodeSpacing),
    };

    if (hasInternalEdges) {
      innerLayoutOptions['elk.algorithm'] = 'layered';
      innerLayoutOptions['elk.direction'] = direction;
      innerLayoutOptions['elk.layered.spacing.nodeNodeBetweenLayers'] = String(layerSpacing);
      innerLayoutOptions['elk.portConstraints'] = 'FIXED_ORDER';
    } else {
      innerLayoutOptions['elk.algorithm'] = 'rectpacking';
      innerLayoutOptions['elk.rectpacking.widthApproximation.strategy'] = 'MAX_SCALE_DRIVEN';
      innerLayoutOptions['elk.rectpacking.widthApproximation.targetWidth'] = String(1200);
      innerLayoutOptions['elk.contentAlignment'] = 'V_CENTER H_LEFT';
    }

    // Create database compound node containing all its tables
    elkDatabaseNodes.push({
      id: `db-${databaseName}`,
      labels: [{ text: databaseName }],
      layoutOptions: innerLayoutOptions,
      children: childTableNodes,
      edges: internalEdges,
    });
  });

  // Configure and run ELK layout with compound node support
  const elkGraph: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': direction,
      'elk.spacing.nodeNode': String(nodeSpacing * 2),
      'elk.layered.spacing.nodeNodeBetweenLayers': String(layerSpacing * 1.5),
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
      'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
      'elk.portConstraints': 'FIXED_ORDER',
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
      'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
    },
    children: elkDatabaseNodes,
    edges: [], // No external edges in this path
  };

  onProgress?.(55); // Graph built, starting ELK layout
  const layoutedGraph = await elk.layout(elkGraph);

  // Record ELK completion time
  if (collectMetrics) {
    elkEndTime = performance.now();
  }

  onProgress?.(70); // Layout complete, entering render

  // Transform to React Flow nodes - extract table positions from within database compound nodes
  const layoutedNodes: Node[] = [];

  (layoutedGraph.children || []).forEach((elkDbNode) => {
    // Get database position offset
    const dbX = elkDbNode.x || 0;
    const dbY = elkDbNode.y || 0;

    // Extract table nodes from within the database compound node
    (elkDbNode.children || []).forEach((elkTableNode) => {
      const tableNode = tableNodeData.find((n) => n.id === elkTableNode.id);
      if (tableNode) {
        layoutedNodes.push({
          id: elkTableNode.id,
          type: 'tableNode',
          // Position is relative to database container, so add the database offset
          position: {
            x: dbX + (elkTableNode.x || 0),
            y: dbY + (elkTableNode.y || 0)
          },
          data: tableNode,
        });
      }
    });
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

  // Calculate and return metrics
  const endTime = collectMetrics ? performance.now() : 0;
  const metrics: LayoutMetrics | undefined = collectMetrics
    ? {
        prepTime: prepEndTime - startTime,
        elkTime: elkEndTime - prepEndTime,
        transformTime: endTime - elkEndTime,
        totalTime: endTime - startTime,
      }
    : undefined;

  return { nodes: layoutedNodes, edges: layoutedEdges, metrics };
}

/**
 * Fallback layout for non-column nodes (databases, tables without columns)
 */
async function layoutSimpleNodes(
  nodes: LineageNode[],
  edges: LineageEdge[],
  options: LayoutOptions,
  startTime?: number
): Promise<LayoutResult> {
  const {
    direction = 'RIGHT',
    nodeSpacing = 40,
    layerSpacing = 100,
    onProgress,
  } = options;

  const collectMetrics = startTime !== undefined;
  let prepEndTime = 0;
  let elkEndTime = 0;

  const elkNodes: ElkNode[] = nodes.map((node) => ({
    id: node.id,
    width: getNodeWidth(node),
    height: getNodeHeight(node),
    labels: [{ text: getNodeLabel(node) }],
  }));

  if (collectMetrics) {
    prepEndTime = performance.now();
  }

  onProgress?.(45); // ELK nodes built

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

  onProgress?.(55); // Graph built, starting ELK layout
  const layoutedGraph = await elk.layout(elkGraph);

  if (collectMetrics) {
    elkEndTime = performance.now();
  }

  onProgress?.(70); // Layout complete, entering render

  const layoutedNodes: Node[] = (layoutedGraph.children || []).map((elkNode) => {
    const originalNode = nodes.find((n) => n.id === elkNode.id)!;

    // For table nodes, create proper TableNodeData structure
    if (originalNode.type === 'table') {
      const assetType = mapTableKindToAssetType(originalNode.metadata?.sourceType as string);
      return {
        id: elkNode.id,
        type: 'tableNode',
        position: { x: elkNode.x || 0, y: elkNode.y || 0 },
        data: {
          id: originalNode.id,
          databaseName: originalNode.databaseName,
          tableName: originalNode.tableName,
          columns: [], // No columns for database-level view
          isExpanded: false,
          assetType: assetType,
        } as TableNodeData,
      };
    }

    // For other node types (column, database)
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

  // Calculate and return metrics
  const endTime = collectMetrics ? performance.now() : 0;
  const metrics: LayoutMetrics | undefined = collectMetrics && startTime !== undefined
    ? {
        prepTime: prepEndTime - startTime,
        elkTime: elkEndTime - prepEndTime,
        transformTime: endTime - elkEndTime,
        totalTime: endTime - startTime,
      }
    : undefined;

  return { nodes: layoutedNodes, edges: layoutedEdges, metrics };
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
