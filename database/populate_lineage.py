#!/usr/bin/env python3
"""
Populate Lineage Tables

Extracts metadata from DBC views and populates lineage data.

Modes:
  --manual   Use hardcoded lineage mappings (default, for testing/demo)
  --dbql     Extract lineage from DBQL tables (requires DBQL access)

Usage:
  python populate_lineage.py              # Use manual mappings (default)
  python populate_lineage.py --manual     # Explicitly use manual mappings
  python populate_lineage.py --dbql       # Extract from DBQL tables
  python populate_lineage.py --dbql --since "2024-01-01"  # DBQL since date
"""

import argparse
import teradatasql
import sys
import hashlib

from db_config import CONFIG, get_openlineage_namespace

# OpenLineage transformation type mapping
# Maps current transformation types to (OL_type, OL_subtype)
OPENLINEAGE_TRANSFORMATION_MAPPING = {
    "DIRECT": ("DIRECT", "IDENTITY"),
    "CALCULATION": ("DIRECT", "TRANSFORMATION"),
    "AGGREGATION": ("DIRECT", "AGGREGATION"),
    "JOIN": ("INDIRECT", "JOIN"),
    "FILTER": ("INDIRECT", "FILTER"),
}


def map_transformation_type(current_type: str) -> tuple:
    """Map current transformation type to OpenLineage (type, subtype) tuple."""
    return OPENLINEAGE_TRANSFORMATION_MAPPING.get(
        current_type.upper(),
        ("DIRECT", "TRANSFORMATION")  # Default for unknown types
    )


# Extraction queries for metadata
EXTRACT_DATABASES = """
INSERT INTO demo_user.LIN_DATABASE (database_id, database_name, owner_name, create_timestamp, last_alter_timestamp, comment_string, extracted_at, is_active)
SELECT
    TRIM(DatabaseName) AS database_id,
    TRIM(DatabaseName) AS database_name,
    TRIM(OwnerName) AS owner_name,
    CreateTimeStamp,
    LastAlterTimeStamp,
    CAST(CommentString AS VARCHAR(2000)),
    TIMESTAMP '2024-01-15 10:00:00',
    'Y'
FROM DBC.DatabasesV
"""

EXTRACT_TABLES = """
INSERT INTO demo_user.LIN_TABLE (table_id, database_name, table_name, table_kind, create_timestamp, last_alter_timestamp, comment_string, extracted_at, is_active)
SELECT
    TRIM(DatabaseName) || '.' || TRIM(TableName) AS table_id,
    TRIM(DatabaseName) AS database_name,
    TRIM(TableName) AS table_name,
    TableKind,
    CreateTimeStamp,
    LastAlterTimeStamp,
    CAST(CommentString AS VARCHAR(2000)),
    TIMESTAMP '2024-01-15 10:00:00',
    'Y'
FROM DBC.TablesV
WHERE TableKind IN ('T', 'V', 'O')
  AND TableName NOT LIKE 'LIN_%'
"""

