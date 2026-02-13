# Phase 30: Graceful Degradation - Research

**Researched:** 2026-02-12
**Domain:** Go application resilience / cache fallback pattern
**Confidence:** HIGH

## Summary

Phase 30 is a narrowly scoped change to `main.go` that replaces the current fail-fast Redis connection behavior (`log.Fatalf`) with a graceful fallback to `NoOpCache`. The application must start and serve all requests correctly regardless of Redis availability.

The codebase is already 90% ready for this change. Phase 28 established the `domain.CacheRepository` interface, `NoOpCache` implementation, and the `CachedOpenLineageRepository` decorator that swallows all cache errors. Phase 29 completed full endpoint coverage. The remaining work is:
1. Change `main.go` to catch the Redis connection error, log a warning, and use `NoOpCache` instead of calling `log.Fatalf`
2. Handle the `Close()` method mismatch (NoOpCache lacks it; main.go calls `defer cacheRepo.Close()`)
3. Add tests proving the fallback works correctly

**Primary recommendation:** Replace 6 lines in `main.go` (the Redis connection block) with a try-connect-or-fallback pattern, and add a `Close()` no-op to `NoOpCache` or use an `io.Closer`-compatible wrapper. Add unit tests for the NoOpCache-through-CachedOpenLineageRepository path.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| go-redis/v9 | v9.7.3 | Redis client | Already in use; no new dependencies needed |
| log/slog | stdlib | Structured logging | Already in use; WARNING level for degraded mode |

### Supporting
No new libraries required. This phase uses only existing stdlib and project code.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Simple try/fallback in main.go | Circuit breaker pattern (e.g., sony/gobreaker) | Overkill -- app either connects at startup or doesn't; no runtime toggling needed for v6.0 |
| NoOpCache fallback | Retry loop with backoff | Adds complexity; user can restart the app when Redis becomes available |

**Installation:**
```bash
# No new dependencies required
```

## Architecture Patterns

### Recommended Change Structure
```
lineage-api/
├── cmd/server/main.go                              # MODIFY: try-connect-or-fallback
├── internal/adapter/outbound/redis/
│   └── cache.go                                     # MODIFY: add Close() to NoOpCache
└── internal/adapter/outbound/redis/
    └── cache_test.go                                # MODIFY: add NoOpCache Close() test
```

### Pattern 1: Try-Connect-or-Fallback
**What:** Attempt Redis connection at startup. On failure, log a warning and substitute NoOpCache.
**When to use:** When the cache is optional infrastructure (not critical path).
**Implementation approach:**

The current code in `main.go` (lines 46-51):
```go
// Redis cache -- fail fast if unavailable (Phase 30 adds graceful degradation)
cacheRepo, err := redisAdapter.NewCacheRepository(cfg.Redis)
if err != nil {
    log.Fatalf("Failed to connect to Redis: %v", err)
}
defer cacheRepo.Close()
```

Must become a pattern where:
1. Attempt `NewCacheRepository(cfg.Redis)`
2. On error: log WARNING, create `NewNoOpCache()` instead
3. The variable holding the cache must satisfy both `domain.CacheRepository` AND be closeable
4. `defer` must work safely for both implementations

### Pattern 2: Interface-Based Close
**What:** The `domain.CacheRepository` interface does NOT include `Close()`. Currently `main.go` calls `cacheRepo.Close()` because the variable is typed as `*redis.CacheRepository` (concrete type). When the fallback path uses `NoOpCache`, we need `Close()` to work on both types.

**Two viable approaches:**

**Option A (Recommended): Add Close() to NoOpCache**
Add a no-op `Close() error` method to `NoOpCache`. This is the simplest change. The `main.go` code can use a local `io.Closer` or a concrete type assertion, but the cleanest approach is:
- Use `domain.CacheRepository` as the variable type for the cache
- Add a separate `closer` variable (or a combined interface) for cleanup

**Option B: Use io.Closer interface**
Define a local interface in `main.go` or add `Close()` to `domain.CacheRepository`. However, adding `Close()` to the domain interface pollutes it with infrastructure concerns.

**Recommended approach:** Add `Close() error` to `NoOpCache` (returns nil). Then in `main.go`, use `domain.CacheRepository` for the cache variable and handle `Close()` through a type switch or a wrapper. The simplest pattern:

