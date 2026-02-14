# Phase 1: Foundation Refactoring & Impact Analysis Core - Research

**Researched:** 2026-02-14
**Domain:** Python/Flask backend refactoring (repository/service layers), React Impact Analysis UI, Teradata recursive CTE optimization
**Confidence:** HIGH

## Summary

Phase 1 involves extracting duplicated recursive CTE lineage traversal logic into a repository layer, implementing a service layer for business logic, refactoring Flask routes into Blueprints, and building an Impact Analysis UI feature using TanStack Table. The current codebase has 5 duplicate recursive CTE queries across 3 endpoints (column/table/database lineage) totaling ~400 lines of SQL duplication. The backend architecture is currently a single 1455-line monolithic Flask file with all routes, database logic, and business logic intermixed.

**Primary recommendation:** Follow Flask Application Factory pattern with Blueprint-based routes, extract recursive CTEs into a repository layer with parameterized functions, implement a service layer for impact analysis aggregation logic, and use TanStack Table v8 for the frontend data grid.

## Standard Stack

### Core (Backend)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Flask | 3.x | Web framework | Industry standard Python microframework, already in use |
| teradatasql | Latest | Teradata driver | Official Teradata Python driver, already in use |
| python-dotenv | Latest | Config management | Standard for .env file loading, already in use |

### Core (Frontend)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @tanstack/react-table | ^8.x | Data tables | Most popular React table library (42k+ GitHub stars), TypeScript-first, headless UI |
| @tanstack/react-query | ^5.17.0 | API state management | Already in use, perfect for server state |
| axios | ^1.6.0 | HTTP client | Already in use for API calls |
| zustand | ^4.4.0 | Client state management | Already in use, lightweight |

### Supporting (Backend)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| loguru | Latest | Structured logging | Phase 2 (Exception Handling), but prepare architecture now |
| pytest | Latest | Testing | Unit tests for repository/service layers |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Flask Blueprints | FastAPI | FastAPI has better async support but requires full rewrite; Blueprints maintain compatibility |
| TanStack Table | AG Grid | AG Grid is more feature-rich but requires license for enterprise features; TanStack is MIT licensed |
| Repository pattern | Direct SQL in routes | Repository pattern adds abstraction layer but enables testing and reduces duplication |

**Installation:**
```bash
# Backend (already installed)
pip install flask teradatasql python-dotenv

# Backend testing (new)
pip install pytest pytest-mock

# Frontend (TanStack Table already installed)
cd lineage-ui && npm install @tanstack/react-table
```

## Architecture Patterns

### Recommended Project Structure
```
lineage-api/
├── python_server.py              # Application factory only
├── config.py                     # Configuration (from .env)
├── routes/                       # Flask Blueprints
│   ├── __init__.py
│   ├── openlineage.py           # /api/v2/openlineage/* routes
│   └── health.py                # /health route
├── services/                     # Business logic layer
│   ├── __init__.py
│   ├── lineage_service.py       # Lineage aggregation, graph building
│   ├── dataset_service.py       # Dataset metadata operations
│   └── impact_service.py        # Impact analysis calculations
├── repositories/                 # Data access layer
│   ├── __init__.py
│   ├── base.py                  # AbstractRepository interface
│   ├── lineage_repository.py    # Recursive CTE functions
│   └── dataset_repository.py    # Dataset/field queries
└── tests/                        # Unit tests
    ├── test_repositories.py
    └── test_services.py
```

