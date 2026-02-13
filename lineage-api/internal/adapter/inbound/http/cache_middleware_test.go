package http

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/lineage-api/internal/adapter/outbound/redis"
)

func TestCacheMiddleware_HIT_Header(t *testing.T) {
	// Handler simulates what CachedOpenLineageRepository does on a cache hit:
	// populate CacheMetadata with Hit=true, Touched=true, TTL from cache.
	handler := CacheControl(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		md := redis.GetCacheMetadata(r.Context())
		require.NotNil(t, md)
		md.Hit = true
		md.Touched = true
		md.TTL = 900

		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"data":"cached"}`))
	}))

	req := httptest.NewRequest(http.MethodGet, "/api/v2/openlineage/namespaces", nil)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusOK, rec.Code)
	assert.Equal(t, "HIT", rec.Header().Get("X-Cache"))
	assert.Equal(t, "900", rec.Header().Get("X-Cache-TTL"))
}

func TestCacheMiddleware_MISS_Header(t *testing.T) {
	handler := CacheControl(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		md := redis.GetCacheMetadata(r.Context())
		require.NotNil(t, md)
		md.Hit = false
		md.Touched = true
		// TTL remains -1 (default from NewCacheMetadataContext)

		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"data":"fresh"}`))
	}))

	req := httptest.NewRequest(http.MethodGet, "/api/v2/openlineage/datasets/42", nil)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusOK, rec.Code)
	assert.Equal(t, "MISS", rec.Header().Get("X-Cache"))
	assert.Empty(t, rec.Header().Get("X-Cache-TTL"), "X-Cache-TTL should not be set on MISS")
}

func TestCacheMiddleware_RefreshTrue_SetsBypass(t *testing.T) {
	var bypassDetected bool

	handler := CacheControl(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		bypassDetected = redis.IsCacheBypass(r.Context())
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "/api/v2/openlineage/namespaces?refresh=true", nil)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	assert.True(t, bypassDetected, "refresh=true should set cache bypass in context")
}

func TestCacheMiddleware_NoRefreshParam_NoBypass(t *testing.T) {
	var bypassDetected bool

	handler := CacheControl(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		bypassDetected = redis.IsCacheBypass(r.Context())
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "/api/v2/openlineage/namespaces", nil)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	assert.False(t, bypassDetected, "no refresh param should not set bypass")
}

func TestCacheMiddleware_UntouchedMetadata_NoHeaders(t *testing.T) {
	// Simulates an uncached endpoint within the v2 route group:
	// CacheMetadata exists but Touched remains false.
	handler := CacheControl(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Do not touch metadata -- simulates non-cached endpoint
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"ok"}`))
	}))

	req := httptest.NewRequest(http.MethodGet, "/api/v2/openlineage/jobs", nil)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusOK, rec.Code)
	assert.Empty(t, rec.Header().Get("X-Cache"), "X-Cache should not be set for untouched metadata")
	assert.Empty(t, rec.Header().Get("X-Cache-TTL"), "X-Cache-TTL should not be set for untouched metadata")
}

func TestCacheMiddleware_Unwrap_ReturnsInnerWriter(t *testing.T) {
	inner := httptest.NewRecorder()
	crw := &cacheResponseWriter{
		ResponseWriter: inner,
	}

	assert.Equal(t, inner, crw.Unwrap(), "Unwrap should return the original ResponseWriter")
}

func TestCacheMiddleware_WriteWithoutWriteHeader_ImplicitOK(t *testing.T) {
	// Verifies that Write() calls WriteHeader(200) implicitly,
	// which triggers cache header injection.
	handler := CacheControl(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		md := redis.GetCacheMetadata(r.Context())
		require.NotNil(t, md)
		md.Hit = true
		md.Touched = true
		md.TTL = 600

		// Write without explicit WriteHeader -- should auto-inject headers
		w.Write([]byte(`{"data":"auto-header"}`))
	}))

	req := httptest.NewRequest(http.MethodGet, "/api/v2/openlineage/datasets/42", nil)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusOK, rec.Code)
	assert.Equal(t, "HIT", rec.Header().Get("X-Cache"))
	assert.Equal(t, "600", rec.Header().Get("X-Cache-TTL"))
}

func TestCacheMiddleware_HIT_ZeroTTL(t *testing.T) {
	// TTL=0 is a valid value (key about to expire).
	handler := CacheControl(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		md := redis.GetCacheMetadata(r.Context())
		require.NotNil(t, md)
		md.Hit = true
		md.Touched = true
		md.TTL = 0

		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "/api/v2/openlineage/namespaces", nil)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	assert.Equal(t, "HIT", rec.Header().Get("X-Cache"))
	assert.Equal(t, "0", rec.Header().Get("X-Cache-TTL"))
}
