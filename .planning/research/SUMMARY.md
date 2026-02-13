# Project Research Summary

**Project:** Redis Response Caching for Teradata Lineage API (v6.0)
**Domain:** REST API Performance Optimization / Data Caching
**Researched:** 2026-02-12
**Confidence:** HIGH

## Executive Summary

This research covers adding Redis response caching to an existing Teradata column-level data lineage API with excellent architectural foundations. The codebase already has `CacheRepository` interface, Redis adapter implementation, `NoOpCache` fallback, and configuration loading—all the infrastructure is in place but never wired into the application. The work required is not building caching infrastructure from scratch, but integrating existing components using the repository decorator pattern and hardening the Redis connection configuration.

The recommended approach is the **repository decorator pattern** placed in the outbound adapter layer (`internal/adapter/outbound/cached/`). Decorators wrap existing Teradata repositories with cache-aside logic, remain invisible to the service layer, and implement the same domain interfaces. This keeps caching concerns out of the domain and application layers while providing transparent, testable, composable caching. The existing go-redis v9.4.0 dependency should be upgraded to v9.7.0 (critical connection pool fixes) but no new libraries are needed—standard library JSON serialization is sufficient for this use case.

The key risk is breaking backward compatibility while hardening the API. The lineage API currently lacks server-side validation, has verbose error messages that leak database details, and includes default credentials in fallback code. Adding validation and security hardening could break existing clients if not done carefully. Mitigation: validate existing client usage patterns first, add validation with clear error messages, use API versioning for breaking changes, and provide migration documentation.

## Key Findings

### Recommended Stack

The existing infrastructure is excellent and requires only minor upgrades. The `CacheRepository` interface and Redis adapter are already implemented with proper graceful degradation patterns. The missing piece is integration into the service data path.

**Core technologies:**
- **redis/go-redis v9.7.0**: Redis client (upgrade from v9.4.0) — includes critical connection pool fixes (zombie cleanup, CVE-2025-29923) while staying in the stable v9.7.x line
- **encoding/json**: Serialization (stdlib) — already used throughout codebase, sufficient for 5-50KB lineage payloads that replace 150-500ms Teradata queries
- **Repository decorator pattern**: Architecture approach — transparent to service layer, testable with existing mocks, follows hexagonal architecture principles

**Explicitly rejected:**
- go-redis/cache library (TinyLFU + MessagePack) — unnecessary complexity for single-server deployment
- MessagePack serialization — marginal performance gain (~1ms) doesn't justify new dependency
- Service-layer caching — would bloat thin service methods with 10-15 lines of boilerplate per method
- HTTP middleware caching — loses type safety and fine-grained control

### Expected Features

**Must have (table stakes):**
- **Cache-aside pattern (TS-1)** — check Redis before Teradata, populate on miss, transparent to users
- **Deterministic cache keys (TS-2)** — consistent keys from request parameters using format `ol:{entity}:{operation}:{params}`
- **TTL-based expiration (TS-3)** — automatic staleness handling (lineage: 30min, statistics: 5min, datasets: 15min)
- **Graceful degradation (TS-4)** — NoOpCache fallback when Redis unavailable, already implemented
- **Cache error isolation (TS-5)** — Redis errors never propagate to API response, always fall through to database

**Should have (differentiators):**
- **Cache bypass header (DIFF-1)** — `Cache-Control: no-cache` or `?refresh=true` to force fresh data
- **Cache status headers (DIFF-2)** — `X-Cache: HIT/MISS`, `X-Cache-TTL: N` for observability
- **Structured logging (DIFF-5)** — cache hit/miss/error with key, latency, status using existing slog
- **Connection pool config (DIFF-6)** — expose go-redis timeout/pool settings via env vars

**Defer (v2+):**
- **Prefix-based invalidation (DIFF-3)** — only needed if manual refresh/re-scan endpoint is built
- **Cache warming (DIFF-4)** — marginal benefit for single-user internal tool
- **HTTP Cache-Control headers (DIFF-7)** — frontend already manages caching via TanStack Query staleTime

### Architecture Approach

The codebase follows hexagonal/clean architecture with thin service layers that delegate directly to repositories. Services are 1-10 line pass-throughs with DTO transformation. Caching does not belong in the service layer—it would bloat simple delegation with cache key generation, hit/miss branching, and error handling. The repository decorator pattern places caching in the outbound adapter layer where it belongs.

