import { memo, useState } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from '@xyflow/react';
import { useLineageStore } from '../../../stores/useLineageStore';

export interface LineageEdgeData {
  sourceColumnId?: string;
  targetColumnId?: string;
  transformationType?: string;
  confidenceScore?: number;
  transformationSql?: string;
}

/**
 * Returns edge color based on transformation type per spec Section 2.1
 */
function getEdgeColor(transformationType?: string): string {
  const type = transformationType?.toLowerCase();

  switch (type) {
    case 'direct':
      return '#22C55E'; // green-500
    case 'derived':
      return '#3B82F6'; // blue-500
    case 'aggregated':
    case 'aggregation':
      return '#A855F7'; // purple-500
    case 'joined':
      return '#06B6D4'; // cyan-500
    case 'calculation':
      return '#8b5cf6'; // violet-500 (legacy)
    default:
      return '#9CA3AF'; // gray-400 (unknown)
  }
}

/**
 * Applies confidence-based styling per spec Section 2.4
 */
function getConfidenceStyles(confidence?: number): { opacity: number } {
  if (confidence === undefined) {
    return { opacity: 1 };
  }

  // Confidence is expected as 0-100 or 0-1
  const normalizedConfidence = confidence > 1 ? confidence : confidence * 100;

  const opacity =
    normalizedConfidence >= 90
      ? 1.0
      : normalizedConfidence >= 70
        ? 0.9
        : normalizedConfidence >= 50
          ? 0.8
          : 0.7;

  return { opacity };
}

/**
 * Formats transformation type for display
 */
function formatTransformationType(type?: string): string {
  if (!type) return 'Unknown';
  return type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
}

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
  selected,
}: EdgeProps) {
  const [isHovered, setIsHovered] = useState(false);
  const { highlightedEdgeIds, selectedEdgeId } = useLineageStore();

  const edgeData = data as LineageEdgeData | undefined;
  const isHighlighted = highlightedEdgeIds.has(id);
  const isSelected = selectedEdgeId === id || selected;
  const hasSelection = highlightedEdgeIds.size > 0;
  const isDimmed = hasSelection && !isHighlighted && !isSelected;

  // Get edge path
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  // Get colors and styles
  const baseColor = getEdgeColor(edgeData?.transformationType);
  const confidenceStyles = getConfidenceStyles(edgeData?.confidenceScore);

  // Calculate final opacity
  const finalOpacity = isDimmed ? 0.1 : confidenceStyles.opacity;

  // Determine if edge should be animated
  const shouldAnimate = isHighlighted || isSelected || isHovered;

  // Determine stroke width
  const strokeWidth = isHighlighted || isSelected || isHovered ? 3 : 2;

  return (
    <>
      {/* Invisible wider path for easier hover detection */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{ cursor: 'pointer' }}
      />

      {/* Main edge */}
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke: baseColor,
          strokeWidth,
          opacity: finalOpacity,
          strokeDasharray: shouldAnimate ? '5 5' : undefined,
          transition: 'stroke-width 200ms ease-out, opacity 200ms ease-out',
        }}
        className={shouldAnimate ? 'animate-dash' : ''}
      />

      {/* Glow effect for selected edges */}
      {(isSelected || isHighlighted) && (
        <path
          d={edgePath}
          fill="none"
          stroke={baseColor}
          strokeWidth={6}
          strokeOpacity={0.3}
          style={{ filter: 'blur(3px)' }}
        />
      )}

      {/* Edge label on hover or selection */}
      {(isHovered || isSelected) && edgeData?.transformationType && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'none',
            }}
            className="bg-white px-2 py-1 rounded shadow-md text-xs font-medium border border-slate-200 edge-label-enter"
          >
            <span style={{ color: baseColor }}>
              {formatTransformationType(edgeData.transformationType)}
            </span>
            {edgeData.confidenceScore !== undefined && (
              <span className="ml-2 text-slate-500">
                {Math.round(
                  edgeData.confidenceScore > 1
                    ? edgeData.confidenceScore
                    : edgeData.confidenceScore * 100
                )}
                %
              </span>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
});
