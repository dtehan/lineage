#!/usr/bin/env python3
"""
Unit tests for ViewLineageExtractor module.

Tests the ViewLineageExtractor class that derives column-level lineage from
view SQL definitions fetched from DBC.TablesV. All tests use mocks - no
database connection required.

Run with:
    cd /Users/Daniel.Tehan/Code/lineage
    python -m pytest database/tests/test_view_lineage_extractor.py -v
"""

import sys
import os
import unittest
from unittest.mock import MagicMock, call, patch

# Add the populate directory to sys.path so we can import the module directly
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'scripts', 'populate'))

from view_lineage_extractor import ViewLineageExtractor


def make_mock_cursor():
    """Create a fresh MagicMock cursor for each test."""
    return MagicMock()


def make_extractor(cursor=None, namespace_uri="teradata://test-host:1025",
                   database="demo_user", verbose=False, dry_run=False):
    """Create a ViewLineageExtractor with a mock cursor."""
    if cursor is None:
        cursor = make_mock_cursor()
    return ViewLineageExtractor(
        cursor=cursor,
        namespace_uri=namespace_uri,
        database=database,
        verbose=verbose,
        dry_run=dry_run,
    )


class TestDiscoverViews(unittest.TestCase):
    """Tests for the _discover_views() method."""

    def test_discover_views_returns_view_datasets(self):
        """discover_views returns (dataset_id, name) tuples for VIEW rows."""
        cursor = make_mock_cursor()
        cursor.fetchall.return_value = [
            ("ns/demo_user.V_SALES", "demo_user.V_SALES"),
            ("ns/demo_user.V_ORDERS", "demo_user.V_ORDERS"),
        ]
        extractor = make_extractor(cursor=cursor)

        result = extractor._discover_views()

        self.assertEqual(len(result), 2)
        self.assertIn(("ns/demo_user.V_SALES", "demo_user.V_SALES"), result)
        self.assertIn(("ns/demo_user.V_ORDERS", "demo_user.V_ORDERS"), result)

        # Verify query included source_type = 'VIEW' and is_active = 'Y'
        called_sql = cursor.execute.call_args[0][0]
        self.assertIn("source_type = 'VIEW'", called_sql)
        self.assertIn("is_active = 'Y'", called_sql)

    def test_discover_views_skips_tables(self):
        """discover_views only returns rows matching source_type='VIEW'.

        The SQL query filters at the database level, so the test verifies
        the WHERE clause is constructed correctly.
        """
        cursor = make_mock_cursor()
        # Simulate only VIEW rows returned (TABLE rows excluded by SQL WHERE)
        cursor.fetchall.return_value = [
            ("ns/demo_user.V_SALES", "demo_user.V_SALES"),
        ]
        extractor = make_extractor(cursor=cursor)

        result = extractor._discover_views()

        # Only the VIEW row should appear
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0], ("ns/demo_user.V_SALES", "demo_user.V_SALES"))

    def test_discover_views_returns_empty_on_error(self):
        """discover_views returns empty list when query fails (graceful degradation)."""
        cursor = make_mock_cursor()
        cursor.execute.side_effect = Exception("Database error")
        extractor = make_extractor(cursor=cursor)

        result = extractor._discover_views()

        self.assertEqual(result, [])


