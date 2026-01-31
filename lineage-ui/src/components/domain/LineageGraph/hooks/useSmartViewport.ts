import { useCallback } from 'react';
import { useReactFlow, type Node } from '@xyflow/react';

interface SmartViewportOptions {
  /** Small graph threshold (nodes <= this zoom to readable size) */
  smallGraphThreshold?: number;
  /** Large graph threshold (nodes >= this use smaller zoom) */
  largeGraphThreshold?: number;
  /** Max zoom for small graphs */
  smallGraphZoom?: number;
  /** Max zoom for large graphs */
  largeGraphZoom?: number;
}

const DEFAULT_OPTIONS: Required<SmartViewportOptions> = {
  smallGraphThreshold: 20,
  largeGraphThreshold: 50,
  smallGraphZoom: 1.0,
  largeGraphZoom: 0.5,
};

// Fixed padding in pixels (not percentage of graph size)
const VIEWPORT_PADDING = 20;

/**
 * Hook that provides smart viewport positioning based on graph size.
 * - Positions viewport at top-left to show root/source nodes
 * - Applies size-aware zoom (larger zoom for small graphs, smaller for large)
 */
export function useSmartViewport(options: SmartViewportOptions = {}) {
  const { setViewport } = useReactFlow();
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const applySmartViewport = useCallback((nodes: Node[]) => {
    if (nodes.length === 0) return;

    const nodeCount = nodes.length;

    // Calculate zoom based on node count
    let targetZoom: number;
    if (nodeCount <= opts.smallGraphThreshold) {
      // Small graphs: zoom to readable size (up to smallGraphZoom)
      targetZoom = opts.smallGraphZoom;
    } else if (nodeCount >= opts.largeGraphThreshold) {
      // Large graphs: fit more nodes with smaller zoom
      targetZoom = opts.largeGraphZoom;
    } else {
      // Medium graphs: interpolate between thresholds
      const ratio = (nodeCount - opts.smallGraphThreshold) /
                    (opts.largeGraphThreshold - opts.smallGraphThreshold);
      targetZoom = opts.smallGraphZoom - ratio * (opts.smallGraphZoom - opts.largeGraphZoom);
    }

    // Find the bounds of all nodes
    let minX = Infinity, minY = Infinity;

    for (const node of nodes) {
      const x = node.position.x;
      const y = node.position.y;

      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
    }

    // Position viewport at top-left of graph with small fixed padding
    // The viewport x/y are in screen coordinates, negative values shift the graph right/down
    setViewport({
      x: -minX * targetZoom + VIEWPORT_PADDING,
      y: -minY * targetZoom + VIEWPORT_PADDING,
      zoom: targetZoom,
    });
  }, [setViewport, opts.smallGraphThreshold, opts.largeGraphThreshold, opts.smallGraphZoom, opts.largeGraphZoom]);

  return { applySmartViewport };
}
