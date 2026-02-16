import { useCallback } from 'react';
import { wrap } from 'comlink';
import type { LayoutWorkerAPI } from '../../../../workers/layout.types';
import type { LineageNode, LineageEdge } from '../../../../types';
import type { LayoutOptions, LayoutResult } from '../../../../utils/graph/layoutEngine';

/**
 * Module-level singleton Worker instance.
 *
 * IMPORTANT: This Worker is created ONCE at module load time, NOT per-hook call.
 * Creating a Worker inside the hook body would spawn a new Worker thread on every
 * re-render, causing memory leaks and performance degradation.
 *
 * The singleton pattern ensures only ONE Worker thread exists for the lifetime
 * of the application, which is correct per research recommendations.
 */
const workerInstance = new Worker(
  new URL('../../../../workers/layout.worker.ts', import.meta.url),
  { type: 'module' }
);

/**
 * Wrap the Worker with Comlink for type-safe communication.
 * Comlink handles structured cloning of inputs/outputs automatically.
 */
const workerApi = wrap<LayoutWorkerAPI>(workerInstance);

/**
 * React hook for offloading graph layout computation to a Web Worker.
 *
 * Uses a module-level singleton Worker (not created per-render) and Comlink
 * for type-safe communication. The Worker runs ELKjs layout off the main thread,
 * keeping the UI responsive during expensive layout computation.
 *
 * @returns Object with layoutGraph method for async layout computation
 */
export function useLayoutWorker() {
  const layoutGraph = useCallback(
    async (
      rawNodes: LineageNode[],
      rawEdges: LineageEdge[],
      options: LayoutOptions
    ): Promise<LayoutResult> => {
      try {
        // Call the Worker API via Comlink
        // This returns a Promise that resolves when the Worker completes layout
        const result = await workerApi.layout(rawNodes, rawEdges, options);
        return result;
      } catch (error) {
        // Log and re-throw errors so the caller (LineageGraph) can handle them
        console.error('[useLayoutWorker] Worker layout failed:', error);
        throw error;
      }
    },
    [] // No dependencies - workerApi is a module-level constant
  );

  return { layoutGraph };
}
