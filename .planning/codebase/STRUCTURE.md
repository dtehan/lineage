# Codebase Structure

**Analysis Date:** 2026-02-13

## Directory Layout

```
lineage/
├── lineage-api/                          # Python Flask backend
│   ├── python_server.py                  # Main server entry point (all routes)
│   ├── tests/                            # Backend API tests
│   ├── README.md                         # Backend documentation
│   └── package.json                      # Minimal Node config (legacy)
│
├── lineage-ui/                           # React + TypeScript frontend
│   ├── src/
│   │   ├── main.tsx                      # React entry point
│   │   ├── App.tsx                       # Router and layout setup
│   │   ├── index.css                     # Global styles
│   │   ├── api/
│   │   │   ├── client.ts                 # Axios configuration
│   │   │   └── hooks/                    # TanStack Query hooks
│   │   ├── components/
│   │   │   ├── common/                   # UI primitives
│   │   │   ├── layout/                   # App shell components
│   │   │   └── domain/                   # Feature components
│   │   ├── features/                     # Page components
│   │   ├── stores/                       # Zustand state stores
│   │   ├── types/                        # TypeScript interfaces
│   │   ├── utils/                        # Helper functions
│   │   ├── hooks/                        # Custom React hooks
│   │   ├── test/                         # Test fixtures and utilities
│   │   └── __tests__/                    # Unit and integration tests
│   ├── e2e/                              # Playwright E2E tests
│   ├── vite.config.ts                    # Vite build config
│   ├── vitest.config.ts                  # Vitest test config
│   ├── playwright.config.ts              # Playwright E2E config
│   └── tsconfig.json                     # TypeScript config
│
├── database/                             # Database schema and scripts
│   ├── db_config.py                      # Database connection configuration
│   ├── scripts/
│   │   ├── setup/                        # Schema creation scripts
│   │   │   ├── setup_lineage_schema.py   # Create OL_* tables
│   │   │   └── setup_test_data.py        # Create medallion architecture test tables
│   │   ├── populate/                     # Data population scripts
│   │   │   ├── populate_lineage.py       # Populate OL_COLUMN_LINEAGE from DBC
│   │   │   ├── populate_test_metadata.py # Populate OL_* metadata for test data
│   │   │   ├── dbql_extractor.py         # DBQL extraction utilities
│   │   │   └── sql_parser.py             # SQL parsing for lineage
│   │   └── utils/                        # Utility scripts
│   │       ├── insert_cte_test_data.py   # Insert lineage test patterns
│   │       └── benchmark_cte.py          # Performance benchmarks
│   ├── tests/                            # Database schema tests
│   │   ├── run_tests.py                  # Main test runner (73 tests)
│   │   ├── test_correctness.py           # CTE correctness validation
│   │   ├── test_credential_validation.py # Env var validation
│   │   └── test_dbql_error_handling.py   # Error handling tests
│   ├── fixtures/                         # Test data and fixtures
│   ├── archive/                          # Archived/experimental code
│   └── README.md                         # Database documentation
│
├── docs/                                 # User documentation
│   └── screenshots/                      # UI screenshots
│
├── .env.example                          # Environment variable template
├── .env                                  # (ignored) Local environment config
├── CLAUDE.md                             # AI assistant instructions
├── README.md                             # Project overview
└── requirements.txt                      # Python dependencies
```

## Directory Purposes

