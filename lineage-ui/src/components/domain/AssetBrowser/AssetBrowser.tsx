import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, ChevronDown, Database, Table, Columns } from 'lucide-react';
import { useDatabases, useTables, useColumns } from '../../../api/hooks/useAssets';
import { useLineageStore } from '../../../stores/useLineageStore';
import { LoadingSpinner } from '../../common/LoadingSpinner';
import { Tooltip } from '../../common/Tooltip';

export function AssetBrowser() {
  const [expandedDatabases, setExpandedDatabases] = useState<Set<string>>(new Set());
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());

  const { data: databases, isLoading } = useDatabases();

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
        <h2 className="px-2 py-1 text-sm font-semibold text-slate-700">Databases</h2>
        <ul className="space-y-1">
          {databases?.map((db) => (
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
  const { data: tables } = useTables(isExpanded ? database.name : '');

  return (
    <li>
      <button
        onClick={onToggle}
        className="flex items-center w-full px-2 py-1 text-left rounded hover:bg-slate-100"
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
  table: { id: string; tableName: string };
  isExpanded: boolean;
  onToggle: () => void;
}

function TableItem({ databaseName, table, isExpanded, onToggle }: TableItemProps) {
  const { data: columns } = useColumns(isExpanded ? databaseName : '', isExpanded ? table.tableName : '');
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
        <Tooltip content={`View lineage for ${databaseName}.${table.tableName}`} position="right">
          <button
            onClick={handleTableClick}
            className="flex items-center flex-1 ml-1 text-left hover:text-blue-600"
          >
            <Table className="w-4 h-4 mr-2 text-green-500" />
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
