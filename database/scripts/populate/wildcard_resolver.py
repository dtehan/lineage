#!/usr/bin/env python3
"""
Wildcard Resolver Module

Resolves SELECT * wildcards by batch-querying Teradata column metadata.
Designed for single-extraction-run lifetime: warm cache once with all
referenced tables, then resolve wildcards from cache. No TTL needed.

Usage Pattern:
    # 1. Collect all table references from SQL queries
    table_refs = {('database1', 'table1'), ('database2', 'table2')}

    # 2. Create resolver and warm cache with single batch query
    resolver = WildcardResolver(cursor, default_database='demo_user')
    resolver.warm_cache(table_refs)

    # 3. Resolve wildcards from in-memory cache (no DB queries)
    columns = resolver.resolve_star('database1', 'table1')
    # Returns: ['col1', 'col2', 'col3'] in ordinal position order

Performance:
    - Cache warming: O(1) batch query regardless of table count (up to 100 per batch)
    - Wildcard resolution: O(1) dictionary lookup
    - Memory overhead: ~50 bytes per column (typical: <5 MB for 100 tables)

Teradata Conventions:
    - Unquoted identifiers are stored uppercase (SELECT * from mytable → MYTABLE)
    - Quoted identifiers preserve case (SELECT * from "MyTable" → MyTable)
    - DBC.ColumnsJQV returns columns in ColumnId order (ordinal position)
"""

import json
import logging
import time
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple

logger = logging.getLogger('wildcard_resolver')


