#!/usr/bin/env python3
"""
Unit tests for WildcardResolver module.

Tests the WildcardResolver class that resolves SELECT * wildcards by
batch-querying Teradata column metadata. All tests use mocks - no database
connection required.

Run with:
    cd database/scripts/populate
    python -m pytest test_wildcard_resolver.py -v
    OR
    python -m unittest test_wildcard_resolver -v
"""

import os
import unittest
from unittest.mock import MagicMock, patch, call
from wildcard_resolver import WildcardResolver


def make_query_discriminating_fetchall(mock_cursor, column_rows):
    """Create a fetchall side_effect that returns [] for TablesV queries
    and column_rows for ColumnsJQV queries.

    This is needed because warm_cache() now makes an additional DBC.TablesV
    query to detect views before the DBC.ColumnsJQV query for table metadata.

    Args:
        mock_cursor: The MagicMock cursor
        column_rows: Rows to return for ColumnsJQV queries
    """
    def fetchall_side_effect():
        last_query = mock_cursor.execute.call_args[0][0]
        if 'TablesV' in last_query:
            return []  # no views found
        return column_rows  # ColumnsJQV result

    mock_cursor.fetchall.side_effect = fetchall_side_effect


class TestWildcardResolver(unittest.TestCase):
    """Unit tests for WildcardResolver class."""

    def setUp(self):
        """Set up mock cursor for each test."""
        self.mock_cursor = MagicMock()
        self.resolver = WildcardResolver(self.mock_cursor, default_database='demo_user')

    # =========================================================================
    # A. Cache Warmup Tests
    # =========================================================================

    def test_warm_cache_single_table(self):
        """Test single table query and caching."""
        # Mock cursor.fetchall() returning 3 columns for ColumnsJQV,
        # and [] for TablesV (no views). Use query-discriminating side_effect
        # because warm_cache() now calls DBC.TablesV before DBC.ColumnsJQV.
        original_column_rows = [
            ('DEMO_USER', 'CUSTOMERS', 'customer_id', 1),
            ('DEMO_USER', 'CUSTOMERS', 'name', 2),
            ('DEMO_USER', 'CUSTOMERS', 'email', 3),
        ]
        make_query_discriminating_fetchall(self.mock_cursor, original_column_rows)

        # Warm cache with single table
        table_refs = {('demo_user', 'customers')}
        self.resolver.warm_cache(table_refs)

        # Assert cursor.execute() was called (now 2 calls: TablesV + ColumnsJQV)
        self.mock_cursor.execute.assert_called()
        call_args_list = [c[0][0] for c in self.mock_cursor.execute.call_args_list]
        tables_v_calls = [q for q in call_args_list if 'TablesV' in q]
        columns_jqv_calls = [q for q in call_args_list if 'ColumnsJQV' in q]
        self.assertTrue(len(tables_v_calls) >= 1, "Expected at least one TablesV call")
        self.assertTrue(len(columns_jqv_calls) >= 1, "Expected at least one ColumnsJQV call")
        self.assertIn('DEMO_USER', columns_jqv_calls[0])
        self.assertIn('CUSTOMERS', columns_jqv_calls[0])

        # Assert cache contains correct columns in order
        columns = self.resolver.resolve_star('demo_user', 'customers')
        self.assertEqual(columns, ['customer_id', 'name', 'email'])

    def test_warm_cache_multiple_tables(self):
        """Test batch query with multiple tables."""
        # Mock cursor.fetchall() returning columns for 3 tables for ColumnsJQV
        # and [] for TablesV (no views). Use query-discriminating side_effect.
        original_column_rows = [
            ('DB1', 'TABLE1', 'col1', 1),
            ('DB1', 'TABLE1', 'col2', 2),
            ('DB2', 'TABLE2', 'colA', 1),
            ('DB2', 'TABLE2', 'colB', 2),
            ('DB2', 'TABLE2', 'colC', 3),
            ('DB3', 'TABLE3', 'id', 1),
        ]
        make_query_discriminating_fetchall(self.mock_cursor, original_column_rows)

        # Provide 3 (database, table) pairs
        table_refs = {
            ('db1', 'table1'),
            ('db2', 'table2'),
            ('db3', 'table3'),
        }
        self.resolver.warm_cache(table_refs)

        # Verify execute() was called (now 2 calls: TablesV + ColumnsJQV)
        self.mock_cursor.execute.assert_called()

        # Assert all tables cached
        self.assertEqual(self.resolver.resolve_star('db1', 'table1'), ['col1', 'col2'])
        self.assertEqual(self.resolver.resolve_star('db2', 'table2'), ['colA', 'colB', 'colC'])
        self.assertEqual(self.resolver.resolve_star('db3', 'table3'), ['id'])

    def test_warm_cache_empty_refs(self):
        """Test no-op on empty set."""
        # Call warm_cache with empty set
        self.resolver.warm_cache(set())

        # Assert cursor.execute() NOT called
        self.mock_cursor.execute.assert_not_called()

    def test_warm_cache_deduplicates(self):
        """Test duplicate refs don't cause duplicate queries."""
        # Mock cursor.fetchall() returning columns for one table
        original_column_rows = [
            ('DEMO_USER', 'MYTABLE', 'col1', 1),
            ('DEMO_USER', 'MYTABLE', 'col2', 2),
        ]
        make_query_discriminating_fetchall(self.mock_cursor, original_column_rows)

        # Provide same table twice with different casing
        table_refs = {
            ('demo_user', 'myTable'),
            ('DEMO_USER', 'MyTable'),
            ('demo_user', 'MYTABLE'),
        }
        self.resolver.warm_cache(table_refs)

        # Assert only one entry in cache after normalization
        stats = self.resolver.get_stats()
        self.assertEqual(stats['tables'], 1)

        # Verify all variations resolve to same cached entry
        self.assertEqual(self.resolver.resolve_star('demo_user', 'mytable'), ['col1', 'col2'])
        self.assertEqual(self.resolver.resolve_star('DEMO_USER', 'MyTable'), ['col1', 'col2'])

    def test_warm_cache_pagination(self):
        """Test batch splitting at 100 tables."""
        # Mock cursor.fetchall() to return empty (we only care about call count).
        # Use query-discriminating side_effect to ensure TablesV calls return []
        # and ColumnsJQV calls also return [] (we're testing pagination, not content).
        make_query_discriminating_fetchall(self.mock_cursor, [])

        # Provide 150 table references
        table_refs = {
            (f'db{i}', f'table{i}')
            for i in range(150)
        }
        self.resolver.warm_cache(table_refs)

        # Assert cursor.execute() called 3 times:
        # 2 TablesV batches (100 + 50) to identify views
        # + 2 ColumnsJQV batches (100 + 50) for table metadata
        # = 4 total (since all 150 refs are treated as tables: no views found)
        # Actually: 2 TablesV (100+50) + 2 ColumnsJQV (100+50) = 4
        self.assertEqual(self.mock_cursor.execute.call_count, 4)

    def test_warm_cache_graceful_on_error(self):
        """Test no exception on database error."""
        # Mock cursor.execute() to raise Exception
        self.mock_cursor.execute.side_effect = Exception('Database connection failed')

        # Call warm_cache - should not raise
        table_refs = {('demo_user', 'customers')}
        self.resolver.warm_cache(table_refs)  # Should complete without raising

        # Assert resolve_star returns empty list
        columns = self.resolver.resolve_star('demo_user', 'customers')
        self.assertEqual(columns, [])

    def test_warm_cache_qvci_fallback(self):
        """Test fallback from ColumnsJQV to ColumnsV when QVCI is disabled (Error 9719)."""
        column_rows = [
            ('DEMO_USER', 'CUSTOMERS', 'customer_id', 1),
            ('DEMO_USER', 'CUSTOMERS', 'name', 2),
            ('DEMO_USER', 'CUSTOMERS', 'email', 3),
        ]

        call_count = [0]

        def execute_side_effect(query, *args):
            self._last_query = query
            call_count[0] += 1
            # Raise QVCI error on ColumnsJQV query
            if 'ColumnsJQV' in query:
                raise Exception('[Error 9719] QVCI feature is disabled.')

        def fetchall_side_effect():
            q = getattr(self, '_last_query', '')
            if 'TablesV' in q:
                return []  # no views
            if 'ColumnsV' in q:
                return column_rows
            return []

        self.mock_cursor.execute.side_effect = execute_side_effect
        self.mock_cursor.fetchall.side_effect = fetchall_side_effect

        # Warm cache - should fall back to ColumnsV
        table_refs = {('demo_user', 'customers')}
        self.resolver.warm_cache(table_refs)

        # Assert cache contains correct columns from ColumnsV fallback
        columns = self.resolver.resolve_star('demo_user', 'customers')
        self.assertEqual(columns, ['customer_id', 'name', 'email'])

    # =========================================================================
    # B. Identifier Normalization Tests (CORE-06)
    # =========================================================================

    def test_normalize_unquoted_uppercase(self):
        """Test unquoted identifiers are uppercased."""
        result = self.resolver.normalize_identifier('myTable')
        self.assertEqual(result, 'MYTABLE')

    def test_normalize_quoted_preserved(self):
        """Test quoted identifiers are preserved."""
        result = self.resolver.normalize_identifier('MyTable', is_quoted=True)
        self.assertEqual(result, 'MyTable')

    def test_normalize_whitespace_stripped(self):
        """Test whitespace is trimmed."""
        result = self.resolver.normalize_identifier('  myTable  ')
        self.assertEqual(result, 'MYTABLE')

    # =========================================================================
    # C. Resolve Star Tests
    # =========================================================================

    def test_resolve_star_returns_cached_columns(self):
        """Test happy path - returns cached columns in order."""
        # Warm cache with query-discriminating mock
        original_column_rows = [
            ('DB', 'TBL', 'a', 1),
            ('DB', 'TBL', 'b', 2),
            ('DB', 'TBL', 'c', 3),
        ]
        make_query_discriminating_fetchall(self.mock_cursor, original_column_rows)
        self.resolver.warm_cache({('db', 'tbl')})

        # Resolve star
        columns = self.resolver.resolve_star('db', 'tbl')
        self.assertEqual(columns, ['a', 'b', 'c'])

    def test_resolve_star_unknown_table_returns_empty(self):
        """Test missing table returns empty list."""
        # No cache warmup
        columns = self.resolver.resolve_star('unknown_db', 'unknown_table')
        self.assertEqual(columns, [])

    def test_resolve_star_case_insensitive(self):
        """Test case normalization on lookup."""
        # Cache warmed with uppercase - use query-discriminating mock
        original_column_rows = [
            ('DB', 'TBL', 'col1', 1),
        ]
        make_query_discriminating_fetchall(self.mock_cursor, original_column_rows)
        self.resolver.warm_cache({('DB', 'TBL')})

        # Resolve with lowercase
        columns = self.resolver.resolve_star('db', 'tbl')
        self.assertEqual(columns, ['col1'])

    def test_resolve_star_default_database(self):
        """Test None database uses default_database."""
        # Cache warmed with default database - use query-discriminating mock
        original_column_rows = [
            ('DEMO_USER', 'ORDERS', 'order_id', 1),
            ('DEMO_USER', 'ORDERS', 'amount', 2),
        ]
        make_query_discriminating_fetchall(self.mock_cursor, original_column_rows)
        self.resolver.warm_cache({('demo_user', 'orders')})

        # Resolve with None database
        columns = self.resolver.resolve_star(None, 'orders')
        self.assertEqual(columns, ['order_id', 'amount'])

    # =========================================================================
    # D. Statistics Tests
    # =========================================================================

    def test_stats_tracking(self):
        """Test hit/miss counts are accurate."""
        # Warm cache for one table - use query-discriminating mock
        original_column_rows = [
            ('DB', 'TBL', 'col1', 1),
            ('DB', 'TBL', 'col2', 2),
        ]
        make_query_discriminating_fetchall(self.mock_cursor, original_column_rows)
        self.resolver.warm_cache({('db', 'tbl')})

        # Hit: resolve cached table
        self.resolver.resolve_star('db', 'tbl')

        # Miss: resolve unknown table
        self.resolver.resolve_star('unknown', 'table')

        # Get stats
        stats = self.resolver.get_stats()
        self.assertEqual(stats['cache_hits'], 1)
        self.assertEqual(stats['cache_misses'], 1)
        self.assertEqual(stats['tables'], 1)
        self.assertEqual(stats['columns'], 2)
        self.assertEqual(stats['hit_rate_pct'], 50.0)


