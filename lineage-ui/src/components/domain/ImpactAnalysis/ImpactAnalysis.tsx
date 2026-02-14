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

        {data.impactedAssets.length === 0 ? (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 text-center">
            <p className="text-blue-800">
              No downstream dependencies found for this column
            </p>
          </div>
        ) : (
          <ImpactTable data={data.impactedAssets} />
        )}
      </div>
    </div>
  );
}
