import { useCallback, useEffect } from 'react';
import type { MutableRefObject, Dispatch, SetStateAction } from 'react';
import { type Node, type NodeChange } from '@xyflow/react';
import { useLineageStore } from '../../../../stores/useLineageStore';

export interface UseMultiSelectReturn {
  isMultiSelectMode: boolean;
  onSelectionChange: (params: { nodes: Node[] }) => void;
  onSelectionDragStart: () => void;
  onNodesChange: (changes: NodeChange[]) => void;
}

export function useMultiSelect(
  hasUserInteractedRef: MutableRefObject<boolean>,
  baseOnNodesChange: (changes: NodeChange[]) => void,
  setNodes: Dispatch<SetStateAction<Node[]>>
): UseMultiSelectReturn {
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

  // When exiting multi-select mode, clear all node selections
  useEffect(() => {
    if (!isMultiSelectMode) {
      setNodes((nodes) => nodes.map((n) => ({ ...n, selected: false })));
    }
  }, [isMultiSelectMode, setNodes]);

  // Enhanced onNodesChange: in multi-select mode, prevent RF from deselecting existing
  // nodes when a new node is clicked. RF fires both a deselect-old and select-new change
  // in the same batch — filter out the deselects so clicks are additive.
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      if (isMultiSelectMode) {
        const hasNewSelection = changes.some(
          (c) => c.type === 'select' && (c as { type: 'select'; selected: boolean }).selected
        );
        if (hasNewSelection) {
          baseOnNodesChange(
            changes.filter(
              (c) => !(c.type === 'select' && !(c as { type: 'select'; selected: boolean }).selected)
            )
          );
          return;
        }
      }
      baseOnNodesChange(changes);
    },
    [isMultiSelectMode, baseOnNodesChange]
  );

  return {
    isMultiSelectMode,
    onSelectionChange,
    onSelectionDragStart,
    onNodesChange,
  };
}
