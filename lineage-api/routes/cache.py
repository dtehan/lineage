"""
Cache management API routes.

Provides endpoints for cache invalidation (used by ETL jobs)
and cache statistics monitoring.
"""

from flask import Blueprint, jsonify, request
from loguru import logger
from graph.engine import graph_engine

cache_bp = Blueprint('cache', __name__, url_prefix='/api/v2/cache')


@cache_bp.route('/invalidate', methods=['POST'])
def invalidate_cache():
    """
    Invalidate cache entries for a dataset or database.

    Used by ETL jobs to clear stale cache after lineage data updates.

    Request body (JSON):
        - dataset_name (str, optional): Fully qualified dataset name (e.g., "demo_user.customer")
        - database_name (str, optional): Database name (e.g., "demo_user")
        - all (bool, optional): Clear entire lineage cache

    At least one parameter must be provided.

    Returns:
        JSON with deleted_keys count
    """
    from cache import cache
    from cache.invalidation import invalidate_dataset, invalidate_database, invalidate_all

    data = request.get_json(silent=True)
    if not data:
        return jsonify({'error': 'Request body must be JSON'}), 400

    try:
        redis_client = cache.cache._write_client
    except Exception as e:
        logger.warning(f"Redis client unavailable for invalidation: {e}")
        return jsonify({'error': 'Cache not available', 'deleted_keys': 0}), 503

    deleted = 0

    if data.get('all'):
        deleted = invalidate_all(redis_client)
    elif data.get('dataset_name'):
        deleted = invalidate_dataset(redis_client, data['dataset_name'])
    elif data.get('database_name'):
        deleted = invalidate_database(redis_client, data['database_name'])
    else:
        return jsonify({
            'error': 'Provide dataset_name, database_name, or all=true'
        }), 400

    # Trigger in-memory graph rebuild after Redis flush
    rebuild_triggered = graph_engine.invalidate()

    return jsonify({
        'deleted_keys': deleted,
        'graph_rebuild_triggered': rebuild_triggered,
    })


@cache_bp.route('/stats', methods=['GET'])
def cache_stats():
    """
    Get cache hit rate and health metrics.

    Returns:
        JSON with hit_rate, hits, misses, total_keys, memory_used_mb, connected
    """
    from cache import cache
    from cache.metrics import get_cache_stats

    try:
        redis_client = cache.cache._read_client
        stats = get_cache_stats(redis_client)
    except Exception:
        stats = {
            'hit_rate': 0.0,
            'hits': 0,
            'misses': 0,
            'total_keys': 0,
            'memory_used_mb': 0.0,
            'connected': False,
        }

    return jsonify(stats)
