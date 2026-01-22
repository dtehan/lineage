import { useCallback, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  ConnectionMode,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useLineage } from '../../../api/hooks/useLineage';
import { useLineageStore } from '../../../stores/useLineageStore';
import { layoutGraph } from '../../../utils/graph/layoutEngine';
import { ColumnNode } from './ColumnNode';
import { TableNode } from './TableNode';
import { LoadingSpinner } from '../../common/LoadingSpinner';

const nodeTypes = {
  columnNode: ColumnNode,
  tableNode: TableNode,
};

interface LineageGraphProps {
  assetId: string;
}

export function LineageGraph({ assetId }: LineageGraphProps) {
  const { direction, maxDepth, setGraph, setHighlightedNodeIds } = useLineageStore();

  const { data, isLoading, error } = useLineage(assetId, { direction, maxDepth });

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  useEffect(() => {
    if (data?.graph) {
      layoutGraph(data.graph.nodes, data.graph.edges).then(({ nodes: layoutedNodes, edges: layoutedEdges }) => {
        setNodes(layoutedNodes);
        setEdges(layoutedEdges);
        setGraph(data.graph.nodes, data.graph.edges);
      });
    }
  }, [data, setNodes, setEdges, setGraph]);

  const onNodeMouseEnter = useCallback(
    (_: React.MouseEvent, node: Node) => {
      // Highlight connected nodes
      const connectedIds = new Set<string>([node.id]);
      edges.forEach((edge) => {
        if (edge.source === node.id) connectedIds.add(edge.target);
        if (edge.target === node.id) connectedIds.add(edge.source);
      });
      setHighlightedNodeIds(connectedIds);
    },
    [edges, setHighlightedNodeIds]
  );

  const onNodeMouseLeave = useCallback(() => {
    setHighlightedNodeIds(new Set());
  }, [setHighlightedNodeIds]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-red-500" role="alert">
        Failed to load lineage: {error.message}
      </div>
    );
  }

  return (
    <div className="w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeMouseEnter={onNodeMouseEnter}
        onNodeMouseLeave={onNodeMouseLeave}
        nodeTypes={nodeTypes}
        connectionMode={ConnectionMode.Loose}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
        maxZoom={2}
      >
        <Background color="#e2e8f0" gap={16} />
        <Controls />
        <MiniMap
          nodeColor={(node) => {
            if (node.id === assetId) return '#3b82f6';
            return '#94a3b8';
          }}
          maskColor="rgba(0, 0, 0, 0.1)"
        />
      </ReactFlow>
    </div>
  );
}
