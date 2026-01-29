# Feature Research: Production-Ready REST API Hardening

**Domain:** Production API hardening for data lineage application
**Researched:** 2026-01-29
**Confidence:** HIGH (based on OWASP guidelines, RFC standards, and industry best practices)

## Feature Landscape

This research focuses specifically on the 7 production-readiness concerns identified in the current API:
1. Input validation on maxDepth/direction parameters
2. Error message information leakage
3. Default credentials in source code
4. Unbounded result sets (no pagination)
5. DBQL extraction error handling
6. Auth/rate limiting documentation gaps
7. Security deployment guidance

---

## Table Stakes (Must Have or API is Insecure/Unstable)

Features that are **non-negotiable** for production deployment. Missing these creates security vulnerabilities or operational instability.

### 1. Parameter Bounds Validation

| Aspect | Details |
|--------|---------|
| **Why Required** | Without bounds, `maxDepth=1000` causes expensive recursive CTEs that can DoS the database. OWASP lists resource exhaustion as a top API security risk. |
| **Complexity** | LOW |
| **What to Implement** | Validate `maxDepth` is 1-20 (configurable max). Validate `direction` is one of: `upstream`, `downstream`, `both`. Validate `limit` is 1-100. Return 400 with clear error for invalid values. |
| **Current Gap** | `maxDepth` accepts any integer including negative/huge values. `direction` silently defaults to "both" for any invalid value. `limit` in search/pagination has no upper bound. |

**Implementation Pattern:**
```go
// Allowlist validation for enums
validDirections := map[string]bool{"upstream": true, "downstream": true, "both": true}
if !validDirections[direction] {
    return BadRequest("direction must be one of: upstream, downstream, both")
}

// Range validation for integers
if maxDepth < 1 || maxDepth > config.MaxAllowedDepth {
    return BadRequest("maxDepth must be between 1 and %d", config.MaxAllowedDepth)
}
```

### 2. Structured Error Responses (No Information Leakage)

| Aspect | Details |
|--------|---------|
| **Why Required** | Current error handling returns raw database errors (`str(e)`), exposing table names, SQL syntax, connection strings. This aids attackers in reconnaissance. OWASP: "Error messages should only include information about the problem and possible fixes." |
| **Complexity** | MEDIUM |
| **What to Implement** | Adopt RFC 9457 (Problem Details) format. Map internal errors to user-safe messages. Log full details server-side with correlation IDs. |
| **Current Gap** | Both Go and Python servers return `{"error": str(e)}` which exposes database internals. |

**RFC 9457 Error Format:**
```json
{
    "type": "https://api.lineage.example/errors/invalid-parameter",
    "title": "Invalid Parameter",
    "status": 400,
    "detail": "maxDepth must be between 1 and 20",
    "instance": "/api/v1/lineage/db.table.column?maxDepth=500"
}
```

**Error Mapping Pattern:**
```go
// Server-side: log full error with correlation ID
log.Error("database error", "correlationId", corrId, "error", err, "query", query)

// Client-side: return sanitized message
return ProblemDetails{
    Type:   "database-error",
    Title:  "Database Unavailable",
    Status: 503,
    Detail: "Unable to retrieve lineage data. Please try again later.",
}
```

### 3. No Default Credentials in Source Code

| Aspect | Details |
|--------|---------|
| **Why Required** | Default credentials in source code (even examples) often end up in production. OWASP API Security Top 10 lists hardcoded credentials as a critical risk. |
| **Complexity** | LOW |
| **What to Implement** | Remove all default credential values. Fail fast with clear error if required config is missing. Use `.env.example` with placeholder values only. |
| **Current Gap** | `python_server.py` has `TD_HOST=test-sad3sstx4u4llczi.env.clearscape.teradata.com` and `TD_PASSWORD=password` as defaults. |

**Implementation Pattern:**
```python
# BAD - current implementation
DB_CONFIG = {
    "host": os.environ.get("TERADATA_HOST") or os.environ.get("TD_HOST", "test-xxx.teradata.com"),
    "password": os.environ.get("TERADATA_PASSWORD") or os.environ.get("TD_PASSWORD", "password"),
}

# GOOD - fail fast if not configured
required_env = ["TERADATA_HOST", "TERADATA_USER", "TERADATA_PASSWORD"]
missing = [var for var in required_env if not os.environ.get(var)]
if missing:
    sys.exit(f"Missing required environment variables: {', '.join(missing)}")
```

### 4. Result Set Limits (Prevent Unbounded Queries)

