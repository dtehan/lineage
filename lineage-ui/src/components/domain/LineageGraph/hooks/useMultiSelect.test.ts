import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMultiSelect } from './useMultiSelect';

// Mock useStoreApi from @xyflow/react (hook now calls useStoreApi internally)
const mockSetState = vi.fn();
const mockUnselectNodesAndEdges = vi.fn();
vi.mock('@xyflow/react', () => ({
  useStoreApi: vi.fn(() => ({
    setState: mockSetState,
    getState: vi.fn(() => ({
      unselectNodesAndEdges: mockUnselectNodesAndEdges,
    })),
  })),
}));

// Mock the store module
const mockClearHighlight = vi.fn();
const mockClosePanel = vi.fn();
let mockIsMultiSelectMode = false;
let mockSelectedAssetId: string | null = null;

vi.mock('../../../../stores/useLineageStore', () => ({
  useLineageStore: vi.fn((selector: (state: { isMultiSelectMode: boolean }) => unknown) =>
    selector({ isMultiSelectMode: mockIsMultiSelectMode })
  ),
}));

// Import the mock after defining it
import { useLineageStore } from '../../../../stores/useLineageStore';

// Attach getState to the mock
const mockUseLineageStore = vi.mocked(useLineageStore) as unknown as {
  getState: () => {
    selectedAssetId: string | null;
    clearHighlight: () => void;
    closePanel: () => void;
  };
} & typeof useLineageStore;

beforeEach(() => {
  vi.clearAllMocks();
  mockIsMultiSelectMode = false;
  mockSelectedAssetId = null;
  mockSetState.mockClear();
  mockUnselectNodesAndEdges.mockClear();

  mockUseLineageStore.getState = vi.fn(() => ({
    selectedAssetId: mockSelectedAssetId,
    clearHighlight: mockClearHighlight,
    closePanel: mockClosePanel,
  }));
});

describe('useMultiSelect', () => {
  describe('isMultiSelectMode', () => {
    it('returns isMultiSelectMode false from store', () => {
      mockIsMultiSelectMode = false;
      const hasUserInteractedRef = { current: false };
      const { result } = renderHook(() => useMultiSelect(hasUserInteractedRef));

      expect(result.current.isMultiSelectMode).toBe(false);
    });

    it('returns isMultiSelectMode true when store has it true', () => {
      mockIsMultiSelectMode = true;
      const hasUserInteractedRef = { current: false };
      const { result } = renderHook(() => useMultiSelect(hasUserInteractedRef));

      expect(result.current.isMultiSelectMode).toBe(true);
    });
  });

  describe('onSelectionDragStart', () => {
    it('sets hasUserInteractedRef to true when called', () => {
      const hasUserInteractedRef = { current: false };
      const { result } = renderHook(() => useMultiSelect(hasUserInteractedRef));

      expect(hasUserInteractedRef.current).toBe(false);

      act(() => {
        result.current.onSelectionDragStart();
      });

      expect(hasUserInteractedRef.current).toBe(true);
    });
  });

  describe('onSelectionChange', () => {
    it('clears highlight when nodes selected and selectedAssetId exists', () => {
      mockSelectedAssetId = 'some-asset-id';
      const hasUserInteractedRef = { current: false };
      const { result } = renderHook(() => useMultiSelect(hasUserInteractedRef));

      act(() => {
        result.current.onSelectionChange({
          nodes: [{ id: 'node-1', position: { x: 0, y: 0 }, data: {} }],
        } as Parameters<typeof result.current.onSelectionChange>[0]);
      });

      expect(mockClearHighlight).toHaveBeenCalledTimes(1);
      expect(mockClosePanel).toHaveBeenCalledTimes(1);
    });

    it('does nothing when no nodes selected (empty array)', () => {
      mockSelectedAssetId = 'some-asset-id';
      const hasUserInteractedRef = { current: false };
      const { result } = renderHook(() => useMultiSelect(hasUserInteractedRef));

      act(() => {
        result.current.onSelectionChange({ nodes: [] });
      });

      expect(mockClearHighlight).not.toHaveBeenCalled();
      expect(mockClosePanel).not.toHaveBeenCalled();
    });

    it('does nothing when no prior column selection (selectedAssetId is null)', () => {
      mockSelectedAssetId = null;
      const hasUserInteractedRef = { current: false };
      const { result } = renderHook(() => useMultiSelect(hasUserInteractedRef));

      act(() => {
        result.current.onSelectionChange({
          nodes: [{ id: 'node-1', position: { x: 0, y: 0 }, data: {} }],
        } as Parameters<typeof result.current.onSelectionChange>[0]);
      });

      expect(mockClearHighlight).not.toHaveBeenCalled();
      expect(mockClosePanel).not.toHaveBeenCalled();
    });

    it('calls clearHighlight and closePanel when multiple nodes selected', () => {
      mockSelectedAssetId = 'col-id-1';
      const hasUserInteractedRef = { current: false };
      const { result } = renderHook(() => useMultiSelect(hasUserInteractedRef));

      act(() => {
        result.current.onSelectionChange({
          nodes: [
            { id: 'node-1', position: { x: 0, y: 0 }, data: {} },
            { id: 'node-2', position: { x: 100, y: 0 }, data: {} },
            { id: 'node-3', position: { x: 200, y: 0 }, data: {} },
          ],
        } as Parameters<typeof result.current.onSelectionChange>[0]);
      });

      expect(mockClearHighlight).toHaveBeenCalledTimes(1);
      expect(mockClosePanel).toHaveBeenCalledTimes(1);
    });
  });

  describe('return shape', () => {
    it('returns isMultiSelectMode, onSelectionChange, and onSelectionDragStart', () => {
      const hasUserInteractedRef = { current: false };
      const { result } = renderHook(() => useMultiSelect(hasUserInteractedRef));

      expect(typeof result.current.isMultiSelectMode).toBe('boolean');
      expect(typeof result.current.onSelectionChange).toBe('function');
      expect(typeof result.current.onSelectionDragStart).toBe('function');
    });
  });
});
