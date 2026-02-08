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
6. [Production Deployment](#production-deployment)
7. [Architecture](#architecture)
8. [Troubleshooting](#troubleshooting)

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

### Optional

| Software | Minimum Version | Purpose |
|----------|----------------|---------|
| Go | 1.23+ | Only needed if running the Go backend instead of the Python backend |
| Redis | 6+ | Optional caching layer; the application falls back gracefully without Redis |

**Redis** is only beneficial for high-traffic production deployments. Most deployments do not need Redis. If Redis is unavailable, the application continues to operate normally without caching.

### Backend Choice

Both a Go backend and a Python (Flask) backend are provided. They serve the same API endpoints and are interchangeable.

| Backend | Advantages | When to Use |
|---------|-----------|-------------|
| Python (Flask) | No compilation, simpler deployment, fewer prerequisites | Most deployments |
| Go | Better performance, built-in Redis caching, structured JSON logging | High-concurrency production environments |

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

The Python environment is required regardless of backend choice. It is used by the database setup scripts and the Python backend.

**Python dependencies installed:** `teradatasql`, `flask`, `flask-cors`, `requests`, `python-dotenv`, `sqlglot`.

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

### Step 5 (Optional): Build the Go Backend

Only needed if you intend to run the Go backend instead of the Python backend.

```bash
cd lineage-api
make build           # Creates bin/server binary
```

---

## Configuration

### Precedence

Configuration values are resolved in the following order (highest precedence first):

1. **Environment variables** -- Always take precedence
2. **`.env` file** -- In the project root directory
3. **`config.yaml`** -- Go backend only; in the `lineage-api/` directory
4. **Default values** -- Built into the application

### Environment Variable Reference

| Variable | Description | Default | Required | Used By |
|----------|-------------|---------|----------|---------|
| `TERADATA_HOST` | Teradata hostname or IP address | -- | Yes | All |
| `TERADATA_USER` | Teradata username | `demo_user` | No | All |
| `TERADATA_PASSWORD` | Teradata password | -- | Yes | All |
| `TERADATA_DATABASE` | Default database name | `demo_user` | No | All |
| `TERADATA_PORT` | Teradata port number | `1025` | No | All |
| `API_PORT` | HTTP server port | `8080` | No | Backend |
| `REDIS_ADDR` | Redis server address | `localhost:6379` | No | Go backend |
| `REDIS_PASSWORD` | Redis password | (empty) | No | Go backend |
| `REDIS_DB` | Redis database number | `0` | No | Go backend |
| `VALIDATION_MAX_DEPTH_LIMIT` | Maximum traversal depth upper bound | `20` | No | Go backend |
| `VALIDATION_DEFAULT_MAX_DEPTH` | Default lineage traversal depth | `5` | No | Go backend |
| `VALIDATION_MIN_MAX_DEPTH` | Minimum traversal depth lower bound | `1` | No | Go backend |

**"Used By" key:**
- **All** = Python backend, Go backend, and database scripts
- **Backend** = Both Python and Go backends
- **Go backend** = Go backend only

### Legacy Variables (Deprecated)

The following legacy variable names are still supported as fallbacks but are deprecated. Use the primary names listed in the reference table above.

| Legacy Variable | Replaced By | Notes |
|----------------|-------------|-------|
| `TD_HOST` | `TERADATA_HOST` | |
| `TD_USER` | `TERADATA_USER` | |
| `TD_PASSWORD` | `TERADATA_PASSWORD` | |
| `TD_DATABASE` | `TERADATA_DATABASE` | |
| `PORT` | `API_PORT` | |

If both the legacy and primary variable are set, the primary variable takes precedence.

### Go Server Configuration File

The Go backend optionally reads a `config.yaml` file from the `lineage-api/` directory. This file is not required. Any values set in environment variables or `.env` take precedence over `config.yaml`.

### Server Timeouts (Go Backend)

The Go backend has the following built-in timeouts:

| Timeout | Value | Description |
|---------|-------|-------------|
| Read timeout | 15 seconds | Maximum time to read the full request |
| Write timeout | 60 seconds | Maximum time to write the full response |
| Idle timeout | 60 seconds | Maximum time to keep idle connections open |
| Graceful shutdown | 30 seconds | Time allowed for in-flight requests to complete on shutdown |

These timeouts are compiled into the binary and are not configurable via environment variables.

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
python scripts/setup/setup_lineage_schema.py --openlineage
```

The `--openlineage` flag is required. Without it, the script creates the older `LIN_*` tables which are not compatible with the current application.

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

Two population methods are available depending on your environment.

**Fixtures mode (default)** -- uses hardcoded column mappings for demo and testing:

```bash
python scripts/populate/populate_lineage.py
```

**DBQL mode** -- extracts lineage from executed SQL in Teradata query logs:

```bash
python scripts/populate/populate_lineage.py --dbql
python scripts/populate/populate_lineage.py --dbql --since "2024-01-01"    # Since a specific date
```

DBQL mode requires SELECT privileges on `DBC.DBQLogTbl` and `DBC.DBQLSQLTbl`. The Teradata user specified in your configuration must have access to these system views.

**Dry run** -- preview what would be populated without making changes:

```bash
python scripts/populate/populate_lineage.py --dry-run
```

**Populate metadata** -- after populating lineage data, populate the metadata for the tables:

```bash
python scripts/populate/populate_test_metadata.py
```

This populates `OL_NAMESPACE`, `OL_DATASET`, and `OL_DATASET_FIELD` records for the tables referenced in the lineage data.

---

## Running the Application

### 5.1 Start the Backend

#### Python Backend (recommended for most deployments)

```bash
cd lineage-api
python python_server.py        # Starts on port 8080 (or API_PORT)
```

#### Go Backend

```bash
cd lineage-api
make build && ./bin/server     # Build and run
# Or run without building:
go run cmd/server/main.go
```

Both backends serve the same API endpoints and are interchangeable. The Python backend is simpler to deploy (no compilation step). The Go backend offers better performance and includes built-in Redis caching support.

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

# Access the frontend
# Development: http://localhost:3000 or http://localhost:5173
# Production: your configured domain
```

A successful health check returns HTTP 200. The namespaces endpoint returns a JSON array of configured namespaces, confirming both the backend and database connection are working.

### 5.4 Startup Order

Start components in the following order:

1. **Teradata database** -- must already be running and accessible
2. **Redis** (optional) -- start before the backend if using caching
3. **Backend server** -- Python or Go
4. **Frontend** -- development server or web server serving static files

---

## Production Deployment

*Section content to be added.*

---

## Architecture

*Section content to be added.*

---

## Troubleshooting

*Section content to be added.*
