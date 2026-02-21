"""
GraphEngine

Singleton in-memory graph engine providing BFS-based lineage traversal
as a fast alternative to recursive CTE database queries.

Architecture:
    - Loads the entire OL_COLUMN_LINEAGE table into a networkx DiGraph on
      startup via a background daemon thread (GraphLoader).
    - Stores the graph in an immutable GraphStore snapshot.
    - Uses a blue-green swap pattern: new graph is fully built before the
      reference is atomically swapped. Old graph remains readable during
      the build. The lock is held ONLY for the reference assignment, never
      during build or traversal.
    - When is_ready is False (still warming up or failed), callers fall back
      to the existing CTE query path — no behaviour change is visible to end
      users.

Thread safety:
    - _lock (RLock) guards only reference copy/swap operations.
    - _ready (Event) signals warmup completion without a lock.
    - BFS traversal acquires lock only to snapshot the store reference, then
      releases before traversal begins.

Usage:
    from graph.engine import graph_engine

    # In app factory (python_server.py):
    graph_engine.initialize(connection)

    # In service layer (lineage_service.py):
    if graph_engine.is_ready:
        edges = graph_engine.traverse_upstream("demo_user.orders.amount", 5)
"""

import threading
from datetime import datetime, timezone

import networkx as nx
from loguru import logger

from graph.store import GraphStore
from graph.loader import GraphLoader


