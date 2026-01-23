import { useEffect, useCallback } from 'react';
import { ReactFlowInstance } from '@xyflow/react';
import { useLineageStore } from '../../../../stores/useLineageStore';

export interface UseKeyboardShortcutsOptions {
  reactFlowInstance: ReactFlowInstance | null;
  searchInputSelector?: string;
  enabled?: boolean;
}

/**
 * Hook to handle keyboard shortcuts for the lineage graph
 *
 * Shortcuts (per spec Section 9):
 * - Escape: Clear selection, close panel, clear search
 * - F: Fit to view
 * - +/-: Zoom in/out
 * - Ctrl+F or /: Focus search input
 * - Ctrl+G: Toggle database clusters
 */
export function useKeyboardShortcuts({
  reactFlowInstance,
  searchInputSelector = '[aria-label="Search columns"]',
  enabled = true,
}: UseKeyboardShortcutsOptions): void {
  const {
    clearHighlight,
    closePanel,
    setSearchQuery,
    toggleDatabaseClusters,
  } = useLineageStore();

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Don't handle shortcuts if user is typing in an input
      const target = event.target as HTMLElement;
      const isInputFocused =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;

      // Escape always works, even in inputs
      if (event.key === 'Escape') {
        clearHighlight();
        closePanel();
        setSearchQuery('');

        // Blur any focused input
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
          target.blur();
        }
        return;
      }

      // Other shortcuts don't work when typing
      if (isInputFocused) return;

      // F: Fit to view
      if (event.key === 'f' || event.key === 'F') {
        event.preventDefault();
        reactFlowInstance?.fitView({ padding: 0.2 });
        return;
      }

      // +/=: Zoom in
      if (event.key === '+' || event.key === '=') {
        event.preventDefault();
        reactFlowInstance?.zoomIn();
        return;
      }

      // -: Zoom out
      if (event.key === '-') {
        event.preventDefault();
        reactFlowInstance?.zoomOut();
        return;
      }

      // /: Focus search
      if (event.key === '/') {
        event.preventDefault();
        const searchInput = document.querySelector<HTMLInputElement>(
          searchInputSelector
        );
        searchInput?.focus();
        return;
      }

      // Ctrl+F: Focus search (override browser find)
      if ((event.ctrlKey || event.metaKey) && event.key === 'f') {
        event.preventDefault();
        const searchInput = document.querySelector<HTMLInputElement>(
          searchInputSelector
        );
        searchInput?.focus();
        return;
      }

      // Ctrl+G: Toggle database clusters
      if ((event.ctrlKey || event.metaKey) && event.key === 'g') {
        event.preventDefault();
        toggleDatabaseClusters();
        return;
      }
    },
    [
      reactFlowInstance,
      clearHighlight,
      closePanel,
      setSearchQuery,
      toggleDatabaseClusters,
      searchInputSelector,
    ]
  );

  useEffect(() => {
    if (!enabled) return;

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [enabled, handleKeyDown]);
}
