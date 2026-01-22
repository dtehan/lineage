import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { useLineageStore } from '../../../stores/useLineageStore';

interface ColumnNodeProps {
  id: string;
  data: {
    databaseName: string;
    tableName: string;
    columnName: string;
    label: string;
  };
}

export const ColumnNode = memo(function ColumnNode({ data, id }: ColumnNodeProps) {
  const { selectedAssetId, highlightedNodeIds } = useLineageStore();

  const isSelected = selectedAssetId === id;
  const isHighlighted = highlightedNodeIds.has(id);

  return (
    <div
      className={`
        px-4 py-2 rounded-lg border-2 shadow-sm transition-all
        ${isSelected
          ? 'bg-blue-100 border-blue-500 ring-2 ring-blue-300'
          : isHighlighted
            ? 'bg-blue-50 border-blue-400'
            : 'bg-white border-slate-300 hover:border-slate-400'
        }
      `}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="w-3 h-3 !bg-slate-400"
      />
      <div className="flex flex-col">
        <span className="text-xs text-slate-500 truncate max-w-[200px]">
          {data.databaseName}.{data.tableName}
        </span>
        <span className="text-sm font-medium text-slate-900 truncate max-w-[200px]">
          {data.columnName}
        </span>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="w-3 h-3 !bg-slate-400"
      />
    </div>
  );
});
