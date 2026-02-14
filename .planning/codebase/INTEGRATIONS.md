# External Integrations

**Analysis Date:** 2026-02-13

## APIs & External Services

**Teradata Database Query Engine:**
- **Teradata Vantage** - Primary data source for lineage metadata
  - SDK/Client: `teradatasql` Python driver (17.20.0+)
  - Auth: `TERADATA_PASSWORD` (environment variable)
  - Connection: `TERADATA_HOST`, `TERADATA_USER`, `TERADATA_DATABASE`
  - Port: `TERADATA_PORT` (default: 1025)

**OpenLineage Specification Compliance:**
- Aligned with **OpenLineage v2-0-2** specification
- Implements OpenLineage metadata model (namespaces, datasets, fields, jobs, runs)
- No external OpenLineage backend integration - uses local Teradata database only

## Data Storage

**Databases:**

**Teradata (Primary):**
- Type: Relational database
- Connection: `teradatasql` driver with connection pooling per request
- Client: Native Teradata SQL driver (`teradatasql`)
- Schema: OpenLineage tables (OL_* prefix)
  - `OL_NAMESPACE` - Data source namespaces
  - `OL_DATASET` - Dataset registry (tables/views)
  - `OL_DATASET_FIELD` - Field definitions (columns)
  - `OL_JOB` - Job definitions
  - `OL_RUN` - Job execution runs
  - `OL_RUN_INPUT`, `OL_RUN_OUTPUT` - Run input/output lineage
  - `OL_COLUMN_LINEAGE` - Column-level lineage with transformation types
  - `OL_SCHEMA_VERSION` - Schema version tracking
- DBC System Views Used:
  - `DBC.ColumnsJQV` - Column metadata (requires QVCI enabled)
  - `DBC.TablesV` - Table metadata
  - `DBC.ViewsV` - View metadata
  - `DBC.IndexesV` - Index information
  - `DBC.DBCInfoV` - Database version/capability info

**File Storage:**
- **Local filesystem only** - No cloud storage integration
- Graph exports via `html-to-image` library (client-side)

**Caching:**
- **TanStack Query (React Query)** - In-memory client-side caching
  - Default stale time: Configurable per query
  - Persistence: None (browser memory only)
- **No server-side caching** - Each request queries Teradata directly

## Authentication & Identity

**Auth Provider:**
- **Custom basic auth** via environment variables
- Implementation: `TERADATA_PASSWORD` environment variable + username
- No OAuth, JWT, or external identity provider
- Backend validates credentials at startup (see `database/db_config.py`)

**Credential Configuration:**
- Primary vars: `TERADATA_HOST`, `TERADATA_USER`, `TERADATA_PASSWORD`, `TERADATA_DATABASE`
- Fallback vars: `TD_HOST`, `TD_USER`, `TD_PASSWORD`, `TD_DATABASE` (deprecated)
- Password is **required** - application exits if not provided
- Loaded from `.env` file (root directory) or environment variables

## Monitoring & Observability

**Error Tracking:**
- **None** - Errors logged to Flask console output and browser console
- Basic error responses with HTTP status codes

**Logs:**
- **Python backend:** Standard output/stderr logging via `flask` framework
- **Frontend:** Browser console logs (no external logging service)
- **No structured logging** - Uses Python `traceback.print_exc()` for debugging

**Health Checks:**
- `GET /health` endpoint returns `{"status": "ok"}` for server availability

## CI/CD & Deployment

**Hosting:**
- **Local development only** - No production deployment configuration
- Frontend: Vite dev server or static build artifact
- Backend: Python Flask development server (not production-ready for high-traffic)

**CI Pipeline:**
- **None configured** - No GitHub Actions, Jenkins, or CircleCI setup

**Build Artifacts:**
- Frontend: `npm run build` → `lineage-ui/dist/` (Vite static build)
- Backend: No build step - direct Python execution

## Environment Configuration

**Required Environment Variables:**
- `TERADATA_PASSWORD` (or `TD_PASSWORD`) - Database password (no default, app exits if missing)

**Optional Environment Variables with Defaults:**
- `TERADATA_HOST` → `test-sad3sstx4u4llczi.env.clearscape.teradata.com` (ClearScape test)
- `TERADATA_USER` → `demo_user`
- `TERADATA_DATABASE` → `demo_user`
- `TERADATA_PORT` → `1025`
- `API_PORT` → `8080`

**Secrets Location:**
- Stored in `.env` file (root directory, git-ignored)
- Fallback: System environment variables
- Never committed to repository

**Configuration Files:**
- `.env.example` - Template with all required and optional variables
- `.env` - Actual secrets (git-ignored)

## Webhooks & Callbacks

**Incoming:**
- **None** - Application is pull-only (queries Teradata on-demand)

**Outgoing:**
- **None** - No external callbacks or event notifications

**Server Events:**
- RESTful API only - No WebSocket or server-sent events
- Stateless request/response pattern

## API Contract & Response Format

**Backend API Versions:**

**v2 API (Current - OpenLineage-aligned):**
- Base path: `/api/v2/openlineage/`
- Format: JSON
- All responses wrapped in typed response objects
- Namespace resolution for datasets (e.g., `teradata://host:port`)
- Pagination support with `limit` and `offset` parameters

**API Endpoints Summary:**
- `GET /api/v2/openlineage/namespaces` - List namespaces
- `GET /api/v2/openlineage/namespaces/{namespaceId}` - Get namespace
- `GET /api/v2/openlineage/namespaces/{namespaceId}/datasets` - List datasets (paginated)
- `GET /api/v2/openlineage/datasets/{datasetId}` - Get dataset with fields
- `GET /api/v2/openlineage/datasets/{datasetId}/statistics` - Get table row count, create timestamp
- `GET /api/v2/openlineage/datasets/{datasetId}/ddl` - Get DDL/SQL definition
- `GET /api/v2/openlineage/datasets/search?q=query` - Search datasets by name
- `GET /api/v2/openlineage/lineage/{datasetId}/{fieldName}` - Get column-level lineage graph
- `GET /api/v2/openlineage/lineage/table/{datasetId}` - Get table-level lineage (all columns)
- `GET /api/v2/openlineage/lineage/database/{databaseName}` - Get database-level lineage

**Response Content Types:**
- `application/json` - Standard API responses
- `text/plain` - Error messages with HTTP status codes

**Timeout & Limits:**
- Client timeout: 120 seconds (for large lineage queries)
- Pagination limit: Default 100 records, configurable via `limit` parameter
- No rate limiting or request throttling

---

*Integration audit: 2026-02-13*
