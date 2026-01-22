import { useParams } from 'react-router-dom';
import { useImpactAnalysis } from '../api/hooks/useLineage';
import { ImpactAnalysis } from '../components/domain/ImpactAnalysis/ImpactAnalysis';
import { LoadingSpinner } from '../components/common/LoadingSpinner';

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

  return <ImpactAnalysis data={data!} />;
}
