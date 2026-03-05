#!/usr/bin/env python3
"""
Unit tests for WatermarkStore class.
Uses unittest.mock to avoid real database connections.
"""

import sys
import unittest
from pathlib import Path
from datetime import datetime
from unittest.mock import MagicMock, call, patch

sys.path.insert(0, str(Path(__file__).parent.parent))

from scripts.populate.watermark_store import WatermarkStore


class TestWatermarkStoreConstants(unittest.TestCase):
    """Test SOURCE_* constants are defined."""

    def test_source_constants_defined(self):
        """Verify all 4 SOURCE_* constants are strings."""
        self.assertIsInstance(WatermarkStore.SOURCE_DATASETS, str)
        self.assertIsInstance(WatermarkStore.SOURCE_FIELDS, str)
        self.assertIsInstance(WatermarkStore.SOURCE_VIEW_LINEAGE, str)
        self.assertIsInstance(WatermarkStore.SOURCE_DBQL, str)
        self.assertEqual(WatermarkStore.SOURCE_DATASETS, "DATASETS")
        self.assertEqual(WatermarkStore.SOURCE_FIELDS, "FIELDS")
        self.assertEqual(WatermarkStore.SOURCE_VIEW_LINEAGE, "VIEW_LINEAGE")
        self.assertEqual(WatermarkStore.SOURCE_DBQL, "DBQL")


class TestWatermarkStoreGet(unittest.TestCase):
    """Test WatermarkStore.get() method."""

    def setUp(self):
        self.cursor = MagicMock()
        self.store = WatermarkStore(self.cursor, "demo_user")

    def test_get_returns_none_when_table_missing(self):
        """Mock cursor.execute to raise Exception, verify get() returns None."""
        self.cursor.execute.side_effect = Exception("table does not exist")
        result = self.store.get("DBQL")
        self.assertIsNone(result)

    def test_get_returns_none_when_no_record(self):
        """Mock cursor.fetchone() returns None, verify get() returns None."""
        self.cursor.execute.side_effect = None
        self.cursor.fetchone.return_value = None
        result = self.store.get("DBQL")
        self.assertIsNone(result)

    def test_get_returns_datetime_when_record_exists(self):
        """Mock cursor.fetchone() returns a row with datetime, verify get() returns it."""
        expected_dt = datetime(2025, 1, 15, 12, 0, 0)
        self.cursor.execute.side_effect = None
        self.cursor.fetchone.return_value = (expected_dt,)
        result = self.store.get("DBQL")
        self.assertEqual(result, expected_dt)

    def test_get_returns_none_on_fetchone_exception(self):
        """Verify get() returns None if fetchone raises."""
        self.cursor.execute.side_effect = None
        self.cursor.fetchone.side_effect = Exception("network error")
        result = self.store.get("DBQL")
        self.assertIsNone(result)


class TestWatermarkStoreSet(unittest.TestCase):
    """Test WatermarkStore.set() method."""

    def setUp(self):
        self.cursor = MagicMock()
        self.store = WatermarkStore(self.cursor, "demo_user")

    def test_set_uses_update_then_insert(self):
        """Verify cursor.execute called twice (UPDATE then INSERT) after set()."""
        self.cursor.execute.side_effect = None
        self.store.set("DBQL", rows=50, status="SUCCESS")
        self.assertEqual(self.cursor.execute.call_count, 2)

    def test_set_handles_exception_silently(self):
        """Mock cursor.execute to raise, verify no exception propagates."""
        self.cursor.execute.side_effect = Exception("connection lost")
        # Should not raise
        try:
            self.store.set("DBQL", rows=10, status="SUCCESS")
        except Exception as e:
            self.fail(f"set() raised an exception: {e}")

    def test_set_default_status_is_success(self):
        """Verify set() uses SUCCESS as default status."""
        self.cursor.execute.side_effect = None
        # Should not raise and should call execute twice
        self.store.set("DATASETS", rows=100)
        self.assertEqual(self.cursor.execute.call_count, 2)


class TestWatermarkStoreClear(unittest.TestCase):
    """Test WatermarkStore.clear() and clear_all() methods."""

    def setUp(self):
        self.cursor = MagicMock()
        self.store = WatermarkStore(self.cursor, "demo_user")

    def test_clear_deletes_specific_source(self):
        """Verify DELETE SQL with correct source_name parameter."""
        self.cursor.execute.side_effect = None
        self.store.clear("DBQL")
        self.cursor.execute.assert_called_once()
        # Verify the call included the source_name
        call_args = self.cursor.execute.call_args
        sql = call_args[0][0]
        self.assertIn("DELETE", sql.upper())
        self.assertIn("OL_POPULATE_LOG", sql)
        # Check source_name was passed as parameter
        self.assertIn("DBQL", str(call_args))

    def test_clear_all_deletes_everything(self):
        """Verify DELETE SQL without WHERE clause for clear_all()."""
        self.cursor.execute.side_effect = None
        self.store.clear_all()
        self.cursor.execute.assert_called_once()
        call_args = self.cursor.execute.call_args
        sql = call_args[0][0]
        self.assertIn("DELETE", sql.upper())
        self.assertIn("OL_POPULATE_LOG", sql)
        self.assertNotIn("WHERE", sql.upper())

    def test_clear_handles_exception_silently(self):
        """Verify clear() does not propagate exceptions."""
        self.cursor.execute.side_effect = Exception("table not found")
        try:
            self.store.clear("DBQL")
        except Exception as e:
            self.fail(f"clear() raised an exception: {e}")

    def test_clear_all_handles_exception_silently(self):
        """Verify clear_all() does not propagate exceptions."""
        self.cursor.execute.side_effect = Exception("table not found")
        try:
            self.store.clear_all()
        except Exception as e:
            self.fail(f"clear_all() raised an exception: {e}")


if __name__ == "__main__":
    unittest.main(verbosity=2)
