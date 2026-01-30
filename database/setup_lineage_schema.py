#!/usr/bin/env python3
"""
Setup Lineage Schema for Teradata
Creates all core lineage tables in the demo_user database.
"""

import teradatasql
import sys

from db_config import CONFIG

# Core table DDL statements (adapted for demo_user database, no partitioning in ClearScape)
# Note: DEFAULT CURRENT_TIMESTAMP not supported in ClearScape - defaults handled in INSERT statements
DDL_STATEMENTS = [
    # LIN_DATABASE - Database Asset Registry
    """
    CREATE MULTISET TABLE demo_user.LIN_DATABASE (
        database_id VARCHAR(64) NOT NULL,
        database_name VARCHAR(128) NOT NULL,
        owner_name VARCHAR(128),
        create_timestamp TIMESTAMP(0),
        last_alter_timestamp TIMESTAMP(0),
        comment_string VARCHAR(2000),
        extracted_at TIMESTAMP(0),
        is_active CHAR(1) DEFAULT 'Y',
        PRIMARY KEY (database_id)
    )
    """,

    # LIN_TABLE - Table Asset Registry
    """
    CREATE MULTISET TABLE demo_user.LIN_TABLE (
        table_id VARCHAR(128) NOT NULL,
        database_name VARCHAR(128) NOT NULL,
        table_name VARCHAR(128) NOT NULL,
        table_kind CHAR(1),
        create_timestamp TIMESTAMP(0),
        last_alter_timestamp TIMESTAMP(0),
        comment_string VARCHAR(2000),
        row_count BIGINT,
        extracted_at TIMESTAMP(0),
        is_active CHAR(1) DEFAULT 'Y',
        PRIMARY KEY (table_id)
    )
    """,

    # LIN_COLUMN - Column Asset Registry
    """
    CREATE MULTISET TABLE demo_user.LIN_COLUMN (
        column_id VARCHAR(256) NOT NULL,
        database_name VARCHAR(128) NOT NULL,
        table_name VARCHAR(128) NOT NULL,
        column_name VARCHAR(128) NOT NULL,
        column_type VARCHAR(128),
        column_length INTEGER,
        decimal_total_digits INTEGER,
        decimal_fractional_digits INTEGER,
        nullable CHAR(1),
        default_value VARCHAR(1024),
        comment_string VARCHAR(2000),
        column_position INTEGER,
        extracted_at TIMESTAMP(0),
        is_active CHAR(1) DEFAULT 'Y',
        PRIMARY KEY (column_id)
    )
    """,

    # LIN_COLUMN_LINEAGE - Column-to-Column Relationships (Core Lineage)
    # Note: Partitioning removed for ClearScape compatibility
    """
    CREATE MULTISET TABLE demo_user.LIN_COLUMN_LINEAGE (
        lineage_id VARCHAR(64) NOT NULL,
        source_column_id VARCHAR(256) NOT NULL,
        source_database VARCHAR(128) NOT NULL,
        source_table VARCHAR(128) NOT NULL,
        source_column VARCHAR(128) NOT NULL,
        target_column_id VARCHAR(256) NOT NULL,
        target_database VARCHAR(128) NOT NULL,
        target_table VARCHAR(128) NOT NULL,
        target_column VARCHAR(128) NOT NULL,
        transformation_type VARCHAR(50),
        transformation_id VARCHAR(64),
        confidence_score DECIMAL(3,2),
        query_id VARCHAR(64),
        discovered_at TIMESTAMP(0),
        last_seen_at TIMESTAMP(0),
        is_active CHAR(1),
        PRIMARY KEY (lineage_id)
    )
    """,

    # LIN_TABLE_LINEAGE - Table-Level Lineage Summary
    """
    CREATE MULTISET TABLE demo_user.LIN_TABLE_LINEAGE (
        lineage_id VARCHAR(64) NOT NULL,
        source_table_id VARCHAR(128) NOT NULL,
        source_database VARCHAR(128) NOT NULL,
        source_table VARCHAR(128) NOT NULL,
        target_table_id VARCHAR(128) NOT NULL,
        target_database VARCHAR(128) NOT NULL,
        target_table VARCHAR(128) NOT NULL,
        relationship_type VARCHAR(50),
        query_count INTEGER,
        first_seen_at TIMESTAMP(0),
        last_seen_at TIMESTAMP(0),
        is_active CHAR(1),
        PRIMARY KEY (lineage_id)
    )
    """,

    # LIN_TRANSFORMATION - Transformation Metadata
    """
    CREATE MULTISET TABLE demo_user.LIN_TRANSFORMATION (
        transformation_id VARCHAR(64) NOT NULL,
        transformation_type VARCHAR(50) NOT NULL,
        transformation_logic VARCHAR(10000),
        description VARCHAR(2000),
        created_at TIMESTAMP(0),
        PRIMARY KEY (transformation_id)
    )
    """,

    # LIN_QUERY - Query Registry from DBQL
    # Note: CLOB changed to VARCHAR for ClearScape, partitioning removed
    """
    CREATE MULTISET TABLE demo_user.LIN_QUERY (
        query_id VARCHAR(64) NOT NULL,
        proc_id DECIMAL(5,0),
        query_band VARCHAR(2048),
        user_name VARCHAR(128),
        statement_type VARCHAR(50),
        query_text VARCHAR(64000),
        start_time TIMESTAMP(0),
        first_resp_time TIMESTAMP(0),
        total_io_count BIGINT,
        amp_cpu_time DECIMAL(18,2),
        parsed_at TIMESTAMP(0),
        PRIMARY KEY (query_id)
    )
    """,

    # LIN_WATERMARK - Incremental Extraction Tracking
    """
    CREATE MULTISET TABLE demo_user.LIN_WATERMARK (
        source_name VARCHAR(128) NOT NULL,
        last_extracted_at TIMESTAMP(0),
        last_extracted_id VARCHAR(128),
        row_count BIGINT,
        status VARCHAR(20),
        updated_at TIMESTAMP(0),
        PRIMARY KEY (source_name)
    )
    """
]

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

