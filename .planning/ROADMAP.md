# Roadmap: Lineage Data Lineage Application

## Overview

This roadmap transforms a functional but monolithic column-level lineage application into a maintainable, observable system with complete Impact Analysis capabilities. The journey moves through three sequential phases: (1) extracting shared lineage traversal logic and implementing Impact Analysis core, (2) establishing structured exception handling and logging infrastructure, and (3) consolidating duplicate SQL parsers with DBQL validation. Each phase delivers independently verifiable capabilities while maintaining backward compatibility with 73 database tests, 20 API tests, and the existing frontend.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Foundation Refactoring & Impact Analysis Core** - Extract repository layer, implement service pattern, deliver Impact Analysis feature
- [ ] **Phase 2: Exception Handling & Observability** - Replace bare exception handlers with structured logging and middleware
- [ ] **Phase 3: SQL Parser Consolidation & DBQL Validation** - Consolidate duplicate parsers, validate DBQL extraction, display truncation warnings

## Phase Details

### Phase 1: Foundation Refactoring & Impact Analysis Core
**Goal**: Users can view downstream impact for column changes with depth indicators and asset counts, powered by refactored backend with shared lineage traversal logic
**Depends on**: Nothing (first phase)
**Requirements**: ARCH-01, ARCH-02, ARCH-03, ARCH-04, ARCH-05, ARCH-06, IMPACT-01, IMPACT-02, IMPACT-03, IMPACT-04, IMPACT-05, IMPACT-06, IMPACT-07
**Success Criteria** (what must be TRUE):
  1. User can view downstream impact list showing all affected tables and columns when selecting any column
  2. User can distinguish between direct dependencies (depth 1) and indirect dependencies (depth 2+) with visual depth indicators
  3. User sees column-level impact counts per affected table (e.g., "3 columns affected in DIM_CUSTOMER")
  4. User sees affected asset count summary at top of impact view (e.g., "5 tables, 12 columns, 2 databases impacted")
  5. Backend recursive CTE logic for lineage traversal exists in exactly one place (repository layer) and is reused by all endpoints (column/table/database lineage and impact analysis)
**Plans:** 5 plans

Plans:
- [ ] 01-01-PLAN.md -- Extract repository layer (config, base repo, LineageRepository, DatasetRepository)
- [ ] 01-02-PLAN.md -- Implement service layer and refactor python_server.py into Flask Blueprints
- [ ] 01-03-PLAN.md -- Add Impact Analysis API endpoint and update backend API tests
- [ ] 01-04-PLAN.md -- Implement Impact Analysis frontend UI with TanStack Table
- [ ] 01-05-PLAN.md -- Add frontend unit tests and end-to-end verification

### Phase 2: Exception Handling & Observability
**Goal**: All API errors produce structured logs with correlation IDs and preserve frontend error response contract
**Depends on**: Phase 1
**Requirements**: EXCEPT-01, EXCEPT-02, EXCEPT-03, EXCEPT-04, EXCEPT-05, EXCEPT-06
**Success Criteria** (what must be TRUE):
  1. System uses domain exception classes (DatasetNotFoundError, LineageTraversalError, DatabaseConnectionError) instead of bare Exception catches
  2. All errors produce JSON log entries with correlation IDs via loguru logger
  3. All traceback.print_exc() calls replaced with logger.exception() calls that capture full context
  4. Frontend receives errors in exact same format as before ({"error": string} schema) for all API endpoints
  5. Every API request has a correlation ID that appears in logs and error responses for tracing
**Plans**: TBD

Plans:
(To be defined during planning)

### Phase 3: SQL Parser Consolidation & DBQL Validation
**Goal**: Single SQL parser module validates DBQL extraction and UI displays view truncation warnings
**Depends on**: Phase 2
**Requirements**: CLEANUP-01, CLEANUP-02, CLEANUP-03, CLEANUP-04, CLEANUP-05
**Success Criteria** (what must be TRUE):
  1. SQL parser code exists in lineage-api/utils/sql_parser.py only (duplicate in database/archive/ removed)
  2. All imports (populate_lineage.py and related scripts) reference the consolidated parser location
  3. DBQL extraction produces same record counts before and after consolidation (regression validation passes)
  4. User sees warning messages in UI when view SQL is truncated in Teradata metadata
**Plans**: TBD

Plans:
(To be defined during planning)

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation Refactoring & Impact Analysis Core | 0/5 | Planning complete | - |
| 2. Exception Handling & Observability | 0/TBD | Not started | - |
| 3. SQL Parser Consolidation & DBQL Validation | 0/TBD | Not started | - |

---
*Roadmap created: 2026-02-14*
*Last updated: 2026-02-14*
