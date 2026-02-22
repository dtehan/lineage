import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render } from '../../../test/test-utils';
import { DatabaseLineageGraph } from './DatabaseLineageGraph';
import * as useOpenLineageModule from '../../../api/hooks/useOpenLineage';
import * as useLineageStoreModule from '../../../stores/useLineageStore';

// Mock the useOpenLineageDatabaseLineage hook
vi.mock('../../../api/hooks/useOpenLineage');

// Mock the useLineageStore
vi.mock('../../../stores/useLineageStore');

// Mock ReactFlow components
vi.mock('@xyflow/react', () => ({
  ReactFlow: ({ children, nodes, edges }: { children: React.ReactNode; nodes: unknown[]; edges: unknown[] }) => (
    <div data-testid="react-flow" data-nodes={JSON.stringify(nodes)} data-edges={JSON.stringify(edges)}>
      {children}
    </div>
  ),
  ReactFlowProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Background: () => <div data-testid="react-flow-background" />,
  Controls: () => <div data-testid="react-flow-controls" />,
  MiniMap: () => <div data-testid="react-flow-minimap" />,
  Panel: ({ children }: { children: React.ReactNode }) => <div data-testid="react-flow-panel">{children}</div>,
  useNodesState: () => [[], vi.fn(), vi.fn()],
  useEdgesState: () => [[], vi.fn(), vi.fn()],
  useReactFlow: () => ({
    fitView: vi.fn(),
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    getNodes: vi.fn(() => []),
    getEdges: vi.fn(() => []),
  }),
  useStoreApi: () => ({
    getState: vi.fn(() => ({
      unselectNodesAndEdges: vi.fn(),
      multiSelectionActive: false,
    })),
    setState: vi.fn(),
    subscribe: vi.fn(),
  }),
  ConnectionMode: { Loose: 'loose' },
  Handle: () => null,
  Position: { Left: 'left', Right: 'right' },
}));

// Mock the layout engine
vi.mock('../../../utils/graph/layoutEngine', () => ({
  layoutGraph: vi.fn().mockResolvedValue({ nodes: [], edges: [] }),
}));

const mockDatabaseLineageData = {
  databaseName: 'demo_user',
  direction: 'both' as const,
  maxDepth: 3,
  graph: {
    nodes: [
      { id: 'demo_user.SRC_SALES.quantity', type: 'column', databaseName: 'demo_user', tableName: 'SRC_SALES', columnName: 'quantity' },
      { id: 'demo_user.STG_SALES.quantity', type: 'column', databaseName: 'demo_user', tableName: 'STG_SALES', columnName: 'quantity' },
      { id: 'demo_user.FACT_SALES.quantity', type: 'column', databaseName: 'demo_user', tableName: 'FACT_SALES', columnName: 'quantity' },
    ],
    edges: [
      { id: 'e1', source: 'demo_user.SRC_SALES.quantity', target: 'demo_user.STG_SALES.quantity', transformationType: 'DIRECT' },
      { id: 'e2', source: 'demo_user.STG_SALES.quantity', target: 'demo_user.FACT_SALES.quantity', transformationType: 'DIRECT' },
    ],
  },
};

function mockUseQuery(overrides: Record<string, unknown>) {
  return {
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
    isSuccess: false,
    isFetching: false,
    isRefetching: false,
    refetch: vi.fn(),
    status: 'idle',
    ...overrides,
  } as unknown as ReturnType<typeof useOpenLineageModule.useOpenLineageDatabaseLineage>;
}

