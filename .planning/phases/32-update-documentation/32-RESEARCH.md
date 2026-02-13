# Phase 32: Update Documentation - Research

**Researched:** 2026-02-13
**Domain:** Documentation maintenance / technical writing
**Confidence:** HIGH

## Summary

Phase 32 is a documentation-only phase. All Redis caching code is already implemented (Phases 28-31). The task is to update every documentation file in the repository to accurately reflect the caching implementation, so that a new team can deploy and operate the system using documentation alone.

A comprehensive gap analysis was performed by comparing the actual implementation against every documentation file. The primary finding is that most documentation files reference Redis and caching but contain **stale or incomplete information** from before the v6.0 implementation. Several files contain specific inaccuracies (wrong go-redis version, wrong cache key format, missing CACHE_TTL_* environment variables, missing X-Cache header documentation, missing refresh button documentation).

**Primary recommendation:** Systematically update each documentation file against the actual implementation. No new documentation files are needed. This is an editing task, not a creation task.

## Standard Stack

Not applicable -- this phase involves editing existing Markdown files. No libraries or tools are needed.

## Architecture Patterns

### Documentation File Inventory

The following files require updates, grouped by the type and severity of changes needed:

#### Files Requiring Significant Updates (stale cache information)

| File | What's Wrong | Severity |
|------|-------------|----------|
| `docs/user_guide.md` | Caching section says "5-minute TTL" and wrong key format; no mention of CACHE_TTL_* env vars, X-Cache headers, refresh buttons, or ?refresh=true | HIGH |
| `docs/operations_guide.md` | Missing CACHE_TTL_* env vars in reference table; no Redis operational guidance beyond "it falls back gracefully" | HIGH |
| `docs/developer_manual.md` | Backend directory tree missing `cache_metadata.go`, `cache_keys.go`, `cache_middleware.go`; no CachedOpenLineageRepository in architecture description | HIGH |
| `lineage-api/README.md` | go-redis listed as v9.4.0 (actual: v9.7.3); no mention of cache-aside pattern, CacheControl middleware, or cache TTL configuration | HIGH |
| `CLAUDE.md` | Missing CACHE_TTL_* env vars in Configuration table; missing cache-aside architecture description; backend structure tree incomplete | MEDIUM |

#### Files Requiring Minor Updates

| File | What's Wrong | Severity |
|------|-------------|----------|
| `lineage-ui/README.md` | No mention of refresh buttons or ?refresh=true parameter support in API hooks | LOW |
| `docs/SECURITY.md` | X-Cache and X-Cache-TTL headers should be mentioned in ExposedHeaders CORS context | LOW |

#### Files Requiring No Changes

| File | Why |
|------|-----|
| `database/README.md` | Caching is backend-only; database docs unaffected |
| `specs/coding_standards_*.md` | Standards unchanged by caching |
| `specs/test_plan_*.md` | Test plans are historical records |
| `specs/lineage_plan_*.md` | Spec files are historical records |

### Gap Analysis Detail

#### 1. `docs/user_guide.md` - Caching Section (lines 1017-1037)

**Current (stale):**
```
| Cache TTL | 5 minutes |
...
Lineage graph results are cached in Redis with a 5-minute TTL. Cache keys follow the pattern:
lineage:{assetId}:{direction}:{maxDepth}
```

**Actual implementation:**
- Five separate TTLs: lineage (30 min), assets (15 min), statistics (15 min), DDL (30 min), search (5 min)
- Cache keys use `ol:{entity}:{operation}:{params}` format with pipe delimiters
- Depth is excluded from lineage cache key (supersets)
- Direction IS included in lineage cache key
- All configurable via CACHE_TTL_* environment variables

**Missing entirely from user_guide.md:**
- ?refresh=true query parameter for cache bypass
- X-Cache: HIT/MISS response headers
- X-Cache-TTL response header (seconds remaining)
- Refresh buttons in the UI (lineage toolbar + asset browser)
- Per-endpoint cache TTL table
- CACHE_TTL_* environment variables in Configuration Reference section

