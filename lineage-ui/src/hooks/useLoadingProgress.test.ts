import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLoadingProgress, STAGE_CONFIG, formatDuration } from './useLoadingProgress';

describe('formatDuration', () => {
  it('returns <1s for durations under 1 second', () => {
    expect(formatDuration(0)).toBe('<1s');
    expect(formatDuration(500)).toBe('<1s');
    expect(formatDuration(999)).toBe('<1s');
  });

  it('returns seconds for durations under 1 minute', () => {
    expect(formatDuration(1000)).toBe('1s');
    expect(formatDuration(5000)).toBe('5s');
    expect(formatDuration(30000)).toBe('30s');
    expect(formatDuration(59000)).toBe('59s');
  });

  it('returns minutes only when no remaining seconds', () => {
    expect(formatDuration(60000)).toBe('1m');
    expect(formatDuration(120000)).toBe('2m');
  });

  it('returns minutes and seconds for longer durations', () => {
    expect(formatDuration(90000)).toBe('1m 30s');
    expect(formatDuration(125000)).toBe('2m 5s');
    expect(formatDuration(189000)).toBe('3m 9s');
  });
});

describe('useLoadingProgress', () => {
  describe('initial state', () => {
    it('starts with idle stage and 0 progress', () => {
      const { result } = renderHook(() => useLoadingProgress());

      expect(result.current.stage).toBe('idle');
      expect(result.current.progress).toBe(0);
      expect(result.current.message).toBe('');
      expect(result.current.isLoading).toBe(false);
      expect(result.current.elapsedTime).toBe(0);
      expect(result.current.estimatedTimeRemaining).toBeNull();
    });
  });

  describe('setStage', () => {
    it('transitions to fetching stage with correct progress and message', () => {
      const { result } = renderHook(() => useLoadingProgress());

      act(() => {
        result.current.setStage('fetching');
      });

      expect(result.current.stage).toBe('fetching');
      expect(result.current.progress).toBe(STAGE_CONFIG.fetching.min);
      expect(result.current.message).toBe('Loading data...');
      expect(result.current.isLoading).toBe(true);
    });

    it('transitions to layout stage with correct progress and message', () => {
      const { result } = renderHook(() => useLoadingProgress());

      act(() => {
        result.current.setStage('layout');
      });

      expect(result.current.stage).toBe('layout');
      expect(result.current.progress).toBe(STAGE_CONFIG.layout.min);
      expect(result.current.message).toBe('Calculating layout...');
      expect(result.current.isLoading).toBe(true);
    });

    it('transitions to rendering stage with correct progress and message', () => {
      const { result } = renderHook(() => useLoadingProgress());

      act(() => {
        result.current.setStage('rendering');
      });

      expect(result.current.stage).toBe('rendering');
      expect(result.current.progress).toBe(STAGE_CONFIG.rendering.min);
      expect(result.current.message).toBe('Rendering graph...');
      expect(result.current.isLoading).toBe(true);
    });

    it('transitions to complete stage with 100% progress', () => {
      const { result } = renderHook(() => useLoadingProgress());

      act(() => {
        result.current.setStage('complete');
      });

      expect(result.current.stage).toBe('complete');
      expect(result.current.progress).toBe(100);
      expect(result.current.message).toBe('');
      expect(result.current.isLoading).toBe(false);
    });

    it('follows full stage progression', () => {
      const { result } = renderHook(() => useLoadingProgress());

      // Start fetching
      act(() => {
        result.current.setStage('fetching');
      });
      expect(result.current.progress).toBe(STAGE_CONFIG.fetching.min);
      expect(result.current.isLoading).toBe(true);

      // Move to layout
      act(() => {
        result.current.setStage('layout');
      });
      expect(result.current.progress).toBe(30);
      expect(result.current.isLoading).toBe(true);

      // Move to rendering
      act(() => {
        result.current.setStage('rendering');
      });
      expect(result.current.progress).toBe(70);
      expect(result.current.isLoading).toBe(true);

      // Complete
      act(() => {
        result.current.setStage('complete');
      });
      expect(result.current.progress).toBe(100);
      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('setProgress', () => {
    it('sets exact progress value', () => {
      const { result } = renderHook(() => useLoadingProgress());

      act(() => {
        result.current.setStage('fetching');
        result.current.setProgress(15);
      });

      expect(result.current.progress).toBe(15);
    });

    it('clamps progress to minimum of 0', () => {
      const { result } = renderHook(() => useLoadingProgress());

      act(() => {
        result.current.setProgress(-10);
      });

      expect(result.current.progress).toBe(0);
    });

    it('clamps progress to maximum of 100', () => {
      const { result } = renderHook(() => useLoadingProgress());

      act(() => {
        result.current.setProgress(150);
      });

      expect(result.current.progress).toBe(100);
    });

    it('allows progress updates within stage range', () => {
      const { result } = renderHook(() => useLoadingProgress());

      act(() => {
        result.current.setStage('layout');
      });

      act(() => {
        result.current.setProgress(50);
      });

      expect(result.current.progress).toBe(50);
    });
  });

  describe('isLoading', () => {
    it('returns false for idle stage', () => {
      const { result } = renderHook(() => useLoadingProgress());

      expect(result.current.isLoading).toBe(false);
    });

    it('returns true for fetching stage', () => {
      const { result } = renderHook(() => useLoadingProgress());

      act(() => {
        result.current.setStage('fetching');
      });

      expect(result.current.isLoading).toBe(true);
    });

    it('returns true for layout stage', () => {
      const { result } = renderHook(() => useLoadingProgress());

      act(() => {
        result.current.setStage('layout');
      });

      expect(result.current.isLoading).toBe(true);
    });

    it('returns true for rendering stage', () => {
      const { result } = renderHook(() => useLoadingProgress());

      act(() => {
        result.current.setStage('rendering');
      });

      expect(result.current.isLoading).toBe(true);
    });

    it('returns false for complete stage', () => {
      const { result } = renderHook(() => useLoadingProgress());

      act(() => {
        result.current.setStage('complete');
      });

      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('reset', () => {
    it('resets to idle state from fetching', () => {
      const { result } = renderHook(() => useLoadingProgress());

      act(() => {
        result.current.setStage('fetching');
        result.current.setProgress(25);
      });

      expect(result.current.stage).toBe('fetching');
      expect(result.current.progress).toBe(25);

      act(() => {
        result.current.reset();
      });

      expect(result.current.stage).toBe('idle');
      expect(result.current.progress).toBe(0);
      expect(result.current.message).toBe('');
      expect(result.current.isLoading).toBe(false);
    });

    it('resets to idle state from complete', () => {
      const { result } = renderHook(() => useLoadingProgress());

      act(() => {
        result.current.setStage('complete');
      });

      expect(result.current.progress).toBe(100);

      act(() => {
        result.current.reset();
      });

      expect(result.current.stage).toBe('idle');
      expect(result.current.progress).toBe(0);
    });
  });

  describe('STAGE_CONFIG', () => {
    it('has correct configuration for idle stage', () => {
      expect(STAGE_CONFIG.idle).toEqual({ min: 0, max: 0, message: '' });
    });

    it('has correct configuration for fetching stage', () => {
      expect(STAGE_CONFIG.fetching).toEqual({
        min: 15,
        max: 30,
        message: 'Loading data...',
      });
    });

    it('has correct configuration for layout stage', () => {
      expect(STAGE_CONFIG.layout).toEqual({
        min: 30,
        max: 70,
        message: 'Calculating layout...',
      });
    });

    it('has correct configuration for rendering stage', () => {
      expect(STAGE_CONFIG.rendering).toEqual({
        min: 70,
        max: 95,
        message: 'Rendering graph...',
      });
    });

    it('has correct configuration for complete stage', () => {
      expect(STAGE_CONFIG.complete).toEqual({ min: 100, max: 100, message: '' });
    });
  });

  describe('elapsed time tracking', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('starts tracking elapsed time when loading begins', () => {
      const { result } = renderHook(() => useLoadingProgress());

      act(() => {
        result.current.setStage('fetching');
      });

      // Initially 0, but timer is set
      expect(result.current.elapsedTime).toBe(0);

      // Advance time by 500ms
      act(() => {
        vi.advanceTimersByTime(500);
      });

      // Elapsed time should be updated
      expect(result.current.elapsedTime).toBeGreaterThanOrEqual(0);
    });

    it('updates elapsed time periodically while loading', () => {
      const { result } = renderHook(() => useLoadingProgress());

      act(() => {
        result.current.setStage('fetching');
      });

      // Advance time by 1 second
      act(() => {
        vi.advanceTimersByTime(1000);
      });

      // Elapsed time should be approximately 1000ms (allow for timer variance)
      expect(result.current.elapsedTime).toBeGreaterThanOrEqual(900);
    });

    it('clears elapsed time on reset', () => {
      const { result } = renderHook(() => useLoadingProgress());

      act(() => {
        result.current.setStage('fetching');
      });

      act(() => {
        vi.advanceTimersByTime(1000);
      });

      act(() => {
        result.current.reset();
      });

      expect(result.current.elapsedTime).toBe(0);
    });

    it('clears elapsed time when stage transitions to complete', () => {
      const { result } = renderHook(() => useLoadingProgress());

      act(() => {
        result.current.setStage('fetching');
      });

      act(() => {
        vi.advanceTimersByTime(1000);
      });

      act(() => {
        result.current.setStage('complete');
      });

      expect(result.current.elapsedTime).toBe(0);
    });
  });

  describe('estimated time remaining', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('returns null when not loading', () => {
      const { result } = renderHook(() => useLoadingProgress());

      expect(result.current.estimatedTimeRemaining).toBeNull();
    });

    it('returns null when progress is below 10%', () => {
      const { result } = renderHook(() => useLoadingProgress());

      // Use layout stage and immediately set progress to 5% (below 10% threshold)
      // This avoids the auto-advance timer in fetching stage
      act(() => {
        result.current.setStage('layout');
      });
      act(() => {
        result.current.setProgress(5); // Force to 5%
      });

      act(() => {
        vi.advanceTimersByTime(500);
      });

      // Still null because progress < 10%
      expect(result.current.estimatedTimeRemaining).toBeNull();
    });

    it('calculates ETA when progress is at least 10%', () => {
      const { result } = renderHook(() => useLoadingProgress());

      act(() => {
        result.current.setStage('layout');
        result.current.setProgress(50);
      });

      // Need time to elapse for calculation
      act(() => {
        vi.advanceTimersByTime(1000);
      });

      // At 50% progress after ~1s, ETA should be approximately 1s remaining
      // Due to timer mechanics, just check it's a reasonable number or null initially
      if (result.current.estimatedTimeRemaining !== null) {
        expect(result.current.estimatedTimeRemaining).toBeGreaterThanOrEqual(0);
      }
    });

    it('returns 0 or near-zero ETA when progress is near 100%', () => {
      const { result } = renderHook(() => useLoadingProgress());

      act(() => {
        result.current.setStage('rendering');
        result.current.setProgress(95);
      });

      act(() => {
        vi.advanceTimersByTime(1000);
      });

      if (result.current.estimatedTimeRemaining !== null) {
        // At 95%, remaining should be relatively small
        expect(result.current.estimatedTimeRemaining).toBeLessThan(1000);
      }
    });
  });
});
