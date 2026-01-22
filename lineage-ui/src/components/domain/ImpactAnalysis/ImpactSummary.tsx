import type { ImpactSummary as ImpactSummaryType } from '../../../types';

interface ImpactSummaryProps {
  summary: ImpactSummaryType;
}

export function ImpactSummary({ summary }: ImpactSummaryProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      <SummaryCard
        title="Total Impacted"
        value={summary.totalImpacted}
        color="blue"
      />
      <SummaryCard
        title="Critical"
        value={summary.criticalCount}
        color="red"
      />
      <SummaryCard
        title="Databases"
        value={Object.keys(summary.byDatabase).length}
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
  color: 'blue' | 'red' | 'green' | 'purple';
}

const colorClasses = {
  blue: 'bg-blue-50 border-blue-200 text-blue-600',
  red: 'bg-red-50 border-red-200 text-red-600',
  green: 'bg-green-50 border-green-200 text-green-600',
  purple: 'bg-purple-50 border-purple-200 text-purple-600',
};

function SummaryCard({ title, value, color }: SummaryCardProps) {
  return (
    <div className={`p-4 rounded-lg border ${colorClasses[color]}`}>
      <p className="text-sm font-medium text-slate-600">{title}</p>
      <p className="text-3xl font-bold mt-1">{value}</p>
    </div>
  );
}