**Major components:**
1. **Cached repository decorators** (`adapter/outbound/cached/`) — wrap Teradata repositories with cache-aside logic, implement same domain interfaces
2. **Cache key generation** (`cached/keys.go`) — deterministic key builders using `ol:{entity}:{operation}:{params}` format
3. **TTL configuration** (`config.go`) — per-data-type TTL values loaded from env vars with sensible defaults
4. **Dependency wiring** (`main.go`) — Redis initialization with NoOpCache fallback, decorator construction, zero service/handler changes

**Cache stores domain entities, not DTOs** — repositories return `domain.OpenLineageGraph`, `domain.Dataset`. Caching DTOs couples the cache to presentation layer. Domain entities already have json tags and are reusable across services.

**Data flow on cache hit:** Handler → Service → CachedRepository (cache hit, skip database) → Service DTO transform → Handler JSON response

**Data flow on cache miss:** Handler → Service → CachedRepository (cache miss) → Teradata Repository → CachedRepository (populate cache) → Service DTO transform → Handler JSON response

### Critical Pitfalls

1. **Client-side only validation (VALID-01)** — Server-side validation is missing. Frontend validates `maxDepth`, `direction` but backend does not. Attackers can bypass with curl to submit `maxDepth=1000000` causing resource exhaustion. Prevention: Add validation at handler level using allowlists for enums, strict bounds for numerics, return 400 with specific error messages. Test with curl using invalid parameters.

2. **Verbose error messages leaking database details (SEC-01)** — Current code pattern `return jsonify({"error": str(e)}), 500` exposes SQL statements, table names, connection details to attackers. Prevention: Whitelist safe error messages, map all database errors to generic "internal error", log full details server-side with correlation IDs. Never return: SQL, table/column names, file paths, stack traces.

3. **Default/hardcoded credentials (SEC-02)** — Fallback credentials like `"demo_user"` remain in code. If env vars aren't set, app connects with defaults. Prevention: Remove ALL fallbacks, fail fast with clear error if credentials missing, validate configuration at startup before accepting requests.

4. **Offset pagination performance degradation (PAGE-01)** — OFFSET/LIMIT with large offsets causes database to scan and discard millions of rows. Performance degrades linearly. Prevention: Set maximum page number cap (e.g., max page 100), document pagination limitations, consider cursor pagination for deep paging needs.

5. **Breaking backward compatibility silently (COMPAT-01)** — Adding validation can reject previously-accepted input, breaking existing clients. Prevention: Review existing client usage before adding restrictions, document ALL changes in changelog with migration guidance, consider API versioning for breaking changes, run backward compatibility tests.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Cache Infrastructure & Decorator Foundation
**Rationale:** Establishes caching capability with minimal risk. Core decorator pattern and cache keys are pure infrastructure—no client-facing changes. This phase delivers immediate performance gains for the highest-value endpoint (lineage graphs) while building foundation for later endpoints.

**Delivers:**
- Upgrade go-redis to v9.7.0 with hardened connection config
- Cache key generation module with tests
- TTL configuration structure
- CachedOpenLineageRepository decorator for lineage graph endpoint only
- Redis initialization with NoOpCache fallback wired into main.go

**Addresses:**
- TS-1: Cache-aside pattern
- TS-2: Deterministic cache keys
- TS-3: TTL-based expiration
- TS-4: Graceful degradation (already implemented, now wired)
- TS-5: Cache error isolation

**Avoids:**
- No client-facing changes yet
- No breaking changes to existing API
- Clear fallback if Redis unavailable

**Success criteria:** Lineage graph queries hit Redis on repeat requests, fallback to Teradata on miss, application runs normally without Redis

---

### Phase 2: Expand Caching Coverage
**Rationale:** Once decorator pattern is proven for lineage graphs, extend to other high-value endpoints. Dataset listings and field lists are frequently accessed during asset browsing. This phase maximizes cache hit rate across user workflows.

**Delivers:**
- Cache remaining OpenLineageRepository methods: GetDataset, ListDatasets, ListFields, ListNamespaces, GetNamespace
- Cache AssetRepository methods if v1 API still in use
- Method-specific TTL configuration (datasets: 15min, fields: 30min, namespaces: 1hr)

**Uses:**
- Existing cache key patterns from Phase 1
- Same decorator structure, extended to more methods
- Proven testing pattern with mocks

