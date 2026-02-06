---
phase: 20-backend-statistics-and-ddl-api
plan: 01
subsystem: api
tags: [go, chi, teradata, dbc, hexagonal-architecture, rest-api]

# Dependency graph
requires:
  - phase: 19-animation-and-transitions
    provides: completed v4.0 animation foundation
provides:
  - GET /api/v2/openlineage/datasets/{datasetId}/statistics endpoint
  - GET /api/v2/openlineage/datasets/{datasetId}/ddl endpoint
  - DatasetStatistics and DatasetDDL domain entities
  - MockOpenLineageRepository for testing
affects: [21-detail-panel-enhancement, 23-comprehensive-testing]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "DBC system view queries for Teradata metadata (TablesV, TableStatsV, TableSizeV, ColumnsJQV)"
    - "parseDatasetName helper for splitting namespace_id/database.table format"
    - "Graceful degradation on DBC permission errors (log warning, return partial data)"

key-files:
  created: []
  modified:
    - lineage-api/internal/domain/entities.go
    - lineage-api/internal/domain/repository.go
    - lineage-api/internal/application/dto.go
    - lineage-api/internal/application/openlineage_service.go
    - lineage-api/internal/adapter/outbound/teradata/openlineage_repo.go
    - lineage-api/internal/adapter/inbound/http/openlineage_handlers.go
    - lineage-api/internal/adapter/inbound/http/router.go
    - lineage-api/internal/domain/mocks/repositories.go

key-decisions:
  - "DBC queries wrapped in separate error handlers so permission failures return partial data rather than 500"
  - "RequestTxtOverFlow column queried with fallback (try with column first, retry without if query fails)"
  - "View size query skipped entirely for views since views have no physical storage"

patterns-established:
  - "parseDatasetName: extract database.table from namespace_id/database.table format"
  - "mapTableKind: T->TABLE, V->VIEW, O->TABLE for Teradata TableKind codes"
  - "MockOpenLineageRepository: full interface mock with Statistics/DDLData maps and error injection"

# Metrics
duration: 4min
completed: 2026-02-06
---

# Phase 20 Plan 01: Backend Statistics & DDL API Summary

**Two new Go API endpoints for dataset statistics (row count, size, owner, dates) and DDL (view SQL, column comments) using DBC system views with graceful degradation**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-06T23:17:33Z
- **Completed:** 2026-02-06T23:21:37Z
- **Tasks:** 2/2
- **Files modified:** 8

## Accomplishments
- Complete hexagonal architecture vertical slice: domain entities, repository interface, DTOs, service layer, Teradata repository, HTTP handlers, route registration, and mock repository
- Statistics endpoint queries DBC.TablesV (metadata), DBC.TableStatsV (row count), DBC.TableSizeV (size) with graceful degradation on permission errors
- DDL endpoint queries DBC.TablesV (view SQL, table comment) and DBC.ColumnsJQV (column comments) with RequestTxtOverFlow truncation detection
- Security-compliant error handling: generic "Internal server error" to clients, detailed slog logging internally

## Task Commits

Each task was committed atomically:

1. **Task 1: Domain entities, repository interface, DTOs, service layer, and Teradata repository** - `7d54802` (feat)
2. **Task 2: HTTP handlers, router registration, and mock repository** - `448f68d` (feat)

## Files Created/Modified
- `lineage-api/internal/domain/entities.go` - Added DatasetStatistics and DatasetDDL domain structs
- `lineage-api/internal/domain/repository.go` - Extended OpenLineageRepository interface with GetDatasetStatistics and GetDatasetDDL
- `lineage-api/internal/application/dto.go` - Added DatasetStatisticsResponse and DatasetDDLResponse DTOs with *string timestamps
- `lineage-api/internal/application/openlineage_service.go` - Added service methods with dataset existence check before DBC queries
- `lineage-api/internal/adapter/outbound/teradata/openlineage_repo.go` - Implemented Teradata DBC queries with parseDatasetName helper
- `lineage-api/internal/adapter/inbound/http/openlineage_handlers.go` - Added GetDatasetStatistics and GetDatasetDDL handlers
- `lineage-api/internal/adapter/inbound/http/router.go` - Registered /statistics and /ddl routes
- `lineage-api/internal/domain/mocks/repositories.go` - Added MockOpenLineageRepository implementing full interface

## Decisions Made
- DBC queries are wrapped individually so that permission errors on TableStatsV or TableSizeV don't prevent returning other metadata
- RequestTxtOverFlow column is queried with a fallback strategy: try the 4-column query first, if it fails retry with 3 columns and infer truncation from RequestText length >= 12500
- View size queries are entirely skipped for views (sourceType == "VIEW") since views have no physical storage
- Service layer checks dataset existence in OL_DATASET before querying DBC views to prevent information disclosure about arbitrary tables

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Both endpoints are registered and functional in the Go backend
- MockOpenLineageRepository is ready for handler unit tests
- Phase 21 (Detail Panel Enhancement) can consume these endpoints from the frontend
- Python server endpoints (20-02) can be implemented next using the same patterns

---
*Phase: 20-backend-statistics-and-ddl-api*
*Completed: 2026-02-06*
