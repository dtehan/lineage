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

import { useDatabases } from '../../../api/hooks/useAssets';
import { useAllDatabasesLineage } from '../../../api/hooks/useLineage';
import { useLineageStore } from '../../../stores/useLineageStore';
import { layoutGraph } from '../../../utils/graph/layoutEngine';
import { TableNode } from './TableNode/';
import { LineageEdge } from './LineageEdge';
import { Toolbar } from './Toolbar';
import { DetailPanel, ColumnDetail, EdgeDetail } from './DetailPanel';
import { Legend } from './Legend';
import { LoadingProgress } from '../../common/LoadingProgress';
import { useLoadingProgress } from '../../../hooks/useLoadingProgress';
import { Map, ChevronUp, ChevronDown, Network, Loader2, Filter, X } from 'lucide-react';
import { ClusterBackground, useDatabaseClustersFromNodes } from './ClusterBackground';
import { LineageTableView } from './LineageTableView';
import {
  useLineageHighlight,
  useKeyboardShortcuts,
  useLineageExport,
  useSmartViewport,
} from './hooks';
import type { LineageNode, LineageEdge as LineageEdgeType } from '../../../types';

const nodeTypes = {
  tableNode: TableNode,
};

const edgeTypes = {
  lineageEdge: LineageEdge,
};

