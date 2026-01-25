import { memo } from 'react';
import { ChevronDown, ChevronRight, Table, Eye, Layers } from 'lucide-react';

export type AssetType = 'table' | 'view' | 'materialized_view';

export interface TableNodeHeaderProps {
  databaseName: string;
  tableName: string;
  assetType: AssetType;
  isExpanded: boolean;
  columnCount: number;
  onToggleExpand: () => void;
}

const AssetIcon = ({ type }: { type: AssetType }) => {
  switch (type) {
    case 'view':
      return <Eye className="w-3.5 h-3.5 text-orange-600" />;
    case 'materialized_view':
      return <Layers className="w-3.5 h-3.5 text-violet-600" />;
    default:
      return <Table className="w-3.5 h-3.5 text-emerald-600" />;
  }
};

// Get header background class based on asset type
const getHeaderBgClass = (type: AssetType): string => {
  switch (type) {
    case 'view':
      return 'bg-orange-50 border-b border-orange-200 hover:bg-orange-100';
    case 'materialized_view':
      return 'bg-violet-50 border-b border-violet-200 hover:bg-violet-100';
    default:
      return 'bg-slate-50 border-b border-slate-200 hover:bg-slate-100';
  }
};

// Get asset type badge
const AssetTypeBadge = ({ type }: { type: AssetType }) => {
  if (type === 'table') return null;

  const badgeClass = type === 'view'
    ? 'bg-orange-100 text-orange-700 border-orange-200'
    : 'bg-violet-100 text-violet-700 border-violet-200';
  const label = type === 'view' ? 'VIEW' : 'MVIEW';

  return (
    <span className={`ml-1.5 px-1.5 py-0.5 text-[9px] font-bold rounded border ${badgeClass}`}>
      {label}
    </span>
  );
};

export const TableNodeHeader = memo(function TableNodeHeader({
  databaseName,
  tableName,
  assetType,
  isExpanded,
  columnCount,
  onToggleExpand,
}: TableNodeHeaderProps) {
  const headerBgClass = getHeaderBgClass(assetType);

  return (
    <div
      className={`flex items-center justify-between h-10 px-3 rounded-t-lg cursor-pointer transition-colors ${headerBgClass}`}
      onClick={(e) => {
        e.stopPropagation();
        onToggleExpand();
      }}
      data-testid="table-node-header"
    >
      <div className="flex items-center gap-2 min-w-0">
        <AssetIcon type={assetType} />
        <div className="flex flex-col min-w-0">
          <span className="text-xs text-slate-500 truncate" title={databaseName}>
            {databaseName}
          </span>
          <div className="flex items-center">
            <span className="text-sm font-semibold text-slate-800 truncate" title={tableName}>
              {tableName}
            </span>
            <AssetTypeBadge type={assetType} />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-400">
          {columnCount} col{columnCount !== 1 ? 's' : ''}
        </span>
        <button
          className="p-0.5 hover:bg-slate-200 rounded transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            onToggleExpand();
          }}
          aria-label={isExpanded ? 'Collapse columns' : 'Expand columns'}
        >
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-slate-500" />
          ) : (
            <ChevronRight className="w-4 h-4 text-slate-500" />
          )}
        </button>
      </div>
    </div>
  );
});
