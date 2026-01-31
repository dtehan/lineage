import { useMemo } from 'react';
import { ArrowRight, Database, Table as TableIcon, Columns } from 'lucide-react';
import type { LineageNode, LineageEdge } from '../../../types';

interface LineageTableViewProps {
  nodes: LineageNode[];
  edges: LineageEdge[];
  onRowClick: (edgeId: string) => void;
}

interface LineageRow {
  edgeId: string;
  sourceDatabase: string;
  sourceTable: string;
  sourceColumn: string;
  targetDatabase: string;
  targetTable: string;
  targetColumn: string;
  transformationType: string;
  confidenceScore?: number;
}

export function LineageTableView({ nodes, edges, onRowClick }: LineageTableViewProps) {
  // Convert edges to table rows with full node information
  const rows = useMemo<LineageRow[]>(() => {
    return edges.map((edge) => {
      const sourceNode = nodes.find((n) => n.id === edge.source);
      const targetNode = nodes.find((n) => n.id === edge.target);

      return {
        edgeId: edge.id,
        sourceDatabase: sourceNode?.databaseName || 'unknown',
        sourceTable: sourceNode?.tableName || 'unknown',
        sourceColumn: sourceNode?.columnName || 'unknown',
        targetDatabase: targetNode?.databaseName || 'unknown',
        targetTable: targetNode?.tableName || 'unknown',
        targetColumn: targetNode?.columnName || 'unknown',
        transformationType: edge.transformationType || 'unknown',
        confidenceScore: edge.confidenceScore,
      };
    });
  }, [nodes, edges]);

  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-slate-500">
        <div className="text-center">
          <Columns className="w-16 h-16 mx-auto mb-4 text-slate-300" />
          <p className="text-sm">No lineage relationships to display</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-slate-50">
      <div className="p-4">
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
          {/* Header */}
          <div className="bg-slate-50 border-b border-slate-200 px-4 py-3">
            <h3 className="text-sm font-semibold text-slate-700">
              Lineage Relationships ({rows.length})
            </h3>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Source
                  </th>
                  <th className="px-4 py-3 text-center w-24">
                    <span className="sr-only">Relationship</span>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Target
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider w-32">
                    Type
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider w-24">
                    Confidence
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {rows.map((row) => (
                  <tr
                    key={row.edgeId}
                    onClick={() => onRowClick(row.edgeId)}
                    className="hover:bg-blue-50 cursor-pointer transition-colors"
                  >
                    {/* Source Column */}
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2 text-slate-500">
                          <Database className="w-3 h-3" />
                          <span className="text-xs">{row.sourceDatabase}</span>
                        </div>
                        <div className="flex items-center gap-2 text-slate-600">
                          <TableIcon className="w-3 h-3 ml-5" />
                          <span className="text-xs font-medium">{row.sourceTable}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Columns className="w-3 h-3 ml-5 text-purple-500" />
                          <span className="font-mono text-sm font-semibold text-slate-800">
                            {row.sourceColumn}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Arrow */}
                    <td className="px-4 py-3 text-center">
                      <ArrowRight className="w-5 h-5 mx-auto text-slate-400" />
                    </td>

                    {/* Target Column */}
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2 text-slate-500">
                          <Database className="w-3 h-3" />
                          <span className="text-xs">{row.targetDatabase}</span>
                        </div>
                        <div className="flex items-center gap-2 text-slate-600">
                          <TableIcon className="w-3 h-3 ml-5" />
                          <span className="text-xs font-medium">{row.targetTable}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Columns className="w-3 h-3 ml-5 text-purple-500" />
                          <span className="font-mono text-sm font-semibold text-slate-800">
                            {row.targetColumn}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Transformation Type */}
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          row.transformationType.toLowerCase() === 'direct'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-yellow-100 text-yellow-800'
                        }`}
                      >
                        {row.transformationType}
                      </span>
                    </td>

                    {/* Confidence Score */}
                    <td className="px-4 py-3">
                      {row.confidenceScore !== undefined ? (
                        <span className="text-slate-600">
                          {(row.confidenceScore * 100).toFixed(0)}%
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="mt-4 grid grid-cols-3 gap-4">
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
            <div className="text-xs text-slate-500 mb-1">Total Relationships</div>
            <div className="text-2xl font-bold text-slate-800">{rows.length}</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
            <div className="text-xs text-slate-500 mb-1">Direct Transformations</div>
            <div className="text-2xl font-bold text-green-600">
              {rows.filter((r) => r.transformationType.toLowerCase() === 'direct').length}
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
            <div className="text-xs text-slate-500 mb-1">Indirect Transformations</div>
            <div className="text-2xl font-bold text-yellow-600">
              {rows.filter((r) => r.transformationType.toLowerCase() !== 'direct').length}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
