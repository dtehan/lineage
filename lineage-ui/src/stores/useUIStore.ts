import { create } from 'zustand';

interface UIState {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;

  searchQuery: string;
  setSearchQuery: (query: string) => void;

  // Phase 21: isolated table UX
  hideIsolatedTables: boolean;
  toggleHideIsolatedTables: () => void;
  isolatedTableCount: number;
  setIsolatedTableCount: (count: number) => void;
  connectedTableCount: number;
  setConnectedTableCount: (count: number) => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: true,
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  searchQuery: '',
  setSearchQuery: (query) => set({ searchQuery: query }),

  // Phase 21: isolated table UX
  hideIsolatedTables: false,
  toggleHideIsolatedTables: () =>
    set((state) => ({ hideIsolatedTables: !state.hideIsolatedTables })),
  isolatedTableCount: 0,
  setIsolatedTableCount: (count) => set({ isolatedTableCount: count }),
  connectedTableCount: 0,
  setConnectedTableCount: (count) => set({ connectedTableCount: count }),
}));
