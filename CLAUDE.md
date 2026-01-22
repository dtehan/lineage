# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a column-level data lineage application for Teradata databases. The application visualizes data flow between database columns, enabling impact analysis for change management.

**Status:** Planning phase. All specification documents are located in the `specs/` directory:

**Specification Files:**
- `specs/lineage_plan_database.md` - Teradata schema and SQL
- `specs/lineage_plan_backend.md` - Go backend implementation
- `specs/lineage_plan_frontend.md` - React frontend implementation

**Test Plans:**
- `specs/test_plan_database.md` - 73 test cases covering schema validation, data extraction, recursive CTEs, edge cases, and data integrity
- `specs/test_plan_backend.md` - 79 test cases covering unit tests, integration tests, API endpoints, error handling, caching, and performance
- `specs/test_plan_frontend.md` - 68 test cases covering components, hooks, E2E flows, graph rendering, state management, and accessibility

**Coding Standards:**
- `specs/coding_standards_go.md` - Go standards for formatting, naming, error handling, testing, and concurrency
- `specs/coding_standards_typescript.md` - TypeScript/React standards for components, hooks, state management, and TanStack Query
- `specs/coding_standards_sql.md` - Teradata SQL standards for naming, formatting, performance, partitioning, and anti-patterns

## Technology Stack

- **Backend:** Go with Chi router
- **Frontend:** React with TypeScript, Vite, TanStack Query, Zustand
- **Graph Visualization:** React Flow + ELKjs
- **Database:** Teradata (stores both source data and lineage metadata in a `lineage` database)
- **Caching:** Redis

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
│   ├── api/                     # Axios client and TanStack Query hooks
│   ├── components/
│   │   ├── common/              # Shared UI components
│   │   ├── layout/              # AppShell, Sidebar, Header
│   │   └── domain/              # AssetBrowser, LineageGraph, ImpactAnalysis, Search
│   ├── features/                # Page components
│   ├── stores/                  # Zustand stores
│   └── types/                   # TypeScript interfaces
```

### Database Scripts

```
database/
├── db_config.py              # Database connection configuration
├── setup_lineage_schema.py   # Creates lineage schema tables
├── setup_test_data.py        # Populates test data for development
├── insert_cte_test_data.py   # Inserts test data for CTE testing
├── populate_lineage.py       # Populates lineage relationships
└── run_tests.py              # Runs database test suite
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
