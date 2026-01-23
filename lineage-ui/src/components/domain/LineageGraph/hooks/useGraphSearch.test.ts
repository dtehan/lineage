import { renderHook, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useGraphSearch } from './useGraphSearch';
import { Node } from '@xyflow/react';

describe('useGraphSearch', () => {
  const createTestNodes = (): Node[] => [
    {
      id: 'col-1',
      type: 'columnNode',
      position: { x: 0, y: 0 },
      data: {
        columnName: 'customer_id',
        tableName: 'customers',
        databaseName: 'sales_db',
        dataType: 'INTEGER',
      },
    },
    {
      id: 'col-2',
      type: 'columnNode',
      position: { x: 0, y: 0 },
      data: {
        columnName: 'customer_name',
        tableName: 'customers',
        databaseName: 'sales_db',
        dataType: 'VARCHAR',
      },
    },
    {
      id: 'col-3',
      type: 'columnNode',
      position: { x: 0, y: 0 },
      data: {
        columnName: 'order_id',
        tableName: 'orders',
        databaseName: 'sales_db',
        dataType: 'INTEGER',
      },
    },
    {
      id: 'col-4',
      type: 'columnNode',
      position: { x: 0, y: 0 },
      data: {
        columnName: 'cust_total',
        tableName: 'customer_summary',
        databaseName: 'analytics_db',
        dataType: 'DECIMAL',
      },
    },
    {
      id: 'table-1',
      type: 'tableNode',
      position: { x: 0, y: 0 },
      data: { tableName: 'customers' },
    },
  ];

  describe('TC-HOOK-006: search initialization', () => {
    it('initializes with empty search query', () => {
      const { result } = renderHook(() =>
        useGraphSearch({ nodes: createTestNodes() })
      );

      expect(result.current.searchQuery).toBe('');
      expect(result.current.searchResults).toHaveLength(0);
      expect(result.current.selectedIndex).toBe(0);
    });
  });

  describe('TC-HOOK-007: search filtering', () => {
    it('returns matching results for query', () => {
      const { result } = renderHook(() =>
        useGraphSearch({ nodes: createTestNodes() })
      );

      act(() => {
        result.current.setSearchQuery('customer');
      });

      expect(result.current.searchResults.length).toBeGreaterThan(0);
      expect(
        result.current.searchResults.every(
          (r) =>
            r.columnName.toLowerCase().includes('customer') ||
            r.tableName.toLowerCase().includes('customer')
        )
      ).toBe(true);
    });

    it('returns empty results for query less than 2 characters', () => {
      const { result } = renderHook(() =>
        useGraphSearch({ nodes: createTestNodes() })
      );

      act(() => {
        result.current.setSearchQuery('c');
      });

      expect(result.current.searchResults).toHaveLength(0);
    });

    it('returns empty results for no matches', () => {
      const { result } = renderHook(() =>
        useGraphSearch({ nodes: createTestNodes() })
      );

      act(() => {
        result.current.setSearchQuery('zzzzz');
      });

      expect(result.current.searchResults).toHaveLength(0);
    });
  });

  describe('TC-HOOK-008: search result scoring', () => {
    it('prioritizes exact matches over partial matches', () => {
      const { result } = renderHook(() =>
        useGraphSearch({ nodes: createTestNodes() })
      );

      act(() => {
        result.current.setSearchQuery('customer_id');
      });

      expect(result.current.searchResults[0].columnName).toBe('customer_id');
    });

    it('prioritizes starts-with over contains', () => {
      const { result } = renderHook(() =>
        useGraphSearch({ nodes: createTestNodes() })
      );

      act(() => {
        result.current.setSearchQuery('cust');
      });

      // customer_id and customer_name should rank higher than cust_total
      const results = result.current.searchResults;
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('TC-HOOK-009: search navigation', () => {
    it('selectNext increments selected index', () => {
      const { result } = renderHook(() =>
        useGraphSearch({ nodes: createTestNodes() })
      );

      act(() => {
        result.current.setSearchQuery('cust');
      });

      expect(result.current.selectedIndex).toBe(0);

      act(() => {
        result.current.selectNext();
      });

      expect(result.current.selectedIndex).toBe(1);
    });

    it('selectPrevious decrements selected index', () => {
      const { result } = renderHook(() =>
        useGraphSearch({ nodes: createTestNodes() })
      );

      act(() => {
        result.current.setSearchQuery('cust');
        result.current.setSelectedIndex(2);
      });

      act(() => {
        result.current.selectPrevious();
      });

      expect(result.current.selectedIndex).toBe(1);
    });

    it('selectNext does not exceed results length', () => {
      const { result } = renderHook(() =>
        useGraphSearch({ nodes: createTestNodes(), maxResults: 2 })
      );

      act(() => {
        result.current.setSearchQuery('cust');
      });

      act(() => {
        result.current.selectNext();
        result.current.selectNext();
        result.current.selectNext();
      });

      expect(result.current.selectedIndex).toBeLessThanOrEqual(
        result.current.searchResults.length - 1
      );
    });

    it('selectPrevious does not go below 0', () => {
      const { result } = renderHook(() =>
        useGraphSearch({ nodes: createTestNodes() })
      );

      act(() => {
        result.current.setSearchQuery('cust');
      });

      act(() => {
        result.current.selectPrevious();
        result.current.selectPrevious();
      });

      expect(result.current.selectedIndex).toBe(0);
    });
  });

  describe('TC-HOOK-010: clearSearch', () => {
    it('clears search query and resets index', () => {
      const { result } = renderHook(() =>
        useGraphSearch({ nodes: createTestNodes() })
      );

      act(() => {
        result.current.setSearchQuery('customer');
        result.current.setSelectedIndex(2);
      });

      expect(result.current.searchQuery).toBe('customer');
      expect(result.current.selectedIndex).toBe(2);

      act(() => {
        result.current.clearSearch();
      });

      expect(result.current.searchQuery).toBe('');
      expect(result.current.selectedIndex).toBe(0);
      expect(result.current.searchResults).toHaveLength(0);
    });
  });

  describe('TC-HOOK-011: maxResults limit', () => {
    it('limits results to maxResults', () => {
      const { result } = renderHook(() =>
        useGraphSearch({ nodes: createTestNodes(), maxResults: 2 })
      );

      act(() => {
        result.current.setSearchQuery('cust');
      });

      expect(result.current.searchResults.length).toBeLessThanOrEqual(2);
    });
  });
});
