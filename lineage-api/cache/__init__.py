"""
Cache module for Flask-Caching with Redis backend.

Provides a singleton Flask-Caching instance configured for Redis.
The cache gracefully degrades to SimpleCache (in-memory) if Redis
is unavailable, ensuring the application works without Redis.
"""

from flask_caching import Cache
from loguru import logger

# Module-level cache instance (singleton, initialized via init_cache)
cache = Cache()

def init_cache(app):
    """
    Initialize Flask-Caching with Redis backend.

    Attempts Redis connection first. Falls back to SimpleCache
    (in-memory, no cross-process sharing) if Redis is unavailable.

    Args:
        app: Flask application instance

    Returns:
        Cache: Configured cache instance
    """
    from config import REDIS_URL, CACHE_TTL

    # Try Redis first
    try:
        app.config['CACHE_TYPE'] = 'RedisCache'
        app.config['CACHE_REDIS_URL'] = REDIS_URL
        app.config['CACHE_KEY_PREFIX'] = 'lineage:'
        app.config['CACHE_DEFAULT_TIMEOUT'] = CACHE_TTL
        app.config['CACHE_OPTIONS'] = {
            'socket_connect_timeout': 2,
            'socket_timeout': 5,
            'retry_on_timeout': True,
            'health_check_interval': 30,
        }
        cache.init_app(app)

        # Verify Redis connection with a ping
        redis_client = cache.cache._read_client
        redis_client.ping()

        logger.info(
            "Cache initialized with Redis backend",
            redis_url=REDIS_URL,
            ttl=CACHE_TTL,
        )
    except Exception as e:
        logger.warning(
            f"Redis unavailable, falling back to SimpleCache: {e}",
            redis_url=REDIS_URL,
        )
        app.config['CACHE_TYPE'] = 'SimpleCache'
        app.config['CACHE_DEFAULT_TIMEOUT'] = CACHE_TTL
        cache.init_app(app)

    return cache
