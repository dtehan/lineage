#!/usr/bin/env python3
"""
DBQL-Based Lineage Extraction for Teradata

Extracts table-level and column-level lineage from DBQL (Database Query Log) tables
by parsing the SQL text directly. This approach works even when DBQLObjTbl doesn't
log write operations with TypeOfUse 3/4 (as in ClearScape Analytics environments).

Phases:
  1. Table-level lineage via SQL parsing
  2. Column-level lineage via SQL parsing

Incremental Support:
  Uses LIN_WATERMARK table to track last extraction timestamp.
  Subsequent runs only process queries newer than the watermark.

Usage:
  python extract_dbql_lineage.py                    # Incremental run (since last watermark)
  python extract_dbql_lineage.py --full             # Full extraction (all history)
  python extract_dbql_lineage.py --since 2024-01-01 # Extract since specific date
  python extract_dbql_lineage.py --dry-run          # Preview without changes

Environment Variables:
  TD_HOST, TD_USER, TD_PASSWORD, TD_DATABASE (or use .env file)
"""

import argparse
import hashlib
import sys
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Set, Tuple

import teradatasql

from db_config import CONFIG

# Default lookback period for initial extraction (30 days)
DEFAULT_LOOKBACK_DAYS = 30

# Get database name from config for SQL templates
DB_NAME = CONFIG.get('database', 'demo_user')

# Watermark source name
WATERMARK_SOURCE = "DBQL_LINEAGE_EXTRACTION"


def generate_lineage_id(source: str, target: str) -> str:
    """Generate a deterministic lineage ID."""
    combined = f"{source}->{target}"
    return hashlib.md5(combined.encode()).hexdigest()[:16]


def format_timestamp(dt: datetime) -> str:
    """Format datetime for Teradata TIMESTAMP column."""
    return dt.strftime('%Y-%m-%d %H:%M:%S')


