# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-01-29)

**Core value:** The lineage application must be secure and stable for production use - no data exposure through error messages, no unbounded resource consumption, and clear security boundaries documented.
**Current focus:** Phase 5 - DBQL Error Handling (2 of 3 plans complete)

## Current Position

Phase: 5 of 6 (DBQL Error Handling)
Plan: 2 of 3 in current phase
Status: In progress - Plan 05-02 complete
Last activity: 2026-01-30 - Completed 05-02-PLAN.md (Continue-on-Failure and Data Validation)

Progress: [#########-] 94% (phases 1-4, 6 complete; phase 5 plan 2/3 complete)

## Performance Metrics

**Velocity:**
- Total plans completed: 12
- Average duration: 4 min
- Total execution time: 46 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-error-handling-foundation | 3 | 9 min | 3 min |
| 02-credential-security | 1 | 12 min | 12 min |
| 03-input-validation | 2 | 7 min | 3.5 min |
| 04-pagination | 3 | 11 min | 3.7 min |
| 05-dbql-error-handling | 2 | 5 min | 2.5 min |
| 06-security-documentation | 1 | 2 min | 2 min |

**Recent Trend:**
- Last 5 plans: 04-03 (5 min), 05-01 (2 min), 05-02 (3 min)
- Trend: Excellent velocity

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Init]: Document auth/rate limiting instead of implementing (assumes deployment behind auth proxy)
- [Init]: Fix one concern at a time with tests (ensures verifiability and atomic commits)
- [Init]: MaxDepth limit of 20 (prevents expensive recursive CTE queries)
- [Init]: Pagination page size of 100 (balanced between UI usability and API payload size)
- [01-01]: Use Go 1.21+ slog standard library (not external zerolog/zap)
- [01-01]: JSON handler with AddSource for file:line in logs
- [01-01]: CaptureStack limited to 10 frames to avoid excessive output
- [01-02]: Log errors server-side before sending generic response to client
- [01-02]: Include stack trace in all error logs for debugging
- [01-02]: Use static "Internal server error" message for all 500 responses
- [02-01]: Validate credentials at module import time, not at first use (fail fast)
- [02-01]: Support both TERADATA_PASSWORD and TD_PASSWORD for backwards compatibility
- [02-01]: Treat empty string passwords as missing (security)
- [03-01]: Manual validation over go-playground/validator - 2 params don't justify dependency
- [03-01]: Package-level validation vars with SetValidationConfig for handler init
- [03-01]: Defaults min=1, max=20, default=5 matching existing behavior
- [03-02]: Create validation.go in Task 1 since 03-01 did not actually create it
- [03-02]: Use newTestRequestWithRequestID helper for tests requiring request ID
- [01-03]: Comprehensive sensitivePatterns list covers DB driver errors, credentials, SQL, table names
- [01-03]: Table-driven test for all 8 handlers ensures uniform security coverage
- [06-01]: Document pattern generically without prescribing specific IdP
- [06-01]: Include copy-paste examples for Traefik, Nginx, and Kubernetes
- [06-01]: Provide verification checklist for DevOps deployment validation
- [04-01]: Pagination limit range 1-500 with default 100
- [04-01]: PaginationMeta uses pointer with omitempty for backward compatibility
- [04-01]: Paginated methods return (items, totalCount, error) tuple
- [04-02]: Service layer thin wrapper over repository pagination methods
- [04-02]: hasNext calculated as offset+limit < totalCount
- [04-02]: Table-driven tests cover validation and pagination metadata
- [04-03]: Return PaginatedResult<T> with data/pagination properties from hooks
- [04-03]: Use keepPreviousData from TanStack Query v5 for smooth transitions
- [04-03]: Provide Simple hook variants for backward compatibility
- [05-01]: Use Python stdlib logging with named logger 'dbql_extractor'
- [05-01]: Limit stored errors to 1000 entries, truncate messages to 200 chars
- [05-01]: Return Tuple[bool, str] from check_dbql_access for actionable errors
- [05-01]: Include fallback guidance to populate_lineage.py --manual
- [05-02]: Guard parser existence with hasattr before use in query loop
- [05-02]: Log progress every 1000 queries for visibility
- [05-02]: validate_dbql_data warns on NULL query_text and short queries (>10% under 20 chars)
- [05-02]: print_summary shows first 10 failed query details in verbose mode

### Pending Todos

None yet.

### Blockers/Concerns

None yet.

## Session Continuity

Last session: 2026-01-30
Stopped at: Completed 05-02-PLAN.md, ready for 05-03-PLAN.md
Resume file: None
