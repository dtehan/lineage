import { useMemo } from 'react';
import { Node } from '@xyflow/react';

export interface DatabaseCluster {
  id: string;
  databaseName: string;
  backgroundColor: string;
  tables: string[];
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
}

export interface UseDatabaseClustersOptions {
  nodes: Node[];
}

export interface UseDatabaseClustersReturn {
  clusters: DatabaseCluster[];
  getDatabaseColor: (databaseName: string) => string;
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
  'rgba(59, 130, 246, 0.08)',   // blue
  'rgba(34, 197, 94, 0.08)',    // green
  'rgba(168, 85, 247, 0.08)',   // purple
  'rgba(249, 115, 22, 0.08)',   // orange
  'rgba(236, 72, 153, 0.08)',   // pink
  'rgba(6, 182, 212, 0.08)',    // cyan
  'rgba(245, 158, 11, 0.08)',   // amber
];

function getColorForDatabase(databaseName: string, index: number): string {
  if (DATABASE_COLORS[databaseName]) {
    return DATABASE_COLORS[databaseName];
  }
  return FALLBACK_COLORS[index % FALLBACK_COLORS.length];
}

function calculateClusterBounds(
  tableIds: string[],
  nodes: Node[]
): DatabaseCluster['bounds'] {
  const tableNodes = nodes.filter(
    (node) => tableIds.includes(node.id) && node.position
  );

  if (tableNodes.length === 0) {
    return null;
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  tableNodes.forEach((node) => {
    const x = node.position?.x ?? 0;
    const y = node.position?.y ?? 0;
    const width = (node.measured?.width ?? node.width ?? 280) as number;
    const height = (node.measured?.height ?? node.height ?? 100) as number;

    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + width);
    maxY = Math.max(maxY, y + height);
  });

  if (minX === Infinity) {
    return null;
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

export function useDatabaseClusters({
  nodes,
}: UseDatabaseClustersOptions): UseDatabaseClustersReturn {
  const clusters = useMemo(() => {
    // Group nodes by database
    const databaseGroups = new Map<string, string[]>();

    nodes.forEach((node) => {
      if (node.type === 'tableNode' && node.data) {
        const databaseName = (node.data as { databaseName?: string }).databaseName;
        if (databaseName) {
          if (!databaseGroups.has(databaseName)) {
            databaseGroups.set(databaseName, []);
          }
          databaseGroups.get(databaseName)!.push(node.id);
        }
      }
    });

    // Build cluster objects
    const clusterList: DatabaseCluster[] = [];
    let index = 0;

    databaseGroups.forEach((tableIds, databaseName) => {
      clusterList.push({
        id: `cluster-${databaseName}`,
        databaseName,
        backgroundColor: getColorForDatabase(databaseName, index),
        tables: tableIds,
        bounds: calculateClusterBounds(tableIds, nodes),
      });
      index++;
    });

    return clusterList;
  }, [nodes]);

  const getDatabaseColor = useMemo(() => {
    const colorMap = new Map<string, string>();
    clusters.forEach((cluster) => {
      colorMap.set(cluster.databaseName, cluster.backgroundColor);
    });

    return (databaseName: string): string => {
      return colorMap.get(databaseName) || FALLBACK_COLORS[0];
    };
  }, [clusters]);

  return {
    clusters,
    getDatabaseColor,
  };
}
