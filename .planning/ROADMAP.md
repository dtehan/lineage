# Current Milestone Roadmap

**Status:** 🚧 In Progress
**Milestone:** v2.0 (TBD)

## Overview

This roadmap continues from v1.0 (shipped 2026-01-30) to address technical debt and high-priority concerns identified during the production readiness milestone.

## Current Milestone: v2.0 Configuration Improvements

### Phase 7: Environment Variable Consolidation

**Goal:** Unify Teradata connection configuration across Python scripts and Go/Python server with consistent naming
**Depends on:** v1.0 complete
**Plans:** 3 plans (2 waves)

Plans:
- [ ] 07-01-PLAN.md - Python configuration consolidation (db_config.py, python_server.py)
- [ ] 07-02-PLAN.md - Go configuration consolidation (config.go)
- [ ] 07-03-PLAN.md - Documentation consolidation (.env.example, CLAUDE.md, user_guide.md, SECURITY.md)

**Details:**
Standardize on TERADATA_* as primary variable names with TD_* as deprecated legacy fallback. Change PORT to API_PORT with PORT as fallback. Update all documentation to reflect consolidated naming.

Wave 1 (parallel):
- Plan 07-01: Python config (TERADATA_* primary, TD_* fallback, API_PORT)
- Plan 07-02: Go config (TD_* fallbacks via Viper, API_PORT)

Wave 2 (sequential):
- Plan 07-03: Documentation updates

### Phase 8: Open Lineage Standard Alignment

**Goal:** Align database LIN_ tables to Open Lineage standard for interoperability and industry best practices
**Depends on:** Phase 7
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd:plan-phase 8 to break down)

**Details:**
The database LIN_ tables should align to the Open Lineage standard, as defined in openlineage.io web site. This will require changes to:
- Database schema (LIN_* tables)
- Scripts that populate the database (populate_lineage.py, extract_dbql_lineage.py)
- API layer (Go backend handlers, services, repositories)
- GUI (React frontend components, data models)

This alignment will enable interoperability with other lineage tools and follow industry best practices for lineage metadata management.

---

_Last updated: 2026-01-29_
