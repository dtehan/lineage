---
phase: 22-metadata-population-foundation
plan: 01
subsystem: database
tags: [teradata, populate, openlineage, system-databases, preflight]

# Dependency graph
requires: []
provides:
  - "SYSTEM_DATABASES frozenset constant with 43 Teradata system database names"
  - "--full-refresh flag for explicit destructive repopulation"
  - "run_preflight_checks() verifying QVCI status and user DB coverage"
  - "Safe-by-default re-run behavior via NOT EXISTS guards"
  - "System database exclusion in populate_openlineage_datasets and populate_openlineage_fields"
affects:
  - 22-metadata-population-foundation (plans 02+)
  - 23-asset-browser-and-rendering

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Parameterised SQL exclusion list using _system_db_placeholders() + _system_db_exclusion_params()"
    - "Pre-flight checks pattern: verify environment before any INSERT operations"
    - "Safe-by-default CLI: destructive operations require explicit flag (--full-refresh)"

key-files:
  created: []
  modified:
    - "database/scripts/populate/populate_lineage.py"

key-decisions:
  - "43 Teradata system databases excluded from user catalog (frozenset provides O(1) lookup and immutability)"
  - "Default behavior is incremental (NOT EXISTS guards preserve existing data); --full-refresh required for destructive repopulation"
  - "--skip-clear deprecated but kept as no-op for backward compatibility"
  - "QVCI check failure is a warning, not a hard failure -- population proceeds regardless"

patterns-established:
  - "Parameterised exclusion: use _system_db_placeholders() to build ? list, _system_db_exclusion_params() for values"
  - "Pre-flight pattern: run_preflight_checks(cursor) called immediately after connection, before any data operations"

# Metrics
duration: 2min
completed: 2026-02-23
---

# Phase 22 Plan 01: Metadata Population Foundation (Safety Layer) Summary

**System database exclusion via SYSTEM_DATABASES frozenset, safe-by-default re-run with --full-refresh flag, and pre-flight QVCI/coverage checks added to populate_lineage.py**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-23T22:30:08Z
- **Completed:** 2026-02-23T22:32:48Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Added `SYSTEM_DATABASES` frozenset with 43 Teradata system database names to prevent system catalog pollution
- Added parameterised `DatabaseName NOT IN` clauses to both `populate_openlineage_datasets` and `populate_openlineage_fields` using `?` placeholders (no SQL injection risk)
- Flipped default behavior from destructive (clear on every run) to safe (NOT EXISTS guards preserve existing rows)
- Added `--full-refresh` flag as the explicit path to destructive repopulation; deprecated `--skip-clear` with backward-compatible no-op
- Added `run_preflight_checks()` verifying QVCI status and user DB count before any INSERT operations

## Task Commits

Each task was committed atomically:

1. **Task 1: Add SYSTEM_DATABASES exclusion and parameterised SQL helper** - `c892495` (feat)
2. **Task 2: Flip default to safe re-run and add --full-refresh flag, pre-flight checks** - `02df492` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `database/scripts/populate/populate_lineage.py` - SYSTEM_DATABASES constant, helper functions, NOT IN exclusion clauses, --full-refresh flag, run_preflight_checks(), updated epilog and mode summary

## Decisions Made
- Used frozenset (not list/tuple) for SYSTEM_DATABASES: frozenset is immutable and provides O(1) membership tests; sorted() in _system_db_exclusion_params() ensures deterministic query parameter order
- QVCI check failure treated as warning, not hard failure: production systems may have QVCI disabled (error 9719) but can still populate table columns; view column types degrade to UNKNOWN
- DBC.DatabasesV coverage check treated as skip (not failure) when not accessible: some environments restrict DBC access
- Kept --skip-clear as deprecated no-op rather than removing it: avoids breaking existing scripts that pass the flag

## Deviations from Plan

None - plan executed exactly as written. The frozenset contains 43 entries (not 42 as stated in the "done criteria" text); the plan's action section provides exactly 43 names in the frozenset literal, which is the authoritative specification.

## Issues Encountered
- None. `python3` used instead of `python` (macOS does not alias `python` to Python 3) for local verification commands.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `populate_openlineage_datasets` and `populate_openlineage_fields` now exclude all 43 known Teradata system databases
- Pre-flight checks will surface QVCI issues before any data operations on first live run
- Ready for Plan 02 which builds on this foundation (full dataset/field population for user databases)
- The `--full-refresh` flag provides the reset path if Plan 02 testing requires a clean slate

## Self-Check: PASSED

- FOUND: `database/scripts/populate/populate_lineage.py`
- FOUND: `.planning/phases/22-metadata-population-foundation/22-01-SUMMARY.md`
- FOUND commit `c892495`: feat(22-01): add SYSTEM_DATABASES exclusion and parameterised SQL helpers
- FOUND commit `02df492`: feat(22-01): add --full-refresh flag, pre-flight checks, and safe-by-default behavior

---
*Phase: 22-metadata-population-foundation*
*Completed: 2026-02-23*