| Aspect | Details |
|--------|---------|
| **Why Required** | APIs without result limits can return megabytes of data, causing memory exhaustion on server and client. Database lineage graphs can have thousands of nodes. |
| **Complexity** | MEDIUM |
| **What to Implement** | Enforce maximum result sizes. For lineage graphs: cap at 500-1000 nodes. For search/list: enforce pagination with max page size of 100. Return 400 if limits exceeded with guidance. |
| **Current Gap** | Lineage endpoints return entire graph regardless of size. Search has soft limit but no hard cap. |

**Implementation Pattern:**
```go
const MaxNodesPerResponse = 500
const MaxPageSize = 100

// In lineage handler
if len(nodes) > MaxNodesPerResponse {
    return ProblemDetails{
        Status: 400,
        Detail: fmt.Sprintf("Result exceeds maximum of %d nodes. Use direction=upstream or direction=downstream to narrow scope, or request specific columns instead of entire tables.", MaxNodesPerResponse),
    }
}

// In list/search handlers
if requestedLimit > MaxPageSize {
    limit = MaxPageSize // Silently cap, or return warning
}
```

### 5. HTTP Security Headers

| Aspect | Details |
|--------|---------|
| **Why Required** | Missing security headers enable clickjacking, MIME sniffing attacks, and content injection. OWASP mandates specific headers for all API responses. |
| **Complexity** | LOW |
| **What to Implement** | Add middleware that sets: `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Cache-Control: no-store` (for sensitive data). |
| **Current Gap** | No security headers configured. |

**Headers to Add:**
```go
func SecurityHeaders(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        w.Header().Set("X-Content-Type-Options", "nosniff")
        w.Header().Set("X-Frame-Options", "DENY")
        w.Header().Set("Content-Security-Policy", "frame-ancestors 'none'")
        w.Header().Set("Cache-Control", "no-store")
        w.Header().Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
        next.ServeHTTP(w, r)
    })
}
```

---

## Best Practices (Should Have for Production Quality)

Features that significantly improve API quality and operational stability. Not having these creates friction but doesn't create immediate security vulnerabilities.

### 6. Proper Pagination with Metadata

| Aspect | Details |
|--------|---------|
| **Value** | Consistent pagination improves API usability and prevents accidental large responses. Metadata helps clients build proper UIs. |
| **Complexity** | MEDIUM |
| **What to Implement** | Standardize pagination across all list endpoints. Return metadata: `total`, `page`, `pageSize`, `totalPages`, `hasMore`. Consider cursor-based pagination for lineage traversal. |
| **Current State** | Some endpoints have pagination (`get_database_lineage`), others don't. Inconsistent parameter names. |

**Pagination Response Format:**
```json
{
    "data": [...],
    "pagination": {
        "page": 1,
        "pageSize": 50,
        "totalItems": 1234,
        "totalPages": 25,
        "hasMore": true
    }
}
```

### 7. Request Logging with Correlation IDs

| Aspect | Details |
|--------|---------|
| **Value** | Enables debugging production issues, tracing request flows, and connecting client-side errors to server logs. |
| **Complexity** | LOW |
| **What to Implement** | Generate correlation ID per request. Include in response headers. Log all requests with correlation ID, duration, status code. |
| **Current State** | Basic logging exists but no correlation IDs or structured logging. |

**Implementation Pattern:**
```go
func RequestLogger(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        correlationID := r.Header.Get("X-Correlation-ID")
        if correlationID == "" {
            correlationID = uuid.New().String()
        }
        w.Header().Set("X-Correlation-ID", correlationID)

        start := time.Now()
        wrapped := wrapResponseWriter(w)
        next.ServeHTTP(wrapped, r)

        log.Info("request",
            "correlationId", correlationID,
            "method", r.Method,
            "path", r.URL.Path,
            "status", wrapped.status,
            "duration", time.Since(start),
        )
    })
}
```

### 8. Rate Limiting Infrastructure

| Aspect | Details |
|--------|---------|
| **Value** | Protects against DoS attacks and runaway clients. Essential for any public or shared API. |
| **Complexity** | MEDIUM |
| **What to Implement** | Token bucket or sliding window rate limiting. Return 429 with `Retry-After` header. Include rate limit headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`). |
| **Current State** | No rate limiting. Redis is available (for cache) and could support distributed rate limiting. |

**Rate Limit Response:**
```
HTTP/1.1 429 Too Many Requests
Retry-After: 60
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1706540400