### Pattern 1: Repository Layer with Recursive CTEs
**What:** Extract duplicate recursive CTE SQL into parameterized repository functions
**When to use:** When same CTE pattern is used across multiple endpoints with only parameter differences
**Example:**
```python
# Source: Current implementation analysis + Flask Repository Pattern (Medium)
# repositories/lineage_repository.py

class LineageRepository:
    def __init__(self, connection):
        self.connection = connection

    def get_downstream_lineage(
        self,
        dataset_name: str,
        field_name: str,
        max_depth: int = 5
    ) -> list[dict]:
        """
        Execute downstream recursive CTE and return results.

        Returns list of dicts with keys: source_dataset, source_field,
        target_dataset, target_field, transformation_type, depth
        """
        with self.connection.cursor() as cur:
            cur.execute("""
                WITH RECURSIVE downstream_lineage AS (
                    SELECT
                        source_namespace, source_dataset, source_field,
                        target_namespace, target_dataset, target_field,
                        transformation_type, 1 as depth,
                        CAST(source_dataset || '.' || source_field || '->' ||
                             target_dataset || '.' || target_field AS VARCHAR(10000)) as path
                    FROM OL_COLUMN_LINEAGE
                    WHERE source_dataset = ?
                      AND UPPER(source_field) = UPPER(?)
                      AND is_active = 'Y'

                    UNION ALL

                    SELECT
                        cl.source_namespace, cl.source_dataset, cl.source_field,
                        cl.target_namespace, cl.target_dataset, cl.target_field,
                        cl.transformation_type, dl.depth + 1,
                        dl.path || '->' || cl.target_dataset || '.' || cl.target_field
                    FROM OL_COLUMN_LINEAGE cl
                    INNER JOIN downstream_lineage dl
                        ON cl.source_dataset = dl.target_dataset
                        AND cl.source_field = dl.target_field
                    WHERE cl.is_active = 'Y'
                      AND dl.depth < ?
                      AND POSITION(cl.target_dataset || '.' || cl.target_field IN dl.path) = 0
                )
                SELECT DISTINCT
                    source_namespace, source_dataset, source_field,
                    target_namespace, target_dataset, target_field,
                    transformation_type, depth
                FROM downstream_lineage
            """, [dataset_name, field_name, max_depth])

            return [
                {
                    "source_namespace": row[0].strip() if row[0] else "",
                    "source_dataset": row[1].strip() if row[1] else "",
                    "source_field": row[2].strip() if row[2] else "",
                    "target_namespace": row[3].strip() if row[3] else "",
                    "target_dataset": row[4].strip() if row[4] else "",
                    "target_field": row[5].strip() if row[5] else "",
                    "transformation_type": row[6].strip() if row[6] else "DIRECT",
                    "depth": row[7] if row[7] else 1
                }
                for row in cur.fetchall()
            ]
```

### Pattern 2: Service Layer for Business Logic
**What:** Service layer orchestrates repository calls and implements business logic like aggregations
**When to use:** When multiple repository calls need coordination or results need transformation for API
**Example:**
```python
# Source: Cosmic Python Service Layer + current impactAnalysis.json fixture
# services/impact_service.py

from collections import defaultdict
from typing import TypedDict

class ImpactSummary(TypedDict):
    totalImpacted: int
    byDatabase: dict[str, int]
    byDepth: dict[str, int]
    tableCount: int
    columnCount: int

class ImpactAsset(TypedDict):
    databaseName: str
    tableName: str
    columnName: str
    depth: int
    impactType: str  # "direct" or "indirect"

class ImpactService:
    def __init__(self, lineage_repo, dataset_repo):
        self.lineage_repo = lineage_repo
        self.dataset_repo = dataset_repo

    def analyze_downstream_impact(
        self,
        dataset_id: str,
        field_name: str,
        max_depth: int = 10
    ) -> dict:
        """
        Analyze downstream impact with aggregated statistics.

        Returns:
            {
                "sourceAsset": {...},
                "impactedAssets": [...],
                "summary": {
                    "totalImpacted": int,
                    "byDatabase": {...},
                    "byDepth": {...},
                    "tableCount": int,
                    "columnCount": int
                }
            }
        """
        # Get dataset name from dataset_id
        dataset = self.dataset_repo.get_dataset(dataset_id)
        dataset_name = dataset["name"]

        # Get downstream lineage from repository
        lineage_records = self.lineage_repo.get_downstream_lineage(
            dataset_name, field_name, max_depth
        )

        # Build impact asset list
        impacted_assets: list[ImpactAsset] = []
        seen_columns = set()

        for record in lineage_records:
            target_key = f"{record['target_dataset']}.{record['target_field']}"
            if target_key in seen_columns:
                continue
            seen_columns.add(target_key)

            # Parse database.table from dataset name
            db_name, table_name = record["target_dataset"].split(".", 1)

            impacted_assets.append({
                "databaseName": db_name,
                "tableName": table_name,
                "columnName": record["target_field"],
                "depth": record["depth"],
                "impactType": "direct" if record["depth"] == 1 else "indirect"
            })

        # Calculate aggregated summary
        summary = self._calculate_summary(impacted_assets)

        return {
            "sourceAsset": {
                "datasetId": dataset_id,
                "fieldName": field_name
            },
            "impactedAssets": impacted_assets,
            "summary": summary
        }

    def _calculate_summary(self, assets: list[ImpactAsset]) -> ImpactSummary:
        """Calculate aggregated statistics from impact assets."""
        by_database = defaultdict(int)
        by_depth = defaultdict(int)
        unique_tables = set()

        for asset in assets:
            by_database[asset["databaseName"]] += 1
            by_depth[str(asset["depth"])] += 1
            unique_tables.add(f"{asset['databaseName']}.{asset['tableName']}")

        return {
            "totalImpacted": len(assets),
            "byDatabase": dict(by_database),
            "byDepth": dict(by_depth),
            "tableCount": len(unique_tables),
            "columnCount": len(assets)
        }
```

