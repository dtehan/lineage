import { describe, it, expect } from 'vitest';
import { layoutGraph, groupByTable } from '../../utils/graph/layoutEngine';
import type { LineageNode, LineageEdge } from '../../types';

/**
 * Phase 16: Correctness Validation Tests
 *
 * These tests validate that the frontend graph utilities correctly handle
 * complex patterns (cycles, diamonds, fans) that may come from the API.
 *
 * Tests TWO scenarios:
 * 1. Single-table patterns (matching database test data from Phase 15)
 * 2. Multi-table patterns (cross-table lineage scenarios)
 *
 * Requirements covered:
 * - CORRECT-VAL-01: Cycle detection (frontend handles cyclic edges)
 * - CORRECT-VAL-02: Diamond deduplication (no duplicate table nodes)
 * - CORRECT-VAL-03: Fan-out completeness (all targets rendered)
 * - CORRECT-VAL-04: Fan-in completeness (all sources rendered)
 * - CORRECT-VAL-06: Node count validation
 * - CORRECT-VAL-07: Edge count validation
 */

// Expected counts for SINGLE-TABLE patterns (matching insert_cte_test_data.py)
const SINGLE_TABLE_COUNTS = {
  CYCLE_2NODE: { columns: 2, edges: 2, tableNodes: 1 },
  CYCLE_5NODE: { columns: 5, edges: 5, tableNodes: 1 },
  DIAMOND_SIMPLE: { columns: 4, edges: 4, tableNodes: 1 },
  DIAMOND_WIDE: { columns: 6, edges: 8, tableNodes: 1 },
  FANOUT_5: { columns: 6, edges: 5, tableNodes: 1 },
  FANIN_5: { columns: 6, edges: 5, tableNodes: 1 },
};

