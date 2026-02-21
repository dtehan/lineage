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
      expandedTables: new Map(),
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
    it('sets table to collapsed on first toggle when default is expanded', () => {
      // Default is expanded (true), first toggle should collapse it (false)
      useLineageStore.getState().toggleTableExpanded('table1', true);
      expect(useLineageStore.getState().expandedTables.get('table1')).toBe(false);
    });

    it('toggles table back to expanded on second toggle', () => {
      useLineageStore.getState().toggleTableExpanded('table1', true);
      useLineageStore.getState().toggleTableExpanded('table1', true);
      expect(useLineageStore.getState().expandedTables.get('table1')).toBe(true);
    });

    it('can toggle multiple tables independently', () => {
      // Both default to expanded, first toggle collapses each
      useLineageStore.getState().toggleTableExpanded('table1', true);
      useLineageStore.getState().toggleTableExpanded('table2', true);
      expect(useLineageStore.getState().expandedTables.get('table1')).toBe(false);
      expect(useLineageStore.getState().expandedTables.get('table2')).toBe(false);

      // Toggle table1 back to expanded, table2 stays collapsed
      useLineageStore.getState().toggleTableExpanded('table1', true);
      expect(useLineageStore.getState().expandedTables.get('table1')).toBe(true);
      expect(useLineageStore.getState().expandedTables.get('table2')).toBe(false);
    });
  });

  // TC-STATE-APPEND-001 to TC-STATE-APPEND-004: appendGraph
  describe('appendGraph', () => {
    it('TC-STATE-APPEND-001: adds new nodes and edges to existing graph', () => {
      const initialNodes: LineageNode[] = [
        { id: 'n1', type: 'column', databaseName: 'db', tableName: 't', columnName: 'c1' },
      ];
      const initialEdges: LineageEdge[] = [
        { id: 'e1', source: 'n1', target: 'n2' },
      ];
      useLineageStore.getState().setGraph(initialNodes, initialEdges);

      const newNodes: LineageNode[] = [
        { id: 'n2', type: 'column', databaseName: 'db', tableName: 't', columnName: 'c2' },
      ];
      const newEdges: LineageEdge[] = [
        { id: 'e2', source: 'n2', target: 'n3' },
      ];
      useLineageStore.getState().appendGraph(newNodes, newEdges);

      const state = useLineageStore.getState();
      expect(state.nodes).toHaveLength(2);
      expect(state.edges).toHaveLength(2);
      expect(state.nodes.map((n) => n.id)).toContain('n1');
      expect(state.nodes.map((n) => n.id)).toContain('n2');
      expect(state.edges.map((e) => e.id)).toContain('e1');
      expect(state.edges.map((e) => e.id)).toContain('e2');
    });

    it('TC-STATE-APPEND-002: deduplicates nodes and edges by ID', () => {
      const initialNodes: LineageNode[] = [
        { id: 'n1', type: 'column', databaseName: 'db', tableName: 't', columnName: 'c1' },
        { id: 'n2', type: 'column', databaseName: 'db', tableName: 't', columnName: 'c2' },
      ];
      const initialEdges: LineageEdge[] = [
        { id: 'e1', source: 'n1', target: 'n2' },
      ];
      useLineageStore.getState().setGraph(initialNodes, initialEdges);

      // Append with mix of existing and new IDs
      const appendNodes: LineageNode[] = [
        { id: 'n1', type: 'column', databaseName: 'db', tableName: 't', columnName: 'c1' }, // duplicate
        { id: 'n3', type: 'column', databaseName: 'db', tableName: 't', columnName: 'c3' }, // new
      ];
      const appendEdges: LineageEdge[] = [
        { id: 'e1', source: 'n1', target: 'n2' }, // duplicate
        { id: 'e2', source: 'n2', target: 'n3' }, // new
      ];
      useLineageStore.getState().appendGraph(appendNodes, appendEdges);

      const state = useLineageStore.getState();
      // Only new IDs should be added, no duplicates
      expect(state.nodes).toHaveLength(3); // n1, n2, n3
      expect(state.edges).toHaveLength(2); // e1, e2
      expect(state.nodes.filter((n) => n.id === 'n1')).toHaveLength(1);
      expect(state.edges.filter((e) => e.id === 'e1')).toHaveLength(1);
    });

    it('TC-STATE-APPEND-003: works correctly on empty initial state', () => {
      // Store starts empty (reset in beforeEach)
      const newNodes: LineageNode[] = [
        { id: 'n1', type: 'column', databaseName: 'db', tableName: 't', columnName: 'c1' },
        { id: 'n2', type: 'column', databaseName: 'db', tableName: 't', columnName: 'c2' },
      ];
      const newEdges: LineageEdge[] = [
        { id: 'e1', source: 'n1', target: 'n2' },
      ];

      useLineageStore.getState().appendGraph(newNodes, newEdges);

      const state = useLineageStore.getState();
      expect(state.nodes).toHaveLength(2);
      expect(state.edges).toHaveLength(1);
      expect(state.nodes.map((n) => n.id)).toEqual(['n1', 'n2']);
    });

    it('TC-STATE-APPEND-004: preserves order — existing nodes first, new nodes appended', () => {
      const initialNodes: LineageNode[] = [
        { id: 'n1', type: 'column', databaseName: 'db', tableName: 't', columnName: 'c1' },
        { id: 'n2', type: 'column', databaseName: 'db', tableName: 't', columnName: 'c2' },
      ];
      useLineageStore.getState().setGraph(initialNodes, []);

      const newNodes: LineageNode[] = [
        { id: 'n3', type: 'column', databaseName: 'db', tableName: 't', columnName: 'c3' },
      ];
      useLineageStore.getState().appendGraph(newNodes, []);

      const nodeIds = useLineageStore.getState().nodes.map((n) => n.id);
      // Existing nodes (n1, n2) should come before the new node (n3)
      expect(nodeIds).toEqual(['n1', 'n2', 'n3']);
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
