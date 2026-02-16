# Caching Strategies for Lineage Graph Queries

**Project:** Lineage - Column-Level Data Lineage for Teradata
**Focus:** Redis caching for graph query performance optimization
**Researched:** 2026-02-15
**Confidence:** HIGH

## Executive Summary

Redis caching can reduce lineage graph query times from 60 seconds to 2-4 seconds by eliminating redundant recursive CTE execution on Teradata. The cache-aside pattern fits naturally into the existing repository layer, providing transparent caching without changing the service layer API. With proper key design and hybrid TTL + event-based invalidation, cache hit rates should exceed 80% for typical usage patterns (users viewing the same graphs multiple times during analysis sessions).

**Key recommendation:** Implement Flask-Caching with Redis backend at the repository layer using method-level decorators. Use structured cache keys incorporating all query parameters (dataset, field, direction, depth) with 1-hour TTL and manual invalidation endpoints for ETL job completion.

**Expected performance:**
- First query (cache miss): 60s (unchanged)
- Subsequent identical queries (cache hit): <100ms (600x faster)
- Partial matches (different depth): <10s (6x faster with partial reuse)
- Cold cache scenarios: Addressed via cache warming during ETL job completion

## Problem Statement

**Current bottleneck:** Every lineage graph request executes expensive recursive CTEs on Teradata:
- Column lineage: Traverses upstream/downstream up to depth 5
- Table lineage: Iterates through all columns, executing CTEs per column
- Database lineage: Queries all tables/columns in database (600+ nodes)

**Query characteristics that favor caching:**
- Deterministic: Same inputs (dataset, field, direction, depth) → same outputs
- Infrequent updates: Lineage data changes only when ETL jobs run (typically daily/hourly)
- Repeated access: Users explore the same graphs multiple times during impact analysis
- Expensive computation: Recursive CTEs with cycle detection are CPU-intensive

**Why caching works here:**
- High read-to-write ratio (1000:1 or higher)
- Temporal locality: Users analyze related datasets in sessions
- Acceptable staleness: Minutes-old lineage data is fine for most use cases
- Large result sets: 600-node graphs benefit significantly from avoiding re-serialization

## Recommended Caching Architecture

### Layer: Repository Pattern Integration

**Inject caching at the repository layer** (not service or middleware) because:

1. **Single source of truth**: All database queries flow through repository methods
2. **Transparent to services**: No service layer changes required
3. **Testable**: Can mock cache for unit tests, bypass cache for integration tests
4. **Parameter-aware**: Repository methods have all parameters needed for cache keys
5. **Consistent serialization**: One place to handle result → cache format conversion

```python
# lineage-api/repositories/lineage_repository.py

from flask_caching import Cache
from functools import wraps

cache = Cache(config={
    'CACHE_TYPE': 'redis',
    'CACHE_REDIS_HOST': 'localhost',
    'CACHE_REDIS_PORT': 6379,
    'CACHE_REDIS_DB': 0,
    'CACHE_DEFAULT_TIMEOUT': 3600,  # 1 hour
    'CACHE_KEY_PREFIX': 'lineage:',
})

class LineageRepository(BaseRepository):

    @cache.memoize(timeout=3600)  # 1 hour TTL
    def get_upstream_lineage(self, dataset_name: str, field_name: str, max_depth: int = 5):
        # Existing CTE query logic
        pass
```

**Why not service layer?** Services combine multiple repository calls and add business logic. Caching at service level would:
- Miss opportunities for partial cache hits (reusing cached table metadata across queries)
- Duplicate cache entries for overlapping data
- Complicate invalidation (one service result might depend on multiple cache keys)

**Why not middleware?** Request-level caching:
- Caches HTTP responses, not database results
- Misses opportunities when different API calls use same underlying data
- Requires URL parsing to extract parameters for cache keys
- Harder to invalidate programmatically (tied to URL patterns)

### Cache-Aside Pattern

**Use cache-aside (lazy loading)** instead of write-through or cache warming:

```python
def get_column_lineage_cached(dataset, field, direction, depth):
    # 1. Check cache first
    cache_key = f"lineage:{dataset}:{field}:{direction}:{depth}"
    cached = cache.get(cache_key)
    if cached:
        return cached

    # 2. Cache miss - query database
    result = execute_recursive_cte(dataset, field, direction, depth)

    # 3. Store in cache before returning
    cache.set(cache_key, result, timeout=3600)
    return result
```

**Why cache-aside wins:**
- Simple to implement and reason about
- Only caches data that's actually requested (no wasted memory)
- Application controls cache logic (no database triggers or CDC)
- Natural fit for read-heavy workloads
- Fails gracefully (database is source of truth)

**Trade-off accepted:** First query to any graph is still slow (60s). This is acceptable because:
- Most users explore multiple related graphs (subsequent queries hit cache)
- Cache warming can pre-populate high-value graphs (see Cold Cache section)
- 60s is noticeable but not timeout-territory for first load

## Cache Key Design

### Structured Key Format

Use hierarchical namespace pattern with colon delimiters:

```
lineage:{graph_type}:{dataset}:{field?}:{direction}:{depth}

Examples:
lineage:column:demo_user.customer:customer_id:both:5
lineage:table:demo_user.orders::upstream:5
lineage:database:demo_user:::both:3
lineage:metadata:dataset:demo_user.customer
lineage:metadata:fields:demo_user.customer
```

