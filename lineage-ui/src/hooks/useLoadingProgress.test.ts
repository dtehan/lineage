import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLoadingProgress, STAGE_CONFIG } from './useLoadingProgress';

describe('useLoadingProgress', () => {
  describe('initial state', () => {
    it('starts with idle stage and 0 progress', () => {
      const { result } = renderHook(() => useLoadingProgress());

      expect(result.current.stage).toBe('idle');
      expect(result.current.progress).toBe(0);
      expect(result.current.message).toBe('');
      expect(result.current.isLoading).toBe(false);
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
      expect(result.current.progress).toBe(0);
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
        min: 0,
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
});
