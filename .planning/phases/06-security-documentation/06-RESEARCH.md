# Phase 6: Security Documentation - Research

**Researched:** 2026-01-29
**Domain:** API Security Documentation, Deployment Patterns, Authentication Proxy
**Confidence:** HIGH

## Summary

This phase creates security documentation that describes authentication and rate limiting deployment requirements for the lineage API. The application deliberately does not implement authentication or rate limiting internally, following the pattern of deploying internal APIs behind an authentication proxy (API Gateway, reverse proxy like Nginx/Traefik with OAuth2-Proxy). This is a common and recommended pattern for enterprise APIs where security is handled at the infrastructure layer rather than duplicated in every service.

The documentation deliverables include: (1) authentication proxy deployment patterns showing how to front the API with OAuth2-Proxy/Traefik or an API Gateway, (2) rate limiting recommendations with specific numbers for requests per minute/hour, (3) security header requirements for production deployment (HSTS, CORS, etc.), and (4) TLS configuration requirements. The documentation should enable a DevOps engineer to deploy the application securely without modifying the application code.

**Primary recommendation:** Create a `docs/SECURITY.md` file documenting deployment security requirements with specific configurations for reverse proxy authentication, rate limiting values, and required HTTP security headers, following OWASP guidelines and enterprise deployment best practices.

## Standard Stack

The established tools for API security deployment:

### Core Infrastructure Components
| Component | Purpose | Why Standard |
|-----------|---------|--------------|
| Reverse Proxy (Nginx/Traefik/HAProxy) | TLS termination, header injection, rate limiting | Industry standard for edge security; offloads security from application |
| OAuth2-Proxy | Authentication middleware | Standard solution for adding OAuth/OIDC to any backend without code changes |
| API Gateway (Kong/APISIX/AWS API Gateway) | Centralized AuthN/AuthZ, rate limiting, observability | Enterprise standard for API management; policy enforcement at edge |
| Let's Encrypt / Cert Manager | TLS certificate automation | Free, automated TLS; industry standard for HTTPS |

### Security Header Libraries (Already in Use)
| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| go-chi/cors | v1.2.1 | CORS handling | Already configured in router.go |
| chi/v5/middleware | v5.0.11 | Request ID, logging | Already configured |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| OAuth2-Proxy | Keycloak Gatekeeper | More complex, full IAM needed |
| Traefik ForwardAuth | Nginx auth_request | Traefik is more dynamic, Nginx more battle-tested |
| External rate limiting | In-app rate limiting | External is more scalable, in-app gives finer control |

**Installation:**
No installation needed - this phase produces documentation, not code. The documented solutions are deployed at the infrastructure layer.

## Architecture Patterns

### Recommended Deployment Architecture
```
                                   ┌─────────────────────────────────────┐
                                   │          Load Balancer              │
                                   │  (TLS termination, HTTPS redirect)  │
                                   └─────────────────┬───────────────────┘
                                                     │
                                   ┌─────────────────▼───────────────────┐
                                   │         API Gateway / Proxy         │
                                   │  (Authentication, Rate Limiting,    │
                                   │   Security Headers, Request ID)     │
                                   └─────────────────┬───────────────────┘
                                                     │ (trusted internal network)
                                   ┌─────────────────▼───────────────────┐
                                   │         Lineage API (Go)            │
                                   │  (No auth, trusts X-User-* headers) │
                                   │  Port 8080, internal only           │
                                   └─────────────────────────────────────┘
```

### Pattern 1: Authentication Proxy (ForwardAuth)
**What:** External proxy validates authentication before forwarding requests
**When to use:** All production deployments
**Example:**
```yaml
# Source: OAuth2-Proxy with Traefik ForwardAuth pattern
# https://medium.com/@justinking_2311/securing-your-services-with-oauth2-proxy-and-traefik-a-docker-compose-guide

# Traefik middleware configuration
http:
  middlewares:
    oauth-verify:
      forwardAuth:
        address: "http://oauth2-proxy:4180/oauth2/auth"
        trustForwardHeader: true
        authResponseHeaders:
          - "X-Auth-Request-User"
          - "X-Auth-Request-Email"
          - "X-Auth-Request-Groups"

# Applied to routes
http:
  routers:
    lineage-api:
      rule: "Host(`lineage.example.com`) && PathPrefix(`/api`)"
      middlewares:
        - oauth-verify
      service: lineage-api
```