**Key components:**
1. **Prefix** (`lineage:`): Namespace for all lineage cache entries
2. **Graph type** (`column|table|database`): Query category
3. **Dataset** (`demo_user.customer`): Fully qualified table name
4. **Field** (`customer_id` or empty): Column name (optional for table/database)
5. **Direction** (`upstream|downstream|both`): Traversal direction
6. **Depth** (`1-10`): Maximum traversal depth

**Metadata keys** for supporting data:
- `lineage:metadata:dataset:{dataset}`: Dataset info (namespace, source type)
- `lineage:metadata:fields:{dataset}`: Field list for table
- `lineage:metadata:field:{dataset}:{field}`: Individual field metadata

**Why this structure:**
- **Hierarchical**: Enables pattern-based invalidation (`lineage:column:demo_user.customer:*`)
- **Human-readable**: Easy to debug with `redis-cli KEYS lineage:*`
- **Consistent ordering**: Same parameters always generate same key
- **Version-proof**: No hardcoded version numbers (invalidate all on schema change)
- **Compact**: Short enough to avoid Redis key length limits (512MB max, typically <100 bytes)

### Key Generation Helper

```python
def generate_cache_key(graph_type: str, dataset: str, field: str = None,
                      direction: str = "both", depth: int = 5) -> str:
    """
    Generate standardized cache key for lineage queries.

    Args:
        graph_type: "column", "table", or "database"
        dataset: Fully qualified dataset name
        field: Column name (None for table/database)
        direction: "upstream", "downstream", or "both"
        depth: Maximum traversal depth

    Returns:
        Cache key string in format: lineage:{type}:{dataset}:{field}:{dir}:{depth}
    """
    field_part = field or ""
    return f"lineage:{graph_type}:{dataset}:{field_part}:{direction}:{depth}"
```

**Flask-Caching integration:** The `@cache.memoize()` decorator automatically generates keys from function arguments, but explicit key generation gives:
- Control over key format (Flask-Caching uses pickle by default)
- Ability to invalidate by pattern
- Consistent keys across application restarts

### Parameter Handling Edge Cases

**Case normalization:**
```python
# Teradata is case-insensitive but cache keys are case-sensitive
dataset = dataset.lower()  # demo_user.Customer → demo_user.customer
field = field.upper()      # customer_id → CUSTOMER_ID (Teradata convention)
```

**Whitespace:** Teradata CHAR columns are space-padded. Repository already strips via `_strip()` helper, so keys are whitespace-free.

**Depth variations:** Same dataset/field with different depths = different cache keys. This is correct because depth affects result content (more/fewer nodes).

**Direction variations:**
- `upstream` + `downstream` results ≠ `both` result (different CTEs)
- Cache all three separately
- Optimization: `both` could reuse `upstream` + `downstream` if already cached, but adds complexity for marginal benefit

## Cache Invalidation Strategies

### Hybrid TTL + Event-Based Approach

**Use time-based TTL as baseline + event-based manual invalidation for ETL jobs:**

```python
# Default TTL: 1 hour (3600 seconds)
cache.set(cache_key, result, timeout=3600)

# Manual invalidation endpoint (called after ETL job completion)
@app.route("/api/v2/admin/cache/invalidate", methods=["POST"])
def invalidate_cache():
    """
    Invalidate cache for specific datasets after ETL job completion.

    Request body:
    {
        "datasets": ["demo_user.customer", "demo_user.orders"],
        "invalidate_all": false
    }
    """
    data = request.get_json()

    if data.get("invalidate_all"):
        # Nuclear option - clear all lineage cache
        cache.clear()
        return {"status": "ok", "invalidated": "all"}

    datasets = data.get("datasets", [])
    invalidated_keys = []

    for dataset in datasets:
        # Pattern-based invalidation using Redis SCAN
        pattern = f"lineage:*:{dataset}:*"
        keys = redis_client.scan_iter(match=pattern)
        for key in keys:
            cache.delete(key)
            invalidated_keys.append(key)

    return {"status": "ok", "invalidated_count": len(invalidated_keys)}
```

**TTL strategy:**
- **1 hour default**: Balances freshness vs cache hit rate
- **Shorter for volatile data**: Use 15 minutes for datasets that update frequently
- **Longer for historical data**: Use 24 hours for datasets in archive schemas
- **No TTL for metadata**: Dataset/field metadata changes only on DDL operations

**Why 1 hour TTL:**
- Most ETL jobs run hourly or daily (data is fresh enough)
- Users typically complete analysis sessions in <1 hour
- Prevents indefinite staleness if event-based invalidation fails
- Automatic cleanup of unused cache entries

**Event-based invalidation triggers:**
1. **After ETL job completion**: Job calls invalidation endpoint with affected datasets
2. **On DDL operations**: Schema changes invalidate all cache entries for dataset
3. **Manual refresh**: Admin UI button to invalidate specific datasets

**Why hybrid approach wins:**

| Strategy | Pros | Cons | Verdict |
|----------|------|------|---------|
| TTL-only | Simple, no infrastructure | Stale data between updates | Baseline only |
| Event-only | Always fresh | Complex, requires CDC/triggers | Over-engineering |
| Hybrid | Fresh when needed, simple fallback | Slight complexity | Best fit |

