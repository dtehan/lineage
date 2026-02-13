# Requirements: v6.0 Redis Caching Layer

**Defined:** 2026-02-12
**Core Value:** Enable new teams to deploy and operate the lineage application using documentation alone.

## v6.0 Requirements

Requirements for Redis caching integration. Each maps to roadmap phases.

### Cache Infrastructure

- [x] **CACHE-01**: API queries check Redis before querying Teradata (cache-aside pattern)
- [x] **CACHE-02**: Cache miss triggers Teradata query and populates Redis cache
- [x] **CACHE-03**: Cache hit returns data from Redis without Teradata query
- [x] **CACHE-04**: Repository decorators wrap Teradata repositories with caching logic
- [x] **CACHE-05**: Caching is transparent to service and domain layers (no code changes required)

### Cache Keys & TTL

- [ ] **KEY-01**: Cache keys are deterministic from request parameters (datasetId, fieldName, direction, depth)
- [ ] **KEY-02**: Cache keys use format `ol:{entity}:{operation}:{params}` with pipe delimiters
- [ ] **KEY-03**: Lineage query cache entries expire after configurable TTL (default 30 minutes)
- [ ] **KEY-04**: Asset listing cache entries expire after configurable TTL (default 15 minutes)
- [ ] **KEY-05**: TTL values are configurable via environment variables per data type

### Graceful Degradation

- [ ] **DEGRADE-01**: Application starts successfully when Redis is unavailable
- [ ] **DEGRADE-02**: API requests complete successfully when Redis is down (bypass cache, query Teradata)
- [ ] **DEGRADE-03**: Redis connection errors never cause API error responses
- [ ] **DEGRADE-04**: Redis errors are logged with WARNING level but don't propagate to clients
- [ ] **DEGRADE-05**: NoOpCache fallback is used when Redis connection fails

### Cache Control

- [ ] **CONTROL-01**: Users can force cache bypass via `?refresh=true` query parameter
- [ ] **CONTROL-02**: API responses include `X-Cache: HIT` header on cache hits
- [ ] **CONTROL-03**: API responses include `X-Cache: MISS` header on cache misses
- [ ] **CONTROL-04**: API responses include `X-Cache-TTL: N` header showing seconds until expiration
- [ ] **CONTROL-05**: UI refresh button sends `?refresh=true` to force fresh data

### Integration

- [x] **INT-01**: go-redis client upgraded from v9.4.0 to v9.7.0 for connection pool fixes
- [x] **INT-02**: Redis configuration loaded from environment variables (REDIS_ADDR, REDIS_PASSWORD, REDIS_DB)
- [x] **INT-03**: CachedOpenLineageRepository decorator implements domain.OpenLineageRepository interface
- [x] **INT-04**: main.go wires Redis with NoOpCache fallback based on connection availability
- [x] **INT-05**: Cache stores domain entities (OpenLineageGraph, Dataset) serialized as JSON

## Future Requirements (v7.0+)

Deferred to future releases. Tracked but not in current roadmap.

### Cache Management

- **MGMT-01**: Prefix-based cache invalidation via DELETE endpoint
- **MGMT-02**: Cache warming on application startup
- **MGMT-03**: HTTP Cache-Control headers for CDN integration
- **MGMT-04**: Cache hit rate metrics exposed via /metrics endpoint

### Advanced Features

- **ADV-01**: Structured logging for cache operations (hit/miss/error with key and latency)
- **ADV-02**: Redis connection pool configuration via environment variables
- **ADV-03**: Cache stampede protection using singleflight pattern
- **ADV-04**: Separate TTLs for statistics vs DDL data

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Write-through caching | Application is read-only; lineage data updated via populate_lineage.py script |
| Distributed caching | Single-server deployment; Redis cluster not needed |
| Cache partitioning | Data volume doesn't warrant sharding strategy |
| MessagePack serialization | JSON sufficient for 5-50KB payloads replacing 150-500ms queries |
| go-redis/cache library | Adds unnecessary TinyLFU and complexity for single-server use case |
| Cache warming | Marginal benefit for internal tool with organic cache population |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| CACHE-01 | Phase 28 | Complete |
| CACHE-02 | Phase 28 | Complete |
| CACHE-03 | Phase 28 | Complete |
| CACHE-04 | Phase 28 | Complete |
| CACHE-05 | Phase 28 | Complete |
| KEY-01 | Phase 29 | Pending |
| KEY-02 | Phase 29 | Pending |
| KEY-03 | Phase 29 | Pending |
| KEY-04 | Phase 29 | Pending |
| KEY-05 | Phase 29 | Pending |
| DEGRADE-01 | Phase 30 | Pending |
| DEGRADE-02 | Phase 30 | Pending |
| DEGRADE-03 | Phase 30 | Pending |
| DEGRADE-04 | Phase 30 | Pending |
| DEGRADE-05 | Phase 30 | Pending |
| CONTROL-01 | Phase 31 | Pending |
| CONTROL-02 | Phase 31 | Pending |
| CONTROL-03 | Phase 31 | Pending |
| CONTROL-04 | Phase 31 | Pending |
| CONTROL-05 | Phase 31 | Pending |
| INT-01 | Phase 28 | Complete |
| INT-02 | Phase 28 | Complete |
| INT-03 | Phase 28 | Complete |
| INT-04 | Phase 28 | Complete |
| INT-05 | Phase 28 | Complete |

**Coverage:**
- v6.0 requirements: 25 total
- Mapped to phases: 25
- Unmapped: 0

---
*Requirements defined: 2026-02-12*
*Last updated: 2026-02-12 after Phase 28 completion*
