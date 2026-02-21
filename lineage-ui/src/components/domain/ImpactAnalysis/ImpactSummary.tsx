import type { ImpactSummaryData } from '../../../types/openlineage';

interface ImpactSummaryProps {
  summary: ImpactSummaryData;
}

export function ImpactSummary({ summary }: ImpactSummaryProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
      <SummaryCard
        title="Upstream"
        value={summary.upstreamCount}
        color="indigo"
      />
      <SummaryCard
        title="Downstream"
        value={summary.downstreamCount}
        color="orange"
      />
      <SummaryCard
        title="Total Impacted"
        value={summary.totalImpacted}
        color="red"
      />
      <SummaryCard
        title="Tables Affected"
        value={summary.tableCount}
        color="blue"
      />
      <SummaryCard
        title="Databases"
        value={summary.databaseCount}
        color="green"
      />
      <SummaryCard
        title="Max Depth"
        value={Math.max(...Object.keys(summary.byDepth).map(Number), 0)}
        color="purple"
      />
    </div>
  );
}

interface SummaryCardProps {
  title: string;
  value: number;
  color: 'blue' | 'red' | 'green' | 'purple' | 'indigo' | 'orange';
}

const colorClasses = {
  blue: 'bg-blue-50 border-blue-200 text-blue-600',
  red: 'bg-red-50 border-red-200 text-red-600',
  green: 'bg-green-50 border-green-200 text-green-600',
  purple: 'bg-purple-50 border-purple-200 text-purple-600',
  indigo: 'bg-indigo-50 border-indigo-200 text-indigo-600',
  orange: 'bg-orange-50 border-orange-200 text-orange-600',
};

function SummaryCard({ title, value, color }: SummaryCardProps) {
  return (
    <div className={`p-4 rounded-lg border ${colorClasses[color]}`}>
      <p className="text-sm font-medium text-slate-600">{title}</p>
      <p className="text-3xl font-bold mt-1">{value}</p>
    </div>
  );
}
