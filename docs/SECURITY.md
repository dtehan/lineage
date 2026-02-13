# Security Documentation

This document describes security requirements for deploying the Lineage API in production. A DevOps engineer can deploy the API securely using only this documentation.

## Overview

The Lineage API is designed to run behind an authentication proxy. It does **NOT** implement authentication internally - this is intentional, not a missing feature.

**Key points:**
- Authentication MUST be handled by an API Gateway or OAuth2-Proxy in front of this API
- Rate limiting MUST be configured at the infrastructure layer
- Security headers MUST be injected by the reverse proxy or load balancer
- The API trusts headers from the proxy (e.g., `X-Auth-Request-User`)

**Reference:** [OWASP REST Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html)

## Production Deployment Requirements

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
| `GET /api/v1/assets/*` | 100/min | 300/min | Normal browsing |
| `GET /api/v1/lineage/{id}` | 100/min | 300/min | Normal browsing |
| `GET /api/v1/search` | 30/min | 60/min | Heavier database queries |
| `GET /api/v1/lineage/{id}/impact` | 20/min | 40/min | Expensive recursive queries |
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

**Development (already configured in router.go):**
```go
AllowedOrigins: []string{"http://localhost:3000", "http://localhost:5173"}
AllowedMethods: []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"}
AllowedHeaders: []string{"Accept", "Authorization", "Content-Type", "X-Request-ID"}
ExposedHeaders: []string{"X-Cache", "X-Cache-TTL"}
```

**Production requirements:**
- NEVER use wildcard (`*`) for `Access-Control-Allow-Origin`
- Specify exact origin(s) that should access the API
- Keep allowed methods minimal (`GET, OPTIONS` for this read-only API)

**Production example:**
```
Access-Control-Allow-Origin: https://lineage.example.com
Access-Control-Allow-Methods: GET, OPTIONS
Access-Control-Allow-Headers: Accept, Authorization, Content-Type, X-Request-ID
Access-Control-Expose-Headers: X-Cache, X-Cache-TTL
Access-Control-Max-Age: 300
```

**Multiple origins:** If multiple origins need access, configure the proxy to dynamically set the header based on the request `Origin` header (validate against an allowlist).

## Development Setup

For local development, authentication is NOT required.

**Quick start:**
```bash
# Start API directly (no auth proxy)
cd lineage-api
go run cmd/server/main.go  # Runs on port 8080

# Or use Python server
python python_server.py
```

**Frontend development:**
```bash
cd lineage-ui
npm run dev  # Runs on port 3000 or 5173
```

CORS is pre-configured to allow `localhost:3000` and `localhost:5173`.

**Testing with mock user headers:**
```bash
# Simulate authenticated request (for testing audit logs)
curl -H "X-Auth-Request-User: test-user" \
     -H "X-Auth-Request-Email: test@example.com" \
     http://localhost:8080/api/v1/assets/databases
```

## Example Configurations

### Traefik + OAuth2-Proxy (Docker Compose)

