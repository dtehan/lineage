import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  ConnectionMode,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useOpenLineageTableLineage } from '../../../api/hooks/useOpenLineage';
import { useLineageStore } from '../../../stores/useLineageStore';
import { layoutGraph, type TableNodeData } from '../../../utils/graph/layoutEngine';
import { convertOpenLineageGraph } from '../../../utils/graph/openLineageAdapter';
import { TableNode } from './TableNode/';
import { LineageEdge } from './LineageEdge';
import { Toolbar } from './Toolbar';
import { DetailPanel, ColumnDetail, EdgeDetail } from './DetailPanel';
import { Legend } from './Legend';
import { LoadingProgress } from '../../common/LoadingProgress';
import { useLoadingProgress } from '../../../hooks/useLoadingProgress';
import { Map, ChevronUp, ChevronDown } from 'lucide-react';
import { ClusterBackground, useDatabaseClustersFromNodes } from './ClusterBackground';
import { LineageTableView } from './LineageTableView';
import {
  useLineageHighlight,
  useKeyboardShortcuts,
  useLineageExport,
  useSmartViewport,
} from './hooks';

const nodeTypes = {
  tableNode: TableNode,
};

const edgeTypes = {
  lineageEdge: LineageEdge,
};

interface LineageGraphInnerProps {
  datasetId: string;
  fieldName: string; // Used to highlight/focus a specific field
}

