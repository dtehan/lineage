import React from 'react';
import { useDatasetStatistics } from '../../../../api/hooks/useOpenLineage';
import { LoadingSpinner } from '../../../common/LoadingSpinner';
import { AlertCircle } from 'lucide-react';

interface StatisticsTabProps {
  datasetId: string;
  isActive: boolean;
}

function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return 'N/A';
  if (bytes === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const value = bytes / Math.pow(k, i);

  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return 'N/A';
  return new Intl.NumberFormat().format(value);
}

function formatDate(timestamp: string | undefined): string {
  if (!timestamp) return 'N/A';
  try {
    return new Date(timestamp).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return timestamp;
  }
}

export const StatisticsTab: React.FC<StatisticsTabProps> = ({ datasetId, isActive }) => {
  const { data, isLoading, error, refetch } = useDatasetStatistics(datasetId, {
    enabled: isActive,
  });

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-8 gap-3">
        <LoadingSpinner size="sm" />
        <span className="text-sm text-slate-500">Loading statistics...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="m-4 p-4 bg-slate-50 border border-slate-200 rounded-lg">
        <div className="flex items-center gap-2 text-slate-600 mb-2">
          <AlertCircle className="w-4 h-4" />
          <span className="text-sm font-medium">Failed to load statistics</span>
        </div>
        <p className="text-xs text-slate-500 mb-3">
          {error.message || 'An unexpected error occurred.'}
        </p>
        <button
          onClick={() => refetch()}
          className="px-3 py-1.5 text-sm bg-white border border-slate-300 text-slate-700 rounded hover:bg-slate-50"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!data) return null;

  const rows: { label: string; value: React.ReactNode }[] = [
    { label: 'Type', value: data.sourceType },
    { label: 'Owner', value: data.creatorName || 'N/A' },
    { label: 'Created', value: formatDate(data.createTimestamp) },
    { label: 'Last Modified', value: formatDate(data.lastAlterTimestamp) },
    { label: 'Row Count', value: formatNumber(data.rowCount) },
  ];

  // Only show size for tables (views have no size)
  if (data.sizeBytes !== null && data.sizeBytes !== undefined) {
    rows.push({ label: 'Size', value: formatBytes(data.sizeBytes) });
  }

  return (
    <div className="p-4">
      <dl className="space-y-3">
        {rows.map((row) => (
          <div key={row.label} className="flex justify-between items-baseline">
            <dt className="text-sm text-slate-500">{row.label}:</dt>
            <dd className="text-sm font-medium text-slate-700">{row.value}</dd>
          </div>
        ))}
      </dl>

      {/* Table comment */}
      {data.tableComment && (
        <div className="mt-4 pt-4 border-t border-slate-200">
          <h4 className="text-sm font-medium text-slate-600 mb-1">Comment</h4>
          <p className="text-sm text-slate-600 italic">{data.tableComment}</p>
        </div>
      )}
    </div>
  );
};
