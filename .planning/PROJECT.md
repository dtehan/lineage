# Lineage - Column-Level Data Lineage for Teradata

## What This Is

A column-level data lineage application for Teradata databases that visualizes data flow between database columns. Users can browse databases/tables/columns, view upstream and downstream lineage graphs, and perform impact analysis for change management. Built with Python Flask backend, React TypeScript frontend, and OpenLineage-aligned schema.

## Core Value

Enable accurate impact analysis for database changes by visualizing complete column-level lineage across Teradata databases.

## Current Milestone: v1.0 Code Quality & Missing Features

**Goal:** Address critical tech debt and implement missing impact analysis feature to improve reliability and complete core functionality.

**Target features:**
- Implement complete Impact Analysis feature (currently placeholder)
- Fix exception handling across all 11 API endpoints with proper logging
- Clean up archived code and consolidate SQL parser implementations
- Refactor large backend file into maintainable service/repository pattern
- Add error context to statistics endpoint
- Display view SQL truncation warnings in UI

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

(None yet — ship to validate)

### Active

<!-- Current scope. Building toward these. -->

- [ ] Impact Analysis feature fully functional
- [ ] Proper exception handling with logging across all API endpoints
- [ ] Single consolidated SQL parser module
- [ ] Backend code organized into service/repository layers
- [ ] Statistics endpoint errors properly logged and communicated
- [ ] View SQL truncation warnings visible to users

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- Performance optimization (recursive CTE, indexes, N+1 queries) — Defer to v2.0; focus on correctness first
- Security hardening (auth, rate limiting, input validation) — Defer to v2.0; internal tool usage only for now
- Missing features (version tracking, batch operations, quality metrics) — Defer to v2.0; address tech debt first
- Test coverage expansion — Will add tests as part of implementation but not as separate initiative

## Context

**Current State:**
- Backend: Python Flask API (1454-line python_server.py) with OpenLineage-aligned endpoints
- Frontend: React 18 + TypeScript with React Flow graph visualization
- Database: Teradata with OpenLineage schema (OL_* tables)
- Testing: 73 database tests, 20 API tests, 260+ frontend unit tests, 21 E2E tests

**Technical Environment:**
- OpenLineage spec v2-0-2 implementation
- DBQL-based lineage extraction using SQLGlot parser
- Recursive CTEs for lineage traversal with cycle detection
- React Flow + ELKjs for graph layout

**Known Issues from Codebase Mapping:**
- Impact Analysis page shows "Feature In Development" placeholder
- 11 API endpoints use bare `except Exception` with traceback.print_exc()
- Duplicate SQL parsing code in archive and active directories
- Large backend file mixes routing, database logic, and transformations
- Statistics endpoint silently ignores errors with `except Exception: pass`
- View SQL truncation detected but not clearly communicated to frontend

## Constraints

- **Tech Stack**: Python Flask, React TypeScript, Teradata — No framework changes
- **Database**: Must maintain OpenLineage schema compatibility — No breaking changes to OL_* tables
- **Testing**: All changes must maintain existing test coverage — Tests should pass before commits
- **QVCI**: Teradata QVCI must be enabled — Required for DBC.ColumnsJQV queries

## Key Decisions

<!-- Decisions that constrain future work. Add throughout project lifecycle. -->

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| OpenLineage schema alignment | Industry standard for lineage metadata; enables future tool integration | — Pending |
| DBQL-based extraction over SQL parsing | More reliable; uses Teradata's own query logs rather than parsing SQL strings | — Pending |
| React Flow for graph visualization | Best-in-class React graph library; handles auto-layout and interactivity | — Pending |
| Defer security to v2.0 | Internal tool; focus on correctness before hardening | — Pending |

---
*Last updated: 2026-02-13 after milestone v1.0 initialization*
