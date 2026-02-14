# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a column-level data lineage application for Teradata databases. The application visualizes data flow between database columns, enabling impact analysis for change management.

**Status:** Implemented and functional. See `docs/user_guide.md` for comprehensive usage documentation.

**Specification Files (in `specs/`):**
- `lineage_plan_database.md` - Teradata schema and SQL
- `lineage_plan_frontend.md` - React frontend implementation
- `lineage_visualization_spec.md` - Lineage graph and UI/UX design

**Test Plans (in `specs/`):**
- `test_plan_database.md` - 73 test cases for schema, CTEs, edge cases
- `test_plan_frontend.md` - 68 test cases for components, E2E, accessibility

**Coding Standards (in `specs/`):**
- `coding_standards_typescript.md` - TypeScript/React patterns
- `coding_standards_sql.md` - Teradata SQL standards

## Technology Stack

- **Backend:** Python Flask
- **Frontend:** React 18 with TypeScript, Vite, TanStack Query, Zustand
- **Graph Visualization:** React Flow (@xyflow/react) + ELKjs
- **Database:** Teradata (lineage metadata in `demo_user` database)
- **Testing:** Vitest + React Testing Library (unit), Playwright (E2E)

## Quick Start

```bash
# 1. Setup Python environment (from project root)
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt  # requirements.txt is at project root

# 2. Configure database connection (copy and edit .env.example)
cp .env.example .env
# Edit .env with your Teradata credentials

# 3. Setup database (creates OL_* tables)
cd database && python scripts/setup/setup_lineage_schema.py && python scripts/setup/setup_test_data.py

# 4. Populate OpenLineage tables
python scripts/populate/populate_lineage.py              # DBQL extraction (production) by default

# 5. Start backend
cd lineage-api && python python_server.py

# 6. Start frontend
cd lineage-ui && npm install && npm run dev  # Runs on :3000
```

## Common Commands

```bash
# Backend
cd lineage-api
python python_server.py          # Python server

# Frontend
cd lineage-ui
npm run dev                      # Dev server with hot reload
npm run build                    # Production build
npm test                         # Run Vitest unit tests
npx playwright test              # Run E2E tests

# Database
cd database
python tests/run_tests.py              # Run 73 database tests
python scripts/setup/setup_lineage_schema.py  # Create OL_* tables
python scripts/utils/insert_cte_test_data.py   # Insert test lineage patterns (cycles, diamonds, fans)
python scripts/populate/populate_test_metadata.py # Populate OL_* metadata for test tables (run after insert_cte_test_data.py)

# Populate lineage (two modes available)
python scripts/populate/populate_lineage.py                # DBQL mode (default) - production lineage from query logs
python scripts/populate/populate_lineage.py --fixtures     # Fixtures mode - hardcoded mappings for demo/testing
python scripts/populate/populate_lineage.py --dbql --since "2024-01-01"  # DBQL since specific date
python scripts/populate/populate_lineage.py --dry-run      # Preview what would be populated
```

## Architecture

```
React Frontend (Asset Browser, Lineage Graph, Impact Analysis, Search)
    │
    │ REST API
    ▼
Python Backend (Flask, REST API)
    │
    └──► Teradata (lineage database)
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
├── db_config.py                                    # Connection config (uses TERADATA_* env vars, TD_* as fallback)
├── scripts/
│   ├── setup/
│   │   ├── setup_lineage_schema.py                 # Creates OpenLineage tables (OL_*)
│   │   └── setup_test_data.py                      # Creates medallion architecture test tables (SRC→STG→DIM→FACT)
│   ├── populate/
│   │   ├── populate_lineage.py                     # Populates OpenLineage tables from DBC views (manual mappings)
│   │   └── populate_test_metadata.py               # Populates OL_NAMESPACE, OL_DATASET, OL_DATASET_FIELD for test data
│   └── utils/
│       ├── insert_cte_test_data.py                 # Inserts test lineage patterns into OL_COLUMN_LINEAGE
│       └── benchmark_cte.py                        # Performance benchmarks
├── tests/
│   ├── run_tests.py                                # 73 database tests
│   ├── test_correctness.py                         # CTE correctness validation
│   ├── test_credential_validation.py               # Credential validation tests
│   └── test_dbql_error_handling.py                 # DBQL error handling tests
└── archive/
    ├── extract_dbql_lineage.py                     # Experimental DBQL extraction (archived)
    └── sql_parser.py                               # SQL parsing utilities (archived)
```

## OpenLineage Schema

