# Lineage Application - Production Readiness

## What This Is

A production-ready Teradata column-level data lineage application with security hardening, input validation, and scalability features. The application visualizes data flow between database columns with secure error handling, configurable validation bounds, and paginated asset browsing.

## Core Value

The lineage application must be secure and stable for production use - no data exposure through error messages, no unbounded resource consumption, and clear security boundaries documented.

## Requirements

### Validated

<!-- Capabilities delivered and verified -->

**Pre-existing features:**
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

**v1.0 Production Readiness (shipped 2026-01-30):**

*Input Validation:*
- ✓ **VALID-01**: API validates maxDepth parameter (1-20), returns 400 for invalid values — v1.0
- ✓ **VALID-02**: API validates direction parameter (upstream/downstream/both), returns 400 for invalid — v1.0
- ✓ **VALID-03**: Structured error responses with error code, message, request_id — v1.0
- ✓ **VALID-04**: Validation limits configurable via VALIDATION_MAX_DEPTH_LIMIT env vars — v1.0

*Security Hardening:*
- ✓ **SEC-01**: All default credentials removed; requires TERADATA_PASSWORD env var — v1.0
- ✓ **SEC-02**: Application fails fast at startup if credentials missing (exit code 1) — v1.0
- ✓ **SEC-03**: Database errors wrapped in generic "Internal server error" responses — v1.0
- ✓ **SEC-04**: Error responses never expose schema/SQL/connection details (18 pattern check) — v1.0
- ✓ **SEC-05**: Structured logging with log/slog captures error context with stack traces — v1.0
- ✓ **SEC-06**: Security documentation with auth proxy patterns, rate limiting, TLS/CORS requirements — v1.0

*Pagination:*
- ✓ **PAGE-01**: Asset endpoints support limit and offset query parameters — v1.0
- ✓ **PAGE-02**: Default page size 100, max 500; returns 400 for out-of-bounds — v1.0
- ✓ **PAGE-03**: Paginated responses include total_count, has_next, limit, offset metadata — v1.0
- ✓ **PAGE-04**: Database queries use OFFSET/FETCH NEXT at repository layer — v1.0
- ✓ **PAGE-05**: Frontend pagination hooks and UI controls (Pagination component) — v1.0

*DBQL Error Handling:*
- ✓ **DBQL-01**: DBQL extraction detects missing access with actionable error + fallback guidance — v1.0
- ✓ **DBQL-02**: Malformed queries logged and skipped without failing entire extraction — v1.0
- ✓ **DBQL-03**: Error logs include query_id, table_name, error_type for debugging — v1.0
- ✓ **DBQL-04**: Data validation checks completeness; summary reports succeeded/failed/skipped — v1.0

*Testing:*
- ✓ **TEST-01**: 80 validation tests cover edge cases (null, negative, strings, boundaries) — v1.0
- ✓ **TEST-02**: Integration tests verify no sensitive data in error responses — v1.0
- ✓ **TEST-03**: 6 tests verify startup fails with missing credentials — v1.0
- ✓ **TEST-04**: 20+ tests verify pagination bounds enforcement and metadata — v1.0
- ✓ **TEST-05**: 27 tests verify DBQL error handling for all failure modes — v1.0

### Active

<!-- Requirements for next milestone -->

**v2.0 High Priority Concerns:**
- [ ] **REDIS-01**: Integrate Redis caching or remove dead code
- [ ] **PARSER-01**: Improve SQL parser with confidence tracking and fallback visibility
- [ ] **GRAPH-01**: Validate lineage graph building correctness with complex patterns
- [ ] **EXTRACT-01**: Harden database extraction logic against Teradata version changes
- [ ] **E2E-01**: End-to-end lineage validation testing through multiple hops
- [ ] **CREDS-01**: Integrate with secrets vault (HashiCorp Vault, AWS Secrets Manager)

**Medium Priority Concerns:**
- [ ] **SEARCH-01**: Add secondary indexes for search performance
- [ ] **CTE-01**: Optimize recursive CTE performance for deep graphs
- [ ] **POOL-01**: Configure connection pooling (MaxOpenConns, MaxIdleConns, ConnMaxLifetime)
- [ ] **DEP-01**: Pin SQLGlot version with compatibility tests
- [ ] **REFRESH-01**: Implement selective lineage refresh from DBQL
- [ ] **PERF-01**: Large graph performance testing (100+ nodes)

### Out of Scope

<!-- Explicitly excluded -->

