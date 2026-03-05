#!/usr/bin/env python3
"""
Populate OpenLineage Tables

Extracts metadata from DBC views and populates OpenLineage-compliant lineage data.
Supports multiple lineage sources:
  - DBQL extraction (default): Parse executed SQL from query logs
  - View lineage (default): Parse view definitions via SQLGlot
  - Manual fixtures (--fixtures): Hardcoded test/demo mappings

Usage:
  python populate_lineage.py              # DBQL + view lineage (default)
  python populate_lineage.py --fixtures   # Use fixture mappings (for testing/demo)
  python populate_lineage.py --no-views   # Skip view-based lineage extraction
  python populate_lineage.py --dbql --since "2024-01-01"  # DBQL since date
  python populate_lineage.py --dry-run    # Preview without changes
"""

from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

import argparse
from datetime import datetime
import teradatasql
import hashlib

from db_config import CONFIG, get_openlineage_namespace
from watermark_store import WatermarkStore
from typing import Optional

# Get database name from config
DATABASE = CONFIG["database"]

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
    cursor.execute(f"""
        INSERT INTO {DATABASE}.OL_NAMESPACE
        (namespace_id, namespace_uri, description, spec_version, created_at)
        SELECT ?, ?, ?, '2-0-2', CURRENT_TIMESTAMP(0)
        WHERE NOT EXISTS (
            SELECT 1 FROM {DATABASE}.OL_NAMESPACE
            WHERE namespace_id = ?
        )
    """, (namespace_id, namespace_uri, f"Teradata instance at {namespace_uri}", namespace_id))

    if cursor.rowcount > 0:
        print(f"  Created namespace: {namespace_uri}")
    else:
        print(f"  Namespace already exists: {namespace_uri}")

    return namespace_id


def populate_openlineage_datasets(cursor, namespace_id: str, since: Optional[datetime] = None) -> int:
    """Populate OL_DATASET from DBC.TablesV using INSERT...SELECT.

    When since is provided (incremental mode), only inserts datasets for tables/views
    created or altered after the watermark. Also updates existing datasets' updated_at
    for changed tables.
    """
    print("\n--- Populating OL_DATASET from DBC.TablesV ---")
    if since is not None:
        print(f"  Mode: incremental (since {since})")
    else:
        print("  Mode: full scan")

    since_str = since.strftime('%Y-%m-%d %H:%M:%S') if since is not None else None

    # Build WHERE clause for incremental filter
    incremental_filter = ""
    if since is not None:
        incremental_filter = "\n          AND (COALESCE(AlterTimeStamp, CreateTimeStamp) > CAST(? AS TIMESTAMP(0)))"

    params = [namespace_id, namespace_id, namespace_id]
    if since is not None:
        params.append(since_str)

    # Use INSERT...SELECT to keep data in database
    cursor.execute(f"""
        INSERT INTO {DATABASE}.OL_DATASET
        (dataset_id, namespace_id, name, description, source_type, created_at, updated_at, is_active)
        SELECT
            ? || '/' || TRIM(DatabaseName) || '.' || TRIM(TableName) AS dataset_id,
            ? AS namespace_id,
            TRIM(DatabaseName) || '.' || TRIM(TableName) AS name,
            CASE WHEN TRANSLATE_CHK(CommentString USING UNICODE_TO_LATIN) = 0
                 THEN CAST(CommentString AS VARCHAR(2000))
                 ELSE NULL END AS description,
            CASE WHEN TableKind = 'V' THEN 'VIEW' ELSE 'TABLE' END AS source_type,
            CAST(CreateTimeStamp AS TIMESTAMP(0)) AS created_at,
            CURRENT_TIMESTAMP(0) AS updated_at,
            'Y' AS is_active
        FROM DBC.TablesV
        WHERE TableKind IN ('T', 'V', 'O'){incremental_filter}
          AND NOT EXISTS (
              SELECT 1 FROM {DATABASE}.OL_DATASET od
              WHERE od.dataset_id = ? || '/' || TRIM(DatabaseName) || '.' || TRIM(TableName)
          )
    """, params)

    count = cursor.rowcount
    print(f"  Created {count} datasets")

    # For incremental runs, also UPDATE existing datasets' updated_at for changed tables
    if since is not None:
        cursor.execute(f"""
            UPDATE {DATABASE}.OL_DATASET
            SET updated_at = CURRENT_TIMESTAMP(0)
            WHERE is_active = 'Y'
              AND dataset_id IN (
                  SELECT ? || '/' || TRIM(DatabaseName) || '.' || TRIM(TableName)
                  FROM DBC.TablesV
                  WHERE TableKind IN ('T', 'V', 'O')
                    AND COALESCE(AlterTimeStamp, CreateTimeStamp) > CAST(? AS TIMESTAMP(0))
              )
        """, [namespace_id, since_str])
        updated = cursor.rowcount
        print(f"  Updated {updated} existing datasets (changed since watermark)")

    return count


