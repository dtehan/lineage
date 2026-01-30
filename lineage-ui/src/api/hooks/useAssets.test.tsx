import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';
import { useDatabases, useTables, useColumns, useDatabasesSimple, useTablesSimple, useColumnsSimple } from './useAssets';
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

describe('useAssets hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // TC-INT-001: useDatabases Success
  describe('useDatabases', () => {
    it('fetches and returns database list with pagination', async () => {
      const mockDatabases = [
        { id: 'db-1', name: 'sales_db' },
        { id: 'db-2', name: 'analytics_db' },
      ];
      const mockPagination = { total_count: 2, limit: 100, offset: 0, has_next: false };
      mockApiClient.get.mockResolvedValueOnce({ data: { databases: mockDatabases, pagination: mockPagination } });

      const { result } = renderHook(() => useDatabases(), { wrapper: createWrapper() });

      expect(result.current.isLoading).toBe(true);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data?.data).toEqual(mockDatabases);
      expect(result.current.data?.pagination).toEqual(mockPagination);
      expect(mockApiClient.get).toHaveBeenCalledWith('/assets/databases?limit=100&offset=0');
    });

    it('passes pagination options as query params', async () => {
      mockApiClient.get.mockResolvedValueOnce({ data: { databases: [] } });

      renderHook(() => useDatabases({ limit: 50, offset: 100 }), { wrapper: createWrapper() });

      await waitFor(() => expect(mockApiClient.get).toHaveBeenCalled());

      expect(mockApiClient.get).toHaveBeenCalledWith('/assets/databases?limit=50&offset=100');
    });

    // TC-INT-002: useDatabases Error Handling
    it('handles API errors correctly', async () => {
      mockApiClient.get.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useDatabases(), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error).toBeDefined();
      expect(result.current.data).toBeUndefined();
    });
  });

  // TC-INT-003: useTables Conditional Fetching
  describe('useTables', () => {
    it('does not fetch when databaseName is empty', async () => {
      const { result } = renderHook(() => useTables(''), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(mockApiClient.get).not.toHaveBeenCalled();
    });

    it('fetches when databaseName is provided', async () => {
      const mockTables = [
        { id: 'tbl-1', databaseName: 'sales_db', tableName: 'orders', tableKind: 'T' },
      ];
      mockApiClient.get.mockResolvedValueOnce({ data: { tables: mockTables } });

      const { result } = renderHook(() => useTables('sales_db'), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data?.data).toEqual(mockTables);
      expect(mockApiClient.get).toHaveBeenCalledWith('/assets/databases/sales_db/tables?limit=100&offset=0');
    });

    it('encodes databaseName in URL', async () => {
      mockApiClient.get.mockResolvedValueOnce({ data: { tables: [] } });

      renderHook(() => useTables('my database'), { wrapper: createWrapper() });

      await waitFor(() => expect(mockApiClient.get).toHaveBeenCalled());

      expect(mockApiClient.get).toHaveBeenCalledWith('/assets/databases/my%20database/tables?limit=100&offset=0');
    });

    it('includes pagination params in queryKey', async () => {
      mockApiClient.get.mockResolvedValueOnce({ data: { tables: [] } });

      const { result } = renderHook(() => useTables('sales_db', { limit: 25, offset: 50 }), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockApiClient.get).toHaveBeenCalledWith('/assets/databases/sales_db/tables?limit=25&offset=50');
    });
  });

  // TC-INT-004: useColumns Conditional Fetching
  describe('useColumns', () => {
    it('does not fetch when databaseName is empty', async () => {
      const { result } = renderHook(() => useColumns('', 'orders'), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(mockApiClient.get).not.toHaveBeenCalled();
    });

    it('does not fetch when tableName is empty', async () => {
      const { result } = renderHook(() => useColumns('sales_db', ''), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(mockApiClient.get).not.toHaveBeenCalled();
    });

    it('fetches when both databaseName and tableName are provided', async () => {
      const mockColumns = [
        { id: 'col-1', databaseName: 'sales_db', tableName: 'orders', columnName: 'order_id', columnType: 'INTEGER', nullable: false, columnPosition: 1 },
      ];
      mockApiClient.get.mockResolvedValueOnce({ data: { columns: mockColumns } });

      const { result } = renderHook(() => useColumns('sales_db', 'orders'), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data?.data).toEqual(mockColumns);
      expect(mockApiClient.get).toHaveBeenCalledWith('/assets/databases/sales_db/tables/orders/columns?limit=100&offset=0');
    });
  });

  // TC-INT-005: Simple (backward-compatible) hooks
  describe('Simple hooks (backward compatibility)', () => {
    it('useDatabasesSimple returns just the data array', async () => {
      const mockDatabases = [
        { id: 'db-1', name: 'sales_db' },
      ];
      mockApiClient.get.mockResolvedValueOnce({ data: { databases: mockDatabases } });

      const { result } = renderHook(() => useDatabasesSimple(), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockDatabases);
    });

    it('useTablesSimple returns just the data array', async () => {
      const mockTables = [
        { id: 'tbl-1', databaseName: 'sales_db', tableName: 'orders', tableKind: 'T' },
      ];
      mockApiClient.get.mockResolvedValueOnce({ data: { tables: mockTables } });

      const { result } = renderHook(() => useTablesSimple('sales_db'), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockTables);
    });

    it('useColumnsSimple returns just the data array', async () => {
      const mockColumns = [
        { id: 'col-1', databaseName: 'sales_db', tableName: 'orders', columnName: 'order_id', columnType: 'INTEGER', nullable: false, columnPosition: 1 },
      ];
      mockApiClient.get.mockResolvedValueOnce({ data: { columns: mockColumns } });

      const { result } = renderHook(() => useColumnsSimple('sales_db', 'orders'), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockColumns);
    });
  });
});
