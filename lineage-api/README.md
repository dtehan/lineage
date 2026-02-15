# Lineage API - Python Flask Backend

Python Flask backend for the Teradata column lineage application.

Part of [Teradata Column Lineage](../README.md)

## Getting Started

### Prerequisites

- Python 3.9+
- `teradatasql`, `flask`, `flask-cors`, `python-dotenv` (installed via `pip install -r ../requirements.txt`)
- Network access to a Teradata instance

### Configuration

Create a `.env` file in the project root (one directory up from `lineage-api/`) with your Teradata credentials:

```bash
# From project root
cp .env.example .env
# Edit .env with your credentials
```

See [root README](../README.md) for the full variable list.

| Variable | Description | Default |
|----------|-------------|---------|
| `TERADATA_HOST` | Teradata host | - |
| `TERADATA_USER` | Teradata username | `demo_user` |
| `TERADATA_PASSWORD` | Teradata password (required) | - |
| `TERADATA_DATABASE` | Default database | `demo_user` |
| `TERADATA_PORT` | Teradata port | `1025` |
| `API_PORT` | HTTP server port | `8080` |

Legacy aliases (`TD_HOST`, `TD_USER`, `TD_PASSWORD`, `TD_DATABASE`, `PORT`) are supported as fallbacks.

### Running

```bash
# Activate virtual environment (from project root)
source ../.venv/bin/activate

# Run Flask server
python python_server.py  # Runs on :8080
```

The server reads environment variables from `../.env` (project root) automatically via `python-dotenv`.

## Architecture

```
lineage-api/
├── python_server.py               # Flask app factory (77 lines)
├── routes/                        # Flask Blueprints
│   ├── health.py                  # Health check endpoint
│   └── openlineage.py             # v2 API endpoints
├── services/                      # Business logic layer
│   ├── lineage_service.py         # Lineage traversal (upstream/downstream)
│   ├── dataset_service.py         # Dataset metadata operations
│   └── impact_service.py          # Impact analysis logic
├── repositories/                  # Data access layer
│   ├── config.py                  # Database connection management
│   ├── base_repository.py         # Base repository with connection
│   ├── lineage_repository.py      # Lineage queries (recursive CTEs)
│   └── dataset_repository.py      # Dataset queries
├── middleware/                    # Request/response middleware
│   └── correlation_id.py          # Correlation ID injection
├── exceptions/                    # Domain exception classes
│   └── lineage_exceptions.py      # DatasetNotFoundError, LineageTraversalError, etc.
├── utils/                         # Utilities
│   ├── logging_config.py          # Structured logging (loguru)
│   ├── sanitizer.py               # Sensitive data sanitization
│   └── sql_parser.py              # SQL parsing for lineage extraction
├── logs/                          # Log files (gitignored)
│   └── lineage-api.log            # Rotating JSON logs
├── README.md                      # This file
└── tests/
    └── run_api_tests.py           # 25 API integration tests
```

The Python backend follows a layered architecture:

**Application Layer** (`python_server.py`) - Flask app factory creates the app, registers blueprints, configures middleware and error handlers

**Routes Layer** (`routes/`) - Flask Blueprints organize endpoints by feature area, handle request/response serialization

**Service Layer** (`services/`) - Business logic, coordinates between repositories, returns dict shapes matching API contracts

**Repository Layer** (`repositories/`) - Data access, SQL queries (including recursive CTEs for lineage traversal), connection management

**Middleware** (`middleware/`) - Cross-cutting concerns: correlation ID injection, global error handling

**Exceptions** (`exceptions/`) - Domain-specific exception classes with HTTP status codes

**Utilities** (`utils/`) - Shared utilities for logging, sanitization, and SQL parsing

## API Endpoints

### v2 API (OpenLineage-aligned)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v2/openlineage/namespaces` | List namespaces |
| GET | `/api/v2/openlineage/namespaces/{id}` | Get namespace |
| GET | `/api/v2/openlineage/namespaces/{id}/datasets` | List datasets in namespace |
| GET | `/api/v2/openlineage/datasets/search?q=` | Search datasets |
| GET | `/api/v2/openlineage/datasets/{id}` | Get dataset with fields |
| GET | `/api/v2/openlineage/datasets/{id}/statistics` | Get table statistics |
| GET | `/api/v2/openlineage/datasets/{id}/ddl` | Get DDL/SQL definition |
| GET | `/api/v2/openlineage/lineage/{datasetId}/{fieldName}` | Get lineage graph |

## Logging

The backend uses structured JSON logging with dual-sink output:

**Configuration:** `utils/logging_config.py` configures loguru for JSON-serialized logs
**Outputs:**
- **stdout** - JSON logs for container environments and log aggregators
- **File** - `logs/lineage-api.log` with 100 MB rotation, 30-day retention, gzip compression

**Correlation IDs:** Every request gets a unique correlation ID (UUID4) that appears in:
- All log entries for that request (`record.extra.correlation_id`)
- HTTP response headers (`X-Correlation-ID`)
- Error response bodies

**Usage in code:**
```python
from utils.logging_config import configure_logging

logger = configure_logging()  # Called once in app factory
logger.info("Processing request", dataset_id=123, direction="downstream")
logger.error("Query failed", error=str(e))
```

**Parsing logs:**
```bash
# Extract all logs for a specific request
grep "correlation-id-here" logs/lineage-api.log | jq -r '.text'

# Show only errors
jq -r 'select(.record.level.name == "ERROR") | .text' logs/lineage-api.log
```

See [Operations Guide - Logging and Observability](../docs/operations_guide.md#logging-and-observability) for comprehensive logging documentation.

## Testing

```bash
# Start the server first
python python_server.py

# In another terminal, run API tests (25 tests)
python tests/run_api_tests.py
```

## Technology Stack

| Technology | Purpose |
|------------|---------|
| Flask | HTTP framework |
| teradatasql | Teradata database driver |
| flask-cors | Cross-origin request support |
| python-dotenv | Environment variable loading from .env |
| loguru | Structured JSON logging with rotation |
| sqlglot | SQL parsing for lineage extraction |
