import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';
import { useSearch } from './useSearch';
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

describe('useSearch hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // TC-INT-009: useSearch Minimum Query Length
  describe('minimum query length', () => {
    it('does not execute when query is 1 character', async () => {
      const { result } = renderHook(() => useSearch({ query: 'a' }), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(mockApiClient.get).not.toHaveBeenCalled();
    });

    it('executes when query is 2 or more characters', async () => {
      mockApiClient.get.mockResolvedValueOnce({ data: { results: [], total: 0 } });

      const { result } = renderHook(() => useSearch({ query: 'ab' }), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockApiClient.get).toHaveBeenCalled();
    });
  });

  // TC-INT-010: useSearch with Asset Type Filters
  describe('asset type filters', () => {
    it('appends multiple type parameters', async () => {
      mockApiClient.get.mockResolvedValueOnce({ data: { results: [], total: 0 } });

      const { result } = renderHook(
        () => useSearch({ query: 'test', assetTypes: ['table', 'column'] }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const call = mockApiClient.get.mock.calls[0][0];
      expect(call).toContain('type=table');
      expect(call).toContain('type=column');
    });

    it('includes limit parameter', async () => {
      mockApiClient.get.mockResolvedValueOnce({ data: { results: [], total: 0 } });

      const { result } = renderHook(
        () => useSearch({ query: 'test', limit: 25 }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const call = mockApiClient.get.mock.calls[0][0];
      expect(call).toContain('limit=25');
    });

    it('uses default limit of 50', async () => {
      mockApiClient.get.mockResolvedValueOnce({ data: { results: [], total: 0 } });

      const { result } = renderHook(
        () => useSearch({ query: 'test' }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const call = mockApiClient.get.mock.calls[0][0];
      expect(call).toContain('limit=50');
    });
  });

  describe('search results', () => {
    it('returns search results with total count', async () => {
      const mockResults = {
        results: [
          { id: 'tbl-1', type: 'table', databaseName: 'db', tableName: 'orders', matchedOn: 'tableName', score: 0.9 },
        ],
        total: 1,
      };
      mockApiClient.get.mockResolvedValueOnce({ data: mockResults });

      const { result } = renderHook(
        () => useSearch({ query: 'orders' }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockResults);
      expect(result.current.data?.total).toBe(1);
    });
  });
});