{
    "type": "rate-limit-exceeded",
    "title": "Rate Limit Exceeded",
    "status": 429,
    "detail": "You have exceeded the rate limit of 100 requests per minute. Please wait 60 seconds."
}
```

### 9. API Documentation (Security Section)

| Aspect | Details |
|--------|---------|
| **Value** | Clear documentation of security assumptions, authentication requirements, and deployment guidance prevents misconfiguration. |
| **Complexity** | LOW |
| **What to Implement** | Document: authentication requirements, rate limits, TLS requirements, allowed origins (CORS), deployment checklist. |
| **Current State** | Basic API docs exist but no security documentation. Auth/rate limiting "assumptions undocumented". |

**Documentation Sections Needed:**
- Authentication: "API currently requires network-level authentication. No API keys or tokens are implemented."
- Rate Limiting: "Rate limiting is not currently enforced. Recommended for production deployment."
- TLS: "HTTPS is required in production. HTTP is acceptable only for local development."
- CORS: "Allowed origins are configured for localhost ports. Update for production deployment."

### 10. Graceful Error Handling in DBQL Extraction

| Aspect | Details |
|--------|---------|
| **Value** | DBQL extraction is a batch process that should handle partial failures gracefully, not fail completely on first error. |
| **Complexity** | MEDIUM |
| **What to Implement** | Wrap individual query processing in try/catch. Log failures with context. Continue processing remaining queries. Report summary at end (X succeeded, Y failed). |
| **Current State** | "DBQL extraction lacks error handling" - likely fails on first error. |

**Implementation Pattern:**
```python
def extract_lineage_from_dbql():
    success_count = 0
    error_count = 0
    errors = []

    for query in queries:
        try:
            process_query(query)
            success_count += 1
        except Exception as e:
            error_count += 1
            errors.append({"query_id": query.id, "error": str(e)})
            log.warning(f"Failed to process query {query.id}: {e}")
            continue  # Don't stop on individual failures

    log.info(f"DBQL extraction complete: {success_count} succeeded, {error_count} failed")
    return {"success": success_count, "errors": errors}
```

---

## Advanced Features (Nice-to-Have, Not Critical)

Features that add value but are not required for production deployment. Consider for future iterations.

### 11. Circuit Breaker for Database Connections

| Aspect | Details |
|--------|---------|
| **Value** | Prevents cascading failures when database is slow or unavailable. Fails fast instead of holding connections. |
| **Complexity** | HIGH |
| **When Needed** | When API is under high load or database has reliability issues. |
| **What to Implement** | Use circuit breaker pattern (e.g., gobreaker library). Track failure rate. Open circuit when threshold exceeded. Return 503 immediately. Periodically probe for recovery. |

### 12. Request Timeout Middleware

| Aspect | Details |
|--------|---------|
| **Value** | Prevents slow database queries from holding HTTP connections indefinitely. |
| **Complexity** | LOW |
| **What to Implement** | Set context timeout on all requests (e.g., 30 seconds). Cancel database queries when timeout exceeded. |

### 13. Health Check with Dependency Status

| Aspect | Details |
|--------|---------|
| **Value** | Enables load balancers to route around unhealthy instances. Provides visibility into dependency health. |
| **Complexity** | MEDIUM |
| **What to Implement** | Expand `/health` to check database connectivity and Redis availability. Return degraded status if cache unavailable. |

**Enhanced Health Response:**
```json
{
    "status": "healthy",
    "checks": {
        "database": {"status": "healthy", "latency_ms": 15},
        "redis": {"status": "degraded", "error": "connection refused"}
    }
}
```

### 14. Cursor-Based Pagination for Lineage Traversal

| Aspect | Details |
|--------|---------|
| **Value** | More efficient for large, changing datasets. Enables consistent pagination even when data changes. |
| **Complexity** | HIGH |
| **When Needed** | When lineage graphs are very large or frequently updated. |
| **What to Implement** | Use opaque cursor (base64 encoded position). Enable forward/backward navigation. Handle cursor expiration gracefully. |

---

## Feature Dependencies

```
[Parameter Validation]
    └──enables──> [Structured Error Responses]
                      └──enables──> [Request Logging with Correlation IDs]

[No Default Credentials]
    └──enables──> [Security Documentation]

[Result Set Limits]
    └──enhances──> [Proper Pagination]

[Rate Limiting]
    └──requires──> [Request Logging] (for monitoring)
    └──requires──> [Redis] (for distributed rate limiting)

[Circuit Breaker]
    └──requires──> [Request Timeout]
    └──enhances──> [Health Check with Dependencies]
