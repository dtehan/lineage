package redis

import "context"

// contextKey is an unexported type for context keys in this package,
// preventing collisions with keys defined in other packages.
type contextKey string

const (
	cacheMetadataKey contextKey = "cacheMetadata"
	cacheBypassKey   contextKey = "cacheBypass"
)

// CacheMetadata carries cache status information through the request context.
// The middleware seeds this into the context, the cached repository populates it,
// and the middleware reads it back to set response headers.
type CacheMetadata struct {
	Hit     bool // true if the response was served from cache
	TTL     int  // seconds remaining on cache entry (-1 if not cached)
	Touched bool // true if a cache-aside method was invoked (distinguishes cached from uncached endpoints)
}

// NewCacheMetadataContext stores a fresh CacheMetadata pointer in the context.
func NewCacheMetadataContext(ctx context.Context) context.Context {
	return context.WithValue(ctx, cacheMetadataKey, &CacheMetadata{TTL: -1})
}

// GetCacheMetadata retrieves the CacheMetadata pointer from the context.
// Returns nil if no metadata was stored (e.g., non-v2 endpoints).
func GetCacheMetadata(ctx context.Context) *CacheMetadata {
	md, _ := ctx.Value(cacheMetadataKey).(*CacheMetadata)
	return md
}

// WithCacheBypass stores a bypass signal in the context, instructing the
// cached repository to skip the cache read and fetch fresh data.
func WithCacheBypass(ctx context.Context) context.Context {
	return context.WithValue(ctx, cacheBypassKey, true)
}

// IsCacheBypass reads the bypass signal from the context.
// Returns false if no signal was stored.
func IsCacheBypass(ctx context.Context) bool {
	bypass, _ := ctx.Value(cacheBypassKey).(bool)
	return bypass
}
