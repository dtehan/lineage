---
phase: 06-caching-layer
plan: 02
subsystem: caching
tags: [stampede-prevention, cache-invalidation, metrics, distributed-locks, redis]
dependency_graph:
  requires:
    - 06-01-SUMMARY.md  # Redis caching infrastructure
  provides:
    - Stampede prevention via redis-lock distributed locks
    - Pattern-based cache invalidation using Redis SCAN
    - Cache monitoring via /api/v2/cache/stats endpoint
  affects:
    - lineage-api/repositories/lineage_repository.py  # Added _cache_get_or_compute
    - lineage-api/python_server.py  # Registered cache_bp Blueprint
tech_stack:
  added:
    - python-redis-lock: "Distributed lock for stampede prevention"
  patterns:
    - "Cache-aside with double-check pattern"
    - "Compute closures for stampede-safe caching"
    - "SCAN-based invalidation (non-blocking)"
key_files:
  created:
    - lineage-api/cache/stampede.py: "Distributed lock acquisition with auto-renewal"
    - lineage-api/cache/invalidation.py: "Pattern-based cache invalidation using SCAN"
    - lineage-api/cache/metrics.py: "Cache hit rate and health metrics from Redis INFO"
    - lineage-api/routes/cache.py: "Cache management Blueprint (invalidate, stats)"
  modified:
    - lineage-api/repositories/lineage_repository.py: "Added _cache_get_or_compute, refactored 3 methods"
    - lineage-api/python_server.py: "Registered cache_bp"
decisions:
  - title: "SCAN over KEYS for invalidation"
    rationale: "SCAN is non-blocking and production-safe (iterates without holding server)"
    alternatives: "KEYS command blocks Redis during keyspace scan"
  - title: "Double-check cache after lock acquisition"
    rationale: "Prevents redundant queries when multiple threads race for same cache key"
    alternatives: "Skip double-check (wastes database queries on concurrent misses)"
  - title: "Compute closures for repository caching"
    rationale: "Clean separation - caching logic centralized in _cache_get_or_compute"
    alternatives: "Inline lock acquisition in each repository method (code duplication)"
  - title: "Graceful degradation when Redis unavailable"
    rationale: "Cache endpoints return appropriate responses, stampede falls through to compute"
    alternatives: "Fail requests when Redis down (breaks application availability)"
metrics:
  duration_minutes: 3.2
  completed_date: "2026-02-16"
  tasks: 2
  files_created: 4
  files_modified: 2
---

# Phase 6 Plan 2: Cache Stampede Prevention and Management Summary

**One-liner:** Stampede prevention via redis-lock distributed locks, SCAN-based pattern invalidation, and cache management endpoints for ETL-triggered cache clearing.

## What Was Built

Added three core capabilities to complete the caching layer:

1. **Stampede Prevention**: Distributed locks prevent concurrent cache misses from executing duplicate database queries
2. **Pattern-based Invalidation**: ETL jobs can clear cache for specific datasets or entire databases using Redis SCAN
3. **Cache Monitoring**: Stats endpoint exposes hit rate, memory usage, and health metrics

## Implementation Details

### Stampede Prevention (Task 1)

**File:** `lineage-api/cache/stampede.py`

- `acquire_lock(redis_client, cache_key, expire=30)` creates Redis distributed lock
- Uses `python-redis-lock` library with auto-renewal for long queries
- Returns lock context manager or None if Redis unavailable
- Lock key format: `lock:{cache_key}` (e.g., `lock:lineage:graph:column:demo_user.customer:customer_id:upstream:5`)

**Integration:** `LineageRepository._cache_get_or_compute()` method:

1. Check cache → return if hit
2. Acquire lock → prevents stampede
3. Double-check cache → another thread may have populated
4. Execute compute function → database query
5. Set cache and return → other threads now read from cache

**Graceful degradation:** If lock unavailable, executes query without stampede protection (ensures availability over optimization).

### Cache Invalidation (Task 1)

**File:** `lineage-api/cache/invalidation.py`

- `invalidate_dataset(redis_client, dataset_name)` → clears all lineage for a table/view
- `invalidate_database(redis_client, database_name)` → clears all lineage for a database
- `invalidate_all(redis_client)` → clears entire lineage cache

**Pattern matching:**
- Dataset: `lineage:graph:*:{dataset}:*` and `lineage:graph:table:{dataset}:*`
- Database: `lineage:graph:*:{database}.*` and `lineage:graph:database:{database}:*`

**Implementation:** `_scan_and_delete()` uses Redis SCAN (not KEYS) for production safety. SCAN iterates through keyspace without blocking the server. Batch deletion via pipeline for efficiency (100 keys per iteration).

### Cache Metrics (Task 1)

**File:** `lineage-api/cache/metrics.py`