**Trade-off:** Users may see stale data for up to 1 hour if:
- ETL job completes but doesn't call invalidation endpoint
- Invalidation endpoint fails due to network/Redis issues
- Admin manually updates data via SQL

This is acceptable for lineage use cases (not transactional data).

### Pattern-Based Invalidation

**Redis SCAN pattern matching** for dataset-level invalidation:

```python
def invalidate_dataset(dataset: str):
    """Invalidate all cache entries related to a dataset."""
    redis_client = redis.Redis(host='localhost', port=6379, db=0)

    # Invalidate all graph queries involving this dataset (source or target)
    patterns = [
        f"lineage:*:{dataset}:*",  # Dataset is primary subject
        f"lineage:*:*:{dataset}*", # Dataset appears in results (harder to match)
    ]

    for pattern in patterns:
        for key in redis_client.scan_iter(match=pattern, count=100):
            cache.delete(key)
```

**Why SCAN instead of KEYS:**
- `KEYS` blocks Redis server (O(N) operation)
- `SCAN` is cursor-based, non-blocking, safe for production
- Trade-off: Slightly slower invalidation (milliseconds vs microseconds)

**Bulk invalidation** for database-level changes:

```python
def invalidate_database(database_name: str):
    """Invalidate all cache entries for entire database."""
    pattern = f"lineage:*:{database_name}.*:*"
    # Same SCAN logic as above
```

### Cache Stampede Prevention

**Problem:** When cached item expires and multiple requests arrive simultaneously, all requests query the database concurrently (cache stampede).

**Solution:** Distributed locking with Redis SETNX:

```python
import redis
import time

def get_with_lock(cache_key, query_func, timeout=3600, lock_timeout=60):
    """
    Get cached value with distributed lock to prevent stampede.

    Args:
        cache_key: Redis cache key
        query_func: Function to call on cache miss
        timeout: Cache TTL in seconds
        lock_timeout: Lock expiration in seconds
    """
    # Try cache first
    cached = cache.get(cache_key)
    if cached:
        return cached

    # Cache miss - acquire lock
    lock_key = f"{cache_key}:lock"
    lock_acquired = redis_client.set(lock_key, "1", nx=True, ex=lock_timeout)

    if lock_acquired:
        # This request won the race - query database
        try:
            result = query_func()
            cache.set(cache_key, result, timeout=timeout)
            return result
        finally:
            redis_client.delete(lock_key)
    else:
        # Another request is querying - wait for it to finish
        for _ in range(lock_timeout):
            time.sleep(1)
            cached = cache.get(cache_key)
            if cached:
                return cached

        # Lock timed out - fall back to querying ourselves
        return query_func()
```

**When to use:** Only for high-traffic queries (database-level lineage). Column/table queries have lower concurrency.

## Redis Configuration

### Connection Setup for Flask

**Use Flask-Caching with connection pooling:**

```python
# lineage-api/config.py (add Redis config)

REDIS_CONFIG = {
    'host': os.environ.get('REDIS_HOST', 'localhost'),
    'port': int(os.environ.get('REDIS_PORT', '6379')),
    'db': int(os.environ.get('REDIS_DB', '0')),
    'password': os.environ.get('REDIS_PASSWORD', None),
    'max_connections': int(os.environ.get('REDIS_MAX_CONNECTIONS', '50')),
    'socket_timeout': int(os.environ.get('REDIS_SOCKET_TIMEOUT', '5')),
    'socket_connect_timeout': int(os.environ.get('REDIS_SOCKET_CONNECT_TIMEOUT', '5')),
}
```

```python
# lineage-api/python_server.py (add to create_app)

from flask_caching import Cache

cache = Cache()

def create_app():
    app = Flask(__name__)

    # Configure cache
    app.config['CACHE_TYPE'] = 'redis'
    app.config['CACHE_REDIS_HOST'] = REDIS_CONFIG['host']
    app.config['CACHE_REDIS_PORT'] = REDIS_CONFIG['port']
    app.config['CACHE_REDIS_DB'] = REDIS_CONFIG['db']
    app.config['CACHE_REDIS_PASSWORD'] = REDIS_CONFIG['password']
    app.config['CACHE_DEFAULT_TIMEOUT'] = 3600
    app.config['CACHE_KEY_PREFIX'] = 'lineage:'

    cache.init_app(app)

    # ... rest of setup
```

**Connection pooling configuration:**

```python
import redis

# Create connection pool (reuse across app)
redis_pool = redis.ConnectionPool(
    host=REDIS_CONFIG['host'],
    port=REDIS_CONFIG['port'],
    db=REDIS_CONFIG['db'],
    password=REDIS_CONFIG['password'],
    max_connections=REDIS_CONFIG['max_connections'],
    socket_timeout=REDIS_CONFIG['socket_timeout'],
    socket_connect_timeout=REDIS_CONFIG['socket_connect_timeout'],
    decode_responses=True,  # Auto-decode bytes to strings
)

redis_client = redis.Redis(connection_pool=redis_pool)
```

**Connection pool sizing:**
- **Formula**: `max_connections = 2-3x concurrent requests`
- **For this app**: Expect ~20 concurrent users → 50 connections is safe
- **Too small**: Requests block waiting for connections
- **Too large**: Wastes memory, risks hitting Redis `maxclients` (default 10,000)

**Timeout configuration:**
- **socket_timeout**: 5 seconds prevents hung connections
- **socket_connect_timeout**: 5 seconds fails fast if Redis is down
- **Fallback**: On timeout, log error and query database directly (cache-aside graceful degradation)

