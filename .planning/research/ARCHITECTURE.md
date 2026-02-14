# Architecture Research: Backend Refactoring and Impact Analysis Integration

**Domain:** Data Lineage Application - Backend Refactoring
**Researched:** 2026-02-13
**Confidence:** HIGH

## Executive Summary

This architecture document addresses three interconnected challenges for the Teradata lineage application:

1. **Backend Refactoring:** Moving from a 1454-line monolithic Flask file to a service/repository layered architecture
2. **Impact Analysis Integration:** Adding new API endpoints and frontend features for downstream dependency analysis
3. **Exception Handling Architecture:** Replacing bare `except Exception` blocks with structured, observable error handling

The recommendations are specific to this application's context: Flask + Teradata with OpenLineage tables, existing React frontend with TanStack Query, and 73 database tests that must continue passing.

## Current Architecture Issues

### Backend (python_server.py - 1454 lines)

**Problem:** Mixed concerns throughout the file
- Lines 91-99: Database connection logic
- Lines 112-683: 11 route handlers mixing routing, validation, database queries, transformations, and response formatting
- Lines 140-143, 174-177, etc.: 11 instances of bare `except Exception as e` with `traceback.print_exc()`
- No separation between data access and business logic
- Recursive CTE queries embedded directly in route handlers
- SQL generation mixed with response transformation

**Impact:**
- Testing requires running full HTTP server (line 8 of run_api_tests.py shows integration test approach)
- Changes to database schema require updates in multiple route handlers
- Error handling provides no structured visibility into failure modes
- Duplicate SQL patterns across endpoints (CTE cycle detection repeated 3x)

### Frontend Integration Points

**Existing Patterns:**
- `useLineage` hook (lineage-ui/src/api/hooks/useLineage.ts) expects `{ assetId, graph: { nodes, edges } }`
- `useImpactAnalysis` hook (lines 43-54) already defined but endpoint not implemented
- ImpactPage.tsx (placeholder), ImpactAnalysis.tsx, ImpactSummary.tsx (UI components exist)
- TypeScript types defined: `ImpactAnalysisResponse`, `ImpactedAsset`, `ImpactSummary` (types/index.ts lines 53-73)

**Gap:** Backend has no `/api/v1/lineage/{assetId}/impact` endpoint (test_impact_analysis at line 128 of run_api_tests.py expects it)

### SQL Parser Duplication

**Issue:** Identical 685-line `sql_parser.py` files in two locations:
- `database/archive/sql_parser.py`
- `database/scripts/populate/sql_parser.py`

Both contain `TeradataSQLParser` class using SQLGlot for column-level lineage extraction. No differences detected (both have same class structure, methods, confidence scores).

## Recommended Architecture

### Three-Layer Backend Structure

