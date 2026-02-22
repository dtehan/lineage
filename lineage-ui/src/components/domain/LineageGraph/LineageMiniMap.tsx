import { MiniMap } from '@xyflow/react';
import type { Node } from '@xyflow/react';

interface LineageMiniMapProps {
  nodeColor?: (node: Node) => string;
}

export function LineageMiniMap({ nodeColor = () => '#94a3b8' }: LineageMiniMapProps) {
  return (
    <MiniMap
      pannable={true}
      zoomable={true}
      nodeColor={nodeColor}
      maskColor="rgba(0, 0, 0, 0.08)"
      maskStrokeColor="#3b82f6"
      maskStrokeWidth={1}
      style={{ bottom: 56 }}
      className="lineage-minimap--interactive"
    />
  );
}
