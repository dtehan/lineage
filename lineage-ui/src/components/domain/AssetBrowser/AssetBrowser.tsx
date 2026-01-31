import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, ChevronDown, Database, Table as TableIcon, Columns, Eye, Layers, Globe } from 'lucide-react';
import { useOpenLineageNamespaces, useOpenLineageDatasets, useOpenLineageDataset } from '../../../api/hooks/useOpenLineage';
import { LoadingSpinner } from '../../common/LoadingSpinner';
import { Tooltip } from '../../common/Tooltip';
import type { OpenLineageDataset } from '../../../types/openlineage';

// Helper to determine asset type from sourceType
const getAssetTypeFromSourceType = (sourceType?: string): 'table' | 'view' | 'materialized_view' => {
  const type = sourceType?.toLowerCase() || '';
  if (type.includes('view')) {
    if (type.includes('materialized')) {
      return 'materialized_view';
    }
    return 'view';
  }
  return 'table';
};

// Asset type icon component with distinct styling
const AssetTypeIcon = ({ sourceType }: { sourceType?: string }) => {
  const assetType = getAssetTypeFromSourceType(sourceType);
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

// Parse database name from dataset name (e.g., "demo_user.customers" -> "demo_user")
const parseDatabaseFromDatasetName = (datasetName: string): string => {
  const parts = datasetName.split('.');
  return parts.length > 1 ? parts[0] : datasetName;
};

// Parse table name from dataset name (e.g., "demo_user.customers" -> "customers")
const parseTableFromDatasetName = (datasetName: string): string => {
  const parts = datasetName.split('.');
  return parts.length > 1 ? parts.slice(1).join('.') : datasetName;
};

export function AssetBrowser() {
  const [expandedDatabases, setExpandedDatabases] = useState<Set<string>>(new Set());
  const [expandedDatasets, setExpandedDatasets] = useState<Set<string>>(new Set());

  const { data: namespacesData, isLoading: isLoadingNamespaces } = useOpenLineageNamespaces();
  const namespaces = namespacesData?.namespaces || [];

  // Get the first namespace (usually there's only one Teradata instance)
  const defaultNamespace = namespaces.length > 0 ? namespaces[0] : null;

  // Fetch datasets from the default namespace
  const { data: datasetsData, isLoading: isLoadingDatasets } = useOpenLineageDatasets(
    defaultNamespace?.id || '',
    { limit: 1000, offset: 0 }
  );
  const datasets = datasetsData?.datasets || [];

  // Group datasets by database name (extracted from dataset name)
  const datasetsByDatabase = useMemo(() => {
    const grouped: Record<string, OpenLineageDataset[]> = {};
    datasets.forEach((dataset) => {
      const dbName = parseDatabaseFromDatasetName(dataset.name);
      if (!grouped[dbName]) {
        grouped[dbName] = [];
      }
      grouped[dbName].push(dataset);
    });
    return grouped;
  }, [datasets]);

  const databaseNames = Object.keys(datasetsByDatabase).sort();

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

  if (isLoadingNamespaces || isLoadingDatasets) {
    return (
      <div className="p-4">
        <LoadingSpinner />
      </div>
    );
  }

  if (!defaultNamespace) {
    return (
      <div className="p-4 text-slate-500">
        <p className="text-sm">No namespaces found</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      <div className="p-2">
        {/* Namespace header (if multiple namespaces exist) */}
        {namespaces.length > 1 && (
          <div className="mb-3 p-2 bg-slate-50 rounded border border-slate-200">
            <div className="flex items-center">
              <Globe className="w-4 h-4 mr-2 text-slate-500" />
              <span className="text-xs font-medium text-slate-600">
                Namespace: {defaultNamespace.uri}
              </span>
            </div>
          </div>
        )}

        <h2 className="px-2 py-1 text-sm font-semibold text-slate-700">Databases</h2>
        <ul className="space-y-1">
          {databaseNames.map((dbName) => (
            <DatabaseItem
              key={dbName}
              databaseName={dbName}
              datasets={datasetsByDatabase[dbName]}
              isExpanded={expandedDatabases.has(dbName)}
              onToggle={() => toggleDatabase(dbName)}
              expandedDatasets={expandedDatasets}
              onToggleDataset={toggleDataset}
            />
          ))}
        </ul>
      </div>
    </div>
  );
}

interface DatabaseItemProps {
  databaseName: string;
  datasets: OpenLineageDataset[];
  isExpanded: boolean;
  onToggle: () => void;
  expandedDatasets: Set<string>;
  onToggleDataset: (datasetId: string) => void;
}

function DatabaseItem({ databaseName, datasets, isExpanded, onToggle, expandedDatasets, onToggleDataset }: DatabaseItemProps) {
  const navigate = useNavigate();

  // Toggle expand/collapse (prevent navigation when clicking chevron)
  const handleChevronClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggle();
  };

  // Navigate to database-level lineage when clicking the database name
  const handleDatabaseClick = () => {
    navigate(`/lineage/database/${encodeURIComponent(databaseName)}`);
  };

  return (
    <li>
      <div className="flex items-center w-full px-2 py-1 rounded hover:bg-slate-100">
        <button
          onClick={handleChevronClick}
          className="p-0.5 hover:bg-slate-200 rounded"
          aria-label={isExpanded ? 'Collapse database' : 'Expand database'}
        >
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-slate-500" />
          ) : (
            <ChevronRight className="w-4 h-4 text-slate-500" />
          )}
        </button>
        <button
          onClick={handleDatabaseClick}
          className="flex items-center flex-1 ml-1 hover:bg-slate-200 rounded px-1 py-0.5 -mx-1 -my-0.5"
        >
          <Tooltip content="Database" position="right">
            <Database className="w-4 h-4 mr-2 text-blue-500" />
          </Tooltip>
          <span className="text-sm text-slate-700">{databaseName}</span>
          <span className="ml-2 text-xs text-slate-400">({datasets.length})</span>
        </button>
      </div>
      {isExpanded && (
        <ul className="ml-4 mt-1 space-y-1">
          {datasets.map((dataset) => (
            <DatasetItem
              key={dataset.id}
              dataset={dataset}
              isExpanded={expandedDatasets.has(dataset.id)}
              onToggle={() => onToggleDataset(dataset.id)}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

interface DatasetItemProps {
  dataset: OpenLineageDataset;
  isExpanded: boolean;
  onToggle: () => void;
}

function DatasetItem({ dataset, isExpanded, onToggle }: DatasetItemProps) {
  // Fetch dataset with fields when expanded
  const { data: datasetWithFields } = useOpenLineageDataset(isExpanded ? dataset.id : '', {
    enabled: isExpanded,
  });
  const fields = datasetWithFields?.fields || [];
  const navigate = useNavigate();

  const tableName = parseTableFromDatasetName(dataset.name);

  // Toggle expand/collapse (prevent navigation when clicking chevron)
  const handleChevronClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggle();
  };

  // Navigate to field lineage when clicking a field
  const handleFieldClick = (fieldName: string) => {
    // Navigate to lineage view - now always shows all columns with this field highlighted
    navigate(`/lineage/${encodeURIComponent(dataset.id)}/${encodeURIComponent(fieldName)}`);
  };

  // Navigate to table-level lineage when clicking the table name
  const handleTableClick = () => {
    navigate(`/lineage/${encodeURIComponent(dataset.id)}/_all`);
  };

  return (
    <li>
      <div className="flex items-center w-full px-2 py-1 rounded hover:bg-slate-100">
        <button
          onClick={handleChevronClick}
          className="p-0.5 hover:bg-slate-200 rounded"
          aria-label={isExpanded ? 'Collapse dataset' : 'Expand dataset'}
        >
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-slate-500" />
          ) : (
            <ChevronRight className="w-4 h-4 text-slate-500" />
          )}
        </button>
        <button
          onClick={handleTableClick}
          className="flex items-center flex-1 ml-1 hover:bg-slate-200 rounded px-1 py-0.5 -mx-1 -my-0.5"
        >
          <AssetTypeIcon sourceType={dataset.sourceType} />
          <span className="text-sm text-slate-700">{tableName}</span>
        </button>
      </div>
      {isExpanded && (
        <ul className="ml-4 mt-1 space-y-1">
          {fields.length === 0 ? (
            <li className="px-2 py-1 text-xs text-slate-400 italic">No fields found</li>
          ) : (
            fields
              .sort((a, b) => a.ordinalPosition - b.ordinalPosition)
              .map((field) => (
                <li key={field.id}>
                  <Tooltip content={`View lineage for field ${field.name}`} position="right">
                    <button
                      onClick={() => handleFieldClick(field.name)}
                      className="flex items-center w-full px-2 py-1 text-left rounded hover:bg-blue-50"
                    >
                      <Columns className="w-4 h-4 mr-2 text-purple-500" />
                      <span className="text-sm text-slate-700">{field.name}</span>
                      {field.type && (
                        <Tooltip content={`Data type: ${field.type}`} position="top">
                          <span className="ml-2 text-xs text-slate-400 cursor-help">{field.type}</span>
                        </Tooltip>
                      )}
                    </button>
                  </Tooltip>
                </li>
              ))
          )}
        </ul>
      )}
    </li>
  );
}