```yaml
version: '3.8'

services:
  traefik:
    image: traefik:v3.0
    command:
      - "--providers.docker=true"
      - "--entrypoints.web.address=:80"
      - "--entrypoints.websecure.address=:443"
      - "--entrypoints.web.http.redirections.entrypoint.to=websecure"
      - "--certificatesresolvers.letsencrypt.acme.httpchallenge.entrypoint=web"
      - "--certificatesresolvers.letsencrypt.acme.email=admin@example.com"
      - "--certificatesresolvers.letsencrypt.acme.storage=/letsencrypt/acme.json"
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - letsencrypt:/letsencrypt

  oauth2-proxy:
    image: quay.io/oauth2-proxy/oauth2-proxy:v7.6.0
    environment:
      - OAUTH2_PROXY_PROVIDER=google  # or azure, oidc, etc.
      - OAUTH2_PROXY_CLIENT_ID=${OAUTH_CLIENT_ID}
      - OAUTH2_PROXY_CLIENT_SECRET=${OAUTH_CLIENT_SECRET}
      - OAUTH2_PROXY_COOKIE_SECRET=${COOKIE_SECRET}  # 32 bytes, base64
      - OAUTH2_PROXY_EMAIL_DOMAINS=*
      - OAUTH2_PROXY_UPSTREAMS=static://202
      - OAUTH2_PROXY_HTTP_ADDRESS=0.0.0.0:4180
      - OAUTH2_PROXY_REVERSE_PROXY=true
      - OAUTH2_PROXY_SET_XAUTHREQUEST=true
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.oauth.rule=PathPrefix(`/oauth2`)"
      - "traefik.http.services.oauth.loadbalancer.server.port=4180"

  lineage-api:
    image: lineage-api:latest
    environment:
      - TERADATA_HOST=${TERADATA_HOST}
      - TERADATA_USER=${TERADATA_USER}
      - TERADATA_PASSWORD=${TERADATA_PASSWORD}
      - API_PORT=8080
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.lineage.rule=Host(`lineage.example.com`) && PathPrefix(`/api`)"
      - "traefik.http.routers.lineage.entrypoints=websecure"
      - "traefik.http.routers.lineage.tls.certresolver=letsencrypt"
      - "traefik.http.routers.lineage.middlewares=oauth-verify,security-headers,rate-limit"
      - "traefik.http.services.lineage.loadbalancer.server.port=8080"
      # ForwardAuth middleware
      - "traefik.http.middlewares.oauth-verify.forwardauth.address=http://oauth2-proxy:4180/oauth2/auth"
      - "traefik.http.middlewares.oauth-verify.forwardauth.trustForwardHeader=true"
      - "traefik.http.middlewares.oauth-verify.forwardauth.authResponseHeaders=X-Auth-Request-User,X-Auth-Request-Email"
      # Security headers middleware
      - "traefik.http.middlewares.security-headers.headers.stsSeconds=63072000"
      - "traefik.http.middlewares.security-headers.headers.stsIncludeSubdomains=true"
      - "traefik.http.middlewares.security-headers.headers.stsPreload=true"
      - "traefik.http.middlewares.security-headers.headers.contentTypeNosniff=true"
      - "traefik.http.middlewares.security-headers.headers.frameDeny=true"
      - "traefik.http.middlewares.security-headers.headers.referrerPolicy=strict-origin-when-cross-origin"
      - "traefik.http.middlewares.security-headers.headers.customResponseHeaders.Cache-Control=no-store"
      # Rate limiting middleware
      - "traefik.http.middlewares.rate-limit.ratelimit.average=100"
      - "traefik.http.middlewares.rate-limit.ratelimit.burst=20"
      - "traefik.http.middlewares.rate-limit.ratelimit.period=1m"

volumes:
  letsencrypt:
```

### Nginx

