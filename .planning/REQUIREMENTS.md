# Requirements: Lineage Application Production Hardening

**Defined:** 2026-01-29
**Core Value:** The lineage application must be secure and stable for production use - no data exposure through error messages, no unbounded resource consumption, and clear security boundaries documented.

## v1 Requirements

Requirements for production hardening. Each maps to roadmap phases.

### Input Validation

- [x] **VALID-01**: API validates maxDepth parameter is integer between 1 and 20, returns 400 Bad Request for invalid values (Phase 3)
- [x] **VALID-02**: API validates direction parameter is one of "upstream", "downstream", or "both", returns 400 Bad Request for invalid values (Phase 3)
- [x] **VALID-03**: API returns structured error response with error code, message, and request ID for all validation failures (Phase 3)
- [x] **VALID-04**: Validation limits are configurable via environment variables with documented defaults (Phase 3)

### Security Hardening

- [x] **SEC-01**: Remove all default credentials from source code; require TERADATA_PASSWORD environment variable (Phase 2)
- [x] **SEC-02**: Application fails fast at startup if required credentials are missing (no silent fallback to defaults) (Phase 2)
- [ ] **SEC-03**: API wraps all database errors in generic error responses; detailed errors logged server-side only
- [ ] **SEC-04**: Error responses never expose database schema, table names, SQL syntax, or connection details
- [ ] **SEC-05**: Structured logging with log/slog captures error context (request ID, user context, timestamp) for debugging
- [x] **SEC-06**: Security documentation describes authentication/rate limiting deployment requirements and assumptions (Phase 6)

### Pagination

- [ ] **PAGE-01**: Asset listing endpoints (databases, tables, columns) support limit and offset query parameters
- [ ] **PAGE-02**: Default page size is 100; maximum page size is 500; API returns 400 for values outside bounds
- [ ] **PAGE-03**: Paginated responses include metadata: total count, has_next boolean, current page info
- [ ] **PAGE-04**: Backend repositories implement pagination with LIMIT/OFFSET at database layer
- [ ] **PAGE-05**: Frontend updates to handle paginated responses and load additional pages as needed

### DBQL Error Handling

- [ ] **DBQL-01**: DBQL extraction detects missing DBQL access and provides clear error message with fallback guidance
- [ ] **DBQL-02**: Extraction handles malformed queries in DBQL gracefully (log and skip, don't fail entire extraction)
- [ ] **DBQL-03**: Partial extraction failures logged with specific error context (query ID, table name, error type)
- [ ] **DBQL-04**: Extraction validates DBQL data completeness (row counts, null checks) and reports anomalies

### Testing

- [x] **TEST-01**: Unit tests verify maxDepth and direction validation with edge cases (null, negative, string values) (Phase 3)
- [ ] **TEST-02**: Integration tests verify error responses never expose internal details
- [x] **TEST-03**: Tests verify application startup fails with missing credentials (no silent fallback) (Phase 2)
- [ ] **TEST-04**: Tests verify pagination bounds enforcement and metadata correctness
- [ ] **TEST-05**: Tests verify DBQL error handling for missing access and malformed queries

## v2 Requirements

Deferred to future milestones.

### High Priority Concerns

- **REDIS-01**: Integrate Redis caching or remove dead code
- **PARSER-01**: Improve SQL parser with confidence tracking and fallback visibility
- **GRAPH-01**: Validate lineage graph building correctness with complex patterns
- **EXTRACT-01**: Harden database extraction logic against Teradata version changes
- **E2E-01**: End-to-end lineage validation testing through multiple hops
- **CREDS-01**: Integrate with secrets vault (HashiCorp Vault, AWS Secrets Manager)

### Medium Priority Concerns

- **SEARCH-01**: Add secondary indexes for search performance
- **CTE-01**: Optimize recursive CTE performance for deep graphs
- **POOL-01**: Configure connection pooling (MaxOpenConns, MaxIdleConns, ConnMaxLifetime)
- **DEP-01**: Pin SQLGlot version with compatibility tests
- **REFRESH-01**: Implement selective lineage refresh from DBQL
- **PERF-01**: Large graph performance testing (100+ nodes)

## Out of Scope

Explicitly excluded from this milestone.

| Feature | Reason |
|---------|--------|
| Authentication middleware implementation | Assumes deployment behind auth proxy; document assumptions only per SEC-06 |
| Rate limiting implementation | Infrastructure-level rate limiting (API gateway) preferred; document in SEC-06 |
| Low priority concerns (13 items) | Not blocking production; defer to backlog |
| New features or UI enhancements | Focus on production hardening only |
| Backwards compatibility preservation | Breaking changes acceptable; will update frontend simultaneously |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| VALID-01 | Phase 3 | Pending |
| VALID-02 | Phase 3 | Pending |
| VALID-03 | Phase 3 | Pending |
| VALID-04 | Phase 3 | Pending |
| SEC-01 | Phase 2 | Pending |
| SEC-02 | Phase 2 | Pending |
| SEC-03 | Phase 1 | Complete |
| SEC-04 | Phase 1 | Complete |
| SEC-05 | Phase 1 | Complete |
| SEC-06 | Phase 6 | Complete |
| PAGE-01 | Phase 4 | Pending |
| PAGE-02 | Phase 4 | Pending |
| PAGE-03 | Phase 4 | Pending |
| PAGE-04 | Phase 4 | Pending |
| PAGE-05 | Phase 4 | Pending |
| DBQL-01 | Phase 5 | Complete |
| DBQL-02 | Phase 5 | Complete |
| DBQL-03 | Phase 5 | Complete |
| DBQL-04 | Phase 5 | Complete |
| TEST-01 | Phase 3 | Pending |
| TEST-02 | Phase 1 | Complete |
| TEST-03 | Phase 2 | Pending |
| TEST-04 | Phase 4 | Pending |
| TEST-05 | Phase 5 | Complete |

**Coverage:**
- v1 requirements: 24 total
- Mapped to phases: 24
- Unmapped: 0

---
*Requirements defined: 2026-01-29*
*Last updated: 2026-01-29 after roadmap creation*
