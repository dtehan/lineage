# Feature Landscape: Redis Response Caching

**Domain:** REST API response caching for data lineage application
**Researched:** 2026-02-12
**Confidence:** HIGH (well-established patterns, verified against existing codebase and Redis documentation)

## Context

This feature landscape covers adding Redis caching to the Teradata column-level lineage API. The application already has:

- A `CacheRepository` interface in the domain layer with `Get`, `Set`, `Delete`, `Exists` methods
- A working Redis adapter (`adapter/outbound/redis/cache.go`) using `github.com/redis/go-redis/v9`
- A `NoOpCache` fallback for when Redis is unavailable
- Redis configuration loaded via Viper (`REDIS_ADDR`, `REDIS_PASSWORD`, `REDIS_DB`)
- Redis config plumbed through `config.go` but **not yet wired** into any service

The gap: The spec (`lineage_plan_backend.md`) shows the lineage service accepting a `CacheRepository`, but the actual `LineageService` and `OpenLineageService` implementations do **not** use the cache. The `main.go` entry point also does not instantiate Redis or pass it to services. The plumbing exists; the integration does not.

---

## Table Stakes

Features users expect. Missing any of these means caching is broken or harmful.

### TS-1: Cache-Aside Pattern (Read-Through)

**What:** Check Redis before hitting Teradata. On miss, query Teradata, store result in Redis, return. On hit, return cached data directly.
**Why Expected:** This is the fundamental caching pattern. Without it, there is no caching.
**Complexity:** LOW
**User-Visible:** No (transparent -- users see faster responses)
**Dependencies:** Existing `CacheRepository` interface, existing `NoOpCache` fallback

**Applies to these endpoints:**
| Endpoint | Cache Value | Why Cache |
|----------|------------|-----------|
| `GET /lineage/{datasetId}/{fieldName}` | Lineage graph (nodes + edges) | Recursive CTE, 150-500ms |
| `GET /namespaces/{namespaceId}/datasets` | Paginated dataset list | Teradata catalog query |
| `GET /datasets/{datasetId}` | Dataset with fields | Multi-table join |
| `GET /datasets/{datasetId}/statistics` | Table statistics | DBC view query |
| `GET /datasets/{datasetId}/ddl` | DDL text | SHOW TABLE/VIEW query |
| `GET /datasets/search` | Search results | LIKE query across tables |
| `GET /namespaces` | Namespace list | Small, rarely changes |

**Notes:**
- The existing `OpenLineageService` is the right integration point -- it sits between handlers and the repository, which is the standard service-layer caching location.
- The existing spec already prescribes the key format: `lineage:{assetId}:{direction}:{maxDepth}` for lineage queries. Extend this pattern for all endpoint types.

---

### TS-2: Deterministic Cache Key Generation

**What:** Generate consistent, unique cache keys from request parameters so identical requests always hit the same cache entry.
**Why Expected:** Without deterministic keys, cache hits never happen or, worse, wrong data gets returned.
**Complexity:** LOW
**User-Visible:** No
**Dependencies:** None

**Key strategy (recommended):**
```
lineage:v2:{datasetId}:{fieldName}:{direction}:{maxDepth}
datasets:v2:{namespaceId}:{limit}:{offset}
dataset:v2:{datasetId}
statistics:v2:{datasetId}
ddl:v2:{datasetId}
search:v2:{query}:{limit}
namespaces:v2
```

**Key design principles:**
- Use colon (`:`) as delimiter (Redis convention)
- Include API version prefix (`v2`) to prevent cross-version cache poisoning
- Include ALL parameters that affect the response (direction, maxDepth, limit, offset, query)
- Normalize parameters before key generation (e.g., lowercase, trim whitespace)
- Keep keys concise -- Redis performance degrades with very long keys

**Why not hash-based keys:** For a small API surface like this, readable keys are better for debugging. Hashing is needed only when key components contain special characters or are extremely long. Dataset IDs in this system are short integer strings. Search queries could theoretically be long, but the API already limits them.

---

### TS-3: TTL-Based Expiration

**What:** Set Time-To-Live on every cached entry so stale data is automatically evicted.
**Why Expected:** Without TTL, cached data becomes permanently stale. Lineage metadata changes when ETL processes run.
**Complexity:** LOW
**User-Visible:** No (users may see stale data within the TTL window, which is acceptable)
**Dependencies:** TS-1

**Recommended TTL values:**

