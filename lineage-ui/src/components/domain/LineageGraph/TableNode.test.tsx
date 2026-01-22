import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TableNode } from './TableNode';
import { vi } from 'vitest';

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
  label: 'sales_db.orders',
};

// TC-COMP-012: TableNode Render
describe('TableNode Component', () => {
  describe('TC-COMP-012: Render', () => {
    it('renders database name in smaller text', () => {
      render(<TableNode data={defaultNodeData} />);

      const databaseNameElement = screen.getByText('sales_db');
      expect(databaseNameElement).toBeInTheDocument();
      expect(databaseNameElement).toHaveClass('text-xs');
      expect(databaseNameElement).toHaveClass('text-slate-500');
    });

    it('renders table name in semibold font', () => {
      render(<TableNode data={defaultNodeData} />);

      const tableNameElement = screen.getByText('orders');
      expect(tableNameElement).toBeInTheDocument();
      expect(tableNameElement).toHaveClass('font-semibold');
      expect(tableNameElement).toHaveClass('text-slate-900');
    });

    it('has correct border and background styling', () => {
      const { container } = render(<TableNode data={defaultNodeData} />);

      const nodeElement = container.firstChild as HTMLElement;
      expect(nodeElement).toHaveClass('border-slate-400');
      expect(nodeElement).toHaveClass('bg-slate-100');
      expect(nodeElement).toHaveClass('border-2');
    });

    it('renders left (target) and right (source) handles', () => {
      render(<TableNode data={defaultNodeData} />);

      expect(screen.getByTestId('handle-target')).toHaveAttribute('data-position', 'left');
      expect(screen.getByTestId('handle-source')).toHaveAttribute('data-position', 'right');
    });

    it('has shadow-md styling', () => {
      const { container } = render(<TableNode data={defaultNodeData} />);

      const nodeElement = container.firstChild as HTMLElement;
      expect(nodeElement).toHaveClass('shadow-md');
    });

    it('has rounded-lg border radius', () => {
      const { container } = render(<TableNode data={defaultNodeData} />);

      const nodeElement = container.firstChild as HTMLElement;
      expect(nodeElement).toHaveClass('rounded-lg');
    });
  });
});
