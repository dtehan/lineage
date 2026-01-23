import { renderHook } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useLineageHighlight } from './useLineageHighlight';
import { Node, Edge } from '@xyflow/react';

describe('useLineageHighlight', () => {
  const createTestData = () => {
    const nodes: Node[] = [
      { id: 'A', position: { x: 0, y: 0 }, data: {} },
      { id: 'B', position: { x: 100, y: 0 }, data: {} },
      { id: 'C', position: { x: 200, y: 0 }, data: {} },
      { id: 'D', position: { x: 300, y: 0 }, data: {} },
      { id: 'E', position: { x: 400, y: 0 }, data: {} },
    ];

    // A -> B -> C -> D
    //      B -> E
    const edges: Edge[] = [
      { id: 'e1', source: 'A', target: 'B' },
      { id: 'e2', source: 'B', target: 'C' },
      { id: 'e3', source: 'C', target: 'D' },
      { id: 'e4', source: 'B', target: 'E' },
    ];

    return { nodes, edges };
  };

  describe('TC-HOOK-001: getUpstreamNodes', () => {
    it('returns all upstream nodes recursively', () => {
      const { nodes, edges } = createTestData();
      const { result } = renderHook(() => useLineageHighlight({ nodes, edges }));

      const upstream = result.current.getUpstreamNodes('D');
      
      expect(upstream.has('C')).toBe(true);
      expect(upstream.has('B')).toBe(true);
      expect(upstream.has('A')).toBe(true);
      expect(upstream.size).toBe(3);
    });

    it('returns empty set for source node with no upstream', () => {
      const { nodes, edges } = createTestData();
      const { result } = renderHook(() => useLineageHighlight({ nodes, edges }));

      const upstream = result.current.getUpstreamNodes('A');
      
      expect(upstream.size).toBe(0);
    });

    it('handles cycles without infinite loop', () => {
      const nodes: Node[] = [
        { id: 'A', position: { x: 0, y: 0 }, data: {} },
        { id: 'B', position: { x: 100, y: 0 }, data: {} },
      ];
      const edges: Edge[] = [
        { id: 'e1', source: 'A', target: 'B' },
        { id: 'e2', source: 'B', target: 'A' }, // cycle
      ];

      const { result } = renderHook(() => useLineageHighlight({ nodes, edges }));

      const upstream = result.current.getUpstreamNodes('A');
      expect(upstream.has('B')).toBe(true);
      expect(upstream.size).toBe(1);
    });
  });

  describe('TC-HOOK-002: getDownstreamNodes', () => {
    it('returns all downstream nodes recursively', () => {
      const { nodes, edges } = createTestData();
      const { result } = renderHook(() => useLineageHighlight({ nodes, edges }));

      const downstream = result.current.getDownstreamNodes('A');
      
      expect(downstream.has('B')).toBe(true);
      expect(downstream.has('C')).toBe(true);
      expect(downstream.has('D')).toBe(true);
      expect(downstream.has('E')).toBe(true);
      expect(downstream.size).toBe(4);
    });

    it('returns empty set for leaf node with no downstream', () => {
      const { nodes, edges } = createTestData();
      const { result } = renderHook(() => useLineageHighlight({ nodes, edges }));

      const downstream = result.current.getDownstreamNodes('D');
      
      expect(downstream.size).toBe(0);
    });
  });

  describe('TC-HOOK-003: getConnectedNodes', () => {
    it('returns both upstream and downstream nodes including selected node', () => {
      const { nodes, edges } = createTestData();
      const { result } = renderHook(() => useLineageHighlight({ nodes, edges }));

      const connected = result.current.getConnectedNodes('B');
      
      expect(connected.has('A')).toBe(true); // upstream
      expect(connected.has('B')).toBe(true); // self
      expect(connected.has('C')).toBe(true); // downstream
      expect(connected.has('D')).toBe(true); // downstream
      expect(connected.has('E')).toBe(true); // downstream
      expect(connected.size).toBe(5);
    });
  });

  describe('TC-HOOK-004: getConnectedEdges', () => {
    it('returns edges that connect highlighted nodes', () => {
      const { nodes, edges } = createTestData();
      const { result } = renderHook(() => useLineageHighlight({ nodes, edges }));

      const connectedEdges = result.current.getConnectedEdges('B');
      
      expect(connectedEdges.has('e1')).toBe(true);
      expect(connectedEdges.has('e2')).toBe(true);
      expect(connectedEdges.has('e3')).toBe(true);
      expect(connectedEdges.has('e4')).toBe(true);
      expect(connectedEdges.size).toBe(4);
    });
  });

  describe('TC-HOOK-005: highlightPath', () => {
    it('returns both highlighted nodes and edges', () => {
      const { nodes, edges } = createTestData();
      const { result } = renderHook(() => useLineageHighlight({ nodes, edges }));

      const { highlightedNodes, highlightedEdges } = result.current.highlightPath('C');
      
      expect(highlightedNodes.has('A')).toBe(true);
      expect(highlightedNodes.has('B')).toBe(true);
      expect(highlightedNodes.has('C')).toBe(true);
      expect(highlightedNodes.has('D')).toBe(true);
      expect(highlightedNodes.has('E')).toBe(false); // not in C's path
      
      expect(highlightedEdges.has('e1')).toBe(true);
      expect(highlightedEdges.has('e2')).toBe(true);
      expect(highlightedEdges.has('e3')).toBe(true);
      expect(highlightedEdges.has('e4')).toBe(false); // B -> E not in C's path
    });
  });
});
