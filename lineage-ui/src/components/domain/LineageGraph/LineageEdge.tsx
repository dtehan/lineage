import { memo } from 'react';
import { BaseEdge, getSmoothStepPath, type EdgeProps } from '@xyflow/react';

export const LineageEdge = memo(function LineageEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
}: EdgeProps) {
  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const getEdgeColor = () => {
    const edgeData = data as { transformationType?: string } | undefined;
    if (edgeData?.transformationType === 'DIRECT') return '#10b981';
    if (edgeData?.transformationType === 'AGGREGATION') return '#f59e0b';
    if (edgeData?.transformationType === 'CALCULATION') return '#8b5cf6';
    return '#64748b';
  };

  return (
    <BaseEdge
      id={id}
      path={edgePath}
      markerEnd={markerEnd}
      style={{
        stroke: getEdgeColor(),
        strokeWidth: 2,
      }}
    />
  );
});
