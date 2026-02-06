import React from 'react';
import { useNavigate } from 'react-router-dom';
import type { ColumnDetail } from '../DetailPanel';

interface ColumnsTabProps {
  columns: ColumnDetail[];
  datasetId: string;
  onViewFullLineage?: (columnId: string) => void;
  onViewImpactAnalysis?: (columnId: string) => void;
}

export const ColumnsTab: React.FC<ColumnsTabProps> = ({
  columns,
  datasetId,
  onViewFullLineage,
  onViewImpactAnalysis,
}) => {
  const navigate = useNavigate();

  if (columns.length === 0) {
    return (
      <div className="p-4 text-sm text-slate-500">
        No columns available
      </div>
    );
  }

  return (
    <div className="overflow-y-auto">
      {columns.map((col) => (
        <div key={col.id} className="p-4 border-b border-slate-100 last:border-b-0">
          {/* Column name - clickable to navigate to lineage */}
          <button
            onClick={() =>
              navigate(
                `/lineage/${encodeURIComponent(datasetId)}/${encodeURIComponent(col.columnName)}`
              )
            }
            className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
            title={`View lineage for ${col.columnName}`}
          >
            {col.columnName}
          </button>

          {/* Badges row */}
          <div className="flex items-center gap-1.5 mt-1">
            {col.dataType && (
              <span className="inline-flex items-center px-1.5 py-0.5 text-xs font-mono bg-slate-100 text-slate-600 rounded">
                {col.dataType}
              </span>
            )}
            {col.nullable && (
              <span className="inline-flex items-center px-1.5 py-0.5 text-xs font-medium bg-yellow-50 text-yellow-700 rounded">
                NULL
              </span>
            )}
            {col.isPrimaryKey && (
              <span className="inline-flex items-center px-1.5 py-0.5 text-xs font-medium bg-green-50 text-green-700 rounded">
                PK
              </span>
            )}
          </div>

          {/* Description */}
          {col.description && (
            <p className="mt-1 text-xs text-slate-500">{col.description}</p>
          )}

          {/* Lineage stats */}
          <p className="mt-1 text-xs text-slate-400">
            {col.upstreamCount ?? 0} upstream, {col.downstreamCount ?? 0} downstream
          </p>

          {/* Action buttons for the selected column */}
          {(onViewFullLineage || onViewImpactAnalysis) && (
            <div className="flex gap-2 mt-2">
              {onViewFullLineage && (
                <button
                  onClick={() => onViewFullLineage(col.id)}
                  className="flex-1 px-3 py-2 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
                >
                  View Full Lineage
                </button>
              )}
              {onViewImpactAnalysis && (
                <button
                  onClick={() => onViewImpactAnalysis(col.id)}
                  className="flex-1 px-3 py-2 text-sm bg-slate-100 text-slate-700 rounded hover:bg-slate-200"
                >
                  Impact Analysis
                </button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};
