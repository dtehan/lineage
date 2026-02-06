import React from 'react';
import { X } from 'lucide-react';

export interface ColumnDetail {
  id: string;
  databaseName: string;
  tableName: string;
  columnName: string;
  dataType?: string;
  nullable?: boolean;
  isPrimaryKey?: boolean;
  description?: string;
  upstreamCount?: number;
  downstreamCount?: number;
}

export interface EdgeDetail {
  id: string;
  sourceColumn: string;
  targetColumn: string;
  transformationType: string;
  confidenceScore?: number;
  transformationSql?: string;
}

export interface DetailPanelProps {
  isOpen: boolean;
  onClose: () => void;
  selectedColumn?: ColumnDetail | null;
  selectedEdge?: EdgeDetail | null;
  onViewFullLineage?: (columnId: string) => void;
  onViewImpactAnalysis?: (columnId: string) => void;
}

const ConfidenceBar: React.FC<{ score: number }> = ({ score }) => {
  const percentage = Math.round(score * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-500 transition-all"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="text-sm text-slate-600">{percentage}%</span>
    </div>
  );
};

const SqlViewer: React.FC<{ sql: string }> = ({ sql }) => {
  const handleCopy = () => {
    navigator.clipboard.writeText(sql);
  };

  return (
    <div className="relative">
      <pre className="bg-slate-800 text-slate-200 p-3 rounded-lg text-sm font-mono overflow-auto max-h-48">
        {sql}
      </pre>
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 px-2 py-1 text-xs bg-slate-700 text-slate-300 rounded hover:bg-slate-600"
        aria-label="Copy SQL"
      >
        Copy
      </button>
    </div>
  );
};

export const DetailPanel: React.FC<DetailPanelProps> = ({
  isOpen,
  onClose,
  selectedColumn,
  selectedEdge,
  onViewFullLineage,
  onViewImpactAnalysis,
}) => {
  const renderColumnDetails = () => {
    if (!selectedColumn) return null;

    const fullName = `${selectedColumn.databaseName}.${selectedColumn.tableName}.${selectedColumn.columnName}`;

    return (
      <>
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-slate-800 break-all">
            {fullName}
          </h3>
        </div>

        <div className="mb-4">
          <h4 className="text-sm font-medium text-slate-600 mb-2 border-b border-slate-200 pb-1">
            Metadata
          </h4>
          <dl className="space-y-1">
            {selectedColumn.dataType && (
              <div className="flex justify-between">
                <dt className="text-sm text-slate-500">Data Type:</dt>
                <dd className="text-sm font-medium text-slate-700">
                  {selectedColumn.dataType}
                </dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-sm text-slate-500">Nullable:</dt>
              <dd className="text-sm font-medium text-slate-700">
                {selectedColumn.nullable ? 'Yes' : 'No'}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-sm text-slate-500">Primary Key:</dt>
              <dd className="text-sm font-medium text-slate-700">
                {selectedColumn.isPrimaryKey ? 'Yes' : 'No'}
              </dd>
            </div>
            {selectedColumn.description && (
              <div className="pt-2">
                <dt className="text-sm text-slate-500">Description:</dt>
                <dd className="text-sm text-slate-700 mt-1">
                  {selectedColumn.description}
                </dd>
              </div>
            )}
          </dl>
        </div>

        <div className="mb-4">
          <h4 className="text-sm font-medium text-slate-600 mb-2 border-b border-slate-200 pb-1">
            Lineage Stats
          </h4>
          <dl className="space-y-1">
            <div className="flex justify-between">
              <dt className="text-sm text-slate-500">Upstream:</dt>
              <dd className="text-sm font-medium text-slate-700">
                {selectedColumn.upstreamCount ?? 0} columns
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-sm text-slate-500">Downstream:</dt>
              <dd className="text-sm font-medium text-slate-700">
                {selectedColumn.downstreamCount ?? 0} columns
              </dd>
            </div>
          </dl>
        </div>

        <div className="flex gap-2 mt-4">
          {onViewFullLineage && (
            <button
              onClick={() => onViewFullLineage(selectedColumn.id)}
              className="flex-1 px-3 py-2 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              View Full Lineage
            </button>
          )}
          {onViewImpactAnalysis && (
            <button
              onClick={() => onViewImpactAnalysis(selectedColumn.id)}
              className="flex-1 px-3 py-2 text-sm bg-slate-100 text-slate-700 rounded hover:bg-slate-200"
            >
              Impact Analysis
            </button>
          )}
        </div>
      </>
    );
  };

  const renderEdgeDetails = () => {
    if (!selectedEdge) return null;

    return (
      <>
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-slate-800">
            Connection Details
          </h3>
        </div>

        <div className="mb-4">
          <dl className="space-y-2">
            <div>
              <dt className="text-sm text-slate-500">Source:</dt>
              <dd className="text-sm font-medium text-slate-700 break-all">
                {selectedEdge.sourceColumn}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-slate-500">Target:</dt>
              <dd className="text-sm font-medium text-slate-700 break-all">
                {selectedEdge.targetColumn}
              </dd>
            </div>
          </dl>
        </div>

        <div className="mb-4">
          <h4 className="text-sm font-medium text-slate-600 mb-2 border-b border-slate-200 pb-1">
            Transformation
          </h4>
          <dl className="space-y-2">
            <div className="flex justify-between">
              <dt className="text-sm text-slate-500">Type:</dt>
              <dd className="text-sm font-medium text-slate-700">
                {selectedEdge.transformationType}
              </dd>
            </div>
            {selectedEdge.confidenceScore !== undefined && (
              <div>
                <dt className="text-sm text-slate-500 mb-1">Confidence:</dt>
                <dd>
                  <ConfidenceBar score={selectedEdge.confidenceScore} />
                </dd>
              </div>
            )}
          </dl>
        </div>

        {selectedEdge.transformationSql && (
          <div className="mb-4">
            <h4 className="text-sm font-medium text-slate-600 mb-2 border-b border-slate-200 pb-1">
              SQL
            </h4>
            <SqlViewer sql={selectedEdge.transformationSql} />
          </div>
        )}
      </>
    );
  };

  return (
    <div
      data-testid="detail-panel"
      className={`
        fixed right-0 top-0 h-full w-96
        bg-white shadow-xl border-l border-slate-200 z-50
        overflow-y-auto
        transition-transform duration-300 ease-out
        motion-reduce:transition-none
        ${isOpen ? 'translate-x-0' : 'translate-x-full'}
      `}
      role="dialog"
      aria-label={selectedColumn ? 'Column details' : 'Edge details'}
      aria-hidden={!isOpen}
    >
      <div className="sticky top-0 bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <h2 className="text-sm font-medium text-slate-600">
          {selectedColumn ? 'Column Details' : 'Connection Details'}
        </h2>
        <button
          onClick={onClose}
          className="p-1 hover:bg-slate-100 rounded"
          aria-label="Close panel"
        >
          <X className="w-5 h-5 text-slate-500" />
        </button>
      </div>
      <div className="p-4">
        {selectedColumn && renderColumnDetails()}
        {selectedEdge && renderEdgeDetails()}
        {!selectedColumn && !selectedEdge && (
          <p className="text-slate-500 text-sm">No item selected</p>
        )}
      </div>
    </div>
  );
};
