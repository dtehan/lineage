import { describe, it, expect, beforeEach } from 'vitest';
import { useUIStore } from './useUIStore';

describe('useUIStore', () => {
  beforeEach(() => {
    // Reset store to initial state before each test
    useUIStore.setState({
      sidebarOpen: true,
      searchQuery: '',
      hideIsolatedTables: false,
      isolatedTableCount: 0,
      connectedTableCount: 0,
    });
  });

  // TC-STATE-006: toggleSidebar
  describe('toggleSidebar', () => {
    it('toggles sidebarOpen from true to false', () => {
      expect(useUIStore.getState().sidebarOpen).toBe(true);
      useUIStore.getState().toggleSidebar();
      expect(useUIStore.getState().sidebarOpen).toBe(false);
    });

    it('toggles sidebarOpen from false to true', () => {
      useUIStore.getState().toggleSidebar();
      useUIStore.getState().toggleSidebar();
      expect(useUIStore.getState().sidebarOpen).toBe(true);
    });
  });

  // TC-STATE-007: setSidebarOpen
  describe('setSidebarOpen', () => {
    it('sets sidebarOpen to false', () => {
      useUIStore.getState().setSidebarOpen(false);
      expect(useUIStore.getState().sidebarOpen).toBe(false);
    });

    it('sets sidebarOpen to true', () => {
      useUIStore.getState().setSidebarOpen(false);
      useUIStore.getState().setSidebarOpen(true);
      expect(useUIStore.getState().sidebarOpen).toBe(true);
    });
  });

  // TC-STATE-008: setSearchQuery
  describe('setSearchQuery', () => {
    it('updates searchQuery to provided string', () => {
      useUIStore.getState().setSearchQuery('test query');
      expect(useUIStore.getState().searchQuery).toBe('test query');
    });

    it('clears searchQuery when set to empty string', () => {
      useUIStore.getState().setSearchQuery('test query');
      useUIStore.getState().setSearchQuery('');
      expect(useUIStore.getState().searchQuery).toBe('');
    });
  });

  // TC-STATE-010: toggleHideIsolatedTables
  describe('toggleHideIsolatedTables', () => {
    it('toggles hideIsolatedTables from false to true', () => {
      expect(useUIStore.getState().hideIsolatedTables).toBe(false);
      useUIStore.getState().toggleHideIsolatedTables();
      expect(useUIStore.getState().hideIsolatedTables).toBe(true);
    });

    it('toggles hideIsolatedTables from true to false', () => {
      useUIStore.getState().toggleHideIsolatedTables();
      useUIStore.getState().toggleHideIsolatedTables();
      expect(useUIStore.getState().hideIsolatedTables).toBe(false);
    });
  });

  // TC-STATE-011: setIsolatedTableCount
  describe('setIsolatedTableCount', () => {
    it('sets isolatedTableCount to provided value', () => {
      useUIStore.getState().setIsolatedTableCount(5);
      expect(useUIStore.getState().isolatedTableCount).toBe(5);
    });

    it('resets isolatedTableCount to 0', () => {
      useUIStore.getState().setIsolatedTableCount(5);
      useUIStore.getState().setIsolatedTableCount(0);
      expect(useUIStore.getState().isolatedTableCount).toBe(0);
    });
  });

  // TC-STATE-012: setConnectedTableCount
  describe('setConnectedTableCount', () => {
    it('sets connectedTableCount to provided value', () => {
      useUIStore.getState().setConnectedTableCount(10);
      expect(useUIStore.getState().connectedTableCount).toBe(10);
    });

    it('resets connectedTableCount to 0', () => {
      useUIStore.getState().setConnectedTableCount(10);
      useUIStore.getState().setConnectedTableCount(0);
      expect(useUIStore.getState().connectedTableCount).toBe(0);
    });
  });

  // TC-STATE-009: Store Independence
  describe('store independence', () => {
    it('is independent from useLineageStore', async () => {
      const { useLineageStore } = await import('./useLineageStore');

      // Modify useUIStore
      useUIStore.getState().setSidebarOpen(false);

      // Verify useLineageStore is unchanged
      expect(useLineageStore.getState().selectedAssetId).toBeNull();

      // Modify useLineageStore
      useLineageStore.getState().setSelectedAssetId('test');

      // Verify useUIStore is unchanged
      expect(useUIStore.getState().sidebarOpen).toBe(false);
    });
  });
});
