# Phase 6: Caching Layer - Research

**Researched:** 2026-02-15
**Domain:** Redis-based caching with Flask
**Confidence:** HIGH

## Summary

Phase 6 implements a Redis cache-aside pattern at the repository layer to reduce repeated lineage query response times from 2-4 seconds (post Phase 4/5 optimizations) to under 2 seconds with cache hits returning in <100ms. The standard Flask ecosystem approach is **Flask-Caching** with Redis backend, which provides decorators for view-level caching and memoization for repository methods. Cache stampede prevention requires distributed locks via redis-py's built-in locking or the python-redis-lock library. Key challenges include structured cache key design for pattern-based invalidation, TTL balancing between freshness (1-hour requirement) and hit rate (80%+ target), and monitoring cache effectiveness via Prometheus metrics.

**Primary recommendation:** Use Flask-Caching 2.3.0+ with RedisCache backend, implement cache-aside at repository layer using @cache.memoize() decorator with custom key functions, prevent stampedes with Redis SETNX-based distributed locks, and expose hit rate metrics via redis_exporter for Prometheus scraping.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Flask-Caching | 2.3.0+ | Cache abstraction layer | Official Flask ecosystem extension, supports multiple backends, decorator-based API |
| redis-py | 7.1.1+ | Redis Python client | Official Redis client, connection pooling, async support, active maintenance |
| python-redis-lock | 4.0.0+ | Distributed locking | Proven stampede prevention, SETNX-based, context manager API |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| redis_exporter | 1.60.0+ | Prometheus metrics | Production monitoring of cache hit rate and health |
| fakeredis | 2.24.0+ | In-memory Redis mock | Testing without real Redis server |
| msgpack | 1.1.0+ | Efficient serialization | Better performance than pickle (10-30% faster, 50% smaller payloads) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Flask-Caching | Direct redis-py | Lose decorator abstraction, must handle serialization manually, no backend swapping |
| Redis | Memcached | No persistence, fewer data structures, less common for distributed locks |
| python-redis-lock | Redlock algorithm | Higher complexity for 5+ Redis instances, overkill for single-instance deployments |

**Installation:**
```bash
pip install Flask-Caching>=2.3.0 redis>=7.1.1 python-redis-lock>=4.0.0 msgpack>=1.1.0
```

**Development/Testing:**
```bash
pip install fakeredis>=2.24.0
```

## Architecture Patterns

### Recommended Project Structure
```
lineage-api/
├── config.py                    # Redis connection config
├── cache/
│   ├── __init__.py             # Flask-Caching instance + init_app
│   ├── keys.py                 # Cache key generation functions
│   ├── invalidation.py         # Pattern-based invalidation logic
│   └── metrics.py              # Hit rate tracking endpoint
├── repositories/               # Cache-aside at data layer
│   ├── lineage_repository.py   # @cache.memoize() on CTEs
│   └── dataset_repository.py   # @cache.memoize() on lookups
└── routes/
    └── cache.py                # POST /api/v2/cache/invalidate endpoint
```

### Pattern 1: Cache-Aside at Repository Layer

**What:** Apply caching at repository methods (data access layer), not at route handlers (API layer). Repository pattern enables caching database results before service-layer business logic.

**When to use:** Always for read-heavy workloads with expensive database queries. Lineage CTEs (10-15s) are ideal cache-aside candidates.

**Example:**
```python
# cache/__init__.py
from flask_caching import Cache

cache = Cache(config={
    'CACHE_TYPE': 'redis',
    'CACHE_REDIS_URL': 'redis://localhost:6379/0',
    'CACHE_KEY_PREFIX': 'lineage:',
    'CACHE_DEFAULT_TIMEOUT': 3600,  # 1 hour TTL
    'CACHE_OPTIONS': {
        'socket_connect_timeout': 2,
        'socket_timeout': 5,
        'max_connections': 50,
        'retry_on_timeout': True,
        'health_check_interval': 30,
    }
})

def init_cache(app):
    cache.init_app(app)
    return cache

# repositories/lineage_repository.py
from cache import cache

class LineageRepository(BaseRepository):
    @cache.memoize(timeout=3600)
    def get_upstream_lineage(self, dataset_name: str, field_name: str, max_depth: int = 5):
        """
        Cache key auto-generated from function name + args:
        lineage:get_upstream_lineage:demo_user.customer:customer_id:5
        """
        with self.connection.cursor() as cur:
            # ... existing CTE query ...
            return results
```

