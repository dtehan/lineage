# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-01-29)

**Core value:** The lineage application must be secure and stable for production use - no data exposure through error messages, no unbounded resource consumption, and clear security boundaries documented.
**Current focus:** Phase 8 in progress - OpenLineage standard alignment

## Current Position

Phase: 8 of 8 (OpenLineage Standard Alignment)
Plan: 1 of 7 in current phase
Status: In progress
Last activity: 2026-01-30 - Completed 08-01-PLAN.md

Progress: v1.0 complete (6 phases, 13 plans) | v2.0 Phase 7: 3/3 [COMPLETE] | Phase 8: 1/7 plans
[=================.......] 17/23 plans (74%)

## Performance Metrics

**Velocity:**
- Total plans completed: 17
- Average duration: 4 min
- Total execution time: 57 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-error-handling-foundation | 3 | 9 min | 3 min |
| 02-credential-security | 1 | 12 min | 12 min |
| 03-input-validation | 2 | 7 min | 3.5 min |
| 04-pagination | 4 | 14 min | 3.5 min |
| 05-dbql-error-handling | 2 | 5 min | 2.5 min |
| 06-security-documentation | 1 | 2 min | 2 min |
| 07-environment-variable-consolidation | 3 | 5 min | 1.7 min |
| 08-open-lineage-standard-alignment | 1 | 3 min | 3 min |

**Recent Trend:**
- Last 5 plans: 07-01 (2 min), 07-02 (1 min), 07-03 (2 min), 08-01 (3 min)
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
- [04-04]: Show pagination only when total_count > limit (avoid UI clutter)
- [04-04]: Use data-testid attributes for pagination controls (enables reliable testing)
- [04-04]: Default page size of 100 matches backend default
- [07-01]: get_env() variadic helper for priority-order env var lookup
- [07-01]: TERADATA_* primary, TD_* legacy fallback ordering for database config
- [07-01]: API_PORT primary, PORT legacy fallback for Python server port
- [07-02]: bindLegacyFallback helper function for conditional env var binding in Go
- [07-02]: Check primary empty AND legacy non-empty before binding
- [07-02]: Place fallback bindings after defaults, before Config struct assignment
- [07-03]: Single consolidated environment variable table in documentation
- [07-03]: Inline deprecation notes rather than separate section
- [08-01]: OL_* table prefix for OpenLineage-aligned tables (clear distinction from LIN_*)
- [08-01]: Materialized column lineage in OL_COLUMN_LINEAGE (efficient graph queries)
- [08-01]: --openlineage and --openlineage-only CLI flags (backward compatibility)
- [08-01]: transformation_type + transformation_subtype columns (OpenLineage spec v2-0-2)
- [08-01]: OL_SCHEMA_VERSION table for spec version tracking

### Pending Todos

None yet.

### Roadmap Evolution

- Phase 7 added: Consolidate environment variables so that there is one set of variable for the Teradata connection for both the python scripts and the Go/Python server. The Go server PORT should be called the API_PORT
- Phase 8 added: The database LIN_ tables should align to the Open Lineage standard, as defined in openlineage.io web site, this will require changes to the database and scripts that populate the database, the API layer, and the GUI.

### Blockers/Concerns

None yet.

## Session Continuity

Last session: 2026-01-30
Stopped at: Completed 08-01-PLAN.md
Resume file: None