**lineage-api/**
- Purpose: Python Flask REST API backend
- Contains: Single monolithic server file with all routes
- Key files: `python_server.py` (65KB+ with all endpoints inline)

**lineage-ui/**
- Purpose: React + TypeScript frontend application
- Contains: Component hierarchy, state management, API integration
- Key files: `src/App.tsx`, `src/main.tsx`, component directory structure

**database/**
- Purpose: Database schema management and metadata population
- Contains: Setup scripts (create tables), populate scripts (load metadata), test suite
- Key files: `db_config.py` (connection config), populate_lineage.py (main population), setup_lineage_schema.py (schema creation)

**docs/**
- Purpose: User and deployment documentation
- Contains: Screenshots and usage guides

## Key File Locations

**Entry Points:**

- `lineage-ui/src/main.tsx` - Frontend initialization (React DOM mount)
- `lineage-ui/src/App.tsx` - Frontend routing and shell layout
- `lineage-api/python_server.py` - Backend server (Flask app creation and all routes)
- `database/scripts/setup/setup_lineage_schema.py` - Database schema creation

**Configuration:**

- `lineage-ui/vite.config.ts` - Frontend build and dev server (proxy `/api` to :8080)
- `lineage-ui/tsconfig.json` - TypeScript compiler settings
- `lineage-ui/vitest.config.ts` - Unit test configuration
- `lineage-ui/playwright.config.ts` - E2E test configuration
- `database/db_config.py` - Database connection from environment variables
- `.env.example` - Template for environment configuration
- `requirements.txt` - Python package dependencies

**Core Logic:**

- `lineage-api/python_server.py` - ALL backend logic (routes, queries, transformations)
- `lineage-ui/src/api/client.ts` - Axios client and openLineageApi interface
- `lineage-ui/src/api/hooks/useOpenLineage.ts` - TanStack Query hooks for API
- `lineage-ui/src/stores/useLineageStore.ts` - Lineage-specific state (direction, depth)
- `lineage-ui/src/stores/useUIStore.ts` - UI state (sidebar, modals)

**Testing:**

- `database/tests/run_tests.py` - Main database test runner
- `lineage-ui/src/__tests__/` - Frontend unit tests
- `lineage-ui/e2e/` - Playwright E2E tests
- `lineage-api/tests/` - Backend API tests

## Naming Conventions

**Files:**

- **Frontend components:** PascalCase for .tsx files (e.g., `LineageGraph.tsx`, `AssetBrowser.tsx`)
- **Frontend utilities/hooks:** camelCase for .ts files (e.g., `useLineageStore.ts`, `useOpenLineage.ts`)
- **Backend:** All snake_case Python files (e.g., `python_server.py`, `setup_lineage_schema.py`)
- **Test files:** Suffix with `.test.tsx`, `.test.ts`, or `.spec.tsx` (co-located with source)
- **Config files:** Suffix with `.config.ts` or `.config.js` (vite, vitest, playwright)

**Directories:**

- **Frontend:** `camelCase` for feature directories in `src/components/domain/` (AssetBrowser, LineageGraph, ImpactAnalysis)
- **Database scripts:** `snake_case` (setup/, populate/, utils/)
- **Layers/sections:** `lowercase` with forward slash (src/api, src/components, src/stores)

**Database Tables:**

- **OpenLineage schema:** `OL_` prefix (OL_NAMESPACE, OL_DATASET, OL_COLUMN_LINEAGE)
- **System views:** `DBC.` prefix (DBC.ColumnsJQV, DBC.TablesV, DBC.TableStatsV)

## Where to Add New Code

**New Feature (complete page):**
- Page component: `lineage-ui/src/features/{FeatureName}Page.tsx`
- Domain component: `lineage-ui/src/components/domain/{DomainName}/{Component}.tsx`
- API hook: `lineage-ui/src/api/hooks/use{Feature}.ts`
- Store if needed: `lineage-ui/src/stores/use{Feature}Store.ts`
- Tests: Co-locate with component as `.test.tsx`

**New API Endpoint:**
- Add route to: `lineage-api/python_server.py` (following existing pattern)
- Use `@app.route()` decorator and existing helper functions
- Add type definitions to: `lineage-ui/src/types/openlineage.ts`
- Add client method to: `lineage-ui/src/api/client.ts` openLineageApi object
- Add hook in: `lineage-ui/src/api/hooks/useOpenLineage.ts` or dedicated hook file

**New Component (reusable):**
- If primitive (button, input): `lineage-ui/src/components/common/{ComponentName}.tsx`
- If domain-specific: `lineage-ui/src/components/domain/{DomainName}/{ComponentName}.tsx`
- Create `.test.tsx` file alongside with unit tests
- Export from barrel file in parent directory if needed

**Database Migration:**
- Schema changes: Add migration to `database/scripts/setup/` as new file
- Update schema creation: Edit `database/scripts/setup/setup_lineage_schema.py`
- Test data: Update `database/scripts/setup/setup_test_data.py`
- Population logic: Update `database/scripts/populate/populate_lineage.py`
- Add tests to: `database/tests/` with `.py` files

**Utility Functions:**
- Frontend utils: `lineage-ui/src/utils/{domain}/` (e.g., `lineage-ui/src/utils/graph/`)
- Backend utils: `database/scripts/utils/` (e.g., `database/scripts/utils/insert_cte_test_data.py`)

## Special Directories

**lineage-ui/src/__tests__/**
- Purpose: Unit and integration tests for frontend
- Generated: No
- Committed: Yes
- Contents:
  - `integration/` - API integration tests
  - `performance/` - Performance benchmark tests
  - `performance/fixtures/` - Large mock data for perf testing

**lineage-ui/node_modules/**
- Purpose: npm dependencies
- Generated: Yes (from npm install)
- Committed: No (in .gitignore)

**lineage-ui/playwright-report/**
- Purpose: Playwright E2E test reports
- Generated: Yes (from npx playwright test)
- Committed: No (in .gitignore)

**lineage-ui/test-results/**
- Purpose: Vitest unit test reports
- Generated: Yes (from npm test)
- Committed: No (in .gitignore)

**database/.pytest_cache/**
- Purpose: Python pytest cache
- Generated: Yes
- Committed: No (in .gitignore)

**database/archive/**
- Purpose: Experimental/deprecated code
- Generated: No
- Committed: Yes
- Contents: Legacy implementations like extract_dbql_lineage.py, sql_parser.py

**database/fixtures/**
- Purpose: Test data and fixture files
- Generated: No (manually curated)
- Committed: Yes
- Contents: Test lineage patterns (cycles, diamonds, fans)

**lineage-ui/src/test/**
- Purpose: Test utilities and mock data
- Generated: No
- Committed: Yes
- Contents:
  - `fixtures/` - Mock API responses and test data generators

## Import Path Aliases

No path aliases configured in `tsconfig.json` - all imports are relative paths.

## Vite Configuration Details

**Frontend dev server:** Runs on port 3000 by default, proxies `/api/*` to `http://localhost:8080`

**Backend server:** Runs on port 8080 (set via `API_PORT` env var)

**CORS:** Backend configured to accept requests from `http://localhost:3000`, `3001`, `3004`, `5173` (Vite default)

---

*Structure analysis: 2026-02-13*