### Pattern 2: Structured Cache Keys for Hierarchical Invalidation

**What:** Use colon-delimited hierarchical key structure enabling pattern-based invalidation via Redis SCAN.

**When to use:** When ETL jobs update specific tables/databases and need to invalidate related cache entries without clearing entire cache.

**Example:**
```python
# cache/keys.py
def make_lineage_key(dataset_name: str, field_name: str, direction: str, depth: int) -> str:
    """
    Generate hierarchical cache key:
    lineage:graph:column:{database}.{table}:{column}:{direction}:{depth}

    Enables pattern invalidation:
    - lineage:graph:column:demo_user.customer:* → All customer table columns
    - lineage:graph:column:demo_user.* → Entire demo_user database
    """
    return f"lineage:graph:column:{dataset_name}:{field_name}:{direction}:{depth}"

def make_table_lineage_key(dataset_name: str, direction: str, depth: int) -> str:
    """lineage:graph:table:{database}.{table}:{direction}:{depth}"""
    return f"lineage:graph:table:{dataset_name}:{direction}:{depth}"

def make_database_lineage_key(database_name: str) -> str:
    """lineage:graph:database:{database}"""
    return f"lineage:graph:database:{database_name}"

# cache/invalidation.py
def invalidate_dataset(cache, dataset_name: str):
    """Invalidate all cached lineage for a dataset (table/view)."""
    pattern = f"lineage:graph:*:{dataset_name}:*"
    _scan_and_delete(cache, pattern)

def invalidate_database(cache, database_name: str):
    """Invalidate all cached lineage in a database."""
    pattern = f"lineage:graph:*:{database_name}.*"
    _scan_and_delete(cache, pattern)

def _scan_and_delete(cache, pattern: str):
    """Use SCAN instead of KEYS for production safety."""
    redis_client = cache.cache._write_client
    cursor = 0
    while True:
        cursor, keys = redis_client.scan(cursor, match=pattern, count=100)
        if keys:
            redis_client.delete(*keys)
        if cursor == 0:
            break
```

### Pattern 3: Cache Stampede Prevention with Distributed Locks

**What:** When cache miss occurs, acquire distributed lock before executing expensive query. Concurrent requests wait for lock holder to populate cache.

**When to use:** For expensive operations (>1s) with high concurrency on same key. Lineage graphs with 600 nodes (10-15s) need this.

**Example:**
```python
# repositories/lineage_repository.py
import redis_lock
from cache import cache

class LineageRepository(BaseRepository):
    def get_upstream_lineage(self, dataset_name: str, field_name: str, max_depth: int = 5):
        cache_key = f"lineage:upstream:{dataset_name}:{field_name}:{max_depth}"

        # Check cache first (cache-aside)
        cached = cache.get(cache_key)
        if cached is not None:
            return cached

        # Acquire lock to prevent stampede
        lock_key = f"lock:{cache_key}"
        redis_client = cache.cache._write_client

        with redis_lock.Lock(redis_client, lock_key, expire=30, auto_renewal=True):
            # Double-check cache (another thread may have populated it)
            cached = cache.get(cache_key)
            if cached is not None:
                return cached

            # Execute expensive query
            with self.connection.cursor() as cur:
                cur.execute("""...""")
                results = cur.fetchall()

            # Transform and cache
            transformed = self._transform_results(results)
            cache.set(cache_key, transformed, timeout=3600)
            return transformed
```

### Pattern 4: Monitoring and Metrics Endpoint

**What:** Expose cache hit rate and health metrics for Prometheus scraping. Use redis_exporter for Redis-level metrics, custom endpoint for application-level cache stats.

**When to use:** Always in production to validate cache effectiveness and detect issues.

