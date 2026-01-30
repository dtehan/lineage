import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, ChevronDown, Database, Table as TableIcon, Columns, Network, Eye, Layers } from 'lucide-react';
import { useDatabases, useTables, useColumns } from '../../../api/hooks/useAssets';
import { useLineageStore } from '../../../stores/useLineageStore';
import { LoadingSpinner } from '../../common/LoadingSpinner';
import { Tooltip } from '../../common/Tooltip';
import type { Table } from '../../../types';

// Helper to determine asset type from tableKind
const getAssetTypeFromTableKind = (tableKind: string): 'table' | 'view' | 'materialized_view' => {
  switch (tableKind) {
    case 'V':
      return 'view';
    case 'M':
      return 'materialized_view';
    default:
      return 'table';
  }
};

// Asset type icon component with distinct styling
const AssetTypeIcon = ({ tableKind }: { tableKind: string }) => {
  const assetType = getAssetTypeFromTableKind(tableKind);
  switch (assetType) {
    case 'view':
      return (
        <span className="inline-flex items-center mr-2" data-testid="view-icon">
          <Eye className="w-4 h-4 text-orange-600" />
          <span className="ml-1 px-1.5 py-0.5 text-[10px] font-semibold bg-orange-100 text-orange-700 rounded">VIEW</span>
        </span>
      );
    case 'materialized_view':
      return (
        <span className="inline-flex items-center mr-2" data-testid="materialized-view-icon">
          <Layers className="w-4 h-4 text-violet-600" />
          <span className="ml-1 px-1.5 py-0.5 text-[10px] font-semibold bg-violet-100 text-violet-700 rounded">MVIEW</span>
        </span>
      );
    default:
      return <TableIcon className="w-4 h-4 mr-2 text-emerald-600" data-testid="table-icon" />;
  }
};

// Get tooltip text for asset type
const getAssetTypeTooltip = (tableKind: string, tableName: string, databaseName: string): string => {
  const assetType = getAssetTypeFromTableKind(tableKind);
  const typeLabel = assetType === 'view' ? 'View' : assetType === 'materialized_view' ? 'Materialized View' : 'Table';
  return `View lineage for ${typeLabel.toLowerCase()} ${databaseName}.${tableName}`;
};

export function AssetBrowser() {
  const [expandedDatabases, setExpandedDatabases] = useState<Set<string>>(new Set());
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());
  const navigate = useNavigate();

  const { data: databasesResult, isLoading } = useDatabases();
  const databases = databasesResult?.data;

  const toggleDatabase = (dbName: string) => {
    setExpandedDatabases((prev) => {
      const next = new Set(prev);
      if (next.has(dbName)) {
        next.delete(dbName);
      } else {
        next.add(dbName);
      }
      return next;
    });
  };

  const toggleTable = (tableKey: string) => {
    setExpandedTables((prev) => {
      const next = new Set(prev);
      if (next.has(tableKey)) {
        next.delete(tableKey);
      } else {
        next.add(tableKey);
      }
      return next;
    });
  };

  const handleViewAllDatabases = () => {
    navigate('/lineage/all-databases');
  };

  if (isLoading) {
    return (
      <div className="p-4">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      <div className="p-2">
        {/* All Databases Lineage View Button */}
        <div className="mb-3">
          <Tooltip content="View lineage across all databases" position="right">
            <button
              onClick={handleViewAllDatabases}
              className="flex items-center w-full px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
              data-testid="all-databases-lineage-btn"
            >
              <Network className="w-4 h-4 mr-2" />
              View All Databases Lineage
            </button>
          </Tooltip>
        </div>

        <h2 className="px-2 py-1 text-sm font-semibold text-slate-700">Databases</h2>
        <ul className="space-y-1">
          {databases?.filter((db) => db.name !== 'All').map((db) => (
            <DatabaseItem
              key={db.id}
              database={db}
              isExpanded={expandedDatabases.has(db.name)}
              onToggle={() => toggleDatabase(db.name)}
              expandedTables={expandedTables}
              onToggleTable={toggleTable}
            />
          ))}
        </ul>
      </div>
    </div>
  );
}

interface DatabaseItemProps {
  database: { id: string; name: string };
  isExpanded: boolean;
  onToggle: () => void;
  expandedTables: Set<string>;
  onToggleTable: (key: string) => void;
}

