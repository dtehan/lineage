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
import { LargeGraphWarning } from './LargeGraphWarning';
import {
  useLineageHighlight,
  useKeyboardShortcuts,
  useLineageExport,
  useSmartViewport,
  useFitToSelection,
} from './hooks';

/**
 * Threshold for enabling React Flow's onlyRenderVisibleElements optimization.
 *
 * Based on Phase 18 benchmarks (18-01-SUMMARY.md):
 * - Render time scales roughly linearly up to 100 nodes (~14ms)
 * - Render time grows super-linearly 100->200 nodes (2.90x increase to ~42ms)
 * - Keeping threshold at 50 provides a buffer before render time becomes noticeable
 * - Virtualization has minimal overhead for small graphs but helps significantly for large ones
 */
const VIRTUALIZATION_THRESHOLD = 50;

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
  const [isWarningDismissed, setIsWarningDismissed] = useState(false);
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
    assetTypeFilter,
    setAssetTypeFilter,
    isTableSelection,
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
  const {
    stage,
    progress,
    message,
    elapsedTime,
    estimatedTimeRemaining,
    setStage,
    setProgress,
    reset,
  } = useLoadingProgress();

  // Use smart viewport hook for size-aware positioning
  const { applySmartViewport } = useSmartViewport();

  // Use fit-to-selection hook for centering on highlighted path
  const { fitToSelection, hasSelection } = useFitToSelection();

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

  // Reset loading state and viewport flags when datasetId changes
  useEffect(() => {
    reset();
    hasAppliedViewportRef.current = false;
    hasUserInteractedRef.current = false;
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
  }, [fieldName, nodes.length, storeNodes, setSelectedAssetId]);

  // Handle column selection from TableNode/ColumnRow
  // This is called when a column row is clicked inside a table node
  // Also re-runs when storeNodes change (depth change) to recompute or clear highlight
  useEffect(() => {
    if (selectedAssetId) {
      // Verify selected column still exists in current graph after depth change
      const stillExists = storeNodes.some((n) => n.id === selectedAssetId);
      if (stillExists) {
        const { highlightedNodes, highlightedEdges } = highlightPath(selectedAssetId);
        setHighlightedPath(highlightedNodes, highlightedEdges);
        if (!isPanelOpen) {
          openPanel('node');
        }
      } else {
        // Column no longer in graph (e.g., depth was reduced)
        clearHighlight();
        closePanel();
      }
    }
  }, [selectedAssetId, highlightPath, setHighlightedPath, openPanel, isPanelOpen,
      storeNodes, clearHighlight, closePanel]);

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

  // Handle node drag start - mark that user has interacted
  const onNodeDragStart = useCallback(() => {
    hasUserInteractedRef.current = true;
  }, []);

  // Handle fit view
  const handleFitView = useCallback(() => {
    reactFlowInstance.fitView({ padding: 0.2 });
  }, [reactFlowInstance]);

  // Handle fit to selection - mark user interaction to prevent smart viewport override
  const handleFitToSelection = useCallback(() => {
    hasUserInteractedRef.current = true;
    fitToSelection();
  }, [fitToSelection]);

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

  // Get all columns from a table for panel (when table is selected)
  const getTableColumns = useCallback(
    (columnId: string): ColumnDetail[] => {
      // Find the column to get its table info
      const node = storeNodes.find((n) => n.id === columnId);
      if (!node || node.type !== 'column') return [];

      const { databaseName, tableName } = node;

      // Find all columns in the same table
      const tableColumns = storeNodes
        .filter((n) =>
          n.type === 'column' &&
          n.databaseName === databaseName &&
          n.tableName === tableName
        )
        .map((col) => {
          const upstreamCount = storeEdges.filter((e) => e.target === col.id).length;
          const downstreamCount = storeEdges.filter((e) => e.source === col.id).length;

          return {
            id: col.id,
            databaseName: col.databaseName,
            tableName: col.tableName || '',
            columnName: col.columnName || '',
            dataType: (col.metadata?.columnType as string) || undefined,
            nullable: (col.metadata?.nullable as boolean) || undefined,
            isPrimaryKey: (col.metadata?.isPrimaryKey as boolean) || undefined,
            description: (col.metadata?.description as string) || undefined,
            upstreamCount,
            downstreamCount,
          };
        })
        .sort((a, b) => a.columnName.localeCompare(b.columnName));

      return tableColumns;
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

  // Calculate suggested depth for large graphs
  // Simple heuristic: reduce depth by 2, minimum of 3
  const suggestedDepth = useMemo(() => {
    return Math.max(3, maxDepth - 2);
  }, [maxDepth]);

  // Handle accepting depth suggestion from large graph warning
  const handleAcceptDepthSuggestion = useCallback(() => {
    setMaxDepth(suggestedDepth);
  }, [setMaxDepth, suggestedDepth]);

  // Handle dismissing large graph warning
  const handleDismissWarning = useCallback(() => {
    setIsWarningDismissed(true);
  }, []);

  // Get current node count for warning display
  const nodeCount = filteredNodesAndEdges.filteredNodes.length;

  // Show progress during any loading stage (fetching, layout, or rendering)
  const showProgress = isLoading || (stage !== 'idle' && stage !== 'complete');

  // Compute display values: when isLoading is true but stage is still 'idle' (effects haven't run yet),
  // show the fetching state values to avoid appearing frozen
  const displayProgress = (isLoading && stage === 'idle') ? 15 : progress;
  const displayMessage = (isLoading && stage === 'idle') ? 'Loading data...' : message;

  // Show timing during layout stage (when ELK is running) for larger graphs
  // Layout is the main bottleneck per Phase 18 benchmarks
  const showTiming = stage === 'layout' || stage === 'rendering';

  if (showProgress) {
    return (
      <div className="flex items-center justify-center h-full">
        <LoadingProgress
          progress={displayProgress}
          message={displayMessage}
          size="lg"
          elapsedTime={elapsedTime}
          estimatedTimeRemaining={estimatedTimeRemaining}
          showTiming={showTiming}
        />
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
  // If table selection, get all columns from the table; otherwise just the selected column
  const selectedColumns = selectedAssetId
    ? (isTableSelection
        ? getTableColumns(selectedAssetId)
        : [getColumnDetail(selectedAssetId)].filter((c): c is ColumnDetail => c !== null))
    : [];
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
        onFitToSelection={handleFitToSelection}
        hasSelection={hasSelection}
        onExport={handleExport}
        onFullscreen={toggleFullscreen}
        isLoading={isLoading}
        assetTypeFilter={assetTypeFilter}
        onAssetTypeFilterChange={setAssetTypeFilter}
      />

      {/* Large Graph Warning */}
      {!isWarningDismissed && (
        <LargeGraphWarning
          nodeCount={nodeCount}
          currentDepth={maxDepth}
          suggestedDepth={suggestedDepth}
          onAcceptSuggestion={handleAcceptDepthSuggestion}
          onDismiss={handleDismissWarning}
        />
      )}

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
            onNodeDragStart={onNodeDragStart}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            connectionMode={ConnectionMode.Loose}
            minZoom={0.1}
            maxZoom={2}
            onlyRenderVisibleElements={filteredNodesAndEdges.filteredNodes.length > VIRTUALIZATION_THRESHOLD}
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
        selectedColumns={panelContent === 'node' ? selectedColumns : undefined}
        selectedEdge={panelContent === 'edge' ? selectedEdgeDetail : undefined}
        datasetId={datasetId}
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
