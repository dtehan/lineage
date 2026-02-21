"""
Unit tests for GraphEngine BFS traversal and GraphStore snapshot creation.

Tests prove:
  - GraphStore.build() captures correct metadata from a DiGraph.
  - GraphEngine.status returns correct shape when uninitialized and initialized.
  - BFS traversal is correct for linear chains, cycles (CYCLE5), diamond
    patterns (NESTED_DIAMOND), and fan-outs (FANOUT10).
  - Depth limiting is respected.
  - Edge cases: missing node, uninitialized engine.
  - Result dict format and transformation_type preservation.
  - Bidirectional traversal (upstream + downstream from middle node).

No database connection required — all tests use in-memory DiGraphs built
from edge tuples and injected directly into GraphEngine._store.
"""

import sys
import os
import threading
import time
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import networkx as nx

from graph.store import GraphStore
from graph.engine import GraphEngine


# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------

def build_test_graph(edges: list) -> nx.DiGraph:
    """
    Build a DiGraph from a list of (source_id, target_id, transformation_type)
    tuples.

    Args:
        edges: List of 3-tuples (source_id, target_id, transformation_type).

    Returns:
        nx.DiGraph with one directed edge per tuple and transformation_type
        stored as an edge attribute.
    """
    G = nx.DiGraph()
    for src, tgt, transform in edges:
        G.add_edge(src, tgt, transformation_type=transform)
    return G


def edges_to_set(edges: list) -> set:
    """
    Convert a list of edge dicts to a set of 5-tuples for order-independent
    comparison.

    Args:
        edges: List of dicts with keys source_dataset, source_field,
               target_dataset, target_field, transformation_type.

    Returns:
        set of (source_dataset, source_field, target_dataset, target_field,
                transformation_type) tuples.
    """
    return {
        (
            e["source_dataset"],
            e["source_field"],
            e["target_dataset"],
            e["target_field"],
            e["transformation_type"],
        )
        for e in edges
    }


def make_engine_with_graph(G: nx.DiGraph) -> GraphEngine:
    """
    Create a fresh GraphEngine and inject a built GraphStore directly,
    bypassing the background warmup thread for deterministic tests.

    Args:
        G: A populated DiGraph.

    Returns:
        GraphEngine with _store set and _ready event fired.
    """
    engine = GraphEngine()
    engine._store = GraphStore.build(G)
    engine._ready.set()
    return engine


# ---------------------------------------------------------------------------
# TestGraphStore
# ---------------------------------------------------------------------------

class TestGraphStore(unittest.TestCase):
    """Tests for GraphStore.build() snapshot creation."""

    def test_build_creates_valid_snapshot(self):
        """build() from a small DiGraph produces correct node/edge counts
        and a positive loaded_at timestamp."""
        G = build_test_graph([
            ("db.t1.col", "db.t2.col", "DIRECT"),
            ("db.t2.col", "db.t3.col", "IDENTITY"),
        ])
        store = GraphStore.build(G)

        self.assertEqual(store.node_count, 3)
        self.assertEqual(store.edge_count, 2)
        self.assertGreater(store.loaded_at, 0)
        self.assertGreater(store.memory_bytes, 0)

    def test_build_empty_graph(self):
        """build() from an empty DiGraph produces zero node/edge counts."""
        G = nx.DiGraph()
        store = GraphStore.build(G)

        self.assertEqual(store.node_count, 0)
        self.assertEqual(store.edge_count, 0)

    def test_build_measures_memory(self):
        """memory_bytes returned by build() is a positive integer from psutil RSS."""
        G = build_test_graph([
            ("db.a.x", "db.b.x", "DIRECT"),
        ])
        store = GraphStore.build(G)

        self.assertIsInstance(store.memory_bytes, int)
        self.assertGreater(store.memory_bytes, 0)


# ---------------------------------------------------------------------------
# TestGraphEngine
# ---------------------------------------------------------------------------

