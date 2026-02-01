#!/usr/bin/env python3
"""
Insert CTE Edge Case Test Data (OpenLineage Schema)
Inserts lineage records for testing recursive CTE edge cases:
- Cycle detection
- Deep chains
- Wide fan-out
- Diamond patterns
- Inactive lineage filtering
"""

from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

import teradatasql

from db_config import CONFIG

# CTE test data inserts for OL_COLUMN_LINEAGE
CTE_TEST_INSERTS = [
    # Two-node cycle test data (A -> B -> A)
    # TC-EDGE-002: Verify cycle detection handles A -> B -> A pattern
    """
    INSERT INTO demo_user.OL_COLUMN_LINEAGE VALUES
    ('TEST_CYCLE_001', NULL, 'teradata://demo', 'demo_user.CYCLE_TEST', 'col_a',
     'teradata://demo', 'demo_user.CYCLE_TEST', 'col_b',
     'DIRECT', NULL, NULL, 'N', 1.00, TIMESTAMP '2024-01-15 10:00:00', 'Y')
    """,
    """
    INSERT INTO demo_user.OL_COLUMN_LINEAGE VALUES
    ('TEST_CYCLE_002', NULL, 'teradata://demo', 'demo_user.CYCLE_TEST', 'col_b',
     'teradata://demo', 'demo_user.CYCLE_TEST', 'col_a',
     'DIRECT', NULL, NULL, 'N', 1.00, TIMESTAMP '2024-01-15 10:00:00', 'Y')
    """,

    # Multi-node cycle test data (A -> B -> C -> D -> A)
    # TC-EDGE-003: Verify cycle detection handles multi-node cycle
    """
    INSERT INTO demo_user.OL_COLUMN_LINEAGE VALUES
    ('TEST_MCYCLE_001', NULL, 'teradata://demo', 'demo_user.MCYCLE_TEST', 'col_a',
     'teradata://demo', 'demo_user.MCYCLE_TEST', 'col_b',
     'DIRECT', NULL, NULL, 'N', 1.00, TIMESTAMP '2024-01-15 10:00:00', 'Y')
    """,
    """
    INSERT INTO demo_user.OL_COLUMN_LINEAGE VALUES
    ('TEST_MCYCLE_002', NULL, 'teradata://demo', 'demo_user.MCYCLE_TEST', 'col_b',
     'teradata://demo', 'demo_user.MCYCLE_TEST', 'col_c',
     'DIRECT', NULL, NULL, 'N', 1.00, TIMESTAMP '2024-01-15 10:00:00', 'Y')
    """,
    """
    INSERT INTO demo_user.OL_COLUMN_LINEAGE VALUES
    ('TEST_MCYCLE_003', NULL, 'teradata://demo', 'demo_user.MCYCLE_TEST', 'col_c',
     'teradata://demo', 'demo_user.MCYCLE_TEST', 'col_d',
     'DIRECT', NULL, NULL, 'N', 1.00, TIMESTAMP '2024-01-15 10:00:00', 'Y')
    """,
    """
    INSERT INTO demo_user.OL_COLUMN_LINEAGE VALUES
    ('TEST_MCYCLE_004', NULL, 'teradata://demo', 'demo_user.MCYCLE_TEST', 'col_d',
     'teradata://demo', 'demo_user.MCYCLE_TEST', 'col_a',
     'DIRECT', NULL, NULL, 'N', 1.00, TIMESTAMP '2024-01-15 10:00:00', 'Y')
    """,

    # Diamond pattern test (A -> B -> D, A -> C -> D)
    # TC-EDGE-004: Verify diamond pattern doesn't cause issues
    """
    INSERT INTO demo_user.OL_COLUMN_LINEAGE VALUES
    ('TEST_DIAMOND_001', NULL, 'teradata://demo', 'demo_user.DIAMOND', 'col_a',
     'teradata://demo', 'demo_user.DIAMOND', 'col_b',
     'DIRECT', NULL, NULL, 'N', 1.00, TIMESTAMP '2024-01-15 10:00:00', 'Y')
    """,
    """
    INSERT INTO demo_user.OL_COLUMN_LINEAGE VALUES
    ('TEST_DIAMOND_002', NULL, 'teradata://demo', 'demo_user.DIAMOND', 'col_a',
     'teradata://demo', 'demo_user.DIAMOND', 'col_c',
     'DIRECT', NULL, NULL, 'N', 1.00, TIMESTAMP '2024-01-15 10:00:00', 'Y')
    """,
    """
    INSERT INTO demo_user.OL_COLUMN_LINEAGE VALUES
    ('TEST_DIAMOND_003', NULL, 'teradata://demo', 'demo_user.DIAMOND', 'col_b',
     'teradata://demo', 'demo_user.DIAMOND', 'col_d',
     'DIRECT', NULL, NULL, 'N', 1.00, TIMESTAMP '2024-01-15 10:00:00', 'Y')
    """,
    """
    INSERT INTO demo_user.OL_COLUMN_LINEAGE VALUES
    ('TEST_DIAMOND_004', NULL, 'teradata://demo', 'demo_user.DIAMOND', 'col_c',
     'teradata://demo', 'demo_user.DIAMOND', 'col_d',
     'DIRECT', NULL, NULL, 'N', 1.00, TIMESTAMP '2024-01-15 10:00:00', 'Y')
    """,

    # Inactive lineage test
    # TC-CTE-005: Verify only active lineage records are traversed
    """
    INSERT INTO demo_user.OL_COLUMN_LINEAGE VALUES
    ('TEST_INACTIVE_001', NULL, 'teradata://demo', 'demo_user.INACTIVE_TEST', 'active_source',
     'teradata://demo', 'demo_user.INACTIVE_TEST', 'target',
     'DIRECT', NULL, NULL, 'N', 1.00, TIMESTAMP '2024-01-15 10:00:00', 'Y')
    """,
    """
    INSERT INTO demo_user.OL_COLUMN_LINEAGE VALUES
    ('TEST_INACTIVE_002', NULL, 'teradata://demo', 'demo_user.INACTIVE_TEST', 'inactive_source',
     'teradata://demo', 'demo_user.INACTIVE_TEST', 'target',
     'DIRECT', NULL, NULL, 'N', 1.00, TIMESTAMP '2024-01-15 10:00:00', 'N')
    """,

    # Multi-level upstream chain (A <- B <- C <- D <- E)
    # For TC-CTE-002 and TC-CTE-003: Multi-level and max depth tests
    """
    INSERT INTO demo_user.OL_COLUMN_LINEAGE VALUES
    ('TEST_CHAIN_001', NULL, 'teradata://demo', 'demo_user.CHAIN_TEST', 'col_e',
     'teradata://demo', 'demo_user.CHAIN_TEST', 'col_d',
     'DIRECT', NULL, NULL, 'N', 1.00, TIMESTAMP '2024-01-15 10:00:00', 'Y')
    """,
    """
    INSERT INTO demo_user.OL_COLUMN_LINEAGE VALUES
    ('TEST_CHAIN_002', NULL, 'teradata://demo', 'demo_user.CHAIN_TEST', 'col_d',
     'teradata://demo', 'demo_user.CHAIN_TEST', 'col_c',
     'DIRECT', NULL, NULL, 'N', 1.00, TIMESTAMP '2024-01-15 10:00:00', 'Y')
    """,
    """
    INSERT INTO demo_user.OL_COLUMN_LINEAGE VALUES
    ('TEST_CHAIN_003', NULL, 'teradata://demo', 'demo_user.CHAIN_TEST', 'col_c',
     'teradata://demo', 'demo_user.CHAIN_TEST', 'col_b',
     'DIRECT', NULL, NULL, 'N', 1.00, TIMESTAMP '2024-01-15 10:00:00', 'Y')
    """,
    """
    INSERT INTO demo_user.OL_COLUMN_LINEAGE VALUES
    ('TEST_CHAIN_004', NULL, 'teradata://demo', 'demo_user.CHAIN_TEST', 'col_b',
     'teradata://demo', 'demo_user.CHAIN_TEST', 'col_a',
     'DIRECT', NULL, NULL, 'N', 1.00, TIMESTAMP '2024-01-15 10:00:00', 'Y')
    """,

    # Multiple sources at same level (A <- B, A <- C, A <- D)
    # TC-CTE-004: Multiple sources at same level
    """
    INSERT INTO demo_user.OL_COLUMN_LINEAGE VALUES
    ('TEST_MULTISRC_001', NULL, 'teradata://demo', 'demo_user.MULTISRC_TEST', 'src_b',
     'teradata://demo', 'demo_user.MULTISRC_TEST', 'target_a',
     'DIRECT', NULL, NULL, 'N', 1.00, TIMESTAMP '2024-01-15 10:00:00', 'Y')
    """,
    """
    INSERT INTO demo_user.OL_COLUMN_LINEAGE VALUES
    ('TEST_MULTISRC_002', NULL, 'teradata://demo', 'demo_user.MULTISRC_TEST', 'src_c',
     'teradata://demo', 'demo_user.MULTISRC_TEST', 'target_a',
     'CALCULATION', NULL, NULL, 'N', 0.85, TIMESTAMP '2024-01-15 10:00:00', 'Y')
    """,
    """
    INSERT INTO demo_user.OL_COLUMN_LINEAGE VALUES
    ('TEST_MULTISRC_003', NULL, 'teradata://demo', 'demo_user.MULTISRC_TEST', 'src_d',
     'teradata://demo', 'demo_user.MULTISRC_TEST', 'target_a',
     'JOIN', NULL, NULL, 'N', 0.75, TIMESTAMP '2024-01-15 10:00:00', 'Y')
    """,

    # Fan-out test (single source -> multiple targets)
    # TC-CTE-008: Fan-out pattern
    """
    INSERT INTO demo_user.OL_COLUMN_LINEAGE VALUES
    ('TEST_FANOUT_001', NULL, 'teradata://demo', 'demo_user.FANOUT_TEST', 'source',
     'teradata://demo', 'demo_user.FANOUT_TEST', 'target_1',
     'DIRECT', NULL, NULL, 'N', 1.00, TIMESTAMP '2024-01-15 10:00:00', 'Y')
    """,
    """
    INSERT INTO demo_user.OL_COLUMN_LINEAGE VALUES
    ('TEST_FANOUT_002', NULL, 'teradata://demo', 'demo_user.FANOUT_TEST', 'source',
     'teradata://demo', 'demo_user.FANOUT_TEST', 'target_2',
     'DIRECT', NULL, NULL, 'N', 1.00, TIMESTAMP '2024-01-15 10:00:00', 'Y')
    """,
    """
    INSERT INTO demo_user.OL_COLUMN_LINEAGE VALUES
    ('TEST_FANOUT_003', NULL, 'teradata://demo', 'demo_user.FANOUT_TEST', 'source',
     'teradata://demo', 'demo_user.FANOUT_TEST', 'target_3',
     'DIRECT', NULL, NULL, 'N', 1.00, TIMESTAMP '2024-01-15 10:00:00', 'Y')
    """,
    """
    INSERT INTO demo_user.OL_COLUMN_LINEAGE VALUES
    ('TEST_FANOUT_004', NULL, 'teradata://demo', 'demo_user.FANOUT_TEST', 'source',
     'teradata://demo', 'demo_user.FANOUT_TEST', 'target_4',
     'DIRECT', NULL, NULL, 'N', 1.00, TIMESTAMP '2024-01-15 10:00:00', 'Y')
    """,
    # Second level fan-out (target_1 -> more targets)
    """
    INSERT INTO demo_user.OL_COLUMN_LINEAGE VALUES
    ('TEST_FANOUT_005', NULL, 'teradata://demo', 'demo_user.FANOUT_TEST', 'target_1',
     'teradata://demo', 'demo_user.FANOUT_TEST', 'target_1a',
     'DIRECT', NULL, NULL, 'N', 1.00, TIMESTAMP '2024-01-15 10:00:00', 'Y')
    """,
    """
    INSERT INTO demo_user.OL_COLUMN_LINEAGE VALUES
    ('TEST_FANOUT_006', NULL, 'teradata://demo', 'demo_user.FANOUT_TEST', 'target_1',
     'teradata://demo', 'demo_user.FANOUT_TEST', 'target_1b',
     'DIRECT', NULL, NULL, 'N', 1.00, TIMESTAMP '2024-01-15 10:00:00', 'Y')
    """,

    # Transformation types test
    # TC-CTE-009: Verify transformation_type is correctly returned
    """
    INSERT INTO demo_user.OL_COLUMN_LINEAGE VALUES
    ('TEST_TRANS_001', NULL, 'teradata://demo', 'demo_user.TRANS_TEST', 'src1',
     'teradata://demo', 'demo_user.TRANS_TEST', 'tgt1',
     'AGGREGATION', NULL, NULL, 'N', 0.95, TIMESTAMP '2024-01-15 10:00:00', 'Y')
    """,
    """
    INSERT INTO demo_user.OL_COLUMN_LINEAGE VALUES
    ('TEST_TRANS_002', NULL, 'teradata://demo', 'demo_user.TRANS_TEST', 'src2',
     'teradata://demo', 'demo_user.TRANS_TEST', 'tgt2',
     'FILTER', NULL, NULL, 'N', 0.80, TIMESTAMP '2024-01-15 10:00:00', 'Y')
    """,

    # =========================================================================
    # CORRECT-DATA-01: 5-node cycle test (A -> B -> C -> D -> E -> A)
    # =========================================================================
    """
    INSERT INTO demo_user.OL_COLUMN_LINEAGE VALUES
    ('TEST_CYCLE5_001', NULL, 'teradata://demo', 'demo_user.CYCLE5_TEST', 'col_a',
     'teradata://demo', 'demo_user.CYCLE5_TEST', 'col_b',
     'DIRECT', NULL, NULL, 'N', 1.00, TIMESTAMP '2024-01-15 10:00:00', 'Y')
    """,
    """
    INSERT INTO demo_user.OL_COLUMN_LINEAGE VALUES
    ('TEST_CYCLE5_002', NULL, 'teradata://demo', 'demo_user.CYCLE5_TEST', 'col_b',
     'teradata://demo', 'demo_user.CYCLE5_TEST', 'col_c',
     'DIRECT', NULL, NULL, 'N', 1.00, TIMESTAMP '2024-01-15 10:00:00', 'Y')
    """,
    """
    INSERT INTO demo_user.OL_COLUMN_LINEAGE VALUES
    ('TEST_CYCLE5_003', NULL, 'teradata://demo', 'demo_user.CYCLE5_TEST', 'col_c',
     'teradata://demo', 'demo_user.CYCLE5_TEST', 'col_d',
     'DIRECT', NULL, NULL, 'N', 1.00, TIMESTAMP '2024-01-15 10:00:00', 'Y')
    """,
    """
    INSERT INTO demo_user.OL_COLUMN_LINEAGE VALUES
    ('TEST_CYCLE5_004', NULL, 'teradata://demo', 'demo_user.CYCLE5_TEST', 'col_d',
     'teradata://demo', 'demo_user.CYCLE5_TEST', 'col_e',
     'DIRECT', NULL, NULL, 'N', 1.00, TIMESTAMP '2024-01-15 10:00:00', 'Y')
    """,
    """
    INSERT INTO demo_user.OL_COLUMN_LINEAGE VALUES
    ('TEST_CYCLE5_005', NULL, 'teradata://demo', 'demo_user.CYCLE5_TEST', 'col_e',
     'teradata://demo', 'demo_user.CYCLE5_TEST', 'col_a',
     'DIRECT', NULL, NULL, 'N', 1.00, TIMESTAMP '2024-01-15 10:00:00', 'Y')
    """,

    # =========================================================================
    # CORRECT-DATA-02: Nested diamond (A -> B -> D, A -> C -> D, D -> E -> G, D -> F -> G)
    # =========================================================================
    """
    INSERT INTO demo_user.OL_COLUMN_LINEAGE VALUES
    ('TEST_NESTED_DIAMOND_001', NULL, 'teradata://demo', 'demo_user.NESTED_DIAMOND', 'col_a',
     'teradata://demo', 'demo_user.NESTED_DIAMOND', 'col_b',
     'DIRECT', NULL, NULL, 'N', 1.00, TIMESTAMP '2024-01-15 10:00:00', 'Y')
    """,
    """
    INSERT INTO demo_user.OL_COLUMN_LINEAGE VALUES
    ('TEST_NESTED_DIAMOND_002', NULL, 'teradata://demo', 'demo_user.NESTED_DIAMOND', 'col_a',
     'teradata://demo', 'demo_user.NESTED_DIAMOND', 'col_c',
     'DIRECT', NULL, NULL, 'N', 1.00, TIMESTAMP '2024-01-15 10:00:00', 'Y')
    """,
    """
    INSERT INTO demo_user.OL_COLUMN_LINEAGE VALUES
    ('TEST_NESTED_DIAMOND_003', NULL, 'teradata://demo', 'demo_user.NESTED_DIAMOND', 'col_b',
     'teradata://demo', 'demo_user.NESTED_DIAMOND', 'col_d',
     'DIRECT', NULL, NULL, 'N', 1.00, TIMESTAMP '2024-01-15 10:00:00', 'Y')
    """,
    """
    INSERT INTO demo_user.OL_COLUMN_LINEAGE VALUES
    ('TEST_NESTED_DIAMOND_004', NULL, 'teradata://demo', 'demo_user.NESTED_DIAMOND', 'col_c',
     'teradata://demo', 'demo_user.NESTED_DIAMOND', 'col_d',
     'DIRECT', NULL, NULL, 'N', 1.00, TIMESTAMP '2024-01-15 10:00:00', 'Y')
    """,
    """
    INSERT INTO demo_user.OL_COLUMN_LINEAGE VALUES
    ('TEST_NESTED_DIAMOND_005', NULL, 'teradata://demo', 'demo_user.NESTED_DIAMOND', 'col_d',
     'teradata://demo', 'demo_user.NESTED_DIAMOND', 'col_e',
     'DIRECT', NULL, NULL, 'N', 1.00, TIMESTAMP '2024-01-15 10:00:00', 'Y')
    """,
    """
    INSERT INTO demo_user.OL_COLUMN_LINEAGE VALUES
    ('TEST_NESTED_DIAMOND_006', NULL, 'teradata://demo', 'demo_user.NESTED_DIAMOND', 'col_d',
     'teradata://demo', 'demo_user.NESTED_DIAMOND', 'col_f',
     'DIRECT', NULL, NULL, 'N', 1.00, TIMESTAMP '2024-01-15 10:00:00', 'Y')
    """,
    """
    INSERT INTO demo_user.OL_COLUMN_LINEAGE VALUES
    ('TEST_NESTED_DIAMOND_007', NULL, 'teradata://demo', 'demo_user.NESTED_DIAMOND', 'col_e',
     'teradata://demo', 'demo_user.NESTED_DIAMOND', 'col_g',
     'DIRECT', NULL, NULL, 'N', 1.00, TIMESTAMP '2024-01-15 10:00:00', 'Y')
    """,
    """
    INSERT INTO demo_user.OL_COLUMN_LINEAGE VALUES
    ('TEST_NESTED_DIAMOND_008', NULL, 'teradata://demo', 'demo_user.NESTED_DIAMOND', 'col_f',
     'teradata://demo', 'demo_user.NESTED_DIAMOND', 'col_g',
     'DIRECT', NULL, NULL, 'N', 1.00, TIMESTAMP '2024-01-15 10:00:00', 'Y')
    """,

    # =========================================================================
    # CORRECT-DATA-02: Wide diamond (A -> B, A -> C, A -> D, A -> E, B/C/D/E -> F)
    # =========================================================================
    """
    INSERT INTO demo_user.OL_COLUMN_LINEAGE VALUES
    ('TEST_WIDE_DIAMOND_001', NULL, 'teradata://demo', 'demo_user.WIDE_DIAMOND', 'col_a',
     'teradata://demo', 'demo_user.WIDE_DIAMOND', 'col_b',
     'DIRECT', NULL, NULL, 'N', 1.00, TIMESTAMP '2024-01-15 10:00:00', 'Y')
    """,
    """
    INSERT INTO demo_user.OL_COLUMN_LINEAGE VALUES
    ('TEST_WIDE_DIAMOND_002', NULL, 'teradata://demo', 'demo_user.WIDE_DIAMOND', 'col_a',
     'teradata://demo', 'demo_user.WIDE_DIAMOND', 'col_c',
     'DIRECT', NULL, NULL, 'N', 1.00, TIMESTAMP '2024-01-15 10:00:00', 'Y')
    """,
    """
    INSERT INTO demo_user.OL_COLUMN_LINEAGE VALUES
    ('TEST_WIDE_DIAMOND_003', NULL, 'teradata://demo', 'demo_user.WIDE_DIAMOND', 'col_a',
     'teradata://demo', 'demo_user.WIDE_DIAMOND', 'col_d',
     'DIRECT', NULL, NULL, 'N', 1.00, TIMESTAMP '2024-01-15 10:00:00', 'Y')
    """,
    """
    INSERT INTO demo_user.OL_COLUMN_LINEAGE VALUES
    ('TEST_WIDE_DIAMOND_004', NULL, 'teradata://demo', 'demo_user.WIDE_DIAMOND', 'col_a',
     'teradata://demo', 'demo_user.WIDE_DIAMOND', 'col_e',
     'DIRECT', NULL, NULL, 'N', 1.00, TIMESTAMP '2024-01-15 10:00:00', 'Y')
    """,
    """
    INSERT INTO demo_user.OL_COLUMN_LINEAGE VALUES
    ('TEST_WIDE_DIAMOND_005', NULL, 'teradata://demo', 'demo_user.WIDE_DIAMOND', 'col_b',
     'teradata://demo', 'demo_user.WIDE_DIAMOND', 'col_f',
     'DIRECT', NULL, NULL, 'N', 1.00, TIMESTAMP '2024-01-15 10:00:00', 'Y')
    """,
    """
    INSERT INTO demo_user.OL_COLUMN_LINEAGE VALUES
    ('TEST_WIDE_DIAMOND_006', NULL, 'teradata://demo', 'demo_user.WIDE_DIAMOND', 'col_c',
     'teradata://demo', 'demo_user.WIDE_DIAMOND', 'col_f',
     'DIRECT', NULL, NULL, 'N', 1.00, TIMESTAMP '2024-01-15 10:00:00', 'Y')
    """,
    """
    INSERT INTO demo_user.OL_COLUMN_LINEAGE VALUES
    ('TEST_WIDE_DIAMOND_007', NULL, 'teradata://demo', 'demo_user.WIDE_DIAMOND', 'col_d',
     'teradata://demo', 'demo_user.WIDE_DIAMOND', 'col_f',
     'DIRECT', NULL, NULL, 'N', 1.00, TIMESTAMP '2024-01-15 10:00:00', 'Y')
    """,
    """
    INSERT INTO demo_user.OL_COLUMN_LINEAGE VALUES
    ('TEST_WIDE_DIAMOND_008', NULL, 'teradata://demo', 'demo_user.WIDE_DIAMOND', 'col_e',
     'teradata://demo', 'demo_user.WIDE_DIAMOND', 'col_f',
     'DIRECT', NULL, NULL, 'N', 1.00, TIMESTAMP '2024-01-15 10:00:00', 'Y')
    """,

    # =========================================================================
    # CORRECT-DATA-03: Fan-out 5 (source -> target_1..target_5)
    # =========================================================================
    """
    INSERT INTO demo_user.OL_COLUMN_LINEAGE VALUES
    ('TEST_FANOUT5_001', NULL, 'teradata://demo', 'demo_user.FANOUT5_TEST', 'source',
     'teradata://demo', 'demo_user.FANOUT5_TEST', 'target_1',
     'DIRECT', NULL, NULL, 'N', 1.00, TIMESTAMP '2024-01-15 10:00:00', 'Y')
    """,
    """
    INSERT INTO demo_user.OL_COLUMN_LINEAGE VALUES
    ('TEST_FANOUT5_002', NULL, 'teradata://demo', 'demo_user.FANOUT5_TEST', 'source',
     'teradata://demo', 'demo_user.FANOUT5_TEST', 'target_2',
     'DIRECT', NULL, NULL, 'N', 1.00, TIMESTAMP '2024-01-15 10:00:00', 'Y')
    """,
    """
    INSERT INTO demo_user.OL_COLUMN_LINEAGE VALUES
    ('TEST_FANOUT5_003', NULL, 'teradata://demo', 'demo_user.FANOUT5_TEST', 'source',
     'teradata://demo', 'demo_user.FANOUT5_TEST', 'target_3',
     'DIRECT', NULL, NULL, 'N', 1.00, TIMESTAMP '2024-01-15 10:00:00', 'Y')
    """,
    """
    INSERT INTO demo_user.OL_COLUMN_LINEAGE VALUES
    ('TEST_FANOUT5_004', NULL, 'teradata://demo', 'demo_user.FANOUT5_TEST', 'source',
     'teradata://demo', 'demo_user.FANOUT5_TEST', 'target_4',
     'DIRECT', NULL, NULL, 'N', 1.00, TIMESTAMP '2024-01-15 10:00:00', 'Y')
    """,
    """
    INSERT INTO demo_user.OL_COLUMN_LINEAGE VALUES
    ('TEST_FANOUT5_005', NULL, 'teradata://demo', 'demo_user.FANOUT5_TEST', 'source',
     'teradata://demo', 'demo_user.FANOUT5_TEST', 'target_5',
     'DIRECT', NULL, NULL, 'N', 1.00, TIMESTAMP '2024-01-15 10:00:00', 'Y')
    """,

    # =========================================================================
    # CORRECT-DATA-03: Fan-out 10 (source -> target_01..target_10)
    # =========================================================================
    """
    INSERT INTO demo_user.OL_COLUMN_LINEAGE VALUES
    ('TEST_FANOUT10_001', NULL, 'teradata://demo', 'demo_user.FANOUT10_TEST', 'source',
     'teradata://demo', 'demo_user.FANOUT10_TEST', 'target_01',
     'DIRECT', NULL, NULL, 'N', 1.00, TIMESTAMP '2024-01-15 10:00:00', 'Y')
    """,
    """
    INSERT INTO demo_user.OL_COLUMN_LINEAGE VALUES
    ('TEST_FANOUT10_002', NULL, 'teradata://demo', 'demo_user.FANOUT10_TEST', 'source',
     'teradata://demo', 'demo_user.FANOUT10_TEST', 'target_02',
     'DIRECT', NULL, NULL, 'N', 1.00, TIMESTAMP '2024-01-15 10:00:00', 'Y')
    """,
    """
    INSERT INTO demo_user.OL_COLUMN_LINEAGE VALUES
    ('TEST_FANOUT10_003', NULL, 'teradata://demo', 'demo_user.FANOUT10_TEST', 'source',
     'teradata://demo', 'demo_user.FANOUT10_TEST', 'target_03',
     'DIRECT', NULL, NULL, 'N', 1.00, TIMESTAMP '2024-01-15 10:00:00', 'Y')
    """,
    """
    INSERT INTO demo_user.OL_COLUMN_LINEAGE VALUES
    ('TEST_FANOUT10_004', NULL, 'teradata://demo', 'demo_user.FANOUT10_TEST', 'source',
     'teradata://demo', 'demo_user.FANOUT10_TEST', 'target_04',
     'DIRECT', NULL, NULL, 'N', 1.00, TIMESTAMP '2024-01-15 10:00:00', 'Y')
    """,
    """
    INSERT INTO demo_user.OL_COLUMN_LINEAGE VALUES
    ('TEST_FANOUT10_005', NULL, 'teradata://demo', 'demo_user.FANOUT10_TEST', 'source',
     'teradata://demo', 'demo_user.FANOUT10_TEST', 'target_05',
     'DIRECT', NULL, NULL, 'N', 1.00, TIMESTAMP '2024-01-15 10:00:00', 'Y')
    """,
    """
    INSERT INTO demo_user.OL_COLUMN_LINEAGE VALUES
    ('TEST_FANOUT10_006', NULL, 'teradata://demo', 'demo_user.FANOUT10_TEST', 'source',
     'teradata://demo', 'demo_user.FANOUT10_TEST', 'target_06',
     'DIRECT', NULL, NULL, 'N', 1.00, TIMESTAMP '2024-01-15 10:00:00', 'Y')
    """,
    """
    INSERT INTO demo_user.OL_COLUMN_LINEAGE VALUES
    ('TEST_FANOUT10_007', NULL, 'teradata://demo', 'demo_user.FANOUT10_TEST', 'source',
     'teradata://demo', 'demo_user.FANOUT10_TEST', 'target_07',
     'DIRECT', NULL, NULL, 'N', 1.00, TIMESTAMP '2024-01-15 10:00:00', 'Y')
    """,
    """
    INSERT INTO demo_user.OL_COLUMN_LINEAGE VALUES
    ('TEST_FANOUT10_008', NULL, 'teradata://demo', 'demo_user.FANOUT10_TEST', 'source',
     'teradata://demo', 'demo_user.FANOUT10_TEST', 'target_08',
     'DIRECT', NULL, NULL, 'N', 1.00, TIMESTAMP '2024-01-15 10:00:00', 'Y')
    """,
    """
    INSERT INTO demo_user.OL_COLUMN_LINEAGE VALUES
    ('TEST_FANOUT10_009', NULL, 'teradata://demo', 'demo_user.FANOUT10_TEST', 'source',
     'teradata://demo', 'demo_user.FANOUT10_TEST', 'target_09',
     'DIRECT', NULL, NULL, 'N', 1.00, TIMESTAMP '2024-01-15 10:00:00', 'Y')
    """,
    """
    INSERT INTO demo_user.OL_COLUMN_LINEAGE VALUES
    ('TEST_FANOUT10_010', NULL, 'teradata://demo', 'demo_user.FANOUT10_TEST', 'source',
     'teradata://demo', 'demo_user.FANOUT10_TEST', 'target_10',
     'DIRECT', NULL, NULL, 'N', 1.00, TIMESTAMP '2024-01-15 10:00:00', 'Y')
    """,

    # =========================================================================
    # CORRECT-DATA-04: Fan-in 5 (src_1..src_5 -> target)
    # =========================================================================
    """
    INSERT INTO demo_user.OL_COLUMN_LINEAGE VALUES
    ('TEST_FANIN5_001', NULL, 'teradata://demo', 'demo_user.FANIN5_TEST', 'src_1',
     'teradata://demo', 'demo_user.FANIN5_TEST', 'target',
     'DIRECT', NULL, NULL, 'N', 1.00, TIMESTAMP '2024-01-15 10:00:00', 'Y')
    """,
    """
    INSERT INTO demo_user.OL_COLUMN_LINEAGE VALUES
    ('TEST_FANIN5_002', NULL, 'teradata://demo', 'demo_user.FANIN5_TEST', 'src_2',
     'teradata://demo', 'demo_user.FANIN5_TEST', 'target',
     'DIRECT', NULL, NULL, 'N', 1.00, TIMESTAMP '2024-01-15 10:00:00', 'Y')
    """,
    """
    INSERT INTO demo_user.OL_COLUMN_LINEAGE VALUES
    ('TEST_FANIN5_003', NULL, 'teradata://demo', 'demo_user.FANIN5_TEST', 'src_3',
     'teradata://demo', 'demo_user.FANIN5_TEST', 'target',
     'DIRECT', NULL, NULL, 'N', 1.00, TIMESTAMP '2024-01-15 10:00:00', 'Y')
    """,
    """
    INSERT INTO demo_user.OL_COLUMN_LINEAGE VALUES
    ('TEST_FANIN5_004', NULL, 'teradata://demo', 'demo_user.FANIN5_TEST', 'src_4',
     'teradata://demo', 'demo_user.FANIN5_TEST', 'target',
     'DIRECT', NULL, NULL, 'N', 1.00, TIMESTAMP '2024-01-15 10:00:00', 'Y')
    """,
    """
    INSERT INTO demo_user.OL_COLUMN_LINEAGE VALUES
    ('TEST_FANIN5_005', NULL, 'teradata://demo', 'demo_user.FANIN5_TEST', 'src_5',
     'teradata://demo', 'demo_user.FANIN5_TEST', 'target',
     'DIRECT', NULL, NULL, 'N', 1.00, TIMESTAMP '2024-01-15 10:00:00', 'Y')
    """,

    # =========================================================================
    # CORRECT-DATA-04: Fan-in 10 (src_01..src_10 -> target)
    # =========================================================================
    """
    INSERT INTO demo_user.OL_COLUMN_LINEAGE VALUES
    ('TEST_FANIN10_001', NULL, 'teradata://demo', 'demo_user.FANIN10_TEST', 'src_01',
     'teradata://demo', 'demo_user.FANIN10_TEST', 'target',
     'DIRECT', NULL, NULL, 'N', 1.00, TIMESTAMP '2024-01-15 10:00:00', 'Y')
    """,
    """
    INSERT INTO demo_user.OL_COLUMN_LINEAGE VALUES
    ('TEST_FANIN10_002', NULL, 'teradata://demo', 'demo_user.FANIN10_TEST', 'src_02',
     'teradata://demo', 'demo_user.FANIN10_TEST', 'target',
     'DIRECT', NULL, NULL, 'N', 1.00, TIMESTAMP '2024-01-15 10:00:00', 'Y')
    """,
    """
    INSERT INTO demo_user.OL_COLUMN_LINEAGE VALUES
    ('TEST_FANIN10_003', NULL, 'teradata://demo', 'demo_user.FANIN10_TEST', 'src_03',
     'teradata://demo', 'demo_user.FANIN10_TEST', 'target',
     'DIRECT', NULL, NULL, 'N', 1.00, TIMESTAMP '2024-01-15 10:00:00', 'Y')
    """,
    """
    INSERT INTO demo_user.OL_COLUMN_LINEAGE VALUES
    ('TEST_FANIN10_004', NULL, 'teradata://demo', 'demo_user.FANIN10_TEST', 'src_04',
     'teradata://demo', 'demo_user.FANIN10_TEST', 'target',
     'DIRECT', NULL, NULL, 'N', 1.00, TIMESTAMP '2024-01-15 10:00:00', 'Y')
    """,
    """
    INSERT INTO demo_user.OL_COLUMN_LINEAGE VALUES
    ('TEST_FANIN10_005', NULL, 'teradata://demo', 'demo_user.FANIN10_TEST', 'src_05',
     'teradata://demo', 'demo_user.FANIN10_TEST', 'target',
     'DIRECT', NULL, NULL, 'N', 1.00, TIMESTAMP '2024-01-15 10:00:00', 'Y')
    """,
    """
    INSERT INTO demo_user.OL_COLUMN_LINEAGE VALUES
    ('TEST_FANIN10_006', NULL, 'teradata://demo', 'demo_user.FANIN10_TEST', 'src_06',
     'teradata://demo', 'demo_user.FANIN10_TEST', 'target',
     'DIRECT', NULL, NULL, 'N', 1.00, TIMESTAMP '2024-01-15 10:00:00', 'Y')
    """,
    """
    INSERT INTO demo_user.OL_COLUMN_LINEAGE VALUES
    ('TEST_FANIN10_007', NULL, 'teradata://demo', 'demo_user.FANIN10_TEST', 'src_07',
     'teradata://demo', 'demo_user.FANIN10_TEST', 'target',
     'DIRECT', NULL, NULL, 'N', 1.00, TIMESTAMP '2024-01-15 10:00:00', 'Y')
    """,
    """
    INSERT INTO demo_user.OL_COLUMN_LINEAGE VALUES
    ('TEST_FANIN10_008', NULL, 'teradata://demo', 'demo_user.FANIN10_TEST', 'src_08',
     'teradata://demo', 'demo_user.FANIN10_TEST', 'target',
     'DIRECT', NULL, NULL, 'N', 1.00, TIMESTAMP '2024-01-15 10:00:00', 'Y')
    """,
    """
    INSERT INTO demo_user.OL_COLUMN_LINEAGE VALUES
    ('TEST_FANIN10_009', NULL, 'teradata://demo', 'demo_user.FANIN10_TEST', 'src_09',
     'teradata://demo', 'demo_user.FANIN10_TEST', 'target',
     'DIRECT', NULL, NULL, 'N', 1.00, TIMESTAMP '2024-01-15 10:00:00', 'Y')
    """,
    """
    INSERT INTO demo_user.OL_COLUMN_LINEAGE VALUES
    ('TEST_FANIN10_010', NULL, 'teradata://demo', 'demo_user.FANIN10_TEST', 'src_10',
     'teradata://demo', 'demo_user.FANIN10_TEST', 'target',
     'DIRECT', NULL, NULL, 'N', 1.00, TIMESTAMP '2024-01-15 10:00:00', 'Y')
    """,

    # =========================================================================
    # CORRECT-DATA-05: Combined cycle+diamond
    # (A -> B -> A cycle) + (A -> C -> D, A -> D diamond converging)
    # =========================================================================
    """
    INSERT INTO demo_user.OL_COLUMN_LINEAGE VALUES
    ('TEST_COMBINED_CD_001', NULL, 'teradata://demo', 'demo_user.COMBINED_CYCLE_DIAMOND', 'col_a',
     'teradata://demo', 'demo_user.COMBINED_CYCLE_DIAMOND', 'col_b',
     'DIRECT', NULL, NULL, 'N', 1.00, TIMESTAMP '2024-01-15 10:00:00', 'Y')
    """,
    """
    INSERT INTO demo_user.OL_COLUMN_LINEAGE VALUES
    ('TEST_COMBINED_CD_002', NULL, 'teradata://demo', 'demo_user.COMBINED_CYCLE_DIAMOND', 'col_b',
     'teradata://demo', 'demo_user.COMBINED_CYCLE_DIAMOND', 'col_a',
     'DIRECT', NULL, NULL, 'N', 1.00, TIMESTAMP '2024-01-15 10:00:00', 'Y')
    """,
    """
    INSERT INTO demo_user.OL_COLUMN_LINEAGE VALUES
    ('TEST_COMBINED_CD_003', NULL, 'teradata://demo', 'demo_user.COMBINED_CYCLE_DIAMOND', 'col_a',
     'teradata://demo', 'demo_user.COMBINED_CYCLE_DIAMOND', 'col_c',
     'DIRECT', NULL, NULL, 'N', 1.00, TIMESTAMP '2024-01-15 10:00:00', 'Y')
    """,
    """
    INSERT INTO demo_user.OL_COLUMN_LINEAGE VALUES
    ('TEST_COMBINED_CD_004', NULL, 'teradata://demo', 'demo_user.COMBINED_CYCLE_DIAMOND', 'col_c',
     'teradata://demo', 'demo_user.COMBINED_CYCLE_DIAMOND', 'col_d',
     'DIRECT', NULL, NULL, 'N', 1.00, TIMESTAMP '2024-01-15 10:00:00', 'Y')
    """,
    """
    INSERT INTO demo_user.OL_COLUMN_LINEAGE VALUES
    ('TEST_COMBINED_CD_005', NULL, 'teradata://demo', 'demo_user.COMBINED_CYCLE_DIAMOND', 'col_a',
     'teradata://demo', 'demo_user.COMBINED_CYCLE_DIAMOND', 'col_d',
     'DIRECT', NULL, NULL, 'N', 1.00, TIMESTAMP '2024-01-15 10:00:00', 'Y')
    """,

    # =========================================================================
    # CORRECT-DATA-05: Combined fan-out+fan-in
    # (A -> B,C,D fan-out) + (B,C,D -> E fan-in)
    # =========================================================================
    """
    INSERT INTO demo_user.OL_COLUMN_LINEAGE VALUES
    ('TEST_COMBINED_FAN_001', NULL, 'teradata://demo', 'demo_user.COMBINED_FAN', 'col_a',
     'teradata://demo', 'demo_user.COMBINED_FAN', 'col_b',
     'DIRECT', NULL, NULL, 'N', 1.00, TIMESTAMP '2024-01-15 10:00:00', 'Y')
    """,
    """
    INSERT INTO demo_user.OL_COLUMN_LINEAGE VALUES
    ('TEST_COMBINED_FAN_002', NULL, 'teradata://demo', 'demo_user.COMBINED_FAN', 'col_a',
     'teradata://demo', 'demo_user.COMBINED_FAN', 'col_c',
     'DIRECT', NULL, NULL, 'N', 1.00, TIMESTAMP '2024-01-15 10:00:00', 'Y')
    """,
    """
    INSERT INTO demo_user.OL_COLUMN_LINEAGE VALUES
    ('TEST_COMBINED_FAN_003', NULL, 'teradata://demo', 'demo_user.COMBINED_FAN', 'col_a',
     'teradata://demo', 'demo_user.COMBINED_FAN', 'col_d',
     'DIRECT', NULL, NULL, 'N', 1.00, TIMESTAMP '2024-01-15 10:00:00', 'Y')
    """,
    """
    INSERT INTO demo_user.OL_COLUMN_LINEAGE VALUES
    ('TEST_COMBINED_FAN_004', NULL, 'teradata://demo', 'demo_user.COMBINED_FAN', 'col_b',
     'teradata://demo', 'demo_user.COMBINED_FAN', 'col_e',
     'DIRECT', NULL, NULL, 'N', 1.00, TIMESTAMP '2024-01-15 10:00:00', 'Y')
    """,
    """
    INSERT INTO demo_user.OL_COLUMN_LINEAGE VALUES
    ('TEST_COMBINED_FAN_005', NULL, 'teradata://demo', 'demo_user.COMBINED_FAN', 'col_c',
     'teradata://demo', 'demo_user.COMBINED_FAN', 'col_e',
     'DIRECT', NULL, NULL, 'N', 1.00, TIMESTAMP '2024-01-15 10:00:00', 'Y')
    """,
    """
    INSERT INTO demo_user.OL_COLUMN_LINEAGE VALUES
    ('TEST_COMBINED_FAN_006', NULL, 'teradata://demo', 'demo_user.COMBINED_FAN', 'col_d',
     'teradata://demo', 'demo_user.COMBINED_FAN', 'col_e',
     'DIRECT', NULL, NULL, 'N', 1.00, TIMESTAMP '2024-01-15 10:00:00', 'Y')
    """,
]