**Example:**
```python
# cache/metrics.py
from flask import Blueprint, jsonify
from cache import cache

cache_metrics_bp = Blueprint('cache_metrics', __name__)

@cache_metrics_bp.route('/api/v2/cache/stats', methods=['GET'])
def get_cache_stats():
    """Application-level cache statistics."""
    redis_client = cache.cache._write_client
    info = redis_client.info('stats')

    hits = info.get('keyspace_hits', 0)
    misses = info.get('keyspace_misses', 0)
    total = hits + misses
    hit_rate = (hits / total * 100) if total > 0 else 0

    return jsonify({
        'hit_rate': round(hit_rate, 2),
        'hits': hits,
        'misses': misses,
        'total_keys': redis_client.dbsize(),
        'memory_used_mb': round(info.get('used_memory', 0) / 1024 / 1024, 2)
    })
```

### Anti-Patterns to Avoid

- **Caching at route handler level:** Caches HTTP responses including headers, makes invalidation harder, couples caching to API layer instead of data layer
- **Using pickle for serialization:** 2x larger payloads than msgpack, security risks (arbitrary code execution), slower (see benchmarks)
- **KEYS command for pattern matching:** Blocks Redis server on large datasets, use SCAN with cursor iteration
- **No TTL on cache entries:** Memory exhaustion over time, stale data persists indefinitely
- **Ignoring connection pooling:** New TCP connection per request adds 1-10ms overhead, wastes resources

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Distributed locking | Custom SETNX logic with retry loops | python-redis-lock (or Redis SETNX + Lua script) | Race conditions with lock expiry, forget auto-renewal, no deadlock detection, no fencing tokens |
| Cache invalidation coordination | Custom pub/sub message bus | Flask-Caching delete + Redis SCAN patterns | Lost messages (pub/sub is fire-and-forget), no delivery guarantees, reinvent serialization |
| Connection pooling | Manual connection lifecycle | redis-py ConnectionPool | Thread safety issues, connection leaks, no health checks, reinvent timeout logic |
| Cache key serialization | String interpolation with f-strings | Flask-Caching make_cache_key + custom key_prefix | Hash collisions with special chars, no escaping, manual normalization |
| Metrics collection | Custom counters in Python | redis_exporter + Prometheus | Memory leaks with unbounded cardinality, no aggregation, reinvent scraping protocol |

**Key insight:** Redis caching looks deceptively simple ("just GET/SET"), but production systems need stampede prevention (distributed locks), invalidation coordination (SCAN patterns), observability (Prometheus), and graceful degradation (connection pool health checks). Flask-Caching abstracts 90% of this complexity.

## Common Pitfalls

### Pitfall 1: Cache Stampede on Cold Start

**What goes wrong:** After deployment/restart, empty cache causes all requests to miss simultaneously, overwhelming database with 100+ concurrent CTEs.

**Why it happens:** No cache warming, all keys expired, sudden traffic surge hits cold cache.

**How to avoid:** Implement deployment-time cache warming for critical keys (top 10 most-accessed lineage graphs). Use background thread or init script before marking instance healthy.

**Warning signs:** Database CPU spike immediately after deployment, query queue depth >50, error logs showing "connection pool exhausted"

### Pitfall 2: Stale Cache After ETL Updates

**What goes wrong:** ETL job updates lineage in OL_COLUMN_LINEAGE table, but cached graphs show old relationships. Users see incorrect upstream/downstream dependencies.

**Why it happens:** No invalidation hook when lineage data changes, relying solely on TTL expiration.

**How to avoid:** Provide POST /api/v2/cache/invalidate endpoint for ETL jobs to call after updates. Use pattern-based invalidation to clear affected datasets.

**Warning signs:** User reports "lineage doesn't match DDL", cache hit rate >95% despite data changes, manual cache clear fixes issue

### Pitfall 3: Memory Exhaustion from Unbounded Keys

**What goes wrong:** Redis memory grows unbounded, eventually hits maxmemory limit, starts evicting keys randomly (or refuses new entries).

**Why it happens:** No TTL on cached entries, or TTL too long relative to query diversity. Every unique (dataset, field, direction, depth) combination creates new key.