#### 2. `docs/operations_guide.md` - Environment Variable Reference (lines 116-131)

**Current:** Lists REDIS_ADDR, REDIS_PASSWORD, REDIS_DB but NOT the CACHE_TTL_* variables.

**Missing from operations_guide.md:**
- `CACHE_TTL_LINEAGE` (default: 1800)
- `CACHE_TTL_ASSETS` (default: 900)
- `CACHE_TTL_STATISTICS` (default: 900)
- `CACHE_TTL_DDL` (default: 1800)
- `CACHE_TTL_SEARCH` (default: 300)
- Redis operational guidance: how to verify cache is working, how to monitor cache hit rates, how to clear cache
- Cache control headers in API response descriptions
- Mention that CacheControl middleware is only on v2 endpoints

#### 3. `docs/developer_manual.md` - Backend Architecture (Section 5.2)

**Current directory tree (lines 362-365) shows:**
```
adapter/outbound/
    ├── teradata/
    └── redis/
        └── cache.go
```

**Actual implementation (7 files in redis/):**
```
redis/
    ├── cache.go                         # CacheRepository + NoOpCache + CacheTTLConfig
    ├── cache_keys.go                    # Deterministic key builder functions
    ├── cache_keys_test.go               # Key builder tests
    ├── cache_metadata.go                # CacheMetadata context type + bypass signal
    ├── cache_test.go                    # CacheRepository unit tests
    ├── cached_openlineage_repo.go       # CachedOpenLineageRepository decorator
    └── cached_openlineage_repo_test.go  # Decorator unit tests
```

**Missing from developer manual:**
- CachedOpenLineageRepository decorator pattern explanation
- Cache-aside pattern description (how the decorator wraps the Teradata repository)
- cache_middleware.go in the inbound/http directory listing
- CacheMetadata context propagation pattern
- cache_keys.go key format documentation
- CacheTTLConfig type alias pattern (defined in redis, aliased in config)

Also: The Key Interfaces table (Section 5.3) lists `CacheRepository` with methods `Get, Set, Delete, Exists` but the interface now also has `TTL()`.

#### 4. `lineage-api/README.md` - Technology Stack

**Current (line 146):** `go-redis | v9.4.0 | Cache client`
**Actual:** `go-redis v9.7.3` (upgraded per 28-01 plan; v9.7.0 had CVE-2025-29923)

**Missing from lineage-api README:**
- Directory tree doesn't show `cache_keys.go`, `cache_metadata.go`, `cached_openlineage_repo.go`
- No mention of CachedOpenLineageRepository or cache-aside pattern
- No mention of CacheControl middleware or X-Cache headers
- No mention of CACHE_TTL_* configuration
- No mention of ?refresh=true parameter

#### 5. `CLAUDE.md` - Configuration Table (lines 277-289)

**Current:** Lists REDIS_ADDR, REDIS_PASSWORD, REDIS_DB. Does NOT list CACHE_TTL_* variables.

**Missing from CLAUDE.md:**
- CACHE_TTL_LINEAGE, CACHE_TTL_ASSETS, CACHE_TTL_STATISTICS, CACHE_TTL_DDL, CACHE_TTL_SEARCH
- Backend structure tree is missing `cache_keys.go`, `cache_metadata.go`, `cached_openlineage_repo.go`, `cache_middleware.go`
- API Endpoints section should note ?refresh=true parameter and X-Cache headers

#### 6. `lineage-ui/README.md`

**Minor:** No mention of refresh buttons in Toolbar.tsx or AssetBrowser.tsx component descriptions. The refresh functionality is a user-facing feature that developers maintaining the frontend should know about.

#### 7. `docs/SECURITY.md`

**Minor:** The ExposedHeaders in router.go CORS config now includes `X-Cache` and `X-Cache-TTL`. The SECURITY.md production CORS examples don't mention these headers, but they should for completeness.

