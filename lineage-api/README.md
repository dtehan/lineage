# Lineage API

Go backend for the Teradata column lineage application, following hexagonal (clean) architecture. Also includes an alternative Python Flask server for development and testing.

Part of [Teradata Column Lineage](../README.md)

## Architecture (Hexagonal/Clean)

```
lineage-api/
├── cmd/server/main.go              # Application entry point
├── internal/
│   ├── domain/                     # Core business entities and repository interfaces
│   │   ├── entities.go             # Asset, LineageNode, Column types
│   │   ├── repository.go           # Repository interface definitions
│   │   └── mocks/                  # Mock implementations for testing
│   ├── application/                # Use cases and DTOs
│   │   ├── dto.go                  # Data transfer objects
│   │   ├── asset_service.go        # Asset browsing logic
│   │   ├── lineage_service.go      # Lineage traversal logic
│   │   ├── openlineage_service.go  # OpenLineage-aligned operations
│   │   └── search_service.go       # Search logic
│   ├── adapter/
│   │   ├── inbound/http/           # HTTP handlers (Chi router)
│   │   │   ├── router.go           # Route definitions
│   │   │   ├── handlers.go         # v1 API handlers
│   │   │   ├── openlineage_handlers.go  # v2 API handlers
│   │   │   ├── cache_middleware.go  # Cache control and headers middleware
│   │   │   ├── response.go         # Response helpers
│   │   │   └── validation.go       # Input validation
│   │   └── outbound/
│   │       ├── teradata/           # Teradata repository implementation
│   │       └── redis/              # Redis cache implementation
│   │           ├── cache.go               # CacheRepository, NoOpCache, CacheTTLConfig
│   │           ├── cache_keys.go          # Deterministic cache key builders
│   │           ├── cache_metadata.go      # Cache metadata context type
│   │           └── cached_openlineage_repo.go  # Cache-aside decorator
│   └── infrastructure/
│       ├── config/                 # Configuration (Viper)
│       └── logging/               # Structured logging (slog)
├── python_server.py                # Alternative Python Flask backend
├── Makefile                        # Build, test, lint commands
└── tests/                          # Integration tests
```

The architecture follows three layers:

- **Domain** (`internal/domain/`): Core business entities (Asset, LineageNode, Column) and repository interfaces. No external dependencies.
- **Application** (`internal/application/`): Use cases and DTOs. Orchestrates domain objects through services: asset, lineage, openlineage, and search.
- **Adapters** (`internal/adapter/`): External integrations. Inbound: HTTP handlers with Chi router. Outbound: Teradata repository, Redis cache.
- **Infrastructure** (`internal/infrastructure/`): Cross-cutting concerns. Configuration via Viper, structured logging via slog.

## Getting Started

### Go Server

```bash
# Build and run
make build && ./bin/server  # Runs on :8080

# Or run directly
go run cmd/server/main.go
```

### Python Server (development/testing)

```bash
# Activate virtual environment (from project root)
source ../.venv/bin/activate

# Run Flask server
python python_server.py  # Runs on :8080
```

**Prerequisites:** Requires either Go 1.23+ or Python 3.x with Flask. See [root README](../README.md) for full setup instructions.

## Available Commands

| Command | Description |
|---------|-------------|
| `make build` | Build Go binary to `./bin/server` |
| `make run` | Run the application via `go run` |
| `make test` | Run Go tests with race detection and coverage |
| `make test-coverage` | Run tests with HTML coverage report |
| `make lint` | Run golangci-lint |
| `make fmt` | Format Go code |
| `make deps` | Download and tidy dependencies |
| `make clean` | Remove build artifacts |

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
# Go tests
make test

# Python API tests (20 tests)
python tests/run_api_tests.py
```

## Configuration

Configuration via environment variables or `.env` file. See [root README](../README.md) for the full variable list.

| Variable | Description | Default |
|----------|-------------|---------|
| `TERADATA_HOST` | Teradata host | - |
| `TERADATA_USER` | Teradata username | - |
| `TERADATA_PASSWORD` | Teradata password | - |
| `TERADATA_DATABASE` | Default database | `demo_user` |
| `API_PORT` | HTTP server port | `8080` |
| `REDIS_ADDR` | Redis address | `localhost:6379` |
| `REDIS_PASSWORD` | Redis password | - |
| `REDIS_DB` | Redis database number | `0` |
| `CACHE_TTL_LINEAGE` | Lineage graph cache TTL (seconds) | `1800` |
| `CACHE_TTL_ASSETS` | Asset listing cache TTL (seconds) | `900` |
| `CACHE_TTL_STATISTICS` | Statistics cache TTL (seconds) | `900` |
| `CACHE_TTL_DDL` | DDL cache TTL (seconds) | `1800` |
| `CACHE_TTL_SEARCH` | Search cache TTL (seconds) | `300` |

## Technology Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| Go | 1.23 | Language |
| Chi | v5.0.11 | HTTP router |
| Viper | v1.21.0 | Configuration |
| go-redis | v9.7.3 | Cache client (cache-aside pattern) |
| sqlx | v1.3.5 | SQL toolkit |
| slog | stdlib | Structured logging |
| Flask | 3.0+ | Alternative Python server |
