import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import React from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { useFitToSelection } from './useFitToSelection';

// Mock useReactFlow
const mockFitView = vi.fn();
const mockGetNodes = vi.fn();

vi.mock('@xyflow/react', async () => {
  const actual = await vi.importActual('@xyflow/react');
  return {
    ...actual,
    useReactFlow: () => ({
      fitView: mockFitView,
      getNodes: mockGetNodes,
    }),
  };
});

vi.mock('../../../../stores/useLineageStore', () => ({
  useLineageStore: vi.fn(),
}));

import { useLineageStore } from '../../../../stores/useLineageStore';
const mockUseLineageStore = vi.mocked(useLineageStore);

// Helper to create table nodes matching TableNodeData shape
function makeTableNode(
  id: string,
  columnIds: string[]
) {
  return {
    id,
    type: 'tableNode',
    position: { x: 0, y: 0 },
    data: {
      id,
      databaseName: 'test_db',
      tableName: id,
      columns: columnIds.map((colId) => ({
        id: colId,
        name: colId,
        dataType: 'VARCHAR',
      })),
      isExpanded: true,
      assetType: 'table',
    },
  };
}

describe('useFitToSelection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(ReactFlowProvider, null, children);

  it('returns fitToSelection function and hasSelection boolean', () => {
    mockUseLineageStore.mockImplementation((selector: any) =>
      selector({ highlightedNodeIds: new Set() })
    );

    const { result } = renderHook(() => useFitToSelection(), { wrapper });

    expect(typeof result.current.fitToSelection).toBe('function');
    expect(typeof result.current.hasSelection).toBe('boolean');
  });

  it('hasSelection is true when highlightedNodeIds has entries', () => {
    mockUseLineageStore.mockImplementation((selector: any) =>
      selector({ highlightedNodeIds: new Set(['col-A']) })
    );

    const { result } = renderHook(() => useFitToSelection(), { wrapper });

    expect(result.current.hasSelection).toBe(true);
  });

  it('hasSelection is false when highlightedNodeIds is empty', () => {
    mockUseLineageStore.mockImplementation((selector: any) =>
      selector({ highlightedNodeIds: new Set() })
    );

    const { result } = renderHook(() => useFitToSelection(), { wrapper });

    expect(result.current.hasSelection).toBe(false);
  });

  it('fitToSelection calls fitView with correct table node IDs', () => {
    mockUseLineageStore.mockImplementation((selector: any) =>
      selector({ highlightedNodeIds: new Set(['col-A', 'col-B']) })
    );

    mockGetNodes.mockReturnValue([
      makeTableNode('table-1', ['col-A', 'col-X']),
      makeTableNode('table-2', ['col-B', 'col-Y']),
      makeTableNode('table-3', ['col-C', 'col-Z']),
    ]);

    const { result } = renderHook(() => useFitToSelection(), { wrapper });
    result.current.fitToSelection();

    expect(mockFitView).toHaveBeenCalledTimes(1);
    expect(mockFitView).toHaveBeenCalledWith({
      nodes: [{ id: 'table-1' }, { id: 'table-2' }],
      padding: 0.15,
      duration: 300,
    });
  });

  it('fitToSelection does NOT call fitView when highlightedNodeIds is empty', () => {
    mockUseLineageStore.mockImplementation((selector: any) =>
      selector({ highlightedNodeIds: new Set() })
    );

    const { result } = renderHook(() => useFitToSelection(), { wrapper });
    result.current.fitToSelection();

    expect(mockFitView).not.toHaveBeenCalled();
  });

  it('fitToSelection does NOT call fitView when no table nodes contain highlighted columns', () => {
    mockUseLineageStore.mockImplementation((selector: any) =>
      selector({ highlightedNodeIds: new Set(['col-nonexistent']) })
    );

    mockGetNodes.mockReturnValue([
      makeTableNode('table-1', ['col-A', 'col-B']),
      makeTableNode('table-2', ['col-C', 'col-D']),
    ]);

    const { result } = renderHook(() => useFitToSelection(), { wrapper });
    result.current.fitToSelection();

    expect(mockFitView).not.toHaveBeenCalled();
  });

  it('handles single highlighted column correctly (one table node returned)', () => {
    mockUseLineageStore.mockImplementation((selector: any) =>
      selector({ highlightedNodeIds: new Set(['col-A']) })
    );

    mockGetNodes.mockReturnValue([
      makeTableNode('table-1', ['col-A']),
      makeTableNode('table-2', ['col-B']),
    ]);

    const { result } = renderHook(() => useFitToSelection(), { wrapper });
    result.current.fitToSelection();

    expect(mockFitView).toHaveBeenCalledWith({
      nodes: [{ id: 'table-1' }],
      padding: 0.15,
      duration: 300,
    });
  });

  it('handles all columns in same table (returns single table node, not duplicates)', () => {
    mockUseLineageStore.mockImplementation((selector: any) =>
      selector({ highlightedNodeIds: new Set(['col-A', 'col-B']) })
    );

    mockGetNodes.mockReturnValue([
      makeTableNode('table-1', ['col-A', 'col-B', 'col-C']),
      makeTableNode('table-2', ['col-D']),
    ]);

    const { result } = renderHook(() => useFitToSelection(), { wrapper });
    result.current.fitToSelection();

    expect(mockFitView).toHaveBeenCalledWith({
      nodes: [{ id: 'table-1' }],
      padding: 0.15,
      duration: 300,
    });
  });

  it('uses FIT_TO_SELECTION_PADDING = 0.15', () => {
    mockUseLineageStore.mockImplementation((selector: any) =>
      selector({ highlightedNodeIds: new Set(['col-A']) })
    );

    mockGetNodes.mockReturnValue([makeTableNode('table-1', ['col-A'])]);

    const { result } = renderHook(() => useFitToSelection(), { wrapper });
    result.current.fitToSelection();

    const callArgs = mockFitView.mock.calls[0][0];
    expect(callArgs.padding).toBe(0.15);
  });

  it('uses FIT_TO_SELECTION_DURATION = 300', () => {
    mockUseLineageStore.mockImplementation((selector: any) =>
      selector({ highlightedNodeIds: new Set(['col-A']) })
    );

    mockGetNodes.mockReturnValue([makeTableNode('table-1', ['col-A'])]);

    const { result } = renderHook(() => useFitToSelection(), { wrapper });
    result.current.fitToSelection();

    const callArgs = mockFitView.mock.calls[0][0];
    expect(callArgs.duration).toBe(300);
  });
});
