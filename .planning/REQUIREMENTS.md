# Requirements: Lineage Data Lineage Application

**Defined:** 2026-02-13
**Core Value:** Enable accurate impact analysis for database changes by visualizing complete column-level lineage across Teradata databases

## v1 Requirements

Requirements for milestone v1.0. Each maps to roadmap phases.

### Impact Analysis

- [ ] **IMPACT-01**: User can view downstream impact list for a selected column
- [ ] **IMPACT-02**: User can distinguish direct vs indirect dependencies with depth indicators
- [ ] **IMPACT-03**: User can see column-level impact counts per affected table
- [ ] **IMPACT-04**: User can see affected asset count summary (tables/columns/databases impacted)
- [ ] **IMPACT-05**: System reuses existing recursive CTE lineage traversal (no duplicate cycle detection)
- [ ] **IMPACT-06**: System enforces maxDepth limits for query performance
- [ ] **IMPACT-07**: Impact Analysis UI uses TanStack Table for data display

### Backend Architecture

- [ ] **ARCH-01**: Repository layer extracts shared recursive CTE functions
- [ ] **ARCH-02**: Service layer organizes business logic (lineage_service, dataset_service, impact_service)
- [ ] **ARCH-03**: Flask blueprints replace direct route handlers in python_server.py
- [ ] **ARCH-04**: All existing `/api/v2/openlineage/*` endpoints maintain backward compatibility
- [ ] **ARCH-05**: 73 database tests pass after repository extraction
- [ ] **ARCH-06**: 20 API tests pass after service layer extraction

### Exception Handling

- [ ] **EXCEPT-01**: Domain exception classes defined (DatasetNotFoundError, LineageTraversalError, DatabaseConnectionError)
- [ ] **EXCEPT-02**: Middleware exception handlers provide structured logging with loguru
- [ ] **EXCEPT-03**: All `traceback.print_exc()` calls replaced with `logger.exception()`
- [ ] **EXCEPT-04**: Error response contract preserved (`{"error": string}` schema)
- [ ] **EXCEPT-05**: Correlation IDs added for request tracing
- [ ] **EXCEPT-06**: No sensitive data logged in exceptions (stack traces sanitized)

### Code Cleanup

- [ ] **CLEANUP-01**: SQL parser consolidated to lineage-api/utils/sql_parser.py
- [ ] **CLEANUP-02**: Duplicate parser file removed from database/archive/
- [ ] **CLEANUP-03**: All imports updated to reference new parser location
- [ ] **CLEANUP-04**: DBQL extraction regression validation passes (compare record counts before/after)
- [ ] **CLEANUP-05**: View SQL truncation warnings displayed in frontend UI

## v2 Requirements

Deferred to future releases. Tracked but not in current roadmap.

### Impact Analysis Enhancements

- **IMPACT-08**: Depth-based filtering with maxDepth slider control
- **IMPACT-09**: Transformation type breakdown (IDENTITY, AGGREGATION, JOIN) display
- **IMPACT-10**: Export impact report (CSV/PDF)
- **IMPACT-11**: Impact severity scoring (CRITICAL/MEDIUM/LOW based on consumer count)

### Security & Performance

- **SECURITY-01**: API authentication (JWT/OAuth)
- **SECURITY-02**: Rate limiting on API endpoints
- **SECURITY-03**: Input validation on graph parameters
- **PERF-01**: Recursive CTE optimization (array-based cycle detection)
- **PERF-02**: Composite indexes on CTE join columns
- **PERF-03**: N+1 query elimination in database lineage endpoint

### Advanced Features

- **FEATURE-01**: What-If Analysis Preview (simulate impact without persisting)
- **FEATURE-02**: Real-Time Lineage Sync (change detection on DBC views)
- **FEATURE-03**: Affected Job/Process Identification (map to OL_JOB/OL_RUN)
- **FEATURE-04**: Lineage version tracking (history of lineage changes)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Performance optimization (CTE, indexes, N+1) | Defer to v2.0; focus on correctness first |
| Security hardening (auth, rate limiting) | Defer to v2.0; internal tool usage only for now |
| Test coverage expansion | Will add tests as part of implementation but not as separate initiative |
| Real-time lineage detection | Out of scope; requires event streams and monitoring infrastructure |
| Automatic schema change impact prevention | Out of scope; tool provides visibility, not enforcement |
| Multi-database platform support | Teradata-only; other databases require different extraction strategies |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| (To be populated by roadmapper) |  |  |

**Coverage:**
- v1 requirements: 21 total
- Mapped to phases: 0
- Unmapped: 21 ⚠️

---
*Requirements defined: 2026-02-13*
*Last updated: 2026-02-13 after initial definition*