Aligned with [OpenLineage spec v2-0-2](https://openlineage.io/docs/spec/object-model):

- `OL_NAMESPACE` - Data source namespaces (teradata://host:port)
- `OL_DATASET` - Dataset registry (tables/views)
- `OL_DATASET_FIELD` - Field definitions (columns)
- `OL_JOB` - Job definitions (ETL processes)
- `OL_RUN` - Job execution runs
- `OL_RUN_INPUT`, `OL_RUN_OUTPUT` - Run input/output datasets
- `OL_COLUMN_LINEAGE` - Column-level lineage with OpenLineage transformation types
- `OL_SCHEMA_VERSION` - Schema version tracking

The `populate_lineage.py` script populates these tables by extracting metadata directly from DBC views. It uses `DBC.ColumnsJQV` instead of `DBC.ColumnsV` because ColumnsJQV provides complete column type information for both tables AND views (ColumnsV returns NULL for view column types).

## Teradata QVCI Requirements

### What is QVCI?

QVCI (Queryable View Column Index) is a Teradata Database feature introduced in TD16.0 that enables efficient retrieval of view column information via `DBC.ColumnsQV` and `DBC.ColumnsJQV` views. This application requires QVCI to be enabled because we use `DBC.ColumnsJQV` to extract complete column metadata (including types) for both tables and views.

### Checking QVCI Status

To check if QVCI is enabled on your Teradata system:

```sql
-- Check dbscontrol setting (option 551 is DisableQVCI)
-- If false, QVCI is enabled; if true, QVCI is disabled
SELECT * FROM DBC.DBCInfoV WHERE InfoKey = 'VERSION';
```

Alternatively, try querying `DBC.ColumnsJQV`. If you receive error 9719 ("QVCI feature is disabled"), QVCI needs to be enabled.

### Enabling QVCI

QVCI must be enabled by a Teradata DBA using the `dbscontrol` utility:

```bash
# Connect to your Teradata system as a DBA
# Option 551 is DisableQVCI - setting it to false enables QVCI

dbscontrol << EOF
M internal 551=false
W
EOF
```

After running this command, **restart the Teradata Database** for the change to take effect.

**Important:** This is a system-level configuration change that requires:
- DBA privileges
- Database restart (plan for maintenance window)
- Coordination with your Teradata administrator

### If QVCI Cannot be Enabled

If QVCI cannot be enabled on your Teradata system (due to stability concerns or administrative policies), you will need to modify `populate_lineage.py` to fall back to the legacy approach:

1. Change `DBC.ColumnsJQV` back to `DBC.ColumnsV` in the `populate_openlineage_fields()` function
2. Restore the `update_view_column_types()` function (see git history)
3. Re-enable the call to `update_view_column_types()` in `main()`

This fallback uses `HELP COLUMN` commands for each view column, which is slower but works without QVCI.

### References

- [Applications encounter "QVCI feature is disabled" error - Teradata Knowledge Portal](https://support.teradata.com/knowledge?id=kb_article_view&sysparm_article=KB0026034)
- [Getting View Column Information - Teradata Vantage](https://docs.teradata.com/r/Teradata-VantageCloud-Lake/Database-Reference/Database-Administration/Working-with-Tables-and-Views-Application-DBAs/Working-with-Views/Getting-View-Column-Information)

## API Endpoints

### v2 API (OpenLineage-aligned)

- `GET /api/v2/openlineage/namespaces` - List namespaces
- `GET /api/v2/openlineage/namespaces/{namespaceId}` - Get namespace
- `GET /api/v2/openlineage/namespaces/{namespaceId}/datasets` - List datasets
- `GET /api/v2/openlineage/datasets/{datasetId}` - Get dataset with fields
- `GET /api/v2/openlineage/datasets/{datasetId}/statistics` - Get dataset statistics
- `GET /api/v2/openlineage/datasets/{datasetId}/ddl` - Get dataset DDL
- `GET /api/v2/openlineage/datasets/search?q=query` - Search datasets
- `GET /api/v2/openlineage/search?q=query` - Search (alias)
- `GET /api/v2/openlineage/lineage/{datasetId}/{fieldName}` - Get column lineage graph
- `GET /api/v2/openlineage/lineage/table/{datasetId}` - Get table lineage graph
- `GET /api/v2/openlineage/lineage/database/{databaseName}` - Get database lineage graph

## Lineage Traversal

Uses recursive CTEs in Teradata to traverse the lineage graph:
- Upstream: follows `target_column_id -> source_column_id` relationships
- Downstream: follows `source_column_id -> target_column_id` relationships
- Cycle detection via path tracking in the CTE

## Testing

| Suite | Count | Command |
|-------|-------|---------|
| Database (Python) | 73 | `cd database && python tests/run_tests.py` |
| Backend API (Python) | 20 | `cd lineage-api && python tests/run_api_tests.py` |
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

The frontend proxies `/api/*` requests to `http://localhost:8080` via Vite config.
