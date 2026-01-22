package redis

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
)

// TC-CACHE-020: NoOp Cache When Redis Unavailable
func TestNoOpCache(t *testing.T) {
	cache := NewNoOpCache()
	ctx := context.Background()

	// TC-CACHE-021: NoOp Cache Get Returns Error
	t.Run("Get always returns cache miss", func(t *testing.T) {
		var result string
		err := cache.Get(ctx, "any-key", &result)

		assert.Error(t, err)
		assert.Equal(t, ErrCacheMiss, err)
	})

	// TC-CACHE-022: NoOp Cache Set Does Nothing
	t.Run("Set does nothing and returns nil", func(t *testing.T) {
		err := cache.Set(ctx, "test-key", "test-value", 300)

		assert.NoError(t, err)

		// Verify Get still returns error
		var result string
		err = cache.Get(ctx, "test-key", &result)
		assert.Error(t, err)
		assert.Equal(t, ErrCacheMiss, err)
	})

	// Test Delete does nothing
	t.Run("Delete does nothing and returns nil", func(t *testing.T) {
		err := cache.Delete(ctx, "any-key")
		assert.NoError(t, err)
	})

	// Test Exists always returns false
	t.Run("Exists always returns false", func(t *testing.T) {
		exists, err := cache.Exists(ctx, "any-key")

		assert.NoError(t, err)
		assert.False(t, exists)
	})
}

// Test NoOpCache implements CacheRepository interface
func TestNoOpCacheImplementsInterface(t *testing.T) {
	cache := NewNoOpCache()

	// This test verifies compile-time interface compliance
	assert.NotNil(t, cache)
}