// Expected counts for MULTI-TABLE patterns (cross-table lineage)
const MULTI_TABLE_COUNTS = {
  DIAMOND_SIMPLE: { columns: 4, edges: 4, tableNodes: 4 },
  DIAMOND_WIDE: { columns: 6, edges: 8, tableNodes: 6 },
  FANOUT_5: { columns: 6, edges: 5, tableNodes: 6 },
  FANIN_5: { columns: 6, edges: 5, tableNodes: 6 },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Helper to create node for a column
 */
function createColumnNode(db: string, table: string, column: string): LineageNode {
  return {
    id: `${db}.${table}.${column}`,
    type: 'column',
    databaseName: db,
    tableName: table,
    columnName: column,
  };
}

/**
 * Helper to create edge
 */
function createEdge(sourceId: string, targetId: string, transType = 'DIRECT'): LineageEdge {
  return {
    id: `e_${sourceId}_${targetId}`,
    source: sourceId,
    target: targetId,
    transformationType: transType,
  };
}

// ============================================================================
// SINGLE-TABLE PATTERN TESTS (matching database test data)
// ============================================================================

describe('CORRECT-VAL-01: Single-Table Cycle Detection', () => {
  it('handles 2-node cycle without infinite loop', async () => {
    // A->B->A (same table)
    const nodes: LineageNode[] = [
      createColumnNode('db', 'CYCLE_TEST', 'col_a'),
      createColumnNode('db', 'CYCLE_TEST', 'col_b'),
    ];
    const edges: LineageEdge[] = [
      createEdge('db.CYCLE_TEST.col_a', 'db.CYCLE_TEST.col_b'),
      createEdge('db.CYCLE_TEST.col_b', 'db.CYCLE_TEST.col_a'),
    ];

    // Should complete without timeout/error
    const result = await layoutGraph(nodes, edges);

    // Single table node with 2 columns
    expect(result.nodes).toHaveLength(SINGLE_TABLE_COUNTS.CYCLE_2NODE.tableNodes);
    expect(result.nodes[0].data.columns).toHaveLength(SINGLE_TABLE_COUNTS.CYCLE_2NODE.columns);
    // Both edges preserved (internal to same table)
    expect(result.edges).toHaveLength(SINGLE_TABLE_COUNTS.CYCLE_2NODE.edges);
  });

  it('handles 5-node cycle without infinite loop', async () => {
    // A->B->C->D->E->A (same table)
    const columns = ['col_a', 'col_b', 'col_c', 'col_d', 'col_e'];
    const nodes = columns.map((c) => createColumnNode('db', 'CYCLE5_TEST', c));
    const edges = columns.map((c, i) => {
      const next = columns[(i + 1) % columns.length];
      return createEdge(`db.CYCLE5_TEST.${c}`, `db.CYCLE5_TEST.${next}`);
    });

    const result = await layoutGraph(nodes, edges);

    expect(result.nodes).toHaveLength(SINGLE_TABLE_COUNTS.CYCLE_5NODE.tableNodes); // Single table
    expect(result.nodes[0].data.columns).toHaveLength(SINGLE_TABLE_COUNTS.CYCLE_5NODE.columns);
    expect(result.edges).toHaveLength(SINGLE_TABLE_COUNTS.CYCLE_5NODE.edges);
  });

  it('cycle edges are all preserved', async () => {
    // Verify each edge ID is present
    const nodes: LineageNode[] = [
      createColumnNode('db', 'CYCLE_TEST', 'col_a'),
      createColumnNode('db', 'CYCLE_TEST', 'col_b'),
    ];
    const edges: LineageEdge[] = [
      createEdge('db.CYCLE_TEST.col_a', 'db.CYCLE_TEST.col_b'),
      createEdge('db.CYCLE_TEST.col_b', 'db.CYCLE_TEST.col_a'),
    ];

    const result = await layoutGraph(nodes, edges);

    // Both edges should be present (A->B and B->A)
    const edgeIds = result.edges.map((e) => e.id);
    expect(edgeIds).toContain('e_db.CYCLE_TEST.col_a_db.CYCLE_TEST.col_b');
    expect(edgeIds).toContain('e_db.CYCLE_TEST.col_b_db.CYCLE_TEST.col_a');
  });
});

describe('CORRECT-VAL-02: Single-Table Diamond Patterns', () => {
  it('simple diamond within same table produces 1 table node', async () => {
    // A->B->D, A->C->D (same table, matching DIAMOND test data)
    const nodes: LineageNode[] = [
      createColumnNode('db', 'DIAMOND', 'col_a'),
      createColumnNode('db', 'DIAMOND', 'col_b'),
      createColumnNode('db', 'DIAMOND', 'col_c'),
      createColumnNode('db', 'DIAMOND', 'col_d'),
    ];
    const edges: LineageEdge[] = [
      createEdge('db.DIAMOND.col_a', 'db.DIAMOND.col_b'),
      createEdge('db.DIAMOND.col_a', 'db.DIAMOND.col_c'),
      createEdge('db.DIAMOND.col_b', 'db.DIAMOND.col_d'),
      createEdge('db.DIAMOND.col_c', 'db.DIAMOND.col_d'),
    ];

    const result = await layoutGraph(nodes, edges);

    // 1 table node with 4 columns
    expect(result.nodes).toHaveLength(SINGLE_TABLE_COUNTS.DIAMOND_SIMPLE.tableNodes);
    expect(result.nodes[0].data.columns).toHaveLength(SINGLE_TABLE_COUNTS.DIAMOND_SIMPLE.columns);
    // All 4 edges preserved (internal to table)
    expect(result.edges).toHaveLength(SINGLE_TABLE_COUNTS.DIAMOND_SIMPLE.edges);
  });

  it('wide diamond within same table produces 1 table node', async () => {
    // A->B,C,D,E->F (same table, matching WIDE_DIAMOND test data)
    const nodes: LineageNode[] = [
      createColumnNode('db', 'WIDE_DIAMOND', 'col_a'),
      createColumnNode('db', 'WIDE_DIAMOND', 'col_b'),
      createColumnNode('db', 'WIDE_DIAMOND', 'col_c'),
      createColumnNode('db', 'WIDE_DIAMOND', 'col_d'),
      createColumnNode('db', 'WIDE_DIAMOND', 'col_e'),
      createColumnNode('db', 'WIDE_DIAMOND', 'col_f'),
    ];
    const edges: LineageEdge[] = [
      createEdge('db.WIDE_DIAMOND.col_a', 'db.WIDE_DIAMOND.col_b'),
      createEdge('db.WIDE_DIAMOND.col_a', 'db.WIDE_DIAMOND.col_c'),
      createEdge('db.WIDE_DIAMOND.col_a', 'db.WIDE_DIAMOND.col_d'),
      createEdge('db.WIDE_DIAMOND.col_a', 'db.WIDE_DIAMOND.col_e'),
      createEdge('db.WIDE_DIAMOND.col_b', 'db.WIDE_DIAMOND.col_f'),
      createEdge('db.WIDE_DIAMOND.col_c', 'db.WIDE_DIAMOND.col_f'),
      createEdge('db.WIDE_DIAMOND.col_d', 'db.WIDE_DIAMOND.col_f'),
      createEdge('db.WIDE_DIAMOND.col_e', 'db.WIDE_DIAMOND.col_f'),
    ];

    const result = await layoutGraph(nodes, edges);

    expect(result.nodes).toHaveLength(SINGLE_TABLE_COUNTS.DIAMOND_WIDE.tableNodes);
    expect(result.nodes[0].data.columns).toHaveLength(SINGLE_TABLE_COUNTS.DIAMOND_WIDE.columns);
    expect(result.edges).toHaveLength(SINGLE_TABLE_COUNTS.DIAMOND_WIDE.edges);
  });

  it('diamond edges converge correctly', async () => {
    // Verify that both paths to the target column are preserved
    const nodes: LineageNode[] = [
      createColumnNode('db', 'DIAMOND', 'col_a'),
      createColumnNode('db', 'DIAMOND', 'col_b'),
      createColumnNode('db', 'DIAMOND', 'col_c'),
      createColumnNode('db', 'DIAMOND', 'col_d'),
    ];
    const edges: LineageEdge[] = [
      createEdge('db.DIAMOND.col_a', 'db.DIAMOND.col_b'),
      createEdge('db.DIAMOND.col_a', 'db.DIAMOND.col_c'),
      createEdge('db.DIAMOND.col_b', 'db.DIAMOND.col_d'),
      createEdge('db.DIAMOND.col_c', 'db.DIAMOND.col_d'),
    ];

    const result = await layoutGraph(nodes, edges);

    // Both paths to col_d should exist
    const edgesToD = result.edges.filter(
      (e) => e.targetHandle?.includes('col_d')
    );
    expect(edgesToD).toHaveLength(2);
  });
});

describe('CORRECT-VAL-03: Single-Table Fan-out Patterns', () => {
  it('fan-out 5 within same table produces 1 table node', async () => {
    // 1 source -> 5 targets (same table, matching FANOUT5_TEST)
    const nodes: LineageNode[] = [
      createColumnNode('db', 'FANOUT5_TEST', 'source'),
      createColumnNode('db', 'FANOUT5_TEST', 'target_1'),
      createColumnNode('db', 'FANOUT5_TEST', 'target_2'),
      createColumnNode('db', 'FANOUT5_TEST', 'target_3'),
      createColumnNode('db', 'FANOUT5_TEST', 'target_4'),
      createColumnNode('db', 'FANOUT5_TEST', 'target_5'),
    ];
    const edges: LineageEdge[] = [
      createEdge('db.FANOUT5_TEST.source', 'db.FANOUT5_TEST.target_1'),
      createEdge('db.FANOUT5_TEST.source', 'db.FANOUT5_TEST.target_2'),
      createEdge('db.FANOUT5_TEST.source', 'db.FANOUT5_TEST.target_3'),
      createEdge('db.FANOUT5_TEST.source', 'db.FANOUT5_TEST.target_4'),
      createEdge('db.FANOUT5_TEST.source', 'db.FANOUT5_TEST.target_5'),
    ];

    const result = await layoutGraph(nodes, edges);

    // 1 table node with 6 columns
    expect(result.nodes).toHaveLength(SINGLE_TABLE_COUNTS.FANOUT_5.tableNodes);
    expect(result.nodes[0].data.columns).toHaveLength(SINGLE_TABLE_COUNTS.FANOUT_5.columns);
    expect(result.edges).toHaveLength(SINGLE_TABLE_COUNTS.FANOUT_5.edges);
  });

  it('all fan-out targets are reachable', async () => {
    const nodes: LineageNode[] = [
      createColumnNode('db', 'FANOUT5_TEST', 'source'),
      createColumnNode('db', 'FANOUT5_TEST', 'target_1'),
      createColumnNode('db', 'FANOUT5_TEST', 'target_2'),
      createColumnNode('db', 'FANOUT5_TEST', 'target_3'),
      createColumnNode('db', 'FANOUT5_TEST', 'target_4'),
      createColumnNode('db', 'FANOUT5_TEST', 'target_5'),
    ];
    const edges: LineageEdge[] = [
      createEdge('db.FANOUT5_TEST.source', 'db.FANOUT5_TEST.target_1'),
      createEdge('db.FANOUT5_TEST.source', 'db.FANOUT5_TEST.target_2'),
      createEdge('db.FANOUT5_TEST.source', 'db.FANOUT5_TEST.target_3'),
      createEdge('db.FANOUT5_TEST.source', 'db.FANOUT5_TEST.target_4'),
      createEdge('db.FANOUT5_TEST.source', 'db.FANOUT5_TEST.target_5'),
    ];

    const result = await layoutGraph(nodes, edges);

    // All 5 target edges should exist from the source
    for (let i = 1; i <= 5; i++) {
      const targetEdge = result.edges.find((e) =>
        e.targetHandle?.includes(`target_${i}`)
      );
      expect(targetEdge).toBeDefined();
    }
  });
});

describe('CORRECT-VAL-04: Single-Table Fan-in Patterns', () => {
  it('fan-in 5 within same table produces 1 table node', async () => {
    // 5 sources -> 1 target (same table, matching FANIN5_TEST)
    const nodes: LineageNode[] = [
      createColumnNode('db', 'FANIN5_TEST', 'src_1'),
      createColumnNode('db', 'FANIN5_TEST', 'src_2'),
      createColumnNode('db', 'FANIN5_TEST', 'src_3'),
      createColumnNode('db', 'FANIN5_TEST', 'src_4'),
      createColumnNode('db', 'FANIN5_TEST', 'src_5'),
      createColumnNode('db', 'FANIN5_TEST', 'target'),
    ];
    const edges: LineageEdge[] = [
      createEdge('db.FANIN5_TEST.src_1', 'db.FANIN5_TEST.target'),
      createEdge('db.FANIN5_TEST.src_2', 'db.FANIN5_TEST.target'),
      createEdge('db.FANIN5_TEST.src_3', 'db.FANIN5_TEST.target'),
      createEdge('db.FANIN5_TEST.src_4', 'db.FANIN5_TEST.target'),
      createEdge('db.FANIN5_TEST.src_5', 'db.FANIN5_TEST.target'),
    ];

    const result = await layoutGraph(nodes, edges);

    // 1 table node with 6 columns
    expect(result.nodes).toHaveLength(SINGLE_TABLE_COUNTS.FANIN_5.tableNodes);
    expect(result.nodes[0].data.columns).toHaveLength(SINGLE_TABLE_COUNTS.FANIN_5.columns);
    expect(result.edges).toHaveLength(SINGLE_TABLE_COUNTS.FANIN_5.edges);
  });

  it('all fan-in sources are connected', async () => {
    const nodes: LineageNode[] = [
      createColumnNode('db', 'FANIN5_TEST', 'src_1'),
      createColumnNode('db', 'FANIN5_TEST', 'src_2'),
      createColumnNode('db', 'FANIN5_TEST', 'src_3'),
      createColumnNode('db', 'FANIN5_TEST', 'src_4'),
      createColumnNode('db', 'FANIN5_TEST', 'src_5'),
      createColumnNode('db', 'FANIN5_TEST', 'target'),
    ];
    const edges: LineageEdge[] = [
      createEdge('db.FANIN5_TEST.src_1', 'db.FANIN5_TEST.target'),
      createEdge('db.FANIN5_TEST.src_2', 'db.FANIN5_TEST.target'),
      createEdge('db.FANIN5_TEST.src_3', 'db.FANIN5_TEST.target'),
      createEdge('db.FANIN5_TEST.src_4', 'db.FANIN5_TEST.target'),
      createEdge('db.FANIN5_TEST.src_5', 'db.FANIN5_TEST.target'),
    ];

    const result = await layoutGraph(nodes, edges);

    // All 5 edges should target the same column
    const edgesToTarget = result.edges.filter((e) =>
      e.targetHandle?.includes('target')
    );
    expect(edgesToTarget).toHaveLength(5);
  });
});

// ============================================================================
// MULTI-TABLE PATTERN TESTS (cross-table lineage)
// ============================================================================

describe('CORRECT-VAL-02: Multi-Table Diamond Deduplication', () => {
  it('simple diamond across 4 tables produces 4 table nodes', async () => {
    // A->B->D, A->C->D (4 different tables)
    const nodes: LineageNode[] = [
      createColumnNode('db', 't1', 'col_a'),
      createColumnNode('db', 't2', 'col_b'),
      createColumnNode('db', 't3', 'col_c'),
      createColumnNode('db', 't4', 'col_d'),
    ];
    const edges: LineageEdge[] = [
      createEdge('db.t1.col_a', 'db.t2.col_b'),
      createEdge('db.t1.col_a', 'db.t3.col_c'),
      createEdge('db.t2.col_b', 'db.t4.col_d'),
      createEdge('db.t3.col_c', 'db.t4.col_d'),
    ];

    const result = await layoutGraph(nodes, edges);

    // 4 unique table nodes
    expect(result.nodes).toHaveLength(MULTI_TABLE_COUNTS.DIAMOND_SIMPLE.tableNodes);
    // All 4 edges preserved
    expect(result.edges).toHaveLength(MULTI_TABLE_COUNTS.DIAMOND_SIMPLE.edges);

    // No duplicate IDs
    const nodeIds = result.nodes.map((n) => n.id);
    expect(new Set(nodeIds).size).toBe(nodeIds.length);
  });

  it('wide diamond with 4 middle nodes produces correct counts', async () => {
    // A->B,C,D,E->F (6 different tables)
    const nodes: LineageNode[] = [
      createColumnNode('db', 't1', 'col_a'),
      createColumnNode('db', 't2', 'col_b'),
      createColumnNode('db', 't3', 'col_c'),
      createColumnNode('db', 't4', 'col_d'),
      createColumnNode('db', 't5', 'col_e'),
      createColumnNode('db', 't6', 'col_f'),
    ];
    const edges: LineageEdge[] = [
      createEdge('db.t1.col_a', 'db.t2.col_b'),
      createEdge('db.t1.col_a', 'db.t3.col_c'),
      createEdge('db.t1.col_a', 'db.t4.col_d'),
      createEdge('db.t1.col_a', 'db.t5.col_e'),
      createEdge('db.t2.col_b', 'db.t6.col_f'),
      createEdge('db.t3.col_c', 'db.t6.col_f'),
      createEdge('db.t4.col_d', 'db.t6.col_f'),
      createEdge('db.t5.col_e', 'db.t6.col_f'),
    ];

    const result = await layoutGraph(nodes, edges);

    expect(result.nodes).toHaveLength(MULTI_TABLE_COUNTS.DIAMOND_WIDE.tableNodes);
    expect(result.edges).toHaveLength(MULTI_TABLE_COUNTS.DIAMOND_WIDE.edges);
  });

  it('diamond source appears only once', async () => {
    const nodes: LineageNode[] = [
      createColumnNode('db', 't1', 'col_a'),
      createColumnNode('db', 't2', 'col_b'),
      createColumnNode('db', 't3', 'col_c'),
      createColumnNode('db', 't4', 'col_d'),
    ];
    const edges: LineageEdge[] = [
      createEdge('db.t1.col_a', 'db.t2.col_b'),
      createEdge('db.t1.col_a', 'db.t3.col_c'),
      createEdge('db.t2.col_b', 'db.t4.col_d'),
      createEdge('db.t3.col_c', 'db.t4.col_d'),
    ];

    const result = await layoutGraph(nodes, edges);

    // t1 should appear exactly once
    const t1Nodes = result.nodes.filter((n) => n.id === 'db.t1');
    expect(t1Nodes).toHaveLength(1);
  });

  it('diamond sink appears only once', async () => {
    const nodes: LineageNode[] = [
      createColumnNode('db', 't1', 'col_a'),
      createColumnNode('db', 't2', 'col_b'),
      createColumnNode('db', 't3', 'col_c'),
      createColumnNode('db', 't4', 'col_d'),
    ];
    const edges: LineageEdge[] = [
      createEdge('db.t1.col_a', 'db.t2.col_b'),
      createEdge('db.t1.col_a', 'db.t3.col_c'),
      createEdge('db.t2.col_b', 'db.t4.col_d'),
      createEdge('db.t3.col_c', 'db.t4.col_d'),
    ];

    const result = await layoutGraph(nodes, edges);

    // t4 should appear exactly once
    const t4Nodes = result.nodes.filter((n) => n.id === 'db.t4');
    expect(t4Nodes).toHaveLength(1);
  });
});

describe('CORRECT-VAL-03: Multi-Table Fan-out Completeness', () => {
  it('fan-out 5 includes all 5 target nodes', async () => {
    // 1 source -> 5 targets (different tables)
    const nodes: LineageNode[] = [
      createColumnNode('db', 'src', 'source'),
      ...Array.from({ length: 5 }, (_, i) =>
        createColumnNode('db', `tgt${i + 1}`, `target_${i + 1}`)
      ),
    ];
    const edges = Array.from({ length: 5 }, (_, i) =>
      createEdge('db.src.source', `db.tgt${i + 1}.target_${i + 1}`)
    );

    const result = await layoutGraph(nodes, edges);

    // 6 table nodes (1 source + 5 targets)
    expect(result.nodes).toHaveLength(MULTI_TABLE_COUNTS.FANOUT_5.tableNodes);
    // 5 edges
    expect(result.edges).toHaveLength(MULTI_TABLE_COUNTS.FANOUT_5.edges);

    // Verify all target tables present
    const tableIds = result.nodes.map((n) => n.id);
    for (let i = 1; i <= 5; i++) {
      expect(tableIds).toContain(`db.tgt${i}`);
    }
  });

  it('fan-out source has correct outgoing edges', async () => {
    const nodes: LineageNode[] = [
      createColumnNode('db', 'src', 'source'),
      ...Array.from({ length: 5 }, (_, i) =>
        createColumnNode('db', `tgt${i + 1}`, `target_${i + 1}`)
      ),
    ];
    const edges = Array.from({ length: 5 }, (_, i) =>
      createEdge('db.src.source', `db.tgt${i + 1}.target_${i + 1}`)
    );

    const result = await layoutGraph(nodes, edges);

    // All edges should originate from src
    const edgesFromSrc = result.edges.filter((e) => e.source === 'db.src');
    expect(edgesFromSrc).toHaveLength(5);
  });
});

describe('CORRECT-VAL-04: Multi-Table Fan-in Completeness', () => {
  it('fan-in 5 includes all 5 source nodes', async () => {
    // 5 sources -> 1 target (different tables)
    const nodes: LineageNode[] = [
      ...Array.from({ length: 5 }, (_, i) =>
        createColumnNode('db', `src${i + 1}`, `source_${i + 1}`)
      ),
      createColumnNode('db', 'tgt', 'target'),
    ];
    const edges = Array.from({ length: 5 }, (_, i) =>
      createEdge(`db.src${i + 1}.source_${i + 1}`, 'db.tgt.target')
    );

    const result = await layoutGraph(nodes, edges);

    // 6 table nodes (5 sources + 1 target)
    expect(result.nodes).toHaveLength(MULTI_TABLE_COUNTS.FANIN_5.tableNodes);
    // 5 edges
    expect(result.edges).toHaveLength(MULTI_TABLE_COUNTS.FANIN_5.edges);

    // Verify all source tables present
    const tableIds = result.nodes.map((n) => n.id);
    for (let i = 1; i <= 5; i++) {
      expect(tableIds).toContain(`db.src${i}`);
    }
  });

  it('fan-in target has correct incoming edges', async () => {
    const nodes: LineageNode[] = [
      ...Array.from({ length: 5 }, (_, i) =>
        createColumnNode('db', `src${i + 1}`, `source_${i + 1}`)
      ),
      createColumnNode('db', 'tgt', 'target'),
    ];
    const edges = Array.from({ length: 5 }, (_, i) =>
      createEdge(`db.src${i + 1}.source_${i + 1}`, 'db.tgt.target')
    );

    const result = await layoutGraph(nodes, edges);

    // All edges should target tgt
    const edgesToTgt = result.edges.filter((e) => e.target === 'db.tgt');
    expect(edgesToTgt).toHaveLength(5);
  });
});

// ============================================================================
// NODE/EDGE COUNT VALIDATION TESTS
// ============================================================================

describe('CORRECT-VAL-06 & CORRECT-VAL-07: Node/Edge Counts', () => {
  it('preserves all nodes through layout', async () => {
    // Complex graph with 10 nodes in different tables
    const nodes = Array.from({ length: 10 }, (_, i) =>
      createColumnNode('db', `t${i}`, `col${i}`)
    );
    const edges: LineageEdge[] = [
      createEdge('db.t0.col0', 'db.t1.col1'),
      createEdge('db.t0.col0', 'db.t2.col2'),
      createEdge('db.t1.col1', 'db.t3.col3'),
      createEdge('db.t2.col2', 'db.t3.col3'),
      createEdge('db.t3.col3', 'db.t4.col4'),
      createEdge('db.t4.col4', 'db.t5.col5'),
      createEdge('db.t4.col4', 'db.t6.col6'),
      createEdge('db.t5.col5', 'db.t7.col7'),
      createEdge('db.t6.col6', 'db.t7.col7'),
      createEdge('db.t7.col7', 'db.t8.col8'),
      createEdge('db.t8.col8', 'db.t9.col9'),
    ];

    const result = await layoutGraph(nodes, edges);

    // All 10 nodes preserved (each in different table)
    expect(result.nodes).toHaveLength(10);
    // All 11 edges preserved
    expect(result.edges).toHaveLength(11);
  });

  it('groupByTable produces unique keys', () => {
    // Columns from 3 tables
    const nodes: LineageNode[] = [
      createColumnNode('db', 't1', 'a'),
      createColumnNode('db', 't1', 'b'),
      createColumnNode('db', 't2', 'c'),
      createColumnNode('db', 't3', 'd'),
      createColumnNode('db', 't3', 'e'),
      createColumnNode('db', 't3', 'f'),
    ];

    const groups = groupByTable(nodes);

    // 3 unique table groups
    expect(groups.size).toBe(3);
    expect(groups.get('db.t1')?.length).toBe(2);
    expect(groups.get('db.t2')?.length).toBe(1);
    expect(groups.get('db.t3')?.length).toBe(3);
  });

  it('no node loss in single-table pattern', async () => {
    const nodes: LineageNode[] = [
      createColumnNode('db', 'SINGLE', 'col_1'),
      createColumnNode('db', 'SINGLE', 'col_2'),
      createColumnNode('db', 'SINGLE', 'col_3'),
      createColumnNode('db', 'SINGLE', 'col_4'),
      createColumnNode('db', 'SINGLE', 'col_5'),
    ];
    const edges: LineageEdge[] = [
      createEdge('db.SINGLE.col_1', 'db.SINGLE.col_2'),
      createEdge('db.SINGLE.col_2', 'db.SINGLE.col_3'),
      createEdge('db.SINGLE.col_3', 'db.SINGLE.col_4'),
      createEdge('db.SINGLE.col_4', 'db.SINGLE.col_5'),
    ];

    const result = await layoutGraph(nodes, edges);

    // 1 table with 5 columns
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].data.columns).toHaveLength(5);
    // 4 edges
    expect(result.edges).toHaveLength(4);
  });

  it('no edge loss in multi-table pattern', async () => {
    // Create a complex pattern with 15 edges
    const nodes: LineageNode[] = [
      createColumnNode('db', 'src1', 'a'),
      createColumnNode('db', 'src2', 'b'),
      createColumnNode('db', 'src3', 'c'),
      createColumnNode('db', 'mid1', 'd'),
      createColumnNode('db', 'mid2', 'e'),
      createColumnNode('db', 'tgt1', 'f'),
      createColumnNode('db', 'tgt2', 'g'),
    ];
    const edges: LineageEdge[] = [
      // First layer to middle
      createEdge('db.src1.a', 'db.mid1.d'),
      createEdge('db.src1.a', 'db.mid2.e'),
      createEdge('db.src2.b', 'db.mid1.d'),
      createEdge('db.src2.b', 'db.mid2.e'),
      createEdge('db.src3.c', 'db.mid1.d'),
      createEdge('db.src3.c', 'db.mid2.e'),
      // Middle to target
      createEdge('db.mid1.d', 'db.tgt1.f'),
      createEdge('db.mid1.d', 'db.tgt2.g'),
      createEdge('db.mid2.e', 'db.tgt1.f'),
      createEdge('db.mid2.e', 'db.tgt2.g'),
    ];

    const result = await layoutGraph(nodes, edges);

    // 7 tables
    expect(result.nodes).toHaveLength(7);
    // All 10 edges preserved
    expect(result.edges).toHaveLength(10);
  });
});

