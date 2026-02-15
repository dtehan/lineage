---
status: diagnosed
phase: 02-exception-handling-observability
source:
  - 02-01-SUMMARY.md
  - 02-02-SUMMARY.md
  - 02-03-SUMMARY.md
started: 2026-02-15T08:30:00Z
updated: 2026-02-15T08:40:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Correlation ID in API Response Headers
expected: When making any API request (e.g., GET /api/v2/openlineage/namespaces), the response should include an X-Correlation-ID header with a UUID value
result: pass

### 2. Unique Correlation ID Per Request
expected: Making multiple API requests should produce different correlation IDs for each request
result: pass

### 3. Not Found Error Response Format
expected: Requesting a non-existent dataset (e.g., /api/v2/openlineage/datasets/999999) should return 404 status with {"error": "Dataset not found"} JSON format
result: pass

### 4. Internal Error Response Format
expected: When an internal error occurs, API should return 500 status with {"error": "..."} JSON format (message should not expose sensitive details)
result: pass

### 5. Search Query Validation
expected: Searching with a query shorter than 2 characters should return a validation error (400 status)
result: pass

### 6. JSON Structured Logs
expected: Backend logs should be in JSON format with fields like time, level, message, and correlation_id (viewable in terminal where server runs)
result: issue
reported: "we should be sending the logs to stdout and to a file"
severity: major

### 7. Sensitive Data Sanitization in Error Messages
expected: Error messages should not contain passwords or tokens (e.g., "password=secret" should appear as "password=[REDACTED]")
result: pass

## Summary

total: 7
passed: 6
issues: 1
pending: 0
skipped: 0

## Gaps

- truth: "Backend logs should be in JSON format to stdout and a file"
  status: failed
  reason: "User reported: we should be sending the logs to stdout and to a file"
  severity: major
  test: 6
  root_cause: "Logging configuration deliberately designed for stderr-only during Phase 02-01 based on research decision to defer file logging. Implementation uses print() which goes to stdout (not stderr as documented), but lacks file sink entirely."
  artifacts:
    - path: "lineage-api/utils/logging_config.py"
      issue: "Lines 36-41 need dual sinks (stdout + file) instead of single print() sink"
    - path: "lineage-api/utils/logging_config.py"
      issue: "Docstrings (lines 1-11, 17-30) incorrectly claim stderr output"
  missing:
    - "Add sys.stdout sink with JSON serialization"
    - "Add file sink with rotation/retention (location TBD: logs/lineage-api.json or environment variable)"
    - "Configuration decision: file path, rotation policy (100 MB suggested), retention (30 days suggested)"
  debug_session: "gsd-debugger agent a431fbb"
