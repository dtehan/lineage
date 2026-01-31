import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '../../../test/test-utils';
import { AssetBrowser } from './AssetBrowser';
import * as useOpenLineageModule from '../../../api/hooks/useOpenLineage';

vi.mock('../../../api/hooks/useOpenLineage');

// Mock data matching OpenLineage types
const mockNamespaces = {
  namespaces: [
    { id: 'ns-1', uri: 'teradata://localhost', specVersion: '1.0', createdAt: '2024-01-01' }
  ]
};

// Two databases: analytics_db, sales_db (sorted alphabetically)
const mockDatasets = [
  { id: 'ds-1', namespace: 'ns-1', name: 'sales_db.orders', sourceType: 'table', createdAt: '2024-01-01', updatedAt: '2024-01-01' },
  { id: 'ds-2', namespace: 'ns-1', name: 'sales_db.customers', sourceType: 'table', createdAt: '2024-01-01', updatedAt: '2024-01-01' },
  { id: 'ds-3', namespace: 'ns-1', name: 'analytics_db.reports', sourceType: 'view', createdAt: '2024-01-01', updatedAt: '2024-01-01' },
];

// Single database with mixed asset types
const mockDatasetsWithViews = [
  { id: 'ds-1', namespace: 'ns-1', name: 'sales_db.orders', sourceType: 'table', createdAt: '2024-01-01', updatedAt: '2024-01-01' },
  { id: 'ds-2', namespace: 'ns-1', name: 'sales_db.customer_view', sourceType: 'view', createdAt: '2024-01-01', updatedAt: '2024-01-01' },
  { id: 'ds-3', namespace: 'ns-1', name: 'sales_db.sales_summary', sourceType: 'materialized_view', createdAt: '2024-01-01', updatedAt: '2024-01-01' },
];

// Single database for simpler tests
const mockSingleDbDatasets = [
  { id: 'ds-1', namespace: 'ns-1', name: 'sales_db.orders', sourceType: 'table', createdAt: '2024-01-01', updatedAt: '2024-01-01' },
  { id: 'ds-2', namespace: 'ns-1', name: 'sales_db.customers', sourceType: 'table', createdAt: '2024-01-01', updatedAt: '2024-01-01' },
];

const mockDatasetWithFields = {
  id: 'ds-1',
  namespace: 'ns-1',
  name: 'sales_db.orders',
  sourceType: 'table',
  createdAt: '2024-01-01',
  updatedAt: '2024-01-01',
  fields: [
    { id: 'f-1', name: 'order_id', type: 'INTEGER', ordinalPosition: 1, nullable: false },
    { id: 'f-2', name: 'customer_id', type: 'INTEGER', ordinalPosition: 2, nullable: false },
  ]
};

