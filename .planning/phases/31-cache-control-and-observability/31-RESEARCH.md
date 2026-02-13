# Phase 31: Cache Control & Observability - Research

**Researched:** 2026-02-12
**Domain:** Go HTTP middleware (cache headers), Redis TTL retrieval, React cache bypass (TanStack Query)
**Confidence:** HIGH

## Summary

This phase adds cache observability headers (`X-Cache: HIT|MISS`, `X-Cache-TTL: N`) to all API responses from cached endpoints, a `?refresh=true` query parameter for cache bypass, and UI refresh buttons in the lineage toolbar and asset browser. The implementation spans three layers: the Go backend cache repository (TTL retrieval), HTTP middleware/decorator (header injection and refresh parameter parsing), and the React frontend (refresh button UI + TanStack Query invalidation).

The existing architecture uses a `CachedOpenLineageRepository` decorator wrapping `TeradataRepository` via the `domain.OpenLineageRepository` interface. Cache operations happen at the repository layer, invisible to handlers. The key challenge is surfacing cache metadata (HIT/MISS status, remaining TTL) up to the HTTP handler layer so it can be written as response headers. Two approaches exist: (1) context-based metadata propagation from repository to handler via a middleware, or (2) a response-wrapper approach at the handler level. The context-based approach is cleaner because it preserves the current handler pattern and keeps cache awareness out of handler code.

For `?refresh=true` cache bypass, the cleanest approach is to pass a "skip cache" signal via context from middleware down to the `CachedOpenLineageRepository`, which checks for it before attempting cache reads. This avoids modifying every handler method signature.

**Primary recommendation:** Use Go `context.Context` values to propagate both the cache bypass signal (downward from middleware to repository) and cache metadata (upward from repository to middleware via a mutable struct pointer in context), with a single Chi middleware wrapping v2 API routes that reads the refresh parameter and writes cache headers.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| github.com/redis/go-redis/v9 | v9.7.3 | Redis client (TTL command) | Already in go.mod, has `TTL()` returning `*DurationCmd` |
| github.com/go-chi/chi/v5 | v5.0.11 | Router + middleware | Already used, native middleware pattern |
| github.com/go-chi/cors | v1.2.1 | CORS headers | Already used, needs `ExposedHeaders` update |
| @tanstack/react-query | ^5.17.0 | Frontend cache + refetch | Already used, has `invalidateQueries` + `refetch` |
| lucide-react | ^0.300.0 | Icons (RefreshCw) | Already used for toolbar icons |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| context (stdlib) | Go 1.23 | Context value propagation | Pass cache metadata between middleware and repository |
| axios | ^1.6.0 | HTTP client | Already used, response interceptor for reading headers |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Context values for metadata | Return struct with metadata from each method | Would require changing every method signature on the repository interface; too invasive |
| Chi middleware for headers | Per-handler header writing | Repetitive code in every handler; middleware is DRY |
| TanStack invalidateQueries | refetchQueries | invalidateQueries marks as stale + refetches active; refetchQueries forces immediate refetch; both work, but passing `?refresh=true` via queryFn is more explicit |

**Installation:**
No new dependencies needed. All libraries are already in the project.

## Architecture Patterns

### Recommended Project Structure
```
lineage-api/internal/
├── adapter/
│   ├── inbound/http/
│   │   ├── cache_middleware.go       # NEW: X-Cache header middleware + refresh param
│   │   ├── cache_middleware_test.go   # NEW: middleware tests
│   │   └── router.go                 # MODIFIED: add middleware, update CORS ExposedHeaders
│   └── outbound/redis/
│       ├── cache.go                  # MODIFIED: add TTL() method to CacheRepository
│       ├── cache_metadata.go         # NEW: CacheMetadata context type + helpers
│       └── cached_openlineage_repo.go # MODIFIED: read bypass signal, write metadata to context

lineage-ui/src/
├── api/
│   ├── client.ts                     # MODIFIED: add refresh param support, read cache headers
│   └── hooks/
│       └── useOpenLineage.ts         # MODIFIED: add refresh option to hooks
├── components/domain/
│   ├── LineageGraph/
│   │   └── Toolbar.tsx               # MODIFIED: add refresh button
│   └── AssetBrowser/
│       └── AssetBrowser.tsx           # MODIFIED: add refresh button
```