class WildcardResolver:
    """Resolves SELECT * wildcards by batch-querying Teradata column metadata.

    Designed for single-extraction-run lifetime: warm cache once with all
    referenced tables, then resolve wildcards from cache. No TTL needed.

    Attributes:
        cursor: Active Teradata database cursor
        default_database: Default database for unqualified table references
        _column_cache: In-memory cache of (database, table) -> [column_names]
        _cache_hits: Number of successful cache lookups
        _cache_misses: Number of failed cache lookups
    """

    # Batch size limit to prevent query explosion
    BATCH_SIZE = 100

    def __init__(self, cursor, default_database: str, baseline_path: str = None):
        """Initialize the wildcard resolver.

        Args:
            cursor: Active Teradata database cursor
            default_database: Default database for unqualified table references
            baseline_path: Path to schema baseline JSON file (None = no schema evolution detection)
        """
        self.cursor = cursor
        self.default_database = default_database.upper()  # Normalize to uppercase
        self._column_cache: Dict[Tuple[str, str], List[str]] = {}
        self._cache_hits: int = 0
        self._cache_misses: int = 0

        # Phase 8: Schema evolution detection
        self._baseline_path = Path(baseline_path) if baseline_path else None
        self._baseline: Dict[Tuple[str, str], int] = self._load_baseline() if self._baseline_path else {}
        self._schema_changes: List[Dict] = []  # Track detected changes for reporting

    def _load_baseline(self) -> Dict[Tuple[str, str], int]:
        """Load column count baseline from previous extraction run.

        Returns:
            Dict mapping (database, table) -> column_count from previous run.
            Empty dict if no baseline exists (first run).
        """
        if not self._baseline_path or not self._baseline_path.exists():
            logger.info("No schema baseline found, creating new baseline on save")
            return {}

        try:
            with open(self._baseline_path) as f:
                data = json.load(f)

            baseline = {}
            for key_str, count in data.items():
                if '.' in key_str:
                    db, tbl = key_str.split('.', 1)
                    baseline[(db, tbl)] = count
                else:
                    logger.warning(f"Invalid baseline key format: {key_str}")

            logger.info(f"Loaded schema baseline with {len(baseline)} tables")
            return baseline

        except Exception as e:
            logger.warning(f"Failed to load schema baseline: {e}, starting fresh")
            return {}

    def warm_cache(self, table_refs: Set[Tuple[str, str]]) -> None:
        """Batch-query metadata for all referenced tables in a single round-trip.

        Queries DBC.ColumnsJQV to fetch column metadata for all tables in a single
        batch query (or multiple batches if > BATCH_SIZE tables). Results are cached
        in-memory for subsequent wildcard resolution.

        Args:
            table_refs: Set of (database, table) tuples to fetch metadata for.
                       Database can be None (will use default_database).
                       Identifiers should be unquoted (will be normalized to uppercase).

        Example:
            table_refs = {
                ('database1', 'table1'),
                (None, 'table2'),  # Uses default_database
                ('database2', 'table3')
            }
            resolver.warm_cache(table_refs)
        """
        if not table_refs:
            logger.debug("No table references provided, cache warming skipped")
            return

        try:
            start_time = time.time()

            # Normalize all identifiers to uppercase and apply default database
            normalized_refs = set()
            for db, table in table_refs:
                db_norm = self.normalize_identifier(db if db else self.default_database)
                table_norm = self.normalize_identifier(table)
                normalized_refs.add((db_norm, table_norm))

            # Remove duplicates after normalization
            unique_refs = list(normalized_refs)
            total_tables = len(unique_refs)

            logger.debug(f"Warming cache for {total_tables} unique tables (after normalization)")

            # Process in batches to avoid query limits
            for batch_start in range(0, total_tables, self.BATCH_SIZE):
                batch_end = min(batch_start + self.BATCH_SIZE, total_tables)
                batch_refs = unique_refs[batch_start:batch_end]

                self._warm_cache_batch(batch_refs)

            # Phase 8: Schema evolution detection
            if self._baseline_path:
                self._detect_schema_changes()
                self._save_baseline()

            elapsed_ms = int((time.time() - start_time) * 1000)
            total_columns = sum(len(cols) for cols in self._column_cache.values())

            logger.info(
                f"Warmed metadata cache: {len(self._column_cache)} tables, "
                f"{total_columns} columns in {elapsed_ms}ms"
            )

        except Exception as e:
            # Graceful degradation: log warning but don't raise
            # Wildcard resolution will return empty lists for cache misses
            logger.warning(
                f"Failed to warm metadata cache: {e}. "
                "Wildcard expansion will be skipped for affected queries."
            )

    def _warm_cache_batch(self, table_refs: List[Tuple[str, str]]) -> None:
        """Query metadata for a single batch of tables.

        Args:
            table_refs: List of (database, table) tuples (already normalized)
        """
        if not table_refs:
            return

        # Build OR conditions for batch query
        conditions = []
        for db, table in table_refs:
            conditions.append(f"(DatabaseName = '{db}' AND TableName = '{table}')")

        where_clause = " OR ".join(conditions)

        query = f"""
            SELECT
                TRIM(DatabaseName) as db,
                TRIM(TableName) as tbl,
                TRIM(ColumnName) as col,
                ColumnId as ordinal
            FROM DBC.ColumnsJQV
            WHERE {where_clause}
            ORDER BY DatabaseName, TableName, ColumnId
        """

        logger.debug(f"Executing batch metadata query for {len(table_refs)} tables")
        self.cursor.execute(query)

        # Group results by (database, table) and store in cache
        current_key = None
        current_cols = []

        for row in self.cursor.fetchall():
            key = (row[0], row[1])  # (database, table)

            if key != current_key:
                # Save previous table's columns
                if current_key is not None:
                    self._column_cache[current_key] = current_cols

                # Start new table
                current_key = key
                current_cols = []

            # Add column to current table (already in ordinal position order)
            current_cols.append(row[2])

        # Save last table's columns
        if current_key is not None:
            self._column_cache[current_key] = current_cols

    def _detect_schema_changes(self) -> None:
        """Detect schema evolution by comparing column counts to baseline.

        QUAL-03: Logs warnings when column counts change between extraction runs.
        Compares current cache against saved baseline from previous run.
        """
        self._schema_changes = []

        for (db, tbl), columns in self._column_cache.items():
            key = (db, tbl)
            current_count = len(columns)
            baseline_count = self._baseline.get(key)

            # Skip if no baseline (first run for this table)
            if baseline_count is None:
                continue

            if current_count != baseline_count:
                delta = current_count - baseline_count
                change_info = {
                    "table": f"{db}.{tbl}",
                    "baseline_columns": baseline_count,
                    "current_columns": current_count,
                    "delta": delta,
                    "timestamp": datetime.now().isoformat()
                }
                self._schema_changes.append(change_info)

                logger.warning(
                    "Schema evolution detected for %s.%s: %d -> %d columns (%+d)",
                    db, tbl, baseline_count, current_count, delta
                )

        if self._schema_changes:
            logger.info(
                "Schema evolution: %d table(s) changed since last run",
                len(self._schema_changes)
            )

    def _save_baseline(self) -> None:
        """Save current column counts as baseline for next extraction run.

        Writes atomically via temp file to prevent corruption on crash.
        """
        if not self._baseline_path:
            return

        try:
            data = {
                f"{db}.{tbl}": len(cols)
                for (db, tbl), cols in self._column_cache.items()
            }

            # Atomic write via temp file
            temp_path = self._baseline_path.with_suffix('.tmp')
            with open(temp_path, 'w') as f:
                json.dump(data, f, indent=2, sort_keys=True)
            temp_path.replace(self._baseline_path)

            logger.debug(f"Saved schema baseline with {len(data)} tables to {self._baseline_path}")

        except Exception as e:
            logger.warning(f"Failed to save schema baseline: {e}")

    def resolve_star(self, database: Optional[str], table: str) -> List[str]:
        """Return column names in ordinal position order from cache.

        Args:
            database: Database name (None = use default_database)
            table: Table name

        Returns:
            List of column names in ordinal position order, or empty list if not in cache.
            Never raises exceptions (graceful degradation).

        Example:
            columns = resolver.resolve_star('demo_user', 'customers')
            # Returns: ['customer_id', 'name', 'email', 'created_at']

            columns = resolver.resolve_star(None, 'orders')  # Uses default_database
            # Returns: ['order_id', 'customer_id', 'amount', 'status']
        """
        # Normalize database and table
        db_norm = self.normalize_identifier(database if database else self.default_database)
        table_norm = self.normalize_identifier(table)

        key = (db_norm, table_norm)

        if key in self._column_cache:
            self._cache_hits += 1
            return self._column_cache[key]
        else:
            self._cache_misses += 1
            logger.debug(f"Cache miss for {db_norm}.{table_norm}")
            return []

    def normalize_identifier(self, identifier: str, is_quoted: bool = False) -> str:
        """Normalize identifier for Teradata case-insensitive matching.

        Teradata stores unquoted identifiers in uppercase but preserves case for
        quoted identifiers. This method normalizes identifiers for consistent
        cache lookups.

        Args:
            identifier: Database, table, or column name
            is_quoted: True if identifier was quoted in SQL (preserves case)

        Returns:
            Normalized identifier: uppercase if unquoted, original case if quoted

        Example:
            normalize_identifier('MyTable')       # Returns: 'MYTABLE'
            normalize_identifier('MyTable', True) # Returns: 'MyTable' (quoted)
            normalize_identifier('  TABLE1  ')   # Returns: 'TABLE1'
        """
        if not identifier:
            return ''

        # Strip whitespace
        identifier = identifier.strip()

        # Quoted identifiers preserve case, unquoted are uppercase
        if is_quoted:
            return identifier
        else:
            return identifier.upper()

    def get_schema_changes(self) -> List[Dict]:
        """Return schema changes detected during cache warmup.

        Returns:
            List of dicts with keys: table, baseline_columns, current_columns, delta, timestamp
        """
        return self._schema_changes

    def get_stats(self) -> Dict[str, int]:
        """Return cache hit/miss statistics for logging.

        Returns:
            Dictionary with keys: 'tables', 'columns', 'cache_hits', 'cache_misses', 'hit_rate_pct', 'schema_changes'

        Example:
            stats = resolver.get_stats()
            print(f"Cache hit rate: {stats['hit_rate_pct']}%")
        """
        total_lookups = self._cache_hits + self._cache_misses
        hit_rate = (self._cache_hits / total_lookups * 100) if total_lookups > 0 else 0.0

        total_columns = sum(len(cols) for cols in self._column_cache.values())

        return {
            'tables': len(self._column_cache),
            'columns': total_columns,
            'cache_hits': self._cache_hits,
            'cache_misses': self._cache_misses,
            'hit_rate_pct': round(hit_rate, 1),
            'schema_changes': len(self._schema_changes) if hasattr(self, '_schema_changes') else 0
        }
