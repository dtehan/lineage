# Phase 3: Input Validation - Research

**Researched:** 2026-01-29
**Domain:** Go API Input Validation, Parameter Bounds Checking, Structured Error Responses
**Confidence:** HIGH

## Summary

This phase implements server-side input validation for the Go backend API. The current implementation has critical gaps: `maxDepth` accepts any integer without bounds checking (line 93-95 in handlers.go silently uses strconv.Atoi with default fallback), `direction` accepts any string without allowlist validation (line 85-88), and invalid parameters return HTTP 200 with default values instead of HTTP 400 errors. This violates requirements VALID-01 through VALID-04.

The standard approach in Go APIs involves: (1) validating parameters at the handler level before any business logic, (2) using go-playground/validator for struct-based validation with declarative tags, (3) returning RFC 7807-style problem details for validation errors, and (4) making validation limits configurable via environment variables using Viper. The validation layer should be integrated with Phase 1's error handling to ensure request IDs are included in validation error responses.

**Primary recommendation:** Implement a dedicated validation layer in handlers using go-playground/validator with custom validation functions for `direction` enum and `maxDepth` bounds. Return structured 400 responses with error code, message, field name, and request ID. Make limits configurable via `MAX_DEPTH_LIMIT` and `DEFAULT_MAX_DEPTH` environment variables with Viper.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| go-playground/validator | v10.28+ | Struct and field validation | De facto Go validation standard; 100+ built-in validators; thread-safe |
| spf13/viper | v1.21.0 | Configuration management | Already in use; environment variable binding; validation support |
| strconv (stdlib) | Go 1.23+ | String to int conversion | Standard library; use ParseInt for explicit bounds |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| go-chi/chi/v5/middleware | v5.0.11 | Request ID extraction | Already in use; provides request ID for error responses |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| go-playground/validator | Manual validation in handlers | More code, less maintainable; validator provides declarative approach |
| Viper for config | os.Getenv with defaults | Already using Viper; provides type-safe config binding |
| Custom error struct | RFC 7807 library | RFC 7807 libraries add dependency; simple struct sufficient for this API |

**Installation:**
```bash
# Already in go.mod, but verify version:
go get github.com/go-playground/validator/v10@latest
```

## Architecture Patterns

### Recommended Project Structure
```
lineage-api/internal/
├── adapter/inbound/http/
│   ├── handlers.go          # Handlers call validation before service methods
│   ├── response.go          # ErrorResponse with request_id, code, field
│   ├── validation.go        # NEW: Validation structs and custom validators
│   └── validation_test.go   # NEW: Validation unit tests
├── config/
│   └── config.go            # Configuration struct with validation limits
```

### Pattern 1: Request Validation Struct
**What:** Define structs with validation tags for each request type
**When to use:** All endpoints with user-supplied parameters
**Example:**
```go
// Source: go-playground/validator v10 documentation
package http

import "github.com/go-playground/validator/v10"

// LineageRequest represents validated lineage query parameters
type LineageRequest struct {
    AssetID   string `validate:"required"`
    Direction string `validate:"required,oneof=upstream downstream both"`
    MaxDepth  int    `validate:"required,gte=1,lte=20"`
}

// Initialize validator once (thread-safe singleton)
var validate *validator.Validate

func init() {
    validate = validator.New(validator.WithRequiredStructEnabled())
}
```

### Pattern 2: Handler Validation Integration
**What:** Validate at handler entry, return 400 for invalid input
**When to use:** Every handler that accepts user input
**Example:**
```go
// Source: Adapted from current codebase + validation patterns
func (h *Handler) GetLineage(w http.ResponseWriter, r *http.Request) {
    ctx := r.Context()
    requestID := middleware.GetReqID(ctx)

    // Parse and validate parameters
    req, err := parseLineageRequest(r)
    if err != nil {
        respondValidationError(w, err, requestID)
        return
    }

    // Proceed with validated request
    response, err := h.lineageService.GetLineageGraph(ctx, application.GetLineageRequest{
        AssetID:   req.AssetID,
        Direction: req.Direction,
        MaxDepth:  req.MaxDepth,
    })
    // ...
}

func parseLineageRequest(r *http.Request) (*LineageRequest, error) {
    assetID := chi.URLParam(r, "assetId")
    direction := r.URL.Query().Get("direction")
    if direction == "" {
        direction = "both" // Default
    }

    maxDepthStr := r.URL.Query().Get("maxDepth")
    maxDepth := config.DefaultMaxDepth // From config
    if maxDepthStr != "" {
        d, err := strconv.Atoi(maxDepthStr)
        if err != nil {
            return nil, &ValidationError{
                Field:   "maxDepth",
                Message: "must be a valid integer",
                Value:   maxDepthStr,
            }
        }
        maxDepth = d
    }

    req := &LineageRequest{
        AssetID:   assetID,
        Direction: direction,
        MaxDepth:  maxDepth,
    }

    if err := validate.Struct(req); err != nil {
        return nil, translateValidationErrors(err)
    }

    return req, nil
}
```

