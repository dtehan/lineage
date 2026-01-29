# Stack Research: Production Hardening

**Domain:** Production hardening for Go REST API + React frontend
**Researched:** 2026-01-29
**Confidence:** HIGH (verified via GitHub releases and official documentation)

## Executive Summary

This research focuses on production-hardening an existing Go/React application. The existing stack (Go with Chi router, React 18, TypeScript, Vite) is solid and current. The focus is on adding production-grade input validation, secure error handling, pagination, and security tooling without architectural changes.

**Key finding:** Go's ecosystem in 2026 provides mature, well-maintained libraries for all production hardening needs. The standard library's `log/slog` (Go 1.21+) is now the recommended logging approach for new projects. The go-playground/validator v10 remains the dominant validation library with 23,000+ imports.

## Recommended Stack Additions

### Input Validation

| Library | Version | Purpose | Why Recommended | Confidence |
|---------|---------|---------|-----------------|------------|
| [go-playground/validator](https://github.com/go-playground/validator) | v10.30.1 | Struct and field validation | Industry standard with 23,000+ imports. Supports struct tags, custom validators, and cross-field validation. Thread-safe singleton pattern. Zero-allocation benchmarks (27ns/op). | HIGH |

**Rationale:** validator v10 is the de facto standard for Go input validation. It integrates seamlessly with Chi handlers via struct binding patterns. The library is actively maintained (latest release Dec 2025) and battle-tested in production at scale.

**Critical configuration:**
```go
// Use WithRequiredStructEnabled for v11-compatible behavior
validate := validator.New(validator.WithRequiredStructEnabled())
```

**Usage pattern for hexagonal architecture:**
- Define validation tags on DTOs in the application layer
- Validate at HTTP handler boundary (adapter layer)
- Return domain errors from service layer, not validation errors

### Error Handling & Logging

| Library | Version | Purpose | Why Recommended | Confidence |
|---------|---------|---------|-----------------|------------|
| log/slog | stdlib (Go 1.21+) | Structured logging | Standard library eliminates external dependency. Zero-allocation design (40 B/op). JSON output for production, text for development. Supports handler swapping for testing. | HIGH |
| N/A (custom) | - | API error abstraction | Define `APIError` interface to separate internal errors from client-safe messages. Prevents information leakage. | HIGH |

**Rationale:** For a new project hardening in 2026, `log/slog` is the recommended choice over Zap/Zerolog because:
1. **Zero dependencies** - Reduces supply chain risk
2. **Standard library backing** - Long-term support guaranteed
3. **Performance is "good enough"** - Only 2x slower than Zerolog in benchmarks, still fast enough for most workloads
4. **Ecosystem convergence** - Other libraries (Zap, Zerolog) now support slog handlers for interoperability

**When to choose Zerolog instead:** Only if profiling shows logging as a bottleneck in high-throughput paths (>100k req/s).

**Secure error handling pattern:**
```go
type APIError interface {
    APIError() (statusCode int, safeMessage string)
}

// Handler pattern
if err != nil {
    var apiErr APIError
    if errors.As(err, &apiErr) {
        code, msg := apiErr.APIError()
        respondError(w, code, msg)
    } else {
        // Log full error internally with request ID
        slog.Error("internal error", "error", err, "request_id", requestID)
        // Return generic message to client
        respondError(w, http.StatusInternalServerError, "internal error")
    }
}
```

### Pagination

| Library | Version | Purpose | Why Recommended | Confidence |
|---------|---------|---------|-----------------|------------|
| N/A (manual) | - | Cursor/offset pagination | Chi has no built-in pagination. Implement via middleware pattern with context values. Simple enough to not require external library. | HIGH |

**Rationale:** Pagination in Go APIs is straightforward enough that adding a library dependency is unnecessary overhead. The pattern involves:
1. Middleware extracts `page`, `limit` from query params
2. Middleware validates bounds (limit <= 100, page >= 1)
3. Middleware stores in context
4. Handler retrieves from context, passes to service

**Implementation pattern:**
```go
type Pagination struct {
    Page   int
    Limit  int
    Offset int
}

func PaginationMiddleware(defaultLimit, maxLimit int) func(next http.Handler) http.Handler {
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            page := parseIntOrDefault(r.URL.Query().Get("page"), 1)
            limit := parseIntOrDefault(r.URL.Query().Get("limit"), defaultLimit)

            if limit > maxLimit {
                limit = maxLimit
            }
            if page < 1 {
                page = 1
            }

            p := Pagination{Page: page, Limit: limit, Offset: (page - 1) * limit}
            ctx := context.WithValue(r.Context(), paginationKey, p)
            next.ServeHTTP(w, r.WithContext(ctx))
        })
    }
}
```

### Rate Limiting (Documentation Only)

| Library | Version | Purpose | Why Recommended | Confidence |
|---------|---------|---------|-----------------|------------|
| [go-chi/httprate](https://github.com/go-chi/httprate) | v0.15.0 | HTTP rate limiting | Official Chi ecosystem. Sliding window counter. Supports IP-based and custom key functions. Redis backend for distributed deployments. | HIGH |

**Rationale:** This project documents rate limiting assumptions rather than implementing them. httprate is recommended for future implementation because:
1. **Chi ecosystem native** - Maintained by go-chi team
2. **Flexible key functions** - LimitByIP, LimitByRealIP, or custom
3. **Distributed support** - Redis backend available
4. **Simple API** - `r.Use(httprate.LimitByIP(100, time.Minute))`

**Note:** Rate limiting is out of scope for current hardening. Document in API spec that rate limiting is expected to be handled by infrastructure (API gateway, load balancer) or can be added later with httprate.

### Security Static Analysis

| Tool | Version | Purpose | Why Recommended | Confidence |
|------|---------|---------|-----------------|------------|
| [golangci-lint](https://github.com/golangci/golangci-lint) | v2.8.0 | Meta-linter aggregator | Aggregates 50+ linters including gosec, staticcheck. Fast parallel execution. CI/CD integration. | HIGH |
| gosec (via golangci-lint) | v2.22.11 | Security-focused analysis | Detects hardcoded credentials, SQL injection, command injection, weak crypto. Integrated in golangci-lint. | HIGH |
| govulncheck | stdlib | Dependency vulnerability scanning | Official Go toolchain. Scans for known vulnerabilities in dependencies. | HIGH |

**Rationale:** golangci-lint v2.8.0 (released Jan 2026) is the standard meta-linter. Running gosec separately is unnecessary as golangci-lint integrates it. govulncheck is essential for supply chain security.

**Recommended .golangci.yml for production hardening:**
```yaml
version: "2"
run:
  timeout: 5m

linters:
  enable:
    - gosec        # Security issues
    - staticcheck  # Go vet + more
    - errcheck     # Unchecked errors
    - govet        # Standard vet
    - ineffassign  # Unused assignments
    - typecheck    # Type errors
    - unused       # Unused code
    - gosimple     # Simplifications
    - nilerr       # Return nil error

linters-settings:
  gosec:
    includes:
      - G101  # Hardcoded credentials
      - G102  # Bind to all interfaces
      - G104  # Unchecked errors
      - G107  # URL in HTTP request as taint
      - G201  # SQL format string
      - G202  # SQL string concat
      - G301  # Poor file permissions
      - G302  # Poor file permissions
      - G304  # Path traversal
      - G401  # Weak crypto
      - G501  # Import blocklist
```

### Testing Additions

| Library | Purpose | When to Use | Confidence |
|---------|---------|-------------|------------|
| testing (stdlib) | Unit tests | All validation, error handling tests | HIGH |
| httptest (stdlib) | HTTP handler tests | Handler-level validation tests | HIGH |
| [testify/assert](https://github.com/stretchr/testify) | Test assertions | Already in project - continue using | HIGH |

**Testing strategy for validation/security:**
1. **Table-driven tests** for validation rules (valid inputs, invalid inputs, edge cases)
2. **Handler tests** verify 400 responses for invalid input, generic 500 messages for internal errors
3. **Fuzz testing** (`go test -fuzz`) for input parsing edge cases
4. **Race detector** (`go test -race`) for concurrency issues

### Frontend Error Handling

| Library | Version | Purpose | Why Recommended | Confidence |
|---------|---------|---------|-----------------|------------|
| [react-error-boundary](https://www.npmjs.com/package/react-error-boundary) | 5.x | Error boundary component | Standard solution for React error boundaries. TypeScript support. Fallback UI, reset functionality. Maintained by Brian Vaughn (React team alumni). | HIGH |

**Rationale:** React requires class components for error boundaries (componentDidCatch). react-error-boundary provides a clean wrapper avoiding the need to write class components in a hooks-based codebase.

**Note:** The existing codebase likely already handles API errors via TanStack Query's error states. react-error-boundary is for catching render errors, not API errors.

## Alternatives Considered

| Category | Recommended | Alternative | When to Use Alternative |
|----------|-------------|-------------|-------------------------|
| Validation | go-playground/validator | ozzo-validation | When you prefer code-based rules over struct tags |
| Logging | log/slog | zerolog | Only if logging is a measured performance bottleneck |
| Logging | log/slog | zap | Only if you need highly customized log processing |
| Rate Limiting | httprate | tollbooth | When you need more granular rate limit controls |
| Rate Limiting | httprate | go-limiter | When you need non-HTTP rate limiting |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| logrus | Deprecated by author, maintenance mode only | log/slog |
| Exposing err.Error() to clients | Leaks internal implementation details | APIError interface pattern |
| Unlimited maxDepth parameter | Allows resource exhaustion attacks | Hard limit (20) with validation |
| Per-field validation in handlers | Duplicates logic, error-prone | Struct tags with validator |

## Installation Commands

### Backend (Go)

```bash
# Validation
go get github.com/go-playground/validator/v10@v10.30.1

# Already using Go 1.23 - slog is available in stdlib

# Development tools (install globally)
go install github.com/golangci/golangci-lint/cmd/golangci-lint@v2.8.0
go install golang.org/x/vuln/cmd/govulncheck@latest
```

### Frontend (React)

```bash
# Error boundaries (if not already present)
npm install react-error-boundary
```

## CI/CD Integration

```yaml
# Example GitHub Actions step
- name: Security checks
  run: |
    golangci-lint run --timeout=5m
    govulncheck ./...
```

## Version Compatibility

| Package | Go Version | Notes |
|---------|------------|-------|
| validator v10.30.1 | Go 1.18+ | Uses generics internally |
| log/slog | Go 1.21+ | Project uses Go 1.23, compatible |
| httprate v0.15.0 | Go 1.18+ | |
| golangci-lint v2.8.0 | Go 1.22+ | Requires recent Go for some linters |

## Sources

- [go-playground/validator GitHub](https://github.com/go-playground/validator) - Latest release v10.30.1 (2025-12-24) - HIGH confidence
- [golangci-lint releases](https://github.com/golangci/golangci-lint/releases) - Latest v2.8.0 (2026-01-07) - HIGH confidence
- [go-chi/httprate GitHub](https://github.com/go-chi/httprate) - Latest v0.15.0 (2025-03-29) - HIGH confidence
- [Better Stack logging comparison](https://betterstack.com/community/guides/logging/best-golang-logging-libraries/) - slog vs zap vs zerolog benchmarks - MEDIUM confidence
- [OWASP Error Handling Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Error_Handling_Cheat_Sheet.html) - Error handling best practices - HIGH confidence
- [react-error-boundary npm](https://www.npmjs.com/package/react-error-boundary) - React error boundary patterns - HIGH confidence
- [Go Security Best Practices](https://go.dev/doc/security/best-practices) - Official Go security guidance - HIGH confidence

---
*Stack research for: Production hardening Go REST API + React frontend*
*Researched: 2026-01-29*