### Data Structures and Serialization

**Use Redis STRING type with JSON serialization** (not HASH or JSON module):

```python
import json

def cache_set(key, value, timeout):
    """Store Python dict as JSON string in Redis."""
    serialized = json.dumps(value)
    cache.set(key, serialized, timeout=timeout)

def cache_get(key):
    """Retrieve and deserialize JSON string from Redis."""
    serialized = cache.get(key)
    if serialized:
        return json.loads(serialized)
    return None
```

**Why STRING + JSON:**
- **Simple**: No schema management
- **Portable**: Works with all Redis versions (no modules required)
- **Atomic**: Single SET/GET operation
- **Type-safe**: JSON preserves data types (lists, dicts, nulls)

**Why not HASH:**
- Hashes require flattening nested dicts (graph has nested nodes/edges)
- HSET/HGETALL is multiple commands (not atomic without MULTI/EXEC)
- Memory optimization only matters for 100s of fields (graphs have 2-3 keys: nodes/edges)

**Why not RedisJSON module:**
- Requires Redis Stack (not available in all deployments)
- Overkill for read-only caching (RedisJSON shines for partial updates)
- JSON.stringify + STRING is 90% as efficient

**Compression consideration:**

For very large graphs (1000+ nodes), consider gzip compression:

```python
import gzip
import json

def cache_set_compressed(key, value, timeout):
    """Store compressed JSON for large graphs."""
    serialized = json.dumps(value).encode('utf-8')
    compressed = gzip.compress(serialized)
    cache.set(key, compressed, timeout=timeout)

def cache_get_compressed(key):
    """Retrieve and decompress JSON."""
    compressed = cache.get(key)
    if compressed:
        serialized = gzip.decompress(compressed).decode('utf-8')
        return json.loads(serialized)
    return None
```

**When to compress:**
- Graph has >500 nodes (>100KB JSON)
- Redis memory is constrained
- Network bandwidth is bottleneck (unlikely for localhost Redis)

**Trade-off:** CPU time for compression (~10ms) vs memory savings (~70% reduction). Only use if memory pressure is real.

### Memory Limits and Eviction Policies

**Redis memory configuration:**

```bash
# redis.conf
maxmemory 2gb
maxmemory-policy allkeys-lru
```

**Eviction policies:**

| Policy | Behavior | Use Case |
|--------|----------|----------|
| `allkeys-lru` | Evict least recently used keys | **Recommended** - Pure cache use case |
| `allkeys-lfu` | Evict least frequently used keys | Alternative if some graphs are hot |
| `volatile-lru` | Evict LRU keys with TTL | Not useful (all keys have TTL) |
| `noeviction` | Return errors when full | Dangerous - breaks cache |

**Why allkeys-lru:** Graph queries have temporal locality (users explore related datasets in sessions). LRU keeps recently accessed graphs cached, evicts old ones.

**Memory estimation:**

For 600-node database graph:
```
Nodes: 600 nodes × 200 bytes/node = 120 KB
Edges: 800 edges × 100 bytes/edge = 80 KB
Overhead: 50 KB (Redis metadata)
Total: ~250 KB per graph
```

**Capacity planning:**
- **2 GB Redis** → ~8,000 cached graphs
- **Typical dataset:** 50 tables × 3 graph types (column/table/database) = 150 graphs
- **With column-level caching:** 50 tables × 10 columns × 3 directions × 5 depths = 7,500 graphs

**Recommendation:** Start with 2 GB Redis, monitor with `INFO memory`. Scale to 4-8 GB if eviction rate is high (>10% of cache hits).

**Monitoring commands:**

```bash
# Check memory usage
redis-cli INFO memory

# Check eviction stats
redis-cli INFO stats | grep evicted

# List all keys (debug only)
redis-cli KEYS 'lineage:*' | head -20

# Check specific key size
redis-cli DEBUG OBJECT lineage:column:demo_user.customer:customer_id:both:5
```

## Performance Impact Estimates

### Cache Hit Scenarios

**Baseline (no cache):**
- Column lineage: 5-10s (simple CTE)
- Table lineage: 30-60s (multiple CTEs)
- Database lineage: 60s+ (hundreds of CTEs)

**Cache hit (warm cache):**
- All graph types: <100ms (Redis GET + JSON parse)
- **Speedup**: 50-600x faster

**Cache miss (cold cache):**
- Same as baseline + cache write overhead (~50ms)
- First query per graph is unchanged

**Partial cache hit** (metadata cached, graph cache miss):
- Table lineage: 20-40s (skip dataset metadata lookups)
- **Speedup**: 1.5-2x faster

### Cache Hit Rate Projections

**Expected hit rates by usage pattern:**

| Usage Pattern | Hit Rate | Rationale |
|---------------|----------|-----------|
| **Single user session** | 60-70% | User explores upstream/downstream of same columns |
| **Team collaboration** | 80-90% | Multiple users analyze same datasets (shared cache) |
| **Automated tools** | 95%+ | CI/CD pipelines query same lineage repeatedly |
| **After cache warming** | 90%+ | High-value graphs pre-loaded |

**Real-world scenario:** 10 users, 1-hour sessions, 20 queries each

