import { AssetBrowser } from '../components/domain/AssetBrowser/AssetBrowser';
import { LineageGraph } from '../components/domain/LineageGraph/LineageGraph';
import { useLineageStore } from '../stores/useLineageStore';

export function ExplorePage() {
  const { selectedAssetId } = useLineageStore();

  return (
    <div className="flex h-full">
      <aside className="w-80 border-r border-slate-200 bg-white">
        <AssetBrowser />
      </aside>
      <main className="flex-1 bg-slate-50">
        {selectedAssetId ? (
          <LineageGraph assetId={selectedAssetId} />
        ) : (
          <div className="flex items-center justify-center h-full text-slate-500">
            Select a column to view its lineage
          </div>
        )}
      </main>
    </div>
  );
}