### Pattern 3: Flask Blueprint Organization
**What:** Split monolithic python_server.py into modular Blueprints by feature area
**When to use:** When application has multiple logical route groups (health, v1 API, v2 API, admin)
**Example:**
```python
# Source: Flask Official Docs - Blueprints + Real Python Blueprint Tutorial
# routes/openlineage.py

from flask import Blueprint, jsonify, request

openlineage_bp = Blueprint('openlineage', __name__, url_prefix='/api/v2/openlineage')

# Dependency injection of services happens at Blueprint registration
lineage_service = None
dataset_service = None

def init_services(lineage_svc, dataset_svc):
    """Initialize service dependencies."""
    global lineage_service, dataset_service
    lineage_service = lineage_svc
    dataset_service = dataset_svc

@openlineage_bp.route('/namespaces', methods=['GET'])
def list_namespaces():
    """List all OpenLineage namespaces."""
    try:
        namespaces = dataset_service.list_namespaces()
        return jsonify({"namespaces": namespaces})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@openlineage_bp.route('/lineage/<path:dataset_id>/<field_name>', methods=['GET'])
def get_lineage(dataset_id, field_name):
    """Get lineage graph for a dataset field."""
    direction = request.args.get("direction", "both")
    max_depth = int(request.args.get("maxDepth", "5"))

    try:
        graph = lineage_service.get_lineage_graph(
            dataset_id, field_name, direction, max_depth
        )
        return jsonify(graph)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# python_server.py becomes application factory
from flask import Flask
from routes.openlineage import openlineage_bp, init_services

def create_app():
    app = Flask(__name__)

    # Initialize repositories and services
    conn = get_db_connection()
    lineage_repo = LineageRepository(conn)
    dataset_repo = DatasetRepository(conn)
    lineage_svc = LineageService(lineage_repo, dataset_repo)
    dataset_svc = DatasetService(dataset_repo)

    # Register blueprints with dependency injection
    init_services(lineage_svc, dataset_svc)
    app.register_blueprint(openlineage_bp)

    return app
```