```
┌─────────────────────────────────────────────────────────────┐
│                    ROUTES LAYER (Flask)                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Namespace    │  │  Dataset     │  │  Lineage     │      │
│  │  Routes      │  │  Routes      │  │  Routes      │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
│         │                  │                  │              │
│     Validation, HTTP concerns, error responses               │
├─────────┴──────────────────┴──────────────────┴──────────────┤
│                    SERVICE LAYER                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Namespace    │  │  Dataset     │  │  Lineage     │      │
│  │  Service     │  │  Service     │  │  Service     │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
│         │                  │                  │              │
│     Business logic, orchestration, transformation            │
├─────────┴──────────────────┴──────────────────┴──────────────┤
│                  REPOSITORY LAYER                            │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              Teradata Repository                      │   │
│  │  • OL_* table queries                                 │   │
│  │  • DBC.* view queries (statistics, DDL)              │   │
│  │  • Recursive CTE lineage traversal                   │   │
│  │  • Connection pooling                                │   │
│  └──────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────┤
│                  DATABASE (Teradata)                         │
│  OL_NAMESPACE, OL_DATASET, OL_DATASET_FIELD,                │
│  OL_COLUMN_LINEAGE, DBC.TablesV, DBC.ColumnsJQV            │
└─────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Layer | Component | Responsibility | Does NOT Handle |
|-------|-----------|----------------|-----------------|
| **Routes** | `api/routes/openlineage.py` | HTTP validation, request parsing, response formatting, error-to-HTTP mapping | Database access, business logic, graph traversal |
| **Service** | `services/lineage_service.py` | Graph traversal orchestration, depth/direction logic, node/edge aggregation | SQL generation, HTTP concerns |
| **Service** | `services/dataset_service.py` | Dataset/field metadata retrieval, statistics enrichment | Lineage traversal |
| **Service** | `services/impact_service.py` | Impact analysis calculation (depth grouping, database grouping, criticality scoring) | HTTP responses |
| **Repository** | `repositories/teradata_repo.py` | SQL execution, CTE generation, connection management, result set mapping | Business logic, API concerns |

## Recommended Project Structure

```
lineage-api/
├── python_server.py                    # Flask app initialization (50 lines)
├── config.py                           # DB config, env validation (from lines 22-98)
├── api/
│   ├── __init__.py
│   ├── routes/
│   │   ├── __init__.py
│   │   ├── openlineage.py              # OpenLineage v2 routes
│   │   └── health.py                   # Health check
│   ├── middleware/
│   │   ├── __init__.py
│   │   ├── error_handler.py            # Exception middleware
│   │   └── request_logger.py           # Request/response logging
│   └── schemas/
│       ├── __init__.py
│       ├── requests.py                 # Request validation schemas
│       └── responses.py                # Response models
├── services/
│   ├── __init__.py
│   ├── lineage_service.py              # Graph traversal, node/edge building
│   ├── dataset_service.py              # Dataset metadata, statistics
│   ├── namespace_service.py            # Namespace operations
│   └── impact_service.py               # NEW: Impact analysis logic
├── repositories/
│   ├── __init__.py
│   ├── teradata_repository.py          # All Teradata SQL queries
│   └── base_repository.py              # Connection management
├── domain/
│   ├── __init__.py
│   ├── models.py                       # Domain models (Node, Edge, LineageGraph)
│   └── exceptions.py                   # Domain-specific exceptions
├── utils/
│   ├── __init__.py
│   ├── sql_parser.py                   # MOVED FROM database/scripts/populate/
│   └── logger.py                       # Structured logging setup
└── tests/
    ├── __init__.py
    ├── run_api_tests.py                # Existing integration tests (keep)
    ├── unit/
    │   ├── test_lineage_service.py
    │   ├── test_impact_service.py
    │   └── test_teradata_repository.py
    └── fixtures/
        └── sample_data.py
```

### Structure Rationale

- **`api/` layer:** HTTP-specific concerns isolated from business logic. Routes are thin controllers.
- **`services/` layer:** Business logic and use case orchestration. Can be tested without HTTP server.
- **`repositories/` layer:** Teradata-specific SQL queries. Abstracts database from services. Easier to mock for unit tests.
- **`domain/` layer:** Core business models and domain exceptions. No dependencies on Flask or database.
- **`utils/sql_parser.py`:** Consolidates duplicate parsers. Shared by populate scripts and future DBQL ingestion.

## Architectural Patterns

### Pattern 1: Service Layer with Dependency Injection

**What:** Services receive repository instances via constructor, depend on abstract interfaces.

**When to use:** When you need testable business logic independent of database/HTTP.

**Trade-offs:**
- PRO: Unit tests can inject mock repositories
- PRO: Business logic isolated from Flask
- PRO: Future database changes only affect repository layer
- CON: More files, indirection
- CON: Overkill for simple CRUD endpoints (but this app has complex recursive CTEs)

**Example:**
```python
# domain/models.py
@dataclass
class LineageGraph:
    nodes: List[LineageNode]
    edges: List[LineageEdge]

# repositories/base_repository.py
class BaseRepository(ABC):
    @abstractmethod
    def get_connection(self):
        pass