// ============================================================================
// EDGE DATA PRESERVATION TESTS
// ============================================================================

describe('Edge Data Preservation', () => {
  it('preserves transformation type in edge data', async () => {
    const nodes: LineageNode[] = [
      createColumnNode('db', 't1', 'a'),
      createColumnNode('db', 't2', 'b'),
    ];
    const edges: LineageEdge[] = [
      createEdge('db.t1.a', 'db.t2.b', 'AGGREGATED'),
    ];

    const result = await layoutGraph(nodes, edges);

    expect(result.edges[0].data?.transformationType).toBe('AGGREGATED');
  });

  it('preserves confidence score in edge data', async () => {
    const nodes: LineageNode[] = [
      createColumnNode('db', 't1', 'a'),
      createColumnNode('db', 't2', 'b'),
    ];
    const edges: LineageEdge[] = [
      {
        id: 'e1',
        source: 'db.t1.a',
        target: 'db.t2.b',
        transformationType: 'DIRECT',
        confidenceScore: 0.85,
      },
    ];

    const result = await layoutGraph(nodes, edges);

    expect(result.edges[0].data?.confidenceScore).toBe(0.85);
  });

  it('edge handles reference correct columns', async () => {
    const nodes: LineageNode[] = [
      createColumnNode('db', 't1', 'col_source'),
      createColumnNode('db', 't2', 'col_target'),
    ];
    const edges: LineageEdge[] = [
      createEdge('db.t1.col_source', 'db.t2.col_target'),
    ];

    const result = await layoutGraph(nodes, edges);

    const edge = result.edges[0];
    expect(edge.sourceHandle).toContain('col_source');
    expect(edge.targetHandle).toContain('col_target');
  });
});