def _resolve_view_field_types_via_help_column(cursor, database: str, view_name: str) -> dict:
    """Resolve view column types using Teradata's HELP COLUMN syntax.

    Research findings (2026-03-04):
    - HELP COLUMN database.viewname.* returns actual resolved types for view columns
    - DBC.ColumnsV returns NULL for all view column types (causing UNKNOWN in output)
    - DBC.ColumnsJQV requires QVCI to be enabled (not always available)
    - HELP COLUMN works without QVCI and returns the same type codes as DBC.ColumnsV
      (e.g., 'I' for INTEGER, 'CV' for VARCHAR, 'DA' for DATE)
    - Result columns: [0]=Column Name, [1]=Type, [4]=Max Length,
      [5]=Decimal Total Digits, [6]=Decimal Fractional Digits

    Type mapping applied here mirrors the SQL CASE in populate_openlineage_fields()
    so the output is consistent with the QVCI-based path.

    Args:
        cursor: Active Teradata cursor
        database: Database name containing the view
        view_name: Name of the view to inspect

    Returns:
        Dict mapping column_name (str, uppercased) -> type_string (str).
        Returns empty dict on any error (graceful degradation).

    Example:
        types = _resolve_view_field_types_via_help_column(cursor, 'demo_user', 'stg_customers')
        # Returns: {'CUSTOMER_ID': 'INTEGER', 'FIRST_NAME': 'VARCHAR(1000)', ...}
    """
    # Python-side type mapping mirroring the SQL CASE in populate_openlineage_fields()
    # Key = stripped type code (same codes Teradata stores in ColumnType / HELP COLUMN Type)
    SIMPLE_TYPES = {
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
        'PM': 'PERIOD(TIMESTAMP WITH TIME ZONE)',
    }

    def _map_type(type_code: str, max_length, dec_total, dec_frac) -> str:
        """Map a HELP COLUMN type code to a human-readable type string."""
        tc = type_code.strip()

        if tc in SIMPLE_TYPES:
            return SIMPLE_TYPES[tc]

        if tc == 'D':
            total = dec_total if dec_total is not None else 0
            frac = dec_frac if dec_frac is not None else 0
            return f'DECIMAL({total},{frac})'

        if tc in ('TS', 'AT'):
            base = 'TIMESTAMP' if tc == 'TS' else 'TIME'
            frac = dec_frac if dec_frac is not None else 0
            return f'{base}({frac})'

        if tc in ('CF', 'BF'):
            base = 'CHAR' if tc == 'CF' else 'BYTE'
            length = max_length if max_length is not None else 0
            return f'{base}({length})'

        if tc in ('CV', 'BV'):
            base = 'VARCHAR' if tc == 'CV' else 'VARBYTE'
            length = max_length if max_length is not None else 0
            return f'{base}({length})'

        # Fallback: return the raw type code (better than UNKNOWN)
        return tc if tc else 'UNKNOWN'

    try:
        cursor.execute(f'HELP COLUMN {database}.{view_name}.*')
        rows = cursor.fetchall()

        result = {}
        for row in rows:
            col_name = row[0].strip().upper()  # Normalize to uppercase
            type_code = row[1] if row[1] is not None else ''
            max_length = row[4]      # Max Length
            dec_total = row[5]       # Decimal Total Digits
            dec_frac = row[6]        # Decimal Fractional Digits

            type_str = _map_type(type_code, max_length, dec_total, dec_frac)
            result[col_name] = type_str

        return result

    except Exception as e:
        # Graceful degradation: caller will fall back to UNKNOWN types
        return {}