# repositories/teradata_repository.py
class TeradataRepository(BaseRepository):
    def __init__(self, db_config: dict):
        self.db_config = db_config

    def get_upstream_lineage(self, dataset_name: str, field_name: str, max_depth: int) -> List[dict]:
        """Execute recursive CTE, return raw rows"""
        with self.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(UPSTREAM_CTE_SQL, [dataset_name, field_name, max_depth])
                return cur.fetchall()

# services/lineage_service.py
class LineageService:
    def __init__(self, repository: TeradataRepository):
        self.repo = repository

    def build_lineage_graph(self, dataset_id: str, field_name: str,
                           direction: str, max_depth: int) -> LineageGraph:
        """Business logic: fetch data, build graph, deduplicate nodes"""
        dataset_name = self._resolve_dataset_name(dataset_id)

        nodes = {}
        edges = []

        if direction in ("upstream", "both"):
            rows = self.repo.get_upstream_lineage(dataset_name, field_name, max_depth)
            self._add_rows_to_graph(rows, nodes, edges)

        if direction in ("downstream", "both"):
            rows = self.repo.get_downstream_lineage(dataset_name, field_name, max_depth)
            self._add_rows_to_graph(rows, nodes, edges)

        return LineageGraph(nodes=list(nodes.values()), edges=edges)

# api/routes/openlineage.py
@bp.route("/lineage/<path:dataset_id>/<field_name>", methods=["GET"])
def get_lineage(dataset_id: str, field_name: str):
    """Route handler: validation, error-to-HTTP mapping"""
    direction = request.args.get("direction", "both")
    max_depth = int(request.args.get("maxDepth", "5"))

    # Dependency injection at route level
    service = get_lineage_service()  # Factory creates service with repo

    try:
        graph = service.build_lineage_graph(dataset_id, field_name, direction, max_depth)
        return jsonify({
            "datasetId": dataset_id,
            "fieldName": field_name,
            "graph": {
                "nodes": [n.to_dict() for n in graph.nodes],
                "edges": [e.to_dict() for e in graph.edges]
            }
        })
    except DatasetNotFoundError as e:
        return jsonify({"error": str(e)}), 404
    except ValidationError as e:
        return jsonify({"error": str(e)}), 400
    # Other exceptions caught by middleware
```

### Pattern 2: Middleware-Based Exception Handling

**What:** Flask error handlers intercept exceptions before they reach the client, log structured data, return consistent error responses.

**When to use:** When you need centralized error handling, structured logging, and consistent API error responses.

**Trade-offs:**
- PRO: Single place to handle exception-to-HTTP mapping
- PRO: Automatically logs context (request path, user, timestamp)
- PRO: Prevents sensitive traceback leakage to clients
- CON: Requires domain-specific exceptions (not just `Exception`)

**Example:**
```python
# domain/exceptions.py
class DomainError(Exception):
    """Base exception for domain errors"""
    def __init__(self, message: str, details: dict = None):
        self.message = message
        self.details = details or {}
        super().__init__(self.message)

class DatasetNotFoundError(DomainError):
    """Dataset does not exist in OL_DATASET"""
    pass

class LineageTraversalError(DomainError):
    """Recursive CTE exceeded depth limit or encountered cycle"""
    pass

class DatabaseConnectionError(DomainError):
    """Teradata connection failed"""
    pass

# api/middleware/error_handler.py
import structlog
from flask import jsonify, request

logger = structlog.get_logger()

def register_error_handlers(app):
    @app.errorhandler(DatasetNotFoundError)
    def handle_not_found(e):
        logger.warning("dataset_not_found",
                      dataset_id=e.details.get("dataset_id"),
                      path=request.path)
        return jsonify({"error": e.message, "type": "not_found"}), 404

    @app.errorhandler(DatabaseConnectionError)
    def handle_db_error(e):
        logger.error("database_error",
                    error=str(e),
                    path=request.path,
                    details=e.details)
        return jsonify({"error": "Database unavailable", "type": "database_error"}), 503

    @app.errorhandler(Exception)
    def handle_unexpected_error(e):
        logger.exception("unexpected_error",
                        error_type=type(e).__name__,
                        path=request.path,
                        method=request.method)
        return jsonify({"error": "Internal server error", "type": "internal_error"}), 500

