# Phase 29: Cache Keys, TTL & Full Coverage - Research

**Researched:** 2026-02-12
**Domain:** Redis cache key design, configurable TTL, repository decorator expansion in Go
**Confidence:** HIGH

## Summary

Phase 29 extends the cache decorator infrastructure established in Phase 28 to achieve two goals: (1) standardize cache keys to the `ol:{entity}:{operation}:{params}` format with pipe-delimited composite parameters, and (2) make TTL values independently configurable per data type via environment variables while expanding cache coverage to all major v2 read endpoints.

Phase 28 already provides: `CachedOpenLineageRepository` decorator wrapping `OpenLineageRepository` with cache-aside for `GetColumnLineageGraph` and `GetDataset`, go-redis v9.7.3, `MockCacheRepository` with JSON round-trip, and 14 passing unit tests. The decorator embeds the inner repository and overrides only cached methods -- a pattern that Phase 29 continues by adding overrides for the remaining high-value methods.

The key architectural insight is that the phase scope covers only the `OpenLineageRepository` interface (v2 endpoints). The v1 API endpoints (`/api/v1/assets/*`, `/api/v1/lineage/*`, `/api/v1/search`) use separate repository interfaces (`AssetRepository`, `LineageRepository`, `SearchRepository`) which are NOT in scope for Phase 29 caching. All eight v2 OpenLineage endpoints flow through the single `OpenLineageRepository` interface, which the existing `CachedOpenLineageRepository` already wraps.

**Primary recommendation:** Refactor the existing `CachedOpenLineageRepository` to accept a `CacheTTLConfig` struct with per-type TTL values (loaded from env vars), update the two existing cached methods to use the new key format (`ol:{entity}:{op}:{params}` with pipe delimiters), and add cache-aside overrides for `ListNamespaces`, `GetNamespace`, `ListDatasets`, `SearchDatasets`, `ListFields`, `GetDatasetStatistics`, and `GetDatasetDDL`. Wire TTL config from Viper in `config.go` and `main.go`.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| go-redis/v9 | v9.7.3 | Redis client | Already wired from Phase 28. No version change needed. |
| encoding/json | stdlib | Cache serialization | Already used by CacheRepository. All domain entities have json tags. |
| github.com/spf13/viper | v1.21.0 | Config loading | Already loads all config. Adding env vars is trivial with `viper.SetDefault` + `viper.GetInt`. |
| log/slog | stdlib | Structured logging | Already used for cache hit/miss logging in decorator. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| github.com/stretchr/testify | v1.11.1 | Test assertions | Already used in all tests. Continue same patterns. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Per-method TTL via struct field | Per-method TTL via method parameter | Parameter approach requires changing the CacheRepository.Set signature (breaking change). Struct field is simpler and keeps the interface stable. |
| Pipe delimiter in keys | Hash-based keys | Hashing loses debuggability. Pipe (`\|`) is safe because Teradata identifiers and integer IDs never contain pipe characters. Readable keys enable `redis-cli KEYS` debugging. |
| Individual env vars per TTL | Single JSON config | Individual env vars (`CACHE_TTL_LINEAGE`, `CACHE_TTL_ASSETS`) are simpler, consistent with existing config pattern (`VALIDATION_MAX_DEPTH_LIMIT` etc.), and more ops-friendly. |

**No new dependencies required.** Phase 29 is purely internal refactoring + expansion.

## Architecture Patterns

### Recommended Project Structure
```
lineage-api/
├── cmd/server/main.go                                    # Wire CacheTTLConfig, pass to decorator
├── internal/
│   ├── infrastructure/config/
│   │   └── config.go                                     # Add CacheTTLConfig struct + env var loading
│   ├── adapter/outbound/redis/
│   │   ├── cache.go                                      # Unchanged
│   │   ├── cache_keys.go                                 # NEW: Centralized key builder functions
│   │   ├── cache_keys_test.go                            # NEW: Key determinism + format tests
│   │   ├── cached_openlineage_repo.go                    # MODIFIED: Accept CacheTTLConfig, add overrides
│   │   └── cached_openlineage_repo_test.go               # MODIFIED: Add tests for new cached methods
│   └── domain/
│       └── repository.go                                 # Unchanged
```

