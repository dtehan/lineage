# Codebase Structure

**Analysis Date:** 2026-01-29

## Directory Layout

```
lineage/
├── lineage-api/              # Go backend with Chi router
│   ├── cmd/
│   │   └── server/
│   │       └── main.go                     # Server entry point
│   ├── internal/
│   │   ├── domain/                        # Business entities & interfaces
│   │   │   ├── entities.go                # Database, Table, Column, LineageGraph
│   │   │   ├── repository.go              # Repository interfaces
│   │   │   ├── entities_test.go
│   │   │   └── mocks/
│   │   │       └── repositories.go        # Mock implementations for testing
│   │   ├── application/                   # Business logic & use cases
│   │   │   ├── asset_service.go
│   │   │   ├── lineage_service.go
│   │   │   ├── search_service.go
│   │   │   ├── dto.go                     # Data transfer objects
│   │   │   ├── *_service_test.go
│   │   │   └── *_test.go
│   │   ├── adapter/
│   │   │   ├── inbound/
│   │   │   │   └── http/
│   │   │   │       ├── router.go          # Chi route definitions
│   │   │   │       ├── handlers.go        # HTTP request handlers
│   │   │   │       ├── response.go        # Response helpers (respondJSON, respondError)
│   │   │   │       └── handlers_test.go
│   │   │   └── outbound/
│   │   │       ├── teradata/
│   │   │       │   ├── connection.go      # Database connection pool
│   │   │       │   ├── asset_repo.go      # LIN_* table queries
│   │   │       │   ├── lineage_repo.go    # Recursive CTE queries
│   │   │       │   ├── search_repo.go
│   │   │       │   ├── driver_odbc.go
│   │   │       │   ├── driver_gosql.go
│   │   │       │   ├── driver_stub.go     # For testing
│   │   │       │   ├── *_test.go
│   │   │       │   └── (test-results/)
│   │   │       └── redis/
│   │   │           ├── cache.go           # Cache implementation (optional)
│   │   │           └── cache_test.go
│   │   └── infrastructure/
│   │       ├── config/
│   │       │   └── config.go              # Env var loading, Config struct
│   │       └── logging/
│   │           └── (logging utilities)
│   ├── api/
│   │   └── openapi/                       # OpenAPI spec (generated/reference)
│   ├── bin/                               # Compiled binaries
│   ├── go.mod, go.sum                     # Dependencies
│   ├── Makefile                           # build, test targets
│   └── python_server.py                   # Flask test server alternative
│
├── lineage-ui/              # React frontend with TypeScript
│   ├── src/
│   │   ├── api/
│   │   │   ├── client.ts                  # Axios instance, baseURL config
│   │   │   └── hooks/
│   │   │       ├── useAssets.ts           # useAssets, useTables, useColumns
│   │   │       ├── useLineage.ts          # useLineage, useUpstream, useDownstream
│   │   │       ├── useSearch.ts
│   │   │       └── *_test.tsx
│   │   │
│   │   ├── components/
│   │   │   ├── common/
│   │   │   │   ├── Button.tsx
│   │   │   │   ├── Input.tsx
│   │   │   │   ├── LoadingSpinner.tsx
│   │   │   │   ├── ErrorBoundary.tsx
│   │   │   │   ├── Tooltip.tsx
│   │   │   │   ├── BackButton.tsx
│   │   │   │   └── *.test.tsx
│   │   │   │
│   │   │   ├── layout/
│   │   │   │   ├── AppShell.tsx           # Main layout wrapper
│   │   │   │   ├── Header.tsx             # Top navigation bar
│   │   │   │   ├── Sidebar.tsx            # Left sidebar with nav links
│   │   │   │   └── *.test.tsx
│   │   │   │
│   │   │   └── domain/
│   │   │       ├── AssetBrowser/
│   │   │       │   ├── AssetBrowser.tsx   # Hierarchical database/table/column browser
│   │   │       │   └── AssetBrowser.test.tsx
│   │   │       │
│   │   │       ├── LineageGraph/
│   │   │       │   ├── LineageGraph.tsx   # Main graph component (React Flow wrapper)
│   │   │       │   ├── DatabaseLineageGraph.tsx
│   │   │       │   ├── AllDatabasesLineageGraph.tsx
│   │   │       │   ├── TableNode/
│   │   │       │   │   ├── TableNode.tsx  # Custom React Flow node
│   │   │       │   │   ├── TableNodeHeader.tsx
│   │   │       │   │   ├── ColumnRow.tsx  # Individual column display
│   │   │       │   │   └── *.test.tsx
│   │   │       │   │
│   │   │       │   ├── LineageTableView/
│   │   │       │   │   └── LineageTableView.tsx  # Alternative table format
│   │   │       │   │
│   │   │       │   ├── ColumnNode.tsx
│   │   │       │   ├── LineageEdge.tsx    # Custom edge renderer
│   │   │       │   ├── Toolbar.tsx        # Direction, depth, export controls
│   │   │       │   ├── DetailPanel.tsx    # Slide-out metadata panel
│   │   │       │   ├── ClusterBackground.tsx  # Database grouping visualization
│   │   │       │   ├── Legend.tsx
│   │   │       │   ├── LineageGraphSearch.tsx
│   │   │       │   ├── hooks/
│   │   │       │   │   ├── useLineageHighlight.ts  # Path highlighting logic
│   │   │       │   │   ├── useDatabaseClusters.ts
│   │   │       │   │   ├── useKeyboardShortcuts.ts
│   │   │       │   │   └── useLineageExport.ts     # JSON export
│   │   │       │   └── *.test.tsx
│   │   │       │
│   │   │       ├── ImpactAnalysis/
│   │   │       │   ├── ImpactAnalysis.tsx
│   │   │       │   ├── ImpactSummary.tsx
│   │   │       │   └── *.test.tsx
│   │   │       │
│   │   │       └── Search/
│   │   │           ├── SearchBar.tsx
│   │   │           ├── SearchResults.tsx
│   │   │           └── *.test.tsx
│   │   │
│   │   ├── features/
│   │   │   ├── ExplorePage.tsx            # Home page with AssetBrowser + LineageGraph
│   │   │   ├── LineagePage.tsx            # Lineage for column/table
│   │   │   ├── DatabaseLineagePage.tsx    # Database-level lineage
│   │   │   ├── AllDatabasesLineagePage.tsx
│   │   │   ├── ImpactPage.tsx
│   │   │   └── SearchPage.tsx
│   │   │
│   │   ├── stores/
│   │   │   ├── useLineageStore.ts         # Zustand store for lineage graph state
│   │   │   ├── useUIStore.ts              # Zustand store for UI state
│   │   │   └── *.test.ts
│   │   │
│   │   ├── utils/
│   │   │   ├── graph/
│   │   │   │   ├── layoutEngine.ts        # ELK graph layout algorithm
│   │   │   │   └── layoutEngine.test.ts
│   │   │   └── (other utilities)
│   │   │
│   │   ├── types/
│   │   │   └── index.ts                   # TypeScript interfaces (LineageNode, LineageEdge, etc.)
│   │   │
│   │   ├── test/
│   │   │   ├── test-utils.tsx
│   │   │   ├── fixtures/                  # Mock data for tests
│   │   │   └── accessibility.test.tsx
│   │   │
│   │   ├── App.tsx                        # Routes and QueryClientProvider wrapper
│   │   └── main.tsx                       # Vite entry point
│   │
│   ├── e2e/                               # Playwright E2E tests
│   ├── vite.config.ts
│   ├── vitest.config.ts
│   ├── tsconfig.json
│   ├── package.json
│   ├── dist/                              # Production build output
│   └── node_modules/
│
├── database/                # Python scripts for Teradata setup & testing
│   ├── db_config.py                       # Connection config, environment variable handling
│   ├── setup_lineage_schema.py            # Creates LIN_* tables and indexes
│   ├── setup_test_data.py                 # Medallion test data (SRC→STG→DIM→FACT)
│   ├── populate_lineage.py                # Manual metadata extraction and lineage population
│   ├── extract_dbql_lineage.py            # DBQL-based automated lineage extraction
│   ├── sql_parser.py                      # SQLGlot-based column lineage parser
│   ├── insert_cte_test_data.py            # Edge case test data (cycles, diamonds)
│   ├── run_tests.py                       # Test runner: 73 database tests
│   └── requirements.txt
│
├── docs/
│   └── user_guide.md                      # Comprehensive usage documentation
│
├── specs/                   # Architecture & design specifications
│   ├── lineage_plan_database.md
│   ├── lineage_plan_backend.md
│   ├── lineage_plan_frontend.md
│   ├── lineage_visualization_spec.md
│   ├── coding_standards_go.md
│   ├── coding_standards_typescript.md
│   ├── coding_standards_sql.md
│   ├── test_plan_database.md
│   ├── test_plan_backend.md
│   ├── test_plan_frontend.md
│   └── research/
│
├── .planning/               # GSD planning documents
│   └── codebase/
│       ├── ARCHITECTURE.md
│       ├── STRUCTURE.md
│       ├── CONVENTIONS.md
│       └── TESTING.md
│
├── .env.example             # Environment variable template
├── CLAUDE.md                # Project instructions for Claude Code
├── README.md
└── (git, build config files)
```