### Pattern 3: Structured Validation Error Response
**What:** Return detailed, machine-readable validation errors
**When to use:** All 400 Bad Request responses for validation failures
**Example:**
```go
// Source: RFC 7807 Problem Details pattern (simplified)
type ValidationErrorResponse struct {
    Error     string            `json:"error"`       // Generic message
    Code      string            `json:"code"`        // Machine-readable code
    RequestID string            `json:"request_id"`  // For correlation
    Details   []ValidationError `json:"details,omitempty"` // Field-level errors
}

type ValidationError struct {
    Field   string `json:"field"`
    Message string `json:"message"`
    Value   any    `json:"value,omitempty"`
}

func respondValidationError(w http.ResponseWriter, err error, requestID string) {
    var details []ValidationError

    // Extract field-level errors
    if ve, ok := err.(*ValidationError); ok {
        details = []ValidationError{*ve}
    } else if ves, ok := err.(ValidationErrors); ok {
        details = ves
    }

    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(http.StatusBadRequest)
    json.NewEncoder(w).Encode(ValidationErrorResponse{
        Error:     "Validation failed",
        Code:      "VALIDATION_ERROR",
        RequestID: requestID,
        Details:   details,
    })
}
```

### Pattern 4: Configurable Validation Limits
**What:** Load validation bounds from environment variables
**When to use:** Application startup, configuration initialization
**Example:**
```go
// Source: Viper configuration patterns
package config

import "github.com/spf13/viper"

type ValidationConfig struct {
    MaxDepthLimit   int `mapstructure:"MAX_DEPTH_LIMIT"`   // Upper bound: 20
    DefaultMaxDepth int `mapstructure:"DEFAULT_MAX_DEPTH"` // Default: 5
    MinMaxDepth     int `mapstructure:"MIN_MAX_DEPTH"`     // Lower bound: 1
}

func LoadValidationConfig() *ValidationConfig {
    viper.SetDefault("MAX_DEPTH_LIMIT", 20)
    viper.SetDefault("DEFAULT_MAX_DEPTH", 5)
    viper.SetDefault("MIN_MAX_DEPTH", 1)

    viper.AutomaticEnv()

    return &ValidationConfig{
        MaxDepthLimit:   viper.GetInt("MAX_DEPTH_LIMIT"),
        DefaultMaxDepth: viper.GetInt("DEFAULT_MAX_DEPTH"),
        MinMaxDepth:     viper.GetInt("MIN_MAX_DEPTH"),
    }
}
```

### Anti-Patterns to Avoid
- **Silent defaulting:** Never silently use default values when parsing fails (current behavior on line 93-95) - return 400 error instead
- **Validation after business logic:** Always validate before calling service methods
- **Inconsistent error format:** All validation errors must use the same response structure
- **Hardcoded limits:** Validation bounds must be configurable via environment variables
- **Missing request ID:** Validation error responses must include request_id for correlation

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Field validation | if-else chains for each field | go-playground/validator | Declarative, tested, maintainable; handles edge cases |
| Enum validation | Manual string comparison | validator `oneof` tag | Single source of truth; easy to add values |
| Range validation | Manual min/max checks | validator `gte/lte` tags | Handles edge cases; consistent error messages |
| Error translation | Manual error message building | validator.ValidationErrors | Provides field names, tags, and values |
| Config loading | os.Getenv with manual defaults | Viper with SetDefault | Type-safe; supports multiple sources |

**Key insight:** The current implementation (strconv.Atoi with silent default fallback) appears to work but creates security and usability problems: unbounded maxDepth can cause expensive recursive CTE queries; invalid direction values pass through silently. Use go-playground/validator to make validation explicit and exhaustive.