**Implements:**
- Full CachedOpenLineageRepository covering all major read operations
- CachedAssetRepository for v1 compatibility

**Success criteria:** All major read endpoints benefit from caching, cache hit rate >60% for repeated queries

---

### Phase 3: Observability & Cache Control
**Rationale:** With caching deployed, operators need visibility into cache effectiveness and users need force-refresh capability. This phase adds production operational features without changing core functionality.

**Delivers:**
- Cache status response headers: `X-Cache: HIT/MISS`, `X-Cache-TTL: N`
- Cache bypass support: `?refresh=true` query parameter and `Cache-Control: no-cache` header
- Structured logging for cache operations (hit/miss/error with key, latency)
- Connection pool configuration via environment variables

**Addresses:**
- DIFF-1: Cache bypass via request header
- DIFF-2: Cache status response headers
- DIFF-5: Structured cache logging
- DIFF-6: Connection pool configuration

**Implements:**
- Context-based cache control (force-refresh signal via context.Value)
- HTTP handler checks for bypass parameters
- Logging with slog at DEBUG (hit/miss), WARN (errors)

**Success criteria:** Operators can see cache hit rate in logs, users can force-refresh stale data, cache configuration tunable via env vars

---

### Phase 4: API Hardening & Security (Non-Breaking)
**Rationale:** Now that caching is stable, address production readiness concerns. This phase adds validation and security without breaking existing clients by using permissive validation initially and gathering usage data.

**Delivers:**
- Server-side validation for maxDepth (1-10), direction (upstream/downstream/both)
- Error message sanitization (no SQL, table names, or stack traces in responses)
- Remove default credentials, fail fast if config missing
- Structured error responses with correlation IDs

**Addresses:**
- Pitfall VALID-01: Client-side only validation
- Pitfall SEC-01: Verbose error messages
- Pitfall SEC-02: Default credentials

**Avoids:**
- Breaking changes by starting with warnings, not rejections
- Gather telemetry on current parameter usage first
- Phased rollout: log violations before enforcing

**Success criteria:** Invalid inputs return 400 with clear messages, errors don't leak internals, app fails to start without credentials

---

### Phase 5: Pagination Hardening
**Rationale:** Pagination issues only appear at scale. This phase addresses performance and UX concerns for large datasets while documenting pagination limits clearly.

**Delivers:**
- Pagination metadata in all responses: totalCount, page, pageSize, totalPages
- Maximum page/offset caps to prevent performance degradation
- Consistent ORDER BY clauses for stable pagination
- Documentation of pagination limitations

**Addresses:**
- Pitfall PAGE-01: Offset pagination performance degradation
- Pitfall PAGE-02: Missing total count in pagination

**Success criteria:** All paginated endpoints include metadata, high page numbers perform consistently, clients can show "Page X of Y"

---

### Phase 6: Backward Compatibility Validation
**Rationale:** Final phase before declaring v6.0 production-ready. Explicit validation that hardening changes haven't broken existing clients.

**Delivers:**
- Backward compatibility test suite using captured v5.0 requests
- API changelog documenting all validation/security changes
- Migration guide for any breaking changes
- Validation that defaults match previous defaults

**Addresses:**
- Pitfall COMPAT-01: Breaking backward compatibility silently

**Success criteria:** All v5.0 client requests work in v6.0 (or return clear migration errors), changelog complete with examples

---

### Phase Ordering Rationale

- **Cache first (Phases 1-3)** because caching infrastructure is independent and delivers immediate value without client-facing changes. This reduces Teradata load early and builds confidence in the decorator pattern.

- **Hardening after caching (Phases 4-5)** because validation and security changes are potentially breaking. By deploying caching first, we establish baseline performance and can monitor impact of validation independently.

- **Compatibility validation last (Phase 6)** as the gate before v6.0 release. This phase validates all previous changes haven't broken existing clients.

- **Grouped by risk level**: Low risk (cache infrastructure) → Medium risk (validation/security) → High risk (breaking changes). Each phase builds confidence for the next.

### Research Flags

Phases with standard patterns (skip detailed research):
- **Phase 1-3:** Cache-aside pattern is well-documented, go-redis has excellent docs, repository decorator pattern is standard Go practice
- **Phase 4-5:** Input validation and pagination are standard web API concerns with established patterns
- **Phase 6:** Backward compatibility testing follows standard regression testing practices