#### 8. `.env.example`

**Already correct.** The `.env.example` file already includes all CACHE_TTL_* variables with proper defaults and comments. No changes needed.

## Don't Hand-Roll

Not applicable for a documentation phase.

## Common Pitfalls

### Pitfall 1: Updating Cache Section Without Reading Implementation
**What goes wrong:** Documentation describes cache behavior inaccurately because the writer relies on memory or spec files instead of reading the actual code.
**Why it happens:** The implementation evolved through 7 plans across 4 phases with many micro-decisions.
**How to avoid:** Cross-reference every documentation claim against the actual source files listed in the gap analysis.
**Warning signs:** Numbers in docs (TTL values, version numbers) that don't match config defaults.

### Pitfall 2: Missing the Server Timeouts Table
**What goes wrong:** The user_guide.md Backend Server Settings table (line 1017) lists "Cache TTL | 5 minutes" as a built-in setting. This was a reasonable default before v6.0 but is now wrong on two counts: (a) there are 5 separate TTLs, not one, and (b) they are configurable via env vars, not built-in.
**How to avoid:** Remove "Cache TTL" from the Server Timeouts table. Add a separate Cache Configuration table with the 5 TTL types.
**Warning signs:** A single "Cache TTL" row in any documentation table.

### Pitfall 3: Inconsistency Across Files
**What goes wrong:** Different documentation files describe caching differently -- one says "5-minute TTL," another says "30-minute TTL for lineage."
**Why it happens:** Multiple files document the same concept; updating one but missing another.
**How to avoid:** Process all files systematically in a checklist. The gap analysis above is that checklist.
**Warning signs:** Searching for "cache" across all docs and finding contradictory statements.

### Pitfall 4: Forgetting the Frontend Changes
**What goes wrong:** Documentation updates focus on backend caching but miss the UI refresh buttons and ?refresh=true parameter.
**Why it happens:** Caching is conceptually a backend feature, so the frontend surface area gets overlooked.
**How to avoid:** The user_guide.md Toolbar Controls table needs a Refresh Button row. The Toolbar.tsx screenshot description should mention the refresh button. The API Reference should show ?refresh=true.

### Pitfall 5: Cache Key Format Documentation
**What goes wrong:** The old format `lineage:{assetId}:{direction}:{maxDepth}` is documented; the new format `ol:{entity}:{operation}:{params}` with pipe delimiters is not.
**Why it happens:** The new key format was a Phase 29 decision that replaced the Phase 28 format.
**How to avoid:** Document the actual key format from `cache_keys.go`, not from memory.

## Code Examples

Not applicable -- this phase edits Markdown files, not code. However, the following content blocks from the implementation should be referenced when writing documentation:

### Cache Key Format Reference (from cache_keys.go)
```
ol:lineage:graph:{datasetID}|{fieldName}|{direction}
ol:dataset:get:{datasetID}
ol:namespace:list
ol:namespace:get:{namespaceID}
ol:dataset:list:{namespaceID}|{limit}|{offset}
ol:dataset:search:{QUERY}|{limit}
ol:field:list:{datasetID}
ol:dataset:statistics:{datasetID}
ol:dataset:ddl:{datasetID}
```

### Cache TTL Defaults Reference (from config.go)
```
CACHE_TTL_LINEAGE    = 1800  (30 minutes)
CACHE_TTL_ASSETS     = 900   (15 minutes)
CACHE_TTL_STATISTICS = 900   (15 minutes)
CACHE_TTL_DDL        = 1800  (30 minutes)
CACHE_TTL_SEARCH     = 300   (5 minutes)
```

### X-Cache Headers Reference (from cache_middleware.go)
```
X-Cache: HIT        -- response served from Redis cache
X-Cache: MISS       -- response fetched from Teradata (then cached)
X-Cache-TTL: 1425   -- seconds until cache entry expires (only on HIT)
```

