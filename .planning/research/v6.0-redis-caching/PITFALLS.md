# Domain Pitfalls: Adding Redis Caching to Lineage API

**Domain:** Adding Redis caching to an existing, working REST API (Go + Teradata)
**Researched:** 2026-02-12
**Confidence:** HIGH (verified against codebase, official Redis docs, go-redis production docs, and multiple community sources)

---

## Critical Pitfalls

Mistakes that cause correctness bugs, data loss, or system outages. These must be addressed before shipping.

---

### Pitfall 1: Composite Cache Key Collisions (CACHE-KEY-01)

**What goes wrong:**
Lineage queries have multiple parameters that form the cache key: `assetID` + `direction` + `maxDepth`. If the key is constructed naively (e.g., simple string concatenation), different queries can produce identical keys. For example, a column ID like `demo_user.STG_ORDERS.order_id` concatenated with `upstream` and depth `5` must not collide with `demo_user.STG_ORDERS.order_id:upstream` at depth `5` if the delimiter also appears in the data.

In this codebase specifically, column IDs use dots as separators (`database.table.column`), and paginated endpoints add `limit` and `offset` parameters. The v2 OpenLineage API adds `datasetId` + `fieldName` + `direction` + `maxDepth`. Without careful delimiter choice, `dataset:field:upstream:5` and `dataset:field:upstream:5` from different endpoints could collide.

**Why it happens:**
Developers concatenate parameters with common delimiters (`:`, `.`, `-`) without considering that the parameter values themselves contain those characters. Teradata identifiers contain dots. URL path segments contain slashes.

**Consequences:**
- Wrong lineage data served to users (correctness failure)
- Upstream query returning downstream results (silent data corruption)
- Cache hit for the wrong asset entirely

**Prevention:**
- Use a structured key format with a prefix that identifies the endpoint: `lineage:v1:graph:{assetId}:{direction}:{maxDepth}`
- Use a delimiter character that cannot appear in Teradata identifiers (pipe `|` is a good choice since dots, colons, and hyphens all appear in the data)
- Alternatively, hash the composite parameters: `lineage:v1:graph:sha256(assetId|direction|maxDepth)`
- For paginated endpoints, always include `limit` and `offset` in the key: `assets:v1:databases:{limit}:{offset}`
- Write unit tests that explicitly test keys with similar-but-different parameter values

**Warning signs:**
- Cache hit rate is suspiciously high (near 100%) early in deployment
- Users report seeing lineage data that does not match their query
- Lineage graph shows connections that do not exist
- No explicit key-building function exists (keys are constructed ad-hoc in each handler)

**Phase to address:** First implementation phase (cache key design is foundational)

**This codebase specifically:**
The `CacheRepository.Get/Set` interface accepts a `string` key. There is no key-builder utility. Every call site will need to construct keys manually unless a centralized key-building function is created. The v1 API uses `assetId` (dot-separated: `db.table.column`), and the v2 API uses separate `datasetId` and `fieldName`. These must produce different cache keys even though the underlying data may overlap.

---

### Pitfall 2: Caching Errors or Partial Results (CACHE-CORRECTNESS-01)

**What goes wrong:**
When a Teradata query fails partway through (e.g., timeout on a deep recursive CTE), the code catches the error, but a previous successful sub-query result gets cached. On the next request, the cached partial result is served as if it were complete. The user sees an incomplete lineage graph with no indication that data is missing.

In this codebase, `GetLineageGraph` calls `GetUpstreamLineage` and `GetDownstreamLineage` sequentially. If caching is added at the graph level, and upstream succeeds but downstream fails, caching must not store the partial graph. If caching is added at the individual upstream/downstream level, the graph builder will combine a cached upstream with a freshly failed downstream, potentially producing confusing results.

**Why it happens:**
Cache-aside pattern implementation caches the result after the database call succeeds, but does not account for multi-step operations where one step succeeds and another fails. The "happy path" works; the error path is not tested with caching enabled.

**Consequences:**
- Users make decisions based on incomplete lineage data
- Impact analysis underreports affected columns
- Stale partial results persist for the TTL duration
- Difficult to debug because "sometimes it works" (depends on cache state)

