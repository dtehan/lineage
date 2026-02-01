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

import { useOpenLineageDatabaseLineage } from '../../../api/hooks/useOpenLineage';
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
import { Map, ChevronUp, ChevronDown, Database } from 'lucide-react';
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

interface DatabaseLineageGraphInnerProps {
  databaseName: string;
}

function DatabaseLineageGraphInner({ databaseName }: DatabaseLineageGraphInnerProps) {
  const reactFlowInstance = useReactFlow();
  const navigate = useNavigate();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [showMinimap, setShowMinimap] = useState(false);
  const hasAppliedViewportRef = useRef(false);
  const hasUserInteractedRef = useRef(false);

  const {
    direction,
    setDirection,
    maxDepth,
    setMaxDepth,
    viewMode,
    setViewMode,
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
    // Note: setAssetTypeFilter is available but not used in current implementation
  } = useLineageStore();

  // Fetch database lineage using OpenLineage API
  const { data, isLoading, error } = useOpenLineageDatabaseLineage(databaseName, direction, maxDepth || 3);

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

  // Use smart viewport hook for size-aware positioning
  const { applySmartViewport } = useSmartViewport();

  // Use loading progress hook for stage tracking
  const { stage, progress, message, setStage, setProgress, reset } = useLoadingProgress();

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

  // Track fetching stage
  useEffect(() => {
    if (isLoading) {
      setStage('fetching');
    }
  }, [isLoading, setStage]);

  // Reset loading state and viewport flags when database changes
  useEffect(() => {
    reset();
    hasAppliedViewportRef.current = false;
    hasUserInteractedRef.current = false;
  }, [databaseName, reset]);

  // Update nodes/edges when data changes
  useEffect(() => {
    if (!data?.graph?.nodes) return;

    setStage('layout');

    // Convert OpenLineage graph to React Flow format
    const converted = convertOpenLineageGraph(data.graph.nodes, data.graph.edges);

    // Layout the graph
    layoutGraph(converted.nodes, converted.edges, {
      onProgress: (layoutProgress) => setProgress(layoutProgress),
    }).then(
      ({ nodes: layoutedNodes, edges: layoutedEdges }) => {
        setStage('rendering');
        setNodes(layoutedNodes);
        setEdges(layoutedEdges);
        setGraph(converted.nodes, converted.edges);
        // Use requestAnimationFrame to detect render complete
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setStage('complete');
          });
        });
      }
    );
  }, [data, setNodes, setEdges, setGraph, setStage, setProgress]);

  // Apply smart viewport after layout completes (only once per data load, never after user interaction)
  useEffect(() => {
    if (nodes.length > 0 && stage === 'complete' && !hasAppliedViewportRef.current && !hasUserInteractedRef.current) {
      // Delay to ensure React Flow has measured node dimensions (longer for large graphs)
      const timeoutId = setTimeout(() => {
        // Double-check user hasn't interacted during the timeout
        if (!hasUserInteractedRef.current) {
          applySmartViewport(nodes);
          hasAppliedViewportRef.current = true;
        }
      }, 150);
      return () => clearTimeout(timeoutId);
    }
  }, [nodes.length, stage, applySmartViewport]);

  // Handle column selection from TableNode/ColumnRow
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

  // Handle node drag start - mark that user has interacted
  const onNodeDragStart = useCallback(() => {
    hasUserInteractedRef.current = true;
  }, []);

  // Handle fit view
  const handleFitView = useCallback(() => {
    reactFlowInstance.fitView({ padding: 0.2 });
  }, [reactFlowInstance]);

  // Handle export
  const handleExport = useCallback(() => {
    exportJson();
  }, [exportJson]);

  // Get column detail for panel
  const getColumnDetail = useCallback(
    (columnId: string): ColumnDetail | null => {
      const node = storeNodes.find((n) => n.id === columnId);
      if (!node || node.type !== 'column') return null;

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

  // Handle impact analysis from panel
  const handleViewImpactAnalysis = useCallback((columnId: string) => {
    navigate(`/impact/${encodeURIComponent(columnId)}`);
  }, [navigate]);

  // Handle table view row click
  const handleTableRowClick = useCallback(
    (edgeId: string) => {
      setSelectedEdge(edgeId);
      openPanel('edge');
      setViewMode('graph');
    },
    [setSelectedEdge, openPanel, setViewMode]
  );

  // Show progress during any loading stage (fetching, layout, or rendering)
  const showProgress = isLoading || (stage !== 'idle' && stage !== 'complete');

  // Compute display values: when isLoading is true but stage is still 'idle' (effects haven't run yet),
  // show the fetching state values to avoid appearing frozen
  const displayProgress = (isLoading && stage === 'idle') ? 15 : progress;
  const displayMessage = (isLoading && stage === 'idle') ? 'Loading data...' : message;

  if (showProgress) {
    return (
      <div className="flex items-center justify-center h-full">
        <LoadingProgress progress={displayProgress} message={displayMessage} size="lg" />
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

  // Handle empty data
  if (!data?.graph?.nodes.length && !isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-500">
        <Database className="w-16 h-16 mb-4 text-slate-300" />
        <h2 className="text-xl font-semibold text-slate-700 mb-2">No Lineage Found</h2>
        <p className="text-sm text-slate-500 max-w-md text-center">
          No lineage relationships found for database "{databaseName}".
          This database may not have any tables with known lineage.
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
      {/* Header with database info */}
      <div className="flex items-center justify-between px-4 py-2 bg-blue-50 border-b border-blue-200">
        <div className="flex items-center gap-2">
          <Database className="w-5 h-5 text-blue-600" />
          <span className="font-medium text-blue-800">Database: {databaseName}</span>
          {data?.graph && (
            <span className="text-sm text-blue-600">
              ({data.graph.nodes.length} table{data.graph.nodes.length !== 1 ? 's' : ''})
            </span>
          )}
        </div>
      </div>

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
      />

      {/* Graph View */}
      {viewMode === 'graph' && (
        <div className="flex-1 relative">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            onEdgeClick={onEdgeClick}
            onPaneClick={onPaneClick}
            onNodeDragStart={onNodeDragStart}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            connectionMode={ConnectionMode.Loose}
            minZoom={0.1}
            maxZoom={2}
            onlyRenderVisibleElements={nodes.length > 50}
            proOptions={{ hideAttribution: true }}
          >
            {showDatabaseClusters && (
              <div className="absolute inset-0 pointer-events-none overflow-hidden">
                <ClusterBackground clusters={clusters} visible={showDatabaseClusters} />
              </div>
            )}

            <Background color="#e2e8f0" gap={16} />
            <Controls />
            {showMinimap && (
              <MiniMap
                nodeColor={() => '#94a3b8'}
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

// Note: DatabaseBrowser and TableBrowserItem components were removed as they
// referenced non-existent hooks (useTables, useColumns) and components (LoadingSpinner,
// ChevronRight, Table, Columns). They can be re-added when the dependencies are implemented.

export interface DatabaseLineageGraphProps {
  databaseName: string;
}

export function DatabaseLineageGraph({ databaseName }: DatabaseLineageGraphProps) {
  return (
    <ReactFlowProvider>
      <DatabaseLineageGraphInner databaseName={databaseName} />
    </ReactFlowProvider>
  );
}
