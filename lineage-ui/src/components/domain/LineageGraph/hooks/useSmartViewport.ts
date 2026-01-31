import { useCallback } from 'react';
import { useReactFlow, type Node } from '@xyflow/react';

interface SmartViewportOptions {
  /** Padding around the graph (0-1, where 0.1 = 10%) */
  padding?: number;
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
  padding: 0.1,
  smallGraphThreshold: 20,
  largeGraphThreshold: 50,
  smallGraphZoom: 1.0,
  largeGraphZoom: 0.5,
};

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
    let maxX = -Infinity, maxY = -Infinity;

    for (const node of nodes) {
      const x = node.position.x;
      const y = node.position.y;
      const width = node.measured?.width ?? node.width ?? 280;
      const height = node.measured?.height ?? node.height ?? 100;

      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + width);
      maxY = Math.max(maxY, y + height);
    }

    // Add padding
    const paddingX = (maxX - minX) * opts.padding;
    const paddingY = (maxY - minY) * opts.padding;

    // Position viewport at top-left of graph (with small offset for padding)
    // The viewport x/y are in screen coordinates, negative values shift the graph right/down
    setViewport({
      x: -minX * targetZoom + paddingX,
      y: -minY * targetZoom + paddingY,
      zoom: targetZoom,
    });
  }, [setViewport, opts.smallGraphThreshold, opts.largeGraphThreshold, opts.smallGraphZoom, opts.largeGraphZoom, opts.padding]);

  return { applySmartViewport };
}
