import { memo, useCallback } from 'react';
import { Handle, Position } from '@xyflow/react';
import { useLineageStore } from '../../../../stores/useLineageStore';
import { TableNodeHeader, AssetType } from './TableNodeHeader';
import { ColumnRow, ColumnDefinition } from './ColumnRow';

export interface TableNodeData {
  id: string;
  databaseName: string;
  tableName: string;
  columns: ColumnDefinition[];
  isExpanded: boolean;
  assetType: AssetType;
  [key: string]: unknown; // Index signature for React Flow compatibility
}

export interface TableNodeProps {
  id: string;
  data: TableNodeData;
}

export const TableNode = memo(function TableNode({ id, data }: TableNodeProps) {
  const {
    selectedAssetId,
    highlightedNodeIds,
    expandedTables,
    toggleTableExpanded,
    setSelectedAssetId,
  } = useLineageStore();

  // Check if this table is expanded
  // If explicitly set in the map, use that value; otherwise use the default from data
  const isExpanded = expandedTables.has(id)
    ? expandedTables.get(id)!
    : data.isExpanded;

  // Determine if any column in this table is highlighted
  const hasHighlightedColumn = data.columns.some((col) => highlightedNodeIds.has(col.id));
  const hasSelection = highlightedNodeIds.size > 0;
  const isTableDimmed = hasSelection && !hasHighlightedColumn && selectedAssetId !== null;

  // Get default border color based on asset type
  const getDefaultBorderColor = () => {
    switch (data.assetType) {
      case 'view':
        return 'border-orange-300';
      case 'materialized_view':
        return 'border-violet-300';
      default:
        return 'border-slate-200';
    }
  };

  // Get border color based on state
  const getBorderColor = () => {
    if (data.columns.some((col) => col.id === selectedAssetId)) {
      return 'border-blue-500';
    }
    if (hasHighlightedColumn) {
      return 'border-green-500';
    }
    return getDefaultBorderColor();
  };

  const handleToggleExpand = useCallback(() => {
    toggleTableExpanded(id, data.isExpanded);
  }, [id, data.isExpanded, toggleTableExpanded]);

  const handleColumnClick = useCallback(
    (columnId: string) => {
      setSelectedAssetId(columnId);
    },
    [setSelectedAssetId]
  );

  return (
    <div
      className={`
        min-w-[280px] max-w-[400px]
        bg-white rounded-lg border-2 shadow-md
        transition-all duration-200
        ${getBorderColor()}
      `}
      style={{ opacity: isTableDimmed ? 0.2 : 1 }}
      data-testid={`table-node-${id}`}
    >
      <TableNodeHeader
        databaseName={data.databaseName}
        tableName={data.tableName}
        assetType={data.assetType}
        isExpanded={isExpanded}
        columnCount={data.columns.length}
        onToggleExpand={handleToggleExpand}
      />

      {isExpanded && (
        <div className="py-1">
          {data.columns.map((column) => {
            const isColumnSelected = selectedAssetId === column.id;
            const isColumnHighlighted = highlightedNodeIds.has(column.id);
            const isColumnDimmed =
              hasSelection && !isColumnHighlighted && !isColumnSelected;

            return (
              <ColumnRow
                key={column.id}
                column={column}
                tableId={id}
                isSelected={isColumnSelected}
                isHighlighted={isColumnHighlighted}
                isDimmed={isColumnDimmed}
                onClick={handleColumnClick}
              />
            );
          })}
        </div>
      )}

      {!isExpanded && (
        <div className="py-2 px-3 text-xs text-slate-400 italic">
          {data.columns.length} column{data.columns.length !== 1 ? 's' : ''} hidden
        </div>
      )}

      {/* Handles for all columns - rendered regardless of expansion state when collapsed */}
      {/* This ensures edges remain visible even when table is collapsed */}
      {!isExpanded && data.columns.map((column) => (
        <div key={column.id}>
          {/* Target handle (left side - incoming edges) */}
          <Handle
            type="target"
            position={Position.Left}
            id={`${id}-${column.id}-target`}
            className="!w-1 !h-1 !bg-transparent !border-0"
            style={{ top: '50%', opacity: 0 }}
          />
          {/* Source handle (right side - outgoing edges) */}
          <Handle
            type="source"
            position={Position.Right}
            id={`${id}-${column.id}-source`}
            className="!w-1 !h-1 !bg-transparent !border-0"
            style={{ top: '50%', opacity: 0 }}
          />
        </div>
      ))}
    </div>
  );
});
