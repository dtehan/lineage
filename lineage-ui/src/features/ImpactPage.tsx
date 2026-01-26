import { useParams } from 'react-router-dom';
import { useImpactAnalysis } from '../api/hooks/useLineage';
import { ImpactAnalysis } from '../components/domain/ImpactAnalysis/ImpactAnalysis';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { BackButton } from '../components/common/BackButton';

export function ImpactPage() {
  const { assetId } = useParams<{ assetId: string }>();
  const { data, isLoading, error } = useImpactAnalysis(assetId || '');

  if (!assetId) {
    return <div>No asset selected</div>;
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-red-500">
        Failed to load impact analysis
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center gap-4 px-4 py-2 bg-white border-b">
        <BackButton />
        <h1 className="text-lg font-semibold">Impact Analysis: {assetId}</h1>
      </header>
      <main className="flex-1 overflow-auto">
        <ImpactAnalysis data={data!} />
      </main>
    </div>
  );
}
