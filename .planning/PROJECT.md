# Lineage Application - Production Readiness

## What This Is

Addressing 7 critical production-blocking concerns in the Teradata column-level data lineage application. This project fixes input validation vulnerabilities, security exposures, and scalability issues to make the lineage application safe for production deployment.

## Core Value

The lineage application must be secure and stable for production use - no data exposure through error messages, no unbounded resource consumption, and clear security boundaries documented.

## Requirements

### Validated

<!-- Existing capabilities delivered by the current codebase -->

- ✓ Column-level data lineage visualization with React Flow — existing
- ✓ Recursive CTE-based upstream/downstream lineage traversal — existing
- ✓ Asset browser with hierarchical database/table/column navigation — existing
- ✓ Search functionality across databases, tables, and columns — existing
- ✓ Impact analysis showing downstream dependencies — existing
- ✓ REST API with Chi router following hexagonal architecture — existing
- ✓ Teradata repository with connection management — existing
- ✓ DBQL-based automated lineage extraction — existing
- ✓ Manual lineage mapping capability — existing
- ✓ Frontend with TypeScript, Vite, TanStack Query, Zustand — existing
- ✓ Database test suite (73 tests) — existing
- ✓ Frontend unit tests (260+) and E2E tests (21) — existing

### Active

<!-- Critical production blockers to fix -->

- [ ] **VALID-01**: Input validation - maxDepth parameter bounded to maximum of 20
- [ ] **VALID-02**: Input validation - direction parameter validated against whitelist (upstream/downstream/both)
- [ ] **SEC-01**: Remove default credentials from db_config.py, require TERADATA_PASSWORD environment variable
- [ ] **SEC-02**: Wrap database errors in generic responses, log detailed errors server-side only
- [ ] **SEC-03**: Document authentication and rate limiting deployment requirements
- [ ] **SCALE-01**: Implement pagination for asset listing endpoints (limit/offset with default page size 100)
- [ ] **DBQL-01**: Add comprehensive error handling for DBQL extraction edge cases

### Out of Scope

<!-- Deferred to future milestones -->

- High priority concerns (Redis integration, SQL parser improvements, graph building correctness, extraction brittleness, E2E lineage validation, credential encryption) — defer to next milestone
- Medium priority concerns (search performance, CTE performance, connection pooling, SQLGlot pinning, lineage refresh, large graph testing) — defer to future
- Low priority concerns (SQL injection cleanup, test TC-EXT-009, driver selection, module pinning, audit logging, export features, cycle detection) — defer to backlog
- Authentication/rate limiting middleware implementation — document assumptions instead, proxy-based auth assumed
- New features or UI enhancements — focus on production readiness only

## Context

**Existing System:**
- Functional Teradata column-level lineage application with Go backend (Chi router, hexagonal architecture) and React frontend (TypeScript, React Flow, ELKjs)
- Comprehensive test coverage: 73 database tests, 20 API tests, 260+ frontend unit tests, 21 E2E tests
- Documented codebase map in `.planning/codebase/` including architecture, stack, conventions, concerns
- Supports both manual lineage mappings and DBQL-based automated extraction
- Currently works for demo/development but has 32 documented concerns blocking production use

**Codebase Analysis:**
- 32 concerns identified across Critical (7), High (6), Medium (6), Low (13) priorities
- Critical concerns focus on input validation, security, and scalability
- Most concerns have clear fix approaches documented in CONCERNS.md

**Deployment Assumptions:**
- Application deployed behind authentication proxy or within internal network
- Rate limiting handled at infrastructure layer (API gateway, load balancer)
- Secrets management via environment variables with OS-level protection

## Constraints

- **Backwards Compatibility**: Breaking changes acceptable; frontend will be updated to match API changes
- **Testing**: Must write tests for each fix (unit/integration tests to verify correctness)
- **Approach**: Fix one concern at a time with atomic commits
- **Performance**: maxDepth limited to 20 to prevent expensive recursive CTE queries
- **Scalability**: Pagination default page size of 100 items (balanced for UI and API performance)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Document auth/rate limiting instead of implementing | Assumes deployment behind auth proxy or internal network; avoids premature security implementation | — Pending |
| Fix one concern at a time with tests | Ensures each fix is verifiable and atomic commits maintain clear history | — Pending |
| MaxDepth limit of 20 | Conservative limit prevents performance issues on large lineage graphs per CONCERNS.md guidance (20-50 range) | — Pending |
| Pagination page size of 100 | Balanced between UI usability and API payload size; within CONCERNS.md guidance (50-500 range) | — Pending |
| Breaking changes acceptable | Simplifies fixes; frontend and backend maintained together in same repo | — Pending |
| Suggested fix order: validation → security → pagination → DBQL | Dependencies: validation enables safer queries, security prevents data leaks, pagination handles scale, DBQL needs validation/error handling in place | — Pending |

---
*Last updated: 2026-01-29 after initialization*
