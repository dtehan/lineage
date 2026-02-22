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
python scripts/setup/setup_lineage_schema.py
python scripts/setup/setup_test_data.py

# 5. Populate lineage data
python scripts/populate/populate_lineage.py  # DBQL mode (default), use --fixtures for demo/testing

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

### Quick Start (ClearScape Analytics)

For quick testing with the provided ClearScape Analytics test database:

```bash
# 1. Clone and setup Python environment
cd play/
python3 -m venv .venv
source .venv/bin/activate
pip install teradatasql flask flask-cors requests

# 2. Setup database schema and load test data
cd database/
python scripts/setup/setup_lineage_schema.py
python scripts/setup/setup_test_data.py
python scripts/populate/populate_lineage.py
python scripts/utils/insert_cte_test_data.py

# 3. Run database tests (optional)
python tests/run_tests.py

# 4. Start backend API
cd ../lineage-api/
python python_server.py &

# 5. Start frontend
cd ../lineage-ui/
npm install
npm run dev &

# 6. Run E2E tests
npx playwright install chromium
npx playwright test

# 7. Access the application
# Open http://localhost:3000 in your browser
```



---

## Environment Setup

This section provides developer-specific setup details. For comprehensive installation and configuration procedures, see the [Operations Guide](operations_guide.md).

### Prerequisites

