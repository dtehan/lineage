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
    - DBC.ColumnsV returns columns in ColumnId order (ordinal position) for tables
"""

import json
import logging
import os
import re
import sys
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

    # Maximum view expansion depth (separate from CTE's 5-level limit in TeradataSQLParser)
    MAX_VIEW_EXPANSION_DEPTH = 3

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

        # Phase 9: View expansion state
        self._view_expansion_cache: Dict[Tuple[str, str], List[str]] = {}
        self._view_expansion_depth: int = 0
        self._view_expansion_path: Set[Tuple[str, str]] = set()

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

        Queries DBC.ColumnsV to fetch column metadata for all (non-view) tables in a
        single batch query (or multiple batches if > BATCH_SIZE tables). Results are
        cached in-memory for subsequent wildcard resolution.

        For views, queries DBC.TablesV to detect them, then fetches view definitions
        and expands wildcards recursively.

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
            total_refs = len(unique_refs)

            logger.debug(f"Warming cache for {total_refs} unique refs (after normalization)")

            # Step 1: Identify views from all references
            view_refs = self._identify_views(unique_refs)

            # Step 2: Separate tables from views
            table_only_refs = [r for r in unique_refs if r not in view_refs]
            total_tables = len(table_only_refs)

            logger.debug(f"Found {len(view_refs)} views and {total_tables} tables")

            # Step 3: Warm table cache (existing behavior for non-view refs)
            for batch_start in range(0, total_tables, self.BATCH_SIZE):
                batch_end = min(batch_start + self.BATCH_SIZE, total_tables)
                batch_refs = table_only_refs[batch_start:batch_end]
                self._warm_cache_batch(batch_refs)

            # Step 4: Fetch view definitions
            all_view_definitions = self._fetch_view_definitions(view_refs)

            # Step 5: Handle truncated definitions via SHOW VIEW fallback
            for view_key in list(all_view_definitions.keys()):
                if all_view_definitions[view_key] is None:
                    db, tbl = view_key
                    definition = self._fetch_view_definition_show_view(db, tbl)
                    all_view_definitions[view_key] = definition

            # Step 6: Reset expansion state before expanding
            self._view_expansion_depth = 0
            self._view_expansion_path = set()
            self._view_expansion_cache = {}

            # Step 7: Expand each view's columns
            views_expanded = 0
            for view_key in view_refs:
                db, tbl = view_key
                view_sql = all_view_definitions.get(view_key)
                if view_sql:
                    columns = self._expand_view_columns(db, tbl, view_sql, all_view_definitions)
                    if columns:
                        self._column_cache[view_key] = columns
                        views_expanded += 1
                    else:
                        logger.warning(f"View expansion yielded no columns for {db}.{tbl}")
                else:
                    logger.warning(f"No definition available for view {db}.{tbl}, skipping expansion")

            if view_refs:
                logger.info(f"View expansion: {views_expanded}/{len(view_refs)} views expanded successfully")

            # Phase 8: Schema evolution detection (unchanged)
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

    def _identify_views(self, table_refs: List[Tuple[str, str]]) -> Set[Tuple[str, str]]:
        """Identify which of the given table references are actually views.

        Batch-queries DBC.TablesV using the same OR-condition pattern as
        _warm_cache_batch() to identify views. Returns empty set on error
        (graceful degradation).

        Args:
            table_refs: List of (database, table) tuples (already normalized)

        Returns:
            Set of (database, table) tuples that are views (TableKind = 'V')
        """
        if not table_refs:
            return set()

        views = set()

        try:
            # Process in batches to avoid query limits
            for batch_start in range(0, len(table_refs), self.BATCH_SIZE):
                batch_end = min(batch_start + self.BATCH_SIZE, len(table_refs))
                batch_refs = table_refs[batch_start:batch_end]

                # Build OR conditions for batch query
                conditions = []
                for db, table in batch_refs:
                    conditions.append(f"(DatabaseName = '{db}' AND TableName = '{table}')")

                where_clause = " OR ".join(conditions)

                query = f"""
                    SELECT TRIM(DatabaseName), TRIM(TableName)
                    FROM DBC.TablesV
                    WHERE ({where_clause}) AND TableKind = 'V'
                """

                self.cursor.execute(query)
                rows = self.cursor.fetchall()

                for row in rows:
                    views.add((row[0], row[1]))

            logger.debug(f"Identified {len(views)} views out of {len(table_refs)} table references")

        except Exception as e:
            logger.warning(f"Failed to identify views: {e}. Treating all refs as tables.")
            return set()

        return views

    def _fetch_view_definitions(
        self, view_refs: Set[Tuple[str, str]]
    ) -> Dict[Tuple[str, str], Optional[str]]:
        """Fetch view definitions (RequestText) from DBC.TablesV.

        Tries to retrieve RequestText with overflow detection via RequestTxtOverFlow.
        If overflow is detected (truncated at 12500 chars), sets definition to None
        as a signal for the SHOW VIEW fallback.

        Args:
            view_refs: Set of (database, table) tuples that are views

        Returns:
            Dict mapping (database, table) -> view SQL string or None if truncated
        """
        if not view_refs:
            return {}

        definitions: Dict[Tuple[str, str], Optional[str]] = {}
        view_list = list(view_refs)

        try:
            # Process in batches
            for batch_start in range(0, len(view_list), self.BATCH_SIZE):
                batch_end = min(batch_start + self.BATCH_SIZE, len(view_list))
                batch_refs = view_list[batch_start:batch_end]

                conditions = []
                for db, table in batch_refs:
                    conditions.append(f"(DatabaseName = '{db}' AND TableName = '{table}')")

                where_clause = " OR ".join(conditions)

                try:
                    # Try with RequestTxtOverFlow column first
                    query = f"""
                        SELECT TRIM(DatabaseName), TRIM(TableName), RequestText, RequestTxtOverFlow
                        FROM DBC.TablesV
                        WHERE ({where_clause}) AND TableKind = 'V'
                    """
                    self.cursor.execute(query)
                    rows = self.cursor.fetchall()

                    for row in rows:
                        db, tbl, text, overflow = row[0], row[1], row[2], row[3]
                        key = (db, tbl)

                        if overflow == 'Y':
                            logger.warning(
                                f"View definition truncated (RequestTxtOverFlow='Y') for {db}.{tbl}, "
                                "will attempt SHOW VIEW fallback"
                            )
                            definitions[key] = None
                        elif text:
                            definitions[key] = text.strip()
                        else:
                            definitions[key] = None

                except Exception as overflow_err:
                    # Fallback: query without RequestTxtOverFlow (column may not exist)
                    logger.debug(
                        f"RequestTxtOverFlow column unavailable ({overflow_err}), "
                        "using fallback query"
                    )

                    query_fallback = f"""
                        SELECT TRIM(DatabaseName), TRIM(TableName), RequestText
                        FROM DBC.TablesV
                        WHERE ({where_clause}) AND TableKind = 'V'
                    """
                    self.cursor.execute(query_fallback)
                    rows = self.cursor.fetchall()

                    for row in rows:
                        db, tbl, text = row[0], row[1], row[2]
                        key = (db, tbl)

                        if text and len(text) >= 12500:
                            logger.warning(
                                f"View definition may be truncated (length={len(text)}) for {db}.{tbl}, "
                                "will attempt SHOW VIEW fallback"
                            )
                            definitions[key] = None
                        elif text:
                            definitions[key] = text.strip()
                        else:
                            definitions[key] = None

        except Exception as e:
            logger.warning(f"Failed to fetch view definitions: {e}")

        return definitions

    def _fetch_view_definition_show_view(self, database: str, table: str) -> Optional[str]:
        """Execute SHOW VIEW as fallback for truncated RequestText definitions.

        Args:
            database: Database name
            table: View name

        Returns:
            View definition text, or None on any exception
        """
        try:
            query = f"SHOW VIEW {database}.{table}"
            self.cursor.execute(query)
            rows = self.cursor.fetchall()

            if not rows:
                return None

            # Join all result rows with newline
            lines = []
            for row in rows:
                if row and row[0]:
                    lines.append(str(row[0]))

            result = "\n".join(lines).strip()
            return result if result else None

        except Exception as e:
            logger.warning(f"SHOW VIEW failed for {database}.{table}: {e}")
            return None

    def _expand_view_columns(
        self,
        database: str,
        table: str,
        view_sql: str,
        all_view_definitions: Dict[Tuple[str, str], Optional[str]]
    ) -> List[str]:
        """Recursively expand a view definition to derive its actual column list.

        Parses the view's SELECT statement using TeradataSQLParser with a
        _ViewExpansionProxy as the wildcard resolver, enabling transparent
        nested view expansion.

        Args:
            database: Database name of the view
            table: View name
            view_sql: Raw view definition SQL (REPLACE VIEW ... AS SELECT ...)
            all_view_definitions: All fetched view definitions for nested expansion

        Returns:
            List of column names, or empty list on error/depth/cycle
        """
        key = (database, table)

        # Check cache first
        if key in self._view_expansion_cache:
            return self._view_expansion_cache[key]

        # Depth limit check
        if self._view_expansion_depth >= self.MAX_VIEW_EXPANSION_DEPTH:
            logger.warning(
                f"View expansion depth limit ({self.MAX_VIEW_EXPANSION_DEPTH}) reached "
                f"while expanding {database}.{table}"
            )
            return []

        # Cycle detection
        if key in self._view_expansion_path:
            logger.error(
                f"Circular view reference detected: {database}.{table} "
                f"(expansion path: {list(self._view_expansion_path)})"
            )
            return []

        self._view_expansion_depth += 1
        self._view_expansion_path.add(key)
        depth = self._view_expansion_depth

        try:
            # Import TeradataSQLParser (only once, cached by Python's import system)
            lineage_api_path = os.path.join(
                os.path.dirname(__file__), '..', '..', '..', 'lineage-api'
            )
            lineage_api_path = os.path.normpath(lineage_api_path)
            if lineage_api_path not in sys.path:
                sys.path.insert(0, lineage_api_path)

            from utils.sql_parser import TeradataSQLParser
            import sqlglot
            from sqlglot import exp

            # Normalize Teradata-specific SQL constructs for sqlglot parsing
            from view_lineage_extractor import ViewLineageExtractor
            normalized_sql = ViewLineageExtractor._normalize_teradata_sql(view_sql)

            # Parse with Teradata dialect, fallback to generic
            try:
                parsed = sqlglot.parse_one(normalized_sql, dialect="teradata")
            except Exception:
                try:
                    parsed = sqlglot.parse_one(normalized_sql)
                except Exception as parse_err:
                    logger.warning(f"Failed to parse view {database}.{table}: {parse_err}")
                    return []

            if parsed is None:
                logger.warning(f"sqlglot returned None for view {database}.{table}")
                return []

            # Extract SELECT expression from parsed AST
            select_expr = None
            if isinstance(parsed, exp.Create):
                inner = parsed.expression
                if isinstance(inner, exp.Subquery):
                    inner = inner.this
                if isinstance(inner, exp.Select):
                    select_expr = inner
            elif isinstance(parsed, exp.Select):
                select_expr = parsed

            if select_expr is None:
                logger.warning(
                    f"Could not extract SELECT expression from view {database}.{table}"
                )
                return []

            # Create proxy and fresh parser instance
            proxy = _ViewExpansionProxy(self, all_view_definitions)
            parser = TeradataSQLParser(default_database=database, wildcard_resolver=proxy)

            # Build table aliases and extract columns
            parser._table_aliases = {}
            parser._build_table_aliases(select_expr)
            col_refs = parser._extract_select_columns(select_expr)

            # Extract column names from column references
            columns = []
            for ref in col_refs:
                name = ref.alias or ref.column
                if name:
                    columns.append(name)

            # Cache the result
            self._view_expansion_cache[key] = columns
            self._column_cache[key] = columns

            logger.info(
                f"Expanded view {database}.{table} -> {len(columns)} columns at depth {depth}"
            )

            return columns

        except Exception as e:
            logger.warning(f"Failed to expand view {database}.{table}: {e}")
            return []

        finally:
            self._view_expansion_depth -= 1
            self._view_expansion_path.discard(key)

    def _warm_cache_batch(self, table_refs: List[Tuple[str, str]]) -> None:
        """Query column metadata for a single batch of (non-view) tables.

        Uses DBC.ColumnsV to fetch column names and ordinal positions for tables.
        Views are handled separately via view expansion (_expand_view_columns) and
        are never passed to this method -- warm_cache() separates views out before
        calling here.

        DBC.ColumnsV is used directly (not DBC.ColumnsJQV) because:
          - This method only processes tables, not views
          - DBC.ColumnsV always has complete type info for tables
          - No QVCI dependency needed for wildcard resolution (column names only)

        Args:
            table_refs: List of (database, table) tuples (already normalized, tables only)
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
            FROM DBC.ColumnsV
            WHERE {where_clause}
            ORDER BY DatabaseName, TableName, ColumnId
        """

        logger.debug(f"Executing batch metadata query for {len(table_refs)} tables using DBC.ColumnsV")
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


class _ViewExpansionProxy:
    """Proxy that implements the WildcardResolver.resolve_star() interface.

    Used during view expansion to allow TeradataSQLParser to resolve wildcards
    in nested view definitions without re-querying the database. Looks up columns
    from the parent resolver's caches and the pre-fetched view definitions.
    """

    def __init__(
        self,
        parent_resolver: WildcardResolver,
        all_view_definitions: Dict[Tuple[str, str], Optional[str]]
    ):
        """Initialize the proxy.

        Args:
            parent_resolver: The WildcardResolver instance driving the expansion
            all_view_definitions: All fetched view definitions for nested expansion
        """
        self._parent = parent_resolver
        self._all_view_definitions = all_view_definitions

    def resolve_star(self, database: Optional[str], table: str) -> List[str]:
        """Resolve SELECT * for a table or view during nested expansion.

        Priority:
            1. Already-cached table columns (_column_cache)
            2. Already-expanded view columns (_view_expansion_cache)
            3. View in all_view_definitions with SQL -> recursive expansion
            4. Otherwise return [] (graceful degradation)

        Args:
            database: Database name (None uses parent's default_database)
            table: Table or view name

        Returns:
            List of column names, or empty list if not available
        """
        # Normalize using parent's method
        db_norm = self._parent.normalize_identifier(
            database if database else self._parent.default_database
        )
        table_norm = self._parent.normalize_identifier(table)
        key = (db_norm, table_norm)

        # Check parent's column cache (already-warmed tables)
        if key in self._parent._column_cache:
            return self._parent._column_cache[key]

        # Check view expansion cache (already-expanded views)
        if key in self._parent._view_expansion_cache:
            return self._parent._view_expansion_cache[key]

        # Try recursive expansion if view definition is available
        if key in self._all_view_definitions:
            view_sql = self._all_view_definitions[key]
            if view_sql:
                return self._parent._expand_view_columns(
                    db_norm, table_norm, view_sql, self._all_view_definitions
                )

        # Graceful degradation
        return []
