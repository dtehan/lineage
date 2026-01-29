# Architecture

**Analysis Date:** 2026-01-29

## Pattern Overview

**Overall:** Hexagonal/Clean Architecture with clear separation of concerns across three layers: domain (business logic), application (use cases), and adapter (HTTP/database implementation).

**Key Characteristics:**
- Dependency inversion: Domain defines repository interfaces, adapters implement them
- Repository pattern for data access abstraction
- Service layer for business logic without HTTP concerns
- Handler layer decouples routing from service logic
- Frontend uses store-driven state management with composition of reusable hooks

## Layers

**Domain Layer:**
- Purpose: Core business entities and repository contracts
- Location: `lineage-api/internal/domain/`
- Contains: Entity definitions (`entities.go`), repository interfaces (`repository.go`)
- Depends on: Nothing (pure Go stdlib)
- Used by: Application layer and adapter implementations

**Application Layer:**
- Purpose: Business logic and orchestration of domain operations
- Location: `lineage-api/internal/application/`
- Contains: Service classes (`asset_service.go`, `lineage_service.go`, `search_service.go`), DTOs (`dto.go`)
- Depends on: Domain layer (repositories and entities)
- Used by: HTTP handlers

**HTTP Adapter (Inbound):**
- Purpose: REST API exposure and request handling
- Location: `lineage-api/internal/adapter/inbound/http/`
- Contains: Router (`router.go`), handlers (`handlers.go`), response formatting (`response.go`)
- Depends on: Application layer services
- Used by: HTTP server in `main.go`

**Teradata Adapter (Outbound):**
- Purpose: Database access implementation
- Location: `lineage-api/internal/adapter/outbound/teradata/`
- Contains: Repository implementations (`asset_repo.go`, `lineage_repo.go`, `search_repo.go`), connection management (`connection.go`), driver implementations
- Depends on: Domain layer (repository interfaces), database drivers
- Used by: Application services

**Redis Adapter (Outbound):**
- Purpose: Optional caching layer
- Location: `lineage-api/internal/adapter/outbound/redis/`
- Contains: Cache implementation (`cache.go`)
- Depends on: Domain layer (CacheRepository interface)
- Used by: Services (optional, graceful fallback)

**Infrastructure Layer:**
- Purpose: Cross-cutting concerns
- Location: `lineage-api/internal/infrastructure/`
- Contains: Configuration loading (`config/config.go`), logging utilities (`logging/`)
- Depends on: Nothing (utilities only)
- Used by: `main.go` and all layers

## Data Flow

**Asset Discovery:**

1. User browses AssetBrowser in frontend (`lineage-ui/src/components/domain/AssetBrowser/`)
2. Frontend calls `GET /api/v1/assets/databases` via `useAssets` hook
3. HTTP handler routes to `Handler.ListDatabases()`
4. Handler delegates to `AssetService.ListDatabases()`
5. Service delegates to `AssetRepository.ListDatabases()`
6. Repository queries `demo_user.LIN_DATABASE` Teradata table
7. Results returned as JSON to frontend, stored in `useLineageStore`

**Lineage Traversal:**

1. User selects column in LineageGraph, passes `assetId` to `useLineage()` hook
2. Hook calls `GET /api/v1/lineage/{assetId}?direction=upstream|downstream|both&maxDepth=N`
3. HTTP handler extracts query parameters, calls `LineageService.GetLineageGraph()`
4. Service delegates to `LineageRepository.GetLineageGraph()`
5. Repository executes recursive CTE in Teradata, retrieves column lineage
6. Repository calls `buildGraph()` to transform flat lineage into graph nodes/edges
7. Frontend receives `LineageGraphResponse` with nodes and edges
8. LineageGraph component uses React Flow to render visualization with ELK layout

**Impact Analysis:**

1. User clicks impact button on column node
2. Frontend navigates to `/impact/{assetId}`, calls `useLineage()` with direction=downstream
3. LineageService calls `GetDownstreamLineage()`
4. Results aggregated into `ImpactAnalysisResponse` with summaries by database/depth
5. Frontend renders ImpactAnalysis component showing affected assets

**Search:**

1. User types in SearchBar
2. Frontend calls `GET /api/v1/search?q=query` via `useSearch()` hook
3. HTTP handler calls `SearchService.Search()`
4. Service queries `demo_user.LIN_*` tables with LIKE patterns
5. Results wrapped in `SearchResult[]`, returned with scores and asset types

## State Management

**Backend:** Stateless service layer. Repositories encapsulate connection pooling and transaction handling. No session state.

**Frontend:** Zustand store (`useLineageStore`, `useUIStore`) holds:
- Lineage graph state (nodes, edges, selected asset)
- View options (direction, maxDepth, viewMode)
- UI state (panel open/closed, fullscreen, sidebar toggle)
- Search state (query, results)

