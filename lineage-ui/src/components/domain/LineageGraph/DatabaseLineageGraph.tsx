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
import { LoadingSpinner } from '../../common/LoadingSpinner';
import { Map, ChevronUp, ChevronDown, Database } from 'lucide-react';
import { ClusterBackground, useDatabaseClustersFromNodes } from './ClusterBackground';
import { LineageTableView } from './LineageTableView';
import {
  useLineageHighlight,
  useKeyboardShortcuts,
  useLineageExport,
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
    setAssetTypeFilter,
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

  // Update nodes/edges when data changes
  useEffect(() => {
    if (!data?.graph?.nodes) return;

    // Convert OpenLineage graph to React Flow format
    const converted = convertOpenLineageGraph(data.graph.nodes, data.graph.edges);

    // Layout the graph
    layoutGraph(converted.nodes, converted.edges).then(
      ({ nodes: layoutedNodes, edges: layoutedEdges }) => {
        setNodes(layoutedNodes);
        setEdges(layoutedEdges);
        setGraph(converted.nodes, converted.edges);
      }
    );
  }, [data, setNodes, setEdges, setGraph]);

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
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            connectionMode={ConnectionMode.Loose}
            fitView
            fitViewOptions={{ padding: 0.2 }}
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

// Database Browser component for when there's no lineage data
interface DatabaseBrowserProps {
  databaseName: string;
  navigate: ReturnType<typeof useNavigate>;
}

function DatabaseBrowser({ databaseName, navigate }: DatabaseBrowserProps) {
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());
  const { data: tablesResult, isLoading: tablesLoading } = useTables(databaseName);
  const tables = tablesResult?.data;

  const toggleTable = (tableName: string) => {
    setExpandedTables((prev) => {
      const next = new Set(prev);
      if (next.has(tableName)) {
        next.delete(tableName);
      } else {
        next.add(tableName);
      }
      return next;
    });
  };

  if (tablesLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 bg-blue-50 border-b border-blue-200">
        <Database className="w-5 h-5 text-blue-600" />
        <span className="font-medium text-blue-800">Database: {databaseName}</span>
        {tables && (
          <span className="text-sm text-blue-600">
            ({tables.length} tables)
          </span>
        )}
      </div>

      {/* Info banner */}
      <div className="px-4 py-3 bg-amber-50 border-b border-amber-200">
        <p className="text-sm text-amber-800">
          No lineage relationships found for this database. Showing tables and columns below.
        </p>
      </div>

      {/* Tables list */}
      <div className="flex-1 overflow-auto p-4">
        {tables && tables.length > 0 ? (
          <ul className="space-y-2">
            {tables.map((table) => (
              <TableBrowserItem
                key={table.id}
                databaseName={databaseName}
                table={table}
                isExpanded={expandedTables.has(table.tableName)}
                onToggle={() => toggleTable(table.tableName)}
                navigate={navigate}
              />
            ))}
          </ul>
        ) : (
          <div className="text-center py-8 text-slate-500">
            No tables found in this database.
          </div>
        )}
      </div>
    </div>
  );
}

// Table browser item component
interface TableBrowserItemProps {
  databaseName: string;
  table: { id: string; tableName: string; columnCount?: number };
  isExpanded: boolean;
  onToggle: () => void;
  navigate: ReturnType<typeof useNavigate>;
}

function TableBrowserItem({ databaseName, table, isExpanded, onToggle, navigate }: TableBrowserItemProps) {
  const { data: columnsResult, isLoading: columnsLoading } = useColumns(
    isExpanded ? databaseName : '',
    isExpanded ? table.tableName : ''
  );
  const columns = columnsResult?.data;

  const handleTableClick = () => {
    navigate(`/lineage/${encodeURIComponent(table.id)}`);
  };

  return (
    <li className="border border-slate-200 rounded-lg overflow-hidden">
      <div className="flex items-center bg-slate-50 hover:bg-slate-100">
        <button
          onClick={onToggle}
          className="p-3 hover:bg-slate-200"
          aria-label={isExpanded ? 'Collapse table' : 'Expand table'}
        >
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-slate-500" />
          ) : (
            <ChevronRight className="w-4 h-4 text-slate-500" />
          )}
        </button>
        <button
          onClick={handleTableClick}
          className="flex items-center flex-1 py-3 pr-3 text-left hover:text-blue-600"
        >
          <Table className="w-4 h-4 mr-2 text-green-500" />
          <span className="font-medium text-slate-700">{table.tableName}</span>
          {table.columnCount !== undefined && (
            <span className="ml-2 text-xs text-slate-400">
              ({table.columnCount} columns)
            </span>
          )}
        </button>
      </div>

      {isExpanded && (
        <div className="border-t border-slate-200 bg-white">
          {columnsLoading ? (
            <div className="p-4 text-center">
              <LoadingSpinner size="sm" />
            </div>
          ) : columns && columns.length > 0 ? (
            <ul className="divide-y divide-slate-100">
              {columns.map((column) => (
                <li
                  key={column.id}
                  className="flex items-center px-4 py-2 hover:bg-slate-50 cursor-pointer"
                  onClick={() => navigate(`/lineage/${encodeURIComponent(column.id)}`)}
                >
                  <Columns className="w-4 h-4 mr-2 text-purple-500" />
                  <span className="text-sm text-slate-700">{column.columnName}</span>
                  <span className="ml-2 text-xs text-slate-400">{column.columnType}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-4 text-center text-sm text-slate-500">
              No columns found
            </div>
          )}
        </div>
      )}
    </li>
  );
}

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
