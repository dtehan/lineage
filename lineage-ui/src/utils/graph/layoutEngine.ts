import ELK, { ElkNode, ElkExtendedEdge } from 'elkjs/lib/elk.bundled.js';
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

// Must match the `padding` default in ClusterBackground so post-layout separation
// leaves exactly enough room for the bounding box borders not to touch.
const CLUSTER_BOX_PADDING = 60;

/**
 * Topologically sorts databases by lineage-flow direction.
 * Databases with no upstream (pure sources) come first (index 0) and will be
 * placed LEFT in a right-directed layout; downstream databases come later.
 * Ties are broken alphabetically for determinism.
 */
export function topoSortDatabases(
  allDatabases: Set<string>,
  edges: LineageEdge[],
  columnToTableMap: Map<string, string>,
  tableToDatabase: Map<string, string>
): string[] {
  // Build database-level directed graph from column-level edges
  const adj = new Map<string, Set<string>>();
  allDatabases.forEach((db) => adj.set(db, new Set()));

  edges.forEach((edge) => {
    const srcKey = columnToTableMap.get(edge.source);
    const tgtKey = columnToTableMap.get(edge.target);
    if (!srcKey || !tgtKey) return;
    const srcDb = tableToDatabase.get(srcKey);
    const tgtDb = tableToDatabase.get(tgtKey);
    if (!srcDb || !tgtDb || srcDb === tgtDb) return;
    adj.get(srcDb)!.add(tgtDb);
  });

  // Kahn's algorithm for topological sort
  const inDegree = new Map<string, number>();
  allDatabases.forEach((db) => inDegree.set(db, 0));
  adj.forEach((targets) =>
    targets.forEach((t) => inDegree.set(t, (inDegree.get(t) || 0) + 1))
  );

  const queue = Array.from(allDatabases)
    .filter((db) => inDegree.get(db) === 0)
    .sort(); // alphabetical tie-break — sort ONCE

  const result: string[] = [];
  while (queue.length > 0) {
    // queue is already sorted — no re-sort needed
    const db = queue.shift()!;
    result.push(db);
    adj.get(db)?.forEach((target) => {
      const d = (inDegree.get(target) || 0) - 1;
      inDegree.set(target, d);
      if (d === 0) {
        // Binary search insertion to maintain sorted order
        let lo = 0, hi = queue.length;
        while (lo < hi) {
          const mid = (lo + hi) >>> 1;
          if (queue[mid] < target) lo = mid + 1;
          else hi = mid;
        }
        queue.splice(lo, 0, target);
      }
    });
  }

  // Append cyclic or isolated databases
  allDatabases.forEach((db) => {
    if (!result.includes(db)) result.push(db);
  });

  return result;
}

/**
 * Post-layout step that shifts each database's node group along the primary
 * axis so that the padded cluster bounding boxes (drawn by ClusterBackground)
 * are strictly non-overlapping and appear in lineage-flow order (upstream LEFT).
 *
 * This is needed because ELK's layered algorithm assigns layers by lineage depth,
 * not by database — so nodes from different databases can land at the same x-range,
 * causing their bounding boxes to overlap even when edges flow left-to-right.
 */
