import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render } from '../../../test/test-utils';
import { AllDatabasesLineageGraph } from './AllDatabasesLineageGraph';
import * as useLineageModule from '../../../api/hooks/useLineage';
import * as useAssetsModule from '../../../api/hooks/useAssets';
import * as useLineageStoreModule from '../../../stores/useLineageStore';

// Mock the hooks
vi.mock('../../../api/hooks/useLineage');
vi.mock('../../../api/hooks/useAssets');
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
  ConnectionMode: { Loose: 'loose' },
  Handle: () => null,
  Position: { Left: 'left', Right: 'right' },
}));

// Mock the layout engine
vi.mock('../../../utils/graph/layoutEngine', () => ({
  layoutGraph: vi.fn().mockResolvedValue({ nodes: [], edges: [] }),
}));

const mockAllDatabasesLineageData = {
  pages: [{
    graph: {
      nodes: [
        { id: 'demo_user.SRC_SALES.quantity', type: 'column', databaseName: 'demo_user', tableName: 'SRC_SALES', columnName: 'quantity' },
        { id: 'demo_user.FACT_SALES.quantity', type: 'column', databaseName: 'demo_user', tableName: 'FACT_SALES', columnName: 'quantity' },
      ],
      edges: [
        { id: 'e1', source: 'demo_user.SRC_SALES.quantity', target: 'demo_user.FACT_SALES.quantity', transformationType: 'DIRECT' },
      ],
    },
    pagination: {
      page: 1,
      pageSize: 20,
      totalTables: 6,
      totalPages: 1,
    },
    appliedFilters: {
      databases: 'all',
    },
  }],
  pageParams: [1],
};

const mockDatabases = [
  { id: 'demo_user', name: 'demo_user' },
  { id: 'sales_db', name: 'sales_db' },
];