**Prevention:**
- Cache only at the final response level, not at intermediate sub-query levels
- If caching sub-queries independently, ensure the graph-building logic re-fetches both upstream and downstream on any error
- Never cache error responses -- verify that `err == nil` before calling `cache.Set()`
- Add a completeness marker to cached data (e.g., a `complete: true` field) that the graph builder can check
- Test the error path explicitly: mock a Teradata timeout on downstream, verify the upstream-only result is NOT cached

**Warning signs:**
- Lineage graphs that show only upstream or only downstream connections
- Impact analysis reports that differ between cache hit and cache miss
- Users say "refreshing fixes it" (because refresh bypasses cache)
- Cache hit returns fewer nodes/edges than a direct database query

**Phase to address:** Core cache integration phase, with explicit test cases for partial failure

---

### Pitfall 3: Redis Failure Breaking the Application (CACHE-DEGRADATION-01)

**What goes wrong:**
The application starts requiring Redis to function, even though caching is supposed to be optional. This happens in several ways:
1. The `Get()` call to Redis times out (default 3 seconds), adding latency instead of reducing it
2. The `Set()` call fails and the error propagates up, causing a 500 response even though the data was successfully fetched from Teradata
3. Connection pool exhaustion blocks all handlers waiting for a Redis connection
4. Startup fails if Redis is unavailable, preventing the application from running at all

**Why it happens:**
Developers test with Redis running locally. The "Redis is down" scenario is never tested. Error handling after `cache.Set()` returns an error either panics or returns the error to the caller. The `NoOpCache` exists in the codebase but is only used as a compile-time interface check, not wired into the fallback path at runtime.

**Consequences:**
- Application becomes unavailable when Redis goes down (defeats the purpose of optional caching)
- Response times increase instead of decreasing (Redis timeout + Teradata query time)
- Cascading failures: Redis pool exhaustion blocks all goroutines, Teradata connections also exhaust

**Prevention:**
- Use the existing `NoOpCache` as the runtime fallback when Redis initialization fails (the code already has this structure in `cache.go`)
- Swallow `cache.Set()` errors: log them but do not propagate to the caller. A failed cache write should never cause a 500 response.
- Swallow `cache.Get()` errors other than cache miss: treat Redis errors the same as cache miss and fall back to Teradata
- Set aggressive Redis timeouts: `DialTimeout: 1s`, `ReadTimeout: 500ms`, `WriteTimeout: 500ms`. A slow Redis is worse than no Redis.
- Configure `PoolTimeout` shorter than the HTTP handler timeout to prevent goroutine blocking
- Implement a circuit breaker: after N consecutive Redis failures, stop trying Redis for M seconds
- Test with Redis explicitly stopped: the application must serve correct responses with the same API contract

**Warning signs:**
- Handlers have `if err != nil { return err }` after `cache.Set()` calls
- No `NoOpCache` fallback wiring in `main.go` or wherever Redis is initialized
- Redis timeout configuration uses defaults (5s dial, 3s read/write) instead of aggressive sub-second values
- No test that runs the full API flow with Redis unavailable
- Response times spike when Redis is slow rather than when Redis is down

**Phase to address:** Must be the FIRST thing implemented. Graceful degradation is the prerequisite for all other caching work.

**This codebase specifically:**
`cmd/server/main.go` currently does not initialize Redis or the `CacheRepository` at all. When adding it, the pattern must be:
```go
cache, err := redis.NewCacheRepository(cfg.Redis)
if err != nil {
    log.Printf("Redis unavailable, running without cache: %v", err)
    cache = redis.NewNoOpCache()
}
```
Not:
```go
cache, err := redis.NewCacheRepository(cfg.Redis)
if err != nil {
    log.Fatalf("Failed to connect to Redis: %v", err)  // WRONG: kills the app
}
```

---

### Pitfall 4: Cache Stampede on Cold Start or Key Expiry (CACHE-STAMPEDE-01)

**What goes wrong:**
When the cache is empty (cold start, Redis restart, or TTL expiry of a popular key), multiple concurrent requests for the same lineage graph all miss the cache simultaneously. Each request independently hits Teradata with the same expensive recursive CTE query. With 10 concurrent users viewing the same column's lineage, Teradata executes the same recursive CTE 10 times in parallel.

For this application, the recursive CTE queries are the most expensive operations (150-500ms per query). A stampede of 10 identical queries could push Teradata to 5 seconds of compute for one logical request, impacting all other users.

