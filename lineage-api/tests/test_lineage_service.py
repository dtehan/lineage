"""
Unit tests for LineageService sourceType propagation.

Tests verify that sourceType is correctly propagated through all lineage graph
construction paths: _build_node, _get_source_type, _add_lineage_results,
get_column_lineage_graph, and get_table_lineage_graph.

No database connection required — all dependencies are mocked.
"""

import sys
import os
import unittest
from unittest.mock import MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from services.lineage_service import LineageService


def make_lineage_record(
    source_dataset="db.source_table",
    source_field="col1",
    source_namespace="teradata://host:1025",
    target_dataset="db.target_view",
    target_field="col1",
    target_namespace="teradata://host:1025",
    transformation_type="IDENTITY"
):
    """Helper to create a lineage record dict."""
    return {
        "source_dataset": source_dataset,
        "source_field": source_field,
        "source_namespace": source_namespace,
        "target_dataset": target_dataset,
        "target_field": target_field,
        "target_namespace": target_namespace,
        "transformation_type": transformation_type,
    }


class TestLineageServiceSourceType(unittest.TestCase):
    """Tests for sourceType propagation in LineageService."""

    def setUp(self):
        self.dataset_repo = MagicMock()
        self.lineage_repo = MagicMock()
        self.service = LineageService(self.lineage_repo, self.dataset_repo)

    # -----------------------------------------------------------------------
    # _build_node
    # -----------------------------------------------------------------------

    def test_build_node_includes_source_type_default(self):
        """_build_node without source_type should default sourceType to TABLE."""
        node = self.service._build_node(
            key="db.my_table.col1",
            field_name="col1",
            dataset_name="db.my_table",
            namespace="teradata://host:1025"
        )
        self.assertIn("sourceType", node["dataset"])
        self.assertEqual(node["dataset"]["sourceType"], "TABLE")

    def test_build_node_includes_source_type_view(self):
        """_build_node with source_type='VIEW' should set sourceType to VIEW."""
        node = self.service._build_node(
            key="db.my_view.col1",
            field_name="col1",
            dataset_name="db.my_view",
            namespace="teradata://host:1025",
            source_type="VIEW"
        )
        self.assertIn("sourceType", node["dataset"])
        self.assertEqual(node["dataset"]["sourceType"], "VIEW")

    # -----------------------------------------------------------------------
    # _get_source_type
    # -----------------------------------------------------------------------

    def test_get_source_type_caches_result(self):
        """_get_source_type should call get_dataset_metadata only once per dataset."""
        self.dataset_repo.get_dataset_metadata.return_value = {
            "namespace": "teradata://host:1025",
            "sourceType": "VIEW"
        }
        cache = {}
        result1 = self.service._get_source_type("db.my_view", cache)
        result2 = self.service._get_source_type("db.my_view", cache)

        self.assertEqual(result1, "VIEW")
        self.assertEqual(result2, "VIEW")
        # Should have called get_dataset_metadata exactly once (cache hit on second call)
        self.dataset_repo.get_dataset_metadata.assert_called_once_with("db.my_view")

    def test_get_source_type_defaults_to_table_when_not_found(self):
        """_get_source_type should return TABLE when dataset metadata is None."""
        self.dataset_repo.get_dataset_metadata.return_value = None
        cache = {}
        result = self.service._get_source_type("db.unknown_table", cache)
        self.assertEqual(result, "TABLE")

    def test_get_source_type_returns_view(self):
        """_get_source_type should return VIEW when metadata has sourceType VIEW."""
        self.dataset_repo.get_dataset_metadata.return_value = {
            "namespace": "teradata://host:1025",
            "sourceType": "VIEW"
        }
        cache = {}
        result = self.service._get_source_type("db.my_view", cache)
        self.assertEqual(result, "VIEW")

    # -----------------------------------------------------------------------
    # _add_lineage_results
    # -----------------------------------------------------------------------

    def test_add_lineage_results_propagates_source_type(self):
        """_add_lineage_results should look up sourceType for source and target datasets."""

        def metadata_for(dataset_name):
            if dataset_name == "db.my_view":
                return {"namespace": "teradata://host:1025", "sourceType": "VIEW"}
            return {"namespace": "teradata://host:1025", "sourceType": "TABLE"}

        self.dataset_repo.get_dataset_metadata.side_effect = metadata_for

        records = [
            make_lineage_record(
                source_dataset="db.source_table",
                source_field="col1",
                target_dataset="db.my_view",
                target_field="col1"
            )
        ]
        nodes = {}
        edges = []
        self.service._add_lineage_results(records, nodes, edges)

        source_node = nodes["db.source_table.col1"]
        target_node = nodes["db.my_view.col1"]

        self.assertEqual(source_node["dataset"]["sourceType"], "TABLE")
        self.assertEqual(target_node["dataset"]["sourceType"], "VIEW")

    # -----------------------------------------------------------------------
    # get_column_lineage_graph
    # -----------------------------------------------------------------------

    def test_column_lineage_graph_root_node_has_source_type(self):
        """Root node in column lineage graph should reflect source_type from dataset_info."""
        self.dataset_repo.get_dataset_with_namespace.return_value = {
            "name": "db.my_view",
            "namespace_uri": "teradata://host:1025",
            "source_type": "VIEW"
        }
        self.lineage_repo.get_upstream_lineage.return_value = []
        self.lineage_repo.get_downstream_lineage.return_value = []

        result = self.service.get_column_lineage_graph("some-dataset-id", "col1")

        nodes = result["graph"]["nodes"]
        self.assertEqual(len(nodes), 1)
        root_node = nodes[0]
        self.assertEqual(root_node["dataset"]["sourceType"], "VIEW")

    def test_column_lineage_graph_traversed_nodes_have_source_type(self):
        """Traversed nodes in column lineage graph should have correct sourceType."""
        self.dataset_repo.get_dataset_with_namespace.return_value = {
            "name": "db.target_view",
            "namespace_uri": "teradata://host:1025",
            "source_type": "VIEW"
        }
        self.lineage_repo.get_upstream_lineage.return_value = [
            make_lineage_record(
                source_dataset="db.source_table",
                source_field="col1",
                target_dataset="db.target_view",
                target_field="col1"
            )
        ]
        self.lineage_repo.get_downstream_lineage.return_value = []

        # source_table is TABLE type, target_view is VIEW type (pre-seeded in cache)
        def metadata_for(dataset_name):
            if dataset_name == "db.source_table":
                return {"namespace": "teradata://host:1025", "sourceType": "TABLE"}
            return {"namespace": "teradata://host:1025", "sourceType": "TABLE"}

        self.dataset_repo.get_dataset_metadata.side_effect = metadata_for

        result = self.service.get_column_lineage_graph("some-dataset-id", "col1")

        nodes = {n["id"]: n for n in result["graph"]["nodes"]}

        # Root (target_view) should be VIEW because pre-seeded from get_dataset_with_namespace
        self.assertEqual(nodes["db.target_view.col1"]["dataset"]["sourceType"], "VIEW")
        # Source table should be TABLE
        self.assertEqual(nodes["db.source_table.col1"]["dataset"]["sourceType"], "TABLE")

    # -----------------------------------------------------------------------
    # get_table_lineage_graph
    # -----------------------------------------------------------------------

    def test_table_lineage_graph_root_nodes_have_source_type(self):
        """All root nodes in table lineage graph should reflect source_type from dataset_info."""
        self.dataset_repo.get_dataset_with_namespace.return_value = {
            "name": "db.my_view",
            "namespace_uri": "teradata://host:1025",
            "source_type": "VIEW"
        }
        self.dataset_repo.get_dataset_fields.return_value = ["col1", "col2"]
        self.lineage_repo.get_upstream_lineage.return_value = []
        self.lineage_repo.get_downstream_lineage.return_value = []

        result = self.service.get_table_lineage_graph("some-dataset-id")

        nodes = {n["id"]: n for n in result["graph"]["nodes"]}
        self.assertIn("db.my_view.col1", nodes)
        self.assertIn("db.my_view.col2", nodes)
        self.assertEqual(nodes["db.my_view.col1"]["dataset"]["sourceType"], "VIEW")
        self.assertEqual(nodes["db.my_view.col2"]["dataset"]["sourceType"], "VIEW")

    def test_table_lineage_graph_mixed_types(self):
        """Table lineage graph should correctly assign sourceType for mixed TABLE/VIEW nodes."""
        self.dataset_repo.get_dataset_with_namespace.return_value = {
            "name": "db.fact_table",
            "namespace_uri": "teradata://host:1025",
            "source_type": "TABLE"
        }
        self.dataset_repo.get_dataset_fields.return_value = ["col1"]

        upstream_records = [
            make_lineage_record(
                source_dataset="db.source_view",
                source_field="col1",
                source_namespace="teradata://host:1025",
                target_dataset="db.fact_table",
                target_field="col1",
                target_namespace="teradata://host:1025"
            )
        ]
        self.lineage_repo.get_upstream_lineage.return_value = upstream_records
        self.lineage_repo.get_downstream_lineage.return_value = []

        def metadata_for(dataset_name):
            if dataset_name == "db.source_view":
                return {"namespace": "teradata://host:1025", "sourceType": "VIEW"}
            return {"namespace": "teradata://host:1025", "sourceType": "TABLE"}

        self.dataset_repo.get_dataset_metadata.side_effect = metadata_for

        result = self.service.get_table_lineage_graph("some-dataset-id")

        nodes = {n["id"]: n for n in result["graph"]["nodes"]}

        # Root table should be TABLE (from get_dataset_with_namespace)
        self.assertEqual(nodes["db.fact_table.col1"]["dataset"]["sourceType"], "TABLE")
        # Source view should be VIEW (from get_dataset_metadata)
        self.assertEqual(nodes["db.source_view.col1"]["dataset"]["sourceType"], "VIEW")