function AllDatabasesLineageGraphInner() {
  const reactFlowInstance = useReactFlow();
  const navigate = useNavigate();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [showMinimap, setShowMinimap] = useState(false);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const hasAppliedViewportRef = useRef(false);
  const hasUserInteractedRef = useRef(false);

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
    setPagination,
    setIsLoadingMore,
    databaseFilter,
    setDatabaseFilter,
    loadMoreCount,
    setLoadMoreCount,
  } = useLineageStore();

  // Get list of available databases for filtering
  const { data: availableDatabasesResult } = useDatabases();
  const availableDatabases = availableDatabasesResult?.data;

  const {
    data,
    isLoading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useAllDatabasesLineage({ direction, maxDepth: maxDepth || 1, pageSize: loadMoreCount, databases: databaseFilter });

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // Merge all pages of data
  const mergedData = useMemo(() => {
    if (!data?.pages) return { nodes: [], edges: [] };

    const allNodes: LineageNode[] = [];
    const allEdges: LineageEdgeType[] = [];
    const seenNodeIds = new Set<string>();
    const seenEdgeIds = new Set<string>();

    for (const page of data.pages) {
      for (const node of page.graph.nodes) {
        if (!seenNodeIds.has(node.id)) {
          seenNodeIds.add(node.id);
          allNodes.push(node);
        }
      }
      for (const edge of page.graph.edges) {
        const edgeKey = `${edge.source}->${edge.target}`;
        if (!seenEdgeIds.has(edgeKey)) {
          seenEdgeIds.add(edgeKey);
          allEdges.push(edge);
        }
      }
    }

    return { nodes: allNodes, edges: allEdges };
  }, [data?.pages]);

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

  // Create database clusters from nodes
  const clusters = useDatabaseClustersFromNodes(nodes);

  // Update pagination info in store
  useEffect(() => {
    if (data?.pages && data.pages.length > 0) {
      const lastPage = data.pages[data.pages.length - 1];
      setPagination(lastPage.pagination);
    }
  }, [data?.pages, setPagination]);

  // Track fetching stage
  useEffect(() => {
    if (isLoading) {
      setStage('fetching');
    }
  }, [isLoading, setStage]);

  // Reset loading state and viewport flags when filters change
  useEffect(() => {
    reset();
    hasAppliedViewportRef.current = false;
    hasUserInteractedRef.current = false;
  }, [databaseFilter, reset]);

  // Update loading more state
  useEffect(() => {
    setIsLoadingMore(isFetchingNextPage);
  }, [isFetchingNextPage, setIsLoadingMore]);

  // Update nodes/edges when merged data changes
  useEffect(() => {
    if (mergedData.nodes.length > 0) {
      setStage('layout');

      layoutGraph(mergedData.nodes, mergedData.edges, {
        onProgress: (layoutProgress) => setProgress(layoutProgress),
      }).then(
        ({ nodes: layoutedNodes, edges: layoutedEdges }) => {
          setStage('rendering');
          setNodes(layoutedNodes);
          setEdges(layoutedEdges);
          setGraph(mergedData.nodes, mergedData.edges);
          // Use requestAnimationFrame to detect render complete
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              setStage('complete');
            });
          });
        }
      );
    }
  }, [mergedData, setNodes, setEdges, setGraph, setStage, setProgress]);

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

  // Handle node click
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

  // Handle load more
  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Handle database filter toggle
  const handleToggleDatabase = useCallback((dbName: string) => {
    setDatabaseFilter(
      databaseFilter.includes(dbName)
        ? databaseFilter.filter(db => db !== dbName)
        : [...databaseFilter, dbName]
    );
  }, [databaseFilter, setDatabaseFilter]);

  // Clear all filters
  const handleClearFilters = useCallback(() => {
    setDatabaseFilter([]);
  }, [setDatabaseFilter]);

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

  // Handle empty lineage data - only show message if there are no nodes at all
  if (mergedData.nodes.length === 0 && !isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-500">
        <Network className="w-16 h-16 mb-4 text-slate-300" />
        <h3 className="text-lg font-medium text-slate-700 mb-2">No Lineage Data Available</h3>
        <p className="text-sm text-slate-500 text-center max-w-md">
          No tables or lineage relationships have been discovered across the databases.
        </p>
        <p className="text-sm text-slate-400 mt-2 text-center max-w-md">
          Lineage data may not have been extracted yet, or the selected databases have no tables.
        </p>
      </div>
    );
  }

  // Get pagination info
  const paginationInfo = data?.pages && data.pages.length > 0
    ? data.pages[data.pages.length - 1].pagination
    : null;

  // Get selected details for panel
  const selectedColumn = selectedAssetId ? getColumnDetail(selectedAssetId) : null;
  const selectedEdgeDetail = selectedEdgeId ? getEdgeDetail(selectedEdgeId) : null;

  return (
    <div
      ref={wrapperRef}
      className={`flex flex-col h-full ${isFullscreen ? 'fixed inset-0 z-50 bg-white' : ''}`}
    >
      {/* Header with all databases info */}
      <div className="flex items-center justify-between px-4 py-2 bg-indigo-50 border-b border-indigo-200">
        <div className="flex items-center gap-2">
          <Network className="w-5 h-5 text-indigo-600" />
          <span className="font-medium text-indigo-800">All Databases Lineage</span>
          {paginationInfo && (
            <span className="text-sm text-indigo-600">
              ({paginationInfo.page * paginationInfo.pageSize} of {paginationInfo.totalTables} tables loaded)
            </span>
          )}
          {databaseFilter.length > 0 && (
            <span className="text-sm text-indigo-600 ml-2">
              | Filtered: {databaseFilter.join(', ')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilterPanel(!showFilterPanel)}
            className={`flex items-center gap-2 px-3 py-1 text-sm font-medium border rounded-md transition-colors ${
              showFilterPanel || databaseFilter.length > 0
                ? 'text-indigo-700 bg-indigo-100 border-indigo-300'
                : 'text-indigo-700 bg-white border-indigo-300 hover:bg-indigo-50'
            }`}
            data-testid="filter-databases-btn"
          >
            <Filter className="w-4 h-4" />
            Filter Databases
            {databaseFilter.length > 0 && (
              <span className="bg-indigo-600 text-white text-xs rounded-full px-1.5 py-0.5">
                {databaseFilter.length}
              </span>
            )}
          </button>
          {hasNextPage && (
            <div className="flex items-center gap-2">
              <select
                value={loadMoreCount}
                onChange={(e) => setLoadMoreCount(Number(e.target.value) as 10 | 20 | 50)}
                className="px-2 py-1 text-sm border border-indigo-300 rounded-md bg-white text-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                aria-label="Number of tables to load"
                data-testid="load-more-count-select"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
              <button
                onClick={handleLoadMore}
                disabled={isFetchingNextPage}
                className="flex items-center gap-2 px-3 py-1 text-sm font-medium text-indigo-700 bg-white border border-indigo-300 rounded-md hover:bg-indigo-50 disabled:opacity-50"
                data-testid="load-more-btn"
              >
                {isFetchingNextPage ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading...
                  </>
                ) : (
                  'Load More Tables'
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Database Filter Panel */}
      {showFilterPanel && (
        <div className="px-4 py-3 bg-white border-b border-slate-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-slate-700">Select databases to include:</span>
            {databaseFilter.length > 0 && (
              <button
                onClick={handleClearFilters}
                className="text-xs text-indigo-600 hover:text-indigo-800"
              >
                Clear all
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {availableDatabases?.map((db) => (
              <button
                key={db.id}
                onClick={() => handleToggleDatabase(db.name)}
                className={`flex items-center gap-1 px-2 py-1 text-sm rounded-md transition-colors ${
                  databaseFilter.includes(db.name)
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
                data-testid={`filter-db-${db.name}`}
              >
                {db.name}
                {databaseFilter.includes(db.name) && <X className="w-3 h-3" />}
              </button>
            ))}
          </div>
        </div>
      )}

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
        isLoading={isLoading || isFetchingNextPage}
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
            minZoom={0.05}
            maxZoom={2}
            onlyRenderVisibleElements={nodes.length > 30}
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

export function AllDatabasesLineageGraph() {
  return (
    <ReactFlowProvider>
      <AllDatabasesLineageGraphInner />
    </ReactFlowProvider>
  );
}