**Why it happens:**
The cache-aside pattern does not coordinate between concurrent requests. Each request independently checks cache, misses, queries database, then populates cache. The "populate cache" step happens 10 times instead of once.

**Consequences:**
- Teradata resource exhaustion during traffic spikes
- Response time degradation for ALL queries (not just the stampeded one)
- In extreme cases, Teradata connection pool exhaustion causing cascading failures
- The problem is worst at application startup (every key is cold)

**Prevention:**
- Use Go's `golang.org/x/sync/singleflight` package to coalesce concurrent requests for the same cache key. Only one goroutine fetches from Teradata; others wait for its result.
- Implementation pattern:
  ```go
  var group singleflight.Group

  result, err, _ := group.Do(cacheKey, func() (interface{}, error) {
      // Only one goroutine enters here per key
      return repo.GetLineageGraph(ctx, assetID, direction, maxDepth)
  })
  ```
- For TTL-based expiry, use "soft TTL" with background refresh: serve stale data while refreshing in the background, rather than blocking all requests on refresh
- Consider staggered TTLs: add a small random jitter to TTL values so all keys do not expire simultaneously

**Warning signs:**
- Teradata connection pool warnings during startup or periodic cache expiry
- Spiky response times that correlate with cache miss waves
- Database query count spikes at regular intervals matching TTL duration
- Load tests show worse performance than expected with caching enabled

**Phase to address:** Second implementation phase (after basic cache-aside works, add stampede protection)

---

### Pitfall 5: Stale Cache After Lineage Data Changes (CACHE-INVALIDATION-01)

**What goes wrong:**
Lineage metadata is updated via `populate_lineage.py` (DBQL extraction or fixture mode), which writes directly to Teradata tables. The cache has no way to know that the underlying data changed. Users continue seeing stale lineage graphs for up to the TTL duration after new lineage relationships are added or old ones deactivated.

For impact analysis specifically, stale cache is dangerous: if a new downstream dependency is added and the cache still shows the old graph, the user misses a critical impact path during change management assessment.

**Why it happens:**
The population scripts write to Teradata directly, bypassing the Go API entirely. There is no event mechanism or notification channel between the population scripts and the API server. The cache TTL is the only invalidation mechanism.

**Consequences:**
- Users make change management decisions based on outdated lineage data
- New columns or tables appear in the asset browser but their lineage is not visible (asset queries hit Teradata, lineage queries hit stale cache)
- Inconsistency between what the asset browser shows and what the lineage graph shows

**Prevention:**
- Choose TTL values based on data change frequency, not access patterns. If lineage data changes daily, a 1-hour TTL for lineage queries is reasonable. If it changes hourly, 5-minute TTL.
- Implement a manual cache invalidation endpoint (`DELETE /api/v1/cache` or similar) that can be called after `populate_lineage.py` runs
- Add a `?refresh=true` query parameter that bypasses cache (the UI already plans "refresh buttons")
- For the population scripts, add a post-population step that calls the cache invalidation endpoint
- Document the expected staleness window so users know to hit refresh after data updates
- Use shorter TTLs for lineage data (5-10 minutes) and longer TTLs for relatively static asset metadata (30-60 minutes)

**Warning signs:**
- Users report that newly added lineage relationships do not appear
- The "refresh" button is the most-used button in the UI
- Support tickets asking "why doesn't my lineage show the new mapping I just added?"
- TTL values are set to hours or days without considering the update cadence

**Phase to address:** Core cache integration phase (TTL strategy) plus a separate cache management endpoint phase

**This codebase specifically:**
`populate_lineage.py` has `--dry-run` and `--since` modes. A post-population hook could call `curl -X DELETE http://localhost:8080/api/v1/cache` to flush relevant keys. The `CacheRepository` interface already has a `Delete` method but no `FlushAll` or pattern-based delete.

---

## Moderate Pitfalls

Mistakes that cause performance degradation, technical debt, or developer confusion. Should be addressed before production, but will not cause data correctness issues.

---

### Pitfall 6: Caching at the Wrong Layer (CACHE-LAYER-01)

**What goes wrong:**
Cache logic is added to the HTTP handler layer (inbound adapter) instead of the service layer (application). This means:
1. The cache is tightly coupled to HTTP request/response formats
2. Internal calls between services bypass the cache entirely
3. The Python server (`python_server.py`) cannot share the cache because it serializes responses differently
4. Testing requires HTTP integration tests instead of unit tests