See [Operations Guide > Prerequisites](operations_guide.md#prerequisites) for full software requirements and Teradata QVCI verification.

| Software | Minimum Version | Notes |
|----------|----------------|-------|
| Python | 3.9+ | Required for database scripts and backend |
| Node.js | 18+ | Required for frontend build and development |

### Python Setup

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

**Core dependencies:**
- `teradatasql` — Teradata driver
- `flask`, `flask-cors` — Python backend
- `requests` — HTTP client for testing
- `python-dotenv` — Environment variable loading
- `sqlglot` — SQL parsing for DBQL lineage extraction
- `loguru` — Structured JSON logging
- `networkx` — In-memory graph engine for BFS traversal
- `psutil` — Memory usage tracking for graph engine

**Caching dependencies (optional, Phase 6):**
- `Flask-Caching` — Redis cache integration
- `redis` — Python Redis client
- `python-redis-lock` — Distributed locks for stampede prevention
- `fakeredis` — Redis mock for testing

The Python environment is required for both the backend server and the database setup scripts.

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
- **Frontend ports:** `npm run dev` runs the frontend on `:3000` with hot module replacement -- changes to React components appear instantly without a full page reload. Playwright E2E tests use a separate instance on `:5173` (auto-started by Playwright's `webServer` config).
- **CORS:** The backend allows CORS from `localhost:3000`, `localhost:3001`, `localhost:3004`, and `localhost:5173` during development. No additional CORS setup needed.
- **Testing auth headers:** To test audit logging with simulated authentication headers from a proxy:
  ```bash
  curl -H "X-Auth-Request-User: test-user" \
       -H "X-Auth-Request-Email: test@example.com" \
       http://localhost:8080/api/v2/openlineage/namespaces
  ```

### Database Setup

See [Operations Guide > Database Setup](operations_guide.md#database-setup) for QVCI verification, schema creation, and lineage population procedures.

The lineage population script supports multiple modes:

| Mode | Command | Use Case |
|------|---------|----------|
| DBQL extraction (default) | `python scripts/populate/populate_lineage.py` | Production -- extracts lineage from Teradata query logs |
| Fixtures | `python scripts/populate/populate_lineage.py --fixtures` | Demo and testing -- uses hardcoded mappings |
| View lineage | `python scripts/populate/populate_lineage.py --views` | Derives column lineage from view SQL definitions |

For local development, fixtures mode provides a complete working dataset without requiring query log history. The `--views` flag can be combined with either mode to additionally populate view lineage.

---

## Running Tests

The project has four test suites covering database, API, frontend unit, and end-to-end testing. Run all suites before submitting changes.

### Test Suite Overview

| Suite | Tests | Command | Requires |
|-------|-------|---------|----------|
| Database | 73 | `cd database && python tests/run_tests.py` | Teradata connection |
| API | 20 | `cd lineage-api && python tests/run_api_tests.py` | Backend running on :8080 |
| Frontend Unit | ~597 | `cd lineage-ui && npm test` | Nothing (runs in jsdom) |
| E2E | 34 | `cd lineage-ui && npx playwright test` | Backend on :8080 + auto-starts frontend |

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

### 3.3 Frontend Unit Tests (~597 tests)

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

**Note:** The test count changes as tests are added; currently ~597 tests across 36+ test files. Some tests may have known failures (accessibility tests). Use watch mode during development for the fastest feedback loop.

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

### Testing Guidance

For day-to-day development, frontend unit tests (`npm test` in watch mode) provide the fastest feedback. Run the full suite across all four test types before committing changes.

---

## Architecture Overview

The application follows a three-tier architecture: React frontend, Python Flask backend, and Teradata database.

```mermaid
graph LR
    subgraph Frontend["React Frontend (:3000)"]
        Pages["Features/Pages"] --> Components["Domain Components"]
        Components --> Hooks["TanStack Query Hooks"]
        Components --> Stores["Zustand Stores"]
        Hooks --> Client["Axios Client"]
    end

    subgraph Backend["Python Flask Backend (:8080)"]
        FlaskApp["Flask Routes"] --> Handlers["Route Handlers"]
        Handlers --> TD_Queries["Teradata Queries"]
    end

    subgraph Data["Data Layer"]
        TD[(Teradata)]
    end

    Client -->|REST API| FlaskApp
    TD_Queries --> TD
```

**How the tiers connect:**

- **Frontend to backend:** The React frontend communicates with the backend exclusively through REST API calls. During local development, Vite proxies all `/api/*` requests to `localhost:8080`, so no CORS configuration is needed.
- **Backend:** The Python Flask backend (`python_server.py`) serves all API endpoints as a single-file application. It queries Teradata directly using the `teradatasql` driver and returns JSON responses.
- **Data layer:** Teradata stores all lineage metadata in `OL_*` tables.

---

## Backend Architecture

### 5.1 Python Flask Backend

The backend follows a layered architecture pattern with clear separation of concerns:

```
lineage-api/
├── python_server.py               # Application factory (77 lines, was 1454)
├── config.py                      # Configuration management
├── routes/                        # Flask Blueprints
│   ├── health.py                  # Health check endpoints
│   ├── openlineage.py            # OpenLineage v2 API routes
│   ├── cache.py                  # Cache management endpoints
│   └── graph.py                  # Graph engine status and reload endpoints
├── repositories/                  # Data access layer
│   ├── base.py                   # Base repository with connection pooling
│   ├── lineage_repository.py     # Lineage CTE queries with caching
│   └── dataset_repository.py     # Dataset metadata queries
├── services/                     # Business logic layer
│   ├── lineage_service.py       # Lineage graph construction with dual-path routing
│   ├── dataset_service.py       # Dataset metadata operations
│   └── impact_service.py        # Impact analysis with upstream lineage
├── graph/                        # In-memory graph engine (Phase 14)
│   ├── __init__.py              # Package exports: GraphStore, GraphLoader, GraphEngine, graph_engine
│   ├── store.py                 # GraphStore dataclass with build() and memory tracking
│   ├── loader.py                # GraphLoader: loads OL_COLUMN_LINEAGE into networkx DiGraph
│   ├── engine.py                # GraphEngine singleton: BFS traversal, blue-green swap, status
│   └── serializer.py            # Redis DiGraph persistence (save/restore/invalidate)
├── cache/                        # Caching layer (optional, requires Redis)
│   ├── __init__.py              # Flask-Caching with graceful degradation
│   ├── keys.py                  # Hierarchical cache key generation
│   ├── stampede.py              # Distributed lock for concurrent requests
│   ├── invalidation.py          # Pattern-based cache invalidation
│   └── metrics.py               # Cache hit rate monitoring
├── middleware/                   # Request/response middleware
│   ├── correlation_id.py        # UUID per request for tracing
│   ├── error_handlers.py        # Exception hierarchy and handlers
│   └── timing.py                # Server-Timing header middleware (Phase 17)
└── tests/
    └── run_api_tests.py          # 20 API integration tests
```

**Key characteristics:**

- **Application factory pattern:** `create_app()` enables testable app instances
- **Repository pattern:** Data access layer abstracts Teradata queries
- **Blueprint organization:** Routes grouped by feature (health, openlineage, cache)
- **Structured logging:** Dual-sink JSON logs with correlation IDs (loguru)
- **Exception hierarchy:** `LineageException` base class with specific errors
- **Optional caching:** Redis cache-aside pattern with graceful degradation

**Database-side modules (v3.0):**

The `database/scripts/populate/` directory includes two key modules for lineage extraction:

| Module | Purpose |
|--------|---------|
| `wildcard_resolver.py` | Resolves `SELECT *` and qualified wildcards (`t1.*`) to actual column names using batch DBC.ColumnsJQV metadata with in-memory caching |
| `view_lineage_extractor.py` | Derives column-level lineage from view SQL definitions via SQLGlot parsing of DBC.TablesV.RequestText |

These modules are invoked by `populate_lineage.py` during DBQL extraction (WildcardResolver) and `--views` mode (ViewLineageExtractor).

### 5.2 Layered Architecture

**Routes** → **Services** → **[GraphEngine (BFS) | Repositories (CTE)]** → **Teradata Database**

- **Routes:** Handle HTTP requests, validate input, call services, format responses
- **Services:** Business logic layer — LineageService delegates to GraphEngine (BFS) when ready, falls back to repositories (CTE) when not
- **Graph Engine:** In-memory networkx DiGraph with BFS traversal; dual-path routing falls back to CTE when graph is not ready
- **Repositories:** Execute database queries, apply caching, map results to domain objects
- **Middleware:** Correlation IDs, error handling, CORS, Server-Timing headers
- **Cache layer:** Optional Redis caching (2-4s queries → <100ms cache hits)

### 5.3 Performance Optimizations

**Database Query Optimization (Phase 4):**
- Composite indexes on `OL_COLUMN_LINEAGE` join pairs: `(target_dataset, target_field)`, `(source_dataset, source_field)`
- Statistics collected on indexed columns for query optimizer
- `LOCKING ROW FOR ACCESS` on all lineage queries for concurrent access
- Path columns optimized to VARCHAR(500) based on baseline measurements

**Caching Layer (Phase 6):**
- Redis cache-aside pattern on all lineage CTE queries
- Hierarchical cache keys enable pattern-based invalidation
- Stampede prevention via distributed locks (concurrent misses → single DB query)
- Graceful degradation to in-memory SimpleCache when Redis unavailable
- 1-hour TTL (configurable via `CACHE_TTL` environment variable)
- Cache management API: POST `/api/v2/cache/invalidate`, GET `/api/v2/cache/stats`

**In-Memory Graph Engine (Phase 14):**
- networkx DiGraph loaded from OL_COLUMN_LINEAGE at startup
- BFS traversal replaces recursive CTE for all lineage queries when graph is warm
- Blue-green swap pattern: new graph built in background, swapped atomically
- Dual-path routing: LineageService delegates to GraphEngine when ready, falls back to CTE
- `GET /api/v2/graph/status` endpoint for monitoring readiness

**Cache Invalidation with Graph Rebuild (Phase 15):**
- `POST /api/v2/cache/invalidate` now triggers three-layer consistency: Redis flush + in-memory graph rebuild
- CTE fallback active during rebuild window (zero stale data risk)

**Redis Graph Persistence (Phase 18):**
- DiGraph serialized to Redis via `nx.node_link_data()` JSON
- Cold restart restores from Redis in <20ms instead of querying Teradata
- Snapshot key `lineage:engine:snapshot` kept separate from `lineage:graph:*` cache keys

**Expected performance:**
- First startup: 2-4 seconds (Teradata load → graph build → Redis save)
- Subsequent restarts: <20ms (Redis restore)
- All queries after warmup: <50ms (in-memory BFS)
- CTE fallback during warmup: 2-4 seconds
- Repeated queries also cached at Redis query level: <100ms
- 600-node graphs: <15 seconds database, <100ms cached

### 5.4 Key Patterns

- **Repository pattern:** Encapsulates data access logic, enables testability
- **Cache-aside with stampede prevention:** Check cache → acquire lock → double-check → query → cache
- **Recursive CTEs:** Lineage traversal uses optimized recursive common table expressions with cycle detection
- **Correlation IDs:** UUID per request enables distributed tracing across logs
- **Graceful degradation:** Application works without Redis (falls back to in-memory cache)
- **Dual-path routing:** LineageService checks `graph_engine.is_ready` — BFS when True, CTE when False
- **Blue-green swap:** Graph rebuilt in background thread; lock only held during reference assignment
- **Server-Timing headers:** Every lineage response includes timing metrics (bfs_upstream/db_upstream durations)
- **Three-layer cache:** Redis query cache + in-memory graph + CTE fallback

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
│       │   ├── ProgressBanner.tsx  # Progressive depth loading banner (Phase 16)
│       │   ├── DetailPanel/ (ColumnsTab, StatisticsTab, DDLTab)
│       │   ├── LineageTableView/
│       │   └── hooks/ (useLineageHighlight, useDatabaseClusters, useMultiSelect, etc.)
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
│   ├── useLineageStore.ts      # Graph state (selection, depth, direction, multi-select mode)
│   └── useUIStore.ts           # UI state (sidebar, panels, view mode)
│
├── hooks/                      # SHARED HOOKS
│   └── useLoadingProgress.ts   # Loading stage tracking with stageDurations and formatMs
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
- **ELKjs in Web Worker (Phase 5).** Graph layout computation happens off the main thread using a Web Worker to prevent UI freezes. The worker is exposed via `useLayoutWorker` hook and communicates using Comlink for type-safe RPC. Large graphs (200+ nodes) automatically disable CSS transitions to prevent animation jank.
- **React memoization.** `nodeTypes`, `edgeTypes`, and filtered node/edge arrays are memoized to prevent unnecessary re-renders. React Profiler instrumentation tracks re-render frequency in development mode.
- **Multi-select via store + hook (Phase 13).** `isMultiSelectMode` in Zustand controls whether toolbar multi-select is active. The `useMultiSelect` hook syncs this state with React Flow's internal `multiSelectionActive` property via `useStoreApi`. When active, `multiSelectionKeyCode` is set to `null` so every click toggles selection without requiring a modifier key. Selected nodes display a blue ring and can be dragged as a group.
- **Alphabetical column sorting (Phase 11).** Columns within table nodes are sorted by `name.localeCompare()` in the layout engine before being assigned to table groups. The Detail Panel's Columns tab uses the same ordering.
- **Topological cluster ordering (Phase 12).** Database clusters are ordered left-to-right using Kahn's algorithm (`topoSortDatabases`) based on edge direction, placing upstream databases on the left. A post-layout `separateDatabaseClusters` pass shifts bounding boxes to guarantee non-overlap with 60px padding.
- **Progressive depth loading (Phase 16).** `useProgressiveLineage` fires a depth-1 query immediately and chains the full-depth query behind it. The depth-1 graph renders instantly (<200ms), and the full graph expands automatically in the background. A thin blue `ProgressBanner` shows "Expanding to full depth..." during the background fetch.
- **Per-stage timing display (Phase 17).** After a graph loads, a subtle timing bar shows "Loaded in: Fetch Xms / Layout Xms / Render Xms". The `useLoadingProgress` hook tracks stage durations via `performance.now()`. Server-Timing headers from the API are available in browser DevTools.

### 6.5 Performance Optimizations (Phase 5)

**Web Worker for Layout:**
- ELKjs layout computation runs in a separate thread (`layoutWorker.ts`)
- Prevents 3-5 second UI freeze during graph layout for large graphs
- Comlink provides type-safe communication via structured cloning
- Singleton worker instance (created once at module level)

**Memoization:**
- `nodeTypes` and `edgeTypes` objects are stable references (prevent React Flow re-renders)
- All callbacks passed to React Flow are memoized with `useCallback`
- `filteredNodesAndEdges` memoized based on filter criteria

**Large Graph Handling:**
- CSS transitions automatically disabled for >200 node graphs
- Transitions re-enabled on component unmount to prevent state leakage
- Progressive loading states show database clusters → full graph

**Expected performance:**
- 50-node graphs: ~16ms layout time
- 200-node graphs: ~65ms layout time
- 600-node graphs: ~142ms layout time (near-linear scaling)

---

## Database and Schema

### 7.1 OpenLineage Alignment

The database schema follows the [OpenLineage spec v2-0-2](https://openlineage.io/docs/spec/object-model). All lineage metadata tables use the `OL_` prefix and are stored in the `demo_user` database (configurable via `TERADATA_DATABASE`).

```mermaid
erDiagram
    OL_NAMESPACE ||--o{ OL_DATASET : contains
    OL_NAMESPACE ||--o{ OL_JOB : contains
    OL_DATASET ||--o{ OL_DATASET_FIELD : has
    OL_JOB ||--o{ OL_RUN : executes
    OL_RUN ||--o{ OL_RUN_INPUT : reads
    OL_RUN ||--o{ OL_RUN_OUTPUT : writes
    OL_RUN_INPUT }o--|| OL_DATASET : references
    OL_RUN_OUTPUT }o--|| OL_DATASET : references
    OL_DATASET_FIELD ||--o{ OL_COLUMN_LINEAGE : "source or target"
```

### 7.2 Table Reference

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `OL_NAMESPACE` | Data source namespaces | `namespace_id`, `name` (URI: `teradata://host:port`) |
| `OL_DATASET` | Dataset registry (tables/views) | `dataset_id`, `namespace_id`, `name` (`database.table`) |
| `OL_DATASET_FIELD` | Field definitions (columns) | `field_id`, `dataset_id`, `name`, `type` |
| `OL_JOB` | Job definitions (ETL processes) | `job_id`, `namespace_id`, `name` |
| `OL_RUN` | Job execution runs | `run_id`, `job_id`, `state` |
| `OL_RUN_INPUT` | Run input datasets | `run_id`, `dataset_id` |
| `OL_RUN_OUTPUT` | Run output datasets | `run_id`, `dataset_id` |
| `OL_COLUMN_LINEAGE` | Column-level lineage | `source_field_id`, `target_field_id`, `transformation_type` |
| `OL_SCHEMA_VERSION` | Schema version tracking | `version`, `applied_at` |

### 7.3 Lineage Traversal

Column-level lineage is stored in `OL_COLUMN_LINEAGE`, where each row represents a relationship from a source field to a target field. The backend traverses this graph using recursive CTEs in Teradata:

- **Upstream traversal:** Follows the chain `target_field_id` -> `source_field_id` to find all columns that feed into a given column (answering "where does this data come from?").
- **Downstream traversal:** Follows the chain `source_field_id` -> `target_field_id` to find all columns that depend on a given column (answering "what does this data affect?").
- **Cycle detection:** The recursive CTE tracks the traversal path. If a column appears again in the path, the recursion stops for that branch, preventing infinite loops.
- **Depth control:** A `maxDepth` parameter limits how many levels the CTE traverses (default: 3).

### 7.4 Lineage Population

Lineage data is populated into the `OL_*` tables using `database/scripts/populate/populate_lineage.py`, which supports two modes:

- **Fixtures mode (default):** Uses hardcoded column mappings for demo and testing. Provides a complete working dataset without requiring query log history.
- **DBQL mode (`--dbql`):** Extracts lineage from executed SQL statements in Teradata's query logs (DBC.DBQLSqlTbl). Used for production environments with real query activity.

See [database/README.md](../database/README.md) for detailed population procedures and options.

---

## API Reference

### 8.1 API Versioning

The backend serves two API versions:

- **v1 API:** Original endpoints. Still available for backward compatibility.
- **v2 API:** OpenLineage-aligned endpoints. Used by the frontend and recommended for all new integrations.

### 8.2 v2 Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v2/openlineage/namespaces` | List all namespaces |
| GET | `/api/v2/openlineage/namespaces/{namespaceId}` | Get namespace details |
| GET | `/api/v2/openlineage/namespaces/{namespaceId}/datasets` | List datasets in namespace |
| GET | `/api/v2/openlineage/datasets/{datasetId}` | Get dataset with fields |
| GET | `/api/v2/openlineage/datasets/{datasetId}/statistics` | Get dataset statistics |
| GET | `/api/v2/openlineage/datasets/{datasetId}/ddl` | Get dataset DDL |
| GET | `/api/v2/openlineage/datasets/search?q=query` | Search datasets by name |
| GET | `/api/v2/openlineage/search?q=query` | Search (alias) |
| GET | `/api/v2/openlineage/lineage/{datasetId}/{fieldName}` | Get lineage graph for a column |
| GET | `/api/v2/openlineage/lineage/table/{datasetId}` | Get lineage graph for a table |
| GET | `/api/v2/openlineage/lineage/database/{databaseName}` | Get lineage graph for all tables in a database |
| GET | `/api/v2/graph/status` | Get in-memory graph engine status (ready, node_count, edge_count, memory_bytes, last_rebuild_time) |
| POST | `/api/v2/graph/reload` | Trigger in-memory graph rebuild from database |

All endpoints return JSON. Error responses use standard HTTP status codes with a JSON body containing an `error` field.

See [lineage-api/README.md](../lineage-api/README.md) for complete endpoint documentation including request/response examples and v1 endpoints.

---

## Code Standards

The project maintains coding standards for TypeScript/React and SQL.

### 9.1 TypeScript/React Standards

| Convention | Rule |
|-----------|------|
| Formatting | Prettier + ESLint |
| Components | PascalCase, functional with hooks |
| Hooks | camelCase with `use` prefix |
| Test files | `*.test.tsx` colocated with source |
| Imports | 7 groups (React, external, internal, components, hooks, stores, types) |
| State | TanStack Query for server state, Zustand for client state |

### 9.2 SQL Standards

| Convention | Rule |
|-----------|------|
| Naming | `snake_case` for all identifiers |
| Keywords | `UPPERCASE` for all SQL keywords |
| Tables | `MULTISET` tables, `OL_` prefix for lineage system tables |
| Formatting | One clause per line, consistent indentation |
| Performance | Use `MULTISET` over `SET` tables, qualify all column references |

---

## Contributing

### 10.1 Development Workflow

The standard development cycle for contributing changes:

1. **Branch** from `main` with a descriptive name (see Section 10.3)
2. **Develop** your changes following the code standards in Section 9
3. **Test** locally by running the relevant test suites (see Section 3)
4. **Commit** with conventional commit messages (see Section 10.2)
5. **Push** and create a pull request (see Section 10.3)

### 10.2 Commit Conventions

This project uses [Conventional Commits](https://www.conventionalcommits.org/). Every commit message follows the format:

```
type(scope): description
```

**Types:**

| Type | When to Use | Example |
|------|-------------|---------|
| `feat` | New feature or functionality | `feat(api): add dataset search endpoint` |
| `fix` | Bug fix | `fix(graph): correct edge routing for self-referencing tables` |
| `docs` | Documentation changes | `docs(readme): update quick start commands` |
| `test` | Adding or updating tests | `test(api): add lineage traversal test cases` |
| `refactor` | Code restructuring (no behavior change) | `refactor(store): simplify lineage state management` |
| `chore` | Maintenance, dependencies, config | `chore: update Node.js dependencies` |

**Scope conventions:**

- Use the component or area affected: `api`, `ui`, `graph`, `database`, `store`, `readme`
- Phase numbers are used during planned development: `feat(24-01): add component READMEs`
- Scope is optional for broad changes: `chore: update dependencies`

**Rules:**

- Write the description in lowercase, imperative mood ("add feature" not "added feature" or "adds feature")
- No period at the end of the subject line
- Keep the first line under 72 characters
- Add a body for complex changes (blank line after the subject line):

```
feat(graph): add database cluster grouping

Group tables by database in the lineage graph using ELKjs
compound nodes. Clusters are collapsible and color-coded.
```

### 10.3 Pull Request Process

1. **Branch:** Create a descriptive branch from `main`
   - Feature: `feature/search-pagination`
   - Bug fix: `fix/graph-edge-routing`
   - Documentation: `docs/update-api-reference`

2. **Develop:** Make changes and commit incrementally with conventional commits

3. **Test:** Run all affected test suites locally before pushing. At minimum:
   - Frontend changes: `npm test` (unit) and `npx playwright test` (E2E)
   - Backend changes: `cd lineage-api && python tests/run_api_tests.py`
   - Database changes: `cd database && python tests/run_tests.py`

4. **Push:** Push your branch to the remote

5. **Create PR:** Open a pull request against `main` with:
   - A clear title following commit convention format (e.g., `feat(graph): add column search within graph`)
   - Description of what changed and why
   - List of test suites you ran

> **Note:** This project does not currently have CI/CD pipelines or branch protection rules. All quality assurance is done through local testing and code review.

### 10.4 Project Structure Reference

When making changes, use this table to find the relevant code:

| What You're Changing | Where to Look |
|---------------------|---------------|
| API endpoint | `lineage-api/routes/` (Blueprints) or `lineage-api/python_server.py` (app factory) |
| Graph engine | `lineage-api/graph/` (engine, loader, store, serializer) |
| Service layer | `lineage-api/services/` (lineage, dataset, impact) |
| UI component | `lineage-ui/src/components/domain/` |
| Graph behavior | `lineage-ui/src/components/domain/LineageGraph/` |
| Graph layout | `lineage-ui/src/utils/graph/layoutEngine.ts` |
| State management | `lineage-ui/src/stores/` |
| API hook | `lineage-ui/src/api/hooks/` |
| Database schema | `database/scripts/setup/setup_lineage_schema.py` |
| Lineage population | `database/scripts/populate/populate_lineage.py` |
| Wildcard expansion | `database/scripts/populate/wildcard_resolver.py` |
| View lineage extraction | `database/scripts/populate/view_lineage_extractor.py` |
