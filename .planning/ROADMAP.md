# Roadmap: Lineage Application

## Milestones

- [x] **v1.0 Production Readiness** - Phases 1-6 (shipped 2026-01-30)
- [x] **v2.0 Configuration Improvements** - Phases 7-8 (shipped 2026-01-30)
- [x] **v2.1 Pagination UI - Asset Browser** - Phases 9-10 (shipped 2026-01-31)
- [x] **v3.0 Graph Improvements** - Phases 13-18 (shipped 2026-01-31)
- [x] **v4.0 Interactive Graph Experience** - Phases 19-23 (shipped 2026-02-07)
- [ ] **v5.0 Comprehensive Documentation** - Phases 24-27 (in progress)

## Phases

<details>
<summary>v1.0 Production Readiness (Phases 1-6) - SHIPPED 2026-01-30</summary>

See MILESTONES.md for details. 6 phases, 13 plans, 72 files modified.

</details>

<details>
<summary>v2.0 Configuration Improvements (Phases 7-8) - SHIPPED 2026-01-30</summary>

See MILESTONES.md for details. 2 phases, 11 plans, 48 files modified.

</details>

<details>
<summary>v2.1 Pagination UI - Asset Browser (Phases 9-10) - SHIPPED 2026-01-31</summary>

See MILESTONES.md for details. 2 phases, 5 plans.

</details>

<details>
<summary>v3.0 Graph Improvements (Phases 13-18) - SHIPPED 2026-01-31</summary>

See [milestones/v3.0-ROADMAP.md](milestones/v3.0-ROADMAP.md) for full details. 6 phases, 11 plans, 53 files modified.

</details>

<details>
<summary>v4.0 Interactive Graph Experience (Phases 19-23) - SHIPPED 2026-02-07</summary>

See [milestones/v4.0-ROADMAP.md](milestones/v4.0-ROADMAP.md) for full details. 5 phases, 15 plans, 52 files modified.

</details>

### v5.0 Comprehensive Documentation (In Progress)

**Milestone Goal:** Enable new teams to deploy and operate the lineage application using documentation alone.

#### Phase 24: README Updates
**Goal**: All four README files accurately describe the current state of the codebase so someone browsing the repo understands what each component does and how to run it
**Depends on**: Nothing (first phase of v5.0)
**Requirements**: README-01, README-02, README-03, README-04, README-05, README-06, README-07, README-08, README-09, README-10
**Success Criteria** (what must be TRUE):
  1. Someone cloning the repo can follow root README quick start commands and get the application running without errors
  2. Root README accurately lists v4.0 features (detail panel, animations, statistics/DDL) and links to user guide, ops guide, and dev manual
  3. lineage-api README describes hexagonal architecture (domain/application/adapter) and provides working commands for both Python and Go servers
  4. lineage-ui README describes the React component structure including v4.0 components (DetailPanel, Toolbar, LineageTableView) and provides working dev/build/test commands
  5. database README explains OL_* schema, OpenLineage alignment, both lineage population methods (fixtures vs DBQL), and provides working test commands
**Plans**: 2 plans

Plans:
- [x] 24-01-PLAN.md -- Rewrite root README with v4.0 features, quick start, architecture diagram, doc links
- [x] 24-02-PLAN.md -- Create lineage-api and lineage-ui READMEs, update database README testing section

#### Phase 25: User Guide Refresh
**Goal**: The user guide documents every user-facing feature so someone can learn the full application without external help
**Depends on**: Nothing (independent)
**Requirements**: USER-01, USER-02, USER-03, USER-04, USER-05, USER-06, USER-07, USER-08, USER-09, USER-10, USER-11
**Success Criteria** (what must be TRUE):
  1. Someone reading the user guide can navigate the asset browser with pagination, change page sizes, and understand the browsing workflow
  2. Someone reading the user guide understands all graph controls (depth, direction, fit-to-selection) and what the loading progress stages mean
  3. Someone reading the user guide can use the detail panel to inspect table statistics, view DDL/SQL with syntax highlighting, and click columns to navigate lineage
  4. Someone reading the user guide can use search to find databases, tables, and columns
  5. Key features are illustrated with screenshots showing actual application UI
