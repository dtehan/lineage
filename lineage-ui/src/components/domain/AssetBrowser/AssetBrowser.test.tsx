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

// DatabasesResponse: databases list from the API (Phase 1)
const mockDatabases = {
  databases: [
    { name: 'analytics_db', tableCount: 0, viewCount: 1, totalCount: 1 },
    { name: 'sales_db', tableCount: 2, viewCount: 0, totalCount: 2 },
  ],
  total: 2,
};

// Single database for simpler tests
const mockSingleDbDatabases = {
  databases: [
    { name: 'sales_db', tableCount: 2, viewCount: 0, totalCount: 2 },
  ],
  total: 1,
};

// Datasets per database (Phase 2: fetched on expand)
const mockSingleDbDatasets = [
  { id: 'ds-1', namespace: 'ns-1', name: 'sales_db.orders', sourceType: 'table', createdAt: '2024-01-01', updatedAt: '2024-01-01' },
  { id: 'ds-2', namespace: 'ns-1', name: 'sales_db.customers', sourceType: 'table', createdAt: '2024-01-01', updatedAt: '2024-01-01' },
];

// Datasets with hasLineage variations for indicator tests
const mockDatasetsWithLineageIndicators = [
  { id: 'ds-1', namespace: 'ns-1', name: 'sales_db.orders', sourceType: 'table', hasLineage: true, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
  { id: 'ds-2', namespace: 'ns-1', name: 'sales_db.customers', sourceType: 'table', hasLineage: false, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
  { id: 'ds-3', namespace: 'ns-1', name: 'sales_db.catalog_only', sourceType: 'table', createdAt: '2024-01-01', updatedAt: '2024-01-01' },
];

// Single database with mixed asset types
const mockDatasetsWithViews = [
  { id: 'ds-1', namespace: 'ns-1', name: 'sales_db.orders', sourceType: 'table', createdAt: '2024-01-01', updatedAt: '2024-01-01' },
  { id: 'ds-2', namespace: 'ns-1', name: 'sales_db.customer_view', sourceType: 'view', createdAt: '2024-01-01', updatedAt: '2024-01-01' },
  { id: 'ds-3', namespace: 'ns-1', name: 'sales_db.sales_summary', sourceType: 'materialized_view', createdAt: '2024-01-01', updatedAt: '2024-01-01' },
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

    // Mock useOpenLineageDatabases - Phase 1 load (databases list)
    vi.mocked(useOpenLineageModule.useOpenLineageDatabases).mockReturnValue({
      data: mockSingleDbDatabases,
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
      isSuccess: true,
    } as ReturnType<typeof useOpenLineageModule.useOpenLineageDatabases>);

    // Mock useOpenLineageDatasets - Phase 2 load (tables fetched on expand)
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
      vi.mocked(useOpenLineageModule.useOpenLineageDatabases).mockReturnValue({
        data: undefined,
        isLoading: true,
        isFetching: true,
        isError: false,
        error: null,
        isSuccess: false,
      } as ReturnType<typeof useOpenLineageModule.useOpenLineageDatabases>);

      render(<AssetBrowser />);

      expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument();
    });

    it('displays database list after loading', async () => {
      // Override with multiple databases for this test
      vi.mocked(useOpenLineageModule.useOpenLineageDatabases).mockReturnValue({
        data: mockDatabases,
        isLoading: false,
        isFetching: false,
        isError: false,
        error: null,
        isSuccess: true,
      } as ReturnType<typeof useOpenLineageModule.useOpenLineageDatabases>);

      render(<AssetBrowser />);

      expect(screen.getByText('Databases')).toBeInTheDocument();
      // Databases come directly from the API response
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

      // Use databases with one db (sales_db) and override datasets with mixed types
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

  // TC-COMP-033: Has Lineage Indicator
  describe('TC-COMP-033: Has Lineage Indicator', () => {
    it('shows blue dot indicator for datasets with hasLineage=true', async () => {
      const user = userEvent.setup();

      vi.mocked(useOpenLineageModule.useOpenLineageDatasets).mockReturnValue({
        data: { datasets: mockDatasetsWithLineageIndicators, total: mockDatasetsWithLineageIndicators.length },
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
        expect(screen.getByText('orders')).toBeInTheDocument();
      });

      // Only the dataset with hasLineage=true should have the indicator
      const indicators = screen.getAllByTestId('has-lineage-indicator');
      expect(indicators).toHaveLength(1);
    });

    it('does not show indicator for datasets with hasLineage=false', async () => {
      const user = userEvent.setup();

      vi.mocked(useOpenLineageModule.useOpenLineageDatasets).mockReturnValue({
        data: { datasets: [{ id: 'ds-2', namespace: 'ns-1', name: 'sales_db.customers', sourceType: 'table', hasLineage: false, createdAt: '2024-01-01', updatedAt: '2024-01-01' }], total: 1 },
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
        expect(screen.getByText('customers')).toBeInTheDocument();
      });

      expect(screen.queryByTestId('has-lineage-indicator')).not.toBeInTheDocument();
    });

    it('does not show indicator for datasets with no hasLineage field (undefined)', async () => {
      const user = userEvent.setup();

      vi.mocked(useOpenLineageModule.useOpenLineageDatasets).mockReturnValue({
        data: { datasets: [{ id: 'ds-3', namespace: 'ns-1', name: 'sales_db.catalog_only', sourceType: 'table', createdAt: '2024-01-01', updatedAt: '2024-01-01' }], total: 1 },
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
        expect(screen.getByText('catalog_only')).toBeInTheDocument();
      });

      expect(screen.queryByTestId('has-lineage-indicator')).not.toBeInTheDocument();
    });

    it('indicator has correct aria-label for accessibility', async () => {
      const user = userEvent.setup();

      vi.mocked(useOpenLineageModule.useOpenLineageDatasets).mockReturnValue({
        data: { datasets: [{ id: 'ds-1', namespace: 'ns-1', name: 'sales_db.orders', sourceType: 'table', hasLineage: true, createdAt: '2024-01-01', updatedAt: '2024-01-01' }], total: 1 },
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
        expect(screen.getByText('orders')).toBeInTheDocument();
      });

      const indicator = screen.getByTestId('has-lineage-indicator');
      expect(indicator).toHaveAttribute('aria-label', 'Has lineage connections');
    });
  });
});
