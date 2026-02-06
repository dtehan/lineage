import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DetailPanel, ColumnDetail, EdgeDetail } from './DetailPanel';

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
        selectedColumn: mockColumnDetail,
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
        selectedColumn: mockColumnDetail,
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
        selectedColumn: mockColumnDetail,
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
        selectedColumn: mockColumnDetail,
      });

      const panel = screen.getByTestId('detail-panel');
      expect(panel.className).toContain('motion-reduce');
    });
  });

  describe('TC-COMP-017: Column details display', () => {
    it('displays table name in entity header', () => {
      renderDetailPanel({
        isOpen: true,
        onClose: () => {},
        selectedColumn: mockColumnDetail,
      });

      expect(
        screen.getByText('sales_db.customers')
      ).toBeInTheDocument();
    });

    it('displays selected column name', () => {
      renderDetailPanel({
        isOpen: true,
        onClose: () => {},
        selectedColumn: mockColumnDetail,
      });

      // Column name appears as clickable link in ColumnsTab
      expect(screen.getByTitle('View lineage for customer_id')).toBeInTheDocument();
    });

    it('displays column metadata', () => {
      renderDetailPanel({
        isOpen: true,
        onClose: () => {},
        selectedColumn: mockColumnDetail,
      });

      expect(screen.getByText('INTEGER')).toBeInTheDocument();
      expect(screen.getByText('Unique customer identifier')).toBeInTheDocument();
    });

    it('displays lineage statistics', () => {
      renderDetailPanel({
        isOpen: true,
        onClose: () => {},
        selectedColumn: mockColumnDetail,
      });

      expect(screen.getByText('3 upstream, 5 downstream')).toBeInTheDocument();
    });

    it('shows tab bar with Columns, Statistics, and DDL tabs', () => {
      renderDetailPanel({
        isOpen: true,
        onClose: () => {},
        selectedColumn: mockColumnDetail,
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
        selectedColumn: mockColumnDetail,
      });

      fireEvent.click(screen.getByLabelText('Close panel'));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('calls onViewFullLineage when button is clicked', () => {
      const onViewFullLineage = vi.fn();
      renderDetailPanel({
        isOpen: true,
        onClose: () => {},
        selectedColumn: mockColumnDetail,
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
        selectedColumn: mockColumnDetail,
        onViewImpactAnalysis,
      });

      fireEvent.click(screen.getByText('Impact Analysis'));
      expect(onViewImpactAnalysis).toHaveBeenCalledWith('col-1');
    });

    it('switches tabs when tab buttons are clicked', () => {
      renderDetailPanel({
        isOpen: true,
        onClose: () => {},
        selectedColumn: mockColumnDetail,
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
        selectedColumn: mockColumnDetail,
      });

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('has appropriate aria-label for column details', () => {
      renderDetailPanel({
        isOpen: true,
        onClose: () => {},
        selectedColumn: mockColumnDetail,
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
        selectedColumn: mockColumnDetail,
      });

      const panel = screen.getByTestId('detail-panel');
      expect(panel).toHaveAttribute('aria-hidden', 'true');
    });

    it('has aria-hidden false when open', () => {
      renderDetailPanel({
        isOpen: true,
        onClose: () => {},
        selectedColumn: mockColumnDetail,
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
        selectedColumn: mockColumnDetail,
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
});