```
Total queries: 200
Unique graphs: 50 (users overlap on ~75% of queries)
Cache hits: 150 (75% hit rate)
Cache misses: 50 (25% cold starts)

Time saved:
- With cache: (150 × 0.1s) + (50 × 60s) = 15s + 3000s = 3015s (50 minutes)
- Without cache: 200 × 60s = 12000s (200 minutes)
- Improvement: 4x faster average query time
```

### Cold Cache Scenarios

**Problem:** First query to any graph takes full 60s, hurting user experience.

**Solution 1: Cache warming on ETL completion**

```python
def warm_cache_after_etl(affected_datasets):
    """
    Pre-populate cache with high-value graphs after ETL job.

    Runs async in background to avoid blocking ETL pipeline.
    """
    for dataset in affected_datasets:
        # Warm table-level lineage (most common query)
        lineage_service.get_table_lineage_graph(
            dataset_id=dataset,
            direction="both",
            max_depth=5
        )

        # Warm database-level lineage if dataset is in demo_user
        if dataset.startswith("demo_user."):
            lineage_service.get_database_lineage_graph(
                database_name="demo_user",
                direction="both",
                max_depth=3
            )
```

**Solution 2: Background cache refresh**

```python
from apscheduler.schedulers.background import BackgroundScheduler

def refresh_hot_graphs():
    """Periodically refresh cache for frequently accessed graphs."""
    # Query Redis for most-accessed keys
    hot_keys = get_hot_keys_from_redis()

    for key in hot_keys:
        # Re-query database and update cache (before TTL expires)
        dataset, field, direction, depth = parse_cache_key(key)
        result = lineage_repo.get_column_lineage(dataset, field, direction, depth)
        cache.set(key, result, timeout=3600)

# Schedule every 30 minutes
scheduler = BackgroundScheduler()
scheduler.add_job(refresh_hot_graphs, 'interval', minutes=30)
scheduler.start()
```

**Solution 3: Stale-while-revalidate pattern**

```python
def get_with_stale_cache(cache_key, query_func, ttl=3600, stale_ttl=7200):
    """
    Serve stale cache immediately while refreshing in background.

    Args:
        ttl: Normal cache TTL (1 hour)
        stale_ttl: Extended TTL for stale data (2 hours)
    """
    cached = cache.get(cache_key)
    cache_age = cache.get(f"{cache_key}:timestamp")

    if cached:
        if time.time() - cache_age < ttl:
            # Fresh cache - return immediately
            return cached
        else:
            # Stale cache - return stale data + refresh async
            threading.Thread(
                target=lambda: cache.set(cache_key, query_func(), timeout=stale_ttl)
            ).start()
            return cached

    # No cache - query synchronously
    result = query_func()
    cache.set(cache_key, result, timeout=stale_ttl)
    cache.set(f"{cache_key}:timestamp", time.time(), timeout=stale_ttl)
    return result
```

**Recommendation:** Start with Solution 1 (cache warming after ETL). It's simple, effective, and aligns with existing ETL workflow.

## Alternative Caching Strategies (Not Recommended)

### Application-Level In-Memory Cache (LRU Cache)

**Implementation:** Python `functools.lru_cache` decorator

```python
from functools import lru_cache

@lru_cache(maxsize=100)
def get_column_lineage(dataset, field, direction, depth):
    # Query database
    pass
```

**Why not:**
- **Not shared across Flask workers**: Each gunicorn/uWSGI worker has separate memory
- **Lost on restart**: Cache disappears when app restarts (deploys, crashes)
- **Memory constrained**: Python process memory limits (typically 512MB-2GB)
- **No invalidation**: Can't invalidate specific keys externally

**When to use:** Only for immutable data (e.g., static configuration) or single-worker deployments.

### Database Query Result Caching (Teradata)

**Implementation:** Teradata query caching (QUERY_BAND, caching options)

**Why not:**
- **Database-side caching is opaque**: No visibility into what's cached, no programmatic invalidation
- **Teradata query cache is limited**: Typically <1GB, shared across all users/queries
- **Not designed for recursive CTEs**: Query cache works best for simple SELECT statements
- **No control over TTL**: Database decides cache lifetime

**When to use:** Already enabled by default in Teradata. Provides marginal benefit for metadata queries (dataset/field lookups), not graph queries.

### CDN/HTTP Caching (Varnish, Cloudflare)

**Implementation:** Cache HTTP responses at edge locations

**Why not:**
- **User-specific queries**: Lineage graphs depend on query parameters (not URL-based routing)
- **Dynamic content**: Can't cache POST requests, requires GET with query params
- **Invalidation complexity**: Purging cache requires API calls to CDN
- **Adds latency**: Network round-trip to CDN (unless localhost)

**When to use:** Static assets only (frontend JS/CSS). Not applicable to API responses.

### Materialized Views (Teradata)

**Implementation:** Pre-compute lineage graphs as materialized views

```sql
CREATE MATERIALIZED VIEW lineage_customer_upstream AS
WITH RECURSIVE upstream_lineage AS (...)
SELECT * FROM upstream_lineage;

REFRESH MATERIALIZED VIEW lineage_customer_upstream;
```

**Why not:**
- **Explosion of views**: Need one materialized view per (dataset × field × direction × depth)
- **Slow refresh**: Full rebuild takes as long as original query
- **Storage overhead**: Materialized views consume database space (not separate cache)
- **No fine-grained invalidation**: Must refresh entire view

