import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { DetailPanel, ColumnDetail, EdgeDetail } from './DetailPanel';

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
    it('renders when isOpen is true', () => {
      render(
        <DetailPanel
          isOpen={true}
          onClose={() => {}}
          selectedColumn={mockColumnDetail}
        />
      );

      expect(screen.getByTestId('detail-panel')).toBeInTheDocument();
    });

    it('is hidden off-screen when isOpen is false', () => {
      render(
        <DetailPanel
          isOpen={false}
          onClose={() => {}}
          selectedColumn={mockColumnDetail}
        />
      );

      const panel = screen.getByTestId('detail-panel');
      expect(panel).toBeInTheDocument();
      expect(panel).toHaveAttribute('aria-hidden', 'true');
      expect(panel.className).toContain('translate-x-full');
    });
  });

  describe('TC-COMP-017: Column details display', () => {
    it('displays full qualified column name', () => {
      render(
        <DetailPanel
          isOpen={true}
          onClose={() => {}}
          selectedColumn={mockColumnDetail}
        />
      );

      expect(
        screen.getByText('sales_db.customers.customer_id')
      ).toBeInTheDocument();
    });

    it('displays column metadata', () => {
      render(
        <DetailPanel
          isOpen={true}
          onClose={() => {}}
          selectedColumn={mockColumnDetail}
        />
      );

      expect(screen.getByText('INTEGER')).toBeInTheDocument();
      expect(screen.getByText('Unique customer identifier')).toBeInTheDocument();
    });

    it('displays lineage statistics', () => {
      render(
        <DetailPanel
          isOpen={true}
          onClose={() => {}}
          selectedColumn={mockColumnDetail}
        />
      );

      expect(screen.getByText('3 columns')).toBeInTheDocument(); // upstream
      expect(screen.getByText('5 columns')).toBeInTheDocument(); // downstream
    });
  });

  describe('TC-COMP-018: Edge details display', () => {
    it('displays source and target columns', () => {
      render(
        <DetailPanel
          isOpen={true}
          onClose={() => {}}
          selectedEdge={mockEdgeDetail}
        />
      );

      expect(
        screen.getByText('sales_db.customers.customer_id')
      ).toBeInTheDocument();
      expect(
        screen.getByText('analytics_db.customer_summary.cust_id')
      ).toBeInTheDocument();
    });

    it('displays transformation type', () => {
      render(
        <DetailPanel
          isOpen={true}
          onClose={() => {}}
          selectedEdge={mockEdgeDetail}
        />
      );

      expect(screen.getByText('DIRECT')).toBeInTheDocument();
    });

    it('displays confidence score', () => {
      render(
        <DetailPanel
          isOpen={true}
          onClose={() => {}}
          selectedEdge={mockEdgeDetail}
        />
      );

      expect(screen.getByText('95%')).toBeInTheDocument();
    });

    it('displays transformation SQL', () => {
      render(
        <DetailPanel
          isOpen={true}
          onClose={() => {}}
          selectedEdge={mockEdgeDetail}
        />
      );

      expect(
        screen.getByText('SELECT customer_id FROM customers')
      ).toBeInTheDocument();
    });
  });

  describe('TC-COMP-019: Panel interactions', () => {
    it('calls onClose when close button is clicked', () => {
      const onClose = vi.fn();
      render(
        <DetailPanel
          isOpen={true}
          onClose={onClose}
          selectedColumn={mockColumnDetail}
        />
      );

      fireEvent.click(screen.getByLabelText('Close panel'));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('calls onViewFullLineage when button is clicked', () => {
      const onViewFullLineage = vi.fn();
      render(
        <DetailPanel
          isOpen={true}
          onClose={() => {}}
          selectedColumn={mockColumnDetail}
          onViewFullLineage={onViewFullLineage}
        />
      );

      fireEvent.click(screen.getByText('View Full Lineage'));
      expect(onViewFullLineage).toHaveBeenCalledWith('col-1');
    });

    it('calls onViewImpactAnalysis when button is clicked', () => {
      const onViewImpactAnalysis = vi.fn();
      render(
        <DetailPanel
          isOpen={true}
          onClose={() => {}}
          selectedColumn={mockColumnDetail}
          onViewImpactAnalysis={onViewImpactAnalysis}
        />
      );

      fireEvent.click(screen.getByText('Impact Analysis'));
      expect(onViewImpactAnalysis).toHaveBeenCalledWith('col-1');
    });
  });

  describe('TC-COMP-020: Accessibility', () => {
    it('has correct dialog role', () => {
      render(
        <DetailPanel
          isOpen={true}
          onClose={() => {}}
          selectedColumn={mockColumnDetail}
        />
      );

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('has appropriate aria-label for column details', () => {
      render(
        <DetailPanel
          isOpen={true}
          onClose={() => {}}
          selectedColumn={mockColumnDetail}
        />
      );

      expect(screen.getByRole('dialog')).toHaveAttribute(
        'aria-label',
        'Column details'
      );
    });

    it('has appropriate aria-label for edge details', () => {
      render(
        <DetailPanel
          isOpen={true}
          onClose={() => {}}
          selectedEdge={mockEdgeDetail}
        />
      );

      expect(screen.getByRole('dialog')).toHaveAttribute(
        'aria-label',
        'Edge details'
      );
    });
  });

  describe('TC-COMP-021: Empty state', () => {
    it('shows message when no item is selected', () => {
      render(<DetailPanel isOpen={true} onClose={() => {}} />);

      expect(screen.getByText('No item selected')).toBeInTheDocument();
    });
  });
});
