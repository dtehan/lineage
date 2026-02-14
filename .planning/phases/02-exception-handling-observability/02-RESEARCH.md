# Phase 02: Exception Handling & Observability - Research

**Researched:** 2026-02-14
**Domain:** Python Flask exception handling, structured logging, and observability
**Confidence:** HIGH

## Summary

Phase 2 focuses on replacing the current ad-hoc exception handling pattern (12 `except Exception` blocks with `traceback.print_exc()`) with a robust observability system. The application currently has:

- 12 routes using bare `Exception` catches with `traceback.print_exc()`
- No domain-specific exception classes
- No structured logging (plain text to stdout)
- No correlation IDs for request tracing
- Potential for sensitive data exposure in stack traces

The recommended approach uses **loguru** for structured JSON logging with context binding, custom domain exception classes following Python DB-API patterns, Flask's built-in error handler mechanism for centralized exception handling, and UUID-based correlation IDs injected via Flask middleware. This preserves the existing `{"error": string}` response contract while adding comprehensive observability.

**Primary recommendation:** Use loguru with Flask middleware for correlation ID injection, domain exception hierarchy inheriting from base application exception, and global error handlers via `@app.errorhandler()` to maintain response contract.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| loguru | >=0.7.3 | Structured JSON logging with context binding | Industry standard for Python structured logging, zero-config JSON serialization, thread-safe context management |
| Flask (built-in) | 3.0+ | Error handler decorators (`@app.errorhandler()`) | Native Flask error handling, no external dependency needed |
| uuid (stdlib) | stdlib | Correlation ID generation | Built-in, no dependencies, RFC 4122 compliant |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| flask-log-request-id | 0.10.1 | Request ID middleware (alternative) | If you need automatic X-Request-ID header support; not required if implementing custom middleware |
| traceback (stdlib) | stdlib | Stack trace filtering/sanitization | For filtering frames when capturing exceptions |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| loguru | Python stdlib logging | stdlib logging requires significant boilerplate for JSON serialization and context binding; loguru is simpler and more powerful |
| Custom middleware | flask-log-request-id | flask-log-request-id adds dependency and integrates with stdlib logging (not loguru); custom middleware gives more control |
| UUID v4 | shortuuid, nanoid | Alternative ID formats are more readable but non-standard; UUID is RFC-compliant and universally recognized |

**Installation:**
```bash
pip install loguru>=0.7.3
# Add to requirements.txt
```

## Architecture Patterns

### Recommended Project Structure
```
lineage-api/
├── exceptions/
│   ├── __init__.py              # Export all exceptions
│   ├── base.py                  # LineageException base class
│   └── domain.py                # DatasetNotFoundError, LineageTraversalError, etc.
├── middleware/
│   ├── __init__.py
│   ├── correlation_id.py        # before_request/after_request hooks
│   └── error_handlers.py        # Global @app.errorhandler() registrations
├── utils/
│   └── logging_config.py        # Loguru sink configuration
├── services/
│   └── [existing service files - import domain exceptions]
├── repositories/
│   └── [existing repository files - import domain exceptions]
└── python_server.py             # Import and register middleware, configure loguru
```

### Pattern 1: Domain Exception Hierarchy
**What:** Three-tier exception hierarchy: base application exception → category exceptions → specific exceptions

**When to use:** For all domain-specific errors that need structured handling

**Example:**
```python
# exceptions/base.py
class LineageException(Exception):
    """Base exception for all lineage application errors."""
    status_code = 500

    def __init__(self, message: str, status_code: int = None, details: dict = None):
        super().__init__(message)
        self.message = message
        if status_code is not None:
            self.status_code = status_code
        self.details = details or {}

    def to_dict(self):
        """Convert exception to dict for JSON serialization."""
        return {
            "error": self.message,
            **self.details  # Include any additional context
        }

# exceptions/domain.py
class DatasetNotFoundError(LineageException):
    """Raised when a dataset cannot be found."""
    status_code = 404

class LineageTraversalError(LineageException):
    """Raised when lineage graph traversal fails."""
    status_code = 500

class DatabaseConnectionError(LineageException):
    """Raised when database connection/query fails."""
    status_code = 500

    def __init__(self, message: str, original_error: Exception = None):
        super().__init__(message)
        self.original_error = original_error
```

