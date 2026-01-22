#!/usr/bin/env python3
"""
Populate Lineage Tables
Extracts metadata from DBC views and inserts column lineage records.
"""

import teradatasql
import sys
import hashlib

from db_config import CONFIG

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
WHERE DatabaseName = 'demo_user'
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
  AND DatabaseName = 'demo_user'
  AND TableName NOT LIKE 'LIN_%'
"""

EXTRACT_COLUMNS = """
INSERT INTO demo_user.LIN_COLUMN (column_id, database_name, table_name, column_name, column_type, column_length, decimal_total_digits, decimal_fractional_digits, nullable, default_value, comment_string, column_position, extracted_at, is_active)
SELECT
    TRIM(c.DatabaseName) || '.' || TRIM(c.TableName) || '.' || TRIM(c.ColumnName) AS column_id,
    TRIM(c.DatabaseName) AS database_name,
    TRIM(c.TableName) AS table_name,
    TRIM(c.ColumnName) AS column_name,
    TRIM(c.ColumnType) AS column_type,
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
WHERE c.DatabaseName = 'demo_user'
  AND c.TableName NOT LIKE 'LIN_%'
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


def main():
    print("=" * 60)
    print("Populate Lineage Tables")
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

    # Clear existing lineage data
    print("\n--- Clearing existing lineage data ---")
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

    # Verify data
    print("\n--- Verifying lineage data ---")
    for table in ["LIN_DATABASE", "LIN_TABLE", "LIN_COLUMN", "LIN_COLUMN_LINEAGE", "LIN_TABLE_LINEAGE"]:
        try:
            cursor.execute(f"SELECT COUNT(*) FROM demo_user.{table}")
            count = cursor.fetchone()[0]
            print(f"  {table}: {count} rows")
        except Exception as e:
            print(f"  {table}: ERROR - {e}")

    cursor.close()
    conn.close()

    print("\n" + "=" * 60)
    print("Lineage population completed!")
    print("=" * 60)

    return 0


if __name__ == "__main__":
    sys.exit(main())