def populate_openlineage_fields(cursor, namespace_id: str, qvci_available: bool = False,
                                since: Optional[datetime] = None) -> int:
    """Populate OL_DATASET_FIELD from DBC views using INSERT...SELECT.

    Tables: Uses DBC.ColumnsV (always has complete column type information).
    Views: Uses HELP COLUMN to resolve actual column types without requiring QVCI.
           The qvci_available parameter is retained for API compatibility but is
           no longer used -- HELP COLUMN replaces both DBC.ColumnsJQV and the
           QVCI-disabled fallback, working correctly on all Teradata environments.

    View field population strategy:
      1. INSERT view fields from DBC.ColumnsV (provides column names, ordinal
         positions, nullable -- but returns NULL for view column types)
      2. UPDATE field_type for each view using HELP COLUMN resolved types
         (HELP COLUMN returns actual resolved types without requiring QVCI)

    When since is provided (incremental mode):
      - Deletes existing OL_DATASET_FIELD rows for changed tables (to re-insert fresh)
      - Only inserts fields for tables/views changed since the watermark
      - Only resolves HELP COLUMN types for changed views
    """
    # SQL CASE for mapping Teradata column type codes to readable names
    type_mapping = """CASE
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
                WHEN TRIM(c.ColumnType) = 'PD' THEN 'PERIOD(DATE)'
                WHEN TRIM(c.ColumnType) = 'PT' THEN 'PERIOD(TIME)'
                WHEN TRIM(c.ColumnType) = 'PS' THEN 'PERIOD(TIMESTAMP)'
                WHEN TRIM(c.ColumnType) = 'PM' THEN 'PERIOD(TIMESTAMP WITH TIME ZONE)'
                WHEN TRIM(c.ColumnType) = 'D' THEN 'DECIMAL(' || COALESCE(c.DecimalTotalDigits, 0) || ',' || COALESCE(c.DecimalFractionalDigits, 0) || ')'
                WHEN TRIM(c.ColumnType) IN ('TS', 'AT') THEN
                    CASE WHEN TRIM(c.ColumnType) = 'TS' THEN 'TIMESTAMP' ELSE 'TIME' END || '(' || COALESCE(c.DecimalFractionalDigits, 0) || ')'
                WHEN TRIM(c.ColumnType) IN ('CF', 'BF') THEN
                    CASE WHEN TRIM(c.ColumnType) = 'CF' THEN 'CHAR' ELSE 'BYTE' END || '(' || COALESCE(c.ColumnLength, 0) || ')'
                WHEN TRIM(c.ColumnType) IN ('CV', 'BV') THEN
                    CASE WHEN TRIM(c.ColumnType) = 'CV' THEN 'VARCHAR' ELSE 'VARBYTE' END || '(' || COALESCE(c.ColumnLength, 0) || ')'
                ELSE COALESCE(TRIM(c.ColumnType), 'UNKNOWN')
            END"""

    since_str = since.strftime('%Y-%m-%d %H:%M:%S') if since is not None else None

    # Incremental mode: delete fields for changed tables so they get re-inserted fresh
    if since is not None:
        cursor.execute(f"""
            SELECT TRIM(DatabaseName) || '.' || TRIM(TableName)
            FROM DBC.TablesV
            WHERE TableKind IN ('T', 'V', 'O')
              AND AlterTimeStamp > CAST(? AS TIMESTAMP(0))
              AND AlterTimeStamp <> CreateTimeStamp
        """, [since_str])
        changed_tables = [row[0] for row in cursor.fetchall()]
        deleted_fields = 0
        for changed_name in changed_tables:
            dataset_id = f"{namespace_id}/{changed_name}"
            cursor.execute(
                f"DELETE FROM {DATABASE}.OL_DATASET_FIELD WHERE dataset_id = ?",
                [dataset_id]
            )
            deleted_fields += cursor.rowcount
        if changed_tables:
            print(f"  Deleted {deleted_fields} field rows for {len(changed_tables)} changed tables")

    params = [namespace_id, namespace_id, namespace_id]
    if since is not None:
        params.append(since_str)

    # AlterTimeStamp filter appended to _insert_fields when in incremental mode
    alter_ts_filter = ""
    if since is not None:
        alter_ts_filter = """
              AND EXISTS (
                  SELECT 1 FROM DBC.TablesV t2
                  WHERE t2.DatabaseName = c.DatabaseName
                    AND t2.TableName = c.TableName
                    AND COALESCE(t2.AlterTimeStamp, t2.CreateTimeStamp) > CAST(? AS TIMESTAMP(0))
              )"""

    def _insert_fields(source_view, table_kinds):
        """Insert fields from a DBC columns view for specific table kinds."""
        cursor.execute(f"""
            INSERT INTO {DATABASE}.OL_DATASET_FIELD
            (field_id, dataset_id, field_name, field_type, field_description,
             ordinal_position, nullable, created_at)
            SELECT
                ? || '/' || TRIM(c.DatabaseName) || '.' || TRIM(c.TableName) || '/' || TRIM(c.ColumnName) AS field_id,
                ? || '/' || TRIM(c.DatabaseName) || '.' || TRIM(c.TableName) AS dataset_id,
                TRIM(c.ColumnName) AS field_name,
                {type_mapping} AS field_type,
                NULL AS field_description,
                c.ColumnId AS ordinal_position,
                c.Nullable AS nullable,
                CURRENT_TIMESTAMP(0) AS created_at
            FROM {source_view} c
            WHERE TRANSLATE_CHK(c.DatabaseName USING UNICODE_TO_LATIN) = 0
              AND TRANSLATE_CHK(c.TableName USING UNICODE_TO_LATIN) = 0
              AND TRANSLATE_CHK(c.ColumnName USING UNICODE_TO_LATIN) = 0
              AND EXISTS (
                  SELECT 1 FROM DBC.TablesV t
                  WHERE t.DatabaseName = c.DatabaseName
                    AND t.TableName = c.TableName
                    AND t.TableKind IN {table_kinds}
              ){alter_ts_filter}
              AND NOT EXISTS (
                  SELECT 1 FROM {DATABASE}.OL_DATASET_FIELD odf
                  WHERE odf.field_id = ? || '/' || TRIM(c.DatabaseName) || '.' || TRIM(c.TableName) || '/' || TRIM(c.ColumnName)
              )
            QUALIFY ROW_NUMBER() OVER (
                PARTITION BY c.DatabaseName, c.TableName, c.ColumnName
                ORDER BY c.ColumnId
            ) = 1
        """, params)
        return cursor.rowcount

    # Table fields: always from DBC.ColumnsV (has complete type info for tables)
    print("\n--- Populating table fields from DBC.ColumnsV ---")
    table_count = _insert_fields('DBC.ColumnsV', "('T', 'O')")
    print(f"  Created {table_count} table fields")

    # View fields: step 1 -- INSERT from DBC.ColumnsV (column names/positions,
    # types will be UNKNOWN since DBC.ColumnsV returns NULL for view column types)
    print("--- Populating view fields from DBC.ColumnsV (names/positions) ---")
    view_count = _insert_fields('DBC.ColumnsV', "('V')")
    print(f"  Created {view_count} view field rows")

    # View fields: step 2 -- UPDATE field_type using HELP COLUMN for each view.
    # HELP COLUMN resolves actual column types without requiring QVCI.
    print("--- Resolving view field types via HELP COLUMN ---")
    views_resolved = 0
    fields_updated = 0

    # When since is provided, scope view list to changed views only
    view_list_params = [namespace_id]
    view_alter_ts_filter = ""
    if since is not None:
        view_alter_ts_filter = "\n              AND COALESCE(t.AlterTimeStamp, t.CreateTimeStamp) > CAST(? AS TIMESTAMP(0))"
        view_list_params.append(since_str)

    try:
        # Fetch distinct views that have fields in OL_DATASET_FIELD (scoped to changed views in incremental mode)
        cursor.execute(f"""
            SELECT DISTINCT
                TRIM(t.DatabaseName) AS db,
                TRIM(t.TableName) AS tbl
            FROM DBC.TablesV t
            WHERE t.TableKind = 'V'
              AND TRANSLATE_CHK(t.DatabaseName USING UNICODE_TO_LATIN) = 0
              AND TRANSLATE_CHK(t.TableName USING UNICODE_TO_LATIN) = 0{view_alter_ts_filter}
              AND EXISTS (
                  SELECT 1 FROM {DATABASE}.OL_DATASET_FIELD odf
                  WHERE odf.dataset_id = ? || '/' || TRIM(t.DatabaseName) || '.' || TRIM(t.TableName)
              )
            ORDER BY 1, 2
        """, view_list_params + [namespace_id])
        view_list = cursor.fetchall()

        for row in view_list:
            db_name, view_name = row[0], row[1]
            col_types = _resolve_view_field_types_via_help_column(cursor, db_name, view_name)

            if not col_types:
                # HELP COLUMN returned nothing (view may be inaccessible) -- skip
                continue

            # UPDATE each column's field_type in OL_DATASET_FIELD
            view_fields_updated = 0
            for col_name_upper, type_str in col_types.items():
                field_id = f"{namespace_id}/{db_name}.{view_name}/{col_name_upper}"
                # Also try mixed-case field_id (column names in OL_DATASET_FIELD are
                # stored as-is from DBC.ColumnsV, so match case-insensitively via UPPER)
                cursor.execute(f"""
                    UPDATE {DATABASE}.OL_DATASET_FIELD
                    SET field_type = ?
                    WHERE dataset_id = ?
                      AND UPPER(field_name) = ?
                      AND field_type = 'UNKNOWN'
                """, [type_str,
                      f"{namespace_id}/{db_name}.{view_name}",
                      col_name_upper])
                view_fields_updated += cursor.rowcount

            if view_fields_updated > 0:
                views_resolved += 1
                fields_updated += view_fields_updated

    except Exception as e:
        print(f"  [WARN] HELP COLUMN type resolution encountered an error: {e}")
        print("  View field types may remain as UNKNOWN for affected views")

    print(f"  Updated {fields_updated} view field types across {views_resolved} views")

    total = table_count + view_count
    print(f"  Total: {total} fields created")
    return total


