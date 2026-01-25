import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { AllDatabasesLineageGraph } from '../components/domain/LineageGraph/AllDatabasesLineageGraph';

export function AllDatabasesLineagePage() {
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
        <AllDatabasesLineageGraph />
      </main>
    </div>
  );
}