# python_server.py
from api.middleware.error_handler import register_error_handlers
from utils.logger import configure_logging

app = Flask(__name__)
configure_logging(app)  # Sets up structlog with JSON output
register_error_handlers(app)
```

### Pattern 3: Impact Analysis as Downstream Traversal + Aggregation

**What:** Impact analysis reuses lineage traversal (downstream direction) but adds aggregation layers (depth grouping, database grouping, criticality scoring).

**When to use:** When impact analysis is a special case of existing lineage graph with additional metrics.

**Trade-offs:**
- PRO: Reuses tested CTE lineage traversal
- PRO: Consistent depth/direction handling
- PRO: Frontend already has `useImpactAnalysis` hook expecting this format
- CON: Aggregation logic adds complexity

**Example:**
```python
# services/impact_service.py
class ImpactService:
    def __init__(self, lineage_service: LineageService, dataset_service: DatasetService):
        self.lineage_service = lineage_service
        self.dataset_service = dataset_service

    def analyze_impact(self, dataset_id: str, field_name: str, max_depth: int) -> dict:
        """Calculate downstream impact with aggregations"""
        # Step 1: Get full downstream lineage graph
        graph = self.lineage_service.build_lineage_graph(
            dataset_id, field_name, direction="downstream", max_depth=max_depth
        )

        # Step 2: Calculate depth for each node (BFS from source)
        node_depths = self._calculate_node_depths(graph, dataset_id, field_name)

        # Step 3: Build impacted assets list with metadata
        impacted_assets = []
        for node in graph.nodes:
            if node.id == f"{dataset_id}.{field_name}":
                continue  # Skip source node

            depth = node_depths.get(node.id, 0)
            impacted_assets.append({
                "id": node.id,
                "databaseName": node.dataset.split(".")[0],
                "tableName": node.dataset.split(".")[1] if "." in node.dataset else "",
                "columnName": node.name,
                "depth": depth,
                "impactType": "direct" if depth == 1 else "indirect"
            })

        # Step 4: Calculate summary statistics
        summary = self._calculate_summary(impacted_assets)

        return {
            "assetId": dataset_id,
            "fieldName": field_name,
            "impactedAssets": impacted_assets,
            "summary": summary
        }

    def _calculate_summary(self, assets: List[dict]) -> dict:
        by_database = {}
        by_depth = {}
        critical_count = 0

        for asset in assets:
            # Group by database
            db = asset["databaseName"]
            by_database[db] = by_database.get(db, 0) + 1

            # Group by depth
            depth = asset["depth"]
            by_depth[depth] = by_depth.get(depth, 0) + 1

            # Critical = depth 1 (direct dependency)
            if depth == 1:
                critical_count += 1

        return {
            "totalImpacted": len(assets),
            "byDatabase": by_database,
            "byDepth": by_depth,
            "criticalCount": critical_count
        }

# api/routes/openlineage.py
@bp.route("/lineage/<path:dataset_id>/<field_name>/impact", methods=["GET"])
def get_impact_analysis(dataset_id: str, field_name: str):
    max_depth = int(request.args.get("maxDepth", "10"))

    service = get_impact_service()  # Factory injects dependencies
    result = service.analyze_impact(dataset_id, field_name, max_depth)

    return jsonify(result)
```

## Data Flow

### Request Flow Example: Impact Analysis Endpoint

```
1. HTTP Request
   GET /api/v2/openlineage/lineage/demo_user.SRC_SALES.sale_amount/impact?maxDepth=10
       ↓
2. Routes Layer (api/routes/openlineage.py)
   - Parse params: dataset_id, field_name, maxDepth
   - Validate: maxDepth is int, dataset_id format
       ↓
