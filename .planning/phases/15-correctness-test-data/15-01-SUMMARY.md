---
phase: 15-correctness-test-data
plan: 01
subsystem: database
tags: [teradata, test-data, graph-patterns, lineage, correctness]

# Dependency graph
requires:
  - phase: 08-open-lineage-standard-alignment
    provides: OL_COLUMN_LINEAGE table schema
provides:
  - Comprehensive graph test patterns (cycles, diamonds, fans, combined)
  - 62 new test records covering 9 pattern categories
  - Updated verification query with categorized test type breakdown
affects: [16-correctness-validation, graph-testing, CTE-recursion-tests]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Graph pattern naming convention (TEST_{PATTERN}_{NNN})
    - Categorized test data with CORRECT-DATA requirements

key-files:
  created: []
  modified:
    - database/insert_cte_test_data.py

key-decisions:
  - "Test pattern IDs follow consistent naming: TEST_{PATTERN_TYPE}_{SEQUENCE}"
  - "All patterns use single table per pattern type for isolated testing"

patterns-established:
  - "Graph test pattern naming: TEST_{CATEGORY}_{NNN} (e.g., TEST_CYCLE5_001)"
  - "Verification query categorization using SQL CASE for test type breakdown"

# Metrics
duration: 3min
completed: 2026-01-31
---

# Phase 15 Plan 01: Correctness Test Data Summary

**Comprehensive graph test patterns for lineage algorithm validation: 5-node cycles, nested/wide diamonds, large fan patterns, and combined scenarios**

## Performance

- **Duration:** 3 min
- **Started:** 2026-01-31T00:00:00Z
- **Completed:** 2026-01-31T00:03:00Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Added 62 new test records covering 9 distinct graph pattern categories
- Extended cycle coverage: 2-node, 4-node, and new 5-node cycles (11 total cycle records)
- Extended diamond coverage: simple, nested, and wide diamonds (20 total diamond records)
- Added large fan patterns: fan-out 5/10 and fan-in 5/10 (30 total fan records)
- Added combined patterns: cycle+diamond and fan-out+fan-in (11 combined records)
- Updated verification query to categorize all 17 test types with detailed breakdown

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend insert_cte_test_data.py with comprehensive graph patterns** - `861549b` (feat)
2. **Task 2: Execute script and verify patterns in database** - No commit (database operation only)

## Files Created/Modified
- `database/insert_cte_test_data.py` - Extended with 62 new INSERT statements and updated verification query

## Test Pattern Inventory

| Pattern Category | Test ID Prefix | Records | Purpose |
|------------------|----------------|---------|---------|
| 5-node cycle | TEST_CYCLE5_ | 5 | A->B->C->D->E->A cycle detection |
| Nested diamond | TEST_NESTED_DIAMOND_ | 8 | Double diamond (A->B/C->D->E/F->G) |
| Wide diamond | TEST_WIDE_DIAMOND_ | 8 | 4-way fan-in (A->B/C/D/E->F) |
| Fan-out 5 | TEST_FANOUT5_ | 5 | 1->5 downstream traversal |
| Fan-out 10 | TEST_FANOUT10_ | 10 | 1->10 large downstream |
| Fan-in 5 | TEST_FANIN5_ | 5 | 5->1 upstream traversal |
| Fan-in 10 | TEST_FANIN10_ | 10 | 10->1 large upstream |
| Cycle+Diamond | TEST_COMBINED_CD_ | 5 | Mixed cycle and diamond |
| Fan-out+Fan-in | TEST_COMBINED_FAN_ | 6 | Cascaded fan pattern |

**Total new records:** 62
**Total TEST_* records in database:** 89

## Decisions Made
- Test pattern IDs follow consistent naming: TEST_{PATTERN_TYPE}_{SEQUENCE}
- Each pattern type uses a dedicated virtual table name for isolated testing
- CASE statement ordering in verification query ensures specific patterns match before general ones

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - script executed successfully with all 89/89 records inserted.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Test data ready for Phase 16 (Correctness Validation)
- 3+ cycle patterns available (2-node, 4-node, 5-node)
- 3+ diamond patterns available (simple, nested, wide)
- Fan-out patterns available (1->5, 1->10)
- Fan-in patterns available (5->1, 10->1)
- Combined patterns available (cycle+diamond, fan-out+fan-in)

---
*Phase: 15-correctness-test-data*
*Completed: 2026-01-31*
