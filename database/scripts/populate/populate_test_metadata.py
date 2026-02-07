#!/usr/bin/env python3
"""
Populate OpenLineage metadata for test data tables

This script creates the necessary OL_NAMESPACE, OL_DATASET, and OL_DATASET_FIELD
entries for all test tables used in insert_cte_test_data.py, enabling them to
appear in the Asset Browser UI.
"""

from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

import teradatasql
from datetime import datetime

from db_config import CONFIG

# Get database name from config
DATABASE = CONFIG["database"]

# Test namespace
TEST_NAMESPACE = {
    'name': 'teradata://demo',
    'description': 'Test namespace for lineage validation'
}

# Test datasets (tables) with their columns
TEST_DATASETS = [
    {
        'name': '{DATABASE}.CYCLE_TEST',
        'description': '2-node cycle test (A -> B -> A)',
        'columns': ['col_a', 'col_b']
    },
    {
        'name': '{DATABASE}.MCYCLE_TEST',
        'description': '4-node cycle test (A -> B -> C -> D -> A)',
        'columns': ['col_a', 'col_b', 'col_c', 'col_d']
    },
    {
        'name': '{DATABASE}.CYCLE5_TEST',
        'description': '5-node cycle test (A -> B -> C -> D -> E -> A)',
        'columns': ['col_a', 'col_b', 'col_c', 'col_d', 'col_e']
    },
    {
        'name': '{DATABASE}.DIAMOND',
        'description': 'Simple diamond pattern (A -> B/C -> D)',
        'columns': ['col_a', 'col_b', 'col_c', 'col_d']
    },
    {
        'name': '{DATABASE}.NESTED_DIAMOND',
        'description': 'Nested diamond pattern (A -> B/C -> D -> E/F -> G)',
        'columns': ['col_a', 'col_b', 'col_c', 'col_d', 'col_e', 'col_f', 'col_g']
    },
    {
        'name': '{DATABASE}.WIDE_DIAMOND',
        'description': 'Wide diamond pattern (A -> B/C/D/E -> F)',
        'columns': ['col_a', 'col_b', 'col_c', 'col_d', 'col_e', 'col_f']
    },
    {
        'name': '{DATABASE}.INACTIVE_TEST',
        'description': 'Inactive lineage filtering test',
        'columns': ['active_source', 'inactive_source', 'target']
    },
    {
        'name': '{DATABASE}.CHAIN_TEST',
        'description': 'Multi-level chain test (A <- B <- C <- D <- E)',
        'columns': ['col_a', 'col_b', 'col_c', 'col_d', 'col_e']
    },
    {
        'name': '{DATABASE}.MULTISRC_TEST',
        'description': 'Multiple sources test (A <- B/C/D)',
        'columns': ['src_b', 'src_c', 'src_d', 'target_a']
    },
    {
        'name': '{DATABASE}.FANOUT_TEST',
        'description': 'Fan-out pattern test (1 -> many)',
        'columns': ['source', 'target_1', 'target_2', 'target_3', 'target_4', 'target_1a', 'target_1b']
    },
    {
        'name': '{DATABASE}.FANOUT5_TEST',
        'description': 'Fan-out 5 pattern (source -> target_1..5)',
        'columns': ['source', 'target_1', 'target_2', 'target_3', 'target_4', 'target_5']
    },
    {
        'name': '{DATABASE}.FANOUT10_TEST',
        'description': 'Fan-out 10 pattern (source -> target_01..10)',
        'columns': ['source'] + [f'target_{i:02d}' for i in range(1, 11)]
    },
    {
        'name': '{DATABASE}.FANIN5_TEST',
        'description': 'Fan-in 5 pattern (src_1..5 -> target)',
        'columns': ['src_1', 'src_2', 'src_3', 'src_4', 'src_5', 'target']
    },
    {
        'name': '{DATABASE}.FANIN10_TEST',
        'description': 'Fan-in 10 pattern (src_01..10 -> target)',
        'columns': [f'src_{i:02d}' for i in range(1, 11)] + ['target']
    },
    {
        'name': '{DATABASE}.COMBINED_CYCLE_DIAMOND',
        'description': 'Combined cycle+diamond pattern',
        'columns': ['col_a', 'col_b', 'col_c', 'col_d']
    },
    {
        'name': '{DATABASE}.COMBINED_FAN',
        'description': 'Combined fan-out+fan-in pattern',
        'columns': ['col_a', 'col_b', 'col_c', 'col_d', 'col_e']
    },
    {
        'name': '{DATABASE}.TRANS_TEST',
        'description': 'Transformation types test',
        'columns': ['src1', 'src2', 'tgt1', 'tgt2']
    },
]


