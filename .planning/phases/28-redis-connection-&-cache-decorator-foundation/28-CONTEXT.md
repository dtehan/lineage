# Phase 28: Redis Connection & Cache Decorator Foundation - Context

**Gathered:** 2026-02-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire Redis into the application with cache-aside decorator for lineage graph queries. The application uses the repository decorator pattern to transparently cache OpenLineageGraph and Dataset entities as JSON. When Redis is unavailable at startup, the application fails fast with a clear error. The codebase already has CacheRepository interface, Redis adapter, and NoOpCache fallback -- this phase wires Redis into main.go and implements CachedOpenLineageRepository for the lineage graph endpoint only.

NOT in this phase:
- Graceful degradation (Phase 30 will refactor fail-fast to graceful fallback)
- Cache key standardization across all endpoints (Phase 29)
- Full endpoint coverage (Phase 29)
- Cache observability headers (Phase 31)
- UI controls (Phase 31)

</domain>

<decisions>
## Implementation Decisions

### Connection initialization & health

- **Startup behavior:** Fail fast if Redis is unavailable (application exits with error)
  - Phase 30 will refactor this to graceful degradation with NoOpCache fallback
  - Phase 28 focuses on getting caching working correctly first
- **Health check approach:** Claude's Discretion
- **Connection pool settings:** Use go-redis v9.7.0 defaults (no custom configuration)

### Cache key format

- **Depth parameter:** NOT included in cache key
  - Cache stores the complete lineage graph for a column
  - Depth filtering is applied when reading from cache (truncate on read)
  - This simplifies keys and improves cache hit rate
- **Key structure format:** Claude's Discretion (consider Phase 29 migration path to `ol:{entity}:{operation}:{params}`)
- **Direction parameter:** Claude's Discretion (separate keys for upstream/downstream vs bidirectional)
- **Parameter encoding:** Claude's Discretion (URL encoding, Base64, or hashing)

### Error handling & logging

- **Error type distinction:** Yes - retry transient errors, fail fast on permanent errors
  - Transient errors (timeout, connection lost) → retry operation
  - Permanent errors (auth failure, wrong credentials) → fail immediately
- **Cache GET failure handling:** Claude's Discretion (log level and fallback behavior)
- **Cache SET failure handling:** Claude's Discretion (retry strategy and logging)
- **Log detail level:** Claude's Discretion (what to include in error messages)

### Serialization edge cases

- **Empty lineage graphs:** Claude's Discretion (cache vs skip vs short TTL)
- **Large graph size limits:** Claude's Discretion (unlimited vs soft warning vs hard limit)
- **Null/missing fields:** Claude's Discretion (omitempty vs explicit nulls vs zero values)
- **Deserialization failures:** Claude's Discretion (treat as cache miss vs surface error vs invalidate)

### Claude's Discretion

Claude has flexibility in the following areas:
- Exact health check implementation at startup
- Cache key structure format (considering Phase 29 migration)
- Whether to cache both directions or separate keys for upstream/downstream
- Parameter encoding strategy for cache keys
- Logging levels for cache operation failures
- Cache SET retry strategy
- Log message detail level
- Empty graph caching strategy
- Size limits on cached values
- JSON serialization of null/missing fields
- Deserialization error recovery approach

</decisions>

<specifics>
## Specific Ideas

No specific requirements -- implementation follows Go and Redis best practices with consideration for Phase 29/30 migration path.

</specifics>

<deferred>
## Deferred Ideas

None -- discussion stayed within phase scope.

</deferred>

---

*Phase: 28-redis-connection-&-cache-decorator-foundation*
*Context gathered: 2026-02-12*
