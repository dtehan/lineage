import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ImpactSummary } from './ImpactSummary';
import type { ImpactSummaryData } from '../../../types/openlineage';

const mockSummary: ImpactSummaryData = {
  totalImpacted: 5,
  tableCount: 3,
  columnCount: 5,
  databaseCount: 2,
  byDatabase: { demo_user: 3, analytics: 2 },
  byDepth: { '1': 2, '2': 2, '3': 1 },
};

describe('ImpactSummary', () => {
  it('renders 4 summary cards', () => {
    const { container } = render(<ImpactSummary summary={mockSummary} />);

    const cards = container.querySelectorAll('div[class*="p-4"][class*="rounded-lg"]');
    expect(cards.length).toBe(4);
  });

  it('displays correct table count', () => {
    const { container } = render(<ImpactSummary summary={mockSummary} />);

    expect(screen.getByText('Tables Affected')).toBeInTheDocument();

    // Find the card with "Tables Affected" and check its value
    const tablesCard = Array.from(container.querySelectorAll('div[class*="p-4"]')).find(el =>
      el.textContent?.includes('Tables Affected')
    );
    expect(tablesCard?.textContent).toContain('3');
  });

  it('displays correct column count', () => {
    const { container } = render(<ImpactSummary summary={mockSummary} />);

    expect(screen.getByText('Columns Affected')).toBeInTheDocument();

    // Find the card with "Columns Affected" and check its value
    const columnsCard = Array.from(container.querySelectorAll('div[class*="p-4"]')).find(el =>
      el.textContent?.includes('Columns Affected')
    );
    expect(columnsCard?.textContent).toContain('5');
  });

  it('displays correct database count', () => {
    const { container } = render(<ImpactSummary summary={mockSummary} />);

    expect(screen.getByText('Databases')).toBeInTheDocument();

    // Find the card with "Databases" and check its value
    const databasesCard = Array.from(container.querySelectorAll('div[class*="p-4"]')).find(el =>
      el.textContent?.includes('Databases') && !el.textContent?.includes('Max')
    );
    expect(databasesCard?.textContent).toContain('2');
  });

  it('displays correct max depth', () => {
    const { container } = render(<ImpactSummary summary={mockSummary} />);

    expect(screen.getByText('Max Depth')).toBeInTheDocument();

    // Find the card with "Max Depth" and check its value
    // Max depth from byDepth keys: '1', '2', '3' = 3
    const maxDepthCard = Array.from(container.querySelectorAll('div[class*="p-4"]')).find(el =>
      el.textContent?.includes('Max Depth')
    );
    expect(maxDepthCard?.textContent).toContain('3');
  });

  it('handles summary with zero values', () => {
    const zeroSummary: ImpactSummaryData = {
      totalImpacted: 0,
      tableCount: 0,
      columnCount: 0,
      databaseCount: 0,
      byDatabase: {},
      byDepth: {},
    };

    const { container } = render(<ImpactSummary summary={zeroSummary} />);

    // Should still render 4 cards
    const cards = container.querySelectorAll('div[class*="p-4"][class*="rounded-lg"]');
    expect(cards.length).toBe(4);

    // Should display zeros
    expect(screen.getByText('Tables Affected')).toBeInTheDocument();
    expect(screen.getByText('Columns Affected')).toBeInTheDocument();
    expect(screen.getByText('Databases')).toBeInTheDocument();
    expect(screen.getByText('Max Depth')).toBeInTheDocument();

    // All values should be 0
    const zeroValues = screen.getAllByText('0');
    expect(zeroValues.length).toBeGreaterThanOrEqual(4);
  });
});
