#!/usr/bin/env python3
"""
Populate OpenLineage Tables

Extracts metadata from DBC views and populates OpenLineage-compliant lineage data.

Usage:
  python populate_lineage.py              # Use manual mappings (default)
  python populate_lineage.py --manual     # Explicitly use manual mappings
  python populate_lineage.py --dbql       # Extract from DBQL tables (future)
"""

from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

import argparse
import teradatasql
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


# Helper function for type conversion used in dataset/field population
def convert_teradata_type(column_type, length, decimal_total, decimal_fractional):
    """Convert Teradata column type codes to readable type strings."""
    # Handle NULL column types
    if column_type is None:
        return 'UNKNOWN'

    type_map = {
        'I': 'INTEGER',
        'I1': 'BYTEINT',
        'I2': 'SMALLINT',
        'I8': 'BIGINT',
        'F': 'FLOAT',
        'DA': 'DATE',
        'TZ': 'TIME WITH TIME ZONE',
        'SZ': 'TIMESTAMP WITH TIME ZONE',
        'CO': 'CLOB',
        'BO': 'BLOB',
        'N': 'NUMBER',
        'AN': 'ARRAY',
        'JN': 'JSON',
        'DY': 'INTERVAL DAY',
        'DH': 'INTERVAL DAY TO HOUR',
        'DM': 'INTERVAL DAY TO MINUTE',
        'DS': 'INTERVAL DAY TO SECOND',
        'HR': 'INTERVAL HOUR',
        'HM': 'INTERVAL HOUR TO MINUTE',
        'HS': 'INTERVAL HOUR TO SECOND',
        'MI': 'INTERVAL MINUTE',
        'MS': 'INTERVAL MINUTE TO SECOND',
        'SC': 'INTERVAL SECOND',
        'MO': 'INTERVAL MONTH',
        'YR': 'INTERVAL YEAR',
        'YM': 'INTERVAL YEAR TO MONTH',
        'PD': 'PERIOD(DATE)',
        'PT': 'PERIOD(TIME)',
        'PS': 'PERIOD(TIMESTAMP)',
        'PM': 'PERIOD(TIMESTAMP WITH TIME ZONE)'
    }

    col_type = column_type.strip()

    if col_type in type_map:
        return type_map[col_type]
    elif col_type == 'D':
        return f'DECIMAL({decimal_total},{decimal_fractional})'
    elif col_type in ('TS', 'AT'):
        precision = decimal_fractional or 0
        prefix = 'TIMESTAMP' if col_type == 'TS' else 'TIME'
        return f'{prefix}({precision})'
    elif col_type in ('CF', 'BF'):
        prefix = 'CHAR' if col_type == 'CF' else 'BYTE'
        return f'{prefix}({length})'
    elif col_type in ('CV', 'BV'):
        prefix = 'VARCHAR' if col_type == 'CV' else 'VARBYTE'
        return f'{prefix}({length})'
    else:
        return col_type


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
    """Create or get the namespace entry using INSERT...SELECT."""
    namespace_id = generate_namespace_id(namespace_uri)

    # Use INSERT...SELECT with NOT EXISTS to avoid fetch
    cursor.execute("""
        INSERT INTO demo_user.OL_NAMESPACE
        (namespace_id, namespace_uri, description, spec_version, created_at)
        SELECT ?, ?, ?, '2-0-2', CURRENT_TIMESTAMP(0)
        WHERE NOT EXISTS (
            SELECT 1 FROM demo_user.OL_NAMESPACE
            WHERE namespace_id = ?
        )
    """, (namespace_id, namespace_uri, f"Teradata instance at {namespace_uri}", namespace_id))

    if cursor.rowcount > 0:
        print(f"  Created namespace: {namespace_uri}")
    else:
        print(f"  Namespace already exists: {namespace_uri}")

    return namespace_id


def populate_openlineage_datasets(cursor, namespace_id: str):
    """Populate OL_DATASET from DBC.TablesV using INSERT...SELECT."""
    print("\n--- Populating OL_DATASET from DBC.TablesV ---")

    # Use INSERT...SELECT to keep data in database
    cursor.execute("""
        INSERT INTO demo_user.OL_DATASET
        (dataset_id, namespace_id, name, description, source_type, created_at, updated_at, is_active)
        SELECT
            ? || '/' || TRIM(DatabaseName) || '.' || TRIM(TableName) AS dataset_id,
            ? AS namespace_id,
            TRIM(DatabaseName) || '.' || TRIM(TableName) AS name,
            CAST(CommentString AS VARCHAR(2000)) AS description,
            CASE WHEN TableKind = 'V' THEN 'VIEW' ELSE 'TABLE' END AS source_type,
            CAST(CreateTimeStamp AS TIMESTAMP(0)) AS created_at,
            CURRENT_TIMESTAMP(0) AS updated_at,
            'Y' AS is_active
        FROM DBC.TablesV
        WHERE TableKind IN ('T', 'V', 'O')
          AND TableName NOT LIKE 'LIN_%'
          AND TableName NOT LIKE 'OL_%'
          AND NOT EXISTS (
              SELECT 1 FROM demo_user.OL_DATASET od
              WHERE od.dataset_id = ? || '/' || TRIM(DatabaseName) || '.' || TRIM(TableName)
          )
    """, (namespace_id, namespace_id, namespace_id))

    count = cursor.rowcount
    print(f"  Created {count} datasets")
    return count


