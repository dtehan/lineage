import { describe, it, expect, beforeEach } from 'vitest';
import { useLineageStore } from './useLineageStore';
import type { LineageNode, LineageEdge } from '../types';

describe('useLineageStore', () => {
  beforeEach(() => {
    // Reset store to initial state before each test
    useLineageStore.setState({
      selectedAssetId: null,
      nodes: [],
      edges: [],
      maxDepth: 5,
      direction: 'both',
      highlightedNodeIds: new Set(),
      expandedTables: new Set(),
    });
  });

  // TC-STATE-001: setSelectedAssetId
  describe('setSelectedAssetId', () => {
    it('updates selectedAssetId to provided value', () => {
      useLineageStore.getState().setSelectedAssetId('asset-123');
      expect(useLineageStore.getState().selectedAssetId).toBe('asset-123');
    });

    it('clears selection when set to null', () => {
      useLineageStore.getState().setSelectedAssetId('asset-123');
      useLineageStore.getState().setSelectedAssetId(null);
      expect(useLineageStore.getState().selectedAssetId).toBeNull();
    });
  });

  // TC-STATE-002: setGraph
  describe('setGraph', () => {
    it('updates nodes and edges', () => {
      const nodes: LineageNode[] = [
        { id: '1', type: 'column', databaseName: 'db', tableName: 't', columnName: 'c' },
      ];
      const edges: LineageEdge[] = [
        { id: 'e1', source: '1', target: '2' },
      ];

      useLineageStore.getState().setGraph(nodes, edges);

      expect(useLineageStore.getState().nodes).toEqual(nodes);
      expect(useLineageStore.getState().edges).toEqual(edges);
    });
  });

  // TC-STATE-003: setMaxDepth and setDirection
  describe('setMaxDepth', () => {
    it('updates maxDepth from default 5', () => {
      expect(useLineageStore.getState().maxDepth).toBe(5);
      useLineageStore.getState().setMaxDepth(10);
      expect(useLineageStore.getState().maxDepth).toBe(10);
    });
  });

  describe('setDirection', () => {
    it('updates direction from default "both"', () => {
      expect(useLineageStore.getState().direction).toBe('both');
      useLineageStore.getState().setDirection('upstream');
      expect(useLineageStore.getState().direction).toBe('upstream');
    });

    it('can be set to downstream', () => {
      useLineageStore.getState().setDirection('downstream');
      expect(useLineageStore.getState().direction).toBe('downstream');
    });
  });

  // TC-STATE-004: toggleTableExpanded
  describe('toggleTableExpanded', () => {
    it('adds table to expandedTables on first toggle', () => {
      useLineageStore.getState().toggleTableExpanded('table1');
      expect(useLineageStore.getState().expandedTables.has('table1')).toBe(true);
    });

    it('removes table from expandedTables on second toggle', () => {
      useLineageStore.getState().toggleTableExpanded('table1');
      useLineageStore.getState().toggleTableExpanded('table1');
      expect(useLineageStore.getState().expandedTables.has('table1')).toBe(false);
    });

    it('can have multiple tables expanded', () => {
      useLineageStore.getState().toggleTableExpanded('table1');
      useLineageStore.getState().toggleTableExpanded('table2');
      expect(useLineageStore.getState().expandedTables.has('table1')).toBe(true);
      expect(useLineageStore.getState().expandedTables.has('table2')).toBe(true);
    });
  });

  // TC-STATE-005: setHighlightedNodeIds
  describe('setHighlightedNodeIds', () => {
    it('updates highlighted set with provided node ids', () => {
      const ids = new Set(['node1', 'node2']);
      useLineageStore.getState().setHighlightedNodeIds(ids);
      expect(useLineageStore.getState().highlightedNodeIds).toEqual(ids);
    });

    it('clears highlighting when set to empty set', () => {
      const ids = new Set(['node1']);
      useLineageStore.getState().setHighlightedNodeIds(ids);
      useLineageStore.getState().setHighlightedNodeIds(new Set());
      expect(useLineageStore.getState().highlightedNodeIds.size).toBe(0);
    });
  });
});