Alternatively, caching at the repository layer (outbound adapter) means caching raw database results before DTO transformation, which wastes cache space on data that still needs processing.

**Why it happens:**
The handler layer is where request parameters are available, making it the "obvious" place to add cache checks. Adding caching to the service layer requires refactoring service constructors to accept a `CacheRepository` dependency.

**Prevention:**
- Add cache logic to the service layer (`application/lineage_service.go`, `application/asset_service.go`, etc.)
- Services already transform domain entities to DTOs -- cache the DTO responses, not raw domain entities
- Inject `domain.CacheRepository` as a dependency into each service that needs caching
- This keeps handlers thin (they just parse HTTP and call services) and keeps caching logic testable with mock cache

**Warning signs:**
- Import of `redis` or `cache` package in handler files
- Cache keys contain HTTP-specific values (like raw URL strings)
- Services have no awareness of caching (service tests pass with zero cache involvement)
- Python server has no caching even though it serves the same API

**Phase to address:** Architecture decision in the first implementation phase

---

### Pitfall 7: Pagination Cache Key Explosion (CACHE-PAGINATION-01)

**What goes wrong:**
Paginated endpoints (`ListDatabases`, `ListTables`, `ListColumns`, `ListDatasets`) generate unique cache keys for every `limit`/`offset` combination. With default limits of 50, a table with 500 columns generates 10 distinct cache keys just for different pages. If users change page sizes or scroll through results, the number of keys multiplies. Each cached page is mostly redundant data.

**Why it happens:**
The naive approach caches each page independently: `assets:databases:limit=50:offset=0`, `assets:databases:limit=50:offset=50`, etc. This seems correct but produces poor cache utilization.

**Consequences:**
- Redis memory usage grows linearly with number of page combinations accessed
- Cache hit rate is low because most users browse pages 1-3 and rarely revisit
- When underlying data changes, ALL page-variant keys become stale but only some get invalidated
- Pattern-based invalidation (delete all keys matching `assets:databases:*`) requires `SCAN`, which is expensive

**Prevention:**
- For small result sets (databases list: typically < 100 items), cache the FULL list and paginate in the application layer
- For medium result sets (tables per database: typically < 1000), same approach -- cache full list
- For columns per table (typically < 500), same approach
- Reserve per-page caching for truly large result sets that cannot fit in a single cache entry
- This dramatically reduces key count and simplifies invalidation

**Warning signs:**
- Redis key count grows faster than expected
- `SCAN` operations take longer over time
- Cache invalidation after data updates misses some page-variant keys
- Memory usage is disproportionate to the amount of distinct data

**Phase to address:** Cache key design phase (before implementation)

---

### Pitfall 8: JSON Serialization Edge Cases with Go Types (CACHE-SERIAL-01)

**What goes wrong:**
The existing `CacheRepository.Set()` uses `json.Marshal()` and `Get()` uses `json.Unmarshal()`. Several Go types in the domain entities serialize correctly but deserialize with subtle differences:

1. `time.Time` fields (in `Database`, `Table`, `OpenLineageDataset`, etc.) serialize with nanosecond precision but may lose timezone info depending on Go's JSON encoding. A cached `time.Time` value might not `==` the original.
2. `map[string]any` in `LineageNode.Metadata` and `OpenLineageNode.Metadata` deserializes JSON numbers as `float64`, not `int`. If code downstream checks `metadata["columnPosition"].(int)`, it will panic on a cache hit even though it worked on a cache miss.
3. `nil` slices vs empty slices: `json.Marshal([]Node(nil))` produces `null`, but `json.Marshal([]Node{})` produces `[]`. After deserialization, a nil slice becomes a non-nil empty slice or vice versa, potentially breaking `== nil` checks or frontend JSON parsing.

**Why it happens:**
Go's `encoding/json` package has well-documented but frequently forgotten edge cases. Code that works with direct database results breaks with cached results because the data takes a different path through `json.Marshal` -> Redis string -> `json.Unmarshal`.

**Consequences:**
- Type assertion panics on cache hits (works fine on cache miss)
- Subtle data differences between cached and uncached responses
- Frontend receives `null` instead of `[]` (or vice versa) depending on cache state
- Time comparisons fail intermittently

