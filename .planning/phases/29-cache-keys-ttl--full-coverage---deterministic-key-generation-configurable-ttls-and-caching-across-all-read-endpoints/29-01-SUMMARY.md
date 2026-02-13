---
phase: 29-cache-keys-ttl-full-coverage
plan: 01
subsystem: api
tags: [redis, cache-keys, ttl, viper, config]

# Dependency graph
requires:
  - phase: 28-redis-connection-cache-decorator-foundation
    provides: "CachedOpenLineageRepository decorator, go-redis v9.7.3, MockCacheRepository"
provides:
  - "9 centralized cache key builder functions (LineageGraphKey, DatasetKey, NamespacesKey, NamespaceKey, DatasetsKey, DatasetSearchKey, FieldsKey, DatasetStatisticsKey, DatasetDDLKey)"
  - "CacheTTLConfig struct with per-type TTL values loaded from 5 env vars"
  - "16 cache key tests covering determinism, differentiation, format, normalization"
affects:
  - 29-02 (wires key builders and CacheTTLConfig into CachedOpenLineageRepository)
  - 30 (graceful degradation may reference TTL config)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Centralized cache key builders as pure functions in cache_keys.go"
    - "ol:{entity}:{operation}:{params} key format with pipe delimiters for composite params"
    - "Per-data-type TTL configuration via CACHE_TTL_* env vars"

key-files:
  created:
    - lineage-api/internal/adapter/outbound/redis/cache_keys.go
    - lineage-api/internal/adapter/outbound/redis/cache_keys_test.go
  modified:
    - lineage-api/internal/infrastructure/config/config.go
    - .env.example

key-decisions:
  - "CacheTTLConfig in config package (not redis) -- follows existing ValidationConfig pattern, avoids coupling TTL config to adapter layer"
  - "DatasetSearchKey normalizes to uppercase + trims whitespace -- matches Teradata case-insensitive LIKE behavior"
  - "Pipe delimiter for composite params -- colons separate structure, pipes separate values; Teradata IDs never contain pipes"
  - "No TTL validation -- zero/negative values are intentional operator overrides (disable or immediate expiry)"

patterns-established:
  - "Key format: ol:{entity}:{operation}:{params} with pipe-delimited composite params"
  - "Key builder functions are pure (no side effects, no dependencies) and independently testable"

# Metrics
duration: 2min
completed: 2026-02-12
---

# Phase 29 Plan 01: Cache Keys & TTL Config Summary

**9 deterministic cache key builders with ol:{entity}:{operation}:{params} format, plus CacheTTLConfig with 5 per-type TTL env vars (lineage=30m, assets=15m, search=5m)**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-13T01:54:49Z
- **Completed:** 2026-02-13T01:57:19Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- 9 pure cache key builder functions covering all cacheable v2 endpoints
- 16 tests verifying determinism, differentiation, format compliance, case normalization, and pipe delimiters
- CacheTTLConfig struct with 5 independently configurable TTL values loaded from environment variables
- .env.example documents all CACHE_TTL_* variables with defaults and descriptions

## Task Commits

Each task was committed atomically:

1. **Task 1: Create cache key builder functions and tests (TDD)** - `daf9fcf` (feat)
2. **Task 2: Add CacheTTLConfig to config and update .env.example** - `f9e8af9` (feat)

## Files Created/Modified
- `lineage-api/internal/adapter/outbound/redis/cache_keys.go` - 9 key builder functions for all cacheable operations
- `lineage-api/internal/adapter/outbound/redis/cache_keys_test.go` - 16 tests (determinism, differentiation, format, normalization, delimiters)
- `lineage-api/internal/infrastructure/config/config.go` - CacheTTLConfig struct + Viper defaults + Config.CacheTTL field
- `.env.example` - Cache TTL section with 5 CACHE_TTL_* variables

## Decisions Made
- **CacheTTLConfig in config package:** Follows existing `ValidationConfig` pattern. The redis package will receive TTL values via constructor params (Plan 29-02), keeping the adapter layer decoupled from config loading.
- **Search normalization (uppercase + trim):** DatasetSearchKey normalizes queries to match Teradata's case-insensitive LIKE behavior, doubling cache hit rate for search.
- **Pipe delimiter for composite params:** Colons separate structural segments (entity, operation); pipes separate parameter values. Teradata identifiers never contain pipes, so no collision risk.
- **No TTL validation:** Zero or negative TTL values are intentional operator overrides (disable caching or immediate expiry). Documented in .env.example via defaults.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 9 key builder functions ready for Plan 29-02 to wire into CachedOpenLineageRepository
- CacheTTLConfig ready for Plan 29-02 to replace single `ttl int` parameter in decorator constructor
- Existing 14 decorator tests still pass; Plan 29-02 will update them to use CacheTTLConfig

---
*Phase: 29-cache-keys-ttl-full-coverage*
*Completed: 2026-02-12*