**Plans**: 2 plans

Plans:
- [x] 25-01-PLAN.md -- Update user guide content: asset browser, loading progress, toolbar controls, detail panel tabs, search
- [x] 25-02-PLAN.md -- Add screenshot references and create screenshots directory with capture guide

#### Phase 26: Operations Guide
**Goal**: An operations team can deploy the application to production from scratch using only the ops guide
**Depends on**: Nothing (independent)
**Requirements**: OPS-01, OPS-02, OPS-03, OPS-04, OPS-05, OPS-06, OPS-07, OPS-08, OPS-09, OPS-10, OPS-11, OPS-12
**Success Criteria** (what must be TRUE):
  1. Someone can follow the guide to install all prerequisites (Go, Node.js, Python, Teradata access) and complete a step-by-step deployment
  2. Someone can configure the application using the documented environment variables (TERADATA_*, API_PORT, Redis) without reading source code
  3. Someone can set up the database schema (OL_* tables), enable QVCI, and populate lineage data using documented procedures
  4. Someone can harden the deployment for production using documented security requirements (auth proxy, TLS, CORS, rate limiting) and the deployment architecture diagram
  5. Someone can diagnose and resolve common issues using the troubleshooting section
**Plans**: 2 plans

Plans:
- [x] 26-01-PLAN.md -- Create operations guide with prerequisites, installation, configuration, database setup, running the application
- [x] 26-02-PLAN.md -- Add production deployment, architecture diagram, and troubleshooting sections

#### Phase 27: Developer Manual
**Goal**: A new developer can set up a local environment, run all test suites, understand the architecture, and contribute code using only the dev manual
**Depends on**: Nothing (independent)
**Requirements**: DEV-01, DEV-02, DEV-03, DEV-04, DEV-05, DEV-06, DEV-07, DEV-08, DEV-09, DEV-10, DEV-11, DEV-12, DEV-13, DEV-14, DEV-15, DEV-16
**Success Criteria** (what must be TRUE):
  1. A new developer can set up a complete local environment (Python venv, Node.js/npm, .env, database) following the documented steps without asking for help
  2. A new developer can run all four test suites (73 database, 20 API, 444+ frontend unit, 34 E2E) using the documented commands and understand what each suite validates
  3. A new developer understands the hexagonal architecture (Go backend layers), React frontend structure (components/features/stores), and OpenLineage schema from the architecture documentation and diagrams
  4. A new developer knows the code standards (Go, TypeScript, SQL), commit message conventions, and PR process before submitting their first contribution
**Plans**: 3 plans

Plans:
- [ ] 27-01-PLAN.md -- Create developer manual with quick start, environment setup, and running tests
- [ ] 27-02-PLAN.md -- Add architecture overview, backend/frontend architecture, database schema, API reference, and code standards
- [ ] 27-03-PLAN.md -- Add contributing guidelines (commit conventions, PR process) and update root README link

## Progress

**Execution Order:** Phases 1-6 (v1.0) -> 7-8 (v2.0) -> 9-10 (v2.1) -> 13-18 (v3.0) -> 19-23 (v4.0) -> 24-27 (v5.0)

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1-6. Production Readiness | v1.0 | 13/13 | Complete | 2026-01-30 |
| 7-8. Configuration Improvements | v2.0 | 11/11 | Complete | 2026-01-30 |
| 9-10. Pagination UI | v2.1 | 5/5 | Complete | 2026-01-31 |
| 13-18. Graph Improvements | v3.0 | 11/11 | Complete | 2026-01-31 |
| 19-23. Interactive Graph Experience | v4.0 | 15/15 | Complete | 2026-02-07 |
| 24. README Updates | v5.0 | 2/2 | Complete | 2026-02-07 |
| 25. User Guide Refresh | v5.0 | 2/2 | Complete | 2026-02-08 |
| 26. Operations Guide | v5.0 | 2/2 | Complete | 2026-02-08 |
| 27. Developer Manual | v5.0 | 0/3 | Not started | - |

---
*Roadmap created: 2026-01-31*
*Last updated: 2026-02-08 (Phase 26 complete)*
