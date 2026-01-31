import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, Columns, ChevronRight, ChevronDown, Database } from 'lucide-react';
import type { OpenLineageDataset, DatabaseInfo } from '../../../types/openlineage';
import { useOpenLineageDataset } from '../../../api/hooks/useOpenLineage';

interface SearchResultsProps {
  databases: DatabaseInfo[];
  datasets: OpenLineageDataset[];
  totalCount: number;
}

// Parse table name from dataset name (e.g., "demo_user.customers" -> "customers")
const parseTableFromDatasetName = (datasetName: string): string => {
  const parts = datasetName.split('.');
  return parts.length > 1 ? parts.slice(1).join('.') : datasetName;
};

export function SearchResults({ databases, datasets, totalCount }: SearchResultsProps) {
  const [expandedDatasets, setExpandedDatasets] = useState<Set<string>>(new Set());
  const [expandedDatabases, setExpandedDatabases] = useState<Set<string>>(new Set());

  const toggleDataset = (datasetId: string) => {
    setExpandedDatasets((prev) => {
      const next = new Set(prev);
      if (next.has(datasetId)) {
        next.delete(datasetId);
      } else {
        next.add(datasetId);
      }
      return next;
    });
  };

  const toggleDatabase = (databaseName: string) => {
    setExpandedDatabases((prev) => {
      const next = new Set(prev);
      if (next.has(databaseName)) {
        next.delete(databaseName);
      } else {
        next.add(databaseName);
      }
      return next;
    });
  };

  if (databases.length === 0 && datasets.length === 0) {
    return (
      <div className="text-center py-8 text-slate-500">
        No results found
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-600">
        {totalCount} result{totalCount !== 1 ? 's' : ''} found
        {databases.length > 0 && ` (${databases.length} database${databases.length !== 1 ? 's' : ''}`}
        {databases.length > 0 && datasets.length > 0 && ', '}
        {datasets.length > 0 && `${datasets.length} table${datasets.length !== 1 ? 's' : ''})`}
      </p>

      {databases.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Databases</h3>
          <ul className="space-y-2">
            {databases.map((database) => (
              <DatabaseSearchResult
                key={database.name}
                database={database}
                datasets={datasets}
                isExpanded={expandedDatabases.has(database.name)}
                onToggle={() => toggleDatabase(database.name)}
              />
            ))}
          </ul>
        </div>
      )}

      {datasets.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Tables</h3>
          <ul className="space-y-2">
            {datasets.map((dataset) => (
              <DatasetSearchResult
                key={dataset.id}
                dataset={dataset}
                isExpanded={expandedDatasets.has(dataset.id)}
                onToggle={() => toggleDataset(dataset.id)}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

interface DatabaseSearchResultProps {
  database: DatabaseInfo;
  datasets: OpenLineageDataset[];
  isExpanded: boolean;
  onToggle: () => void;
}

function DatabaseSearchResult({ database, datasets, isExpanded, onToggle }: DatabaseSearchResultProps) {
  const navigate = useNavigate();

  // Filter datasets that belong to this database
  const databaseTables = useMemo(() => {
    return datasets.filter((dataset) => {
      const parts = dataset.name.split('.');
      return parts.length > 1 && parts[0] === database.name;
    });
  }, [datasets, database.name]);

  const handleDatasetClick = (dataset: OpenLineageDataset) => {
    // Navigate to table-level lineage
    navigate(`/lineage/${encodeURIComponent(dataset.id)}/_all`);
  };

  const handleDatabaseClick = () => {
    // Navigate to database-level lineage
    navigate(`/lineage/database/${encodeURIComponent(database.name)}`);
  };

  return (
    <li>
      <div className="bg-white rounded-lg border border-slate-200 hover:border-slate-300 hover:shadow-sm transition-all">
        <div className="flex items-center gap-3 p-3">
          <button
            onClick={onToggle}
            className="p-0.5 hover:bg-slate-100 rounded"
            aria-label={isExpanded ? 'Collapse database' : 'Expand database'}
          >
            {isExpanded ? (
              <ChevronDown className="w-4 h-4 text-slate-500 flex-shrink-0" />
            ) : (
              <ChevronRight className="w-4 h-4 text-slate-500 flex-shrink-0" />
            )}
          </button>
          <button
            onClick={handleDatabaseClick}
            className="flex items-center gap-3 flex-1 min-w-0 text-left hover:bg-slate-50 rounded p-1 -m-1"
          >
            <Database className="w-5 h-5 text-blue-500 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900 truncate">
                {database.name}
              </p>
              <p className="text-xs text-slate-500 truncate">
                {database.tableCount} table{database.tableCount !== 1 ? 's' : ''} in search results
              </p>
            </div>
            <span className="text-xs text-slate-400">
              Database
            </span>
          </button>
        </div>

        {isExpanded && (
          <div className="border-t border-slate-200 px-3 py-2">
            {databaseTables.length === 0 ? (
              <p className="text-xs text-slate-400 italic py-2">No tables found</p>
            ) : (
              <div className="space-y-1">
                <p className="text-xs font-medium text-slate-600 mb-2">Tables:</p>
                {databaseTables.map((dataset) => (
                  <button
                    key={dataset.id}
                    onClick={() => handleDatasetClick(dataset)}
                    className="flex items-center gap-2 w-full px-2 py-1 text-left rounded hover:bg-slate-50 transition-colors"
                  >
                    <Table className="w-4 h-4 text-green-500 flex-shrink-0" />
                    <span className="text-sm text-slate-700">{parseTableFromDatasetName(dataset.name)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

interface DatasetSearchResultProps {
  dataset: OpenLineageDataset;
  isExpanded: boolean;
  onToggle: () => void;
}

function DatasetSearchResult({ dataset, isExpanded, onToggle }: DatasetSearchResultProps) {
  const navigate = useNavigate();

  // Fetch dataset with fields when expanded
  const { data: datasetWithFields } = useOpenLineageDataset(isExpanded ? dataset.id : '', {
    enabled: isExpanded,
  });
  const fields = datasetWithFields?.fields || [];

  const tableName = parseTableFromDatasetName(dataset.name);

  const handleFieldClick = (fieldName: string) => {
    navigate(`/lineage/${encodeURIComponent(dataset.id)}/${encodeURIComponent(fieldName)}`);
  };

  const handleTableClick = () => {
    // Navigate to table-level lineage view (all columns)
    navigate(`/lineage/${encodeURIComponent(dataset.id)}/_all`);
  };

  return (
    <li>
      <div className="bg-white rounded-lg border border-slate-200 hover:border-slate-300 hover:shadow-sm transition-all">
        <div className="flex items-center gap-3 p-3">
          <button
            onClick={onToggle}
            className="p-0.5 hover:bg-slate-100 rounded"
            aria-label={isExpanded ? 'Collapse dataset' : 'Expand dataset'}
          >
            {isExpanded ? (
              <ChevronDown className="w-4 h-4 text-slate-500 flex-shrink-0" />
            ) : (
              <ChevronRight className="w-4 h-4 text-slate-500 flex-shrink-0" />
            )}
          </button>
          <button
            onClick={handleTableClick}
            className="flex items-center gap-3 flex-1 min-w-0 text-left hover:bg-slate-50 rounded p-1 -m-1"
          >
            <Table className="w-5 h-5 text-green-500 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900 truncate">
                {tableName}
              </p>
              <p className="text-xs text-slate-500 truncate">
                {dataset.name}
              </p>
              {dataset.description && (
                <p className="text-xs text-slate-400 mt-1 truncate">
                  {dataset.description}
                </p>
              )}
            </div>
            <span className="text-xs text-slate-400">
              Dataset
            </span>
          </button>
        </div>

        {isExpanded && (
          <div className="border-t border-slate-200 px-3 py-2">
            {fields.length === 0 ? (
              <p className="text-xs text-slate-400 italic py-2">No fields found</p>
            ) : (
              <div className="space-y-1">
                <p className="text-xs font-medium text-slate-600 mb-2">Fields:</p>
                {fields
                  .sort((a, b) => a.ordinalPosition - b.ordinalPosition)
                  .map((field) => (
                    <button
                      key={field.id}
                      onClick={() => handleFieldClick(field.name)}
                      className="flex items-center gap-2 w-full px-2 py-1 text-left rounded hover:bg-slate-50 transition-colors"
                    >
                      <Columns className="w-4 h-4 text-purple-500 flex-shrink-0" />
                      <span className="text-sm text-slate-700">{field.name}</span>
                      {field.type && (
                        <span className="text-xs text-slate-400 ml-auto">
                          {field.type}
                        </span>
                      )}
                    </button>
                  ))}
              </div>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
