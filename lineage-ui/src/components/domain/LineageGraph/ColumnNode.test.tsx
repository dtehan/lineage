import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ColumnNode } from './ColumnNode';
import * as useLineageStoreModule from '../../../stores/useLineageStore';

// Mock the store
vi.mock('../../../stores/useLineageStore');

// Mock ReactFlow Handle
vi.mock('@xyflow/react', () => ({
  Handle: ({ type, position }: { type: string; position: string }) => (
    <div data-testid={`handle-${type}`} data-position={position} />
  ),
  Position: { Left: 'left', Right: 'right' },
}));

const defaultNodeData = {
  databaseName: 'sales_db',
  tableName: 'orders',
  columnName: 'order_id',
  label: 'orders.order_id',
};

describe('ColumnNode Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // TC-COMP-009: ColumnNode Default Render
  describe('TC-COMP-009: Default Render', () => {
    it('renders database and table name in smaller text', () => {
      vi.mocked(useLineageStoreModule.useLineageStore).mockReturnValue({
        selectedAssetId: null,
        highlightedNodeIds: new Set(),
        setSelectedAssetId: vi.fn(),
        nodes: [],
        edges: [],
        setGraph: vi.fn(),
        maxDepth: 5,
        setMaxDepth: vi.fn(),
        direction: 'both',
        setDirection: vi.fn(),
        setHighlightedNodeIds: vi.fn(),
        expandedTables: new Set(),
        toggleTableExpanded: vi.fn(),
      });

      render(<ColumnNode id="col-1" data={defaultNodeData} />);

      expect(screen.getByText('sales_db.orders')).toBeInTheDocument();
    });

    it('renders column name with medium font weight', () => {
      vi.mocked(useLineageStoreModule.useLineageStore).mockReturnValue({
        selectedAssetId: null,
        highlightedNodeIds: new Set(),
        setSelectedAssetId: vi.fn(),
        nodes: [],
        edges: [],
        setGraph: vi.fn(),
        maxDepth: 5,
        setMaxDepth: vi.fn(),
        direction: 'both',
        setDirection: vi.fn(),
        setHighlightedNodeIds: vi.fn(),
        expandedTables: new Set(),
        toggleTableExpanded: vi.fn(),
      });

      render(<ColumnNode id="col-1" data={defaultNodeData} />);

      const columnNameElement = screen.getByText('order_id');
      expect(columnNameElement).toBeInTheDocument();
      expect(columnNameElement).toHaveClass('font-medium');
    });

    it('renders left (target) and right (source) handles', () => {
      vi.mocked(useLineageStoreModule.useLineageStore).mockReturnValue({
        selectedAssetId: null,
        highlightedNodeIds: new Set(),
        setSelectedAssetId: vi.fn(),
        nodes: [],
        edges: [],
        setGraph: vi.fn(),
        maxDepth: 5,
        setMaxDepth: vi.fn(),
        direction: 'both',
        setDirection: vi.fn(),
        setHighlightedNodeIds: vi.fn(),
        expandedTables: new Set(),
        toggleTableExpanded: vi.fn(),
      });

      render(<ColumnNode id="col-1" data={defaultNodeData} />);

      expect(screen.getByTestId('handle-target')).toHaveAttribute('data-position', 'left');
      expect(screen.getByTestId('handle-source')).toHaveAttribute('data-position', 'right');
    });

    it('has default border-slate-300 styling when not selected or highlighted', () => {
      vi.mocked(useLineageStoreModule.useLineageStore).mockReturnValue({
        selectedAssetId: null,
        highlightedNodeIds: new Set(),
        setSelectedAssetId: vi.fn(),
        nodes: [],
        edges: [],
        setGraph: vi.fn(),
        maxDepth: 5,
        setMaxDepth: vi.fn(),
        direction: 'both',
        setDirection: vi.fn(),
        setHighlightedNodeIds: vi.fn(),
        expandedTables: new Set(),
        toggleTableExpanded: vi.fn(),
      });

      const { container } = render(<ColumnNode id="col-1" data={defaultNodeData} />);

      const nodeElement = container.firstChild as HTMLElement;
      expect(nodeElement).toHaveClass('border-slate-300');
      expect(nodeElement).toHaveClass('bg-white');
    });
  });

  // TC-COMP-010: ColumnNode Selected State
  describe('TC-COMP-010: Selected State', () => {
    it('displays selected styling when selectedAssetId matches', () => {
      vi.mocked(useLineageStoreModule.useLineageStore).mockReturnValue({
        selectedAssetId: 'col-1',
        highlightedNodeIds: new Set(),
        setSelectedAssetId: vi.fn(),
        nodes: [],
        edges: [],
        setGraph: vi.fn(),
        maxDepth: 5,
        setMaxDepth: vi.fn(),
        direction: 'both',
        setDirection: vi.fn(),
        setHighlightedNodeIds: vi.fn(),
        expandedTables: new Set(),
        toggleTableExpanded: vi.fn(),
      });

      const { container } = render(<ColumnNode id="col-1" data={defaultNodeData} />);

      const nodeElement = container.firstChild as HTMLElement;
      expect(nodeElement).toHaveClass('bg-blue-100');
      expect(nodeElement).toHaveClass('border-blue-500');
      expect(nodeElement).toHaveClass('ring-2');
      expect(nodeElement).toHaveClass('ring-blue-300');
    });

    it('does not display selected styling when selectedAssetId does not match', () => {
      vi.mocked(useLineageStoreModule.useLineageStore).mockReturnValue({
        selectedAssetId: 'col-2',
        highlightedNodeIds: new Set(),
        setSelectedAssetId: vi.fn(),
        nodes: [],
        edges: [],
        setGraph: vi.fn(),
        maxDepth: 5,
        setMaxDepth: vi.fn(),
        direction: 'both',
        setDirection: vi.fn(),
        setHighlightedNodeIds: vi.fn(),
        expandedTables: new Set(),
        toggleTableExpanded: vi.fn(),
      });

      const { container } = render(<ColumnNode id="col-1" data={defaultNodeData} />);

      const nodeElement = container.firstChild as HTMLElement;
      expect(nodeElement).not.toHaveClass('bg-blue-100');
      expect(nodeElement).not.toHaveClass('border-blue-500');
    });
  });

  // TC-COMP-011: ColumnNode Highlighted State
  describe('TC-COMP-011: Highlighted State', () => {
    it('displays highlighted styling when in highlightedNodeIds', () => {
      vi.mocked(useLineageStoreModule.useLineageStore).mockReturnValue({
        selectedAssetId: null,
        highlightedNodeIds: new Set(['col-1']),
        setSelectedAssetId: vi.fn(),
        nodes: [],
        edges: [],
        setGraph: vi.fn(),
        maxDepth: 5,
        setMaxDepth: vi.fn(),
        direction: 'both',
        setDirection: vi.fn(),
        setHighlightedNodeIds: vi.fn(),
        expandedTables: new Set(),
        toggleTableExpanded: vi.fn(),
      });

      const { container } = render(<ColumnNode id="col-1" data={defaultNodeData} />);

      const nodeElement = container.firstChild as HTMLElement;
      expect(nodeElement).toHaveClass('bg-blue-50');
      expect(nodeElement).toHaveClass('border-blue-400');
    });

    it('selected state takes precedence over highlighted state', () => {
      vi.mocked(useLineageStoreModule.useLineageStore).mockReturnValue({
        selectedAssetId: 'col-1',
        highlightedNodeIds: new Set(['col-1']),
        setSelectedAssetId: vi.fn(),
        nodes: [],
        edges: [],
        setGraph: vi.fn(),
        maxDepth: 5,
        setMaxDepth: vi.fn(),
        direction: 'both',
        setDirection: vi.fn(),
        setHighlightedNodeIds: vi.fn(),
        expandedTables: new Set(),
        toggleTableExpanded: vi.fn(),
      });

      const { container } = render(<ColumnNode id="col-1" data={defaultNodeData} />);

      const nodeElement = container.firstChild as HTMLElement;
      // Selected styling should be applied
      expect(nodeElement).toHaveClass('bg-blue-100');
      expect(nodeElement).toHaveClass('border-blue-500');
      // Not highlighted styling
      expect(nodeElement).not.toHaveClass('bg-blue-50');
      expect(nodeElement).not.toHaveClass('border-blue-400');
    });
  });
});