### Cache Bypass Reference
```
GET /api/v2/openlineage/lineage/{datasetId}/{fieldName}?refresh=true
```
The `?refresh=true` parameter instructs the CacheControl middleware to set a bypass signal in the request context. The CachedOpenLineageRepository skips the cache read and fetches fresh data from Teradata, then populates the cache with the new result.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single 5-min TTL | 5 configurable TTLs (5-30 min) | Phase 29 (v6.0) | Each data type has appropriate freshness |
| `lineage:{assetId}:{direction}:{depth}` key | `ol:{entity}:{operation}:{params}` key | Phase 29 (v6.0) | Deterministic, documented format |
| go-redis v9.4.0 | go-redis v9.7.3 | Phase 28 (v6.0) | CVE-2025-29923 fix |
| Fail-fast on Redis unavailable | NoOpCache fallback | Phase 30 (v6.0) | App runs without Redis |
| No cache observability | X-Cache + X-Cache-TTL headers | Phase 31 (v6.0) | Operators can monitor cache |
| No cache bypass | ?refresh=true + UI refresh buttons | Phase 31 (v6.0) | Users can force fresh data |

## Open Questions

None. This phase is purely documentation maintenance. All implementation details are verifiable in the codebase.

## Sources

### Primary (HIGH confidence)
- `/Users/Daniel.Tehan/Code/lineage/lineage-api/internal/adapter/outbound/redis/cache.go` -- CacheTTLConfig, NoOpCache, CacheRepository
- `/Users/Daniel.Tehan/Code/lineage/lineage-api/internal/adapter/outbound/redis/cache_keys.go` -- Cache key format
- `/Users/Daniel.Tehan/Code/lineage/lineage-api/internal/adapter/outbound/redis/cache_metadata.go` -- CacheMetadata, bypass context
- `/Users/Daniel.Tehan/Code/lineage/lineage-api/internal/adapter/outbound/redis/cached_openlineage_repo.go` -- Cache-aside decorator
- `/Users/Daniel.Tehan/Code/lineage/lineage-api/internal/adapter/inbound/http/cache_middleware.go` -- CacheControl middleware
- `/Users/Daniel.Tehan/Code/lineage/lineage-api/internal/adapter/inbound/http/router.go` -- Middleware wiring, CORS ExposedHeaders
- `/Users/Daniel.Tehan/Code/lineage/lineage-api/internal/infrastructure/config/config.go` -- CacheTTLConfig loading
- `/Users/Daniel.Tehan/Code/lineage/lineage-api/cmd/server/main.go` -- Redis wiring with NoOpCache fallback
- `/Users/Daniel.Tehan/Code/lineage/lineage-api/go.mod` -- go-redis v9.7.3
- `/Users/Daniel.Tehan/Code/lineage/.env.example` -- CACHE_TTL_* variables (already correct)
- `/Users/Daniel.Tehan/Code/lineage/docs/user_guide.md` -- Current state of user docs
- `/Users/Daniel.Tehan/Code/lineage/docs/operations_guide.md` -- Current state of ops docs
- `/Users/Daniel.Tehan/Code/lineage/docs/developer_manual.md` -- Current state of dev docs
- `/Users/Daniel.Tehan/Code/lineage/lineage-api/README.md` -- Current state of API readme
- `/Users/Daniel.Tehan/Code/lineage/CLAUDE.md` -- Current state of Claude instructions
- `/Users/Daniel.Tehan/Code/lineage/.planning/ROADMAP.md` -- v6.0 phase history

## Metadata

**Confidence breakdown:**
- Gap analysis: HIGH -- every documentation file was read and compared against actual source code
- Update scope: HIGH -- file inventory is complete; no documentation files were missed
- Pitfalls: HIGH -- based on direct observation of stale content, not speculation

**Research date:** 2026-02-13
**Valid until:** Indefinite (documentation content is stable; this analysis is specific to v6.0 changes)