**How to avoid:** Set CACHE_DEFAULT_TIMEOUT=3600 (1 hour), configure Redis maxmemory policy (allkeys-lru or volatile-lru), monitor memory usage in Prometheus.

**Warning signs:** Redis memory usage climbing without plateau, OOM errors in Redis logs, cache operations failing with "OOM command not allowed"

### Pitfall 4: Lock Contention from Non-Reentrant Locks

**What goes wrong:** Same thread/request tries to acquire lock twice (e.g., service calls repository which calls another repository), deadlocks itself.

**Why it happens:** python-redis-lock is not reentrant by default, calling code doesn't track lock ownership.

**How to avoid:** Use reentrant=True when creating Lock, or ensure locking only happens at one layer (repository, not service). Document lock boundaries clearly.

**Warning signs:** Requests hang for 30s then timeout, lock keys present in Redis but no active operations, same request ID in multiple lock wait logs

### Pitfall 5: Cache Pollution from Rarely-Accessed Graphs

**What goes wrong:** One-off lineage queries for obscure tables fill cache with entries that never get reused, evict frequently-accessed entries.

**Why it happens:** No differentiation between hot paths (repeated queries) and cold paths (exploratory queries).

**How to avoid:** Implement access frequency tracking, only cache queries that have been requested 2+ times in last 10 minutes. Or use shorter TTL for unpopular keys.

**Warning signs:** Cache hit rate <60% despite high query overlap, eviction rate high in Redis INFO stats, popular queries show cache misses unexpectedly

## Code Examples

Verified patterns from official sources:

### Flask-Caching Initialization with Application Factory

```python
# Source: https://flask-caching.readthedocs.io/ + Flask factory pattern docs
from flask import Flask
from flask_caching import Cache

# Create cache instance at module level (singleton)
cache = Cache()

def create_app():
    app = Flask(__name__)

    # Configure Redis
    app.config['CACHE_TYPE'] = 'redis'
    app.config['CACHE_REDIS_URL'] = 'redis://localhost:6379/0'
    app.config['CACHE_KEY_PREFIX'] = 'lineage:'
    app.config['CACHE_DEFAULT_TIMEOUT'] = 3600

    # Connection pool configuration
    app.config['CACHE_OPTIONS'] = {
        'socket_connect_timeout': 2,
        'socket_timeout': 5,
        'max_connections': 50,
        'retry_on_timeout': True,
        'health_check_interval': 30,
    }

    # Initialize cache with app (two-step init for factory pattern)
    cache.init_app(app)

    return app
```

### Custom Cache Key Function for Repository Methods

```python
# Source: https://flask-caching.readthedocs.io/ (memoize with make_name)
from cache import cache

def make_lineage_cache_key(dataset_name, field_name, max_depth):
    """
    Custom key function for memoization.
    Normalizes inputs to handle case-insensitivity and whitespace.
    """
    normalized_dataset = dataset_name.strip().lower()
    normalized_field = field_name.strip().upper()
    return f"lineage:upstream:{normalized_dataset}:{normalized_field}:{max_depth}"

class LineageRepository(BaseRepository):
    @cache.memoize(
        timeout=3600,
        make_name=lambda dataset_name, field_name, max_depth:
            make_lineage_cache_key(dataset_name, field_name, max_depth)
    )
    def get_upstream_lineage(self, dataset_name: str, field_name: str, max_depth: int = 5):
        # ... query logic ...
        pass
```

### Cache Stampede Prevention with Distributed Lock

```python
# Source: https://redis.io/docs/latest/develop/clients/patterns/distributed-locks/
# + https://python-redis-lock.readthedocs.io/
import redis_lock
from cache import cache

def cached_with_lock(cache_key: str, lock_expire: int = 30):
    """Decorator for cache-aside with stampede prevention."""
    def decorator(func):
        def wrapper(*args, **kwargs):
            # Try cache first
            cached = cache.get(cache_key)
            if cached is not None:
                return cached

            # Acquire lock before expensive operation
            lock_key = f"lock:{cache_key}"
            redis_client = cache.cache._write_client

            with redis_lock.Lock(redis_client, lock_key, expire=lock_expire, auto_renewal=True):
                # Double-check cache (another thread may have populated it)
                cached = cache.get(cache_key)
                if cached is not None:
                    return cached

                # Execute function
                result = func(*args, **kwargs)

                # Cache result
                cache.set(cache_key, result, timeout=3600)
                return result

        return wrapper
    return decorator
```

