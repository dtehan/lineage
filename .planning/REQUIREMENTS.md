# Requirements: Lineage Application

**Defined:** 2026-02-07
**Core Value:** The lineage application must be secure and stable for production use - no data exposure through error messages, no unbounded resource consumption, and clear security boundaries documented.

## v5.0 Requirements (Comprehensive Documentation)

Requirements for milestone v5.0 focused on enabling production deployment through comprehensive documentation.

### README Updates

- [x] **README-01**: Root README.md reflects v4.0 features (detail panel, animations, statistics/DDL)
- [x] **README-02**: Root README.md has accurate quick start commands that work
- [x] **README-03**: Root README.md links to new documentation (user guide, ops guide, dev manual)
- [x] **README-04**: lineage-api/README.md documents Go backend structure and hexagonal architecture
- [x] **README-05**: lineage-api/README.md has accurate commands for running Python/Go servers
- [x] **README-06**: lineage-ui/README.md documents React component structure and new v4.0 components
- [x] **README-07**: lineage-ui/README.md has accurate dev/build/test commands
- [x] **README-08**: database/README.md documents OL_* schema and OpenLineage alignment
- [x] **README-09**: database/README.md explains lineage population methods (fixtures vs DBQL)
- [x] **README-10**: database/README.md has accurate test execution commands

### User Guide

- [ ] **USER-01**: User guide documents asset browser navigation with pagination controls
- [ ] **USER-02**: User guide documents page size selection (25, 50, 100, 200)
- [ ] **USER-03**: User guide documents lineage graph depth/direction controls
- [ ] **USER-04**: User guide documents loading progress bar and stage indicators
- [ ] **USER-05**: User guide documents fit-to-selection viewport control
- [ ] **USER-06**: User guide documents detail panel tabs (Columns, Statistics, DDL)
- [ ] **USER-07**: User guide documents viewing table statistics (row count, size, owner, dates)
- [ ] **USER-08**: User guide documents viewing DDL/SQL with syntax highlighting
- [ ] **USER-09**: User guide documents click-to-navigate from column list to lineage
- [ ] **USER-10**: User guide documents search functionality across databases/tables/columns
- [ ] **USER-11**: User guide includes screenshots of key features

### Operations Guide

- [ ] **OPS-01**: Operations guide documents system prerequisites (Go, Node.js, Python, Teradata access)
- [ ] **OPS-02**: Operations guide provides step-by-step installation instructions
- [ ] **OPS-03**: Operations guide documents all TERADATA_* environment variables
- [ ] **OPS-04**: Operations guide documents API_PORT and server configuration
- [ ] **OPS-05**: Operations guide documents Redis configuration (optional)
- [ ] **OPS-06**: Operations guide documents database schema creation (OL_* tables)
- [ ] **OPS-07**: Operations guide documents lineage population options (fixtures vs DBQL)
- [ ] **OPS-08**: Operations guide explains QVCI requirements for Teradata
- [ ] **OPS-09**: Operations guide documents production security requirements (auth proxy, TLS, CORS)
- [ ] **OPS-10**: Operations guide documents rate limiting recommendations
- [ ] **OPS-11**: Operations guide includes deployment architecture diagram
- [ ] **OPS-12**: Operations guide includes troubleshooting section for common issues

### Developer Manual

- [ ] **DEV-01**: Developer manual documents Python venv setup with requirements.txt
- [ ] **DEV-02**: Developer manual documents Node.js/npm setup for frontend
- [ ] **DEV-03**: Developer manual documents .env configuration for local development
- [ ] **DEV-04**: Developer manual documents database initialization steps
- [ ] **DEV-05**: Developer manual documents running 73 database tests
- [ ] **DEV-06**: Developer manual documents running 20 API tests
- [ ] **DEV-07**: Developer manual documents running 444+ frontend unit tests
- [ ] **DEV-08**: Developer manual documents running 34 E2E tests with Playwright
- [ ] **DEV-09**: Developer manual documents hexagonal architecture pattern
- [ ] **DEV-10**: Developer manual documents Go backend structure (domain/application/adapter layers)
- [ ] **DEV-11**: Developer manual documents React frontend structure (components/features/stores)
- [ ] **DEV-12**: Developer manual documents OpenLineage schema and v2 API
- [ ] **DEV-13**: Developer manual documents code standards from specs/ directory
- [ ] **DEV-14**: Developer manual documents commit message conventions
- [ ] **DEV-15**: Developer manual documents PR process and review expectations
- [ ] **DEV-16**: Developer manual includes architecture diagrams (backend, frontend, database)

## Future Requirements

*No deferred requirements - comprehensive documentation is all in v5.0*

## Out of Scope

| Documentation | Reason |
|---------------|--------|
| API reference docs (auto-generated) | Not needed for v5.0 - inline comments sufficient |
| Video tutorials | Written docs sufficient for technical audience |
| Internationalization | English-only for initial documentation |
| PDF exports | Markdown sufficient for version control and editing |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| README-01 | Phase 24 | Pending |
| README-02 | Phase 24 | Pending |
| README-03 | Phase 24 | Pending |
| README-04 | Phase 24 | Pending |
| README-05 | Phase 24 | Pending |
| README-06 | Phase 24 | Pending |
| README-07 | Phase 24 | Pending |
| README-08 | Phase 24 | Pending |
| README-09 | Phase 24 | Pending |
| README-10 | Phase 24 | Pending |
| USER-01 | Phase 25 | Pending |
| USER-02 | Phase 25 | Pending |
| USER-03 | Phase 25 | Pending |
| USER-04 | Phase 25 | Pending |
| USER-05 | Phase 25 | Pending |
| USER-06 | Phase 25 | Pending |
| USER-07 | Phase 25 | Pending |
| USER-08 | Phase 25 | Pending |
| USER-09 | Phase 25 | Pending |
| USER-10 | Phase 25 | Pending |
| USER-11 | Phase 25 | Pending |
| OPS-01 | Phase 26 | Pending |
| OPS-02 | Phase 26 | Pending |
| OPS-03 | Phase 26 | Pending |
| OPS-04 | Phase 26 | Pending |
| OPS-05 | Phase 26 | Pending |
| OPS-06 | Phase 26 | Pending |
| OPS-07 | Phase 26 | Pending |
| OPS-08 | Phase 26 | Pending |
| OPS-09 | Phase 26 | Pending |
| OPS-10 | Phase 26 | Pending |
| OPS-11 | Phase 26 | Pending |
| OPS-12 | Phase 26 | Pending |
| DEV-01 | Phase 27 | Pending |
| DEV-02 | Phase 27 | Pending |
| DEV-03 | Phase 27 | Pending |
| DEV-04 | Phase 27 | Pending |
| DEV-05 | Phase 27 | Pending |
| DEV-06 | Phase 27 | Pending |
| DEV-07 | Phase 27 | Pending |
| DEV-08 | Phase 27 | Pending |
| DEV-09 | Phase 27 | Pending |
| DEV-10 | Phase 27 | Pending |
| DEV-11 | Phase 27 | Pending |
| DEV-12 | Phase 27 | Pending |
| DEV-13 | Phase 27 | Pending |
| DEV-14 | Phase 27 | Pending |
| DEV-15 | Phase 27 | Pending |
| DEV-16 | Phase 27 | Pending |

**Coverage:**
- v5.0 requirements: 49 total
- Mapped to phases: 49
- Unmapped: 0

---
*Requirements defined: 2026-02-07*
*Last updated: 2026-02-07 after roadmap creation*
