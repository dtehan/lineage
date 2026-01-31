#!/usr/bin/env python3
"""
Setup Lineage Schema for Teradata
Creates OpenLineage-aligned tables in the demo_user database.
"""

import teradatasql
import sys

from db_config import CONFIG

# OpenLineage-aligned table DDL statements (OL_* tables)
# Follows OpenLineage spec v2-0-2 with materialized lineage views
OL_DDL_STATEMENTS = [
    # OL_NAMESPACE - Namespace registry (connection URIs)
    """
    CREATE MULTISET TABLE demo_user.OL_NAMESPACE (
        namespace_id VARCHAR(64) NOT NULL,
        namespace_uri VARCHAR(512) NOT NULL,
        description VARCHAR(2000),
        spec_version VARCHAR(20) DEFAULT '2-0-2',
        created_at TIMESTAMP(0),
        PRIMARY KEY (namespace_id)
    )
    """,

    # OL_DATASET - Dataset registry (tables)
    """
    CREATE MULTISET TABLE demo_user.OL_DATASET (
        dataset_id VARCHAR(256) NOT NULL,
        namespace_id VARCHAR(64) NOT NULL,
        name VARCHAR(256) NOT NULL,
        description VARCHAR(2000),
        source_type VARCHAR(50),
        created_at TIMESTAMP(0),
        updated_at TIMESTAMP(0),
        is_active CHAR(1) DEFAULT 'Y',
        PRIMARY KEY (dataset_id)
    )
    """,

    # OL_DATASET_FIELD - Dataset fields (columns)
    """
    CREATE MULTISET TABLE demo_user.OL_DATASET_FIELD (
        field_id VARCHAR(512) NOT NULL,
        dataset_id VARCHAR(256) NOT NULL,
        field_name VARCHAR(256) NOT NULL,
        field_type VARCHAR(256),
        field_description VARCHAR(2000),
        ordinal_position INTEGER,
        nullable CHAR(1),
        created_at TIMESTAMP(0),
        PRIMARY KEY (field_id)
    )
    """,

    # OL_JOB - Job definitions (ETL processes)
    """
    CREATE MULTISET TABLE demo_user.OL_JOB (
        job_id VARCHAR(256) NOT NULL,
        namespace_id VARCHAR(64) NOT NULL,
        name VARCHAR(256) NOT NULL,
        description VARCHAR(2000),
        job_type VARCHAR(50),
        created_at TIMESTAMP(0),
        updated_at TIMESTAMP(0),
        PRIMARY KEY (job_id)
    )
    """,

    # OL_RUN - Run instances (job executions)
    """
    CREATE MULTISET TABLE demo_user.OL_RUN (
        run_id VARCHAR(64) NOT NULL,
        job_id VARCHAR(256) NOT NULL,
        event_type VARCHAR(20),
        event_time TIMESTAMP(6),
        nominal_start_time TIMESTAMP(0),
        nominal_end_time TIMESTAMP(0),
        producer VARCHAR(512),
        schema_url VARCHAR(512),
        created_at TIMESTAMP(0),
        PRIMARY KEY (run_id)
    )
    """,

    # OL_RUN_INPUT - Run input datasets
    """
    CREATE MULTISET TABLE demo_user.OL_RUN_INPUT (
        run_id VARCHAR(64) NOT NULL,
        dataset_id VARCHAR(256) NOT NULL,
        PRIMARY KEY (run_id, dataset_id)
    )
    """,

    # OL_RUN_OUTPUT - Run output datasets
    """
    CREATE MULTISET TABLE demo_user.OL_RUN_OUTPUT (
        run_id VARCHAR(64) NOT NULL,
        dataset_id VARCHAR(256) NOT NULL,
        PRIMARY KEY (run_id, dataset_id)
    )
    """,

    # OL_COLUMN_LINEAGE - Materialized column lineage (core query table)
    """
    CREATE MULTISET TABLE demo_user.OL_COLUMN_LINEAGE (
        lineage_id VARCHAR(64) NOT NULL,
        run_id VARCHAR(64),
        source_namespace VARCHAR(512) NOT NULL,
        source_dataset VARCHAR(256) NOT NULL,
        source_field VARCHAR(256) NOT NULL,
        target_namespace VARCHAR(512) NOT NULL,
        target_dataset VARCHAR(256) NOT NULL,
        target_field VARCHAR(256) NOT NULL,
        transformation_type VARCHAR(20),
        transformation_subtype VARCHAR(50),
        transformation_description VARCHAR(2000),
        masking CHAR(1) DEFAULT 'N',
        confidence_score DECIMAL(3,2),
        discovered_at TIMESTAMP(0),
        is_active CHAR(1) DEFAULT 'Y',
        PRIMARY KEY (lineage_id)
    )
    """,

    # OL_SCHEMA_VERSION - Track schema version
    """
    CREATE MULTISET TABLE demo_user.OL_SCHEMA_VERSION (
        version_id INTEGER NOT NULL,
        openlineage_spec_version VARCHAR(20) NOT NULL,
        schema_version VARCHAR(20) NOT NULL,
        applied_at TIMESTAMP(0),
        description VARCHAR(500),
        PRIMARY KEY (version_id)
    )
    """
]

