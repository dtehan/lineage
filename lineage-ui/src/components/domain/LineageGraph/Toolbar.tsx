import React from 'react';
import { Search, Maximize2, Download, ChevronDown, Focus } from 'lucide-react';
import { Tooltip } from '../../common/Tooltip';

export type ViewMode = 'graph' | 'table';
export type Direction = 'upstream' | 'downstream' | 'both';

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
  onExport?: () => void;
  onFullscreen?: () => void;
  isLoading?: boolean;
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
  onExport,
  onFullscreen,
  isLoading = false,
}) => {
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