### Pattern 2: API Gateway Rate Limiting
**What:** Centralized rate limiting at the gateway level
**When to use:** Production deployments requiring abuse protection
**Example:**
```yaml
# Source: Common API Gateway rate limiting configuration
# Kong, APISIX, or similar gateway configuration

rate-limiting:
  # Per-client rate limits (by IP or API key)
  per_client:
    requests_per_minute: 100
    requests_per_hour: 1000

  # Global rate limits (service protection)
  global:
    requests_per_second: 500
    burst: 100

  # Response on limit exceeded
  error_response:
    status: 429
    body: '{"error": "Rate limit exceeded", "retry_after": 60}'
    headers:
      Retry-After: "60"
```

### Pattern 3: Security Header Injection
**What:** Proxy adds security headers to all responses
**When to use:** All production deployments
**Example:**
```nginx
# Source: OWASP HTTP Headers Cheat Sheet
# https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html

# Nginx configuration for security headers
add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "DENY" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Cache-Control "no-store" always;

# Remove information disclosure headers
proxy_hide_header Server;
proxy_hide_header X-Powered-By;
```

### Anti-Patterns to Avoid
- **Implementing auth in the API:** Duplicates infrastructure capability; harder to maintain consistently
- **Exposing API directly to internet:** No TLS termination, rate limiting, or security headers
- **Hardcoded CORS origins:** Should be configurable per environment
- **Overly permissive rate limits:** Allows abuse; start conservative, increase based on metrics

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| OAuth/OIDC authentication | Custom auth middleware | OAuth2-Proxy + ForwardAuth | Standard, battle-tested, supports many IdPs |
| Rate limiting | Custom token bucket | API Gateway / Nginx limit_req | Distributed, handles edge cases, includes backoff |
| TLS termination | Go TLS config | Reverse proxy / Load balancer | Certificate management, performance, standardization |
| Session management | Custom session store | OAuth2-Proxy stateless JWT | Avoids session state in API |
| Security headers | Per-handler header setting | Proxy-level injection | Consistent across all endpoints, centralized config |

**Key insight:** The lineage API is an internal data service. Authentication, rate limiting, and security headers are infrastructure concerns best handled at the edge. This separation allows the API to focus on its domain (lineage data) while security is enforced consistently across all services in the organization.

## Common Pitfalls

### Pitfall 1: Incomplete Documentation
**What goes wrong:** DevOps deploys without rate limiting or auth because it "isn't mentioned"
**Why it happens:** Security docs assume prior knowledge or focus only on happy path
**How to avoid:** Document explicit requirements, default values, and consequences of omission
**Warning signs:** Support tickets about "API is slow" (no rate limiting) or "unauthorized access" (no auth)

### Pitfall 2: Documentation Drift
**What goes wrong:** Docs describe one architecture, deployment uses another
**Why it happens:** Docs written once, deployment evolves
**How to avoid:** Include verification steps in docs; reference specific config files if they exist
**Warning signs:** "The docs say X but we're doing Y"

### Pitfall 3: Overly Specific Technology Choices
**What goes wrong:** Docs prescribe "use Traefik 3.2.1" when organization uses Nginx
**Why it happens:** Author's environment becomes the "requirement"
**How to avoid:** Document requirements (rate limiting, auth), not specific implementations
**Warning signs:** "We can't deploy because we use X instead of Y"

### Pitfall 4: Missing Production vs Development Distinction
**What goes wrong:** Developer tries to set up auth locally for testing, gets stuck
**Why it happens:** Docs assume production deployment only
**How to avoid:** Explicitly document dev (no auth needed) vs prod (auth required) modes
**Warning signs:** "How do I test locally with OAuth?"

### Pitfall 5: Insecure CORS Configuration
**What goes wrong:** CORS allows all origins (`*`) in production
**Why it happens:** Developer copies dev config to prod
**How to avoid:** Document explicit CORS requirements per environment with examples
**Warning signs:** Browser console shows requests from unexpected origins succeeding

## Documentation Structure

Verified structure for API security documentation:

### Recommended SECURITY.md Sections
```markdown
# Security Documentation

## Overview
- This API is designed to run behind an authentication proxy
- It does NOT implement authentication internally
- Rate limiting and security headers are infrastructure responsibilities

## Production Deployment Requirements

### 1. TLS Requirements
- All traffic MUST use HTTPS
- Minimum TLS 1.2, prefer TLS 1.3
- HSTS header required

### 2. Authentication Requirements
- API Gateway or OAuth2-Proxy required in front of API
- Supported patterns: ForwardAuth, BFF, API Gateway
- Required headers to pass to backend: X-Auth-Request-User, X-Auth-Request-Email

### 3. Rate Limiting Requirements
- Recommended limits by endpoint category
- Response format for 429 errors

### 4. Security Headers
- Required headers with example values
- Headers to remove (Server, X-Powered-By)

### 5. CORS Configuration
- Production origin allowlist requirements
- Development vs production settings

## Development Setup
- How to run without auth (local development)
- Mock user headers for testing

## Example Configurations
- Traefik + OAuth2-Proxy example
- Nginx example
- Kubernetes Ingress example
```

