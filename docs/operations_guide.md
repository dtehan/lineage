# Operations Guide

This guide enables an operations team to deploy the Lineage application from scratch. It covers prerequisites, installation, configuration, database setup, and running the application.

**Related documentation:**
- [User Guide](user_guide.md) -- End-user feature documentation
- [Security Documentation](SECURITY.md) -- Production security requirements (TLS, authentication proxy, rate limiting, CORS)

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Installation](#installation)
3. [Configuration](#configuration)
4. [Database Setup](#database-setup)
5. [Running the Application](#running-the-application)
6. [Logging and Observability](#logging-and-observability)
7. [Production Deployment](#production-deployment)
8. [Architecture](#architecture)
9. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required

| Software | Minimum Version | Purpose |
|----------|----------------|---------|
| Python | 3.9+ | Backend server (Flask) and database setup scripts |
| Node.js | 18+ | Frontend build and development |
| npm | (included with Node.js) | Frontend package management |
| Teradata access | -- | Network connectivity to a Teradata instance on port 1025 (or configured port) |

**Teradata QVCI:** The Teradata instance must have QVCI (Queryable View Column Index) enabled. This is a system-level configuration that requires DBA coordination and a database restart. If QVCI is not already enabled on your Teradata system, plan for a maintenance window before beginning deployment. See [Database Setup > Verify QVCI Status](#41-verify-qvci-status) for verification and enablement instructions.

---

## Installation

### Step 1: Clone the Repository

```bash
git clone <repository-url>
cd lineage
```

### Step 2: Set Up Python Environment

```bash
python3 -m venv .venv
source .venv/bin/activate        # Linux / macOS
# .venv\Scripts\activate         # Windows

pip install -r requirements.txt
```

The Python environment is required for both the backend server and the database setup scripts.

**Python dependencies installed:** `teradatasql`, `flask`, `flask-cors`, `requests`, `python-dotenv`, `sqlglot`, `loguru`, `networkx`, `psutil`.

### Step 3: Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your Teradata credentials. At minimum, set `TERADATA_HOST` and `TERADATA_PASSWORD`. See the [Configuration](#configuration) section for the full variable reference.

### Step 4: Build the Frontend

```bash
cd lineage-ui
npm install
npm run build        # Creates dist/ directory with production-ready static files
```

---

## Configuration

### Precedence

Configuration values are resolved in the following order (highest precedence first):

1. **Environment variables** -- Always take precedence
2. **`.env` file** -- In the project root directory
3. **Default values** -- Built into the application

### Environment Variable Reference

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `TERADATA_HOST` | Teradata hostname or IP address | -- | Yes |
| `TERADATA_USER` | Teradata username | `demo_user` | No |
| `TERADATA_PASSWORD` | Teradata password | -- | Yes |
| `TERADATA_DATABASE` | Default database name | `demo_user` | No |
| `TERADATA_PORT` | Teradata port number | `1025` | No |
| `API_PORT` | HTTP server port | `8080` | No |
| `REDIS_URL` | Redis connection URL (optional) | `redis://localhost:6379/0` | No |
| `CACHE_TTL` | Cache expiration time in seconds | `3600` (1 hour) | No |

### Legacy Variables (Fallbacks)

The following legacy variable names are still supported as fallbacks. Use the primary names listed in the reference table above.

| Legacy Variable | Replaced By |
|----------------|-------------|
| `TD_HOST` | `TERADATA_HOST` |
| `TD_USER` | `TERADATA_USER` |
| `TD_PASSWORD` | `TERADATA_PASSWORD` |
| `TD_DATABASE` | `TERADATA_DATABASE` |
| `PORT` | `API_PORT` |

If both the legacy and primary variable are set, the primary variable takes precedence.

---

## Database Setup

### 4.1 Verify QVCI Status

QVCI (Queryable View Column Index) is a Teradata feature that enables efficient retrieval of view column information via the `DBC.ColumnsJQV` system view. The lineage application requires QVCI to extract complete column metadata (including data types) for both tables and views.

**Check if QVCI is enabled:**

```sql
-- Try querying DBC.ColumnsJQV
-- If you receive error 9719 ("QVCI feature is disabled"), QVCI needs to be enabled
SELECT TOP 1 * FROM DBC.ColumnsJQV;
```

If the query returns a result, QVCI is enabled. If you receive error 9719, follow the enablement steps below.

**Enable QVCI (requires DBA privileges):**

```bash
dbscontrol << EOF
M internal 551=false
W
EOF
```

After running this command, **restart the Teradata Database** for the change to take effect. This is a system-level change that requires DBA privileges and a maintenance window.

**If QVCI cannot be enabled:** A fallback approach is available. Modify `database/scripts/populate/populate_lineage.py` to use `DBC.ColumnsV` instead of `DBC.ColumnsJQV` in the `populate_openlineage_fields()` function, and re-enable the `update_view_column_types()` function (see git history for the original implementation). This fallback uses `HELP COLUMN` commands for each view column, which is slower but works without QVCI.

### 4.2 Create Schema

```bash
cd database
python scripts/setup/setup_lineage_schema.py
```

This creates 9 OpenLineage tables with 17 indexes:

| Table | Purpose |
|-------|---------|
| `OL_NAMESPACE` | Data source namespaces (teradata://host:port) |
| `OL_DATASET` | Dataset registry (tables/views) |
| `OL_DATASET_FIELD` | Field definitions (columns) |
| `OL_JOB` | Job definitions (ETL processes) |
| `OL_RUN` | Job execution runs |
| `OL_RUN_INPUT` | Run input datasets |
| `OL_RUN_OUTPUT` | Run output datasets |
| `OL_COLUMN_LINEAGE` | Column-level lineage with transformation types |
| `OL_SCHEMA_VERSION` | Schema version tracking |

### 4.3 Create Test Data (Optional)

For testing and demo purposes only. Not needed for production deployments with existing Teradata tables.

```bash
python scripts/setup/setup_test_data.py
```

This creates sample medallion architecture tables (SRC -> STG -> DIM -> FACT) in the configured database. These tables provide a working example of multi-tier data lineage.

### 4.4 Populate Lineage Data

Multiple population methods are available depending on your environment.

**DBQL mode (default)** -- extracts lineage from executed SQL in Teradata query logs:

```bash
python scripts/populate/populate_lineage.py                                # Default - uses DBQL
python scripts/populate/populate_lineage.py --since "2024-01-01"           # DBQL since a specific date
python scripts/populate/populate_lineage.py --full                         # Full extraction (all history)
```

DBQL mode requires SELECT privileges on `DBC.DBQLogTbl` and `DBC.DBQLSQLTbl`. The Teradata user specified in your configuration must have access to these system views. The DBQL extractor uses the `WildcardResolver` module to automatically expand `SELECT *` and qualified wildcards (`t1.*`) to actual column names using batch DBC.ColumnsJQV metadata.

**View lineage mode** -- derives column-level lineage from view SQL definitions:

```bash
python scripts/populate/populate_lineage.py --views
```

This uses the `ViewLineageExtractor` module to parse view definitions from `DBC.TablesV.RequestText` via SQLGlot, extracting column-level mappings. Views then surface as orange intermediate nodes in lineage graphs. Can be combined with other modes.

**Fixtures mode** -- uses hardcoded column mappings for demo and testing:

```bash
python scripts/populate/populate_lineage.py --fixtures
```

**Additional flags:**

```bash
python scripts/populate/populate_lineage.py --dry-run        # Preview without making changes
python scripts/populate/populate_lineage.py --verbose         # Verbose logging output
python scripts/populate/populate_lineage.py --skip-clear      # Append mode (don't clear existing data)
python scripts/populate/populate_lineage.py --lineage-only    # Only populate lineage, skip datasets/fields
```

**Populate metadata** -- after populating lineage data, populate the metadata for the tables:

```bash
python scripts/populate/populate_test_metadata.py
```

This populates `OL_NAMESPACE`, `OL_DATASET`, and `OL_DATASET_FIELD` records for the tables referenced in the lineage data.

---

## Redis Caching (Optional)

The application includes an optional Redis caching layer that reduces lineage query response times from 2-4 seconds to under 100ms for repeated queries. The application works normally without Redis (gracefully degrades to in-memory caching).

### 4.6 Redis Setup

**Install Redis** (if not already available):

```bash
# macOS
brew install redis

# Ubuntu/Debian
sudo apt-get install redis-server

# RHEL/CentOS
sudo yum install redis

# Docker
docker run -d -p 6379:6379 redis:7-alpine
```

**Start Redis server:**

```bash
# macOS (Homebrew)
brew services start redis

# Linux (systemd)
sudo systemctl start redis

# Docker (already running if using docker run above)

# Manual start
redis-server
```

**Verify Redis is running:**

```bash
redis-cli ping
# Expected output: PONG
```

### 4.7 Cache Configuration

Add Redis configuration to your `.env` file:

```bash
# Redis Cache Configuration (optional)
REDIS_URL=redis://localhost:6379/0
CACHE_TTL=3600  # Cache expiration in seconds (1 hour)
```

**If Redis is not configured or unavailable**, the application automatically falls back to in-memory SimpleCache. This provides graceful degradation but does not share cache across requests.

### 4.8 Graph Engine Redis Persistence

The in-memory graph engine (Phase 14/18) stores a serialized snapshot of the networkx DiGraph in Redis, separate from the query cache:

- **Redis key:** `lineage:engine:snapshot` (separate from `lineage:graph:*` query cache keys)
- **On startup:** Engine tries Redis restore first (<20ms); falls back to Teradata load (2-4s) if no snapshot exists
- **On cache invalidation:** Snapshot is deleted and rebuilt along with the in-memory graph
- **No TTL:** Snapshot is invalidated explicitly only (not subject to `CACHE_TTL`)

### 4.9 Cache Behavior

**With Redis:**
- Cold start (first ever): 2-4 seconds (Teradata load + graph build + Redis save)
- Warm restart: <20ms (Redis graph restore)
- All lineage queries after warmup: <50ms (in-memory BFS)
- Repeated queries also cached at Redis query level: <100ms
- Cache entries expire after 1 hour (configurable via `CACHE_TTL`)
- Cache shared across all application instances

**Without Redis (fallback to SimpleCache):**
- First query: 2-4 seconds (database CTE execution)
- No cross-request caching, no graph persistence
- Application functions normally (no errors)

### 4.10 Cache Management Endpoints

The application provides REST API endpoints for cache management:

**Invalidate cache entries** (used by ETL jobs after updating lineage data):

```bash
# Clear cache for a specific table/view
curl -X POST http://localhost:8080/api/v2/cache/invalidate \
  -H "Content-Type: application/json" \
  -d '{"dataset_name": "demo_user.customer"}'

# Clear cache for an entire database
curl -X POST http://localhost:8080/api/v2/cache/invalidate \
  -H "Content-Type: application/json" \
  -d '{"database_name": "demo_user"}'

# Clear all cache entries
curl -X POST http://localhost:8080/api/v2/cache/invalidate \
  -H "Content-Type: application/json" \
  -d '{"all": true}'
```

**Monitor cache effectiveness:**

```bash
curl http://localhost:8080/api/v2/cache/stats
```

Response includes:
- `hit_rate`: Percentage of cache hits (0-100)
- `hits`: Total cache hits since Redis started
- `misses`: Total cache misses
- `total_keys`: Number of cached lineage graphs
- `memory_used_mb`: Redis memory usage
- `connected`: Redis connection status

**Cache key structure:**

The application uses hierarchical cache keys that enable pattern-based invalidation:

- Column lineage: `lineage:graph:column:{database}.{table}:{column}:{direction}:{depth}`
- Table lineage: `lineage:graph:table:{database}.{table}:{direction}:{depth}`
- Database lineage: `lineage:graph:database:{database}:{depth}`

This structure allows ETL jobs to invalidate all related cache entries when lineage data changes.

---

## Running the Application

### 5.1 Start the Backend

```bash
cd lineage-api
python python_server.py        # Starts on port 8080 (or API_PORT)
```

No compilation or additional drivers required.

### 5.2 Start the Frontend

#### Development mode (hot reload, proxies API to localhost:8080)

```bash
cd lineage-ui
npm run dev        # Starts on port 3000 or 5173
```

The Vite development server proxies `/api/*` requests to `http://localhost:8080` automatically.

#### Production mode (static files served by a web server)

```bash
cd lineage-ui
npm run build      # Outputs static files to dist/ directory
```

The `dist/` directory contains static HTML, CSS, and JavaScript files. In production, serve these files using a reverse proxy (Nginx, Traefik, etc.) that also proxies `/api/*` requests to the backend. See the [Production Deployment](#production-deployment) section and [Security Documentation](SECURITY.md) for reverse proxy configuration examples.

**Do not use `npm run dev` in production.** The Vite development server is not designed for production use.

### 5.3 Verify the Deployment

```bash
# Check backend health
curl http://localhost:8080/health

# Check API endpoint
curl http://localhost:8080/api/v2/openlineage/namespaces

# Check graph engine status (should show ready: true after warmup)
curl http://localhost:8080/api/v2/graph/status

# Access the frontend
# Development: http://localhost:3000 or http://localhost:5173
# Production: your configured domain
```

A successful health check returns HTTP 200. The namespaces endpoint returns a JSON array of configured namespaces, confirming both the backend and database connection are working. The graph status endpoint shows whether the in-memory graph engine is ready (`ready: true` means BFS queries are active; `ready: false` means CTE fallback is in use during warmup).

### 5.4 Startup Order

Start components in the following order:

1. **Teradata database** -- must already be running and accessible
2. **Redis server** (optional) -- for caching; app works without it
3. **Backend server** -- Python Flask
4. **Frontend** -- development server or web server serving static files

---

## Logging and Observability

The backend uses structured JSON logging for both local debugging and production observability. All logs include correlation IDs for request tracing.

### 6.1 Log Output

The application writes logs to two destinations simultaneously:

| Destination | Path | Format | Purpose |
|-------------|------|--------|---------|
| **stdout** | Console output | JSON | Container environments, log aggregators |
| **File** | `lineage-api/logs/lineage-api.log` | JSON | Local debugging, persistent storage |

Both sinks use identical JSON format for consistent parsing.

### 6.2 Log Format

All log entries are JSON objects with the following structure:

```json
{
  "text": "Request started GET /api/v2/openlineage/namespaces",
  "record": {
    "elapsed": {"repr": "0:00:00.001234", "seconds": 0.001234},
    "exception": null,
    "extra": {"correlation_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"},
    "file": {"name": "python_server.py", "path": "/path/to/lineage-api/python_server.py"},
    "function": "before_request",
    "level": {"icon": "ℹ️", "name": "INFO", "no": 20},
    "line": 45,
    "message": "Request started GET /api/v2/openlineage/namespaces",
    "module": "python_server",
    "name": "lineage-api",
    "process": {"id": 12345, "name": "MainProcess"},
    "thread": {"id": 67890, "name": "MainThread"},
    "time": {"repr": "2026-02-15 13:30:45.123456-08:00", "timestamp": 1739654445.123456}
  }
}
```

**Key fields for debugging:**
- `text` -- Human-readable message
- `record.extra.correlation_id` -- Unique ID for tracking requests across multiple log entries
- `record.level.name` -- Log level (INFO, WARNING, ERROR)
- `record.file.name` and `record.line` -- Source code location
- `record.time.repr` -- Timestamp with timezone

### 6.3 Correlation IDs

Every API request is assigned a unique correlation ID (UUID4) that appears in:
- Log entries (in `record.extra.correlation_id`)
- HTTP response headers (`X-Correlation-ID`)
- Error responses (in the JSON body)

Use correlation IDs to trace all log entries related to a single request:

```bash
# Extract all logs for a specific request
grep "a1b2c3d4-e5f6-7890-abcd-ef1234567890" lineage-api/logs/lineage-api.log

# Parse JSON and extract relevant fields
grep "a1b2c3d4-e5f6-7890-abcd-ef1234567890" lineage-api/logs/lineage-api.log | \
  jq -r '[.record.time.repr, .record.level.name, .text] | @tsv'
```

### 6.4 Log Rotation and Retention

The file sink automatically rotates logs to prevent unbounded disk usage:

| Parameter | Value | Description |
|-----------|-------|-------------|
| **Rotation** | 100 MB | When `lineage-api.log` reaches 100 MB, it's renamed with a timestamp suffix and a new file is created |
| **Retention** | 30 days | Rotated files older than 30 days are automatically deleted |
| **Compression** | gzip | Rotated files are compressed to `.log.gz` to save disk space |

**Example rotated files:**
```
logs/lineage-api.log              # Current log file
logs/lineage-api.2026-02-14.log.gz    # Yesterday's compressed log
logs/lineage-api.2026-02-13.log.gz    # 2 days ago
```

The `logs/` directory is excluded from version control (`.gitignore`) and should be excluded from backups.

### 6.5 Parsing Logs

Use `jq` to parse and filter JSON logs:

```bash
# Show only ERROR level logs
jq -r 'select(.record.level.name == "ERROR") | .text' logs/lineage-api.log

# Extract timestamps and messages
jq -r '[.record.time.repr, .text] | @tsv' logs/lineage-api.log

# Find all logs related to a specific table
jq -r 'select(.text | contains("DIM_CUSTOMER")) | .text' logs/lineage-api.log

# Count logs by level
jq -r '.record.level.name' logs/lineage-api.log | sort | uniq -c
```

### 6.6 Integration with Log Aggregators

The JSON output to stdout is designed for container environments and log aggregation platforms:

**Docker/Kubernetes:**
```bash
# Logs go to stdout and are collected by the container runtime
docker logs <container-id>
kubectl logs <pod-name>
```

**Splunk/Elasticsearch/Datadog:**
Configure your log shipper (Fluentd, Logstash, Filebeat) to:
1. Read from stdout (container logs) or the `logs/lineage-api.log` file
2. Parse as JSON (no custom parsing rules needed)
3. Index the `record.extra.correlation_id` field for request tracing
4. Create alerts on `record.level.name == "ERROR"`

### 6.7 Server-Timing Headers

Every lineage API response includes a `Server-Timing` header with per-stage timing metrics. This enables performance debugging without parsing logs.

**Metrics included:**
- `bfs_upstream`, `bfs_downstream`, `bfs_total` — when the in-memory graph engine handles the query
- `db_upstream`, `db_downstream`, `db_total` — when CTE fallback handles the query

**How to use:**
- In browser DevTools, open the Network tab and inspect any lineage API request's response headers
- The `Server-Timing` header values are also displayed natively in Chrome DevTools' Timing tab
- Use these metrics to distinguish backend query time from frontend layout/render time

### 6.8 Log Levels

The application uses the following log levels:

| Level | Usage | Examples |
|-------|-------|----------|
| **INFO** | Normal operations, request lifecycle | Request started, response sent, database query executed |
| **WARNING** | Recoverable issues, degraded state | SQL truncation detected, slow query (>5s) |
| **ERROR** | Request failures, exceptions | 404 not found, 500 internal error, database connection failed |

All levels are logged to both stdout and the file sink. To change the log level, modify `lineage-api/utils/logging_config.py` and restart the backend.

### 6.9 Troubleshooting with Logs

**Find all errors in the last hour:**
```bash
jq -r 'select(.record.level.name == "ERROR" and (.record.time.timestamp > (now - 3600))) | .text' logs/lineage-api.log
```

**Trace a failed request:**
1. Get the correlation ID from the error response or browser network tab
2. Extract all logs for that request:
   ```bash
   grep "<correlation-id>" logs/lineage-api.log | jq -r '.text'
   ```

**Check for database connection issues:**
```bash
jq -r 'select(.text | contains("Teradata") or contains("database")) | .text' logs/lineage-api.log
```

---

## Production Deployment

The application is designed to run behind a reverse proxy that handles authentication, TLS termination, rate limiting, and security headers. The application itself does NOT implement authentication -- this is intentional. See [Security Documentation](SECURITY.md) for complete configuration examples including Traefik + Docker Compose, Nginx, and Kubernetes Ingress.

### 7.1 Security Overview

| Requirement | Description | Details |
|-------------|-------------|---------|
| Authentication | API must be behind an auth proxy (OAuth2-Proxy, API Gateway) | [SECURITY.md - Authentication](SECURITY.md#2-authentication-requirements) |
| TLS | All traffic must use HTTPS (TLS 1.2 minimum, TLS 1.3 recommended) | [SECURITY.md - TLS](SECURITY.md#1-tls-requirements) |
| Security Headers | Reverse proxy must add HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Cache-Control | [SECURITY.md - Headers](SECURITY.md#4-security-headers) |
| CORS | Restrict allowed origins to your domain (never use wildcard `*`) | [SECURITY.md - CORS](SECURITY.md#5-cors-configuration) |
| Rate Limiting | Configure per-endpoint rate limits at the proxy level | See [Rate Limiting](#72-rate-limiting) below |

**Note:** The application's built-in CORS configuration (`localhost:3000`, `localhost:3001`, `localhost:3004`, `localhost:5173`) is for development only. In production, CORS must be configured at the reverse proxy level with your actual domain.

### 7.2 Rate Limiting

Configure rate limiting at the reverse proxy or API gateway level. See [SECURITY.md - Rate Limiting](SECURITY.md#3-rate-limiting-requirements) for the complete per-endpoint rate limit table and burst handling recommendations.

### 7.3 Frontend Production Serving

Build the frontend for production:

```bash
cd lineage-ui
npm run build    # Outputs to dist/
```

The `dist/` directory contains static HTML, CSS, and JavaScript. Configure your reverse proxy to:

1. Serve files from `dist/` for all non-API paths
2. Proxy `/api/*` requests to the backend (port 8080 by default)
3. Return `index.html` for all client-side routes (SPA fallback)

Example Nginx location block:

```nginx
# Serve frontend static files
location / {
    root /path/to/lineage-ui/dist;
    try_files $uri $uri/ /index.html;
}

# Proxy API requests to backend
location /api/ {
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```

**Do not use `npm run dev` in production.** The Vite development server is not designed for production use.

### 7.4 Example Deployment Configurations

The following configurations implement the security requirements from [SECURITY.md](SECURITY.md) (TLS, authentication, rate limiting, security headers, CORS).

#### Traefik + OAuth2-Proxy (Docker Compose)

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

#### Nginx

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
    add_header Access-Control-Allow-Methods "GET, POST, OPTIONS" always;
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
    location /api/v2/openlineage/search {
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

    location ~ ^/api/v2/openlineage/impact/ {
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

#### Kubernetes Ingress

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
    nginx.ingress.kubernetes.io/cors-allow-methods: "GET, POST, OPTIONS"
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

### 7.5 Deployment Checklist

Verify each item before going live:

**Application:**

- [ ] Teradata credentials configured and tested
- [ ] QVCI enabled on Teradata instance (see [Database Setup](#41-verify-qvci-status))
- [ ] OL_* schema created and lineage data populated
- [ ] Backend starts without errors
- [ ] Frontend built (`npm run build`)

**Security verification:**

1. [ ] **HTTPS only** -- HTTP requests redirect to HTTPS or return 400
   ```bash
   curl -I http://lineage.example.com/api/v2/openlineage/namespaces
   # Should redirect (301/302) or fail
   ```

2. [ ] **Authentication enforced** -- Unauthenticated requests are rejected
   ```bash
   curl -I https://lineage.example.com/api/v2/openlineage/namespaces
   # Should return 401 or redirect to login
   ```

3. [ ] **Rate limiting configured** -- Excessive requests are blocked
   ```bash
   # Send 150 requests in quick succession
   for i in {1..150}; do curl -s -o /dev/null -w "%{http_code}\n" https://lineage.example.com/api/v2/openlineage/namespaces; done | grep 429
   # Should see 429 responses after ~100 requests
   ```

4. [ ] **Security headers present** -- All required headers are set
   ```bash
   curl -I https://lineage.example.com/api/v2/openlineage/namespaces
   # Verify: Strict-Transport-Security, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Cache-Control
   ```

5. [ ] **Information headers removed** -- Server and X-Powered-By not exposed
   ```bash
   curl -I https://lineage.example.com/api/v2/openlineage/namespaces | grep -i "server:\|x-powered-by:"
   # Should return empty
   ```

6. [ ] **CORS restricted** -- Only allowed origins work
   ```bash
   curl -I -H "Origin: https://evil.com" https://lineage.example.com/api/v2/openlineage/namespaces
   # Access-Control-Allow-Origin should NOT be https://evil.com or *
   ```

7. [ ] **TLS version** -- Minimum TLS 1.2
   ```bash
   openssl s_client -connect lineage.example.com:443 -tls1_1 2>&1 | grep -i "handshake"
   # Should fail (TLS 1.1 not supported)
   ```

8. [ ] **Health check accessible** -- Monitoring can reach health endpoint
   ```bash
   curl https://lineage.example.com/health
   # Should return 200 OK (may require different auth rules for monitoring)
   ```

---

## Architecture

### Deployment Architecture

```mermaid
graph TD
    subgraph "Client Layer"
        Browser[Web Browser]
    end

    subgraph "Proxy Layer"
        LB["Reverse Proxy<br/>(Nginx, Traefik, or K8s Ingress)"]
        AuthProxy["Auth Proxy<br/>(OAuth2-Proxy)"]
    end

    subgraph "Application Layer"
        Frontend["Frontend Static Files<br/>(React Build Output)"]
        Backend["Backend API Server<br/>(Python Flask - Port 8080)"]
    end

    subgraph "Data Layer"
        TD[("Teradata<br/>(Port 1025)")]
    end

    Browser -->|HTTPS| LB
    LB -->|ForwardAuth| AuthProxy
    LB -->|"Static Files (/, /index.html)"| Frontend
    LB -->|"/api/*"| Backend
    Backend --> TD
```

**Layer descriptions:**

- **Client Layer:** Web browsers access the application over HTTPS. All HTTP requests are redirected to HTTPS by the reverse proxy.
- **Proxy Layer:** The reverse proxy terminates TLS, enforces authentication via ForwardAuth to an OAuth2-Proxy, applies rate limiting, and injects security headers. See [Security Documentation](SECURITY.md) for complete proxy configuration examples.
- **Application Layer:** The frontend is a set of static files built from React (`npm run build`). The backend is a Python Flask server providing REST API endpoints. The frontend proxies API requests through the reverse proxy.
- **Data Layer:** Teradata stores lineage metadata in OL_* tables (see [Database Setup](#database-setup)).

### Component Communication

| From | To | Protocol | Port |
|------|----|----------|------|
| Browser | Reverse Proxy | HTTPS | 443 |
| Reverse Proxy | Auth Proxy | HTTP | 4180 |
| Reverse Proxy | Frontend Files | File system | -- |
| Reverse Proxy | Backend API | HTTP | 8080 |
| Backend API | Teradata | TCP (Teradata) | 1025 |

---

## Troubleshooting

### Cannot Connect to Teradata: "Missing settings: {[Password] [Username]}"

**Symptoms:** Backend fails with `Missing settings: {[Password] [Username]}` despite having credentials in `.env`.

**Cause:** The application cannot read the `.env` file.

**Solution:**

Verify your `.env` file is in the project root (parent directory of `lineage-api/`), not inside `lineage-api/`. The Python server reads `.env` from the project root automatically via `python-dotenv`.

If `python-dotenv` is not installed, export variables manually:

```bash
export $(cat ../.env | grep -v '^#' | xargs) && python python_server.py
```

### Cannot Connect to Teradata: Network/Credential Errors

**Symptoms:** `Connection refused` or `Login failure` errors on backend startup.

**Cause:** Incorrect hostname, port, or credentials in configuration.

**Solution:**

1. Verify `TERADATA_HOST`, `TERADATA_USER`, and `TERADATA_PASSWORD` in `.env`
2. Test connectivity directly:
   ```bash
   python -c "import teradatasql; teradatasql.connect(host='YOUR_HOST', user='YOUR_USER', password='YOUR_PASS')"
   ```
3. Check firewall rules for port 1025 (or your configured `TERADATA_PORT`)
4. Confirm the Teradata instance is running and accepting connections

### QVCI Feature is Disabled (Error 9719)

**Symptoms:** `populate_lineage.py` fails with error 9719 during metadata extraction.

**Cause:** QVCI is not enabled on the Teradata instance.

**Solution:** See [Database Setup > Verify QVCI Status](#41-verify-qvci-status) for verification and enablement instructions. Enabling QVCI requires DBA privileges and a database restart. If QVCI cannot be enabled, modify `populate_lineage.py` to use `DBC.ColumnsV` instead of `DBC.ColumnsJQV` (see the fallback instructions in [Database Setup](#41-verify-qvci-status)).

### Empty Lineage Graph

**Symptoms:** Graph page shows "No lineage data found" or renders with no edges.

**Cause:** The `OL_COLUMN_LINEAGE` table is empty or not populated for the selected column.

**Solution:**

1. Run `populate_lineage.py` to populate lineage data (see [Database Setup > Populate Lineage Data](#44-populate-lineage-data))
2. Verify data exists:
   ```sql
   SELECT COUNT(*) FROM OL_COLUMN_LINEAGE;
   ```
3. For DBQL mode, ensure the Teradata user has SELECT privileges on `DBC.DBQLogTbl` and `DBC.DBQLSQLTbl`

### Port Already in Use

**Symptoms:** `Address already in use` error when starting the backend.

**Cause:** Another process is using port 8080 (or your configured `API_PORT`).

**Solution:**

1. Change `API_PORT` in `.env` to a different port, or
2. Stop the conflicting process:
   ```bash
   # macOS / Linux: identify the process using port 8080
   lsof -i :8080
   ```

### Frontend Build Fails

**Symptoms:** `npm run build` fails with compilation errors.

**Cause:** Missing dependencies or incompatible Node.js version.

**Solution:**

1. Verify Node.js version is 18 or higher:
   ```bash
   node --version
   ```
2. Delete `node_modules` and reinstall:
   ```bash
   cd lineage-ui
   rm -rf node_modules
   npm install
   ```
3. Retry the build:
   ```bash
   npm run build
   ```
4. If TypeScript errors persist, review the build output for specific file and line references

### Graph Engine Not Ready

**Symptoms:** Lineage queries slower than expected (2-4s instead of <50ms).

**Cause:** The in-memory graph engine hasn't completed warmup or Redis restore.

**Solution:**

1. Check graph engine status:
   ```bash
   curl http://localhost:8080/api/v2/graph/status
   ```
2. If `ready: false`, wait for the graph to finish loading. First startup takes 2-4 seconds; subsequent restarts restore from Redis in <20ms
3. If `ready` remains `false` after several seconds, check backend logs for Teradata connection errors or Redis connectivity issues
4. To force a rebuild:
   ```bash
   curl -X POST http://localhost:8080/api/v2/graph/reload
   ```

### Slow Graph Loading

**Symptoms:** Large lineage graphs take more than 30 seconds to render.

**Cause:** Deep lineage traversal or wide fan-out patterns generating large result sets.

**Solution:**

1. Reduce the traversal depth in the UI toolbar (default is 5; try 3)
2. Check if the Teradata instance has the recommended indexes on `OL_COLUMN_LINEAGE` (created by `setup_lineage_schema.py`)

### Frontend Cannot Reach Backend API

**Symptoms:** Network errors in the browser console; "Loading..." spinner never resolves.

**Cause:** Backend not running, wrong port, or CORS misconfiguration.

**Solution:**

1. Verify the backend is running:
   ```bash
   curl http://localhost:8080/health
   ```
2. **In development:** The Vite development server proxies `/api/*` to `localhost:8080` automatically. Ensure the backend is running on port 8080 (or update the proxy target in `lineage-ui/vite.config.ts`)
3. **In production:** Verify the reverse proxy routes `/api/*` requests to the backend. Check the proxy configuration and backend logs for errors

### Teradata Driver Not Found

**Symptoms:** `ModuleNotFoundError: No module named 'teradatasql'` when running Python scripts.

**Cause:** Python virtual environment not activated or dependencies not installed.

**Solution:**

1. Activate the virtual environment:
   ```bash
   source .venv/bin/activate
   ```
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Verify installation:
   ```bash
   python -c "import teradatasql; print(teradatasql.__version__)"
   ```

### Schema Already Exists

**Symptoms:** `setup_lineage_schema.py` fails with "table already exists" errors.

**Cause:** Running the schema setup script on a database that already has OL_* tables.

**Solution:** The script is idempotent for indexes but not for tables. If you need to recreate the schema:

1. Back up any existing lineage data
2. Drop the existing OL_* tables
3. Re-run the schema setup script:
   ```bash
   cd database
   python scripts/setup/setup_lineage_schema.py
   ```
