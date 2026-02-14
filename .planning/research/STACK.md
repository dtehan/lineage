# Stack Research

**Domain:** Teradata data lineage application - Impact Analysis feature and backend refactoring
**Researched:** 2026-02-13
**Confidence:** HIGH

## Recommended Stack

### Backend: Logging and Exception Handling

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| loguru | >=0.7.3 | Structured logging with JSON output | Simplest Python logging library with zero-config JSON support, automatic contextualization, and better DX than stdlib logging. Flask community standard for structured logs. |
| Flask (existing) | >=3.0.0 | Web framework | Already in use. Native logging integration via `app.logger`. |

**Rationale for loguru over alternatives:**
- **vs structlog**: Loguru requires zero configuration for JSON output while structlog needs explicit pipeline setup. For this application's size, loguru's simplicity wins.
- **vs python-json-logger**: No longer actively maintained. Loguru provides superset of features with better API.
- **vs stdlib logging**: Loguru adds automatic exception catching, better formatting, JSON output, and rotation - all without complex handler/formatter setup.

### Backend: Application Structure (Service/Repository Pattern)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Flask Blueprints (stdlib) | Built-in | Modular application structure | Official Flask pattern for organizing large applications. Zero dependencies, native support, excellent documentation. |
| NO dependency injection framework | - | Explicit > implicit | Python's dynamic nature + Flask's request context make DI frameworks (python-dependency-injector, Flask-Injector) unnecessary overhead for this application size. Use constructor injection with factory functions. |

**Architecture Pattern:**
```
lineage-api/
├── api/                    # Flask blueprints (routes)
│   ├── __init__.py
│   ├── lineage_bp.py
│   ├── datasets_bp.py
│   └── namespaces_bp.py
├── services/              # Business logic
│   ├── __init__.py
│   ├── lineage_service.py
│   ├── dataset_service.py
│   └── namespace_service.py
├── repositories/          # Database access
│   ├── __init__.py
│   ├── base_repository.py
│   ├── lineage_repository.py
│   ├── dataset_repository.py
│   └── namespace_repository.py
├── models/               # Domain models (not DB models)
│   └── __init__.py
├── exceptions/           # Custom exceptions
│   └── __init__.py
├── config.py            # Configuration
└── app_factory.py       # Application factory
```

### Frontend: Impact Analysis UI

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| TanStack Table | ^8.21.3 | Data table with sorting, filtering, pagination | Impact Analysis table display - already using TanStack Query, ecosystem consistency. |
| lucide-react (existing) | ^0.300.0 | Icons | Already in use, has needed icons (AlertTriangle, ArrowRight, Database). |
| NO charting library | - | - | Impact Analysis does not require charts/visualizations per fixture inspection - only tabular data with summary metrics. Existing components sufficient. |

**Why TanStack Table:**
- Headless UI = full styling control with existing Tailwind classes
- Lightweight (10-15kb)
- React 18 compatible
- Already using TanStack Query - same ecosystem, similar patterns
- Built-in sorting, filtering, pagination without external dependencies

**Why NOT recharts/visx:**
- Impact Analysis fixture shows tabular data only (database, table, column, depth, impact type)
- Summary metrics are simple counts displayed in `ImpactSummary` component
- No time series, distributions, or relationships requiring visualization
- Would add 50-200kb for unused functionality

### Testing: New Code Patterns

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| pytest-mock | ^3.15.1 | Mocking with automatic cleanup | Unit tests for service layer, repository mocking in service tests. |
| pytest-flask | ^1.3.0 | Flask test fixtures | Blueprint integration tests, request context testing. |
| pytest (existing) | Latest | Test runner | Already in use for database tests. |

## Installation

### Backend (Python)
```bash
# Add to requirements.txt
loguru>=0.7.3

# Install
pip install loguru>=0.7.3
```

### Backend Testing (Python)
```bash
# Add to requirements-dev.txt (create if doesn't exist)
pytest-mock>=3.15.1
pytest-flask>=1.3.0

# Install
pip install pytest-mock pytest-flask
```

### Frontend (React)
```bash
# From lineage-ui/
npm install @tanstack/react-table@^8.21.3
```

## Alternatives Considered