// ============================================================================
// COLUMN LINEAGE INDICATOR TESTS
// ============================================================================

describe('Column Lineage Indicators', () => {
  it('marks columns with upstream lineage', async () => {
    const nodes: LineageNode[] = [
      createColumnNode('db', 't1', 'source'),
      createColumnNode('db', 't1', 'target'),
    ];
    const edges: LineageEdge[] = [
      createEdge('db.t1.source', 'db.t1.target'),
    ];

    const result = await layoutGraph(nodes, edges);

    const columns = result.nodes[0].data.columns;
    const targetCol = columns.find(
      (c: { id: string }) => c.id === 'db.t1.target'
    );
    expect(targetCol?.hasUpstreamLineage).toBe(true);
  });

  it('marks columns with downstream lineage', async () => {
    const nodes: LineageNode[] = [
      createColumnNode('db', 't1', 'source'),
      createColumnNode('db', 't1', 'target'),
    ];
    const edges: LineageEdge[] = [
      createEdge('db.t1.source', 'db.t1.target'),
    ];

    const result = await layoutGraph(nodes, edges);

    const columns = result.nodes[0].data.columns;
    const sourceCol = columns.find(
      (c: { id: string }) => c.id === 'db.t1.source'
    );
    expect(sourceCol?.hasDownstreamLineage).toBe(true);
  });

  it('columns without lineage are not marked', async () => {
    const nodes: LineageNode[] = [
      createColumnNode('db', 't1', 'isolated'),
      createColumnNode('db', 't1', 'source'),
      createColumnNode('db', 't1', 'target'),
    ];
    const edges: LineageEdge[] = [
      createEdge('db.t1.source', 'db.t1.target'),
    ];

    const result = await layoutGraph(nodes, edges);

    const columns = result.nodes[0].data.columns;
    const isolatedCol = columns.find(
      (c: { id: string }) => c.id === 'db.t1.isolated'
    );
    expect(isolatedCol?.hasUpstreamLineage).toBe(false);
    expect(isolatedCol?.hasDownstreamLineage).toBe(false);
  });
});