### Pattern 1: Context-Based Cache Metadata Propagation
**What:** Use `context.WithValue` to pass a mutable `*CacheMetadata` struct through the request lifecycle. Middleware creates it, repository populates it, middleware reads it after handler returns.
**When to use:** When cache operations happen deep in the stack (repository layer) but headers must be set at HTTP layer.
**Example:**
```go
// Source: Go stdlib context pattern + project codebase analysis

// cache_metadata.go
type contextKey string
const cacheMetadataKey contextKey = "cacheMetadata"

type CacheMetadata struct {
    Hit    bool
    TTL    int  // seconds remaining, -1 if not cached
}

func NewCacheMetadataContext(ctx context.Context) context.Context {
    return context.WithValue(ctx, cacheMetadataKey, &CacheMetadata{TTL: -1})
}

func GetCacheMetadata(ctx context.Context) *CacheMetadata {
    if md, ok := ctx.Value(cacheMetadataKey).(*CacheMetadata); ok {
        return md
    }
    return nil
}
```

### Pattern 2: Cache Bypass via Context Signal
**What:** Middleware reads `?refresh=true` from query params and stores a boolean signal in context. The `CachedOpenLineageRepository` checks for this signal before attempting cache.Get().
**When to use:** When bypass logic must work across all cached methods without modifying each handler.
**Example:**
```go
// cache_middleware.go
const cacheBypassKey contextKey = "cacheBypass"

func CacheControl(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        ctx := r.Context()

        // Check for refresh=true query parameter
        if r.URL.Query().Get("refresh") == "true" {
            ctx = context.WithValue(ctx, cacheBypassKey, true)
        }

        // Create cache metadata for this request
        ctx = NewCacheMetadataContext(ctx)

        // Call next handler
        next.ServeHTTP(w, r.WithContext(ctx))

        // After handler returns, read metadata and set headers
        // NOTE: Headers must be set BEFORE WriteHeader/Write is called
        // So we use a ResponseWriter wrapper instead
    })
}
```

### Pattern 3: ResponseWriter Wrapper for Post-Handler Headers
**What:** Since Go HTTP handlers call `w.WriteHeader()` which sends headers, and we need to set cache headers AFTER the handler runs (when metadata is populated), we wrap the ResponseWriter to intercept `WriteHeader()`.
**When to use:** When headers depend on data computed during handler execution.
**Example:**
```go
// cache_middleware.go
type cacheResponseWriter struct {
    http.ResponseWriter
    ctx         context.Context
    wroteHeader bool
}

func (crw *cacheResponseWriter) WriteHeader(code int) {
    if !crw.wroteHeader {
        crw.wroteHeader = true
        if md := GetCacheMetadata(crw.ctx); md != nil {
            if md.Hit {
                crw.ResponseWriter.Header().Set("X-Cache", "HIT")
            } else {
                crw.ResponseWriter.Header().Set("X-Cache", "MISS")
            }
            if md.TTL >= 0 {
                crw.ResponseWriter.Header().Set("X-Cache-TTL",
                    strconv.Itoa(md.TTL))
            }
        }
    }
    crw.ResponseWriter.WriteHeader(code)
}

func (crw *cacheResponseWriter) Write(b []byte) (int, error) {
    if !crw.wroteHeader {
        crw.WriteHeader(http.StatusOK)
    }
    return crw.ResponseWriter.Write(b)
}
```

### Pattern 4: Frontend Refresh with TanStack Query
**What:** Pass `refresh=true` as a query parameter in the API call, then invalidate the TanStack cache for the same key so the response replaces stale data.
**When to use:** When users click a refresh button in the UI.
**Example:**
```typescript
// In component:
const queryClient = useQueryClient();
const { data, refetch } = useOpenLineageTableLineage(datasetId, direction, maxDepth);

const handleRefresh = async () => {
    // Method 1: Pass refresh param directly
    await queryClient.fetchQuery({
        queryKey: openLineageKeys.lineage(datasetId, fieldName, direction, maxDepth),
        queryFn: () => openLineageApi.getLineageGraph(datasetId, fieldName,
            { direction, maxDepth, refresh: true }),
    });
};
```

