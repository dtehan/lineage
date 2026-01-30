import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '../../../test/test-utils';
import { AssetBrowser } from './AssetBrowser';
import * as useAssetsModule from '../../../api/hooks/useAssets';
import * as useLineageStoreModule from '../../../stores/useLineageStore';

vi.mock('../../../api/hooks/useAssets');
vi.mock('../../../stores/useLineageStore');

const mockDatabases = [
  { id: 'db-1', name: 'sales_db' },
  { id: 'db-2', name: 'analytics_db' },
];

const mockTables = [
  { id: 'tbl-1', databaseName: 'sales_db', tableName: 'orders', tableKind: 'T' },
  { id: 'tbl-2', databaseName: 'sales_db', tableName: 'customers', tableKind: 'T' },
];

const mockTablesWithViews = [
  { id: 'tbl-1', databaseName: 'sales_db', tableName: 'orders', tableKind: 'T' },
  { id: 'view-1', databaseName: 'sales_db', tableName: 'customer_view', tableKind: 'V' },
  { id: 'mat-view-1', databaseName: 'sales_db', tableName: 'sales_summary', tableKind: 'M' },
];

const mockColumns = [
  { id: 'col-1', databaseName: 'sales_db', tableName: 'orders', columnName: 'order_id', columnType: 'INTEGER', nullable: false, columnPosition: 1 },
  { id: 'col-2', databaseName: 'sales_db', tableName: 'orders', columnName: 'customer_id', columnType: 'INTEGER', nullable: false, columnPosition: 2 },
];

// Helper to wrap data in PaginatedResult format
const wrapInPaginatedResult = <T,>(data: T[] | undefined) => ({
  data: data,
  pagination: undefined,
});