def populate_openlineage_fields(cursor, namespace_id: str):
    """Populate OL_DATASET_FIELD from DBC.ColumnsV using INSERT...SELECT."""
    print("\n--- Populating OL_DATASET_FIELD from DBC.ColumnsV ---")

    # Use INSERT...SELECT with SQL-based type conversion
    cursor.execute("""
        INSERT INTO demo_user.OL_DATASET_FIELD
        (field_id, dataset_id, field_name, field_type, field_description,
         ordinal_position, nullable, created_at)
        SELECT
            ? || '/' || TRIM(c.DatabaseName) || '.' || TRIM(c.TableName) || '/' || TRIM(c.ColumnName) AS field_id,
            ? || '/' || TRIM(c.DatabaseName) || '.' || TRIM(c.TableName) AS dataset_id,
            TRIM(c.ColumnName) AS field_name,
            CASE
                -- Simple type mappings
                WHEN TRIM(c.ColumnType) = 'I' THEN 'INTEGER'
                WHEN TRIM(c.ColumnType) = 'I1' THEN 'BYTEINT'
                WHEN TRIM(c.ColumnType) = 'I2' THEN 'SMALLINT'
                WHEN TRIM(c.ColumnType) = 'I8' THEN 'BIGINT'
                WHEN TRIM(c.ColumnType) = 'F' THEN 'FLOAT'
                WHEN TRIM(c.ColumnType) = 'DA' THEN 'DATE'
                WHEN TRIM(c.ColumnType) = 'TZ' THEN 'TIME WITH TIME ZONE'
                WHEN TRIM(c.ColumnType) = 'SZ' THEN 'TIMESTAMP WITH TIME ZONE'
                WHEN TRIM(c.ColumnType) = 'CO' THEN 'CLOB'
                WHEN TRIM(c.ColumnType) = 'BO' THEN 'BLOB'
                WHEN TRIM(c.ColumnType) = 'N' THEN 'NUMBER'
                WHEN TRIM(c.ColumnType) = 'AN' THEN 'ARRAY'
                WHEN TRIM(c.ColumnType) = 'JN' THEN 'JSON'
                -- Interval types
                WHEN TRIM(c.ColumnType) = 'DY' THEN 'INTERVAL DAY'
                WHEN TRIM(c.ColumnType) = 'DH' THEN 'INTERVAL DAY TO HOUR'
                WHEN TRIM(c.ColumnType) = 'DM' THEN 'INTERVAL DAY TO MINUTE'
                WHEN TRIM(c.ColumnType) = 'DS' THEN 'INTERVAL DAY TO SECOND'
                WHEN TRIM(c.ColumnType) = 'HR' THEN 'INTERVAL HOUR'
                WHEN TRIM(c.ColumnType) = 'HM' THEN 'INTERVAL HOUR TO MINUTE'
                WHEN TRIM(c.ColumnType) = 'HS' THEN 'INTERVAL HOUR TO SECOND'
                WHEN TRIM(c.ColumnType) = 'MI' THEN 'INTERVAL MINUTE'
                WHEN TRIM(c.ColumnType) = 'MS' THEN 'INTERVAL MINUTE TO SECOND'
                WHEN TRIM(c.ColumnType) = 'SC' THEN 'INTERVAL SECOND'
                WHEN TRIM(c.ColumnType) = 'MO' THEN 'INTERVAL MONTH'
                WHEN TRIM(c.ColumnType) = 'YR' THEN 'INTERVAL YEAR'
                WHEN TRIM(c.ColumnType) = 'YM' THEN 'INTERVAL YEAR TO MONTH'
                -- Period types
                WHEN TRIM(c.ColumnType) = 'PD' THEN 'PERIOD(DATE)'
                WHEN TRIM(c.ColumnType) = 'PT' THEN 'PERIOD(TIME)'
                WHEN TRIM(c.ColumnType) = 'PS' THEN 'PERIOD(TIMESTAMP)'
                WHEN TRIM(c.ColumnType) = 'PM' THEN 'PERIOD(TIMESTAMP WITH TIME ZONE)'
                -- Decimal with precision
                WHEN TRIM(c.ColumnType) = 'D' THEN 'DECIMAL(' || COALESCE(c.DecimalTotalDigits, 0) || ',' || COALESCE(c.DecimalFractionalDigits, 0) || ')'
                -- Timestamp/Time with precision
                WHEN TRIM(c.ColumnType) IN ('TS', 'AT') THEN
                    CASE WHEN TRIM(c.ColumnType) = 'TS' THEN 'TIMESTAMP' ELSE 'TIME' END || '(' || COALESCE(c.DecimalFractionalDigits, 0) || ')'
                -- Fixed-length character/byte
                WHEN TRIM(c.ColumnType) IN ('CF', 'BF') THEN
                    CASE WHEN TRIM(c.ColumnType) = 'CF' THEN 'CHAR' ELSE 'BYTE' END || '(' || COALESCE(c.ColumnLength, 0) || ')'
                -- Variable-length character/byte
                WHEN TRIM(c.ColumnType) IN ('CV', 'BV') THEN
                    CASE WHEN TRIM(c.ColumnType) = 'CV' THEN 'VARCHAR' ELSE 'VARBYTE' END || '(' || COALESCE(c.ColumnLength, 0) || ')'
                -- Unknown/NULL types
                ELSE COALESCE(TRIM(c.ColumnType), 'UNKNOWN')
            END AS field_type,
            CAST(c.CommentString AS VARCHAR(2000)) AS field_description,
            c.ColumnId AS ordinal_position,
            c.Nullable AS nullable,
            CURRENT_TIMESTAMP(0) AS created_at
        FROM DBC.ColumnsV c
        WHERE c.TableName NOT LIKE 'LIN_%'
          AND c.TableName NOT LIKE 'OL_%'
          AND EXISTS (
              SELECT 1 FROM DBC.TablesV t
              WHERE t.DatabaseName = c.DatabaseName
                AND t.TableName = c.TableName
                AND t.TableKind IN ('T', 'V', 'O')
          )
          AND NOT EXISTS (
              SELECT 1 FROM demo_user.OL_DATASET_FIELD odf
              WHERE odf.field_id = ? || '/' || TRIM(c.DatabaseName) || '.' || TRIM(c.TableName) || '/' || TRIM(c.ColumnName)
          )
    """, (namespace_id, namespace_id, namespace_id))

    count = cursor.rowcount
    print(f"  Created {count} fields")
    return count