**No phases require `/gsd:research-phase`** — this domain (REST API caching, validation, pagination) has well-established patterns and the codebase already has excellent foundations. Implementation can proceed directly from feature definitions to technical plans.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | go-redis v9.7.0 verified from GitHub releases, existing CacheRepository interface analyzed from codebase, JSON serialization justified by payload size analysis |
| Features | HIGH | Cache-aside pattern is canonical, feature requirements aligned with OpenLineage API access patterns, table stakes vs differentiators clear from use case analysis |
| Architecture | HIGH | Repository decorator pattern is standard in hexagonal architecture, codebase already follows clean separation, existing mocks support testing approach |
| Pitfalls | HIGH | Validation/security pitfalls from OWASP cheat sheets and API security best practices, pagination issues are well-documented performance traps, compatibility concerns from Google AIP-180 |

**Overall confidence:** HIGH

All four research areas have high confidence because:
- Stack decisions verified against official sources (GitHub releases, Redis docs)
- Architecture approach matches existing codebase patterns
- Features derived from analysis of existing API access patterns
- Pitfalls drawn from established security/API best practices

### Gaps to Address

**TTL values need validation against actual usage:** The recommended TTL values (lineage: 30min, statistics: 5min, datasets: 15min) are opinionated estimates based on typical data lineage tool usage. These should be monitored and tuned based on actual cache hit rates and staleness complaints after deployment. Make TTLs configurable via environment variables from day one.

**Current client usage patterns unknown:** Before adding validation in Phase 4, capture telemetry on current `maxDepth` and `direction` parameter usage. If existing clients send `maxDepth=15`, enforcing `maxDepth<=10` will break them. Solution: Log violations for 1-2 weeks before enforcing, or start with generous limits and tighten based on data.

**DBQL access variability:** The existing Pitfalls research (DBQL-01) identifies that DBQL access varies by Teradata environment and ClearScape Analytics has limitations. While not directly related to caching, any hardening work should include explicit DBQL access checks with clear error messages. This is noted in Phase 4 but may need its own sub-task.

**MockCacheRepository enhancement needed:** The existing `MockCacheRepository.Get()` (lines 417-436 in mocks/repositories.go) does not actually deserialize data into `dest`—it just returns nil if key exists. For thorough decorator testing, the mock needs enhancement to store and return JSON-serialized data. This is a minor enhancement required during Phase 1 testing.

## Sources

### Primary (HIGH confidence)
- Existing codebase: `internal/domain/repository.go` — CacheRepository interface definition
- Existing codebase: `internal/adapter/outbound/redis/cache.go` — Redis + NoOpCache implementation
- Existing codebase: `internal/application/openlineage_service.go` — Service layer pattern analysis
- Existing codebase: `cmd/server/main.go` — Current dependency wiring
- [redis/go-redis GitHub releases](https://github.com/redis/go-redis/releases) — v9.7.0 release notes, CVE details
- [Redis official go-redis guide](https://redis.io/docs/latest/develop/clients/go/) — Connection pool configuration
- [go-redis debugging guide (Uptrace)](https://redis.uptrace.dev/guide/go-redis-debugging.html) — Timeout recommendations
- [OWASP Input Validation Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html) — Validation best practices
- [Google AIP-180: Backwards Compatibility](https://google.aip.dev/180) — Backward compatibility principles

### Secondary (MEDIUM confidence)
- [Cache-Aside using Decorator Design Pattern in Go](http://stdout.alesr.me/posts/cache-aside-using-decorator-design-pattern-in-go/) — Decorator pattern reference
- [Redis Query Caching Tutorial](https://redis.io/tutorials/howtos/solutions/microservices/caching/) — Cache-aside pattern
- [REST API Pagination Best Practices - Moesif](https://www.moesif.com/blog/technical/api-design/REST-API-Design-Filtering-Sorting-and-Pagination/) — Pagination patterns
- [API Security Best Practices 2025 - Pynt](https://www.pynt.io/learning-hub/api-security-guide/api-security-best-practices) — Security hardening
- [Go Project Structure: Clean Architecture Patterns](https://dasroot.net/posts/2026/01/go-project-structure-clean-architecture/) — Hexagonal architecture
- [API Backwards Compatibility Best Practices - Zuplo](https://zuplo.com/blog/2025/04/11/api-versioning-backward-compatibility-best-practices) — Compatibility strategies

---
*Research completed: 2026-02-12*
*Ready for roadmap: yes*