```go
var cache domain.CacheRepository
var cacheCloser io.Closer

redisCacheRepo, err := redisAdapter.NewCacheRepository(cfg.Redis)
if err != nil {
    slog.Warn("Redis unavailable, running without cache", "error", err)
    cache = redisAdapter.NewNoOpCache()
} else {
    cache = redisCacheRepo
    cacheCloser = redisCacheRepo
}
if cacheCloser != nil {
    defer cacheCloser.Close()
}
```

Or even simpler -- just add `Close()` to `NoOpCache` and use a combined interface:

```go
type cacheWithCloser interface {
    domain.CacheRepository
    Close() error
}
```

### Anti-Patterns to Avoid
- **Adding Close() to domain.CacheRepository:** This pollutes the domain interface with infrastructure lifecycle concerns. The domain should only define cache operations (Get/Set/Delete/Exists).
- **Retry loop at startup:** Adds latency and complexity. The app should start immediately and degrade gracefully.
- **Runtime Redis reconnection:** Out of scope for v6.0. The app connects once at startup; restart to pick up Redis.
- **Conditional nil checks on cache throughout handlers:** The NoOpCache pattern already handles this via the decorator. No handler changes needed.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cache fallback behavior | Custom nil-check logic in every handler | Existing NoOpCache + CachedOpenLineageRepository | NoOpCache always returns cache miss; decorator falls through to inner repo. Already tested in Phase 28 |
| Structured warning logs | Custom log format | Existing slog.Warn | Already configured in logging package |

**Key insight:** The entire graceful degradation behavior is already implemented by the combination of `NoOpCache` + `CachedOpenLineageRepository`. The only change is in startup wiring (`main.go`). No business logic changes needed.

## Common Pitfalls

### Pitfall 1: Forgetting to handle Close() on NoOpCache
**What goes wrong:** `main.go` calls `defer cacheRepo.Close()`. If `cacheRepo` is typed as `domain.CacheRepository` (which NoOpCache satisfies), the compiler will complain because `Close()` is not in the interface.
**Why it happens:** The current code uses the concrete `*CacheRepository` type, which has `Close()`. Switching to the interface type for fallback breaks this.
**How to avoid:** Either add `Close()` to `NoOpCache`, use a separate closer variable, or use a combined interface.
**Warning signs:** Compilation error "domain.CacheRepository has no method Close".

### Pitfall 2: Logging at wrong level
**What goes wrong:** Using `slog.Error` or `log.Printf` instead of `slog.Warn` for Redis unavailability. Error-level logs trigger alerts in production monitoring.
**Why it happens:** Connection failures feel like errors. But when Redis is optional, this is expected degraded operation, not an error.
**How to avoid:** Use `slog.Warn` (WARNING level) per requirement DEGRADE-04.
**Warning signs:** Production alert storms when Redis is intentionally down for maintenance.

### Pitfall 3: Not logging which mode the app is in
**What goes wrong:** App starts silently without indicating whether it's using Redis or NoOp cache. Operators can't tell if the cache is working.
**Why it happens:** Only logging on error path, not on success path.
**How to avoid:** Log at startup: "Redis cache connected" (INFO) or "Redis unavailable, cache disabled" (WARN).
**Warning signs:** Support tickets asking "is caching working?" with no way to tell from logs.

### Pitfall 4: Breaking the defer chain
**What goes wrong:** When Redis connects, `defer cacheRepo.Close()` must still run. If the code restructuring moves the defer or makes it conditional incorrectly, the Redis connection leaks.
**Why it happens:** Refactoring the if/else block and forgetting about defer ordering.
**How to avoid:** Put `defer` immediately after successful Redis connection, inside the success branch. Or use the cacheCloser pattern shown above.
**Warning signs:** Resource leak warnings in production; Redis client connections growing over restarts.

## Code Examples

### Example 1: main.go Redis fallback (recommended pattern)

```go
// Redis cache -- graceful degradation when unavailable
var cache domain.CacheRepository
redisRepo, err := redisAdapter.NewCacheRepository(cfg.Redis)
if err != nil {
    slog.Warn("Redis unavailable, running without cache", "error", err)
    cache = redisAdapter.NewNoOpCache()
} else {
    slog.Info("Redis cache connected", "addr", cfg.Redis.Addr)
    cache = redisRepo
    defer redisRepo.Close()
}
```

Note: `defer redisRepo.Close()` is inside the else block, so it only runs when Redis actually connected. The `cache` variable is `domain.CacheRepository` which both types satisfy.

### Example 2: NoOpCache with Close() method

```go
// Close is a no-op for NoOpCache (satisfies io.Closer for uniform cleanup).
func (c *NoOpCache) Close() error {
    return nil
}
```

