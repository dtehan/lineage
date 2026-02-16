# Phase 4: Database Query Optimization - Research

**Researched:** 2026-02-15
**Domain:** Teradata recursive CTE performance optimization
**Confidence:** MEDIUM

## Summary

Phase 4 focuses on optimizing Teradata recursive CTE queries for lineage traversal, targeting a 3.7-5.5x speedup (from 50-55s to 10-15s) for 600-node database-level lineage graphs. The optimization strategy centers on three Teradata-native approaches: composite secondary indexing on join pairs, statistics collection on indexed columns, and integer-based path tracking for cycle detection instead of VARCHAR string concatenation.

Teradata provides USI (Unique Secondary Index) for two-AMP retrieval on unique columns, NUSI (Non-Unique Secondary Index) for all-AMP access, and join indexes for pre-joining tables. The optimizer uses COLLECT STATISTICS data to choose execution plans, and EXPLAIN analysis validates index usage. Current implementation uses VARCHAR(4000) path columns with POSITION() for cycle detection and lacks indexes on the critical join columns (source_dataset, source_field, target_dataset, target_field).

**Primary recommendation:** Create composite secondary indexes on (target_dataset, target_field) and (source_dataset, source_field) join pairs in OL_COLUMN_LINEAGE, collect statistics on all indexed columns using COLLECT STATISTICS with NO SAMPLE for small tables (<1M rows), validate optimizer usage via EXPLAIN showing "index access" instead of "full table scan", and refactor cycle detection to use integer-based path tracking instead of VARCHAR concatenation.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Teradata-Native Constraint:**
- All optimizations must use Teradata-specific features and syntax
- No generic SQL or features from other database systems
- Use Teradata's native indexing (USI, NUSI, join indexes)
- Use Teradata's `COLLECT STATISTICS` command for statistics
- Work within Teradata's recursive CTE implementation and limitations

**Testing Requirement:**
- All performance improvements must be tested on actual Teradata database
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

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.

</user_constraints>

## Standard Stack

### Core Components

| Component | Version | Purpose | Why Standard |
|-----------|---------|---------|--------------|
| Teradata Database | 16.0+ | Data warehouse and query engine | Provides QVCI, recursive CTEs, optimizer |
| teradatasql | 17.20+ | Python database driver | Official Teradata Python connector |
| benchmark_cte.py | Current | Performance measurement script | Existing in `database/scripts/utils/` |

### Teradata Index Types

| Index Type | Purpose | Access Pattern | When to Use |
|------------|---------|----------------|-------------|
| USI (Unique Secondary Index) | Unique lookups | Two-AMP retrieval | Columns with unique values, equality WHERE clauses |
| NUSI (Non-Unique Secondary Index) | Non-unique lookups | All-AMP operation | Frequently queried non-unique columns |
| Composite Index | Multi-column lookups | Matches leftmost columns | Join pairs, multi-column WHERE clauses |
| Join Index | Pre-joined results | Optimizer chooses | Expensive joins executed frequently |

**Key insight:** USI provides fastest access (two-AMP) but requires unique values. For lineage traversal joins on (source_dataset, source_field) and (target_dataset, target_field), composite NUSI indexes are appropriate since these column combinations are not unique (multiple transformations can exist for same source/target pair).

**Installation:** Already available (Teradata 16.0+ with QVCI enabled, teradatasql Python driver installed)

## Architecture Patterns

### Current Implementation Structure

```
database/
├── scripts/
│   ├── setup/
│   │   └── setup_lineage_schema.py    # Creates OL_* tables with basic indexes
│   ├── utils/
│   │   └── benchmark_cte.py            # Performance measurement tool
│   └── tests/
│       └── run_tests.py                # 73 database tests including cycle detection
└── OL_COLUMN_LINEAGE table (core)      # ~114 rows currently, no composite indexes
```

### Pattern 1: Composite Index Creation for Join Pairs

