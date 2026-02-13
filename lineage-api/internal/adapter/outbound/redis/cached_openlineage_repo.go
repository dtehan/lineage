package redis

import (
	"context"
	"log/slog"

	"github.com/lineage-api/internal/domain"
)

// Compile-time interface check.
var _ domain.OpenLineageRepository = (*CachedOpenLineageRepository)(nil)

// CachedOpenLineageRepository wraps an OpenLineageRepository with Redis cache-aside
// for all endpoint-backing read methods. Methods not exposed as API endpoints
// delegate directly to the inner repository with zero overhead via Go embedding.
type CachedOpenLineageRepository struct {
	domain.OpenLineageRepository // embedded inner repo -- 7 uncached methods auto-delegate
	cache                        domain.CacheRepository
	ttls                         CacheTTLConfig
}

// NewCachedOpenLineageRepository creates a CachedOpenLineageRepository that wraps
// the inner repository with cache-aside for all endpoint-backing methods.
func NewCachedOpenLineageRepository(
	inner domain.OpenLineageRepository,
	cache domain.CacheRepository,
	ttls CacheTTLConfig,
) *CachedOpenLineageRepository {
	return &CachedOpenLineageRepository{
		OpenLineageRepository: inner,
		cache:                 cache,
		ttls:                  ttls,
	}
}

// GetColumnLineageGraph uses cache-aside: check Redis first, fall through to inner
// repository on miss, populate cache on success.
//
// Key: ol:lineage:graph:{datasetID}|{fieldName}|{direction}
// Depth is excluded from the key because the same graph structure is returned
// regardless of depth (depth only affects traversal cutoff, and deeper queries
// produce supersets of shallower ones).
func (r *CachedOpenLineageRepository) GetColumnLineageGraph(ctx context.Context, datasetID, fieldName string, direction string, maxDepth int) (*domain.OpenLineageGraph, error) {
	key := LineageGraphKey(datasetID, fieldName, direction)
	md := GetCacheMetadata(ctx)

	// Try cache first (skip on bypass)
	if !IsCacheBypass(ctx) {
		var cached domain.OpenLineageGraph
		if err := r.cache.Get(ctx, key, &cached); err == nil {
			slog.DebugContext(ctx, "cache hit", "key", key)
			if md != nil {
				md.Hit = true
				md.Touched = true
				if ttl, err := r.cache.TTL(ctx, key); err == nil {
					md.TTL = ttl
				}
			}
			return &cached, nil
		}
	}
	slog.DebugContext(ctx, "cache miss", "key", key)

	// Fall through to inner repository
	graph, err := r.OpenLineageRepository.GetColumnLineageGraph(ctx, datasetID, fieldName, direction, maxDepth)
	if err != nil {
		return nil, err
	}
	if graph == nil {
		return nil, nil
	}

	// Populate cache (fire-and-forget on error)
	if setErr := r.cache.Set(ctx, key, graph, r.ttls.LineageTTL); setErr != nil {
		slog.WarnContext(ctx, "cache set failed", "key", key, "error", setErr)
	} else {
		slog.DebugContext(ctx, "cache populated", "key", key, "ttl", r.ttls.LineageTTL)
	}
	if md != nil {
		md.Hit = false
		md.Touched = true
		md.TTL = r.ttls.LineageTTL
	}

	return graph, nil
}

