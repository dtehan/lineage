import { useState, useCallback, useMemo, useEffect } from 'react';

/**
 * Loading stages for graph visualization
 */
export type LoadingStage = 'idle' | 'fetching' | 'layout' | 'rendering' | 'complete';

/**
 * Loading progress state
 */
export interface LoadingProgress {
  stage: LoadingStage;
  progress: number;
  message: string;
}

/**
 * Configuration for each loading stage
 */
interface StageConfig {
  min: number;
  max: number;
  message: string;
}

/**
 * Stage configuration mapping with progress ranges and messages
 */
export const STAGE_CONFIG: Record<LoadingStage, StageConfig> = {
  idle: { min: 0, max: 0, message: '' },
  fetching: { min: 15, max: 30, message: 'Loading data...' },
  layout: { min: 30, max: 70, message: 'Calculating layout...' },
  rendering: { min: 70, max: 95, message: 'Rendering graph...' },
  complete: { min: 100, max: 100, message: '' },
};

/**
 * Hook return type
 */
export interface UseLoadingProgressReturn {
  /** Current loading stage */
  stage: LoadingStage;
  /** Progress percentage (0-100) */
  progress: number;
  /** Stage message for display */
  message: string;
  /** Whether loading is in progress (not idle and not complete) */
  isLoading: boolean;
  /** Set the current loading stage */
  setStage: (stage: LoadingStage) => void;
  /** Set exact progress within current stage range */
  setProgress: (progress: number) => void;
  /** Reset to idle state */
  reset: () => void;
}

/**
 * Hook for managing loading progress state with three stages
 *
 * Provides stage-based progress tracking for graph loading:
 * - idle: Initial state (0%)
 * - fetching: Data fetch in progress (0-30%)
 * - layout: ELK layout calculation (30-70%)
 * - rendering: React Flow rendering (70-95%)
 * - complete: Done (100%)
 */
export function useLoadingProgress(): UseLoadingProgressReturn {
  const [stage, setStageState] = useState<LoadingStage>('idle');
  const [progress, setProgressState] = useState<number>(0);

  const message = useMemo(() => STAGE_CONFIG[stage].message, [stage]);

  const isLoading = useMemo(
    () => stage !== 'idle' && stage !== 'complete',
    [stage]
  );

  const setStage = useCallback((newStage: LoadingStage) => {
    setStageState(newStage);
    // Set progress to the minimum of the new stage
    setProgressState(STAGE_CONFIG[newStage].min);
  }, []);

  const setProgress = useCallback((newProgress: number) => {
    // Clamp to 0-100
    setProgressState(Math.max(0, Math.min(100, newProgress)));
  }, []);

  const reset = useCallback(() => {
    setStageState('idle');
    setProgressState(0);
  }, []);

  // Auto-advance progress during fetching stage (simulated progress)
  useEffect(() => {
    if (stage === 'fetching') {
      const config = STAGE_CONFIG[stage];
      const startProgress = config.min;
      const endProgress = config.max - 2; // Stop at 28% (don't reach 30% to avoid overlap with layout)
      const duration = 3000; // 3 seconds
      const steps = 30;
      const increment = (endProgress - startProgress) / steps;
      const interval = duration / steps;

      let currentStep = 0;
      const timer = setInterval(() => {
        currentStep++;
        if (currentStep >= steps) {
          clearInterval(timer);
          return;
        }
        setProgressState(startProgress + increment * currentStep);
      }, interval);

      return () => clearInterval(timer);
    }
  }, [stage]);

  return {
    stage,
    progress,
    message,
    isLoading,
    setStage,
    setProgress,
    reset,
  };
}