| Data Type | TTL | Rationale |
|-----------|-----|-----------|
| Lineage graphs | 5 minutes (300s) | Most expensive query; data changes only on ETL runs; matches the spec's prescribed value |
| Dataset listings | 5 minutes (300s) | Paginated lists; datasets added/removed infrequently |
| Single dataset + fields | 10 minutes (600s) | Individual dataset metadata very stable |
| Statistics | 10 minutes (600s) | Row counts, sizes change after ETL but not minute-to-minute |
| DDL | 30 minutes (1800s) | Table/view definitions rarely change; frontend already uses 30-min staleTime |
| Search results | 2 minutes (120s) | Shorter TTL because search space is wide and user expects fresh results |
| Namespace list | 30 minutes (1800s) | Essentially static; new namespaces are extremely rare |

**TTL configuration:** TTLs should be configurable via environment variables (e.g., `CACHE_TTL_LINEAGE`, `CACHE_TTL_DATASETS`) with the above as sensible defaults. This follows the same pattern as `VALIDATION_MAX_DEPTH_LIMIT` -- hardcoded defaults overridable by env vars.

---

### TS-4: Graceful Degradation (NoOp Fallback)

**What:** When Redis is unavailable (connection refused, timeout, crash), the application continues to function by falling back to the `NoOpCache` which always misses.
**Why Expected:** Redis is explicitly documented as optional. Users must never see errors because of Redis being down.
**Complexity:** LOW (already implemented)
**User-Visible:** No (users see slightly slower responses, nothing more)
**Dependencies:** Existing `NoOpCache` implementation

**Current state:** The `NoOpCache` is already implemented and tested. The startup pattern from the spec shows:
```go
cache, err := redis.NewCacheRepository(redisCfg)
if err != nil {
    log.Printf("Warning: Redis not available, caching disabled: %v", err)
    cache = redis.NewNoOpCache()
}
```

**What still needs to happen:**
- Wire this pattern into `main.go` (currently not done)
- Ensure runtime Redis failures (not just startup) also degrade gracefully -- the service layer must catch Redis errors on `Get`/`Set` and fall through to the database query instead of returning an error to the user

---

### TS-5: Cache Error Isolation

**What:** Redis errors during `Get` or `Set` must never propagate to the API response. A failed cache read should transparently fall through to a database query. A failed cache write should be logged and ignored.
**Why Expected:** The cache is an optimization, not a data source. Errors in the optimization layer must not break the primary path.
**Complexity:** LOW
**User-Visible:** No
**Dependencies:** TS-1

**Pattern:**
```
On GET:
  1. Try cache.Get()
  2. If error (any error, not just miss): log warning, proceed to database
  3. Query database
  4. Try cache.Set()
  5. If Set error: log warning, ignore
  6. Return database result

On cache miss (not an error, just no data):
  Same flow as step 3 onward
```

**Critical distinction:** `ErrCacheMiss` (key not found) and actual Redis errors (connection lost, timeout) must both result in a database query. The code should NOT distinguish between them for flow control -- only for logging. Missed = debug log. Error = warning log.

---

## Differentiators

Features that make this caching robust, observable, and maintainable. Not strictly required, but significantly improve the solution.

### DIFF-1: Cache Bypass via Request Header

**What:** Allow clients to skip the cache by sending a `Cache-Control: no-cache` header (or a custom `X-Cache-Bypass: true` header). When bypassed, the request always hits Teradata and refreshes the cache entry.
**Why Valuable:** Users need a way to force-refresh after they know ETL has updated metadata. Without this, they wait for TTL expiration.
**Complexity:** LOW
**User-Visible:** Yes (requires UI integration or manual API call)
**Dependencies:** TS-1

**Implementation:** Check for the header in the handler or middleware. If present, skip cache read but still write the fresh result to cache (so subsequent non-bypass requests benefit).

**Frontend integration:** A "Refresh" button on the lineage graph toolbar could send this header. The frontend already has a toolbar (`Toolbar.tsx`) with depth/direction controls.

---

### DIFF-2: Cache Status Response Headers

**What:** Include response headers indicating cache status: `X-Cache: HIT` or `X-Cache: MISS`, and optionally `X-Cache-TTL: 247` (seconds remaining).
**Why Valuable:** Makes caching observable for debugging, performance tuning, and user confidence. Developers can see in browser DevTools whether a response came from cache.
**Complexity:** LOW
**User-Visible:** Yes (visible in DevTools, not in UI)
**Dependencies:** TS-1