def update_view_column_types(cursor, namespace_id: str):
    """Update column types for views using HELP COLUMN (DBC.ColumnsV returns NULL for view types)."""
    print("\n--- Updating view column types using HELP COLUMN ---")

    # Get all views that have fields with UNKNOWN type
    cursor.execute("""
        SELECT DISTINCT d.name, d.dataset_id
        FROM demo_user.OL_DATASET d
        JOIN demo_user.OL_DATASET_FIELD f ON d.dataset_id = f.dataset_id
        WHERE d.source_type = 'VIEW'
          AND f.field_type = 'UNKNOWN'
    """)
    views = cursor.fetchall()

    if not views:
        print("  No views with UNKNOWN column types found")
        return 0

    # Create volatile table to hold type information
    cursor.execute("""
        CREATE VOLATILE TABLE vt_view_types (
            field_id VARCHAR(512),
            field_type VARCHAR(512)
        ) ON COMMIT PRESERVE ROWS
    """)

    # Populate volatile table with HELP COLUMN results
    insert_count = 0
    for view_name, dataset_id in views:
        view_name = view_name.strip()
        dataset_id = dataset_id.strip()

        # Extract database.table from dataset name
        try:
            parts = view_name.split('.')
            if len(parts) != 2:
                continue
            db_name, table_name = parts

            # Use HELP COLUMN to get actual column types for this view
            cursor.execute(f'HELP COLUMN "{db_name}"."{table_name}".*')
            columns = cursor.fetchall()

            for col in columns:
                col_name = col[0].strip() if col[0] else ""
                col_type_code = col[1].strip() if col[1] else ""
                col_length = col[4] if len(col) > 4 and col[4] else None
                col_decimal_total = col[5] if len(col) > 5 and col[5] else None
                col_decimal_frac = col[6] if len(col) > 6 and col[6] else None

                # Convert type code to readable type string
                field_type = convert_teradata_type(col_type_code, col_length, col_decimal_total, col_decimal_frac)

                # Build field_id
                field_id = f"{dataset_id}/{col_name}"

                # Insert into volatile table
                cursor.execute("""
                    INSERT INTO vt_view_types (field_id, field_type)
                    VALUES (?, ?)
                """, [field_id, field_type])
                insert_count += 1

        except Exception as e:
            # Skip views that fail (e.g., system views with special permissions)
            error_msg = str(e).split('\n')[0] if '\n' in str(e) else str(e)
            if "3523" not in error_msg:  # Only warn for non-permission errors
                print(f"  Warning: Could not get column types for {view_name}: {error_msg}")
            continue

    if insert_count == 0:
        print("  No view column types collected")
        return 0

    # Bulk update using UPDATE...FROM with volatile table
    cursor.execute("""
        UPDATE demo_user.OL_DATASET_FIELD
        FROM vt_view_types vt
        SET field_type = vt.field_type
        WHERE demo_user.OL_DATASET_FIELD.field_id = vt.field_id
          AND demo_user.OL_DATASET_FIELD.field_type = 'UNKNOWN'
    """)

    update_count = cursor.rowcount
    print(f"  Updated {update_count} view column types")
    return update_count