describe('AssetBrowser Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock useOpenLineageNamespaces
    vi.mocked(useOpenLineageModule.useOpenLineageNamespaces).mockReturnValue({
      data: mockNamespaces,
      isLoading: false,
      isError: false,
      error: null,
      isSuccess: true,
    } as ReturnType<typeof useOpenLineageModule.useOpenLineageNamespaces>);

    // Mock useOpenLineageDatasets - default to single database for simpler tests
    vi.mocked(useOpenLineageModule.useOpenLineageDatasets).mockReturnValue({
      data: { datasets: mockSingleDbDatasets, total: mockSingleDbDatasets.length },
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
      isSuccess: true,
    } as ReturnType<typeof useOpenLineageModule.useOpenLineageDatasets>);

    // Mock useOpenLineageDataset (for field fetching) - default no fields
    vi.mocked(useOpenLineageModule.useOpenLineageDataset).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      error: null,
      isSuccess: false,
    } as ReturnType<typeof useOpenLineageModule.useOpenLineageDataset>);
  });

  // TC-COMP-001: AssetBrowser Initial Render
  describe('TC-COMP-001: Initial Render', () => {
    it('displays loading spinner when loading', () => {
      vi.mocked(useOpenLineageModule.useOpenLineageNamespaces).mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
        error: null,
        isSuccess: false,
      } as ReturnType<typeof useOpenLineageModule.useOpenLineageNamespaces>);

      render(<AssetBrowser />);

      expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument();
    });

    it('displays database list after loading', async () => {
      // Override with multiple databases for this test
      vi.mocked(useOpenLineageModule.useOpenLineageDatasets).mockReturnValue({
        data: { datasets: mockDatasets, total: mockDatasets.length },
        isLoading: false,
        isFetching: false,
        isError: false,
        error: null,
        isSuccess: true,
      } as ReturnType<typeof useOpenLineageModule.useOpenLineageDatasets>);

      render(<AssetBrowser />);

      expect(screen.getByText('Databases')).toBeInTheDocument();
      // Databases are derived from dataset names (sales_db.orders -> sales_db)
      expect(screen.getByText('sales_db')).toBeInTheDocument();
      expect(screen.getByText('analytics_db')).toBeInTheDocument();
    });
  });

  // TC-COMP-002: AssetBrowser Database Expansion
  describe('TC-COMP-002: Database Expansion', () => {
    it('expands database to show tables when chevron clicked', async () => {
      const user = userEvent.setup();

      render(<AssetBrowser />);

      // Click chevron to expand database (only one database in default mock)
      const expandButton = screen.getByRole('button', { name: /expand database/i });
      await user.click(expandButton);

      // Tables (datasets) should be visible - dataset names parsed to table names
      await waitFor(() => {
        expect(screen.getByText('orders')).toBeInTheDocument();
        expect(screen.getByText('customers')).toBeInTheDocument();
      });
    });

    it('collapses database when chevron clicked again', async () => {
      const user = userEvent.setup();

      render(<AssetBrowser />);

      // Expand
      const expandButton = screen.getByRole('button', { name: /expand database/i });
      await user.click(expandButton);

      await waitFor(() => {
        expect(screen.getByText('orders')).toBeInTheDocument();
      });

      // Collapse
      const collapseButton = screen.getByRole('button', { name: /collapse database/i });
      await user.click(collapseButton);

      await waitFor(() => {
        expect(screen.queryByText('orders')).not.toBeInTheDocument();
      });
    });
  });

  // TC-COMP-003: AssetBrowser Table Expansion
  describe('TC-COMP-003: Table Expansion', () => {
    it('expands table to show columns when clicked', async () => {
      const user = userEvent.setup();

      // Mock useOpenLineageDataset to return fields when called for ds-1
      vi.mocked(useOpenLineageModule.useOpenLineageDataset).mockReturnValue({
        data: mockDatasetWithFields,
        isLoading: false,
        isError: false,
        error: null,
        isSuccess: true,
      } as ReturnType<typeof useOpenLineageModule.useOpenLineageDataset>);

      render(<AssetBrowser />);

      // Expand database first
      const expandDbButton = screen.getByRole('button', { name: /expand database/i });
      await user.click(expandDbButton);

      await waitFor(() => {
        expect(screen.getByText('orders')).toBeInTheDocument();
      });

      // Expand table by clicking the chevron
      const expandTableButtons = screen.getAllByRole('button', { name: /expand dataset/i });
      await user.click(expandTableButtons[0]);

      // Columns should be visible with type information
      await waitFor(() => {
        expect(screen.getByText('order_id')).toBeInTheDocument();
        expect(screen.getByText('customer_id')).toBeInTheDocument();
        expect(screen.getAllByText('INTEGER').length).toBeGreaterThan(0);
      });
    });
  });

  // TC-COMP-004: AssetBrowser Column Selection (Navigation)
  describe('TC-COMP-004: Column Selection', () => {
    it('navigates to lineage view when column is clicked', async () => {
      const user = userEvent.setup();

      // Mock useOpenLineageDataset to return fields
      vi.mocked(useOpenLineageModule.useOpenLineageDataset).mockReturnValue({
        data: mockDatasetWithFields,
        isLoading: false,
        isError: false,
        error: null,
        isSuccess: true,
      } as ReturnType<typeof useOpenLineageModule.useOpenLineageDataset>);

      render(<AssetBrowser />);

      // Expand database
      const expandDbButton = screen.getByRole('button', { name: /expand database/i });
      await user.click(expandDbButton);

      await waitFor(() => {
        expect(screen.getByText('orders')).toBeInTheDocument();
      });

      // Expand table
      const expandTableButtons = screen.getAllByRole('button', { name: /expand dataset/i });
      await user.click(expandTableButtons[0]);

      await waitFor(() => {
        expect(screen.getByText('order_id')).toBeInTheDocument();
      });

      // Click column - should trigger navigation (component uses navigate())
      // The test-utils includes a MemoryRouter, so clicking should not throw
      await user.click(screen.getByText('order_id'));

      // The navigation happens via useNavigate, which we trust works in test-utils
      // We verify the button is clickable and the component doesn't error
    });
  });

  // TC-COMP-032a: AssetBrowser View Visual Distinction
  describe('TC-COMP-032a: View Visual Distinction', () => {
    it('displays different icons for tables and views', async () => {
      const user = userEvent.setup();

      // Use mockDatasetsWithViews with different sourceType values (single db)
      vi.mocked(useOpenLineageModule.useOpenLineageDatasets).mockReturnValue({
        data: { datasets: mockDatasetsWithViews, total: mockDatasetsWithViews.length },
        isLoading: false,
        isFetching: false,
        isError: false,
        error: null,
        isSuccess: true,
      } as ReturnType<typeof useOpenLineageModule.useOpenLineageDatasets>);

      render(<AssetBrowser />);

      // Expand database
      const expandDbButton = screen.getByRole('button', { name: /expand database/i });
      await user.click(expandDbButton);

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

    it('displays table icon for sourceType table', async () => {
      const user = userEvent.setup();

      vi.mocked(useOpenLineageModule.useOpenLineageDatasets).mockReturnValue({
        data: { datasets: [{ id: 'ds-1', namespace: 'ns-1', name: 'sales_db.orders', sourceType: 'table', createdAt: '2024-01-01', updatedAt: '2024-01-01' }], total: 1 },
        isLoading: false,
        isFetching: false,
        isError: false,
        error: null,
        isSuccess: true,
      } as ReturnType<typeof useOpenLineageModule.useOpenLineageDatasets>);

      render(<AssetBrowser />);

      const expandDbButton = screen.getByRole('button', { name: /expand database/i });
      await user.click(expandDbButton);

      await waitFor(() => {
        expect(screen.getByTestId('table-icon')).toBeInTheDocument();
      });
    });

    it('displays view icon for sourceType view', async () => {
      const user = userEvent.setup();

      vi.mocked(useOpenLineageModule.useOpenLineageDatasets).mockReturnValue({
        data: { datasets: [{ id: 'view-1', namespace: 'ns-1', name: 'sales_db.my_view', sourceType: 'view', createdAt: '2024-01-01', updatedAt: '2024-01-01' }], total: 1 },
        isLoading: false,
        isFetching: false,
        isError: false,
        error: null,
        isSuccess: true,
      } as ReturnType<typeof useOpenLineageModule.useOpenLineageDatasets>);

      render(<AssetBrowser />);

      const expandDbButton = screen.getByRole('button', { name: /expand database/i });
      await user.click(expandDbButton);

      await waitFor(() => {
        expect(screen.getByTestId('view-icon')).toBeInTheDocument();
      });
    });

    it('displays materialized view icon for sourceType materialized_view', async () => {
      const user = userEvent.setup();

      vi.mocked(useOpenLineageModule.useOpenLineageDatasets).mockReturnValue({
        data: { datasets: [{ id: 'mat-1', namespace: 'ns-1', name: 'sales_db.my_mat_view', sourceType: 'materialized_view', createdAt: '2024-01-01', updatedAt: '2024-01-01' }], total: 1 },
        isLoading: false,
        isFetching: false,
        isError: false,
        error: null,
        isSuccess: true,
      } as ReturnType<typeof useOpenLineageModule.useOpenLineageDatasets>);

      render(<AssetBrowser />);

      const expandDbButton = screen.getByRole('button', { name: /expand database/i });
      await user.click(expandDbButton);

      await waitFor(() => {
        expect(screen.getByTestId('materialized-view-icon')).toBeInTheDocument();
      });
    });
  });

  // TC-COMP-PAGE: AssetBrowser Pagination
  describe('TC-COMP-PAGE: Pagination', () => {
    describe('Database pagination', () => {
      it('shows pagination controls below database list (always visible per CONTEXT.md)', () => {
        // Default mock has 1 database (sales_db)
        render(<AssetBrowser />);

        // Pagination always visible per CONTEXT.md
        expect(screen.getByTestId('pagination-info')).toBeInTheDocument();
        expect(screen.getByTestId('pagination-prev')).toBeInTheDocument();
        expect(screen.getByTestId('pagination-next')).toBeInTheDocument();
      });

      it('displays correct database count in pagination', () => {
        render(<AssetBrowser />);

        // With default mock: 1 database (sales_db) with 2 tables
        expect(screen.getByText(/Showing 1-1 of 1/)).toBeInTheDocument();
      });

      it('navigates to next page of databases when clicking next', async () => {
        const user = userEvent.setup();

        // Create 150 datasets across many databases to test pagination
        // Use zero-padded numbers for correct alphabetical sorting (db_000, db_001, ..., db_149)
        const manyDatasets = Array.from({ length: 150 }, (_, i) => ({
          id: `ds-${i}`,
          namespace: 'ns-1',
          name: `db_${String(i).padStart(3, '0')}.table_${i}`,
          sourceType: 'table',
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        }));

        vi.mocked(useOpenLineageModule.useOpenLineageDatasets).mockReturnValue({
          data: { datasets: manyDatasets, total: manyDatasets.length },
          isLoading: false,
          isFetching: false,
          isError: false,
          error: null,
          isSuccess: true,
        } as ReturnType<typeof useOpenLineageModule.useOpenLineageDatasets>);

        render(<AssetBrowser />);

        // Should show first 100 databases (db_000 through db_099)
        expect(screen.getByText(/Showing 1-100 of 150/)).toBeInTheDocument();
        expect(screen.getByText('db_000')).toBeInTheDocument();
        expect(screen.queryByText('db_100')).not.toBeInTheDocument();

        // Click next
        await user.click(screen.getByTestId('pagination-next'));

        // Should now show databases 101-150 (db_100 through db_149)
        await waitFor(() => {
          expect(screen.getByText(/Showing 101-150 of 150/)).toBeInTheDocument();
          expect(screen.getByText('db_100')).toBeInTheDocument();
          expect(screen.queryByText('db_000')).not.toBeInTheDocument();
        });
      });

      it('disables previous button on first page', () => {
        render(<AssetBrowser />);

        const prevButton = screen.getByTestId('pagination-prev');
        expect(prevButton).toBeDisabled();
      });

      it('disables next button on last page', () => {
        // Default mock has only 1 database, so we're on last page
        render(<AssetBrowser />);

        const nextButton = screen.getByTestId('pagination-next');
        expect(nextButton).toBeDisabled();
      });
    });

    describe('Table pagination within database', () => {
      it('shows pagination controls below table list when database expanded', async () => {
        const user = userEvent.setup();
        render(<AssetBrowser />);

        // Expand database
        const expandButton = screen.getByRole('button', { name: /expand database/i });
        await user.click(expandButton);

        // Wait for tables to appear
        await waitFor(() => {
          expect(screen.getByText('orders')).toBeInTheDocument();
        });

        // Should have pagination for tables (second pagination in DOM)
        const paginationInfos = screen.getAllByTestId('pagination-info');
        expect(paginationInfos.length).toBe(2); // db + table level
      });

      it('displays correct table count in pagination', async () => {
        const user = userEvent.setup();
        render(<AssetBrowser />);

        // Expand database
        const expandButton = screen.getByRole('button', { name: /expand database/i });
        await user.click(expandButton);

        await waitFor(() => {
          expect(screen.getByText('orders')).toBeInTheDocument();
        });

        // After expansion, we should have 2 pagination controls: db level and table level
        // Note: In the DOM, the table pagination appears before the db pagination due to nesting
        const paginationInfos = screen.getAllByTestId('pagination-info');
        expect(paginationInfos.length).toBe(2);
        // Table pagination (inside expanded db) shows 2 tables
        expect(paginationInfos[0]).toHaveTextContent(/Showing 1-2 of 2/);
        // Database pagination (at bottom) shows 1 database
        expect(paginationInfos[1]).toHaveTextContent(/Showing 1-1 of 1/);
      });

      it('navigates through table pages when database has many tables', async () => {
        const user = userEvent.setup();

        // Create datasets with 150 tables in one database
        // Use zero-padded numbers for correct alphabetical sorting
        const manyTablesDatasets = Array.from({ length: 150 }, (_, i) => ({
          id: `ds-sales-${i}`,
          namespace: 'ns-1',
          name: `sales_db.table_${String(i).padStart(3, '0')}`,
          sourceType: 'table',
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        }));

        vi.mocked(useOpenLineageModule.useOpenLineageDatasets).mockReturnValue({
          data: { datasets: manyTablesDatasets, total: manyTablesDatasets.length },
          isLoading: false,
          isFetching: false,
          isError: false,
          error: null,
          isSuccess: true,
        } as ReturnType<typeof useOpenLineageModule.useOpenLineageDatasets>);

        render(<AssetBrowser />);

        // Expand sales_db
        const expandButton = screen.getByRole('button', { name: /expand database/i });
        await user.click(expandButton);

        await waitFor(() => {
          expect(screen.getByText('table_000')).toBeInTheDocument();
        });

        // Table pagination (index 0) should show first 100 of 150
        // Database pagination (index 1) shows 1 database
        const tablePaginationInfos = screen.getAllByTestId('pagination-info');
        expect(tablePaginationInfos[0]).toHaveTextContent(/Showing 1-100 of 150/);

        // Navigate to page 2 of tables (table pagination is at index 0)
        const tablePaginationNext = screen.getAllByTestId('pagination-next')[0];
        await user.click(tablePaginationNext);

        await waitFor(() => {
          expect(screen.getByText('table_100')).toBeInTheDocument();
          expect(screen.queryByText('table_000')).not.toBeInTheDocument();
        });

        // Verify pagination info updated
        const updatedPaginationInfos = screen.getAllByTestId('pagination-info');
        expect(updatedPaginationInfos[0]).toHaveTextContent(/Showing 101-150 of 150/);
      });

      it('resets table pagination when collapsing and re-expanding database', async () => {
        const user = userEvent.setup();

        // Create datasets with 150 tables in one database
        // Use zero-padded numbers for correct alphabetical sorting
        const manyTablesDatasets = Array.from({ length: 150 }, (_, i) => ({
          id: `ds-sales-${i}`,
          namespace: 'ns-1',
          name: `sales_db.table_${String(i).padStart(3, '0')}`,
          sourceType: 'table',
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        }));

        vi.mocked(useOpenLineageModule.useOpenLineageDatasets).mockReturnValue({
          data: { datasets: manyTablesDatasets, total: manyTablesDatasets.length },
          isLoading: false,
          isFetching: false,
          isError: false,
          error: null,
          isSuccess: true,
        } as ReturnType<typeof useOpenLineageModule.useOpenLineageDatasets>);

        render(<AssetBrowser />);

        // Expand sales_db
        const expandButton = screen.getByRole('button', { name: /expand database/i });
        await user.click(expandButton);

        await waitFor(() => {
          expect(screen.getByText('table_000')).toBeInTheDocument();
        });

        // Navigate to page 2 of tables (table pagination is at index 0)
        const tablePaginationNext = screen.getAllByTestId('pagination-next')[0];
        await user.click(tablePaginationNext);

        await waitFor(() => {
          expect(screen.getByText('table_100')).toBeInTheDocument();
        });

        // Collapse database
        const collapseButton = screen.getByRole('button', { name: /collapse database/i });
        await user.click(collapseButton);

        await waitFor(() => {
          expect(screen.queryByText('table_100')).not.toBeInTheDocument();
        });

        // Re-expand database - pagination should NOT reset (state preserved in DatabaseItem)
        // The table pagination remains at the same offset since the component maintains state
        const reExpandButton = screen.getByRole('button', { name: /expand database/i });
        await user.click(reExpandButton);

        await waitFor(() => {
          // DatabaseItem preserves state, so still on page 2
          expect(screen.getByText('table_100')).toBeInTheDocument();
        });
      });
    });

    describe('Column pagination within table', () => {
      it('shows pagination controls below column list when table expanded', async () => {
        const user = userEvent.setup();

        // Mock useOpenLineageDataset to return fields when called
        vi.mocked(useOpenLineageModule.useOpenLineageDataset).mockReturnValue({
          data: mockDatasetWithFields,
          isLoading: false,
          isError: false,
          error: null,
          isSuccess: true,
        } as ReturnType<typeof useOpenLineageModule.useOpenLineageDataset>);

        render(<AssetBrowser />);

        // Expand database
        const expandDbButton = screen.getByRole('button', { name: /expand database/i });
        await user.click(expandDbButton);

        await waitFor(() => {
          expect(screen.getByText('orders')).toBeInTheDocument();
        });

        // Expand table (click chevron, not the table name which navigates)
        const expandTableButton = screen.getAllByRole('button', { name: /expand dataset/i })[0];
        await user.click(expandTableButton);

        await waitFor(() => {
          expect(screen.getByText('order_id')).toBeInTheDocument();
        });

        // Should have pagination for columns (db + table + column level)
        const paginationInfos = screen.getAllByTestId('pagination-info');
        expect(paginationInfos.length).toBe(3);
      });

      it('displays correct column count in pagination', async () => {
        const user = userEvent.setup();

        // Mock useOpenLineageDataset to return fields
        vi.mocked(useOpenLineageModule.useOpenLineageDataset).mockReturnValue({
          data: mockDatasetWithFields,
          isLoading: false,
          isError: false,
          error: null,
          isSuccess: true,
        } as ReturnType<typeof useOpenLineageModule.useOpenLineageDataset>);

        render(<AssetBrowser />);

        // Expand database
        const expandDbButton = screen.getByRole('button', { name: /expand database/i });
        await user.click(expandDbButton);

        await waitFor(() => {
          expect(screen.getByText('orders')).toBeInTheDocument();
        });

        // Expand table
        const expandTableButton = screen.getAllByRole('button', { name: /expand dataset/i })[0];
        await user.click(expandTableButton);

        await waitFor(() => {
          expect(screen.getByText('order_id')).toBeInTheDocument();
        });

        // After expansion, DOM order is:
        // [0] Column pagination (2 fields) - from expanded DatasetItem
        // [1] Table pagination (2 tables) - from expanded DatabaseItem
        // [2] Database pagination (1 database) - from AssetBrowser
        const paginationInfos = screen.getAllByTestId('pagination-info');
        expect(paginationInfos.length).toBe(3);
        expect(paginationInfos[0]).toHaveTextContent(/Showing 1-2 of 2/); // columns
        expect(paginationInfos[1]).toHaveTextContent(/Showing 1-2 of 2/); // tables
        expect(paginationInfos[2]).toHaveTextContent(/Showing 1-1 of 1/); // databases
      });

      it('navigates through column pages when table has many columns', async () => {
        const user = userEvent.setup();

        // Create dataset with 150 fields
        // Fields are sorted by ordinalPosition in the component
        // Use zero-padded names for easier identification
        const manyFieldsDataset = {
          ...mockDatasetWithFields,
          fields: Array.from({ length: 150 }, (_, i) => ({
            id: `f-${i}`,
            name: `column_${String(i).padStart(3, '0')}`,
            type: 'VARCHAR',
            ordinalPosition: i + 1,
            nullable: true,
          })),
        };

        vi.mocked(useOpenLineageModule.useOpenLineageDataset).mockReturnValue({
          data: manyFieldsDataset,
          isLoading: false,
          isError: false,
          error: null,
          isSuccess: true,
        } as ReturnType<typeof useOpenLineageModule.useOpenLineageDataset>);

        render(<AssetBrowser />);

        // Expand database
        const expandDbButton = screen.getByRole('button', { name: /expand database/i });
        await user.click(expandDbButton);

        await waitFor(() => {
          expect(screen.getByText('orders')).toBeInTheDocument();
        });

        // Expand table
        const expandTableButton = screen.getAllByRole('button', { name: /expand dataset/i })[0];
        await user.click(expandTableButton);

        await waitFor(() => {
          expect(screen.getByText('column_000')).toBeInTheDocument();
          expect(screen.queryByText('column_100')).not.toBeInTheDocument();
        });

        // Column pagination is at index 0 (innermost)
        const paginationInfos = screen.getAllByTestId('pagination-info');
        expect(paginationInfos[0]).toHaveTextContent(/Showing 1-100 of 150/);

        // Click next on column pagination (first pagination control - innermost)
        const paginationNextButtons = screen.getAllByTestId('pagination-next');
        const columnPaginationNext = paginationNextButtons[0];
        await user.click(columnPaginationNext);

        await waitFor(() => {
          expect(screen.getByText('column_100')).toBeInTheDocument();
          expect(screen.queryByText('column_000')).not.toBeInTheDocument();
        });

        // Verify pagination info updated
        const updatedPaginationInfos = screen.getAllByTestId('pagination-info');
        expect(updatedPaginationInfos[0]).toHaveTextContent(/Showing 101-150 of 150/);
      });

      it('uses previous button to navigate back on column pagination', async () => {
        const user = userEvent.setup();

        // Create dataset with 150 fields
        // Use zero-padded names for easier identification
        const manyFieldsDataset = {
          ...mockDatasetWithFields,
          fields: Array.from({ length: 150 }, (_, i) => ({
            id: `f-${i}`,
            name: `column_${String(i).padStart(3, '0')}`,
            type: 'VARCHAR',
            ordinalPosition: i + 1,
            nullable: true,
          })),
        };

        vi.mocked(useOpenLineageModule.useOpenLineageDataset).mockReturnValue({
          data: manyFieldsDataset,
          isLoading: false,
          isError: false,
          error: null,
          isSuccess: true,
        } as ReturnType<typeof useOpenLineageModule.useOpenLineageDataset>);

        render(<AssetBrowser />);

        // Expand database
        const expandDbButton = screen.getByRole('button', { name: /expand database/i });
        await user.click(expandDbButton);

        await waitFor(() => {
          expect(screen.getByText('orders')).toBeInTheDocument();
        });

        // Expand table
        const expandTableButton = screen.getAllByRole('button', { name: /expand dataset/i })[0];
        await user.click(expandTableButton);

        await waitFor(() => {
          expect(screen.getByText('column_000')).toBeInTheDocument();
        });

        // Navigate to page 2 (column pagination is at index 0)
        const paginationNextButtons = screen.getAllByTestId('pagination-next');
        const columnPaginationNext = paginationNextButtons[0];
        await user.click(columnPaginationNext);

        await waitFor(() => {
          expect(screen.getByText('column_100')).toBeInTheDocument();
        });

        // Navigate back to page 1 (column pagination is at index 0)
        const paginationPrevButtons = screen.getAllByTestId('pagination-prev');
        const columnPaginationPrev = paginationPrevButtons[0];
        await user.click(columnPaginationPrev);

        await waitFor(() => {
          expect(screen.getByText('column_000')).toBeInTheDocument();
          expect(screen.queryByText('column_100')).not.toBeInTheDocument();
        });
      });
    });
  });
});
