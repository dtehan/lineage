import { memo, useMemo } from 'react';
import { useStore, useViewport, ReactFlowState } from '@xyflow/react';
import { Folder } from 'lucide-react';

export interface DatabaseCluster {
  id: string;
  databaseName: string;
  backgroundColor: string;
  tableNodeIds: string[];
}

export interface ClusterBackgroundProps {
  clusters: DatabaseCluster[];
  padding?: number;
  headerHeight?: number;
  visible?: boolean;
}

// Predefined colors for databases
const DATABASE_COLORS: Record<string, string> = {
  sales_db: 'rgba(59, 130, 246, 0.08)',
  analytics_db: 'rgba(34, 197, 94, 0.08)',
  staging_db: 'rgba(168, 85, 247, 0.08)',
  raw_db: 'rgba(249, 115, 22, 0.08)',
  demo_user: 'rgba(59, 130, 246, 0.08)',
};

// Fallback colors for unknown databases
const FALLBACK_COLORS = [
  'rgba(59, 130, 246, 0.08)', // blue
  'rgba(34, 197, 94, 0.08)', // green
  'rgba(168, 85, 247, 0.08)', // purple
  'rgba(249, 115, 22, 0.08)', // orange
  'rgba(236, 72, 153, 0.08)', // pink
  'rgba(6, 182, 212, 0.08)', // cyan
  'rgba(245, 158, 11, 0.08)', // amber
];

/**
 * Gets color for a database
 */
export function getDatabaseColor(databaseName: string, index: number): string {
  if (DATABASE_COLORS[databaseName]) {
    return DATABASE_COLORS[databaseName];
  }
  return FALLBACK_COLORS[index % FALLBACK_COLORS.length];
}

/**
 * Gets border color (slightly more opaque) for a database
 */
function getDatabaseBorderColor(databaseName: string, index: number): string {
  const bgColor = getDatabaseColor(databaseName, index);
  // Make border more visible
  return bgColor.replace('0.08)', '0.2)');
}

/**
 * Calculates bounding box for cluster nodes
 */
function calculateClusterBounds(
  nodeIds: string[],
  nodeInternals: ReactFlowState['nodeLookup']
): { x: number; y: number; width: number; height: number } | null {
  if (nodeIds.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  nodeIds.forEach((nodeId) => {
    const node = nodeInternals.get(nodeId);
    if (node && node.position) {
      const x = node.position.x;
      const y = node.position.y;
      const width = (node.measured?.width ?? node.width ?? 280) as number;
      const height = (node.measured?.height ?? node.height ?? 100) as number;

      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + width);
      maxY = Math.max(maxY, y + height);
    }
  });

  if (minX === Infinity) return null;

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

export const ClusterBackground = memo(function ClusterBackground({
  clusters,
  padding = 20,
  headerHeight = 40,
  visible = true,
}: ClusterBackgroundProps) {
  // Get node positions from React Flow store
  const nodeInternals = useStore((state: ReactFlowState) => state.nodeLookup);

  // Get viewport transform to position clusters correctly
  const { x: viewportX, y: viewportY, zoom } = useViewport();

  // Calculate cluster bounds
  const clusterBounds = useMemo(() => {
    return clusters.map((cluster, index) => ({
      cluster,
      bounds: calculateClusterBounds(cluster.tableNodeIds, nodeInternals),
      color: getDatabaseColor(cluster.databaseName, index),
      borderColor: getDatabaseBorderColor(cluster.databaseName, index),
    }));
  }, [clusters, nodeInternals]);

  if (!visible) return null;

  return (
    <>
      {clusterBounds.map(({ cluster, bounds, color, borderColor }) => {
        if (!bounds) return null;

        // Transform flow coordinates to screen coordinates
        const screenX = (bounds.x - padding) * zoom + viewportX;
        const screenY = (bounds.y - headerHeight) * zoom + viewportY;
        const screenWidth = (bounds.width + padding * 2) * zoom;
        const screenHeight = (bounds.height + headerHeight + padding) * zoom;

        return (
          <div
            key={cluster.id}
            className="absolute pointer-events-none select-none"
            style={{
              left: screenX,
              top: screenY,
              width: screenWidth,
              height: screenHeight,
              backgroundColor: color,
              borderRadius: 12 * zoom,
              border: `${Math.max(1, zoom)}px dashed ${borderColor}`,
              zIndex: -1,
            }}
            data-testid={`cluster-${cluster.id}`}
          >
            {/* Cluster header */}
            <div
              className="flex items-center gap-2"
              style={{
                height: headerHeight * zoom,
                padding: `${8 * zoom}px ${12 * zoom}px`,
              }}
            >
              <Folder
                className="text-slate-400"
                style={{ width: 16 * zoom, height: 16 * zoom }}
              />
              <span
                className="font-medium text-slate-500"
                style={{ fontSize: 14 * zoom }}
              >
                {cluster.databaseName}
              </span>
              <span
                className="text-slate-400"
                style={{ fontSize: 12 * zoom }}
              >
                ({cluster.tableNodeIds.length} table
                {cluster.tableNodeIds.length !== 1 ? 's' : ''})
              </span>
            </div>
          </div>
        );
      })}
    </>
  );
});

/**
 * Hook to create database clusters from table nodes
 */
export function useDatabaseClustersFromNodes(
  nodes: Array<{ id: string; data?: { databaseName?: string } }>
): DatabaseCluster[] {
  return useMemo(() => {
    const databaseGroups = new Map<string, string[]>();

    nodes.forEach((node) => {
      const databaseName = node.data?.databaseName;
      if (databaseName) {
        if (!databaseGroups.has(databaseName)) {
          databaseGroups.set(databaseName, []);
        }
        databaseGroups.get(databaseName)!.push(node.id);
      }
    });

    const clusters: DatabaseCluster[] = [];
    let index = 0;

    databaseGroups.forEach((tableNodeIds, databaseName) => {
      clusters.push({
        id: `cluster-${databaseName}`,
        databaseName,
        backgroundColor: getDatabaseColor(databaseName, index),
        tableNodeIds,
      });
      index++;
    });

    return clusters;
  }, [nodes]);
}