### Anti-Patterns to Avoid
- **Modifying domain.OpenLineageRepository interface:** Adding cache bypass parameters to every method breaks the clean interface; use context instead.
- **Setting headers in handlers:** Cache headers are cross-cutting; putting them in every handler violates DRY and misses endpoints.
- **Cache-Control HTTP header for bypass:** Using standard `Cache-Control: no-cache` is for HTTP proxy caches, not application-level Redis caches. The `?refresh=true` query parameter is explicit and application-specific.
- **Global middleware for all routes:** Only cached v2 API endpoints need cache headers; health checks and v1 routes should not have them.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| TTL retrieval from Redis | Manual PTTL command composition | `client.TTL(ctx, key).Result()` returns `time.Duration` | go-redis v9 wraps TTL command with proper error handling and returns -2 for non-existent, -1 for no expire |
| Frontend cache invalidation | Manual state management for refresh | `queryClient.invalidateQueries({ queryKey })` | TanStack Query handles stale marking, background refetch, and re-render automatically |
| CORS header exposure | Manual CORS headers in middleware | Add to `ExposedHeaders` in go-chi/cors config | The existing CORS middleware handles `Access-Control-Expose-Headers` correctly |
| Response interceptor for headers | Per-call header reading | Axios response interceptor on `apiClientV2` | Centralized header reading for all API responses |

**Key insight:** The existing cache-aside pattern in `CachedOpenLineageRepository` already knows whether a cache hit or miss occurred (it logs it). The main work is surfacing this information upward to the HTTP layer via context, not reimplementing cache logic.

## Common Pitfalls

### Pitfall 1: Headers Set After WriteHeader
**What goes wrong:** In Go, once `w.WriteHeader()` or `w.Write()` is called, response headers are sent. If middleware tries to set `X-Cache` after the handler has already written the response, the headers are silently dropped.
**Why it happens:** The handler calls `respondJSON()` which calls `w.WriteHeader()` and `w.Write()` before control returns to the middleware's "after" section.
**How to avoid:** Use a `ResponseWriter` wrapper that intercepts `WriteHeader()` to inject cache headers before they are sent. The wrapper sets headers in its `WriteHeader()` override, then delegates to the real ResponseWriter.
**Warning signs:** Headers appear in test but not in browser; headers visible with `curl -v` but not in `response.headers` in JavaScript.

### Pitfall 2: CORS Not Exposing Custom Headers
**What goes wrong:** The `X-Cache` and `X-Cache-TTL` headers are present in the response (visible with curl), but the browser's JavaScript cannot read them via `response.headers`.
**Why it happens:** CORS specification requires custom headers to be explicitly listed in `Access-Control-Expose-Headers`. The current CORS config only exposes `["Link"]`.
**How to avoid:** Add `"X-Cache"` and `"X-Cache-TTL"` to the `ExposedHeaders` slice in the CORS configuration in `router.go`.
**Warning signs:** `response.headers.get('X-Cache')` returns `null` in browser but `curl -v` shows the header.

### Pitfall 3: NoOpCache TTL Returns
**What goes wrong:** When Redis is unavailable and NoOpCache is used, the middleware still tries to read cache metadata and set headers, potentially with confusing values.
**Why it happens:** NoOpCache always returns cache miss, but there is no TTL to report.
**How to avoid:** The CacheMetadata should default to `{Hit: false, TTL: -1}`. The middleware should only set `X-Cache-TTL` when TTL >= 0 (i.e., when an actual cached entry was found). When NoOpCache is active, responses get `X-Cache: MISS` with no `X-Cache-TTL` header, which is correct behavior.
**Warning signs:** `X-Cache-TTL: -1` appearing in responses.

### Pitfall 4: Context Value Not Propagating Through Embedded Repository
**What goes wrong:** The `CachedOpenLineageRepository` embeds `domain.OpenLineageRepository` for uncached methods. If context with cache metadata is passed to an uncached method, no metadata is populated, and the middleware writes `X-Cache: MISS` even though no cache was involved.
**Why it happens:** Embedded methods delegate directly to the inner repository without touching cache metadata.
**How to avoid:** Only set cache metadata for methods that actually go through the cache-aside pattern. The middleware should check if metadata was populated (non-nil pointer, non-default values) and omit cache headers when no cache interaction occurred. A simple flag like `CacheMetadata.Touched bool` works.
**Warning signs:** Uncached endpoints (jobs, runs) showing `X-Cache: MISS` headers.

### Pitfall 5: Refresh Parameter Deleting Cache Entry for Other Consumers
**What goes wrong:** When `?refresh=true` is used, if the implementation deletes the cache entry first and then the database query fails, subsequent normal requests also get cache misses until the entry naturally repopulates.
**Why it happens:** Delete-then-fetch leaves a window where the cache is empty.
**How to avoid:** Skip cache.Get() on bypass but still cache.Set() the fresh result. This overwrites the stale entry atomically with fresh data. Do NOT delete the cache entry before fetching.
**Warning signs:** Brief spikes in Teradata queries after a refresh action.

