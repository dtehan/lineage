# CTE Performance Baseline Results

**Phase:** 17-01 CTE Performance Optimization
**Date:** 2026-01-31
**Environment:** ClearScape Analytics (test-sad3sstx4u4llczi.env.clearscape.teradata.com)

## Benchmark Configuration

| Setting | Value |
|---------|-------|
| Teradata Environment | ClearScape Analytics (test instance) |
| Depths Tested | 5, 10, 15, 20 (per PERF-CTE-01) |
| Iterations | 3 per test |
| Test Date | 2026-01-31 |

### Table Statistics

| Metric | Count |
|--------|-------|
| Total OL_COLUMN_LINEAGE records | 165 |
| Test records (TEST_* prefix) | 89 |
| Active records (is_active='Y') | 164 |

### Test Datasets

| Dataset | Pattern | Direction | Description |
|---------|---------|-----------|-------------|
| CHAIN_TEST | Linear | Upstream | 4-level chain (E->D->C->B->A) |
| FANOUT10_TEST | Wide | Downstream | 1 source -> 10 targets |
| CYCLE5_TEST | Cyclic | Downstream | 5-node cycle (A->B->C->D->E->A) |
| FANIN10_TEST | Wide | Upstream | 10 sources -> 1 target |
| NESTED_DIAMOND | Diamond | Upstream | Nested diamond pattern (7 nodes) |

## Baseline Results

| Dataset | Direction | Depth | Min (ms) | Avg (ms) | Max (ms) | Rows | Max Depth | Path Bytes |
|---------|-----------|-------|----------|----------|----------|------|-----------|------------|
| CHAIN_TEST | upstream | 5 | 125.60 | 182.65 | 211.42 | 4 | 4 | 36 |
| CHAIN_TEST | upstream | 10 | 186.84 | 202.42 | 230.32 | 4 | 4 | 36 |
| CHAIN_TEST | upstream | 15 | 148.59 | 175.86 | 190.16 | 4 | 4 | 36 |
| CHAIN_TEST | upstream | 20 | 146.95 | 175.56 | 189.88 | 4 | 4 | 36 |
| FANOUT10_TEST | downstream | 5 | 105.16 | 133.83 | 148.20 | 10 | 1 | 17 |
| FANOUT10_TEST | downstream | 10 | 84.83 | 126.37 | 147.35 | 10 | 1 | 17 |
| FANOUT10_TEST | downstream | 15 | 84.13 | 155.14 | 190.67 | 10 | 1 | 17 |
| FANOUT10_TEST | downstream | 20 | 83.49 | 126.28 | 147.78 | 10 | 1 | 17 |
| CYCLE5_TEST | downstream | 5 | 148.45 | 182.69 | 210.35 | 5 | 5 | 47 |
| CYCLE5_TEST | downstream | 10 | 148.22 | 183.16 | 211.57 | 5 | 5 | 47 |
| CYCLE5_TEST | downstream | 15 | 148.00 | 210.18 | 272.41 | 5 | 5 | 47 |
| CYCLE5_TEST | downstream | 20 | 188.43 | 209.83 | 230.65 | 5 | 5 | 47 |
| FANIN10_TEST | upstream | 5 | 83.12 | 125.93 | 147.68 | 10 | 1 | 16 |
| FANIN10_TEST | upstream | 10 | 105.76 | 140.40 | 167.57 | 10 | 1 | 16 |
| FANIN10_TEST | upstream | 15 | 126.51 | 167.68 | 209.39 | 10 | 1 | 16 |
| FANIN10_TEST | upstream | 20 | 83.36 | 132.82 | 168.01 | 10 | 1 | 16 |
| NESTED_DIAMOND | upstream | 5 | 167.49 | 216.59 | 293.33 | 12 | 4 | 67 |
| NESTED_DIAMOND | upstream | 10 | 273.64 | 294.96 | 337.53 | 12 | 4 | 67 |
| NESTED_DIAMOND | upstream | 15 | 126.18 | 321.81 | 481.28 | 12 | 4 | 67 |
| NESTED_DIAMOND | upstream | 20 | 188.77 | 189.90 | 190.60 | 12 | 4 | 67 |

### Summary Statistics

| Metric | Value |
|--------|-------|
| Tests run | 20 |
| Successful | 20 |
| Errors | 0 |
| Overall avg time | 182.70ms |
| Fastest query | 125.93ms (FANIN10_TEST, depth 5) |
| Slowest query | 321.81ms (NESTED_DIAMOND, depth 15) |

### Performance by Depth

| Depth | Average Time (ms) |
|-------|-------------------|
| 5 | 168.34 |
| 10 | 189.46 |
| 15 | 206.13 |
| 20 | 166.88 |

## Performance Analysis

### 1. Depth Threshold Analysis

**Observation:** Performance does not degrade linearly with max_depth parameter.

- Depths 5-15 show increasing average times (168ms -> 206ms)
- Depth 20 shows *lower* average (166ms) than depth 15

**Analysis:** This counter-intuitive result indicates:
1. The test data has limited actual depth (max 4-5 levels)
2. Query optimizer may short-circuit when recursion terminates early
3. Variance in results suggests ClearScape cloud environment variability

**Depth Limit Recommendation:** Current test data reaches max 5 levels, so depth parameter has minimal impact. For larger production graphs, expect linear performance degradation with actual traversal depth.

### 2. Pattern Comparison

