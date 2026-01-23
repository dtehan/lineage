import { useState, useMemo, useCallback, memo } from 'react';
import { ChevronUp, ChevronDown, Download } from 'lucide-react';
import type { LineageNode, LineageEdge } from '../../../../types';

export interface LineageTableViewProps {
  nodes: LineageNode[];
  edges: LineageEdge[];
  onRowClick?: (edgeId: string) => void;
  pageSize?: number;
}

type SortField =
  | 'sourceColumn'
  | 'targetColumn'
  | 'transformationType'
  | 'depth'
  | 'confidence';
type SortDirection = 'asc' | 'desc';

interface TableRow {
  id: string;
  sourceColumn: string;
  sourceDatabase: string;
  sourceTable: string;
  targetColumn: string;
  targetDatabase: string;
  targetTable: string;
  transformationType: string;
  depth: number;
  confidence: number | null;
  queryId?: string;
}

/**
 * Formats confidence as percentage
 */
function formatConfidence(confidence: number | null): string {
  if (confidence === null) return '-';
  const pct = confidence > 1 ? confidence : confidence * 100;
  return `${Math.round(pct)}%`;
}

/**
 * Gets confidence color class
 */
function getConfidenceColor(confidence: number | null): string {
  if (confidence === null) return 'text-slate-400';
  const pct = confidence > 1 ? confidence : confidence * 100;
  if (pct >= 90) return 'text-green-600';
  if (pct >= 70) return 'text-blue-600';
  if (pct >= 50) return 'text-amber-600';
  return 'text-red-600';
}

/**
 * Gets transformation type badge color
 */
function getTransformationBadgeClass(type: string): string {
  switch (type.toLowerCase()) {
    case 'direct':
      return 'bg-green-100 text-green-800';
    case 'derived':
      return 'bg-blue-100 text-blue-800';
    case 'aggregated':
    case 'aggregation':
      return 'bg-purple-100 text-purple-800';
    case 'joined':
      return 'bg-cyan-100 text-cyan-800';
    default:
      return 'bg-slate-100 text-slate-800';
  }
}

/**
 * Transforms edges to table rows
 */
function transformToTableRows(
  nodes: LineageNode[],
  edges: LineageEdge[]
): TableRow[] {
  const nodeMap = new Map<string, LineageNode>();
  nodes.forEach((node) => nodeMap.set(node.id, node));

  return edges.map((edge) => {
    const sourceNode = nodeMap.get(edge.source);
    const targetNode = nodeMap.get(edge.target);

    return {
      id: edge.id,
      sourceColumn: sourceNode?.columnName || edge.source,
      sourceDatabase: sourceNode?.databaseName || '',
      sourceTable: sourceNode?.tableName || '',
      targetColumn: targetNode?.columnName || edge.target,
      targetDatabase: targetNode?.databaseName || '',
      targetTable: targetNode?.tableName || '',
      transformationType: edge.transformationType || 'unknown',
      depth: 1, // Would need to be calculated from graph traversal
      confidence: edge.confidenceScore ?? null,
      queryId: undefined, // Would come from edge metadata
    };
  });
}