**Prevention:**
- Initialize all slices as empty (not nil): `Nodes: make([]Node, 0)` not `var Nodes []Node`
- Use `json.Number` or ensure all numeric metadata values are `float64`
- Write a test that roundtrips every cached type through `json.Marshal` -> `json.Unmarshal` and compares the result
- Use response DTOs (which this codebase already has) as the cached type, not domain entities
- Test that the JSON output is byte-identical between cache hit and cache miss responses

**Warning signs:**
- Panic stack traces mentioning `interface conversion` after cache integration
- Frontend errors that appear only on the second load (first load = cache miss, second = cache hit)
- Flaky tests that pass on first run but fail on second
- API responses that sometimes have `"nodes": null` and sometimes `"nodes": []`

**Phase to address:** Cache integration testing phase

---

### Pitfall 9: Missing Cache-Control Headers for UI Refresh (CACHE-HEADERS-01)

**What goes wrong:**
The backend implements Redis caching, but the frontend has no way to signal "I want fresh data." The planned UI refresh buttons need a mechanism to bypass the server-side cache. Without this, the refresh button simply re-fetches from Redis, returning the same stale data.

Additionally, browser-level HTTP caching (via `Cache-Control` headers) may cache responses independently of Redis, creating a second layer of staleness that the refresh button cannot clear.

**Why it happens:**
Backend caching and frontend caching are designed independently. The refresh button is assumed to "work" because it makes a new HTTP request, but no one considers that the new request hits the Redis cache.

**Consequences:**
- Refresh button does nothing (users perceive the feature as broken)
- Two layers of caching (browser + Redis) compound staleness
- Users have no escape hatch when they need current data

**Prevention:**
- Support a `Cache-Control: no-cache` request header or `?refresh=true` query parameter that bypasses Redis
- Set appropriate `Cache-Control` response headers: `Cache-Control: private, max-age=0, must-revalidate` for lineage data (since it is user-specific to the query, not shareable)
- Implement ETag or Last-Modified headers for asset lists so the browser can make conditional requests
- Wire the UI refresh button to include the cache-bypass signal in its request

**Warning signs:**
- UI refresh button exists but users still report stale data
- Network tab shows 304 responses when the user expects fresh data
- No `Cache-Control` headers in API responses
- No cache bypass parameter documented in the API

**Phase to address:** Cache management endpoints phase (coordinated with frontend)

---

### Pitfall 10: Unbounded Redis Memory Growth (CACHE-MEMORY-01)

**What goes wrong:**
Every unique query combination creates a new cache entry. Lineage graphs can be large (hundreds of nodes and edges for deep recursive traversals). Without memory limits, Redis grows until the host runs out of memory, causing Redis to crash or trigger the OOM killer.

The OpenLineage graph response for a single column at depth 10 with both directions can include hundreds of nodes and edges, each serialized as JSON. At ~500 bytes per node and ~200 bytes per edge, a graph with 200 nodes and 300 edges is ~160KB. With 1000 distinct columns queried, that is 160MB in Redis just for lineage graphs.

**Why it happens:**
TTL handles key expiry but does not cap total memory. Developers set TTLs but do not configure `maxmemory` or eviction policies. Redis defaults to no memory limit.

**Consequences:**
- Redis OOM crash, triggering fallback to NoOp (best case) or application crash (worst case)
- Operating system OOM killer terminates Redis process
- Swap thrashing if the system uses swap, degrading Redis and all co-located services

**Prevention:**
- Configure `maxmemory` in Redis to a sane limit (e.g., 256MB or 512MB for this application)
- Set `maxmemory-policy` to `allkeys-lru` (evict least recently used keys when memory is full)
- Estimate cache size: count of distinct cacheable queries * average response size
- Cap the maximum depth parameter for caching: queries with `maxDepth > 10` may not be worth caching (too large, too unique)
- Monitor Redis memory usage with `INFO memory` and alert before hitting limits

**Warning signs:**
- Redis `used_memory` growing steadily without plateau
- No `maxmemory` configuration in Redis config
- Large lineage graph responses being cached without size checks
- Redis eviction count is zero (meaning no eviction policy is active)

**Phase to address:** Redis infrastructure configuration phase (before production deployment)

---

## Minor Pitfalls

Mistakes that cause developer annoyance, minor UX issues, or suboptimal performance. Can be addressed iteratively.