| Pattern | Avg Time Range | Characteristic |
|---------|----------------|----------------|
| Fan-out (FANOUT10) | 126-155ms | Fastest - shallow (depth 1) |
| Fan-in (FANIN10) | 126-168ms | Fast - shallow (depth 1) |
| Linear (CHAIN) | 175-202ms | Moderate - 4 levels |
| Cyclic (CYCLE5) | 182-210ms | Moderate - cycle detection overhead |
| Diamond (NESTED) | 189-321ms | Slowest - path concatenation overhead |

**Key Finding:** Diamond patterns show highest variance and longest times, likely due to:
1. Multiple paths to same nodes requiring longer path strings
2. More complex POSITION() lookups against longer paths
3. Higher row counts per recursion level (12 rows vs 4-10)

### 3. Cyclic vs Acyclic Performance

| Pattern | Cycle Detection Active | Avg Time |
|---------|------------------------|----------|
| CHAIN_TEST | No (linear) | 184ms |
| CYCLE5_TEST | Yes (terminates) | 196ms |

**Observation:** Cycle detection via `POSITION(lineage_id IN path) = 0` adds ~6% overhead (12ms) compared to linear traversal. This is acceptable given the protection against infinite loops.

## Bottleneck Identification (PERF-CTE-02)

### 1. Path Concatenation Overhead

**Metric:** Path column bytes correlates with query complexity.

| Dataset | Avg Path Bytes | Performance Impact |
|---------|----------------|-------------------|
| FANIN10_TEST | 16 | Fast (short IDs) |
| FANOUT10_TEST | 17 | Fast |
| CHAIN_TEST | 36 | Moderate |
| CYCLE5_TEST | 47 | Moderate (5 IDs concatenated) |
| NESTED_DIAMOND | 67 | Slowest (multiple paths) |

**Bottleneck:** VARCHAR(4000) path column concatenation grows with depth. Each recursion adds `',' || lineage_id` (~15-20 chars). At depth 20 with long IDs, path could reach 400+ bytes.

**Optimization Candidate:** Consider hash-based cycle detection instead of string path.

### 2. POSITION Function Search Overhead

**Observation:** `POSITION(l.lineage_id IN lp.path)` performs string search within path column.

- Linear search through path string
- Grows with path length and recursion depth
- Called for every row in every recursion iteration

**Optimization Candidate:**
1. Use integer array instead of string for visited IDs
2. Consider SET-based cycle detection (if Teradata supports)
3. Limit path to fixed number of most recent IDs

### 3. AMP Distribution (from EXPLAIN)

```
We do an all-AMPs RETRIEVE step in TD_MAP1 from demo_user.l by way of
an all-rows scan with a condition of ("(demo_user.l.is_active = 'Y')
AND ((demo_user.l.target_field = '...') AND (demo_user.l.target_dataset = '...'))")
```

**Bottleneck:** All-rows scan on OL_COLUMN_LINEAGE for each recursion.

**Optimization Candidates:**
1. Add secondary index on (target_dataset, target_field) for upstream queries
2. Add secondary index on (source_dataset, source_field) for downstream queries
3. Consider NUSI (Non-Unique Secondary Index) for frequently accessed columns

### 4. Spool Space Usage

**Observation:** EXPLAIN shows intermediate results stored in spool:
- Spool 4: Base case results
- Spool 2: Accumulated recursive results
- Spool 5: Lineage table copy for joins

**Estimated spool per row:** ~1,728 bytes (from EXPLAIN)

**Scaling concern:** At 1000 rows x 20 depth = 20,000 potential spool rows
- Estimated: ~34MB spool space
- ClearScape test limits may throttle larger queries

## Baseline Conclusions

### Current Acceptable Depth Limit

| Scenario | Recommended Max Depth | Rationale |
|----------|----------------------|-----------|
| Interactive UI | 10 | <200ms target response time |
| Background analysis | 20 | Acceptable for batch processing |
| Large graphs (1000+ rows) | 5 | Prevent timeout/spool exhaustion |

### Identified Optimization Candidates (Priority Order)

| Priority | Optimization | Expected Improvement | Phase |
|----------|--------------|---------------------|-------|
| P1 | Add composite indexes | 30-50% reduction in scan time | 17-02 |
| P2 | Hash-based cycle detection | 20-30% reduction for deep graphs | 17-02 |
| P3 | Path column size reduction | 10-15% for long paths | 17-02 |
| P4 | Query result caching | 80-90% for repeated queries | 17-03 |

### Next Steps

1. **Plan 17-02:** Implement index optimizations and measure improvement
2. **Plan 17-03:** Add result caching layer for frequently accessed lineage
3. **Re-benchmark:** Run `benchmark_cte.py` after each optimization to measure impact

## Appendix: EXPLAIN Plan Summary

**Query Structure (all patterns similar):**

1. Lock OL_COLUMN_LINEAGE table for read
2. All-AMPs retrieve for base case with dataset/field filter
3. Store base case in Spool 4
4. **Recursive step:** Join Spool with OL_COLUMN_LINEAGE (all-rows scan)
5. Apply cycle detection filter: `POSITION(lineage_id IN path) = 0`
6. Accumulate results until depth limit or no more matches
7. Final aggregation (COUNT, MAX)

**Key Observation:** No index usage visible in EXPLAIN - all queries use "all-rows scan" which becomes expensive as OL_COLUMN_LINEAGE grows.
