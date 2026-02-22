# Security Documentation

This document defines the security requirements and controls for the Lineage API. For deployment procedures and example configurations, see the [Operations Guide](operations_guide.md#production-deployment).

## Overview

The Lineage API is designed to run behind an authentication proxy. It does **NOT** implement authentication internally - this is intentional, not a missing feature.

**Key points:**
- Authentication MUST be handled by an API Gateway or OAuth2-Proxy in front of this API
- Rate limiting MUST be configured at the infrastructure layer
- Security headers MUST be injected by the reverse proxy or load balancer
- The API trusts headers from the proxy (e.g., `X-Auth-Request-User`)

**Reference:** [OWASP REST Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html)

## Infrastructure Security Requirements

### 1. TLS Requirements

All production traffic MUST use HTTPS. HTTP is not acceptable.

| Requirement | Value |
|-------------|-------|
| Protocol | HTTPS only |
| Minimum TLS version | TLS 1.2 |
| Recommended TLS version | TLS 1.3 |
| HTTP handling | Redirect to HTTPS or block |

**HSTS header (required):**
```
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
```

**Certificate management:**
- Use [Let's Encrypt](https://letsencrypt.org/) with automatic renewal
- Kubernetes: Use [cert-manager](https://cert-manager.io/) with Let's Encrypt issuer
- Set certificate renewal at least 30 days before expiry

### 2. Authentication Requirements

An authentication proxy MUST sit in front of this API. The API does not validate credentials.

**Supported patterns:**

| Pattern | Description | Example Tools |
|---------|-------------|---------------|
| ForwardAuth | Proxy validates auth, forwards headers | Traefik + OAuth2-Proxy |
| API Gateway | Gateway handles auth natively | Kong, AWS API Gateway, APISIX |
| Reverse Proxy + OIDC | Nginx/HAProxy with auth module | Nginx + oauth2-proxy |

**Headers passed from proxy to API:**

| Header | Purpose | Example Value |
|--------|---------|---------------|
| `X-Auth-Request-User` | Authenticated username | `john.doe` |
| `X-Auth-Request-Email` | User email | `john.doe@example.com` |
| `X-Auth-Request-Groups` | User groups (optional) | `admin,developers` |
| `X-Request-ID` | Request tracing | `uuid-v4` |

**Note:** The API currently logs these headers for audit purposes but does not enforce authorization. All authenticated users have equal access.

### 3. Rate Limiting Requirements

Rate limiting MUST be configured at the proxy/gateway level.

**Recommended limits by endpoint:**

| Endpoint | Per-IP | Per-User | Rationale |
|----------|--------|----------|-----------|
| `GET /api/v2/openlineage/namespaces/*` | 100/min | 300/min | Normal browsing |
| `GET /api/v2/openlineage/datasets/*` | 100/min | 300/min | Normal browsing |
| `GET /api/v2/openlineage/lineage/*` | 100/min | 300/min | Normal browsing |
| `GET /api/v2/openlineage/search` | 30/min | 60/min | Heavier database queries |
| `GET /api/v2/openlineage/impact/*` | 20/min | 40/min | Expensive recursive queries |
| `GET /api/v2/openlineage/lineage/database/*` | 20/min | 40/min | Expensive graph traversal |
| `POST /api/v2/cache/invalidate` | 5/min | 10/min | Cache flush (expensive) |
| `GET /api/v2/graph/status` | 60/min | unlimited | Monitoring/health check (lightweight) |
| `POST /api/v2/graph/reload` | 5/min | 10/min | Graph rebuild trigger (expensive) |
| `GET /health` | 1000/min | unlimited | Monitoring systems |

**Burst handling:**
- Allow burst of 10-20 requests above limit
- Use sliding window algorithm for smoother limiting

**Response on limit exceeded:**
```http
HTTP/1.1 429 Too Many Requests
Retry-After: 60
Content-Type: application/json

{"error": "Rate limit exceeded", "retry_after": 60}
```

### 4. Security Headers

The reverse proxy MUST add these headers to all responses.

**Required headers:**
```
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Cache-Control: no-store
```

**Headers to remove:**
```
Server: (remove or mask)
X-Powered-By: (remove)
```

**Reference:** [OWASP HTTP Headers Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html)

### 5. CORS Configuration

**Production requirements:**
- NEVER use wildcard (`*`) for `Access-Control-Allow-Origin`
- Specify exact origin(s) that should access the API
- Keep allowed methods minimal (`GET, POST, OPTIONS` -- POST is needed for cache invalidation and graph reload)

**Production example:**
```
Access-Control-Allow-Origin: https://lineage.example.com
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Accept, Authorization, Content-Type, X-Request-ID
Access-Control-Max-Age: 300
```

**Multiple origins:** If multiple origins need access, configure the proxy to dynamically set the header based on the request `Origin` header (validate against an allowlist).

**Development:** The Flask backend allows CORS from `http://localhost:3000`, `http://localhost:3001`, `http://localhost:3004`, and `http://localhost:5173`. This is for local development only and must be overridden in production.

## Application-Level Security Controls

The following security controls are implemented within the application code.

### SQL Injection Prevention

All database queries use parameterized statements with `?` placeholders. No SQL string concatenation is used for user-supplied values.

- `lineage-api/repositories/dataset_repository.py` -- all dataset queries parameterized
- `lineage-api/repositories/lineage_repository.py` -- all lineage CTE queries parameterized
- Input validation: search query minimum length enforced, `maxDepth` clamped to 1-10

### Error Message Sanitization

The error handler pipeline (`lineage-api/middleware/error_handlers.py`) sanitizes all error messages before returning them to clients using `lineage-api/utils/sanitize.py`. This prevents accidental credential leakage in error responses.

**Patterns stripped from error messages:**
- Password/token/secret key-value pairs
- Bearer tokens
- Connection strings containing credentials (`user:pass@host:port`)
- Connection parameter passwords

**Exception design:**
- `DatabaseConnectionError.to_dict()` explicitly excludes `original_error` from client responses
- All unhandled exceptions return a generic 500 with sanitized message

### Credential Management

- Credentials loaded from environment variables or `.env` file (never hardcoded)
- `.env`, `.env.local`, `.env.*.local` excluded from version control via `.gitignore`
- `TERADATA_PASSWORD` validated at startup -- application exits with error code 1 if missing
- No credentials logged at any log level

### Request Tracing and Audit Logging

- Every request is assigned a correlation ID (UUID4) via `lineage-api/middleware/correlation_id.py`
- Correlation IDs propagated from `X-Correlation-ID` or `X-Request-ID` headers (proxy-supplied) or generated if missing
- Correlation ID returned in `X-Correlation-ID` response header for end-to-end tracing
- Structured JSON logging (loguru) with correlation context -- thread-safe via `contextvars`
- Log rotation: 100 MB per file, 30-day retention, gzip compression
- Authentication headers (`X-Auth-Request-User`, `X-Auth-Request-Email`) logged for audit when present

### Frontend Security

- **React auto-escaping:** No use of `dangerouslySetInnerHTML` -- React's default escaping prevents XSS
- **URL encoding:** All dynamic URL parameters use `encodeURIComponent()` consistently
- **TypeScript strict mode:** `strict: true` in `tsconfig.json` for type safety
- **No sensitive data in client:** Frontend contains no credentials or secrets

### Read-Only API Surface

The API is predominantly read-only, which limits the attack surface:
- All data retrieval endpoints use `GET`
- Only `POST /api/v2/cache/invalidate` and `POST /api/v2/graph/reload` are state-changing
- No `PUT`, `DELETE`, or user data modification endpoints
- No CSRF concerns for GET-only operations; POST endpoints should be protected by the authentication proxy

## Additional Resources

- [OWASP REST Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html)
- [OWASP HTTP Headers Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html)
- [OAuth2-Proxy Documentation](https://oauth2-proxy.github.io/oauth2-proxy/)
- [Let's Encrypt Getting Started](https://letsencrypt.org/getting-started/)
- [cert-manager Documentation](https://cert-manager.io/docs/)