class TestSchemaEvolution(unittest.TestCase):
    """Unit tests for schema evolution detection (Phase 8: QUAL-03)."""

    def setUp(self):
        """Set up mock cursor and temp baseline file for each test."""
        self.mock_cursor = MagicMock()
        # Create a temporary directory for baseline files
        import tempfile
        self.temp_dir = tempfile.TemporaryDirectory()
        self.baseline_path = f"{self.temp_dir.name}/baseline.json"

    def tearDown(self):
        """Clean up temporary directory."""
        self.temp_dir.cleanup()

    # =========================================================================
    # QUAL-03: Schema evolution detection
    # =========================================================================

    def test_schema_change_detected(self):
        """Test schema change detection logs warning and records delta."""
        import json

        # Create baseline file with 5 columns for CUSTOMERS
        baseline_data = {"DEMO_USER.CUSTOMERS": 5}
        with open(self.baseline_path, 'w') as f:
            json.dump(baseline_data, f)

        # Create resolver with baseline
        resolver = WildcardResolver(
            self.mock_cursor,
            default_database='demo_user',
            baseline_path=self.baseline_path
        )

        # Manually populate cache with 6 columns (baseline was 5)
        resolver._column_cache = {
            ('DEMO_USER', 'CUSTOMERS'): ['a', 'b', 'c', 'd', 'e', 'f']
        }

        # Capture logging output
        with self.assertLogs('wildcard_resolver', level='WARNING') as log_context:
            resolver._detect_schema_changes()

        # Assert warning was logged
        warning_found = any('schema evolution' in msg.lower() for msg in log_context.output)
        self.assertTrue(warning_found, f"Expected schema evolution warning. Got: {log_context.output}")

        # Assert _schema_changes list has 1 entry with delta +1
        self.assertEqual(len(resolver._schema_changes), 1)
        change = resolver._schema_changes[0]
        self.assertEqual(change['table'], 'DEMO_USER.CUSTOMERS')
        self.assertEqual(change['baseline_columns'], 5)
        self.assertEqual(change['current_columns'], 6)
        self.assertEqual(change['delta'], 1)
        self.assertIn('timestamp', change)

    def test_schema_no_change(self):
        """Test no change detected when column count matches baseline."""
        import json

        # Create baseline file with 3 columns
        baseline_data = {"DEMO_USER.CUSTOMERS": 3}
        with open(self.baseline_path, 'w') as f:
            json.dump(baseline_data, f)

        # Create resolver
        resolver = WildcardResolver(
            self.mock_cursor,
            default_database='demo_user',
            baseline_path=self.baseline_path
        )

        # Populate cache with 3 columns (same as baseline)
        resolver._column_cache = {
            ('DEMO_USER', 'CUSTOMERS'): ['col1', 'col2', 'col3']
        }

        # Call detect_schema_changes
        resolver._detect_schema_changes()

        # Assert no changes detected
        self.assertEqual(len(resolver._schema_changes), 0)

    def test_schema_no_baseline_first_run(self):
        """Test no changes detected when baseline file doesn't exist (first run)."""
        import os

        # Create resolver with non-existent baseline file
        non_existent_path = f"{self.temp_dir.name}/does_not_exist.json"
        self.assertFalse(os.path.exists(non_existent_path))

        resolver = WildcardResolver(
            self.mock_cursor,
            default_database='demo_user',
            baseline_path=non_existent_path
        )

        # Populate cache
        resolver._column_cache = {
            ('DEMO_USER', 'CUSTOMERS'): ['col1', 'col2']
        }

        # Call detect_schema_changes
        resolver._detect_schema_changes()

        # Assert no changes detected (nothing to compare)
        self.assertEqual(len(resolver._schema_changes), 0)

    def test_baseline_save_and_load(self):
        """Test baseline save/load round-trip."""
        import json

        # Create resolver
        resolver = WildcardResolver(
            self.mock_cursor,
            default_database='demo_user',
            baseline_path=self.baseline_path
        )

        # Manually populate cache with known data
        resolver._column_cache = {
            ('DB1', 'TABLE1'): ['a', 'b', 'c'],
            ('DB2', 'TABLE2'): ['x', 'y']
        }

        # Save baseline
        resolver._save_baseline()

        # Verify file was created
        self.assertTrue(os.path.exists(self.baseline_path))

        # Load baseline in new resolver
        resolver2 = WildcardResolver(
            self.mock_cursor,
            default_database='demo_user',
            baseline_path=self.baseline_path
        )

        # Verify baseline was loaded correctly
        self.assertEqual(resolver2._baseline[('DB1', 'TABLE1')], 3)
        self.assertEqual(resolver2._baseline[('DB2', 'TABLE2')], 2)

    def test_baseline_backward_compatible(self):
        """Test backward compatibility when baseline_path not provided."""
        # Create resolver WITHOUT baseline_path
        resolver = WildcardResolver(
            self.mock_cursor,
            default_database='demo_user'
        )

        # Assert baseline attributes are correct
        self.assertIsNone(resolver._baseline_path)
        self.assertEqual(resolver._baseline, {})
        self.assertEqual(resolver._schema_changes, [])

        # Mock cursor for warm_cache
        self.mock_cursor.fetchall.return_value = []

        # Call warm_cache - should not raise
        resolver.warm_cache(set())

        # Should complete without error
        self.assertIsInstance(resolver._column_cache, dict)

    def test_get_schema_changes_returns_details(self):
        """Test get_schema_changes returns list of change details."""
        import json

        # Create baseline
        baseline_data = {"DEMO_USER.CUSTOMERS": 3}
        with open(self.baseline_path, 'w') as f:
            json.dump(baseline_data, f)

        # Create resolver
        resolver = WildcardResolver(
            self.mock_cursor,
            default_database='demo_user',
            baseline_path=self.baseline_path
        )

        # Populate cache with different count
        resolver._column_cache = {
            ('DEMO_USER', 'CUSTOMERS'): ['a', 'b', 'c', 'd', 'e']  # 5 columns, baseline was 3
        }

        # Detect changes
        resolver._detect_schema_changes()

        # Call get_schema_changes
        changes = resolver.get_schema_changes()

        # Assert returns list of dicts with correct keys
        self.assertIsInstance(changes, list)
        self.assertEqual(len(changes), 1)

        change = changes[0]
        self.assertIn('table', change)
        self.assertIn('baseline_columns', change)
        self.assertIn('current_columns', change)
        self.assertIn('delta', change)
        self.assertIn('timestamp', change)

        # Verify values
        self.assertEqual(change['table'], 'DEMO_USER.CUSTOMERS')
        self.assertEqual(change['baseline_columns'], 3)
        self.assertEqual(change['current_columns'], 5)
        self.assertEqual(change['delta'], 2)

    def test_get_stats_includes_schema_changes(self):
        """Test get_stats includes schema_changes count."""
        import json

        # Create baseline
        baseline_data = {
            "DEMO_USER.CUSTOMERS": 3,
            "DEMO_USER.ORDERS": 5
        }
        with open(self.baseline_path, 'w') as f:
            json.dump(baseline_data, f)

        # Create resolver
        resolver = WildcardResolver(
            self.mock_cursor,
            default_database='demo_user',
            baseline_path=self.baseline_path
        )

        # Populate cache with changes to both tables
        resolver._column_cache = {
            ('DEMO_USER', 'CUSTOMERS'): ['a', 'b', 'c', 'd'],  # 4 columns, baseline was 3
            ('DEMO_USER', 'ORDERS'): ['x', 'y', 'z']  # 3 columns, baseline was 5
        }

        # Detect changes
        resolver._detect_schema_changes()

        # Get stats
        stats = resolver.get_stats()

        # Assert schema_changes key present with correct count
        self.assertIn('schema_changes', stats)
        self.assertEqual(stats['schema_changes'], 2)

        # Verify other stats are present
        self.assertIn('tables', stats)
        self.assertIn('columns', stats)
        self.assertEqual(stats['tables'], 2)
        self.assertEqual(stats['columns'], 7)  # 4 + 3