class DBQLLineageExtractor:
    """Extracts lineage from DBQL tables by parsing SQL text."""

    def __init__(self, dry_run: bool = False, verbose: bool = False):
        self.dry_run = dry_run
        self.verbose = verbose
        self.conn = None
        self.cursor = None
        self.parser = None
        self.stats = {
            'queries_processed': 0,
            'queries_with_lineage': 0,
            'table_lineage_inserted': 0,
            'column_lineage_inserted': 0,
        }

    def connect(self) -> bool:
        """Connect to Teradata."""
        print(f"Connecting to {CONFIG['host']}...")
        try:
            self.conn = teradatasql.connect(**CONFIG)
            self.cursor = self.conn.cursor()
            print("  Connected successfully!")
            return True
        except Exception as e:
            print(f"  ERROR: Failed to connect: {e}")
            return False

    def close(self):
        """Close connection."""
        if self.cursor:
            self.cursor.close()
        if self.conn:
            self.conn.close()

    def _init_parser(self) -> bool:
        """Initialize the SQL parser."""
        try:
            from sql_parser import TeradataSQLParser
            self.parser = TeradataSQLParser()
            return True
        except ImportError as e:
            print(f"  ERROR: Could not import sql_parser: {e}")
            print("  Install sqlglot: pip install sqlglot>=25.0.0")
            return False

    def check_dbql_access(self) -> bool:
        """Verify access to DBQL tables."""
        print("\nChecking DBQL access...")
        try:
            self.cursor.execute("SELECT TOP 1 1 FROM DBC.DBQLogTbl")
            print("  DBQL access confirmed")
            return True
        except teradatasql.DatabaseError as e:
            if "3523" in str(e) or "access" in str(e).lower():
                print("  ERROR: No access to DBQL tables")
                print("  DBQL logging may not be enabled or you lack SELECT privileges")
            else:
                print(f"  ERROR: {e}")
            return False

    def get_watermark(self) -> Optional[datetime]:
        """Get the last extraction timestamp from watermark table."""
        try:
            self.cursor.execute(f"""
                SELECT last_extracted_at
                FROM {DB_NAME}.LIN_WATERMARK
                WHERE source_name = ?
            """, (WATERMARK_SOURCE,))
            row = self.cursor.fetchone()
            if row and row[0]:
                return row[0]
        except Exception as e:
            if self.verbose:
                print(f"  Note: Could not read watermark: {e}")
        return None

    def update_watermark(self, timestamp: datetime, row_count: int, status: str):
        """Update or insert watermark after extraction."""
        if self.dry_run:
            return

        ts_str = format_timestamp(timestamp)

        # Try update first
        try:
            self.cursor.execute(f"""
                UPDATE {DB_NAME}.LIN_WATERMARK
                SET last_extracted_at = CAST(? AS TIMESTAMP(0)),
                    row_count = ?,
                    status = ?,
                    updated_at = CURRENT_TIMESTAMP(0)
                WHERE source_name = ?
            """, (ts_str, row_count, status, WATERMARK_SOURCE))

            # Check if update affected any rows by trying insert
            self.cursor.execute(f"""
                INSERT INTO {DB_NAME}.LIN_WATERMARK (source_name, last_extracted_at, row_count, status, updated_at)
                SELECT ?, CAST(? AS TIMESTAMP(0)), ?, ?, CURRENT_TIMESTAMP(0)
                WHERE NOT EXISTS (
                    SELECT 1 FROM {DB_NAME}.LIN_WATERMARK WHERE source_name = ?
                )
            """, (WATERMARK_SOURCE, ts_str, row_count, status, WATERMARK_SOURCE))

        except Exception as e:
            if self.verbose:
                print(f"  Warning: Could not update watermark: {e}")

    def fetch_queries(self, since: Optional[datetime] = None) -> List[Tuple]:
        """Fetch INSERT/UPDATE queries from DBQL since the given timestamp."""
        if since:
            since_str = format_timestamp(since)
            print(f"\nFetching queries since: {since_str}")

            self.cursor.execute(f"""
                SELECT DISTINCT
                    q.QueryID,
                    q.StatementType,
                    CAST(s.SQLTextInfo AS VARCHAR(32000)) as query_text,
                    q.StartTime,
                    q.DefaultDatabase
                FROM DBC.DBQLogTbl q
                JOIN DBC.DBQLSQLTbl s
                    ON q.QueryID = s.QueryID
                    AND q.ProcID = s.ProcID
                WHERE q.StatementType IN ('Insert', 'Merge Into', 'Create Table', 'Update')
                  AND q.ErrorCode = 0
                  AND q.StartTime > CAST('{since_str}' AS TIMESTAMP(0))
                  AND s.SQLRowNo = 1
                ORDER BY q.StartTime
            """)
        else:
            print("\nFetching ALL queries (full extraction)...")

            self.cursor.execute("""
                SELECT DISTINCT
                    q.QueryID,
                    q.StatementType,
                    CAST(s.SQLTextInfo AS VARCHAR(32000)) as query_text,
                    q.StartTime,
                    q.DefaultDatabase
                FROM DBC.DBQLogTbl q
                JOIN DBC.DBQLSQLTbl s
                    ON q.QueryID = s.QueryID
                    AND q.ProcID = s.ProcID
                WHERE q.StatementType IN ('Insert', 'Merge Into', 'Create Table', 'Update')
                  AND q.ErrorCode = 0
                  AND s.SQLRowNo = 1
                ORDER BY q.StartTime
            """)

        queries = self.cursor.fetchall()
        print(f"  Found {len(queries)} queries to process")
        return queries

    def extract_lineage(self, since: Optional[datetime] = None, full: bool = False) -> bool:
        """
        Main extraction method. Extracts both table and column lineage
        by parsing SQL text from DBQL.

        Args:
            since: Extract queries since this timestamp (overrides watermark)
            full: If True, ignore watermark and extract all history

        Returns:
            True if extraction succeeded
        """
        print("\n" + "=" * 60)
        print("DBQL Lineage Extraction")
        print("=" * 60)

        # Initialize parser
        if not self._init_parser():
            return False

        # Determine extraction start time
        if full:
            extraction_since = None
            print("\nMode: FULL extraction (all history)")
        elif since:
            extraction_since = since
            print(f"\nMode: Extract since {format_timestamp(since)}")
        else:
            # Use watermark for incremental
            extraction_since = self.get_watermark()
            if extraction_since:
                print(f"\nMode: INCREMENTAL (since watermark: {format_timestamp(extraction_since)})")
            else:
                # First run - use default lookback
                extraction_since = datetime.now() - timedelta(days=DEFAULT_LOOKBACK_DAYS)
                print(f"\nMode: INITIAL (last {DEFAULT_LOOKBACK_DAYS} days)")

        # Clear existing lineage if doing full extraction
        if full and not self.dry_run:
            print("\nClearing existing lineage data...")
            self.cursor.execute(f"DELETE FROM {DB_NAME}.LIN_COLUMN_LINEAGE")
            self.cursor.execute(f"DELETE FROM {DB_NAME}.LIN_TABLE_LINEAGE")
            print("  Cleared LIN_COLUMN_LINEAGE and LIN_TABLE_LINEAGE")

        # Fetch queries
        queries = self.fetch_queries(extraction_since)

        if not queries:
            print("\n  No new queries to process")
            return True

        if self.dry_run:
            print(f"\n[DRY RUN] Would process {len(queries)} queries")
            return True

        # Process queries and extract lineage
        print("\nExtracting lineage...")
        table_lineage_set: Set[Tuple] = set()
        column_lineage_records: List[Dict] = []
        latest_query_time = None

        for i, (query_id, stmt_type, query_text, query_time, default_database) in enumerate(queries):
            if not query_text:
                continue

            self.stats['queries_processed'] += 1

            if (i + 1) % 1000 == 0:
                print(f"  Processed {i + 1}/{len(queries)} queries...")

            # Track latest query time for watermark
            if query_time and (latest_query_time is None or query_time > latest_query_time):
                latest_query_time = query_time

            try:
                # Set the default database context for this query
                # This ensures unqualified table names resolve to the correct database
                if default_database:
                    self.parser.default_database = default_database.strip()

                # Parse SQL and extract lineage
                records = self.parser.extract_column_lineage(query_text, stmt_type)

                if records:
                    self.stats['queries_with_lineage'] += 1

                    for rec in records:
                        # Skip unresolved tables
                        if rec['source_table'] == 'UNKNOWN':
                            continue

                        source_tbl_id = f"{rec['source_database']}.{rec['source_table']}"
                        target_tbl_id = f"{rec['target_database']}.{rec['target_table']}"

                        # Track table lineage
                        table_lineage_set.add((
                            source_tbl_id, target_tbl_id,
                            rec['source_database'], rec['source_table'],
                            rec['target_database'], rec['target_table']
                        ))

                        # Track column lineage
                        column_lineage_records.append({
                            'query_id': str(query_id),
                            **rec
                        })

            except Exception as e:
                if self.verbose:
                    print(f"  Warning parsing query {query_id}: {e}")

        # Insert table lineage
        print(f"\nInserting table lineage ({len(table_lineage_set)} records)...")
        now_ts = format_timestamp(datetime.now())

        for src_tbl_id, tgt_tbl_id, src_db, src_tbl, tgt_db, tgt_tbl in table_lineage_set:
            lineage_id = generate_lineage_id(src_tbl_id, tgt_tbl_id)
            try:
                self.cursor.execute(f"""
                    INSERT INTO {DB_NAME}.LIN_TABLE_LINEAGE (
                        lineage_id, source_table_id, source_database, source_table,
                        target_table_id, target_database, target_table,
                        relationship_type, query_count, first_seen_at, last_seen_at, is_active
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'INSERT_SELECT', 1,
                        CAST('{now_ts}' AS TIMESTAMP(0)),
                        CAST('{now_ts}' AS TIMESTAMP(0)),
                        'Y')
                """, (lineage_id, src_tbl_id, src_db, src_tbl, tgt_tbl_id, tgt_db, tgt_tbl))
                self.stats['table_lineage_inserted'] += 1
            except teradatasql.DatabaseError as e:
                # Handle duplicate - update last_seen_at instead
                if "2801" in str(e):
                    try:
                        self.cursor.execute(f"""
                            UPDATE {DB_NAME}.LIN_TABLE_LINEAGE
                            SET last_seen_at = CAST('{now_ts}' AS TIMESTAMP(0)),
                                query_count = query_count + 1
                            WHERE lineage_id = ?
                        """, (lineage_id,))
                    except:
                        pass
                elif self.verbose:
                    print(f"  Warning inserting table lineage: {e}")

        # Insert column lineage
        print(f"Inserting column lineage ({len(column_lineage_records)} records)...")

        for rec in column_lineage_records:
            source_col_id = f"{rec['source_database']}.{rec['source_table']}.{rec['source_column']}"
            target_col_id = f"{rec['target_database']}.{rec['target_table']}.{rec['target_column']}"
            lineage_id = generate_lineage_id(source_col_id, target_col_id)

            try:
                self.cursor.execute(f"""
                    INSERT INTO {DB_NAME}.LIN_COLUMN_LINEAGE (
                        lineage_id, source_column_id, source_database, source_table, source_column,
                        target_column_id, target_database, target_table, target_column,
                        transformation_type, confidence_score, query_id,
                        discovered_at, last_seen_at, is_active
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                        CAST('{now_ts}' AS TIMESTAMP(0)),
                        CAST('{now_ts}' AS TIMESTAMP(0)),
                        'Y')
                """, (
                    lineage_id, source_col_id,
                    rec['source_database'], rec['source_table'], rec['source_column'],
                    target_col_id,
                    rec['target_database'], rec['target_table'], rec['target_column'],
                    rec.get('transformation_type', 'DIRECT'),
                    rec.get('confidence_score', 0.9),
                    rec['query_id']
                ))
                self.stats['column_lineage_inserted'] += 1
            except teradatasql.DatabaseError as e:
                # Handle duplicate - update last_seen_at
                if "2801" in str(e):
                    try:
                        self.cursor.execute(f"""
                            UPDATE {DB_NAME}.LIN_COLUMN_LINEAGE
                            SET last_seen_at = CAST('{now_ts}' AS TIMESTAMP(0))
                            WHERE lineage_id = ?
                        """, (lineage_id,))
                    except:
                        pass
                elif self.verbose:
                    print(f"  Warning inserting column lineage: {e}")

        # Update watermark
        if latest_query_time:
            self.update_watermark(
                latest_query_time,
                self.stats['column_lineage_inserted'],
                "SUCCESS"
            )
            print(f"\nWatermark updated to: {format_timestamp(latest_query_time)}")

        return True

    def print_summary(self):
        """Print extraction summary."""
        print("\n" + "=" * 60)
        print("EXTRACTION SUMMARY")
        print("=" * 60)
        print(f"  Queries processed:        {self.stats['queries_processed']}")
        print(f"  Queries with lineage:     {self.stats['queries_with_lineage']}")
        print(f"  Table lineage inserted:   {self.stats['table_lineage_inserted']}")
        print(f"  Column lineage inserted:  {self.stats['column_lineage_inserted']}")

        # Get totals from database
        if self.cursor:
            try:
                self.cursor.execute(f"SELECT COUNT(*) FROM {DB_NAME}.LIN_TABLE_LINEAGE")
                total_table = self.cursor.fetchone()[0]
                self.cursor.execute(f"SELECT COUNT(*) FROM {DB_NAME}.LIN_COLUMN_LINEAGE")
                total_column = self.cursor.fetchone()[0]
                print(f"\n  Total in LIN_TABLE_LINEAGE:  {total_table}")
                print(f"  Total in LIN_COLUMN_LINEAGE: {total_column}")
            except:
                pass


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
    parser = argparse.ArgumentParser(
        description="Extract lineage from DBQL tables",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Incremental run (processes new queries since last run)
  python extract_dbql_lineage.py

  # Full extraction (all DBQL history, clears existing lineage)
  python extract_dbql_lineage.py --full

  # Extract from a specific date
  python extract_dbql_lineage.py --since "2024-01-01"

  # Dry run to see what would be processed
  python extract_dbql_lineage.py --dry-run

  # Verbose output
  python extract_dbql_lineage.py -v
        """
    )
    parser.add_argument(
        "--full", "-f",
        action="store_true",
        help="Full extraction (ignore watermark, process all history)"
    )
    parser.add_argument(
        "--since", "-s",
        type=str,
        help="Extract records since this datetime (YYYY-MM-DD or YYYY-MM-DD HH:MM:SS)"
    )
    parser.add_argument(
        "--dry-run", "-n",
        action="store_true",
        help="Show what would be extracted without making changes"
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Verbose output"
    )

    args = parser.parse_args()

    # Parse since datetime if provided
    since = None
    if args.since:
        try:
            since = parse_datetime(args.since)
        except ValueError as e:
            print(f"ERROR: {e}")
            return 1

    print("=" * 60)
    print("DBQL-Based Lineage Extraction")
    print("=" * 60)

    if args.dry_run:
        print("\n[DRY RUN MODE - No changes will be made]")

    # Create extractor
    extractor = DBQLLineageExtractor(dry_run=args.dry_run, verbose=args.verbose)

    # Connect
    if not extractor.connect():
        return 1

    try:
        # Check DBQL access
        if not extractor.check_dbql_access():
            print("\nDBQL is not accessible. Possible reasons:")
            print("  1. DBQL logging is not enabled on this system")
            print("  2. Your user lacks SELECT privileges on DBC.DBQLogTbl")
            print("\nFor non-DBQL environments, use: python populate_lineage.py --manual")
            return 1

        # Run extraction
        success = extractor.extract_lineage(since=since, full=args.full)

        if success:
            extractor.print_summary()

        if args.dry_run:
            print("\n[DRY RUN - No changes were made]")

        return 0 if success else 1

    except Exception as e:
        print(f"\nERROR: {e}")
        if args.verbose:
            import traceback
            traceback.print_exc()
        return 1

    finally:
        extractor.close()


if __name__ == "__main__":
    sys.exit(main())
