import { useParams } from 'react-router-dom';
import { DatabaseLineageGraph } from '../components/domain/LineageGraph/DatabaseLineageGraph';
import { BackButton } from '../components/common/BackButton';

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
        <BackButton />
      </header>
      <main className="flex-1">
        <DatabaseLineageGraph databaseName={databaseName} />
      </main>
    </div>
  );
}