def populate_lineage_from_fixtures(cursor, namespace_id: str, namespace_uri: str):
    """Populate OL_COLUMN_LINEAGE from fixture mappings."""
    print("\n--- Populating OL_COLUMN_LINEAGE from fixtures ---")

    # Import fixtures
    try:
        from fixtures import COLUMN_LINEAGE_MAPPINGS
    except ImportError:
        # Fallback for direct script execution
        from database.fixtures import COLUMN_LINEAGE_MAPPINGS

    insert_sql = f"""
        INSERT INTO {DATABASE}.OL_COLUMN_LINEAGE
        (lineage_id, run_id, source_namespace, source_dataset, source_field,
         target_namespace, target_dataset, target_field,
         transformation_type, transformation_subtype, transformation_description,
         confidence_score, discovered_at, is_active)
        VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(0), 'Y')
    """

    count = 0
    for src_template, tgt_template, trans_type, confidence in COLUMN_LINEAGE_MAPPINGS:
        # Substitute {DATABASE} placeholder with actual database name
        src = src_template.format(DATABASE=DATABASE)
        tgt = tgt_template.format(DATABASE=DATABASE)
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
                f"Fixture mapping ({trans_type})",
                confidence
            ))
            count += 1
        except Exception as e:
            if "duplicate" not in str(e).lower() and "2801" not in str(e):
                print(f"  Warning: {src}->{tgt}: {e}")

    print(f"  Created {count} lineage records from fixtures")
    return count


