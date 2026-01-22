import { create } from 'zustand';
import type { LineageNode, LineageEdge } from '../types';

interface LineageState {
  // Selected asset
  selectedAssetId: string | null;
  setSelectedAssetId: (id: string | null) => void;

  // Graph state
  nodes: LineageNode[];
  edges: LineageEdge[];
  setGraph: (nodes: LineageNode[], edges: LineageEdge[]) => void;

  // View options
  maxDepth: number;
  setMaxDepth: (depth: number) => void;
  direction: 'upstream' | 'downstream' | 'both';
  setDirection: (direction: 'upstream' | 'downstream' | 'both') => void;

  // Highlighted nodes (for hover effects)
  highlightedNodeIds: Set<string>;
  setHighlightedNodeIds: (ids: Set<string>) => void;

  // Expanded table groups
  expandedTables: Set<string>;
  toggleTableExpanded: (tableId: string) => void;
}

export const useLineageStore = create<LineageState>((set) => ({
  selectedAssetId: null,
  setSelectedAssetId: (id) => set({ selectedAssetId: id }),

  nodes: [],
  edges: [],
  setGraph: (nodes, edges) => set({ nodes, edges }),

  maxDepth: 5,
  setMaxDepth: (depth) => set({ maxDepth: depth }),
  direction: 'both',
  setDirection: (direction) => set({ direction }),

  highlightedNodeIds: new Set(),
  setHighlightedNodeIds: (ids) => set({ highlightedNodeIds: ids }),

  expandedTables: new Set(),
  toggleTableExpanded: (tableId) =>
    set((state) => {
      const newExpanded = new Set(state.expandedTables);
      if (newExpanded.has(tableId)) {
        newExpanded.delete(tableId);
      } else {
        newExpanded.add(tableId);
      }
      return { expandedTables: newExpanded };
    }),
}));