**Source:** [How to Create Custom Exceptions in Python](https://oneuptime.com/blog/post/2026-01-22-create-custom-exceptions-python/view), [Flask Error Handling](https://flask.palletsprojects.com/en/stable/errorhandling/)

### Pattern 2: Loguru Configuration with JSON Serialization
**What:** Configure loguru sinks for structured JSON logging with correlation ID binding

**When to use:** At application startup in `python_server.py`

**Example:**
```python
# utils/logging_config.py
import sys
from loguru import logger

def configure_logging():
    """Configure loguru for structured JSON logging."""
    # Remove default handler
    logger.remove()

    # Add JSON sink for production logs
    logger.add(
        sys.stderr,
        serialize=True,  # Enable JSON serialization
        format="{time} {level} {message}",
        level="INFO"
    )

    # Optional: Add file sink for persistence
    logger.add(
        "logs/lineage-api.json",
        serialize=True,
        rotation="100 MB",
        retention="30 days",
        compression="zip",
        level="INFO"
    )

    return logger
```

**Source:** [Loguru Documentation](https://loguru.readthedocs.io/en/stable/api/logger.html), [Better Stack Loguru Guide](https://betterstack.com/community/guides/logging/loguru/)

### Pattern 3: Correlation ID Middleware with Flask Hooks
**What:** Use `before_request` to generate/extract correlation ID, `after_request` to inject into response headers, and loguru's `contextualize()` for thread-safe binding

**When to use:** For all API requests to enable distributed tracing

**Example:**
```python
# middleware/correlation_id.py
import uuid
from flask import request, g
from loguru import logger

def init_correlation_id_middleware(app):
    """Initialize correlation ID middleware with Flask app."""

    @app.before_request
    def set_correlation_id():
        """Generate or extract correlation ID and bind to loguru context."""
        # Try to extract from incoming header (X-Correlation-ID, X-Request-ID)
        correlation_id = (
            request.headers.get('X-Correlation-ID') or
            request.headers.get('X-Request-ID') or
            str(uuid.uuid4())
        )

        # Store in Flask's g object for access in routes
        g.correlation_id = correlation_id

        # Bind to loguru context (thread-safe, request-scoped)
        logger.contextualize(correlation_id=correlation_id)

    @app.after_request
    def inject_correlation_id(response):
        """Inject correlation ID into response headers."""
        if hasattr(g, 'correlation_id'):
            response.headers['X-Correlation-ID'] = g.correlation_id
        return response
```

**Source:** [Flask Middleware and Hooks](https://itpathshaala.com/tutorials/flask/flask-middleware-and-hooks.html), [Loguru Context Propagation](https://www.soumendrak.com/series/practical-observability-with-python/context-propagation/)

### Pattern 4: Global Error Handler Registration
**What:** Use Flask's `@app.errorhandler()` to register centralized exception handlers that preserve response contract

**When to use:** For all custom exceptions and catch-all handling

**Example:**
```python
# middleware/error_handlers.py
from flask import jsonify, g
from loguru import logger
from werkzeug.exceptions import HTTPException
from exceptions.base import LineageException
from exceptions.domain import DatasetNotFoundError, DatabaseConnectionError

def register_error_handlers(app):
    """Register global error handlers with Flask app."""

    @app.errorhandler(DatasetNotFoundError)
    def handle_dataset_not_found(e: DatasetNotFoundError):
        """Handle 404 dataset not found errors."""
        correlation_id = getattr(g, 'correlation_id', 'unknown')
        logger.warning(
            f"Dataset not found: {e.message}",
            correlation_id=correlation_id,
            error_type=type(e).__name__
        )
        return jsonify(e.to_dict()), e.status_code

    @app.errorhandler(DatabaseConnectionError)
    def handle_database_error(e: DatabaseConnectionError):
        """Handle database connection/query errors."""
        correlation_id = getattr(g, 'correlation_id', 'unknown')
        logger.exception(
            f"Database error: {e.message}",
            correlation_id=correlation_id,
            error_type=type(e).__name__,
            original_error=str(e.original_error) if e.original_error else None
        )
        return jsonify(e.to_dict()), e.status_code

    @app.errorhandler(LineageException)
    def handle_lineage_exception(e: LineageException):
        """Catch-all handler for domain exceptions."""
        correlation_id = getattr(g, 'correlation_id', 'unknown')
        logger.exception(
            f"Lineage exception: {e.message}",
            correlation_id=correlation_id,
            error_type=type(e).__name__
        )
        return jsonify(e.to_dict()), e.status_code

    @app.errorhandler(Exception)
    def handle_unexpected_error(e: Exception):
        """Catch-all for unexpected errors (preserves HTTPException passthrough)."""
        # Pass through HTTP exceptions unchanged
        if isinstance(e, HTTPException):
            return e

        correlation_id = getattr(g, 'correlation_id', 'unknown')
        logger.exception(
            "Unexpected error",
            correlation_id=correlation_id,
            error_type=type(e).__name__,
            error_message=str(e)
        )
        # Preserve response contract: {"error": string}
        return jsonify({"error": str(e)}), 500
```

**Source:** [Flask Error Handling Documentation](https://flask.palletsprojects.com/en/stable/errorhandling/)

### Pattern 5: Replacing traceback.print_exc() with logger.exception()
**What:** Replace all `traceback.print_exc()` calls with `logger.exception()` which automatically captures full traceback context

**When to use:** In all exception handlers that currently use traceback

**Example:**
```python
# BEFORE (current pattern in routes/openlineage.py)
@openlineage_bp.route("/datasets/<path:dataset_id>", methods=["GET"])
def get_dataset(dataset_id):
    try:
        result = dataset_service.get_dataset(dataset_id)
        return jsonify(result)
    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    except Exception as e:
        traceback.print_exc()  # ❌ Unstructured, no correlation ID
        return jsonify({"error": str(e)}), 500

# AFTER (with domain exceptions + loguru)
@openlineage_bp.route("/datasets/<path:dataset_id>", methods=["GET"])
def get_dataset(dataset_id):
    # No try/except needed - global error handlers catch everything
    result = dataset_service.get_dataset(dataset_id)
    return jsonify(result)

# In dataset_service.py
def get_dataset(self, dataset_id: str) -> dict:
    dataset = self.dataset_repo.get_dataset(dataset_id)
    if not dataset:
        raise DatasetNotFoundError(f"Dataset not found: {dataset_id}")
    return dataset
```

**Source:** [Loguru Documentation](https://loguru.readthedocs.io/en/stable/api/logger.html)

### Pattern 6: Sanitizing Stack Traces (Security)
**What:** Prevent sensitive data (passwords, connection strings, PII) from appearing in logs by filtering exception details

**When to use:** When logging exceptions that might contain database credentials or user data

**Example:**
```python
# middleware/error_handlers.py
import re

SENSITIVE_PATTERNS = [
    r'password[\'"]?\s*[:=]\s*[\'"]?([^\s\'"]+)',  # password= or password:
    r'Bearer\s+[A-Za-z0-9\-._~+/]+=*',  # Bearer tokens
    r'\b\d{3}-\d{2}-\d{4}\b',  # SSN pattern
    r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}',  # Email addresses
]

def sanitize_error_message(message: str) -> str:
    """Remove sensitive data from error messages."""
    sanitized = message
    for pattern in SENSITIVE_PATTERNS:
        sanitized = re.sub(pattern, '[REDACTED]', sanitized)
    return sanitized

@app.errorhandler(Exception)
def handle_unexpected_error(e: Exception):
    correlation_id = getattr(g, 'correlation_id', 'unknown')

    # Sanitize error message before logging
    safe_message = sanitize_error_message(str(e))

    logger.exception(
        f"Unexpected error: {safe_message}",
        correlation_id=correlation_id,
        error_type=type(e).__name__
    )

    return jsonify({"error": safe_message}), 500
```

**Source:** [Best Logging Practices for Safeguarding Sensitive Data](https://betterstack.com/community/guides/logging/sensitive-data/), [Scrubbing Sensitive Data - Sentry](https://docs.sentry.io/platforms/python/guides/logging/data-management/sensitive-data/)

### Anti-Patterns to Avoid

- **Catching Exception too broadly in routes:** Let global error handlers catch exceptions instead of try/except in every route. This reduces duplication and ensures consistent logging/response format.

- **Using stdlib logging with loguru:** Don't mix Python's stdlib logging with loguru - it creates configuration conflicts. Stick to loguru throughout the application.

- **Logging correlation ID manually:** Don't pass correlation_id as a parameter to every logger call. Use `logger.contextualize()` in middleware so it's automatically included in all logs within the request scope.

- **Putting business logic in error handlers:** Error handlers should only log and format responses, not contain business logic. Keep domain logic in services.

- **Exposing raw exceptions to clients:** Always sanitize error messages before returning to clients. Use `to_dict()` methods on custom exceptions to control what gets exposed.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSON log serialization | Custom JSON formatter for stdlib logging | loguru with `serialize=True` | Handles datetime serialization, exception formatting, nested objects automatically |
| Request ID generation | Custom UUID implementation | Python's `uuid.uuid4()` stdlib | RFC 4122 compliant, cryptographically random, no dependencies |
| Thread-safe context binding | Thread-local storage for correlation IDs | loguru's `contextualize()` | Uses contextvars for proper async/thread isolation, prevents leaks |
| Stack trace filtering | Manual frame filtering with traceback module | loguru's exception capture + sanitization filter | Handles complex exception chains, circular references, encoding issues |
| Error response serialization | Custom error formatter for each route | Domain exception `to_dict()` methods + global handlers | DRY principle, ensures consistent contract |

**Key insight:** Exception handling has many edge cases (exception chaining, circular references, encoding issues, thread safety). Using proven libraries like loguru eliminates entire classes of bugs that custom solutions encounter.

## Common Pitfalls

### Pitfall 1: Correlation ID Leaking Across Requests
**What goes wrong:** Using `logger.bind()` instead of `logger.contextualize()` in middleware causes correlation IDs to leak across requests in multi-threaded environments, resulting in logs from one request appearing with another request's correlation ID.

**Why it happens:** `logger.bind()` creates a child logger but doesn't provide thread isolation. In Flask with multiple threads (default), the bound logger can be shared across requests.

**How to avoid:** Always use `logger.contextualize()` in Flask middleware. It uses contextvars which are thread-safe and automatically scoped to the request lifecycle.

**Warning signs:**
- Same correlation ID appearing across multiple unrelated requests
- Correlation IDs from previous requests appearing in new requests
- Logs from different endpoints sharing the same correlation ID

**Source:** [Loguru Contextualize Documentation](https://loguru.readthedocs.io/en/stable/api/logger.html), [Context Propagation Guide](https://www.soumendrak.com/series/practical-observability-with-python/context-propagation/)

### Pitfall 2: Breaking the Error Response Contract
**What goes wrong:** Changing error response format from `{"error": string}` to something else (e.g., `{"message": string, "status": 404}`) breaks frontend assumptions and causes client errors.

**Why it happens:** When implementing new exception classes, developers might create new response formats without checking existing API contracts.

**How to avoid:**
1. Always use `{"error": string}` as the base response format (matches current contract)
2. Test that error responses haven't changed format using existing API tests
3. Document the contract in exception base class

**Warning signs:**
- Frontend displays "undefined" or raw JSON for errors
- API tests fail after implementing new exception handling
- Different error formats across different endpoints

**Source:** Current codebase analysis showing consistent `{"error": str(e)}` pattern

### Pitfall 3: Exposing Sensitive Data in Stack Traces
**What goes wrong:** Database connection strings with passwords, API keys, or PII appear in exception messages and get logged/returned to clients.

**Why it happens:**
- Database driver exceptions include connection details
- SQL query errors echo back user-provided input containing PII
- Exception chaining preserves sensitive data from lower layers

**How to avoid:**
1. Sanitize error messages before logging using regex patterns
2. Never log local variables in production (`logger.opt(exception=True)` without filters)
3. Create separate "internal message" (full details) vs "client message" (sanitized) in exceptions
4. Use `DatabaseConnectionError` wrapper that strips credentials from underlying driver errors

**Warning signs:**
- Passwords visible in log files
- Stack traces containing SQL with literal user data
- Connection strings in error responses

**Source:** [Best Logging Practices for Safeguarding Sensitive Data](https://betterstack.com/community/guides/logging/sensitive-data/), [Handling Sensitive Data in Python](https://mcginniscommawill.com/posts/2025-01-29-handling-sensitive-data/)

### Pitfall 4: Global Error Handler Order Matters
**What goes wrong:** Registering `@app.errorhandler(Exception)` before specific handlers causes it to catch everything, preventing specific handlers from running.

**Why it happens:** Flask error handler precedence follows registration order for same-level exceptions.

**How to avoid:**
1. Register specific exception handlers first (e.g., `DatasetNotFoundError`)
2. Register category handlers next (e.g., `LineageException`)
3. Register catch-all `Exception` handler last
4. Always check for `HTTPException` in the catch-all and pass through unchanged

**Warning signs:**
- Custom error handlers never execute
- All errors return 500 instead of correct status codes
- HTTPException handlers stop working

**Source:** [Flask Error Handling Documentation](https://flask.palletsprojects.com/en/stable/errorhandling/)

### Pitfall 5: Forgetting to Call logger.exception() vs logger.error()
**What goes wrong:** Using `logger.error()` instead of `logger.exception()` in exception handlers loses the full stack trace, making debugging impossible.

**Why it happens:** Both methods exist, but `logger.exception()` is specifically for exception contexts and automatically captures traceback.

**How to avoid:**
1. Always use `logger.exception()` inside `except` blocks
2. Use `logger.error()` only for non-exception errors
3. Use `logger.opt(exception=True)` for custom exception logging levels

**Warning signs:**
- Error logs show message but no stack trace
- "Exception occurred but no traceback available" in logs
- Unable to debug production errors due to missing context

**Source:** [Loguru Documentation](https://loguru.readthedocs.io/en/stable/api/logger.html)

## Code Examples

Verified patterns from official sources:

### Initializing Loguru in Flask Application
```python
# python_server.py
from loguru import logger
from utils.logging_config import configure_logging
from middleware.correlation_id import init_correlation_id_middleware
from middleware.error_handlers import register_error_handlers

def create_app():
    app = Flask(__name__)

    # Configure structured logging first
    configure_logging()

    # Configure CORS (existing)
    CORS(app, origins=[...])

    # Initialize middleware
    init_correlation_id_middleware(app)

    # Create database connection (existing)
    connection = get_db_connection()

    # Instantiate services (existing)
    # ...

    # Register error handlers AFTER services
    register_error_handlers(app)

    # Register Blueprints (existing)
    app.register_blueprint(health_bp)
    app.register_blueprint(openlineage_bp)

    return app
```

**Source:** [Loguru Flask Integration Gist](https://gist.github.com/M0r13n/0b8c62c603fdbc98361062bd9ebe8153)

### Wrapping teradatasql Exceptions
```python
# repositories/base.py
import teradatasql
from loguru import logger
from exceptions.domain import DatabaseConnectionError

class BaseRepository:
    def __init__(self, connection):
        self.connection = connection

    def _execute_query(self, query: str, params: list = None):
        """Execute query with proper exception wrapping."""
        try:
            with self.connection.cursor() as cur:
                cur.execute(query, params or [])
                return cur.fetchall()
        except teradatasql.OperationalError as e:
            raise DatabaseConnectionError(
                "Database operation failed",
                original_error=e
            )
        except teradatasql.ProgrammingError as e:
            raise DatabaseConnectionError(
                "SQL syntax or object error",
                original_error=e
            )
        except teradatasql.DatabaseError as e:
            raise DatabaseConnectionError(
                "Database error occurred",
                original_error=e
            )
```

**Source:** [Teradata Python Driver](https://github.com/Teradata/python-driver), [Python Database Error Handling](https://www.index.dev/blog/python-database-error-handling-try-except)

### Using Domain Exceptions in Services
```python
# services/dataset_service.py
from exceptions.domain import DatasetNotFoundError

class DatasetService:
    def get_dataset(self, dataset_id: str) -> dict:
        """
        Get a specific dataset with its fields.

        Raises:
            DatasetNotFoundError: If dataset not found
        """
        dataset = self.dataset_repo.get_dataset(dataset_id)
        if not dataset:
            raise DatasetNotFoundError(
                f"Dataset not found: {dataset_id}",
                details={"dataset_id": dataset_id}
            )
        return dataset
```

### Simplified Route Without Try/Except
```python
# routes/openlineage.py
# NO MORE try/except blocks - global handlers catch everything

@openlineage_bp.route("/datasets/<path:dataset_id>", methods=["GET"])
def get_dataset(dataset_id):
    """Get a specific dataset with its fields."""
    # Raises DatasetNotFoundError if not found - caught by global handler
    result = dataset_service.get_dataset(dataset_id)
    return jsonify(result)

@openlineage_bp.route("/lineage/<path:dataset_id>/<field_name>", methods=["GET"])
def get_column_lineage(dataset_id, field_name):
    """Get lineage graph for a dataset field."""
    direction = request.args.get("direction", "both")
    max_depth = int(request.args.get("maxDepth", "5"))

    # Raises DatasetNotFoundError or LineageTraversalError - caught by handlers
    result = lineage_service.get_column_lineage_graph(
        dataset_id, field_name, direction, max_depth
    )
    return jsonify(result)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| stdlib logging | loguru with JSON serialization | 2019+ | Simplified configuration, better performance, native JSON support |
| Manual correlation ID passing | contextvars with logger.contextualize() | Python 3.7+ (2018) | Thread-safe, automatic propagation, no manual parameter passing |
| per-route try/except | Global error handlers with domain exceptions | Flask 0.7+ (2010) | DRY principle, consistent error handling, reduced duplication |
| traceback.print_exc() | logger.exception() | Industry standard since 2015+ | Structured traces, searchable logs, integration with APM tools |
| Generic exceptions | Domain exception hierarchies | Best practice since 2010+ | Better error categorization, specific handling, clearer intent |

**Deprecated/outdated:**
- **flask-log-request-id:** Still works but designed for stdlib logging, not loguru. Custom middleware is simpler for loguru integration.
- **traceback.print_exc():** Outputs to stderr without structure. Modern approach uses `logger.exception()` which captures to structured logs with context.
- **Mixing stdlib logging + loguru:** Creates configuration conflicts and handler duplication. Pick one (loguru recommended).

## Open Questions

1. **Should we use flask-log-request-id or custom middleware?**
   - What we know: flask-log-request-id works but integrates with stdlib logging, not loguru. Custom middleware is ~15 lines and gives full control.
   - What's unclear: Whether the header compatibility features (X-Request-ID, X-Amzn-Trace-Id) are needed
   - Recommendation: Start with custom middleware for simplicity. Add flask-log-request-id later if header compatibility becomes a requirement.

2. **How aggressive should sanitization be?**
   - What we know: Need to filter passwords, emails, SSNs from logs. Too aggressive filtering makes debugging hard.
   - What's unclear: Whether to sanitize SQL queries (might contain PII in WHERE clauses) or just connection strings
   - Recommendation: Start with connection string/credential filtering only. Add SQL sanitization if compliance requires it. Use separate internal/client error messages.

3. **Should loguru file sink be enabled by default?**
   - What we know: Adding file sink with `rotation="100 MB"` and `retention="30 days"` is standard practice
   - What's unclear: Whether deployment environment (ClearScape, Docker, etc.) needs file logs or if stderr is sufficient
   - Recommendation: Start with stderr only (container-friendly). Add file sink later if persistent logs are needed and filesystem is available.

4. **What about teradatasql-specific exceptions?**
   - What we know: teradatasql defines OperationalError, ProgrammingError, IntegrityError following PEP-249
   - What's unclear: Whether to create separate domain exceptions for each type or wrap all as DatabaseConnectionError
   - Recommendation: Start with single DatabaseConnectionError wrapper that includes `original_error`. Specialize later if different handling is needed for query syntax vs connection errors.

## Sources

### Primary (HIGH confidence)
- [Loguru Official Documentation](https://loguru.readthedocs.io/en/stable/api/logger.html) - API reference for logger methods, contextualize(), serialize
- [Flask Official Error Handling Documentation](https://flask.palletsprojects.com/en/stable/errorhandling/) - Error handler patterns, HTTPException handling
- [Python Official traceback Documentation](https://docs.python.org/3/library/traceback.html) - Stack trace handling
- [Teradata Python Driver GitHub](https://github.com/Teradata/python-driver) - Exception types for teradatasql

### Secondary (MEDIUM confidence)
- [Better Stack: Complete Guide to Logging in Python with Loguru](https://betterstack.com/community/guides/logging/loguru/) - Structured logging patterns
- [Better Stack: Sensitive Data Logging Best Practices](https://betterstack.com/community/guides/logging/sensitive-data/) - Sanitization techniques
- [OneUpTime: How to Create Custom Exceptions in Python (2026)](https://oneuptime.com/blog/post/2026-01-22-create-custom-exceptions-python/view) - Exception hierarchy design
- [Soumendra Kumar Sahoo: Context Propagation with Loguru](https://www.soumendrak.com/series/practical-observability-with-python/context-propagation/) - contextualize() usage
- [Flask Middleware and Hooks Guide](https://itpathshaala.com/tutorials/flask/flask-middleware-and-hooks.html) - before_request/after_request patterns
- [Sentry Python: Scrubbing Sensitive Data](https://docs.sentry.io/platforms/python/guides/logging/data-management/sensitive-data/) - PII filtering

### Secondary (Verified with official sources)
- [PyPI: Flask-Log-Request-ID](https://pypi.org/project/Flask-Log-Request-ID/) - Request ID middleware reference
- [GitHub: Workable/flask-log-request-id](https://github.com/Workable/flask-log-request-id) - Implementation examples
- [Index.dev: Python Database Error Handling](https://www.index.dev/blog/python-database-error-handling-try-except) - DB exception patterns

### Tertiary (LOW confidence - from codebase analysis)
- Current error response contract: `{"error": string}` (observed in 12 routes)
- Current exception pattern: bare `Exception` catches with `traceback.print_exc()` (needs verification)
- teradatasql import confirmed in config.py

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - loguru is industry-standard, Flask error handlers are native, uuid is stdlib
- Architecture: HIGH - All patterns verified from official documentation with code examples
- Pitfalls: MEDIUM-HIGH - Based on documented issues and community experiences (correlation ID leaking, response contract breakage)
- Sanitization: MEDIUM - Best practices established but implementation details vary by compliance requirements

**Research date:** 2026-02-14
**Valid until:** 2026-03-15 (30 days - stable technology stack, minimal breaking changes expected)

**Key risk areas:**
- Ensure correlation ID doesn't leak across requests (use contextualize() not bind())
- Preserve `{"error": string}` response contract exactly (frontend depends on it)
- Don't expose database credentials or connection strings in logs
- Register error handlers in correct order (specific → general → catch-all)
