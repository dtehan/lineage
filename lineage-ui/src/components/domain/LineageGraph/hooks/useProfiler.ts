import { useRef, useCallback } from 'react';

export interface ProfilerMetrics {
  id: string;
  phase: 'mount' | 'update' | 'nested-update';
  actualDuration: number;
  baseDuration: number;
  startTime: number;
  commitTime: number;
}

/**
 * React Profiler hook for measuring component re-render frequency.
 *
 * FRONTEND-02: Measures re-render count and duration to establish optimization baseline.
 * In development mode, logs update-phase renders to console for debugging.
 *
 * Usage:
 * ```tsx
 * const { onRender, getRenderCount, getMetrics, clearMetrics } = useProfiler('ComponentName');
 * return <Profiler id="ComponentName" onRender={onRender}>...</Profiler>
 * ```
 */
export function useProfiler(id: string) {
  const metrics = useRef<ProfilerMetrics[]>([]);

  /**
   * React Profiler onRender callback.
   *
   * @see https://react.dev/reference/react/Profiler#onrender-callback
   */
  const onRender = useCallback(
    (
      profileId: string,
      phase: 'mount' | 'update' | 'nested-update',
      actualDuration: number,
      baseDuration: number,
      startTime: number,
      commitTime: number
    ) => {
      // Push metrics to ref
      metrics.current.push({
        id: profileId,
        phase,
        actualDuration,
        baseDuration,
        startTime,
        commitTime,
      });

      // In development mode, log update-phase renders to console
      if (import.meta.env.DEV && phase === 'update') {
        console.log(
          `[Profiler] ${id} re-render: ${actualDuration.toFixed(2)}ms (base: ${baseDuration.toFixed(2)}ms)`
        );
      }
    },
    [id]
  );

  /**
   * Get all accumulated metrics.
   */
  const getMetrics = useCallback(() => {
    return metrics.current;
  }, []);

  /**
   * Clear accumulated metrics.
   */
  const clearMetrics = useCallback(() => {
    metrics.current = [];
  }, []);

  /**
   * Get count of update-phase renders (excludes initial mount).
   */
  const getRenderCount = useCallback(() => {
    return metrics.current.filter((m) => m.phase === 'update').length;
  }, []);

  return {
    onRender,
    getMetrics,
    clearMetrics,
    getRenderCount,
  };
}