### Pattern 1: CacheTTLConfig Struct

**What:** A configuration struct that holds per-data-type TTL values, loaded from environment variables with sensible defaults.
**When to use:** When different data types have different staleness tolerances.

**Example:**
```go
// File: internal/infrastructure/config/config.go (additions)

// CacheTTLConfig holds per-data-type cache TTL values in seconds.
type CacheTTLConfig struct {
    LineageTTL    int // TTL for lineage graph queries (default: 1800 = 30 min)
    AssetTTL      int // TTL for asset listings: namespaces, datasets, fields (default: 900 = 15 min)
    StatisticsTTL int // TTL for dataset statistics (default: 900 = 15 min)
    DDLTTL        int // TTL for dataset DDL (default: 1800 = 30 min)
    SearchTTL     int // TTL for search results (default: 300 = 5 min)
}

// In Load():
viper.SetDefault("CACHE_TTL_LINEAGE", 1800)
viper.SetDefault("CACHE_TTL_ASSETS", 900)
viper.SetDefault("CACHE_TTL_STATISTICS", 900)
viper.SetDefault("CACHE_TTL_DDL", 1800)
viper.SetDefault("CACHE_TTL_SEARCH", 300)
```

**Note on defaults:** Phase 29 requirements specify 30-min default for lineage and 15-min default for assets. These values are significantly longer than Phase 28's conservative 5-min TTL. The 28-02 summary explicitly noted "Phase 29 makes configurable" -- these new defaults reflect the requirements (KEY-03: 30 min lineage, KEY-04: 15 min assets).

### Pattern 2: Centralized Cache Key Builder

**What:** Pure functions that produce deterministic cache keys from request parameters. Centralizing key construction prevents ad-hoc key building across methods and makes the key format testable independently.
**When to use:** Always. Every cached method calls a key builder function.

**Example:**
```go
// File: internal/adapter/outbound/redis/cache_keys.go
package redis

import "fmt"

// Cache key format: ol:{entity}:{operation}:{params}
// Composite parameters use pipe (|) as delimiter.

// LineageGraphKey builds the cache key for GetColumnLineageGraph.
// Format: ol:lineage:graph:{datasetID}|{fieldName}|{direction}
func LineageGraphKey(datasetID, fieldName, direction string) string {
    return fmt.Sprintf("ol:lineage:graph:%s|%s|%s", datasetID, fieldName, direction)
}

// DatasetKey builds the cache key for GetDataset.
// Format: ol:dataset:get:{datasetID}
func DatasetKey(datasetID string) string {
    return fmt.Sprintf("ol:dataset:get:%s", datasetID)
}

// NamespacesKey builds the cache key for ListNamespaces.
// Format: ol:namespace:list
func NamespacesKey() string {
    return "ol:namespace:list"
}

// NamespaceKey builds the cache key for GetNamespace.
// Format: ol:namespace:get:{namespaceID}
func NamespaceKey(namespaceID string) string {
    return fmt.Sprintf("ol:namespace:get:%s", namespaceID)
}

// DatasetsKey builds the cache key for ListDatasets.
// Format: ol:dataset:list:{namespaceID}|{limit}|{offset}
func DatasetsKey(namespaceID string, limit, offset int) string {
    return fmt.Sprintf("ol:dataset:list:%s|%d|%d", namespaceID, limit, offset)
}

// DatasetSearchKey builds the cache key for SearchDatasets.
// Format: ol:dataset:search:{query}|{limit}
func DatasetSearchKey(query string, limit int) string {
    return fmt.Sprintf("ol:dataset:search:%s|%d", query, limit)
}

// FieldsKey builds the cache key for ListFields.
// Format: ol:field:list:{datasetID}
func FieldsKey(datasetID string) string {
    return fmt.Sprintf("ol:field:list:%s", datasetID)
}

// DatasetStatisticsKey builds the cache key for GetDatasetStatistics.
// Format: ol:dataset:statistics:{datasetID}
func DatasetStatisticsKey(datasetID string) string {
    return fmt.Sprintf("ol:dataset:statistics:%s", datasetID)
}

// DatasetDDLKey builds the cache key for GetDatasetDDL.
// Format: ol:dataset:ddl:{datasetID}
func DatasetDDLKey(datasetID string) string {
    return fmt.Sprintf("ol:dataset:ddl:%s", datasetID)
}
```