- `get_cache_stats(redis_client)` reads Redis INFO stats
- Returns: `hit_rate`, `hits`, `misses`, `total_keys`, `memory_used_mb`, `connected`
- Graceful fallback: returns all zeros + `connected: false` if Redis unavailable

Hit rate calculation: `(hits / (hits + misses) * 100)` rounded to 2 decimals.

### Cache Management Endpoints (Task 2)

**File:** `lineage-api/routes/cache.py`

**POST /api/v2/cache/invalidate** - Clear cache entries

Request body (JSON):
```json
{
  "dataset_name": "demo_user.customer",  // OR
  "database_name": "demo_user",          // OR
  "all": true
}
```

Response:
```json
{
  "deleted_keys": 42
}
```

**GET /api/v2/cache/stats** - Cache health metrics

Response:
```json
{
  "hit_rate": 87.5,
  "hits": 1234,
  "misses": 176,
  "total_keys": 89,
  "memory_used_mb": 12.34,
  "connected": true
}
```

**Error handling:**
- 400: Missing required parameters
- 503: Redis unavailable (returns `deleted_keys: 0` or `connected: false`)

### Repository Refactoring (Task 2)

**File:** `lineage-api/repositories/lineage_repository.py`

Added `_cache_get_or_compute(cache_key, compute_fn, timeout)` method that combines:
- Cache lookup
- Lock acquisition
- Double-check
- Query execution
- Cache population

Refactored 3 methods to use compute closures:

```python
def get_upstream_lineage(self, dataset_name, field_name, max_depth=5):
    cache_key = make_column_lineage_key(dataset_name, field_name, "upstream", max_depth)

    def compute():
        with self.connection.cursor() as cur:
            cur.execute("""...""", [dataset_name, field_name, max_depth])
            return [... list comprehension ...]

    return self._cache_get_or_compute(cache_key, compute)
```

Same pattern applied to:
- `get_upstream_lineage` (column-level, upstream direction)
- `get_downstream_lineage` (column-level, downstream direction)
- `get_database_lineage` (database-level, bidirectional)

**Benefits:**
- Stampede prevention centralized in one method
- Clean separation of caching and business logic
- No code duplication across repository methods

### Blueprint Registration (Task 2)

**File:** `lineage-api/python_server.py`

Added import: `from routes.cache import cache_bp`

Registered in `create_app()`:
```python
app.register_blueprint(health_bp)
app.register_blueprint(openlineage_bp)
app.register_blueprint(cache_bp)  # New
```

Routes now available at `/api/v2/cache/invalidate` and `/api/v2/cache/stats`.

## Deviations from Plan

None - plan executed exactly as written.

## Dependencies

**Required:**
- python-redis-lock >= 4.0.0 (already in requirements.txt)
- Flask-Caching >= 2.3.0 (from Plan 01)
- redis >= 5.0.0 (from Plan 01)

**Builds on:**
- 06-01 (Redis caching infrastructure, hierarchical cache keys, cache-aside pattern)

## Testing Notes

**Manual verification:**
1. Cache endpoints load: `from routes.cache import cache_bp; print('OK')`
2. Stampede module exists: `cache/stampede.py` with `acquire_lock` function
3. Invalidation uses SCAN: grep confirms `redis_client.scan()` usage
4. Blueprint registered: grep confirms `cache_bp` import and registration
5. Repository integration: grep confirms `acquire_lock` and `_cache_get_or_compute` usage

**Automated tests deferred to Phase 6 Plan 3** (API endpoint tests, integration tests).

**Production validation:**
- Monitor `/api/v2/cache/stats` for hit rate over time
- Verify concurrent requests don't execute duplicate queries (check DB logs)
- ETL jobs should call `/api/v2/cache/invalidate` after updating lineage data

## Next Steps

**Phase 6 Plan 3:** Cache warming, TTL tuning, and integration tests (validates 20 existing API tests still pass).

## Completion Checklist

- [x] Task 1: Create stampede prevention, invalidation, and metrics modules (commit 4fe379a)
- [x] Task 2: Create cache Blueprint, integrate stampede, register routes (commit c48faf5)
- [x] Stampede prevention via distributed locks with auto-renewal
- [x] Double-check cache after lock acquisition
- [x] Pattern-based invalidation using SCAN (non-blocking)
- [x] Cache management Blueprint with invalidate and stats endpoints
- [x] All 3 LineageRepository methods use _cache_get_or_compute
- [x] Graceful degradation when Redis unavailable
- [x] Summary created and self-checked

## Self-Check: PASSED

All created files exist:
- FOUND: lineage-api/cache/stampede.py
- FOUND: lineage-api/cache/invalidation.py
- FOUND: lineage-api/cache/metrics.py
- FOUND: lineage-api/routes/cache.py

All commits exist:
- FOUND: 4fe379a (Task 1: stampede, invalidation, metrics modules)
- FOUND: c48faf5 (Task 2: cache Blueprint, repository integration)
