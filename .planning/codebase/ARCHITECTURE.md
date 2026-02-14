# Architecture

**Analysis Date:** 2026-02-13

## Pattern Overview

**Overall:** Three-tier REST architecture with graph database patterns

**Key Characteristics:**
- React frontend → Python Flask backend → Teradata database
- OpenLineage v2 specification alignment for metadata
- Column-level data lineage with recursive CTE graph traversal
- REST API with TanStack Query client-side caching
- Zustand stores for UI state management

## Layers

**Presentation Layer:**
- Purpose: React UI for visualization and interaction
- Location: `lineage-ui/src/`
- Contains: Feature pages, components, hooks for data fetching
- Depends on: REST API via axios client
- Used by: Web browsers

**API Layer (Frontend):**
- Purpose: Centralized API communication and data fetching
- Location: `lineage-ui/src/api/`
- Contains: `client.ts` (axios configuration), hooks directory (custom React hooks with TanStack Query)
- Depends on: Backend REST endpoints at `/api/v2/openlineage/*`
- Used by: React components and feature pages
- Key files:
  - `lineage-ui/src/api/client.ts` - Axios client with openLineageApi interface
  - `lineage-ui/src/api/hooks/useOpenLineage.ts` - TanStack Query hooks for all API endpoints
  - `lineage-ui/src/api/hooks/useAssets.ts` - Asset browsing queries
  - `lineage-ui/src/api/hooks/useLineage.ts` - Lineage graph queries

**State Management Layer (Frontend):**
- Purpose: Global UI state and lineage-specific state
- Location: `lineage-ui/src/stores/`
- Contains: Zustand stores
- Key files:
  - `lineage-ui/src/stores/useUIStore.ts` - UI state (sidebar toggle, modals)
  - `lineage-ui/src/stores/useLineageStore.ts` - Lineage controls (direction, maxDepth)

**Component Layer (Frontend):**
- Purpose: Reusable UI components
- Location: `lineage-ui/src/components/`
- Structure:
  - `common/` - Shared UI primitives (Button, Input, LoadingSpinner, Tooltip, ErrorBoundary)
  - `layout/` - App structure (AppShell, Header, Sidebar)
  - `domain/` - Feature-specific components:
    - `AssetBrowser/` - Hierarchical database/table/column browser
    - `LineageGraph/` - Main graph visualization (React Flow + ELKjs)
      - `TableNode/` - Table card components
      - `DetailPanel/` - Slide-out metadata panel with tabs
      - `hooks/` - Graph-specific hooks (layout, highlighting)
      - `LineageTableView/` - Alternative table view
    - `ImpactAnalysis/` - Impact summary visualization
    - `Search/` - Search bar and results

**Feature Pages Layer (Frontend):**
- Purpose: Route handlers and page composition
- Location: `lineage-ui/src/features/`
- Contains: `ExplorePage`, `LineagePage`, `DatabaseLineagePage`, `ImpactPage`, `SearchPage`
- Each page combines: Layout (AppShell) + domain components + state from stores/hooks

**Backend API Layer:**
- Purpose: REST endpoints implementing OpenLineage spec
- Location: `lineage-api/python_server.py`
- Contains: Flask route handlers for all `/api/v2/openlineage/*` endpoints
- Depends on: Database connection (teradatasql)
- Key route groups:
  - `/namespaces` - List/get OpenLineage namespaces
  - `/datasets` - List/get datasets with field definitions
  - `/datasets/search` - Full-text dataset search
  - `/datasets/{id}/statistics` - Table statistics from DBC views
  - `/datasets/{id}/ddl` - Table DDL extraction
  - `/lineage/{datasetId}/{fieldName}` - Column-level lineage with recursive CTE
  - `/lineage/table/{datasetId}` - Table-level lineage (all columns)
  - `/lineage/database/{databaseName}` - Database-level lineage (all tables)

**Database Layer:**
- Purpose: Teradata database schema and metadata storage
- Location: Database schema (OL_* tables) + DBC system views
- Contains:
  - OpenLineage tables: `OL_NAMESPACE`, `OL_DATASET`, `OL_DATASET_FIELD`, `OL_JOB`, `OL_RUN`, `OL_COLUMN_LINEAGE`, `OL_SCHEMA_VERSION`
  - System views: `DBC.ColumnsJQV` (column metadata), `DBC.TablesV` (table metadata), `DBC.TableStatsV` (statistics)

**Database Setup/Population Scripts:**
- Purpose: Schema creation and metadata population
- Location: `database/` directory
- Key scripts:
  - `database/scripts/setup/setup_lineage_schema.py` - Creates OpenLineage tables
  - `database/scripts/setup/setup_test_data.py` - Creates medallion architecture test tables
  - `database/scripts/populate/populate_lineage.py` - Populates OL_COLUMN_LINEAGE from DBC views
  - `database/scripts/populate/populate_test_metadata.py` - Populates OL_* tables for test data
  - `database/db_config.py` - Connection config with environment variable support