def populate_lineage_from_views(cursor, namespace_uri: str, verbose: bool = False,
                                dry_run: bool = False):
    """Populate OL_COLUMN_LINEAGE by deriving lineage from view definitions.

    Fetches view SQL from DBC.TablesV.RequestText, parses with SQLGlot to extract
    column mappings, and inserts results as OL_COLUMN_LINEAGE records.
    """
    print("\n--- Populating OL_COLUMN_LINEAGE from view definitions ---")

    try:
        from view_lineage_extractor import ViewLineageExtractor
    except ImportError:
        try:
            from database.scripts.populate.view_lineage_extractor import ViewLineageExtractor
        except ImportError:
            print("ERROR: Could not import view_lineage_extractor module.")
            print("Make sure sqlglot is installed: pip install sqlglot>=25.0.0")
            return 0

    extractor = ViewLineageExtractor(
        cursor=cursor,
        namespace_uri=namespace_uri,
        database=DATABASE,
        verbose=verbose,
        dry_run=dry_run,
    )

    count = extractor.extract_all()
    return count


def populate_lineage_from_dbql(cursor, namespace_uri: str, since: datetime = None,
                               full: bool = False, verbose: bool = False,
                               dry_run: bool = False):
    """Populate OL_COLUMN_LINEAGE from DBQL tables via SQL parsing."""
    print("\n--- Populating OL_COLUMN_LINEAGE from DBQL ---")

    try:
        from dbql_extractor import DBQLExtractor, configure_logging
    except ImportError:
        try:
            from scripts.populate.dbql_extractor import DBQLExtractor, configure_logging
        except ImportError:
            print("ERROR: Could not import dbql_extractor module.")
            print("Make sure sqlglot is installed: pip install sqlglot>=25.0.0")
            return 0

    # Configure logging
    configure_logging(verbose=verbose)

    # Create extractor
    extractor = DBQLExtractor(
        cursor=cursor,
        namespace_uri=namespace_uri,
        verbose=verbose,
        dry_run=dry_run
    )

    # Check DBQL access
    has_access, message = extractor.check_dbql_access()
    if not has_access:
        print(f"\n{message}")
        return 0

    # Extract lineage
    count = extractor.extract_lineage(since=since, full=full)

    # Print summary
    extractor.print_summary()

    return count


