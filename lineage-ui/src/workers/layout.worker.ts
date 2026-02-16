import { expose } from 'comlink';
import { layoutGraph } from '../utils/graph/layoutEngine';
import type { LayoutWorkerAPI } from './layout.types';

/**
 * Web Worker for offloading ELKjs graph layout computation from the main thread.
 *
 * This Worker uses the bundled ELK build (elkjs/lib/elk.bundled.js) directly
 * in the Worker context. The Worker itself IS the offloaded thread, so we don't
 * use ELK's own Worker-in-Worker pattern.
 *
 * Communication with the main thread is handled via Comlink for type-safe
 * structured cloning of inputs/outputs.
 */
const layoutAPI: LayoutWorkerAPI = {
  async layout(rawNodes, rawEdges, options) {
    try {
      // Call the layoutGraph function (which runs ELKjs layout synchronously)
      // This blocks the Worker thread but keeps the main thread responsive
      const result = await layoutGraph(rawNodes, rawEdges, options);
      return result;
    } catch (error) {
      // Re-throw errors so they can be caught by the main thread
      console.error('[Layout Worker] Layout computation failed:', error);
      throw error;
    }
  },
};

// Expose the API to the main thread via Comlink
expose(layoutAPI);
