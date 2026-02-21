"""
Graph engine status routes.

Provides visibility into in-memory graph warm-up state.
Handles all /api/v2/graph/* endpoints.
"""

from flask import Blueprint, jsonify

from graph.engine import graph_engine

graph_bp = Blueprint("graph", __name__, url_prefix="/api/v2/graph")


@graph_bp.route("/status", methods=["GET"])
def get_graph_status():
    """Return in-memory graph engine status."""
    return jsonify(graph_engine.status)


@graph_bp.route("/reload", methods=["POST"])
def reload_graph():
    """
    Trigger a full in-memory graph rebuild from the database.

    Clears the current graph and starts a background thread to reload
    all lineage data from OL_COLUMN_LINEAGE. During the rebuild, lineage
    queries fall back to CTE database queries automatically.

    Returns:
        JSON with rebuild_triggered (bool) and current status.
    """
    triggered = graph_engine.invalidate()
    return jsonify({
        "rebuild_triggered": triggered,
        "status": graph_engine.status,
    })