**Headers:**
| Header | Values | Purpose |
|--------|--------|---------|
| `X-Cache` | `HIT`, `MISS`, `BYPASS`, `ERROR` | Cache status for this request |
| `X-Cache-TTL` | Integer seconds | Remaining TTL (only on HIT) |

---

### DIFF-3: Prefix-Based Cache Invalidation

**What:** Delete all cache entries matching a prefix pattern, enabling targeted invalidation. For example, invalidate all lineage caches for a specific dataset when its metadata changes.
**Why Valuable:** When users trigger a lineage re-scan or metadata refresh, stale cache entries for that specific dataset should be cleared without flushing everything.
**Complexity:** MEDIUM
**User-Visible:** No (happens automatically when metadata is refreshed)
**Dependencies:** TS-2 (key naming must support prefix matching)

**Implementation approach:**
- Use Redis `SCAN` with a pattern (never `KEYS` in production -- it blocks the server)
- Add a `DeleteByPrefix(ctx, prefix string) error` method to `CacheRepository` interface
- Example: `DeleteByPrefix(ctx, "lineage:v2:42:")` clears all lineage caches for dataset 42

**Alternative approach (simpler):** Use Redis Sets to track related keys by tag. Store a set `tag:dataset:42` containing all cache keys related to dataset 42. On invalidation, read the set, delete all listed keys, delete the set. This avoids SCAN entirely.

**Recommendation:** Start with TTL-only invalidation (TS-3). Add prefix-based invalidation only if a manual refresh/re-scan endpoint is built. The data changes infrequently enough that TTL handles most staleness.

---

### DIFF-4: Cache Warming on Startup

**What:** Pre-populate commonly accessed cache entries when the server starts, so the first user request hits a warm cache.
**Why Valuable:** Eliminates the "cold start" penalty for the most common queries (e.g., the namespace list, the first page of datasets).
**Complexity:** MEDIUM
**User-Visible:** Yes (first page load is fast even after server restart)
**Dependencies:** TS-1, TS-2, TS-3

**Candidates for warming:**
| Entry | Why | Cost |
|-------|-----|------|
| Namespace list | Every session starts here | Single lightweight query |
| First page of datasets per namespace | Asset browser default view | One query per namespace |

**Recommendation:** Implement only for namespace list (one query). Dataset warming adds complexity for marginal benefit given the short startup window.

---

### DIFF-5: Structured Cache Logging

**What:** Log cache operations with structured fields (hit/miss/error, key, TTL, latency) for observability and tuning.
**Why Valuable:** Enables calculating hit rate, identifying slow cache operations, detecting Redis issues early. The application already uses `log/slog` for structured logging.
**Complexity:** LOW
**User-Visible:** No (operator-facing)
**Dependencies:** TS-1

**Log fields:**
```json
{
  "level": "DEBUG",
  "msg": "cache hit",
  "cache_key": "lineage:v2:42:amount:both:5",
  "cache_status": "HIT",
  "cache_latency_ms": 2
}
```

**Log levels:**
- `DEBUG`: cache hit/miss (high volume, only for troubleshooting)
- `WARN`: cache error (Redis timeout, connection failure)
- `INFO`: cache bypass (when user explicitly skips cache)

---

### DIFF-6: Connection Pool Configuration

**What:** Configure Redis connection pooling parameters (pool size, min idle connections, timeouts) for production use.
**Why Valuable:** Default pool settings may not match production load. Explicit configuration prevents connection exhaustion under concurrent load.
**Complexity:** LOW
**User-Visible:** No
**Dependencies:** Existing go-redis client

**Parameters to expose:**
| Parameter | Default | Env Var |
|-----------|---------|---------|
| Pool size | 10 | `REDIS_POOL_SIZE` |
| Min idle connections | 2 | `REDIS_MIN_IDLE` |
| Dial timeout | 5s | `REDIS_DIAL_TIMEOUT` |
| Read timeout | 3s | `REDIS_READ_TIMEOUT` |
| Write timeout | 3s | `REDIS_WRITE_TIMEOUT` |

The go-redis v9 client already supports all of these via `redis.Options`.

---

### DIFF-7: HTTP Cache-Control Headers

