import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../client';
import type { Database, Table, Column } from '../../types';

export function useDatabases() {
  return useQuery({
    queryKey: ['databases'],
    queryFn: async () => {
      const { data } = await apiClient.get<{ databases: Database[] }>('/assets/databases');
      return data.databases;
    },
  });
}

export function useTables(databaseName: string) {
  return useQuery({
    queryKey: ['tables', databaseName],
    queryFn: async () => {
      const { data } = await apiClient.get<{ tables: Table[] }>(
        `/assets/databases/${encodeURIComponent(databaseName)}/tables`
      );
      return data.tables;
    },
    enabled: !!databaseName,
  });
}

export function useColumns(databaseName: string, tableName: string) {
  return useQuery({
    queryKey: ['columns', databaseName, tableName],
    queryFn: async () => {
      const { data } = await apiClient.get<{ columns: Column[] }>(
        `/assets/databases/${encodeURIComponent(databaseName)}/tables/${encodeURIComponent(tableName)}/columns`
      );
      return data.columns;
    },
    enabled: !!databaseName && !!tableName,
  });
}
