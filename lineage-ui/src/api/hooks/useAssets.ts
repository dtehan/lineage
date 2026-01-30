import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { apiClient } from '../client';
import type {
  Database,
  Table,
  Column,
  PaginatedDatabaseResponse,
  PaginatedTableResponse,
  PaginatedColumnResponse,
  ApiPaginationMeta
} from '../../types';

// Pagination options interface
export interface PaginationOptions {
  limit?: number;
  offset?: number;
}

// Return type for paginated queries
export interface PaginatedResult<T> {
  data: T[];
  pagination?: ApiPaginationMeta;
}

export function useDatabases(options: PaginationOptions = {}) {
  const { limit = 100, offset = 0 } = options;

  return useQuery({
    queryKey: ['databases', { limit, offset }],
    queryFn: async (): Promise<PaginatedResult<Database>> => {
      const params = new URLSearchParams();
      params.set('limit', String(limit));
      params.set('offset', String(offset));

      const { data } = await apiClient.get<PaginatedDatabaseResponse>(
        `/assets/databases?${params}`
      );

      return {
        data: data.databases,
        pagination: data.pagination,
      };
    },
    placeholderData: keepPreviousData,
  });
}

export function useTables(databaseName: string, options: PaginationOptions = {}) {
  const { limit = 100, offset = 0 } = options;

  return useQuery({
    queryKey: ['tables', databaseName, { limit, offset }],
    queryFn: async (): Promise<PaginatedResult<Table>> => {
      const params = new URLSearchParams();
      params.set('limit', String(limit));
      params.set('offset', String(offset));

      const { data } = await apiClient.get<PaginatedTableResponse>(
        `/assets/databases/${encodeURIComponent(databaseName)}/tables?${params}`
      );

      return {
        data: data.tables,
        pagination: data.pagination,
      };
    },
    enabled: !!databaseName,
    placeholderData: keepPreviousData,
  });
}

export function useColumns(
  databaseName: string,
  tableName: string,
  options: PaginationOptions = {}
) {
  const { limit = 100, offset = 0 } = options;

  return useQuery({
    queryKey: ['columns', databaseName, tableName, { limit, offset }],
    queryFn: async (): Promise<PaginatedResult<Column>> => {
      const params = new URLSearchParams();
      params.set('limit', String(limit));
      params.set('offset', String(offset));

      const { data } = await apiClient.get<PaginatedColumnResponse>(
        `/assets/databases/${encodeURIComponent(databaseName)}/tables/${encodeURIComponent(tableName)}/columns?${params}`
      );

      return {
        data: data.columns,
        pagination: data.pagination,
      };
    },
    enabled: !!databaseName && !!tableName,
    placeholderData: keepPreviousData,
  });
}

// Convenience hooks that match the old API (return just the data array)
// These can be used by existing components that don't need pagination
export function useDatabasesSimple() {
  const query = useDatabases();
  return {
    ...query,
    data: query.data?.data,
  };
}

export function useTablesSimple(databaseName: string) {
  const query = useTables(databaseName);
  return {
    ...query,
    data: query.data?.data,
  };
}

export function useColumnsSimple(databaseName: string, tableName: string) {
  const query = useColumns(databaseName, tableName);
  return {
    ...query,
    data: query.data?.data,
  };
}
