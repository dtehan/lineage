import { useCallback } from 'react';
import { useReactFlow } from '@xyflow/react';
import { useLineageStore } from '../../../../stores/useLineageStore';
import type { TableNodeData } from '../../../../utils/graph/layoutEngine';

/** Padding around fitted nodes (percentage of viewport) */
const FIT_TO_SELECTION_PADDING = 0.15;

/** Animation duration matching panel slide timing from Phase 19 */
const FIT_TO_SELECTION_DURATION = 300;

/**
 * Hook that provides fit-to-selection viewport control.
 * Centers the viewport on the table nodes that contain highlighted columns.
 */
export function useFitToSelection() {
  const reactFlowInstance = useReactFlow();
  const highlightedNodeIds = useLineageStore(
    (state) => state.highlightedNodeIds
  );

  const fitToSelection = useCallback(() => {
    if (highlightedNodeIds.size === 0) return;

    const allNodes = reactFlowInstance.getNodes();

    // Map column IDs (from highlightedNodeIds) to parent table node IDs
    const tableNodeIds: string[] = [];
    for (const node of allNodes) {
      if (node.type === 'tableNode') {
        const data = node.data as TableNodeData;
        const hasHighlightedColumn = data.columns?.some((col) =>
          highlightedNodeIds.has(col.id)
        );
        if (hasHighlightedColumn) {
          tableNodeIds.push(node.id);
        }
      }
    }

    if (tableNodeIds.length === 0) return;

    reactFlowInstance.fitView({
      nodes: tableNodeIds.map((id) => ({ id })),
      padding: FIT_TO_SELECTION_PADDING,
      duration: FIT_TO_SELECTION_DURATION,
    });
  }, [reactFlowInstance, highlightedNodeIds]);

  return {
    fitToSelection,
    hasSelection: highlightedNodeIds.size > 0,
  };
}
