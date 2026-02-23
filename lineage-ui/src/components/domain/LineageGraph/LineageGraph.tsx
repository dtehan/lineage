import { useCallback, useEffect, useMemo, useRef, useState, Profiler } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  ConnectionMode,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useQueryClient } from '@tanstack/react-query';
import { useOpenLineageTableLineage, useProgressiveLineage } from '../../../api/hooks/useOpenLineage';
import { openLineageApi } from '../../../api/client';
import { useLineageStore } from '../../../stores/useLineageStore';
import { layoutGraph, type TableNodeData } from '../../../utils/graph/layoutEngine';
import { convertOpenLineageGraph } from '../../../utils/graph/openLineageAdapter';
import { TableNode } from './TableNode/';
import { LineageEdge } from './LineageEdge';
import { Toolbar } from './Toolbar';
import { DetailPanel, ColumnDetail, EdgeDetail } from './DetailPanel';
import { Legend } from './Legend';
import { LoadingProgress } from '../../common/LoadingProgress';
import { useLoadingProgress, formatMs } from '../../../hooks/useLoadingProgress';
import { Map, ChevronUp, ChevronDown, Info } from 'lucide-react';
import { ClusterBackground, useDatabaseClustersFromNodes } from './ClusterBackground';
import { LineageTableView } from './LineageTableView';
import { LargeGraphWarning, LARGE_GRAPH_THRESHOLD } from './LargeGraphWarning';
import { ProgressBanner } from './ProgressBanner';
import {
  useLineageHighlight,
  useKeyboardShortcuts,
  useLineageExport,
  useSmartViewport,
  useFitToSelection,
  useProfiler,
  useMultiSelect,
} from './hooks';
import { toggleTransitions, shouldDisableTransitions } from '../../../utils/graph/disableTransitions';
import { LineageMiniMap } from './LineageMiniMap';

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
  const queryClient = useQueryClient();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [showMinimap, setShowMinimap] = useState(false);
  const [isWarningDismissed, setIsWarningDismissed] = useState(false);
  // Tracks when a graph is too large to layout — set before ELK runs so we can
  // show an immediate warning instead of waiting minutes for ELK to finish.
  const [preLayoutNodeCount, setPreLayoutNodeCount] = useState(0);
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
    toggleMultiSelectMode,
  } = useLineageStore();

  // Use column-level lineage for a specific field, table-level lineage for '_all'.
  // Column-level lineage uses two-stage progressive loading: depth-1 fires immediately,
  // full-depth fires after depth-1 resolves. This means the graph is shown to the user
  // as soon as depth-1 data arrives — the spinner dismisses on depth-1, not on full-depth.
  const isTableView = fieldName === '_all';
  const {
    depth1Query,
    fullDepthQuery,
    isDepth1Ready,
    isFullDepthReady,
    finalData: columnFinalData,
    isLoading: columnIsLoading,
    isFetchingFullDepth,
    error: columnError,
  } = useProgressiveLineage(datasetId, fieldName, direction, maxDepth, {
    enabled: !isTableView && !!datasetId && !!fieldName,
  });
  const tableQuery = useOpenLineageTableLineage(
    datasetId,
    direction,
    maxDepth,
    { enabled: isTableView && !!datasetId }
  );

  // For column lineage, `data` is depth-1 data as soon as it's available (NOT waiting
  // for full-depth). This ensures the layout effect fires on depth-1 data, the spinner
  // dismisses, and the user sees the graph immediately. When full-depth arrives, `data`
  // updates to the full dataset and the layout effect re-fires for the second pass.
  const columnData = isFullDepthReady ? columnFinalData : (isDepth1Ready ? depth1Query.data : null);
  const data = isTableView ? tableQuery.data : columnData;
  const isLoading = isTableView ? tableQuery.isLoading : columnIsLoading;
  const isFetching = isTableView ? tableQuery.isFetching : (depth1Query.isFetching || fullDepthQuery.isFetching);
  const error = isTableView ? tableQuery.error : columnError;

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
    stageDurations,
  } = useLoadingProgress();

  // Use smart viewport hook for size-aware positioning
  const { applySmartViewport } = useSmartViewport();

  // Use fit-to-selection hook for centering on highlighted path
  const { fitToSelection, hasSelection } = useFitToSelection();

  // Use profiler hook for measuring re-render frequency (FRONTEND-02)
  const { onRender } = useProfiler('LineageGraph');

  // Use multi-select hook for group selection and drag
  const { isMultiSelectMode, onSelectionChange, onSelectionDragStart } = useMultiSelect(hasUserInteractedRef);

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

  // Disable CSS transitions for large graphs to prevent animation jank (FRONTEND-05)
  useEffect(() => {
    const nodeCount = filteredNodesAndEdges.filteredNodes.length;
    if (shouldDisableTransitions(nodeCount)) {
      toggleTransitions(false);
    } else {
      toggleTransitions(true);
    }
    // Re-enable transitions on unmount
    return () => toggleTransitions(true);
  }, [filteredNodesAndEdges.filteredNodes.length]);

  // Reset loading state and viewport flags when datasetId or fieldName changes
  useEffect(() => {
    reset();
    setPreLayoutNodeCount(0);
    hasAppliedViewportRef.current = false;
    hasUserInteractedRef.current = false;
  }, [datasetId, fieldName, reset]);

  // Sync data fetch stage with TanStack Query loading state
  // Also reset stage on error so the error UI can render (not blocked by showProgress)
  useEffect(() => {
    if (isLoading) {
      setStage('fetching');
    } else if (error) {
      reset();
    }
  }, [isLoading, error, setStage, reset]);

  // Update nodes/edges when data changes
  useEffect(() => {
    if (data?.graph) {
      setStage('layout');
      // Track whether this effect run has been superseded (data changed or component unmounted).
      // Without this, stale worker promises from previous navigations can call setState on the
      // current component, corrupting stage and nodes while a fresh computation is in progress.
      let cancelled = false;

      // Convert OpenLineage graph to legacy format for layout engine
      const { nodes: legacyNodes, edges: legacyEdges } = convertOpenLineageGraph(
        data.graph.nodes,
        data.graph.edges
      );

      // Count unique tables (which become React Flow table cards after layout).
      // LARGE_GRAPH_THRESHOLD is calibrated for table-card count, NOT column-node
      // count. A single table can have 30+ columns, so comparing legacyNodes.length
      // would fire the threshold far too early.
      const uniqueTableCount = new Set(
        legacyNodes
          .filter((n) => n.type === 'column' && n.tableName)
          .map((n) => `${n.databaseName}.${n.tableName}`)
      ).size;
      setPreLayoutNodeCount(uniqueTableCount);

      // Gate: if there are no edges, skip ELK entirely. There are no relationships
      // to visualise, so layout is unnecessary. Certain ELK configurations
      // (rectpacking inner layout + FIXED_ORDER port constraints propagated via
      // hierarchyHandling: INCLUDE_CHILDREN) can cause ELK to hang indefinitely
      // for a single-table, 0-edge graph, leaving the spinner stuck at
      // "Calculating layout". The hasNoLineageData check in the render tree
      // handles showing the correct empty-state UI once stage is 'complete'.
      if (legacyEdges.length === 0) {
        setGraph(legacyNodes, legacyEdges);
        setStage('complete');
        return () => {
          cancelled = true;
          reset();
        };
      }

      // Gate: if graph is too large, skip ELK entirely and surface an immediate
      // blocking warning. ELK's hierarchical algorithm takes O(n²+) time; graphs
      // with 200+ table nodes can take many minutes.  Users can reduce depth to recover.
      if (uniqueTableCount > LARGE_GRAPH_THRESHOLD) {
        setGraph(legacyNodes, legacyEdges);
        setStage('complete');
        return () => {
          cancelled = true;
          reset();
        };
      }

      // Run layout on main thread (topological layout is O(V+E), completes in ms)
      layoutGraph(legacyNodes, legacyEdges, {
        onProgress: (p) => setProgress(p),
      })
        .then(({ nodes: layoutedNodes, edges: layoutedEdges }) => {
          if (cancelled) return;
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
          if (cancelled) return;
          console.error('Layout error:', error);
          // Fallback: set nodes without layout
          setGraph(legacyNodes, legacyEdges);
          setStage('complete');
        });

      return () => {
        cancelled = true;
        // Reset stage so a stale 'layout' stage doesn't block the next render cycle
        reset();
      };
    }
  }, [data, setNodes, setEdges, setGraph, setStage, setProgress, reset]);

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
    (event: React.MouseEvent, node: Node) => {
      // If multi-select modifier is held or multi-select mode active, let RF handle selection
      if (event.metaKey || event.ctrlKey || isMultiSelectMode) return;
      // For table nodes, column selection is handled by ColumnRow
      // This handler is for non-table nodes (fallback)
      if (node.type !== 'tableNode') {
        setSelectedAssetId(node.id);
      }
    },
    [setSelectedAssetId, isMultiSelectMode]
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

  // Handle refresh - fetch fresh data bypassing backend cache
  const handleRefresh = useCallback(async () => {
    if (isTableView) {
      const freshData = await openLineageApi.getTableLineageGraph(datasetId, {
        direction,
        maxDepth,
        refresh: true,
      });
      queryClient.setQueryData(
        ['openlineage', 'table-lineage', datasetId, direction, maxDepth],
        freshData
      );
    } else {
      const freshData = await openLineageApi.getLineageGraph(datasetId, fieldName, {
        direction,
        maxDepth,
        refresh: true,
      });
      // Invalidate both depth-1 and full-depth cache entries
      queryClient.setQueryData(
        ['openlineage', 'lineage', datasetId, fieldName, direction, maxDepth],
        freshData
      );
      // Also invalidate depth-1 if maxDepth > 1 (depth-1 is a subset)
      if (maxDepth > 1) {
        queryClient.invalidateQueries({
          queryKey: ['openlineage', 'lineage', datasetId, fieldName, direction, 1],
        });
      }
    }
  }, [isTableView, datasetId, fieldName, direction, maxDepth, queryClient]);

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
    // Find the node to extract datasetId and fieldName
    const node = storeNodes.find((n) => n.id === columnId);
    if (!node || node.type !== 'column') return;

    // Construct datasetId from database.table
    const datasetId = `${node.databaseName}.${node.tableName}`;
    const fieldName = node.columnName || '';

    navigate(`/impact/${encodeURIComponent(datasetId)}/${encodeURIComponent(fieldName)}`);
  }, [navigate, storeNodes]);

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

  // Graph too large to layout with ELK — show a blocking warning instead of
  // making the user wait several minutes for a layout that may never finish.
  // The user can reduce depth and re-fetch to get a smaller, renderable graph.
  if (preLayoutNodeCount > LARGE_GRAPH_THRESHOLD) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-600 px-8">
        <svg className="w-12 h-12 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
        <h3 className="text-lg font-semibold text-slate-700">Graph Too Large to Display</h3>
        <p className="text-sm text-center text-slate-500 max-w-md">
          This graph has <strong>{preLayoutNodeCount} nodes</strong> at depth {maxDepth}. Laying out graphs this
          large can take many minutes. Try reducing the depth to see a more focused view.
        </p>
        {suggestedDepth < maxDepth && (
          <button
            onClick={handleAcceptDepthSuggestion}
            className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
          >
            Reduce depth to {suggestedDepth}
          </button>
        )}
      </div>
    );
  }

  // Handle empty lineage data - check edges since root node is always included.
  // Used to render the inline informational banner alongside the canvas (not replace it).
  const hasNoLineageData = data && data.graph && data.graph.edges?.length === 0;

  // Get selected details for panel
  // If table selection, get all columns from the table; otherwise just the selected column
  const selectedColumns = selectedAssetId
    ? (isTableSelection
        ? getTableColumns(selectedAssetId).sort((a, b) => a.columnName.localeCompare(b.columnName))
        : [getColumnDetail(selectedAssetId)].filter((c): c is ColumnDetail => c !== null))
    : [];
  const selectedEdgeDetail = selectedEdgeId ? getEdgeDetail(selectedEdgeId) : null;

  return (
    <Profiler id="LineageGraph" onRender={onRender}>
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
        onRefresh={handleRefresh}
        isFetching={isFetching && !isLoading}
        assetTypeFilter={assetTypeFilter}
        onAssetTypeFilterChange={setAssetTypeFilter}
        isMultiSelectMode={isMultiSelectMode}
        onToggleMultiSelectMode={toggleMultiSelectMode}
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

      {/* Progressive depth loading banner — shown inline while full-depth fetch is in background.
          Only reachable when showProgress is false (depth-1 has been laid out and rendered). */}
      <ProgressBanner
        message="Expanding to full depth..."
        visible={!isTableView && isFetchingFullDepth}
        stageDurations={stageDurations}
      />

      {/* No lineage connections informational banner — shown inline alongside canvas, not replacing it */}
      {hasNoLineageData && (
        <div
          role="status"
          aria-live="polite"
          data-testid="no-lineage-banner"
          className="flex items-center gap-2 px-4 py-2 bg-blue-50 border-b border-blue-100 text-blue-700 text-sm"
        >
          <Info size={16} className="shrink-0" />
          <span>No lineage connections found for this table. Showing columns only.</span>
        </div>
      )}

      {/* Post-render timing summary — subtle per-stage timing after graph fully loads */}
      {stage === 'complete' && Object.keys(stageDurations).length > 0 && (
        <div className="flex items-center gap-2 px-3 py-1 text-[10px] text-slate-400 font-mono border-b border-slate-100">
          <span>Loaded in:</span>
          {stageDurations.fetching !== undefined && <span>Fetch {formatMs(stageDurations.fetching)}</span>}
          {stageDurations.layout !== undefined && <span>/ Layout {formatMs(stageDurations.layout)}</span>}
          {stageDurations.rendering !== undefined && <span>/ Render {formatMs(stageDurations.rendering)}</span>}
        </div>
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
            multiSelectionKeyCode={isMultiSelectMode ? null : 'Meta'}
            selectionOnDrag={false}
            onSelectionChange={onSelectionChange}
            onSelectionDragStart={onSelectionDragStart}
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
              <LineageMiniMap
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
    </Profiler>
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
