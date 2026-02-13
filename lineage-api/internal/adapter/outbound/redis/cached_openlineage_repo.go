package redis

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/lineage-api/internal/domain"
)

// Compile-time interface check.
var _ domain.OpenLineageRepository = (*CachedOpenLineageRepository)(nil)

// CachedOpenLineageRepository wraps an OpenLineageRepository with Redis cache-aside
// for expensive queries (GetColumnLineageGraph, GetDataset). All other methods
// delegate directly to the inner repository with zero overhead via Go embedding.
type CachedOpenLineageRepository struct {
	domain.OpenLineageRepository // embedded inner repo -- 13 uncached methods auto-delegate
	cache                        domain.CacheRepository
	ttl                          int // TTL in seconds
}

// NewCachedOpenLineageRepository creates a CachedOpenLineageRepository that wraps
// the inner repository with cache-aside for GetColumnLineageGraph and GetDataset.
func NewCachedOpenLineageRepository(
	inner domain.OpenLineageRepository,
	cache domain.CacheRepository,
	ttl int,
) *CachedOpenLineageRepository {
	return &CachedOpenLineageRepository{
		OpenLineageRepository: inner,
		cache:                 cache,
		ttl:                   ttl,
	}
}

// GetColumnLineageGraph uses cache-aside: check Redis first, fall through to inner
// repository on miss, populate cache on success.
//
// Cache key: ol:lineage:graph:{datasetID}:{fieldName}:{direction}
// Depth is excluded from the key because the same graph structure is returned
// regardless of depth (depth only affects traversal cutoff, and deeper queries
// produce supersets of shallower ones).
func (r *CachedOpenLineageRepository) GetColumnLineageGraph(ctx context.Context, datasetID, fieldName string, direction string, maxDepth int) (*domain.OpenLineageGraph, error) {
	key := fmt.Sprintf("ol:lineage:graph:%s:%s:%s", datasetID, fieldName, direction)

	// Try cache first
	var cached domain.OpenLineageGraph
	if err := r.cache.Get(ctx, key, &cached); err == nil {
		slog.DebugContext(ctx, "cache hit", "key", key)
		return &cached, nil
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
	if setErr := r.cache.Set(ctx, key, graph, r.ttl); setErr != nil {
		slog.WarnContext(ctx, "cache set failed", "key", key, "error", setErr)
	} else {
		slog.DebugContext(ctx, "cache populated", "key", key, "ttl", r.ttl)
	}

	return graph, nil
}

// GetDataset uses cache-aside: check Redis first, fall through to inner
// repository on miss, populate cache on success.
//
// Cache key: ol:dataset:{datasetID}
func (r *CachedOpenLineageRepository) GetDataset(ctx context.Context, datasetID string) (*domain.OpenLineageDataset, error) {
	key := fmt.Sprintf("ol:dataset:%s", datasetID)

	// Try cache first
	var cached domain.OpenLineageDataset
	if err := r.cache.Get(ctx, key, &cached); err == nil {
		slog.DebugContext(ctx, "cache hit", "key", key)
		return &cached, nil
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
	if setErr := r.cache.Set(ctx, key, dataset, r.ttl); setErr != nil {
		slog.WarnContext(ctx, "cache set failed", "key", key, "error", setErr)
	} else {
		slog.DebugContext(ctx, "cache populated", "key", key, "ttl", r.ttl)
	}

	return dataset, nil
}
