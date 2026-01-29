# Phase 1: Error Handling Foundation - Research

**Researched:** 2026-01-29
**Domain:** Go API Error Handling, Structured Logging, Security Hardening
**Confidence:** HIGH

## Summary

This phase implements secure error handling for the Go backend API. The current implementation directly exposes database error messages to API consumers (e.g., `respondError(w, http.StatusInternalServerError, err.Error())`), which violates security requirements SEC-03 and SEC-04 by potentially leaking SQL syntax, table names, connection details, and schema information.

The standard approach in Go APIs involves: (1) wrapping all errors in generic API responses at the handler level, (2) using structured logging with `log/slog` to capture full error details server-side, and (3) generating request IDs for error correlation between responses and logs. Go 1.21+ includes `log/slog` in the standard library, making it the recommended choice for structured logging without external dependencies.

**Primary recommendation:** Implement a two-layer error handling pattern: handlers return generic error responses with request IDs while logging full error context (including wrapped errors, stack traces, and request metadata) server-side using `log/slog` with JSON output.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| log/slog | Go 1.21+ stdlib | Structured logging | Standard library since Go 1.21; JSON/text output; zero external dependencies |
| chi/v5/middleware.RequestID | v5.0.11 | Request ID generation | Already in use; generates unique request IDs, stores in context |
| chi/v5/middleware.Recoverer | v5.0.11 | Panic recovery | Already in use; catches panics, returns HTTP 500 |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| samber/slog-chi | latest | Chi middleware for slog | If httplog pattern too verbose; integrates request logging directly |
| go-chi/httplog | latest | HTTP request logging | Alternative if centralized HTTP logging desired |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| log/slog | zerolog/zap | External dependency; marginal performance gains not needed for this API |
| Custom error types | cockroachdb/errors | Overkill; standard Go errors + wrapping sufficient |

**Installation:**
No additional installation needed - `log/slog` is part of Go 1.21+ standard library. Chi middleware already in go.mod.

## Architecture Patterns

### Recommended Project Structure
```
lineage-api/internal/
├── adapter/inbound/http/
│   ├── handlers.go          # Handlers call respondError with generic messages
│   ├── response.go          # ErrorResponse struct with request_id, code, message
│   ├── middleware.go        # NEW: RequestID extraction, error logging middleware
│   └── errors.go            # NEW: APIError interface, sentinel errors
├── infrastructure/
│   └── logging/
│       └── logger.go        # NEW: slog configuration and initialization
```

### Pattern 1: Two-Layer Error Response
**What:** Separate internal error details from API responses
**When to use:** All database and service errors in handlers
**Example:**
```go
// Source: Go error handling patterns
// Handler layer - returns generic message, logs full detail
func (h *Handler) ListDatabases(w http.ResponseWriter, r *http.Request) {
    ctx := r.Context()
    requestID := middleware.GetReqID(ctx)

    databases, err := h.assetService.ListDatabases(ctx)
    if err != nil {
        // Log full error with context
        slog.ErrorContext(ctx, "failed to list databases",
            "request_id", requestID,
            "error", err,
            "path", r.URL.Path,
        )
        // Return generic message
        respondError(w, http.StatusInternalServerError, "Internal server error", requestID)
        return
    }
    // ...
}
```

### Pattern 2: Structured Error Response Format
**What:** Consistent JSON error response structure
**When to use:** All error responses
**Example:**
```go
// Source: API design best practices
type ErrorResponse struct {
    Error     string `json:"error"`      // Generic message for client
    RequestID string `json:"request_id"` // For support/debugging
    Code      string `json:"code,omitempty"` // Optional: machine-readable code
}

func respondError(w http.ResponseWriter, status int, message, requestID string) {
    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(status)
    json.NewEncoder(w).Encode(ErrorResponse{
        Error:     message,
        RequestID: requestID,
    })
}
```

### Pattern 3: Structured Logger with JSON Output
**What:** Configure slog for JSON-formatted server-side logging
**When to use:** Production logging configuration
**Example:**
```go
// Source: pkg.go.dev/log/slog
func NewLogger() *slog.Logger {
    opts := &slog.HandlerOptions{
        Level:     slog.LevelInfo,
        AddSource: true, // Include file:line in logs
    }
    handler := slog.NewJSONHandler(os.Stdout, opts)
    return slog.New(handler)
}

// Set as default at startup
slog.SetDefault(NewLogger())
```

### Pattern 4: Request ID Middleware Integration
**What:** Extract Chi request ID and add to logger context
**When to use:** All logged errors
**Example:**
```go
// Source: github.com/go-chi/chi/v5/middleware
func GetRequestLogger(ctx context.Context) *slog.Logger {
    requestID := middleware.GetReqID(ctx)
    return slog.Default().With("request_id", requestID)
}

// Usage in handler
logger := GetRequestLogger(r.Context())
logger.Error("database query failed", "error", err)
```

