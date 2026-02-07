import React from 'react';
import { Search, Maximize2, Download, ChevronDown, Focus, Filter, Crosshair } from 'lucide-react';
import { Tooltip } from '../../common/Tooltip';

export type ViewMode = 'graph' | 'table';
export type Direction = 'upstream' | 'downstream' | 'both';
export type AssetTypeFilter = 'table' | 'view' | 'materialized_view';

export interface ToolbarProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  direction: Direction;
  onDirectionChange: (direction: Direction) => void;
  depth: number;
  onDepthChange: (depth: number) => void;
  maxDepth?: number;
  minDepth?: number;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onFitView: () => void;
  onFitToSelection?: () => void;
  hasSelection?: boolean;
  onExport?: () => void;
  onFullscreen?: () => void;
  isLoading?: boolean;
  assetTypeFilter?: AssetTypeFilter[];
  onAssetTypeFilterChange?: (types: AssetTypeFilter[]) => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  viewMode,
  onViewModeChange,
  direction,
  onDirectionChange,
  depth,
  onDepthChange,
  maxDepth = 10,
  minDepth = 1,
  searchQuery,
  onSearchChange,
  onFitView,
  onFitToSelection,
  hasSelection = false,
  onExport,
  onFullscreen,
  isLoading = false,
  assetTypeFilter = ['table', 'view', 'materialized_view'],
  onAssetTypeFilterChange,
}) => {
  const [showAssetTypeDropdown, setShowAssetTypeDropdown] = React.useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowAssetTypeDropdown(false);
      }
    };

    if (showAssetTypeDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showAssetTypeDropdown]);

  const handleAssetTypeToggle = (type: AssetTypeFilter) => {
    if (!onAssetTypeFilterChange) return;

    const newFilter = assetTypeFilter.includes(type)
      ? assetTypeFilter.filter(t => t !== type)
      : [...assetTypeFilter, type];

    // Ensure at least one type is always selected
    if (newFilter.length > 0) {
      onAssetTypeFilterChange(newFilter);
    }
  };

  const getAssetTypeLabel = () => {
    if (assetTypeFilter.length === 3) return 'All Types';
    if (assetTypeFilter.length === 1) {
      if (assetTypeFilter[0] === 'table') return 'Tables Only';
      if (assetTypeFilter[0] === 'view') return 'Views Only';
      return 'Materialized Views';
    }
    return `${assetTypeFilter.length} Types`;
  };
  const graphButtonClass = viewMode === 'graph'
    ? 'bg-blue-500 text-white'
    : 'bg-white text-slate-600 hover:bg-slate-50';

  const tableButtonClass = viewMode === 'table'
    ? 'bg-blue-500 text-white'
    : 'bg-white text-slate-600 hover:bg-slate-50';

  return (
    <div
      data-testid="lineage-toolbar"
      className="flex items-center gap-4 p-3 bg-white border-b border-slate-200"
      role="toolbar"
      aria-label="Lineage graph controls"
    >
      {/* View Mode Toggle */}
      <Tooltip content="Switch between visual graph and tabular list views" position="bottom">
        <div className="flex rounded-lg border border-slate-200 overflow-hidden">
          <button
            onClick={() => onViewModeChange('graph')}
            className={`px-3 py-1.5 text-sm font-medium transition-colors ${graphButtonClass}`}
            aria-pressed={viewMode === 'graph'}
          >
            Graph
          </button>
          <button
            onClick={() => onViewModeChange('table')}
            className={`px-3 py-1.5 text-sm font-medium transition-colors ${tableButtonClass}`}
            aria-pressed={viewMode === 'table'}
          >
            Table
          </button>
        </div>
      </Tooltip>

      {/* Search */}
      <div className="flex-1 max-w-xs relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search columns..."
          className="w-full pl-9 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          aria-label="Search columns"
        />
      </div>

      {/* Direction Dropdown */}
      <Tooltip
        content="Upstream = data sources, Downstream = data consumers"
        position="bottom"
      >
        <div className="relative">
          <label htmlFor="direction-select" className="sr-only">
            Lineage direction
          </label>
          <select
            id="direction-select"
            value={direction}
            onChange={(e) => onDirectionChange(e.target.value as Direction)}
            className="appearance-none pl-3 pr-8 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="both">Both</option>
            <option value="upstream">Upstream</option>
            <option value="downstream">Downstream</option>
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        </div>
      </Tooltip>

      {/* Asset Type Filter */}
      {onAssetTypeFilterChange && (
        <Tooltip
          content="Filter by asset type: tables, views, or materialized views"
          position="bottom"
        >
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setShowAssetTypeDropdown(!showAssetTypeDropdown)}
              className="flex items-center gap-2 pl-3 pr-8 py-1.5 text-sm border border-slate-200 rounded-lg bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-haspopup="listbox"
              aria-expanded={showAssetTypeDropdown}
              data-testid="asset-type-filter-btn"
            >
              <Filter className="w-4 h-4 text-slate-400" />
              {getAssetTypeLabel()}
            </button>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />

            {showAssetTypeDropdown && (
              <div
                className="absolute top-full left-0 mt-1 w-48 bg-white border border-slate-200 rounded-lg shadow-lg z-50"
                role="listbox"
                aria-label="Asset type filter options"
              >
                <label className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={assetTypeFilter.includes('table')}
                    onChange={() => handleAssetTypeToggle('table')}
                    className="w-4 h-4 text-blue-500 rounded border-slate-300 focus:ring-blue-500"
                    data-testid="filter-tables-checkbox"
                  />
                  <span className="text-sm text-slate-700">Tables</span>
                </label>
                <label className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={assetTypeFilter.includes('view')}
                    onChange={() => handleAssetTypeToggle('view')}
                    className="w-4 h-4 text-blue-500 rounded border-slate-300 focus:ring-blue-500"
                    data-testid="filter-views-checkbox"
                  />
                  <span className="text-sm text-slate-700">Views</span>
                </label>
                <label className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={assetTypeFilter.includes('materialized_view')}
                    onChange={() => handleAssetTypeToggle('materialized_view')}
                    className="w-4 h-4 text-blue-500 rounded border-slate-300 focus:ring-blue-500"
                    data-testid="filter-materialized-views-checkbox"
                  />
                  <span className="text-sm text-slate-700">Materialized Views</span>
                </label>
              </div>
            )}
          </div>
        </Tooltip>
      )}

      {/* Depth Slider */}
      <Tooltip
        content="Number of hops to traverse in the lineage graph"
        position="bottom"
      >
        <div className="flex items-center gap-2">
          <label htmlFor="depth-slider" className="text-sm text-slate-600">
            Depth:
          </label>
          <input
            id="depth-slider"
            type="range"
            min={minDepth}
            max={maxDepth}
            value={depth}
            onChange={(e) => onDepthChange(parseInt(e.target.value, 10))}
            className="w-24 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
            aria-valuemin={minDepth}
            aria-valuemax={maxDepth}
            aria-valuenow={depth}
          />
          <span className="text-sm font-medium text-slate-700 w-6">{depth}</span>
        </div>
      </Tooltip>

      {/* Action Buttons */}
      <div className="flex items-center gap-1 ml-auto">
        <Tooltip content="Center and zoom to fit all nodes" position="bottom">
          <button
            onClick={onFitView}
            disabled={isLoading}
            className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
            aria-label="Fit to view"
          >
            <Focus className="w-4 h-4" />
          </button>
        </Tooltip>

        {onFitToSelection && (
          <Tooltip content="Center viewport on selected lineage path" position="bottom">
            <button
              onClick={onFitToSelection}
              disabled={isLoading || !hasSelection}
              className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
              aria-label="Fit to selection"
            >
              <Crosshair className="w-4 h-4" />
            </button>
          </Tooltip>
        )}

        {onExport && (
          <Tooltip content="Export graph as image" position="bottom">
            <button
              onClick={onExport}
              disabled={isLoading}
              className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
              aria-label="Export graph"
            >
              <Download className="w-4 h-4" />
            </button>
          </Tooltip>
        )}

        {onFullscreen && (
          <Tooltip content="Toggle fullscreen mode" position="bottom">
            <button
              onClick={onFullscreen}
              disabled={isLoading}
              className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
              aria-label="Toggle fullscreen"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </Tooltip>
        )}
      </div>

      {/* Loading indicator */}
      {isLoading && (
        <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      )}
    </div>
  );
};
