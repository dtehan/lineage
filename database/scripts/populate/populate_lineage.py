#!/usr/bin/env python3
"""
Populate OpenLineage Tables

Extracts metadata from DBC views and populates OpenLineage-compliant lineage data.
Supports multiple lineage sources:
  - Manual fixtures (--fixtures): Hardcoded test/demo mappings
  - DBQL extraction (--dbql): Parse executed SQL from query logs

Usage:
  python populate_lineage.py              # Use fixtures (default, for testing/demo)
  python populate_lineage.py --fixtures   # Explicitly use fixture mappings
  python populate_lineage.py --dbql       # Extract from DBQL tables
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


def populate_openlineage_datasets(cursor, namespace_id: str):
    """Populate OL_DATASET from DBC.TablesV using INSERT...SELECT."""
    print("\n--- Populating OL_DATASET from DBC.TablesV ---")

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
        WHERE TableKind IN ('T', 'V', 'O')
          AND TableName NOT LIKE 'LIN_%'
          AND TableName NOT LIKE 'OL_%'
          AND NOT EXISTS (
              SELECT 1 FROM {DATABASE}.OL_DATASET od
              WHERE od.dataset_id = ? || '/' || TRIM(DatabaseName) || '.' || TRIM(TableName)
          )
    """, (namespace_id, namespace_id, namespace_id))

    count = cursor.rowcount
    print(f"  Created {count} datasets")
    return count


def populate_openlineage_fields(cursor, namespace_id: str):
    """Populate OL_DATASET_FIELD from DBC.ColumnsV using INSERT...SELECT.

    Note: ColumnsV may return NULL for view column types. This is acceptable for
    now as we focus on table columns. View column types can be enhanced later.
    """
    print("\n--- Populating OL_DATASET_FIELD from DBC.ColumnsV ---")

    # Use INSERT...SELECT with SQL-based type conversion
    cursor.execute(f"""
        INSERT INTO {DATABASE}.OL_DATASET_FIELD
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
            NULL AS field_description,
            c.ColumnId AS ordinal_position,
            c.Nullable AS nullable,
            CURRENT_TIMESTAMP(0) AS created_at
        FROM DBC.ColumnsV c
        WHERE c.TableName NOT LIKE 'LIN_%'
          AND c.TableName NOT LIKE 'OL_%'
          AND TRANSLATE_CHK(c.DatabaseName USING UNICODE_TO_LATIN) = 0
          AND TRANSLATE_CHK(c.TableName USING UNICODE_TO_LATIN) = 0
          AND TRANSLATE_CHK(c.ColumnName USING UNICODE_TO_LATIN) = 0
          AND EXISTS (
              SELECT 1 FROM DBC.TablesV t
              WHERE t.DatabaseName = c.DatabaseName
                AND t.TableName = c.TableName
                AND t.TableKind IN ('T', 'V', 'O')
          )
          AND NOT EXISTS (
              SELECT 1 FROM {DATABASE}.OL_DATASET_FIELD odf
              WHERE odf.field_id = ? || '/' || TRIM(c.DatabaseName) || '.' || TRIM(c.TableName) || '/' || TRIM(c.ColumnName)
          )
    """, (namespace_id, namespace_id, namespace_id))

    count = cursor.rowcount
    print(f"  Created {count} fields")
    return count


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


def main():
    # Parse arguments
    parser = argparse.ArgumentParser(
        description="Populate OpenLineage tables from DBC views and lineage sources",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Lineage Sources:
  --fixtures    Use hardcoded test/demo mappings (default)
                Located in database/fixtures/lineage_mappings.py
                Best for: testing, demos, development

  --dbql        Extract lineage from DBQL (Database Query Log) tables
                Parses executed SQL to discover column-level lineage
                Best for: production environments with DBQL enabled

Examples:
  # Populate with fixture mappings (testing/demo)
  python populate_lineage.py
  python populate_lineage.py --fixtures

  # Extract lineage from DBQL (production)
  python populate_lineage.py --dbql
  python populate_lineage.py --dbql --since "2024-01-01"
  python populate_lineage.py --dbql --full

  # Dry run to preview
  python populate_lineage.py --dry-run
  python populate_lineage.py --dbql --dry-run

  # Append mode (don't clear existing lineage)
  python populate_lineage.py --skip-clear

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
        help="Use fixture mappings for lineage (default)"
    )
    mode_group.add_argument(
        "--dbql", "-d",
        action="store_true",
        help="Extract lineage from DBQL tables"
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
        "--skip-clear",
        action="store_true",
        help="Skip clearing existing data (append mode)"
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
    use_dbql = args.dbql
    use_fixtures = args.fixtures or args.manual or (not args.dbql)

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
        if not args.lineage_only:
            print(f"  - ~N datasets from DBC.TablesV")
            print(f"  - ~N fields from DBC.ColumnsV")
        if use_dbql:
            print(f"  - Column lineage from DBQL tables")
        else:
            try:
                from fixtures import COLUMN_LINEAGE_MAPPINGS
            except ImportError:
                from database.fixtures import COLUMN_LINEAGE_MAPPINGS
            print(f"  - {len(COLUMN_LINEAGE_MAPPINGS)} column lineage records from fixtures")
    else:
        # Clear existing data (unless skipped)
        if not args.skip_clear:
            clear_openlineage_data(cursor, lineage_only=args.lineage_only)

        # Populate namespace
        namespace_id = populate_openlineage_namespace(cursor, namespace_uri)

        # Populate datasets and fields (unless lineage-only mode)
        if not args.lineage_only:
            populate_openlineage_datasets(cursor, namespace_id)
            populate_openlineage_fields(cursor, namespace_id)

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