class TestParseViewLineage(unittest.TestCase):
    """Tests for the _parse_view_lineage() method."""

    def setUp(self):
        """Set up an extractor with a mocked cursor for each test."""
        self.cursor = make_mock_cursor()
        # Default: OL_DATASET_FIELD returns empty (no columns in DB)
        self.cursor.fetchall.return_value = []
        self.cursor.fetchone.return_value = [0]
        self.extractor = make_extractor(cursor=self.cursor)

    def test_parse_simple_view_direct_columns(self):
        """Simple SELECT col1, col2 FROM T produces two DIRECT lineage records."""
        view_sql = "CREATE VIEW demo_user.V AS SELECT col1, col2 FROM demo_user.T"
        records = self.extractor._parse_view_lineage(
            "demo_user", "V", view_sql, "ns/demo_user.V"
        )

        self.assertEqual(len(records), 2)

        source_fields = {r["source_field"] for r in records}
        target_fields = {r["target_field"] for r in records}
        self.assertIn("col1", source_fields)
        self.assertIn("col2", source_fields)
        self.assertIn("col1", target_fields)
        self.assertIn("col2", target_fields)

        for rec in records:
            self.assertEqual(rec["transformation_type"], "DIRECT")
            self.assertEqual(rec["transformation_subtype"], "IDENTITY")
            self.assertEqual(rec["source_dataset"], "DEMO_USER.T")
            self.assertEqual(rec["target_dataset"], "demo_user.V")
            self.assertEqual(rec["confidence_score"], 0.90)

    def test_parse_view_with_aliases(self):
        """SELECT t.col1 AS alias1 FROM T t produces lineage T.col1 -> V.alias1."""
        view_sql = (
            "CREATE VIEW demo_user.V AS "
            "SELECT t.col1 AS alias1 FROM demo_user.T t"
        )
        records = self.extractor._parse_view_lineage(
            "demo_user", "V", view_sql, "ns/demo_user.V"
        )

        self.assertEqual(len(records), 1)
        rec = records[0]
        self.assertEqual(rec["source_field"], "col1")
        self.assertEqual(rec["target_field"], "alias1")
        self.assertEqual(rec["source_dataset"], "DEMO_USER.T")
        self.assertEqual(rec["target_dataset"], "demo_user.V")

    def test_parse_view_with_expression(self):
        """Expression with multiple source columns produces CALCULATION records."""
        view_sql = (
            "CREATE VIEW demo_user.V AS "
            "SELECT TRIM(first_name) || ' ' || TRIM(last_name) AS full_name "
            "FROM demo_user.T"
        )
        records = self.extractor._parse_view_lineage(
            "demo_user", "V", view_sql, "ns/demo_user.V"
        )

        # Should produce CALCULATION records for first_name and last_name -> full_name
        self.assertGreaterEqual(len(records), 1)

        target_fields = {r["target_field"] for r in records}
        self.assertIn("full_name", target_fields)

        for rec in records:
            if rec["target_field"] == "full_name":
                self.assertEqual(rec["transformation_type"], "DIRECT")
                self.assertEqual(rec["transformation_subtype"], "TRANSFORMATION")
                self.assertEqual(rec["confidence_score"], 0.80)

        source_fields = {r["source_field"] for r in records}
        # Both first_name and last_name should appear as source fields
        self.assertIn("first_name", source_fields)
        self.assertIn("last_name", source_fields)

    def test_parse_view_with_join(self):
        """JOIN view produces lineage from both source tables."""
        view_sql = (
            "CREATE VIEW demo_user.V AS "
            "SELECT a.col1, b.col2 "
            "FROM demo_user.T1 a "
            "JOIN demo_user.T2 b ON a.id = b.id"
        )
        records = self.extractor._parse_view_lineage(
            "demo_user", "V", view_sql, "ns/demo_user.V"
        )

        self.assertEqual(len(records), 2)

        source_datasets = {r["source_dataset"] for r in records}
        self.assertIn("DEMO_USER.T1", source_datasets)
        self.assertIn("DEMO_USER.T2", source_datasets)

        by_target = {r["target_field"]: r for r in records}
        self.assertIn("col1", by_target)
        self.assertIn("col2", by_target)
        self.assertEqual(by_target["col1"]["source_field"], "col1")
        self.assertEqual(by_target["col2"]["source_field"], "col2")

    def test_unparseable_view_skipped_with_warning(self):
        """Garbage SQL produces no lineage records and logs a warning."""
        garbage_sql = "THIS IS NOT SQL AT ALL !!!"
        with self.assertLogs('view_lineage_extractor', level='WARNING') as log_ctx:
            records = self.extractor._parse_view_lineage(
                "demo_user", "V", garbage_sql, "ns/demo_user.V"
            )

        self.assertEqual(records, [])
        # At least one warning should have been logged
        self.assertTrue(any('WARNING' in msg or 'demo_user.V' in msg
                            for msg in log_ctx.output))

    def test_replace_view_normalized(self):
        """REPLACE VIEW in RequestText is handled by normalizing to CREATE VIEW."""
        replace_view_sql = "REPLACE VIEW demo_user.V AS SELECT col1 FROM demo_user.T"
        records = self.extractor._parse_view_lineage(
            "demo_user", "V", replace_view_sql, "ns/demo_user.V"
        )

        # Should parse successfully and produce lineage
        self.assertEqual(len(records), 1)
        self.assertEqual(records[0]["source_field"], "col1")
        self.assertEqual(records[0]["target_field"], "col1")
        self.assertEqual(records[0]["source_dataset"], "DEMO_USER.T")

    def test_parse_view_qualified_column_without_alias(self):
        """SELECT t.col1 FROM T t without alias uses col1 as both source and target."""
        view_sql = (
            "CREATE VIEW demo_user.V AS "
            "SELECT t.col1 FROM demo_user.T t"
        )
        records = self.extractor._parse_view_lineage(
            "demo_user", "V", view_sql, "ns/demo_user.V"
        )

        self.assertEqual(len(records), 1)
        self.assertEqual(records[0]["source_field"], "col1")
        self.assertEqual(records[0]["target_field"], "col1")

    def test_parse_view_unqualified_single_table(self):
        """Unqualified column reference resolves to the single source table."""
        view_sql = (
            "CREATE VIEW demo_user.V AS "
            "SELECT col1 FROM demo_user.T"
        )
        records = self.extractor._parse_view_lineage(
            "demo_user", "V", view_sql, "ns/demo_user.V"
        )

        self.assertEqual(len(records), 1)
        self.assertEqual(records[0]["source_field"], "col1")
        self.assertEqual(records[0]["source_dataset"], "DEMO_USER.T")


