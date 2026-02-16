"""
Pattern-based cache invalidation using Redis SCAN.

Uses SCAN (not KEYS) for production safety — SCAN is non-blocking
and iterates through keyspace without holding the server.
"""

from loguru import logger


def invalidate_dataset(redis_client, dataset_name: str) -> int:
    """
    Invalidate all cached lineage for a specific dataset (table/view).

    Clears column-level, table-level, and database-level cache entries
    that reference this dataset.

    Args:
        redis_client: Redis client instance
        dataset_name: Fully qualified name (e.g., "demo_user.customer")

    Returns:
        int: Number of keys deleted
    """
    ds = dataset_name.strip().lower()
    # Match any graph type containing this dataset
    pattern = f"lineage:graph:*:{ds}:*"
    count = _scan_and_delete(redis_client, pattern)

    # Also match table-level keys where dataset is the primary identifier
    table_pattern = f"lineage:graph:table:{ds}:*"
    count += _scan_and_delete(redis_client, table_pattern)

    logger.info(f"Invalidated {count} cache keys for dataset {dataset_name}")
    return count


def invalidate_database(redis_client, database_name: str) -> int:
    """
    Invalidate all cached lineage for an entire database.

    Clears all column-level, table-level, and database-level cache entries
    that reference any table in this database.

    Args:
        redis_client: Redis client instance
        database_name: Database name (e.g., "demo_user")

    Returns:
        int: Number of keys deleted
    """
    db = database_name.strip().lower()
    # Match any graph type containing this database prefix
    pattern = f"lineage:graph:*:{db}.*"
    count = _scan_and_delete(redis_client, pattern)

    # Also match database-level keys directly
    db_pattern = f"lineage:graph:database:{db}:*"
    count += _scan_and_delete(redis_client, db_pattern)

    logger.info(f"Invalidated {count} cache keys for database {database_name}")
    return count


def invalidate_all(redis_client) -> int:
    """
    Invalidate all lineage cache entries.

    Args:
        redis_client: Redis client instance

    Returns:
        int: Number of keys deleted
    """
    pattern = "lineage:graph:*"
    count = _scan_and_delete(redis_client, pattern)
    logger.info(f"Invalidated all {count} lineage cache keys")
    return count


def _scan_and_delete(redis_client, pattern: str, batch_size: int = 100) -> int:
    """
    Scan and delete keys matching pattern using Redis SCAN.

    Uses pipeline for batch deletion efficiency.

    Args:
        redis_client: Redis client instance
        pattern: Redis glob pattern
        batch_size: Keys per SCAN iteration

    Returns:
        int: Number of keys deleted
    """
    deleted_count = 0
    cursor = 0

    try:
        while True:
            cursor, keys = redis_client.scan(cursor, match=pattern, count=batch_size)
            if keys:
                pipe = redis_client.pipeline()
                for key in keys:
                    pipe.delete(key)
                pipe.execute()
                deleted_count += len(keys)
            if cursor == 0:
                break
    except Exception as e:
        logger.warning(f"Cache invalidation failed for pattern {pattern}: {e}")

    return deleted_count