def clear_openlineage_data(cursor, lineage_only: bool = False):
    """Clear existing OpenLineage data.

    Args:
        lineage_only: If True, only clear OL_COLUMN_LINEAGE (for DBQL refresh)
    """
    if lineage_only:
        print("\n--- Clearing OL_COLUMN_LINEAGE ---")
        tables = ["OL_COLUMN_LINEAGE"]
    else:
        print("\n--- Clearing existing OpenLineage data ---")
        tables = ["OL_COLUMN_LINEAGE", "OL_DATASET_FIELD", "OL_DATASET"]

    for table in tables:
        try:
            cursor.execute(f"DELETE FROM {DATABASE}.{table}")
            print(f"  Cleared {table}")
        except Exception as e:
            print(f"  Warning clearing {table}: {e}")


def verify_openlineage_data(cursor):
    """Verify OpenLineage data after population."""
    print("\n--- Verifying OpenLineage data ---")
    for table in ["OL_NAMESPACE", "OL_DATASET", "OL_DATASET_FIELD", "OL_COLUMN_LINEAGE"]:
        try:
            cursor.execute(f"SELECT COUNT(*) FROM {DATABASE}.{table}")
            count = cursor.fetchone()[0]
            print(f"  {table}: {count} rows")
        except Exception as e:
            print(f"  {table}: ERROR - {e}")


def parse_datetime(s: str) -> datetime:
    """Parse datetime string in various formats."""
    formats = [
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d",
        "%Y%m%d",
    ]
    for fmt in formats:
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            continue
    raise ValueError(f"Could not parse datetime: {s}")


