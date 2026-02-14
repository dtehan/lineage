import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';
import { useImpactAnalysis } from './useImpact';
import { openLineageApi } from '../client';

vi.mock('../client', () => ({
  openLineageApi: {
    getImpactAnalysis: vi.fn(),
  },
}));

const mockOpenLineageApi = openLineageApi as unknown as {
  getImpactAnalysis: ReturnType<typeof vi.fn>;
};

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });
}

function createWrapper() {
  const queryClient = createTestQueryClient();
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('useImpactAnalysis', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns loading state initially', async () => {
    mockOpenLineageApi.getImpactAnalysis.mockResolvedValueOnce({
      sourceAsset: {
        datasetId: 'dataset-1',
        datasetName: 'demo_user.STG_SALES',
        fieldName: 'sale_amount',
      },
      impactedAssets: [],
      summary: {
        totalImpacted: 0,
        tableCount: 0,
        columnCount: 0,
        databaseCount: 0,
        byDatabase: {},
        byDepth: {},
      },
    });

    const { result } = renderHook(() => useImpactAnalysis('dataset-1', 'sale_amount'), {
      wrapper: createWrapper(),
    });

    // Initially should be loading
    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // After success, loading should be false
    expect(result.current.isLoading).toBe(false);
  });

  it('does not fetch when datasetId is empty', async () => {
    const { result } = renderHook(() => useImpactAnalysis('', 'fieldName'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockOpenLineageApi.getImpactAnalysis).not.toHaveBeenCalled();
  });

  it('does not fetch when fieldName is empty', async () => {
    const { result } = renderHook(() => useImpactAnalysis('dataset-1', ''), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockOpenLineageApi.getImpactAnalysis).not.toHaveBeenCalled();
  });

  it('uses correct query key', async () => {
    const mockResponse = {
      sourceAsset: {
        datasetId: 'dataset-1',
        datasetName: 'demo_user.STG_SALES',
        fieldName: 'sale_amount',
      },
      impactedAssets: [
        {
          databaseName: 'demo_user',
          tableName: 'DIM_PRODUCT',
          columnName: 'price',
          depth: 1,
          impactType: 'direct' as const,
        },
      ],
      summary: {
        totalImpacted: 1,
        tableCount: 1,
        columnCount: 1,
        databaseCount: 1,
        byDatabase: { demo_user: 1 },
        byDepth: { '1': 1 },
      },
    };

    mockOpenLineageApi.getImpactAnalysis.mockResolvedValue(mockResponse);

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          gcTime: Infinity,
          staleTime: Infinity,
        },
      },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    // First call
    const { result: result1, unmount: unmount1 } = renderHook(
      () => useImpactAnalysis('dataset-1', 'sale_amount', 5),
      { wrapper }
    );
    await waitFor(() => expect(result1.current.isSuccess).toBe(true));
    unmount1();

    // Same params - should use cache (query key should match)
    const { result: result2 } = renderHook(
      () => useImpactAnalysis('dataset-1', 'sale_amount', 5),
      { wrapper }
    );
    await waitFor(() => expect(result2.current.isSuccess).toBe(true));

    // Should only have made one API call due to query key caching
    expect(mockOpenLineageApi.getImpactAnalysis).toHaveBeenCalledTimes(1);

    // Verify the query key format includes datasetId, fieldName, and maxDepth
    expect(mockOpenLineageApi.getImpactAnalysis).toHaveBeenCalledWith('dataset-1', 'sale_amount', { maxDepth: 5 });
  });
});