**What:** Set standard HTTP `Cache-Control` headers on API responses to enable browser/proxy caching in addition to Redis caching.
**Why Valuable:** Provides a second layer of caching closer to the user. The frontend's TanStack Query already respects `staleTime` settings, but HTTP-level caching reduces network requests entirely.
**Complexity:** LOW
**User-Visible:** No (transparent)
**Dependencies:** None (independent of Redis caching)

**Recommended headers per endpoint:**
| Endpoint | Cache-Control | Rationale |
|----------|--------------|-----------|
| Lineage graphs | `private, max-age=300` | User-specific query parameters, 5 min |
| Dataset listings | `private, max-age=300` | Paginated, user-specific offset |
| Namespace list | `private, max-age=1800` | Rarely changes |
| Statistics | `private, max-age=600` | Moderately stable |
| DDL | `private, max-age=1800` | Very stable |
| Search results | `private, max-age=60` | Dynamic, short cache |

**Use `private` not `public`:** This is an internal enterprise tool accessing potentially sensitive database metadata. `private` prevents intermediate proxies from caching.

---

## Anti-Features

Features to explicitly NOT build. Common mistakes in this domain.

### AF-1: Do NOT Cache Error Responses

**What it would be:** Caching 404s, 500s, or validation errors.
**Why Avoid:** A transient database error would be cached, making the error persistent until TTL expires. A 404 for a dataset that is about to be created would block the user from ever seeing it.
**What to Do Instead:** Only cache successful (2xx) responses. If the database query returns an error, do not write to cache. If the database returns nil (not found), do not cache the nil.

---

### AF-2: Do NOT Build a Cache Admin API

**What it would be:** REST endpoints like `DELETE /api/v2/cache/*` for manually clearing cache entries.
**Why Avoid:** Adds attack surface, requires authorization, adds complexity. For an internal tool with a single backend instance, operators can use `redis-cli FLUSHDB` or `redis-cli DEL pattern*` directly.
**What to Do Instead:** Provide cache bypass headers (DIFF-1) for per-request refresh. Use TTL for automatic expiration. Document `redis-cli` commands for operations.

---

### AF-3: Do NOT Cache at the HTTP Middleware Layer

**What it would be:** A Chi middleware that caches entire HTTP responses (status code, headers, body) keyed by URL.
**Why Avoid:**
- Loses control over what gets cached (errors, partial responses)
- Cannot distinguish cache-worthy vs. non-cacheable responses (e.g., validation errors)
- Cannot vary TTL by endpoint
- Cannot integrate with domain-level invalidation
- Makes the service layer testable independently
**What to Do Instead:** Cache at the service layer where you have typed data, can control TTL per data type, and can make intelligent decisions about what to cache.

---

### AF-4: Do NOT Use Write-Through or Write-Behind Caching

**What it would be:** Updating the cache whenever the underlying data changes in Teradata (write-through), or writing to cache first and asynchronously updating Teradata (write-behind).
**Why Avoid:** This application is read-only. There are no write endpoints. Data changes happen externally via ETL processes that directly update Teradata. Write-through/write-behind patterns require control over the write path, which this API does not have.
**What to Do Instead:** Cache-aside (TS-1) with TTL (TS-3). Accept eventual consistency within the TTL window.

---

### AF-5: Do NOT Implement Client-Side Cache Invalidation via WebSocket

**What it would be:** A WebSocket push notification when cache entries expire or data changes, so the frontend can proactively refetch.
**Why Avoid:** Massive complexity increase for minimal benefit. ETL runs are infrequent (hours/days). The frontend already has TanStack Query with `staleTime` and automatic refetch on window focus. TTL-based expiration is sufficient.
**What to Do Instead:** Rely on TTL + frontend staleTime + manual refresh button (DIFF-1).

---

### AF-6: Do NOT Cache Paginated Results as Sorted Sets

**What it would be:** Storing the full dataset list as a Redis Sorted Set and querying ranges for pagination.
**Why Avoid:** Over-engineering. The dataset list comes from a simple paginated Teradata query. Caching each page independently (with limit+offset in the key) is simpler, uses the existing `Set`/`Get` interface, and avoids maintaining complex Redis data structures.
**What to Do Instead:** Cache each (namespaceId, limit, offset) combination as a separate JSON-serialized entry. Simple, uses existing infrastructure.

---

## Feature Dependencies