function LineageGraphInner({ datasetId, fieldName }: LineageGraphInnerProps) {
  const reactFlowInstance = useReactFlow();
  const navigate = useNavigate();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [showMinimap, setShowMinimap] = useState(false);

  const {
    direction,
    maxDepth,
    viewMode,
    setViewMode,
    setDirection,
    setMaxDepth,
    setGraph,
    selectedAssetId,
    setSelectedAssetId,
    selectedEdgeId,
    setSelectedEdge,
    setHighlightedPath,
    clearHighlight,
    isPanelOpen,
    panelContent,
    openPanel,
    closePanel,
    searchQuery,
    setSearchQuery,
    isFullscreen,
    toggleFullscreen,
    showDatabaseClusters,
    nodes: storeNodes,
    edges: storeEdges,
    assetTypeFilter,
    setAssetTypeFilter,
  } = useLineageStore();

  // Always use table lineage to show all columns
  const { data, isLoading, error } = useOpenLineageTableLineage(datasetId, direction, maxDepth);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // Use the lineage highlight hook
  const { highlightPath } = useLineageHighlight({ nodes, edges });

  // Use keyboard shortcuts hook
  useKeyboardShortcuts({
    reactFlowInstance,
    enabled: viewMode === 'graph',
  });

  // Use export hook
  const { exportJson } = useLineageExport({
    wrapperRef,
  });

  // Use loading progress hook
  const { stage, progress, message, setStage, setProgress, reset } = useLoadingProgress();

  // Use smart viewport hook for size-aware positioning
  const { applySmartViewport } = useSmartViewport();

  // Filter nodes and edges based on asset type filter
  const filteredNodesAndEdges = useMemo(() => {
    // Get the set of node IDs that match the asset type filter
    const filteredNodeIds = new Set(
      nodes
        .filter((node) => {
          if (node.type !== 'tableNode') return true; // Keep non-table nodes
          const nodeData = node.data as TableNodeData;
          return assetTypeFilter.includes(nodeData.assetType);
        })
        .map((node) => node.id)
    );

    // Filter nodes
    const filteredNodes = nodes.filter((node) => filteredNodeIds.has(node.id));

    // Filter edges - only keep edges where both source and target are in filtered nodes
    const filteredEdges = edges.filter(
      (edge) => filteredNodeIds.has(edge.source) && filteredNodeIds.has(edge.target)
    );

    return { filteredNodes, filteredEdges };
  }, [nodes, edges, assetTypeFilter]);

  // Create database clusters from filtered nodes
  const clusters = useDatabaseClustersFromNodes(filteredNodesAndEdges.filteredNodes);

  // Reset loading state when datasetId changes
  useEffect(() => {
    reset();
  }, [datasetId, reset]);

  // Sync data fetch stage with TanStack Query loading state
  useEffect(() => {
    if (isLoading) {
      setStage('fetching');
    }
  }, [isLoading, setStage]);

  // Update nodes/edges when data changes
  useEffect(() => {
    if (data?.graph) {
      setStage('layout');

      // Convert OpenLineage graph to legacy format for layout engine
      const { nodes: legacyNodes, edges: legacyEdges } = convertOpenLineageGraph(
        data.graph.nodes,
        data.graph.edges
      );

      layoutGraph(legacyNodes, legacyEdges, {
        onProgress: (layoutProgress) => setProgress(layoutProgress),
      })
        .then(({ nodes: layoutedNodes, edges: layoutedEdges }) => {
          setStage('rendering');
          setNodes(layoutedNodes);
          setEdges(layoutedEdges);
          // Store the legacy format in the store for compatibility
          setGraph(legacyNodes, legacyEdges);
          // Use requestAnimationFrame to detect render complete
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              setStage('complete');
            });
          });
        })
        .catch((error) => {
          console.error('Layout error:', error);
          // Fallback: set nodes without layout
          setGraph(legacyNodes, legacyEdges);
          setStage('complete');
        });
    }
  }, [data, setNodes, setEdges, setGraph, setStage, setProgress]);

  // Apply smart viewport after layout completes
  useEffect(() => {
    if (nodes.length > 0 && stage === 'complete') {
      // Delay to ensure React Flow has measured node dimensions (longer for large graphs)
      const timeoutId = setTimeout(() => {
        applySmartViewport(nodes);
      }, 150);
      return () => clearTimeout(timeoutId);
    }
  }, [nodes, stage, applySmartViewport]);

  // Auto-highlight the specified field when component mounts (if not '_all')
  useEffect(() => {
    if (fieldName !== '_all' && nodes.length > 0 && storeNodes.length > 0) {
      // Find the column in the legacy node format (stored in storeNodes)
      // by matching the column name with the fieldName parameter
      const matchingColumn = storeNodes.find((node) => {
        if (node.type === 'column') {
          return node.columnName === fieldName;
        }
        return false;
      });

      if (matchingColumn) {
        setSelectedAssetId(matchingColumn.id);
      }
    }
  }, [fieldName, nodes, storeNodes, setSelectedAssetId]);

  // Handle column selection from TableNode/ColumnRow
  // This is called when a column row is clicked inside a table node
  useEffect(() => {
    if (selectedAssetId) {
      const { highlightedNodes, highlightedEdges } = highlightPath(selectedAssetId);
      setHighlightedPath(highlightedNodes, highlightedEdges);
      openPanel('node');
    }
  }, [selectedAssetId, highlightPath, setHighlightedPath, openPanel]);

  // Handle node click for selection and path highlighting
  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      // For table nodes, column selection is handled by ColumnRow
      // This handler is for non-table nodes (fallback)
      if (node.type !== 'tableNode') {
        setSelectedAssetId(node.id);
      }
    },
    [setSelectedAssetId]
  );

  // Handle edge click
  const onEdgeClick = useCallback(
    (_: React.MouseEvent, edge: Edge) => {
      setSelectedEdge(edge.id);
      openPanel('edge');
    },
    [setSelectedEdge, openPanel]
  );

  // Handle pane click to clear selection
  const onPaneClick = useCallback(() => {
    clearHighlight();
    closePanel();
  }, [clearHighlight, closePanel]);

  // Handle fit view
  const handleFitView = useCallback(() => {
    reactFlowInstance.fitView({ padding: 0.2 });
  }, [reactFlowInstance]);

  // Handle export menu selection
  const handleExport = useCallback(() => {
    // For now, export as JSON by default
    // Could show a dropdown menu for format selection
    exportJson();
  }, [exportJson]);

  // Get column detail for panel
  const getColumnDetail = useCallback(
    (columnId: string): ColumnDetail | null => {
      const node = storeNodes.find((n) => n.id === columnId);
      if (!node || node.type !== 'column') return null;

      // Count upstream and downstream
      const upstreamCount = storeEdges.filter((e) => e.target === columnId).length;
      const downstreamCount = storeEdges.filter((e) => e.source === columnId).length;

      return {
        id: node.id,
        databaseName: node.databaseName,
        tableName: node.tableName || '',
        columnName: node.columnName || '',
        dataType: (node.metadata?.columnType as string) || undefined,
        nullable: (node.metadata?.nullable as boolean) || undefined,
        isPrimaryKey: (node.metadata?.isPrimaryKey as boolean) || undefined,
        description: (node.metadata?.description as string) || undefined,
        upstreamCount,
        downstreamCount,
      };
    },
    [storeNodes, storeEdges]
  );

  // Get edge detail for panel
  const getEdgeDetail = useCallback(
    (edgeId: string): EdgeDetail | null => {
      const edge = storeEdges.find((e) => e.id === edgeId);
      if (!edge) return null;

      const sourceNode = storeNodes.find((n) => n.id === edge.source);
      const targetNode = storeNodes.find((n) => n.id === edge.target);

      return {
        id: edge.id,
        sourceColumn: sourceNode
          ? `${sourceNode.databaseName}.${sourceNode.tableName}.${sourceNode.columnName}`
          : edge.source,
        targetColumn: targetNode
          ? `${targetNode.databaseName}.${targetNode.tableName}.${targetNode.columnName}`
          : edge.target,
        transformationType: edge.transformationType || 'unknown',
        confidenceScore: edge.confidenceScore,
      };
    },
    [storeNodes, storeEdges]
  );

  // Handle view full lineage from panel
  const handleViewFullLineage = useCallback(
    (columnId: string) => {
      const { highlightedNodes, highlightedEdges } = highlightPath(columnId);
      setHighlightedPath(highlightedNodes, highlightedEdges);
    },
    [highlightPath, setHighlightedPath]
  );

  // Handle impact analysis from panel - navigate to Impact Analysis page
  const handleViewImpactAnalysis = useCallback((columnId: string) => {
    navigate(`/impact/${encodeURIComponent(columnId)}`);
  }, [navigate]);

  // Handle table view row click
  const handleTableRowClick = useCallback(
    (edgeId: string) => {
      setSelectedEdge(edgeId);
      openPanel('edge');
      // Optionally switch to graph view
      setViewMode('graph');
    },
    [setSelectedEdge, openPanel, setViewMode]
  );

  // Show progress during any loading stage (fetching, layout, or rendering)
  const showProgress = isLoading || (stage !== 'idle' && stage !== 'complete');

  if (showProgress) {
    return (
      <div className="flex items-center justify-center h-full">
        <LoadingProgress progress={progress} message={message} size="lg" />
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

  // Handle empty lineage data - check edges since root node is always included
  const hasNoLineageData = data && data.graph && data.graph.edges?.length === 0;
  if (hasNoLineageData) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-500">
        <svg
          className="w-16 h-16 mb-4 text-slate-300"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
          />
        </svg>
        <h3 className="text-lg font-medium text-slate-700 mb-2">No Lineage Data Available</h3>
        <p className="text-sm text-slate-500 text-center max-w-md">
          No lineage relationships have been discovered for <span className="font-mono text-slate-600">table {datasetId}</span>.
        </p>
        <p className="text-sm text-slate-400 mt-2 text-center max-w-md">
          This table's columns may not have any upstream or downstream dependencies, or lineage data hasn't been extracted yet.
        </p>
      </div>
    );
  }

  // Get selected details for panel
  const selectedColumn = selectedAssetId ? getColumnDetail(selectedAssetId) : null;
  const selectedEdgeDetail = selectedEdgeId ? getEdgeDetail(selectedEdgeId) : null;

  return (
    <div
      ref={wrapperRef}
      className={`flex flex-col h-full ${isFullscreen ? 'fixed inset-0 z-50 bg-white' : ''}`}
    >
      {/* Toolbar */}
      <Toolbar
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        direction={direction}
        onDirectionChange={setDirection}
        depth={maxDepth}
        onDepthChange={setMaxDepth}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onFitView={handleFitView}
        onExport={handleExport}
        onFullscreen={toggleFullscreen}
        isLoading={isLoading}
        assetTypeFilter={assetTypeFilter}
        onAssetTypeFilterChange={setAssetTypeFilter}
      />

      {/* Graph View */}
      {viewMode === 'graph' && (
        <div className="flex-1 relative">
          <ReactFlow
            nodes={filteredNodesAndEdges.filteredNodes}
            edges={filteredNodesAndEdges.filteredEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            onEdgeClick={onEdgeClick}
            onPaneClick={onPaneClick}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            connectionMode={ConnectionMode.Loose}
            minZoom={0.1}
            maxZoom={2}
            onlyRenderVisibleElements={filteredNodesAndEdges.filteredNodes.length > 50}
            proOptions={{ hideAttribution: true }}
          >
            {/* Database cluster backgrounds - rendered with viewport transform */}
            {showDatabaseClusters && (
              <div className="absolute inset-0 pointer-events-none overflow-hidden">
                <ClusterBackground clusters={clusters} visible={showDatabaseClusters} />
              </div>
            )}

            <Background color="#e2e8f0" gap={16} />
            <Controls />
            {showMinimap && (
              <MiniMap
                nodeColor={(node) => {
                  // Highlight the focused field (skip if fieldName is '_all')
                  if (fieldName !== '_all') {
                    const fieldId = `${datasetId}.${fieldName}`;
                    if (filteredNodesAndEdges.filteredNodes.some((n) => n.type === 'tableNode' && n.data)) {
                      const tableData = node.data as { columns?: Array<{ id: string }> } | undefined;
                      if (tableData?.columns?.some((col) => col.id === fieldId)) {
                        return '#3b82f6';
                      }
                    }
                  }
                  return '#94a3b8';
                }}
                maskColor="rgba(0, 0, 0, 0.1)"
                style={{ bottom: 56 }}
              />
            )}
          </ReactFlow>
          {/* Minimap Toggle */}
          <div className="absolute bottom-4 right-4 z-10">
            <div className="bg-white rounded-lg shadow-lg border border-slate-200 overflow-hidden">
              <button
                onClick={() => setShowMinimap(!showMinimap)}
                className="flex items-center justify-between w-full px-3 py-2 bg-slate-50 hover:bg-slate-100 transition-colors"
                aria-expanded={showMinimap}
                aria-label="Toggle minimap"
              >
                <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <Map size={14} />
                  Minimap
                </span>
                {showMinimap ? (
                  <ChevronDown size={14} className="text-slate-500 ml-2" />
                ) : (
                  <ChevronUp size={14} className="text-slate-500 ml-2" />
                )}
              </button>
            </div>
          </div>
          <Legend />
        </div>
      )}

      {/* Table View */}
      {viewMode === 'table' && (
        <div className="flex-1">
          <LineageTableView
            nodes={storeNodes}
            edges={storeEdges}
            onRowClick={handleTableRowClick}
          />
        </div>
      )}

      {/* Detail Panel */}
      <DetailPanel
        isOpen={isPanelOpen}
        onClose={closePanel}
        selectedColumn={panelContent === 'node' ? selectedColumn : undefined}
        selectedEdge={panelContent === 'edge' ? selectedEdgeDetail : undefined}
        onViewFullLineage={handleViewFullLineage}
        onViewImpactAnalysis={handleViewImpactAnalysis}
      />
    </div>
  );
}

export interface LineageGraphProps {
  datasetId: string;
  fieldName: string; // Used to highlight/focus a specific field
}

export function LineageGraph({ datasetId, fieldName }: LineageGraphProps) {
  return (
    <ReactFlowProvider>
      <LineageGraphInner datasetId={datasetId} fieldName={fieldName} />
    </ReactFlowProvider>
  );
}
