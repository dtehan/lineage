import { useState, useMemo, useCallback } from 'react';
import { Node } from '@xyflow/react';

export interface SearchResult {
  columnId: string;
  columnName: string;
  tableName: string;
  databaseName: string;
  dataType: string;
  matchScore: number;
}

export interface UseGraphSearchOptions {
  nodes: Node[];
  maxResults?: number;
}

export interface UseGraphSearchReturn {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  searchResults: SearchResult[];
  selectedIndex: number;
  setSelectedIndex: (index: number) => void;
  selectNext: () => void;
  selectPrevious: () => void;
  clearSearch: () => void;
}

function calculateMatchScore(query: string, target: string): number {
  const lowerQuery = query.toLowerCase();
  const lowerTarget = target.toLowerCase();

  // Exact match
  if (lowerTarget === lowerQuery) {
    return 1.0;
  }

  // Starts with
  if (lowerTarget.startsWith(lowerQuery)) {
    return 0.8;
  }

  // Contains
  if (lowerTarget.includes(lowerQuery)) {
    return 0.5;
  }

  return 0;
}

export function useGraphSearch({
  nodes,
  maxResults = 10,
}: UseGraphSearchOptions): UseGraphSearchReturn {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Extract searchable columns from nodes
  const searchableColumns = useMemo(() => {
    const columns: SearchResult[] = [];

    nodes.forEach((node) => {
      if (node.type === 'columnNode' && node.data) {
        const data = node.data as {
          columnName?: string;
          tableName?: string;
          databaseName?: string;
          dataType?: string;
        };
        columns.push({
          columnId: node.id,
          columnName: data.columnName || '',
          tableName: data.tableName || '',
          databaseName: data.databaseName || '',
          dataType: data.dataType || '',
          matchScore: 0,
        });
      }
    });

    return columns;
  }, [nodes]);

  // Search and sort results
  const searchResults = useMemo(() => {
    if (!searchQuery || searchQuery.length < 2) {
      return [];
    }

    const results = searchableColumns
      .map((column) => {
        // Calculate match scores for different fields
        const columnScore = calculateMatchScore(searchQuery, column.columnName);
        const tableScore = calculateMatchScore(searchQuery, column.tableName) * 0.7;
        const fullNameScore = calculateMatchScore(
          searchQuery,
          `${column.databaseName}.${column.tableName}.${column.columnName}`
        ) * 0.9;

        const matchScore = Math.max(columnScore, tableScore, fullNameScore);

        return {
          ...column,
          matchScore,
        };
      })
      .filter((result) => result.matchScore > 0)
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, maxResults);

    return results;
  }, [searchQuery, searchableColumns, maxResults]);

  // Reset selected index when results change
  const handleSetSearchQuery = useCallback((query: string) => {
    setSearchQuery(query);
    setSelectedIndex(0);
  }, []);

  // Navigate through results
  const selectNext = useCallback(() => {
    setSelectedIndex((prev) => 
      prev < searchResults.length - 1 ? prev + 1 : prev
    );
  }, [searchResults.length]);

  const selectPrevious = useCallback(() => {
    setSelectedIndex((prev) => (prev > 0 ? prev - 1 : 0));
  }, []);

  // Clear search
  const clearSearch = useCallback(() => {
    setSearchQuery('');
    setSelectedIndex(0);
  }, []);

  return {
    searchQuery,
    setSearchQuery: handleSetSearchQuery,
    searchResults,
    selectedIndex,
    setSelectedIndex,
    selectNext,
    selectPrevious,
    clearSearch,
  };
}
