# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-07)

**Core value:** Enable new teams to deploy and operate the lineage application using documentation alone.
**Current focus:** Phase 27 - Developer Manual

## Current Position

Milestone: v5.0 Comprehensive Documentation (IN PROGRESS)
Phase: 27 of 27 (Developer Manual) -- In progress
Plan: 2 of 3 in current phase
Status: In progress
Last activity: 2026-02-08 -- Completed 27-02-PLAN.md (Architecture, schema, API reference, code standards)

Progress: [████████░░] 89% (8/9 plans)

## Performance Metrics

**Velocity:**
- Total plans completed: 63 (v1.0: 13, v2.0: 11, v2.1: 5, v3.0: 11, v4.0: 15, v5.0: 8)
- Average plan duration: ~3.3 min
- Total execution time: ~210 min

**By Milestone:**

| Milestone | Phases | Plans | Duration |
|-----------|--------|-------|----------|
| v1.0 | 6 | 13 | 8 days |
| v2.0 | 2 | 11 | ~2 hours |
| v2.1 | 2 | 5 | 1 day |
| v3.0 | 6 | 11 | ~2.5 hours |
| v4.0 | 5 | 15 | 2 days |
| v5.0 | 4 | 9 | - |

**Recent Trend:**
- v4.0 average: 3.2 min per plan
- Trend: Stable velocity

*Updated after each plan completion*

## Accumulated Context

### Decisions

All decisions logged in PROJECT.md Key Decisions table.

Recent decisions:
- [27-02]: Added extra rows to coding standards summary tables (Naming for Go, State for TS, Performance for SQL) for practical completeness
- [27-02]: All three DEV-16 diagram types embedded as Mermaid: system architecture, hexagonal architecture, database ER
- [27-02]: Summarize-and-link pattern used for all coding standards (summary table + link to ../specs/ canonical file)
- [27-01]: Used ~558 for frontend unit test count (approximate, changes as tests are added)
- [27-01]: Documented 6 Python packages from actual requirements.txt (not ops guide's slightly different list)
- [27-01]: Playwright port :5173 documented as distinct from dev server :3000
- [26-02]: Summarize-and-link pattern for security: overview table with deep links to SECURITY.md sections
- [26-02]: Rate limiting uses v* wildcard endpoints to cover both v1 and v2 API versions
- [26-02]: Troubleshooting uses consistent Symptoms/Cause/Solution format across all 10 issues
- [26-01]: QVCI called out in Prerequisites as early warning, detailed procedure in Database Setup
- [26-01]: Python backend recommended for most deployments, Go backend for high-concurrency
- [26-01]: Redis documented as optional throughout (Prerequisites, Config, Startup Order)
- [25-02]: 10 coarse-grained screenshots to resist UI rot, with descriptive alt text as fallback documentation
- [25-01]: Document Asset Browser without pagination controls (component does not implement them despite tests existing)
- [25-01]: Added Asset Type Filter to toolbar docs (existed in component but was undocumented)
- [25-01]: Kept Edge/Connection Details as separate subsection (not a tab) matching actual implementation
- [24-02]: Include all Makefile targets and package.json scripts in component READMEs (verified from source)
- [24-02]: Minimal database/README.md changes -- only add Testing section and back-link
- [24-01]: Used Mermaid diagram for architecture visualization (GitHub renders natively)
- [24-01]: Included ops guide and dev manual links with "coming in v5.0" annotation
- [24-01]: Kept CLAUDE.md link as AI development reference alongside human-facing docs
- [v5.0 roadmap]: 4 phases from 4 natural doc groupings (READMEs, User Guide, Ops Guide, Dev Manual)
- [v5.0 roadmap]: All phases independent -- can execute in any order
- [v5.0 roadmap]: No research phase needed -- introspective documentation of existing codebase

### Pending Todos

1. Views not showing their column types (2026-01-31, area: ui)
2. Optimize view column type extraction to in-database process (2026-02-01, area: database)
3. Refactor COLUMN_LINEAGE_MAPPINGS to test fixtures (2026-02-01, area: database)

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-02-08
Stopped at: Completed 27-02-PLAN.md (Architecture, schema, API reference, code standards)
Resume file: None