### Pattern 4: TanStack Table for Impact Analysis UI
**What:** Use TanStack Table v8 with TypeScript for tabular impact data display
**When to use:** For displaying structured data with sorting, filtering, and column management
**Example:**
```typescript
// Source: TanStack Table Official Docs + Contentful Tutorial
// lineage-ui/src/features/ImpactAnalysis/ImpactTable.tsx

import { useReactTable, getCoreRowModel, getSortedRowModel,
         createColumnHelper, flexRender } from '@tanstack/react-table';

interface ImpactAsset {
  databaseName: string;
  tableName: string;
  columnName: string;
  depth: number;
  impactType: 'direct' | 'indirect';
}

const columnHelper = createColumnHelper<ImpactAsset>();

const columns = [
  columnHelper.accessor('databaseName', {
    header: 'Database',
    cell: info => info.getValue(),
  }),
  columnHelper.accessor('tableName', {
    header: 'Table',
    cell: info => info.getValue(),
  }),
  columnHelper.accessor('columnName', {
    header: 'Column',
    cell: info => info.getValue(),
  }),
  columnHelper.accessor('depth', {
    header: 'Depth',
    cell: info => (
      <span className={`badge depth-${info.getValue()}`}>
        {info.getValue()}
      </span>
    ),
  }),
  columnHelper.accessor('impactType', {
    header: 'Impact Type',
    cell: info => (
      <span className={`badge ${info.getValue()}`}>
        {info.getValue()}
      </span>
    ),
  }),
];

export function ImpactTable({ data }: { data: ImpactAsset[] }) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <table className="impact-table">
      <thead>
        {table.getHeaderGroups().map(headerGroup => (
          <tr key={headerGroup.id}>
            {headerGroup.headers.map(header => (
              <th key={header.id} onClick={header.column.getToggleSortingHandler()}>
                {flexRender(header.column.columnDef.header, header.getContext())}
              </th>
            ))}
          </tr>
        ))}
      </thead>
      <tbody>
        {table.getRowModel().rows.map(row => (
          <tr key={row.id}>
            {row.getVisibleCells().map(cell => (
              <td key={cell.id}>
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

### Anti-Patterns to Avoid
- **Circular imports between services and repositories:** Use dependency injection, not direct imports
- **Business logic in routes:** Routes should only handle HTTP concerns (parsing, validation, response formatting)
- **Mixing repository and service concerns:** Repository = data access only, Service = business logic only
- **Global connection objects:** Pass connections/cursors as dependencies, not module-level globals
- **Inline SQL in services:** All SQL belongs in repositories

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Table sorting/filtering | Custom sort buttons and state | TanStack Table built-in features | Handles edge cases (null values, type coercion, multi-column sort), accessibility, performance |
| Recursive CTE abstraction | String templating or f-strings | Parameterized repository functions | SQL injection protection (even with internal data), testability, type safety |
| API error responses | Custom error formatting in each route | Flask error handlers / middleware | Ensures consistent error format across all endpoints, reduces duplication |
| Configuration management | Manual os.environ.get() calls | Centralized config.py with validation | Type safety, default values, validation at startup (fail-fast) |
| Database connection pooling | Manual connection creation per request | Flask-Teradata extension or connection manager | Prevents connection exhaustion, handles connection lifecycle |

**Key insight:** Recursive CTEs have subtle correctness issues (cycle detection via path tracking, VARCHAR(10000) path size limits, depth termination). Testing and parameterization are critical to avoid subtle bugs when extracting.

## Common Pitfalls

### Pitfall 1: Recursive CTE VARCHAR Path Overflow
**What goes wrong:** Path tracking column defined as VARCHAR(10000) overflows on deep graphs, causing silent truncation or errors
**Why it happens:** Each recursive step appends dataset.column (~50 chars), so 10000 chars supports ~200 depth. If maxDepth=10 but graph has cycles or wide fan-out, path can exceed limit
**How to avoid:**
  1. Enforce maxDepth limits strictly (default=5 for column, 3 for database, 10 for impact)
  2. Use CAST(... AS VARCHAR(10000)) explicitly in CTE definition
  3. Document path size assumptions in repository function docstrings
**Warning signs:**
  - "Path truncation" errors in Teradata logs
  - Cycle detection fails (POSITION returns false negative on truncated path)
  - Inconsistent results between runs on same data

### Pitfall 2: Cycle Detection False Negatives
**What goes wrong:** POSITION(target IN path) = 0 check fails when path is truncated or whitespace handling is inconsistent
**Why it happens:** Teradata CHAR columns are right-padded with spaces, so "demo_user.TABLE" != "demo_user.TABLE " in POSITION checks
**How to avoid:**
  1. Use TRIM() on all dataset/field names before concatenating into path
  2. Test cycle detection explicitly with insert_cte_test_data.py test patterns (TEST_CYCLE_*)
  3. Add depth limit as fallback (never rely solely on path-based cycle detection)
**Warning signs:**
  - Queries timeout or exhaust spool space
  - Test data with known cycles produces results instead of terminating
  - Path strings contain inconsistent spacing

### Pitfall 3: Blueprint Circular Import Deadlock
**What goes wrong:** Blueprint imports service, service imports repository, repository imports models, models import Blueprint for type hints → circular dependency
**Why it happens:** Python evaluates imports at module load time, circular references cause import failures
**How to avoid:**
  1. Use dependency injection (pass services to Blueprint via init function, not import)
  2. Type hints as strings ("LineageService") instead of direct imports
  3. Follow strict layer hierarchy: Routes → Services → Repositories (never reverse)
**Warning signs:**
  - ImportError: cannot import name 'X' from partially initialized module
  - Flask app.register_blueprint() fails with AttributeError
  - Moving import statements changes error location but doesn't fix

### Pitfall 4: Service Layer God Object
**What goes wrong:** Single "LineageService" grows to 1000+ lines handling all lineage, impact, dataset, and search operations
**Why it happens:** Tendency to add "just one more method" to existing service instead of creating new service
**How to avoid:**
  1. Split by bounded context: LineageService, ImpactService, DatasetService, SearchService
  2. Each service should have single responsibility (one domain aggregate)
  3. Services can depend on other services (ImpactService uses LineageService)
**Warning signs:**
  - Service has 10+ public methods
  - Service name is too generic ("DataService", "ApiService")
  - Tests require extensive mocking of service methods

### Pitfall 5: TanStack Table Type Mismatches
**What goes wrong:** TypeScript errors when table data shape doesn't match column accessor definitions
**Why it happens:** API returns {databaseName} but column accessor uses 'database_name' (snake_case)
**How to avoid:**
  1. Define explicit TypeScript interface for table row data
  2. Use columnHelper.accessor with exact property names from interface
  3. Transform API response to match interface before passing to table
**Warning signs:**
  - TypeScript "Property 'X' does not exist on type" errors
  - Table cells render as [object Object] instead of values
  - Sorting/filtering doesn't work on certain columns

## Code Examples

Verified patterns from official sources:

### Teradata Recursive CTE with Cycle Detection
```sql
-- Source: Teradata SQL Fundamentals - Recursive Queries
-- Official cycle detection pattern with path tracking
WITH RECURSIVE downstream_lineage AS (
    -- Seed: Initial rows
    SELECT
        source_dataset,
        source_field,
        target_dataset,
        target_field,
        transformation_type,
        1 as depth,
        CAST(source_dataset || '.' || source_field || '->' ||
             target_dataset || '.' || target_field AS VARCHAR(10000)) as path
    FROM OL_COLUMN_LINEAGE
    WHERE source_dataset = 'demo_user.SRC_SALES'
      AND UPPER(source_field) = UPPER('sale_amount')
      AND is_active = 'Y'

    UNION ALL

    -- Recursive: Follow downstream edges
    SELECT
        cl.source_dataset,
        cl.source_field,
        cl.target_dataset,
        cl.target_field,
        cl.transformation_type,
        dl.depth + 1,
        dl.path || '->' || cl.target_dataset || '.' || cl.target_field
    FROM OL_COLUMN_LINEAGE cl
    INNER JOIN downstream_lineage dl
        ON TRIM(cl.source_dataset) = TRIM(dl.target_dataset)
        AND TRIM(cl.source_field) = TRIM(dl.target_field)
    WHERE cl.is_active = 'Y'
      AND dl.depth < 10  -- Max depth termination
      AND POSITION(TRIM(cl.target_dataset) || '.' || TRIM(cl.target_field) IN dl.path) = 0  -- Cycle detection
)
SELECT DISTINCT
    source_dataset,
    source_field,
    target_dataset,
    target_field,
    transformation_type,
    depth