describe('DatabaseLineageGraph Component', () => {
  const mockSetGraph = vi.fn();
  const mockSetHighlightedPath = vi.fn();
  const mockSetPagination = vi.fn();
  const mockSetIsLoadingMore = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(useLineageStoreModule.useLineageStore).mockReturnValue({
      direction: 'both',
      maxDepth: 3,
      setGraph: mockSetGraph,
      setHighlightedNodeIds: vi.fn(),
      selectedAssetId: null,
      nodes: [],
      edges: [],
      setMaxDepth: vi.fn(),
      setDirection: vi.fn(),
      highlightedNodeIds: new Set(),
      highlightedEdgeIds: new Set(),
      expandedTables: new Map(),
      toggleTableExpanded: vi.fn(),
      setSelectedAssetId: vi.fn(),
      viewMode: 'graph' as const,
      setViewMode: vi.fn(),
      selectedEdgeId: null,
      setSelectedEdge: vi.fn(),
      setHighlightedPath: mockSetHighlightedPath,
      clearHighlight: vi.fn(),
      isPanelOpen: false,
      panelContent: null,
      openPanel: vi.fn(),
      closePanel: vi.fn(),
      isFullscreen: false,
      toggleFullscreen: vi.fn(),
      searchQuery: '',
      setSearchQuery: vi.fn(),
      showDatabaseClusters: false,
      setPagination: mockSetPagination,
      loadMoreCount: 10,
      setLoadMoreCount: vi.fn(),
      setIsLoadingMore: mockSetIsLoadingMore,
      isTableExpanded: () => true,
      setAllTablesExpanded: vi.fn(),
    });
  });

  describe('TC-DB-LINEAGE-001: Loading State', () => {
    it('displays loading spinner while fetching data', () => {
      vi.mocked(useOpenLineageModule.useOpenLineageDatabaseLineage).mockReturnValue(
        mockUseQuery({ isLoading: true })
      );

      render(<DatabaseLineageGraph databaseName="demo_user" />);

      expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument();
      expect(screen.queryByTestId('react-flow')).not.toBeInTheDocument();
    });
  });

  describe('TC-DB-LINEAGE-002: Error State', () => {
    it('displays error message on API failure', () => {
      const errorMessage = 'Database not found';
      vi.mocked(useOpenLineageModule.useOpenLineageDatabaseLineage).mockReturnValue(
        mockUseQuery({ isError: true, error: new Error(errorMessage) })
      );

      render(<DatabaseLineageGraph databaseName="demo_user" />);

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(/Failed to load lineage/)).toBeInTheDocument();
      expect(screen.getByText(/Database not found/)).toBeInTheDocument();
    });
  });

  describe('TC-DB-LINEAGE-003: Successful Render', () => {
    it('renders ReactFlow component when data is loaded', async () => {
      vi.mocked(useOpenLineageModule.useOpenLineageDatabaseLineage).mockReturnValue(
        mockUseQuery({ data: mockDatabaseLineageData, isSuccess: true })
      );

      render(<DatabaseLineageGraph databaseName="demo_user" />);

      await waitFor(() => {
        expect(screen.getByTestId('react-flow')).toBeInTheDocument();
      });
    });

    it('displays database name in header', async () => {
      vi.mocked(useOpenLineageModule.useOpenLineageDatabaseLineage).mockReturnValue(
        mockUseQuery({ data: mockDatabaseLineageData, isSuccess: true })
      );

      render(<DatabaseLineageGraph databaseName="demo_user" />);

      await waitFor(() => {
        expect(screen.getByText(/Database: demo_user/)).toBeInTheDocument();
      });
    });
  });

  describe('TC-DB-LINEAGE-005: Empty State', () => {
    it('displays empty state message when no lineage data', async () => {
      vi.mocked(useOpenLineageModule.useOpenLineageDatabaseLineage).mockReturnValue(
        mockUseQuery({
          data: {
            databaseName: 'demo_user',
            direction: 'both',
            maxDepth: 3,
            graph: { nodes: [], edges: [] },
          },
          isSuccess: true,
        })
      );

      render(<DatabaseLineageGraph databaseName="demo_user" />);

      await waitFor(() => {
        expect(screen.getByText(/No lineage relationships found/)).toBeInTheDocument();
      });
    });
  });

  describe('TC-DB-LINEAGE-006: API Parameters', () => {
    it('uses correct direction and maxDepth from store', () => {
      vi.mocked(useLineageStoreModule.useLineageStore).mockReturnValue({
        direction: 'upstream',
        maxDepth: 5,
        setGraph: mockSetGraph,
        setHighlightedNodeIds: vi.fn(),
        selectedAssetId: null,
        nodes: [],
        edges: [],
        setMaxDepth: vi.fn(),
        setDirection: vi.fn(),
        highlightedNodeIds: new Set(),
        highlightedEdgeIds: new Set(),
        expandedTables: new Map(),
        toggleTableExpanded: vi.fn(),
        setSelectedAssetId: vi.fn(),
        viewMode: 'graph' as const,
        setViewMode: vi.fn(),
        selectedEdgeId: null,
        setSelectedEdge: vi.fn(),
        setHighlightedPath: mockSetHighlightedPath,
        clearHighlight: vi.fn(),
        isPanelOpen: false,
        panelContent: null,
        openPanel: vi.fn(),
        closePanel: vi.fn(),
        isFullscreen: false,
        toggleFullscreen: vi.fn(),
        searchQuery: '',
        setSearchQuery: vi.fn(),
        showDatabaseClusters: false,
        setPagination: mockSetPagination,
        loadMoreCount: 10,
        setLoadMoreCount: vi.fn(),
        setIsLoadingMore: mockSetIsLoadingMore,
        isTableExpanded: () => true,
        setAllTablesExpanded: vi.fn(),
      });

      vi.mocked(useOpenLineageModule.useOpenLineageDatabaseLineage).mockReturnValue(
        mockUseQuery({ isLoading: true })
      );

      render(<DatabaseLineageGraph databaseName="demo_user" />);

      expect(useOpenLineageModule.useOpenLineageDatabaseLineage).toHaveBeenCalledWith('demo_user', 'upstream', 5);
    });
  });
});
