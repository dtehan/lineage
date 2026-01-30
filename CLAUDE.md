# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a column-level data lineage application for Teradata databases. The application visualizes data flow between database columns, enabling impact analysis for change management.

**Status:** Implemented and functional. See `docs/user_guide.md` for comprehensive usage documentation.

**Specification Files (in `specs/`):**
- `lineage_plan_database.md` - Teradata schema and SQL
- `lineage_plan_backend.md` - Go backend implementation
- `lineage_plan_frontend.md` - React frontend implementation
- `lineage_visualization_spec.md` - Lineage graph and UI/UX design

**Test Plans (in `specs/`):**
- `test_plan_database.md` - 73 test cases for schema, CTEs, edge cases
- `test_plan_backend.md` - 79 test cases for API, caching, performance
- `test_plan_frontend.md` - 68 test cases for components, E2E, accessibility

**Coding Standards (in `specs/`):**
- `coding_standards_go.md` - Go formatting, error handling, testing
- `coding_standards_typescript.md` - TypeScript/React patterns
- `coding_standards_sql.md` - Teradata SQL standards

## Technology Stack

- **Backend:** Go with Chi router (or Python Flask for testing)
- **Frontend:** React 18 with TypeScript, Vite, TanStack Query, Zustand
- **Graph Visualization:** React Flow (@xyflow/react) + ELKjs
- **Database:** Teradata (lineage metadata in `demo_user` database)
- **Caching:** Redis (optional, falls back gracefully)
- **Testing:** Vitest + React Testing Library (unit), Playwright (E2E)

## Quick Start

```bash
# 1. Setup Python environment (from project root)
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt  # requirements.txt is at project root

# 2. Configure database connection (copy and edit .env.example)
cp .env.example .env
# Edit .env with your Teradata credentials

# 3. Setup database
cd database && python setup_lineage_schema.py && python setup_test_data.py

# 4. Populate lineage (choose one):
python populate_lineage.py              # Manual mappings (demo/testing)
python populate_lineage.py --dbql       # DBQL extraction (production)

# 5. Start backend (Python Flask - recommended for testing)
cd lineage-api && python python_server.py  # Runs on :8080

# 6. Start frontend
cd lineage-ui && npm install && npm run dev  # Runs on :3000
```

## Common Commands

```bash
# Backend
cd lineage-api
python python_server.py          # Start Python server
go run cmd/server/main.go        # Start Go server
make build && ./bin/server       # Build and run Go binary

# Frontend
cd lineage-ui
npm run dev                      # Dev server with hot reload
npm run build                    # Production build
npm test                         # Run Vitest unit tests
npx playwright test              # Run E2E tests

# Database
cd database
python run_tests.py              # Run 73 database tests
python populate_lineage.py       # Manual lineage mappings (default)
python populate_lineage.py --dbql  # DBQL-based extraction
python extract_dbql_lineage.py   # Direct DBQL extraction
```

## Architecture

```
React Frontend (Asset Browser, Lineage Graph, Impact Analysis, Search)
    │
    │ REST API
    ▼
Go Backend (Chi Router, Handlers, Services, Teradata Repository)
    │
    ├──► Teradata (lineage database)
    └──► Redis (cache)
```

### Backend Structure (Hexagonal/Clean Architecture)

```
lineage-api/
├── cmd/server/main.go           # Entry point
├── internal/
│   ├── domain/                  # Core entities and repository interfaces
│   ├── application/             # DTOs and service layer (use cases)
│   └── adapter/
│       ├── inbound/http/        # Chi router, handlers, middleware
│       └── outbound/            # Teradata and Redis implementations
```

### Frontend Structure

```
lineage-ui/
├── src/
│   ├── api/
│   │   ├── client.ts            # Axios client
│   │   └── hooks/               # useAssets, useLineage, useSearch (TanStack Query)
│   ├── components/
│   │   ├── common/              # Button, Input, LoadingSpinner, ErrorBoundary, Tooltip
│   │   ├── layout/              # AppShell, Sidebar, Header
│   │   └── domain/
│   │       ├── AssetBrowser/    # Hierarchical database/table/column browser
│   │       ├── LineageGraph/    # Main graph visualization
│   │       │   ├── TableNode/   # Table cards with column rows
│   │       │   ├── hooks/       # useLineageHighlight, useDatabaseClusters, useGraphSearch
│   │       │   ├── LineageTableView/  # Alternative tabular view
│   │       │   ├── Toolbar.tsx  # Direction, depth, export controls
│   │       │   └── DetailPanel.tsx    # Slide-out metadata panel
│   │       ├── ImpactAnalysis/  # Impact summary and table
│   │       └── Search/          # SearchBar, SearchResults
│   ├── features/                # Page components (ExplorePage, LineagePage, etc.)
│   ├── stores/                  # useLineageStore, useUIStore (Zustand)
│   └── utils/graph/             # layoutEngine (ELKjs integration)
├── e2e/                         # Playwright E2E tests
└── vitest.config.ts
```

