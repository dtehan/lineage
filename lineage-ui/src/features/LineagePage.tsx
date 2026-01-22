import { useParams } from 'react-router-dom';
import { LineageGraph } from '../components/domain/LineageGraph/LineageGraph';
import { useLineageStore } from '../stores/useLineageStore';

export function LineagePage() {
  const { assetId } = useParams<{ assetId: string }>();
  const { maxDepth, setMaxDepth, direction, setDirection } = useLineageStore();

  if (!assetId) {
    return <div>No asset selected</div>;
  }

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center justify-between px-4 py-2 bg-white border-b">
        <h1 className="text-lg font-semibold">Lineage: {assetId}</h1>
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
        <LineageGraph assetId={assetId} />
      </main>
    </div>
  );
}