```nginx
# /etc/nginx/conf.d/lineage.conf

# Rate limiting zones
limit_req_zone $binary_remote_addr zone=api_per_ip:10m rate=100r/m;
limit_req_zone $binary_remote_addr zone=search_per_ip:10m rate=30r/m;
limit_req_zone $binary_remote_addr zone=impact_per_ip:10m rate=20r/m;

upstream lineage_api {
    server 127.0.0.1:8080;
    keepalive 32;
}

server {
    listen 80;
    server_name lineage.example.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name lineage.example.com;

    # TLS configuration
    ssl_certificate /etc/letsencrypt/live/lineage.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/lineage.example.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;

    # Security headers (applied to all responses)
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Cache-Control "no-store" always;

    # Remove information disclosure headers
    proxy_hide_header Server;
    proxy_hide_header X-Powered-By;

    # CORS (adjust origin as needed)
    add_header Access-Control-Allow-Origin "https://lineage-ui.example.com" always;
    add_header Access-Control-Allow-Methods "GET, OPTIONS" always;
    add_header Access-Control-Allow-Headers "Accept, Authorization, Content-Type, X-Request-ID" always;
    add_header Access-Control-Max-Age "300" always;

    # OAuth2-Proxy authentication
    location /oauth2/ {
        proxy_pass http://127.0.0.1:4180;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Auth verification subrequest
    location = /oauth2/auth {
        internal;
        proxy_pass http://127.0.0.1:4180;
        proxy_pass_request_body off;
        proxy_set_header Content-Length "";
        proxy_set_header X-Original-URI $request_uri;
    }

    # API endpoints with authentication and rate limiting
    location /api/v1/search {
        auth_request /oauth2/auth;
        auth_request_set $auth_user $upstream_http_x_auth_request_user;
        auth_request_set $auth_email $upstream_http_x_auth_request_email;

        limit_req zone=search_per_ip burst=10 nodelay;
        limit_req_status 429;

        proxy_pass http://lineage_api;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Auth-Request-User $auth_user;
        proxy_set_header X-Auth-Request-Email $auth_email;
    }

    location ~ ^/api/v1/lineage/.+/impact$ {
        auth_request /oauth2/auth;
        auth_request_set $auth_user $upstream_http_x_auth_request_user;
        auth_request_set $auth_email $upstream_http_x_auth_request_email;

        limit_req zone=impact_per_ip burst=5 nodelay;
        limit_req_status 429;

        proxy_pass http://lineage_api;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Auth-Request-User $auth_user;
        proxy_set_header X-Auth-Request-Email $auth_email;
    }

    location /api/ {
        auth_request /oauth2/auth;
        auth_request_set $auth_user $upstream_http_x_auth_request_user;
        auth_request_set $auth_email $upstream_http_x_auth_request_email;

        limit_req zone=api_per_ip burst=20 nodelay;
        limit_req_status 429;

        proxy_pass http://lineage_api;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Auth-Request-User $auth_user;
        proxy_set_header X-Auth-Request-Email $auth_email;
    }

    # Health check (no auth, higher rate limit)
    location /health {
        limit_req zone=api_per_ip burst=100 nodelay;
        proxy_pass http://lineage_api;
    }
}
```

### Kubernetes Ingress

```yaml
# ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: lineage-api
  annotations:
    # TLS with cert-manager
    cert-manager.io/cluster-issuer: "letsencrypt-prod"

    # OAuth2-Proxy authentication
    nginx.ingress.kubernetes.io/auth-url: "https://$host/oauth2/auth"
    nginx.ingress.kubernetes.io/auth-signin: "https://$host/oauth2/start?rd=$escaped_request_uri"
    nginx.ingress.kubernetes.io/auth-response-headers: "X-Auth-Request-User,X-Auth-Request-Email"

    # Rate limiting (per-IP, 100 requests/minute)
    nginx.ingress.kubernetes.io/limit-rps: "2"
    nginx.ingress.kubernetes.io/limit-connections: "10"

    # Security headers
    nginx.ingress.kubernetes.io/configuration-snippet: |
      add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
      add_header X-Content-Type-Options "nosniff" always;
      add_header X-Frame-Options "DENY" always;
      add_header Referrer-Policy "strict-origin-when-cross-origin" always;
      add_header Cache-Control "no-store" always;
      proxy_hide_header Server;
      proxy_hide_header X-Powered-By;

    # CORS
    nginx.ingress.kubernetes.io/enable-cors: "true"
    nginx.ingress.kubernetes.io/cors-allow-origin: "https://lineage-ui.example.com"
    nginx.ingress.kubernetes.io/cors-allow-methods: "GET, OPTIONS"
    nginx.ingress.kubernetes.io/cors-allow-headers: "Accept, Authorization, Content-Type, X-Request-ID"
spec:
  ingressClassName: nginx
  tls:
    - hosts:
        - lineage.example.com
      secretName: lineage-tls
  rules:
    - host: lineage.example.com
      http:
        paths:
          - path: /api
            pathType: Prefix
            backend:
              service:
                name: lineage-api
                port:
                  number: 8080

---
# oauth2-proxy deployment (abbreviated)
apiVersion: apps/v1
kind: Deployment
metadata:
  name: oauth2-proxy
spec:
  replicas: 2
  selector:
    matchLabels:
      app: oauth2-proxy
  template:
    metadata:
      labels:
        app: oauth2-proxy
    spec:
      containers:
        - name: oauth2-proxy
          image: quay.io/oauth2-proxy/oauth2-proxy:v7.6.0
          args:
            - --provider=oidc
            - --oidc-issuer-url=https://your-idp.example.com
            - --client-id=$(CLIENT_ID)
            - --client-secret=$(CLIENT_SECRET)
            - --cookie-secret=$(COOKIE_SECRET)
            - --email-domain=*
            - --upstream=static://202
            - --http-address=0.0.0.0:4180
            - --reverse-proxy=true
            - --set-xauthrequest=true
          env:
            - name: CLIENT_ID
              valueFrom:
                secretKeyRef:
                  name: oauth2-proxy-secrets
                  key: client-id
            - name: CLIENT_SECRET
              valueFrom:
                secretKeyRef:
                  name: oauth2-proxy-secrets
                  key: client-secret
            - name: COOKIE_SECRET
              valueFrom:
                secretKeyRef:
                  name: oauth2-proxy-secrets
                  key: cookie-secret
          ports:
            - containerPort: 4180
```

