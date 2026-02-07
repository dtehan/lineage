import React, { useState, useEffect } from 'react';
import { X, LayoutList, BarChart3, Code } from 'lucide-react';
import { TabBar, TabPanel } from './DetailPanel/TabBar';
import { ColumnsTab } from './DetailPanel/ColumnsTab';
import { StatisticsTab } from './DetailPanel/StatisticsTab';
import { DDLTab } from './DetailPanel/DDLTab';
import { SelectionBreadcrumb } from './DetailPanel/SelectionBreadcrumb';

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
  datasetId?: string;
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

type TabId = 'columns' | 'statistics' | 'ddl';

const TABS = [
  { id: 'columns' as const, label: 'Columns', icon: <LayoutList className="w-4 h-4" /> },
  { id: 'statistics' as const, label: 'Statistics', icon: <BarChart3 className="w-4 h-4" /> },
  { id: 'ddl' as const, label: 'DDL', icon: <Code className="w-4 h-4" /> },
];

export const DetailPanel: React.FC<DetailPanelProps> = ({
  isOpen,
  onClose,
  selectedColumn,
  selectedEdge,
  datasetId,
  onViewFullLineage,
  onViewImpactAnalysis,
}) => {
  const [activeTab, setActiveTab] = useState<TabId>('columns');

  // Compute effective datasetId from prop or selectedColumn
  const effectiveDatasetId = datasetId || (selectedColumn
    ? selectedColumn.id.substring(0, selectedColumn.id.lastIndexOf('.'))
    : '');

  // Reset tab to columns when selection changes
  useEffect(() => {
    setActiveTab('columns');
  }, [selectedColumn?.id]);

  const renderEdgeDetails = () => {
    if (!selectedEdge) return null;

    return (
      <div className="p-4 overflow-y-auto flex-1">
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
      </div>
    );
  };

  const renderColumnTabbed = () => {
    if (!selectedColumn) return null;

    return (
      <>
        {/* Selection breadcrumb */}
        <div className="px-4 py-2 border-b border-slate-100">
          <SelectionBreadcrumb
            databaseName={selectedColumn.databaseName}
            tableName={selectedColumn.tableName}
            columnName={selectedColumn.columnName}
          />
        </div>

        {/* Tab bar */}
        <TabBar tabs={TABS} activeTab={activeTab} onTabChange={(id) => setActiveTab(id as TabId)} />

        {/* Tab panels */}
        <div className="flex-1 overflow-hidden flex flex-col">
          <TabPanel id="columns" activeTab={activeTab}>
            <ColumnsTab
              columns={[selectedColumn]}
              datasetId={effectiveDatasetId}
              onViewFullLineage={onViewFullLineage}
              onViewImpactAnalysis={onViewImpactAnalysis}
            />
          </TabPanel>

          <TabPanel id="statistics" activeTab={activeTab}>
            <StatisticsTab
              datasetId={effectiveDatasetId}
              isActive={activeTab === 'statistics'}
            />
          </TabPanel>

          <TabPanel id="ddl" activeTab={activeTab}>
            <DDLTab
              datasetId={effectiveDatasetId}
              isActive={activeTab === 'ddl'}
            />
          </TabPanel>
        </div>
      </>
    );
  };

  return (
    <div
      data-testid="detail-panel"
      className={`
        fixed right-0 top-0 h-full w-96
        bg-white shadow-xl border-l border-slate-200 z-50
        flex flex-col
        transition-transform duration-300 ease-out
        motion-reduce:transition-none
        ${isOpen ? 'translate-x-0' : 'translate-x-full'}
      `}
      role="dialog"
      aria-label={selectedColumn ? 'Column details' : 'Edge details'}
      aria-hidden={!isOpen}
    >
      {/* Sticky header */}
      <div className="shrink-0 bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
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

      {/* Content area */}
      {selectedColumn && renderColumnTabbed()}
      {selectedEdge && renderEdgeDetails()}
      {!selectedColumn && !selectedEdge && (
        <div className="p-4">
          <p className="text-slate-500 text-sm">No item selected</p>
        </div>
      )}
    </div>
  );
};
