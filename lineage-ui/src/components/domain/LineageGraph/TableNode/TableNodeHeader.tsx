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
      return <Eye className="w-3.5 h-3.5 text-blue-500" />;
    case 'materialized_view':
      return <Layers className="w-3.5 h-3.5 text-purple-500" />;
    default:
      return <Table className="w-3.5 h-3.5 text-slate-500" />;
  }
};

export const TableNodeHeader = memo(function TableNodeHeader({
  databaseName,
  tableName,
  assetType,
  isExpanded,
  columnCount,
  onToggleExpand,
}: TableNodeHeaderProps) {
  return (
    <div
      className="flex items-center justify-between h-10 px-3 bg-slate-50 border-b border-slate-200 rounded-t-lg cursor-pointer hover:bg-slate-100 transition-colors"
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
          <span className="text-sm font-semibold text-slate-800 truncate" title={tableName}>
            {tableName}
          </span>
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
