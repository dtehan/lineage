import { useCallback } from 'react';
import type { MutableRefObject } from 'react';
import { type Node } from '@xyflow/react';
import { useLineageStore } from '../../../../stores/useLineageStore';

export interface UseMultiSelectReturn {
  isMultiSelectMode: boolean;
  onSelectionChange: (params: { nodes: Node[] }) => void;
  onSelectionDragStart: () => void;
}

export function useMultiSelect(hasUserInteractedRef: MutableRefObject<boolean>): UseMultiSelectReturn {
  const isMultiSelectMode = useLineageStore((s) => s.isMultiSelectMode);

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