## Directory Purposes

**lineage-api/:** Go backend serving REST API for lineage queries. Implements hexagonal architecture with domain/application/adapter layers.

**lineage-ui/:** React 18 frontend with TypeScript. Uses TanStack Query for server state, Zustand for local state, React Flow for graph visualization, ELKjs for automatic layout.

**database/:** Python scripts for Teradata schema setup, test data population, lineage extraction, and comprehensive test suite. Uses teradatasql driver.

**specs/:** Architecture and coding standards documentation. Reference for implementation details across all layers.

**docs/:** User-facing documentation (user_guide.md has comprehensive feature walkthroughs).

## Key File Locations

**Entry Points:**

- **Backend:** `lineage-api/cmd/server/main.go` - Wires dependencies, starts HTTP server
- **Frontend:** `lineage-ui/src/main.tsx` - Mounts React app
- **Frontend router:** `lineage-ui/src/App.tsx` - BrowserRouter, routes to features
- **Database setup:** `database/setup_lineage_schema.py` - Creates tables in Teradata

**Configuration:**

- **Backend:** `lineage-api/internal/infrastructure/config/config.go` - Loads TERADATA_* and REDIS_* env vars
- **Frontend:** `lineage-ui/src/api/client.ts` - Axios baseURL from `VITE_API_URL` or `http://localhost:8080/api/v1`
- **Database:** `database/db_config.py` - Loads TD_* and TERADATA_* env vars
- **Template:** `.env.example` - Copy to `.env` and fill in Teradata credentials

