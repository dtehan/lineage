package http

import (
	"context"
	"net/http"
	"strconv"

	"github.com/lineage-api/internal/adapter/outbound/redis"
)

// cacheResponseWriter wraps http.ResponseWriter to inject cache status headers
// (X-Cache, X-Cache-TTL) based on CacheMetadata propagated through the request context.
type cacheResponseWriter struct {
	http.ResponseWriter
	ctx         context.Context
	wroteHeader bool
}

// WriteHeader injects cache headers before writing the HTTP status code.
// Headers are only set when CacheMetadata.Touched is true (i.e., a cache-aside
// method was invoked), ensuring uncached endpoints produce no X-Cache headers.
func (crw *cacheResponseWriter) WriteHeader(code int) {
	if !crw.wroteHeader {
		crw.wroteHeader = true
		if md := redis.GetCacheMetadata(crw.ctx); md != nil && md.Touched {
			if md.Hit {
				crw.ResponseWriter.Header().Set("X-Cache", "HIT")
				if md.TTL >= 0 {
					crw.ResponseWriter.Header().Set("X-Cache-TTL", strconv.Itoa(md.TTL))
				}
			} else {
				crw.ResponseWriter.Header().Set("X-Cache", "MISS")
			}
		}
	}
	crw.ResponseWriter.WriteHeader(code)
}

// Write ensures WriteHeader is called before writing the response body,
// so cache headers are always present regardless of whether the handler
// called WriteHeader explicitly.
func (crw *cacheResponseWriter) Write(b []byte) (int, error) {
	if !crw.wroteHeader {
		crw.WriteHeader(http.StatusOK)
	}
	return crw.ResponseWriter.Write(b)
}

// Unwrap returns the underlying ResponseWriter, supporting http.ResponseController
// and middleware chaining patterns that rely on interface unwrapping.
func (crw *cacheResponseWriter) Unwrap() http.ResponseWriter {
	return crw.ResponseWriter
}

// CacheControl is a Chi middleware that provides cache observability headers
// and cache bypass support for v2 API endpoints.
//
// On each request it:
//  1. Seeds a CacheMetadata pointer into the context (for the cached repository to populate)
//  2. Checks for ?refresh=true query parameter and sets bypass signal if present
//  3. Wraps the ResponseWriter to inject X-Cache and X-Cache-TTL headers
//
// The middleware reads metadata written by CachedOpenLineageRepository during
// request handling and translates it into HTTP response headers:
//   - X-Cache: HIT or MISS (only on endpoints backed by cached methods)
//   - X-Cache-TTL: seconds remaining (only on cache HITs with valid TTL)
func CacheControl(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx := redis.NewCacheMetadataContext(r.Context())

		if r.URL.Query().Get("refresh") == "true" {
			ctx = redis.WithCacheBypass(ctx)
		}

		crw := &cacheResponseWriter{ResponseWriter: w, ctx: ctx}
		next.ServeHTTP(crw, r.WithContext(ctx))
	})
}
