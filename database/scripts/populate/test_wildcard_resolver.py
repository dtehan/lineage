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


if __name__ == '__main__':
    unittest.main()