function DatabaseItem({ database, isExpanded, onToggle, expandedTables, onToggleTable }: DatabaseItemProps) {
  const { data: tablesResult } = useTables(isExpanded ? database.name : '');
  const tables = tablesResult?.data;
  const navigate = useNavigate();

  const handleViewDatabaseLineage = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigate(`/lineage/database/${encodeURIComponent(database.name)}`);
  };

  return (
    <li>
      <div className="flex items-center w-full px-2 py-1 rounded hover:bg-slate-100 group">
        <button
          onClick={onToggle}
          className="flex items-center flex-1 text-left"
        >
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 mr-1 text-slate-500" />
          ) : (
            <ChevronRight className="w-4 h-4 mr-1 text-slate-500" />
          )}
          <Tooltip content="Database" position="right">
            <Database className="w-4 h-4 mr-2 text-blue-500" />
          </Tooltip>
          <span className="text-sm text-slate-700">{database.name}</span>
        </button>
        <Tooltip content={`View all lineage for ${database.name}`} position="left">
          <button
            onClick={handleViewDatabaseLineage}
            className="p-1 opacity-0 group-hover:opacity-100 hover:bg-slate-200 rounded transition-opacity"
            aria-label={`View lineage for database ${database.name}`}
            data-testid={`database-lineage-btn-${database.name}`}
          >
            <Eye className="w-4 h-4 text-blue-600" />
          </button>
        </Tooltip>
      </div>
      {isExpanded && tables && (
        <ul className="ml-4 mt-1 space-y-1">
          {tables.map((table) => {
            const tableKey = `${database.name}.${table.tableName}`;
            return (
              <TableItem
                key={table.id}
                databaseName={database.name}
                table={table}
                isExpanded={expandedTables.has(tableKey)}
                onToggle={() => onToggleTable(tableKey)}
              />
            );
          })}
        </ul>
      )}
    </li>
  );
}

interface TableItemProps {
  databaseName: string;
  table: Table;
  isExpanded: boolean;
  onToggle: () => void;
}

function TableItem({ databaseName, table, isExpanded, onToggle }: TableItemProps) {
  const { data: columnsResult } = useColumns(isExpanded ? databaseName : '', isExpanded ? table.tableName : '');
  const columns = columnsResult?.data;
  const { setSelectedAssetId } = useLineageStore();
  const navigate = useNavigate();

  // Navigate to table lineage view
  const handleTableClick = () => {
    // Use the table's asset ID to navigate to lineage page
    navigate(`/lineage/${encodeURIComponent(table.id)}`);
  };

  // Toggle expand/collapse (prevent navigation when clicking chevron)
  const handleChevronClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggle();
  };

  return (
    <li>
      <div className="flex items-center w-full px-2 py-1 rounded hover:bg-slate-100">
        <button
          onClick={handleChevronClick}
          className="p-0.5 hover:bg-slate-200 rounded"
          aria-label={isExpanded ? 'Collapse table' : 'Expand table'}
        >
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-slate-500" />
          ) : (
            <ChevronRight className="w-4 h-4 text-slate-500" />
          )}
        </button>
        <Tooltip content={getAssetTypeTooltip(table.tableKind, table.tableName, databaseName)} position="right">
          <button
            onClick={handleTableClick}
            className="flex items-center flex-1 ml-1 text-left hover:text-blue-600"
          >
            <AssetTypeIcon tableKind={table.tableKind} />
            <span className="text-sm text-slate-700 hover:text-blue-600">{table.tableName}</span>
          </button>
        </Tooltip>
      </div>
      {isExpanded && columns && (
        <ul className="ml-4 mt-1 space-y-1">
          {columns.map((column) => (
            <li key={column.id}>
              <Tooltip content={`View lineage for column ${column.columnName}`} position="right">
                <button
                  onClick={() => setSelectedAssetId(column.id)}
                  className="flex items-center w-full px-2 py-1 text-left rounded hover:bg-blue-50"
                >
                  <Columns className="w-4 h-4 mr-2 text-purple-500" />
                  <span className="text-sm text-slate-700">{column.columnName}</span>
                  <Tooltip content={`Data type: ${column.columnType}`} position="top">
                    <span className="ml-2 text-xs text-slate-400 cursor-help">{column.columnType}</span>
                  </Tooltip>
                </button>
              </Tooltip>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