**When to use:** Pre-aggregated reports (e.g., daily lineage summary statistics). Not for interactive queries.

## Implementation Checklist

### Phase 1: Basic Cache Integration (Week 1)

- [ ] Add `flask-caching` and `redis` to `requirements.txt`
- [ ] Add Redis connection configuration to `config.py`
- [ ] Initialize Flask-Caching in `python_server.py` application factory
- [ ] Add `@cache.memoize()` decorator to 3 repository methods:
  - `LineageRepository.get_upstream_lineage()`
  - `LineageRepository.get_downstream_lineage()`
  - `LineageRepository.get_database_lineage()`
- [ ] Configure 1-hour TTL as default
- [ ] Test cache hit/miss behavior with Redis CLI (`redis-cli MONITOR`)

### Phase 2: Cache Invalidation (Week 1)

- [ ] Implement cache key generation helper function
- [ ] Create `/api/v2/admin/cache/invalidate` endpoint
- [ ] Add pattern-based invalidation using Redis SCAN
- [ ] Document invalidation API in README
- [ ] Add manual "Refresh Cache" button to frontend (optional)

### Phase 3: Monitoring and Observability (Week 2)

- [ ] Add cache hit/miss logging with Loguru
- [ ] Create `/api/v2/admin/cache/stats` endpoint (Redis INFO)
- [ ] Add cache metrics to existing structured logs:
  - `cache_hit`: boolean
  - `cache_key`: string
  - `query_time_ms`: integer
- [ ] Set up alerts for:
  - Cache hit rate <50% (indicates TTL too short or invalidation too aggressive)
  - Redis memory usage >80% (indicates need to scale)
  - Cache errors (Redis connection failures)

### Phase 4: Cache Warming (Week 2)

- [ ] Implement cache warming helper function
- [ ] Add cache warming call to ETL pipeline completion hook
- [ ] Configure warming for high-value graphs (database-level lineage)
- [ ] Test warming performance (should complete in <5 minutes for typical database)

### Phase 5: Production Hardening (Week 3)

- [ ] Add distributed locking for cache stampede prevention (high-traffic queries only)
- [ ] Implement graceful degradation (fallback to database on Redis timeout)
- [ ] Add compression for large graphs (>500 nodes)
- [ ] Configure Redis persistence (RDB snapshots every 5 minutes)
- [ ] Load test with 100 concurrent requests to verify connection pooling

## Testing Strategy

### Unit Tests (Repository Layer)

```python
# tests/test_lineage_repository_caching.py

import pytest
from unittest.mock import Mock, patch

def test_cache_hit_returns_cached_value():
    """Verify cache hit skips database query."""
    cache = Mock()
    cache.get.return_value = {"nodes": [], "edges": []}

    repo = LineageRepository(connection=Mock())
    repo.cache = cache

    result = repo.get_upstream_lineage("demo_user.customer", "customer_id", 5)

    assert result == {"nodes": [], "edges": []}
    cache.get.assert_called_once()

def test_cache_miss_queries_database():
    """Verify cache miss executes CTE and populates cache."""
    cache = Mock()
    cache.get.return_value = None

    repo = LineageRepository(connection=Mock())
    repo.cache = cache

    with patch.object(repo, '_execute_cte') as mock_execute:
        mock_execute.return_value = {"nodes": [], "edges": []}
        result = repo.get_upstream_lineage("demo_user.customer", "customer_id", 5)

    assert result == {"nodes": [], "edges": []}
    cache.set.assert_called_once()
```

### Integration Tests (End-to-End)

```python
# tests/test_caching_integration.py

import time
import pytest

def test_cache_reduces_query_time(test_client):
    """Verify second query is significantly faster than first."""
    # First query (cache miss)
    start = time.time()
    response1 = test_client.get("/api/v2/openlineage/lineage/demo_user.customer/customer_id")
    time1 = time.time() - start

    # Second query (cache hit)
    start = time.time()
    response2 = test_client.get("/api/v2/openlineage/lineage/demo_user.customer/customer_id")
    time2 = time.time() - start

    assert response1.status_code == 200
    assert response2.status_code == 200
    assert response1.json == response2.json
    assert time2 < time1 / 10  # Cache hit should be 10x faster

def test_invalidation_clears_cache(test_client):
    """Verify invalidation endpoint clears cached entries."""
    # Populate cache
    test_client.get("/api/v2/openlineage/lineage/demo_user.customer/customer_id")

    # Invalidate
    response = test_client.post("/api/v2/admin/cache/invalidate", json={
        "datasets": ["demo_user.customer"]
    })

    assert response.status_code == 200
    assert response.json["invalidated_count"] > 0
```

### Performance Tests (Load Testing)

```python
# tests/test_caching_performance.py

import concurrent.futures
import time

def test_cache_handles_concurrent_requests():
    """Verify cache prevents stampede under concurrent load."""
    def query():
        response = requests.get("http://localhost:8080/api/v2/openlineage/lineage/demo_user.customer/customer_id")
        return response.elapsed.total_seconds()

    # Send 100 concurrent requests
    with concurrent.futures.ThreadPoolExecutor(max_workers=100) as executor:
        futures = [executor.submit(query) for _ in range(100)]
        times = [f.result() for f in futures]

    # Most requests should be fast (cache hits)
    fast_queries = [t for t in times if t < 1.0]
    assert len(fast_queries) > 90  # 90%+ should hit cache
```

