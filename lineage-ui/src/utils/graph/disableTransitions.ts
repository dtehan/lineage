/**
 * Threshold for disabling CSS transitions on large graphs.
 *
 * FRONTEND-05: Prevents animation jank when React Flow renders >200 nodes simultaneously.
 * Based on Phase 18 benchmarks showing super-linear render time growth beyond 100 nodes.
 */
export const TRANSITION_THRESHOLD = 200;

/**
 * Toggle CSS transitions and animations on the document root.
 *
 * @param enable - If true, enables transitions; if false, disables them via .no-transitions class
 *
 * This is a performance optimization for large graphs. When disabled, the .no-transitions
 * class prevents animation jank during React Flow's initial render of 200+ nodes.
 *
 * Note: Does NOT disable CSS transforms (which would break React Flow's node positioning).
 * Only disables transition-property and animation.
 */
export function toggleTransitions(enable: boolean): void {
  const root = document.documentElement;
  if (enable) {
    root.classList.remove('no-transitions');
  } else {
    root.classList.add('no-transitions');
  }
}

/**
 * Determines if transitions should be disabled based on node count.
 *
 * @param nodeCount - Number of nodes in the graph
 * @returns true if nodeCount exceeds TRANSITION_THRESHOLD
 */
export function shouldDisableTransitions(nodeCount: number): boolean {
  return nodeCount > TRANSITION_THRESHOLD;
}
