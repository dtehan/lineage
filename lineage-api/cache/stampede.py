"""
Cache stampede prevention using Redis distributed locks.

When a cache miss occurs for an expensive lineage query, a distributed lock
prevents multiple concurrent requests from executing the same database query.
The first request acquires the lock and populates the cache; subsequent
requests wait briefly and read from cache.
"""

import redis_lock
from loguru import logger


def acquire_lock(redis_client, cache_key: str, expire: int = 30):
    """
    Create a Redis distributed lock for a cache key.

    Usage as context manager:
        lock = acquire_lock(redis_client, cache_key)
        if lock:
            with lock:
                # Execute expensive query and populate cache
                ...

    Args:
        redis_client: Redis client instance (from cache.cache._write_client)
        cache_key: The cache key being populated
        expire: Lock expiry in seconds (default: 30s, covers max query time)

    Returns:
        redis_lock.Lock or None: Lock instance, or None if Redis unavailable
    """
    try:
        lock_key = f"lock:{cache_key}"
        return redis_lock.Lock(
            redis_client,
            lock_key,
            expire=expire,
            auto_renewal=True,
        )
    except Exception as e:
        logger.warning(f"Failed to create lock for {cache_key}: {e}")
        return None
