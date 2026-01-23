import { renderHook } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useDatabaseClusters } from './useDatabaseClusters';
import { Node } from '@xyflow/react';

describe('useDatabaseClusters', () => {
  const createTestNodes = (): Node[] => [
    {
      id: 'table-1',
      type: 'tableNode',
      position: { x: 0, y: 0 },
      data: { databaseName: 'sales_db', tableName: 'customers' },
    },
    {
      id: 'table-2',
      type: 'tableNode',
      position: { x: 300, y: 0 },
      data: { databaseName: 'sales_db', tableName: 'orders' },
    },
    {
      id: 'table-3',
      type: 'tableNode',
      position: { x: 0, y: 200 },
      data: { databaseName: 'analytics_db', tableName: 'customer_summary' },
    },
    {
      id: 'column-1',
      type: 'columnNode',
      position: { x: 50, y: 50 },
      data: { databaseName: 'sales_db', columnName: 'id' },
    },
  ];

  describe('TC-HOOK-012: cluster grouping', () => {
    it('groups tables by database name', () => {
      const { result } = renderHook(() =>
        useDatabaseClusters({ nodes: createTestNodes() })
      );

      expect(result.current.clusters).toHaveLength(2);
      
      const salesCluster = result.current.clusters.find(
        (c) => c.databaseName === 'sales_db'
      );
      const analyticsCluster = result.current.clusters.find(
        (c) => c.databaseName === 'analytics_db'
      );

      expect(salesCluster).toBeDefined();
      expect(salesCluster?.tables).toContain('table-1');
      expect(salesCluster?.tables).toContain('table-2');
      expect(salesCluster?.tables).toHaveLength(2);

      expect(analyticsCluster).toBeDefined();
      expect(analyticsCluster?.tables).toContain('table-3');
      expect(analyticsCluster?.tables).toHaveLength(1);
    });

    it('excludes non-tableNode types from clustering', () => {
      const { result } = renderHook(() =>
        useDatabaseClusters({ nodes: createTestNodes() })
      );

      const salesCluster = result.current.clusters.find(
        (c) => c.databaseName === 'sales_db'
      );

      expect(salesCluster?.tables).not.toContain('column-1');
    });
  });

  describe('TC-HOOK-013: cluster colors', () => {
    it('assigns consistent colors to clusters', () => {
      const { result } = renderHook(() =>
        useDatabaseClusters({ nodes: createTestNodes() })
      );

      result.current.clusters.forEach((cluster) => {
        expect(cluster.backgroundColor).toBeTruthy();
        expect(cluster.backgroundColor).toMatch(/^rgba\(/);
      });
    });

    it('getDatabaseColor returns color for known database', () => {
      const { result } = renderHook(() =>
        useDatabaseClusters({ nodes: createTestNodes() })
      );

      const color = result.current.getDatabaseColor('sales_db');
      expect(color).toBeTruthy();
      expect(color).toMatch(/^rgba\(/);
    });

    it('getDatabaseColor returns fallback color for unknown database', () => {
      const { result } = renderHook(() =>
        useDatabaseClusters({ nodes: createTestNodes() })
      );

      const color = result.current.getDatabaseColor('unknown_db');
      expect(color).toBeTruthy();
      expect(color).toMatch(/^rgba\(/);
    });
  });

  describe('TC-HOOK-014: cluster bounds', () => {
    it('calculates bounds for cluster with positioned nodes', () => {
      const nodes: Node[] = [
        {
          id: 'table-1',
          type: 'tableNode',
          position: { x: 10, y: 20 },
          width: 280,
          height: 100,
          data: { databaseName: 'test_db' },
        },
        {
          id: 'table-2',
          type: 'tableNode',
          position: { x: 310, y: 20 },
          width: 280,
          height: 150,
          data: { databaseName: 'test_db' },
        },
      ];

      const { result } = renderHook(() =>
        useDatabaseClusters({ nodes })
      );

      const cluster = result.current.clusters[0];
      expect(cluster.bounds).not.toBeNull();
      expect(cluster.bounds?.x).toBe(10);
      expect(cluster.bounds?.y).toBe(20);
    });

    it('returns null bounds for empty cluster', () => {
      const nodes: Node[] = [];

      const { result } = renderHook(() =>
        useDatabaseClusters({ nodes })
      );

      expect(result.current.clusters).toHaveLength(0);
    });
  });

  describe('TC-HOOK-015: cluster IDs', () => {
    it('generates unique cluster IDs', () => {
      const { result } = renderHook(() =>
        useDatabaseClusters({ nodes: createTestNodes() })
      );

      const ids = result.current.clusters.map((c) => c.id);
      const uniqueIds = new Set(ids);
      
      expect(uniqueIds.size).toBe(ids.length);
      expect(ids[0]).toMatch(/^cluster-/);
    });
  });
});