## Common Pitfalls

### Pitfall 1: Silent Default Fallback on Parse Errors
**What goes wrong:** Current code uses default value when strconv.Atoi fails, returning HTTP 200 with default maxDepth instead of 400 error
**Why it happens:** Convenience during development; "it works" with valid input
**How to avoid:** Return validation error immediately on parse failure; never silently default
**Warning signs:** Tests pass with valid input but don't test invalid input; no 400 responses in test suite

### Pitfall 2: Inconsistent Direction Validation
**What goes wrong:** Frontend and backend accept different direction values; "UPSTREAM" vs "upstream" causes confusion
**Why it happens:** Case sensitivity not specified; no single source of truth
**How to avoid:** Use lowercase allowlist; consider adding `oneofci` for case-insensitive matching or normalize to lowercase before validation
**Warning signs:** Frontend sends "Both" but backend only accepts "both"

### Pitfall 3: Validation Bypass via Type Coercion
**What goes wrong:** Attacker sends `maxDepth=5; DROP TABLE--` which strconv.Atoi rejects, but silent default allows request to proceed
**Why it happens:** Parse error treated as "use default" instead of "reject request"
**How to avoid:** Explicit validation error on any parse failure
**Warning signs:** No tests for malformed parameter values

### Pitfall 4: Missing Request ID in Validation Errors
**What goes wrong:** Client cannot correlate validation error with server logs; support cannot debug
**Why it happens:** Validation layer doesn't have access to request context
**How to avoid:** Pass request ID to validation error response function; ensure chi middleware.RequestID runs before handlers
**Warning signs:** Validation error responses lack request_id field

### Pitfall 5: Validation Limits Hardcoded in Multiple Places
**What goes wrong:** maxDepth=20 in handler, maxDepth=10 in service, maxDepth=15 in tests - inconsistent
**Why it happens:** Developers copy/paste limits without single source of truth
**How to avoid:** Define limits in config loaded at startup; inject config into handlers
**Warning signs:** Grep for "20" or "maxDepth" shows values in multiple files

### Pitfall 6: Breaking Existing Clients
**What goes wrong:** Adding validation that rejects previously-accepted input breaks frontend
**Why it happens:** Validation treats "no value" differently than "invalid value"
**How to avoid:** Ensure default values match current behavior; add validation as strict enforcement, not behavior change
**Warning signs:** Frontend breaks after validation is added; existing tests fail

## Code Examples

Verified patterns from official sources:

### Complete Validation Implementation
```go
// Source: go-playground/validator v10 + project patterns
package http

import (
    "encoding/json"
    "net/http"
    "strconv"

    "github.com/go-chi/chi/v5"
    "github.com/go-chi/chi/v5/middleware"
    "github.com/go-playground/validator/v10"
)

// Validation bounds (loaded from config in production)
var (
    MinMaxDepth     = 1
    MaxMaxDepth     = 20
    DefaultMaxDepth = 5
)

// Allowed direction values
var validDirections = map[string]bool{
    "upstream":   true,
    "downstream": true,
    "both":       true,
}

// ValidationErrorResponse is returned for all validation failures
type ValidationErrorResponse struct {
    Error     string            `json:"error"`
    Code      string            `json:"code"`
    RequestID string            `json:"request_id"`
    Details   []FieldError      `json:"details,omitempty"`
}

// FieldError describes a single field validation failure
type FieldError struct {
    Field   string `json:"field"`
    Message string `json:"message"`
}

// respondValidationError writes a 400 response with validation details
func respondValidationError(w http.ResponseWriter, requestID string, details []FieldError) {
    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(http.StatusBadRequest)
    json.NewEncoder(w).Encode(ValidationErrorResponse{
        Error:     "Validation failed",
        Code:      "VALIDATION_ERROR",
        RequestID: requestID,
        Details:   details,
    })
}

// parseAndValidateLineageParams extracts and validates lineage query parameters
func parseAndValidateLineageParams(r *http.Request) (direction string, maxDepth int, errors []FieldError) {
    // Parse direction with default
    direction = r.URL.Query().Get("direction")
    if direction == "" {
        direction = "both"
    } else if !validDirections[direction] {
        errors = append(errors, FieldError{
            Field:   "direction",
            Message: "must be one of: upstream, downstream, both",
        })
    }

    // Parse maxDepth with default
    maxDepthStr := r.URL.Query().Get("maxDepth")
    if maxDepthStr == "" {
        maxDepth = DefaultMaxDepth
    } else {
        d, err := strconv.Atoi(maxDepthStr)
        if err != nil {
            errors = append(errors, FieldError{
                Field:   "maxDepth",
                Message: "must be a valid integer",
            })
        } else if d < MinMaxDepth || d > MaxMaxDepth {
            errors = append(errors, FieldError{
                Field:   "maxDepth",
                Message: fmt.Sprintf("must be between %d and %d", MinMaxDepth, MaxMaxDepth),
            })
        } else {
            maxDepth = d
        }
    }

    return direction, maxDepth, errors
}

// GetLineage with validation
func (h *Handler) GetLineage(w http.ResponseWriter, r *http.Request) {
    ctx := r.Context()
    requestID := middleware.GetReqID(ctx)
    assetID := chi.URLParam(r, "assetId")

    // Validate parameters
    direction, maxDepth, validationErrors := parseAndValidateLineageParams(r)
    if len(validationErrors) > 0 {
        respondValidationError(w, requestID, validationErrors)
        return
    }

    // Proceed with validated request
    req := application.GetLineageRequest{
        AssetID:   assetID,
        Direction: direction,
        MaxDepth:  maxDepth,
    }

    response, err := h.lineageService.GetLineageGraph(ctx, req)
    if err != nil {
        slog.ErrorContext(ctx, "failed to get lineage",
            "request_id", requestID,
            "error", err,
            "asset_id", assetID,
        )
        respondError(w, http.StatusInternalServerError, "Internal server error", requestID)
        return
    }

    respondJSON(w, http.StatusOK, response)
}
```

