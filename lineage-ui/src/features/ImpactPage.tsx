import { useParams } from 'react-router-dom';
import { BackButton } from '../components/common/BackButton';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { ImpactAnalysis } from '../components/domain/ImpactAnalysis/ImpactAnalysis';
import { useImpactAnalysis } from '../api/hooks/useImpact';

export function ImpactPage() {
  const { datasetId, fieldName } = useParams<{ datasetId: string; fieldName: string }>();

  if (!datasetId || !fieldName) {
    return <div className="p-4 text-slate-500">No dataset or field selected</div>;
  }

  // Decode URL parameters
  const decodedDatasetId = decodeURIComponent(datasetId);
  const decodedFieldName = decodeURIComponent(fieldName);

  // Fetch impact analysis data
  const { data, isLoading, error, refetch } = useImpactAnalysis(decodedDatasetId, decodedFieldName);

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center gap-4 px-4 py-2 bg-white border-b">
        <BackButton />
        <h1 className="text-lg font-semibold">
          Impact Analysis: <span className="font-mono text-sm">{decodedDatasetId}.{decodedFieldName}</span>
        </h1>
      </header>
      <main className="flex-1 overflow-auto p-8">
        {isLoading && (
          <div className="flex items-center justify-center h-64">
            <LoadingSpinner />
          </div>
        )}

        {error && (
          <div className="max-w-2xl mx-auto">
            <div className="bg-red-50 border border-red-200 rounded-lg p-6">
              <h2 className="text-lg font-semibold text-red-900 mb-2">
                Error Loading Impact Analysis
              </h2>
              <p className="text-sm text-red-800 mb-4">
                {error instanceof Error ? error.message : 'An unexpected error occurred'}
              </p>
              <button
                onClick={() => refetch()}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {data && !isLoading && !error && (
          <div className="max-w-7xl mx-auto">
            <ImpactAnalysis data={data} />
          </div>
        )}
      </main>
    </div>
  );
}
