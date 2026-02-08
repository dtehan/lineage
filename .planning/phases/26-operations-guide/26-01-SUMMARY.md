---
phase: 26-operations-guide
plan: 01
subsystem: docs
tags: [operations, deployment, configuration, teradata, qvci, openlineage]

# Dependency graph
requires:
  - phase: 24-component-readmes
    provides: Root README with ops guide link placeholder
provides:
  - "docs/operations_guide.md with Prerequisites, Installation, Configuration, Database Setup, Running the Application sections"
  - "Complete environment variable reference table (12 variables)"
  - "QVCI verification and enablement procedures"
  - "Both backend options (Python/Go) documented"
affects: [26-02-operations-guide]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Operational workflow documentation structure (Prerequisites -> Installation -> Configuration -> Database Setup -> Running)"

key-files:
  created:
    - docs/operations_guide.md
  modified: []

key-decisions:
  - "QVCI called out in Prerequisites as early warning, detailed in Database Setup"
  - "Python backend recommended for most deployments, Go backend for high-concurrency"
  - "Redis documented as optional throughout, not just in config table"
  - "Server timeouts documented as non-configurable compiled values"

patterns-established:
  - "Ops guide sections follow deployment lifecycle order, not developer exploration order"
  - "Environment variable table includes Used By column to clarify component scope"

# Metrics
duration: 2min
completed: 2026-02-08
---

# Phase 26 Plan 01: Operations Guide (Prerequisites through Running) Summary

**Operations guide covering prerequisites (Python 3.9+, Node.js 18+, Go 1.23+), installation, 12-variable configuration reference, QVCI verification/enablement, OL_* schema creation, dual population methods, and both Python/Go backend startup**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-08T22:21:18Z
- **Completed:** 2026-02-08T22:23:25Z
- **Tasks:** 2
- **Files created:** 1

## Accomplishments

- Created `docs/operations_guide.md` with 8-section TOC and complete content for sections 1-5
- Complete environment variable reference table (12 variables with defaults, required status, and component scope)
- QVCI documented in both Prerequisites (early planning warning) and Database Setup (verification/enablement procedure)
- Both Python and Go backends documented; frontend dev server vs production build clearly distinguished

## Task Commits

Each task was committed atomically:

1. **Task 1: Create operations guide with Prerequisites, Installation, and Configuration sections** - `97c25a9` (docs)
2. **Task 2: Add Database Setup and Running the Application sections** - `4b61854` (docs)

## Files Created/Modified

- `docs/operations_guide.md` - Operations guide with Prerequisites, Installation, Configuration, Database Setup, Running the Application sections (354 lines)

## Decisions Made

- **QVCI placement:** Called out in Prerequisites as an early warning item requiring DBA coordination and maintenance window, with full procedure in Database Setup section 4.1
- **Backend recommendation:** Python backend recommended for most deployments; Go backend positioned for high-concurrency production environments
- **Redis positioning:** Documented as optional in three places (Prerequisites, Configuration table, Startup Order) to prevent deployment delays
- **Server timeouts:** Documented as non-configurable compiled values (15s read, 60s write, 60s idle, 30s shutdown) rather than implying they can be changed

## Deviations from Plan

None -- plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None -- no external service configuration required.

## Next Phase Readiness

- `docs/operations_guide.md` exists with placeholder sections for Production Deployment, Architecture, and Troubleshooting
- Plan 26-02 can fill these three remaining sections
- Cross-reference to SECURITY.md is in place (header and Running the Application section)
- No blockers for Plan 26-02

---
*Phase: 26-operations-guide*
*Completed: 2026-02-08*
