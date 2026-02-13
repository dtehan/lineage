package redis

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/lineage-api/internal/domain"
)

// Config holds Redis connection configuration.
type Config struct {
	Addr     string
	Password string
	DB       int
}

// CacheTTLConfig holds per-data-type cache TTL values in seconds.
type CacheTTLConfig struct {
	LineageTTL    int // Lineage graph queries (default: 1800s = 30 min)
	AssetTTL      int // Asset listings: namespaces, datasets, fields (default: 900s = 15 min)
	StatisticsTTL int // Dataset statistics (default: 900s = 15 min)
	DDLTTL        int // Dataset DDL (default: 1800s = 30 min)
	SearchTTL     int // Search results (default: 300s = 5 min)
}

// CacheRepository implements domain.CacheRepository using Redis.
type CacheRepository struct {
	client *redis.Client
}

// NewCacheRepository creates a new Redis-backed cache repository.
func NewCacheRepository(cfg Config) (*CacheRepository, error) {
	client := redis.NewClient(&redis.Options{
		Addr:     cfg.Addr,
		Password: cfg.Password,
		DB:       cfg.DB,
	})

	// Test the connection
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := client.Ping(ctx).Err(); err != nil {
		return nil, err
	}

	return &CacheRepository{client: client}, nil
}

// Get retrieves a value from the cache.
func (r *CacheRepository) Get(ctx context.Context, key string, dest any) error {
	val, err := r.client.Get(ctx, key).Result()
	if err != nil {
		return err
	}
	return json.Unmarshal([]byte(val), dest)
}

// Set stores a value in the cache with the given TTL.
func (r *CacheRepository) Set(ctx context.Context, key string, value any, ttlSeconds int) error {
	data, err := json.Marshal(value)
	if err != nil {
		return err
	}
	return r.client.Set(ctx, key, data, time.Duration(ttlSeconds)*time.Second).Err()
}

// Delete removes a value from the cache.
func (r *CacheRepository) Delete(ctx context.Context, key string) error {
	return r.client.Del(ctx, key).Err()
}

// Exists checks if a key exists in the cache.
func (r *CacheRepository) Exists(ctx context.Context, key string) (bool, error) {
	n, err := r.client.Exists(ctx, key).Result()
	if err != nil {
		return false, err
	}
	return n > 0, nil
}

// Close closes the Redis client connection.
func (r *CacheRepository) Close() error {
	return r.client.Close()
}

// NoOpCache is a no-operation cache implementation used when Redis is unavailable.
type NoOpCache struct{}

// NewNoOpCache creates a new NoOpCache.
func NewNoOpCache() domain.CacheRepository {
	return &NoOpCache{}
}

// ErrCacheMiss is returned when a key is not found in the cache.
var ErrCacheMiss = errors.New("cache miss")

// Get always returns a cache miss error.
func (c *NoOpCache) Get(ctx context.Context, key string, dest any) error {
	return ErrCacheMiss
}

// Set does nothing and returns nil.
func (c *NoOpCache) Set(ctx context.Context, key string, value any, ttlSeconds int) error {
	return nil
}

// Delete does nothing and returns nil.
func (c *NoOpCache) Delete(ctx context.Context, key string) error {
	return nil
}

// Exists always returns false.
func (c *NoOpCache) Exists(ctx context.Context, key string) (bool, error) {
	return false, nil
}

// Close is a no-op (satisfies io.Closer for uniform cleanup).
func (c *NoOpCache) Close() error {
	return nil
}
