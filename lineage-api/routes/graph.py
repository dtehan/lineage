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
