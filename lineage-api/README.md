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
├── python_server.py               # Flask server with all API endpoints
├── README.md                      # This file
└── tests/
    └── run_api_tests.py           # 20 API integration tests
```

The Python backend is a single-file Flask application (`python_server.py`) that queries Teradata directly using the `teradatasql` driver and returns JSON responses. It implements both the v1 and v2 API endpoints.

## API Endpoints

### v1 API (Legacy)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/api/v1/assets/databases` | List databases |
| GET | `/api/v1/assets/databases/{db}/tables` | List tables |
| GET | `/api/v1/assets/databases/{db}/tables/{table}/columns` | List columns |
| GET | `/api/v1/lineage/{assetId}` | Get lineage (both directions) |
| GET | `/api/v1/lineage/{assetId}/upstream` | Get upstream lineage |
| GET | `/api/v1/lineage/{assetId}/downstream` | Get downstream lineage |
| GET | `/api/v1/lineage/{assetId}/impact` | Impact analysis |
| GET | `/api/v1/search` | Search assets |

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

## Testing

```bash
# Start the server first
python python_server.py

# In another terminal, run API tests (20 tests)
python tests/run_api_tests.py
```

## Technology Stack

| Technology | Purpose |
|------------|---------|
| Flask | HTTP framework |
| teradatasql | Teradata database driver |
| flask-cors | Cross-origin request support |
| python-dotenv | Environment variable loading from .env |