def run_preflight_checks(cursor) -> tuple:
    """Run pre-flight checks before population and print status summary.

    Checks:
      1. QVCI status: informational only -- view column types are now resolved via
         HELP COLUMN regardless of QVCI availability (see _resolve_view_field_types_via_help_column)
      2. DB coverage: counts total databases visible in DBC.DatabasesV

    Returns:
        Tuple of (all_checks_passed, qvci_available).
        qvci_available is retained for API compatibility but is no longer used
        by populate_openlineage_fields() -- HELP COLUMN is always used for views.
    """
    print("\n--- Pre-flight checks ---")
    checks_passed = 0
    checks_failed = 0
    qvci_available = False

    # Check 1: QVCI status (informational -- view types now use HELP COLUMN regardless)
    try:
        cursor.execute("SELECT 1 FROM DBC.ColumnsJQV WHERE 1=0")
        print("[INFO] QVCI enabled: DBC.ColumnsJQV accessible (view types resolved via HELP COLUMN)")
        checks_passed += 1
        qvci_available = True
    except Exception as e:
        err_str = str(e)
        if "9719" in err_str:
            print("[INFO] QVCI disabled: view column types will be resolved via HELP COLUMN")
        else:
            print(f"[INFO] QVCI check: {err_str} (view types will be resolved via HELP COLUMN)")
        checks_passed += 1

    # Check 2: DB coverage
    try:
        cursor.execute("SELECT COUNT(*) FROM DBC.DatabasesV")
        row = cursor.fetchone()
        db_count = row[0] if row else 0
        print(f"[OK] DB coverage: {db_count} databases found")
        checks_passed += 1
    except Exception as e:
        print(f"[SKIP] DBC.DatabasesV not accessible -- skipping DB coverage check ({e})")
        # Not accessible is a skip, not a hard failure

    if checks_failed == 0:
        print(f"Pre-flight: {checks_passed} checks passed")
    else:
        print(f"Pre-flight: WARNING - {checks_failed} checks failed")

    return checks_failed == 0, qvci_available