### Example 3: Test for graceful degradation path

```go
func TestCachedRepoWithNoOpCache_AllMethodsWork(t *testing.T) {
    mockInner := mocks.NewMockOpenLineageRepository()
    noopCache := redis.NewNoOpCache()
    ttls := redis.CacheTTLConfig{LineageTTL: 300, AssetTTL: 300, StatisticsTTL: 300, DDLTTL: 300, SearchTTL: 300}

    repo := redis.NewCachedOpenLineageRepository(mockInner, noopCache, ttls)

    // Seed inner repo with data
    mockInner.Namespaces = []domain.OpenLineageNamespace{{ID: "1", URI: "teradata://host:1025"}}

    // Every call should succeed (NoOp cache always misses, inner repo returns data)
    result, err := repo.ListNamespaces(context.Background())
    require.NoError(t, err)
    assert.Len(t, result, 1)
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Fail-fast on Redis unavailability (Phase 28 decision) | Graceful fallback to NoOpCache (Phase 30) | Phase 30 | App starts without Redis; cache is optional |

**Deprecated/outdated:**
- The `log.Fatalf` on Redis connection failure (line 49 of main.go) is the item being replaced.

## Codebase Analysis: What Exists vs What Must Change

### Already Implemented (no changes needed)
| Component | File | Status |
|-----------|------|--------|
| `NoOpCache` struct + Get/Set/Delete/Exists | `cache.go:90-119` | Complete |
| `NewNoOpCache()` constructor returning `domain.CacheRepository` | `cache.go:94-96` | Complete |
| `CachedOpenLineageRepository` swallows all cache errors | `cached_openlineage_repo.go` | Complete (all 9 methods) |
| `domain.CacheRepository` interface | `repository.go:31-36` | Complete |
| NoOpCache tests (Get/Set/Delete/Exists/Interface) | `cache_test.go:11-58` | Complete |
| CachedRepo tests for cache error swallowing | `cached_openlineage_repo_test.go:161-196` | Complete |

### Must Change
| Component | File | Change |
|-----------|------|--------|
| Redis startup in main.go | `cmd/server/main.go:46-51` | Replace `log.Fatalf` with try/fallback |
| NoOpCache Close() method | `cache.go` | Add `Close() error` returning nil |
| NoOpCache Close() test | `cache_test.go` | Add test for Close() |
| Integration test: NoOp through CachedRepo | `cached_openlineage_repo_test.go` | Add test using real NoOpCache (not mock) |

### Change Size Estimate
- **main.go**: ~10 lines changed (replace 6-line block with 8-10 line try/fallback)
- **cache.go**: ~4 lines added (Close method)
- **cache_test.go**: ~5 lines added (Close test)
- **cached_openlineage_repo_test.go**: ~15-20 lines added (NoOp integration test)
- **Total**: ~35-40 lines of code changes

## Open Questions

1. **Should the health endpoint reflect cache status?**
   - What we know: Current health endpoint returns `{"status": "ok"}` unconditionally (handlers.go:32-33). It does not check Redis.
   - What's unclear: Should it report `{"status": "ok", "cache": "disabled"}` vs `{"cache": "connected"}`?
   - Recommendation: Out of scope for Phase 30. The requirements only say "app starts and serves requests." Health endpoint enhancement could be a follow-up. Keep it simple.

2. **Should there be a `REDIS_OPTIONAL` config flag?**
   - What we know: Phase 30 makes Redis always optional (fallback to NoOp on failure).
   - What's unclear: Should operators be able to require Redis (fail-fast) in production?
   - Recommendation: Out of scope. The phase goal is "never fail because of Redis." If a future phase wants strict mode, add it then.

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `main.go`, `cache.go`, `cached_openlineage_repo.go`, `repository.go` -- direct code inspection
- Existing test suite: `cache_test.go`, `cached_openlineage_repo_test.go` -- verified all pass
- STATE.md decisions: [28-01] fail-fast, [28-02] cache errors swallowed

### Secondary (MEDIUM confidence)
- Go stdlib `log/slog` documentation -- WARNING level semantics verified from training data + stdlib source

### Tertiary (LOW confidence)
- None. All findings are from direct codebase analysis.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new libraries; all existing code verified by reading source
- Architecture: HIGH - pattern is trivial; single file change in main.go wiring
- Pitfalls: HIGH - identified from direct code inspection of type mismatches and defer semantics

**Research date:** 2026-02-12
**Valid until:** Indefinite (internal codebase analysis, not external library research)
