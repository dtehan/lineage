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

import fakeredis
import networkx as nx

from graph.store import GraphStore
from graph.engine import GraphEngine
from graph.serializer import save as redis_save, restore as redis_restore, GRAPH_KEY


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


class GatedLoader:
    """Loader that blocks load() on a threading.Event — test controls when rebuild proceeds."""
    def __init__(self):
        self._gate = threading.Event()
        self._graph = nx.DiGraph()

    def release(self, G: nx.DiGraph = None):
        """Allow load() to proceed, optionally with a specific graph."""
        if G is not None:
            self._graph = G
        self._gate.set()

    def load(self) -> nx.DiGraph:
        self._gate.wait()
        return self._graph


class InMemoryLoader:
    """Returns a pre-built DiGraph synchronously — for testing rebuild completion."""
    def __init__(self, G: nx.DiGraph):
        self._graph = G

    def load(self) -> nx.DiGraph:
        return self._graph


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


class TestGraphEngineInvalidate(unittest.TestCase):
    """Tests for GraphEngine.invalidate() three-layer consistency."""

    def test_invalidate_clears_ready_immediately(self):
        """After invalidate(), is_ready is False before rebuild completes."""
        G = build_test_graph([("db.a.x", "db.b.x", "DIRECT")])
        engine = make_engine_with_graph(G)
        self.assertTrue(engine.is_ready)

        # Use GatedLoader so rebuild blocks until we release it
        engine._loader = GatedLoader()
        engine.invalidate()
        self.assertFalse(engine.is_ready)
        # Release the gate so the thread doesn't hang after test
        engine._loader.release()

    def test_invalidate_clears_store_to_none(self):
        """After invalidate(), _store is None and status shows zeroed counters."""
        G = build_test_graph([("db.a.x", "db.b.x", "DIRECT")])
        engine = make_engine_with_graph(G)
        engine._loader = GatedLoader()
        engine.invalidate()

        status = engine.status
        self.assertFalse(status["ready"])
        self.assertEqual(status["node_count"], 0)
        self.assertIsNone(status["last_rebuild_time"])
        # Release the gate so the thread doesn't hang after test
        engine._loader.release()

    def test_invalidate_traverse_returns_empty_during_rebuild(self):
        """While rebuilding, traverse_upstream/downstream return [] (CTE fallback)."""
        G = build_test_graph([("db.a.x", "db.b.x", "DIRECT")])
        engine = make_engine_with_graph(G)
        engine._loader = GatedLoader()
        engine.invalidate()

        self.assertEqual(engine.traverse_upstream("db.b.x", 5), [])
        self.assertEqual(engine.traverse_downstream("db.a.x", 5), [])
        # Release the gate so the thread doesn't hang after test
        engine._loader.release()

    def test_invalidate_returns_false_without_loader(self):
        """invalidate() on uninitialized engine returns False."""
        engine = GraphEngine()
        result = engine.invalidate()
        self.assertFalse(result)

    def test_rebuild_completes_and_restores_ready(self):
        """After rebuild thread completes, is_ready is True and traversal works."""
        G = build_test_graph([("db.a.x", "db.b.x", "DIRECT")])
        engine = make_engine_with_graph(G)

        # Use InMemoryLoader that returns a known graph immediately
        engine._loader = InMemoryLoader(G)
        engine.invalidate()

        # Wait for rebuild to complete (max 2 seconds)
        engine._ready.wait(timeout=2.0)
        self.assertTrue(engine.is_ready)

        result = engine.traverse_downstream("db.a.x", 5)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["source_field"], "x")
        self.assertEqual(result[0]["target_field"], "x")


class SpyLoader:
    """Loader that records whether load() was called."""

    def __init__(self, G=None):
        self.called = False
        self._graph = G or nx.DiGraph()

    def load(self) -> nx.DiGraph:
        self.called = True
        return self._graph


