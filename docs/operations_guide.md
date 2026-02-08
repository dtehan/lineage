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