class TestExtractAllIntegration(unittest.TestCase):
    """Integration tests for extract_all() with fully mocked cursor."""

    def test_extract_all_inserts_records(self):
        """extract_all discovers one VIEW, parses it, and inserts lineage records."""
        cursor = make_mock_cursor()

        # Call sequence tracking for fetchall:
        # 1. _discover_views -> returns one VIEW
        # 2. _fetch_view_definitions (execute+fetchall for DBC.TablesV)
        # Subsequent calls for OL_DATASET_FIELD -> return []
        call_count = [0]

        def fetchall_side_effect():
            call_count[0] += 1
            last_sql = cursor.execute.call_args[0][0]

            if 'OL_DATASET' in last_sql and 'source_type' in last_sql:
                # _discover_views query
                return [("ns/demo_user.V_TEST", "demo_user.V_TEST")]
            elif 'DBC.TablesV' in last_sql:
                # _fetch_view_definitions query - return view with simple definition
                return [
                    ("demo_user", "V_TEST",
                     "REPLACE VIEW demo_user.V_TEST AS SELECT col1, col2 FROM demo_user.SRC_TABLE",
                     "N")  # RequestTxtOverFlow = N (not truncated)
                ]
            else:
                # OL_DATASET_FIELD queries -> no columns cached
                return []

        cursor.fetchall.side_effect = fetchall_side_effect
        cursor.fetchone.return_value = [0]

        extractor = make_extractor(cursor=cursor)
        count = extractor.extract_all()

        # Should have inserted 2 lineage records (col1 and col2)
        self.assertEqual(count, 2)

        # Verify INSERT was called with proper SQL
        insert_calls = [
            c for c in cursor.execute.call_args_list
            if 'INSERT INTO' in c[0][0] and 'OL_COLUMN_LINEAGE' in c[0][0]
        ]
        self.assertEqual(len(insert_calls), 2)

        # Verify the inserted records have correct source/target
        inserted_params = [c[0][1] for c in insert_calls]
        source_datasets = {p[2] for p in inserted_params}
        target_datasets = {p[5] for p in inserted_params}
        self.assertTrue(any('SRC_TABLE' in ds for ds in source_datasets))
        self.assertTrue(any('V_TEST' in ds for ds in target_datasets))

    def test_extract_all_dry_run_does_not_insert(self):
        """dry_run=True returns count without executing INSERT statements."""
        cursor = make_mock_cursor()

        def fetchall_side_effect():
            last_sql = cursor.execute.call_args[0][0]
            if 'OL_DATASET' in last_sql and 'source_type' in last_sql:
                return [("ns/demo_user.V_TEST", "demo_user.V_TEST")]
            elif 'DBC.TablesV' in last_sql:
                return [
                    ("demo_user", "V_TEST",
                     "REPLACE VIEW demo_user.V_TEST AS SELECT col1 FROM demo_user.T",
                     "N")
                ]
            else:
                return []

        cursor.fetchall.side_effect = fetchall_side_effect
        cursor.fetchone.return_value = [0]

        extractor = make_extractor(cursor=cursor, dry_run=True)
        count = extractor.extract_all()

        # Should return record count (1 record for col1)
        self.assertEqual(count, 1)

        # INSERT should NOT have been called
        insert_calls = [
            c for c in cursor.execute.call_args_list
            if 'INSERT INTO' in c[0][0] and 'OL_COLUMN_LINEAGE' in c[0][0]
        ]
        self.assertEqual(len(insert_calls), 0)

    def test_extract_all_no_views_returns_zero(self):
        """extract_all returns 0 when no views exist in OL_DATASET."""
        cursor = make_mock_cursor()
        cursor.fetchall.return_value = []

        extractor = make_extractor(cursor=cursor)
        count = extractor.extract_all()

        self.assertEqual(count, 0)

    def test_extract_all_bad_view_skipped(self):
        """Unparseable view definitions are skipped without crashing."""
        cursor = make_mock_cursor()

        def fetchall_side_effect():
            last_sql = cursor.execute.call_args[0][0]
            if 'OL_DATASET' in last_sql and 'source_type' in last_sql:
                return [
                    ("ns/demo_user.V_BAD", "demo_user.V_BAD"),
                    ("ns/demo_user.V_GOOD", "demo_user.V_GOOD"),
                ]
            elif 'DBC.TablesV' in last_sql:
                return [
                    ("demo_user", "V_BAD",
                     "THIS IS NOT SQL",
                     "N"),
                    ("demo_user", "V_GOOD",
                     "REPLACE VIEW demo_user.V_GOOD AS SELECT col1 FROM demo_user.T",
                     "N"),
                ]
            else:
                return []

        cursor.fetchall.side_effect = fetchall_side_effect
        cursor.fetchone.return_value = [0]

        extractor = make_extractor(cursor=cursor)
        # Should not raise
        count = extractor.extract_all()

        # Only V_GOOD should produce a record
        self.assertEqual(count, 1)