**Core Logic:**

- **Asset service:** `lineage-api/internal/application/asset_service.go` - Database, table, column listing
- **Lineage service:** `lineage-api/internal/application/lineage_service.go` - Graph retrieval, impact analysis
- **Lineage repo:** `lineage-api/internal/adapter/outbound/teradata/lineage_repo.go` - Recursive CTE queries
- **Frontend graph:** `lineage-ui/src/components/domain/LineageGraph/LineageGraph.tsx` - React Flow visualization
- **Layout engine:** `lineage-ui/src/utils/graph/layoutEngine.ts` - ELK hierarchical layout
- **State:** `lineage-ui/src/stores/useLineageStore.ts` - Zustand store for graph/UI state

**Testing:**

- **Backend unit tests:** `lineage-api/internal/*/entities_test.go`, `*_service_test.go`, `*_repo_test.go`
- **Frontend unit tests:** `lineage-ui/src/**/*.test.tsx` (Vitest + React Testing Library)
- **Frontend E2E tests:** `lineage-ui/e2e/*.spec.ts` (Playwright)
- **Database tests:** `database/run_tests.py` (73 test cases)

## Naming Conventions

**Files:**

- `*_service.go` - Service layer (business logic)
- `*_repo.go` - Repository implementation (data access)
- `*_test.go` - Unit tests
- `*.test.tsx` - React component tests
- `use*.ts` - React hooks (custom)
- `*.tsx` - React components
- `*.ts` - TypeScript utilities/types

**Directories:**