def main():
    print("=" * 60)
    print("Insert CTE Edge Case Test Data (OpenLineage Schema)")
    print("=" * 60)

    # Connect
    print(f"\nConnecting to {CONFIG['host']}...")
    try:
        conn = teradatasql.connect(**CONFIG)
        cursor = conn.cursor()
        print("Connected successfully!")
    except Exception as e:
        print(f"ERROR: Failed to connect: {e}")
        sys.exit(1)

    # Remove existing test data
    print("\n--- Removing existing TEST_* lineage records ---")
    try:
        cursor.execute("DELETE FROM demo_user.OL_COLUMN_LINEAGE WHERE lineage_id LIKE 'TEST_%'")
        print("  Cleared existing TEST_* records")
    except Exception as e:
        print(f"  Warning: {e}")

    # Insert CTE test data
    print("\n--- Inserting CTE edge case test data ---")
    success_count = 0
    for i, insert_sql in enumerate(CTE_TEST_INSERTS, 1):
        try:
            cursor.execute(insert_sql)
            success_count += 1
        except Exception as e:
            print(f"  Insert {i} FAILED: {e}")

    print(f"  Inserted {success_count}/{len(CTE_TEST_INSERTS)} CTE test records")

    # Verify test data
    print("\n--- Verifying CTE test data ---")
    cursor.execute("SELECT COUNT(*) FROM demo_user.OL_COLUMN_LINEAGE WHERE lineage_id LIKE 'TEST_%'")
    count = cursor.fetchone()[0]
    print(f"  Total TEST_* lineage records: {count}")

    # Show breakdown by test type
    cursor.execute("""
        SELECT
            CASE
                WHEN lineage_id LIKE 'TEST_CYCLE5%' THEN '5-node cycle'
                WHEN lineage_id LIKE 'TEST_CYCLE%' THEN '2-node cycle'
                WHEN lineage_id LIKE 'TEST_MCYCLE%' THEN '4-node cycle'
                WHEN lineage_id LIKE 'TEST_NESTED_DIAMOND%' THEN 'Nested diamond'
                WHEN lineage_id LIKE 'TEST_WIDE_DIAMOND%' THEN 'Wide diamond'
                WHEN lineage_id LIKE 'TEST_DIAMOND%' THEN 'Simple diamond'
                WHEN lineage_id LIKE 'TEST_INACTIVE%' THEN 'Inactive test'
                WHEN lineage_id LIKE 'TEST_CHAIN%' THEN 'Chain test'
                WHEN lineage_id LIKE 'TEST_MULTISRC%' THEN 'Multi-source test'
                WHEN lineage_id LIKE 'TEST_FANOUT5%' THEN 'Fan-out 5'
                WHEN lineage_id LIKE 'TEST_FANOUT10%' THEN 'Fan-out 10'
                WHEN lineage_id LIKE 'TEST_FANOUT%' THEN 'Fan-out test'
                WHEN lineage_id LIKE 'TEST_FANIN5%' THEN 'Fan-in 5'
                WHEN lineage_id LIKE 'TEST_FANIN10%' THEN 'Fan-in 10'
                WHEN lineage_id LIKE 'TEST_COMBINED_CD%' THEN 'Cycle+Diamond combined'
                WHEN lineage_id LIKE 'TEST_COMBINED_FAN%' THEN 'Fan-out+Fan-in combined'
                WHEN lineage_id LIKE 'TEST_TRANS%' THEN 'Transform types'
                ELSE 'Other'
            END AS test_type,
            COUNT(*) AS record_count
        FROM demo_user.OL_COLUMN_LINEAGE
        WHERE lineage_id LIKE 'TEST_%'
        GROUP BY 1
        ORDER BY 1
    """)
    print("  Breakdown by test type:")
    for row in cursor.fetchall():
        print(f"    - {row[0]}: {row[1]} records")

    cursor.close()
    conn.close()

    print("\n" + "=" * 60)
    print("CTE test data insertion completed!")
    print("=" * 60)

    return 0


if __name__ == "__main__":
    sys.exit(main())