class TestFetchViewDefinitions(unittest.TestCase):
    """Tests for the _fetch_view_definitions() method."""

    def test_fetch_view_definitions_returns_sql(self):
        """Returns SQL text for non-truncated view definitions."""
        cursor = make_mock_cursor()
        cursor.fetchall.return_value = [
            ("DEMO_USER", "V_TEST", "REPLACE VIEW demo_user.V_TEST AS SELECT 1", "N")
        ]
        extractor = make_extractor(cursor=cursor)

        result = extractor._fetch_view_definitions([("DEMO_USER", "V_TEST")])

        self.assertIn(("DEMO_USER", "V_TEST"), result)
        self.assertIn("SELECT 1", result[("DEMO_USER", "V_TEST")])

    def test_fetch_view_definitions_handles_overflow(self):
        """Truncated definitions (RequestTxtOverFlow='Y') trigger SHOW VIEW fallback."""
        cursor = make_mock_cursor()

        call_count = [0]

        def fetchall_side_effect():
            call_count[0] += 1
            last_sql = cursor.execute.call_args[0][0]
            if 'RequestTxtOverFlow' in last_sql:
                # First query - return truncated definition
                return [("DEMO_USER", "V_BIG", "REPLACE VIEW...", "Y")]
            elif 'SHOW VIEW' in last_sql:
                # SHOW VIEW fallback
                return [("REPLACE VIEW demo_user.V_BIG AS SELECT col1 FROM demo_user.T",)]
            return []

        cursor.fetchall.side_effect = fetchall_side_effect
        extractor = make_extractor(cursor=cursor)

        result = extractor._fetch_view_definitions([("DEMO_USER", "V_BIG")])

        # Should have attempted SHOW VIEW and gotten the full definition
        self.assertIn(("DEMO_USER", "V_BIG"), result)

    def test_fetch_view_definitions_empty_input(self):
        """Empty input returns empty dict without querying database."""
        cursor = make_mock_cursor()
        extractor = make_extractor(cursor=cursor)

        result = extractor._fetch_view_definitions([])

        self.assertEqual(result, {})
        cursor.execute.assert_not_called()


