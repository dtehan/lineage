"""
Cache metrics collection for monitoring cache effectiveness.

Reads Redis INFO stats to compute hit rate, memory usage, and key count.
"""

from loguru import logger


def get_cache_stats(redis_client) -> dict:
    """
    Get cache hit rate and health metrics from Redis.

    Args:
        redis_client: Redis client instance

    Returns:
        dict: Cache statistics:
            - hit_rate: Percentage of cache hits (0-100)
            - hits: Total cache hits since Redis start
            - misses: Total cache misses since Redis start
            - total_keys: Number of keys in current database
            - memory_used_mb: Redis memory usage in MB
            - connected: True if Redis is responding
    """
    try:
        info = redis_client.info('stats')
        memory_info = redis_client.info('memory')

        hits = info.get('keyspace_hits', 0)
        misses = info.get('keyspace_misses', 0)
        total = hits + misses
        hit_rate = round((hits / total * 100), 2) if total > 0 else 0.0

        return {
            'hit_rate': hit_rate,
            'hits': hits,
            'misses': misses,
            'total_keys': redis_client.dbsize(),
            'memory_used_mb': round(memory_info.get('used_memory', 0) / 1024 / 1024, 2),
            'connected': True,
        }
    except Exception as e:
        logger.warning(f"Failed to get cache stats: {e}")
        return {
            'hit_rate': 0.0,
            'hits': 0,
            'misses': 0,
            'total_keys': 0,
            'memory_used_mb': 0.0,
            'connected': False,
        }
