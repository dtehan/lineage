"""
Unit tests for Server-Timing middleware and LineageService timing instrumentation.

Tests verify:
  - init_timing_middleware registers before/after hooks that emit Server-Timing headers
  - Server-Timing header absent when no timings recorded
  - total metric always included alongside user-recorded metrics
  - LineageService records correct timing keys for BFS and CTE paths
  - Aggregate timing keys used for table lineage (not per-field keys)

No database connection required — all dependencies are mocked.
"""

import sys
import os
import unittest
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from flask import Flask, g

from middleware.timing import init_timing_middleware, record_timing
from services.lineage_service import LineageService


# ---------------------------------------------------------------------------
# TestTimingMiddleware
# ---------------------------------------------------------------------------

class TestTimingMiddleware(unittest.TestCase):
    """Tests for Server-Timing middleware header emission."""

    def _make_test_app(self):
        """Create a minimal Flask test app with timing middleware registered."""
        app = Flask(__name__)
        init_timing_middleware(app)
        return app

    def test_server_timing_header_present(self):
        """Server-Timing header is present and contains the recorded metric
        when record_timing() is called during a request."""
        app = self._make_test_app()

        @app.route("/test-metric")
        def test_route():
            record_timing("test_metric", 42.5)
            return "ok"

        with app.test_client() as client:
            response = client.get("/test-metric")
            self.assertIn("Server-Timing", response.headers)
            header = response.headers["Server-Timing"]
            self.assertIn("test_metric;dur=42.50", header)

    def test_server_timing_header_absent_when_no_timings(self):
        """Server-Timing header is NOT added when no record_timing() calls
        are made during the request."""
        app = self._make_test_app()

        @app.route("/no-timings")
        def no_timing_route():
            return "ok"

        with app.test_client() as client:
            response = client.get("/no-timings")
            self.assertNotIn("Server-Timing", response.headers)

    def test_server_timing_total_included(self):
        """When timings are recorded, the header contains both the recorded
        metric and a 'total' metric for overall request duration."""
        app = self._make_test_app()

        @app.route("/with-total")
        def route_with_total():
            record_timing("foo", 10.0)
            return "ok"

        with app.test_client() as client:
            response = client.get("/with-total")
            header = response.headers["Server-Timing"]
            self.assertIn("foo;dur=10.00", header)
            self.assertIn("total;dur=", header)

            # Extract total duration value and verify it is a positive number
            parts = {p.strip().split(";")[0]: p.strip() for p in header.split(",")}
            self.assertIn("total", parts)
            total_part = parts["total"]
            # Format is "total;dur=X.XX"
            dur_str = total_part.split("dur=")[1]
            total_ms = float(dur_str)
            self.assertGreater(total_ms, 0)


# ---------------------------------------------------------------------------
# TestLineageServiceTiming
# ---------------------------------------------------------------------------

class TestLineageServiceTiming(unittest.TestCase):
    """Tests for timing instrumentation in LineageService methods."""

    def setUp(self):
        """Create mocked repos and service for each test."""
        self.dataset_repo = MagicMock()
        self.lineage_repo = MagicMock()
        self.service = LineageService(self.lineage_repo, self.dataset_repo)

        # Default dataset_with_namespace response
        self.dataset_repo.get_dataset_with_namespace.return_value = {
            "name": "db.my_table",
            "namespace_uri": "teradata://host:1025",
            "source_type": "TABLE"
        }

    def _make_flask_app(self):
        """Create a minimal Flask app with timing middleware for request context."""
        app = Flask(f"test_{id(self)}")
        init_timing_middleware(app)
        return app

    def test_bfs_path_records_bfs_timing(self):
        """When graph_engine.is_ready is True, get_column_lineage_graph()
        records bfs_upstream and bfs_downstream in g.timing."""
        app = self._make_flask_app()

        with patch("services.lineage_service.graph_engine") as mock_engine:
            mock_engine.is_ready = True
            mock_engine.traverse_upstream.return_value = []
            mock_engine.traverse_downstream.return_value = []
            # _enrich_bfs_results calls dataset_repo.get_dataset_metadata — mock it
            self.dataset_repo.get_dataset_metadata.return_value = {
                "namespace": "teradata://host:1025",
                "sourceType": "TABLE"
            }

            with app.test_request_context("/"):
                # Trigger before_request hook to initialize g.timing
                app.preprocess_request()

                self.service.get_column_lineage_graph(
                    "some-dataset-id", "col1", direction="both"
                )

                self.assertIn("bfs_upstream", g.timing)
                self.assertIn("bfs_downstream", g.timing)
                self.assertNotIn("db_upstream", g.timing)
                self.assertNotIn("db_downstream", g.timing)

    def test_cte_path_records_db_timing(self):
        """When graph_engine.is_ready is False, get_column_lineage_graph()
        records db_upstream and db_downstream in g.timing."""
        app = self._make_flask_app()

        with patch("services.lineage_service.graph_engine") as mock_engine:
            mock_engine.is_ready = False
            self.lineage_repo.get_upstream_lineage.return_value = []
            self.lineage_repo.get_downstream_lineage.return_value = []

            with app.test_request_context("/"):
                app.preprocess_request()

                self.service.get_column_lineage_graph(
                    "some-dataset-id", "col1", direction="both"
                )

                self.assertIn("db_upstream", g.timing)
                self.assertIn("db_downstream", g.timing)
                self.assertNotIn("bfs_upstream", g.timing)
                self.assertNotIn("bfs_downstream", g.timing)

    def test_table_lineage_records_aggregate_timing(self):
        """get_table_lineage_graph() records a single aggregate timing key
        (bfs_total or db_total) rather than per-field keys."""
        app = self._make_flask_app()

        self.dataset_repo.get_dataset_fields.return_value = ["col1", "col2", "col3"]
        self.lineage_repo.get_upstream_lineage.return_value = []
        self.lineage_repo.get_downstream_lineage.return_value = []

        with patch("services.lineage_service.graph_engine") as mock_engine:
            mock_engine.is_ready = False

            with app.test_request_context("/"):
                app.preprocess_request()

                self.service.get_table_lineage_graph(
                    "some-dataset-id", direction="both"
                )

                # Should have exactly one timing key for the whole table lineage
                self.assertIn("db_total", g.timing)
                # Should NOT have per-field keys
                self.assertNotIn("db_upstream", g.timing)
                self.assertNotIn("db_downstream", g.timing)
                # Only one aggregate timing key (plus possibly others)
                timing_keys = list(g.timing.keys())
                self.assertEqual(timing_keys, ["db_total"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
