---
phase: 01-error-handling-foundation
plan: 01
subsystem: api
tags: [slog, logging, error-handling, request-id, chi-middleware]

# Dependency graph
requires: []
provides:
  - Structured JSON logging with slog
  - Stack trace capture for debugging
  - Request-scoped logging with request_id correlation
  - ErrorResponse struct with request_id for API responses
affects: [01-error-handling-foundation, secure-error-messages]

# Tech tracking
tech-stack:
  added: [log/slog (Go stdlib), runtime (Go stdlib)]
  patterns: [structured-logging, request-correlation, stack-trace-capture]

key-files:
  created:
    - lineage-api/internal/infrastructure/logging/logger.go
  modified:
    - lineage-api/internal/adapter/inbound/http/response.go
    - lineage-api/internal/adapter/inbound/http/handlers.go

key-decisions:
  - "Use Go 1.21+ slog standard library (not external zerolog/zap)"
  - "JSON handler with AddSource for file:line in logs"
  - "CaptureStack limited to 10 frames to avoid excessive output"

patterns-established:
  - "Logging: Use GetRequestLogger(ctx) for request-scoped logs with request_id"
  - "Error responses: Use ErrorResponse struct with Error and RequestID fields"
  - "Stack traces: Use CaptureStack() before logging errors for debugging"

# Metrics
duration: 3min
completed: 2026-01-30
---

# Phase 1 Plan 01: Error Handling Infrastructure Summary

**Structured slog JSON logger with stack trace capture and ErrorResponse with request ID for API error correlation**

## Performance

- **Duration:** 3 min
- **Started:** 2026-01-30T00:04:14Z
- **Completed:** 2026-01-30T00:07:07Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- Created structured JSON logger using Go's slog standard library with source file tracking
- Implemented CaptureStack() for capturing call stack traces (up to 10 frames)
- Added GetRequestLogger() for request-scoped logging with request_id pre-attached
- Updated ErrorResponse to include request_id for client-side error correlation
- Updated all 8 handler error calls to use new respondError signature

## Task Commits

Each task was committed atomically:

1. **Task 1: Create structured logger with slog and stack trace capture** - `df195d2` (feat)
2. **Task 2: Update error response format with request ID** - `a0e6c4c` (feat)
3. **Task 3: Update handler calls to use new respondError signature** - `175c498` (refactor)

## Files Created/Modified

- `lineage-api/internal/infrastructure/logging/logger.go` - New file: slog JSON logger with NewLogger, SetDefault, GetRequestLogger, CaptureStack
- `lineage-api/internal/adapter/inbound/http/response.go` - Added ErrorResponse struct, updated respondError to accept *http.Request
- `lineage-api/internal/adapter/inbound/http/handlers.go` - Updated 8 respondError calls to pass request parameter

## Decisions Made

- Used Go 1.21+ `log/slog` standard library instead of external logging packages (zerolog/zap) for simplicity and stdlib stability
- Set `AddSource: true` in slog HandlerOptions to include file:line in all log entries
- Limited CaptureStack to 10 frames maximum to prevent excessive log size
- Skipped first 3 frames in stack trace (runtime.Callers, CaptureStack, and caller) for cleaner output

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Pre-existing go vet issue in unrelated test file (`lineage_repo_test.go:13`) - not related to this plan's changes, build still passes

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Logger infrastructure ready for use in error handling (Plan 02 will add logging calls)
- ErrorResponse with request_id ready for secure error messages
- All handlers use new respondError signature, ready for message sanitization

---
*Phase: 01-error-handling-foundation*
*Completed: 2026-01-30*