export const LineageTableView = memo(function LineageTableView({
  nodes,
  edges,
  onRowClick,
  pageSize = 50,
}: LineageTableViewProps) {
  const [sortField, setSortField] = useState<SortField>('sourceColumn');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [filterText, setFilterText] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  // Transform edges to table rows
  const allRows = useMemo(
    () => transformToTableRows(nodes, edges),
    [nodes, edges]
  );

  // Filter rows
  const filteredRows = useMemo(() => {
    if (!filterText) return allRows;

    const lower = filterText.toLowerCase();
    return allRows.filter(
      (row) =>
        row.sourceColumn.toLowerCase().includes(lower) ||
        row.targetColumn.toLowerCase().includes(lower) ||
        row.sourceTable.toLowerCase().includes(lower) ||
        row.targetTable.toLowerCase().includes(lower) ||
        row.transformationType.toLowerCase().includes(lower)
    );
  }, [allRows, filterText]);

  // Sort rows
  const sortedRows = useMemo(() => {
    return [...filteredRows].sort((a, b) => {
      let aVal: string | number | null;
      let bVal: string | number | null;

      switch (sortField) {
        case 'sourceColumn':
          aVal = `${a.sourceDatabase}.${a.sourceTable}.${a.sourceColumn}`;
          bVal = `${b.sourceDatabase}.${b.sourceTable}.${b.sourceColumn}`;
          break;
        case 'targetColumn':
          aVal = `${a.targetDatabase}.${a.targetTable}.${a.targetColumn}`;
          bVal = `${b.targetDatabase}.${b.targetTable}.${b.targetColumn}`;
          break;
        case 'transformationType':
          aVal = a.transformationType;
          bVal = b.transformationType;
          break;
        case 'depth':
          aVal = a.depth;
          bVal = b.depth;
          break;
        case 'confidence':
          aVal = a.confidence ?? -1;
          bVal = b.confidence ?? -1;
          break;
        default:
          return 0;
      }

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDirection === 'asc'
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
      }

      return 0;
    });
  }, [filteredRows, sortField, sortDirection]);

  // Paginate rows
  const totalPages = Math.ceil(sortedRows.length / pageSize);
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedRows.slice(start, start + pageSize);
  }, [sortedRows, currentPage, pageSize]);

  // Handle sort
  const handleSort = useCallback(
    (field: SortField) => {
      if (sortField === field) {
        setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortField(field);
        setSortDirection('asc');
      }
    },
    [sortField]
  );

  // Handle row click
  const handleRowClick = useCallback(
    (edgeId: string) => {
      onRowClick?.(edgeId);
    },
    [onRowClick]
  );

  // Export to CSV
  const exportToCsv = useCallback(() => {
    const headers = [
      'Source Column',
      'Source Table',
      'Source Database',
      'Target Column',
      'Target Table',
      'Target Database',
      'Transformation Type',
      'Depth',
      'Confidence',
    ];

    const csvContent = [
      headers.join(','),
      ...sortedRows.map((row) =>
        [
          row.sourceColumn,
          row.sourceTable,
          row.sourceDatabase,
          row.targetColumn,
          row.targetTable,
          row.targetDatabase,
          row.transformationType,
          row.depth,
          row.confidence !== null ? formatConfidence(row.confidence) : '',
        ].join(',')
      ),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'lineage-table.csv';
    a.click();
    URL.revokeObjectURL(url);
  }, [sortedRows]);

  // Sort icon component
  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return <ChevronDown className="w-4 h-4 text-slate-300" />;
    }
    return sortDirection === 'asc' ? (
      <ChevronUp className="w-4 h-4 text-blue-500" />
    ) : (
      <ChevronDown className="w-4 h-4 text-blue-500" />
    );
  };

  return (
    <div className="flex flex-col h-full" data-testid="lineage-table-view">
      {/* Table toolbar */}
      <div className="flex items-center justify-between p-3 border-b border-slate-200">
        <div className="flex items-center gap-4">
          <input
            type="text"
            value={filterText}
            onChange={(e) => {
              setFilterText(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="Filter rows..."
            className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <span className="text-sm text-slate-500">
            {filteredRows.length} of {allRows.length} rows
          </span>
        </div>

        <button
          onClick={exportToCsv}
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
        >
          <Download className="w-4 h-4" />
          Export CSV
        </button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 sticky top-0">
            <tr>
              <th
                className="px-4 py-3 text-left font-medium text-slate-600 cursor-pointer hover:bg-slate-100"
                onClick={() => handleSort('sourceColumn')}
              >
                <div className="flex items-center gap-1">
                  Source Column
                  <SortIcon field="sourceColumn" />
                </div>
              </th>
              <th
                className="px-4 py-3 text-left font-medium text-slate-600 cursor-pointer hover:bg-slate-100"
                onClick={() => handleSort('targetColumn')}
              >
                <div className="flex items-center gap-1">
                  Target Column
                  <SortIcon field="targetColumn" />
                </div>
              </th>
              <th
                className="px-4 py-3 text-left font-medium text-slate-600 cursor-pointer hover:bg-slate-100"
                onClick={() => handleSort('transformationType')}
              >
                <div className="flex items-center gap-1">
                  Type
                  <SortIcon field="transformationType" />
                </div>
              </th>
              <th
                className="px-4 py-3 text-left font-medium text-slate-600 cursor-pointer hover:bg-slate-100"
                onClick={() => handleSort('depth')}
              >
                <div className="flex items-center gap-1">
                  Depth
                  <SortIcon field="depth" />
                </div>
              </th>
              <th
                className="px-4 py-3 text-left font-medium text-slate-600 cursor-pointer hover:bg-slate-100"
                onClick={() => handleSort('confidence')}
              >
                <div className="flex items-center gap-1">
                  Confidence
                  <SortIcon field="confidence" />
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {paginatedRows.map((row) => (
              <tr
                key={row.id}
                className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                onClick={() => handleRowClick(row.id)}
              >
                <td className="px-4 py-3">
                  <div className="flex flex-col">
                    <span className="font-medium text-slate-800">
                      {row.sourceColumn}
                    </span>
                    <span className="text-xs text-slate-500">
                      {row.sourceDatabase}.{row.sourceTable}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-col">
                    <span className="font-medium text-slate-800">
                      {row.targetColumn}
                    </span>
                    <span className="text-xs text-slate-500">
                      {row.targetDatabase}.{row.targetTable}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`px-2 py-1 text-xs font-medium rounded-full ${getTransformationBadgeClass(
                      row.transformationType
                    )}`}
                  >
                    {row.transformationType}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-600">{row.depth}</td>
                <td
                  className={`px-4 py-3 font-medium ${getConfidenceColor(
                    row.confidence
                  )}`}
                >
                  {formatConfidence(row.confidence)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between p-3 border-t border-slate-200">
          <span className="text-sm text-slate-500">
            Page {currentPage} of {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1 text-sm border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              onClick={() =>
                setCurrentPage((prev) => Math.min(totalPages, prev + 1))
              }
              disabled={currentPage === totalPages}
              className="px-3 py-1 text-sm border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
});