EXTRACT_COLUMNS = """
INSERT INTO demo_user.LIN_COLUMN (column_id, database_name, table_name, column_name, column_type, column_length, decimal_total_digits, decimal_fractional_digits, nullable, default_value, comment_string, column_position, extracted_at, is_active)
SELECT
    TRIM(c.DatabaseName) || '.' || TRIM(c.TableName) || '.' || TRIM(c.ColumnName) AS column_id,
    TRIM(c.DatabaseName) AS database_name,
    TRIM(c.TableName) AS table_name,
    TRIM(c.ColumnName) AS column_name,
    CASE TRIM(c.ColumnType)
        WHEN 'I' THEN 'INTEGER'
        WHEN 'I1' THEN 'BYTEINT'
        WHEN 'I2' THEN 'SMALLINT'
        WHEN 'I8' THEN 'BIGINT'
        WHEN 'F' THEN 'FLOAT'
        WHEN 'D' THEN 'DECIMAL(' || TRIM(c.DecimalTotalDigits) || ',' || TRIM(c.DecimalFractionalDigits) || ')'
        WHEN 'DA' THEN 'DATE'
        WHEN 'TS' THEN 'TIMESTAMP(' || COALESCE(TRIM(c.DecimalFractionalDigits), '0') || ')'
        WHEN 'TZ' THEN 'TIME WITH TIME ZONE'
        WHEN 'SZ' THEN 'TIMESTAMP WITH TIME ZONE'
        WHEN 'AT' THEN 'TIME(' || COALESCE(TRIM(c.DecimalFractionalDigits), '0') || ')'
        WHEN 'CF' THEN 'CHAR(' || TRIM(c.ColumnLength) || ')'
        WHEN 'CV' THEN 'VARCHAR(' || TRIM(c.ColumnLength) || ')'
        WHEN 'CO' THEN 'CLOB'
        WHEN 'BF' THEN 'BYTE(' || TRIM(c.ColumnLength) || ')'
        WHEN 'BV' THEN 'VARBYTE(' || TRIM(c.ColumnLength) || ')'
        WHEN 'BO' THEN 'BLOB'
        WHEN 'N' THEN 'NUMBER'
        WHEN 'AN' THEN 'ARRAY'
        WHEN 'JN' THEN 'JSON'
        WHEN 'DY' THEN 'INTERVAL DAY'
        WHEN 'DH' THEN 'INTERVAL DAY TO HOUR'
        WHEN 'DM' THEN 'INTERVAL DAY TO MINUTE'
        WHEN 'DS' THEN 'INTERVAL DAY TO SECOND'
        WHEN 'HR' THEN 'INTERVAL HOUR'
        WHEN 'HM' THEN 'INTERVAL HOUR TO MINUTE'
        WHEN 'HS' THEN 'INTERVAL HOUR TO SECOND'
        WHEN 'MI' THEN 'INTERVAL MINUTE'
        WHEN 'MS' THEN 'INTERVAL MINUTE TO SECOND'
        WHEN 'SC' THEN 'INTERVAL SECOND'
        WHEN 'MO' THEN 'INTERVAL MONTH'
        WHEN 'YR' THEN 'INTERVAL YEAR'
        WHEN 'YM' THEN 'INTERVAL YEAR TO MONTH'
        WHEN 'PD' THEN 'PERIOD(DATE)'
        WHEN 'PT' THEN 'PERIOD(TIME)'
        WHEN 'PS' THEN 'PERIOD(TIMESTAMP)'
        WHEN 'PM' THEN 'PERIOD(TIMESTAMP WITH TIME ZONE)'
        ELSE TRIM(c.ColumnType)
    END AS column_type,
    c.ColumnLength,
    c.DecimalTotalDigits,
    c.DecimalFractionalDigits,
    c.Nullable,
    CAST(c.DefaultValue AS VARCHAR(1024)),
    CAST(c.CommentString AS VARCHAR(2000)),
    c.ColumnId AS column_position,
    TIMESTAMP '2024-01-15 10:00:00',
    'Y'
FROM DBC.ColumnsV c
WHERE c.TableName NOT LIKE 'LIN_%'
  AND EXISTS (
      SELECT 1 FROM DBC.TablesV t
      WHERE t.DatabaseName = c.DatabaseName
        AND t.TableName = c.TableName
        AND t.TableKind IN ('T', 'V', 'O')
  )
"""

def generate_lineage_id(source, target):
    """Generate a unique lineage ID."""
    combined = f"{source}->{target}"
    return hashlib.md5(combined.encode()).hexdigest()[:16]


def generate_namespace_id(namespace_uri: str) -> str:
    """Generate a stable namespace ID from URI."""
    return hashlib.md5(namespace_uri.encode()).hexdigest()[:16]


def generate_ol_lineage_id(source: str, target: str) -> str:
    """Generate a stable lineage ID from source and target column paths for OpenLineage."""
    combined = f"{source}->{target}"
    return hashlib.md5(combined.encode()).hexdigest()[:24]


def generate_dataset_id(namespace_id: str, database: str, table: str) -> str:
    """Generate dataset ID in format: namespace_id/database.table"""
    return f"{namespace_id}/{database}.{table}"


def generate_field_id(dataset_id: str, field_name: str) -> str:
    """Generate field ID in format: dataset_id/field_name"""
    return f"{dataset_id}/{field_name}"


def populate_openlineage_namespace(cursor, namespace_uri: str):
    """Create or get the namespace entry."""
    namespace_id = generate_namespace_id(namespace_uri)

    # Check if exists
    cursor.execute("""
        SELECT namespace_id FROM demo_user.OL_NAMESPACE
        WHERE namespace_id = ?
    """, (namespace_id,))

    if not cursor.fetchone():
        cursor.execute("""
            INSERT INTO demo_user.OL_NAMESPACE
            (namespace_id, namespace_uri, description, spec_version, created_at)
            VALUES (?, ?, ?, '2-0-2', CURRENT_TIMESTAMP)
        """, (namespace_id, namespace_uri, f"Teradata instance at {namespace_uri}"))
        print(f"  Created namespace: {namespace_uri}")

    return namespace_id


