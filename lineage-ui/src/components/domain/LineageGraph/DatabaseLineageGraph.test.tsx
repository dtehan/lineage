import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render } from '../../../test/test-utils';
import { DatabaseLineageGraph } from './DatabaseLineageGraph';
import * as useLineageModule from '../../../api/hooks/useLineage';
import * as useLineageStoreModule from '../../../stores/useLineageStore';

// Mock the useDatabaseLineage hook
vi.mock('../../../api/hooks/useLineage');

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
  ConnectionMode: { Loose: 'loose' },
  Handle: () => null,
  Position: { Left: 'left', Right: 'right' },
}));

// Mock the layout engine
vi.mock('../../../utils/graph/layoutEngine', () => ({
  layoutGraph: vi.fn().mockResolvedValue({ nodes: [], edges: [] }),
}));

const mockDatabaseLineageData = {
  pages: [{
    databaseName: 'demo_user',
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
    pagination: {
      page: 1,
      pageSize: 50,
      totalTables: 6,
      totalPages: 1,
    },
  }],
  pageParams: [1],
};

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
      vi.mocked(useLineageModule.useDatabaseLineage).mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
        error: null,
        isSuccess: false,
        fetchNextPage: vi.fn(),
        hasNextPage: false,
        isFetchingNextPage: false,
      } as unknown as ReturnType<typeof useLineageModule.useDatabaseLineage>);

      render(<DatabaseLineageGraph databaseName="demo_user" />);

      expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument();
      expect(screen.queryByTestId('react-flow')).not.toBeInTheDocument();
    });
  });

  describe('TC-DB-LINEAGE-002: Error State', () => {
    it('displays error message on API failure', () => {
      const errorMessage = 'Database not found';
      vi.mocked(useLineageModule.useDatabaseLineage).mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        error: new Error(errorMessage),
        isSuccess: false,
        fetchNextPage: vi.fn(),
        hasNextPage: false,
        isFetchingNextPage: false,
      } as unknown as ReturnType<typeof useLineageModule.useDatabaseLineage>);

      render(<DatabaseLineageGraph databaseName="demo_user" />);

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(/Failed to load lineage/)).toBeInTheDocument();
      expect(screen.getByText(/Database not found/)).toBeInTheDocument();
    });
  });

  describe('TC-DB-LINEAGE-003: Successful Render', () => {
    it('renders ReactFlow component when data is loaded', async () => {
      vi.mocked(useLineageModule.useDatabaseLineage).mockReturnValue({
        data: mockDatabaseLineageData,
        isLoading: false,
        isError: false,
        error: null,
        isSuccess: true,
        fetchNextPage: vi.fn(),
        hasNextPage: false,
        isFetchingNextPage: false,
      } as unknown as ReturnType<typeof useLineageModule.useDatabaseLineage>);

      render(<DatabaseLineageGraph databaseName="demo_user" />);

      await waitFor(() => {
        expect(screen.getByTestId('react-flow')).toBeInTheDocument();
      });
    });

    it('displays database name in header', async () => {
      vi.mocked(useLineageModule.useDatabaseLineage).mockReturnValue({
        data: mockDatabaseLineageData,
        isLoading: false,
        isError: false,
        error: null,
        isSuccess: true,
        fetchNextPage: vi.fn(),
        hasNextPage: false,
        isFetchingNextPage: false,
      } as unknown as ReturnType<typeof useLineageModule.useDatabaseLineage>);

      render(<DatabaseLineageGraph databaseName="demo_user" />);

      await waitFor(() => {
        expect(screen.getByText(/Database: demo_user/)).toBeInTheDocument();
      });
    });
  });

  describe('TC-DB-LINEAGE-004: Pagination', () => {
    it('shows load more button when hasNextPage is true', async () => {
      vi.mocked(useLineageModule.useDatabaseLineage).mockReturnValue({
        data: mockDatabaseLineageData,
        isLoading: false,
        isError: false,
        error: null,
        isSuccess: true,
        fetchNextPage: vi.fn(),
        hasNextPage: true,
        isFetchingNextPage: false,
      } as unknown as ReturnType<typeof useLineageModule.useDatabaseLineage>);

      render(<DatabaseLineageGraph databaseName="demo_user" />);

      await waitFor(() => {
        expect(screen.getByTestId('load-more-btn')).toBeInTheDocument();
      });
    });

    it('does not show load more button when hasNextPage is false', async () => {
      vi.mocked(useLineageModule.useDatabaseLineage).mockReturnValue({
        data: mockDatabaseLineageData,
        isLoading: false,
        isError: false,
        error: null,
        isSuccess: true,
        fetchNextPage: vi.fn(),
        hasNextPage: false,
        isFetchingNextPage: false,
      } as unknown as ReturnType<typeof useLineageModule.useDatabaseLineage>);

      render(<DatabaseLineageGraph databaseName="demo_user" />);

      await waitFor(() => {
        expect(screen.queryByTestId('load-more-btn')).not.toBeInTheDocument();
      });
    });
  });

  describe('TC-DB-LINEAGE-005: Empty State', () => {
    it('displays empty state message when no lineage data', async () => {
      vi.mocked(useLineageModule.useDatabaseLineage).mockReturnValue({
        data: {
          pages: [{
            databaseName: 'demo_user',
            graph: { nodes: [], edges: [] },
            pagination: { page: 1, pageSize: 50, totalTables: 0, totalPages: 0 },
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
      } as unknown as ReturnType<typeof useLineageModule.useDatabaseLineage>);

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

      vi.mocked(useLineageModule.useDatabaseLineage).mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
        error: null,
        isSuccess: false,
        fetchNextPage: vi.fn(),
        hasNextPage: false,
        isFetchingNextPage: false,
      } as unknown as ReturnType<typeof useLineageModule.useDatabaseLineage>);

      render(<DatabaseLineageGraph databaseName="demo_user" />);

      expect(useLineageModule.useDatabaseLineage).toHaveBeenCalledWith('demo_user', {
        direction: 'upstream',
        maxDepth: 5,
        pageSize: 10,
      });
    });
  });
});
