import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Toolbar, ViewMode, Direction, AssetTypeFilter } from './Toolbar';

describe('Toolbar', () => {
  const defaultProps = {
    viewMode: 'graph' as ViewMode,
    onViewModeChange: vi.fn(),
    direction: 'both' as Direction,
    onDirectionChange: vi.fn(),
    depth: 3,
    onDepthChange: vi.fn(),
    searchQuery: '',
    onSearchChange: vi.fn(),
    onFitView: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('TC-COMP-022: Toolbar rendering', () => {
    it('renders the toolbar', () => {
      render(<Toolbar {...defaultProps} />);
      expect(screen.getByTestId('lineage-toolbar')).toBeInTheDocument();
    });

    it('has correct toolbar role', () => {
      render(<Toolbar {...defaultProps} />);
      expect(screen.getByRole('toolbar')).toBeInTheDocument();
    });

    it('has correct aria-label', () => {
      render(<Toolbar {...defaultProps} />);
      expect(screen.getByRole('toolbar')).toHaveAttribute(
        'aria-label',
        'Lineage graph controls'
      );
    });
  });

  describe('TC-COMP-023: View mode toggle', () => {
    it('renders Graph and Table buttons', () => {
      render(<Toolbar {...defaultProps} />);
      expect(screen.getByText('Graph')).toBeInTheDocument();
      expect(screen.getByText('Table')).toBeInTheDocument();
    });

    it('Graph button is pressed when viewMode is graph', () => {
      render(<Toolbar {...defaultProps} viewMode="graph" />);
      expect(screen.getByText('Graph')).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByText('Table')).toHaveAttribute('aria-pressed', 'false');
    });

    it('Table button is pressed when viewMode is table', () => {
      render(<Toolbar {...defaultProps} viewMode="table" />);
      expect(screen.getByText('Graph')).toHaveAttribute('aria-pressed', 'false');
      expect(screen.getByText('Table')).toHaveAttribute('aria-pressed', 'true');
    });

    it('calls onViewModeChange when Graph is clicked', () => {
      const onViewModeChange = vi.fn();
      render(<Toolbar {...defaultProps} viewMode="table" onViewModeChange={onViewModeChange} />);

      fireEvent.click(screen.getByText('Graph'));
      expect(onViewModeChange).toHaveBeenCalledWith('graph');
    });

    it('calls onViewModeChange when Table is clicked', () => {
      const onViewModeChange = vi.fn();
      render(<Toolbar {...defaultProps} viewMode="graph" onViewModeChange={onViewModeChange} />);

      fireEvent.click(screen.getByText('Table'));
      expect(onViewModeChange).toHaveBeenCalledWith('table');
    });
  });

  describe('TC-COMP-024: Search input', () => {
    it('renders search input', () => {
      render(<Toolbar {...defaultProps} />);
      expect(screen.getByLabelText('Search columns')).toBeInTheDocument();
    });

    it('displays current search query', () => {
      render(<Toolbar {...defaultProps} searchQuery="customer" />);
      expect(screen.getByLabelText('Search columns')).toHaveValue('customer');
    });

    it('calls onSearchChange when typing', () => {
      const onSearchChange = vi.fn();
      render(<Toolbar {...defaultProps} onSearchChange={onSearchChange} />);

      fireEvent.change(screen.getByLabelText('Search columns'), {
        target: { value: 'test' },
      });
      expect(onSearchChange).toHaveBeenCalledWith('test');
    });

    it('has placeholder text', () => {
      render(<Toolbar {...defaultProps} />);
      expect(screen.getByPlaceholderText('Search columns...')).toBeInTheDocument();
    });
  });

  describe('TC-COMP-025: Direction dropdown', () => {
    it('renders direction select', () => {
      render(<Toolbar {...defaultProps} />);
      expect(screen.getByLabelText('Lineage direction')).toBeInTheDocument();
    });

    it('displays all direction options', () => {
      render(<Toolbar {...defaultProps} />);
      const select = screen.getByLabelText('Lineage direction');

      expect(select).toContainHTML('<option value="both">Both</option>');
      expect(select).toContainHTML('<option value="upstream">Upstream</option>');
      expect(select).toContainHTML('<option value="downstream">Downstream</option>');
    });

    it('shows current direction as selected', () => {
      render(<Toolbar {...defaultProps} direction="upstream" />);
      expect(screen.getByLabelText('Lineage direction')).toHaveValue('upstream');
    });

    it('calls onDirectionChange when changed', () => {
      const onDirectionChange = vi.fn();
      render(<Toolbar {...defaultProps} onDirectionChange={onDirectionChange} />);

      fireEvent.change(screen.getByLabelText('Lineage direction'), {
        target: { value: 'downstream' },
      });
      expect(onDirectionChange).toHaveBeenCalledWith('downstream');
    });
  });

  describe('TC-COMP-026: Depth slider', () => {
    it('renders depth slider', () => {
      render(<Toolbar {...defaultProps} />);
      expect(screen.getByLabelText(/Depth/)).toBeInTheDocument();
    });

    it('displays current depth value', () => {
      render(<Toolbar {...defaultProps} depth={5} />);
      expect(screen.getByText('5')).toBeInTheDocument();
    });

    it('calls onDepthChange when slider changes', () => {
      const onDepthChange = vi.fn();
      render(<Toolbar {...defaultProps} onDepthChange={onDepthChange} />);

      const slider = screen.getByRole('slider');
      fireEvent.change(slider, { target: { value: '7' } });
      expect(onDepthChange).toHaveBeenCalledWith(7);
    });

    it('respects minDepth and maxDepth', () => {
      render(<Toolbar {...defaultProps} minDepth={2} maxDepth={8} />);
      const slider = screen.getByRole('slider');

      expect(slider).toHaveAttribute('min', '2');
      expect(slider).toHaveAttribute('max', '8');
    });
  });

  describe('TC-COMP-027: Action buttons', () => {
    it('renders fit to view button', () => {
      render(<Toolbar {...defaultProps} />);
      expect(screen.getByLabelText('Fit to view')).toBeInTheDocument();
    });

    it('calls onFitView when fit button is clicked', () => {
      const onFitView = vi.fn();
      render(<Toolbar {...defaultProps} onFitView={onFitView} />);

      fireEvent.click(screen.getByLabelText('Fit to view'));
      expect(onFitView).toHaveBeenCalledTimes(1);
    });

    it('renders export button when onExport is provided', () => {
      const onExport = vi.fn();
      render(<Toolbar {...defaultProps} onExport={onExport} />);
      expect(screen.getByLabelText('Export graph')).toBeInTheDocument();
    });

    it('does not render export button when onExport is not provided', () => {
      render(<Toolbar {...defaultProps} />);
      expect(screen.queryByLabelText('Export graph')).not.toBeInTheDocument();
    });

    it('calls onExport when export button is clicked', () => {
      const onExport = vi.fn();
      render(<Toolbar {...defaultProps} onExport={onExport} />);

      fireEvent.click(screen.getByLabelText('Export graph'));
      expect(onExport).toHaveBeenCalledTimes(1);
    });

    it('renders fullscreen button when onFullscreen is provided', () => {
      const onFullscreen = vi.fn();
      render(<Toolbar {...defaultProps} onFullscreen={onFullscreen} />);
      expect(screen.getByLabelText('Toggle fullscreen')).toBeInTheDocument();
    });
  });

  describe('TC-COMP-028: Loading state', () => {
    it('shows loading indicator when isLoading is true', () => {
      render(<Toolbar {...defaultProps} isLoading={true} />);
      expect(screen.getByTestId('lineage-toolbar').querySelector('.animate-spin')).toBeInTheDocument();
    });

    it('does not show loading indicator when isLoading is false', () => {
      render(<Toolbar {...defaultProps} isLoading={false} />);
      expect(screen.getByTestId('lineage-toolbar').querySelector('.animate-spin')).not.toBeInTheDocument();
    });

    it('disables buttons when isLoading is true', () => {
      render(<Toolbar {...defaultProps} isLoading={true} onExport={vi.fn()} />);
      expect(screen.getByLabelText('Fit to view')).toBeDisabled();
      expect(screen.getByLabelText('Export graph')).toBeDisabled();
    });
  });

  describe('TC-COMP-019a: Asset Type Filter Dropdown', () => {
    const filterProps = {
      ...defaultProps,
      assetTypeFilter: ['table', 'view', 'materialized_view'] as AssetTypeFilter[],
      onAssetTypeFilterChange: vi.fn(),
    };

    it('renders asset type filter button when onAssetTypeFilterChange is provided', () => {
      render(<Toolbar {...filterProps} />);
      expect(screen.getByTestId('asset-type-filter-btn')).toBeInTheDocument();
    });

    it('does not render asset type filter when onAssetTypeFilterChange is not provided', () => {
      render(<Toolbar {...defaultProps} />);
      expect(screen.queryByTestId('asset-type-filter-btn')).not.toBeInTheDocument();
    });

    it('shows "All Types" label when all types are selected', () => {
      render(<Toolbar {...filterProps} />);
      expect(screen.getByText('All Types')).toBeInTheDocument();
    });

    it('shows "Tables Only" label when only tables are selected', () => {
      render(
        <Toolbar
          {...filterProps}
          assetTypeFilter={['table']}
        />
      );
      expect(screen.getByText('Tables Only')).toBeInTheDocument();
    });

    it('shows "Views Only" label when only views are selected', () => {
      render(
        <Toolbar
          {...filterProps}
          assetTypeFilter={['view']}
        />
      );
      expect(screen.getByText('Views Only')).toBeInTheDocument();
    });

    it('shows count label when multiple but not all types are selected', () => {
      render(
        <Toolbar
          {...filterProps}
          assetTypeFilter={['table', 'view']}
        />
      );
      expect(screen.getByText('2 Types')).toBeInTheDocument();
    });

    it('opens dropdown when filter button is clicked', () => {
      render(<Toolbar {...filterProps} />);

      fireEvent.click(screen.getByTestId('asset-type-filter-btn'));

      expect(screen.getByTestId('filter-tables-checkbox')).toBeInTheDocument();
      expect(screen.getByTestId('filter-views-checkbox')).toBeInTheDocument();
      expect(screen.getByTestId('filter-materialized-views-checkbox')).toBeInTheDocument();
    });

    it('checkboxes reflect current filter state', () => {
      render(
        <Toolbar
          {...filterProps}
          assetTypeFilter={['table', 'view']}
        />
      );

      fireEvent.click(screen.getByTestId('asset-type-filter-btn'));

      expect(screen.getByTestId('filter-tables-checkbox')).toBeChecked();
      expect(screen.getByTestId('filter-views-checkbox')).toBeChecked();
      expect(screen.getByTestId('filter-materialized-views-checkbox')).not.toBeChecked();
    });

    it('calls onAssetTypeFilterChange when checkbox is toggled', () => {
      const onAssetTypeFilterChange = vi.fn();
      render(
        <Toolbar
          {...filterProps}
          onAssetTypeFilterChange={onAssetTypeFilterChange}
        />
      );

      fireEvent.click(screen.getByTestId('asset-type-filter-btn'));
      fireEvent.click(screen.getByTestId('filter-tables-checkbox'));

      expect(onAssetTypeFilterChange).toHaveBeenCalledWith(['view', 'materialized_view']);
    });

    it('adds type when unchecked checkbox is clicked', () => {
      const onAssetTypeFilterChange = vi.fn();
      render(
        <Toolbar
          {...filterProps}
          assetTypeFilter={['table', 'view']}
          onAssetTypeFilterChange={onAssetTypeFilterChange}
        />
      );

      fireEvent.click(screen.getByTestId('asset-type-filter-btn'));
      fireEvent.click(screen.getByTestId('filter-materialized-views-checkbox'));

      expect(onAssetTypeFilterChange).toHaveBeenCalledWith(['table', 'view', 'materialized_view']);
    });

    it('does not allow unchecking the last selected type', () => {
      const onAssetTypeFilterChange = vi.fn();
      render(
        <Toolbar
          {...filterProps}
          assetTypeFilter={['table']}
          onAssetTypeFilterChange={onAssetTypeFilterChange}
        />
      );

      fireEvent.click(screen.getByTestId('asset-type-filter-btn'));
      fireEvent.click(screen.getByTestId('filter-tables-checkbox'));

      // Should not call onAssetTypeFilterChange since it would result in empty array
      expect(onAssetTypeFilterChange).not.toHaveBeenCalled();
    });
  });
});