## Data Flow

**User Browse/Search → Asset Discovery:**
1. User navigates to `/` (ExplorePage)
2. AssetBrowser calls `useAssets()` hook → `openLineageApi.getNamespaces()`
3. Backend queries `OL_NAMESPACE` table
4. User expands database → calls `openLineageApi.getDatasets(namespaceId)`
5. Backend queries `OL_DATASET` and returns hierarchical structure
6. User clicks field → navigates to `/lineage/{datasetId}/{fieldName}`

**Column Lineage Query:**
1. LineagePage mounts with parameters (datasetId, fieldName)
2. LineageGraph calls `useLineage()` hook → `openLineageApi.getLineageGraph()`
3. Backend queries `OL_DATASET` to resolve dataset_id, then queries `OL_COLUMN_LINEAGE`
4. Recursive CTE traverses upstream/downstream paths with cycle detection
5. Backend transforms results into nodes/edges graph format
6. Frontend receives graph, passes to ELKjs for layout
7. React Flow renders visualization with TableNode components

**Impact Analysis:**
1. User navigates to `/impact/{datasetId}/{fieldName}`
2. ImpactPage calls `useLineage()` with direction=downstream
3. Backend executes downstream-only recursive CTE
4. Results show affected datasets and columns
5. Impact summary displays count of affected assets

**State Management:**
- UI state (sidebar visibility) → Zustand `useUIStore`
- Lineage controls (direction, depth) → Zustand `useLineageStore`
- API data → TanStack Query cache (5-minute staleTime by default)

## Key Abstractions

**OpenLineage Tables:**
- Purpose: Standard metadata storage aligned with OpenLineage spec
- Examples: `OL_NAMESPACE`, `OL_DATASET`, `OL_COLUMN_LINEAGE`
- Pattern: Normalized schema with namespace URIs and dataset names as identifiers

**Lineage Graph Nodes:**
- Purpose: Represent columns in the lineage graph
- Pattern: `{id: "dataset.field", type: "field", name, dataset: {name, namespace}}`

**Lineage Graph Edges:**
- Purpose: Represent transformations between columns
- Pattern: `{id: "source->target", source, target, transformationType}`

**Recursive CTE Lineage Traversal:**
- Purpose: Efficiently traverse lineage graph without loading all data
- Pattern: Teradata recursive CTE with path tracking for cycle detection
- Upstream: Follows target_column_id → source_column_id relationships
- Downstream: Follows source_column_id → target_column_id relationships

**React Flow Graph:**
- Purpose: Interactive visualization of lineage
- Pattern: Custom node types (TableNode for grouped columns) + ELKjs hierarchical layout
- Features: Pan, zoom, search highlighting, detail panel

## Entry Points

**Frontend Entry:**
- Location: `lineage-ui/src/main.tsx`
- Triggers: Page load in browser
- Responsibilities: Initialize React, render App component to DOM

**Frontend App:**
- Location: `lineage-ui/src/App.tsx`
- Triggers: Rendered by main.tsx
- Responsibilities: Setup QueryClient, BrowserRouter, define all routes

**Backend Entry:**
- Location: `lineage-api/python_server.py`
- Triggers: `python python_server.py` command
- Responsibilities: Create Flask app, configure CORS, validate credentials, setup error handling

**Database Setup Entry:**
- Location: `database/scripts/setup/setup_lineage_schema.py`
- Triggers: Manual execution for database initialization
- Responsibilities: Create OL_* tables with OpenLineage schema

## Error Handling

**Strategy:** Try-except blocks with traceback logging for diagnosis

**Patterns:**
- Backend API routes wrap database operations in try-except
- Errors return JSON with error message and HTTP status (404 for not found, 500 for server errors)
- Traceback printed to console for debugging
- Frontend components use ErrorBoundary for React error handling
- Frontend shows LoadingSpinner during data fetch, displays error states

**Database Errors:**
- Missing tables: 404 response
- Permission issues: Fallback strategies (e.g., skip DBC.TableStatsV if unavailable)
- Connection failures: Exit with sys.exit(1) after logging

## Cross-Cutting Concerns

**Logging:**
- Backend: Print statements with traceback module (no structured logging framework)
- Frontend: Console logs (debug mode available)

**Validation:**
- Backend: Environment variable validation on startup (validate_required_credentials)
- Database connectivity: Test connection on script startup
- Frontend: URL parameter validation and encoding in page components

**Authentication:**
- None currently. CORS configured for localhost development servers
- Production would require authentication layer in Flask

**Caching:**
- Frontend: TanStack Query with 5-minute staleTime, no refetchOnWindowFocus
- Backend: No caching (direct database queries)
- Database: Teradata query cache (transparent to application)

---

*Architecture analysis: 2026-02-13*
