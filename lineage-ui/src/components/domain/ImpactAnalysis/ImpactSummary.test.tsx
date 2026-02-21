import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ImpactSummary } from './ImpactSummary';
import type { ImpactSummaryData } from '../../../types/openlineage';

const mockSummary: ImpactSummaryData = {
  totalImpacted: 5,
  upstreamCount: 2,
  downstreamCount: 3,
  tableCount: 3,
  columnCount: 5,
  databaseCount: 2,
  byDatabase: { demo_user: 3, analytics: 2 },
  byDepth: { '1': 2, '2': 2, '3': 1 },
};

describe('ImpactSummary', () => {
  it('renders 6 summary cards', () => {
    const { container } = render(<ImpactSummary summary={mockSummary} />);

    const cards = container.querySelectorAll('div[class*="p-4"][class*="rounded-lg"]');
    expect(cards.length).toBe(6);
  });

  it('displays correct upstream count', () => {
    const { container } = render(<ImpactSummary summary={mockSummary} />);

    expect(screen.getByText('Upstream')).toBeInTheDocument();

    const upstreamCard = Array.from(container.querySelectorAll('div[class*="p-4"]')).find(el =>
      el.textContent?.includes('Upstream') && !el.textContent?.includes('Total')
    );
    expect(upstreamCard?.textContent).toContain('2');
  });

  it('displays correct downstream count', () => {
    const { container } = render(<ImpactSummary summary={mockSummary} />);

    expect(screen.getByText('Downstream')).toBeInTheDocument();

    const downstreamCard = Array.from(container.querySelectorAll('div[class*="p-4"]')).find(el =>
      el.textContent?.includes('Downstream')
    );
    expect(downstreamCard?.textContent).toContain('3');
  });

  it('displays correct table count', () => {
    const { container } = render(<ImpactSummary summary={mockSummary} />);

    expect(screen.getByText('Tables Affected')).toBeInTheDocument();

    const tablesCard = Array.from(container.querySelectorAll('div[class*="p-4"]')).find(el =>
      el.textContent?.includes('Tables Affected')
    );
    expect(tablesCard?.textContent).toContain('3');
  });

  it('displays correct database count', () => {
    const { container } = render(<ImpactSummary summary={mockSummary} />);

    expect(screen.getByText('Databases')).toBeInTheDocument();

    const databasesCard = Array.from(container.querySelectorAll('div[class*="p-4"]')).find(el =>
      el.textContent?.includes('Databases') && !el.textContent?.includes('Max')
    );
    expect(databasesCard?.textContent).toContain('2');
  });

  it('displays correct max depth', () => {
    const { container } = render(<ImpactSummary summary={mockSummary} />);

    expect(screen.getByText('Max Depth')).toBeInTheDocument();

    // Max depth from byDepth keys: '1', '2', '3' = 3
    const maxDepthCard = Array.from(container.querySelectorAll('div[class*="p-4"]')).find(el =>
      el.textContent?.includes('Max Depth')
    );
    expect(maxDepthCard?.textContent).toContain('3');
  });

  it('handles summary with zero values', () => {
    const zeroSummary: ImpactSummaryData = {
      totalImpacted: 0,
      upstreamCount: 0,
      downstreamCount: 0,
      tableCount: 0,
      columnCount: 0,
      databaseCount: 0,
      byDatabase: {},
      byDepth: {},
    };

    const { container } = render(<ImpactSummary summary={zeroSummary} />);

    // Should still render 6 cards
    const cards = container.querySelectorAll('div[class*="p-4"][class*="rounded-lg"]');
    expect(cards.length).toBe(6);

    // Should display all card titles
    expect(screen.getByText('Upstream')).toBeInTheDocument();
    expect(screen.getByText('Downstream')).toBeInTheDocument();
    expect(screen.getByText('Total Impacted')).toBeInTheDocument();
    expect(screen.getByText('Tables Affected')).toBeInTheDocument();
    expect(screen.getByText('Databases')).toBeInTheDocument();
    expect(screen.getByText('Max Depth')).toBeInTheDocument();
  });
});