FROM downstream_lineage
ORDER BY depth, target_dataset, target_field;
```

### TanStack Table with React Query Integration
```typescript
// Source: TanStack Table Official Docs + TanStack Query Integration Guide
import { useQuery } from '@tanstack/react-query';
import { useReactTable, getCoreRowModel, createColumnHelper } from '@tanstack/react-table';

interface ImpactData {
  sourceAsset: { datasetId: string; fieldName: string };
  impactedAssets: ImpactAsset[];
  summary: {
    totalImpacted: number;
    byDatabase: Record<string, number>;
    byDepth: Record<string, number>;
    tableCount: number;
    columnCount: number;
  };
}

export function ImpactAnalysisView({ datasetId, fieldName }: Props) {
  // Fetch impact data with React Query
  const { data, isLoading, error } = useQuery({
    queryKey: ['impact', datasetId, fieldName],
    queryFn: () => fetchImpactAnalysis(datasetId, fieldName),
  });

  // Configure TanStack Table
  const table = useReactTable({
    data: data?.impactedAssets ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorMessage error={error} />;

  return (
    <div>
      <ImpactSummaryCard summary={data.summary} />
      <ImpactTable table={table} />
    </div>
  );
}
```

### Flask Application Factory with Blueprints
```python
# Source: Flask Official Documentation - Application Factories
# python_server.py
from flask import Flask
from routes.openlineage import openlineage_bp
from routes.health import health_bp

def create_app(config=None):
    """Application factory for Flask app."""
    app = Flask(__name__)

    # Load config
    if config:
        app.config.from_mapping(config)

    # Initialize database connection
    db_connection = get_db_connection()

    # Initialize repository layer
    lineage_repo = LineageRepository(db_connection)
    dataset_repo = DatasetRepository(db_connection)

    # Initialize service layer
    lineage_service = LineageService(lineage_repo, dataset_repo)
    impact_service = ImpactService(lineage_repo, dataset_repo)
    dataset_service = DatasetService(dataset_repo)

    # Register blueprints with dependency injection
    openlineage_bp.init_services(lineage_service, impact_service, dataset_service)
    app.register_blueprint(openlineage_bp)
    app.register_blueprint(health_bp)

    return app

if __name__ == "__main__":
    port = int(os.environ.get("API_PORT", "8080"))
    app = create_app()
    app.run(host="0.0.0.0", port=port, debug=False)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| React Table v7 | TanStack Table v8 | 2022-2023 | Complete TypeScript rewrite, framework-agnostic core, breaking API changes |
| Flask-SQLAlchemy required | Plain teradatasql driver | N/A (never changed) | This project uses teradatasql directly (no ORM), which is fine for data warehouse |
| Manual Blueprint wiring | Application Factory pattern | Flask 1.0+ (2018) | Enables better testing, multiple app instances, extension initialization |
| Inline SQL in routes | Repository pattern | Not adopted in current codebase | Need to migrate as part of Phase 1 |

**Deprecated/outdated:**
- **TanStack Table v7 (react-table):** Package renamed to @tanstack/react-table, API completely redesigned in v8
- **useTable hook:** Replaced with useReactTable in v8
- **Global Flask app object:** Replaced with Application Factory pattern for better testability

## Open Questions

1. **Connection Lifecycle Management**
   - What we know: Current code uses get_db_connection() per request, no explicit pooling
   - What's unclear: Whether teradatasql driver has built-in connection pooling; if not, how to implement without adding Flask-SQLAlchemy
   - Recommendation: Research teradatasql connection pooling behavior; if none, implement simple connection pool manager in repository layer

2. **Impact Analysis maxDepth Default**
   - What we know: Current lineage endpoints default to maxDepth=5 (column), maxDepth=3 (database)
   - What's unclear: Optimal default for impact analysis (where we only care about downstream, not upstream)
   - Recommendation: Default to maxDepth=10 for impact analysis (user wants complete downstream view), make configurable

3. **TanStack Table Virtualization**
   - What we know: Large lineage graphs may have 100+ impacted columns
   - What's unclear: Whether to implement virtual scrolling for large result sets or rely on pagination
   - Recommendation: Start with simple table (no virtualization), add @tanstack/react-virtual in Phase 2+ if performance issues arise

4. **Service Layer Dependency Injection**
   - What we know: Services need repository instances; blueprints need service instances
   - What's unclear: Whether to use Flask extensions (flask-injector), manual injection, or request context
   - Recommendation: Use manual injection via Blueprint init functions (simple, no new dependencies, explicit)

## Sources

### Primary (HIGH confidence)
- [TanStack Table Official Documentation](https://tanstack.com/table/latest) - API reference, examples, migration guides
- [Flask Official Documentation - Blueprints](https://flask.palletsprojects.com/en/stable/blueprints/) - Blueprint patterns and best practices
- [Teradata SQL Fundamentals - Recursive Queries](https://docs.teradata.com/r/Enterprise_IntelliFlex_VMware/SQL-Fundamentals/SQL-Data-Definition-Control-and-Manipulation/Recursive-Queries) - Official recursive CTE syntax and examples
- Current codebase analysis - python_server.py (1455 lines), existing TanStack Query usage, OpenLineage schema

### Secondary (MEDIUM confidence)
- [Cosmic Python - Service Layer](https://www.cosmicpython.com/book/chapter_04_service_layer.html) - Flask service layer pattern (verified by O'Reilly book)
- [Flask Repository Pattern - Medium](https://medium.com/@burchardt.tobias/flask-repository-pattern-12423ba9f6b4) - Repository pattern implementation
- [Real Python - Flask Blueprints](https://realpython.com/flask-blueprint/) - Practical Blueprint tutorial
- [Contentful - TanStack Table Guide](https://www.contentful.com/blog/tanstack-table-react-table/) - TanStack Table v8 practical guide
- [Teradata Recursive Query Performance - DWHPro](https://www.dwhpro.com/teradata-recursive-query/) - Performance tips and best practices

### Tertiary (LOW confidence - needs validation)
- [SQL For Devs - Cycle Detection](https://sqlfordevs.com/cycle-detection-recursive-query) - Generic SQL cycle detection (not Teradata-specific)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries are currently in use or industry standard (TanStack Table, Flask)
- Architecture patterns: HIGH - Flask Application Factory and Repository pattern are well-documented with multiple authoritative sources
- Teradata recursive CTEs: HIGH - Official Teradata documentation + current working implementation
- TanStack Table v8: HIGH - Official documentation, widely adopted, TypeScript-first design
- Pitfalls: MEDIUM-HIGH - Based on codebase analysis (VARCHAR path limits, TRIM issues) + Teradata docs (cycle detection)

**Research date:** 2026-02-14
**Valid until:** 2026-03-14 (30 days - stable technology stack)