def populate_openlineage_lineage(cursor, namespace_id: str, namespace_uri: str):
    """Populate OL_COLUMN_LINEAGE from manual mappings."""
    print("\n--- Populating OL_COLUMN_LINEAGE ---")

    insert_sql = """
        INSERT INTO demo_user.OL_COLUMN_LINEAGE
        (lineage_id, run_id, source_namespace, source_dataset, source_field,
         target_namespace, target_dataset, target_field,
         transformation_type, transformation_subtype, transformation_description,
         confidence_score, discovered_at, is_active)
        VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(0), 'Y')
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


def clear_openlineage_data(cursor):
    """Clear existing OpenLineage data."""
    print("\n--- Clearing existing OpenLineage data ---")
    for table in ["OL_COLUMN_LINEAGE", "OL_DATASET_FIELD", "OL_DATASET"]:
        try:
            cursor.execute(f"DELETE FROM demo_user.{table}")
            print(f"  Cleared {table}")
        except Exception as e:
            print(f"  Warning clearing {table}: {e}")


def verify_openlineage_data(cursor):
    """Verify OpenLineage data after population."""
    print("\n--- Verifying OpenLineage data ---")
    for table in ["OL_NAMESPACE", "OL_DATASET", "OL_DATASET_FIELD", "OL_COLUMN_LINEAGE"]:
        try:
            cursor.execute(f"SELECT COUNT(*) FROM demo_user.{table}")
            count = cursor.fetchone()[0]
            print(f"  {table}: {count} rows")
        except Exception as e:
            print(f"  {table}: ERROR - {e}")


def main():
    # Parse arguments
    parser = argparse.ArgumentParser(
        description="Populate OpenLineage tables from DBC views",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Use manual/hardcoded mappings (default - for testing/demo)
  python populate_lineage.py
  python populate_lineage.py --manual

  # Extract lineage from DBQL (future)
  python populate_lineage.py --dbql

  # Dry run (show what would be extracted)
  python populate_lineage.py --dry-run

  # Skip clearing existing data (append mode)
  python populate_lineage.py --skip-clear
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
        help="Extract lineage from DBQL tables (not yet implemented)"
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
        "--skip-clear",
        action="store_true",
        help="Skip clearing existing data (append mode)"
    )

    args = parser.parse_args()

    print("=" * 60)
    print("Populate OpenLineage Tables")
    print("=" * 60)

    # Determine mode
    use_dbql = args.dbql

    if use_dbql:
        print("\nMode: DBQL-based extraction (not yet implemented)")
        print("ERROR: DBQL mode is not yet implemented for OpenLineage tables.")
        print("Please use --manual mode (default).")
        sys.exit(1)
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

    # Get namespace
    namespace_uri = get_openlineage_namespace()
    print(f"\nNamespace: {namespace_uri}")

    if args.dry_run:
        print("\n[DRY RUN] Would populate:")
        print(f"  - 1 namespace")
        print(f"  - ~N datasets from DBC.TablesV")
        print(f"  - ~N fields from DBC.ColumnsV")
        print(f"  - {len(COLUMN_LINEAGE_MAPPINGS)} column lineage records")
    else:
        # Clear existing data (unless skipped)
        if not args.skip_clear:
            clear_openlineage_data(cursor)

        # Populate OpenLineage tables
        namespace_id = populate_openlineage_namespace(cursor, namespace_uri)
        populate_openlineage_datasets(cursor, namespace_id)
        populate_openlineage_fields(cursor, namespace_id)
        update_view_column_types(cursor, namespace_id)  # Fix view column types
        populate_openlineage_lineage(cursor, namespace_id, namespace_uri)

        # Verify data
        verify_openlineage_data(cursor)

    cursor.close()
    conn.close()

    print("\n" + "=" * 60)
    print("OpenLineage population completed!")
    print("=" * 60)

    return 0


if __name__ == "__main__":
    sys.exit(main())