# Index creation statements for LIN_* tables
# Note: Teradata syntax is CREATE INDEX name (columns) ON table, not CREATE INDEX name ON table (columns)
INDEX_STATEMENTS = [
    "CREATE INDEX idx_lin_database_name (database_name) ON demo_user.LIN_DATABASE",
    "CREATE INDEX idx_lin_table_db (database_name) ON demo_user.LIN_TABLE",
    "CREATE INDEX idx_lin_table_name (table_name) ON demo_user.LIN_TABLE",
    "CREATE INDEX idx_lin_column_db_tbl (database_name, table_name) ON demo_user.LIN_COLUMN",
    "CREATE INDEX idx_lin_column_name (column_name) ON demo_user.LIN_COLUMN",
    "CREATE INDEX idx_lin_col_lineage_source (source_column_id) ON demo_user.LIN_COLUMN_LINEAGE",
    "CREATE INDEX idx_lin_col_lineage_target (target_column_id) ON demo_user.LIN_COLUMN_LINEAGE",
    "CREATE INDEX idx_lin_col_lineage_src_db_tbl (source_database, source_table) ON demo_user.LIN_COLUMN_LINEAGE",
    "CREATE INDEX idx_lin_col_lineage_tgt_db_tbl (target_database, target_table) ON demo_user.LIN_COLUMN_LINEAGE",
    "CREATE INDEX idx_lin_tbl_lineage_source (source_table_id) ON demo_user.LIN_TABLE_LINEAGE",
    "CREATE INDEX idx_lin_tbl_lineage_target (target_table_id) ON demo_user.LIN_TABLE_LINEAGE",
    "CREATE INDEX idx_lin_query_user (user_name) ON demo_user.LIN_QUERY",
    "CREATE INDEX idx_lin_query_time (start_time) ON demo_user.LIN_QUERY"
]

# Index creation statements for OL_* tables (OpenLineage-aligned)
OL_INDEX_STATEMENTS = [
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
    print("Lineage Schema Setup for Teradata")
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

    # Drop existing tables in reverse order (to handle any dependencies)
    print("\n--- Dropping existing tables ---")
    tables_to_drop = [
        "LIN_WATERMARK",
        "LIN_QUERY",
        "LIN_TRANSFORMATION",
        "LIN_TABLE_LINEAGE",
        "LIN_COLUMN_LINEAGE",
        "LIN_COLUMN",
        "LIN_TABLE",
        "LIN_DATABASE"
    ]
    for table in tables_to_drop:
        drop_table_if_exists(cursor, table)

    # Create tables
    print("\n--- Creating core tables ---")
    for i, ddl in enumerate(DDL_STATEMENTS, 1):
        table_name = ddl.split("demo_user.")[1].split()[0]
        print(f"  Creating {table_name}...", end=" ")
        try:
            cursor.execute(ddl)
            print("OK")
        except Exception as e:
            print(f"FAILED: {e}")
            sys.exit(1)

    # Create indexes
    print("\n--- Creating indexes ---")
    for idx_sql in INDEX_STATEMENTS:
        idx_name = idx_sql.split("CREATE INDEX ")[1].split()[0]
        print(f"  Creating {idx_name}...", end=" ")
        try:
            cursor.execute(idx_sql)
            print("OK")
        except Exception as e:
            print(f"FAILED: {e}")

    # Verify tables were created
    print("\n--- Verifying table creation ---")
    cursor.execute("""
        SELECT TableName
        FROM DBC.TablesV
        WHERE DatabaseName = 'demo_user'
          AND TableName LIKE 'LIN_%'
        ORDER BY TableName
    """)
    tables = cursor.fetchall()
    print(f"  Found {len(tables)} lineage tables:")
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