3. Service Layer (services/impact_service.py)
   analyze_impact(dataset_id, field_name, max_depth=10):
     3a. Call lineage_service.build_lineage_graph(direction="downstream")
         ↓
     3b. Repository fetches downstream CTE results
         ↓
     3c. Aggregate: calculate depth via BFS, group by database/depth
         ↓
     3d. Return ImpactAnalysisResponse model
       ↓
4. Routes Layer
   - Convert domain model to JSON
   - Return HTTP 200
       ↓
5. Frontend (useImpactAnalysis hook)
   - TanStack Query caches result
   - ImpactAnalysis.tsx renders summary cards + table
```

### State Management (Existing Frontend)

Frontend uses TanStack Query for server state (no Redux/Zustand for API data). Impact analysis fits existing pattern:

```typescript
// lineage-ui/src/api/hooks/useLineage.ts (add this)
export function useImpactAnalysis(datasetId: string, fieldName: string, maxDepth = 10) {
  return useQuery({
    queryKey: ['impact', datasetId, fieldName, maxDepth],
    queryFn: async () => {
      const { data } = await apiClient.get<ImpactAnalysisResponse>(
        `/api/v2/openlineage/lineage/${encodeURIComponent(datasetId)}/${encodeURIComponent(fieldName)}/impact?maxDepth=${maxDepth}`
      );
      return data;
    },
    enabled: !!datasetId && !!fieldName,
  });
}
```

## Integration Points

### New vs Modified Components

| Component | Status | Integration Point |
|-----------|--------|-------------------|
| `/api/v2/openlineage/lineage/{datasetId}/{fieldName}/impact` | **NEW** | Returns impact analysis JSON matching `ImpactAnalysisResponse` type (types/index.ts L69-73) |
| `services/impact_service.py` | **NEW** | Orchestrates lineage traversal + aggregation logic |
| `ImpactPage.tsx` | **MODIFY** | Replace placeholder with `useImpactAnalysis` hook call, pass data to `<ImpactAnalysis>` component |
| `python_server.py` | **REFACTOR** | Extract routes → `api/routes/`, services → `services/`, repository → `repositories/` |
| `domain/exceptions.py` | **NEW** | Define `DatasetNotFoundError`, `LineageTraversalError`, etc. |
| `api/middleware/error_handler.py` | **NEW** | Register Flask error handlers for domain exceptions |
| `utils/sql_parser.py` | **MOVE** | From `database/scripts/populate/sql_parser.py` (delete archive copy) |
| `repositories/teradata_repository.py` | **NEW** | Extract all SQL from current route handlers (lines 118-1447) |
| `services/lineage_service.py` | **NEW** | Extract graph building logic from route handlers |

### External Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Frontend ↔ Backend API | REST/JSON over HTTP | No changes to existing contracts (v2 endpoints remain compatible) |
| Backend ↔ Teradata | JDBC (teradatasql driver) | Repository layer isolates SQL dialect, easier to add caching later |
| Populate Scripts ↔ sql_parser | Python import | Move parser to `lineage-api/utils/`, update imports in `database/scripts/populate/` |

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| **Current (single user, demo)** | Proposed architecture works. Connection per request acceptable. |
| **10-100 concurrent users** | Add connection pooling in `BaseRepository` (teradatasql supports pooling). Cache dataset metadata (namespace, dataset lists) in Redis (TTL 5 min). Impact analysis can be slow at depth 10+ → add loading states, cache results. |
| **100+ concurrent users** | Move recursive CTE execution to async workers (Celery). Cache lineage graphs aggressively. Consider pre-computing impact for critical tables (nightly job). Monitor Teradata query load (recursive CTEs are CPU-intensive). |

### Scaling Priorities

1. **First bottleneck:** Recursive CTE queries at high depth (depth 10 on large tables = seconds). **Fix:** Add depth limits, cache results per dataset/field, pre-compute for common queries.
2. **Second bottleneck:** DBC.* view queries for statistics (can be slow on Teradata). **Fix:** Cache statistics, only refresh on-demand, use batch queries for multiple tables.

## Anti-Patterns

### Anti-Pattern 1: Over-Abstracting the Repository

**What people do:** Create generic `Repository` base class with methods like `find_by_id()`, `save()`, `delete()` (Active Record pattern).

**Why it's wrong:** This app has highly specialized queries (recursive CTEs, OpenLineage schema). Generic CRUD doesn't fit. Forces unnatural abstraction.

**Do this instead:** Repository has domain-specific methods:
```python
class TeradataRepository:
    def get_upstream_lineage(self, dataset: str, field: str, depth: int) -> List[dict]:
        """Executes upstream CTE specific to OL_COLUMN_LINEAGE schema"""

    def get_dataset_statistics(self, dataset_id: str) -> dict:
        """Queries DBC.TablesV, DBC.TableStatsV, DBC.TableSizeV"""