## Success Metrics

**Primary metrics:**

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Graph load time (cache hit)** | <2s | P95 latency from frontend |
| **Cache hit rate** | >80% | Redis INFO stats / total queries |
| **Memory usage** | <2 GB | Redis INFO memory |
| **Eviction rate** | <1% | Redis INFO stats evicted_keys |

**Secondary metrics:**

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Invalidation success rate** | >99% | Invalidation API errors / total calls |
| **Cache warm time** | <5 min | Time to warm after ETL job |
| **Redis connection errors** | <0.1% | Redis timeout errors / total queries |

**Before/after comparison:**

| Scenario | Before (no cache) | After (with cache) | Improvement |
|----------|-------------------|-------------------|-------------|
| Column lineage (first load) | 5-10s | 5-10s | 0% (expected) |
| Column lineage (second load) | 5-10s | <1s | 5-10x |
| Table lineage (600 nodes) | 60s | 60s (miss) / 2s (hit) | 30x |
| Database lineage | 60s | 60s (miss) / 2s (hit) | 30x |
| Average query time (80% hit rate) | 30s | 6s | 5x |

**User experience impact:**
- First exploration of dataset: No change (still slow)
- Repeated analysis: 5-30x faster (most common use case)
- Team collaboration: Shared cache benefits all users

## Operational Considerations

### Redis Deployment Options

**Option 1: Redis on same host as Flask (recommended for MVP)**
- **Pros**: Simple, no network latency, easy to debug
- **Cons**: Single point of failure, no horizontal scaling
- **Setup**: `docker run -d -p 6379:6379 redis:7`

**Option 2: Redis Sentinel (high availability)**
- **Pros**: Automatic failover, read replicas
- **Cons**: Requires 3+ Redis instances, more complex configuration
- **Setup**: Use Flask-Caching's `RedisSentinel` backend

**Option 3: Redis Cluster (horizontal scaling)**
- **Pros**: Sharding across multiple nodes, high throughput
- **Cons**: Pattern-based invalidation doesn't work (keys distributed across shards)
- **Setup**: Use Flask-Caching's `RedisCluster` backend

**Recommendation:** Start with Option 1 (single Redis instance). Scale to Option 2 if uptime SLA requires failover.

### Backup and Persistence

**Redis persistence modes:**

| Mode | Description | Use Case |
|------|-------------|----------|
| **RDB (snapshot)** | Full dump every N minutes | **Recommended** - Good enough for cache |
| **AOF (append-only file)** | Log every write | Overkill for cache (more I/O) |
| **None** | In-memory only | Risky - cold cache after every restart |

**RDB configuration:**
```bash
# redis.conf
save 300 1       # Snapshot if 1+ keys changed in 5 minutes
save 60 100      # Snapshot if 100+ keys changed in 1 minute
save 900 1       # Snapshot if 1+ key changed in 15 minutes
```

**Why RDB is sufficient:** Cache is disposable (source of truth is database). Losing cache on restart is annoying but not catastrophic. RDB provides ~5-minute recovery point objective (RPO).

### Monitoring and Alerting

**Key Redis metrics to monitor:**

```bash
# Memory usage
redis-cli INFO memory | grep used_memory_human

# Hit rate
redis-cli INFO stats | grep keyspace_hits
redis-cli INFO stats | grep keyspace_misses

# Evictions
redis-cli INFO stats | grep evicted_keys

# Connection pool
redis-cli INFO clients | grep connected_clients
```

**Alerting thresholds:**

| Metric | Warning | Critical | Action |
|--------|---------|----------|--------|
| Memory usage | >1.5 GB | >1.8 GB | Scale Redis to 4 GB |
| Cache hit rate | <60% | <40% | Increase TTL or investigate query patterns |
| Eviction rate | >100/hour | >1000/hour | Increase memory or reduce TTL |
| Connected clients | >40 | >48 | Increase max_connections |

### Disaster Recovery

**Scenario 1: Redis crashes**
- **Impact**: All requests fall back to database (slow but functional)
- **Recovery**: Restart Redis, cache repopulates on demand
- **Prevention**: Redis Sentinel for automatic failover

**Scenario 2: Cache poisoning (bad data cached)**
- **Impact**: Users see incorrect lineage graphs
- **Recovery**: Call invalidation endpoint for affected datasets
- **Prevention**: Validate data before caching (assert nodes/edges are non-empty)

**Scenario 3: Redis out of memory**
- **Impact**: Eviction rate spikes, hit rate drops, performance degrades
- **Recovery**: Increase maxmemory limit or flush less important keys
- **Prevention**: Monitor memory usage, set conservative maxmemory limit

## Confidence Assessment

| Area | Confidence | Rationale |
|------|------------|-----------|
| **Cache-aside pattern** | HIGH | Industry-standard pattern for read-heavy workloads, well-documented, proven at scale |
| **Flask-Caching integration** | HIGH | Mature library (v1.0+), active maintenance, extensive documentation, large community |
| **Repository layer injection** | HIGH | Natural fit for existing architecture, minimal code changes, clear separation of concerns |
| **Key design** | HIGH | Follows Redis best practices, human-readable, supports pattern-based invalidation |
| **TTL strategy** | MEDIUM | 1-hour TTL is educated guess based on typical ETL schedules; may need tuning based on real usage |
| **Memory estimates** | MEDIUM | Based on typical graph sizes from project context; actual sizes depend on lineage complexity |
| **Performance projections** | MEDIUM | Based on similar projects and Redis benchmarks; actual results depend on query patterns and network latency |
| **Cache warming** | MEDIUM | Simple to implement but adds complexity to ETL pipeline; requires coordination between systems |

