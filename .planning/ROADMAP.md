# Milestone v6.0: Redis Caching Layer

**Status:** In Progress
**Phases:** 28-33
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
- [x] **Phase 30: Graceful Degradation** - Application starts and serves requests normally when Redis is unavailable
- [x] **Phase 31: Cache Control & Observability** - Cache status headers, bypass parameter, and UI refresh controls
- [x] **Phase 32: Update Documentation** - All repository documentation and READMEs updated to reflect Redis caching implementation
- [ ] **Phase 33: Remove Go Backend** - Remove all Go backend code and documentation references, keeping only the Python backend

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
- [x] 30-01-PLAN.md -- Replace fail-fast with NoOpCache fallback in main.go, add Close() to NoOpCache, integration tests

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

**Plans:** 2 plans

Plans:
- [x] 31-01-PLAN.md -- Add TTL to CacheRepository, CacheMetadata context type, CacheControl middleware with X-Cache headers, ?refresh=true bypass, CORS update
- [x] 31-02-PLAN.md -- Add refresh param to API client, refresh buttons in lineage toolbar and asset browser with TanStack Query cache bypass

---

### Phase 32: Update Documentation

**Goal**: All repository documentation and READMEs are updated to reflect the Redis caching layer implementation

**Depends on**: Phase 31

**Requirements**: None (documentation maintenance)

**Success Criteria** (what must be TRUE):
1. Documentation accurately describes the Redis caching implementation
2. All READMEs reflect current system architecture
3. Configuration examples include Redis settings
4. Cache control features are documented for users and operators

**Plans:** 2 plans

Plans:
- [x] 32-01-PLAN.md -- Update user_guide.md and operations_guide.md with accurate cache TTLs, key formats, CACHE_TTL_* env vars, X-Cache headers, and refresh buttons
- [x] 32-02-PLAN.md -- Update developer_manual.md, lineage-api/README.md, CLAUDE.md, lineage-ui/README.md, and SECURITY.md with correct architecture, versions, and cache configuration

---

### Phase 33: Remove Go Backend

**Goal**: Simplify the codebase by removing the Go backend implementation and all related documentation, keeping only the Python backend

**Depends on**: Phase 32

**Requirements**: None (codebase simplification)

**Success Criteria** (what must be TRUE):
1. All Go backend code (lineage-api directory) is removed from the repository
2. Documentation references to the Go backend are updated to show only Python backend
3. CLAUDE.md, README files, and user guides reflect Python-only backend
4. Build and deployment documentation no longer mentions Go, Makefile, or ODBC setup
5. The Python backend continues to function correctly after Go removal

**Plans:** 3 plans

Plans:
- [x] 33-01-PLAN.md -- Delete Go backend code, binaries, debug files, and spec files
- [x] 33-02-PLAN.md -- Update CLAUDE.md and .env.example for Python-only backend
- [x] 33-03-PLAN.md -- Update lineage-api/README.md and docs/ for Python-only backend

**Details:**

Phase 33 removes all Go backend code from the lineage-api/ directory while preserving the Python Flask backend. The phase executes in 2 waves: Wave 1 deletes all Go files (Plan 01), then Wave 2 updates documentation in parallel (Plans 02 and 03).

**Wave Structure:**
- Wave 1: Plan 01 (delete Go code)
- Wave 2: Plans 02 and 03 (update docs in parallel)

---

## Progress

**Execution Order:** Phase 28 -> Phase 29 -> Phase 30 -> Phase 31 -> Phase 32 -> Phase 33

Note: Phase 30 depends on Phase 28 but not Phase 29, so Phases 29 and 30 could execute in parallel. However, sequential ordering is simpler and Phase 29 builds the key/TTL infrastructure that Phase 30 tests against.

| Phase | Plans Complete | Status | Completed |
|-------|---------------|--------|-----------|
| 28. Redis Connection & Cache Decorator Foundation | 2/2 | Complete | 2026-02-12 |
| 29. Cache Keys, TTL & Full Coverage | 2/2 | Complete | 2026-02-12 |
| 30. Graceful Degradation | 1/1 | Complete | 2026-02-12 |
| 31. Cache Control & Observability | 2/2 | Complete | 2026-02-12 |
| 32. Update Documentation | 2/2 | Complete | 2026-02-13 |
| 33. Remove Go Backend | 3/3 | Complete | 2026-02-13 |

---

_For previous milestones, see .planning/MILESTONES.md_
_For current state, see .planning/STATE.md_
