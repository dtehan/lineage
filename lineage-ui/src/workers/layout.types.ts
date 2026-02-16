import type { LineageNode, LineageEdge } from '../types';
import type { LayoutResult, LayoutOptions } from '../utils/graph/layoutEngine';

/**
 * API exposed by the layout Web Worker via Comlink.
 * Provides a single method for computing graph layout off the main thread.
 */
export interface LayoutWorkerAPI {
  /**
   * Compute graph layout using ELKjs in the Worker thread.
   * @param rawNodes - LineageNode array to layout
   * @param rawEdges - LineageEdge array for edge routing
   * @param options - Layout configuration (direction, spacing, etc.)
   * @returns Promise<LayoutResult> with layouted nodes, edges, and optional metrics
   */
  layout(
    rawNodes: LineageNode[],
    rawEdges: LineageEdge[],
    options: LayoutOptions
  ): Promise<LayoutResult>;
}
