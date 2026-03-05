#!/usr/bin/env python3
"""
DBQL-Based Lineage Extraction for OpenLineage Schema

Extracts column-level lineage from DBQL (Database Query Log) tables
by parsing SQL text using SQLGlot. Populates OL_COLUMN_LINEAGE table.

This module provides the core extraction logic used by populate_lineage.py --dbql.

Key Features:
  - Extracts SQL from DBC.DBQLogTbl + DBC.DBQLSQLTbl
  - Parses SQL using SQLGlot with Teradata dialect
  - Maps column dependencies to OL_COLUMN_LINEAGE records
  - Supports incremental extraction via watermark tracking
  - Graceful error handling with detailed logging

Usage:
  from dbql_extractor import DBQLExtractor

  extractor = DBQLExtractor(cursor, namespace_uri)
  count = extractor.extract_lineage(since=datetime.now() - timedelta(days=30))

Requirements:
  - sqlglot>=25.0.0: pip install sqlglot
  - SELECT access on DBC.DBQLogTbl and DBC.DBQLSQLTbl
  - Query logging enabled: BEGIN QUERY LOGGING WITH SQL, OBJECTS ON ALL
"""

from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

import hashlib
import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Set, Tuple

import teradatasql

from db_config import CONFIG
from watermark_store import WatermarkStore
from wildcard_resolver import WildcardResolver

# Import SQL parser from canonical location (lineage-api/utils/)
# Go up to project root: dbql_extractor.py -> populate -> scripts -> database -> project_root
project_root = Path(__file__).resolve().parent.parent.parent.parent
sys.path.insert(0, str(project_root / "lineage-api"))
from utils.sql_parser import TeradataSQLParser


# Module-level logger
logger = logging.getLogger('dbql_extractor')


# Get database name from config
DATABASE = CONFIG.get('database', 'demo_user')

# Default lookback period for initial extraction
DEFAULT_LOOKBACK_DAYS = 30

# OpenLineage transformation type mapping
# Maps SQL operation types to (OL_type, OL_subtype, default_confidence)
TRANSFORMATION_MAPPING = {
    "DIRECT": ("DIRECT", "IDENTITY", 0.95),
    "CALCULATION": ("DIRECT", "TRANSFORMATION", 0.85),
    "AGGREGATION": ("DIRECT", "AGGREGATION", 0.90),
    "JOIN": ("INDIRECT", "JOIN", 0.80),
    "FILTER": ("INDIRECT", "FILTER", 0.75),
    "UNKNOWN": ("DIRECT", "TRANSFORMATION", 0.60),
}


@dataclass
class ExtractionStats:
    """Track extraction outcomes for summary reporting."""
    queries_processed: int = 0
    queries_succeeded: int = 0
    queries_failed: int = 0
    queries_skipped: int = 0
    lineage_records: int = 0
    wildcards_expanded: int = 0
    wildcards_skipped: int = 0
    errors: List[Dict] = field(default_factory=list)

    def record_success(self, lineage_count: int = 0):
        """Record a successfully processed query."""
        self.queries_processed += 1
        self.queries_succeeded += 1
        self.lineage_records += lineage_count

    def record_failure(self, query_id: str, table_name: str, error_type: str, error_msg: str):
        """Record a failed query with error context."""
        self.queries_processed += 1
        self.queries_failed += 1
        # Limit stored errors to prevent memory issues
        if len(self.errors) < 1000:
            self.errors.append({
                'query_id': query_id,
                'table_name': table_name,
                'error_type': error_type,
                'error_message': error_msg[:200]
            })

    def record_skip(self, reason: str = ""):
        """Record a skipped query."""
        self.queries_processed += 1
        self.queries_skipped += 1

    def summary(self) -> str:
        """Return summary string for logging."""
        return (f"{self.queries_succeeded} succeeded, {self.queries_failed} failed, "
                f"{self.queries_skipped} skipped, {self.lineage_records} lineage records")


def generate_lineage_id(source: str, target: str) -> str:
    """Generate a deterministic lineage ID from source and target column paths."""
    combined = f"{source}->{target}"
    return hashlib.md5(combined.encode()).hexdigest()[:24]


def map_transformation_type(sql_type: str) -> Tuple[str, str, float]:
    """Map SQL transformation type to OpenLineage (type, subtype, confidence)."""
    return TRANSFORMATION_MAPPING.get(
        sql_type.upper(),
        TRANSFORMATION_MAPPING["UNKNOWN"]
    )


