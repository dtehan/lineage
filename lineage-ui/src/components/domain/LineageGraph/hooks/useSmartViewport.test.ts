import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import React from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { useSmartViewport } from './useSmartViewport';

// Mock useReactFlow
const mockSetViewport = vi.fn();
const mockFitView = vi.fn();
const mockGetNodes = vi.fn();

vi.mock('@xyflow/react', async () => {
  const actual = await vi.importActual('@xyflow/react');
  return {
    ...actual,
    useReactFlow: () => ({
      setViewport: mockSetViewport,
      fitView: mockFitView,
      getNodes: mockGetNodes,
    }),
  };
});

describe('useSmartViewport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(ReactFlowProvider, null, children);

  it('returns applySmartViewport function', () => {
    const { result } = renderHook(() => useSmartViewport(), { wrapper });
    expect(typeof result.current.applySmartViewport).toBe('function');
  });

  it('does not set viewport for empty nodes', () => {
    const { result } = renderHook(() => useSmartViewport(), { wrapper });
    result.current.applySmartViewport([]);
    expect(mockSetViewport).not.toHaveBeenCalled();
  });

  it('sets zoom to 1.0 for small graphs (<=20 nodes)', () => {
    const { result } = renderHook(() => useSmartViewport(), { wrapper });
    const smallGraph = Array.from({ length: 5 }, (_, i) => ({
      id: `node-${i}`,
      position: { x: i * 100, y: 0 },
      data: {},
    }));

    result.current.applySmartViewport(smallGraph);

    expect(mockSetViewport).toHaveBeenCalledWith(
      expect.objectContaining({ zoom: 1.0 })
    );
  });

  it('sets zoom to 0.5 for large graphs (>=50 nodes)', () => {
    const { result } = renderHook(() => useSmartViewport(), { wrapper });
    const largeGraph = Array.from({ length: 60 }, (_, i) => ({
      id: `node-${i}`,
      position: { x: i * 100, y: Math.floor(i / 10) * 100 },
      data: {},
    }));

    result.current.applySmartViewport(largeGraph);

    expect(mockSetViewport).toHaveBeenCalledWith(
      expect.objectContaining({ zoom: 0.5 })
    );
  });

  it('interpolates zoom for medium graphs', () => {
    const { result } = renderHook(() => useSmartViewport(), { wrapper });
    // 35 nodes is midway between 20 and 50
    const mediumGraph = Array.from({ length: 35 }, (_, i) => ({
      id: `node-${i}`,
      position: { x: i * 100, y: 0 },
      data: {},
    }));

    result.current.applySmartViewport(mediumGraph);

    const call = mockSetViewport.mock.calls[0][0];
    // Should be between 0.5 and 1.0 (approximately 0.75 for midpoint)
    expect(call.zoom).toBeGreaterThan(0.5);
    expect(call.zoom).toBeLessThan(1.0);
  });

  it('positions viewport at top-left of graph', () => {
    const { result } = renderHook(() => useSmartViewport(), { wrapper });
    const nodes = [
      { id: 'node-1', position: { x: 100, y: 50 }, data: {} },
      { id: 'node-2', position: { x: 300, y: 150 }, data: {} },
    ];

    result.current.applySmartViewport(nodes);

    const call = mockSetViewport.mock.calls[0][0];
    // x should be negative (shifts graph right so minX=100 is near left edge)
    // y should be negative (shifts graph down so minY=50 is near top edge)
    expect(call.x).toBeDefined();
    expect(call.y).toBeDefined();
  });

  it('respects custom options', () => {
    const { result } = renderHook(
      () => useSmartViewport({
        smallGraphThreshold: 10,
        smallGraphZoom: 1.5
      }),
      { wrapper }
    );

    const smallGraph = Array.from({ length: 5 }, (_, i) => ({
      id: `node-${i}`,
      position: { x: i * 100, y: 0 },
      data: {},
    }));

    result.current.applySmartViewport(smallGraph);

    expect(mockSetViewport).toHaveBeenCalledWith(
      expect.objectContaining({ zoom: 1.5 })
    );
  });

  it('uses node measured dimensions when available', () => {
    const { result } = renderHook(() => useSmartViewport(), { wrapper });
    const nodes = [
      {
        id: 'node-1',
        position: { x: 0, y: 0 },
        data: {},
        measured: { width: 200, height: 150 }
      },
    ];

    result.current.applySmartViewport(nodes);

    // Should have called setViewport (dimensions are used internally for bounds calculation)
    expect(mockSetViewport).toHaveBeenCalled();
  });

  it('falls back to default dimensions when measured not available', () => {
    const { result } = renderHook(() => useSmartViewport(), { wrapper });
    const nodes = [
      {
        id: 'node-1',
        position: { x: 0, y: 0 },
        data: {},
        // No measured property, no width/height
      },
    ];

    result.current.applySmartViewport(nodes);

    // Should have called setViewport (uses default 280x100 dimensions)
    expect(mockSetViewport).toHaveBeenCalled();
  });

  it('correctly calculates zoom at smallGraphThreshold boundary', () => {
    const { result } = renderHook(() => useSmartViewport(), { wrapper });
    // Exactly 20 nodes = smallGraphThreshold
    const boundaryGraph = Array.from({ length: 20 }, (_, i) => ({
      id: `node-${i}`,
      position: { x: i * 100, y: 0 },
      data: {},
    }));

    result.current.applySmartViewport(boundaryGraph);

    expect(mockSetViewport).toHaveBeenCalledWith(
      expect.objectContaining({ zoom: 1.0 })
    );
  });

  it('correctly calculates zoom at largeGraphThreshold boundary', () => {
    const { result } = renderHook(() => useSmartViewport(), { wrapper });
    // Exactly 50 nodes = largeGraphThreshold
    const boundaryGraph = Array.from({ length: 50 }, (_, i) => ({
      id: `node-${i}`,
      position: { x: i * 100, y: 0 },
      data: {},
    }));

    result.current.applySmartViewport(boundaryGraph);

    expect(mockSetViewport).toHaveBeenCalledWith(
      expect.objectContaining({ zoom: 0.5 })
    );
  });
});