### Pitfall 6: TanStack Query Returning Stale Data After Refresh
**What goes wrong:** The user clicks refresh, the API returns fresh data with `?refresh=true`, but TanStack Query serves the old cached data because the query key did not change.
**Why it happens:** TanStack Query caches by query key. If `refresh=true` is not part of the key, the response updates the cache, but if the query is not invalidated, old data may be shown.
**How to avoid:** After fetching with `?refresh=true`, invalidate the query key so TanStack Query refetches. Or use `queryClient.fetchQuery()` which updates the cache for the given key. The simplest approach: add a `refresh` parameter to the API client functions that appends `?refresh=true`, and combine with `queryClient.invalidateQueries()` to trigger a refetch that includes the param.
**Warning signs:** UI shows stale data after clicking refresh button.

## Code Examples

Verified patterns from official sources and codebase analysis:

### Redis TTL Retrieval in Go
```go
// Source: go-redis v9 API (github.com/redis/go-redis/v9) + Redis TTL docs
// CacheRepository already uses *redis.Client

// Add to CacheRepository:
func (r *CacheRepository) TTL(ctx context.Context, key string) (int, error) {
    duration, err := r.client.TTL(ctx, key).Result()
    if err != nil {
        return -1, err
    }
    // TTL returns -2 for non-existent key, -1 for no expiry
    if duration < 0 {
        return int(duration.Seconds()), nil
    }
    return int(duration.Seconds()), nil
}

// NoOpCache TTL always returns -1 (no TTL info)
func (c *NoOpCache) TTL(ctx context.Context, key string) (int, error) {
    return -1, nil
}
```

### Cache Bypass in CachedOpenLineageRepository
```go
// Source: codebase analysis of cached_openlineage_repo.go pattern

func IsCacheBypass(ctx context.Context) bool {
    if bypass, ok := ctx.Value(cacheBypassKey).(bool); ok {
        return bypass
    }
    return false
}

// Modified GetColumnLineageGraph with bypass support:
func (r *CachedOpenLineageRepository) GetColumnLineageGraph(
    ctx context.Context, datasetID, fieldName string, direction string, maxDepth int,
) (*domain.OpenLineageGraph, error) {
    key := LineageGraphKey(datasetID, fieldName, direction)
    md := GetCacheMetadata(ctx)

    // Check cache (skip on bypass)
    if !IsCacheBypass(ctx) {
        var cached domain.OpenLineageGraph
        if err := r.cache.Get(ctx, key, &cached); err == nil {
            slog.DebugContext(ctx, "cache hit", "key", key)
            if md != nil {
                md.Hit = true
                md.Touched = true
                // Get TTL
                if ttl, err := r.cache.TTL(ctx, key); err == nil {
                    md.TTL = ttl
                }
            }
            return &cached, nil
        }
    }

    slog.DebugContext(ctx, "cache miss/bypass", "key", key)

    // Fall through to inner repository
    graph, err := r.OpenLineageRepository.GetColumnLineageGraph(
        ctx, datasetID, fieldName, direction, maxDepth)
    if err != nil {
        return nil, err
    }
    if graph == nil {
        return nil, nil
    }

    // Populate cache
    if setErr := r.cache.Set(ctx, key, graph, r.ttls.LineageTTL); setErr != nil {
        slog.WarnContext(ctx, "cache set failed", "key", key, "error", setErr)
    }

    if md != nil {
        md.Hit = false
        md.Touched = true
        md.TTL = r.ttls.LineageTTL // freshly cached, TTL is the configured value
    }

    return graph, nil
}
```

### Frontend API Client with Refresh Support
```typescript
// Source: codebase analysis of client.ts + axios docs

// Extend LineageQueryParams
export interface LineageQueryParams {
    direction?: LineageDirection;
    maxDepth?: number;
    refresh?: boolean;  // NEW
}

// Modified API method
async getLineageGraph(
    datasetId: string,
    fieldName: string,
    params?: LineageQueryParams
): Promise<OpenLineageLineageResponse> {
    const response = await apiClientV2.get<OpenLineageLineageResponse>(
        `/api/v2/openlineage/lineage/${encodeURIComponent(datasetId)}/${encodeURIComponent(fieldName)}`,
        { params: { ...params, refresh: params?.refresh || undefined } }
    );
    return response.data;
}
```