| Category | Recommended | Alternative | When to Use Alternative |
|----------|-------------|-------------|-------------------------|
| Logging | loguru | structlog | Need async logging, buffered writes, or processing pipelines (e.g., PII redaction). This app doesn't need those. |
| Logging | loguru | stdlib logging | Never for new code. Only if contributing to projects that mandate stdlib. |
| Backend Structure | Blueprints + manual DI | python-dependency-injector | Large team needs enforced patterns, or migrating from DI-heavy framework (Spring, .NET). Overkill here. |
| Impact Table | TanStack Table | Material React Table | Need Material UI design system. This app uses custom Tailwind. |
| Impact Table | TanStack Table | Recharts/visx | Actually need charts. This feature needs tables only. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| python-json-logger | No longer maintained, last update 2020 | loguru (actively maintained, better API) |
| Flask-Injector | Adds magic, unclear value for 1454-line server. Increases test complexity. | Constructor injection with factory functions |
| SQLAlchemy for this app | Application already uses raw teradatasql driver. Adding ORM now would require full rewrite. | Keep existing teradatasql with repository pattern |
| react-table (v7) | Deprecated, replaced by TanStack Table v8 | @tanstack/react-table (official successor) |

## Stack Integration Points

### Logging Configuration (loguru + Flask)
```python
# app_factory.py
from loguru import logger
import sys

def setup_logging():
    """Configure loguru to work with Flask."""
    # Remove default handler
    logger.remove()

    # Add JSON handler for production
    logger.add(
        sys.stderr,
        format="{time:YYYY-MM-DD HH:mm:ss} | {level} | {name}:{function}:{line} | {message}",
        level="INFO",
        serialize=True,  # JSON output
        backtrace=True,
        diagnose=True,
    )

    # Intercept Flask's app.logger
    class InterceptHandler(logging.Handler):
        def emit(self, record):
            logger_opt = logger.opt(depth=6, exception=record.exc_info)
            logger_opt.log(record.levelname, record.getMessage())

    app.logger.addHandler(InterceptHandler())
```

### Blueprint + Service + Repository Pattern
```python
# api/lineage_bp.py
from flask import Blueprint, jsonify, request
from services.lineage_service import LineageService
from exceptions import LineageNotFoundError
from loguru import logger

lineage_bp = Blueprint('lineage', __name__, url_prefix='/api/v2/openlineage')

def create_lineage_blueprint(lineage_service: LineageService):
    @lineage_bp.route('/lineage/<dataset_id>/<field_name>')
    def get_lineage(dataset_id: str, field_name: str):
        try:
            result = lineage_service.get_column_lineage(
                dataset_id,
                field_name,
                direction=request.args.get('direction', 'both'),
                max_depth=int(request.args.get('maxDepth', 10))
            )
            return jsonify(result)
        except LineageNotFoundError as e:
            logger.warning(f"Lineage not found: {dataset_id}.{field_name}")
            return jsonify({"error": str(e)}), 404
        except ValueError as e:
            logger.warning(f"Invalid parameters: {e}")
            return jsonify({"error": str(e)}), 400
        except Exception as e:
            logger.exception(f"Unexpected error fetching lineage")
            return jsonify({"error": "Internal server error"}), 500

    return lineage_bp

# services/lineage_service.py
from repositories.lineage_repository import LineageRepository
from loguru import logger

class LineageService:
    def __init__(self, lineage_repo: LineageRepository):
        self.lineage_repo = lineage_repo

    def get_column_lineage(self, dataset_id: str, field_name: str,
                          direction: str, max_depth: int):
        logger.info(f"Fetching lineage for {dataset_id}.{field_name}")

        if max_depth < 1 or max_depth > 50:
            raise ValueError("max_depth must be between 1 and 50")

        raw_data = self.lineage_repo.fetch_lineage(
            dataset_id, field_name, direction, max_depth
        )

        # Transform to graph format
        return self._transform_to_graph(raw_data)
```

### TanStack Table Integration
```typescript
// ImpactAnalysisTable.tsx
import { useReactTable, getCoreRowModel, getSortedRowModel } from '@tanstack/react-table';
import type { ImpactedAsset } from '../../../types';

const columns = [
  { accessorKey: 'tableName', header: 'Asset' },
  { accessorKey: 'databaseName', header: 'Database' },
  { accessorKey: 'depth', header: 'Depth' },
  { accessorKey: 'impactType', header: 'Impact Type' },
];

export function ImpactAnalysisTable({ data }: { data: ImpactedAsset[] }) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  // Render table with existing Tailwind styles...
}
```

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| loguru@0.7.3 | Python >=3.5, Flask >=3.0.0 | No known conflicts with teradatasql |
| pytest-mock@3.15.1 | pytest >=6.0 | Already compatible with existing pytest setup |
| pytest-flask@1.3.0 | Flask >=2.2, pytest >=6.0 | Works with Flask 3.x |
| @tanstack/react-table@8.21.3 | React >=18.0.0, TypeScript >=4.7 | Compatible with existing React 18.2.0 |

