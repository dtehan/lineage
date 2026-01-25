import { useParams, Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { DatabaseLineageGraph } from '../components/domain/LineageGraph/DatabaseLineageGraph';

export function DatabaseLineagePage() {
  const { databaseName } = useParams<{ databaseName: string }>();

  if (!databaseName) {
    return (
      <div className="flex items-center justify-center h-full text-slate-500">
        No database selected
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center gap-4 px-4 py-2 bg-white border-b">
        <Link
          to="/"
          className="flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Explorer
        </Link>
      </header>
      <main className="flex-1">
        <DatabaseLineageGraph databaseName={databaseName} />
      </main>
    </div>
  );
}