TanStack Query manages data fetching and caching via hooks:
- `useAssets`: Database, table, column lists
- `useLineage`: Lineage graph data
- `useSearch`: Search results

## Key Abstractions

**Repository Interface (Domain):**
- Purpose: Abstract database access
- Examples: `AssetRepository`, `LineageRepository`, `SearchRepository` in `lineage-api/internal/domain/repository.go`
- Pattern: Interface-based, implemented by Teradata adapter

**Service Layer:**
- Purpose: Orchestrate business logic without HTTP concerns
- Examples: `AssetService`, `LineageService`, `SearchService` in `lineage-api/internal/application/`
- Pattern: Constructor injection of repository dependencies, public methods for use cases

**DTOs (Data Transfer Objects):**
- Purpose: Shape API responses for frontend consumption
- Examples: `DatabaseListResponse`, `LineageGraphResponse`, `ImpactAnalysisResponse` in `lineage-api/internal/application/dto.go`
- Pattern: Mirror API contracts, separate from domain entities

**Custom Node Type (Frontend):**
- Purpose: TableNode component for React Flow rendering
- Example: `TableNode` in `lineage-ui/src/components/domain/LineageGraph/TableNode/`
- Pattern: React Flow custom node with column rows, type detection for styling

**Layout Engine:**
- Purpose: Hierarchical graph layout using ELK algorithm
- Example: `layoutGraph()` in `lineage-ui/src/utils/graph/layoutEngine.ts`
- Pattern: Groups columns by table, calculates node dimensions, delegates to ELK for positioning

## Entry Points

**Backend Server:**
- Location: `lineage-api/cmd/server/main.go`
- Triggers: `go run cmd/server/main.go` or binary execution
- Responsibilities: Load config, establish Teradata connection, wire services/repositories, start HTTP server with graceful shutdown

**Frontend App:**
- Location: `lineage-ui/src/main.tsx`
- Triggers: Vite dev server or production build
- Responsibilities: Mount React app, wrap with QueryClientProvider, initialize router

**Database Setup:**
- Location: `database/setup_lineage_schema.py`
- Triggers: `python setup_lineage_schema.py`
- Responsibilities: Create LIN_* tables in demo_user database, set up indexes

**Lineage Population:**
- Location: `database/populate_lineage.py`
- Triggers: `python populate_lineage.py` or `python populate_lineage.py --dbql`
- Responsibilities: Extract metadata from DBC views or DBQL, populate lineage tables

## Error Handling

**Strategy:** Explicit error propagation with context at each layer.

**Patterns:**

- **Backend:** Repository methods return `(T, error)` tuple. Services wrap errors with context. Handlers convert errors to HTTP status codes:
  ```go
  // Handler error response
  respondError(w, http.StatusInternalServerError, err.Error())
  ```

- **Frontend:** useQuery hooks expose `error` field. Components check for errors and render ErrorBoundary or error message:
  ```tsx
  if (error) return <ErrorMessage error={error} />;
  ```

- **Database:** Python scripts catch teradatasql exceptions, log with context, exit with error code

- **Cycle Detection:** Recursive CTEs in Teradata check `POSITION(source_column_id IN path)` to detect cycles during upstream/downstream traversal

## Cross-Cutting Concerns

**Logging:**
- **Backend:** Chi middleware logs all HTTP requests/responses. Services use `log` package for startup/shutdown messages.
- **Frontend:** Console logging via React DevTools. Errors logged by useQuery error handler.
- **Database:** Python scripts print status to stdout, exceptions logged with traceback.

**Validation:**
- **Backend:** Parameter validation in handlers (e.g., URL param extraction via `chi.URLParam()`, query param parsing via `r.URL.Query()`)
- **Frontend:** URL validation in routing, column ID format validation in hooks
- **Database:** SQL constraints enforce referential integrity, unique indexes prevent duplicates

**Authentication:**
- **Backend:** No authentication implemented (assumes trusted internal network)
- **Frontend:** No authentication token handling (assumes public/internal use)
- **Database:** Teradata connection credentials passed via environment variables from host

**Caching:**
- **Backend:** Redis adapter optional. Service layer makes cache checks transparent to handlers.
- **Frontend:** TanStack Query handles response caching with staleTime, refetchOnWindowFocus settings
- **Database:** No query result caching (relies on Teradata buffer pool)

**Rate Limiting:**
- Not implemented (assumes low-frequency API usage)

**CORS:**
- **Backend:** Chi CORS middleware allows `localhost:3000` and `localhost:5173` origins for local development

---

*Architecture analysis: 2026-01-29*
