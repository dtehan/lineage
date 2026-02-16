# Phase 4: Database Query Optimization - Context

**Gathered:** 2026-02-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Optimize Teradata recursive CTE queries for lineage traversal, reducing execution time from 50-55 seconds to 10-15 seconds through database-level optimizations: composite indexing, statistics collection, and path-based cycle detection improvements.

This phase focuses on database query performance optimization only. Frontend optimizations and caching are separate phases.

</domain>

<decisions>
## Implementation Decisions

### Teradata-Native Constraint
- **All optimizations must use Teradata-specific features and syntax**
- No generic SQL or features from other database systems
- Use Teradata's native indexing (USI, NUSI, join indexes)
- Use Teradata's `COLLECT STATISTICS` command for statistics
- Work within Teradata's recursive CTE implementation and limitations

### Testing Requirement
- **All performance improvements must be tested on actual Teradata database**
- No emulators or other database systems for validation
- Use `benchmark_cte.py` for performance measurement on Teradata
- All 73 existing database tests must continue to pass
- Cycle detection correctness must be preserved (CYCLE5_TEST, NESTED_DIAMOND, FANOUT10_TEST)

### Claude's Discretion
- Index strategy decisions (which columns, composite vs single, primary vs foreign key indexes)
- Statistics collection approach (frequency, automation, which tables/columns, staleness thresholds)
- Path optimization implementation (integer vs string for cycle detection, storage approach, memory vs performance trade-offs)
- Performance measurement methodology (benchmark approach, success thresholds, before/after comparison)
- Rollback and safety considerations during optimization
- Query plan analysis approach (EXPLAIN usage, validation of index utilization)

</decisions>

<specifics>
## Specific Ideas

- `benchmark_cte.py` exists in database/scripts/utils/ for performance measurement
- Current baseline: 600-node database-level lineage queries take 50-55 seconds
- Target: Reduce to 10-15 seconds (3.7-5.5x speedup)
- OpenLineage tables to optimize: OL_COLUMN_LINEAGE (primary), OL_DATASET_FIELD, OL_DATASET
- Existing recursive CTEs use path-based cycle detection (string concatenation)
- Success validated via EXPLAIN showing index usage on all join pairs

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 04-database-query-optimization*
*Context gathered: 2026-02-15*
