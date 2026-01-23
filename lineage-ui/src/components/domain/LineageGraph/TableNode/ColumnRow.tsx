import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Tooltip } from '../../../common/Tooltip';

export interface ColumnDefinition {
  id: string;
  name: string;
  dataType: string;
  isPrimaryKey?: boolean;
  isForeignKey?: boolean;
  hasUpstreamLineage?: boolean;
  hasDownstreamLineage?: boolean;
}

export interface ColumnRowProps {
  column: ColumnDefinition;
  tableId: string;
  isSelected: boolean;
  isHighlighted: boolean;
  isDimmed: boolean;
  onClick?: (columnId: string) => void;
}

export const ColumnRow = memo(function ColumnRow({
  column,
  tableId,
  isSelected,
  isHighlighted,
  isDimmed,
  onClick,
}: ColumnRowProps) {
  const getRowClassName = () => {
    const base = 'relative flex items-center justify-between h-7 px-3 transition-all cursor-pointer';

    if (isSelected) {
      return `${base} bg-blue-100 border-l-2 border-blue-500`;
    }
    if (isHighlighted) {
      return `${base} bg-green-50 border-l-2 border-green-500`;
    }
    return `${base} hover:bg-slate-50 border-l-2 border-transparent`;
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClick?.(column.id);
  };

  return (
    <div
      className={getRowClassName()}
      style={{ opacity: isDimmed ? 0.2 : 1 }}
      onClick={handleClick}
      data-testid={`column-row-${column.id}`}
      data-column-id={column.id}
    >
      {/* Target handle (left side - incoming edges) */}
      <Handle
        type="target"
        position={Position.Left}
        id={`${tableId}-${column.id}-target`}
        className="!w-2 !h-2 !bg-slate-400 !border-slate-500 !border"
      />

      {/* Column name with optional key indicators */}
      <div className="flex items-center gap-1.5 min-w-0">
        {column.isPrimaryKey && (
          <Tooltip content="Primary Key - uniquely identifies each row" position="top">
            <span className="text-amber-500 text-xs font-semibold cursor-help">
              PK
            </span>
          </Tooltip>
        )}
        {column.isForeignKey && (
          <Tooltip content="Foreign Key - references another table's primary key" position="top">
            <span className="text-blue-500 text-xs font-semibold cursor-help">
              FK
            </span>
          </Tooltip>
        )}
        <Tooltip content={column.name} position="top" disabled={column.name.length < 20}>
          <span className="text-sm font-medium text-slate-800 truncate">
            {column.name}
          </span>
        </Tooltip>
      </div>

      {/* Data type */}
      <Tooltip content={`Data type: ${column.dataType}`} position="top">
        <span className="text-xs text-slate-500 ml-2 flex-shrink-0 cursor-help">
          {column.dataType}
        </span>
      </Tooltip>

      {/* Source handle (right side - outgoing edges) */}
      <Handle
        type="source"
        position={Position.Right}
        id={`${tableId}-${column.id}-source`}
        className="!w-2 !h-2 !bg-slate-400 !border-slate-500 !border"
      />
    </div>
  );
});
