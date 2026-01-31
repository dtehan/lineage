import { useParams } from 'react-router-dom';
import { BackButton } from '../components/common/BackButton';

export function ImpactPage() {
  const { datasetId, fieldName } = useParams<{ datasetId: string; fieldName: string }>();

  if (!datasetId || !fieldName) {
    return <div className="p-4 text-slate-500">No dataset or field selected</div>;
  }

  // Decode URL parameters
  const decodedDatasetId = decodeURIComponent(datasetId);
  const decodedFieldName = decodeURIComponent(fieldName);

  // TODO: Implement OpenLineage-based impact analysis
  // The impact analysis feature needs to be reimplemented using the OpenLineage graph API

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center gap-4 px-4 py-2 bg-white border-b">
        <BackButton />
        <h1 className="text-lg font-semibold">
          Impact Analysis: <span className="font-mono text-sm">{decodedDatasetId}.{decodedFieldName}</span>
        </h1>
      </header>
      <main className="flex-1 overflow-auto p-8">
        <div className="max-w-2xl mx-auto text-center">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-yellow-900 mb-2">
              Feature In Development
            </h2>
            <p className="text-sm text-yellow-800">
              Impact analysis is being migrated to use the OpenLineage V2 API.
              This feature will be available soon.
            </p>
            <p className="text-xs text-yellow-700 mt-4">
              In the meantime, you can view the full lineage graph to understand downstream dependencies.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