class TestGraphEngine(unittest.TestCase):
    """Tests for GraphEngine status, readiness, and BFS traversal."""

    # ------------------------------------------------------------------
    # Status and readiness
    # ------------------------------------------------------------------

    def test_status_when_not_initialized(self):
        """A fresh GraphEngine returns a status dict with ready=False and
        all numeric fields as 0."""
        engine = GraphEngine()
        status = engine.status

        self.assertFalse(status["ready"])
        self.assertEqual(status["node_count"], 0)
        self.assertEqual(status["edge_count"], 0)
        self.assertIsNone(status["last_rebuild_time"])
        self.assertEqual(status["memory_bytes"], 0)

    def test_is_ready_false_before_initialize(self):
        """is_ready returns False on a freshly constructed engine."""
        engine = GraphEngine()
        self.assertFalse(engine.is_ready)

    def test_status_when_initialized(self):
        """After injecting a store, status shows ready=True with correct
        node/edge counts."""
        G = build_test_graph([
            ("db.t1.col", "db.t2.col", "DIRECT"),
            ("db.t2.col", "db.t3.col", "DIRECT"),
        ])
        engine = make_engine_with_graph(G)
        status = engine.status

        self.assertTrue(status["ready"])
        self.assertEqual(status["node_count"], 3)
        self.assertEqual(status["edge_count"], 2)
        self.assertIsNotNone(status["last_rebuild_time"])
        self.assertGreater(status["memory_bytes"], 0)

    # ------------------------------------------------------------------
    # Linear chain: A -> B -> C (DIRECT)
    # ------------------------------------------------------------------

    def _make_linear_chain(self):
        """Return a GraphEngine with the graph db.t1.col -> db.t2.col -> db.t3.col."""
        G = build_test_graph([
            ("db.t1.col", "db.t2.col", "DIRECT"),
            ("db.t2.col", "db.t3.col", "DIRECT"),
        ])
        return make_engine_with_graph(G)

    def test_upstream_linear_chain(self):
        """From db.t3.col, upstream depth=5 returns both edges in the chain."""
        engine = self._make_linear_chain()
        result = engine.traverse_upstream("db.t3.col", max_depth=5)

        result_set = edges_to_set(result)
        self.assertIn(("db.t2", "col", "db.t3", "col", "DIRECT"), result_set)
        self.assertIn(("db.t1", "col", "db.t2", "col", "DIRECT"), result_set)
        self.assertEqual(len(result_set), 2)

    def test_downstream_linear_chain(self):
        """From db.t1.col, downstream depth=5 returns both edges in the chain."""
        engine = self._make_linear_chain()
        result = engine.traverse_downstream("db.t1.col", max_depth=5)

        result_set = edges_to_set(result)
        self.assertIn(("db.t1", "col", "db.t2", "col", "DIRECT"), result_set)
        self.assertIn(("db.t2", "col", "db.t3", "col", "DIRECT"), result_set)
        self.assertEqual(len(result_set), 2)

    def test_upstream_depth_limit(self):
        """From db.t3.col, upstream depth=1 returns only the immediately upstream
        edge (t2->t3), not the further upstream edge (t1->t2)."""
        engine = self._make_linear_chain()
        result = engine.traverse_upstream("db.t3.col", max_depth=1)

        result_set = edges_to_set(result)
        self.assertIn(("db.t2", "col", "db.t3", "col", "DIRECT"), result_set)
        self.assertNotIn(("db.t1", "col", "db.t2", "col", "DIRECT"), result_set)
        self.assertEqual(len(result_set), 1)

    def test_downstream_depth_limit(self):
        """From db.t1.col, downstream depth=1 returns only the immediately
        downstream edge (t1->t2), not the further edge (t2->t3)."""
        engine = self._make_linear_chain()
        result = engine.traverse_downstream("db.t1.col", max_depth=1)

        result_set = edges_to_set(result)
        self.assertIn(("db.t1", "col", "db.t2", "col", "DIRECT"), result_set)
        self.assertNotIn(("db.t2", "col", "db.t3", "col", "DIRECT"), result_set)
        self.assertEqual(len(result_set), 1)

    # ------------------------------------------------------------------
    # CYCLE5 pattern: t1 -> t2 -> t3 -> t4 -> t5 -> t1
    # ------------------------------------------------------------------

    def _make_cycle5(self):
        """Return a GraphEngine with a 5-node cycle."""
        G = build_test_graph([
            ("db.t1.col", "db.t2.col", "DIRECT"),
            ("db.t2.col", "db.t3.col", "DIRECT"),
            ("db.t3.col", "db.t4.col", "DIRECT"),
            ("db.t4.col", "db.t5.col", "DIRECT"),
            ("db.t5.col", "db.t1.col", "DIRECT"),
        ])
        return make_engine_with_graph(G)

    def test_cycle_upstream_does_not_infinite_loop(self):
        """Upstream traversal on a cycle completes without hanging.
        Result length must be <= 5 (cannot exceed unique edges in a 5-node cycle)."""
        engine = self._make_cycle5()

        # This must not hang — BFS uses a visited set
        result = engine.traverse_upstream("db.t1.col", max_depth=10)

        self.assertLessEqual(len(result), 5)

    def test_cycle_downstream_does_not_infinite_loop(self):
        """Downstream traversal on a cycle completes without hanging.
        Result length must be <= 5."""
        engine = self._make_cycle5()

        result = engine.traverse_downstream("db.t1.col", max_depth=10)

        self.assertLessEqual(len(result), 5)

    # ------------------------------------------------------------------
    # NESTED_DIAMOND pattern: A -> B, A -> C, B -> D, C -> D
    # ------------------------------------------------------------------

    def _make_diamond(self):
        """Return a GraphEngine with the diamond pattern:
            db.ta.col -> db.tb.col
            db.ta.col -> db.tc.col
            db.tb.col -> db.td.col
            db.tc.col -> db.td.col
        """
        G = build_test_graph([
            ("db.ta.col", "db.tb.col", "DIRECT"),
            ("db.ta.col", "db.tc.col", "DIRECT"),
            ("db.tb.col", "db.td.col", "DIRECT"),
            ("db.tc.col", "db.td.col", "DIRECT"),
        ])
        return make_engine_with_graph(G)

    def test_diamond_upstream_from_D(self):
        """From db.td.col, upstream depth=5 returns all 4 diamond edges
        regardless of traversal order."""
        engine = self._make_diamond()
        result = engine.traverse_upstream("db.td.col", max_depth=5)

        result_set = edges_to_set(result)
        expected = {
            ("db.ta", "col", "db.tb", "col", "DIRECT"),
            ("db.ta", "col", "db.tc", "col", "DIRECT"),
            ("db.tb", "col", "db.td", "col", "DIRECT"),
            ("db.tc", "col", "db.td", "col", "DIRECT"),
        }
        self.assertEqual(result_set, expected)

    def test_diamond_downstream_from_A(self):
        """From db.ta.col, downstream depth=5 returns all 4 diamond edges."""
        engine = self._make_diamond()
        result = engine.traverse_downstream("db.ta.col", max_depth=5)

        result_set = edges_to_set(result)
        expected = {
            ("db.ta", "col", "db.tb", "col", "DIRECT"),
            ("db.ta", "col", "db.tc", "col", "DIRECT"),
            ("db.tb", "col", "db.td", "col", "DIRECT"),
            ("db.tc", "col", "db.td", "col", "DIRECT"),
        }
        self.assertEqual(result_set, expected)

    # ------------------------------------------------------------------
    # FANOUT10 pattern: A -> B1..B10
    # ------------------------------------------------------------------

    def _make_fanout10(self):
        """Return a GraphEngine with a single source fanning out to 10 targets."""
        edges = [
            ("db.src.col", f"db.t{i}.col", "DIRECT")
            for i in range(1, 11)
        ]
        G = build_test_graph(edges)
        return make_engine_with_graph(G)

    def test_fanout_downstream(self):
        """From db.src.col, downstream depth=1 returns all 10 fan-out edges."""
        engine = self._make_fanout10()
        result = engine.traverse_downstream("db.src.col", max_depth=1)

        self.assertEqual(len(result), 10)
        targets = {e["target_dataset"] for e in result}
        for i in range(1, 11):
            self.assertIn(f"db.t{i}", targets)

    # ------------------------------------------------------------------
    # Edge cases
    # ------------------------------------------------------------------

    def test_node_not_in_graph_returns_empty(self):
        """traverse_upstream and traverse_downstream both return [] for a
        node that is not in the graph."""
        engine = self._make_linear_chain()

        self.assertEqual(engine.traverse_upstream("db.nonexistent.col", max_depth=5), [])
        self.assertEqual(engine.traverse_downstream("db.nonexistent.col", max_depth=5), [])

    def test_traverse_on_uninitialized_engine_returns_empty(self):
        """A fresh engine with no store returns [] for all traverse calls."""
        engine = GraphEngine()

        self.assertEqual(engine.traverse_upstream("db.t1.col", max_depth=5), [])
        self.assertEqual(engine.traverse_downstream("db.t1.col", max_depth=5), [])

    # ------------------------------------------------------------------
    # Result format
    # ------------------------------------------------------------------

    def test_result_dict_keys(self):
        """Every edge dict in traverse results contains exactly the five
        expected keys and no others."""
        engine = self._make_linear_chain()
        result = engine.traverse_downstream("db.t1.col", max_depth=5)

        self.assertGreater(len(result), 0)
        expected_keys = {
            "source_dataset",
            "source_field",
            "target_dataset",
            "target_field",
            "transformation_type",
        }
        for edge in result:
            self.assertEqual(set(edge.keys()), expected_keys)

    def test_transformation_type_preserved(self):
        """transformation_type values (DIRECT, IDENTITY, AGGREGATION) are
        preserved faithfully through BFS traversal."""
        G = build_test_graph([
            ("db.t1.col", "db.t2.col", "DIRECT"),
            ("db.t2.col", "db.t3.col", "IDENTITY"),
            ("db.t3.col", "db.t4.col", "AGGREGATION"),
        ])
        engine = make_engine_with_graph(G)
        result = engine.traverse_downstream("db.t1.col", max_depth=5)

        result_by_target = {e["target_dataset"]: e["transformation_type"] for e in result}
        self.assertEqual(result_by_target["db.t2"], "DIRECT")
        self.assertEqual(result_by_target["db.t3"], "IDENTITY")
        self.assertEqual(result_by_target["db.t4"], "AGGREGATION")

    # ------------------------------------------------------------------
    # Bidirectional traversal
    # ------------------------------------------------------------------

    def test_bidirectional_traversal(self):
        """For a linear chain A->B->C, traversing from the middle node B:
        upstream returns A->B, downstream returns B->C. Combined, the full
        picture is visible."""
        engine = self._make_linear_chain()

        upstream = engine.traverse_upstream("db.t2.col", max_depth=5)
        downstream = engine.traverse_downstream("db.t2.col", max_depth=5)

        upstream_set = edges_to_set(upstream)
        downstream_set = edges_to_set(downstream)

        # Upstream from B should contain A->B
        self.assertIn(("db.t1", "col", "db.t2", "col", "DIRECT"), upstream_set)
        # Downstream from B should contain B->C
        self.assertIn(("db.t2", "col", "db.t3", "col", "DIRECT"), downstream_set)

        # Together they cover the whole chain
        combined = upstream_set | downstream_set
        self.assertEqual(len(combined), 2)


if __name__ == "__main__":
    unittest.main(verbosity=2)
