import type { ImpactAnalysisResponse } from '../../../types';
import { ImpactSummary } from './ImpactSummary';

interface ImpactAnalysisProps {
  data: ImpactAnalysisResponse;
}

export function ImpactAnalysis({ data }: ImpactAnalysisProps) {
  return (
    <div className="h-full overflow-auto p-6">
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Impact Analysis</h1>

      <ImpactSummary summary={data.summary} />

      <div className="mt-8">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">Impacted Assets</h2>
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Asset</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Database</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Depth</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Impact Type</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {data.impactedAssets.map((asset) => (
                <tr key={asset.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-sm text-slate-900">
                    {asset.tableName}{asset.columnName ? `.${asset.columnName}` : ''}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">{asset.databaseName}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{asset.depth}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`
                        inline-flex px-2 py-1 text-xs font-medium rounded-full
                        ${asset.impactType === 'direct'
                          ? 'bg-red-100 text-red-700'
                          : 'bg-amber-100 text-amber-700'
                        }
                      `}
                    >
                      {asset.impactType}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