---

### Pitfall 11: Testing Cache Behavior Is Harder Than Expected (CACHE-TEST-01)

**What goes wrong:**
Unit tests pass with the `NoOpCache` but integration tests with real Redis reveal bugs. The test suite becomes order-dependent: test A populates a cache entry, test B reads stale data from that entry. CI environments may or may not have Redis available, causing flaky CI builds.

**Why it happens:**
The existing test suite (`260+ Vitest`, `21 Playwright`, `73 database`, `20 API`) was built without caching. Adding caching changes observable behavior (responses may come from cache or database) but the test suite does not account for this.

**Prevention:**
- Flush Redis between every test (or use a unique key prefix per test)
- Run the full test suite twice: once with `NoOpCache` (verifying correctness without caching) and once with real Redis (verifying caching behavior)
- Add explicit cache-specific tests: cache hit returns same data as cache miss, cache TTL expiry causes re-fetch, cache bypass returns fresh data
- Use a separate Redis database number (`REDIS_DB=1`) for tests so test data does not pollute development data

**Warning signs:**
- Tests pass locally but fail in CI (Redis availability)
- Tests pass individually but fail when run together (cache pollution)
- No tests that explicitly verify cache hit vs cache miss behavior
- "Works on my machine" because local Redis has different state

**Phase to address:** Testing phase (after core caching is implemented)

---

### Pitfall 12: Logging and Observability Blind Spots (CACHE-OBSERVE-01)

**What goes wrong:**
After adding caching, debugging becomes harder because you cannot tell whether a response came from cache or database. When a user reports incorrect data, you cannot determine if it is a cache issue, a database issue, or a data population issue without additional context.

**Why it happens:**
Caching is added as a performance optimization and logging is considered unnecessary for the "fast path." The existing structured logging (slog) logs database errors but not cache operations.

**Prevention:**
- Log cache hits and misses at DEBUG level with the cache key
- Log cache write failures at WARN level (not ERROR, since fallback works)
- Add a response header (`X-Cache: HIT` or `X-Cache: MISS`) so developers can see in the browser network tab whether data came from cache
- Include cache key in request-scoped structured logging context
- Monitor cache hit rate as a metric (should be 60-80% in steady state; much higher or lower indicates a problem)

**Warning signs:**
- Cannot determine from logs whether a response was cached
- Debugging stale data requires reading Redis directly with `redis-cli`
- No metrics on cache hit/miss ratio
- Support escalations take longer because caching adds another layer to investigate

**Phase to address:** Observability can be added incrementally alongside cache implementation

---

### Pitfall 13: Context Cancellation Races with Cache Writes (CACHE-CONTEXT-01)

**What goes wrong:**
A user navigates away from a lineage page (cancelling the HTTP request context). The Teradata query completes just in time, but the cache write uses the same cancelled context, so `cache.Set()` fails silently. The next request for the same data still misses the cache. Under high cancellation rates (users clicking quickly between columns), the cache never gets populated.

**Why it happens:**
Go's `context.Context` propagation is excellent for cancellation, but cache writes should often use a detached context since the cached data is still valid even if the original requester left.

**Consequences:**
- Low cache hit rate despite cache logic being correct
- Teradata gets queried repeatedly for the same data
- Performance benefit of caching is undermined

**Prevention:**
- Use `context.WithoutCancel(ctx)` (Go 1.21+) or `context.Background()` with a short timeout for cache write operations
- Keep the original context for Teradata queries (so they cancel properly) but detach for cache writes
- Add a brief timeout (1-2 seconds) to the detached cache write context to prevent goroutine leaks

**Warning signs:**
- Cache hit rate is lower than expected based on traffic patterns
- Cache write error logs show `context canceled` errors
- Users who navigate quickly experience slower performance than users who wait patiently