// GetDataset uses cache-aside: check Redis first, fall through to inner
// repository on miss, populate cache on success.
//
// Key: ol:dataset:get:{datasetID}
func (r *CachedOpenLineageRepository) GetDataset(ctx context.Context, datasetID string) (*domain.OpenLineageDataset, error) {
	key := DatasetKey(datasetID)
	md := GetCacheMetadata(ctx)

	// Try cache first (skip on bypass)
	if !IsCacheBypass(ctx) {
		var cached domain.OpenLineageDataset
		if err := r.cache.Get(ctx, key, &cached); err == nil {
			slog.DebugContext(ctx, "cache hit", "key", key)
			if md != nil {
				md.Hit = true
				md.Touched = true
				if ttl, err := r.cache.TTL(ctx, key); err == nil {
					md.TTL = ttl
				}
			}
			return &cached, nil
		}
	}
	slog.DebugContext(ctx, "cache miss", "key", key)

	// Fall through to inner repository
	dataset, err := r.OpenLineageRepository.GetDataset(ctx, datasetID)
	if err != nil {
		return nil, err
	}
	if dataset == nil {
		return nil, nil
	}

	// Populate cache (fire-and-forget on error)
	if setErr := r.cache.Set(ctx, key, dataset, r.ttls.AssetTTL); setErr != nil {
		slog.WarnContext(ctx, "cache set failed", "key", key, "error", setErr)
	} else {
		slog.DebugContext(ctx, "cache populated", "key", key, "ttl", r.ttls.AssetTTL)
	}
	if md != nil {
		md.Hit = false
		md.Touched = true
		md.TTL = r.ttls.AssetTTL
	}

	return dataset, nil
}

// ListNamespaces uses cache-aside for the namespace listing.
//
// Key: ol:namespace:list
func (r *CachedOpenLineageRepository) ListNamespaces(ctx context.Context) ([]domain.OpenLineageNamespace, error) {
	key := NamespacesKey()
	md := GetCacheMetadata(ctx)

	// Try cache first (skip on bypass)
	if !IsCacheBypass(ctx) {
		var cached []domain.OpenLineageNamespace
		if err := r.cache.Get(ctx, key, &cached); err == nil {
			slog.DebugContext(ctx, "cache hit", "key", key)
			if md != nil {
				md.Hit = true
				md.Touched = true
				if ttl, err := r.cache.TTL(ctx, key); err == nil {
					md.TTL = ttl
				}
			}
			return cached, nil
		}
	}
	slog.DebugContext(ctx, "cache miss", "key", key)

	result, err := r.OpenLineageRepository.ListNamespaces(ctx)
	if err != nil {
		return nil, err
	}
	if result == nil {
		return nil, nil
	}

	if setErr := r.cache.Set(ctx, key, result, r.ttls.AssetTTL); setErr != nil {
		slog.WarnContext(ctx, "cache set failed", "key", key, "error", setErr)
	} else {
		slog.DebugContext(ctx, "cache populated", "key", key, "ttl", r.ttls.AssetTTL)
	}
	if md != nil {
		md.Hit = false
		md.Touched = true
		md.TTL = r.ttls.AssetTTL
	}

	return result, nil
}

// GetNamespace uses cache-aside for individual namespace retrieval.
//
// Key: ol:namespace:get:{namespaceID}
func (r *CachedOpenLineageRepository) GetNamespace(ctx context.Context, namespaceID string) (*domain.OpenLineageNamespace, error) {
	key := NamespaceKey(namespaceID)
	md := GetCacheMetadata(ctx)

	// Try cache first (skip on bypass)
	if !IsCacheBypass(ctx) {
		var cached domain.OpenLineageNamespace
		if err := r.cache.Get(ctx, key, &cached); err == nil {
			slog.DebugContext(ctx, "cache hit", "key", key)
			if md != nil {
				md.Hit = true
				md.Touched = true
				if ttl, err := r.cache.TTL(ctx, key); err == nil {
					md.TTL = ttl
				}
			}
			return &cached, nil
		}
	}
	slog.DebugContext(ctx, "cache miss", "key", key)

	result, err := r.OpenLineageRepository.GetNamespace(ctx, namespaceID)
	if err != nil {
		return nil, err
	}
	if result == nil {
		return nil, nil
	}

	if setErr := r.cache.Set(ctx, key, result, r.ttls.AssetTTL); setErr != nil {
		slog.WarnContext(ctx, "cache set failed", "key", key, "error", setErr)
	} else {
		slog.DebugContext(ctx, "cache populated", "key", key, "ttl", r.ttls.AssetTTL)
	}
	if md != nil {
		md.Hit = false
		md.Touched = true
		md.TTL = r.ttls.AssetTTL
	}

	return result, nil
}