### Anti-Patterns to Avoid
- **Direct error exposure:** Never use `err.Error()` in API responses - leaks internal details
- **Inconsistent error format:** Always use structured ErrorResponse, not plain strings
- **Missing request ID:** Every error log and response must include request_id
- **Logging sensitive data:** Don't log passwords, tokens, or full SQL with user data

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Request ID generation | UUID generation per request | chi/v5/middleware.RequestID | Already configured, consistent format, stored in context |
| Panic recovery | Try-catch pattern | chi/v5/middleware.Recoverer | Properly catches panics, prevents server crash |
| JSON logging | fmt.Printf with JSON formatting | slog.NewJSONHandler | Proper escaping, structured fields, performance |
| Error context | Manual string concatenation | slog.With() / slog.ErrorContext() | Type-safe, structured, queryable |

**Key insight:** Chi already provides RequestID and Recoverer middleware. The existing router uses them but the error responses don't include request IDs and detailed logging isn't configured.

## Common Pitfalls

### Pitfall 1: Information Leakage Through Error Messages
**What goes wrong:** Database errors like "relation 'LIN_DATABASE' does not exist" or "authentication failed for user 'demo_user'" exposed in API responses
**Why it happens:** Direct use of `err.Error()` in `respondError()` calls
**How to avoid:** Always use static generic messages like "Internal server error" for 5xx errors
**Warning signs:** Tests that check error response content find SQL keywords, table names, or connection strings

### Pitfall 2: Missing Request ID Correlation
**What goes wrong:** Cannot correlate client-reported errors with server logs
**Why it happens:** Request ID generated but not included in responses or logs
**How to avoid:** Pass request ID to both `respondError()` and `slog.Error()` calls
**Warning signs:** Support requests mention errors but no way to find matching server logs

### Pitfall 3: Logging Sensitive Data
**What goes wrong:** Passwords, API keys, or user PII appear in logs
**Why it happens:** Logging entire request objects or error details without filtering
**How to avoid:** Log only specific fields needed for debugging; implement LogValuer for sensitive types
**Warning signs:** Grep logs for "password", "token", "secret" - if found, there's a leak

### Pitfall 4: Inconsistent Error Response Structure
**What goes wrong:** Some endpoints return `{"error": "message"}`, others return `{"message": "text"}` or plain text
**Why it happens:** Multiple developers adding error handling without standard
**How to avoid:** Single `respondError()` function used everywhere
**Warning signs:** Frontend has multiple error parsing paths

### Pitfall 5: Panic in Error Handler
**What goes wrong:** Error handler itself panics (e.g., nil pointer, JSON encoding error), server returns no response
**Why it happens:** ErrorResponse encoding fails on unserializable data
**How to avoid:** Keep ErrorResponse simple (strings only); test error handling paths
**Warning signs:** Responses that never arrive, connection resets

## Code Examples

Verified patterns from official sources:

### Initialize slog Logger
```go
// Source: pkg.go.dev/log/slog
package logging

import (
    "log/slog"
    "os"
)

// NewJSONLogger creates a production logger with JSON output
func NewJSONLogger(level slog.Level) *slog.Logger {
    opts := &slog.HandlerOptions{
        Level:     level,
        AddSource: true,
    }
    return slog.New(slog.NewJSONHandler(os.Stdout, opts))
}

// Initialize at application startup
func init() {
    logger := NewJSONLogger(slog.LevelInfo)
    slog.SetDefault(logger)
}
```

### Error Response with Request ID
```go
// Source: API security best practices
package http

import (
    "encoding/json"
    "net/http"
)

// ErrorResponse is the standard error response format
type ErrorResponse struct {
    Error     string `json:"error"`
    RequestID string `json:"request_id"`
}

// respondError writes a JSON error response with request ID
func respondError(w http.ResponseWriter, status int, message, requestID string) {
    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(status)
    json.NewEncoder(w).Encode(ErrorResponse{
        Error:     message,
        RequestID: requestID,
    })
}
```

### Handler with Secure Error Handling
```go
// Source: Adapted from current codebase + security patterns
func (h *Handler) ListDatabases(w http.ResponseWriter, r *http.Request) {
    ctx := r.Context()
    requestID := middleware.GetReqID(ctx)

    databases, err := h.assetService.ListDatabases(ctx)
    if err != nil {
        // Log full error details server-side
        slog.ErrorContext(ctx, "failed to list databases",
            "request_id", requestID,
            "error", err,
            "method", r.Method,
            "path", r.URL.Path,
        )
        // Return generic error to client
        respondError(w, http.StatusInternalServerError, "Internal server error", requestID)
        return
    }

    respondJSON(w, http.StatusOK, application.DatabaseListResponse{
        Databases: databases,
        Total:     len(databases),
    })
}
```

