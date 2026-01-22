import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';

interface TableNodeProps {
  data: {
    databaseName: string;
    tableName: string;
    label: string;
  };
}

export const TableNode = memo(function TableNode({ data }: TableNodeProps) {
  return (
    <div className="px-4 py-3 rounded-lg border-2 border-slate-400 bg-slate-100 shadow-md">
      <Handle
        type="target"
        position={Position.Left}
        className="w-3 h-3 !bg-slate-500"
      />
      <div className="flex flex-col">
        <span className="text-xs text-slate-500">{data.databaseName}</span>
        <span className="text-sm font-semibold text-slate-900">{data.tableName}</span>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="w-3 h-3 !bg-slate-500"
      />
    </div>
  );
});