// listDatasetsResult is an internal type for caching ListDatasets responses.
// ListDatasets returns ([]OpenLineageDataset, int, error) -- the wrapper bundles
// the slice and total count into a single JSON-serializable value.
type listDatasetsResult struct {
	Datasets []domain.OpenLineageDataset `json:"datasets"`
	Total    int                          `json:"total"`
}

// ListDatasets uses cache-aside for paginated dataset listings.
//
// Key: ol:dataset:list:{namespaceID}|{limit}|{offset}
func (r *CachedOpenLineageRepository) ListDatasets(ctx context.Context, namespaceID string, limit, offset int) ([]domain.OpenLineageDataset, int, error) {
	key := DatasetsKey(namespaceID, limit, offset)
	md := GetCacheMetadata(ctx)

	// Try cache first (skip on bypass)
	if !IsCacheBypass(ctx) {
		var cached listDatasetsResult
		if err := r.cache.Get(ctx, key, &cached); err == nil {
			slog.DebugContext(ctx, "cache hit", "key", key)
			if md != nil {
				md.Hit = true
				md.Touched = true
				if ttl, err := r.cache.TTL(ctx, key); err == nil {
					md.TTL = ttl
				}
			}
			return cached.Datasets, cached.Total, nil
		}
	}
	slog.DebugContext(ctx, "cache miss", "key", key)

	datasets, total, err := r.OpenLineageRepository.ListDatasets(ctx, namespaceID, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	if datasets == nil {
		return nil, 0, nil
	}

	wrapper := listDatasetsResult{Datasets: datasets, Total: total}
	if setErr := r.cache.Set(ctx, key, wrapper, r.ttls.AssetTTL); setErr != nil {
		slog.WarnContext(ctx, "cache set failed", "key", key, "error", setErr)
	} else {
		slog.DebugContext(ctx, "cache populated", "key", key, "ttl", r.ttls.AssetTTL)
	}
	if md != nil {
		md.Hit = false
		md.Touched = true
		md.TTL = r.ttls.AssetTTL
	}

	return datasets, total, nil
}

// SearchDatasets uses cache-aside for dataset search results.
// The search key normalizes the query to uppercase and trims whitespace
// to match Teradata's case-insensitive LIKE behavior.
//
// Key: ol:dataset:search:{QUERY}|{limit}
func (r *CachedOpenLineageRepository) SearchDatasets(ctx context.Context, query string, limit int) ([]domain.OpenLineageDataset, error) {
	key := DatasetSearchKey(query, limit)
	md := GetCacheMetadata(ctx)

	// Try cache first (skip on bypass)
	if !IsCacheBypass(ctx) {
		var cached []domain.OpenLineageDataset
		if err := r.cache.Get(ctx, key, &cached); err == nil {
			slog.DebugContext(ctx, "cache hit", "key", key)
			if md != nil {
				md.Hit = true
				md.Touched = true
				if ttl, err := r.cache.TTL(ctx, key); err == nil {
					md.TTL = ttl
				}
			}
			return cached, nil
		}
	}
	slog.DebugContext(ctx, "cache miss", "key", key)

	result, err := r.OpenLineageRepository.SearchDatasets(ctx, query, limit)
	if err != nil {
		return nil, err
	}
	if result == nil {
		return nil, nil
	}

	if setErr := r.cache.Set(ctx, key, result, r.ttls.SearchTTL); setErr != nil {
		slog.WarnContext(ctx, "cache set failed", "key", key, "error", setErr)
	} else {
		slog.DebugContext(ctx, "cache populated", "key", key, "ttl", r.ttls.SearchTTL)
	}
	if md != nil {
		md.Hit = false
		md.Touched = true
		md.TTL = r.ttls.SearchTTL
	}

	return result, nil
}

// ListFields uses cache-aside for field listings.
//
// Key: ol:field:list:{datasetID}
func (r *CachedOpenLineageRepository) ListFields(ctx context.Context, datasetID string) ([]domain.OpenLineageField, error) {
	key := FieldsKey(datasetID)
	md := GetCacheMetadata(ctx)

	// Try cache first (skip on bypass)
	if !IsCacheBypass(ctx) {
		var cached []domain.OpenLineageField
		if err := r.cache.Get(ctx, key, &cached); err == nil {
			slog.DebugContext(ctx, "cache hit", "key", key)
			if md != nil {
				md.Hit = true
				md.Touched = true
				if ttl, err := r.cache.TTL(ctx, key); err == nil {
					md.TTL = ttl
				}
			}
			return cached, nil
		}
	}
	slog.DebugContext(ctx, "cache miss", "key", key)

	result, err := r.OpenLineageRepository.ListFields(ctx, datasetID)
	if err != nil {
		return nil, err
	}
	if result == nil {
		return nil, nil
	}

	if setErr := r.cache.Set(ctx, key, result, r.ttls.AssetTTL); setErr != nil {
		slog.WarnContext(ctx, "cache set failed", "key", key, "error", setErr)
	} else {
		slog.DebugContext(ctx, "cache populated", "key", key, "ttl", r.ttls.AssetTTL)
	}
	if md != nil {
		md.Hit = false
		md.Touched = true
		md.TTL = r.ttls.AssetTTL
	}

	return result, nil
}

// GetDatasetStatistics uses cache-aside for dataset statistics.
//
// Key: ol:dataset:statistics:{datasetID}
func (r *CachedOpenLineageRepository) GetDatasetStatistics(ctx context.Context, datasetID string) (*domain.DatasetStatistics, error) {
	key := DatasetStatisticsKey(datasetID)
	md := GetCacheMetadata(ctx)

	// Try cache first (skip on bypass)
	if !IsCacheBypass(ctx) {
		var cached domain.DatasetStatistics
		if err := r.cache.Get(ctx, key, &cached); err == nil {
			slog.DebugContext(ctx, "cache hit", "key", key)
			if md != nil {
				md.Hit = true
				md.Touched = true
				if ttl, err := r.cache.TTL(ctx, key); err == nil {
					md.TTL = ttl
				}
			}
			return &cached, nil
		}
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
	if md != nil {
		md.Hit = false
		md.Touched = true
		md.TTL = r.ttls.StatisticsTTL
	}

	return result, nil
}

// GetDatasetDDL uses cache-aside for dataset DDL.
//
// Key: ol:dataset:ddl:{datasetID}
func (r *CachedOpenLineageRepository) GetDatasetDDL(ctx context.Context, datasetID string) (*domain.DatasetDDL, error) {
	key := DatasetDDLKey(datasetID)
	md := GetCacheMetadata(ctx)

	// Try cache first (skip on bypass)
	if !IsCacheBypass(ctx) {
		var cached domain.DatasetDDL
		if err := r.cache.Get(ctx, key, &cached); err == nil {
			slog.DebugContext(ctx, "cache hit", "key", key)
			if md != nil {
				md.Hit = true
				md.Touched = true
				if ttl, err := r.cache.TTL(ctx, key); err == nil {
					md.TTL = ttl
				}
			}
			return &cached, nil
		}
	}
	slog.DebugContext(ctx, "cache miss", "key", key)

	result, err := r.OpenLineageRepository.GetDatasetDDL(ctx, datasetID)
	if err != nil {
		return nil, err
	}
	if result == nil {
		return nil, nil
	}

	if setErr := r.cache.Set(ctx, key, result, r.ttls.DDLTTL); setErr != nil {
		slog.WarnContext(ctx, "cache set failed", "key", key, "error", setErr)
	} else {
		slog.DebugContext(ctx, "cache populated", "key", key, "ttl", r.ttls.DDLTTL)
	}
	if md != nil {
		md.Hit = false
		md.Touched = true
		md.TTL = r.ttls.DDLTTL
	}

	return result, nil
}
