"""
GraphStore

Immutable snapshot of the lineage DiGraph, designed as the unit of
blue-green swap. Build a new GraphStore from a loaded DiGraph, then
atomically swap the reference in GraphEngine — never destroy the old
graph before the new one is ready.

The memory_bytes field records process RSS at build time, giving a
rough measure of the graph's memory footprint for monitoring.
"""

import os
import time
from dataclasses import dataclass, field

import networkx as nx
import psutil


@dataclass
class GraphStore:
    """
    Immutable snapshot of the lineage DiGraph.

    Holds the networkx DiGraph alongside metadata captured at build time:
    node count, edge count, load timestamp, and process RSS.

    Use the build() classmethod rather than constructing directly — it
    captures RSS and node/edge counts from the graph automatically.
    """

    graph: nx.DiGraph
    node_count: int
    edge_count: int
    loaded_at: float = field(default_factory=time.time)
    memory_bytes: int = 0

    @classmethod
    def build(cls, graph: nx.DiGraph) -> "GraphStore":
        """
        Build a GraphStore snapshot from a populated DiGraph.

        Captures current process RSS as memory_bytes. This is the
        process-level RSS, not just the graph's memory footprint, but
        it provides a consistent baseline for monitoring memory growth
        across reloads.

        Args:
            graph: A populated networkx DiGraph from GraphLoader.load()

        Returns:
            GraphStore: Snapshot with node_count, edge_count, and memory_bytes
                        captured at build time.
        """
        rss = psutil.Process(os.getpid()).memory_info().rss
        return cls(
            graph=graph,
            node_count=graph.number_of_nodes(),
            edge_count=graph.number_of_edges(),
            loaded_at=time.time(),
            memory_bytes=rss,
        )