def main():
    print("=" * 70)
    print("Populate OpenLineage Metadata for Test Data")
    print("=" * 70)

    # Connect
    print(f"\nConnecting to {CONFIG['host']}...")
    try:
        conn = teradatasql.connect(**CONFIG)
        cursor = conn.cursor()
        print("Connected successfully!")
    except Exception as e:
        print(f"ERROR: Failed to connect: {e}")
        sys.exit(1)

    # 1. Insert/Update namespace
    print("\n--- Processing namespace ---")
    try:
        # Check if namespace exists
        cursor.execute(f"""
            SELECT namespace_id FROM {DATABASE}.OL_NAMESPACE
            WHERE namespace_uri = ?
        """, (TEST_NAMESPACE['name'],))

        result = cursor.fetchone()
        if result:
            namespace_id = result[0]
            print(f"  Namespace '{TEST_NAMESPACE['name']}' already exists (ID: {namespace_id})")
        else:
            # Use namespace URI as ID (simple approach for test data)
            namespace_id = 'test-demo'
            now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            cursor.execute(f"""
                INSERT INTO {DATABASE}.OL_NAMESPACE (namespace_id, namespace_uri, description, created_at)
                VALUES (?, ?, ?, CAST(? AS TIMESTAMP(0)))
            """, (namespace_id, TEST_NAMESPACE['name'], TEST_NAMESPACE['description'], now))
            print(f"  Created namespace '{TEST_NAMESPACE['name']}' (ID: {namespace_id})")
    except Exception as e:
        print(f"  ERROR creating namespace: {e}")
        cursor.close()
        conn.close()
        sys.exit(1)

    # 2. Insert/Update datasets and fields
    print("\n--- Processing datasets and fields ---")
    dataset_count = 0
    field_count = 0

    for dataset_template in TEST_DATASETS:
        try:
            # Substitute {DATABASE} in dataset name
            dataset_info = dataset_template.copy()
            dataset_info['name'] = dataset_info['name'].format(DATABASE=DATABASE)

            # Create dataset ID from namespace and name
            dataset_id = f"{namespace_id}:{dataset_info['name']}"

            # Check if dataset exists
            cursor.execute(f"""
                SELECT dataset_id FROM {DATABASE}.OL_DATASET
                WHERE namespace_id = ? AND name = ?
            """, (namespace_id, dataset_info['name']))

            result = cursor.fetchone()
            if result:
                print(f"  Dataset '{dataset_info['name']}' already exists")
            else:
                now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                cursor.execute(f"""
                    INSERT INTO {DATABASE}.OL_DATASET
                    (dataset_id, namespace_id, name, source_type, description, created_at, is_active)
                    VALUES (?, ?, ?, 'TABLE', ?, CAST(? AS TIMESTAMP(0)), 'Y')
                """, (dataset_id, namespace_id, dataset_info['name'], dataset_info['description'], now))
                print(f"  Created dataset '{dataset_info['name']}'")
                dataset_count += 1

            # Insert fields for this dataset
            for ordinal_position, column_name in enumerate(dataset_info['columns'], 1):
                try:
                    field_id = f"{dataset_id}:{column_name}"

                    # Check if field exists
                    cursor.execute(f"""
                        SELECT field_id FROM {DATABASE}.OL_DATASET_FIELD
                        WHERE dataset_id = ? AND field_name = ?
                    """, (dataset_id, column_name))

                    if cursor.fetchone():
                        print(f"    Field '{column_name}' already exists")
                    else:
                        now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                        cursor.execute(f"""
                            INSERT INTO {DATABASE}.OL_DATASET_FIELD
                            (field_id, dataset_id, field_name, field_type, field_description, ordinal_position, created_at)
                            VALUES (?, ?, ?, 'VARCHAR(100)', ?, ?, CAST(? AS TIMESTAMP(0)))
                        """, (field_id, dataset_id, column_name, f'Test column {column_name}', ordinal_position, now))
                        print(f"    Created field '{column_name}'")
                        field_count += 1

                except Exception as e:
                    print(f"    Warning: Failed to create field '{column_name}': {e}")

        except Exception as e:
            print(f"  Warning: Failed to process dataset '{dataset_info['name']}': {e}")

    # 3. Summary
    print("\n--- Summary ---")
    cursor.execute(f"SELECT COUNT(*) FROM {DATABASE}.OL_NAMESPACE WHERE namespace_uri LIKE '%demo%'")
    ns_count = cursor.fetchone()[0]
    print(f"  Namespaces with 'demo': {ns_count}")

    cursor.execute(f"""
        SELECT COUNT(*) FROM {DATABASE}.OL_DATASET d
        JOIN {DATABASE}.OL_NAMESPACE n ON d.namespace_id = n.namespace_id
        WHERE n.namespace_uri = ?
    """, (TEST_NAMESPACE['name'],))
    ds_count = cursor.fetchone()[0]
    print(f"  Datasets in test namespace: {ds_count}")

    cursor.execute(f"""
        SELECT COUNT(*) FROM {DATABASE}.OL_DATASET_FIELD f
        JOIN {DATABASE}.OL_DATASET d ON f.dataset_id = d.dataset_id
        JOIN {DATABASE}.OL_NAMESPACE n ON d.namespace_id = n.namespace_id
        WHERE n.namespace_uri = ?
    """, (TEST_NAMESPACE['name'],))
    field_total = cursor.fetchone()[0]
    print(f"  Fields in test datasets: {field_total}")

    cursor.execute(f"SELECT COUNT(*) FROM {DATABASE}.OL_COLUMN_LINEAGE WHERE lineage_id LIKE 'TEST_%'")
    lineage_count = cursor.fetchone()[0]
    print(f"  Test lineage records: {lineage_count}")

    # 4. Verify lineage references
    print("\n--- Verifying lineage integrity ---")
    cursor.execute(f"""
        SELECT COUNT(*) FROM {DATABASE}.OL_COLUMN_LINEAGE cl
        WHERE cl.lineage_id LIKE 'TEST_%'
        AND NOT EXISTS (
            SELECT 1 FROM {DATABASE}.OL_DATASET d
            JOIN {DATABASE}.OL_NAMESPACE n ON d.namespace_id = n.namespace_id
            WHERE n.namespace_uri = cl.source_namespace
            AND d.name = cl.source_dataset
        )
    """)
    missing_source = cursor.fetchone()[0]

    cursor.execute(f"""
        SELECT COUNT(*) FROM {DATABASE}.OL_COLUMN_LINEAGE cl
        WHERE cl.lineage_id LIKE 'TEST_%'
        AND NOT EXISTS (
            SELECT 1 FROM {DATABASE}.OL_DATASET d
            JOIN {DATABASE}.OL_NAMESPACE n ON d.namespace_id = n.namespace_id
            WHERE n.namespace_uri = cl.target_namespace
            AND d.name = cl.target_dataset
        )
    """)
    missing_target = cursor.fetchone()[0]

    if missing_source > 0 or missing_target > 0:
        print(f"  WARNING: {missing_source} lineage records with missing source datasets")
        print(f"  WARNING: {missing_target} lineage records with missing target datasets")
    else:
        print(f"  ✓ All lineage records have valid dataset references")

    cursor.close()
    conn.close()

    print("\n" + "=" * 70)
    if dataset_count > 0 or field_count > 0:
        print(f"Successfully populated {dataset_count} datasets and {field_count} fields!")
    else:
        print("All metadata already exists!")
    print("=" * 70)

    return 0


if __name__ == "__main__":
    sys.exit(main())
