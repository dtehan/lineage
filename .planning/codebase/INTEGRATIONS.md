# External Integrations

**Analysis Date:** 2026-01-29

## APIs & External Services

**Teradata Database:**
- Service: Teradata RDBMS (primary data source)
- What it's used for: Stores lineage metadata, asset registry, column lineage relationships
- SDK/Client: `teradatasql` (Python) or `gosql-driver` + ODBC (Go)
- Connection:
  - Host: `TERADATA_HOST` env var
  - Port: `TERADATA_PORT` (default 1025)
  - Auth: Username/password in `TERADATA_USER`, `TERADATA_PASSWORD`
  - Database: `TERADATA_DATABASE` (default: `lineage`)

**No external third-party APIs:**
- Application is self-contained with no Stripe, Slack, SendGrid, or similar service integrations
- All data sources are within the Teradata ecosystem

## Data Storage

**Databases:**
- Teradata
  - Connection: Via `teradatasql` driver (Python) or ODBC (Go)
  - Client: sqlx (Go query builder), teradatasql native driver (Python)
  - Tables: `LIN_DATABASE`, `LIN_TABLE`, `LIN_COLUMN`, `LIN_COLUMN_LINEAGE`, `LIN_TABLE_LINEAGE`, `LIN_TRANSFORMATION`, `LIN_QUERY`, `LIN_WATERMARK` in `demo_user` database
  - Purpose: Schema and lineage metadata extraction from Teradata DBC views

**File Storage:**
- Local filesystem only
  - `.env` file for configuration (not committed to version control)
  - Frontend builds to `dist/` directory (static assets)
  - Database scripts in `database/` directory

**Caching:**
- Redis (optional, gracefully falls back if unavailable)
  - Connection: `REDIS_ADDR`, `REDIS_PASSWORD`, `REDIS_DB` env vars
  - Default address: `localhost:6379`
  - Purpose: Cache lineage graph queries to reduce database load
  - Implementation: `github.com/redis/go-redis/v9` in Go backend
  - TTL: Configurable per cache operation (typically 5-60 minutes for lineage queries)
  - Fallback: If Redis unavailable, queries hit Teradata directly

## Authentication & Identity

**Auth Provider:**
- Custom implementation (Teradata native authentication)
  - No OAuth2, OIDC, or third-party identity providers
  - Teradata username/password used for database connection
  - Frontend is unauthenticated (no user session management)
  - Backend validates Teradata credentials at startup

**Security Model:**
- Application assumes single trusted user (no multi-tenant, no per-user auth)
- Teradata connection credentials stored in `.env` (not in code)
- CORS configured to allow specific localhost origins only (`:3000`, `:5173`)

## Monitoring & Observability

**Error Tracking:**
- None detected
- Errors logged to stdout/stderr by backend

**Logs:**
- Go backend: `middleware.Logger` (Chi middleware logs HTTP requests)
- Python backend: Flask default logging to console
- Frontend: Browser console logs only
- No centralized logging service (Datadog, CloudWatch, etc.)

**Debugging:**
- TanStack Query DevTools available in React app (`@tanstack/react-query-devtools`)
- Frontend accessible at dev time only

## CI/CD & Deployment

**Hosting:**
- Not pre-configured for specific platform
- Can run on: Local machine, Docker container, traditional servers
- Backend listens on configurable `PORT` (default 8080)
- Frontend as static build artifacts (compatible with any web server or CDN)

**CI Pipeline:**
- None detected in repository
- Manual build and test commands available (see Makefile, npm scripts)

**Build Outputs:**
- Backend: Go binary at `bin/server` (created by `make build`)
- Frontend: Static assets in `dist/` (created by `npm run build`)
- Python fallback: No compilation needed, runs directly with `python python_server.py`

## Environment Configuration

**Required env vars:**
- `TERADATA_HOST` or `TD_HOST` - Teradata server hostname
- `TERADATA_USER` or `TD_USER` - Teradata username
- `TERADATA_PASSWORD` or `TD_PASSWORD` - Teradata password
- `TERADATA_DATABASE` or `TD_DATABASE` - Default database name (usually `demo_user`)

**Optional env vars:**
- `TERADATA_PORT` - Teradata connection port (default 1025)
- `REDIS_ADDR` - Redis server address (default `localhost:6379`)
- `REDIS_PASSWORD` - Redis password (optional, default empty)
- `REDIS_DB` - Redis database number (default 0)
- `PORT` - HTTP server port (default 8080)
- `VITE_API_URL` - Frontend API base URL (for custom API endpoint)

**Secrets location:**
- `.env` file at project root (not committed, git-ignored)
- Template provided: `.env.example` (committed to repo)
- Production: Environment variables should be injected by deployment platform

**Variable Precedence:**
1. Environment variables (highest priority)
2. `.env` file values
3. Hardcoded defaults in code

## Webhooks & Callbacks

**Incoming:**
- None detected
- Application is read-only from lineage perspective
- No subscription-based updates or event streaming

**Outgoing:**
- None detected
- Application makes only outbound queries to Teradata
- No callback URLs registered with external services

## Data Flow

**Request Path:**
```
Frontend (React, Zustand + TanStack Query)
  ↓ (HTTP/REST via Axios)
Backend (Go Chi Router on :8080 or Python Flask)
  ↓ (SQL queries via teradatasql/ODBC)
Teradata Database
  ↓ (Optional: check Redis cache first)
Redis Cache (if configured)
```

**Lineage Query Flow:**
1. Frontend requests lineage for asset ID via `/api/v1/lineage/{assetId}`
2. Backend checks Redis cache (if available) using TanStack Query
3. Cache miss → Backend executes recursive CTE in Teradata
4. Teradata returns graph nodes and edges
5. Backend caches result in Redis (optional)
6. Frontend renders graph using React Flow + ELKjs layout

## Deployment Topology

**Development:**
- Frontend dev server: `http://localhost:3000` (Vite with hot reload)
- Backend: `http://localhost:8080` (Go or Python server)
- Vite proxy routes `/api/*` to backend
- Database: Remote Teradata instance (via `TERADATA_HOST`)

**Production (Example):**
- Frontend: Static files served by web server or CDN (from `dist/` build)
- Backend: Go binary or containerized Python server
- Database: Teradata production instance
- Cache: Optional Redis cluster for high-throughput scenarios
- API communication: Standard HTTP/REST (no WebSockets or gRPC)

---

*Integration audit: 2026-01-29*