```
TS-4: Graceful Degradation (already exists)
  |
  v
TS-1: Cache-Aside Pattern
  |
  +-- TS-2: Cache Key Generation
  |     |
  |     +-- DIFF-3: Prefix-Based Invalidation (optional, later)
  |
  +-- TS-3: TTL-Based Expiration
  |     |
  |     +-- DIFF-4: Cache Warming (optional, later)
  |
  +-- TS-5: Cache Error Isolation
  |
  +-- DIFF-1: Cache Bypass Header
  |
  +-- DIFF-2: Cache Status Headers
  |
  +-- DIFF-5: Structured Logging

DIFF-6: Connection Pool Config (independent)
DIFF-7: HTTP Cache-Control Headers (independent)
```

---

## MVP Recommendation

For the v6.0 milestone, prioritize in this order:

### Must Have (Table Stakes)
1. **TS-1: Cache-Aside Pattern** -- the core feature
2. **TS-2: Cache Key Generation** -- required for TS-1 to work
3. **TS-3: TTL-Based Expiration** -- required to prevent stale data
4. **TS-4: Graceful Degradation** -- already exists, just needs wiring in `main.go`
5. **TS-5: Cache Error Isolation** -- required for reliability

### Should Have (Differentiators, low effort, high value)
6. **DIFF-2: Cache Status Headers** -- trivial to add, enables observability
7. **DIFF-5: Structured Logging** -- trivial with existing slog, critical for debugging
8. **DIFF-6: Connection Pool Config** -- expose existing go-redis options via env vars
9. **DIFF-1: Cache Bypass Header** -- simple handler-level check

### Defer to Post-MVP
- **DIFF-3: Prefix-Based Invalidation** -- only needed if refresh/re-scan endpoint is built
- **DIFF-4: Cache Warming** -- marginal benefit for single-user internal tool
- **DIFF-7: HTTP Cache-Control Headers** -- the frontend already manages its own caching via TanStack Query `staleTime`; adding HTTP headers is a nice-to-have

---

## Integration Points with Existing Code

### Where cache gets wired in

| File | Change |
|------|--------|
| `cmd/server/main.go` | Instantiate Redis client, create CacheRepository, pass to services |
| `application/openlineage_service.go` | Accept CacheRepository in constructor, add cache-aside logic to each method |
| `application/lineage_service.go` | Same pattern for v1 endpoints (if still needed) |
| `domain/repository.go` | CacheRepository interface already exists, may need `DeleteByPrefix` later |
| `adapter/outbound/redis/cache.go` | Already implemented, may need pool config options |
| `adapter/inbound/http/response.go` | Add cache status headers to `respondJSON` |
| `adapter/inbound/http/openlineage_handlers.go` | Check bypass headers, pass cache control context |

### Frontend consideration

The frontend TanStack Query hooks already set `staleTime` values:
- Statistics: 5 minutes (`5 * 60 * 1000`)
- DDL: 30 minutes (`30 * 60 * 1000`)
- Other queries: default (0, always refetch)

The Redis TTL values should be **at least as long** as the frontend `staleTime` to avoid the scenario where the frontend considers data stale, refetches, but gets the same cached data from Redis. Recommended: Redis TTL >= frontend staleTime, so that when the frontend refetches, it has a reasonable chance of getting fresh data.

---

## Sources

- [Redis Query Caching Tutorial](https://redis.io/tutorials/howtos/solutions/microservices/caching/) -- Cache-aside pattern reference
- [AWS Caching Patterns Whitepaper](https://docs.aws.amazon.com/whitepapers/latest/database-caching-strategies-using-redis/caching-patterns.html) -- Pattern comparison
- [go-redis/cache library](https://github.com/go-redis/cache) -- Go cache-aside implementation reference
- [Redis Cache Invalidation](https://redis.io/glossary/cache-invalidation/) -- Invalidation strategies
- [Smart Caching for API Pagination](https://medium.com/@anshulkahar2211/smart-caching-strategies-for-api-pagination-and-filtering-with-redis-5cf6b0a63b0f) -- Pagination caching patterns
- [go-redis v9 Documentation](https://redis.io/docs/latest/develop/clients/go/) -- Client API reference
- [Redis Key Naming Conventions](https://www.redimo.dev/blog/posts/redis-key-naming-conventions) -- Key design best practices
- [MDN Cache-Control Reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control) -- HTTP caching headers
- [Speakeasy REST API Caching Best Practices](https://www.speakeasy.com/api-design/caching) -- API-level caching patterns
- Existing codebase: `lineage_plan_backend.md` spec, `test_plan_backend.md` test cases, existing `cache.go` implementation