**Phase to address:** Refinement phase (after basic caching works)

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Severity | Mitigation |
|---|---|---|---|
| Graceful degradation setup | Redis failure crashes app (CACHE-DEGRADATION-01) | CRITICAL | Wire NoOpCache fallback before any cache logic |
| Cache key design | Key collisions with dot-separated IDs (CACHE-KEY-01) | CRITICAL | Centralized key builder with safe delimiters |
| Service-layer cache integration | Caching partial/error results (CACHE-CORRECTNESS-01) | CRITICAL | Only cache after full success, test error paths |
| Lineage query caching | Cache stampede on popular columns (CACHE-STAMPEDE-01) | CRITICAL | singleflight for concurrent request coalescing |
| TTL configuration | Stale data after population updates (CACHE-INVALIDATION-01) | CRITICAL | Short TTLs + manual invalidation endpoint |
| Pagination caching | Key explosion from page variants (CACHE-PAGINATION-01) | MODERATE | Cache full lists, paginate in application layer |
| JSON serialization | Type assertion panics on cache hit (CACHE-SERIAL-01) | MODERATE | Roundtrip serialization tests for all cached types |
| UI refresh integration | Refresh button cannot bypass cache (CACHE-HEADERS-01) | MODERATE | Cache-bypass header/parameter support |
| Redis configuration | Unbounded memory growth (CACHE-MEMORY-01) | MODERATE | maxmemory + allkeys-lru eviction policy |
| Testing | Order-dependent tests from cache pollution (CACHE-TEST-01) | MINOR | Flush between tests, separate Redis DB |
| Observability | Cannot tell cache hit from miss (CACHE-OBSERVE-01) | MINOR | X-Cache header + structured logging |
| Context handling | Cancelled contexts prevent cache writes (CACHE-CONTEXT-01) | MINOR | Detached context for cache writes |

## Implementation Order Rationale

Based on pitfall severity and dependency ordering:

1. **Graceful degradation** (CACHE-DEGRADATION-01) -- Without this, everything else is risky
2. **Cache key design** (CACHE-KEY-01, CACHE-PAGINATION-01) -- Foundational; changing keys later invalidates all cached data
3. **Service-layer integration** (CACHE-LAYER-01, CACHE-CORRECTNESS-01) -- Where cache logic lives; must be correct
4. **Stampede protection** (CACHE-STAMPEDE-01) -- Prevents the most likely production incident
5. **TTL strategy and invalidation** (CACHE-INVALIDATION-01) -- Prevents correctness issues over time
6. **Serialization testing** (CACHE-SERIAL-01) -- Catches subtle bugs before production
7. **UI refresh and headers** (CACHE-HEADERS-01) -- User-facing feature
8. **Observability** (CACHE-OBSERVE-01) -- Makes everything debuggable
9. **Redis configuration** (CACHE-MEMORY-01) -- Production hardening

## Sources

- [Redis official: 7 Redis Worst Practices](https://redis.io/blog/7-redis-worst-practices/) -- HIGH confidence, official source
- [Redis official: go-redis Production Usage](https://redis.io/docs/latest/develop/clients/go/produsage/) -- HIGH confidence, official docs
- [Redis official: go-redis Error Handling](https://redis.io/docs/latest/develop/clients/go/error-handling/) -- HIGH confidence, official docs
- [Redis official: Connection Pools and Multiplexing](https://redis.io/docs/latest/develop/clients/pools-and-muxing/) -- HIGH confidence, official docs
- [go-redis Debugging: Pool Size and Timeouts](https://redis.uptrace.dev/guide/go-redis-debugging.html) -- HIGH confidence, maintained by go-redis author
- [Singleflight in Go: Cache Stampede Solution](https://medium.com/pickme-engineering-blog/singleflight-in-go-a-clean-solution-to-cache-stampede-02acaf5818e3) -- MEDIUM confidence, community source
- [OneUptime: How to Handle Cache Stampede in Redis](https://oneuptime.com/blog/post/2026-01-21-redis-cache-stampede/view) -- MEDIUM confidence, 2026 community source
- [Redis official: Three Ways to Maintain Cache Consistency](https://redis.io/blog/three-ways-to-maintain-cache-consistency/) -- HIGH confidence, official blog
- [Design Gurus: Negative Caching](https://www.designgurus.io/course-play/grokking-scalable-systems-for-interviews/doc/what-is-negative-caching-and-when-should-you-cache-404-or-empty-results) -- MEDIUM confidence, educational source
- [AWS: Database Caching Strategies Using Redis](https://docs.aws.amazon.com/whitepapers/latest/database-caching-strategies-using-redis/caching-patterns.html) -- HIGH confidence, AWS whitepaper
- Codebase analysis of `/Users/Daniel.Tehan/Code/lineage/lineage-api/` -- HIGH confidence, direct source inspection
