import { create } from 'zustand';
import type { LineageNode, LineageEdge, SearchResult, PaginationInfo } from '../types';

export type LineageScope = 'column' | 'table' | 'database' | 'all-databases';
export type AssetTypeFilter = 'table' | 'view' | 'materialized_view';

interface LineageState {
  // View scope - determines what level of lineage to show
  scope: LineageScope;
  setScope: (scope: LineageScope) => void;

  // Selected database for database-level view
  selectedDatabase: string | null;
  setSelectedDatabase: (database: string | null) => void;

  // Database filter for all-databases view
  databaseFilter: string[];
  setDatabaseFilter: (databases: string[]) => void;

  // Asset type filter (tables, views, or both)
  assetTypeFilter: AssetTypeFilter[];
  setAssetTypeFilter: (types: AssetTypeFilter[]) => void;

  // Pagination state for database/all-databases views
  pagination: PaginationInfo | null;
  setPagination: (pagination: PaginationInfo | null) => void;
  isLoadingMore: boolean;
  setIsLoadingMore: (loading: boolean) => void;
  loadMoreCount: 10 | 20 | 50;
  setLoadMoreCount: (count: 10 | 20 | 50) => void;

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

  // View mode (graph vs table)
  viewMode: 'graph' | 'table';
  setViewMode: (mode: 'graph' | 'table') => void;

  // Edge selection
  selectedEdgeId: string | null;
  setSelectedEdge: (id: string | null) => void;

  // Highlighted nodes and edges (for path highlighting)
  highlightedNodeIds: Set<string>;
  highlightedEdgeIds: Set<string>;
  setHighlightedNodeIds: (ids: Set<string>) => void;
  setHighlightedPath: (nodeIds: Set<string>, edgeIds: Set<string>) => void;
  clearHighlight: () => void;

  // Panel state
  isPanelOpen: boolean;
  panelContent: 'node' | 'edge' | null;
  openPanel: (content: 'node' | 'edge') => void;
  closePanel: () => void;

  // Fullscreen
  isFullscreen: boolean;
  toggleFullscreen: () => void;

  // Search state (moved from local component state for persistence)
  searchQuery: string;
  searchResults: SearchResult[];
  setSearchQuery: (query: string) => void;
  setSearchResults: (results: SearchResult[]) => void;

  // Database clustering
  showDatabaseClusters: boolean;
  toggleDatabaseClusters: () => void;

  // Expanded table groups - Map tracks explicit toggle state, tables not in map use default
  expandedTables: Map<string, boolean>;
  toggleTableExpanded: (tableId: string, defaultExpanded?: boolean) => void;
  setAllTablesExpanded: (expanded: boolean) => void;
  isTableExpanded: (tableId: string, defaultExpanded: boolean) => boolean;
}

export const useLineageStore = create<LineageState>((set) => ({
  // View scope
  scope: 'column' as LineageScope,
  setScope: (scope) => set({ scope }),

  // Selected database for database-level view
  selectedDatabase: null,
  setSelectedDatabase: (database) => set({ selectedDatabase: database }),

  // Database filter for all-databases view
  databaseFilter: [],
  setDatabaseFilter: (databases) => set({ databaseFilter: databases }),

  // Asset type filter - default to showing all types
  assetTypeFilter: ['table', 'view', 'materialized_view'] as AssetTypeFilter[],
  setAssetTypeFilter: (types) => set({ assetTypeFilter: types }),

  // Pagination state
  pagination: null,
  setPagination: (pagination) => set({ pagination }),
  isLoadingMore: false,
  setIsLoadingMore: (loading) => set({ isLoadingMore: loading }),
  loadMoreCount: 10,
  setLoadMoreCount: (count) => set({ loadMoreCount: count }),

  // Selected asset
  selectedAssetId: null,
  setSelectedAssetId: (id) => set({ selectedAssetId: id }),

  // Graph state
  nodes: [],
  edges: [],
  setGraph: (nodes, edges) => set({ nodes, edges }),

  // View options
  maxDepth: 3,
  setMaxDepth: (depth) => set({ maxDepth: depth }),
  direction: 'both',
  setDirection: (direction) => set({ direction }),

  // View mode
  viewMode: 'graph',
  setViewMode: (mode) => set({ viewMode: mode }),

  // Edge selection
  selectedEdgeId: null,
  setSelectedEdge: (id) => set({ selectedEdgeId: id }),

  // Highlighted nodes and edges
  highlightedNodeIds: new Set(),
  highlightedEdgeIds: new Set(),
  setHighlightedNodeIds: (ids) => set({ highlightedNodeIds: ids }),
  setHighlightedPath: (nodeIds, edgeIds) =>
    set({ highlightedNodeIds: nodeIds, highlightedEdgeIds: edgeIds }),
  clearHighlight: () =>
    set({
      highlightedNodeIds: new Set(),
      highlightedEdgeIds: new Set(),
      selectedAssetId: null,
      selectedEdgeId: null,
    }),

  // Panel state
  isPanelOpen: false,
  panelContent: null,
  openPanel: (content) => set({ isPanelOpen: true, panelContent: content }),
  closePanel: () => set({ isPanelOpen: false, panelContent: null }),

  // Fullscreen
  isFullscreen: false,
  toggleFullscreen: () => set((state) => ({ isFullscreen: !state.isFullscreen })),

  // Search state
  searchQuery: '',
  searchResults: [],
  setSearchQuery: (query) => set({ searchQuery: query }),
  setSearchResults: (results) => set({ searchResults: results }),

  // Database clustering
  showDatabaseClusters: true,
  toggleDatabaseClusters: () =>
    set((state) => ({ showDatabaseClusters: !state.showDatabaseClusters })),

  // Expanded table groups - Map tracks explicit toggle state
  expandedTables: new Map(),
  toggleTableExpanded: (tableId, defaultExpanded = true) =>
    set((state) => {
      const newExpanded = new Map(state.expandedTables);
      // Get current state: if in map use that, otherwise use default
      const currentState = newExpanded.has(tableId)
        ? newExpanded.get(tableId)!
        : defaultExpanded;
      // Toggle to opposite state
      newExpanded.set(tableId, !currentState);
      return { expandedTables: newExpanded };
    }),
  setAllTablesExpanded: () =>
    set(() => {
      // Clear the map - all tables will use their default state
      return { expandedTables: new Map() };
    }),
  isTableExpanded: (_tableId, defaultExpanded) => {
    // This is a selector-like function - handled in component instead
    return defaultExpanded;
  },
}));
