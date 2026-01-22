import { describe, it, expect, beforeEach } from 'vitest';
import { useUIStore } from './useUIStore';

describe('useUIStore', () => {
  beforeEach(() => {
    // Reset store to initial state before each test
    useUIStore.setState({
      sidebarOpen: true,
      searchQuery: '',
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
