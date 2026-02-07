import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DetailPanel, ColumnDetail, EdgeDetail } from './DetailPanel';
import { useDatasetStatistics, useDatasetDDL } from '../../../api/hooks/useOpenLineage';

// Mock the navigate function from react-router-dom
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock API hooks for Statistics and DDL tabs
vi.mock('../../../api/hooks/useOpenLineage', () => ({
  useDatasetStatistics: vi.fn(() => ({
    data: undefined,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  })),
  useDatasetDDL: vi.fn(() => ({
    data: undefined,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  })),
}));

// Mock prism-react-renderer used by DDLTab
vi.mock('prism-react-renderer', () => ({
  Highlight: ({ children, code }: any) =>
    children({
      className: '',
      style: {},
      tokens: [[{ content: code, types: ['plain'] }]],
      getLineProps: ({ line }: any) => ({ className: '' }),
      getTokenProps: ({ token }: any) => ({ children: token.content }),
    }),
  themes: { vsDark: {} },
}));

const mockUseDatasetStatistics = vi.mocked(useDatasetStatistics);
const mockUseDatasetDDL = vi.mocked(useDatasetDDL);

// Wrap DetailPanel in Router and QueryClient since sub-components use useNavigate and useQuery
function renderDetailPanel(props: React.ComponentProps<typeof DetailPanel>) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <DetailPanel {...props} />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('DetailPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseDatasetStatistics.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as any);
    mockUseDatasetDDL.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as any);
  });

  const mockColumnDetail: ColumnDetail = {
    id: 'col-1',
    databaseName: 'sales_db',
    tableName: 'customers',
    columnName: 'customer_id',
    dataType: 'INTEGER',
    nullable: false,
    isPrimaryKey: true,
    description: 'Unique customer identifier',
    upstreamCount: 3,
    downstreamCount: 5,
  };

  const mockEdgeDetail: EdgeDetail = {
    id: 'edge-1',
    sourceColumn: 'sales_db.customers.customer_id',
    targetColumn: 'analytics_db.customer_summary.cust_id',
    transformationType: 'DIRECT',
    confidenceScore: 0.95,
    transformationSql: 'SELECT customer_id FROM customers',
  };

  describe('TC-COMP-016: Panel visibility', () => {
    it('renders visible when isOpen is true', () => {
      renderDetailPanel({
        isOpen: true,
        onClose: () => {},
        selectedColumns: [mockColumnDetail],
      });

      const panel = screen.getByTestId('detail-panel');
      expect(panel).toBeInTheDocument();
      expect(panel).toHaveClass('translate-x-0');
      expect(panel).not.toHaveClass('translate-x-full');
    });

    it('is hidden off-screen when isOpen is false', () => {
      renderDetailPanel({
        isOpen: false,
        onClose: () => {},
        selectedColumns: [mockColumnDetail],
      });

      const panel = screen.getByTestId('detail-panel');
      expect(panel).toBeInTheDocument();
      expect(panel).toHaveAttribute('aria-hidden', 'true');
      expect(panel.className).toContain('translate-x-full');
    });
  });

  describe('TC-COMP-016b: Animation classes', () => {
    it('has transition classes for slide animation', () => {
      renderDetailPanel({
        isOpen: true,
        onClose: () => {},
        selectedColumns: [mockColumnDetail],
      });

      const panel = screen.getByTestId('detail-panel');
      expect(panel).toHaveClass('transition-transform');
      expect(panel).toHaveClass('duration-300');
      expect(panel).toHaveClass('ease-out');
    });

    it('has reduced motion support', () => {
      renderDetailPanel({
        isOpen: true,
        onClose: () => {},
        selectedColumns: [mockColumnDetail],
      });

      const panel = screen.getByTestId('detail-panel');
      expect(panel.className).toContain('motion-reduce');
    });
  });

  describe('TC-COMP-017: Column details display', () => {
    it('displays selection breadcrumb with database and table names', () => {
      renderDetailPanel({
        isOpen: true,
        onClose: () => {},
        selectedColumns: [mockColumnDetail],
      });

      // Breadcrumb renders database and table as separate segments
      const breadcrumb = screen.getByLabelText('Selection hierarchy');
      expect(breadcrumb).toBeInTheDocument();
      expect(screen.getByText('sales_db')).toBeInTheDocument();
      expect(screen.getByText('customers')).toBeInTheDocument();
    });

    it('displays selected column name', () => {
      renderDetailPanel({
        isOpen: true,
        onClose: () => {},
        selectedColumns: [mockColumnDetail],
      });

      // Column name appears as clickable link in ColumnsTab
      expect(screen.getByTitle('View lineage for customer_id')).toBeInTheDocument();
    });

    it('displays column metadata', () => {
      renderDetailPanel({
        isOpen: true,
        onClose: () => {},
        selectedColumns: [mockColumnDetail],
      });

      expect(screen.getByText('INTEGER')).toBeInTheDocument();
      expect(screen.getByText('Unique customer identifier')).toBeInTheDocument();
    });

    it('displays lineage statistics', () => {
      renderDetailPanel({
        isOpen: true,
        onClose: () => {},
        selectedColumns: [mockColumnDetail],
      });

      expect(screen.getByText('3 upstream, 5 downstream')).toBeInTheDocument();
    });

    it('shows tab bar with Columns, Statistics, and DDL tabs', () => {
      renderDetailPanel({
        isOpen: true,
        onClose: () => {},
        selectedColumns: [mockColumnDetail],
      });

      expect(screen.getByRole('tablist')).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /columns/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /statistics/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /ddl/i })).toBeInTheDocument();
    });
  });

  describe('TC-COMP-018: Edge details display', () => {
    it('displays source and target columns', () => {
      renderDetailPanel({
        isOpen: true,
        onClose: () => {},
        selectedEdge: mockEdgeDetail,
      });

      expect(
        screen.getByText('sales_db.customers.customer_id')
      ).toBeInTheDocument();
      expect(
        screen.getByText('analytics_db.customer_summary.cust_id')
      ).toBeInTheDocument();
    });

    it('displays transformation type', () => {
      renderDetailPanel({
        isOpen: true,
        onClose: () => {},
        selectedEdge: mockEdgeDetail,
      });

      expect(screen.getByText('DIRECT')).toBeInTheDocument();
    });

    it('displays confidence score', () => {
      renderDetailPanel({
        isOpen: true,
        onClose: () => {},
        selectedEdge: mockEdgeDetail,
      });

      expect(screen.getByText('95%')).toBeInTheDocument();
    });

    it('displays transformation SQL', () => {
      renderDetailPanel({
        isOpen: true,
        onClose: () => {},
        selectedEdge: mockEdgeDetail,
      });

      expect(
        screen.getByText('SELECT customer_id FROM customers')
      ).toBeInTheDocument();
    });

    it('does not show tab bar for edges', () => {
      renderDetailPanel({
        isOpen: true,
        onClose: () => {},
        selectedEdge: mockEdgeDetail,
      });

      expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    });
  });

  describe('TC-COMP-019: Panel interactions', () => {
    it('calls onClose when close button is clicked', () => {
      const onClose = vi.fn();
      renderDetailPanel({
        isOpen: true,
        onClose,
        selectedColumns: [mockColumnDetail],
      });

      fireEvent.click(screen.getByLabelText('Close panel'));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('calls onViewFullLineage when button is clicked', () => {
      const onViewFullLineage = vi.fn();
      renderDetailPanel({
        isOpen: true,
        onClose: () => {},
        selectedColumns: [mockColumnDetail],
        onViewFullLineage,
      });

      fireEvent.click(screen.getByText('View Full Lineage'));
      expect(onViewFullLineage).toHaveBeenCalledWith('col-1');
    });

    it('calls onViewImpactAnalysis when button is clicked', () => {
      const onViewImpactAnalysis = vi.fn();
      renderDetailPanel({
        isOpen: true,
        onClose: () => {},
        selectedColumns: [mockColumnDetail],
        onViewImpactAnalysis,
      });

      fireEvent.click(screen.getByText('Impact Analysis'));
      expect(onViewImpactAnalysis).toHaveBeenCalledWith('col-1');
    });

    it('switches tabs when tab buttons are clicked', () => {
      renderDetailPanel({
        isOpen: true,
        onClose: () => {},
        selectedColumns: [mockColumnDetail],
      });

      // Columns tab is active by default
      const columnsTab = screen.getByRole('tab', { name: /columns/i });
      expect(columnsTab).toHaveAttribute('aria-selected', 'true');

      // Click Statistics tab
      const statsTab = screen.getByRole('tab', { name: /statistics/i });
      fireEvent.click(statsTab);
      expect(statsTab).toHaveAttribute('aria-selected', 'true');
      expect(columnsTab).toHaveAttribute('aria-selected', 'false');
    });
  });

  describe('TC-COMP-020: Accessibility', () => {
    it('has correct dialog role', () => {
      renderDetailPanel({
        isOpen: true,
        onClose: () => {},
        selectedColumns: [mockColumnDetail],
      });

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('has appropriate aria-label for column details', () => {
      renderDetailPanel({
        isOpen: true,
        onClose: () => {},
        selectedColumns: [mockColumnDetail],
      });

      expect(screen.getByRole('dialog')).toHaveAttribute(
        'aria-label',
        'Column details'
      );
    });

    it('has aria-hidden true when closed', () => {
      renderDetailPanel({
        isOpen: false,
        onClose: () => {},
        selectedColumns: [mockColumnDetail],
      });

      const panel = screen.getByTestId('detail-panel');
      expect(panel).toHaveAttribute('aria-hidden', 'true');
    });

    it('has aria-hidden false when open', () => {
      renderDetailPanel({
        isOpen: true,
        onClose: () => {},
        selectedColumns: [mockColumnDetail],
      });

      const panel = screen.getByTestId('detail-panel');
      expect(panel).toHaveAttribute('aria-hidden', 'false');
    });

    it('has appropriate aria-label for edge details', () => {
      renderDetailPanel({
        isOpen: true,
        onClose: () => {},
        selectedEdge: mockEdgeDetail,
      });

      expect(screen.getByRole('dialog')).toHaveAttribute(
        'aria-label',
        'Edge details'
      );
    });

    it('has accessible tab structure with ARIA roles', () => {
      renderDetailPanel({
        isOpen: true,
        onClose: () => {},
        selectedColumns: [mockColumnDetail],
      });

      const tablist = screen.getByRole('tablist');
      expect(tablist).toHaveAttribute('aria-label', 'Detail panel tabs');

      const tabs = screen.getAllByRole('tab');
      expect(tabs).toHaveLength(3);

      // Active tab should have tabpanel
      expect(screen.getByRole('tabpanel')).toBeInTheDocument();
    });
  });

  describe('TC-COMP-021: Empty state', () => {
    it('shows message when no item is selected', () => {
      renderDetailPanel({ isOpen: true, onClose: () => {} });

      expect(screen.getByText('No item selected')).toBeInTheDocument();
    });
  });

  describe('TC-PANEL-01: Tab switching', () => {
    it('defaults to Columns tab when panel opens with selectedColumn', () => {
      renderDetailPanel({
        isOpen: true,
        onClose: () => {},
        selectedColumns: [mockColumnDetail],
      });

      const columnsTab = screen.getByRole('tab', { name: /columns/i });
      expect(columnsTab).toHaveAttribute('aria-selected', 'true');
      // Columns tab content is visible (column name link)
      expect(screen.getByTitle('View lineage for customer_id')).toBeInTheDocument();
    });

    it('shows Statistics tab content when clicked', () => {
      mockUseDatasetStatistics.mockReturnValue({
        data: {
          datasetId: 'col',
          databaseName: 'sales_db',
          tableName: 'customers',
          sourceType: 'TABLE',
          creatorName: 'admin',
          createTimestamp: '2024-01-15T10:00:00Z',
          lastAlterTimestamp: '2024-06-01T14:30:00Z',
          rowCount: 500,
          sizeBytes: 1024,
          tableComment: null,
          columnComments: null,
        },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any);

      renderDetailPanel({
        isOpen: true,
        onClose: () => {},
        selectedColumns: [mockColumnDetail],
      });

      fireEvent.click(screen.getByRole('tab', { name: /statistics/i }));
      expect(screen.getByText('TABLE')).toBeInTheDocument();
    });

    it('shows DDL tab content when clicked', () => {
      mockUseDatasetDDL.mockReturnValue({
        data: {
          datasetId: 'ns1/analytics_db.customer_summary',
          databaseName: 'analytics_db',
          tableName: 'customer_summary',
          sourceType: 'VIEW',
          viewSql: 'SELECT 1 FROM test',
          truncated: false,
          tableComment: null,
          columnComments: null,
        },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any);

      renderDetailPanel({
        isOpen: true,
        onClose: () => {},
        selectedColumns: [mockColumnDetail],
      });

      fireEvent.click(screen.getByRole('tab', { name: /ddl/i }));
      expect(screen.getByText('View Definition')).toBeInTheDocument();
    });

    it('returns to Columns content when switching back', () => {
      renderDetailPanel({
        isOpen: true,
        onClose: () => {},
        selectedColumns: [mockColumnDetail],
      });

      // Switch to Statistics then back
      fireEvent.click(screen.getByRole('tab', { name: /statistics/i }));
      fireEvent.click(screen.getByRole('tab', { name: /columns/i }));

      expect(screen.getByRole('tab', { name: /columns/i })).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByTitle('View lineage for customer_id')).toBeInTheDocument();
    });

    it('has correct ARIA attributes on tabs', () => {
      renderDetailPanel({
        isOpen: true,
        onClose: () => {},
        selectedColumns: [mockColumnDetail],
      });

      const tabs = screen.getAllByRole('tab');
      // Each tab has role="tab"
      tabs.forEach((tab) => {
        expect(tab).toHaveAttribute('role', 'tab');
      });

      // Active tab has aria-selected=true, inactive have false
      expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
      expect(tabs[1]).toHaveAttribute('aria-selected', 'false');
      expect(tabs[2]).toHaveAttribute('aria-selected', 'false');

      // Each tab has aria-controls pointing to a tabpanel id
      expect(tabs[0]).toHaveAttribute('aria-controls', 'tabpanel-columns');
      expect(tabs[1]).toHaveAttribute('aria-controls', 'tabpanel-statistics');
      expect(tabs[2]).toHaveAttribute('aria-controls', 'tabpanel-ddl');
    });

    it('has role="tabpanel" on active tab panel', () => {
      renderDetailPanel({
        isOpen: true,
        onClose: () => {},
        selectedColumns: [mockColumnDetail],
      });

      const tabpanel = screen.getByRole('tabpanel');
      expect(tabpanel).toHaveAttribute('id', 'tabpanel-columns');
      expect(tabpanel).toHaveAttribute('aria-labelledby', 'tab-columns');
    });

    it('does not show tabs for edge details', () => {
      renderDetailPanel({
        isOpen: true,
        onClose: () => {},
        selectedEdge: mockEdgeDetail,
      });

      expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
      expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    });
  });

  describe('TC-PANEL-02: Statistics tab content', () => {
    it('displays statistics data when available', () => {
      mockUseDatasetStatistics.mockReturnValue({
        data: {
          datasetId: 'ns1/sales_db.customers',
          databaseName: 'sales_db',
          tableName: 'customers',
          sourceType: 'TABLE',
          creatorName: 'admin',
          createTimestamp: '2024-01-15T10:00:00Z',
          lastAlterTimestamp: '2024-06-01T14:30:00Z',
          rowCount: 1500000,
          sizeBytes: 52428800,
          tableComment: 'Main customer table',
          columnComments: null,
        },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any);

      renderDetailPanel({
        isOpen: true,
        onClose: () => {},
        selectedColumns: [mockColumnDetail],
      });

      fireEvent.click(screen.getByRole('tab', { name: /statistics/i }));

      expect(screen.getByText('TABLE')).toBeInTheDocument();
      expect(screen.getByText('admin')).toBeInTheDocument();
      expect(screen.getByText('1,500,000')).toBeInTheDocument();
      expect(screen.getByText('Main customer table')).toBeInTheDocument();
    });

    it('displays formatted size for tables', () => {
      mockUseDatasetStatistics.mockReturnValue({
        data: {
          datasetId: 'ns1/sales_db.customers',
          databaseName: 'sales_db',
          tableName: 'customers',
          sourceType: 'TABLE',
          creatorName: 'admin',
          createTimestamp: '2024-01-15T10:00:00Z',
          lastAlterTimestamp: null,
          rowCount: 100,
          sizeBytes: 52428800,
          tableComment: null,
          columnComments: null,
        },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any);

      renderDetailPanel({
        isOpen: true,
        onClose: () => {},
        selectedColumns: [mockColumnDetail],
      });

      fireEvent.click(screen.getByRole('tab', { name: /statistics/i }));

      // 52428800 bytes = 50.0 MB
      expect(screen.getByText('50.0 MB')).toBeInTheDocument();
    });
  });

  describe('TC-PANEL-03: DDL tab content', () => {
    it('displays view SQL when available', () => {
      mockUseDatasetDDL.mockReturnValue({
        data: {
          datasetId: 'ns1/analytics_db.customer_summary',
          databaseName: 'analytics_db',
          tableName: 'customer_summary',
          sourceType: 'VIEW',
          viewSql: 'SELECT customer_id, name FROM customers WHERE active = 1',
          truncated: false,
          tableComment: 'Customer summary view',
          columnComments: { customer_id: 'Unique identifier' },
        },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any);

      renderDetailPanel({
        isOpen: true,
        onClose: () => {},
        selectedColumns: [mockColumnDetail],
      });

      fireEvent.click(screen.getByRole('tab', { name: /ddl/i }));

      expect(screen.getByText('View Definition')).toBeInTheDocument();
      expect(screen.getByText('Customer summary view')).toBeInTheDocument();
      expect(screen.getByText('Unique identifier')).toBeInTheDocument();
    });

    it('shows truncation warning when SQL is truncated', () => {
      mockUseDatasetDDL.mockReturnValue({
        data: {
          datasetId: 'ns1/analytics_db.customer_summary',
          databaseName: 'analytics_db',
          tableName: 'customer_summary',
          sourceType: 'VIEW',
          viewSql: 'SELECT 1',
          truncated: true,
          tableComment: null,
          columnComments: null,
        },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any);

      renderDetailPanel({
        isOpen: true,
        onClose: () => {},
        selectedColumns: [mockColumnDetail],
      });

      fireEvent.click(screen.getByRole('tab', { name: /ddl/i }));

      expect(screen.getByText(/truncated/i)).toBeInTheDocument();
    });

    it('shows message for table type (no DDL available)', () => {
      mockUseDatasetDDL.mockReturnValue({
        data: {
          datasetId: 'ns1/sales_db.customers',
          databaseName: 'sales_db',
          tableName: 'customers',
          sourceType: 'TABLE',
          viewSql: null,
          tableDdl: null,
          truncated: false,
          tableComment: null,
          columnComments: null,
        },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any);

      renderDetailPanel({
        isOpen: true,
        onClose: () => {},
        selectedColumns: [mockColumnDetail],
      });

      fireEvent.click(screen.getByRole('tab', { name: /ddl/i }));

      expect(screen.getByText(/No DDL available/i)).toBeInTheDocument();
    });

    it('shows table DDL with syntax highlighting for table type', () => {
      mockUseDatasetDDL.mockReturnValue({
        data: {
          datasetId: 'ns1/demo_user.SRC_CUSTOMERS',
          databaseName: 'demo_user',
          tableName: 'SRC_CUSTOMERS',
          sourceType: 'TABLE',
          tableDdl: 'CREATE TABLE demo_user.SRC_CUSTOMERS (id INTEGER, name VARCHAR(100))',
          truncated: false,
          columnComments: {},
        },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any);

      renderDetailPanel({
        isOpen: true,
        onClose: () => {},
        selectedColumns: [mockColumnDetail],
      });

      fireEvent.click(screen.getByRole('tab', { name: /ddl/i }));

      expect(screen.getByText('Table Definition')).toBeInTheDocument();
      expect(screen.getByLabelText('Copy DDL')).toBeInTheDocument();
    });
  });

  describe('TC-PANEL-04: Loading states', () => {
    it('shows loading indicator in Statistics tab', () => {
      mockUseDatasetStatistics.mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
        refetch: vi.fn(),
      } as any);

      renderDetailPanel({
        isOpen: true,
        onClose: () => {},
        selectedColumns: [mockColumnDetail],
      });

      fireEvent.click(screen.getByRole('tab', { name: /statistics/i }));

      expect(screen.getByText('Loading statistics...')).toBeInTheDocument();
      expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('shows loading indicator in DDL tab', () => {
      mockUseDatasetDDL.mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
        refetch: vi.fn(),
      } as any);

      renderDetailPanel({
        isOpen: true,
        onClose: () => {},
        selectedColumns: [mockColumnDetail],
      });

      fireEvent.click(screen.getByRole('tab', { name: /ddl/i }));

      expect(screen.getByText('Loading DDL...')).toBeInTheDocument();
      expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('does not show loading in Columns tab (uses local data)', () => {
      renderDetailPanel({
        isOpen: true,
        onClose: () => {},
        selectedColumns: [mockColumnDetail],
      });

      // Columns tab is active by default and should show content immediately
      expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      expect(screen.getByTitle('View lineage for customer_id')).toBeInTheDocument();
    });
  });

  describe('TC-PANEL-05: Error states', () => {
    it('shows error message in Statistics tab', () => {
      mockUseDatasetStatistics.mockReturnValue({
        data: undefined,
        isLoading: false,
        error: new Error('Network error'),
        refetch: vi.fn(),
      } as any);

      renderDetailPanel({
        isOpen: true,
        onClose: () => {},
        selectedColumns: [mockColumnDetail],
      });

      fireEvent.click(screen.getByRole('tab', { name: /statistics/i }));

      expect(screen.getByText('Failed to load statistics')).toBeInTheDocument();
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });

    it('shows Retry button in Statistics tab error state', () => {
      const mockRefetch = vi.fn();
      mockUseDatasetStatistics.mockReturnValue({
        data: undefined,
        isLoading: false,
        error: new Error('Network error'),
        refetch: mockRefetch,
      } as any);

      renderDetailPanel({
        isOpen: true,
        onClose: () => {},
        selectedColumns: [mockColumnDetail],
      });

      fireEvent.click(screen.getByRole('tab', { name: /statistics/i }));

      const retryButton = screen.getByText('Retry');
      expect(retryButton).toBeInTheDocument();
      fireEvent.click(retryButton);
      expect(mockRefetch).toHaveBeenCalledTimes(1);
    });

    it('shows error message in DDL tab', () => {
      mockUseDatasetDDL.mockReturnValue({
        data: undefined,
        isLoading: false,
        error: new Error('Server error'),
        refetch: vi.fn(),
      } as any);

      renderDetailPanel({
        isOpen: true,
        onClose: () => {},
        selectedColumns: [mockColumnDetail],
      });

      fireEvent.click(screen.getByRole('tab', { name: /ddl/i }));

      expect(screen.getByText('Failed to load DDL')).toBeInTheDocument();
      expect(screen.getByText('Server error')).toBeInTheDocument();
    });

    it('shows Retry button in DDL tab error state', () => {
      const mockRefetch = vi.fn();
      mockUseDatasetDDL.mockReturnValue({
        data: undefined,
        isLoading: false,
        error: new Error('Server error'),
        refetch: mockRefetch,
      } as any);

      renderDetailPanel({
        isOpen: true,
        onClose: () => {},
        selectedColumns: [mockColumnDetail],
      });

      fireEvent.click(screen.getByRole('tab', { name: /ddl/i }));

      const retryButton = screen.getByText('Retry');
      expect(retryButton).toBeInTheDocument();
      fireEvent.click(retryButton);
      expect(mockRefetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('TC-PANEL-06: Column click navigation', () => {
    it('navigates to lineage page when column name is clicked', () => {
      renderDetailPanel({
        isOpen: true,
        onClose: () => {},
        selectedColumns: [mockColumnDetail],
        datasetId: 'ns1/sales_db.customers',
      });

      const columnLink = screen.getByTitle('View lineage for customer_id');
      fireEvent.click(columnLink);

      expect(mockNavigate).toHaveBeenCalledWith(
        `/lineage/${encodeURIComponent('ns1/sales_db.customers')}/${encodeURIComponent('customer_id')}`
      );
    });

    it('computes datasetId from column id when datasetId prop not provided', () => {
      // Column id is 'col-1', which will be split at last '.' to get dataset
      // The effectiveDatasetId logic: selectedColumn.id.substring(0, selectedColumn.id.lastIndexOf('.'))
      // 'col-1' has no '.', so lastIndexOf('.') returns -1, substring(0, -1) returns empty string
      // Let's use a more realistic id with dots
      const columnWithDottedId: ColumnDetail = {
        ...mockColumnDetail,
        id: 'ns1/sales_db.customers.customer_id',
      };

      renderDetailPanel({
        isOpen: true,
        onClose: () => {},
        selectedColumns: [columnWithDottedId],
      });

      const columnLink = screen.getByTitle('View lineage for customer_id');
      fireEvent.click(columnLink);

      // effectiveDatasetId should be 'ns1/sales_db.customers' (everything before last '.')
      expect(mockNavigate).toHaveBeenCalledWith(
        `/lineage/${encodeURIComponent('ns1/sales_db.customers')}/${encodeURIComponent('customer_id')}`
      );
    });
  });

  describe('TC-PANEL-07: Tab state resets on selection change', () => {
    it('resets to Columns tab when selectedColumn changes', () => {
      const { rerender } = renderDetailPanel({
        isOpen: true,
        onClose: () => {},
        selectedColumns: [mockColumnDetail],
      });

      // Switch to Statistics tab
      fireEvent.click(screen.getByRole('tab', { name: /statistics/i }));
      expect(screen.getByRole('tab', { name: /statistics/i })).toHaveAttribute('aria-selected', 'true');

      // Change selected column (new id triggers useEffect reset)
      const newColumn: ColumnDetail = {
        ...mockColumnDetail,
        id: 'col-2',
        columnName: 'email',
      };

      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
      rerender(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <DetailPanel
              isOpen={true}
              onClose={() => {}}
              selectedColumn={newColumn}
            />
          </MemoryRouter>
        </QueryClientProvider>
      );

      // Tab should have reset to Columns
      expect(screen.getByRole('tab', { name: /columns/i })).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByRole('tab', { name: /statistics/i })).toHaveAttribute('aria-selected', 'false');
    });
  });

  describe('TC-PANEL-08: Independent scroll behavior', () => {
    it('tab panel has overflow-y-auto class for independent scrolling', () => {
      renderDetailPanel({
        isOpen: true,
        onClose: () => {},
        selectedColumns: [mockColumnDetail],
      });

      const tabpanel = screen.getByRole('tabpanel');
      expect(tabpanel).toHaveClass('overflow-y-auto');
    });

    it('tab panel maintains scroll class when switching tabs', () => {
      mockUseDatasetStatistics.mockReturnValue({
        data: {
          datasetId: 'ns1/sales_db.customers',
          databaseName: 'sales_db',
          tableName: 'customers',
          sourceType: 'TABLE',
          creatorName: 'admin',
          createTimestamp: null,
          lastAlterTimestamp: null,
          rowCount: 100,
          sizeBytes: null,
          tableComment: null,
          columnComments: null,
        },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any);

      renderDetailPanel({
        isOpen: true,
        onClose: () => {},
        selectedColumns: [mockColumnDetail],
      });

      // Switch to Statistics tab
      fireEvent.click(screen.getByRole('tab', { name: /statistics/i }));

      const tabpanel = screen.getByRole('tabpanel');
      expect(tabpanel).toHaveClass('overflow-y-auto');
    });
  });
});
