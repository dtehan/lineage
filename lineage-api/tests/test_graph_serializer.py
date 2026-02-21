"""
Unit tests for graph/serializer.py — GraphSerializer save/restore/invalidate.

Tests prove:
  - Round-trip fidelity: DiGraph with edge attributes saves and restores exactly.
  - Empty Redis: restore() returns None when key is absent.
  - Corrupt JSON: restore() returns None, does not raise.
  - Undirected graph stored: restore() returns None (directed type check).
  - Invalidation: invalidate() deletes the key so restore() returns None.
  - Save failure: save() does not raise when Redis raises ConnectionError.
  - Restore failure: restore() returns None when Redis raises ConnectionError.
  - Memory stability: process RSS is stable (plateaus) across 3 rebuild cycles.

All Redis interactions use fakeredis.FakeRedis() — no real Redis required.
"""

import json
import os
import sys
import unittest
from unittest.mock import MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import fakeredis
import networkx as nx

from graph.serializer import save, restore, invalidate, GRAPH_KEY
from graph.store import GraphStore


class TestGraphSerializer(unittest.TestCase):
    """Tests for save/restore/invalidate with FakeRedis."""

    # ------------------------------------------------------------------
    # Round-trip fidelity
    # ------------------------------------------------------------------

    def test_save_restore_round_trip(self):
        """DiGraph with multiple edges and transformation_type attributes
        round-trips through Redis without data loss."""
        r = fakeredis.FakeRedis()
        G = nx.DiGraph()
        G.add_edge("db.src.col_a", "db.tgt.col_a", transformation_type="DIRECT")
        G.add_edge("db.src.col_b", "db.tgt.col_b", transformation_type="AGGREGATION")

        save(G, r)
        G2 = restore(r)

        self.assertIsNotNone(G2)
        self.assertIsInstance(G2, nx.DiGraph)
        self.assertEqual(G2.number_of_nodes(), G.number_of_nodes())
        self.assertEqual(G2.number_of_edges(), G.number_of_edges())

        # Edge attributes preserved exactly
        self.assertEqual(
            G2["db.src.col_a"]["db.tgt.col_a"]["transformation_type"],
            "DIRECT",
        )
        self.assertEqual(
            G2["db.src.col_b"]["db.tgt.col_b"]["transformation_type"],
            "AGGREGATION",
        )

    # ------------------------------------------------------------------
    # Missing key
    # ------------------------------------------------------------------

    def test_restore_returns_none_on_empty_redis(self):
        """restore() returns None when the key is absent in Redis."""
        r = fakeredis.FakeRedis()
        result = restore(r)
        self.assertIsNone(result)

    # ------------------------------------------------------------------
    # Corrupt data
    # ------------------------------------------------------------------

    def test_restore_returns_none_on_corrupt_json(self):
        """restore() returns None and does not raise when the stored value
        is not valid JSON."""
        r = fakeredis.FakeRedis()
        r.set(GRAPH_KEY, b"not json at all {{{{")
        result = restore(r)
        self.assertIsNone(result)

    def test_restore_returns_none_on_undirected_graph(self):
        """restore() returns None when the stored snapshot decodes to an
        undirected Graph rather than a DiGraph.

        nx.node_link_graph() uses data['directed'] to choose the graph class.
        We force 'directed': False to simulate a corrupted snapshot.
        """
        r = fakeredis.FakeRedis()
        # Build an undirected graph and store its node_link_data
        G_undirected = nx.Graph()
        G_undirected.add_edge("a.x", "b.x")
        data = nx.node_link_data(G_undirected)
        # data['directed'] is already False for an undirected graph
        r.set(GRAPH_KEY, json.dumps(data).encode("utf-8"))

        result = restore(r)
        self.assertIsNone(result)

    # ------------------------------------------------------------------
    # Invalidation
    # ------------------------------------------------------------------

    def test_invalidate_deletes_key(self):
        """After save() + invalidate(), restore() returns None because the
        key no longer exists in Redis."""
        r = fakeredis.FakeRedis()
        G = nx.DiGraph()
        G.add_edge("a.x", "b.x", transformation_type="DIRECT")

        save(G, r)
        # Key should exist now
        self.assertIsNotNone(r.get(GRAPH_KEY))

        invalidate(r)
        # Key should be gone
        result = restore(r)
        self.assertIsNone(result)

    # ------------------------------------------------------------------
    # Failure resilience
    # ------------------------------------------------------------------

    def test_save_failure_does_not_raise(self):
        """save() does not raise when redis_client.set() raises ConnectionError.
        A warning is logged but the exception is swallowed."""
        mock_redis = MagicMock()
        mock_redis.set.side_effect = ConnectionError("Redis unavailable")

        G = nx.DiGraph()
        G.add_edge("a.x", "b.x", transformation_type="DIRECT")

        # Must not raise
        try:
            save(G, mock_redis)
        except Exception as exc:
            self.fail(f"save() raised an unexpected exception: {exc}")

    def test_restore_failure_does_not_raise(self):
        """restore() returns None and does not raise when redis_client.get()
        raises ConnectionError. A warning is logged but no exception propagates."""
        mock_redis = MagicMock()
        mock_redis.get.side_effect = ConnectionError("Redis unavailable")

        result = restore(mock_redis)
        self.assertIsNone(result)


class TestGraphSerializerMemoryStability(unittest.TestCase):
    """Memory stability test across multiple rebuild cycles.

    Validates REDIS-03: process RSS does not grow monotonically after 3
    simulated rebuild cycles. The criterion is |RSS(cycle3) - RSS(cycle2)| < 5MB,
    which distinguishes OS allocator page reuse plateau from a genuine leak.
    """

    def test_memory_stable_across_rebuild_cycles(self):
        """Process RSS stabilises (plateaus) across 3 rebuild cycles.

        Each cycle: build a ~100-edge DiGraph, call GraphStore.build(G), and
        record process RSS. Assert that the delta between cycle 2 and cycle 3
        is less than 5MB — indicating the allocator has plateaued and is
        reusing pages rather than growing unboundedly.
        """
        import psutil

        def build_large_graph(n_edges: int) -> nx.DiGraph:
            """Build a DiGraph with n_edges sequential edges."""
            G = nx.DiGraph()
            for i in range(n_edges):
                G.add_edge(
                    f"db.src.col_{i}",
                    f"db.tgt.col_{i}",
                    transformation_type="DIRECT",
                )
            return G

        proc = psutil.Process(os.getpid())
        rss_readings = []

        for _cycle in range(3):
            G = build_large_graph(100)
            _store = GraphStore.build(G)
            rss_readings.append(proc.memory_info().rss)

        rss_cycle2 = rss_readings[1]
        rss_cycle3 = rss_readings[2]
        delta = abs(rss_cycle3 - rss_cycle2)

        self.assertLess(
            delta,
            5_000_000,  # 5 MB plateau criterion
            msg=(
                f"RSS delta between cycle 2 and cycle 3 is {delta / 1024 / 1024:.2f}MB "
                f"(cycle2={rss_cycle2}, cycle3={rss_cycle3}). "
                "Expected < 5MB — memory may be leaking."
            ),
        )


if __name__ == "__main__":
    unittest.main(verbosity=2)