describe('AssetBrowser Component', () => {
  const mockSetSelectedAssetId = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(useLineageStoreModule.useLineageStore).mockReturnValue({
      setSelectedAssetId: mockSetSelectedAssetId,
      selectedAssetId: null,
      nodes: [],
      edges: [],
      setGraph: vi.fn(),
      maxDepth: 5,
      setMaxDepth: vi.fn(),
      direction: 'both',
      setDirection: vi.fn(),
      highlightedNodeIds: new Set(),
      setHighlightedNodeIds: vi.fn(),
      expandedTables: new Set(),
      toggleTableExpanded: vi.fn(),
    });
  });

  // TC-COMP-001: AssetBrowser Initial Render
  describe('TC-COMP-001: Initial Render', () => {
    it('displays loading spinner when loading', () => {
      vi.mocked(useAssetsModule.useDatabases).mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
        error: null,
        isSuccess: false,
      } as ReturnType<typeof useAssetsModule.useDatabases>);

      render(<AssetBrowser />);

      expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument();
    });

    it('displays database list after loading', async () => {
      vi.mocked(useAssetsModule.useDatabases).mockReturnValue({
        data: wrapInPaginatedResult(mockDatabases),
        isLoading: false,
        isError: false,
        error: null,
        isSuccess: true,
      } as ReturnType<typeof useAssetsModule.useDatabases>);

      vi.mocked(useAssetsModule.useTables).mockReturnValue({
        data: wrapInPaginatedResult(undefined),
        isLoading: false,
        isError: false,
        error: null,
        isSuccess: false,
      } as ReturnType<typeof useAssetsModule.useTables>);

      render(<AssetBrowser />);

      expect(screen.getByText('Databases')).toBeInTheDocument();
      expect(screen.getByText('sales_db')).toBeInTheDocument();
      expect(screen.getByText('analytics_db')).toBeInTheDocument();
    });
  });

  // TC-COMP-002: AssetBrowser Database Expansion
  describe('TC-COMP-002: Database Expansion', () => {
    it('expands database to show tables when clicked', async () => {
      const user = userEvent.setup();

      vi.mocked(useAssetsModule.useDatabases).mockReturnValue({
        data: wrapInPaginatedResult(mockDatabases),
        isLoading: false,
        isError: false,
        error: null,
        isSuccess: true,
      } as ReturnType<typeof useAssetsModule.useDatabases>);

      vi.mocked(useAssetsModule.useTables).mockReturnValue({
        data: wrapInPaginatedResult(mockTables),
        isLoading: false,
        isError: false,
        error: null,
        isSuccess: true,
      } as ReturnType<typeof useAssetsModule.useTables>);

      vi.mocked(useAssetsModule.useColumns).mockReturnValue({
        data: wrapInPaginatedResult(undefined),
        isLoading: false,
        isError: false,
        error: null,
        isSuccess: false,
      } as ReturnType<typeof useAssetsModule.useColumns>);

      render(<AssetBrowser />);

      // Click to expand database
      await user.click(screen.getByText('sales_db'));

      // Tables should be visible
      await waitFor(() => {
        expect(screen.getByText('orders')).toBeInTheDocument();
        expect(screen.getByText('customers')).toBeInTheDocument();
      });
    });

    it('collapses database when clicked again', async () => {
      const user = userEvent.setup();

      vi.mocked(useAssetsModule.useDatabases).mockReturnValue({
        data: wrapInPaginatedResult(mockDatabases),
        isLoading: false,
        isError: false,
        error: null,
        isSuccess: true,
      } as ReturnType<typeof useAssetsModule.useDatabases>);

      vi.mocked(useAssetsModule.useTables).mockReturnValue({
        data: wrapInPaginatedResult(mockTables),
        isLoading: false,
        isError: false,
        error: null,
        isSuccess: true,
      } as ReturnType<typeof useAssetsModule.useTables>);

      vi.mocked(useAssetsModule.useColumns).mockReturnValue({
        data: wrapInPaginatedResult(undefined),
        isLoading: false,
        isError: false,
        error: null,
        isSuccess: false,
      } as ReturnType<typeof useAssetsModule.useColumns>);

      render(<AssetBrowser />);

      // Expand
      await user.click(screen.getByText('sales_db'));

      await waitFor(() => {
        expect(screen.getByText('orders')).toBeInTheDocument();
      });

      // Collapse
      await user.click(screen.getByText('sales_db'));

      await waitFor(() => {
        expect(screen.queryByText('orders')).not.toBeInTheDocument();
      });
    });
  });

  // TC-COMP-003: AssetBrowser Table Expansion
  describe('TC-COMP-003: Table Expansion', () => {
    it('expands table to show columns when clicked', async () => {
      const user = userEvent.setup();

      vi.mocked(useAssetsModule.useDatabases).mockReturnValue({
        data: wrapInPaginatedResult(mockDatabases),
        isLoading: false,
        isError: false,
        error: null,
        isSuccess: true,
      } as ReturnType<typeof useAssetsModule.useDatabases>);

      vi.mocked(useAssetsModule.useTables).mockReturnValue({
        data: wrapInPaginatedResult(mockTables),
        isLoading: false,
        isError: false,
        error: null,
        isSuccess: true,
      } as ReturnType<typeof useAssetsModule.useTables>);

      vi.mocked(useAssetsModule.useColumns).mockReturnValue({
        data: wrapInPaginatedResult(mockColumns),
        isLoading: false,
        isError: false,
        error: null,
        isSuccess: true,
      } as ReturnType<typeof useAssetsModule.useColumns>);

      render(<AssetBrowser />);

      // Expand database first
      await user.click(screen.getByText('sales_db'));

      await waitFor(() => {
        expect(screen.getByText('orders')).toBeInTheDocument();
      });

      // Expand table by clicking the expand button (chevron)
      const expandTableButtons = screen.getAllByRole('button', { name: /expand table/i });
      await user.click(expandTableButtons[0]); // Click first table's expand button

      // Columns should be visible with type information
      await waitFor(() => {
        expect(screen.getByText('order_id')).toBeInTheDocument();
        expect(screen.getByText('customer_id')).toBeInTheDocument();
        expect(screen.getAllByText('INTEGER').length).toBeGreaterThan(0);
      });
    });
  });

  // TC-COMP-004: AssetBrowser Column Selection
  describe('TC-COMP-004: Column Selection', () => {
    it('calls setSelectedAssetId when column is clicked', async () => {
      const user = userEvent.setup();

      vi.mocked(useAssetsModule.useDatabases).mockReturnValue({
        data: wrapInPaginatedResult(mockDatabases),
        isLoading: false,
        isError: false,
        error: null,
        isSuccess: true,
      } as ReturnType<typeof useAssetsModule.useDatabases>);

      vi.mocked(useAssetsModule.useTables).mockReturnValue({
        data: wrapInPaginatedResult(mockTables),
        isLoading: false,
        isError: false,
        error: null,
        isSuccess: true,
      } as ReturnType<typeof useAssetsModule.useTables>);

      vi.mocked(useAssetsModule.useColumns).mockReturnValue({
        data: wrapInPaginatedResult(mockColumns),
        isLoading: false,
        isError: false,
        error: null,
        isSuccess: true,
      } as ReturnType<typeof useAssetsModule.useColumns>);

      render(<AssetBrowser />);

      // Expand database
      await user.click(screen.getByText('sales_db'));

      await waitFor(() => {
        expect(screen.getByText('orders')).toBeInTheDocument();
      });

      // Expand table by clicking the expand button (chevron)
      const expandTableButtons = screen.getAllByRole('button', { name: /expand table/i });
      await user.click(expandTableButtons[0]); // Click first table's expand button

      await waitFor(() => {
        expect(screen.getByText('order_id')).toBeInTheDocument();
      });

      // Click column
      await user.click(screen.getByText('order_id'));

      expect(mockSetSelectedAssetId).toHaveBeenCalledTimes(1);
      expect(mockSetSelectedAssetId).toHaveBeenCalledWith('col-1');
    });
  });

  // TC-COMP-032a: AssetBrowser View Visual Distinction
  describe('TC-COMP-032a: View Visual Distinction', () => {
    it('displays different icons for tables and views', async () => {
      const user = userEvent.setup();

      vi.mocked(useAssetsModule.useDatabases).mockReturnValue({
        data: wrapInPaginatedResult(mockDatabases),
        isLoading: false,
        isError: false,
        error: null,
        isSuccess: true,
      } as ReturnType<typeof useAssetsModule.useDatabases>);

      vi.mocked(useAssetsModule.useTables).mockReturnValue({
        data: wrapInPaginatedResult(mockTablesWithViews),
        isLoading: false,
        isError: false,
        error: null,
        isSuccess: true,
      } as ReturnType<typeof useAssetsModule.useTables>);

      vi.mocked(useAssetsModule.useColumns).mockReturnValue({
        data: wrapInPaginatedResult(undefined),
        isLoading: false,
        isError: false,
        error: null,
        isSuccess: false,
      } as ReturnType<typeof useAssetsModule.useColumns>);

      render(<AssetBrowser />);

      // Expand database
      await user.click(screen.getByText('sales_db'));

      await waitFor(() => {
        expect(screen.getByText('orders')).toBeInTheDocument();
        expect(screen.getByText('customer_view')).toBeInTheDocument();
        expect(screen.getByText('sales_summary')).toBeInTheDocument();
      });

      // Verify different icons are displayed
      expect(screen.getByTestId('table-icon')).toBeInTheDocument();
      expect(screen.getByTestId('view-icon')).toBeInTheDocument();
      expect(screen.getByTestId('materialized-view-icon')).toBeInTheDocument();
    });

    it('displays table icon for tableKind T', async () => {
      const user = userEvent.setup();

      vi.mocked(useAssetsModule.useDatabases).mockReturnValue({
        data: wrapInPaginatedResult(mockDatabases),
        isLoading: false,
        isError: false,
        error: null,
        isSuccess: true,
      } as ReturnType<typeof useAssetsModule.useDatabases>);

      vi.mocked(useAssetsModule.useTables).mockReturnValue({
        data: wrapInPaginatedResult([{ id: 'tbl-1', databaseName: 'sales_db', tableName: 'orders', tableKind: 'T' }]),
        isLoading: false,
        isError: false,
        error: null,
        isSuccess: true,
      } as ReturnType<typeof useAssetsModule.useTables>);

      vi.mocked(useAssetsModule.useColumns).mockReturnValue({
        data: wrapInPaginatedResult(undefined),
        isLoading: false,
        isError: false,
        error: null,
        isSuccess: false,
      } as ReturnType<typeof useAssetsModule.useColumns>);

      render(<AssetBrowser />);

      await user.click(screen.getByText('sales_db'));

      await waitFor(() => {
        expect(screen.getByTestId('table-icon')).toBeInTheDocument();
      });
    });

    it('displays view icon for tableKind V', async () => {
      const user = userEvent.setup();

      vi.mocked(useAssetsModule.useDatabases).mockReturnValue({
        data: wrapInPaginatedResult(mockDatabases),
        isLoading: false,
        isError: false,
        error: null,
        isSuccess: true,
      } as ReturnType<typeof useAssetsModule.useDatabases>);

      vi.mocked(useAssetsModule.useTables).mockReturnValue({
        data: wrapInPaginatedResult([{ id: 'view-1', databaseName: 'sales_db', tableName: 'my_view', tableKind: 'V' }]),
        isLoading: false,
        isError: false,
        error: null,
        isSuccess: true,
      } as ReturnType<typeof useAssetsModule.useTables>);

      vi.mocked(useAssetsModule.useColumns).mockReturnValue({
        data: wrapInPaginatedResult(undefined),
        isLoading: false,
        isError: false,
        error: null,
        isSuccess: false,
      } as ReturnType<typeof useAssetsModule.useColumns>);

      render(<AssetBrowser />);

      await user.click(screen.getByText('sales_db'));

      await waitFor(() => {
        expect(screen.getByTestId('view-icon')).toBeInTheDocument();
      });
    });

    it('displays materialized view icon for tableKind M', async () => {
      const user = userEvent.setup();

      vi.mocked(useAssetsModule.useDatabases).mockReturnValue({
        data: wrapInPaginatedResult(mockDatabases),
        isLoading: false,
        isError: false,
        error: null,
        isSuccess: true,
      } as ReturnType<typeof useAssetsModule.useDatabases>);

      vi.mocked(useAssetsModule.useTables).mockReturnValue({
        data: wrapInPaginatedResult([{ id: 'mat-1', databaseName: 'sales_db', tableName: 'my_mat_view', tableKind: 'M' }]),
        isLoading: false,
        isError: false,
        error: null,
        isSuccess: true,
      } as ReturnType<typeof useAssetsModule.useTables>);

      vi.mocked(useAssetsModule.useColumns).mockReturnValue({
        data: wrapInPaginatedResult(undefined),
        isLoading: false,
        isError: false,
        error: null,
        isSuccess: false,
      } as ReturnType<typeof useAssetsModule.useColumns>);

      render(<AssetBrowser />);

      await user.click(screen.getByText('sales_db'));

      await waitFor(() => {
        expect(screen.getByTestId('materialized-view-icon')).toBeInTheDocument();
      });
    });
  });
});