## Migration Notes

### Exception Handling Migration
**Current:** 11 endpoints with `except Exception: traceback.print_exc()`
**After:**
1. Create `exceptions/__init__.py` with domain exceptions (LineageNotFoundError, DatasetNotFoundError, etc.)
2. Service layer raises domain exceptions
3. Blueprint handlers catch and map to HTTP responses with loguru logging
4. Remove all `traceback.print_exc()` - loguru handles with `backtrace=True`

### Refactoring Order
1. Add loguru, configure in `app_factory.py`
2. Create repository layer (database access only)
3. Create service layer (business logic, uses repositories)
4. Create blueprints (HTTP handling, uses services)
5. Update `python_server.py` to use application factory
6. Add pytest-mock and pytest-flask for new tests

### Frontend Impact Analysis
1. Install @tanstack/react-table
2. Replace existing table in `ImpactAnalysis.tsx` with TanStack Table
3. Add sorting to columns (depth, impactType)
4. Add filtering by database name
5. No other components needed - ImpactSummary already exists

## Sources

**Python Logging:**
- [Flask Official Documentation - Logging](https://flask.palletsprojects.com/en/stable/logging/) - Flask logging configuration recommendations
- [Loguru PyPI](https://pypi.org/project/loguru/) - Current version 0.7.3 (HIGH confidence)
- [Loguru GitHub Releases](https://github.com/Delgan/loguru/releases) - Version verification
- [Better Stack: Logging in Python with Loguru](https://betterstack.com/community/guides/logging/loguru/) - Best practices and comparison
- [Better Stack: Best Python Logging Libraries](https://betterstack.com/community/guides/logging/best-python-logging-libraries/) - Library comparison with loguru vs structlog vs python-json-logger
- [Complete Guide to Logging in Flask | SigNoz](https://signoz.io/guides/flask-logging/) - Structured logging patterns

**Flask Architecture:**
- [Flask Official Documentation - Blueprints](https://flask.palletsprojects.com/en/stable/blueprints/) - Official blueprint patterns (HIGH confidence)
- [Real Python: Use a Flask Blueprint to Architect Your Applications](https://realpython.com/flask-blueprint/) - Blueprint best practices
- [Cosmic Python: Repository Pattern](https://www.cosmicpython.com/book/chapter_02_repository.html) - Repository pattern in Python
- [Cosmic Python: Service Layer](https://www.cosmicpython.com/book/chapter_04_service_layer.html) - Service layer patterns
- [Medium: Flask Repository Pattern](https://medium.com/@burchardt.tobias/flask-repository-pattern-12423ba9f6b4) - Flask-specific repository implementation

**Dependency Injection:**
- [python-dependency-injector Documentation](https://python-dependency-injector.ets-labs.org/) - DI framework overview (evaluated, not recommended for this app)
- [Flask-Injector PyPI](https://pypi.org/project/Flask-Injector/) - Alternative DI approach (evaluated, not recommended)
- Recommendation: Manual DI with constructor injection based on Flask's minimal philosophy

**Testing:**
- [pytest-mock PyPI](https://pypi.org/project/pytest-mock/) - Version 3.15.1 (MEDIUM confidence, Sep 2025 release)
- [pytest-flask PyPI](https://pypi.org/project/pytest-flask/) - Version 1.3.0 (MEDIUM confidence)
- [TestDriven.io: Testing Flask Applications with Pytest](https://testdriven.io/blog/flask-pytest/) - Flask testing patterns
- [DataCamp: pytest-mock Tutorial](https://www.datacamp.com/tutorial/pytest-mock) - Mocking best practices

**Frontend:**
- [TanStack Table npm](https://www.npmjs.com/package/@tanstack/react-table) - Version 8.21.3 (HIGH confidence)
- [TanStack Table Official Docs](https://tanstack.com/table/latest) - Documentation and examples
- [Better Stack: Best React Chart Libraries](https://betterstack.com/community/guides/logging/best-python-logging-libraries/) - Comparison including recharts and visx (evaluated, determined unnecessary)
- [LogRocket: Best React Chart Libraries 2025](https://blog.logrocket.com/best-react-chart-libraries-2025/) - Chart library comparison

---
*Stack research for: Impact Analysis feature and backend refactoring*
*Researched: 2026-02-13*
*Confidence: HIGH - All core recommendations verified with official documentation and current versions*
