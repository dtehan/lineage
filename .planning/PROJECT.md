# Lineage - Column-Level Data Lineage for Teradata

## What This Is

A column-level data lineage application for Teradata databases that visualizes data flow between database columns. Users can browse databases/tables/columns, view upstream and downstream lineage graphs, and perform impact analysis for change management. Built with Python Flask backend, React TypeScript frontend, and OpenLineage-aligned schema.

## Core Value

Enable accurate impact analysis for database changes by visualizing complete column-level lineage across Teradata databases.

## Current State

**Shipped:** v1.0 Code Quality & Missing Features (Feb 15, 2026)

**What's working:**
- Impact Analysis feature with depth indicators and column-level impact counts
- Structured exception handling with correlation IDs and dual-sink logging
- Maintainable service/repository architecture (replaced 1454-line monolith)
- DBQL truncation warnings visible in UI
- All test suites passing (73 DB + 20 API + 260+ frontend + 21 E2E)

## Current Milestone: v2.0 Performance Optimization

**Goal:** Reduce graph loading time from 60 seconds to 2-4 seconds across all graph types.

**Target improvements:**
- Database-level lineage graphs (600 nodes): 60s → 2-4s end-to-end
- Table-level lineage graphs: 60s → 2-4s end-to-end
- Column-level lineage graphs: 60s → 2-4s end-to-end

**Constraints:**
- Preserve OpenLineage schema compatibility
- Maintain current tech stack (Flask, React Flow, Teradata)
- Can add caching layer (Redis) if beneficial

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

- ✓ Impact Analysis feature fully functional — v1.0
- ✓ Proper exception handling with logging across all API endpoints — v1.0
- ✓ Single consolidated SQL parser module — v1.0
- ✓ Backend code organized into service/repository layers — v1.0
- ✓ Statistics endpoint errors properly logged and communicated — v1.0
- ✓ View SQL truncation warnings visible to users — v1.0

### Active

<!-- Current scope. Building toward these. -->

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- Security hardening (auth, rate limiting, input validation) — Defer to future milestone; internal tool usage only for now
- Missing features (version tracking, batch operations, quality metrics) — Defer to future milestone; focus on performance first
- Test coverage expansion — Will add tests as part of implementation but not as separate initiative

## Context

**Codebase State (v1.0):**
- Backend: Python Flask with layered architecture (repositories, services, blueprints)
- Frontend: React 18 + TypeScript + React Flow + TanStack Query/Table
- Database: Teradata with OpenLineage schema (OL_* tables)
- LOC: ~444K lines (Python + TypeScript)
- Testing: 73 database tests + 20 API tests + 260+ frontend tests + 21 E2E tests

**Technical Stack:**
- OpenLineage spec v2-0-2 implementation
- DBQL-based lineage extraction using SQLGlot parser
- Recursive CTEs for lineage traversal with cycle detection
- React Flow + ELKjs for graph layout
- Loguru for structured JSON logging with correlation IDs

**Recent Changes (v1.0):**
- Refactored python_server.py from 1454 lines to 77 lines (Application Factory pattern)
- Eliminated 5 duplicate recursive CTEs into 3 shared repository functions
- Replaced bare exception handlers with domain exception hierarchy
- Added dual-sink logging (stdout + rotating file with 100 MB/30-day retention)
- Consolidated duplicate SQL parsers into canonical location
- Implemented complete Impact Analysis feature with TanStack Table UI

## Constraints

- **Tech Stack**: Python Flask, React TypeScript, Teradata — No framework changes
- **Database**: Must maintain OpenLineage schema compatibility — No breaking changes to OL_* tables
- **Testing**: All changes must maintain existing test coverage — Tests should pass before commits
- **QVCI**: Teradata QVCI must be enabled — Required for DBC.ColumnsJQV queries

## Key Decisions

<!-- Decisions that constrain future work. Add throughout project lifecycle. -->

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| OpenLineage schema alignment | Industry standard for lineage metadata; enables future tool integration | ✓ Good — Enables interoperability |
| DBQL-based extraction over SQL parsing | More reliable; uses Teradata's own query logs rather than parsing SQL strings | ✓ Good — Accurate lineage |
| React Flow for graph visualization | Best-in-class React graph library; handles auto-layout and interactivity | ✓ Good — Excellent UX |
| Defer security to v2.0 | Internal tool; focus on correctness before hardening | ✓ Good — Enabled rapid v1.0 delivery |
| Repository pattern for data access | Extract duplicate CTEs, enable testing, separate concerns | ✓ Good — Reduced 1454-line file to 77 lines |
| Domain exception hierarchy | Map exceptions to HTTP status codes, preserve error contract | ✓ Good — Clean error handling |
| Loguru for structured logging | JSON logs with correlation IDs for observability | ✓ Good — Production-ready logging |
| TanStack Table for Impact Analysis | Sortable, accessible data tables with minimal code | ✓ Good — Rich UX with low overhead |

---
*Last updated: 2026-02-15 after v2.0 milestone start*