**What:** Create multi-column indexes on exact column combinations used in CTE joins

**When to use:** When joins consistently use the same column pairs (source_dataset + source_field, target_dataset + target_field)

**Example:**
```sql
-- Teradata syntax: CREATE INDEX name (columns) ON table
-- Upstream traversal join: l.target_dataset = lp.source_dataset AND l.target_field = lp.source_field
CREATE INDEX idx_ol_lineage_tgt_composite (target_dataset, target_field)
ON demo_user.OL_COLUMN_LINEAGE;

-- Downstream traversal join: l.source_dataset = lp.target_dataset AND l.source_field = lp.target_field
CREATE INDEX idx_ol_lineage_src_composite (source_dataset, source_field)
ON demo_user.OL_COLUMN_LINEAGE;
```

**Why it works:** Teradata optimizer can use composite index for multi-column equality joins, avoiding full table scans on each recursive iteration.

**Source:** [3 ways to use Indexes in Teradata](https://www.packtpub.com/en-us/learning/how-to-tutorials/3-ways-to-use-indexes-in-teradata-to-improve-database-performance/)

### Pattern 2: Statistics Collection Strategy

**What:** Collect statistics on indexed columns to inform optimizer cost estimates

**When to use:** After index creation, after significant data changes (>10% row changes)

**Example:**
```sql
-- Full table scan for small tables (<1M rows)
COLLECT STATISTICS ON demo_user.OL_COLUMN_LINEAGE
INDEX (target_dataset, target_field);

COLLECT STATISTICS ON demo_user.OL_COLUMN_LINEAGE
INDEX (source_dataset, source_field);

-- Column-level statistics (for optimizer cardinality estimation)
COLLECT STATISTICS ON demo_user.OL_COLUMN_LINEAGE COLUMN (is_active);
COLLECT STATISTICS ON demo_user.OL_COLUMN_LINEAGE COLUMN (lineage_id);
```

**Why it works:** Teradata optimizer uses statistics to choose between full table scan vs index access. Without statistics, optimizer may ignore indexes even when available.

**Source:** [Teradata Statistics Best Practices](https://www.dwhpro.com/teradata-statistics-3/), [Teradata COLLECT STATISTICS Documentation](https://docs.teradata.com/r/e79ET77~NzPDz~Ykinj44w/CxCriiv87~m6ILK8cR7tuA)

### Pattern 3: EXPLAIN Analysis for Index Validation

**What:** Use EXPLAIN before and after optimization to validate index usage

**When to use:** After index creation, before declaring optimization successful

**Example:**
```sql
-- Add EXPLAIN before query
EXPLAIN
WITH RECURSIVE lineage_path (...) AS (
  SELECT ... FROM demo_user.OL_COLUMN_LINEAGE l
  WHERE l.target_dataset = 'demo_user.CHAIN_TEST'
  ...
)
SELECT * FROM lineage_path;
```

**Look for in output:**
- "index access" or "secondary index" (GOOD - using indexes)
- "full table scan" or "all-AMPs" (BAD - not using indexes)
- "two-AMP retrieve" (BEST - USI usage, not applicable here)

**Why it works:** EXPLAIN shows actual query execution plan that will be used, confirming optimizer chose index path over full table scan.

**Source:** [Teradata EXPLAIN Guide](https://www.dwhpro.com/teradata-explain/), [How to Analyze Query Plan with EXPLAIN](https://www.linkedin.com/advice/0/how-can-you-analyze-query-plan-using-explain-ors0f)

### Pattern 4: Integer-Based Cycle Detection

**What:** Replace VARCHAR path concatenation with integer array or bitmask for cycle detection

**Current approach (slow):**
```sql
-- VARCHAR(4000) path column, string concatenation
CAST(l.lineage_id AS VARCHAR(4000)) AS path  -- Base case
lp.path || ',' || l.lineage_id                -- Recursive case
POSITION(l.lineage_id IN lp.path) = 0         -- Cycle check
```

**Optimized approach (faster):**
```sql
-- Option A: Store lineage_id sequence as VARBYTE (if lineage_id is INTEGER)
CAST(l.lineage_id AS VARBYTE(8000)) AS path  -- Base case
lp.path || CAST(l.lineage_id AS VARBYTE(8))   -- Recursive case
POSITION(CAST(l.lineage_id AS VARBYTE(8)) IN lp.path) = 0  -- Cycle check

-- Option B: Use comma-delimited integer string (simpler, benchmark vs VARCHAR)
CAST(l.lineage_id AS VARCHAR(2000)) AS path  -- Reduced from 4000
lp.path || ',' || l.lineage_id
POSITION(',' || TRIM(l.lineage_id) || ',' IN ',' || lp.path || ',') = 0
```

**Why it works:** Integer operations and comparisons are faster than string operations. Smaller data types reduce memory usage and spool space in recursive iterations.

**Trade-offs:**
- Option A: Faster but requires lineage_id to be numeric (currently VARCHAR(64))
- Option B: Simpler to implement, still reduces VARCHAR size from 4000 to fit actual graph depth

**Note:** Current `lineage_id` is VARCHAR(64), may contain UUIDs. Need to assess if integer IDs feasible or if VARCHAR optimization is sufficient.

**Source:** [Mastering Teradata Recursive Queries](https://www.dwhpro.com/teradata-recursive-queries/)

### Anti-Patterns to Avoid

- **Creating indexes before understanding query patterns:** Index creation has overhead. Always profile queries first (EXPLAIN) to confirm joins and WHERE clauses.
- **Over-indexing:** Teradata limit of 32 indexes per table. Each index adds maintenance overhead on INSERT/UPDATE/DELETE.
- **Collecting statistics with SAMPLE on small tables:** Small tables (<1M rows) should use NO SAMPLE for accurate statistics. Sampling is for large tables only.
- **Assuming optimizer uses indexes without EXPLAIN validation:** Optimizer may choose full table scan if statistics are missing or stale, even with indexes present.
- **Ignoring LOCKING hints for concurrent access:** Without "LOCKING ROW FOR ACCESS", concurrent queries may encounter lock contention.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Query performance profiling | Custom timing logic, manual EXPLAIN parsing | benchmark_cte.py + EXPLAIN + HELPSTATS | Already exists in codebase, handles iterations, captures metrics, outputs markdown |
| Statistics staleness detection | Custom timestamp tracking | HELP STATISTICS command | Teradata built-in command shows collection dates, recommends re-collection |
| Index selection for composite keys | Trial-and-error index creation | EXPLAIN with VERBOSE + query join patterns | EXPLAIN shows actual optimizer decisions, VERBOSE adds hash field details |
| Recursive query timeout handling | Application-level timeout | SET QUERY_BAND='QueryTimeout=30;' FOR SESSION | Teradata native timeout at session level, cleaner than app-level interrupts |

**Key insight:** Teradata provides rich diagnostic commands (EXPLAIN, HELP STATISTICS, HELP STATS) that surface optimizer decisions and data quality issues. Use these instead of custom introspection logic.

## Common Pitfalls

### Pitfall 1: Statistics Not Collected After Index Creation

**What goes wrong:** Create index, expect performance improvement, see no change in query execution time. EXPLAIN still shows "full table scan".

**Why it happens:** Teradata optimizer relies on statistics to cost-estimate index access vs full table scan. Without statistics on index columns, optimizer defaults to full table scan (assumes worst case).

**How to avoid:** Always run COLLECT STATISTICS immediately after CREATE INDEX, then verify with EXPLAIN that index is being used.

**Warning signs:**
- EXPLAIN output shows "full table scan" despite index existing
- HELP STATISTICS shows NULL collection dates for index columns
- Query performance unchanged after index creation

**Source:** [Teradata Statistics Common Misconceptions](https://www.dwhpro.com/teradata-statistics-3/)

### Pitfall 2: Single-Column Indexes on Multi-Column Joins

**What goes wrong:** Create separate indexes on source_dataset and source_field, expect join optimization, still see slow queries.

**Why it happens:** Teradata can use composite indexes for multi-column equality joins, but single-column indexes require optimizer to choose one index, then filter remaining rows. Less efficient than composite index matching both columns.

**How to avoid:** Create composite index on exact column order used in JOIN ON clause: (source_dataset, source_field) or (target_dataset, target_field).

**Warning signs:**
- EXPLAIN shows "index access on column A, followed by filter on column B"
- Performance improvement less than expected (2x instead of 5x)
- Multiple single-column indexes exist but composite is missing

**Source:** [Teradata Multi-Column Secondary Index](https://docs.teradata.com/r/Enterprise_IntelliFlex_VMware/SQL-Fundamentals/Database-Objects/Secondary-Indexes/Multiple-Secondary-Indexes-and-Composites)

### Pitfall 3: VARCHAR Path Column Oversizing

**What goes wrong:** Define path column as VARCHAR(4000), recursive query fills spool space, query fails with "out of spool" error.

**Why it happens:** Each recursive iteration stores full path for every intermediate row. VARCHAR(4000) * rows * iterations = massive spool usage. Most graph depths are <20 levels, actual path length is typically <500 bytes.

**How to avoid:** Size VARCHAR path column to 2x expected max depth. For depth=20 with 10-character IDs and commas, max path = 20 * 11 = 220 bytes. Use VARCHAR(500) instead of VARCHAR(4000).

**Warning signs:**
- "Out of spool space" errors on recursive queries
- AVG(CHARACTER_LENGTH(path)) in benchmark results shows <500 but column is VARCHAR(4000)
- EXPLAIN shows large "spool file estimates"

**Source:** [Teradata Recursive Query for Performance Tuning](https://www.dwhpro.com/teradata-recursive-query/)

### Pitfall 4: Missing is_active Filter in Recursive Join

**What goes wrong:** Base query filters `is_active = 'Y'`, but recursive join doesn't, traversal includes deactivated lineage relationships.

**Why it happens:** Recursive CTE has two parts: base query (seed) and recursive query. Filter must be in BOTH parts, not just base query.

**How to avoid:** Add `WHERE l.is_active = 'Y'` to both base SELECT and recursive SELECT in WITH RECURSIVE block.

**Warning signs:**
- Row counts from queries don't match manually counted active relationships
- Cycle detection triggers on deleted relationships
- Benchmark results show more rows than expected active relationships

**Source:** Current codebase (benchmark_cte.py correctly includes is_active in both parts)

### Pitfall 5: Testing on Empty or Minimal Test Data

**What goes wrong:** Optimize queries, benchmark on small test datasets (10 rows), declare success, production queries with 10K rows still slow.

**Why it happens:** Teradata optimizer may choose different plans based on cardinality. Full table scan is fast on 10 rows. Indexes only help at scale (1K+ rows).

**How to avoid:** Benchmark on realistic data volumes matching production. If production has 10K lineage rows, test data should have at least 1K rows with similar graph structure (fan-outs, diamonds, cycles).

**Warning signs:**
- Benchmark shows 5x speedup but production unchanged
- EXPLAIN plans differ between test and production environments
- Test data all fits in cache, production doesn't

**Source:** [Optimizing Teradata Performance through Statistics and Primary Index Selection](https://www.dwhpro.com/optimal-performance-with-teradata/)

## Code Examples

Verified patterns from Teradata documentation and codebase:

### Composite Index Creation (Teradata Syntax)

```sql
-- Teradata syntax: CREATE INDEX name (columns) ON table
-- NOT: CREATE INDEX name ON table (columns) -- This is PostgreSQL/MySQL syntax

-- Composite index for upstream traversal (joins on target columns)
CREATE INDEX idx_ol_lineage_tgt_composite (target_dataset, target_field)
ON demo_user.OL_COLUMN_LINEAGE;

-- Composite index for downstream traversal (joins on source columns)
CREATE INDEX idx_ol_lineage_src_composite (source_dataset, source_field)
ON demo_user.OL_COLUMN_LINEAGE;

-- Active record filter (frequently used in WHERE)
CREATE INDEX idx_ol_lineage_active (is_active)
ON demo_user.OL_COLUMN_LINEAGE;
```

**Source:** Existing setup_lineage_schema.py (correct syntax), [Teradata Secondary Index Documentation](https://www.tutorialspoint.com/teradata/teradata_secondary_index.htm)

### Statistics Collection with Validation

```sql
-- Collect statistics on composite index (NO SAMPLE for tables <1M rows)
COLLECT STATISTICS ON demo_user.OL_COLUMN_LINEAGE
INDEX (target_dataset, target_field);

COLLECT STATISTICS ON demo_user.OL_COLUMN_LINEAGE
INDEX (source_dataset, source_field);

-- Collect column-level statistics for optimizer cardinality estimates
COLLECT STATISTICS ON demo_user.OL_COLUMN_LINEAGE COLUMN (is_active);
COLLECT STATISTICS ON demo_user.OL_COLUMN_LINEAGE COLUMN (transformation_type);

-- Validate statistics were collected
HELP STATISTICS demo_user.OL_COLUMN_LINEAGE;

-- Check for stale statistics (collection date in past, row count changed significantly)
SELECT DatabaseName, TableName, ColumnName, CollectTimeStamp, UniqueValueCount
FROM DBC.StatsV
WHERE DatabaseName = 'demo_user'
  AND TableName = 'OL_COLUMN_LINEAGE';
```

**Source:** [Teradata COLLECT STATISTICS Guide](https://www.teradatapoint.com/teradata/teradata-collect-statistics.htm), [Teradata Documentation](https://docs.teradata.com/r/e79ET77~NzPDz~Ykinj44w/CxCriiv87~m6ILK8cR7tuA)

### EXPLAIN Analysis with Index Validation

```sql
-- Run EXPLAIN before query to see execution plan
EXPLAIN
WITH RECURSIVE lineage_path (
    lineage_id, source_dataset, source_field, target_dataset, target_field,
    depth, path
) AS (
    SELECT
        l.lineage_id, l.source_dataset, l.source_field,
        l.target_dataset, l.target_field,
        1 AS depth,
        CAST(l.lineage_id AS VARCHAR(500)) AS path
    FROM demo_user.OL_COLUMN_LINEAGE l
    WHERE l.target_dataset = 'demo_user.CHAIN_TEST'
      AND l.target_field = 'col_a'
      AND l.is_active = 'Y'

    UNION ALL

    SELECT
        l.lineage_id, l.source_dataset, l.source_field,
        l.target_dataset, l.target_field,
        lp.depth + 1,
        lp.path || ',' || l.lineage_id
    FROM demo_user.OL_COLUMN_LINEAGE l
    INNER JOIN lineage_path lp
        ON l.target_dataset = lp.source_dataset
        AND l.target_field = lp.source_field
    WHERE l.is_active = 'Y'
        AND lp.depth < 10
        AND POSITION(l.lineage_id IN lp.path) = 0
)
SELECT * FROM lineage_path;

-- Look for in EXPLAIN output:
-- ✓ "index used: idx_ol_lineage_tgt_composite" (GOOD)
-- ✓ "secondary index access" (GOOD)
-- ✗ "full table scan" (BAD - index not being used)
-- ✗ "all-AMPs retrieve" without index mention (BAD)
```

**Source:** [Teradata EXPLAIN Statement Guide](https://www.dwhpro.com/teradata-explain/), current benchmark_cte.py (run_explain function)

### Concurrent Access with Locking Hint

```sql
-- Add LOCKING ROW FOR ACCESS before WITH RECURSIVE
LOCKING ROW FOR ACCESS
WITH RECURSIVE lineage_path (...) AS (
  ...
)
SELECT * FROM lineage_path;
```

**Why:** Prevents write locks during read-only queries, allows concurrent access without lock contention. Satisfies DBQUERY-04 requirement.

**Source:** Current benchmark_cte.py (build_locking_query function), [Teradata Locking Documentation](https://docs.teradata.com/search/documents?query=LOCKING+ROW+FOR+ACCESS)

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single-column indexes on each join column | Composite indexes on join column pairs | Ongoing best practice | 2-5x performance improvement on multi-column equality joins |
| SAMPLE statistics collection on all tables | NO SAMPLE for small tables, SYSTEM SAMPLE for large (>1M rows) | Teradata 15.10+ | More accurate optimizer decisions on small-to-medium tables |
| VARCHAR(4000) for all path columns | Size VARCHAR to 2x actual max depth | Teradata 16.0+ (recursive CTE enhancements) | Reduced spool usage, fewer "out of spool" errors |
| HELP STATISTICS command only | EXPLAIN with HELPSTATS flag | Teradata 16.20+ | EXPLAIN now recommends statistics to collect |

**Deprecated/outdated:**
- Single-column indexes for multi-column joins: Still works, but composite indexes are more efficient
- Ignoring statistics collection: Modern Teradata optimizer heavily relies on statistics, unlike older cost-based optimizers that used heuristics

**Note:** Research results primarily from 2020-2023 documentation. No significant changes expected in 2026 as Teradata's optimizer architecture is stable. QVCI (required for this project) was introduced in TD16.0 and is now standard.

## Open Questions

1. **What is the actual row count in production OL_COLUMN_LINEAGE?**
   - What we know: Current database has ~114 rows (from STATE.md context)
   - What's unclear: Is this representative of production? Requirement mentions "600-node database-level lineage" but unclear if that's 600 rows in OL_COLUMN_LINEAGE or 600 total nodes in graph
   - Recommendation: Clarify production data volume expectations. If production will have 10K+ rows, need to populate larger test dataset for realistic benchmarking. If staying at ~100 rows, index overhead may exceed index benefit.

2. **Is lineage_id VARCHAR(64) storing UUIDs or could it be INTEGER?**
   - What we know: Schema defines lineage_id as VARCHAR(64), benchmark_cte.py uses it in path column
   - What's unclear: Actual format/pattern of lineage_id values. If UUIDs (36 chars), integer-based cycle detection not feasible. If sequential integers, can optimize to VARBYTE or INTEGER paths.
   - Recommendation: Check populate_lineage.py to see how lineage_id is generated. If UUID, proceed with VARCHAR optimization only (reduce from 4000 to 500). If integer, implement integer-based cycle detection.

3. **What is the actual maximum graph depth in production lineage?**
   - What we know: Benchmark tests depths 5, 10, 15, 20. Current recursive CTE limit is 5 (default) or 10 (max recommended per STATE.md).
   - What's unclear: Real-world lineage depth in production queries. ETL pipelines typically have 3-8 transformation layers (bronze->silver->gold, then feature engineering). Depth=20 may be excessive.
   - Recommendation: Analyze production lineage paths to measure actual depth distribution. Size VARCHAR path column accordingly (2x max observed depth). This directly impacts ADVANCED-01 requirement (path column sizing) which is currently deferred to v2.

4. **Should existing single-column indexes be dropped after composite indexes created?**
   - What we know: setup_lineage_schema.py creates single-column indexes on source_dataset, source_field, target_dataset, target_field. Teradata limit is 32 indexes per table.
   - What's unclear: Do composite indexes make single-column indexes redundant? Are there queries that filter on only one column (e.g., WHERE source_dataset = X without source_field)?
   - Recommendation: Keep single-column indexes initially, benchmark with and without, measure index maintenance overhead. Only drop if: (1) composite indexes fully cover query patterns, (2) index count approaches 32 limit, (3) INSERT/UPDATE performance degrades from index maintenance.

## Sources

### Primary (HIGH confidence)

- [Teradata SQL Fundamentals - Recursive Queries (Official Docs)](https://docs.teradata.com/r/Enterprise_IntelliFlex_VMware/SQL-Fundamentals/SQL-Data-Definition-Control-and-Manipulation/Recursive-Queries)
- [Collecting Statistics - Teradata Database Administration (Official Docs)](https://docs.teradata.com/r/e79ET77~NzPDz~Ykinj44w/CxCriiv87~m6ILK8cR7tuA)
- [Multiple Secondary Indexes and Composites (Official Docs)](https://docs.teradata.com/r/Enterprise_IntelliFlex_VMware/SQL-Fundamentals/Database-Objects/Secondary-Indexes/Multiple-Secondary-Indexes-and-Composites)
- Current codebase: `database/scripts/utils/benchmark_cte.py`, `database/scripts/setup/setup_lineage_schema.py`

### Secondary (MEDIUM confidence)

- [Optimizing Teradata Performance through Statistics and Primary Index Selection](https://www.dwhpro.com/optimal-performance-with-teradata/)
- [Understanding The Teradata Join Index: Benefits, Usage, And Implementation](https://www.dwhpro.com/teradata-join-index/)
- [A Comprehensive Guide To Teradata Statistics](https://www.dwhpro.com/teradata-statistics-3/)
- [Teradata EXPLAIN Statement: A Guide to Optimizing SQL Performance](https://www.dwhpro.com/teradata-explain/)
- [Mastering Teradata Recursive Queries](https://www.dwhpro.com/teradata-recursive-queries/)
- [The Teradata Recursive Query for Performance Tuning](https://www.dwhpro.com/teradata-recursive-query/)
- [Teradata COLLECT STATISTICS Guide](https://www.teradatapoint.com/teradata/teradata-collect-statistics.htm)
- [3 ways to use Indexes in Teradata to improve database performance](https://www.packtpub.com/en-us/learning/how-to-tutorials/3-ways-to-use-indexes-in-teradata-to-improve-database-performance/)
- [Teradata Secondary Index Tutorial](https://www.tutorialspoint.com/teradata/teradata_secondary_index.htm)
- [How to Analyze a Query Plan with EXPLAIN in Teradata](https://www.linkedin.com/advice/0/how-can-you-analyze-query-plan-using-explain-ors0f)

### Tertiary (LOW confidence)

- [Recursive SQL Query Optimization with k-Iteration Lookahead](https://link.springer.com/chapter/10.1007/11827405_34) - Academic paper from 2006, may not reflect current Teradata implementation
- [Adaptive optimizations of recursive queries in Teradata (ACM SIGMOD 2012)](https://dl.acm.org/doi/10.1145/2213836.2213966) - Academic research, describes Teradata's internal approach but not actionable configuration

## Metadata

**Confidence breakdown:**
- Standard stack: MEDIUM - Teradata features well-documented but no 2026-specific updates found, relying on 2020-2023 docs
- Architecture: MEDIUM - Patterns verified in official docs and current codebase, but production data volume unknown
- Pitfalls: MEDIUM - Common issues documented across multiple sources, matches codebase patterns

**Research date:** 2026-02-15
**Valid until:** 2026-09-15 (6 months - Teradata optimizer logic stable, unlikely to change significantly)

**Limitations:**
- No access to actual production OL_COLUMN_LINEAGE data to validate row counts and graph structure
- lineage_id format unknown (UUID vs integer) - impacts path optimization strategy
- Maximum graph depth in production unknown - impacts VARCHAR sizing recommendation
- No 2026-specific Teradata documentation available - relying on stable features from TD16.0+