### Integration Test for Error Response Security
```go
// Source: Testing patterns for security
func TestErrorResponseNoSensitiveData(t *testing.T) {
    handler, assetRepo, _, _ := setupTestHandler()

    // Inject database error with sensitive details
    assetRepo.ListDatabasesErr = errors.New(
        "teradatasql.Error: [SQLState HY000] [Version 17.20.0] " +
        "Failed to connect to 'test-host.env.clearscape.teradata.com:1025' " +
        "as user 'demo_user'",
    )

    req := httptest.NewRequest("GET", "/api/v1/assets/databases", nil)
    req = req.WithContext(context.WithValue(req.Context(),
        chi.RouteCtxKey, chi.NewRouteContext()))
    w := httptest.NewRecorder()

    handler.ListDatabases(w, req)

    assert.Equal(t, http.StatusInternalServerError, w.Code)

    var response map[string]interface{}
    err := json.Unmarshal(w.Body.Bytes(), &response)
    require.NoError(t, err)

    // Verify generic message
    assert.Equal(t, "Internal server error", response["error"])

    // Verify request_id present
    assert.Contains(t, response, "request_id")

    // Verify NO sensitive data leaked
    body := w.Body.String()
    assert.NotContains(t, body, "teradatasql")
    assert.NotContains(t, body, "SQLState")
    assert.NotContains(t, body, "clearscape.teradata.com")
    assert.NotContains(t, body, "demo_user")
    assert.NotContains(t, body, "password")
    assert.NotContains(t, body, "LIN_")
    assert.NotContains(t, body, "SELECT")
    assert.NotContains(t, body, "FROM")
}
```

### Chi Middleware Order
```go
// Source: github.com/go-chi/chi/v5/middleware documentation
func NewRouter(h *Handler) *chi.Mux {
    r := chi.NewRouter()

    // Order matters: RequestID first, then Logger, then Recoverer
    r.Use(middleware.RequestID)  // Generate request ID
    r.Use(middleware.Logger)     // Log requests (uses request ID)
    r.Use(middleware.Recoverer)  // Catch panics

    // ... rest of middleware
    r.Use(cors.Handler(cors.Options{/* ... */}))

    // Routes
    // ...
    return r
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| log.Printf | log/slog structured logging | Go 1.21 (Aug 2023) | Structured JSON logs, better querying |
| External logrus/zap | Standard library slog | Go 1.21 | Zero dependencies for logging |
| Manual request ID passing | context-based request ID | Chi v5 | Cleaner code, automatic propagation |

**Deprecated/outdated:**
- `golang.org/x/exp/slog`: Moved to standard library in Go 1.21; use `log/slog` instead

## Open Questions

Things that couldn't be fully resolved:

1. **Log aggregation format**
   - What we know: JSON format is standard for log aggregation (ELK, Splunk, etc.)
   - What's unclear: Whether deployment environment has specific log format requirements
   - Recommendation: Use JSON handler by default; make format configurable via environment variable if needed

2. **Error code taxonomy**
   - What we know: Optional `code` field in ErrorResponse allows machine-readable categorization
   - What's unclear: Whether a formal error code system is needed for this API
   - Recommendation: Start without codes; add if frontend needs to distinguish error types

## Sources

### Primary (HIGH confidence)
- [pkg.go.dev/log/slog](https://pkg.go.dev/log/slog) - Official Go slog documentation
- [github.com/go-chi/chi/v5/middleware](https://pkg.go.dev/github.com/go-chi/chi/v5/middleware) - Chi middleware RequestID and Recoverer
- Current codebase: `/Users/Daniel.Tehan/Code/lineage/lineage-api/internal/adapter/inbound/http/handlers.go` - Existing error handling pattern

### Secondary (MEDIUM confidence)
- [Error handling in Go HTTP applications](https://www.joeshaw.org/error-handling-in-go-http-applications/) - Two-layer error pattern
- [Better Stack slog guide](https://betterstack.com/community/guides/logging/logging-in-go/) - slog configuration patterns
- [samber/slog-chi](https://github.com/samber/slog-chi) - Chi middleware integration example

### Tertiary (LOW confidence)
- WebSearch results for Go API security patterns - General consensus, needs validation in implementation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - log/slog is Go stdlib, Chi middleware already in use
- Architecture: HIGH - Two-layer error pattern is well-established
- Pitfalls: HIGH - Based on documented security concerns in codebase

**Research date:** 2026-01-29
**Valid until:** 2026-02-28 (30 days - stable domain, mature patterns)
