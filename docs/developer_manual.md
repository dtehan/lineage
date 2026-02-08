# Developer Manual

This manual enables a new developer to set up a local environment, run all test suites, understand the architecture, and contribute code.

**Related documentation:**
- [Operations Guide](operations_guide.md) -- Deployment, configuration, and production operations
- [User Guide](user_guide.md) -- End-user feature documentation
- [Security Documentation](SECURITY.md) -- TLS, authentication proxy, rate limiting, CORS

## Table of Contents

1. [Quick Start](#quick-start)
2. [Environment Setup](#environment-setup)
3. [Running Tests](#running-tests)
4. [Architecture Overview](#architecture-overview)
5. [Backend Architecture](#backend-architecture)
6. [Frontend Architecture](#frontend-architecture)
7. [Database and Schema](#database-and-schema)
8. [API Reference](#api-reference)
9. [Code Standards](#code-standards)
10. [Contributing](#contributing)

---

## Quick Start

Get the application running locally in under 10 minutes.

```bash
# 1. Clone and enter project
git clone <repository-url>
cd lineage

# 2. Python environment
python3 -m venv .venv
source .venv/bin/activate        # Linux / macOS
# .venv\Scripts\activate         # Windows
pip install -r requirements.txt

# 3. Configure environment
cp .env.example .env
# Edit .env with your Teradata credentials:
#   TERADATA_HOST=your-teradata-host.example.com
#   TERADATA_USER=your_username
#   TERADATA_PASSWORD=your_password

# 4. Database setup
cd database
python scripts/setup/setup_lineage_schema.py --openlineage
python scripts/setup/setup_test_data.py

# 5. Populate lineage data
python scripts/populate/populate_lineage.py

# 6. Start backend (in this terminal)
cd ../lineage-api
python python_server.py          # Runs on :8080

# 7. Start frontend (open a new terminal)
cd lineage-ui
npm install
npm run dev                      # Runs on :3000, proxies API to :8080
```

Open `http://localhost:3000` to view the application.

For detailed configuration, QVCI setup, and production deployment, see the [Operations Guide](operations_guide.md).

---

## Environment Setup

This section provides developer-specific setup details. For comprehensive installation and configuration procedures, see the [Operations Guide](operations_guide.md).

### Prerequisites

See [Operations Guide > Prerequisites](operations_guide.md#prerequisites) for full software requirements and Teradata QVCI verification.

| Software | Minimum Version | Notes |
|----------|----------------|-------|
| Python | 3.9+ | Required for database scripts and Python backend |
| Node.js | 18+ | Required for frontend build and development |
| Go | 1.23+ | Optional -- only needed for the Go backend |
| Redis | 6+ | Optional -- skip for local development; the application falls back gracefully |

### Python Setup

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

This installs six packages: `teradatasql` (Teradata driver), `flask` and `flask-cors` (Python backend), `requests` (HTTP client for testing), `python-dotenv` (environment variable loading), and `sqlglot` (SQL parsing for DBQL lineage extraction).

The Python environment is required regardless of which backend you run. The database setup scripts and population tools all use Python.

### Node.js Setup

```bash
cd lineage-ui
npm install
```

This installs both production dependencies (React, React Flow, TanStack Query, Zustand, ELKjs) and development dependencies (Vitest, Playwright, ESLint, TypeScript). The full dependency list is in `lineage-ui/package.json`.

### Configuration

See [Operations Guide > Configuration](operations_guide.md#configuration) for the full environment variable reference.

Developer-specific notes:

- **Vite proxy:** The Vite dev server proxies all `/api/*` requests to `http://localhost:8080` (configured in `lineage-ui/vite.config.ts`). No CORS configuration is needed during local development.
- **Redis is optional:** Skip Redis for local development. Both the Go and Python backends fall back gracefully when Redis is unavailable. Redis is only beneficial for high-traffic production deployments.
- **Frontend ports:** `npm run dev` runs the frontend on `:3000` with hot module replacement -- changes to React components appear instantly without a full page reload. Playwright E2E tests use a separate instance on `:5173` (auto-started by Playwright's `webServer` config).
- **Backend choice:** Both the Python (Flask) and Go backends serve the same API endpoints and are interchangeable. The Python backend (`python python_server.py`) is recommended for local development because it requires no compilation. See [Operations Guide > Prerequisites](operations_guide.md#prerequisites) for a comparison.

### Database Setup

See [Operations Guide > Database Setup](operations_guide.md#database-setup) for QVCI verification, schema creation, and lineage population procedures.

The lineage population script supports two modes:

| Mode | Command | Use Case |
|------|---------|----------|
| Fixtures (default) | `python scripts/populate/populate_lineage.py` | Demo and testing -- uses hardcoded mappings |
| DBQL extraction | `python scripts/populate/populate_lineage.py --dbql` | Production -- extracts lineage from Teradata query logs |

For local development, the fixtures mode provides a complete working dataset without requiring query log history.

---

## Running Tests

The project has four test suites covering database, API, frontend unit, and end-to-end testing. Run all suites before submitting changes.

### Test Suite Overview

| Suite | Tests | Command | Requires |
|-------|-------|---------|----------|
| Database | 73 | `cd database && python tests/run_tests.py` | Teradata connection |
| API | 20 | `cd lineage-api && python tests/run_api_tests.py` | Backend running on :8080 |
| Frontend Unit | ~558 | `cd lineage-ui && npm test` | Nothing (runs in jsdom) |
| E2E | 34 | `cd lineage-ui && npx playwright test` | Backend on :8080 |

### 3.1 Database Tests (73 tests)

**Command:**

```bash
cd database
python tests/run_tests.py
```

**Requires:** Teradata connection (configured via `.env`).

**What it validates:** Schema correctness, CTE lineage traversal (upstream and downstream), cycle detection, diamond patterns, fan-in/fan-out, and performance benchmarks.

**Test files:**
- `tests/run_tests.py` -- Main test runner
- `tests/test_correctness.py` -- CTE correctness validation
- `tests/test_credential_validation.py` -- Credential validation
- `tests/test_dbql_error_handling.py` -- DBQL error handling

**Note:** 29 tests are skipped in ClearScape Analytics environments due to DBQL and index limitations. Expected output is approximately 73 tests total with 29 skipped.

### 3.2 API Tests (20 tests)

**Command:**

```bash
cd lineage-api
python tests/run_api_tests.py
```

**Requires:** The Python backend running on `:8080`. Start it first in a separate terminal:

```bash
cd lineage-api
python python_server.py
```

**What it validates:** All REST API endpoints (v1 and v2), response shapes, error handling, and search functionality.

### 3.3 Frontend Unit Tests (~558 tests)

**Commands:**

```bash
cd lineage-ui

# Watch mode (re-runs on file changes, best for development)
npm test

# Single run (CI-style, exits after completion)
npx vitest --run

# With coverage report
npm run test:coverage
```

**Requires:** Nothing. Tests run in a jsdom environment via Vitest -- no backend or browser needed.

**What it validates:** Component rendering, hook behavior, store logic, API client mocking, graph layout calculations, and accessibility.

**Configuration:** `vitest.config.ts` sets the jsdom environment with a setup file at `src/test/setup.ts`. Coverage uses the v8 provider.

**Note:** The test count changes as tests are added; currently ~558 tests across 32 test files. Some tests may have known failures (accessibility tests). Use watch mode during development for the fastest feedback loop.

### 3.4 E2E Tests (34 tests)

**Commands:**

```bash
cd lineage-ui

# Headless (default)
npx playwright test

# With visible browser
npx playwright test --headed

# Interactive UI mode (inspect tests step by step)
npx playwright test --ui
```

**Requires:** The Python backend running on `:8080`. You do NOT need to run `npm run dev` separately -- Playwright automatically starts the frontend on `:5173` via its `webServer` configuration.

**What it validates:** Full user workflows including asset browsing, lineage graph navigation, search, and detail panel interaction.

**Test file:** `e2e/lineage.spec.ts` (single file with 34 tests).

**Configuration:** `playwright.config.ts` runs Chromium only, with `baseURL` set to `http://localhost:5173`. The `webServer` block starts `npm run dev -- --port 5173` automatically.

**First-time setup:** Download browser binaries before your first run:

```bash
npx playwright install
```

### 3.5 Go Backend Tests (optional)

**Command:**

```bash
cd lineage-api
make test
```

**What it validates:** Go unit tests with race detection and coverage. Tests are colocated with source files (`*_test.go`) across the domain, application, and adapter layers.

**Note:** These test the Go backend independently from the Python API tests. Most local development uses the Python backend, so these are optional unless you are modifying Go code.

### Testing Guidance

For day-to-day development, frontend unit tests (`npm test` in watch mode) provide the fastest feedback. Run the full suite across all four test types before committing changes.

---

## Architecture Overview

The application follows a three-tier architecture: React frontend, Go/Python backend, and Teradata database with optional Redis caching.

```mermaid
graph LR
    subgraph Frontend["React Frontend (:3000)"]
        Pages["Features/Pages"] --> Components["Domain Components"]
        Components --> Hooks["TanStack Query Hooks"]
        Components --> Stores["Zustand Stores"]
        Hooks --> Client["Axios Client"]
    end

    subgraph Backend["Go/Python Backend (:8080)"]
        Router["Chi Router"] --> Handlers["HTTP Handlers"]
        Handlers --> Services["Application Services"]
        Services --> Repos["Repository Interfaces"]
    end

    subgraph Data["Data Layer"]
        TD[(Teradata)]
        Redis[(Redis Cache)]
    end

    Client -->|REST API| Router
    Repos --> TD
    Repos -.->|Optional| Redis
```

**How the tiers connect:**

- **Frontend to backend:** The React frontend communicates with the backend exclusively through REST API calls. During local development, Vite proxies all `/api/*` requests to `localhost:8080`, so no CORS configuration is needed.
- **Two backend implementations:** The Go backend (Chi router, hexagonal architecture) is the production implementation. The Python Flask backend (`python_server.py`) serves identical API endpoints with a simpler architecture. Both are interchangeable -- the frontend does not know which backend is running.
- **Data layer:** Teradata stores all lineage metadata in `OL_*` tables. Redis provides an optional caching layer; the application falls back gracefully without it and Redis is only beneficial for high-traffic deployments.

---

## Backend Architecture

### 5.1 Hexagonal Architecture Pattern

The Go backend uses hexagonal (ports and adapters) architecture. The core idea: the domain layer defines interfaces (ports) with no external dependencies, and adapters implement those interfaces for specific technologies. This means the core business logic can be tested without a Teradata connection or Redis instance.

```mermaid
graph TD
    subgraph Inbound["Inbound Adapters"]
        HTTP["HTTP Handlers<br/>(Chi Router)"]
    end

    subgraph Core["Core"]
        Services["Application Services<br/>(Use Cases)"]
        Domain["Domain Entities<br/>(Interfaces)"]
    end

    subgraph Outbound["Outbound Adapters"]
        TeradataRepo["Teradata Repository"]
        RedisCache["Redis Cache"]
    end

    HTTP --> Services
    Services --> Domain
    TeradataRepo -.->|implements| Domain
    RedisCache -.->|implements| Domain
```

**Why hexagonal?** Dependency inversion keeps the domain pure. Services depend on interfaces, not concrete database code. When testing, mock implementations replace real adapters. When switching databases or caches, only the adapter layer changes.

### 5.2 Directory Structure

```
lineage-api/internal/
├── domain/                     # CORE LAYER - No external dependencies
│   ├── entities.go             # Database, Table, Column, ColumnLineage,
│   │                           # LineageGraph, OpenLineage* types
│   ├── repository.go           # Repository interfaces (AssetRepository,
│   │                           # LineageRepository, SearchRepository,
│   │                           # CacheRepository, OpenLineageRepository)
│   └── mocks/                  # Mock implementations for testing
│
├── application/                # USE CASE LAYER - Orchestrates domain
│   ├── dto.go                  # Data transfer objects (request/response)
│   ├── asset_service.go        # Asset browsing logic
│   ├── lineage_service.go      # Lineage traversal logic
│   ├── openlineage_service.go  # OpenLineage-aligned operations
│   └── search_service.go       # Search logic
│
├── adapter/                    # ADAPTER LAYER - External integrations
│   ├── inbound/http/           # Chi router, handlers, middleware
│   │   ├── router.go           # Route definitions (v1 + v2 APIs)
│   │   ├── handlers.go         # v1 API handlers
│   │   ├── openlineage_handlers.go  # v2 API handlers
│   │   ├── response.go         # Response helpers
│   │   └── validation.go       # Input validation
│   └── outbound/
│       ├── teradata/           # Teradata repository implementations
│       │   ├── connection.go   # Connection management
│       │   ├── asset_repo.go   # AssetRepository impl
│       │   ├── lineage_repo.go # LineageRepository impl
│       │   ├── openlineage_repo.go  # OpenLineageRepository impl
│       │   └── search_repo.go  # SearchRepository impl
│       └── redis/
│           └── cache.go        # CacheRepository impl (optional)
│
└── infrastructure/             # CROSS-CUTTING CONCERNS
    ├── config/                 # Viper configuration loading
    └── logging/                # slog structured logging
```

**Layer responsibilities:**

- **domain/** -- Core entities (`Database`, `Table`, `Column`, `ColumnLineage`, `LineageGraph`, and all `OpenLineage*` types) and repository interfaces. This layer has zero external imports beyond the Go standard library.
- **application/** -- Service layer implementing use cases. DTOs define the shapes of API requests and responses. Services orchestrate domain operations and enforce business rules.
- **adapter/inbound/http/** -- Chi router, HTTP handlers for both v1 and v2 APIs, middleware, input validation, and response helpers. This is the only layer that knows about HTTP.
- **adapter/outbound/teradata/** -- Teradata repository implementations. Contains SQL queries, connection management, and result mapping. This is the only layer that knows about Teradata.
- **adapter/outbound/redis/** -- Optional Redis cache implementation. Implements `CacheRepository` for caching query results.
- **infrastructure/** -- Cross-cutting concerns: Viper-based configuration loading and slog structured logging.

### 5.3 Key Interfaces

The domain layer defines five repository interfaces in `domain/repository.go`:

| Interface | Purpose | Key Methods |
|-----------|---------|-------------|
| `AssetRepository` | Browse databases, tables, columns | `ListDatabases`, `GetTable`, `ListColumns` |
| `LineageRepository` | Traverse lineage graph | `GetUpstreamLineage`, `GetDownstreamLineage` |
| `SearchRepository` | Search across datasets | `Search` (with asset type filters) |
| `CacheRepository` | Optional caching layer | `Get`, `Set`, `Delete`, `Exists` |
| `OpenLineageRepository` | OpenLineage-aligned operations | `GetColumnLineageGraph`, `ListDatasets`, `ListFields` |

Mock implementations in `domain/mocks/` enable testing services without a Teradata connection.

### 5.4 Python Backend

The Python Flask backend (`lineage-api/python_server.py`) serves the same API endpoints without the hexagonal architecture. It queries Teradata directly using `teradatasql` and returns JSON responses via Flask. This simpler implementation is recommended for local development because it requires no Go compilation and starts instantly.

Both backends are interchangeable. The frontend works identically with either one.

---

## Frontend Architecture

### 6.1 Technology Stack

| Technology | Purpose |
|-----------|---------|
| React 18 | UI framework |
| TypeScript | Type safety |
| Vite | Build tool and dev server |
| TanStack Query | Server state management (caching, refetching, loading) |
| Zustand | Client state management (UI state, selections) |
| React Flow (@xyflow/react) | Graph visualization |
| ELKjs | Automatic hierarchical graph layout |

### 6.2 Directory Structure

```
lineage-ui/src/
├── api/                        # API LAYER - Server communication
│   ├── client.ts               # Axios HTTP client
│   └── hooks/                  # TanStack Query custom hooks
│       ├── useAssets.ts        # Asset browser data fetching
│       ├── useLineage.ts       # Lineage graph data fetching
│       ├── useOpenLineage.ts   # OpenLineage v2 API hooks
│       └── useSearch.ts        # Search data fetching
│
├── components/                 # COMPONENT LAYER - UI building blocks
│   ├── common/                 # Reusable UI components
│   │   ├── Button.tsx, Input.tsx
│   │   ├── LoadingSpinner.tsx, LoadingProgress.tsx
│   │   ├── Pagination.tsx, Tooltip.tsx
│   │   └── ErrorBoundary.tsx
│   ├── layout/                 # App chrome
│   │   └── AppShell.tsx, Header.tsx, Sidebar.tsx
│   └── domain/                 # Feature components
│       ├── AssetBrowser/       # Hierarchical database/table/column navigation
│       ├── LineageGraph/       # Graph visualization (largest component group)
│       │   ├── LineageGraph.tsx
│       │   ├── TableNode/, ColumnNode.tsx, LineageEdge.tsx
│       │   ├── Toolbar.tsx, DetailPanel.tsx, Legend.tsx
│       │   ├── DetailPanel/ (ColumnsTab, StatisticsTab, DDLTab)
│       │   ├── LineageTableView/
│       │   └── hooks/ (useLineageHighlight, useDatabaseClusters, etc.)
│       ├── ImpactAnalysis/     # Impact summary and analysis table
│       └── Search/             # SearchBar, SearchResults
│
├── features/                   # PAGE LAYER - Route-level components
│   ├── ExplorePage.tsx         # Asset browser page
│   ├── LineagePage.tsx         # Single-column lineage
│   ├── DatabaseLineagePage.tsx # Database-scoped lineage
│   ├── AllDatabasesLineagePage.tsx  # Cross-database lineage
│   ├── ImpactPage.tsx          # Impact analysis
│   └── SearchPage.tsx          # Search results
│
├── stores/                     # STATE LAYER - Zustand stores
│   ├── useLineageStore.ts      # Graph state (selection, depth, direction)
│   └── useUIStore.ts           # UI state (sidebar, panels, view mode)
│
├── hooks/                      # SHARED HOOKS
│   └── useLoadingProgress.ts   # Loading stage tracking
│
├── types/                      # TYPE DEFINITIONS
│   └── openlineage.ts          # OpenLineage API types
│
└── utils/graph/                # GRAPH UTILITIES
    ├── layoutEngine.ts         # ELKjs layout integration
    └── openLineageAdapter.ts   # API response to React Flow adapter
```

### 6.3 Data Flow

Data flows through the frontend in a consistent pattern:

1. **User navigates** to a page (`features/` component bound to a route)
2. **Page calls a hook** from `api/hooks/` (e.g., `useOpenLineage` for lineage data)
3. **Hook fetches data** from the backend via the Axios client (`api/client.ts`)
4. **Response is transformed** by the adapter (`utils/graph/openLineageAdapter.ts`) into React Flow nodes and edges
5. **Graph components render** using React Flow with custom `TableNode` and `ColumnNode` components
6. **Client-side state** (current selection, depth, direction, sidebar visibility) is managed by Zustand stores

### 6.4 Key Patterns

- **TanStack Query for all server data.** Every API call goes through a TanStack Query hook, which provides automatic caching, background refetching, loading states, and error handling. Components never call the API directly.
- **Zustand for client-only state.** UI state (sidebar open/closed, selected node, graph depth/direction) lives in Zustand stores. These stores have no server sync -- they are purely client-side.
- **React Flow custom nodes.** The lineage graph renders tables as `TableNode` components containing `ColumnNode` children. Each column row is interactive (click to view lineage, hover to highlight).
- **ELKjs for automatic layout.** Graph layout is computed by ELKjs using a hierarchical/layered algorithm. The layout engine runs in `utils/graph/layoutEngine.ts` and positions nodes before React Flow renders them.
