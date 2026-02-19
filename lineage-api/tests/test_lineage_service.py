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


if __name__ == "__main__":
    unittest.main(verbosity=2)