## Verification Checklist

Before going live, verify each item:

1. [ ] **HTTPS only** - HTTP requests redirect to HTTPS or return 400
   ```bash
   curl -I http://lineage.example.com/api/v1/assets/databases
   # Should redirect (301/302) or fail
   ```

2. [ ] **Authentication enforced** - Unauthenticated requests are rejected
   ```bash
   curl -I https://lineage.example.com/api/v1/assets/databases
   # Should return 401 or redirect to login
   ```

3. [ ] **Rate limiting configured** - Excessive requests are blocked
   ```bash
   # Send 150 requests in quick succession
   for i in {1..150}; do curl -s -o /dev/null -w "%{http_code}\n" https://lineage.example.com/api/v1/assets/databases; done | grep 429
   # Should see 429 responses after ~100 requests
   ```

4. [ ] **Security headers present** - All required headers are set
   ```bash
   curl -I https://lineage.example.com/api/v1/assets/databases
   # Verify headers:
   # Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
   # X-Content-Type-Options: nosniff
   # X-Frame-Options: DENY
   # Referrer-Policy: strict-origin-when-cross-origin
   # Cache-Control: no-store
   ```

5. [ ] **Information headers removed** - Server and X-Powered-By not exposed
   ```bash
   curl -I https://lineage.example.com/api/v1/assets/databases | grep -i "server:\|x-powered-by:"
   # Should return empty
   ```

6. [ ] **CORS restricted** - Only allowed origins work
   ```bash
   curl -I -H "Origin: https://evil.com" https://lineage.example.com/api/v1/assets/databases
   # Access-Control-Allow-Origin should NOT be https://evil.com or *
   ```

7. [ ] **TLS version** - Minimum TLS 1.2
   ```bash
   openssl s_client -connect lineage.example.com:443 -tls1_1 2>&1 | grep -i "handshake"
   # Should fail (TLS 1.1 not supported)
   ```

8. [ ] **Health check accessible** - Monitoring can reach health endpoint
   ```bash
   curl https://lineage.example.com/health
   # Should return 200 OK (may require different auth rules for monitoring)
   ```

## Additional Resources

- [OWASP REST Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html)
- [OWASP HTTP Headers Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html)
- [OAuth2-Proxy Documentation](https://oauth2-proxy.github.io/oauth2-proxy/)
- [Let's Encrypt Getting Started](https://letsencrypt.org/getting-started/)
- [cert-manager Documentation](https://cert-manager.io/docs/)
