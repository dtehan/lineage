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

import teradatasql
import sys

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
                WHEN lineage_id LIKE 'TEST_CYCLE%' THEN 'Cycle test'
                WHEN lineage_id LIKE 'TEST_MCYCLE%' THEN 'Multi-node cycle'
                WHEN lineage_id LIKE 'TEST_DIAMOND%' THEN 'Diamond pattern'
                WHEN lineage_id LIKE 'TEST_INACTIVE%' THEN 'Inactive test'
                WHEN lineage_id LIKE 'TEST_CHAIN%' THEN 'Chain test'
                WHEN lineage_id LIKE 'TEST_MULTISRC%' THEN 'Multi-source test'
                WHEN lineage_id LIKE 'TEST_FANOUT%' THEN 'Fan-out test'
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