export function separateDatabaseClusters(
  nodes: Node[],
  tableNodeData: TableNodeData[],
  direction: 'RIGHT' | 'LEFT' | 'UP' | 'DOWN',
  clusterPadding: number,
  dbOrder: string[]
): Node[] {
  if (nodes.length === 0) return nodes;

  // Group nodes by database
  const dbNodeMap = new Map<string, Node[]>();
  nodes.forEach((node) => {
    const td = tableNodeData.find((t) => t.id === node.id);
    if (!td) return;
    if (!dbNodeMap.has(td.databaseName)) dbNodeMap.set(td.databaseName, []);
    dbNodeMap.get(td.databaseName)!.push(node);
  });

  if (dbNodeMap.size <= 1) return nodes;

  const isHorizontal = direction === 'RIGHT' || direction === 'LEFT';

  // Bounding extent along both axes (primary axis used for separation, secondary for completeness).
  // Tracking both enables future callers (Phase 20 grid placement) to use full bounding boxes.
  const dbExtent = new Map<string, { lo: number; hi: number; secLo: number; secHi: number }>();
  dbNodeMap.forEach((dbNodes, db) => {
    let lo = Infinity;
    let hi = -Infinity;
    let secLo = Infinity;
    let secHi = -Infinity;
    dbNodes.forEach((node) => {
      const td = tableNodeData.find((t) => t.id === node.id)!;
      const priSize = isHorizontal
        ? calculateTableNodeWidth(td.tableName, td.columns)
        : calculateTableNodeHeight(td.columns.length, td.isExpanded);
      const secSize = isHorizontal
        ? calculateTableNodeHeight(td.columns.length, td.isExpanded)
        : calculateTableNodeWidth(td.tableName, td.columns);
      const priPos = isHorizontal ? node.position.x : node.position.y;
      const secPos = isHorizontal ? node.position.y : node.position.x;
      lo = Math.min(lo, priPos);
      hi = Math.max(hi, priPos + priSize);
      secLo = Math.min(secLo, secPos);
      secHi = Math.max(secHi, secPos + secSize);
    });
    dbExtent.set(db, { lo, hi, secLo, secHi });
  });

  // Order databases by dbOrder (lineage flow); unknowns fall back to current position
  const sortedDbs = Array.from(dbNodeMap.keys()).sort((a, b) => {
    const ai = dbOrder.indexOf(a);
    const bi = dbOrder.indexOf(b);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return dbExtent.get(a)!.lo - dbExtent.get(b)!.lo;
  });

  // Place first database at its current position; stack each subsequent one
  // so its padded box begins exactly where the previous padded box ends.
  const offsets = new Map<string, number>();
  offsets.set(sortedDbs[0], 0);
  let cursor = dbExtent.get(sortedDbs[0])!.hi + clusterPadding;

  for (let i = 1; i < sortedDbs.length; i++) {
    const db = sortedDbs[i];
    const { lo, hi } = dbExtent.get(db)!;
    const nearEdge = lo - clusterPadding;
    const shift = nearEdge < cursor ? cursor - nearEdge : 0;
    offsets.set(db, shift);
    cursor = hi + shift + clusterPadding;
  }

  // Apply offsets along the primary axis only
  return nodes.map((node) => {
    const td = tableNodeData.find((t) => t.id === node.id);
    if (!td) return node;
    const offset = offsets.get(td.databaseName) || 0;
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

  // ── Custom topological layout ────────────────────────────────────
  // Replaces ELK which hangs indefinitely on dense column-level
  // graphs. This completes in O(V+E) time.

  // Build table→database map for cluster separation
  const tableToDatabase = new Map<string, string>();
  tableNodeData.forEach((t) => tableToDatabase.set(t.id, t.databaseName));

  // Build table-level directed adjacency (deduplicated)
  const tableAdj = new Map<string, Set<string>>();
  const tableInDeg = new Map<string, number>();
  for (const t of tableNodeData) {
    tableAdj.set(t.id, new Set());
    tableInDeg.set(t.id, 0);
  }

  for (const edge of rawEdges) {
    const src = columnToTableMap.get(edge.source);
    const tgt = columnToTableMap.get(edge.target);
    if (!src || !tgt || src === tgt) continue;
    if (!tableAdj.get(src)!.has(tgt)) {
      tableAdj.get(src)!.add(tgt);
      tableInDeg.set(tgt, (tableInDeg.get(tgt) || 0) + 1);
    }
  }

  // Topological sort via Kahn's algorithm (deterministic tie-breaking)
  const topoOrder: string[] = [];
  const inDegCopy = new Map(tableInDeg);
  const topoQueue: string[] = [];
  for (const [id, deg] of inDegCopy) {
    if (deg === 0) topoQueue.push(id);
  }
  topoQueue.sort(); // Initial sort — once only
  while (topoQueue.length > 0) {
    // topoQueue is already sorted — no re-sort needed
    const current = topoQueue.shift()!;
    topoOrder.push(current);
    for (const target of tableAdj.get(current) || new Set<string>()) {
      const nd = inDegCopy.get(target)! - 1;
      inDegCopy.set(target, nd);
      if (nd === 0) {
        // Binary search insertion to maintain sorted order
        let lo = 0, hi = topoQueue.length;
        while (lo < hi) {
          const mid = (lo + hi) >>> 1;
          if (topoQueue[mid] < target) lo = mid + 1;
          else hi = mid;
        }
        topoQueue.splice(lo, 0, target);
      }
    }
  }
  // Append any cycle-trapped nodes
  const topoSet = new Set(topoOrder);
  for (const t of tableNodeData) {
    if (!topoSet.has(t.id)) topoOrder.push(t.id);
  }

  // Longest-path layering: layer[v] = max(layer[u] + 1) for all edges u→v
  const layerMap = new Map<string, number>();
  for (const id of topoOrder) layerMap.set(id, 0);
  let maxLayer = 0;
  for (const id of topoOrder) {
    const curLayer = layerMap.get(id)!;
    for (const tgt of tableAdj.get(id) || new Set<string>()) {
      const proposed = curLayer + 1;
      if (proposed > (layerMap.get(tgt) ?? 0)) {
        layerMap.set(tgt, proposed);
        if (proposed > maxLayer) maxLayer = proposed;
      }
    }
  }

  onProgress?.(55); // Layering complete

  // Group tables by layer
  const layerBuckets = new Map<number, TableNodeData[]>();
  for (const t of tableNodeData) {
    const layer = layerMap.get(t.id) ?? 0;
    if (!layerBuckets.has(layer)) layerBuckets.set(layer, []);
    layerBuckets.get(layer)!.push(t);
  }

  // Position tables: primary axis = layer, secondary axis = stacked within layer
  const isHorizontal = direction === 'RIGHT' || direction === 'LEFT';
  const isReversed = direction === 'LEFT' || direction === 'UP';

  let primaryCursor = 0;
  const layoutedNodes: Node[] = [];

  for (let layer = 0; layer <= maxLayer; layer++) {
    const tables = layerBuckets.get(layer);
    if (!tables) continue;
    tables.sort((a, b) => a.id.localeCompare(b.id)); // deterministic order

    let secondaryCursor = 0;
    let maxPrimarySize = 0;

    for (const table of tables) {
      const width = calculateTableNodeWidth(table.tableName, table.columns);
      const height = calculateTableNodeHeight(table.columns.length, table.isExpanded);
      const primarySize = isHorizontal ? width : height;
      const secondarySize = isHorizontal ? height : width;
      maxPrimarySize = Math.max(maxPrimarySize, primarySize);

      layoutedNodes.push({
        id: table.id,
        type: 'tableNode',
        position: {
          x: isHorizontal ? primaryCursor : secondaryCursor,
          y: isHorizontal ? secondaryCursor : primaryCursor,
        },
        data: table,
      } as Node);

      secondaryCursor += secondarySize + nodeSpacing;
    }

    primaryCursor += maxPrimarySize + layerSpacing;
  }

  // Flip positions for LEFT/UP directions
  if (isReversed && layoutedNodes.length > 0) {
    const maxPos = Math.max(
      ...layoutedNodes.map((n) => (isHorizontal ? n.position.x : n.position.y))
    );
    for (const node of layoutedNodes) {
      if (isHorizontal) {
        node.position.x = maxPos - node.position.x;
      } else {
        node.position.y = maxPos - node.position.y;
      }
    }
  }

  if (collectMetrics) {
    elkEndTime = performance.now();
  }

  onProgress?.(70); // Layout complete, building edges

  // Transform raw edges to React Flow edges with column-level handles
  const layoutedEdges: Edge[] = rawEdges
    .map((edge) => {
      const sourceTableKey = getTableKeyFromColumnId(edge.source, columnToTableMap);
      const targetTableKey = getTableKeyFromColumnId(edge.target, columnToTableMap);
      if (!sourceTableKey || !targetTableKey) return null;

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
    .filter((e): e is Edge => e !== null);

  // Post-layout: separate database clusters for multi-database graphs
  const allDbs = new Set(tableNodeData.map((t) => t.databaseName));
  let finalNodes = layoutedNodes;
  if (allDbs.size > 1) {
    const dbOrder = topoSortDatabases(allDbs, rawEdges, columnToTableMap, tableToDatabase);
    finalNodes = separateDatabaseClusters(
      layoutedNodes,
      tableNodeData,
      direction,
      CLUSTER_BOX_PADDING,
      dbOrder
    );
  }

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

  return { nodes: finalNodes, edges: layoutedEdges, metrics };
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
