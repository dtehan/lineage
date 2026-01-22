import { useState } from 'react';
import { ChevronRight, ChevronDown, Database, Table, Columns } from 'lucide-react';
import { useDatabases, useTables, useColumns } from '../../../api/hooks/useAssets';
import { useLineageStore } from '../../../stores/useLineageStore';
import { LoadingSpinner } from '../../common/LoadingSpinner';

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
        <Database className="w-4 h-4 mr-2 text-blue-500" />
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
        <Table className="w-4 h-4 mr-2 text-green-500" />
        <span className="text-sm text-slate-700">{table.tableName}</span>
      </button>
      {isExpanded && columns && (
        <ul className="ml-4 mt-1 space-y-1">
          {columns.map((column) => (
            <li key={column.id}>
              <button
                onClick={() => setSelectedAssetId(column.id)}
                className="flex items-center w-full px-2 py-1 text-left rounded hover:bg-blue-50"
              >
                <Columns className="w-4 h-4 mr-2 text-purple-500" />
                <span className="text-sm text-slate-700">{column.columnName}</span>
                <span className="ml-2 text-xs text-slate-400">{column.columnType}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