### Pattern 3: Expanded CachedOpenLineageRepository with Per-Type TTL

**What:** Refactor the existing decorator to accept `CacheTTLConfig` instead of a single `int` TTL, and add cache-aside overrides for all remaining read methods.
**When to use:** This is the core pattern for Phase 29.

**Example (constructor change):**
```go
// BEFORE (Phase 28):
type CachedOpenLineageRepository struct {
    domain.OpenLineageRepository
    cache domain.CacheRepository
    ttl   int
}

func NewCachedOpenLineageRepository(inner domain.OpenLineageRepository, cache domain.CacheRepository, ttl int) *CachedOpenLineageRepository

// AFTER (Phase 29):
type CachedOpenLineageRepository struct {
    domain.OpenLineageRepository
    cache domain.CacheRepository
    ttls  CacheTTLConfig
}

func NewCachedOpenLineageRepository(inner domain.OpenLineageRepository, cache domain.CacheRepository, ttls CacheTTLConfig) *CachedOpenLineageRepository
```

**Note:** The `CacheTTLConfig` struct can live in the `redis` package or in `config`. Since `config` already holds all config structs and is imported by `main.go`, placing it there avoids circular imports. The `redis` package imports `config` for the struct type.

### Pattern 4: Cache-Aside Override Template

**What:** Each newly cached method follows the identical pattern established in Phase 28.

**Example (GetDatasetStatistics):**
```go
func (r *CachedOpenLineageRepository) GetDatasetStatistics(ctx context.Context, datasetID string) (*domain.DatasetStatistics, error) {
    key := DatasetStatisticsKey(datasetID)

    var cached domain.DatasetStatistics
    if err := r.cache.Get(ctx, key, &cached); err == nil {
        slog.DebugContext(ctx, "cache hit", "key", key)
        return &cached, nil
    }
    slog.DebugContext(ctx, "cache miss", "key", key)

    result, err := r.OpenLineageRepository.GetDatasetStatistics(ctx, datasetID)
    if err != nil {
        return nil, err
    }
    if result == nil {
        return nil, nil
    }

    if setErr := r.cache.Set(ctx, key, result, r.ttls.StatisticsTTL); setErr != nil {
        slog.WarnContext(ctx, "cache set failed", "key", key, "error", setErr)
    } else {
        slog.DebugContext(ctx, "cache populated", "key", key, "ttl", r.ttls.StatisticsTTL)
    }

    return result, nil
}
```

### Anti-Patterns to Avoid

- **Including pagination params in keys for small result sets:** Namespaces (typically 1-5) and fields per dataset (typically < 100) are small enough to cache the full list. However, the interface includes limit/offset parameters, so the decorator must cache each page combination. This is acceptable given the small data size. Do NOT try to cache full lists and paginate in the decorator -- that would change the repository interface contract.
- **Making key format configurable:** The key format `ol:{entity}:{operation}:{params}` is an internal implementation detail, not user-facing configuration. Hardcode it. Only TTL values should be configurable.
- **Changing the CacheRepository interface:** The interface (`Get`, `Set`, `Delete`, `Exists`) is sufficient. Do NOT add TTL-aware methods or key-builder methods to the domain interface.
- **Caching search results with long TTL:** Search queries are highly variable. Use a short TTL (5 min) to avoid consuming Redis memory with unique query combinations that are rarely reused.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cache key generation | Ad-hoc `fmt.Sprintf` in each method | Centralized key builder functions in `cache_keys.go` | Ensures format consistency, testable independently, prevents copy-paste errors |
| TTL configuration | Hardcoded values scattered across methods | `CacheTTLConfig` struct loaded from Viper | Single source of truth, env var override, validation at startup |
| Environment variable loading | Custom `os.Getenv` with parsing | Viper `SetDefault` + `GetInt` | Already used for all other config. Consistent pattern. Handles type conversion. |
| JSON round-trip testing | Manual marshal/unmarshal assertions | Existing mock cache pattern (MockCacheRepository with real JSON) | Phase 28 already established this pattern with 14 tests. Extend it. |