// ============================================================================
// EMPTY AND EDGE CASE TESTS
// ============================================================================

describe('Empty and Edge Cases', () => {
  it('handles empty node array', async () => {
    const result = await layoutGraph([], []);

    expect(result.nodes).toHaveLength(0);
    expect(result.edges).toHaveLength(0);
  });

  it('handles nodes without edges', async () => {
    const nodes: LineageNode[] = [
      createColumnNode('db', 't1', 'a'),
      createColumnNode('db', 't2', 'b'),
      createColumnNode('db', 't3', 'c'),
    ];

    const result = await layoutGraph(nodes, []);

    expect(result.nodes).toHaveLength(3);
    expect(result.edges).toHaveLength(0);
  });

  it('handles single node', async () => {
    const nodes: LineageNode[] = [createColumnNode('db', 't1', 'solo')];

    const result = await layoutGraph(nodes, []);

    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].data.columns).toHaveLength(1);
  });

  it('handles self-referencing edge within same column', async () => {
    // Edge where source and target are the same column ID
    const nodes: LineageNode[] = [
      createColumnNode('db', 't1', 'recursive'),
    ];
    const edges: LineageEdge[] = [
      createEdge('db.t1.recursive', 'db.t1.recursive'),
    ];

    const result = await layoutGraph(nodes, edges);

    expect(result.nodes).toHaveLength(1);
    expect(result.edges).toHaveLength(1);
  });
});