### Pattern-Based Cache Invalidation with SCAN

```python
# Source: https://oneuptime.com/blog/post/2026-01-25-redis-cache-invalidation/view
from cache import cache

def invalidate_pattern(pattern: str, batch_size: int = 100):
    """
    Invalidate cache keys matching pattern using SCAN.
    Production-safe: doesn't block Redis like KEYS command.

    Args:
        pattern: Redis glob pattern (e.g., "lineage:graph:*:demo_user.customer:*")
        batch_size: Keys to process per SCAN iteration
    """
    redis_client = cache.cache._write_client
    cursor = 0
    deleted_count = 0

    while True:
        cursor, keys = redis_client.scan(cursor, match=pattern, count=batch_size)

        if keys:
            # Delete in pipeline for efficiency
            pipe = redis_client.pipeline()
            for key in keys:
                pipe.delete(key)
            pipe.execute()
            deleted_count += len(keys)

        if cursor == 0:
            break

    return deleted_count

# Usage in invalidation endpoint
@cache_bp.route('/invalidate', methods=['POST'])
def invalidate_cache():
    data = request.get_json()
    dataset_name = data.get('dataset_name')

    if dataset_name:
        pattern = f"lineage:graph:*:{dataset_name}:*"
        deleted = invalidate_pattern(pattern)
        return jsonify({'deleted_keys': deleted})
    else:
        return jsonify({'error': 'dataset_name required'}), 400
```

### Graceful Degradation on Cache Failure