class DBQLExtractor:
    """Extracts column-level lineage from DBQL tables."""

    def __init__(
        self,
        cursor,
        namespace_uri: str,
        verbose: bool = False,
        dry_run: bool = False
    ):
        """
        Initialize the DBQL extractor.

        Args:
            cursor: Active Teradata database cursor
            namespace_uri: OpenLineage namespace URI (e.g., teradata://host:port)
            verbose: Enable verbose logging
            dry_run: Preview mode, don't write to database
        """
        self.cursor = cursor
        self.namespace_uri = namespace_uri
        self.verbose = verbose
        self.dry_run = dry_run
        self.parser = TeradataSQLParser(default_database=DATABASE)
        self.stats = ExtractionStats()
        self.watermark = WatermarkStore(cursor, DATABASE)
        self._used_watermark = False

    def check_dbql_access(self) -> Tuple[bool, str]:
        """
        Verify access to DBQL tables.

        Returns:
            Tuple of (has_access: bool, message: str)
        """
        logger.info("Checking DBQL access...")
        try:
            self.cursor.execute("SELECT TOP 1 1 FROM DBC.DBQLogTbl")
            logger.info("DBQL access confirmed")
            return True, "DBQL access confirmed"
        except teradatasql.DatabaseError as e:
            error_str = str(e)
            if "3523" in error_str or "access" in error_str.lower():
                message = (
                    "No access to DBQL tables.\n\n"
                    "This may indicate:\n"
                    "  1. DBQL logging is not enabled on this Teradata system\n"
                    "  2. Your user lacks SELECT privileges on DBC.DBQLogTbl\n"
                    "  3. Your Teradata environment doesn't support DBQL\n\n"
                    "Fallback: Use manual lineage mappings instead:\n"
                    "  python populate_lineage.py --manual\n\n"
                    "To enable DBQL access, contact your DBA to grant:\n"
                    "  GRANT SELECT ON DBC.DBQLogTbl TO your_user;\n"
                    "  GRANT SELECT ON DBC.DBQLSQLTbl TO your_user;"
                )
                logger.warning("No DBQL access: %s", e)
                return False, message
            else:
                logger.error("DBQL check failed: %s", e)
                return False, f"DBQL check failed: {e}"

    def fetch_queries(self, since: Optional[datetime] = None) -> List[Tuple]:
        """
        Fetch INSERT/UPDATE/MERGE queries from DBQL.

        Args:
            since: Only fetch queries after this timestamp

        Returns:
            List of (QueryID, StatementType, SQLText, StartTime, DefaultDatabase, sql_length) tuples
        """
        if since:
            since_str = since.strftime('%Y-%m-%d %H:%M:%S')
            logger.info("Fetching queries since: %s", since_str)

            self.cursor.execute(f"""
                SELECT DISTINCT
                    q.QueryID,
                    q.StatementType,
                    CAST(s.SQLTextInfo AS VARCHAR(32000)) as query_text,
                    q.StartTime,
                    q.DefaultDatabase,
                    LENGTH(s.SQLTextInfo) as sql_length
                FROM DBC.DBQLogTbl q
                JOIN DBC.DBQLSQLTbl s
                    ON q.QueryID = s.QueryID
                    AND q.ProcID = s.ProcID
                WHERE q.StatementType IN ('Insert', 'Merge Into', 'Create Table', 'Create View', 'Update')
                  AND q.ErrorCode = 0
                  AND q.StartTime > CAST('{since_str}' AS TIMESTAMP(0))
                  AND s.SQLRowNo = 1
                ORDER BY q.StartTime
            """)
        else:
            logger.info("Fetching ALL queries (full extraction)...")

            self.cursor.execute("""
                SELECT DISTINCT
                    q.QueryID,
                    q.StatementType,
                    CAST(s.SQLTextInfo AS VARCHAR(32000)) as query_text,
                    q.StartTime,
                    q.DefaultDatabase,
                    LENGTH(s.SQLTextInfo) as sql_length
                FROM DBC.DBQLogTbl q
                JOIN DBC.DBQLSQLTbl s
                    ON q.QueryID = s.QueryID
                    AND q.ProcID = s.ProcID
                WHERE q.StatementType IN ('Insert', 'Merge Into', 'Create Table', 'Create View', 'Update')
                  AND q.ErrorCode = 0
                  AND s.SQLRowNo = 1
                ORDER BY q.StartTime
            """)

        queries = self.cursor.fetchall()

        # Warn about truncated SQL text
        truncated_count = sum(1 for q in queries if q[5] and q[5] > 32000)
        if truncated_count:
            logger.warning(
                "DBQL truncation: %d of %d queries exceed VARCHAR(32000) limit - "
                "lineage extraction may be incomplete for these queries",
                truncated_count, len(queries)
            )

        logger.info("Found %d queries to process", len(queries))
        return queries

    def _extract_target_table(self, query_text: str) -> str:
        """Extract target table name from query text for error context."""
        if not query_text:
            return "UNKNOWN"
        import re
        match = re.search(r'(?:INSERT|MERGE)\s+INTO\s+(["\w]+(?:\.["\w]+)?)', query_text, re.IGNORECASE)
        if match:
            return match.group(1).replace('"', '')
        return "UNKNOWN"

    def _collect_table_references(self, queries: List[Tuple]) -> Set[Tuple[str, str]]:
        """Collect unique (database, table) references from all queries for batch metadata warmup.

        This pre-scan enables batch metadata querying instead of per-query N+1 pattern.
        Uses lightweight regex scanning (not full parsing) for speed.
        """
        import re
        table_refs = set()

        for query_id, stmt_type, query_text, query_time, default_db, sql_length in queries:
            if not query_text:
                continue

            db = (default_db or DATABASE).strip()

            # Extract table references from FROM and JOIN clauses
            # Lightweight regex: catches database.table and standalone table names
            pattern = r'(?:FROM|JOIN|INTO|UPDATE|MERGE\s+INTO)\s+(["\w]+(?:\.["\w]+)?)'
            matches = re.findall(pattern, query_text, re.IGNORECASE)

            for match in matches:
                table_name = match.replace('"', '')
                if '.' in table_name:
                    parts = table_name.split('.', 1)
                    table_refs.add((parts[0].upper(), parts[1].upper()))
                else:
                    table_refs.add((db.upper(), table_name.upper()))

        logger.info("Collected %d unique table references for metadata warmup", len(table_refs))
        return table_refs

    def extract_lineage(
        self,
        since: Optional[datetime] = None,
        full: bool = False
    ) -> int:
        """
        Extract column lineage from DBQL and insert into OL_COLUMN_LINEAGE.

        Args:
            since: Extract queries since this timestamp
            full: If True, extract all history (no time filter)

        Returns:
            Number of lineage records inserted
        """
        # Determine extraction start time
        if full:
            extraction_since = None
            logger.info("Mode: FULL extraction (all history)")
        elif since:
            extraction_since = since
            logger.info("Mode: Extract since %s (explicit)", since)
        else:
            # Auto-read from watermark
            extraction_since = self.watermark.get(WatermarkStore.SOURCE_DBQL)
            if extraction_since:
                self._used_watermark = True
                logger.info("Mode: Incremental since %s (from watermark)", extraction_since)
            else:
                # No watermark = first run, use default lookback
                extraction_since = datetime.now() - timedelta(days=DEFAULT_LOOKBACK_DAYS)
                logger.info("Mode: First run (no watermark), last %d days", DEFAULT_LOOKBACK_DAYS)

        # Fetch queries from DBQL
        queries = self.fetch_queries(extraction_since)

        if not queries:
            logger.info("No queries to process")
            return 0

        # Two-pass extraction: collect table refs, then warm cache
        table_refs = self._collect_table_references(queries)

        # Create resolver and warm metadata cache (single batch query)
        resolver = WildcardResolver(self.cursor, DATABASE)
        resolver.warm_cache(table_refs)

        # Update parser with wildcard resolver
        self.parser = TeradataSQLParser(
            default_database=DATABASE,
            wildcard_resolver=resolver
        )

        # Store resolver reference for stats
        self.resolver = resolver

        if self.dry_run:
            logger.info("[DRY RUN] Would process %d queries", len(queries))
            return 0

        # Process each query
        lineage_records: List[Dict] = []

        for i, (query_id, stmt_type, query_text, query_time, default_db, sql_length) in enumerate(queries):
            # Progress logging
            if (i + 1) % 1000 == 0:
                logger.info("Progress: %d/%d queries (%.1f%%)",
                           i + 1, len(queries), 1000 * (i + 1) / len(queries))

            # Skip null query text
            if not query_text:
                self.stats.record_skip("null query_text")
                continue

            # Warn about truncated query text
            if sql_length and sql_length > 32000:
                logger.warning(
                    "Query %s SQL text truncated: %d chars (limit: 32000) - "
                    "target: %s",
                    query_id, sql_length, self._extract_target_table(query_text)
                )

            try:
                # Set default database context for unqualified table names
                if default_db:
                    self.parser.default_database = default_db.strip()

                # Parse SQL and extract lineage
                records = self.parser.extract_column_lineage(query_text, stmt_type)

                if records:
                    for rec in records:
                        # Skip unresolved tables
                        if rec['source_table'] == 'UNKNOWN':
                            continue

                        lineage_records.append({
                            'query_id': str(query_id),
                            'source_database': rec['source_database'],
                            'source_table': rec['source_table'],
                            'source_column': rec['source_column'],
                            'target_database': rec['target_database'],
                            'target_table': rec['target_table'],
                            'target_column': rec['target_column'],
                            'transformation_type': rec.get('transformation_type', 'DIRECT'),
                            'confidence_score': rec.get('confidence_score', 0.9),
                        })

                    self.stats.record_success(len(records))
                else:
                    self.stats.record_success(0)

            except Exception as e:
                table_name = self._extract_target_table(query_text)
                error_type = type(e).__name__
                logger.warning(
                    "Failed to parse query %s (%s): %s",
                    query_id, table_name, str(e)[:200]
                )
                self.stats.record_failure(
                    str(query_id), table_name, error_type, str(e)
                )

        # Insert lineage records
        if lineage_records:
            inserted = self._insert_lineage_records(lineage_records)
            # Write watermark AFTER all data is committed (Pitfall 2 from research)
            self.watermark.set(WatermarkStore.SOURCE_DBQL, inserted)
            logger.info("Inserted %d lineage records, watermark updated", inserted)
            return inserted

        # Even with 0 records, advance watermark (successful run with nothing new)
        self.watermark.set(WatermarkStore.SOURCE_DBQL, 0)
        return 0

    def _insert_lineage_records(self, records: List[Dict]) -> int:
        """
        Insert lineage records into OL_COLUMN_LINEAGE.

        Args:
            records: List of lineage record dictionaries

        Returns:
            Number of records inserted
        """
        insert_sql = f"""
            INSERT INTO {DATABASE}.OL_COLUMN_LINEAGE
            (lineage_id, run_id, source_namespace, source_dataset, source_field,
             target_namespace, target_dataset, target_field,
             transformation_type, transformation_subtype, transformation_description,
             confidence_score, discovered_at, is_active)
            VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(0), 'Y')
        """

        inserted = 0
        seen_ids: Set[str] = set()

        for rec in records:
            # Generate source/target paths
            source_path = f"{rec['source_database']}.{rec['source_table']}.{rec['source_column']}"
            target_path = f"{rec['target_database']}.{rec['target_table']}.{rec['target_column']}"

            # Generate deterministic lineage ID
            lineage_id = generate_lineage_id(source_path, target_path)

            # Skip duplicates within this batch
            if lineage_id in seen_ids:
                continue
            seen_ids.add(lineage_id)

            # Map transformation type
            ol_type, ol_subtype, default_conf = map_transformation_type(
                rec.get('transformation_type', 'DIRECT')
            )
            confidence = rec.get('confidence_score', default_conf)

            # Build dataset names
            source_dataset = f"{rec['source_database']}.{rec['source_table']}"
            target_dataset = f"{rec['target_database']}.{rec['target_table']}"

            try:
                self.cursor.execute(insert_sql, (
                    lineage_id,
                    self.namespace_uri,
                    source_dataset,
                    rec['source_column'],
                    self.namespace_uri,
                    target_dataset,
                    rec['target_column'],
                    ol_type,
                    ol_subtype,
                    f"Extracted from DBQL",
                    confidence
                ))
                inserted += 1
            except teradatasql.DatabaseError as e:
                # Handle duplicate key - lineage already exists
                if "2801" in str(e):
                    pass  # Already exists, skip
                elif self.verbose:
                    logger.warning("Insert failed for %s: %s", lineage_id, e)

        return inserted

    def print_summary(self):
        """Print extraction summary."""
        print("\n" + "=" * 60)
        print("DBQL EXTRACTION SUMMARY")
        print("=" * 60)
        print(f"  Queries processed:     {self.stats.queries_processed}")
        print(f"  Queries succeeded:     {self.stats.queries_succeeded}")
        print(f"  Queries failed:        {self.stats.queries_failed}")
        print(f"  Queries skipped:       {self.stats.queries_skipped}")
        print(f"  Lineage records:       {self.stats.lineage_records}")
        print(f"  Watermark used:        {'yes (auto)' if self._used_watermark else 'no'}")

        # Print resolver statistics if available
        if hasattr(self, 'resolver') and self.resolver:
            stats = self.resolver.get_stats()
            print(f"  Metadata cache hits:   {stats.get('cache_hits', 0)}")
            print(f"  Metadata cache misses: {stats.get('cache_misses', 0)}")
            print(f"  Tables cached:         {stats.get('tables', 0)}")

        if self.verbose and self.stats.errors:
            print("\n  Failed Query Details:")
            for i, err in enumerate(self.stats.errors[:10]):
                print(f"    {i+1}. Query {err['query_id']}: {err['error_type']} on {err['table_name']}")
            if len(self.stats.errors) > 10:
                print(f"    ... and {len(self.stats.errors) - 10} more")


def configure_logging(verbose: bool = False) -> logging.Logger:
    """Configure logging for DBQL extraction."""
    level = logging.DEBUG if verbose else logging.INFO
    logger.setLevel(level)

    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(level)
    formatter = logging.Formatter(
        '%(asctime)s - %(levelname)s - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    handler.setFormatter(formatter)

    if not logger.handlers:
        logger.addHandler(handler)

    return logger
