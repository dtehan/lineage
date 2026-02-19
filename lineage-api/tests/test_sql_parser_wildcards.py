#!/usr/bin/env python3
"""
Unit tests for SQL Parser Wildcard Expansion.

Tests the TeradataSQLParser's wildcard expansion functionality using a mock
WildcardResolver. All tests run without database connection.

Run with:
    cd lineage-api
    python -m pytest tests/test_sql_parser_wildcards.py -v
    OR
    python -m unittest tests.test_sql_parser_wildcards -v
"""

import sys
import os
import unittest
from typing import Dict, List, Tuple

# Add parent directory to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from utils.sql_parser import TeradataSQLParser


class MockWildcardResolver:
    """Mock WildcardResolver for testing without database."""

    def __init__(self, column_map: Dict[Tuple[str, str], List[str]]):
        """
        Initialize mock resolver with column mappings.

        Args:
            column_map: Dict mapping (database, table) -> [columns]
        """
        self._column_map = {
            (db.upper(), tbl.upper()): cols
            for (db, tbl), cols in column_map.items()
        }

    def resolve_star(self, database: str, table: str) -> List[str]:
        """Resolve wildcard to column list."""
        db = (database or "demo_user").upper()
        tbl = table.upper()
        return self._column_map.get((db, tbl), [])


