---
phase: 04-database-query-optimization
plan: 01
subsystem: database
tags: [performance, indexing, statistics, baseline]
dependency_graph:
  requires: []
  provides: [baseline-metrics, composite-indexes, statistics-collection]
  affects: [OL_COLUMN_LINEAGE, recursive-cte-queries]
tech_stack:
  added: [composite-secondary-indexes, statistics-collection]
  patterns: [teradata-native-optimization]
key_files:
  created:
    - .planning/phases/04-database-query-optimization/04-01-BASELINE.md
    - database/scripts/setup/collect_statistics.py
  modified:
    - database/scripts/setup/setup_lineage_schema.py
decisions:
  - Kept existing single-column indexes alongside composite indexes (research guidance)
  - Used NO SAMPLE for statistics collection (table < 1M rows)
  - Added test data setup as blocking issue (Rule 3 deviation)
metrics:
  duration: 271
  completed: 2026-02-16T01:13:14Z
  tasks: 3
  files: 3
  commits: 3
---

# Phase 04 Plan 01: Baseline Performance and Index Creation Summary

Established performance baseline and created Teradata-native composite indexes with statistics collection for lineage query optimization.

## Overview

**One-liner:** Captured 111-174ms baseline performance, created composite secondary indexes on join column pairs (target/source dataset+field), and collected statistics on all indexed columns to inform Teradata optimizer.

This plan establishes the foundation for Phase 04 database query optimization by:
1. Measuring current query performance before any optimization (baseline)
2. Creating composite secondary indexes matching exact join columns in recursive CTE traversal
3. Collecting statistics on all indexed columns to enable optimizer to use the new indexes

**Baseline metrics:** 111-174ms average for test data (169 rows). EXPLAIN plans show "all-AMPs RETRIEVE" with "all-rows scan" (full table scans), confirming no index usage before optimization. Path bytes averaged 16-67 bytes, validating that VARCHAR(4000) is oversized per research findings.

## Tasks Completed

### Task 1: Capture Baseline Performance Metrics

**What:** Ran benchmark_cte.py to establish pre-optimization performance metrics with EXPLAIN plans.

**Files:**
- Created: `.planning/phases/04-database-query-optimization/04-01-BASELINE.md`

**Results:**
- Performance range: 111.55ms (fastest) to 174.42ms (slowest) average
- Test datasets: CHAIN_TEST, FANOUT10_TEST, CYCLE5_TEST, FANIN10_TEST, NESTED_DIAMOND
- Depths tested: 5, 10, 15, 20
- EXPLAIN plans captured showing "all-AMPs RETRIEVE" and "all-rows scan" (no index usage)
- Path bytes: 16-67 bytes average (validates VARCHAR(4000) is 60-250x oversized)
- Table statistics: 169 total rows (80 production + 89 test records), 168 active

**Blocking issue (Rule 3):** Initial benchmark returned 0 rows because test data was missing. Auto-fixed by running:
- `setup_test_data.py` - Created medallion architecture test tables
- `insert_cte_test_data.py` - Inserted 89 CTE edge case test records (cycles, diamonds, fans)
- `populate_test_metadata.py` - Populated OpenLineage metadata for test datasets

**Commit:** b7a1ae8

### Task 2: Create Composite Secondary Indexes

**What:** Added composite index creation statements to setup_lineage_schema.py for lineage traversal join optimization.

**Files:**
- Modified: `database/scripts/setup/setup_lineage_schema.py`

**Changes:**
```python
# Composite indexes for join pair optimization (Phase 04)
# Upstream traversal: l.target_dataset = lp.source_dataset AND l.target_field = lp.source_field
"CREATE INDEX idx_ol_lineage_tgt_composite (target_dataset, target_field) ON {DATABASE}.OL_COLUMN_LINEAGE",

# Downstream traversal: l.source_dataset = lp.target_dataset AND l.source_field = lp.target_field
"CREATE INDEX idx_ol_lineage_src_composite (source_dataset, source_field) ON {DATABASE}.OL_COLUMN_LINEAGE",
```

**Indexes created:**
- `idx_ol_lineage_tgt_composite` on (target_dataset, target_field) - 64 unique combinations
- `idx_ol_lineage_src_composite` on (source_dataset, source_field) - 62 unique combinations

**Verification:** HELP INDEX confirmed both composite indexes exist alongside existing single-column indexes (9 total indexes on OL_COLUMN_LINEAGE).

**Decision:** Kept existing single-column indexes per research guidance (Open Question 4). May be needed for single-column filters. Teradata allows up to 32 indexes per table.

**Commit:** b89c826

### Task 3: Collect Statistics on Indexed Columns

**What:** Created collect_statistics.py script to run COLLECT STATISTICS on all indexed columns using NO SAMPLE for small tables.

**Files:**
- Created: `database/scripts/setup/collect_statistics.py`

**Statistics collected:**
1. Composite index: (target_dataset, target_field) - 64 unique combinations
2. Composite index: (source_dataset, source_field) - 62 unique combinations
3. Column: is_active - 2 unique values
4. Column: lineage_id - 89 unique values
5. Column: transformation_type - 5 unique values
6. Column: source_dataset - 17 unique values
7. Column: source_field - 30 unique values
8. Column: target_dataset - 17 unique values
9. Column: target_field - 28 unique values

**Total:** 10 column/index combinations collected (includes 1 index on all columns "*")

**Verification:** HELP STATISTICS confirmed all statistics collected on 2026-02-16 01:08:22-23.