### Database Scripts

```
database/
├── db_config.py              # Connection config (uses TERADATA_* env vars, TD_* as fallback)
├── setup_lineage_schema.py   # Creates LIN_* tables and indexes
├── setup_test_data.py        # Creates medallion architecture test tables (SRC→STG→DIM→FACT)
├── populate_lineage.py       # Extracts metadata and populates lineage (manual or DBQL mode)
├── extract_dbql_lineage.py   # DBQL-based automated lineage extraction
├── sql_parser.py             # SQLGlot-based SQL parser for column lineage
├── insert_cte_test_data.py   # Edge cases: cycles, diamonds, fan-out
└── run_tests.py              # 73 database tests
```

## Key Teradata Tables (in `lineage` database)

- `LIN_DATABASE`, `LIN_TABLE`, `LIN_COLUMN` - Asset registries extracted from DBC views
- `LIN_COLUMN_LINEAGE` - Column-to-column relationships (core lineage data)
- `LIN_TABLE_LINEAGE` - Table-level lineage summary
- `LIN_TRANSFORMATION` - Transformation metadata
- `LIN_QUERY` - Query registry from DBQL
- `LIN_WATERMARK` - Incremental extraction tracking

## API Endpoints

- `GET /api/v1/assets/databases` - List databases
- `GET /api/v1/assets/databases/{db}/tables` - List tables
- `GET /api/v1/assets/databases/{db}/tables/{table}/columns` - List columns
- `GET /api/v1/lineage/{assetId}` - Get lineage graph (supports `?direction=upstream|downstream|both&maxDepth=N`)
- `GET /api/v1/lineage/{assetId}/upstream` - Get upstream lineage
- `GET /api/v1/lineage/{assetId}/downstream` - Get downstream lineage
- `GET /api/v1/lineage/{assetId}/impact` - Get impact analysis
- `GET /api/v1/search?q=query` - Search assets

## Lineage Traversal

Uses recursive CTEs in Teradata to traverse the lineage graph:
- Upstream: follows `target_column_id → source_column_id` relationships
- Downstream: follows `source_column_id → target_column_id` relationships
- Cycle detection via path tracking in the CTE

## Testing

| Suite | Count | Command |
|-------|-------|---------|
| Database (Python) | 73 | `cd database && python run_tests.py` |
| Backend API (Python) | 20 | `cd lineage-api && python run_api_tests.py` |
| Frontend Unit (Vitest) | 260+ | `cd lineage-ui && npm test` |
| Frontend E2E (Playwright) | 21 | `cd lineage-ui && npx playwright test` |

**Note:** Database tests have 29 skipped tests in ClearScape Analytics due to DBQL/index limitations.

## Configuration

The project supports configuration via `.env` file or environment variables. Environment variables take precedence.

**Quick setup:** Copy `.env.example` to `.env` and update with your values:
```bash
cp .env.example .env
```

**Environment Variables:**

| Variable | Description | Default |
|----------|-------------|---------|
| `TERADATA_HOST` | Teradata host | - |
| `TERADATA_USER` | Teradata username | - |
| `TERADATA_PASSWORD` | Teradata password (required) | - |
| `TERADATA_DATABASE` | Default database | `demo_user` |
| `TERADATA_PORT` | Teradata port | `1025` |
| `API_PORT` | HTTP server port | `8080` |
| `REDIS_ADDR` | Redis address | `localhost:6379` |
| `REDIS_PASSWORD` | Redis password | - |
| `REDIS_DB` | Redis database number | `0` |

**Legacy aliases (deprecated, still supported):**
- `TD_HOST`, `TD_USER`, `TD_PASSWORD`, `TD_DATABASE` - fallbacks for `TERADATA_*`
- `PORT` - fallback for `API_PORT`

The frontend proxies `/api/*` requests to `http://localhost:8080` via Vite config.