- `internal/` - Go packages not exported (internal to app)
- `adapter/inbound/` - External input adapters (HTTP)
- `adapter/outbound/` - External output adapters (Teradata, Redis)
- `domain/` - Pure business logic and entities
- `application/` - Use cases and orchestration
- `components/common/` - Generic, reusable UI components
- `components/domain/` - Domain-specific, complex components
- `components/layout/` - Page structure components
- `features/` - Page-level components (routes)
- `stores/` - Zustand stores (global state)
- `api/` - API client and data fetching hooks
- `utils/` - Helper functions and utilities
- `test/` - Test utilities and fixtures

**Functions:**

- Go: `PascalCase` for exported, `camelCase` for unexported
- TypeScript: `camelCase` for all functions, `PascalCase` for React components
- Hooks: `use` prefix (e.g., `useLineage`, `useLineageStore`)

**Types:**

- Go: `PascalCase` (e.g., `Database`, `LineageRepository`, `AssetService`)
- TypeScript: `PascalCase` (e.g., `LineageNode`, `LineageEdge`, `SearchResult`)
- Zustand store: `use` prefix (e.g., `useLineageStore`, `useUIStore`)

## Where to Add New Code

**New API Endpoint:**

1. Define domain entity/interface in `lineage-api/internal/domain/entities.go` or `repository.go`
2. Add service method in `lineage-api/internal/application/*_service.go`
3. Implement repository method in `lineage-api/internal/adapter/outbound/teradata/*_repo.go`
4. Add HTTP handler in `lineage-api/internal/adapter/inbound/http/handlers.go`
5. Register route in `lineage-api/internal/adapter/inbound/http/router.go`
6. Add response DTO in `lineage-api/internal/application/dto.go`

**New Page/Feature:**

1. Create page component in `lineage-ui/src/features/NewPage.tsx`
2. Add route in `lineage-ui/src/App.tsx`
3. Import and use domain components from `lineage-ui/src/components/domain/`
4. Store global state in `useLineageStore` if needed
5. Fetch data via hooks from `lineage-ui/src/api/hooks/`

**New Visualization Component:**

1. Create component in `lineage-ui/src/components/domain/LineageGraph/` or `lineage-ui/src/components/common/`
2. For React Flow custom nodes: implement in `components/domain/LineageGraph/TableNode/` with `data` and `selected` props
3. For graph logic: add hook in `lineage-ui/src/components/domain/LineageGraph/hooks/`
4. Integrate into LineageGraph component

**Database Schema Modification:**

1. Create migration script in `database/migrations/` or modify `database/setup_lineage_schema.py`
2. Update Python scripts that read/write to schema
3. Update backend repository queries in `lineage-api/internal/adapter/outbound/teradata/`
4. Add test data in `database/setup_test_data.py`
5. Add test cases in `database/run_tests.py`

**Shared Utilities:**

- Go helpers: `lineage-api/internal/infrastructure/` or package-level `helpers.go`
- TypeScript helpers: `lineage-ui/src/utils/` subdirectories
- React hooks: `lineage-ui/src/api/hooks/` for data fetching, `lineage-ui/src/components/domain/LineageGraph/hooks/` for graph-specific logic

## Special Directories

**lineage-api/internal/domain/mocks/:**
- Purpose: Mock implementations for unit testing
- Generated/Committed: Manually maintained (not auto-generated)
- Use: Inject mocks into service layer for testing without database

**lineage-ui/src/test/fixtures/:**
- Purpose: Mock API responses and test data
- Generated/Committed: Committed (static test fixtures)
- Use: Populate mocks in Vitest tests

**lineage-api/test-results/, lineage-ui/test-results/:**
- Purpose: Generated test output and reports
- Generated/Committed: Generated (gitignore'd)
- Use: CI/CD reporting

**lineage-ui/dist/:**
- Purpose: Production build output
- Generated/Committed: Generated (gitignore'd)
- Use: `npm run build` output for deployment

**database/ (no migrations dir yet):**
- Purpose: All migrations inline in setup_lineage_schema.py
- Pattern: Single source of truth for schema
- Future improvement: Separate migration folder with versioning

---

*Structure analysis: 2026-01-29*
