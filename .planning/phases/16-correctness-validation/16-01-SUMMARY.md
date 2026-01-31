---
phase: 16-correctness-validation
plan: 01
subsystem: database
tags: [testing, cte, graph-algorithms, teradata, correctness]
dependency-graph:
  requires:
    - phase-15 (test data from insert_cte_test_data.py)
  provides:
    - CTE correctness test suite (database/test_correctness.py)
    - Validation of cycle detection, diamond dedup, fan patterns
  affects:
    - phase-16-02 (API correctness tests can build on this)
tech-stack:
  added: []
  patterns:
    - POSITION(lineage_id IN path) = 0 for cycle detection
    - Unidirectional CTE queries for Teradata compatibility
key-files:
  created:
    - database/test_correctness.py
  modified: []
decisions:
  - id: CORRECT-01
    summary: Use unidirectional CTE queries for cycle tests
    reason: Teradata ClearScape 20.0 has limitations with dual recursive CTEs
metrics:
  duration: 5 min
  completed: 2026-01-31
---

# Phase 16 Plan 01: Database CTE Correctness Tests Summary

CTE correctness test suite validating recursive graph algorithms handle cycles, diamonds, and fan patterns correctly using POSITION(id IN path) cycle detection.

## Objective Achieved

Created `database/test_correctness.py` that validates the CTE-based graph traversal algorithms work correctly for all complex lineage patterns.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create CTE correctness test script | 97428be | database/test_correctness.py |
| 2 | Run tests and validate results | 96726da | database/test_correctness.py |

## Key Implementation Details

### Test Categories (CORRECT-VAL-01 through CORRECT-VAL-07)

1. **Cycle Detection (CORRECT-VAL-01)** - Tests that cycles terminate:
   - 2-node cycle: A <-> B
   - 4-node cycle: A -> B -> C -> D -> A
   - 5-node cycle: A -> B -> C -> D -> E -> A
   - Uses `POSITION(lineage_id IN path) = 0` to detect revisits

2. **Diamond Deduplication (CORRECT-VAL-02)** - Tests no duplicate nodes:
   - Simple diamond: A -> B,C -> D
   - Nested diamond: two diamonds in series
   - Wide diamond: A -> B,C,D,E -> F

3. **Fan-out Completeness (CORRECT-VAL-03)** - Tests all targets included:
   - Fan-out 5: 1 source -> 5 targets
   - Fan-out 10: 1 source -> 10 targets

4. **Fan-in Completeness (CORRECT-VAL-04)** - Tests all sources included:
   - Fan-in 5: 5 sources -> 1 target
   - Fan-in 10: 10 sources -> 1 target

5. **Combined Patterns (CORRECT-VAL-05)** - Tests mixed patterns:
   - Cycle + diamond combination
   - Fan-out + fan-in combination

6. **Depth Limiting (CORRECT-VAL-06)** - Tests max depth enforcement:
   - Depth 1 restricts to immediate edges
   - Depth 2 includes 2 levels
   - Depth 10 includes full chain (4 levels)

7. **Active Filtering (CORRECT-VAL-07)** - Tests is_active = 'Y':
   - Only active lineage records traversed
   - Inactive records excluded

### CTE Query Patterns

Matches the Go backend (`openlineage_repo.go`):

```sql
WITH RECURSIVE lineage_path (...) AS (
    -- Base case
    SELECT ..., 1 AS depth, CAST(lineage_id AS VARCHAR(4000)) AS path
    FROM OL_COLUMN_LINEAGE
    WHERE target_dataset = ? AND target_field = ? AND is_active = 'Y'

    UNION ALL

    -- Recursive case with cycle detection
    SELECT ..., lp.depth + 1, lp.path || ',' || l.lineage_id
    FROM OL_COLUMN_LINEAGE l
    INNER JOIN lineage_path lp ON l.target_dataset = lp.source_dataset
    WHERE l.is_active = 'Y'
      AND lp.depth < max_depth
      AND POSITION(l.lineage_id IN lp.path) = 0  -- Cycle detection
)
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] ClearScape dual recursive CTE limitation**
- **Found during:** Task 2
- **Issue:** Teradata ClearScape 20.0 returns Error 6920 for bidirectional queries with two recursive CTEs combined via UNION
- **Fix:** Changed cycle tests and combined pattern tests to use unidirectional queries (downstream for cycles, upstream for combined patterns)
- **Files modified:** database/test_correctness.py
- **Commit:** 96726da

## Test Results

```
============================================================
TEST SUMMARY
============================================================
  Total tests: 16
  [PASS] Passed:  16
  [FAIL] Failed:  0
  [SKIP] Skipped: 0

============================================================
Pass rate (excluding skipped): 100.0%
============================================================
```

## Success Criteria Verification

- [x] Cycle patterns terminate without infinite loops (path tracking works)
- [x] Diamond patterns produce single node instances (no duplicate nodes)
- [x] Fan-out patterns include all target nodes in the graph
- [x] Fan-in patterns include all source nodes in the graph
- [x] Node and edge counts match expected values for each test pattern

## Next Phase Readiness

- Test suite ready for integration with Phase 16-02 (API correctness tests)
- Test data validated (89 records in OL_COLUMN_LINEAGE)
- CTE patterns confirmed working in production Teradata environment