class GraphEngine:
    """
    In-memory graph engine with BFS traversal and blue-green swap.

    Lifecycle:
        1. Instantiate (module-level singleton).
        2. Call initialize(connection) once in the app factory — starts
           a background warmup thread.
        3. Check is_ready before using traverse_upstream/traverse_downstream.
        4. When graph needs reloading, call initialize() again — a new
           warmup thread rebuilds the graph and swaps the reference.
    """

    def __init__(self):
        self._store: GraphStore | None = None
        self._lock = threading.RLock()
        self._ready = threading.Event()
        self._loader: GraphLoader | None = None

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def initialize(self, connection) -> None:
        """
        Start the background warmup thread.

        Creates a GraphLoader bound to the given connection and launches a
        daemon thread to load the graph. Returns immediately — the app
        continues to serve requests via the CTE fallback while the graph
        warms up.

        Args:
            connection: An open DBAPI-2 compatible database connection.
        """
        self._loader = GraphLoader(connection)
        thread = threading.Thread(
            target=self._warmup,
            daemon=True,
            name="graph-warmup",
        )
        thread.start()
        logger.info("Graph engine: initialization started")

    @property
    def is_ready(self) -> bool:
        """
        Return True when the graph has been loaded and is ready to serve.

        Uses threading.Event.is_set() which is atomic — no lock required.
        """
        return self._ready.is_set()

    def traverse_upstream(self, node_id: str, max_depth: int) -> list[dict]:
        """
        Traverse lineage upstream from node_id using BFS.

        Acquires the lock only to snapshot the store reference, then
        releases before traversal begins. Safe to call from any thread.

        Args:
            node_id: Node identifier in "dataset_name.field_name" format,
                     e.g. "demo_user.orders.amount".
            max_depth: Maximum BFS depth.

        Returns:
            list[dict]: Edge dicts matching CTE result format (without
                        source_namespace/target_namespace — callers must
                        enrich these via _enrich_bfs_results).
                        Returns [] if graph is not ready or node not found.
        """
        with self._lock:
            store = self._store

        if store is None or node_id not in store.graph:
            return []

        return self._bfs_edges(store.graph, node_id, reverse=True, max_depth=max_depth)

    def traverse_downstream(self, node_id: str, max_depth: int) -> list[dict]:
        """
        Traverse lineage downstream from node_id using BFS.

        Acquires the lock only to snapshot the store reference, then
        releases before traversal begins. Safe to call from any thread.

        Args:
            node_id: Node identifier in "dataset_name.field_name" format.
            max_depth: Maximum BFS depth.

        Returns:
            list[dict]: Edge dicts matching CTE result format (without
                        namespace fields). Returns [] if graph is not
                        ready or node not found.
        """
        with self._lock:
            store = self._store

        if store is None or node_id not in store.graph:
            return []

        return self._bfs_edges(store.graph, node_id, reverse=False, max_depth=max_depth)

    @property
    def status(self) -> dict:
        """
        Return a status snapshot for health/monitoring endpoints.

        Returns:
            dict: Contains ready (bool), node_count (int), edge_count (int),
                  last_rebuild_time (float | None), memory_bytes (int).
        """
        with self._lock:
            store = self._store

        if store is None:
            return {
                "ready": False,
                "node_count": 0,
                "edge_count": 0,
                "last_rebuild_time": None,
                "last_rebuild_iso": None,
                "memory_bytes": 0,
            }

        return {
            "ready": True,
            "node_count": store.node_count,
            "edge_count": store.edge_count,
            "last_rebuild_time": store.loaded_at,
            "last_rebuild_iso": datetime.fromtimestamp(
                store.loaded_at, tz=timezone.utc
            ).isoformat() if store.loaded_at is not None else None,
            "memory_bytes": store.memory_bytes,
        }

    def invalidate(self) -> bool:
        """
        Trigger an in-memory graph rebuild.

        Atomically clears the active GraphStore and ready Event, then
        starts a background thread to rebuild the graph from OL_COLUMN_LINEAGE.

        During the rebuild window, is_ready returns False and all traversal
        calls return [], causing LineageService to fall back to CTE queries.
        Once rebuild completes, _swap() sets the new store and _ready.set()
        re-enables BFS traversal.

        Returns:
            bool: True if rebuild was triggered, False if no loader is
                  configured (engine was never initialized).
        """
        if self._loader is None:
            logger.warning("Graph engine: invalidate() called but engine not initialized")
            return False

        # Step 1: Clear ready event (atomic, no lock needed for Event)
        self._ready.clear()
        # Step 2: Clear store reference under lock
        with self._lock:
            self._store = None
        # Step 3: Start rebuild thread OUTSIDE lock
        thread = threading.Thread(
            target=self._warmup,
            daemon=True,
            name="graph-rebuild",
        )
        thread.start()
        logger.info("Graph engine: rebuild triggered by cache invalidation")
        return True

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _warmup(self) -> None:
        """
        Background thread target: load graph and swap reference.

        On exception the ready event is NOT set, so the engine remains
        in fallback mode and all lineage requests continue via CTE.
        """
        try:
            graph = self._loader.load()
            self._swap(graph)
            self._ready.set()
            logger.info(
                "Graph engine: warmup complete",
                nodes=graph.number_of_nodes(),
                edges=graph.number_of_edges(),
            )
        except Exception as exc:
            logger.error(
                "Graph engine: warmup failed, staying in CTE fallback mode",
                error=str(exc),
            )

    def _swap(self, graph: nx.DiGraph) -> None:
        """
        Build a new GraphStore snapshot and atomically swap the reference.

        The build step is intentionally OUTSIDE the lock — it can take
        seconds for large graphs. Only the single reference assignment is
        guarded by the lock.

        Args:
            graph: A populated networkx DiGraph from GraphLoader.load().
        """
        new_store = GraphStore.build(graph)
        with self._lock:
            self._store = new_store

    def _bfs_edges(
        self,
        G: nx.DiGraph,
        source: str,
        reverse: bool,
        max_depth: int,
    ) -> list[dict]:
        """
        Run BFS from source and return edge dicts in CTE result format.

        Uses a reachability-based approach rather than nx.bfs_edges tree
        traversal. nx.bfs_edges only yields BFS tree edges, which causes
        "convergence" edges in diamond patterns (A->B, A->C, B->D, C->D)
        to be silently dropped — specifically, the edge from the second
        path that converges into an already-visited node.

        Instead:
          1. Compute all nodes reachable within max_depth hops using
             single_source_shortest_path_length (on the reversed graph
             for upstream traversal).
          2. Return all edges of the original graph whose both endpoints
             are in the reachable set.

        This correctly handles:
          - Linear chains (single path, same as BFS tree)
          - Diamond patterns (both convergence edges returned)
          - Fan-outs (all target edges returned)
          - Cycles (BFS visited-set prevents infinite loops)

        Args:
            G: The DiGraph to traverse.
            source: Starting node ID.
            reverse: If True, traverse upstream (against edge direction).
                     If False, traverse downstream (with edge direction).
            max_depth: Maximum BFS depth.

        Returns:
            list[dict]: Each dict contains source_dataset, source_field,
                        target_dataset, target_field, transformation_type.
                        Namespace fields are intentionally absent — callers
                        must add them via LineageService._enrich_bfs_results().
        """
        # Traverse on the correct graph direction to find reachable nodes.
        # For upstream: walk the reversed graph from source.
        traversal_graph = G.reverse(copy=False) if reverse else G
        reachable = set(
            nx.single_source_shortest_path_length(
                traversal_graph, source, cutoff=max_depth
            ).keys()
        )

        # Return all edges in the original graph whose both endpoints are
        # within the reachable set. This includes all "convergence" edges
        # that BFS tree traversal would miss.
        results = []
        subgraph = G.subgraph(reachable)

        for src_node, tgt_node, edge_data in subgraph.edges(data=True):
            # Node IDs are "dataset_name.field_name" — use rsplit to handle
            # dataset names that themselves contain dots (e.g. "demo_user.orders").
            src_dataset, src_field = src_node.rsplit(".", 1)
            tgt_dataset, tgt_field = tgt_node.rsplit(".", 1)

            results.append({
                "source_dataset": src_dataset,
                "source_field": src_field,
                "target_dataset": tgt_dataset,
                "target_field": tgt_field,
                "transformation_type": edge_data.get("transformation_type", "DIRECT"),
            })

        return results


# Module-level singleton — imported by LineageService and python_server.py
graph_engine = GraphEngine()