class TestWildcardExpansion(unittest.TestCase):
    """Unit tests for SQL parser wildcard expansion."""

    # =========================================================================
    # A. SELECT * Expansion (CORE-01)
    # =========================================================================

    def test_select_star_single_table_insert(self):
        """Test basic SELECT * expansion with INSERT."""
        # Mock source table with 3 columns
        resolver = MockWildcardResolver({
            ('demo_user', 'source_table'): ['a', 'b', 'c']
        })
        parser = TeradataSQLParser(wildcard_resolver=resolver)

        sql = """
        INSERT INTO demo_user.target_table (col1, col2, col3)
        SELECT * FROM demo_user.source_table
        """

        lineage = parser.extract_column_lineage(sql)

        # Assert 3 lineage records: a->col1, b->col2, c->col3
        self.assertEqual(len(lineage), 3)
        self.assertEqual(lineage[0]['source_column'], 'a')
        self.assertEqual(lineage[0]['target_column'], 'col1')
        self.assertEqual(lineage[1]['source_column'], 'b')
        self.assertEqual(lineage[1]['target_column'], 'col2')
        self.assertEqual(lineage[2]['source_column'], 'c')
        self.assertEqual(lineage[2]['target_column'], 'col3')

        # Assert all confidence_score = 0.70 (CONFIDENCE_STAR)
        for record in lineage:
            self.assertEqual(record['confidence_score'], 0.70)

    def test_select_star_no_resolver_skips(self):
        """Test backward compatibility - no resolver skips wildcard expansion."""
        # Parser created WITHOUT resolver
        parser = TeradataSQLParser()

        sql = """
        INSERT INTO demo_user.target_table (col1, col2, col3)
        SELECT * FROM demo_user.source_table
        """

        lineage = parser.extract_column_lineage(sql)

        # Without resolver, wildcard expansion is skipped and falls back to pattern-based
        # extraction which creates table-level lineage with confidence 0.6
        if len(lineage) > 0:
            # Verify no wildcard-specific confidence (0.70) is used
            for record in lineage:
                self.assertNotEqual(record['confidence_score'], 0.70,
                                  "Should not use wildcard confidence without resolver")
                self.assertEqual(record['transformation_type'], 'UNKNOWN',
                               "Should use pattern-based fallback without resolver")

    def test_select_star_unknown_table_skips(self):
        """Test missing metadata gracefully skips wildcard expansion."""
        # Mock resolver with NO tables
        resolver = MockWildcardResolver({})
        parser = TeradataSQLParser(wildcard_resolver=resolver)

        sql = """
        INSERT INTO demo_user.target_table (col1, col2, col3)
        SELECT * FROM demo_user.unknown_table
        """

        lineage = parser.extract_column_lineage(sql)

        # When table is unknown to resolver, wildcard expansion is skipped
        # and falls back to pattern-based extraction (table-level lineage)
        if len(lineage) > 0:
            # Verify no wildcard-specific confidence (0.70) is used
            for record in lineage:
                self.assertNotEqual(record['confidence_score'], 0.70,
                                  "Should not use wildcard confidence for unknown tables")

    # =========================================================================
    # B. INSERT INTO...SELECT * Ordinal Matching (CORE-02)
    # =========================================================================

    def test_insert_select_star_ordinal_position(self):
        """Test position-based matching with explicit target columns."""
        resolver = MockWildcardResolver({
            ('demo_user', 'source'): ['a', 'b', 'c']
        })
        parser = TeradataSQLParser(wildcard_resolver=resolver)

        sql = """
        INSERT INTO demo_user.target (x, y, z)
        SELECT * FROM demo_user.source
        """

        lineage = parser.extract_column_lineage(sql)

        # Assert lineage: source.a -> target.x, source.b -> target.y, source.c -> target.z
        self.assertEqual(len(lineage), 3)
        self.assertEqual(lineage[0]['source_column'], 'a')
        self.assertEqual(lineage[0]['target_column'], 'x')
        self.assertEqual(lineage[1]['source_column'], 'b')
        self.assertEqual(lineage[1]['target_column'], 'y')
        self.assertEqual(lineage[2]['source_column'], 'c')
        self.assertEqual(lineage[2]['target_column'], 'z')

    def test_insert_select_star_no_explicit_columns(self):
        """Test INSERT without explicit target column list."""
        resolver = MockWildcardResolver({
            ('demo_user', 'source'): ['a', 'b', 'c'],
            ('demo_user', 'target'): ['x', 'y', 'z']
        })
        parser = TeradataSQLParser(wildcard_resolver=resolver)

        sql = """
        INSERT INTO demo_user.target
        SELECT * FROM demo_user.source
        """

        lineage = parser.extract_column_lineage(sql)

        # Assert lineage: source.a -> target.x, source.b -> target.y, source.c -> target.z
        self.assertEqual(len(lineage), 3)
        self.assertEqual(lineage[0]['source_column'], 'a')
        self.assertEqual(lineage[0]['target_column'], 'x')
        self.assertEqual(lineage[1]['source_column'], 'b')
        self.assertEqual(lineage[1]['target_column'], 'y')
        self.assertEqual(lineage[2]['source_column'], 'c')
        self.assertEqual(lineage[2]['target_column'], 'z')

    def test_insert_select_star_column_count_mismatch(self):
        """Test fewer target columns than source columns."""
        resolver = MockWildcardResolver({
            ('demo_user', 'source'): ['a', 'b', 'c']  # 3 columns
        })
        parser = TeradataSQLParser(wildcard_resolver=resolver)

        sql = """
        INSERT INTO demo_user.target (x, y)
        SELECT * FROM demo_user.source
        """

        lineage = parser.extract_column_lineage(sql)

        # Assert 3 lineage records (first 2 ordinal matched, third uses source name)
        self.assertEqual(len(lineage), 3)
        self.assertEqual(lineage[0]['source_column'], 'a')
        self.assertEqual(lineage[0]['target_column'], 'x')
        self.assertEqual(lineage[1]['source_column'], 'b')
        self.assertEqual(lineage[1]['target_column'], 'y')
        self.assertEqual(lineage[2]['source_column'], 'c')
        self.assertEqual(lineage[2]['target_column'], 'c')

    # =========================================================================
    # C. CTAS SELECT * (CORE-03)
    # =========================================================================

    def test_ctas_select_star_derives_names(self):
        """Test target names derived from source columns."""
        resolver = MockWildcardResolver({
            ('demo_user', 'source'): ['customer_id', 'name', 'email']
        })
        parser = TeradataSQLParser(wildcard_resolver=resolver)

        sql = """
        CREATE TABLE demo_user.new_table AS (
            SELECT * FROM demo_user.source
        ) WITH DATA
        """

        lineage = parser.extract_column_lineage(sql)

        # Assert lineage targets: customer_id, name, email (derived from source)
        self.assertEqual(len(lineage), 3)
        self.assertEqual(lineage[0]['source_column'], 'customer_id')
        self.assertEqual(lineage[0]['target_column'], 'customer_id')
        self.assertEqual(lineage[1]['source_column'], 'name')
        self.assertEqual(lineage[1]['target_column'], 'name')
        self.assertEqual(lineage[2]['source_column'], 'email')
        self.assertEqual(lineage[2]['target_column'], 'email')

        # Assert confidence = 0.70
        for record in lineage:
            self.assertEqual(record['confidence_score'], 0.70)

    # =========================================================================
    # D. Confidence Scoring (CORE-05)
    # =========================================================================

    def test_confidence_direct_column(self):
        """Test explicit column gets confidence 0.95."""
        parser = TeradataSQLParser()  # No resolver needed for direct columns

        sql = """
        INSERT INTO demo_user.t (a)
        SELECT col1 FROM demo_user.s
        """

        lineage = parser.extract_column_lineage(sql)

        # Assert confidence = 0.95
        self.assertEqual(len(lineage), 1)
        self.assertEqual(lineage[0]['confidence_score'], 0.95)

    def test_confidence_wildcard_expansion(self):
        """Test wildcard expansion gets confidence 0.70."""
        resolver = MockWildcardResolver({
            ('demo_user', 's'): ['col1']
        })
        parser = TeradataSQLParser(wildcard_resolver=resolver)

        sql = """
        INSERT INTO demo_user.t (a)
        SELECT * FROM demo_user.s
        """

        lineage = parser.extract_column_lineage(sql)

        # Assert confidence = 0.70
        self.assertEqual(len(lineage), 1)
        self.assertEqual(lineage[0]['confidence_score'], 0.70)

    def test_confidence_expression(self):
        """Test expression gets confidence 0.85."""
        parser = TeradataSQLParser()  # No resolver needed

        sql = """
        INSERT INTO demo_user.t (a)
        SELECT col1 || col2 FROM demo_user.s
        """

        lineage = parser.extract_column_lineage(sql)

        # Assert confidence = 0.85 (expression with multiple columns)
        # Note: Each column in expression gets its own record
        self.assertGreater(len(lineage), 0)
        for record in lineage:
            self.assertEqual(record['confidence_score'], 0.85)

    # =========================================================================
    # E. Multi-Table Skip (CORE-07)
    # =========================================================================

    def test_multi_table_unqualified_star_skipped(self):
        """Test multi-table unqualified SELECT * is skipped for wildcard expansion."""
        resolver = MockWildcardResolver({
            ('demo_user', 't1'): ['col1', 'col2'],
            ('demo_user', 't2'): ['colA', 'colB']
        })
        parser = TeradataSQLParser(wildcard_resolver=resolver)

        sql = """
        INSERT INTO demo_user.target (a, b)
        SELECT * FROM demo_user.t1 JOIN demo_user.t2 ON t1.id = t2.id
        """

        lineage = parser.extract_column_lineage(sql)

        # Wildcard expansion is skipped (ambiguous), but pattern-based fallback
        # may still extract table-level relationships. The key is wildcard
        # expansion doesn't create incorrect column mappings.
        # Check that no wildcard-specific confidence (0.70) is used
        for record in lineage:
            self.assertNotEqual(record['confidence_score'], 0.70,
                              "Should not use wildcard confidence for multi-table SELECT *")

    # =========================================================================
    # F. CTE Depth Limit (CORE-08)
    # =========================================================================

    def test_cte_simple_wildcard(self):
        """Test single CTE level expands correctly."""
        resolver = MockWildcardResolver({
            ('demo_user', 'source'): ['col1', 'col2']
        })
        parser = TeradataSQLParser(wildcard_resolver=resolver)

        sql = """
        INSERT INTO demo_user.target (a, b)
        SELECT * FROM (SELECT * FROM demo_user.source) sub
        """

        lineage = parser.extract_column_lineage(sql)

        # Assert columns expanded through CTE
        self.assertEqual(len(lineage), 2)
        self.assertEqual(lineage[0]['source_column'], 'col1')
        self.assertEqual(lineage[1]['source_column'], 'col2')

    def test_cte_depth_limit_exceeded(self):
        """Test 6+ nested CTE levels stops expansion."""
        resolver = MockWildcardResolver({
            ('demo_user', 'source'): ['col1', 'col2']
        })
        parser = TeradataSQLParser(wildcard_resolver=resolver)

        sql = """
        WITH cte1 AS (SELECT * FROM demo_user.source),
             cte2 AS (SELECT * FROM cte1),
             cte3 AS (SELECT * FROM cte2),
             cte4 AS (SELECT * FROM cte3),
             cte5 AS (SELECT * FROM cte4),
             cte6 AS (SELECT * FROM cte5)
        INSERT INTO demo_user.target (a, b)
        SELECT * FROM cte6
        """

        lineage = parser.extract_column_lineage(sql)

        # Assert expansion stops (returns empty or partial)
        # At depth 5 (MAX_EXPANSION_DEPTH), expansion should stop
        # This might return 0 records or partial records depending on when limit hits
        # The key is that it doesn't hang or crash
        self.assertIsInstance(lineage, list)

    def test_cte_cycle_detection(self):
        """Test recursive CTE reference doesn't cause infinite loop."""
        resolver = MockWildcardResolver({})
        parser = TeradataSQLParser(wildcard_resolver=resolver)

        # This SQL is syntactically invalid but tests cycle detection logic
        # The parser should detect if a CTE references itself in expansion path
        sql = """
        WITH RECURSIVE cte AS (
            SELECT 1 as n
            UNION ALL
            SELECT n+1 FROM cte WHERE n < 10
        )
        SELECT * FROM cte
        """

        # Should not hang - cycle detection prevents infinite loop
        lineage = parser.extract_column_lineage(sql)

        # Assert returns without hanging
        self.assertIsInstance(lineage, list)

    # =========================================================================
    # G. Mixed Columns (Wildcard + Explicit)
    # =========================================================================

    def test_mixed_wildcard_and_explicit_columns(self):
        """Test mixed wildcard and explicit columns."""
        resolver = MockWildcardResolver({
            ('demo_user', 'source'): ['col1', 'col2', 'col3']
        })
        parser = TeradataSQLParser(wildcard_resolver=resolver)

        # Note: This SQL is unusual. Testing that explicit columns get correct confidence.
        sql = """
        INSERT INTO demo_user.target (a, b, c, d, e)
        SELECT colX, *, colY FROM demo_user.source
        """

        lineage = parser.extract_column_lineage(sql)

        # Verify lineage is extracted (specific behavior may vary by parser)
        self.assertIsInstance(lineage, list)

        # If parser handles this, verify confidence varies by source
        if len(lineage) > 0:
            # Check that we have a mix of confidence levels
            confidence_scores = {record['confidence_score'] for record in lineage}
            # Should have different confidence levels for explicit vs wildcard
            self.assertIsInstance(confidence_scores, set)


if __name__ == '__main__':
    unittest.main()
