"""
OpenLineage API routes.

Handles all /api/v2/openlineage/* endpoints.
Delegates to service layer for business logic.
"""

from flask import Blueprint, jsonify, request
import traceback

openlineage_bp = Blueprint('openlineage', __name__, url_prefix='/api/v2/openlineage')

# Module-level service references (set via init_services)
lineage_service = None
dataset_service = None
impact_service = None


def init_services(lineage_svc, dataset_svc, impact_svc):
    """
    Initialize module-level service references.

    Called from application factory after services are instantiated.

    Args:
        lineage_svc: LineageService instance
        dataset_svc: DatasetService instance
        impact_svc: ImpactService instance
    """
    global lineage_service, dataset_service, impact_service
    lineage_service = lineage_svc
    dataset_service = dataset_svc
    impact_service = impact_svc


@openlineage_bp.route("/namespaces", methods=["GET"])
def list_namespaces():
    """List all OpenLineage namespaces."""
    try:
        result = dataset_service.list_namespaces()
        return jsonify(result)
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@openlineage_bp.route("/namespaces/<namespace_id>", methods=["GET"])
def get_namespace(namespace_id):
    """Get a specific namespace by ID."""
    try:
        result = dataset_service.get_namespace(namespace_id)
        return jsonify(result)
    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@openlineage_bp.route("/namespaces/<namespace_id>/datasets", methods=["GET"])
def list_datasets(namespace_id):
    """List datasets in a namespace with pagination."""
    try:
        limit = int(request.args.get("limit", "100"))
        offset = int(request.args.get("offset", "0"))

        result = dataset_service.list_datasets(namespace_id, limit, offset)
        return jsonify(result)
    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@openlineage_bp.route("/datasets/<path:dataset_id>", methods=["GET"])
def get_dataset(dataset_id):
    """Get a specific dataset with its fields."""
    try:
        result = dataset_service.get_dataset(dataset_id)
        return jsonify(result)
    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@openlineage_bp.route("/datasets/<path:dataset_id>/statistics", methods=["GET"])
def get_dataset_statistics(dataset_id):
    """Get statistics for a dataset (table/view)."""
    try:
        result = dataset_service.get_dataset_statistics(dataset_id)
        return jsonify(result)
    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@openlineage_bp.route("/datasets/<path:dataset_id>/ddl", methods=["GET"])
def get_dataset_ddl(dataset_id):
    """Get DDL/definition for a dataset (table/view)."""
    try:
        result = dataset_service.get_dataset_ddl(dataset_id)
        return jsonify(result)
    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@openlineage_bp.route("/datasets/search", methods=["GET"])
def search_datasets():
    """Search for datasets."""
    query = request.args.get("q", "")
    limit = int(request.args.get("limit", "50"))

    if not query or len(query) < 2:
        return jsonify({"error": "Query must be at least 2 characters"}), 400

    try:
        result = dataset_service.search_datasets(query, limit)
        return jsonify(result)
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@openlineage_bp.route("/search", methods=["GET"])
def unified_search():
    """Unified search for both databases and datasets."""
    query = request.args.get("q", "")
    limit = int(request.args.get("limit", "50"))

    if not query or len(query) < 2:
        return jsonify({"error": "Query must be at least 2 characters"}), 400

    try:
        result = dataset_service.unified_search(query, limit)
        return jsonify(result)
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@openlineage_bp.route("/lineage/<path:dataset_id>/<field_name>", methods=["GET"])
def get_column_lineage(dataset_id, field_name):
    """Get lineage graph for a dataset field."""
    direction = request.args.get("direction", "both")
    max_depth = int(request.args.get("maxDepth", "5"))

    try:
        result = lineage_service.get_column_lineage_graph(
            dataset_id, field_name, direction, max_depth
        )
        return jsonify(result)
    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@openlineage_bp.route("/lineage/table/<path:dataset_id>", methods=["GET"])
def get_table_lineage(dataset_id):
    """Get lineage graph for all fields in a dataset."""
    direction = request.args.get("direction", "both")
    max_depth = int(request.args.get("maxDepth", "5"))

    try:
        result = lineage_service.get_table_lineage_graph(dataset_id, direction, max_depth)
        return jsonify(result)
    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@openlineage_bp.route("/lineage/database/<database_name>", methods=["GET"])
def get_database_lineage(database_name):
    """Get column-level lineage graph for all tables/views in a database."""
    direction = request.args.get("direction", "both")
    max_depth = int(request.args.get("maxDepth", "3"))

    try:
        result = lineage_service.get_database_lineage_graph(
            database_name, direction, max_depth
        )
        return jsonify(result)
    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@openlineage_bp.route("/impact/<path:dataset_id>/<field_name>", methods=["GET"])
def get_impact_analysis(dataset_id, field_name):
    """Get downstream impact analysis for a dataset field."""
    # Parse and validate maxDepth parameter
    max_depth = int(request.args.get("maxDepth", "5"))

    # Clamp maxDepth to valid range (1-10)
    if max_depth < 1:
        max_depth = 1
    elif max_depth > 10:
        max_depth = 10

    try:
        result = impact_service.analyze_downstream_impact(
            dataset_id, field_name, max_depth
        )
        return jsonify(result), 200
    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
