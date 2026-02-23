import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, ChevronDown, Database, Table as TableIcon, Columns, Eye, Layers, RefreshCw } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useOpenLineageNamespaces, useOpenLineageDatabases, useOpenLineageDatasets, useOpenLineageDataset } from '../../../api/hooks/useOpenLineage';
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

// Parse table name from dataset name (e.g., "demo_user.customers" -> "customers")
const parseTableFromDatasetName = (datasetName: string): string => {
  const parts = datasetName.split('.');
  return parts.length > 1 ? parts.slice(1).join('.') : datasetName;
};

export function AssetBrowser() {
  const [expandedDatabases, setExpandedDatabases] = useState<Set<string>>(new Set());
  const [expandedDatasets, setExpandedDatasets] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();

  const { data: namespacesData, isLoading: isLoadingNamespaces, isFetching: isFetchingNamespaces } = useOpenLineageNamespaces();
  const namespaces = namespacesData?.namespaces || [];

  // Select the namespace with the most datasets (prefer production over test namespaces)
  // Sort by creation date (oldest first) to prefer established namespaces over test ones
  const defaultNamespace = namespaces.length > 0
    ? [...namespaces].sort((a, b) => {
        // Sort by createdAt ascending (oldest first)
        const dateA = new Date(a.createdAt || 0).getTime();
        const dateB = new Date(b.createdAt || 0).getTime();
        return dateA - dateB;
      })[0]
    : null;

  // Phase 1: Fetch database list only (lightweight — counts only, no dataset data)
  const { data: databasesData, isLoading: isLoadingDatabases, isFetching: isFetchingDatabases } = useOpenLineageDatabases(
    defaultNamespace?.id || ''
  );
  const databases = databasesData?.databases || [];

  // Handle refresh - invalidate all relevant query caches
  const handleRefresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['openlineage', 'namespaces'] });
    await queryClient.invalidateQueries({ queryKey: ['openlineage', 'databases'] });
    await queryClient.invalidateQueries({ queryKey: ['openlineage', 'datasets'] });
  }, [queryClient]);

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

  if (isLoadingNamespaces || isLoadingDatabases) {
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
        <div className="flex items-center justify-between px-2 py-1">
          <h2 className="text-sm font-semibold text-slate-700">Databases</h2>
          <Tooltip content="Refresh data (bypass cache)" position="right">
            <button
              onClick={handleRefresh}
              disabled={isLoadingNamespaces || isLoadingDatabases}
              className="p-1 text-slate-500 hover:bg-slate-100 rounded transition-colors disabled:opacity-50"
              aria-label="Refresh data"
              data-testid="asset-browser-refresh-btn"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${(isFetchingNamespaces || isFetchingDatabases) && !(isLoadingNamespaces || isLoadingDatabases) ? 'animate-spin' : ''}`} />
            </button>
          </Tooltip>
        </div>
        <ul className="space-y-1">
          {databases.map((db) => (
            <DatabaseItem
              key={db.name}
              databaseName={db.name}
              tableCount={db.tableCount}
              viewCount={db.viewCount}
              totalCount={db.totalCount}
              namespaceId={defaultNamespace.id}
              isExpanded={expandedDatabases.has(db.name)}
              onToggle={() => toggleDatabase(db.name)}
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
  tableCount: number;
  viewCount: number;
  totalCount: number;
  namespaceId: string;
  isExpanded: boolean;
  onToggle: () => void;
  expandedDatasets: Set<string>;
  onToggleDataset: (datasetId: string) => void;
}

function DatabaseItem({ databaseName, tableCount: _tableCount, viewCount: _viewCount, totalCount, namespaceId, isExpanded, onToggle, expandedDatasets, onToggleDataset }: DatabaseItemProps) {
  const navigate = useNavigate();

  // Phase 2: Fetch this database's tables only when expanded
  const { data: datasetsData, isLoading: isLoadingDatasets } = useOpenLineageDatasets(
    namespaceId,
    { database: databaseName, limit: 500, offset: 0 },
    { enabled: isExpanded }
  );
  const datasets = datasetsData?.datasets || [];

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
          <span className="ml-2 text-xs text-slate-400">({totalCount})</span>
        </button>
      </div>
      {isExpanded && (
        <ul className="ml-4 mt-1 space-y-1">
          {isLoadingDatasets ? (
            <li className="px-2 py-1"><LoadingSpinner /></li>
          ) : (
            datasets.map((dataset) => (
              <DatasetItem
                key={dataset.id}
                dataset={dataset}
                isExpanded={expandedDatasets.has(dataset.id)}
                onToggle={() => onToggleDataset(dataset.id)}
              />
            ))
          )}
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
  const allFields = datasetWithFields?.fields || [];

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
          {dataset.hasLineage === true && (
            <Tooltip content="Has lineage connections" position="right">
              <span
                className="ml-1.5 w-2 h-2 rounded-full bg-blue-500 shrink-0 inline-block"
                data-testid="has-lineage-indicator"
                aria-label="Has lineage connections"
              />
            </Tooltip>
          )}
        </button>
      </div>
      {isExpanded && (
        <ul className="ml-4 mt-1 space-y-1">
          {allFields.length === 0 ? (
            <li className="px-2 py-1 text-xs text-slate-400 italic">No fields found</li>
          ) : (
            allFields
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
