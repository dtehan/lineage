import { useCallback, useEffect } from 'react';
import type { MutableRefObject } from 'react';
import { type Node, useStoreApi } from '@xyflow/react';
import { useLineageStore } from '../../../../stores/useLineageStore';

export interface UseMultiSelectReturn {
  isMultiSelectMode: boolean;
  onSelectionChange: (params: { nodes: Node[] }) => void;
  onSelectionDragStart: () => void;
}

export function useMultiSelect(hasUserInteractedRef: MutableRefObject<boolean>): UseMultiSelectReturn {
  const isMultiSelectMode = useLineageStore((s) => s.isMultiSelectMode);
  const storeApi = useStoreApi();

  // Keep RF's multiSelectionActive in sync with toolbar multi-select mode.
  // When true, every node click is additive (RF's addSelectedNodes appends instead
  // of replacing), which also enables RF's native group drag across all selected nodes.
  // multiSelectionKeyCode={null} prevents RF's key handler from overwriting this value.
  useEffect(() => {
    if (isMultiSelectMode) {
      storeApi.setState({ multiSelectionActive: true });
    } else {
      storeApi.setState({ multiSelectionActive: false });
      storeApi.getState().unselectNodesAndEdges();
    }
  }, [isMultiSelectMode, storeApi]);

  const onSelectionChange = useCallback(
    ({ nodes: selectedNodes }: { nodes: Node[] }) => {
      // When multi-selecting nodes, clear column-level selection to prevent dimming
      if (selectedNodes.length > 0) {
        const { selectedAssetId, clearHighlight, closePanel } = useLineageStore.getState();
        if (selectedAssetId) {
          clearHighlight();
          closePanel();
        }
      }
    },
    []
  );

  const onSelectionDragStart = useCallback(() => {
    hasUserInteractedRef.current = true;
  }, [hasUserInteractedRef]);

  return {
    isMultiSelectMode,
    onSelectionChange,
    onSelectionDragStart,
  };
}