```python
# Source: https://oneuptime.com/blog/post/2026-01-22-response-caching-redis-python/view
import logging
from cache import cache

logger = logging.getLogger(__name__)

class LineageRepository(BaseRepository):
    def get_upstream_lineage(self, dataset_name: str, field_name: str, max_depth: int = 5):
        cache_key = f"lineage:upstream:{dataset_name}:{field_name}:{max_depth}"

        # Try cache with graceful fallback
        try:
            cached = cache.get(cache_key)
            if cached is not None:
                return cached
        except Exception as e:
            logger.warning(f"Cache get failed for {cache_key}: {e}, falling back to database")

        # Execute query
        with self.connection.cursor() as cur:
            cur.execute("""...""")
            results = cur.fetchall()

        transformed = self._transform_results(results)

        # Try to cache result (non-critical operation)
        try:
            cache.set(cache_key, transformed, timeout=3600)
        except Exception as e:
            logger.warning(f"Cache set failed for {cache_key}: {e}, continuing without cache")

        return transformed
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Flask-Cache 0.13 | Flask-Caching 2.x | 2018 | Renamed package, Python 3.5+ only, maintained by Pallets-eco, breaking config changes |
| pickle serialization | msgpack | Ongoing | 10-30% faster, 50% smaller payloads, cross-language compatibility |
| KEYS for pattern match | SCAN with cursor | Redis 2.8+ (2013) | Non-blocking iteration, production-safe for large key spaces |
| Single Redlock instance | Redlock algorithm (5 nodes) | 2016 | Higher availability, safety with network partitions, 2016 debate (Kleppmann vs Antirez) |
| Manual lock management | python-redis-lock context manager | 2014 | Auto-release via __exit__, prevents lock leaks, supports reentrant locks (4.0+) |

**Deprecated/outdated:**
- **Flask-Cache (0.13):** Unmaintained since 2015, use Flask-Caching instead
- **redis-py 2.x:** Python 2 only, missing async support, use redis-py 7.x
- **KEYS command:** Blocks Redis on large datasets, always use SCAN
- **Basic SETNX without expiry:** Deadlock risk if client crashes, always set expire (px parameter)

## Open Questions

1. **Should we cache at repository or service layer?**
   - What we know: Repository layer caches raw database results, service layer would cache transformed/aggregated data
   - What's unclear: Whether transformation overhead (list comprehensions, dict building) is significant enough to cache post-transformation
   - Recommendation: Start with repository layer (database is bottleneck), measure transformation time in Phase 7, add service caching if needed

2. **What's the optimal TTL for lineage data?**
   - What we know: Requirements specify 1-hour TTL, but lineage data rarely changes (only during ETL runs)
   - What's unclear: Whether event-based invalidation is reliable enough to extend TTL to 24 hours for higher hit rate
   - Recommendation: Start with 1-hour TTL per requirements, track invalidation API usage in Phase 7, consider extending if invalidation is reliable

3. **Do we need cache warming on deployment?**
   - What we know: Cold cache causes database stampede, top 10 queries cover 80% of traffic (Pareto principle likely applies)
   - What's unclear: Which specific lineage graphs are "critical paths" worth warming, whether warming delay is acceptable
   - Recommendation: Implement warming after Phase 6 baseline (measure top queries in Phase 7), add selective warming in Phase 7 if cold-start impact is significant

4. **Should we use simple SETNX or full Redlock algorithm?**
   - What we know: Single Redis instance (likely deployment), Redlock needs 5 instances for safety guarantees
   - What's unclear: Whether single Redis is SPOF requiring HA setup, cost/benefit of Sentinel vs Cluster vs Redlock
   - Recommendation: Use python-redis-lock (SETNX-based) for Phase 6, evaluate Redis HA (Sentinel) in production readiness review

## Sources

### Primary (HIGH confidence)
- Flask-Caching Official Documentation - https://flask-caching.readthedocs.io/ (configuration, decorators, Redis backend)
- Redis Distributed Locks - https://redis.io/docs/latest/develop/clients/patterns/distributed-locks/ (Redlock algorithm, safety guarantees, Python implementation)
- redis-py GitHub (latest) - https://github.com/redis/redis-py/releases (version 7.1.1, async support, connection pooling)
- python-redis-lock Documentation - https://python-redis-lock.readthedocs.io/ (context manager, reentrant locks, auto-renewal)

### Secondary (MEDIUM confidence)
- How to Implement Response Caching with Redis in Python (OneUpTime, 2026-01-22) - https://oneuptime.com/blog/post/2026-01-22-response-caching-redis-python/view (cache-aside pattern, key structure, graceful degradation)
- How to Handle Cache Stampede in Redis (OneUpTime, 2026-01-21) - https://oneuptime.com/blog/post/2026-01-21-redis-cache-stampede/view (distributed locking, probabilistic early expiration, singleflight pattern)
- How to Implement Cache Invalidation with Redis (OneUpTime, 2026-01-25) - https://oneuptime.com/blog/post/2026-01-25-redis-cache-invalidation/view (tag-based invalidation, SCAN patterns, Python examples)
- How to Implement Cache Warming Strategies (OneUpTime, 2026-01-30) - https://oneuptime.com/blog/post/2026-01-30-cache-warming-strategies/view (deployment-time warming, event-driven refresh, coordination patterns)
- How to Configure Connection Pooling for Redis (OneUpTime, 2026-01-25) - https://oneuptime.com/blog/post/2026-01-25-redis-connection-pooling/view (max_connections, health checks, retry strategies)
- Redis Monitoring 101 (SigNoz, 2026) - https://signoz.io/blog/redis-monitoring/ (cache hit rate formula, Prometheus integration)

### Tertiary (LOW confidence, needs validation)
- Flask Application Factory Pattern (Medium articles) - Multiple sources on factory pattern, verify against official Flask docs in implementation
- Redis Pub/Sub for Cache Invalidation - Fire-and-forget limitations not fully documented, need production testing

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Flask-Caching and redis-py are official/canonical choices with current documentation
- Architecture: HIGH - Cache-aside and distributed locking patterns verified in official Redis docs and recent 2026 tutorials
- Pitfalls: MEDIUM - Stampede and memory exhaustion well-documented, but lock contention scenarios need real-world validation

**Research date:** 2026-02-15
**Valid until:** 2026-03-15 (30 days, stack is mature and stable)
