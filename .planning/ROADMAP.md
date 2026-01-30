# Roadmap: Lineage Application Production Hardening

## Overview

This roadmap hardens an existing Teradata column-level lineage application for production deployment by addressing critical security vulnerabilities, input validation gaps, and scalability concerns. The work progresses from foundational error handling (preventing information leakage), through credential security and input validation (preventing unauthorized access and resource exhaustion), to pagination (enabling scale), DBQL error handling (batch process resilience), and finally security documentation (deployment guidance). Each phase builds on the previous, with tests integrated into each phase rather than deferred.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Error Handling Foundation** - Wrap database errors in generic responses, establish structured logging
- [x] **Phase 2: Credential Security** - Remove default credentials, fail fast on missing config
- [x] **Phase 3: Input Validation** - Validate maxDepth and direction parameters with bounds enforcement
- [ ] **Phase 4: Pagination** - Implement limit/offset pagination for asset listing endpoints
- [ ] **Phase 5: DBQL Error Handling** - Graceful extraction failures with detailed logging
- [ ] **Phase 6: Security Documentation** - Document authentication and rate limiting deployment requirements

## Phase Details

### Phase 1: Error Handling Foundation
**Goal**: API responses never expose internal database details; all errors are logged with context for debugging
**Depends on**: Nothing (first phase)
**Requirements**: SEC-03, SEC-04, SEC-05, TEST-02
**Success Criteria** (what must be TRUE):
  1. API returns generic error message (e.g., "Internal server error") when database query fails
  2. Error responses contain request ID but no SQL, table names, or connection details
  3. Server logs include full error details with request ID, timestamp, and stack trace
  4. Integration tests verify error responses contain no database schema information
**Plans**: 3 plans in 2 waves

Plans:
- [x] 01-01-PLAN.md - Create error handling infrastructure (logger + response format)
- [x] 01-02-PLAN.md - Update handlers with secure error handling
- [x] 01-03-PLAN.md - Create error response security tests

### Phase 2: Credential Security
**Goal**: Application requires explicit credential configuration and fails immediately if missing
**Depends on**: Phase 1
**Requirements**: SEC-01, SEC-02, TEST-03
**Success Criteria** (what must be TRUE):
  1. No default credentials exist in source code (db_config.py cleaned)
  2. Application exits with clear error message if TERADATA_PASSWORD environment variable is missing
  3. Startup validation checks all required environment variables before accepting requests
  4. Tests verify application fails to start when credentials are missing
**Plans**: 1 plan in 1 wave

Plans:
- [x] 02-01-PLAN.md - Remove default credentials and add fail-fast validation

### Phase 3: Input Validation
**Goal**: All user-supplied parameters are validated with bounds enforcement and clear error messages
**Depends on**: Phase 1
**Requirements**: VALID-01, VALID-02, VALID-03, VALID-04, TEST-01
**Success Criteria** (what must be TRUE):
  1. API returns 400 Bad Request when maxDepth is less than 1 or greater than 20
  2. API returns 400 Bad Request when direction is not "upstream", "downstream", or "both"
  3. Validation error responses include error code, descriptive message, and request ID
  4. Validation limits (maxDepth, page size) are configurable via environment variables
  5. Unit tests cover edge cases: null, negative numbers, strings, boundary values
**Plans**: 2 plans in 2 waves

Plans:
- [x] 03-01-PLAN.md - Create validation infrastructure (config + validation module)
- [x] 03-02-PLAN.md - Update handlers with validation and add unit tests

### Phase 4: Pagination
**Goal**: Asset listing endpoints return paginated results with metadata for efficient navigation
**Depends on**: Phase 1, Phase 3
**Requirements**: PAGE-01, PAGE-02, PAGE-03, PAGE-04, PAGE-05, TEST-04
**Success Criteria** (what must be TRUE):
  1. Asset endpoints accept limit and offset query parameters
  2. Default page size is 100; requests for limit > 500 return 400 Bad Request
  3. Paginated responses include total_count, has_next, and current page info
  4. Database queries use LIMIT/OFFSET at repository layer
  5. Frontend loads additional pages when scrolling or navigating
**Plans**: 3 plans in 2 waves

Plans:
- [ ] 04-01-PLAN.md - Create pagination infrastructure (validation, DTOs, interfaces, mocks)
- [ ] 04-02-PLAN.md - Implement pagination in repository, service, handlers with tests
- [ ] 04-03-PLAN.md - Update frontend hooks with pagination support

### Phase 5: DBQL Error Handling
**Goal**: DBQL extraction continues processing after individual failures with detailed error logging
**Depends on**: Phase 1
**Requirements**: DBQL-01, DBQL-02, DBQL-03, DBQL-04, TEST-05
**Success Criteria** (what must be TRUE):
  1. Extraction detects missing DBQL access and displays clear error message with fallback guidance
  2. Malformed queries in DBQL are logged and skipped without failing entire extraction
  3. Error logs include query ID, table name, and error type for failed extractions
  4. Extraction reports summary at completion (X succeeded, Y failed, Z skipped)
**Plans**: 2 plans in 2 waves

Plans:
- [ ] 05-01-PLAN.md - Add logging infrastructure and ExtractionStats class
- [ ] 05-02-PLAN.md - Implement continue-on-failure error handling and tests

### Phase 6: Security Documentation
**Goal**: Deployment documentation explains authentication and rate limiting requirements
**Depends on**: Phase 1, Phase 2, Phase 3
**Requirements**: SEC-06
**Success Criteria** (what must be TRUE):
  1. Security documentation describes authentication proxy deployment pattern
  2. Documentation includes rate limiting recommendations (requests per minute, per IP)
  3. CORS, TLS, and other security header requirements are documented
**Plans**: 1 plan in 1 wave

Plans:
- [ ] 06-01-PLAN.md - Create comprehensive security deployment documentation

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Error Handling Foundation | 3/3 | ✓ Complete | 2026-01-30 |
| 2. Credential Security | 1/1 | ✓ Complete | 2026-01-29 |
| 3. Input Validation | 2/2 | ✓ Complete | 2026-01-29 |
| 4. Pagination | 0/3 | Planned | - |
| 5. DBQL Error Handling | 0/2 | Planned | - |
| 6. Security Documentation | 0/1 | Planned | - |
