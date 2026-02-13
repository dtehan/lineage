# Milestone v6.0: Redis Caching Layer

**Status:** In progress
**Phases:** 28-31
**Total Plans:** TBD

## Overview

Add Redis response caching to the Teradata lineage API using the repository decorator pattern. Lineage graph queries and asset listings are cached with configurable TTLs, the application degrades gracefully when Redis is unavailable, and users can force cache bypass for fresh data. The codebase already has CacheRepository interface, Redis adapter, and NoOpCache fallback -- this milestone wires them into the data path and adds observability.

**Target deliverables:**
- Redis connection wiring with NoOpCache fallback in main.go
- CachedOpenLineageRepository decorator implementing cache-aside pattern
- Deterministic cache key generation with per-data-type TTL configuration
- Graceful degradation (app starts and serves requests without Redis)
- Cache status headers (X-Cache: HIT/MISS, X-Cache-TTL) on API responses
- UI refresh buttons to force cache bypass via ?refresh=true parameter

## Phases

- [x] **Phase 28: Redis Connection & Cache Decorator Foundation** - Wire Redis into the application with cache-aside decorator for lineage queries
- [x] **Phase 29: Cache Keys, TTL & Full Coverage** - Deterministic key generation, configurable TTLs, and caching across all read endpoints
- [ ] **Phase 30: Graceful Degradation** - Application starts and serves requests normally when Redis is unavailable
- [ ] **Phase 31: Cache Control & Observability** - Cache status headers, bypass parameter, and UI refresh controls

## Phase Details

### Phase 28: Redis Connection & Cache Decorator Foundation

**Goal**: Lineage graph queries are cached in Redis using the repository decorator pattern, with fail-fast behavior when Redis is unavailable at startup

**Depends on**: Nothing (first phase of v6.0)

**Requirements**: CACHE-01, CACHE-02, CACHE-03, CACHE-04, CACHE-05, INT-01, INT-02, INT-03, INT-04, INT-05

**Success Criteria** (what must be TRUE):
1. A lineage graph query for a given column returns data from Redis on the second request without hitting Teradata
2. The CachedOpenLineageRepository wraps the Teradata repository transparently -- service and handler code is unchanged
3. main.go creates a Redis client from environment variables and fails fast if the connection fails
4. go-redis dependency is at v9.7.3 with CVE-2025-29923 fix applied
5. Cache stores domain entities (OpenLineageGraph, Dataset) as JSON and deserializes them correctly on cache hit

**Plans:** 2 plans

Plans:
- [x] 28-01-PLAN.md -- Upgrade go-redis to v9.7.3, wire Redis client with fail-fast in main.go
- [x] 28-02-PLAN.md -- Implement CachedOpenLineageRepository decorator with cache-aside pattern and unit tests

---

### Phase 29: Cache Keys, TTL & Full Coverage

**Goal**: All major read endpoints benefit from caching with deterministic keys and configurable per-data-type TTLs

**Depends on**: Phase 28

**Requirements**: KEY-01, KEY-02, KEY-03, KEY-04, KEY-05

**Success Criteria** (what must be TRUE):
1. Cache keys are deterministic -- the same request parameters always produce the same cache key, and different parameters produce different keys
2. Cache keys follow the format `ol:{entity}:{operation}:{params}` with pipe delimiters for composite parameters
3. Lineage cache entries expire after a configurable TTL (default 30 minutes) and asset listing entries expire after a separate configurable TTL (default 15 minutes)
4. TTL values for lineage and asset data types are independently configurable via environment variables

**Plans:** 2 plans

Plans:
- [x] 29-01-PLAN.md -- Cache key builder functions with determinism tests and CacheTTLConfig with env var loading
- [x] 29-02-PLAN.md -- Refactor decorator to use key builders and CacheTTLConfig, add cache-aside for all read endpoints

---

### Phase 30: Graceful Degradation

**Goal**: The application is completely functional without Redis -- it starts, serves all requests, and never returns errors due to cache infrastructure failures

**Depends on**: Phase 28

**Requirements**: DEGRADE-01, DEGRADE-02, DEGRADE-03, DEGRADE-04, DEGRADE-05

**Success Criteria** (what must be TRUE):
1. The application starts successfully and accepts API requests when Redis is not running
2. Every API endpoint returns correct data when Redis is down mid-request (cache errors are swallowed, Teradata is queried directly)
3. Redis connection errors and operation failures are logged at WARNING level but never propagate as HTTP error responses
4. NoOpCache is automatically used as the fallback implementation when Redis connection cannot be established

**Plans:** 1 plan

Plans:
- [ ] 30-01-PLAN.md -- Replace fail-fast with NoOpCache fallback in main.go, add Close() to NoOpCache, integration tests

---

### Phase 31: Cache Control & Observability

**Goal**: Users can see whether responses came from cache and force fresh data when needed, and operators can observe cache effectiveness

**Depends on**: Phase 28, Phase 29

**Requirements**: CONTROL-01, CONTROL-02, CONTROL-03, CONTROL-04, CONTROL-05

**Success Criteria** (what must be TRUE):
1. API responses include `X-Cache: HIT` or `X-Cache: MISS` header indicating cache status
2. API responses include `X-Cache-TTL` header showing seconds until the cached entry expires
3. Adding `?refresh=true` to any cached endpoint bypasses the cache and returns fresh data from Teradata
4. The lineage graph toolbar and asset browser each have a refresh button that triggers a cache bypass request
5. After clicking refresh, the UI displays fresh data and subsequent requests (without refresh) return the newly cached data

**Plans**: TBD

Plans:
- [ ] 31-01: Add cache status headers (X-Cache, X-Cache-TTL) to API responses via middleware or decorator
- [ ] 31-02: Implement ?refresh=true cache bypass in backend and add UI refresh buttons to lineage toolbar and asset browser

---

## Progress

**Execution Order:** Phase 28 -> Phase 29 -> Phase 30 -> Phase 31

Note: Phase 30 depends on Phase 28 but not Phase 29, so Phases 29 and 30 could execute in parallel. However, sequential ordering is simpler and Phase 29 builds the key/TTL infrastructure that Phase 30 tests against.

| Phase | Plans Complete | Status | Completed |
|-------|---------------|--------|-----------|
| 28. Redis Connection & Cache Decorator Foundation | 2/2 | Complete | 2026-02-12 |
| 29. Cache Keys, TTL & Full Coverage | 2/2 | Complete | 2026-02-12 |
| 30. Graceful Degradation | 0/1 | Not started | - |
| 31. Cache Control & Observability | 0/2 | Not started | - |

---

_For previous milestones, see .planning/MILESTONES.md_
_For current state, see .planning/STATE.md_