**Areas needing validation:**
- Actual cache hit rates (depends on user behavior)
- Real-world graph sizes (may be larger/smaller than estimated)
- Optimal TTL (requires A/B testing with different durations)
- Cache warming effectiveness (requires measuring cold cache impact)

## Sources

### Flask Redis Integration
- [How to Implement Response Caching with Redis in Python](https://oneuptime.com/blog/post/2026-01-22-response-caching-redis-python/view)
- [Flask-Caching Official Documentation](https://flask-caching.readthedocs.io/)
- [Using Flask and Redis to Optimize Web Application Performance](https://medium.com/@fahadnujaimalsaedi/using-flask-and-redis-to-optimize-web-application-performance-34a8ae750097)
- [Redis Complete Guide: Commands, Data Types & Caching Patterns](https://devtoolbox.dedyn.io/blog/redis-complete-guide)

### Cache Key Design
- [Optimizing Database Performance with Redis: Cache Key Design and Invalidation Strategies](https://leapcell.io/blog/optimizing-database-performance-with-redis-cache-key-design-and-invalidation-strategies)
- [Best practices for development - Azure Cache for Redis](https://learn.microsoft.com/en-us/azure/azure-cache-for-redis/cache-best-practices-development)
- [Redis Best Practices - Expert Tips for High Performance](https://www.dragonflydb.io/guides/redis-best-practices)
- [10 Redis Cache Key Best Practices](https://climbtheladder.com/10-redis-cache-key-best-practices/)

### Cache Invalidation Strategies
- [How to Implement Cache Invalidation with Redis](https://oneuptime.com/blog/post/2026-01-25-redis-cache-invalidation/view)
- [Cache Invalidation Strategies Time-Based vs Event-Driven](https://leapcell.io/blog/cache-invalidation-strategies-time-based-vs-event-driven)
- [How to Build Cache Invalidation Strategies](https://oneuptime.com/blog/post/2026-01-30-cache-invalidation-strategies/view)
- [Redis Cache in 2026: Fast Paths, Fresh Data, and a Modern DX](https://thelinuxcode.com/redis-cache-in-2026-fast-paths-fresh-data-and-a-modern-dx/)

### Memory Optimization
- [Redis Memory Optimization](https://redis.io/docs/latest/operate/oss_and_stack/management/optimization/memory-optimization/)
- [Redis Memory Optimization Techniques & Best Practices](https://medium.com/platform-engineer/redis-memory-optimization-techniques-best-practices-3cad22a5a986)
- [How to Optimize Redis Memory Usage](https://oneuptime.com/blog/post/2026-01-21-redis-memory-optimization/view)
- [Redis Cache Optimization With RedisJSON and RediSearch](https://medium.com/@kendevs/redis-cache-optimization-with-redisjson-and-redisearch-cc028ea22825)

### Connection Pooling
- [How to Properly Use Redis Connection Pools in Python: Best Practices](https://www.pythontutorials.net/blog/how-do-i-properly-use-connection-pools-in-redis/)
- [How to Configure Connection Pooling for Redis](https://oneuptime.com/blog/post/2026-01-25-redis-connection-pooling/view)
- [Connection pools and multiplexing](https://redis.io/docs/latest/develop/clients/pools-and-muxing/)
- [Effective use of Redis with Python and Connection Pool](https://fahadahammed.com/effective-use-of-redis-with-python-and-connection-pool/)

### Cache Patterns
- [Redis Cache-Aside Simplified](https://redis.io/blog/redis-smart-cache/)
- [Caching patterns - Database Caching Strategies Using Redis](https://docs.aws.amazon.com/whitepapers/latest/database-caching-strategies-using-redis/caching-patterns.html)
- [Cache-Aside Pattern - Azure Architecture Center](https://learn.microsoft.com/en-us/azure/architecture/patterns/cache-aside)
- [Implementing Efficient Caching with Lazy Loading: A Guide to Cache-Aside Patterns](https://systemdesignschool.io/fundamentals/cache-aside-pattern)

### Cache Warming
- [How to Implement Cache Warming Strategies](https://oneuptime.com/blog/post/2026-01-30-cache-warming-strategies/view)
- [Cache warming: Agility for a stateful service - Netflix](https://netflixtechblog.com/cache-warming-agility-for-a-stateful-service-2d3b1da82642)
- [How to handle cache warming like a Pro](https://medium.com/@dogabudak/how-to-handle-cache-warming-like-a-pro-7f48996a1213)
- [Cold and Warm Cache in System Design](https://www.geeksforgeeks.org/system-design/cold-and-warm-cache-in-system-design/)

### Data Structures
- [Redis Hash vs String performance comparison](https://medium.com/@danilosilva_37526/using-redis-hash-to-deal-with-collections-569449ac0384)
- [Introduction To Redis Data Structures: Hashes](https://scalegrid.io/blog/introduction-to-redis-data-structures-hashes/)
- [Redis performance basics](https://mariuszprzydatek.com/2013/08/07/redis-performance-basics/)