class TestViewExpansion(unittest.TestCase):
    """Unit tests for view expansion functionality (Phase 9: VIEW-01 through VIEW-05).

    All tests use mocks - no database connection required.
    """

    def setUp(self):
        """Set up mock cursor for each test."""
        self.mock_cursor = MagicMock()
        self.resolver = WildcardResolver(self.mock_cursor, default_database='demo_user')

    def _configure_cursor(self, view_rows=None, column_rows=None, request_text_rows=None):
        """Configure mock cursor to return different results based on query.

        Discriminates between DBC.TablesV (TableKind/RequestText) queries and
        DBC.ColumnsJQV/ColumnsV queries by inspecting the last executed query string.
        """
        def mock_execute(query, *args):
            self._last_query = query

        self.mock_cursor.execute.side_effect = mock_execute

        def mock_fetchall():
            if hasattr(self, '_last_query'):
                if 'TableKind' in self._last_query and 'RequestText' not in self._last_query:
                    return view_rows or []
                elif 'RequestText' in self._last_query:
                    return request_text_rows or []
                elif 'ColumnsJQV' in self._last_query or 'ColumnsV' in self._last_query:
                    return column_rows or []
            return []

        self.mock_cursor.fetchall.side_effect = mock_fetchall

    # =========================================================================
    # VIEW-01: View detection via DBC.TablesV TableKind='V'
    # =========================================================================

    def test_identify_views_detects_view(self):
        """Test _identify_views correctly identifies view refs from TableKind='V'."""
        # Configure cursor to return view identification rows
        self.mock_cursor.fetchall.return_value = [
            ('DEMO_USER', 'MY_VIEW'),
        ]

        table_refs = [('DEMO_USER', 'MY_VIEW'), ('DEMO_USER', 'BASE_TABLE')]
        views = self.resolver._identify_views(table_refs)

        # Assert view ref is returned, table ref is not
        self.assertIn(('DEMO_USER', 'MY_VIEW'), views)
        self.assertNotIn(('DEMO_USER', 'BASE_TABLE'), views)

    def test_identify_views_empty_input(self):
        """Test _identify_views([]) returns empty set without querying database."""
        views = self.resolver._identify_views([])

        # Assert cursor.execute NOT called (no DB interaction needed)
        self.mock_cursor.execute.assert_not_called()
        self.assertEqual(views, set())

    # =========================================================================
    # VIEW-02: View definition retrieval with overflow detection
    # =========================================================================

    def test_fetch_view_definitions_with_overflow(self):
        """Test truncated view definition (RequestTxtOverFlow='Y') returns None."""
        # Configure cursor to return rows where one view has overflow
        self.mock_cursor.fetchall.return_value = [
            ('DEMO_USER', 'BIG_VIEW', None, 'Y'),      # truncated
            ('DEMO_USER', 'SMALL_VIEW', 'CREATE VIEW DEMO_USER.SMALL_VIEW AS SELECT id FROM t', 'N'),
        ]

        view_refs = {('DEMO_USER', 'BIG_VIEW'), ('DEMO_USER', 'SMALL_VIEW')}
        definitions = self.resolver._fetch_view_definitions(view_refs)

        # Truncated view returns None (signals SHOW VIEW fallback needed)
        self.assertIsNone(definitions.get(('DEMO_USER', 'BIG_VIEW')))
        # Non-truncated view returns the SQL text
        self.assertIsNotNone(definitions.get(('DEMO_USER', 'SMALL_VIEW')))

    def test_fetch_view_definitions_no_overflow_column(self):
        """Test fallback to length-based truncation detection when RequestTxtOverFlow missing."""
        # First call (with RequestTxtOverFlow) raises Exception
        # Second call (without RequestTxtOverFlow) returns rows
        short_text = 'CREATE VIEW DEMO_USER.MY_VIEW AS SELECT id FROM t'
        long_text = 'X' * 12500  # at truncation threshold

        call_count = [0]

        def execute_side_effect(query, *args):
            self._last_query = query
            call_count[0] += 1
            if call_count[0] == 1 and 'RequestTxtOverFlow' in query:
                raise Exception("Column 'RequestTxtOverFlow' does not exist")

        def fetchall_side_effect():
            if call_count[0] == 1:
                return []  # not reached (exception thrown before fetchall)
            # Fallback query (no overflow column)
            return [
                ('DEMO_USER', 'SHORT_VIEW', short_text),
                ('DEMO_USER', 'LONG_VIEW', long_text),
            ]

        self.mock_cursor.execute.side_effect = execute_side_effect
        self.mock_cursor.fetchall.side_effect = fetchall_side_effect

        view_refs = {('DEMO_USER', 'SHORT_VIEW'), ('DEMO_USER', 'LONG_VIEW')}
        definitions = self.resolver._fetch_view_definitions(view_refs)

        # Short view should have its definition
        self.assertIsNotNone(definitions.get(('DEMO_USER', 'SHORT_VIEW')))
        # Long view (>= 12500 chars) should be marked truncated (None)
        self.assertIsNone(definitions.get(('DEMO_USER', 'LONG_VIEW')))

    def test_show_view_fallback(self):
        """Test _fetch_view_definition_show_view returns joined text from result rows."""
        self.mock_cursor.fetchall.return_value = [
            ('CREATE VIEW DEMO_USER.MY_VIEW AS',),
            ('SELECT id, name FROM base_table',),
        ]

        result = self.resolver._fetch_view_definition_show_view('DEMO_USER', 'MY_VIEW')

        # Assert returns joined text
        self.assertIsNotNone(result)
        self.assertIn('CREATE VIEW', result)
        self.assertIn('SELECT id, name', result)

    def test_show_view_fallback_failure(self):
        """Test _fetch_view_definition_show_view returns None on exception."""
        self.mock_cursor.execute.side_effect = Exception('SHOW VIEW failed')

        result = self.resolver._fetch_view_definition_show_view('DEMO_USER', 'MY_VIEW')

        # Assert graceful degradation (returns None, no exception raised)
        self.assertIsNone(result)

    # =========================================================================
    # VIEW-03: Recursive view expansion
    # =========================================================================

    def test_expand_view_simple(self):
        """Test simple view expansion: CREATE VIEW v AS SELECT * FROM base_table."""
        # Pre-populate cache with base table columns so the proxy can find them
        self.resolver._column_cache[('DEMO_USER', 'BASE_TABLE')] = ['col_a', 'col_b', 'col_c']

        view_sql = 'CREATE VIEW DEMO_USER.MY_VIEW AS SELECT * FROM DEMO_USER.BASE_TABLE'
        columns = self.resolver._expand_view_columns('DEMO_USER', 'MY_VIEW', view_sql, {})

        # Assert view expands to base table's columns
        self.assertEqual(columns, ['col_a', 'col_b', 'col_c'])

    def test_expand_view_depth_limit(self):
        """Test depth limit: stops expansion when MAX_VIEW_EXPANSION_DEPTH reached."""
        # Set depth counter at limit
        self.resolver._view_expansion_depth = self.resolver.MAX_VIEW_EXPANSION_DEPTH

        view_sql = 'CREATE VIEW DEMO_USER.DEEP_VIEW AS SELECT * FROM DEMO_USER.BASE_TABLE'

        # Should stop and log warning
        with self.assertLogs('wildcard_resolver', level='WARNING') as log_context:
            columns = self.resolver._expand_view_columns('DEMO_USER', 'DEEP_VIEW', view_sql, {})

        # Assert returns empty list
        self.assertEqual(columns, [])
        # Assert depth limit warning logged
        warning_found = any('depth limit' in msg.lower() for msg in log_context.output)
        self.assertTrue(warning_found, f"Expected depth limit warning. Got: {log_context.output}")

    def test_expand_view_circular_detection(self):
        """Test circular reference detection: VIEW_A -> VIEW_A logs ERROR."""
        # Simulate VIEW_A is already in the expansion path
        self.resolver._view_expansion_path = {('DEMO_USER', 'VIEW_A')}

        view_sql = 'CREATE VIEW DEMO_USER.VIEW_A AS SELECT * FROM DEMO_USER.VIEW_A'

        # Should detect cycle and log error
        with self.assertLogs('wildcard_resolver', level='ERROR') as log_context:
            columns = self.resolver._expand_view_columns('DEMO_USER', 'VIEW_A', view_sql, {})

        # Assert returns empty list
        self.assertEqual(columns, [])
        # Assert circular reference error logged
        error_found = any('circular' in msg.lower() for msg in log_context.output)
        self.assertTrue(error_found, f"Expected circular reference error. Got: {log_context.output}")

    def test_replace_view_normalization(self):
        """Test REPLACE VIEW is normalized to CREATE VIEW before parsing."""
        # Pre-populate cache with base table columns
        self.resolver._column_cache[('DEMO_USER', 'BASE_TABLE')] = ['id', 'name']

        # Teradata stores view definitions as REPLACE VIEW
        view_sql = 'REPLACE VIEW DEMO_USER.MY_VIEW AS SELECT * FROM DEMO_USER.BASE_TABLE'
        columns = self.resolver._expand_view_columns('DEMO_USER', 'MY_VIEW', view_sql, {})

        # Assert normalization works: view expands to base table columns
        self.assertEqual(columns, ['id', 'name'])

    # =========================================================================
    # VIEW-04: View expansion caching
    # =========================================================================

    def test_expand_view_cached_result(self):
        """Test cached expansion result is returned without re-parsing."""
        # Pre-populate expansion cache
        self.resolver._view_expansion_cache[('DEMO_USER', 'MY_VIEW')] = ['col1', 'col2']

        view_sql = 'CREATE VIEW DEMO_USER.MY_VIEW AS SELECT * FROM DEMO_USER.BASE_TABLE'
        columns = self.resolver._expand_view_columns('DEMO_USER', 'MY_VIEW', view_sql, {})

        # Assert cached result returned
        self.assertEqual(columns, ['col1', 'col2'])
        # Assert no cursor interaction (no DB query needed for cached result)
        self.mock_cursor.execute.assert_not_called()

    def test_warm_cache_with_views_integration(self):
        """Test warm_cache() correctly processes views alongside tables."""
        # Configure: one view in refs, one table
        # Step 1 - _identify_views (TablesV with TableKind): returns view ref
        # Step 2 - _warm_cache_batch (ColumnsJQV): returns table columns
        # Step 3 - _fetch_view_definitions (TablesV with RequestText): returns view SQL

        table_col_rows = [('DEMO_USER', 'BASE_TABLE', 'id', 1), ('DEMO_USER', 'BASE_TABLE', 'name', 2)]

        call_count = [0]

        def execute_side_effect(query, *args):
            self._last_query = query
            call_count[0] += 1

        def fetchall_side_effect():
            q = getattr(self, '_last_query', '')
            # _identify_views: TablesV with TableKind (no RequestText)
            if 'TablesV' in q and 'TableKind' in q and 'RequestText' not in q:
                return [('DEMO_USER', 'MY_VIEW')]
            # _warm_cache_batch: ColumnsJQV for the table
            elif 'ColumnsJQV' in q:
                return table_col_rows
            # _fetch_view_definitions: TablesV with RequestText
            elif 'TablesV' in q and 'RequestText' in q:
                return [
                    ('DEMO_USER', 'MY_VIEW',
                     'CREATE VIEW DEMO_USER.MY_VIEW AS SELECT * FROM DEMO_USER.BASE_TABLE', 'N')
                ]
            return []

        self.mock_cursor.execute.side_effect = execute_side_effect
        self.mock_cursor.fetchall.side_effect = fetchall_side_effect

        # Warm cache with both a table and a view ref
        table_refs = {('DEMO_USER', 'BASE_TABLE'), ('DEMO_USER', 'MY_VIEW')}
        self.resolver.warm_cache(table_refs)

        # Assert cache has entries for the base table
        base_cols = self.resolver.resolve_star('DEMO_USER', 'BASE_TABLE')
        self.assertEqual(base_cols, ['id', 'name'])

        # Assert resolve_star works for the view (via expansion)
        view_cols = self.resolver.resolve_star('DEMO_USER', 'MY_VIEW')
        self.assertEqual(view_cols, ['id', 'name'])


if __name__ == '__main__':
    unittest.main()