describe('AllDatabasesLineageGraph Component', () => {
  const mockSetGraph = vi.fn();
  const mockSetHighlightedPath = vi.fn();
  const mockSetPagination = vi.fn();
  const mockSetIsLoadingMore = vi.fn();
  const mockSetDatabaseFilter = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(useAssetsModule.useDatabases).mockReturnValue({
      data: { data: mockDatabases, pagination: undefined },
      isLoading: false,
      isError: false,
      error: null,
    } as ReturnType<typeof useAssetsModule.useDatabases>);

    vi.mocked(useLineageStoreModule.useLineageStore).mockReturnValue({
      direction: 'both',
      maxDepth: 2,
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
      setIsLoadingMore: mockSetIsLoadingMore,
      databaseFilter: [],
      setDatabaseFilter: mockSetDatabaseFilter,
      isTableExpanded: () => true,
      setAllTablesExpanded: vi.fn(),
      loadMoreCount: 10,
      setLoadMoreCount: vi.fn(),
    });
  });

  describe('TC-ALL-DB-LINEAGE-001: Loading State', () => {
    it('displays loading spinner while fetching data', () => {
      vi.mocked(useLineageModule.useAllDatabasesLineage).mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
        error: null,
        isSuccess: false,
        fetchNextPage: vi.fn(),
        hasNextPage: false,
        isFetchingNextPage: false,
      } as unknown as ReturnType<typeof useLineageModule.useAllDatabasesLineage>);

      render(<AllDatabasesLineageGraph />);

      expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument();
      expect(screen.queryByTestId('react-flow')).not.toBeInTheDocument();
    });
  });

  describe('TC-ALL-DB-LINEAGE-002: Error State', () => {
    it('displays error message on API failure', () => {
      const errorMessage = 'Failed to fetch lineage';
      vi.mocked(useLineageModule.useAllDatabasesLineage).mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        error: new Error(errorMessage),
        isSuccess: false,
        fetchNextPage: vi.fn(),
        hasNextPage: false,
        isFetchingNextPage: false,
      } as unknown as ReturnType<typeof useLineageModule.useAllDatabasesLineage>);

      render(<AllDatabasesLineageGraph />);

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(/Failed to load lineage/)).toBeInTheDocument();
    });
  });

  describe('TC-ALL-DB-LINEAGE-003: Successful Render', () => {
    it('renders ReactFlow component when data is loaded', async () => {
      vi.mocked(useLineageModule.useAllDatabasesLineage).mockReturnValue({
        data: mockAllDatabasesLineageData,
        isLoading: false,
        isError: false,
        error: null,
        isSuccess: true,
        fetchNextPage: vi.fn(),
        hasNextPage: false,
        isFetchingNextPage: false,
      } as unknown as ReturnType<typeof useLineageModule.useAllDatabasesLineage>);

      render(<AllDatabasesLineageGraph />);

      await waitFor(() => {
        expect(screen.getByTestId('react-flow')).toBeInTheDocument();
      });
    });

    it('displays All Databases Lineage header', async () => {
      vi.mocked(useLineageModule.useAllDatabasesLineage).mockReturnValue({
        data: mockAllDatabasesLineageData,
        isLoading: false,
        isError: false,
        error: null,
        isSuccess: true,
        fetchNextPage: vi.fn(),
        hasNextPage: false,
        isFetchingNextPage: false,
      } as unknown as ReturnType<typeof useLineageModule.useAllDatabasesLineage>);

      render(<AllDatabasesLineageGraph />);

      await waitFor(() => {
        expect(screen.getByText(/All Databases Lineage/)).toBeInTheDocument();
      });
    });
  });

  describe('TC-ALL-DB-LINEAGE-004: Pagination', () => {
    it('shows load more button when hasNextPage is true', async () => {
      vi.mocked(useLineageModule.useAllDatabasesLineage).mockReturnValue({
        data: mockAllDatabasesLineageData,
        isLoading: false,
        isError: false,
        error: null,
        isSuccess: true,
        fetchNextPage: vi.fn(),
        hasNextPage: true,
        isFetchingNextPage: false,
      } as unknown as ReturnType<typeof useLineageModule.useAllDatabasesLineage>);

      render(<AllDatabasesLineageGraph />);

      await waitFor(() => {
        expect(screen.getByTestId('load-more-btn')).toBeInTheDocument();
      });
    });

    it('does not show load more button when hasNextPage is false', async () => {
      vi.mocked(useLineageModule.useAllDatabasesLineage).mockReturnValue({
        data: mockAllDatabasesLineageData,
        isLoading: false,
        isError: false,
        error: null,
        isSuccess: true,
        fetchNextPage: vi.fn(),
        hasNextPage: false,
        isFetchingNextPage: false,
      } as unknown as ReturnType<typeof useLineageModule.useAllDatabasesLineage>);

      render(<AllDatabasesLineageGraph />);

      await waitFor(() => {
        expect(screen.queryByTestId('load-more-btn')).not.toBeInTheDocument();
      });
    });
  });

  describe('TC-ALL-DB-LINEAGE-005: Filter Button', () => {
    it('displays filter databases button', async () => {
      vi.mocked(useLineageModule.useAllDatabasesLineage).mockReturnValue({
        data: mockAllDatabasesLineageData,
        isLoading: false,
        isError: false,
        error: null,
        isSuccess: true,
        fetchNextPage: vi.fn(),
        hasNextPage: false,
        isFetchingNextPage: false,
      } as unknown as ReturnType<typeof useLineageModule.useAllDatabasesLineage>);

      render(<AllDatabasesLineageGraph />);

      await waitFor(() => {
        expect(screen.getByTestId('filter-databases-btn')).toBeInTheDocument();
      });
    });
  });

  describe('TC-ALL-DB-LINEAGE-006: Empty State', () => {
    it('displays empty state message when no lineage data', async () => {
      vi.mocked(useLineageModule.useAllDatabasesLineage).mockReturnValue({
        data: {
          pages: [{
            graph: { nodes: [], edges: [] },
            pagination: { page: 1, pageSize: 20, totalTables: 0, totalPages: 0 },
            appliedFilters: { databases: 'all' },
          }],
          pageParams: [1],
        },
        isLoading: false,
        isError: false,
        error: null,
        isSuccess: true,
        fetchNextPage: vi.fn(),
        hasNextPage: false,
        isFetchingNextPage: false,
      } as unknown as ReturnType<typeof useLineageModule.useAllDatabasesLineage>);

      render(<AllDatabasesLineageGraph />);

      await waitFor(() => {
        expect(screen.getByText(/No Lineage Data Available/)).toBeInTheDocument();
      });
    });
  });

  describe('TC-ALL-DB-LINEAGE-007: API Parameters', () => {
    it('uses correct direction and maxDepth from store', () => {
      vi.mocked(useLineageStoreModule.useLineageStore).mockReturnValue({
        direction: 'downstream',
        maxDepth: 4,
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
        setIsLoadingMore: mockSetIsLoadingMore,
        databaseFilter: ['demo_user'],
        setDatabaseFilter: mockSetDatabaseFilter,
        isTableExpanded: () => true,
        setAllTablesExpanded: vi.fn(),
        loadMoreCount: 10,
        setLoadMoreCount: vi.fn(),
      });

      vi.mocked(useLineageModule.useAllDatabasesLineage).mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
        error: null,
        isSuccess: false,
        fetchNextPage: vi.fn(),
        hasNextPage: false,
        isFetchingNextPage: false,
      } as unknown as ReturnType<typeof useLineageModule.useAllDatabasesLineage>);

      render(<AllDatabasesLineageGraph />);

      expect(useLineageModule.useAllDatabasesLineage).toHaveBeenCalledWith({
        direction: 'downstream',
        maxDepth: 4,
        pageSize: 10,
        databases: ['demo_user'],
      });
    });
  });

  describe('TC-ALL-DB-LINEAGE-008: Filter Badge', () => {
    it('shows filter count badge when filters are applied', async () => {
      vi.mocked(useLineageStoreModule.useLineageStore).mockReturnValue({
        direction: 'both',
        maxDepth: 2,
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
        setIsLoadingMore: mockSetIsLoadingMore,
        databaseFilter: ['demo_user', 'sales_db'],
        setDatabaseFilter: mockSetDatabaseFilter,
        isTableExpanded: () => true,
        setAllTablesExpanded: vi.fn(),
        loadMoreCount: 10,
        setLoadMoreCount: vi.fn(),
      });

      vi.mocked(useLineageModule.useAllDatabasesLineage).mockReturnValue({
        data: mockAllDatabasesLineageData,
        isLoading: false,
        isError: false,
        error: null,
        isSuccess: true,
        fetchNextPage: vi.fn(),
        hasNextPage: false,
        isFetchingNextPage: false,
      } as unknown as ReturnType<typeof useLineageModule.useAllDatabasesLineage>);

      render(<AllDatabasesLineageGraph />);

      await waitFor(() => {
        // The filter button should show the count of filtered databases
        const filterBtn = screen.getByTestId('filter-databases-btn');
        expect(filterBtn.textContent).toContain('2');
      });
    });
  });
});
