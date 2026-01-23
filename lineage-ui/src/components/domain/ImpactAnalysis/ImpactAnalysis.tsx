import { useNavigate } from 'react-router-dom';
import { ArrowLeft, HelpCircle } from 'lucide-react';
import type { ImpactAnalysisResponse } from '../../../types';
import { ImpactSummary } from './ImpactSummary';
import { Tooltip } from '../../common/Tooltip';

interface ImpactAnalysisProps {
  data: ImpactAnalysisResponse;
}

export function ImpactAnalysis({ data }: ImpactAnalysisProps) {
  const navigate = useNavigate();

  const handleBack = () => {
    navigate(-1);
  };

  return (
    <div className="h-full overflow-auto p-6">
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={handleBack}
          className="flex items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
          aria-label="Go back"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <h1 className="text-2xl font-bold text-slate-900">Impact Analysis</h1>
      </div>

      <ImpactSummary summary={data.summary} />

      <div className="mt-8">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">Impacted Assets</h2>
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Asset</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Database</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">
                  <Tooltip content="Number of hops from the source asset" position="top">
                    <span className="flex items-center gap-1 cursor-help">
                      Depth
                      <HelpCircle size={12} className="text-slate-400" />
                    </span>
                  </Tooltip>
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">
                  <Tooltip content="Direct = immediate dependency, Indirect = transitive dependency" position="top">
                    <span className="flex items-center gap-1 cursor-help">
                      Impact Type
                      <HelpCircle size={12} className="text-slate-400" />
                    </span>
                  </Tooltip>
                </th>
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
                    <Tooltip
                      content={
                        asset.impactType === 'direct'
                          ? 'Directly consumes data from the source asset'
                          : 'Depends on the source through intermediate assets'
                      }
                      position="left"
                    >
                      <span
                        className={`
                          inline-flex px-2 py-1 text-xs font-medium rounded-full cursor-help
                          ${asset.impactType === 'direct'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-amber-100 text-amber-700'
                          }
                        `}
                      >
                        {asset.impactType}
                      </span>
                    </Tooltip>
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
