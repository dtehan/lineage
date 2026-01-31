import { useParams, useSearchParams } from 'react-router-dom';
import { LineageGraph } from '../components/domain/LineageGraph/LineageGraph';
import { useLineageStore } from '../stores/useLineageStore';
import { BackButton } from '../components/common/BackButton';

export function LineagePage() {
  const { datasetId, fieldName } = useParams<{ datasetId: string; fieldName: string }>();
  const [searchParams] = useSearchParams();
  const { maxDepth, setMaxDepth, direction, setDirection } = useLineageStore();

  if (!datasetId || !fieldName) {
    return <div className="p-4 text-slate-500">No dataset or field selected</div>;
  }

  // Decode URL parameters
  const decodedDatasetId = decodeURIComponent(datasetId);
  const decodedFieldName = decodeURIComponent(fieldName);

  // Check if table mode is requested via query parameter
  const tableMode = searchParams.get('mode') === 'table';

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center justify-between px-4 py-2 bg-white border-b">
        <div className="flex items-center gap-4">
          <BackButton />
          <h1 className="text-lg font-semibold">
            Lineage: <span className="font-mono text-sm">{decodedDatasetId}.{decodedFieldName}</span>
          </h1>
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2">
            <span className="text-sm text-slate-600">Depth:</span>
            <select
              value={maxDepth}
              onChange={(e) => setMaxDepth(Number(e.target.value))}
              className="px-2 py-1 border rounded text-sm"
            >
              {[1, 2, 3, 5, 10].map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <span className="text-sm text-slate-600">Direction:</span>
            <select
              value={direction}
              onChange={(e) => setDirection(e.target.value as 'upstream' | 'downstream' | 'both')}
              className="px-2 py-1 border rounded text-sm"
            >
              <option value="both">Both</option>
              <option value="upstream">Upstream Only</option>
              <option value="downstream">Downstream Only</option>
            </select>
          </label>
        </div>
      </header>
      <main className="flex-1">
        <LineageGraph datasetId={decodedDatasetId} fieldName={decodedFieldName} tableMode={tableMode} />
      </main>
    </div>
  );
}
