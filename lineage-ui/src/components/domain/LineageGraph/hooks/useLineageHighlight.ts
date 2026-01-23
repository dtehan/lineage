import { useCallback, useMemo } from 'react';
import { Edge, Node } from '@xyflow/react';

export interface UseLineageHighlightOptions {
  nodes: Node[];
  edges: Edge[];
}

export interface UseLineageHighlightReturn {
  getUpstreamNodes: (nodeId: string) => Set<string>;
  getDownstreamNodes: (nodeId: string) => Set<string>;
  getConnectedNodes: (nodeId: string) => Set<string>;
  getConnectedEdges: (nodeId: string) => Set<string>;
  highlightPath: (selectedNodeId: string) => {
    highlightedNodes: Set<string>;
    highlightedEdges: Set<string>;
  };
}

// Helper to extract column IDs from edge data
interface EdgeData {
  sourceColumnId?: string;
  targetColumnId?: string;
}

export function useLineageHighlight({
  edges,
}: UseLineageHighlightOptions): UseLineageHighlightReturn {
  // Build adjacency maps for efficient traversal using column IDs
  const { upstreamMap, downstreamMap } = useMemo(() => {
    const upstream = new Map<string, Set<string>>();
    const downstream = new Map<string, Set<string>>();

    edges.forEach((edge) => {
      // Use column IDs from edge data if available, otherwise fall back to source/target
      const edgeData = edge.data as EdgeData | undefined;
      const sourceColumnId = edgeData?.sourceColumnId || edge.source;
      const targetColumnId = edgeData?.targetColumnId || edge.target;

      // For upstream: target column -> source columns
      if (!upstream.has(targetColumnId)) {
        upstream.set(targetColumnId, new Set());
      }
      upstream.get(targetColumnId)!.add(sourceColumnId);

      // For downstream: source column -> target columns
      if (!downstream.has(sourceColumnId)) {
        downstream.set(sourceColumnId, new Set());
      }
      downstream.get(sourceColumnId)!.add(targetColumnId);
    });

    return { upstreamMap: upstream, downstreamMap: downstream };
  }, [edges]);

  // Get all upstream nodes recursively
  const getUpstreamNodes = useCallback(
    (nodeId: string): Set<string> => {
      const visited = new Set<string>();
      const stack = [nodeId];

      while (stack.length > 0) {
        const current = stack.pop()!;
        if (visited.has(current)) continue;
        visited.add(current);

        const sources = upstreamMap.get(current);
        if (sources) {
          sources.forEach((source) => {
            if (!visited.has(source)) {
              stack.push(source);
            }
          });
        }
      }

      visited.delete(nodeId); // Don't include the starting node
      return visited;
    },
    [upstreamMap]
  );

  // Get all downstream nodes recursively
  const getDownstreamNodes = useCallback(
    (nodeId: string): Set<string> => {
      const visited = new Set<string>();
      const stack = [nodeId];

      while (stack.length > 0) {
        const current = stack.pop()!;
        if (visited.has(current)) continue;
        visited.add(current);

        const targets = downstreamMap.get(current);
        if (targets) {
          targets.forEach((target) => {
            if (!visited.has(target)) {
              stack.push(target);
            }
          });
        }
      }

      visited.delete(nodeId); // Don't include the starting node
      return visited;
    },
    [downstreamMap]
  );

  // Get all connected nodes (both upstream and downstream)
  const getConnectedNodes = useCallback(
    (nodeId: string): Set<string> => {
      const upstream = getUpstreamNodes(nodeId);
      const downstream = getDownstreamNodes(nodeId);
      return new Set([nodeId, ...upstream, ...downstream]);
    },
    [getUpstreamNodes, getDownstreamNodes]
  );

  // Get all edges that connect the highlighted column nodes
  const getConnectedEdges = useCallback(
    (nodeId: string): Set<string> => {
      const connectedNodes = getConnectedNodes(nodeId);
      const connectedEdges = new Set<string>();

      edges.forEach((edge) => {
        // Use column IDs from edge data if available
        const edgeData = edge.data as EdgeData | undefined;
        const sourceColumnId = edgeData?.sourceColumnId || edge.source;
        const targetColumnId = edgeData?.targetColumnId || edge.target;

        // Check if both the source and target columns are in the connected set
        if (connectedNodes.has(sourceColumnId) && connectedNodes.has(targetColumnId)) {
          connectedEdges.add(edge.id);
        }
      });

      return connectedEdges;
    },
    [edges, getConnectedNodes]
  );

  // Highlight path and return highlighted sets
  const highlightPath = useCallback(
    (selectedNodeId: string) => {
      const highlightedNodes = getConnectedNodes(selectedNodeId);
      const highlightedEdges = getConnectedEdges(selectedNodeId);
      return { highlightedNodes, highlightedEdges };
    },
    [getConnectedNodes, getConnectedEdges]
  );

  return {
    getUpstreamNodes,
    getDownstreamNodes,
    getConnectedNodes,
    getConnectedEdges,
    highlightPath,
  };
}