## Rate Limiting Recommendations

Based on research and common API practices:

### Recommended Default Limits
| Endpoint Category | Per-IP Rate | Per-User Rate | Rationale |
|-------------------|-------------|---------------|-----------|
| Read endpoints (GET /assets, /lineage) | 100/min | 300/min | Normal browsing patterns |
| Search endpoint (GET /search) | 30/min | 60/min | Heavier DB queries |
| Impact analysis (GET /impact) | 20/min | 40/min | Expensive recursive queries |
| Health check | 1000/min | unlimited | Monitoring systems |

### Burst Handling
- Allow burst of 10-20 requests above limit
- Use sliding window algorithm for smoother limiting
- Return `429 Too Many Requests` with `Retry-After` header

### Source References
- [Go by Example: Rate Limiting](https://gobyexample.com/rate-limiting)
- [Alex Edwards: How to Rate Limit HTTP Requests in Go](https://www.alexedwards.net/blog/how-to-rate-limit-http-requests)
- [Google Cloud Rate Limiting](https://docs.cloud.google.com/service-infrastructure/docs/rate-limiting)

## Security Headers Reference

Based on OWASP HTTP Headers Cheat Sheet:

### Required Headers
```http
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Cache-Control: no-store
Content-Type: application/json; charset=UTF-8
```

### Headers to Remove
```
Server: (remove or mask)
X-Powered-By: (remove)
```

### CORS Headers (Production)
```http
Access-Control-Allow-Origin: https://lineage.example.com
Access-Control-Allow-Methods: GET, OPTIONS
Access-Control-Allow-Headers: Accept, Authorization, Content-Type, X-Request-ID
Access-Control-Max-Age: 300
```

### Source References
- [OWASP HTTP Headers Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html)
- [OWASP REST Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html)

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Per-service auth middleware | API Gateway centralized auth | ~2020+ | Single auth implementation, easier auditing |
| Self-managed TLS certs | Let's Encrypt / Cert Manager | 2016+ | Automated cert renewal, free TLS |
| Per-app rate limiting | Edge rate limiting | ~2018+ | Consistent across services, handles distributed load |
| Hardcoded security headers | Proxy-injected headers | Current | Centralized policy, consistent enforcement |

**2026 Baseline:**
- TLS everywhere (no excuse for HTTP)
- Consistent AuthN/AuthZ at edge
- Sensible rate limiting
- Standard HTTP security headers
- Zero trust internal network (authenticate even internal calls)

## Open Questions

Things that couldn't be fully resolved:

1. **Specific IdP Choice**
   - What we know: OAuth2-Proxy supports Google, Azure AD, OIDC, many others
   - What's unclear: Which IdP the organization uses
   - Recommendation: Document pattern generically; provide examples for common IdPs

2. **Internal Network Trust Level**
   - What we know: Current API trusts callers on internal network
   - What's unclear: Whether internal-to-internal auth is required
   - Recommendation: Document both patterns (trusted network vs zero-trust)

3. **Specific Rate Limit Values**
   - What we know: Typical ranges from research
   - What's unclear: Actual usage patterns for this specific API
   - Recommendation: Document conservative defaults with guidance on tuning

## Sources

### Primary (HIGH confidence)
- [OWASP REST Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html) - Security headers, HTTPS, rate limiting
- [OWASP HTTP Headers Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html) - Specific header values
- [OAuth2-Proxy GitHub](https://github.com/oauth2-proxy/oauth2-proxy) - ForwardAuth pattern examples
- Existing codebase router.go - Current CORS configuration

### Secondary (MEDIUM confidence)
- [API Security Best Practices 2026](https://www.aikido.dev/blog/api-security-best-practices) - Current industry guidance
- [Microservices.io API Gateway Pattern](https://microservices.io/patterns/apigateway.html) - Gateway authentication pattern
- [StrongDM API Security Best Practices](https://www.strongdm.com/blog/api-security-best-practices) - 13 best practices for 2026
- [Go Rate Limiting Examples](https://dev.to/neelp03/adding-api-rate-limiting-to-your-go-api-3fo8) - Rate limit implementation patterns

### Tertiary (LOW confidence)
- WebSearch results for deployment patterns - General consensus, verify against official docs

## Metadata

**Confidence breakdown:**
- Security headers: HIGH - OWASP official documentation
- Authentication patterns: HIGH - Well-documented standard patterns
- Rate limiting values: MEDIUM - Based on common practice, specific values should be tuned
- Deployment examples: MEDIUM - Generic patterns, specific configs depend on infrastructure

**Research date:** 2026-01-29
**Valid until:** 2026-03-29 (60 days - security best practices are relatively stable)