class TestGraphEngineRedis(unittest.TestCase):
    """Tests for GraphEngine Redis-aware warmup and invalidation."""

    # ------------------------------------------------------------------
    # Warm Redis restore skips loader
    # ------------------------------------------------------------------

    def test_warmup_restores_from_redis_skips_loader(self):
        """When Redis has a valid snapshot, _warmup() restores it and does NOT
        call the loader. The engine becomes ready and traversal returns edges."""
        r = fakeredis.FakeRedis()
        G = nx.DiGraph()
        G.add_edge("a.b", "c.d", transformation_type="DIRECT")
        redis_save(G, r)  # Pre-populate Redis

        engine = GraphEngine()
        spy = SpyLoader()
        engine._loader = spy
        engine._redis = r

        engine._warmup()  # Run synchronously (not in background thread)

        self.assertTrue(engine.is_ready)
        self.assertFalse(spy.called, "Loader should not be called when Redis has a snapshot")
        result = engine.traverse_downstream("a.b", max_depth=5)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["transformation_type"], "DIRECT")

    # ------------------------------------------------------------------
    # Empty Redis falls through to loader and saves snapshot
    # ------------------------------------------------------------------

    def test_warmup_falls_through_to_loader_on_empty_redis(self):
        """When Redis is empty, _warmup() calls the loader and saves the
        resulting graph as a new snapshot in Redis."""
        r = fakeredis.FakeRedis()
        G = nx.DiGraph()
        G.add_edge("x.y", "z.w", transformation_type="AGGREGATION")

        engine = GraphEngine()
        engine._loader = InMemoryLoader(G)
        engine._redis = r

        engine._warmup()

        self.assertTrue(engine.is_ready)
        # Snapshot should now be saved in Redis
        raw = r.get(GRAPH_KEY)
        self.assertIsNotNone(raw, "Snapshot should be saved to Redis after Teradata load")
        # And restore should return a valid graph
        G2 = redis_restore(r)
        self.assertIsNotNone(G2)
        self.assertEqual(G2.number_of_edges(), 1)

    # ------------------------------------------------------------------
    # No Redis — existing codepath still works
    # ------------------------------------------------------------------

    def test_warmup_without_redis_uses_loader(self):
        """When _redis is None, _warmup() uses the loader normally without
        attempting Redis restore or save."""
        G = nx.DiGraph()
        G.add_edge("p.q", "r.s", transformation_type="IDENTITY")

        engine = GraphEngine()
        engine._loader = InMemoryLoader(G)
        engine._redis = None

        engine._warmup()

        self.assertTrue(engine.is_ready)
        result = engine.traverse_downstream("p.q", max_depth=5)
        self.assertEqual(len(result), 1)

    # ------------------------------------------------------------------
    # Invalidation deletes snapshot
    # ------------------------------------------------------------------

    def test_invalidate_deletes_redis_snapshot(self):
        """invalidate() deletes the Redis snapshot so the rebuild thread
        will fall through to Teradata load on the next _warmup()."""
        r = fakeredis.FakeRedis()
        G = nx.DiGraph()
        G.add_edge("a.b", "c.d", transformation_type="DIRECT")

        # Build a ready engine with a known graph
        engine = make_engine_with_graph(G)
        engine._redis = r

        # Pre-populate Redis snapshot
        redis_save(G, r)
        self.assertIsNotNone(r.get(GRAPH_KEY), "Snapshot should exist before invalidation")

        # Use GatedLoader so the rebuild thread blocks until we release it
        gated = GatedLoader()
        engine._loader = gated

        engine.invalidate()

        # Snapshot should be gone immediately after invalidate()
        self.assertIsNone(r.get(GRAPH_KEY), "Snapshot should be deleted by invalidate()")

        # Release the gate so the thread doesn't hang after test
        gated.release()

    # ------------------------------------------------------------------
    # initialize() accepts redis_client
    # ------------------------------------------------------------------

    def test_initialize_accepts_redis_client(self):
        """initialize(connection=None, redis_client=...) stores the client
        on self._redis. The warmup thread starts and will fail because
        connection is None (expected — engine stays in CTE fallback mode)."""
        engine = GraphEngine()
        r = fakeredis.FakeRedis()

        # connection=None will cause GraphLoader to fail during warmup,
        # which is expected — the engine stays in CTE fallback mode.
        engine.initialize(connection=None, redis_client=r)

        self.assertIsNotNone(engine._redis, "redis_client should be stored on engine._redis")
        self.assertIs(engine._redis, r)


if __name__ == "__main__":
    unittest.main(verbosity=2)