```

Not:
```python
class Repository:
    def find_by_id(self, id: str) -> dict:  # Too generic, doesn't match domain
```

### Anti-Pattern 2: Service Layer Doing SQL

**What people do:** Service methods build SQL strings or call cursor.execute() directly.

**Why it's wrong:** Defeats the purpose of layering. Can't test service without database. Can't swap Teradata for Postgres later.

**Do this instead:**
```python
# Service calls repository methods
class LineageService:
    def build_graph(self, ...):
        rows = self.repo.get_upstream_lineage(dataset, field, depth)
        return self._transform_rows_to_graph(rows)

# Repository owns SQL
class TeradataRepository:
    def get_upstream_lineage(self, ...):
        sql = """WITH RECURSIVE ..."""
        return self._execute_query(sql, params)
```

### Anti-Pattern 3: Catch-All Exception Logging Without Context

**What people do:**
```python
except Exception as e:
    logger.error(f"Error: {e}")  # Loses request context
    return {"error": "Something went wrong"}, 500
```

**Why it's wrong:** No context for debugging (which dataset? which user? which query?). No structured data for alerting.

**Do this instead:**
```python
except DatasetNotFoundError as e:
    logger.warning("dataset_not_found",
                  dataset_id=e.details["dataset_id"],
                  requested_by=request.remote_addr,
                  path=request.path)
    return {"error": e.message, "type": "not_found"}, 404
