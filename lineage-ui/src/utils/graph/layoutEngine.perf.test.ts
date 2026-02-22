import { describe, it, expect } from 'vitest';
import { layoutGraph } from './layoutEngine';
import type { LineageNode, LineageEdge } from '../../types';

describe('layoutGraph large database lineage', () => {
  it('handles 200 tables with 50 columns each without hanging', async () => {
    const nodes: LineageNode[] = [];
    const edges: LineageEdge[] = [];

    // Create 200 tables with 50 columns each (10,000 nodes)
    for (let t = 0; t < 200; t++) {
      for (let c = 0; c < 50; c++) {
        nodes.push({
          id: `db.table_${t}.col_${c}`,
          type: 'column',
          databaseName: 'db',
          tableName: `table_${t}`,
          columnName: `col_${c}`,
          metadata: { columnType: 'VARCHAR(100)' },
        });
      }
    }

    // Create edges between first 20 tables (5 columns each = 95 edges)
    for (let t = 0; t < 19; t++) {
      for (let c = 0; c < 5; c++) {
        edges.push({
          id: `e_${t}_${c}`,
          source: `db.table_${t}.col_${c}`,
          target: `db.table_${t+1}.col_${c}`,
          transformationType: 'DIRECT',
        });
      }
    }

    const start = performance.now();
    const result = await layoutGraph(nodes, edges, {});
    const elapsed = performance.now() - start;

    console.log(`Layout completed in ${elapsed.toFixed(0)}ms`);
    console.log(`Table nodes: ${result.nodes.length}, Edges: ${result.edges.length}`);
    console.log(`Connected: ${result.connectedCount}, Isolated: ${result.isolatedCount}`);

    expect(result.nodes.length).toBe(200); // 200 table nodes
    expect(result.connectedCount).toBe(20);
    expect(result.isolatedCount).toBe(180);
    expect(elapsed).toBeLessThan(10000); // Must complete in under 10 seconds
  }, 30000);

  it('handles many tables with dense edges without hanging', async () => {
    const nodes: LineageNode[] = [];
    const edges: LineageEdge[] = [];

    // Create 50 tables with 30 columns each across 3 databases
    for (let db = 0; db < 3; db++) {
      for (let t = 0; t < 50; t++) {
        for (let c = 0; c < 30; c++) {
          nodes.push({
            id: `db${db}.table_${t}.col_${c}`,
            type: 'column',
            databaseName: `db${db}`,
            tableName: `table_${t}`,
            columnName: `col_${c}`,
            metadata: { columnType: 'INTEGER' },
          });
        }
      }
    }

    // Dense edges: each table connects to 3 downstream tables
    for (let db = 0; db < 2; db++) {
      for (let t = 0; t < 48; t++) {
        for (let c = 0; c < 10; c++) {
          edges.push({
            id: `e_${db}_${t}_${c}_0`,
            source: `db${db}.table_${t}.col_${c}`,
            target: `db${db + 1}.table_${t}.col_${c}`,
            transformationType: 'DIRECT',
          });
        }
      }
    }

    const start = performance.now();
    const result = await layoutGraph(nodes, edges, {});
    const elapsed = performance.now() - start;

    console.log(`Dense layout completed in ${elapsed.toFixed(0)}ms`);
    console.log(`Table nodes: ${result.nodes.length}, Edges: ${result.edges.length}`);

    expect(result.nodes.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(10000);
  }, 30000);
});
