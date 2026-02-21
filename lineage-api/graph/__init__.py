"""
In-Memory Graph Engine Package

Provides:
    - GraphStore: Immutable snapshot container for blue-green swaps
    - GraphLoader: Database-to-DiGraph loader (OL_COLUMN_LINEAGE -> nx.DiGraph)
    - GraphEngine: BFS traversal engine with blue-green swap and CTE fallback
    - graph_engine: Module-level singleton instance

Usage:
    from graph import GraphStore, GraphLoader
    from graph import GraphEngine, graph_engine
    from graph.engine import graph_engine  # preferred for service layer
"""

from graph.store import GraphStore
from graph.loader import GraphLoader
from graph.engine import GraphEngine, graph_engine

__all__ = ["GraphStore", "GraphLoader", "GraphEngine", "graph_engine"]