- Authentication/rate limiting middleware implementation — infrastructure-level handling via proxy/gateway (documented in SECURITY.md)
- Low priority concerns (SQL injection cleanup, test TC-EXT-009, driver selection, module pinning, audit logging, export features, cycle detection) — defer to backlog
- New features or UI enhancements beyond production hardening — focus on stability/security

## Context

**Current State (v1.0 shipped):**
- Production-ready Teradata column-level lineage application
- Go backend (1,200+ LOC added): Chi router, hexagonal architecture, slog logging, input validation
- React frontend (900+ LOC added): TypeScript, React Flow, pagination controls, TanStack Query hooks
- Python DBQL extraction (800+ LOC added): Continue-on-failure pattern, structured error tracking
- Test coverage: 73 database tests, 20 API tests, 396+ frontend tests (260 unit + 136 new), 21 E2E tests
- Security: Structured logging with stack traces, generic error responses (18 sensitive pattern check), fail-fast credential validation
- Scalability: Pagination (default 100, max 500), maxDepth limit (1-20 configurable)
- Documentation: SECURITY.md with auth proxy patterns, rate limiting guidance (Assets: 100/min, Search: 30/min, Impact: 20/min)

**Milestone v1.0 Stats:**
- 6 phases, 13 plans completed
- 72 files modified (+12,600 / -355 lines)
- 8 days (2026-01-21 → 2026-01-29)
- 136+ new tests (100% pass rate)
- Git range: `1b9ca2c` → `d281a13`

**Technical Debt:**
- Pagination bounds hardcoded (not configurable via env vars like validation bounds) — low priority, works correctly with defaults
- Phase 4 verification report shows gaps_found status but gap was closed in plan 04-04 — informational only

**Deployment Assumptions:**
- Application deployed behind authentication proxy or within internal network
- Rate limiting handled at infrastructure layer (API gateway, load balancer)
- Secrets management via environment variables with OS-level protection
- HTTPS/TLS 1.2+ with security headers (HSTS, X-Content-Type-Options, X-Frame-Options, etc.)

**Known Issues:**
- 6 high-priority concerns deferred to v2.0 (Redis integration, SQL parser improvements, graph correctness, extraction brittleness, E2E validation, secrets vault)
- 6 medium-priority concerns (search performance, CTE optimization, connection pooling, SQLGlot pinning, lineage refresh, large graph testing)

## Constraints

- **Backwards Compatibility**: Breaking changes acceptable; frontend and backend maintained together
- **Testing**: All requirements must have automated tests (unit/integration/E2E)
- **Approach**: Fix one concern at a time with atomic commits and focused plans
- **Performance**: maxDepth limited to 20 to prevent expensive recursive CTE queries (configurable via VALIDATION_MAX_DEPTH_LIMIT)
- **Scalability**: Pagination default page size of 100, max 500 (balanced for UI and API performance)
- **Security**: All errors must use generic responses; no sensitive data in error messages

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Document auth/rate limiting instead of implementing | Assumes deployment behind auth proxy or internal network; avoids premature security implementation | ✓ Complete - SECURITY.md provides deployment patterns (Traefik, Nginx, K8s examples) |
| Fix one concern at a time with tests | Ensures each fix is verifiable and atomic commits maintain clear history | ✓ Complete - 13 plans with 136+ tests |
| MaxDepth limit of 20 | Conservative limit prevents performance issues on large lineage graphs per CONCERNS.md guidance (20-50 range) | ✓ Complete - Configurable via VALIDATION_MAX_DEPTH_LIMIT |
| Pagination page size of 100 | Balanced between UI usability and API payload size; within CONCERNS.md guidance (50-500 range) | ✓ Complete - Default 100, max 500 enforced |
| Breaking changes acceptable | Simplifies fixes; frontend and backend maintained together in same repo | ✓ Complete - Frontend updated with backend changes (pagination DTOs, error types) |
| Fix order: error handling → security → validation → pagination → DBQL | Dependencies: logging infrastructure first, then credentials, then validation pattern, then scale features | ✓ Complete - Phases 1-6 followed dependency order |
| Use slog (Go 1.21+ stdlib) for logging | Standard library, future-proof, JSON structured logging with stack traces | ✓ Complete - All handlers use slog.ErrorContext with logging.CaptureStack() |
| Pagination bounds hardcoded (not env configurable) | Acceptable tech debt - system works correctly with safe defaults (100/500) | ⚠️ Tech Debt - Consider adding PAGINATION_MAX_LIMIT env vars for consistency with validation pattern |

---
*Last updated: 2026-01-30 after v1.0 milestone completion*
