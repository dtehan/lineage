# Current Milestone Roadmap

**Status:** 🚧 In Progress
**Milestone:** v2.0 (TBD)

## Overview

This roadmap continues from v1.0 (shipped 2026-01-30) to address technical debt and high-priority concerns identified during the production readiness milestone.

## Current Milestone: v2.0 Configuration Improvements

### Phase 7: Environment Variable Consolidation ✓

**Goal:** Unify Teradata connection configuration across Python scripts and Go/Python server with consistent naming
**Depends on:** v1.0 complete
**Plans:** 3 plans (2 waves)
**Completed:** 2026-01-30

Plans:
- [x] 07-01-PLAN.md - Python configuration consolidation (db_config.py, python_server.py)
- [x] 07-02-PLAN.md - Go configuration consolidation (config.go)
- [x] 07-03-PLAN.md - Documentation consolidation (.env.example, CLAUDE.md, user_guide.md, SECURITY.md)

**Details:**
Standardize on TERADATA_* as primary variable names with TD_* as deprecated legacy fallback. Change PORT to API_PORT with PORT as fallback. Update all documentation to reflect consolidated naming.

Wave 1 (parallel):
- Plan 07-01: Python config (TERADATA_* primary, TD_* fallback, API_PORT)
- Plan 07-02: Go config (TD_* fallbacks via Viper, API_PORT)

Wave 2 (sequential):
- Plan 07-03: Documentation updates

### Phase 8: Open Lineage Standard Alignment

**Goal:** Align database LIN_ tables to OpenLineage standard (spec v2-0-2) for interoperability and industry best practices
**Depends on:** Phase 7
**Plans:** 8 plans (6 waves)

Plans:
- [ ] 08-01-PLAN.md - Database schema (OL_* tables DDL in setup_lineage_schema.py)
- [ ] 08-02-PLAN.md - Data population (populate_lineage.py with --openlineage flag)
- [ ] 08-03-PLAN.md - Go domain layer (OpenLineage entities and repository interface)
- [ ] 08-04-PLAN.md - Go repository (Teradata OpenLineage repository implementation)
- [ ] 08-05-PLAN.md - Go service/handlers (v2 API endpoints)
- [ ] 08-06-PLAN.md - Frontend types and hooks (TypeScript + TanStack Query)
- [ ] 08-07-PLAN.md - Documentation updates (user guide, CLAUDE.md, database README)
- [ ] 08-08-PLAN.md - Gap closure: Wire OpenLineage handler in main.go

**Details:**
Transform custom LIN_* schema to OpenLineage-compliant OL_* tables following spec v2-0-2. Creates new tables alongside existing ones for backward compatibility. Exposes v2 API at /api/v2/openlineage/* while maintaining v1 API unchanged.

Wave structure:
- Wave 1: Plan 08-01 (Database schema)
- Wave 2: Plans 08-02, 08-03 (Data population + Go domain) - parallel
- Wave 3: Plan 08-04 (Go repository)
- Wave 4: Plan 08-05 (Go service/handlers)
- Wave 5: Plans 08-06, 08-07 (Frontend + Documentation) - parallel
- Wave 6: Plan 08-08 (Gap closure - main.go wiring)

Key changes:
- New OL_* tables: OL_NAMESPACE, OL_DATASET, OL_DATASET_FIELD, OL_JOB, OL_RUN, OL_COLUMN_LINEAGE
- Namespace URI format: teradata://{host}:{port}
- Transformation types: DIRECT/INDIRECT with subtypes (IDENTITY, TRANSFORMATION, AGGREGATION, JOIN, FILTER, etc.)
- v2 API endpoints alongside existing v1

---

_Last updated: 2026-01-29_