```

Use middleware for unexpected exceptions with full context capture.

## Build Order (Phased Refactoring)

**Critical:** Database tests must pass after each phase. 73 tests in `database/tests/run_tests.py` are regression checks.

### Phase 1: Foundation (No Behavior Change)
**Goal:** Set up structure, move code without changing logic.

1. Create directory structure (`api/`, `services/`, `repositories/`, `domain/`, `utils/`)
2. Move `sql_parser.py` from `database/scripts/populate/` to `lineage-api/utils/`
3. Delete duplicate in `database/archive/sql_parser.py`
4. Update imports in `database/scripts/populate/populate_lineage.py`
5. Create `domain/exceptions.py` with domain exception classes
6. Create `utils/logger.py` with structlog configuration
7. **Validate:** Run database tests, all pass

### Phase 2: Extract Repository Layer
**Goal:** Isolate database access from routes.

1. Create `repositories/base_repository.py` with connection management (from lines 91-98)
2. Create `repositories/teradata_repository.py`
3. Extract SQL queries from route handlers into repository methods:
   - `get_upstream_lineage()` (from lines 716-762)
   - `get_downstream_lineage()` (from lines 804-850)
   - `get_dataset_by_id()` (from lines 254-267)
   - `get_dataset_fields()` (from lines 284-295)
   - `get_dataset_statistics()` (from lines 343-414)
   - `get_dataset_ddl()` (from lines 448-542)
4. Update route handlers to call repository (inject via factory)
5. **Validate:** Run API tests (`lineage-api/tests/run_api_tests.py`), all 20 pass

### Phase 3: Extract Service Layer
**Goal:** Move business logic out of routes.

1. Create `services/lineage_service.py` with `build_lineage_graph()`
2. Extract graph-building logic from route handlers (node deduplication, edge creation)
3. Create `services/dataset_service.py` with metadata retrieval
4. Create `services/namespace_service.py` for namespace operations
5. Update routes to call services (routes become thin controllers)
6. **Validate:** Run API tests, all 20 pass

### Phase 4: Exception Handling Middleware
**Goal:** Centralize error handling.

1. Create `api/middleware/error_handler.py` with Flask error handlers
2. Update services to raise domain exceptions (not bare `Exception`)
3. Register error handlers in `python_server.py`
4. Replace all `traceback.print_exc()` calls with structured logging
5. **Validate:** Run API tests, verify error responses have correct structure

### Phase 5: Impact Analysis Feature (NEW)
**Goal:** Add new endpoint and frontend integration.

1. Create `services/impact_service.py` with `analyze_impact()`
2. Add `/api/v2/openlineage/lineage/{datasetId}/{fieldName}/impact` route
3. Implement BFS depth calculation and aggregation logic
4. Update `ImpactPage.tsx` to call `useImpactAnalysis` hook
5. Update API test suite with impact analysis test (already at line 128-141)
6. **Validate:** Run API tests, verify impact endpoint returns expected format

### Phase 6: Frontend Integration
**Goal:** Connect UI to new backend.

1. Update `useImpactAnalysis` hook in `lineage-ui/src/api/hooks/useLineage.ts` (change endpoint from v1 to v2)
2. Update `ImpactPage.tsx` to remove placeholder, use real data
3. Add loading/error states to `ImpactAnalysis.tsx`
4. **Validate:** Manual E2E test (click column → Impact Analysis → see results)

## Dependency Notes

**No new Python dependencies required:**
- `flask` (already installed)
- `teradatasql` (already installed)
- `structlog` (add for structured logging - HIGH value, minimal risk)

**Frontend:** No new dependencies (TanStack Query already used)

**Risk:** Refactoring introduces bugs. **Mitigation:** Phased approach with test validation after each phase.

## Sources

### Flask Service/Repository Pattern
- [Our First Use Case: Flask API and Service Layer - Cosmic Python](https://www.cosmicpython.com/book/chapter_04_service_layer.html)
- [Repository Pattern - Cosmic Python](https://www.cosmicpython.com/book/chapter_02_repository.html)
- [Flask Repository Pattern - Medium](https://medium.com/@burchardt.tobias/flask-repository-pattern-12423ba9f6b4)
- [Python Design Patterns for Clean Architecture - Rost Glukhov](https://www.glukhov.org/post/2025/11/python-design-patterns-for-clean-architecture/)

### Exception Handling & Structured Logging
- [Flask Error Handling Patterns - Better Stack](https://betterstack.com/community/guides/scaling-python/flask-error-handling/)
- [Handling Application Errors - Flask Documentation](https://flask.palletsprojects.com/en/stable/errorhandling/)
- [Complete Guide to Logging in Flask - SigNoz](https://signoz.io/guides/flask-logging/)
- [Flask Logging Made Simple for Developers - Last9](https://last9.io/blog/flask-logging/)

### Impact Analysis Architecture
- [Lineage Impact Analysis - DataHub](https://docs.datahub.com/docs/act-on-metadata/impact-analysis/)
- [The Ultimate Guide To Data Lineage - Monte Carlo Data](https://www.montecarlodata.com/blog-data-lineage/)
- [Data Lineage Platform for Modern Data and AI - Foundational](https://www.foundational.io/platform/data-lineage-platform)
- [Automated Data Lineage: Key Concepts and Tutorial - Pantomath](https://www.pantomath.com/data-pipeline-automation/automated-data-lineage)

---
*Architecture research for: Teradata Lineage Application Backend Refactoring*
*Researched: 2026-02-13*
*Context: Refactoring 1454-line Flask monolith, adding Impact Analysis feature, consolidating SQL parsers*