def main():
    # Parse arguments
    parser = argparse.ArgumentParser(
        description="Populate OpenLineage tables from DBC views and lineage sources",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Lineage Sources:
  --fixtures    Use hardcoded test/demo mappings
                Located in database/fixtures/lineage_mappings.py
                Best for: testing, demos, development

  --dbql        Extract lineage from DBQL (Database Query Log) tables (default)
                Parses executed SQL to discover column-level lineage
                Best for: production environments with DBQL enabled

View Lineage:
  View-based lineage extraction is enabled by default. It parses view
  definitions via SQLGlot to derive column mappings. Use --no-views to skip.

Re-run Safety:
  By default, the script is safe to re-run -- existing data is preserved via
  NOT EXISTS guards. Use --full-refresh to clear and rebuild from scratch.

Examples:
  # Default: DBQL extraction + view lineage (safe to re-run)
  python populate_lineage.py
  python populate_lineage.py --dbql --since "2024-01-01"
  python populate_lineage.py --dbql --full

  # Skip view lineage extraction
  python populate_lineage.py --no-views

  # Populate with fixture mappings (testing/demo)
  python populate_lineage.py --fixtures

  # Dry run to preview
  python populate_lineage.py --dry-run
  python populate_lineage.py --dbql --dry-run

  # Clear all OL_* data and repopulate from scratch (destructive)
  python populate_lineage.py --full-refresh

DBQL Requirements:
  - SELECT access on DBC.DBQLogTbl and DBC.DBQLSQLTbl
  - Query logging enabled: BEGIN QUERY LOGGING WITH SQL, OBJECTS ON ALL
  - sqlglot library: pip install sqlglot>=25.0.0
        """
    )

    # Lineage source mode
    mode_group = parser.add_mutually_exclusive_group()
    mode_group.add_argument(
        "--fixtures", "-f",
        action="store_true",
        help="Use fixture mappings for lineage (for testing/demo)"
    )
    mode_group.add_argument(
        "--dbql", "-d",
        action="store_true",
        help="Extract lineage from DBQL tables (default)"
    )
    # Legacy alias for --fixtures
    mode_group.add_argument(
        "--manual", "-m",
        action="store_true",
        help="Alias for --fixtures (deprecated)"
    )

    # DBQL-specific options
    parser.add_argument(
        "--since", "-s",
        type=str,
        help="Extract DBQL records since this date (YYYY-MM-DD)"
    )
    parser.add_argument(
        "--full",
        action="store_true",
        help="Full DBQL extraction (ignore time filter)"
    )

    # Common options
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
        "--views",
        action="store_true",
        default=True,
        help="Derive column lineage from view definitions (default: enabled)"
    )
    parser.add_argument(
        "--no-views",
        action="store_true",
        help="Skip view-based lineage extraction"
    )
    parser.add_argument(
        "--full-refresh",
        action="store_true",
        help="Clear all OL_* data before repopulating (destructive)"
    )
    parser.add_argument(
        "--skip-clear",
        action="store_true",
        help="Deprecated: data is preserved by default. Use --full-refresh to clear."
    )
    parser.add_argument(
        "--lineage-only",
        action="store_true",
        help="Only populate lineage (skip datasets/fields)"
    )

    args = parser.parse_args()

    print("=" * 60)
    print("Populate OpenLineage Tables")
    print("=" * 60)

    # Determine lineage source mode
    use_dbql = args.dbql or (not args.fixtures and not args.manual)
    use_fixtures = args.fixtures or args.manual

    # Parse since datetime if provided
    since = None
    if args.since:
        try:
            since = parse_datetime(args.since)
        except ValueError as e:
            print(f"ERROR: {e}")
            return 1

    if use_dbql:
        print("\nMode: DBQL-based extraction")
        if since:
            print(f"  Since: {since}")
        elif args.full:
            print("  Full extraction (all history)")
        else:
            print("  Default: last 30 days")
    else:
        print("\nMode: Fixture-based mappings")

    if not args.no_views:
        print("  View lineage: enabled (use --no-views to skip)")
    else:
        print("  View lineage: disabled (--no-views)")

    # Connect
    print(f"\nConnecting to {CONFIG['host']}...")
    try:
        conn = teradatasql.connect(**CONFIG)
        cursor = conn.cursor()
        print("Connected successfully!")
    except Exception as e:
        print(f"ERROR: Failed to connect: {e}")
        sys.exit(1)

    # Run pre-flight checks before any INSERT operations
    _, qvci_available = run_preflight_checks(cursor)
    print("Pre-flight complete. Proceeding with population...")

    # Print mode summary
    if args.full_refresh:
        print("\nMode: full refresh (clearing existing data first)")
    else:
        print("\nMode: incremental (preserving existing data)")
    print("System DB exclusion: none (all databases included)")

    # Get namespace
    namespace_uri = get_openlineage_namespace()
    print(f"Namespace: {namespace_uri}")

    if args.dry_run:
        print("\n[DRY RUN] Would populate:")
        print(f"  - 1 namespace")
        if not args.lineage_only:
            print(f"  - ~N datasets from DBC.TablesV")
            print(f"  - ~N fields from DBC.ColumnsV (tables) + HELP COLUMN type resolution (views)")
        if use_dbql:
            print(f"  - Column lineage from DBQL tables")
        else:
            try:
                from fixtures import COLUMN_LINEAGE_MAPPINGS
            except ImportError:
                from database.fixtures import COLUMN_LINEAGE_MAPPINGS
            print(f"  - {len(COLUMN_LINEAGE_MAPPINGS)} column lineage records from fixtures")
        if not args.no_views:
            print(f"  - Column lineage from view definitions (SQLGlot parsing)")
        else:
            print(f"  - View lineage extraction: SKIPPED (--no-views)")
    else:
        # Clear existing data only when --full-refresh is explicitly requested
        if args.full_refresh:
            print("\n[FULL REFRESH] Clearing existing data before repopulation...")
            clear_openlineage_data(cursor, lineage_only=args.lineage_only)

        # Populate namespace
        namespace_id = populate_openlineage_namespace(cursor, namespace_uri)

        # Populate datasets and fields (unless lineage-only mode)
        if not args.lineage_only:
            populate_openlineage_datasets(cursor, namespace_id)
            populate_openlineage_fields(cursor, namespace_id, qvci_available=qvci_available)

        # Populate lineage based on mode
        if use_dbql:
            populate_lineage_from_dbql(
                cursor, namespace_uri,
                since=since,
                full=args.full,
                verbose=args.verbose,
                dry_run=args.dry_run
            )
        else:
            populate_lineage_from_fixtures(cursor, namespace_id, namespace_uri)

        # Derive lineage from view definitions (default, opt out with --no-views)
        if not args.no_views:
            populate_lineage_from_views(
                cursor, namespace_uri,
                verbose=args.verbose,
                dry_run=args.dry_run
            )

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