def populate_openlineage_datasets(cursor, namespace_id: str):
    """Populate OL_DATASET from LIN_TABLE."""
    print("\n--- Populating OL_DATASET from tables ---")

    # Get distinct databases and tables from LIN_TABLE
    cursor.execute("""
        SELECT database_name, table_name, table_kind, comment_string, extracted_at
        FROM demo_user.LIN_TABLE
        WHERE is_active = 'Y'
    """)

    rows = cursor.fetchall()
    count = 0
    for row in rows:
        db_name, tbl_name, tbl_kind, comment, extracted_at = row
        dataset_name = f"{db_name}.{tbl_name}"
        dataset_id = generate_dataset_id(namespace_id, db_name, tbl_name)
        source_type = 'VIEW' if tbl_kind == 'V' else 'TABLE'

        try:
            cursor.execute("""
                INSERT INTO demo_user.OL_DATASET
                (dataset_id, namespace_id, name, description, source_type, created_at, updated_at, is_active)
                VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 'Y')
            """, (dataset_id, namespace_id, dataset_name, comment, source_type, extracted_at))
            count += 1
        except Exception as e:
            if "duplicate" not in str(e).lower():
                print(f"  Warning: {dataset_name}: {e}")

    print(f"  Created {count} datasets")
    return count


def populate_openlineage_fields(cursor, namespace_id: str):
    """Populate OL_DATASET_FIELD from LIN_COLUMN."""
    print("\n--- Populating OL_DATASET_FIELD from columns ---")

    cursor.execute("""
        SELECT database_name, table_name, column_name, column_type,
               nullable, comment_string, column_position, extracted_at
        FROM demo_user.LIN_COLUMN
        WHERE is_active = 'Y'
    """)

    rows = cursor.fetchall()
    count = 0
    for row in rows:
        db_name, tbl_name, col_name, col_type, nullable, comment, position, extracted_at = row
        dataset_id = generate_dataset_id(namespace_id, db_name, tbl_name)
        field_id = generate_field_id(dataset_id, col_name)

        try:
            cursor.execute("""
                INSERT INTO demo_user.OL_DATASET_FIELD
                (field_id, dataset_id, field_name, field_type, field_description,
                 ordinal_position, nullable, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (field_id, dataset_id, col_name, col_type, comment, position, nullable, extracted_at))
            count += 1
        except Exception as e:
            if "duplicate" not in str(e).lower():
                pass  # Skip duplicate errors silently for fields

    print(f"  Created {count} fields")
    return count


def populate_openlineage_lineage(cursor, namespace_id: str, namespace_uri: str):
    """Populate OL_COLUMN_LINEAGE from manual mappings."""
    print("\n--- Populating OL_COLUMN_LINEAGE ---")

    insert_sql = """
        INSERT INTO demo_user.OL_COLUMN_LINEAGE
        (lineage_id, run_id, source_namespace, source_dataset, source_field,
         target_namespace, target_dataset, target_field,
         transformation_type, transformation_subtype, transformation_description,
         confidence_score, discovered_at, is_active)
        VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 'Y')
    """

    count = 0
    for src, tgt, trans_type, confidence in COLUMN_LINEAGE_MAPPINGS:
        src_parts = src.split(".")
        tgt_parts = tgt.split(".")

        lineage_id = generate_ol_lineage_id(src, tgt)
        ol_type, ol_subtype = map_transformation_type(trans_type)

        source_dataset = f"{src_parts[0]}.{src_parts[1]}"
        target_dataset = f"{tgt_parts[0]}.{tgt_parts[1]}"

        try:
            cursor.execute(insert_sql, (
                lineage_id,
                namespace_uri,
                source_dataset,
                src_parts[2],  # source_field
                namespace_uri,
                target_dataset,
                tgt_parts[2],  # target_field
                ol_type,
                ol_subtype,
                f"Mapped from {trans_type}",
                confidence
            ))
            count += 1
        except Exception as e:
            if "duplicate" not in str(e).lower():
                print(f"  Warning: {src}->{tgt}: {e}")

    print(f"  Created {count} lineage records")
    return count


# Column lineage records based on known data flows
# Format: (source_column_id, target_column_id, transformation_type, confidence_score)
COLUMN_LINEAGE_MAPPINGS = [
    # SRC_CUSTOMER -> STG_CUSTOMER
    ("demo_user.SRC_CUSTOMER.first_name", "demo_user.STG_CUSTOMER.full_name", "CALCULATION", 1.00),
    ("demo_user.SRC_CUSTOMER.last_name", "demo_user.STG_CUSTOMER.full_name", "CALCULATION", 1.00),
    ("demo_user.SRC_CUSTOMER.customer_id", "demo_user.STG_CUSTOMER.customer_id", "DIRECT", 1.00),
    ("demo_user.SRC_CUSTOMER.email", "demo_user.STG_CUSTOMER.email_address", "DIRECT", 1.00),
    ("demo_user.SRC_CUSTOMER.phone", "demo_user.STG_CUSTOMER.phone_number", "DIRECT", 1.00),
    ("demo_user.SRC_CUSTOMER.created_date", "demo_user.STG_CUSTOMER.customer_since", "DIRECT", 1.00),

    # SRC_PRODUCT -> STG_PRODUCT
    ("demo_user.SRC_PRODUCT.product_id", "demo_user.STG_PRODUCT.product_id", "DIRECT", 1.00),
    ("demo_user.SRC_PRODUCT.product_name", "demo_user.STG_PRODUCT.product_name", "DIRECT", 1.00),
    ("demo_user.SRC_PRODUCT.category", "demo_user.STG_PRODUCT.category_name", "DIRECT", 1.00),
    ("demo_user.SRC_PRODUCT.unit_price", "demo_user.STG_PRODUCT.unit_price", "DIRECT", 1.00),
    ("demo_user.SRC_PRODUCT.cost_price", "demo_user.STG_PRODUCT.cost_price", "DIRECT", 1.00),
    ("demo_user.SRC_PRODUCT.unit_price", "demo_user.STG_PRODUCT.profit_margin", "CALCULATION", 1.00),
    ("demo_user.SRC_PRODUCT.cost_price", "demo_user.STG_PRODUCT.profit_margin", "CALCULATION", 1.00),

    # SRC_SALES -> STG_SALES
    ("demo_user.SRC_SALES.transaction_id", "demo_user.STG_SALES.transaction_id", "DIRECT", 1.00),
    ("demo_user.SRC_SALES.customer_id", "demo_user.STG_SALES.customer_id", "DIRECT", 1.00),
    ("demo_user.SRC_SALES.product_id", "demo_user.STG_SALES.product_id", "DIRECT", 1.00),
    ("demo_user.SRC_SALES.store_id", "demo_user.STG_SALES.store_id", "DIRECT", 1.00),
    ("demo_user.SRC_SALES.quantity", "demo_user.STG_SALES.quantity", "DIRECT", 1.00),
    ("demo_user.SRC_SALES.sale_amount", "demo_user.STG_SALES.gross_amount", "DIRECT", 1.00),
    ("demo_user.SRC_SALES.discount_amount", "demo_user.STG_SALES.discount_amount", "DIRECT", 1.00),
    ("demo_user.SRC_SALES.sale_amount", "demo_user.STG_SALES.net_amount", "CALCULATION", 1.00),
    ("demo_user.SRC_SALES.discount_amount", "demo_user.STG_SALES.net_amount", "CALCULATION", 1.00),
    ("demo_user.SRC_SALES.sale_date", "demo_user.STG_SALES.sale_date", "DIRECT", 1.00),

    # STG_CUSTOMER -> DIM_CUSTOMER
    ("demo_user.STG_CUSTOMER.customer_key", "demo_user.DIM_CUSTOMER.customer_sk", "DIRECT", 1.00),
    ("demo_user.STG_CUSTOMER.customer_id", "demo_user.DIM_CUSTOMER.customer_id", "DIRECT", 1.00),
    ("demo_user.STG_CUSTOMER.full_name", "demo_user.DIM_CUSTOMER.full_name", "DIRECT", 1.00),
    ("demo_user.STG_CUSTOMER.email_address", "demo_user.DIM_CUSTOMER.email_address", "DIRECT", 1.00),
    ("demo_user.STG_CUSTOMER.phone_number", "demo_user.DIM_CUSTOMER.phone_number", "DIRECT", 1.00),
    ("demo_user.STG_CUSTOMER.customer_since", "demo_user.DIM_CUSTOMER.customer_since", "DIRECT", 1.00),

    # STG_PRODUCT -> DIM_PRODUCT
    ("demo_user.STG_PRODUCT.product_key", "demo_user.DIM_PRODUCT.product_sk", "DIRECT", 1.00),
    ("demo_user.STG_PRODUCT.product_id", "demo_user.DIM_PRODUCT.product_id", "DIRECT", 1.00),
    ("demo_user.STG_PRODUCT.product_name", "demo_user.DIM_PRODUCT.product_name", "DIRECT", 1.00),
    ("demo_user.STG_PRODUCT.category_name", "demo_user.DIM_PRODUCT.category_name", "DIRECT", 1.00),
    ("demo_user.STG_PRODUCT.unit_price", "demo_user.DIM_PRODUCT.unit_price", "DIRECT", 1.00),
    ("demo_user.STG_PRODUCT.cost_price", "demo_user.DIM_PRODUCT.cost_price", "DIRECT", 1.00),
    ("demo_user.STG_PRODUCT.profit_margin", "demo_user.DIM_PRODUCT.profit_margin", "DIRECT", 1.00),

    # SRC_STORE -> DIM_STORE
    ("demo_user.SRC_STORE.store_id", "demo_user.DIM_STORE.store_id", "DIRECT", 1.00),
    ("demo_user.SRC_STORE.store_name", "demo_user.DIM_STORE.store_name", "DIRECT", 1.00),
    ("demo_user.SRC_STORE.region", "demo_user.DIM_STORE.region", "DIRECT", 1.00),
    ("demo_user.SRC_STORE.city", "demo_user.DIM_STORE.city", "DIRECT", 1.00),
    ("demo_user.SRC_STORE.state", "demo_user.DIM_STORE.state", "DIRECT", 1.00),
    ("demo_user.SRC_STORE.open_date", "demo_user.DIM_STORE.open_date", "DIRECT", 1.00),

    # Multi-source -> FACT_SALES
    ("demo_user.STG_SALES.sales_key", "demo_user.FACT_SALES.sales_sk", "DIRECT", 1.00),
    ("demo_user.DIM_DATE.date_sk", "demo_user.FACT_SALES.date_sk", "JOIN", 1.00),
    ("demo_user.DIM_CUSTOMER.customer_sk", "demo_user.FACT_SALES.customer_sk", "JOIN", 1.00),
    ("demo_user.DIM_PRODUCT.product_sk", "demo_user.FACT_SALES.product_sk", "JOIN", 1.00),
    ("demo_user.DIM_STORE.store_sk", "demo_user.FACT_SALES.store_sk", "JOIN", 1.00),
    ("demo_user.STG_SALES.transaction_id", "demo_user.FACT_SALES.transaction_id", "DIRECT", 1.00),
    ("demo_user.STG_SALES.quantity", "demo_user.FACT_SALES.quantity", "DIRECT", 1.00),
    ("demo_user.STG_SALES.gross_amount", "demo_user.FACT_SALES.gross_amount", "DIRECT", 1.00),
    ("demo_user.STG_SALES.discount_amount", "demo_user.FACT_SALES.discount_amount", "DIRECT", 1.00),
    ("demo_user.STG_SALES.net_amount", "demo_user.FACT_SALES.net_amount", "DIRECT", 1.00),
    ("demo_user.STG_SALES.quantity", "demo_user.FACT_SALES.cost_amount", "CALCULATION", 1.00),
    ("demo_user.DIM_PRODUCT.cost_price", "demo_user.FACT_SALES.cost_amount", "CALCULATION", 1.00),
    ("demo_user.STG_SALES.net_amount", "demo_user.FACT_SALES.profit_amount", "CALCULATION", 1.00),
    ("demo_user.FACT_SALES.cost_amount", "demo_user.FACT_SALES.profit_amount", "CALCULATION", 1.00),

    # FACT_SALES -> FACT_SALES_DAILY (Aggregation)
    ("demo_user.FACT_SALES.date_sk", "demo_user.FACT_SALES_DAILY.date_sk", "AGGREGATION", 1.00),
    ("demo_user.FACT_SALES.store_sk", "demo_user.FACT_SALES_DAILY.store_sk", "AGGREGATION", 1.00),
    ("demo_user.FACT_SALES.product_sk", "demo_user.FACT_SALES_DAILY.product_sk", "AGGREGATION", 1.00),
    ("demo_user.FACT_SALES.quantity", "demo_user.FACT_SALES_DAILY.total_quantity", "AGGREGATION", 1.00),
    ("demo_user.FACT_SALES.gross_amount", "demo_user.FACT_SALES_DAILY.total_gross_amount", "AGGREGATION", 1.00),
    ("demo_user.FACT_SALES.discount_amount", "demo_user.FACT_SALES_DAILY.total_discount_amount", "AGGREGATION", 1.00),
    ("demo_user.FACT_SALES.net_amount", "demo_user.FACT_SALES_DAILY.total_net_amount", "AGGREGATION", 1.00),
    ("demo_user.FACT_SALES.cost_amount", "demo_user.FACT_SALES_DAILY.total_cost_amount", "AGGREGATION", 1.00),
    ("demo_user.FACT_SALES.profit_amount", "demo_user.FACT_SALES_DAILY.total_profit_amount", "AGGREGATION", 1.00),
    ("demo_user.FACT_SALES.sales_sk", "demo_user.FACT_SALES_DAILY.transaction_count", "AGGREGATION", 1.00),

    # FACT_SALES_DAILY + DIM -> RPT_MONTHLY_SALES
    ("demo_user.FACT_SALES_DAILY.store_sk", "demo_user.RPT_MONTHLY_SALES.store_sk", "AGGREGATION", 1.00),
    ("demo_user.DIM_STORE.store_name", "demo_user.RPT_MONTHLY_SALES.store_name", "JOIN", 1.00),
    ("demo_user.DIM_STORE.region", "demo_user.RPT_MONTHLY_SALES.region", "JOIN", 1.00),
    ("demo_user.DIM_DATE.year_number", "demo_user.RPT_MONTHLY_SALES.year_month", "CALCULATION", 1.00),
    ("demo_user.DIM_DATE.month_number", "demo_user.RPT_MONTHLY_SALES.year_month", "CALCULATION", 1.00),
    ("demo_user.FACT_SALES_DAILY.total_net_amount", "demo_user.RPT_MONTHLY_SALES.total_sales", "AGGREGATION", 1.00),
    ("demo_user.FACT_SALES_DAILY.total_profit_amount", "demo_user.RPT_MONTHLY_SALES.total_profit", "AGGREGATION", 1.00),
    ("demo_user.FACT_SALES_DAILY.transaction_count", "demo_user.RPT_MONTHLY_SALES.total_transactions", "AGGREGATION", 1.00),
    ("demo_user.FACT_SALES_DAILY.total_net_amount", "demo_user.RPT_MONTHLY_SALES.avg_transaction_value", "CALCULATION", 1.00),
    ("demo_user.FACT_SALES_DAILY.transaction_count", "demo_user.RPT_MONTHLY_SALES.avg_transaction_value", "CALCULATION", 1.00),
]

# Table lineage mappings
# Format: (source_table_id, target_table_id, relationship_type)
TABLE_LINEAGE_MAPPINGS = [
    ("demo_user.SRC_CUSTOMER", "demo_user.STG_CUSTOMER", "INSERT_SELECT"),
    ("demo_user.SRC_PRODUCT", "demo_user.STG_PRODUCT", "INSERT_SELECT"),
    ("demo_user.SRC_SALES", "demo_user.STG_SALES", "INSERT_SELECT"),
    ("demo_user.STG_CUSTOMER", "demo_user.DIM_CUSTOMER", "INSERT_SELECT"),
    ("demo_user.STG_PRODUCT", "demo_user.DIM_PRODUCT", "INSERT_SELECT"),
    ("demo_user.SRC_STORE", "demo_user.DIM_STORE", "INSERT_SELECT"),
    ("demo_user.STG_SALES", "demo_user.FACT_SALES", "INSERT_SELECT"),
    ("demo_user.DIM_CUSTOMER", "demo_user.FACT_SALES", "INSERT_SELECT"),
    ("demo_user.DIM_PRODUCT", "demo_user.FACT_SALES", "INSERT_SELECT"),
    ("demo_user.DIM_STORE", "demo_user.FACT_SALES", "INSERT_SELECT"),
    ("demo_user.DIM_DATE", "demo_user.FACT_SALES", "INSERT_SELECT"),
    ("demo_user.FACT_SALES", "demo_user.FACT_SALES_DAILY", "INSERT_SELECT"),
    ("demo_user.FACT_SALES_DAILY", "demo_user.RPT_MONTHLY_SALES", "INSERT_SELECT"),
    ("demo_user.DIM_STORE", "demo_user.RPT_MONTHLY_SALES", "INSERT_SELECT"),
    ("demo_user.DIM_DATE", "demo_user.RPT_MONTHLY_SALES", "INSERT_SELECT"),
]


def extract_metadata(cursor):
    """Extract database, table, and column metadata from DBC views."""
    # Clear existing metadata
    print("\n--- Clearing existing metadata ---")
    for table in ["LIN_COLUMN_LINEAGE", "LIN_TABLE_LINEAGE", "LIN_COLUMN", "LIN_TABLE", "LIN_DATABASE"]:
        try:
            cursor.execute(f"DELETE FROM demo_user.{table}")
            print(f"  Cleared {table}")
        except Exception as e:
            print(f"  Warning clearing {table}: {e}")

    # Extract databases
    print("\n--- Extracting databases ---")
    try:
        cursor.execute(EXTRACT_DATABASES)
        cursor.execute("SELECT COUNT(*) FROM demo_user.LIN_DATABASE")
        count = cursor.fetchone()[0]
        print(f"  Extracted {count} databases")
    except Exception as e:
        print(f"  FAILED: {e}")

    # Extract tables
    print("\n--- Extracting tables ---")
    try:
        cursor.execute(EXTRACT_TABLES)
        cursor.execute("SELECT COUNT(*) FROM demo_user.LIN_TABLE")
        count = cursor.fetchone()[0]
        print(f"  Extracted {count} tables")
    except Exception as e:
        print(f"  FAILED: {e}")

    # Extract columns
    print("\n--- Extracting columns ---")
    try:
        cursor.execute(EXTRACT_COLUMNS)
        cursor.execute("SELECT COUNT(*) FROM demo_user.LIN_COLUMN")
        count = cursor.fetchone()[0]
        print(f"  Extracted {count} columns")
    except Exception as e:
        print(f"  FAILED: {e}")


def populate_manual_lineage(cursor):
    """Populate lineage using hardcoded manual mappings."""
    # Insert column lineage
    print("\n--- Inserting column lineage records ---")
    insert_col_lineage = """
        INSERT INTO demo_user.LIN_COLUMN_LINEAGE (
            lineage_id, source_column_id, source_database, source_table, source_column,
            target_column_id, target_database, target_table, target_column,
            transformation_type, confidence_score, discovered_at, last_seen_at, is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TIMESTAMP '2024-01-15 10:00:00', TIMESTAMP '2024-01-15 10:00:00', 'Y')
    """

    success_count = 0
    for src, tgt, trans_type, confidence in COLUMN_LINEAGE_MAPPINGS:
        src_parts = src.split(".")
        tgt_parts = tgt.split(".")
        lineage_id = generate_lineage_id(src, tgt)

        try:
            cursor.execute(insert_col_lineage, (
                lineage_id,
                src,
                src_parts[0],  # source_database
                src_parts[1],  # source_table
                src_parts[2],  # source_column
                tgt,
                tgt_parts[0],  # target_database
                tgt_parts[1],  # target_table
                tgt_parts[2],  # target_column
                trans_type,
                confidence
            ))
            success_count += 1
        except Exception as e:
            print(f"  Warning inserting {src}->{tgt}: {e}")

    print(f"  Inserted {success_count} column lineage records")

    # Insert table lineage
    print("\n--- Inserting table lineage records ---")
    insert_tbl_lineage = """
        INSERT INTO demo_user.LIN_TABLE_LINEAGE (
            lineage_id, source_table_id, source_database, source_table,
            target_table_id, target_database, target_table,
            relationship_type, query_count, first_seen_at, last_seen_at, is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, TIMESTAMP '2024-01-15 10:00:00', TIMESTAMP '2024-01-15 10:00:00', 'Y')
    """

    success_count = 0
    for src, tgt, rel_type in TABLE_LINEAGE_MAPPINGS:
        src_parts = src.split(".")
        tgt_parts = tgt.split(".")
        lineage_id = generate_lineage_id(src, tgt)

        try:
            cursor.execute(insert_tbl_lineage, (
                lineage_id,
                src,
                src_parts[0],  # source_database
                src_parts[1],  # source_table
                tgt,
                tgt_parts[0],  # target_database
                tgt_parts[1],  # target_table
                rel_type
            ))
            success_count += 1
        except Exception as e:
            print(f"  Warning inserting {src}->{tgt}: {e}")

    print(f"  Inserted {success_count} table lineage records")


def populate_dbql_lineage(args):
    """Populate lineage from DBQL tables using extract_dbql_lineage module."""
    print("\n--- Running DBQL-based lineage extraction ---")

    try:
        from extract_dbql_lineage import DBQLLineageExtractor, parse_datetime
    except ImportError as e:
        print(f"  ERROR: Could not import extract_dbql_lineage: {e}")
        return False

    # Parse since datetime
    since = None
    if hasattr(args, 'since') and args.since:
        try:
            since = parse_datetime(args.since)
        except ValueError as e:
            print(f"  ERROR: Invalid date format: {e}")
            return False

    # Determine if full extraction
    full = getattr(args, 'full', False)

    # Create extractor
    extractor = DBQLLineageExtractor(
        dry_run=getattr(args, 'dry_run', False),
        verbose=getattr(args, 'verbose', False)
    )

    # Connect
    if not extractor.connect():
        return False

    try:
        # Check DBQL access
        if not extractor.check_dbql_access():
            print("\n  DBQL is not accessible. Falling back to manual mappings.")
            print("  To use manual mappings explicitly, run: python populate_lineage.py --manual")
            return False

        # Run extraction (uses watermark for incremental by default)
        success = extractor.extract_lineage(since=since, full=full)

        if success:
            extractor.print_summary()

        return success

    except Exception as e:
        print(f"  ERROR: {e}")
        return False

    finally:
        extractor.close()


def verify_lineage(cursor):
    """Verify lineage data after population."""
    print("\n--- Verifying lineage data ---")
    for table in ["LIN_DATABASE", "LIN_TABLE", "LIN_COLUMN", "LIN_COLUMN_LINEAGE", "LIN_TABLE_LINEAGE"]:
        try:
            cursor.execute(f"SELECT COUNT(*) FROM demo_user.{table}")
            count = cursor.fetchone()[0]
            print(f"  {table}: {count} rows")
        except Exception as e:
            print(f"  {table}: ERROR - {e}")


def main():
    # Parse arguments
    parser = argparse.ArgumentParser(
        description="Populate lineage tables from DBC views and DBQL",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Use manual/hardcoded mappings (default - for testing/demo)
  python populate_lineage.py
  python populate_lineage.py --manual

  # Extract lineage from DBQL (incremental - only new queries since last run)
  python populate_lineage.py --dbql

  # DBQL full extraction (all history, clears existing lineage)
  python populate_lineage.py --dbql --full

  # DBQL extraction with specific start date
  python populate_lineage.py --dbql --since "2024-01-01"

  # Dry run (show what would be extracted)
  python populate_lineage.py --dbql --dry-run

  # Skip metadata refresh (only update lineage)
  python populate_lineage.py --dbql --skip-metadata
        """
    )
    mode_group = parser.add_mutually_exclusive_group()
    mode_group.add_argument(
        "--manual", "-m",
        action="store_true",
        help="Use hardcoded lineage mappings (default)"
    )
    mode_group.add_argument(
        "--dbql", "-d",
        action="store_true",
        help="Extract lineage from DBQL tables (incremental by default)"
    )
    parser.add_argument(
        "--full", "-f",
        action="store_true",
        help="For DBQL mode: full extraction (ignore watermark, clear existing lineage)"
    )
    parser.add_argument(
        "--since", "-s",
        type=str,
        help="For DBQL mode: extract records since this date (YYYY-MM-DD)"
    )
    parser.add_argument(
        "--dry-run", "-n",
        action="store_true",
        help="Show what would be done without making changes"
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Verbose output"
    )
    parser.add_argument(
        "--skip-metadata",
        action="store_true",
        help="Skip metadata extraction (databases, tables, columns)"
    )

    args = parser.parse_args()

    print("=" * 60)
    print("Populate Lineage Tables")
    print("=" * 60)

    # Determine mode
    use_dbql = args.dbql

    if use_dbql:
        print("\nMode: DBQL-based extraction")
    else:
        print("\nMode: Manual/hardcoded mappings")

    # Connect
    print(f"\nConnecting to {CONFIG['host']}...")
    try:
        conn = teradatasql.connect(**CONFIG)
        cursor = conn.cursor()
        print("Connected successfully!")
    except Exception as e:
        print(f"ERROR: Failed to connect: {e}")
        sys.exit(1)

    # Extract metadata (unless skipped or dry-run)
    if not args.skip_metadata and not args.dry_run:
        extract_metadata(cursor)

    # Populate lineage based on mode
    if use_dbql:
        # DBQL-based extraction
        success = populate_dbql_lineage(args)
        if not success:
            print("\nDBQL extraction failed or unavailable.")
            if not args.manual:
                print("Tip: Use --manual flag to use hardcoded mappings instead.")
    else:
        # Manual mappings
        if not args.dry_run:
            populate_manual_lineage(cursor)
        else:
            print("\n[DRY RUN] Would insert {} column lineage records".format(len(COLUMN_LINEAGE_MAPPINGS)))
            print("[DRY RUN] Would insert {} table lineage records".format(len(TABLE_LINEAGE_MAPPINGS)))

    # Verify data
    if not args.dry_run:
        verify_lineage(cursor)

    cursor.close()
    conn.close()

    print("\n" + "=" * 60)
    print("Lineage population completed!")
    print("=" * 60)

    return 0


if __name__ == "__main__":
    sys.exit(main())
