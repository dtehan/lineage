import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';
import { useProgressiveLineage } from './useOpenLineage';
import { openLineageApi } from '../client';
import type { OpenLineageLineageResponse } from '../../types/openlineage';

// Use vi.spyOn to test the real useQuery behavior without mocking the entire module
const getLineageGraphSpy = vi.spyOn(openLineageApi, 'getLineageGraph');

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });
  return ({ children }: { children: ReactNode }) =>
    QueryClientProvider({ client: queryClient, children });
}

function makeLineageResponse(depth: number): OpenLineageLineageResponse {
  return {
    datasetId: 'ds-1',
    fieldName: 'col_a',
    direction: 'both',
    maxDepth: depth,
    graph: {
      nodes: [{ id: `node-${depth}`, type: 'field', dataset: 'ds-1' }],
      edges: [],
    },
  };
}

describe('useProgressiveLineage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // TC-PROG-001: depth-1 query fires immediately when enabled
  it('depth-1 query fires immediately when enabled', async () => {
    getLineageGraphSpy.mockResolvedValue(makeLineageResponse(1));

    const { result } = renderHook(
      () => useProgressiveLineage('ds-1', 'col_a', 'both', 5),
      { wrapper: createWrapper() }
    );

    // Initially depth-1 should be loading
    expect(result.current.depth1Query.isLoading).toBe(true);

    await waitFor(() => expect(result.current.depth1Query.isSuccess).toBe(true));

    // depth-1 should have been called with maxDepth: 1
    expect(getLineageGraphSpy).toHaveBeenCalledWith('ds-1', 'col_a', {
      direction: 'both',
      maxDepth: 1,
    });
  });

  // TC-PROG-002: full-depth query disabled until depth-1 resolves
  it('full-depth query is disabled while depth-1 is loading', () => {
    // Make depth-1 never resolve during this test
    getLineageGraphSpy.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(
      () => useProgressiveLineage('ds-1', 'col_a', 'both', 5),
      { wrapper: createWrapper() }
    );

    // depth-1 loading, full-depth should be disabled (not loading)
    expect(result.current.depth1Query.isLoading).toBe(true);
    expect(result.current.fullDepthQuery.isLoading).toBe(false);
  });

  // TC-PROG-003: full-depth query fires after depth-1 succeeds
  it('full-depth query fires after depth-1 succeeds', async () => {
    const depth1Response = makeLineageResponse(1);
    const fullDepthResponse = makeLineageResponse(5);

    getLineageGraphSpy
      .mockResolvedValueOnce(depth1Response)
      .mockResolvedValueOnce(fullDepthResponse);

    const { result } = renderHook(
      () => useProgressiveLineage('ds-1', 'col_a', 'both', 5),
      { wrapper: createWrapper() }
    );

    // Wait for depth-1 to resolve
    await waitFor(() => expect(result.current.isDepth1Ready).toBe(true));

    // Full-depth query should now be loading or complete
    await waitFor(() =>
      expect(
        result.current.fullDepthQuery.isLoading || result.current.fullDepthQuery.isSuccess
      ).toBe(true)
    );

    expect(getLineageGraphSpy).toHaveBeenCalledWith('ds-1', 'col_a', {
      direction: 'both',
      maxDepth: 5,
    });
  });

  // TC-PROG-004: when maxDepth=1, only single query fires
  it('when maxDepth=1, only a single query fires and finalData equals depth-1 data', async () => {
    const depth1Response = makeLineageResponse(1);
    getLineageGraphSpy.mockResolvedValue(depth1Response);

    const { result } = renderHook(
      () => useProgressiveLineage('ds-1', 'col_a', 'both', 1),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isFullDepthReady).toBe(true));

    // fullDepthQuery should be disabled (enabled condition: maxDepth > 1 is false)
    // Note: fullDepthQuery shares the same cache key as depth1Query when maxDepth=1,
    // so TanStack Query serves cached data — but no second network request is made.
    expect(result.current.fullDepthQuery.isLoading).toBe(false);

    // finalData should equal depth-1 data
    expect(result.current.finalData).toEqual(depth1Response);

    // Only one network call — depth-1 only (no wasted second fetch)
    expect(getLineageGraphSpy).toHaveBeenCalledTimes(1);
    expect(getLineageGraphSpy).toHaveBeenCalledWith('ds-1', 'col_a', {
      direction: 'both',
      maxDepth: 1,
    });
  });

  // TC-PROG-005: isFullDepthReady true after full-depth resolves
  it('isFullDepthReady is true after full-depth resolves and finalData matches full-depth response', async () => {
    const depth1Response = makeLineageResponse(1);
    const fullDepthResponse = makeLineageResponse(5);

    getLineageGraphSpy
      .mockResolvedValueOnce(depth1Response)
      .mockResolvedValueOnce(fullDepthResponse);

    const { result } = renderHook(
      () => useProgressiveLineage('ds-1', 'col_a', 'both', 5),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isFullDepthReady).toBe(true));

    expect(result.current.finalData).toEqual(fullDepthResponse);
  });

  // TC-PROG-006: error propagates from depth-1 failure
  it('error propagates from depth-1 failure', async () => {
    const depth1Error = new Error('depth-1 network error');
    getLineageGraphSpy.mockRejectedValue(depth1Error);

    const { result } = renderHook(
      () => useProgressiveLineage('ds-1', 'col_a', 'both', 5),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.error?.message).toBe('depth-1 network error');
  });

  // TC-PROG-007: error propagates from full-depth failure
  it('error propagates from full-depth failure after depth-1 succeeds', async () => {
    const depth1Response = makeLineageResponse(1);
    const fullDepthError = new Error('full-depth network error');

    getLineageGraphSpy
      .mockResolvedValueOnce(depth1Response)
      .mockRejectedValueOnce(fullDepthError);

    const { result } = renderHook(
      () => useProgressiveLineage('ds-1', 'col_a', 'both', 5),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isDepth1Ready).toBe(true));
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.error?.message).toBe('full-depth network error');
  });

  // TC-PROG-008: isFetchingFullDepth true during background fetch
  it('isFetchingFullDepth is true while full-depth is loading after depth-1 resolves', async () => {
    const depth1Response = makeLineageResponse(1);

    let resolveFullDepth!: (value: OpenLineageLineageResponse) => void;
    const fullDepthPromise = new Promise<OpenLineageLineageResponse>((resolve) => {
      resolveFullDepth = resolve;
    });

    getLineageGraphSpy
      .mockResolvedValueOnce(depth1Response)
      .mockReturnValueOnce(fullDepthPromise);

    const { result } = renderHook(
      () => useProgressiveLineage('ds-1', 'col_a', 'both', 5),
      { wrapper: createWrapper() }
    );

    // Wait for depth-1 to resolve
    await waitFor(() => expect(result.current.isDepth1Ready).toBe(true));

    // During full-depth loading, isFetchingFullDepth should be true
    await waitFor(() => expect(result.current.isFetchingFullDepth).toBe(true));

    // Resolve full-depth
    resolveFullDepth(makeLineageResponse(5));
    await waitFor(() => expect(result.current.isFullDepthReady).toBe(true));
  });

  // TC-PROG-009: disabled when enabled=false
  it('both queries are disabled when enabled=false', () => {
    const { result } = renderHook(
      () =>
        useProgressiveLineage('ds-1', 'col_a', 'both', 5, { enabled: false }),
      { wrapper: createWrapper() }
    );

    expect(result.current.depth1Query.isLoading).toBe(false);
    expect(result.current.fullDepthQuery.isLoading).toBe(false);
    expect(getLineageGraphSpy).not.toHaveBeenCalled();
  });
});
