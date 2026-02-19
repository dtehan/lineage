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
        # Mock cursor.fetchall() returning 3 columns
        self.mock_cursor.fetchall.return_value = [
            ('DEMO_USER', 'CUSTOMERS', 'customer_id', 1),
            ('DEMO_USER', 'CUSTOMERS', 'name', 2),
            ('DEMO_USER', 'CUSTOMERS', 'email', 3),
        ]

        # Warm cache with single table
        table_refs = {('demo_user', 'customers')}
        self.resolver.warm_cache(table_refs)

        # Assert cursor.execute() was called
        self.mock_cursor.execute.assert_called_once()
        call_args = self.mock_cursor.execute.call_args[0][0]
        self.assertIn('DBC.ColumnsJQV', call_args)
        self.assertIn('DEMO_USER', call_args)
        self.assertIn('CUSTOMERS', call_args)

        # Assert cache contains correct columns in order
        columns = self.resolver.resolve_star('demo_user', 'customers')
        self.assertEqual(columns, ['customer_id', 'name', 'email'])

    def test_warm_cache_multiple_tables(self):
        """Test batch query with multiple tables."""
        # Mock cursor.fetchall() returning columns for 3 tables
        self.mock_cursor.fetchall.return_value = [
            ('DB1', 'TABLE1', 'col1', 1),
            ('DB1', 'TABLE1', 'col2', 2),
            ('DB2', 'TABLE2', 'colA', 1),
            ('DB2', 'TABLE2', 'colB', 2),
            ('DB2', 'TABLE2', 'colC', 3),
            ('DB3', 'TABLE3', 'id', 1),
        ]

        # Provide 3 (database, table) pairs
        table_refs = {
            ('db1', 'table1'),
            ('db2', 'table2'),
            ('db3', 'table3'),
        }
        self.resolver.warm_cache(table_refs)

        # Verify single execute() call (batch, not per-table)
        self.mock_cursor.execute.assert_called_once()

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
        self.mock_cursor.fetchall.return_value = [
            ('DEMO_USER', 'MYTABLE', 'col1', 1),
            ('DEMO_USER', 'MYTABLE', 'col2', 2),
        ]

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
        # Mock cursor.fetchall() to return empty (we only care about call count)
        self.mock_cursor.fetchall.return_value = []

        # Provide 150 table references
        table_refs = {
            (f'db{i}', f'table{i}')
            for i in range(150)
        }
        self.resolver.warm_cache(table_refs)

        # Assert cursor.execute() called twice (100 + 50)
        self.assertEqual(self.mock_cursor.execute.call_count, 2)

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
        # Warm cache
        self.mock_cursor.fetchall.return_value = [
            ('DB', 'TBL', 'a', 1),
            ('DB', 'TBL', 'b', 2),
            ('DB', 'TBL', 'c', 3),
        ]
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
        # Cache warmed with uppercase
        self.mock_cursor.fetchall.return_value = [
            ('DB', 'TBL', 'col1', 1),
        ]
        self.resolver.warm_cache({('DB', 'TBL')})

        # Resolve with lowercase
        columns = self.resolver.resolve_star('db', 'tbl')
        self.assertEqual(columns, ['col1'])

    def test_resolve_star_default_database(self):
        """Test None database uses default_database."""
        # Cache warmed with default database
        self.mock_cursor.fetchall.return_value = [
            ('DEMO_USER', 'ORDERS', 'order_id', 1),
            ('DEMO_USER', 'ORDERS', 'amount', 2),
        ]
        self.resolver.warm_cache({('demo_user', 'orders')})

        # Resolve with None database
        columns = self.resolver.resolve_star(None, 'orders')
        self.assertEqual(columns, ['order_id', 'amount'])

    # =========================================================================
    # D. Statistics Tests
    # =========================================================================

    def test_stats_tracking(self):
        """Test hit/miss counts are accurate."""
        # Warm cache for one table
        self.mock_cursor.fetchall.return_value = [
            ('DB', 'TBL', 'col1', 1),
            ('DB', 'TBL', 'col2', 2),
        ]
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


if __name__ == '__main__':
    unittest.main()