**Critical per research:** Statistics MUST be collected immediately after index creation for optimizer to use indexes. Without statistics, optimizer defaults to full table scan even with indexes present (Pitfall 1).

**Commit:** 876032a

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Missing test data prevented baseline capture**
- **Found during:** Task 1, initial benchmark execution
- **Issue:** benchmark_cte.py returned 0 rows for all test datasets (CHAIN_TEST, FANOUT10_TEST, etc.). WARNING message: "Test data not found! Run: cd database && python insert_cte_test_data.py"
- **Fix:** Ran three setup scripts in sequence:
  1. `setup_test_data.py` - Created medallion architecture test tables (SRC→STG→DIM→FACT)
  2. `insert_cte_test_data.py` - Inserted 89 CTE edge case test records (cycles, diamonds, fan-outs/ins)
  3. `populate_test_metadata.py` - Populated OL_NAMESPACE, OL_DATASET, OL_DATASET_FIELD for test data
- **Files affected:** Database tables (no code files)
- **Rationale:** Test data is essential for capturing meaningful baseline metrics. Without it, benchmark would show incorrect performance (0 rows). This is a blocking issue that prevents task completion, falling under Rule 3 (auto-fix blocking issues).

## Verification

All success criteria met:

- ✅ Baseline performance metrics documented in 04-01-BASELINE.md (111-174ms average)
- ✅ EXPLAIN plans captured showing pre-optimization strategy (all-AMPs full table scans)
- ✅ Composite secondary indexes created: idx_ol_lineage_tgt_composite, idx_ol_lineage_src_composite
- ✅ Statistics collected on all indexed columns (10 column/index combinations)
- ✅ CTE queries verified working with new indexes (4 rows, max depth 4 for CHAIN_TEST)
- ✅ Database tests pass (100% pass rate excluding pre-existing skipped tests)

**HELP INDEX verification:**
```
Index 7: idx_ol_lineage_tgt_composite on (target_dataset, target_field)
Index 8: idx_ol_lineage_src_composite on (source_dataset, source_field)
```

**HELP STATISTICS verification:**
```
All 10 statistics collected on 2026-02-16 01:08:22-23
Composite indexes show 64 and 62 unique combinations respectively
```

## Key Observations

### Path VARCHAR Sizing
- Average path bytes: 16-67 bytes across all test datasets
- Current VARCHAR(4000) is 60-250x larger than actual usage
- Max depth found: 5 (CYCLE5_TEST)
- **Implication:** VARCHAR(4000) is severely oversized, causing unnecessary spool usage in recursive CTEs

### Baseline Performance Context
- Current baseline: 111-174ms for test data (169 rows)
- Research target: Reduce 50-55 seconds to 10-15 seconds for 600-node graphs
- **Gap:** Test data is much smaller than production scenario mentioned in research
- **Note:** 169 rows is insufficient to measure optimizer impact of composite indexes. Production data volume (600+ nodes) needed for realistic benchmarking.

### Index Strategy Validated
- Teradata syntax confirmed: `CREATE INDEX name (columns) ON table`
- Composite indexes match exact join columns in recursive CTE queries
- Statistics collection is critical - without it, optimizer ignores indexes (Pitfall 1)

## Next Steps

**Plan 02 will:**
1. Re-run benchmarks to measure performance improvement from composite indexes
2. Validate optimizer uses indexes via EXPLAIN (expect "index access" instead of "full table scan")
3. Optimize CTE query patterns if needed (LOCKING hints, path VARCHAR sizing)
4. Measure actual speedup achieved vs. baseline

**Production readiness:**
- Need actual production data volume to validate index benefit
- 169 rows may be too small for index overhead to be worthwhile
- Research Open Question 1: "What is actual row count in production OL_COLUMN_LINEAGE?"

## Files Changed

**Created:**
- `.planning/phases/04-database-query-optimization/04-01-BASELINE.md` - Baseline performance metrics with EXPLAIN plans
- `database/scripts/setup/collect_statistics.py` - Statistics collection automation script

**Modified:**
- `database/scripts/setup/setup_lineage_schema.py` - Added composite index creation statements

**Total:** 3 files (2 created, 1 modified)

## Technical Details

**Composite Index Syntax (Teradata):**
```sql
CREATE INDEX idx_name (col1, col2) ON database.table
-- NOT: CREATE INDEX idx_name ON database.table (col1, col2)
```

**Statistics Collection (NO SAMPLE for <1M rows):**
```sql
COLLECT STATISTICS ON database.OL_COLUMN_LINEAGE INDEX (target_dataset, target_field);
COLLECT STATISTICS ON database.OL_COLUMN_LINEAGE COLUMN (is_active);
```

**CTE Join Patterns Optimized:**
- Upstream: `l.target_dataset = lp.source_dataset AND l.target_field = lp.source_field`
- Downstream: `l.source_dataset = lp.target_dataset AND l.source_field = lp.target_field`

Both patterns now have matching composite indexes.

---

**Duration:** 271 seconds (4.5 minutes)
**Completed:** 2026-02-16T01:13:14Z
**Commits:** b7a1ae8, b89c826, 876032a

## Self-Check: PASSED

All claims verified:
- ✓ Created files exist: 04-01-BASELINE.md, collect_statistics.py
- ✓ All commits exist: b7a1ae8, b89c826, 876032a
- ✓ Modified file confirmed: setup_lineage_schema.py in commit b89c826
