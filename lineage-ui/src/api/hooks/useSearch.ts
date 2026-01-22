import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../client';
import type { SearchResult } from '../../types';

interface SearchOptions {
  query: string;
  assetTypes?: string[];
  limit?: number;
}

export function useSearch(options: SearchOptions) {
  const { query, assetTypes = [], limit = 50 } = options;

  return useQuery({
    queryKey: ['search', query, assetTypes, limit],
    queryFn: async () => {
      const params = new URLSearchParams({ q: query, limit: String(limit) });
      assetTypes.forEach(type => params.append('type', type));

      const { data } = await apiClient.get<{ results: SearchResult[]; total: number }>(
        `/search?${params}`
      );
      return data;
    },
    enabled: query.length >= 2,
  });
}