# Index creation statements for OL_* tables (OpenLineage-aligned)
# Note: Teradata syntax is CREATE INDEX name (columns) ON table, not CREATE INDEX name ON table (columns)
INDEX_STATEMENTS = [
    # Namespace lookups
    "CREATE INDEX idx_ol_namespace_uri (namespace_uri) ON demo_user.OL_NAMESPACE",

    # Dataset lookups
    "CREATE INDEX idx_ol_dataset_ns (namespace_id) ON demo_user.OL_DATASET",
    "CREATE INDEX idx_ol_dataset_name (name) ON demo_user.OL_DATASET",

    # Field lookups
    "CREATE INDEX idx_ol_field_dataset (dataset_id) ON demo_user.OL_DATASET_FIELD",
    "CREATE INDEX idx_ol_field_name (field_name) ON demo_user.OL_DATASET_FIELD",

    # Job lookups
    "CREATE INDEX idx_ol_job_ns (namespace_id) ON demo_user.OL_JOB",
    "CREATE INDEX idx_ol_job_name (name) ON demo_user.OL_JOB",

    # Run lookups
    "CREATE INDEX idx_ol_run_job (job_id) ON demo_user.OL_RUN",
    "CREATE INDEX idx_ol_run_time (event_time) ON demo_user.OL_RUN",
    "CREATE INDEX idx_ol_run_type (event_type) ON demo_user.OL_RUN",

    # Run input/output lookups
    "CREATE INDEX idx_ol_run_input_ds (dataset_id) ON demo_user.OL_RUN_INPUT",
    "CREATE INDEX idx_ol_run_output_ds (dataset_id) ON demo_user.OL_RUN_OUTPUT",

    # Column lineage lookups (critical for graph traversal)
    "CREATE INDEX idx_ol_lineage_src_ds (source_dataset) ON demo_user.OL_COLUMN_LINEAGE",
    "CREATE INDEX idx_ol_lineage_src_field (source_field) ON demo_user.OL_COLUMN_LINEAGE",
    "CREATE INDEX idx_ol_lineage_tgt_ds (target_dataset) ON demo_user.OL_COLUMN_LINEAGE",
    "CREATE INDEX idx_ol_lineage_tgt_field (target_field) ON demo_user.OL_COLUMN_LINEAGE",
    "CREATE INDEX idx_ol_lineage_run (run_id) ON demo_user.OL_COLUMN_LINEAGE",
    "CREATE INDEX idx_ol_lineage_type (transformation_type) ON demo_user.OL_COLUMN_LINEAGE",
]


def drop_table_if_exists(cursor, table_name):
    """Drop a table if it exists."""
    try:
        cursor.execute(f"DROP TABLE demo_user.{table_name}")
        print(f"  Dropped existing table: {table_name}")
    except teradatasql.DatabaseError as e:
        if "does not exist" in str(e).lower() or "3807" in str(e):
            pass  # Table doesn't exist, that's fine
        else:
            print(f"  Warning dropping {table_name}: {e}")


def main():
    print("=" * 60)
    print("OpenLineage Schema Setup for Teradata")
    print("=" * 60)

    # Connect to Teradata
    print(f"\nConnecting to {CONFIG['host']}...")
    try:
        conn = teradatasql.connect(**CONFIG)
        cursor = conn.cursor()
        print("Connected successfully!")
    except Exception as e:
        print(f"ERROR: Failed to connect: {e}")
        sys.exit(1)

    # OL_* tables to drop (in reverse order to handle dependencies)
    tables_to_drop = [
        "OL_SCHEMA_VERSION",
        "OL_COLUMN_LINEAGE",
        "OL_RUN_OUTPUT",
        "OL_RUN_INPUT",
        "OL_RUN",
        "OL_JOB",
        "OL_DATASET_FIELD",
        "OL_DATASET",
        "OL_NAMESPACE"
    ]

    # Drop existing tables
    print("\n--- Dropping existing OL_* tables ---")
    for table in tables_to_drop:
        drop_table_if_exists(cursor, table)

    # Create OL_* tables
    print("\n--- Creating OL_* tables (OpenLineage-aligned) ---")
    for i, ddl in enumerate(OL_DDL_STATEMENTS, 1):
        table_name = ddl.split("demo_user.")[1].split()[0]
        print(f"  Creating {table_name}...", end=" ")
        try:
            cursor.execute(ddl)
            print("OK")
        except Exception as e:
            print(f"FAILED: {e}")
            sys.exit(1)

    # Create indexes
    print("\n--- Creating OL_* indexes ---")
    for idx_sql in INDEX_STATEMENTS:
        idx_name = idx_sql.split("CREATE INDEX ")[1].split()[0]
        print(f"  Creating {idx_name}...", end=" ")
        try:
            cursor.execute(idx_sql)
            print("OK")
        except Exception as e:
            print(f"FAILED: {e}")

    # Insert initial schema version record
    print("\n--- Inserting schema version record ---")
    try:
        cursor.execute("""
            INSERT INTO demo_user.OL_SCHEMA_VERSION
            (version_id, openlineage_spec_version, schema_version, applied_at, description)
            VALUES (1, '2-0-2', '1.0.0', CURRENT_TIMESTAMP(0), 'Initial OpenLineage schema')
        """)
        print("  Schema version 1.0.0 (OpenLineage spec 2-0-2) recorded")
    except Exception as e:
        print(f"  Warning: Could not insert schema version: {e}")

    # Verify tables were created
    print("\n--- Verifying table creation ---")
    cursor.execute("""
        SELECT TableName
        FROM DBC.TablesV
        WHERE DatabaseName = 'demo_user'
          AND TableName LIKE 'OL_%'
        ORDER BY TableName
    """)
    tables = cursor.fetchall()
    print(f"  Found {len(tables)} OL_* tables:")
    for table in tables:
        print(f"    - {table[0]}")

    # Close connection
    cursor.close()
    conn.close()

    print("\n" + "=" * 60)
    print("Schema setup completed successfully!")
    print("=" * 60)

    return 0


if __name__ == "__main__":
    sys.exit(main())