### Refresh Button in Toolbar
```typescript
// Source: codebase analysis of Toolbar.tsx (lucide-react RefreshCw icon)
import { RefreshCw } from 'lucide-react';

// Add to ToolbarProps interface:
onRefresh?: () => void;

// Add button next to existing action buttons:
{onRefresh && (
    <Tooltip content="Refresh data (bypass cache)" position="bottom">
        <button
            onClick={onRefresh}
            disabled={isLoading}
            className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
            aria-label="Refresh data"
        >
            <RefreshCw className="w-4 h-4" />
        </button>
    </Tooltip>
)}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Cache-Control HTTP headers for app cache | Custom X-Cache headers | Industry standard (CDNs, Varnish, nginx) | X-Cache is well understood; Cache-Control is for HTTP-level caches, not app-level Redis |
| Cache status in response body | Cache status in response headers | N/A | Headers keep the API response body clean and unchanged |
| Per-endpoint bypass parameters | Context-based middleware pattern | Go 1.7+ context support | Single middleware handles all endpoints uniformly |

**Deprecated/outdated:**
- Using `Cache-Control: no-cache` for application-level cache bypass: This is for HTTP proxy caches (Varnish, CDN, browser cache), not for Redis application caches. Use a custom query parameter instead.

## Open Questions

Things that couldn't be fully resolved:

1. **Should v1 API routes also get cache headers?**
   - What we know: v1 routes use the old Handler (not OpenLineageHandler) and do NOT go through CachedOpenLineageRepository. They hit TeradataRepository directly.
   - What's unclear: Whether users interact with v1 routes anymore.
   - Recommendation: Only add cache middleware to v2 routes. v1 routes are not cached and should not get misleading cache headers. This matches the success criteria which reference "cached endpoints."

2. **TTL precision: seconds vs the configured TTL default**
   - What we know: Redis TTL command returns remaining seconds. On a fresh cache miss that populates the cache, the TTL is the configured default (e.g., 1800s for lineage). On a cache hit, it's whatever Redis reports.
   - What's unclear: Whether to use Redis `TTL` command (actual remaining) vs. the configured TTL minus estimated elapsed.
   - Recommendation: Use `r.cache.TTL(ctx, key)` on cache hit (actual remaining TTL from Redis). On cache miss with fresh population, use the configured TTL value directly (avoids an extra Redis round trip).

3. **Should refresh button show a loading state distinct from initial load?**
   - What we know: The Toolbar already has `isLoading` support. TanStack Query's `isFetching` can distinguish initial vs refetch.
   - What's unclear: Whether a spinning refresh icon is needed vs reusing the existing loading indicator.
   - Recommendation: Use `isFetching` to spin the refresh button icon while refetching. This gives clear visual feedback that the refresh is in progress.

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `lineage-api/internal/adapter/outbound/redis/cache.go` - Redis CacheRepository interface, NoOpCache
- Codebase analysis: `lineage-api/internal/adapter/outbound/redis/cached_openlineage_repo.go` - Cache-aside pattern, all 9 cached methods
- Codebase analysis: `lineage-api/internal/adapter/inbound/http/router.go` - Chi router, CORS config
- Codebase analysis: `lineage-ui/src/api/hooks/useOpenLineage.ts` - TanStack Query hooks, query key factory
- Codebase analysis: `lineage-ui/src/components/domain/LineageGraph/Toolbar.tsx` - Existing toolbar with action buttons
- Codebase analysis: `lineage-ui/src/components/domain/AssetBrowser/AssetBrowser.tsx` - Asset browser component
- Codebase analysis: `lineage-api/go.mod` - go-redis v9.7.3, chi v5.0.11, cors v1.2.1

### Secondary (MEDIUM confidence)
- [Redis TTL Command](https://redis.io/docs/latest/commands/ttl/) - TTL returns seconds remaining, -2 for non-existent, -1 for no expire
- [go-redis v9 API](https://pkg.go.dev/github.com/redis/go-redis/v9) - `TTL()` method returns `*DurationCmd`
- [TanStack Query v5 invalidation](https://tanstack.com/query/v5/docs/framework/react/guides/query-invalidation) - `invalidateQueries` marks stale + refetches active queries
- [go-chi/cors](https://github.com/go-chi/cors) - `ExposedHeaders` configuration for CORS

### Tertiary (LOW confidence)
- None. All findings verified with codebase analysis or official documentation.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already in the project, verified versions in go.mod and package.json
- Architecture: HIGH - Context-based metadata propagation is a well-established Go pattern; ResponseWriter wrapping is standard middleware technique; codebase structure is thoroughly understood
- Pitfalls: HIGH - Identified from direct codebase analysis (CORS ExposedHeaders gap, NoOpCache behavior, WriteHeader timing)

**Research date:** 2026-02-12
**Valid until:** 2026-03-12 (30 days - stable domain, no library changes expected)
