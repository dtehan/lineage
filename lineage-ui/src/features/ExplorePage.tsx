import { AssetBrowser } from '../components/domain/AssetBrowser/AssetBrowser';
import { Network } from 'lucide-react';

export function ExplorePage() {
  return (
    <div className="flex h-full">
      <aside className="w-80 border-r border-slate-200 bg-white">
        <AssetBrowser />
      </aside>
      <main className="flex-1 bg-slate-50">
        <div className="flex flex-col items-center justify-center h-full text-slate-500">
          <Network className="w-16 h-16 mb-4 text-slate-300" />
          <h2 className="text-xl font-semibold text-slate-700 mb-2">
            Browse Data Assets
          </h2>
          <p className="text-sm text-slate-500 max-w-md text-center">
            Expand databases and datasets in the browser to explore available fields.
            Click on any field to view its lineage graph.
          </p>
        </div>
      </main>
    </div>
  );
}