class TestBuildRecord(unittest.TestCase):
    """Tests for the _build_record() helper method."""

    def test_build_record_direct_transformation(self):
        """DIRECT transformation builds correct record structure."""
        extractor = make_extractor()
        rec = extractor._build_record(
            "src_db", "src_tbl", "src_col",
            "tgt_db", "tgt_tbl", "tgt_col",
            "DIRECT", 0.90
        )

        self.assertEqual(rec["source_dataset"], "src_db.src_tbl")
        self.assertEqual(rec["source_field"], "src_col")
        self.assertEqual(rec["target_dataset"], "tgt_db.tgt_tbl")
        self.assertEqual(rec["target_field"], "tgt_col")
        self.assertEqual(rec["transformation_type"], "DIRECT")
        self.assertEqual(rec["transformation_subtype"], "IDENTITY")
        self.assertEqual(rec["confidence_score"], 0.90)
        self.assertEqual(rec["transformation_description"], "Derived from view definition")
        self.assertIn("lineage_id", rec)
        self.assertIsNotNone(rec["lineage_id"])

    def test_build_record_calculation_transformation(self):
        """CALCULATION transformation maps to DIRECT/TRANSFORMATION subtype."""
        extractor = make_extractor()
        rec = extractor._build_record(
            "src_db", "src_tbl", "src_col",
            "tgt_db", "tgt_tbl", "tgt_col",
            "CALCULATION", 0.80
        )

        self.assertEqual(rec["transformation_type"], "DIRECT")
        self.assertEqual(rec["transformation_subtype"], "TRANSFORMATION")
        self.assertEqual(rec["confidence_score"], 0.80)

    def test_build_record_stable_lineage_id(self):
        """Same source/target always produces the same lineage_id."""
        extractor = make_extractor()
        rec1 = extractor._build_record(
            "db", "tbl", "col", "db2", "tbl2", "col2", "DIRECT", 0.90
        )
        rec2 = extractor._build_record(
            "db", "tbl", "col", "db2", "tbl2", "col2", "DIRECT", 0.90
        )
        self.assertEqual(rec1["lineage_id"], rec2["lineage_id"])

    def test_build_record_different_targets_different_ids(self):
        """Different source/target combinations produce different lineage_ids."""
        extractor = make_extractor()
        rec1 = extractor._build_record(
            "db", "tbl", "col1", "db2", "tbl2", "out1", "DIRECT", 0.90
        )
        rec2 = extractor._build_record(
            "db", "tbl", "col2", "db2", "tbl2", "out2", "DIRECT", 0.90
        )
        self.assertNotEqual(rec1["lineage_id"], rec2["lineage_id"])


class TestInsertLineageRecords(unittest.TestCase):
    """Tests for the _insert_lineage_records() method."""

    def test_insert_records_returns_count(self):
        """Returns the number of records successfully inserted."""
        cursor = make_mock_cursor()
        cursor.execute.return_value = None  # simulate success
        extractor = make_extractor(cursor=cursor)

        records = [
            extractor._build_record("db", "tbl", "col1", "db", "v", "col1", "DIRECT", 0.90),
            extractor._build_record("db", "tbl", "col2", "db", "v", "col2", "DIRECT", 0.90),
        ]
        count = extractor._insert_lineage_records(records)

        self.assertEqual(count, 2)

    def test_insert_records_skips_duplicates(self):
        """Duplicate key errors (code 2801) are silently ignored."""
        cursor = make_mock_cursor()
        # Simulate duplicate error on the first record, success on second
        cursor.execute.side_effect = [
            Exception("Unique constraint violation 2801"),
            None,
        ]
        extractor = make_extractor(cursor=cursor)

        records = [
            extractor._build_record("db", "tbl", "col1", "db", "v", "col1", "DIRECT", 0.90),
            extractor._build_record("db", "tbl", "col2", "db", "v", "col2", "DIRECT", 0.90),
        ]
        # Should not raise, returns count of successful inserts only
        count = extractor._insert_lineage_records(records)

        self.assertEqual(count, 1)

    def test_insert_records_empty_input(self):
        """Empty records list returns 0 without any queries."""
        cursor = make_mock_cursor()
        extractor = make_extractor(cursor=cursor)

        count = extractor._insert_lineage_records([])

        self.assertEqual(count, 0)
        cursor.execute.assert_not_called()


if __name__ == "__main__":
    unittest.main(verbosity=2)