**Key insight:** Phase 29 adds no new infrastructure. It extends the existing decorator with more cached methods, standardizes key format, and makes TTL configurable. All patterns and testing approaches are established.

## Common Pitfalls

### Pitfall 1: Breaking Existing Cache Entries on Key Format Migration
**What goes wrong:** Phase 28 uses key format `ol:lineage:graph:{datasetID}:{fieldName}:{direction}` (colon-delimited params). Phase 29 changes to `ol:lineage:graph:{datasetID}|{fieldName}|{direction}` (pipe-delimited params). After deployment, existing cache entries under the old key format become unreachable orphans that consume Redis memory until their TTL expires, and all requests miss the cache until new entries are populated.
**Why it happens:** Key format changes always invalidate existing cache entries. This is expected and acceptable for this application.
**How to avoid:** This is a non-issue for two reasons: (1) Phase 28 uses a 5-min TTL, so all old entries expire within 5 minutes. (2) The old entries are harmless -- they simply waste a few KB until expiry. No migration script is needed.
**Warning signs:** Only relevant if TTL were very long (hours/days). At 5 minutes, this is a non-issue.

### Pitfall 2: CacheTTLConfig Constructor Signature Change Breaking Tests
**What goes wrong:** Changing `NewCachedOpenLineageRepository(inner, cache, ttl int)` to `NewCachedOpenLineageRepository(inner, cache, ttls CacheTTLConfig)` breaks all 14 existing tests in `cached_openlineage_repo_test.go` because they pass an `int`.
**Why it happens:** Go does not have optional parameters. The constructor signature change requires updating all call sites.
**How to avoid:** Update `newTestCachedRepo()` helper function (which all 14 tests use) to create a `CacheTTLConfig` with uniform values (e.g., 300s for all types). This single change fixes all tests. Then add new tests for per-type TTL behavior.
**Warning signs:** Compilation errors in test file after changing constructor.

### Pitfall 3: ListDatasets Pagination Key Space
**What goes wrong:** `ListDatasets` takes `namespaceID`, `limit`, and `offset` parameters. Each unique (namespaceID, limit, offset) combination gets its own cache entry. If the frontend paginates with different page sizes or offsets, this creates many entries for what is largely the same data.
**Why it happens:** The repository interface requires all three parameters, and deterministic keys must include all parameters that affect the response.
**How to avoid:** Accept the key space. For this application, the namespace count is small (typically 1-3) and the default page size is fixed by the frontend. The number of distinct (namespaceID, limit, offset) combinations is bounded. Use the asset TTL (15 min default) which is short enough to prevent unbounded growth.
**Warning signs:** Sudden increase in Redis key count. Monitor with `DBSIZE`.

