import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';
import { useLineage, useImpactAnalysis } from './useLineage';
import { apiClient } from '../client';

vi.mock('../client', () => ({
  apiClient: {
    get: vi.fn(),
  },
}));

const mockApiClient = apiClient as unknown as { get: ReturnType<typeof vi.fn> };

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('useLineage hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // TC-INT-005: useLineage with Default Options
  describe('useLineage', () => {
    it('uses default direction and maxDepth', async () => {
      const mockResponse = {
        assetId: 'col-1',
        graph: { nodes: [], edges: [] },
      };
      mockApiClient.get.mockResolvedValueOnce({ data: mockResponse });

      const { result } = renderHook(() => useLineage('col-1'), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockApiClient.get).toHaveBeenCalledWith('/lineage/col-1?direction=both&maxDepth=5');
    });

    // TC-INT-006: useLineage with Custom Options
    it('respects custom direction and maxDepth', async () => {
      const mockResponse = {
        assetId: 'col-1',
        graph: { nodes: [], edges: [] },
      };
      mockApiClient.get.mockResolvedValueOnce({ data: mockResponse });

      const { result } = renderHook(
        () => useLineage('col-1', { direction: 'upstream', maxDepth: 10 }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockApiClient.get).toHaveBeenCalledWith('/lineage/col-1?direction=upstream&maxDepth=10');
    });

    it('encodes assetId in URL', async () => {
      mockApiClient.get.mockResolvedValueOnce({ data: { assetId: 'my asset', graph: { nodes: [], edges: [] } } });

      renderHook(() => useLineage('my asset'), { wrapper: createWrapper() });

      await waitFor(() => expect(mockApiClient.get).toHaveBeenCalled());

      expect(mockApiClient.get).toHaveBeenCalledWith('/lineage/my%20asset?direction=both&maxDepth=5');
    });

    it('does not fetch when assetId is empty', async () => {
      const { result } = renderHook(() => useLineage(''), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(mockApiClient.get).not.toHaveBeenCalled();
    });

    // TC-INT-007: useLineage Query Key Caching
    it('uses correct query key for caching', async () => {
      const mockResponse = { assetId: 'col-1', graph: { nodes: [], edges: [] } };
      mockApiClient.get.mockResolvedValue({ data: mockResponse });

      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: Infinity } },
      });
      const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      );

      // First call
      const { result: result1 } = renderHook(
        () => useLineage('col-1', { direction: 'both', maxDepth: 5 }),
        { wrapper }
      );
      await waitFor(() => expect(result1.current.isSuccess).toBe(true));

      // Same params - should use cache
      const { result: result2 } = renderHook(
        () => useLineage('col-1', { direction: 'both', maxDepth: 5 }),
        { wrapper }
      );
      await waitFor(() => expect(result2.current.isSuccess).toBe(true));

      // Should only have made one API call
      expect(mockApiClient.get).toHaveBeenCalledTimes(1);
    });
  });

  // TC-INT-008: useImpactAnalysis Success
  describe('useImpactAnalysis', () => {
    it('returns impact data with summary', async () => {
      const mockResponse = {
        assetId: 'col-1',
        impactedAssets: [
          { id: 'col-2', databaseName: 'db', tableName: 't', depth: 1, impactType: 'direct' },
        ],
        summary: {
          totalImpacted: 1,
          byDatabase: { db: 1 },
          byDepth: { 1: 1 },
          criticalCount: 0,
        },
      };
      mockApiClient.get.mockResolvedValueOnce({ data: mockResponse });

      const { result } = renderHook(() => useImpactAnalysis('col-1'), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockResponse);
      expect(result.current.data?.summary.totalImpacted).toBe(1);
      expect(mockApiClient.get).toHaveBeenCalledWith('/lineage/col-1/impact?maxDepth=10');
    });

    it('uses custom maxDepth', async () => {
      mockApiClient.get.mockResolvedValueOnce({
        data: { assetId: 'col-1', impactedAssets: [], summary: { totalImpacted: 0, byDatabase: {}, byDepth: {}, criticalCount: 0 } },
      });

      const { result } = renderHook(() => useImpactAnalysis('col-1', 20), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockApiClient.get).toHaveBeenCalledWith('/lineage/col-1/impact?maxDepth=20');
    });
  });
});