### Unit Tests for Validation
```go
// Source: Testing patterns for validation
package http

import (
    "encoding/json"
    "net/http"
    "net/http/httptest"
    "testing"

    "github.com/go-chi/chi/v5"
    "github.com/stretchr/testify/assert"
    "github.com/stretchr/testify/require"
)

// TEST-01: maxDepth validation edge cases
func TestGetLineage_MaxDepthValidation(t *testing.T) {
    tests := []struct {
        name           string
        maxDepthParam  string
        expectStatus   int
        expectError    bool
        errorContains  string
    }{
        // Valid cases
        {"valid min", "1", http.StatusOK, false, ""},
        {"valid max", "20", http.StatusOK, false, ""},
        {"valid mid", "10", http.StatusOK, false, ""},
        {"empty uses default", "", http.StatusOK, false, ""},

        // Invalid: below minimum
        {"zero", "0", http.StatusBadRequest, true, "maxDepth"},
        {"negative", "-1", http.StatusBadRequest, true, "maxDepth"},
        {"large negative", "-999", http.StatusBadRequest, true, "maxDepth"},

        // Invalid: above maximum
        {"above max", "21", http.StatusBadRequest, true, "maxDepth"},
        {"way above max", "100", http.StatusBadRequest, true, "maxDepth"},
        {"extreme", "999999", http.StatusBadRequest, true, "maxDepth"},

        // Invalid: non-integer
        {"string", "abc", http.StatusBadRequest, true, "maxDepth"},
        {"float", "5.5", http.StatusBadRequest, true, "maxDepth"},
        {"null string", "null", http.StatusBadRequest, true, "maxDepth"},
        {"special chars", "5; DROP TABLE", http.StatusBadRequest, true, "maxDepth"},
        {"whitespace", " 5 ", http.StatusBadRequest, true, "maxDepth"},
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            handler, _, lineageRepo, _ := setupTestHandler()
            lineageRepo.UpstreamData["col-001"] = []domain.ColumnLineage{}
            lineageRepo.DownstreamData["col-001"] = []domain.ColumnLineage{}

            url := "/api/v1/lineage/col-001"
            if tt.maxDepthParam != "" {
                url += "?maxDepth=" + tt.maxDepthParam
            }

            req := httptest.NewRequest("GET", url, nil)
            req = withChiURLParams(req, map[string]string{"assetId": "col-001"})
            w := httptest.NewRecorder()

            handler.GetLineage(w, req)

            assert.Equal(t, tt.expectStatus, w.Code)

            if tt.expectError {
                var response ValidationErrorResponse
                err := json.Unmarshal(w.Body.Bytes(), &response)
                require.NoError(t, err)
                assert.Equal(t, "VALIDATION_ERROR", response.Code)
                assert.NotEmpty(t, response.RequestID)
                assert.Contains(t, w.Body.String(), tt.errorContains)
            }
        })
    }
}

// TEST-01: direction validation edge cases
func TestGetLineage_DirectionValidation(t *testing.T) {
    tests := []struct {
        name          string
        direction     string
        expectStatus  int
        expectError   bool
    }{
        // Valid cases
        {"upstream", "upstream", http.StatusOK, false},
        {"downstream", "downstream", http.StatusOK, false},
        {"both", "both", http.StatusOK, false},
        {"empty uses default", "", http.StatusOK, false},

        // Invalid cases
        {"wrong case UPSTREAM", "UPSTREAM", http.StatusBadRequest, true},
        {"wrong case Both", "Both", http.StatusBadRequest, true},
        {"invalid value", "invalid", http.StatusBadRequest, true},
        {"typo", "upsteam", http.StatusBadRequest, true},
        {"empty string explicit", "''", http.StatusBadRequest, true},
        {"number", "1", http.StatusBadRequest, true},
        {"special chars", "up;stream", http.StatusBadRequest, true},
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            handler, _, lineageRepo, _ := setupTestHandler()
            lineageRepo.UpstreamData["col-001"] = []domain.ColumnLineage{}
            lineageRepo.DownstreamData["col-001"] = []domain.ColumnLineage{}

            url := "/api/v1/lineage/col-001"
            if tt.direction != "" {
                url += "?direction=" + tt.direction
            }

            req := httptest.NewRequest("GET", url, nil)
            req = withChiURLParams(req, map[string]string{"assetId": "col-001"})
            w := httptest.NewRecorder()

            handler.GetLineage(w, req)

            assert.Equal(t, tt.expectStatus, w.Code)

            if tt.expectError {
                var response ValidationErrorResponse
                err := json.Unmarshal(w.Body.Bytes(), &response)
                require.NoError(t, err)
                assert.Equal(t, "VALIDATION_ERROR", response.Code)
                assert.Contains(t, w.Body.String(), "direction")
            }
        })
    }
}

// VALID-03: Validation error response structure
func TestValidationErrorResponse_Structure(t *testing.T) {
    handler, _, _, _ := setupTestHandler()

    req := httptest.NewRequest("GET", "/api/v1/lineage/col-001?maxDepth=-1&direction=invalid", nil)
    req = withChiURLParams(req, map[string]string{"assetId": "col-001"})
    w := httptest.NewRecorder()

    handler.GetLineage(w, req)

    assert.Equal(t, http.StatusBadRequest, w.Code)
    assert.Equal(t, "application/json", w.Header().Get("Content-Type"))

    var response ValidationErrorResponse
    err := json.Unmarshal(w.Body.Bytes(), &response)
    require.NoError(t, err)

    // VALID-03: Structured error response requirements
    assert.Equal(t, "VALIDATION_ERROR", response.Code, "must include error code")
    assert.NotEmpty(t, response.Error, "must include descriptive message")
    assert.NotEmpty(t, response.RequestID, "must include request ID")
    assert.GreaterOrEqual(t, len(response.Details), 2, "should report multiple validation errors")

    // Verify field-level details
    fields := make(map[string]bool)
    for _, detail := range response.Details {
        fields[detail.Field] = true
        assert.NotEmpty(t, detail.Message, "each field error must have message")
    }
    assert.True(t, fields["maxDepth"], "should include maxDepth error")
    assert.True(t, fields["direction"], "should include direction error")
}
```

