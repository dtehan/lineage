import type { ImpactAnalysisApiResponse } from '../../../types/openlineage';
import { ImpactSummary } from './ImpactSummary';
import { ImpactTable } from './ImpactTable';

interface ImpactAnalysisProps {
  data: ImpactAnalysisApiResponse;
}

export function ImpactAnalysis({ data }: ImpactAnalysisProps) {
  return (
    <div className="space-y-6">
      <ImpactSummary summary={data.summary} />

      <div className="mt-8">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-slate-800">
            Impact analysis for{' '}
            <span className="font-mono text-sm text-blue-600">
              {data.sourceAsset.datasetName}.{data.sourceAsset.fieldName}
            </span>
          </h2>
        </div>

        {/* Upstream section */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <h3 className="text-base font-semibold text-slate-700">Upstream Sources</h3>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700">
              {data.upstreamAssets.length} column{data.upstreamAssets.length !== 1 ? 's' : ''}
            </span>
          </div>
          <p className="text-sm text-slate-500 mb-3">
            Columns that flow into{' '}
            <span className="font-mono">{data.sourceAsset.fieldName}</span>
            {' '}— changes to these may affect this column.
          </p>
          {data.upstreamAssets.length === 0 ? (
            <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-6 text-center">
              <p className="text-indigo-800">
                No upstream sources found for this column
              </p>
            </div>
          ) : (
            <ImpactTable data={data.upstreamAssets} direction="upstream" />
          )}
        </div>

        {/* Downstream section */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <h3 className="text-base font-semibold text-slate-700">Downstream Dependencies</h3>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
              {data.impactedAssets.length} column{data.impactedAssets.length !== 1 ? 's' : ''}
            </span>
          </div>
          <p className="text-sm text-slate-500 mb-3">
            Columns that depend on{' '}
            <span className="font-mono">{data.sourceAsset.fieldName}</span>
            {' '}— changes to this column may affect these.
          </p>
          {data.impactedAssets.length === 0 ? (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-6 text-center">
              <p className="text-orange-800">
                No downstream dependencies found for this column
              </p>
            </div>
          ) : (
            <ImpactTable data={data.impactedAssets} direction="downstream" />
          )}
        </div>
      </div>
    </div>
  );
}
