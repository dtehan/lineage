---
phase: 02-exception-handling-observability
plan: 01
subsystem: exception-handling, logging
tags: [foundation, observability, error-handling]
dependency_graph:
  requires: []
  provides:
    - Exception hierarchy (LineageException, DatasetNotFoundError, LineageTraversalError, DatabaseConnectionError)
    - Structured logging configuration (loguru)
    - Sanitization utilities (sanitize_error_message)
  affects: []
tech_stack:
  added:
    - loguru: ">=0.7.3"
  patterns:
    - Exception hierarchy with HTTP status codes
    - Structured JSON logging to stderr
    - Sensitive data sanitization via regex patterns
key_files:
  created:
    - lineage-api/exceptions/__init__.py
    - lineage-api/exceptions/base.py
    - lineage-api/exceptions/domain.py
    - lineage-api/utils/__init__.py
    - lineage-api/utils/logging_config.py
    - lineage-api/utils/sanitize.py
  modified:
    - requirements.txt
decisions:
  - title: "Exception hierarchy with status_code attribute"
    rationale: "Allows middleware (Plan 02) to map exceptions to correct HTTP responses"
    alternatives: "HTTP exceptions directly in Flask - rejected for separation of concerns"
  - title: "to_dict() returns only {\"error\": string}"
    rationale: "Preserves existing API contract exactly; details stored but not exposed to clients"
    alternatives: "Include details in response - rejected to avoid leaking sensitive info"
  - title: "Sanitization via regex patterns at module level"
    rationale: "Compiled patterns for performance; conservative filtering of passwords/tokens only"
    alternatives: "Aggressive filtering - rejected to avoid false positives in error messages"
  - title: "loguru with JSON serialization to stderr only"
    rationale: "Container-friendly; structured logs for observability platforms; no file I/O overhead"
    alternatives: "File-based logging - rejected per research open question #3"
metrics:
  duration_minutes: 2.3
  tasks_completed: 2
  files_created: 7
  files_modified: 1
  commits: 2
  completed_at: "2026-02-15T01:43:38Z"
---

# Phase 02 Plan 01: Foundation - Exception Hierarchy and Logging Summary

**One-liner:** Created exception hierarchy with HTTP status codes, configured loguru for JSON logging, and built sanitization utility for sensitive data filtering.

## What Was Built

This plan established the foundational modules for exception handling, logging, and data sanitization that subsequent plans in Phase 02 will integrate into the Flask application.

### Exception Hierarchy

Created a three-tier exception hierarchy:

1. **LineageException (base.py)** - Base class with `message`, `status_code`, and `details` attributes. The `to_dict()` method returns `{"error": string}` format to preserve the existing API contract.

2. **Domain Exceptions (domain.py)**:
   - `DatasetNotFoundError` (404) - Replaces current `ValueError` pattern for "not found" cases
   - `LineageTraversalError` (500) - For CTE failures and graph traversal errors
   - `DatabaseConnectionError` (500) - Wraps teradatasql exceptions with `original_error` storage (not exposed to clients)

3. **Public API (\_\_init\_\_.py)** - Re-exports all exceptions for convenient imports

### Structured Logging

Configured loguru for production-ready structured logging:

- **JSON serialization** to stderr for container-friendly deployment
- **Simple format:** `{time} {level} {message}`
- **INFO level** default
- **No file sinks** - stderr only per research findings

### Sanitization Utility

Built `sanitize_error_message()` function with compiled regex patterns for performance:

- Strips password key-value pairs (`password=secret` → `password=[REDACTED]`)
- Removes Bearer tokens (`Bearer abc123` → `Bearer [REDACTED]`)
- Sanitizes connection strings (`user:pass@host` → `user:[REDACTED]@host`)
- Conservative approach - only filters clearly sensitive patterns

## Verification Results

All verification checks passed:

1. Exception hierarchy imports work with correct status codes (404 for DatasetNotFoundError, 500 for others)
2. `to_dict()` returns `{"error": string}` format without exposing internal details
3. Logging configuration produces JSON output to stderr
4. Sanitization strips password patterns while preserving normal text
5. `loguru>=0.7.3` added to requirements.txt
6. All module files created and importable

## Deviations from Plan

None - plan executed exactly as written.

## Commits

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 | Create exception hierarchy and sanitization utility | 89a5646 | exceptions/\_\_init\_\_.py, exceptions/base.py, exceptions/domain.py, utils/\_\_init\_\_.py, utils/sanitize.py |
| 2 | Configure loguru structured logging and add dependency | 2565b2d | requirements.txt, utils/logging_config.py |

## Integration Notes

These modules are **not yet wired into the running application**. They are standalone utilities that will be integrated in:

- **Plan 02-02**: Flask middleware to catch exceptions and use error handlers
- **Plan 02-03**: Service layer updates to raise domain exceptions instead of ValueError
- **Plan 02-04**: Logging integration for request/response tracking

## Testing Strategy

Unit-level verification performed via Python imports and inline assertions. No test files added at this stage because:

1. These are simple utility modules with no external dependencies
2. Verification commands in plan provide sufficient coverage
3. Integration tests in Plan 02-02 will validate middleware integration

## Self-Check: PASSED

**Created files exist:**
```
FOUND: lineage-api/exceptions/__init__.py
FOUND: lineage-api/exceptions/base.py
FOUND: lineage-api/exceptions/domain.py
FOUND: lineage-api/utils/__init__.py
FOUND: lineage-api/utils/logging_config.py
FOUND: lineage-api/utils/sanitize.py
```

**Modified files exist:**
```
FOUND: requirements.txt (contains loguru>=0.7.3)
```

**Commits exist:**
```
FOUND: 89a5646 (feat(02-01): create exception hierarchy and sanitization utility)
FOUND: 2565b2d (feat(02-01): configure loguru structured logging)
```