### Configuration for Validation Limits
```go
// Source: Viper configuration patterns
package config

import (
    "github.com/spf13/viper"
)

// Config holds all application configuration
type Config struct {
    Validation ValidationConfig
    // ... other config
}

// ValidationConfig holds validation-specific configuration
type ValidationConfig struct {
    MaxDepthLimit   int
    DefaultMaxDepth int
    MinMaxDepth     int
}

// Load loads configuration from environment and config files
func Load() (*Config, error) {
    // Set defaults (VALID-04: documented defaults)
    viper.SetDefault("VALIDATION_MAX_DEPTH_LIMIT", 20)
    viper.SetDefault("VALIDATION_DEFAULT_MAX_DEPTH", 5)
    viper.SetDefault("VALIDATION_MIN_MAX_DEPTH", 1)

    // Bind environment variables
    viper.AutomaticEnv()

    cfg := &Config{
        Validation: ValidationConfig{
            MaxDepthLimit:   viper.GetInt("VALIDATION_MAX_DEPTH_LIMIT"),
            DefaultMaxDepth: viper.GetInt("VALIDATION_DEFAULT_MAX_DEPTH"),
            MinMaxDepth:     viper.GetInt("VALIDATION_MIN_MAX_DEPTH"),
        },
    }

    // Validate configuration
    if cfg.Validation.MinMaxDepth < 1 {
        return nil, fmt.Errorf("MIN_MAX_DEPTH must be at least 1")
    }
    if cfg.Validation.MaxDepthLimit < cfg.Validation.MinMaxDepth {
        return nil, fmt.Errorf("MAX_DEPTH_LIMIT must be >= MIN_MAX_DEPTH")
    }
    if cfg.Validation.DefaultMaxDepth < cfg.Validation.MinMaxDepth ||
       cfg.Validation.DefaultMaxDepth > cfg.Validation.MaxDepthLimit {
        return nil, fmt.Errorf("DEFAULT_MAX_DEPTH must be between MIN and MAX")
    }

    return cfg, nil
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual if-else validation | Struct-based validator tags | validator v9 (2018) | Declarative, less code |
| Custom error messages | ValidationErrors with field info | validator v10 | Standard error extraction |
| Hardcoded limits | Environment-based config | 12-factor apps | Deploy-time configuration |
| Plain error strings | RFC 7807 Problem Details | RFC 9457 (2024) | Machine-readable errors |

**Deprecated/outdated:**
- `gopkg.in/go-playground/validator.v9`: Use v10 import path `github.com/go-playground/validator/v10`
- Manual validation without tags: Harder to maintain, error-prone

## Open Questions

Things that couldn't be fully resolved:

1. **Case sensitivity for direction parameter**
   - What we know: Current code uses lowercase; validator `oneofci` supports case-insensitive
   - What's unclear: Should "UPSTREAM" be accepted and normalized to "upstream"?
   - Recommendation: Start with case-sensitive (lowercase only) to match current behavior; consider adding `oneofci` later if clients request

2. **Error response format: RFC 7807 vs simple struct**
   - What we know: RFC 7807/9457 is the standard for problem details
   - What's unclear: Is the overhead of full RFC compliance worthwhile for this API?
   - Recommendation: Use simplified struct (error, code, request_id, details) that aligns with RFC 7807 principles without full implementation

3. **Validation for other endpoints**
   - What we know: GetUpstreamLineage, GetDownstreamLineage, Search also have parameters
   - What's unclear: Scope of Phase 3 - just maxDepth/direction or all parameters?
   - Recommendation: Focus on maxDepth and direction per requirements; add limit validation for Search if time permits

## Sources

### Primary (HIGH confidence)
- [go-playground/validator v10 documentation](https://pkg.go.dev/github.com/go-playground/validator/v10) - Struct validation, tags, error handling
- [spf13/viper documentation](https://pkg.go.dev/github.com/spf13/viper) - Environment variable configuration
- [go-chi/chi v5 middleware](https://pkg.go.dev/github.com/go-chi/chi/v5/middleware) - RequestID middleware
- Current codebase: `/Users/Daniel.Tehan/Code/lineage/lineage-api/internal/adapter/inbound/http/handlers.go` - Current validation gaps

### Secondary (MEDIUM confidence)
- [RFC 7807/9457 Problem Details](https://datatracker.ietf.org/doc/html/rfc7807) - Error response format standard
- [A Guide to Input Validation in Go with Validator V10](https://dev.to/kittipat1413/a-guide-to-input-validation-in-go-with-validator-v10-56bp) - Practical examples
- [How to Manage Configuration in Go with Viper](https://oneuptime.com/blog/post/2026-01-07-go-viper-configuration/view) - Configuration patterns

### Tertiary (LOW confidence)
- WebSearch results for Go API validation patterns - General consensus, applied to project context

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - go-playground/validator is well-established; Viper already in use
- Architecture: HIGH - Handler-level validation is standard Go pattern
- Pitfalls: HIGH - Based on documented issues in current codebase and prior research

**Research date:** 2026-01-29
**Valid until:** 2026-02-28 (30 days - stable domain, mature patterns)