class TestDatabaseLineageBfsExternalNodes(unittest.TestCase):
    """Tests for external node column type resolution in _get_database_lineage_bfs."""

    def setUp(self):
        self.dataset_repo = MagicMock()
        self.lineage_repo = MagicMock()
        self.service = LineageService(self.lineage_repo, self.dataset_repo)

        # Set up a mock cursor context manager
        self.mock_cursor = MagicMock()
        self.mock_cursor.__enter__ = MagicMock(return_value=self.mock_cursor)
        self.mock_cursor.__exit__ = MagicMock(return_value=False)
        self.dataset_repo.connection.cursor.return_value = self.mock_cursor

        # Strip helper mirrors the real one
        self.dataset_repo._strip.side_effect = lambda v: v.strip() if isinstance(v, str) else v

    def _make_bfs_record(
        self,
        source_dataset="ext_db.source_table",
        source_field="col1",
        target_dataset="mydb.target_table",
        target_field="col1",
        transformation_type="IDENTITY",
    ):
        return {
            "source_dataset": source_dataset,
            "source_field": source_field,
            "target_dataset": target_dataset,
            "target_field": target_field,
            "transformation_type": transformation_type,
        }

    # -----------------------------------------------------------------------
    # _batch_resolve_external_field_metadata — direct unit tests
    # -----------------------------------------------------------------------

    def test_batch_resolve_returns_empty_when_no_keys(self):
        """_batch_resolve_external_field_metadata returns [] immediately when input is empty."""
        result = self.service._batch_resolve_external_field_metadata([])
        self.assertEqual(result, [])
        # No DB queries should have been issued
        self.dataset_repo.connection.cursor.assert_not_called()

    def test_batch_resolve_returns_field_type_and_nullable_true(self):
        """_batch_resolve resolves field_type and nullable=True when DB returns 'Y'."""
        field_keys = [("ext_db.source_table.col1", "ext_db.source_table", "col1")]

        # First fetchall: dataset ID lookup
        self.mock_cursor.fetchall.side_effect = [
            [("ds-ext-001", "ext_db.source_table")],           # OL_DATASET query
            [("ext_db.source_table", "col1", "INTEGER", "Y")], # OL_DATASET_FIELD query
        ]

        result = self.service._batch_resolve_external_field_metadata(field_keys)

        self.assertEqual(len(result), 1)
        key, field_type, nullable = result[0]
        self.assertEqual(key, "ext_db.source_table.col1")
        self.assertEqual(field_type, "INTEGER")
        self.assertTrue(nullable)

    def test_batch_resolve_nullable_false_when_db_returns_n(self):
        """_batch_resolve resolves nullable=False when DB returns 'N'."""
        field_keys = [("ext_db.t.col2", "ext_db.t", "col2")]

        self.mock_cursor.fetchall.side_effect = [
            [("ds-ext-002", "ext_db.t")],
            [("ext_db.t", "col2", "VARCHAR(50)", "N")],
        ]

        result = self.service._batch_resolve_external_field_metadata(field_keys)

        self.assertEqual(len(result), 1)
        _, field_type, nullable = result[0]
        self.assertEqual(field_type, "VARCHAR(50)")
        self.assertFalse(nullable)

    def test_batch_resolve_returns_empty_when_no_datasets_found(self):
        """_batch_resolve returns [] when OL_DATASET returns no rows for the dataset names."""
        field_keys = [("ext_db.unknown.col1", "ext_db.unknown", "col1")]

        self.mock_cursor.fetchall.side_effect = [
            [],  # No datasets found
        ]

        result = self.service._batch_resolve_external_field_metadata(field_keys)
        self.assertEqual(result, [])

    def test_batch_resolve_handles_multiple_fields_single_query(self):
        """Multiple external fields are resolved with one pair of queries (not N queries)."""
        field_keys = [
            ("ext_db.t.colA", "ext_db.t", "colA"),
            ("ext_db.t.colB", "ext_db.t", "colB"),
        ]

        self.mock_cursor.fetchall.side_effect = [
            [("ds-ext-003", "ext_db.t")],
            [
                ("ext_db.t", "colA", "INTEGER", "Y"),
                ("ext_db.t", "colB", "DATE", "N"),
            ],
        ]

        result = self.service._batch_resolve_external_field_metadata(field_keys)

        # Should get 2 results, one per field
        self.assertEqual(len(result), 2)
        result_map = {key: (ft, nullable) for key, ft, nullable in result}
        self.assertIn("ext_db.t.colA", result_map)
        self.assertIn("ext_db.t.colB", result_map)
        self.assertEqual(result_map["ext_db.t.colA"], ("INTEGER", True))
        self.assertEqual(result_map["ext_db.t.colB"], ("DATE", False))

        # Exactly 2 execute calls: one for datasets, one for fields
        self.assertEqual(self.mock_cursor.execute.call_count, 2)

    # -----------------------------------------------------------------------
    # _get_database_lineage_bfs — integration-style tests (mocking cursor)
    # -----------------------------------------------------------------------

    def test_external_node_gets_column_type(self):
        """External node added in Phase 2 gets columnType from OL_DATASET_FIELD (not None)."""
        from unittest.mock import patch

        # Phase 1: cursor returns one internal dataset with one field
        internal_dataset_rows = [("ds-int-001", "mydb.target_table", "TABLE", "teradata://host:1025")]
        internal_field_rows = [("ds-int-001", "col1", "BIGINT", "N")]

        # _batch_resolve_dataset_metadata cursor (namespace lookup for external dataset)
        ds_meta_cursor = MagicMock()
        ds_meta_cursor.__enter__ = MagicMock(return_value=ds_meta_cursor)
        ds_meta_cursor.__exit__ = MagicMock(return_value=False)
        ds_meta_cursor.fetchall.return_value = [
            ("ext_db.source_table", "TABLE", "teradata://host:1025")
        ]

        # _batch_resolve_external_field_metadata cursor (field types lookup)
        ext_cursor = MagicMock()
        ext_cursor.__enter__ = MagicMock(return_value=ext_cursor)
        ext_cursor.__exit__ = MagicMock(return_value=False)
        ext_cursor.fetchall.side_effect = [
            [("ds-ext-001", "ext_db.source_table")],           # OL_DATASET ID query
            [("ext_db.source_table", "col1", "INTEGER", "Y")], # OL_DATASET_FIELD query
        ]

        # Sequence: Phase 1 cursor, _batch_resolve_dataset_metadata cursor,
        # _batch_resolve_external_field_metadata cursor
        self.dataset_repo.connection.cursor.side_effect = [
            self.mock_cursor,  # Phase 1 uses this
            ds_meta_cursor,    # _batch_resolve_dataset_metadata uses this
            ext_cursor,        # _batch_resolve_external_field_metadata uses this
        ]
        self.mock_cursor.fetchall.side_effect = [
            internal_dataset_rows,  # Phase 1 dataset SELECT
            internal_field_rows,    # Phase 1 field SELECT
        ]

        bfs_record = self._make_bfs_record(
            source_dataset="ext_db.source_table",
            source_field="col1",
            target_dataset="mydb.target_table",
            target_field="col1",
        )

        with patch("services.lineage_service.graph_engine") as mock_engine:
            mock_engine.is_ready = True
            mock_engine.traverse_database.return_value = [bfs_record]

            result = self.service._get_database_lineage_bfs("mydb", "both", 3)

        nodes = {n["id"]: n for n in result["graph"]["nodes"]}
        external_node = nodes.get("ext_db.source_table.col1")
        self.assertIsNotNone(external_node, "External node should be present in graph")
        self.assertEqual(
            external_node["metadata"]["columnType"],
            "INTEGER",
            "External node columnType should be resolved from OL_DATASET_FIELD, not None"
        )
        self.assertTrue(external_node["metadata"]["nullable"])

    def test_internal_node_not_overwritten(self):
        """Phase 1 internal nodes are not added to external_field_keys (no overwrite)."""
        from unittest.mock import patch

        # Phase 1: both source and target are internal to "mydb"
        internal_dataset_rows = [
            ("ds-int-001", "mydb.source_table", "TABLE", "teradata://host:1025"),
            ("ds-int-002", "mydb.target_table", "TABLE", "teradata://host:1025"),
        ]
        internal_field_rows = [
            ("ds-int-001", "col1", "INTEGER", "Y"),
            ("ds-int-002", "col1", "BIGINT", "N"),
        ]

        self.dataset_repo.connection.cursor.return_value = self.mock_cursor
        self.mock_cursor.fetchall.side_effect = [
            internal_dataset_rows,
            internal_field_rows,
        ]

        bfs_record = self._make_bfs_record(
            source_dataset="mydb.source_table",
            source_field="col1",
            target_dataset="mydb.target_table",
            target_field="col1",
        )

        with patch("services.lineage_service.graph_engine") as mock_engine:
            mock_engine.is_ready = True
            mock_engine.traverse_database.return_value = [bfs_record]

            result = self.service._get_database_lineage_bfs("mydb", "both", 3)

        nodes = {n["id"]: n for n in result["graph"]["nodes"]}

        # Internal nodes should retain their Phase 1 columnType
        self.assertEqual(nodes["mydb.source_table.col1"]["metadata"]["columnType"], "INTEGER")
        self.assertEqual(nodes["mydb.target_table.col1"]["metadata"]["columnType"], "BIGINT")

        # Only 2 execute calls (Phase 1 dataset + field queries); no _batch_resolve calls
        self.assertEqual(self.mock_cursor.execute.call_count, 2)


if __name__ == "__main__":
    unittest.main(verbosity=2)
