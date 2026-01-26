import { AllDatabasesLineageGraph } from '../components/domain/LineageGraph/AllDatabasesLineageGraph';
import { BackButton } from '../components/common/BackButton';

export function AllDatabasesLineagePage() {
  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center gap-4 px-4 py-2 bg-white border-b">
        <BackButton />
      </header>
      <main className="flex-1">
        <AllDatabasesLineageGraph />
      </main>
    </div>
  );
}