### Pitfall 4: SearchDatasets Key Normalization
**What goes wrong:** Search query `"CUSTOMERS"` and `"customers"` produce different cache keys but return the same results from Teradata (which is case-insensitive for LIKE queries). This halves the cache hit rate for search queries.
**Why it happens:** Cache keys are constructed from raw request parameters without normalization.
**How to avoid:** Normalize the search query in the key builder: convert to uppercase (matching Teradata's case-insensitive behavior) and trim whitespace. Example: `DatasetSearchKey(strings.ToUpper(strings.TrimSpace(query)), limit)`.
**Warning signs:** Cache hit rate for search queries is lower than expected. Duplicate entries in Redis with different casing.

### Pitfall 5: Nil vs Empty Slice Consistency Across Methods
**What goes wrong:** `ListNamespaces` returns `[]OpenLineageNamespace` (non-nil empty slice) from the mock but `nil` from Teradata when no namespaces exist. After JSON round-trip through cache, the nil-vs-empty distinction is lost. Code that checks `if namespaces == nil` vs `if len(namespaces) == 0` behaves differently on cache hit vs miss.
**Why it happens:** Go's `encoding/json` marshals `nil` slices as `null` and empty slices as `[]`. After unmarshal, both become non-nil empty slices.
**How to avoid:** The existing decorator pattern already handles this correctly: it only caches non-nil results. For list methods that return slices, the inner repository always returns either `([]T, error)` or `(nil, error)`. Cache the returned slice as-is. The JSON round-trip normalizes nil to empty, which is fine because the API layer already handles both consistently (it never returns `null` for list responses -- it wraps in response objects).
**Warning signs:** Frontend receiving unexpected `null` in list fields.

## Code Examples

### Example 1: CacheTTLConfig in config.go

```go
// Source: Pattern from existing ValidationConfig in config.go lines 14-18

// CacheTTLConfig holds per-data-type cache TTL values in seconds.
type CacheTTLConfig struct {
    LineageTTL    int // Lineage graph queries (default: 1800s = 30 min)
    AssetTTL      int // Asset listings: namespaces, datasets, fields (default: 900s = 15 min)
    StatisticsTTL int // Dataset statistics (default: 900s = 15 min)
    DDLTTL        int // Dataset DDL (default: 1800s = 30 min)
    SearchTTL     int // Search results (default: 300s = 5 min)
}

// In Config struct (add field):
type Config struct {
    Port       string
    Teradata   teradata.Config
    Redis      redis.Config
    Validation ValidationConfig
    CacheTTL   CacheTTLConfig  // NEW
}

// In Load() function (add defaults and loading):
viper.SetDefault("CACHE_TTL_LINEAGE", 1800)
viper.SetDefault("CACHE_TTL_ASSETS", 900)
viper.SetDefault("CACHE_TTL_STATISTICS", 900)
viper.SetDefault("CACHE_TTL_DDL", 1800)
viper.SetDefault("CACHE_TTL_SEARCH", 300)

// In cfg construction:
CacheTTL: CacheTTLConfig{
    LineageTTL:    viper.GetInt("CACHE_TTL_LINEAGE"),
    AssetTTL:      viper.GetInt("CACHE_TTL_ASSETS"),
    StatisticsTTL: viper.GetInt("CACHE_TTL_STATISTICS"),
    DDLTTL:        viper.GetInt("CACHE_TTL_DDL"),
    SearchTTL:     viper.GetInt("CACHE_TTL_SEARCH"),
},
```

### Example 2: Key Builder Tests (determinism verification)

```go
// Source: Pattern from existing cache decorator tests

func TestLineageGraphKey_Deterministic(t *testing.T) {
    key1 := LineageGraphKey("42", "customer_id", "upstream")
    key2 := LineageGraphKey("42", "customer_id", "upstream")
    assert.Equal(t, key1, key2, "same params must produce same key")
    assert.Equal(t, "ol:lineage:graph:42|customer_id|upstream", key1)
}

func TestLineageGraphKey_DifferentParams_DifferentKeys(t *testing.T) {
    key1 := LineageGraphKey("42", "customer_id", "upstream")
    key2 := LineageGraphKey("42", "customer_id", "downstream")
    key3 := LineageGraphKey("43", "customer_id", "upstream")
    assert.NotEqual(t, key1, key2)
    assert.NotEqual(t, key1, key3)
}

func TestAllKeys_FollowFormat(t *testing.T) {
    tests := []struct {
        name string
        key  string
    }{
        {"lineage graph", LineageGraphKey("42", "col_a", "both")},
        {"dataset get", DatasetKey("42")},
        {"namespace list", NamespacesKey()},
        {"namespace get", NamespaceKey("1")},
        {"dataset list", DatasetsKey("1", 50, 0)},
        {"dataset search", DatasetSearchKey("CUSTOMERS", 50)},
        {"field list", FieldsKey("42")},
        {"statistics", DatasetStatisticsKey("42")},
        {"ddl", DatasetDDLKey("42")},
    }
    for _, tc := range tests {
        t.Run(tc.name, func(t *testing.T) {
            assert.True(t, strings.HasPrefix(tc.key, "ol:"),
                "all keys must start with ol: prefix, got: %s", tc.key)
        })
    }
}
```

### Example 3: Updated main.go Wiring

```go
// Source: Current main.go lines 67-69

// BEFORE (Phase 28):
cachedOLRepo := redisAdapter.NewCachedOpenLineageRepository(olRepo, cacheRepo, 300)

// AFTER (Phase 29):
cacheTTLs := redisAdapter.CacheTTLConfig{
    LineageTTL:    cfg.CacheTTL.LineageTTL,
    AssetTTL:      cfg.CacheTTL.AssetTTL,
    StatisticsTTL: cfg.CacheTTL.StatisticsTTL,
    DDLTTL:        cfg.CacheTTL.DDLTTL,
    SearchTTL:     cfg.CacheTTL.SearchTTL,
}
cachedOLRepo := redisAdapter.NewCachedOpenLineageRepository(olRepo, cacheRepo, cacheTTLs)
```

### Example 4: Updated .env.example

```bash
# Cache TTL Configuration (seconds)
# Each data type can have a different TTL. Lineage graphs are expensive to
# compute and change infrequently. Search results change more often.
CACHE_TTL_LINEAGE=1800     # Lineage graph queries (default: 30 minutes)
CACHE_TTL_ASSETS=900       # Namespace/dataset/field listings (default: 15 minutes)
CACHE_TTL_STATISTICS=900   # Dataset statistics (default: 15 minutes)
CACHE_TTL_DDL=1800         # Dataset DDL (default: 30 minutes)
CACHE_TTL_SEARCH=300       # Search results (default: 5 minutes)
```

## Endpoint-to-Cache Mapping

Complete inventory of v2 endpoints and their cache configuration:

| Endpoint | Handler Method | Repository Method | Cache Key | TTL Type | Currently Cached? |
|----------|---------------|-------------------|-----------|----------|-------------------|
| `GET /namespaces` | ListNamespaces | ListNamespaces | `ol:namespace:list` | AssetTTL (15m) | No |
| `GET /namespaces/{id}` | GetNamespace | GetNamespace | `ol:namespace:get:{id}` | AssetTTL (15m) | No |
| `GET /namespaces/{id}/datasets` | ListDatasets | ListDatasets | `ol:dataset:list:{nsId}\|{limit}\|{offset}` | AssetTTL (15m) | No |
| `GET /datasets/search` | SearchDatasets | SearchDatasets | `ol:dataset:search:{query}\|{limit}` | SearchTTL (5m) | No |
| `GET /datasets/{id}` | GetDataset | GetDataset | `ol:dataset:get:{id}` | AssetTTL (15m) | Yes (Phase 28) |
| `GET /datasets/{id}/statistics` | GetDatasetStatistics | GetDatasetStatistics | `ol:dataset:statistics:{id}` | StatisticsTTL (15m) | No |
| `GET /datasets/{id}/ddl` | GetDatasetDDL | GetDatasetDDL | `ol:dataset:ddl:{id}` | DDLTTL (30m) | No |
| `GET /lineage/{dsId}/{field}` | GetLineageGraph | GetColumnLineageGraph | `ol:lineage:graph:{dsId}\|{field}\|{dir}` | LineageTTL (30m) | Yes (Phase 28) |

**Methods NOT cached (by design):**
- `GetField` -- Not exposed as an endpoint. Used internally by `GetDataset` service method.
- `GetJob`, `ListJobs`, `GetRun`, `ListRuns` -- Not exposed as endpoints in the current router.
- `GetColumnLineage` -- Not exposed as an endpoint. Only `GetColumnLineageGraph` is.
- `GetNamespaceByURI` -- Not exposed as an endpoint.

## Key Format Analysis

### Current (Phase 28) vs New (Phase 29) Key Formats

| Method | Phase 28 Key | Phase 29 Key | Change |
|--------|-------------|-------------|--------|
| GetColumnLineageGraph | `ol:lineage:graph:{dsId}:{field}:{dir}` | `ol:lineage:graph:{dsId}\|{field}\|{dir}` | Params now pipe-delimited |
| GetDataset | `ol:dataset:{dsId}` | `ol:dataset:get:{dsId}` | Added `:get:` operation segment |
| ListNamespaces | (not cached) | `ol:namespace:list` | New |
| GetNamespace | (not cached) | `ol:namespace:get:{nsId}` | New |
| ListDatasets | (not cached) | `ol:dataset:list:{nsId}\|{limit}\|{offset}` | New |
| SearchDatasets | (not cached) | `ol:dataset:search:{query}\|{limit}` | New |
| ListFields | (not cached) | `ol:field:list:{dsId}` | New |
| GetDatasetStatistics | (not cached) | `ol:dataset:statistics:{dsId}` | New |
| GetDatasetDDL | (not cached) | `ol:dataset:ddl:{dsId}` | New |

### Key Format Specification

Format: `ol:{entity}:{operation}:{params}`

| Segment | Values | Purpose |
|---------|--------|---------|
| `ol` | Fixed prefix | Namespace for all OpenLineage cache entries. Enables prefix-based operations. |
| `{entity}` | `lineage`, `dataset`, `namespace`, `field` | Domain entity type |
| `{operation}` | `graph`, `get`, `list`, `search`, `statistics`, `ddl` | Operation being performed |
| `{params}` | Pipe-delimited parameters | Request parameters that affect the response |

**Delimiter choice:**
- Colon (`:`) separates structural segments (entity, operation, params)
- Pipe (`|`) separates composite parameter values within the params segment
- This avoids ambiguity: Teradata identifiers contain dots and underscores but never pipe characters; dataset IDs are integer strings

### Prior Decision: Depth Excluded from Lineage Key

Phase 28 decided that `maxDepth` is NOT included in the lineage cache key (decision in 28-02-SUMMARY.md). The cache stores whatever graph the first query produced. This decision carries forward into Phase 29 unchanged. The key `ol:lineage:graph:{dsId}|{field}|{dir}` does not include depth.

## TTL Strategy

### Default Values Per Requirement

| Data Type | Env Var | Default | Requirement |
|-----------|---------|---------|-------------|
| Lineage graphs | `CACHE_TTL_LINEAGE` | 1800s (30 min) | KEY-03 |
| Asset listings (namespaces, datasets, fields) | `CACHE_TTL_ASSETS` | 900s (15 min) | KEY-04 |
| Dataset statistics | `CACHE_TTL_STATISTICS` | 900s (15 min) | Same as assets |
| Dataset DDL | `CACHE_TTL_DDL` | 1800s (30 min) | Same as lineage (rarely changes) |
| Search results | `CACHE_TTL_SEARCH` | 300s (5 min) | Short, high variability |

### Rationale for TTL Values

- **30 min for lineage (KEY-03):** Lineage data changes only when `populate_lineage.py` runs (ETL cadence: hours to days). 30 minutes provides strong cache benefit while keeping staleness window acceptable. The recursive CTE query (150-500ms) is the most expensive operation.
- **15 min for assets (KEY-04):** Namespace and dataset metadata changes when new tables are created or metadata is populated. 15 minutes balances freshness with cache efficiency.
- **15 min for statistics:** Table statistics (row counts, sizes) change after ETL but not minute-to-minute. Matches asset cadence.
- **30 min for DDL:** Table/view definitions very rarely change. Frontend already uses 30-min `staleTime` for DDL data.
- **5 min for search:** Search queries are highly variable (many unique query strings). Short TTL prevents Redis memory from growing with rarely-reused entries.

### TTL Validation

No validation is needed beyond Viper's type conversion. Zero or negative TTL values will cause Redis `SET` with `EX 0` or negative, which Redis treats as "no expiry" or "delete immediately" respectively. Document this behavior but do not add validation -- operators who set `CACHE_TTL_LINEAGE=0` are intentionally disabling caching for that type.

## State of the Art

| Old Approach (Phase 28) | New Approach (Phase 29) | Impact |
|--------------------------|-------------------------|--------|
| Single TTL (`int`) for all cached methods | Per-type TTL via `CacheTTLConfig` struct | Different data types can expire independently |
| Colon-delimited params (`42:col:dir`) | Pipe-delimited params (`42\|col\|dir`) | Eliminates collision risk, matches KEY-02 format |
| Only 2 methods cached (graph + dataset) | All 8 endpoint-backing methods cached | Full v2 API benefits from caching |
| No key builder functions | Centralized `cache_keys.go` | Testable, consistent, DRY |
| TTL hardcoded in `main.go` | TTL from env vars via Viper | Ops-configurable without rebuild (KEY-05) |

## Open Questions

1. **CacheTTLConfig location: config package vs redis package?**
   - What we know: `config.go` already holds `ValidationConfig` and other config structs. The `redis` package holds the decorator.
   - What's unclear: If `CacheTTLConfig` is in `config`, the `redis` package imports `config`, which already imports `redis` for `redis.Config` -- potential circular import.
   - Recommendation: Define `CacheTTLConfig` in the `redis` package (alongside the decorator that uses it), similar to how `redis.Config` already exists there. Load values in `config.go` and construct `redis.CacheTTLConfig` in `main.go`. No circular import.

2. **Should ListFields be cached?**
   - What we know: `ListFields` is called by `OpenLineageService.GetDataset()` to populate the `fields` array. It is NOT directly exposed as an endpoint. However, every `GetDataset` call triggers a `ListFields` call.
   - What's unclear: Since `GetDataset` is already cached at the repository layer, the `ListFields` call only happens on cache miss. Caching `ListFields` separately would only help if `ListFields` were called independently (which it currently is not).
   - Recommendation: Cache `ListFields` for completeness. It follows the same pattern, adds minimal code, and future endpoints might expose it directly. Use AssetTTL.

3. **Should the v1 API endpoints be cached?**
   - What we know: The v1 API (`/api/v1/assets/*`, `/api/v1/lineage/*`, `/api/v1/search`) uses `AssetRepository`, `LineageRepository`, and `SearchRepository` -- separate interfaces from `OpenLineageRepository`.
   - What's unclear: Whether the user intends "all major read endpoints" to include v1.
   - Recommendation: Out of scope for Phase 29. The phase description says "Cache Keys, TTL & Full Coverage" with requirements KEY-01 through KEY-05, all of which reference the OpenLineage data model (`ol:` prefix, lineage and asset data types). The v1 API is a legacy compatibility layer. If v1 caching is needed, it can be a separate phase with its own decorator.

## Sources

### Primary (HIGH confidence)
- Codebase analysis: Direct inspection of all files listed in "Architecture Patterns" section. Every code example verified against existing implementation.
- Phase 28 artifacts: `28-RESEARCH.md`, `28-01-SUMMARY.md`, `28-02-SUMMARY.md`, `28-VERIFICATION.md` -- established patterns and decisions that Phase 29 extends.
- Phase 28 CONTEXT.md -- locked decisions (depth excluded, direction included, fail-fast, repository decorator).
- go.mod: go-redis v9.7.3 confirmed, viper v1.21.0 confirmed.

### Secondary (MEDIUM confidence)
- v6.0 Redis caching research: `.planning/research/v6.0-redis-caching/FEATURES.md` -- TTL strategy and endpoint mapping.
- v6.0 Redis caching research: `.planning/research/v6.0-redis-caching/PITFALLS.md` -- Key collision, pagination key space, JSON serialization pitfalls.
- Redis key naming conventions (community best practices) -- colon for structure, pipe or hash for parameter separation.

### Tertiary (LOW confidence)
- TTL values (30min lineage, 15min assets) are specified in the phase requirements, not derived from research. They are reasonable values but their optimality depends on actual ETL cadence which varies by deployment.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No new libraries. All existing dependencies verified in go.mod.
- Architecture: HIGH - Extends established Phase 28 decorator pattern. All touched files identified and read.
- Key format: HIGH - Deterministic, follows `ol:{entity}:{operation}:{params}` with pipe delimiters. Verified no collision risk.
- TTL strategy: HIGH - Defaults specified in requirements. Env var configuration follows existing Viper pattern.
- Pitfalls: HIGH - Backed by Phase 28 research, v6.0 caching research, and codebase analysis.

**Research date:** 2026-02-12
**Valid until:** 2026-03-12 (30 days -- stable domain, no external dependency changes)
