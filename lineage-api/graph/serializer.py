"""
GraphSerializer

Persists the in-memory nx.DiGraph to Redis and restores it on cold start.

Key: lineage:engine:snapshot
Format: UTF-8-encoded JSON from nx.node_link_data()
TTL: None — explicit invalidation via GraphEngine.invalidate() only.

The 'lineage:engine:' prefix is intentionally separate from the
'lineage:graph:' query-cache prefix so that cache invalidation patterns
like 'lineage:graph:*' do not accidentally delete the engine snapshot.
This key is outside the namespace swept by invalidate_all() in
cache/invalidation.py.
"""

import json

import networkx as nx
from loguru import logger

GRAPH_KEY = "lineage:engine:snapshot"


def save(G: nx.DiGraph, redis_client) -> None:
    """
    Serialize G to UTF-8 JSON and store in Redis.

    Uses nx.node_link_data() which produces a JSON-serializable dict that
    preserves the directed flag, all node IDs, and all edge attributes
    (including transformation_type). No TTL is set — the snapshot persists
    until explicitly invalidated by GraphEngine.invalidate().

    Non-fatal: any exception is caught and logged as a warning. The caller
    continues normally even if save fails.

    Args:
        G: The populated DiGraph to persist.
        redis_client: A redis-py client instance.
    """
    try:
        data = nx.node_link_data(G)
        json_bytes = json.dumps(data).encode("utf-8")
        redis_client.set(GRAPH_KEY, json_bytes)
        logger.info(
            "GraphSerializer: snapshot saved",
            nodes=G.number_of_nodes(),
            edges=G.number_of_edges(),
            bytes=len(json_bytes),
        )
    except Exception as exc:
        logger.warning("GraphSerializer: save failed", error=str(exc))


def restore(redis_client) -> "nx.DiGraph | None":
    """
    Attempt to restore a DiGraph from Redis.

    Returns None on any failure: key missing, corrupt JSON, or wrong graph
    type. Callers must fall back to Teradata load when None is returned.

    The isinstance check guards against a stored snapshot with a corrupted
    'directed' field — nx.node_link_graph() respects data['directed'] to
    choose the graph class, so a false value would produce an undirected
    Graph instead of a DiGraph.

    Non-fatal: all exceptions are caught and logged. No exception propagates
    to the caller.

    Args:
        redis_client: A redis-py client instance.

    Returns:
        nx.DiGraph if restore succeeded, None otherwise.
    """
    try:
        raw = redis_client.get(GRAPH_KEY)
        if raw is None:
            return None

        try:
            data = json.loads(raw)
        except json.JSONDecodeError as exc:
            logger.warning("GraphSerializer: corrupt snapshot JSON", error=str(exc))
            return None

        G = nx.node_link_graph(data)

        # node_link_graph uses data['directed'] to decide graph type.
        # If the stored snapshot was somehow not a DiGraph, reject it.
        if not isinstance(G, nx.DiGraph):
            logger.warning(
                "GraphSerializer: restored graph is not a DiGraph — discarding",
                graph_type=type(G).__name__,
            )
            return None

        logger.info(
            "GraphSerializer: snapshot restored",
            nodes=G.number_of_nodes(),
            edges=G.number_of_edges(),
        )
        return G

    except Exception as exc:
        logger.warning("GraphSerializer: restore failed", error=str(exc))
        return None


def invalidate(redis_client) -> None:
    """
    Delete the graph snapshot from Redis.

    Called by GraphEngine.invalidate() before triggering a graph rebuild
    so that the next _warmup() correctly falls through to Teradata load
    and saves a fresh snapshot.

    Non-fatal: any exception is caught and logged as a warning.

    Args:
        redis_client: A redis-py client instance.
    """
    try:
        redis_client.delete(GRAPH_KEY)
        logger.info("GraphSerializer: snapshot invalidated")
    except Exception as exc:
        logger.warning("GraphSerializer: invalidate failed", error=str(exc))