```

### Dependency Notes

- **Parameter Validation enables Structured Error Responses:** Once you validate inputs, you can provide specific error messages.
- **Result Set Limits enhances Pagination:** Both address unbounded responses but from different angles.
- **Rate Limiting requires Request Logging:** You need to track request patterns to tune rate limits.
- **Circuit Breaker requires Request Timeout:** Circuit breaker decisions depend on knowing when requests are too slow.

---

## MVP Definition

### Phase 1: Security Hardening (Table Stakes)

Must complete before production deployment:

- [ ] Parameter bounds validation (`maxDepth`, `direction`, `limit`) - LOW complexity
- [ ] Structured error responses (no database details exposed) - MEDIUM complexity
- [ ] Remove default credentials from source code - LOW complexity
- [ ] Result set limits (max nodes per response) - MEDIUM complexity
- [ ] HTTP security headers middleware - LOW complexity

**Estimated effort:** 2-3 days

### Phase 2: Operational Quality (Best Practices)

Add after basic security is in place:

- [ ] Consistent pagination across all endpoints - MEDIUM complexity
- [ ] Request logging with correlation IDs - LOW complexity
- [ ] Security documentation (deployment guide) - LOW complexity
- [ ] DBQL extraction error handling improvements - MEDIUM complexity

**Estimated effort:** 2-3 days

### Phase 3: Advanced Resilience (Future)

Consider when scaling or reliability becomes critical:

- [ ] Rate limiting with Redis backend - MEDIUM complexity
- [ ] Circuit breaker for database - HIGH complexity
- [ ] Enhanced health checks - MEDIUM complexity
- [ ] Request timeout middleware - LOW complexity

**Estimated effort:** 3-5 days

---

## Feature Prioritization Matrix

| Feature | Security Impact | Operational Impact | Complexity | Priority |
|---------|-----------------|-------------------|------------|----------|
| Parameter Validation | HIGH | MEDIUM | LOW | P1 |
| Structured Errors | HIGH | LOW | MEDIUM | P1 |
| No Default Creds | HIGH | LOW | LOW | P1 |
| Result Set Limits | MEDIUM | HIGH | MEDIUM | P1 |
| Security Headers | MEDIUM | LOW | LOW | P1 |
| Pagination | LOW | HIGH | MEDIUM | P2 |
| Correlation IDs | LOW | HIGH | LOW | P2 |
| Security Docs | MEDIUM | MEDIUM | LOW | P2 |
| DBQL Error Handling | LOW | MEDIUM | MEDIUM | P2 |
| Rate Limiting | MEDIUM | MEDIUM | MEDIUM | P3 |
| Circuit Breaker | LOW | HIGH | HIGH | P3 |
| Enhanced Health | LOW | MEDIUM | MEDIUM | P3 |

**Priority Key:**
- P1: Must have for production - security or stability risk if missing
- P2: Should have for production quality - friction if missing
- P3: Nice to have - consider for scale or reliability needs

---

## Sources

### Authoritative (HIGH confidence)
- [OWASP REST Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html)
- [OWASP Input Validation Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html)
- [OWASP API Security Top 10 2023](https://owasp.org/API-Security/editions/2023/en/0xa1-broken-object-level-authorization/)
- [RFC 9457 - Problem Details for HTTP APIs](https://www.rfc-editor.org/rfc/rfc9457.html)
- [Microsoft Azure Circuit Breaker Pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/circuit-breaker)

### Industry Best Practices (MEDIUM confidence)
- [Baeldung - REST API Error Handling Best Practices](https://www.baeldung.com/rest-api-error-handling-best-practices)
- [Postman - API Error Handling Best Practices](https://blog.postman.com/best-practices-for-api-error-handling/)
- [Speakeasy - Pagination Best Practices](https://www.speakeasy.com/api-design/pagination)
- [Zuplo - Rate Limiting Best Practices](https://zuplo.com/learning-center/10-best-practices-for-api-rate-limiting-in-2025)
- [API7 - Rate Limiting Algorithms](https://api7.ai/blog/rate-limiting-guide-algorithms-best-practices)

### Current Codebase Analysis
- `/Users/Daniel.Tehan/Code/lineage/lineage-api/internal/adapter/inbound/http/handlers.go`
- `/Users/Daniel.Tehan/Code/lineage/lineage-api/python_server.py`
- `/Users/Daniel.Tehan/Code/lineage/lineage-api/internal/adapter/inbound/http/response.go`

---

*Feature research for: Production-Ready REST API Hardening*
*Researched: 2026-01-29*
