# Backend Query Optimization Research

**Project:** Lineage - Column-Level Data Lineage for Teradata
**Researched:** 2026-02-15
**Focus:** Reducing recursive CTE query time from 60s to 2-4s

## Executive Summary

Teradata recursive CTE queries for lineage traversal are currently taking ~60 seconds across all graph types (column, table, database-level). Database-level graphs with 600 nodes are particularly slow. Research identifies four major optimization categories: (1) indexing strategies targeting join conditions and cycle detection, (2) query pattern optimizations including CTE structure and string operations, (3) database-level optimizations like statistics collection and lock management, and (4) application-level caching to avoid redundant database hits.

**Target:** Reduce end-to-end graph load time from 60s to 2-4s while preserving OpenLineage schema compatibility.

**Confidence:** HIGH for indexing and statistics recommendations (Teradata official docs + multiple sources), MEDIUM for query pattern optimizations (best practices verified across sources), MEDIUM for caching strategies (Redis best practices but not lineage-specific).

## Key Findings

### Critical Performance Bottlenecks

1. **Cycle Detection via POSITION()**: Current queries use `POSITION(column IN path) = 0` for cycle detection, where path grows with VARCHAR concatenation. This string operation becomes expensive at depth and is executed for every recursive iteration.

2. **Missing Composite Indexes**: Current schema has single-column indexes on `source_dataset`, `source_field`, `target_dataset`, `target_field`. Recursive CTEs join on **pairs** of columns (`source_dataset + source_field` OR `target_dataset + target_field`), so single-column indexes don't cover the join predicates.

3. **Stale or Missing Statistics**: Teradata optimizer requires current statistics on indexed columns to choose optimal join strategies. Without statistics, the optimizer may default to inefficient full table scans or product joins.

4. **VARCHAR Path Column Bloat**: Path columns use VARCHAR(10000) or VARCHAR(4000), which impacts spool space and comparison performance even when actual paths are shorter.

5. **Lock Contention**: Default READ locks on OL_COLUMN_LINEAGE table may cause unnecessary lock escalation in multi-user environments, reducing concurrency.

### Recommended Approach

Implement optimizations in phases with measurement between each:

**Phase 1: Indexing (highest impact)**
- Add composite secondary indexes for join pairs
- Add index on `lineage_id` for cycle detection
- Collect statistics on all indexed columns

**Phase 2: Query Patterns (medium impact)**
- Optimize cycle detection approach
- Add LOCKING ROW FOR ACCESS hints
- Rightsize VARCHAR path columns
- Add early filtering in base queries

**Phase 3: Caching (medium-high impact)**
- Implement Redis cache for frequently accessed lineage graphs
- Use cache-aside pattern with TTL
- Cache entire graph responses, not individual edges

**Phase 4: Materialization (if needed)**
- Consider join indexes for common traversal patterns
- Only if Phase 1-3 insufficient

## Indexing Strategies

### Current Index Coverage (from setup_lineage_schema.py)

```sql
-- OL_COLUMN_LINEAGE single-column indexes (lines 175-180)
CREATE INDEX idx_ol_lineage_src_ds (source_dataset) ON OL_COLUMN_LINEAGE
CREATE INDEX idx_ol_lineage_src_field (source_field) ON OL_COLUMN_LINEAGE
CREATE INDEX idx_ol_lineage_tgt_ds (target_dataset) ON OL_COLUMN_LINEAGE
CREATE INDEX idx_ol_lineage_tgt_field (target_field) ON OL_COLUMN_LINEAGE
CREATE INDEX idx_ol_lineage_run (run_id) ON OL_COLUMN_LINEAGE
CREATE INDEX idx_ol_lineage_type (transformation_type) ON OL_COLUMN_LINEAGE
```

**Problem:** Recursive CTEs join on column PAIRS, not individual columns.

### Recommended Composite Indexes

**Priority 1: Join Condition Coverage**

```sql
-- Upstream traversal: joins on target_dataset + target_field
CREATE INDEX idx_ol_lineage_target_pair (target_dataset, target_field)
    ON {DATABASE}.OL_COLUMN_LINEAGE;

-- Downstream traversal: joins on source_dataset + source_field
CREATE INDEX idx_ol_lineage_source_pair (source_dataset, source_field)
    ON {DATABASE}.OL_COLUMN_LINEAGE;
```

**Why this works:**
- Upstream CTE joins `ON TRIM(cl.target_dataset) = TRIM(ul.source_dataset) AND TRIM(cl.target_field) = TRIM(ul.source_field)` (lineage_repository.py:74-75)
- Downstream CTE joins `ON TRIM(cl.source_dataset) = TRIM(dl.target_dataset) AND TRIM(cl.source_field) = TRIM(dl.target_field)` (lineage_repository.py:162-163)
- Composite indexes allow Teradata to use a single index lookup instead of multiple single-column index lookups or full table scans
- According to Teradata documentation, composite secondary indexes are only used when **all columns** in the index are used in the WHERE clause, which these join conditions satisfy

**Priority 2: Cycle Detection**

```sql
-- Cycle detection: POSITION(lineage_id IN path) = 0
CREATE INDEX idx_ol_lineage_id (lineage_id)
    ON {DATABASE}.OL_COLUMN_LINEAGE;
```

**Why this works:**
- Current cycle detection uses `POSITION(cl.target_dataset || '.' || cl.target_field IN dl.path) = 0` (lineage_repository.py:166)
- Benchmark script uses `POSITION(l.lineage_id IN lp.path) = 0` (benchmark_cte.py:149)
- Index on `lineage_id` enables fast lookups when building path strings
- Reduces need to concatenate strings before comparison

**Priority 3: Active Record Filtering**

```sql
-- Cover WHERE is_active = 'Y' in base queries
CREATE INDEX idx_ol_lineage_active_source (is_active, source_dataset, source_field)
    ON {DATABASE}.OL_COLUMN_LINEAGE;

CREATE INDEX idx_ol_lineage_active_target (is_active, target_dataset, target_field)
    ON {DATABASE}.OL_COLUMN_LINEAGE;
```

**Why this works:**
- All lineage queries filter `WHERE is_active = 'Y'` (lineage_repository.py:58, 76, 146, 164, 238, 259)
- Leading with `is_active` in composite index allows Teradata to filter inactive records early
- Covered query: if `is_active` + join columns are in index, Teradata can satisfy query from index alone without table access

**Tradeoff:** Each index adds overhead for INSERT/UPDATE/DELETE operations and storage. Since lineage data is primarily read-heavy (queries >> updates), this tradeoff favors read optimization.

### Index Maintenance

**After creating indexes, collect statistics:**

```sql
-- Composite indexes
COLLECT STATISTICS ON {DATABASE}.OL_COLUMN_LINEAGE
    COLUMN (target_dataset, target_field);

COLLECT STATISTICS ON {DATABASE}.OL_COLUMN_LINEAGE
    COLUMN (source_dataset, source_field);

COLLECT STATISTICS ON {DATABASE}.OL_COLUMN_LINEAGE
    COLUMN (is_active, source_dataset, source_field);

COLLECT STATISTICS ON {DATABASE}.OL_COLUMN_LINEAGE
    COLUMN (is_active, target_dataset, target_field);

-- Single columns for fallback
COLLECT STATISTICS ON {DATABASE}.OL_COLUMN_LINEAGE
    COLUMN (lineage_id);

COLLECT STATISTICS ON {DATABASE}.OL_COLUMN_LINEAGE
    COLUMN (is_active);
```

**When to re-collect:**
- After initial index creation
- After bulk loads or significant data changes (>10% of table)
- When query performance degrades
- Automate via scheduled job (weekly or after ETL runs)

**Diagnostic command:**
```sql
-- Check if statistics are stale
DIAGNOSTIC HELPSTATS ON FOR SESSION;
EXPLAIN <your query>;
-- Teradata will suggest missing statistics
```

## Query Pattern Optimizations

### 1. Cycle Detection Alternatives

**Current approach (lineage_repository.py):**
```sql
-- Builds large VARCHAR path, checks substring presence
CAST(source_dataset || '.' || source_field || '->' || target_dataset || '.' || target_field
     AS VARCHAR(10000)) as path
...
AND POSITION(cl.target_dataset || '.' || cl.target_field IN dl.path) = 0
```

**Problems:**
- String concatenation on every recursive iteration
- POSITION() string search is O(n) on path length
- VARCHAR(10000) allocates excessive spool space
- Path grows quadratically with depth

**Alternative 1: lineage_id-based cycle detection (already in benchmark_cte.py)**

```sql
-- Base case
CAST(l.lineage_id AS VARCHAR(4000)) AS path

-- Recursive case
lp.path || ',' || l.lineage_id

-- Cycle check
AND POSITION(l.lineage_id IN lp.path) = 0
```

**Why better:**
- `lineage_id` is fixed-width (VARCHAR(64)) vs. dynamic dataset.field names
- Comma-delimited easier to parse than arrow-delimited
- Can reduce VARCHAR from 10000 to 4000 (4000 chars / 65 chars per ID = ~61 depth max)
- With `idx_ol_lineage_id` index, lookups are faster

**Alternative 2: Depth limit + visited table (best for deep graphs)**

```sql
WITH RECURSIVE lineage_cte AS (
    -- Base case
    SELECT ..., 1 as depth, lineage_id as visited_id
    FROM OL_COLUMN_LINEAGE
    WHERE ...

    UNION ALL

    -- Recursive case
    SELECT ..., lc.depth + 1, cl.lineage_id
    FROM OL_COLUMN_LINEAGE cl
    INNER JOIN lineage_cte lc ON ...
    WHERE lc.depth < ?  -- Hard depth limit
    AND NOT EXISTS (
        SELECT 1 FROM lineage_cte prev
        WHERE prev.visited_id = cl.lineage_id
    )
)
```

**Why better:**
- Eliminates string operations entirely
- NOT EXISTS with index is faster than POSITION string search
- However: NOT EXISTS may not be well-optimized in Teradata recursive CTEs (needs testing)

**Recommendation:** Switch to lineage_id-based approach (Alternative 1) as first step. It's in benchmark_cte.py already, so pattern is proven. Test Alternative 2 if depth >10 is common.

### 2. VARCHAR Path Column Sizing

**Current:** VARCHAR(10000) in lineage_repository.py, VARCHAR(4000) in benchmark_cte.py

**Optimization:**
- Measure actual path lengths in production using `AVG(CHARACTER_LENGTH(path))` (benchmark_cte.py:111 already does this)
- Size VARCHAR to 2x max observed path length (leaves growth room)
- Smaller VARCHAR = less spool space = more rows fit in memory = faster joins

**Implementation:**
```sql
-- In lineage_repository.py CTE
CAST(lineage_id AS VARCHAR(2000)) AS path  -- Adjust based on measurement
```

**Tradeoff:** If path exceeds VARCHAR limit, Teradata truncates silently, causing false cycle detection. Mitigation: Add depth limit as safety (already present: `lc.depth < ?`).

### 3. LOCKING Hints for Concurrency

**Current:** No locking hints in queries

**Optimization:**
```sql
LOCKING ROW FOR ACCESS
WITH RECURSIVE upstream_lineage AS (
    ...
)
```

**Why this works:**
- Default Teradata lock is READ lock at table level, blocking concurrent writes
- `LOCKING ROW FOR ACCESS` uses row-level ACCESS locks, improving concurrency
- Lineage queries are read-only, so ACCESS locks are sufficient
- In multi-user environments, reduces lock contention
- Benchmark_cte.py:206-211 already has `build_locking_query()` function for testing this

**Implementation:** Add `LOCKING ROW FOR ACCESS` before `WITH RECURSIVE` in all three CTE functions (upstream, downstream, database).

**Caution:** ACCESS locks don't prevent dirty reads. If lineage data updates mid-query, results may be inconsistent. For internal lineage tool with infrequent updates, acceptable tradeoff.

### 4. Early Filtering in Base Queries

**Current approach:** Base case filters on target/source dataset + field + is_active

**Opportunity:** If caller provides namespace filter, push to base query

**Example:**
```sql
-- Current
WHERE TRIM(target_dataset) = TRIM(?)
  AND UPPER(TRIM(target_field)) = UPPER(TRIM(?))
  AND is_active = 'Y'

-- Optimized (if namespace known)
WHERE target_namespace = ?  -- Exact match, indexed
  AND TRIM(target_dataset) = TRIM(?)
  AND UPPER(TRIM(target_field)) = UPPER(TRIM(?))
  AND is_active = 'Y'
```

**Why this works:**
- Reduces base case result set before recursion starts
- Smaller base case = fewer recursive iterations
- Namespace is indexed (idx_ol_dataset_ns from setup_lineage_schema.py:154)

**Tradeoff:** Requires schema change or application-level filtering. Medium effort for medium gain.

### 5. Remove TRIM/UPPER in Favor of Normalized Storage

**Current:** Queries use `TRIM()` and `UPPER(TRIM())` extensively

**Problem:**
- TRIM/UPPER functions prevent index usage (function-based indexes don't exist in standard Teradata)
- Applied on every comparison in recursive iterations
- CHAR column padding forces TRIM usage

**Long-term fix:**
- Store dataset_name, field_name as VARCHAR (not CHAR) to avoid padding
- Normalize to uppercase at INSERT time (in populate_lineage.py)
- Remove TRIM/UPPER from queries, enabling direct index seeks

**Short-term workaround:**
- Keep TRIM/UPPER in queries, rely on composite indexes to offset cost
- Document as technical debt

**Implementation effort:** High (schema change + ETL change + query change). Defer to Phase 2 if Phase 1 insufficient.

## Database-Level Optimizations

### 1. Statistics Collection (Critical)

Teradata optimizer uses statistics to estimate cardinality, choose join strategies, and allocate resources. Stale or missing statistics = suboptimal query plans.

**Current state:** No evidence of statistics collection in codebase. Likely missing.

**Verification:**
```sql
-- Check statistics on OL_COLUMN_LINEAGE
SELECT
    DatabaseName, TableName, ColumnName,
    CollectTimeStamp, UniqueValueCount
FROM DBC.StatsV
WHERE DatabaseName = '{DATABASE}'
  AND TableName = 'OL_COLUMN_LINEAGE'
ORDER BY CollectTimeStamp DESC;
```

**Initial collection (run after creating indexes):**
```sql
-- Composite columns (highest priority)
COLLECT STATISTICS ON {DATABASE}.OL_COLUMN_LINEAGE
    COLUMN (target_dataset, target_field);

COLLECT STATISTICS ON {DATABASE}.OL_COLUMN_LINEAGE
    COLUMN (source_dataset, source_field);

-- Join + filter columns
COLLECT STATISTICS ON {DATABASE}.OL_COLUMN_LINEAGE
    COLUMN (is_active, source_dataset, source_field);

COLLECT STATISTICS ON {DATABASE}.OL_COLUMN_LINEAGE
    COLUMN (is_active, target_dataset, target_field);

-- Individual columns for fallback
COLLECT STATISTICS ON {DATABASE}.OL_COLUMN_LINEAGE COLUMN (lineage_id);
COLLECT STATISTICS ON {DATABASE}.OL_COLUMN_LINEAGE COLUMN (is_active);
COLLECT STATISTICS ON {DATABASE}.OL_COLUMN_LINEAGE COLUMN (source_dataset);
COLLECT STATISTICS ON {DATABASE}.OL_COLUMN_LINEAGE COLUMN (target_dataset);
```

**Recollection schedule:**
- Weekly (if lineage updates frequently)
- After bulk loads via populate_lineage.py
- When query performance degrades

**Automation approach:**
```python
# Add to database/scripts/utils/collect_statistics.py
def collect_lineage_statistics(cursor):
    """Collect statistics on OL_COLUMN_LINEAGE critical columns."""
    stats_sql = [
        "COLLECT STATISTICS ON {DATABASE}.OL_COLUMN_LINEAGE COLUMN (target_dataset, target_field)",
        "COLLECT STATISTICS ON {DATABASE}.OL_COLUMN_LINEAGE COLUMN (source_dataset, source_field)",
        # ... rest
    ]
    for sql in stats_sql:
        cursor.execute(sql)
```

**Impact:** HIGH confidence this improves performance. Teradata documentation and multiple sources emphasize statistics as #1 optimization.

### 2. Primary Index Strategy

**Current schema (setup_lineage_schema.py:130):**
```sql
PRIMARY KEY (lineage_id)
```

**In Teradata, PRIMARY KEY != PRIMARY INDEX**
- PRIMARY KEY = uniqueness constraint
- PRIMARY INDEX = data distribution across AMPs (performance)

**Verification:**
```sql
SHOW TABLE {DATABASE}.OL_COLUMN_LINEAGE;
-- Look for "PRIMARY INDEX" clause
```

**Likely scenario:** Teradata defaults to lineage_id as Primary Index (PI) when PRIMARY KEY is specified. This distributes rows by lineage_id hash.

**Is this optimal?**
- **Pros:** Even distribution (lineage_id is unique), good for full table operations
- **Cons:** Queries join on source/target dataset+field, not lineage_id. Non-PI queries require all-AMP operations.

**Alternative PI:**
```sql
PRIMARY INDEX (target_dataset, target_field)
```

**Why consider:**
- Upstream queries filter `WHERE target_dataset = ? AND target_field = ?` in base case
- PI on target columns makes base case an AMP-local operation (1-2 AMPs) instead of all-AMP
- Reduces base case from all-AMP broadcast to targeted lookup

**Tradeoff:**
- Downstream queries would still be all-AMP (filter on source columns, not target)
- Data distribution may skew if some tables have many lineage edges
- Changing PI requires DROP/CREATE table (high effort, data reload)

**Recommendation:** Keep current PI for now. Composite secondary indexes provide sufficient optimization without schema change. Re-evaluate if Phase 1 insufficient.

### 3. Spool Space Management

Recursive CTEs are spool-intensive. Each recursion level materializes intermediate results in spool.

**Current risk:**
- Database-level lineage with 600 nodes, depth 3 = large intermediate spool tables
- If spool exhausted, query fails with "out of spool space" error

**Monitoring:**
```sql
-- Check spool usage during query execution
SELECT
    UserName, MaxSpool, CurrentPerm, CurrentSpool
FROM DBC.DiskSpaceV
WHERE UserName = '{USER}'
ORDER BY CurrentSpool DESC;
```

**Optimization strategies:**

**a) Reduce spool via early filtering**
- Push `is_active = 'Y'` and `depth < ?` filters early
- Already present in queries, but verify optimizer applies them

**b) Increase user spool allocation (DBA task)**
```sql
MODIFY USER {USER} AS SPOOL = {SIZE}e9;  -- e.g., 10e9 = 10GB
```

**c) Monitor via benchmark script**
- benchmark_cte.py:226-227 sets query timeout
- Add spool monitoring to benchmark to identify threshold

**Impact:** MEDIUM confidence. Spool issues are common with recursive CTEs, but well-optimized queries should stay within reasonable limits.

## Application-Level Optimizations

### 1. Redis Caching Strategy

**Current state:** No caching. Every lineage request hits Teradata.

**Opportunity:** Lineage graphs change infrequently but are queried repeatedly (e.g., same developer checking impact of column change multiple times).

**Recommended pattern: Cache-Aside (Lazy Loading)**

```python
# Pseudocode for lineage_service.py

import redis
import json
import hashlib

redis_client = redis.Redis(host='localhost', port=6379, decode_responses=True)
CACHE_TTL = 3600  # 1 hour

def get_upstream_lineage(dataset: str, field: str, depth: int):
    # Generate cache key
    cache_key = f"lineage:upstream:{dataset}:{field}:{depth}"

    # Check cache
    cached = redis_client.get(cache_key)
    if cached:
        return json.loads(cached)

    # Cache miss: query database
    result = lineage_repository.get_upstream_lineage(dataset, field, depth)

    # Store in cache with TTL
    redis_client.setex(cache_key, CACHE_TTL, json.dumps(result))

    return result
```

**Why Cache-Aside:**
- Only caches data that's actually requested (cost-effective)
- Immediate performance gains on cache hits
- Simple to implement (no change to write path)
- Degradation-friendly: if Redis down, fallback to DB

**Cache invalidation strategies:**

**Option A: TTL-based (simplest)**
- Set TTL to 1-24 hours based on lineage update frequency
- Stale data acceptable for lineage (not transactional)
- No invalidation logic needed

**Option B: Event-based invalidation**
- When populate_lineage.py runs, flush relevant cache keys
- Requires tracking which datasets updated
- More complex, but ensures freshness

**Recommendation:** Start with TTL-based (Option A). If users complain about stale lineage, add event-based invalidation.

**Cache granularity:**
- **Cache entire graph response** (recommended): `lineage:upstream:{dataset}:{field}:{depth}` → full edge list
- **Don't cache individual edges**: Cache lookup overhead exceeds benefit

**Cache key format:**
```
lineage:upstream:{dataset}:{field}:{depth}
lineage:downstream:{dataset}:{field}:{depth}
lineage:database:{database_name}:{depth}
```

**Storage estimate:**
- 600-node graph = ~1200 edges (average)
- Per edge: 200 bytes JSON (dataset names, field names, transformation type)
- Total: 1200 * 200 = 240 KB per graph
- 1000 cached graphs = 240 MB
- Redis easily handles this

**Expected performance gain:**
- Cache hit: <10ms (Redis in-memory lookup + JSON deserialize)
- Cache miss: 60s (Teradata query) + 10ms (cache store)
- Assuming 50% hit rate after warmup: 30s avg → 30s saving

**Combined with query optimization:**
- Optimized query: 60s → 2-4s (Phase 1+2)
- With cache hit: 2-4s → <10ms
- Effective: 50% @ <10ms + 50% @ 3s = ~1.5s average after warmup

**Implementation:**
1. Add `redis` to requirements.txt
2. Add Redis config to config.py (host, port, TTL)
3. Wrap lineage_repository calls in lineage_service.py with cache layer
4. Add cache clear utility: `python scripts/utils/clear_lineage_cache.py`
5. Add Redis health check to `/health` endpoint

**Confidence:** HIGH. Redis caching is proven pattern for read-heavy workloads. Sources confirm cache-aside pattern with TTL is industry standard.

### 2. Query Result Pagination (Defensive)

**Current approach:** Fetch all edges for graph in single query

**Risk:** Database-level graphs with 600 nodes return ~1200 edges. At depth 5, could be 5000+ edges.

**Consideration:** Does Flask/frontend handle large JSON payloads efficiently?

**Mitigation (if needed):**
- Add LIMIT/OFFSET to queries for pagination
- Return `{edges: [...], has_more: bool, next_cursor: str}`
- Frontend requests additional pages as needed

**Recommendation:** Monitor frontend performance with 600-node graphs first. Only implement pagination if client-side rendering lags. Teradata → Flask → React can likely handle 5000 edges fine.

### 3. Connection Pooling

**Current state:** Check if teradatasql uses connection pooling in lineage-api.

**Verification:**
```python
# In repositories/base.py or config.py
# Look for connection pooling configuration
```

**If not pooled:** Each API request opens new Teradata connection (~100-500ms handshake overhead).

**Solution:** Use connection pool:
```python
from teradatasql import connect

# Create connection pool (application startup)
connection_pool = {
    'host': CONFIG['host'],
    'user': CONFIG['user'],
    'password': CONFIG['password'],
    'database': CONFIG['database']
}

# Reuse connections across requests
# (Teradata driver handles pooling internally if multiple cursors from same connection)
```

**Impact:** LOW-MEDIUM. Saves 100-500ms per request, but not the 60s query time. Worthwhile optimization but not primary bottleneck.

## Performance Profiling Approach

### 1. Establish Baseline Metrics

**Before any optimization, measure current state:**

```bash
cd database
python scripts/utils/benchmark_cte.py --depths 5 10 15 --output baseline.md
```

**Captures:**
- Query execution times (min/avg/max across iterations)
- Row counts returned
- Max depth reached
- Average path byte lengths

**Current benchmark datasets:**
- CHAIN_TEST (linear, 4 levels)
- FANOUT10_TEST (wide fan-out)
- CYCLE5_TEST (cyclic)
- FANIN10_TEST (wide fan-in)
- NESTED_DIAMOND (diamond pattern)

**Add production-like benchmark:**
```python
# In TEST_DATASETS dict
'PRODUCTION_SAMPLE': {
    'dataset': '{DATABASE}.DIM_CUSTOMER',  # Real table
    'field': 'customer_key',
    'description': 'Production table (typical complexity)',
    'pattern': 'production',
    'directions': ['upstream', 'downstream'],
}
```

### 2. EXPLAIN Plan Analysis

**For each slow query, capture EXPLAIN:**

```sql
EXPLAIN
WITH RECURSIVE upstream_lineage AS (
    ...
)
SELECT * FROM upstream_lineage;
```

**Look for:**
- **High confidence level** (good): Optimizer has statistics, plan is reliable
- **Low confidence level** (bad): Missing statistics, plan is guess
- **All-AMP vs. Few-AMP**: All-AMP = full table scan across all AMPs (slow). Few-AMP = index usage (fast)
- **Product join**: Worst case. Missing join condition or statistics.
- **Redistribution**: Data shuffling between AMPs. Acceptable for large tables, but excessive redistribution indicates poor PI or statistics.
- **Spool file size estimates**: Large spool = memory pressure

**Example EXPLAIN output interpretation:**
```
1) Confidence: LOW
   -> Missing statistics on (source_dataset, source_field)

2) Join strategy: PRODUCT JOIN
   -> Likely cause: Missing composite index or statistics

3) Estimated spool: 5GB
   -> Potential spool exhaustion risk
```

**Automate EXPLAIN capture:**
```bash
python scripts/utils/benchmark_cte.py --explain --depths 10 --output explain_baseline.txt
```

### 3. Optimization Iteration Loop

**For each optimization phase:**

1. **Apply changes** (e.g., create composite index)
2. **Collect statistics** (critical: optimizer needs fresh stats)
3. **Re-run benchmark**:
   ```bash
   python benchmark_cte.py --depths 5 10 15 --output phase1_indexes.md
   ```
4. **Compare results:**
   ```bash
   diff baseline.md phase1_indexes.md
   ```
5. **Capture EXPLAIN** to verify optimizer uses indexes:
   ```bash
   python benchmark_cte.py --explain --depths 10 --output explain_phase1.txt
   ```
6. **Document findings** in `.planning/research/PERFORMANCE_LOG.md`

**Rollback criteria:**
- If performance doesn't improve or degrades, drop index and investigate
- Check EXPLAIN to see if optimizer ignores index (may need different column order)

### 4. Production Monitoring

**After deploying optimization, monitor via application logs:**

```python
# In lineage_service.py
import time
from utils.logging_config import logger

def get_upstream_lineage(dataset, field, depth):
    start = time.perf_counter()

    result = lineage_repository.get_upstream_lineage(dataset, field, depth)

    elapsed_ms = (time.perf_counter() - start) * 1000
    logger.info(
        "lineage_query",
        direction="upstream",
        dataset=dataset,
        field=field,
        depth=depth,
        elapsed_ms=elapsed_ms,
        edge_count=len(result)
    )

    return result
```

**Metrics to track:**
- p50, p95, p99 query latency by direction and depth
- Cache hit rate (if caching implemented)
- Slow query threshold alerts (>5s)

**Dashboard queries:**
```sql
-- Slowest queries in last 24 hours
SELECT
    UserName, QueryText,
    CAST(StartTime AS TIMESTAMP(0)) AS StartTime,
    CAST(AMPCPUTime AS DECIMAL(18,2)) AS CPU_Sec,
    CAST(TotalIOCount AS BIGINT) AS IO_Count
FROM DBC.QryLogV
WHERE UserName = '{USER}'
  AND StartTime > CURRENT_TIMESTAMP - INTERVAL '1' DAY
  AND QueryText LIKE '%WITH RECURSIVE%'
ORDER BY AMPCPUTime DESC
LIMIT 10;
```

### 5. Success Criteria

**Target:** 2-4 seconds end-to-end for all graph types

**Measurement points:**
- **Database query time**: From `cursor.execute()` start to `fetchall()` complete
- **Application processing**: JSON serialization, data transformation
- **Network transfer**: Flask → Frontend
- **Frontend rendering**: React Flow layout + render

**Breakdown target (for 3s total):**
- Database query: 2s (60s → 2s = 30x improvement)
- Application processing: 0.5s
- Network transfer: 0.3s
- Frontend rendering: 0.2s

**Acceptance test:**
```bash
# After optimization, all these should complete <4s
curl -w "@curl-format.txt" "http://localhost:8080/api/v2/openlineage/lineage/{dataset_id}/{field_name}?depth=5"
curl -w "@curl-format.txt" "http://localhost:8080/api/v2/openlineage/lineage/table/{dataset_id}?depth=5"
curl -w "@curl-format.txt" "http://localhost:8080/api/v2/openlineage/lineage/database/{database_name}?depth=3"

# curl-format.txt:
time_total: %{time_total}s
```

## Implementation Roadmap

### Phase 1: Indexing + Statistics (Week 1)

**Goal:** Enable optimizer to use efficient join strategies

**Tasks:**
1. Create composite indexes (source_pair, target_pair, active_source, active_target, lineage_id)
2. Collect statistics on all indexed columns
3. Benchmark before/after
4. Capture EXPLAIN plans to verify index usage

**Expected improvement:** 60s → 10-15s (4-6x)

**Confidence:** HIGH. Composite indexes + statistics are foundational optimizations.

**Script:**
```sql
-- database/scripts/performance/create_lineage_indexes.sql
-- Run via: python scripts/performance/apply_indexes.py
```

### Phase 2: Query Pattern Optimization (Week 1-2)

**Goal:** Reduce per-iteration overhead in recursive CTEs

**Tasks:**
1. Switch cycle detection to lineage_id-based (VARCHAR(2000))
2. Add LOCKING ROW FOR ACCESS hints
3. Measure path lengths in production, rightsize VARCHAR
4. Update all three repository functions (upstream, downstream, database)
5. Re-run benchmarks

**Expected improvement:** 10-15s → 4-6s (2-3x)

**Confidence:** MEDIUM-HIGH. Query pattern improvements are cumulative but harder to predict exact gain.

**Implementation:**
```python
# In lineage_repository.py
# Replace path building and cycle detection as documented in "Cycle Detection Alternatives"
```

### Phase 3: Redis Caching (Week 2)

**Goal:** Avoid database hits for repeated queries

**Tasks:**
1. Add redis to requirements.txt, config.py
2. Implement cache-aside wrapper in lineage_service.py
3. Add cache clear utility
4. Add Redis health check
5. Load test with cache warmup

**Expected improvement:** 4-6s → <10ms (cache hit), ~1.5s average with 50% hit rate

**Confidence:** HIGH for cache implementation. Hit rate depends on usage patterns (MEDIUM confidence on 50% estimate).

**Implementation:**
```python
# lineage-api/services/lineage_cache.py
# Wrap repository calls with Redis cache layer
```

### Phase 4: Materialization (If Needed)

**Goal:** Pre-compute common lineage patterns

**Tasks:**
1. Identify most-queried datasets (via logs)
2. Create join indexes for those patterns
3. Measure storage overhead vs. query speed gain

**Expected improvement:** 4-6s → 1-2s for covered queries

**Confidence:** MEDIUM. Join indexes are powerful but add maintenance complexity. Only pursue if Phase 1-3 insufficient.

**Defer unless:** Post-Phase 3 performance still >4s for common queries.

## Teradata Version Compatibility

**Research based on:**
- Teradata Vantage (current major version as of 2025)
- Features used (recursive CTEs, secondary indexes, statistics) are available in Teradata 14.0+

**Version-specific considerations:**

**Teradata 16.0+:**
- QVCI (Queryable View Column Index) required for DBC.ColumnsJQV (already documented in CLAUDE.md)
- All indexing and CTE optimizations apply

**Teradata 14.0-15.x:**
- Recursive CTEs supported
- Secondary indexes supported
- All recommendations apply

**Teradata 13.x and older:**
- Recursive CTEs may have limitations
- Recommendation: Upgrade Teradata or use stored procedure approach

**Verification command:**
```sql
SELECT InfoData FROM DBC.DBCInfoV WHERE InfoKey = 'VERSION';
```

**Compatibility confidence:** HIGH. All optimizations use stable Teradata features.

## Risks and Mitigations

### Risk 1: Index Overhead on Writes

**Risk:** Composite indexes slow down INSERT/UPDATE/DELETE operations

**Likelihood:** MEDIUM (lineage population runs are batch operations)

**Impact:** LOW (lineage reads >> writes, batch write performance acceptable tradeoff)

**Mitigation:**
- Measure populate_lineage.py execution time before/after indexing
- If batch load time increases >50%, consider:
  - Drop indexes before bulk load, recreate after
  - Use MULTILOAD/FASTLOAD utilities (bypass index maintenance during load)

### Risk 2: Statistics Collection Time

**Risk:** COLLECT STATISTICS on large tables takes significant time

**Likelihood:** MEDIUM (depends on OL_COLUMN_LINEAGE size)

**Impact:** LOW (one-time cost, runs offline)

**Mitigation:**
- Run statistics collection during maintenance window
- Use SAMPLE statistics for very large tables: `COLLECT STATISTICS USING SAMPLE`
- Automate via scheduled job, not on-demand

### Risk 3: Cache Staleness

**Risk:** Redis cache serves outdated lineage after populate_lineage.py runs

**Likelihood:** HIGH (without invalidation)

**Impact:** MEDIUM (users see old lineage, may make incorrect decisions)

**Mitigation:**
- Set conservative TTL (1 hour) and document refresh timing
- Add cache flush to populate_lineage.py:
  ```python
  redis_client.flushdb()  # Clear all cache after lineage update
  ```
- Display last update timestamp in UI

### Risk 4: VARCHAR Path Truncation

**Risk:** Reducing VARCHAR path size causes silent truncation, false cycle detection

**Likelihood:** LOW (depth limits prevent extreme paths)

**Impact:** HIGH (incorrect lineage results)

**Mitigation:**
- Add path length monitoring to benchmark_cte.py (already present: avg_path_bytes)
- Set VARCHAR to 2x max observed path length
- Enforce depth limit (already present: `depth < ?`)
- Add assertion in tests: verify path never truncated

### Risk 5: Optimizer Ignores Indexes

**Risk:** Teradata optimizer chooses full table scan despite composite indexes

**Likelihood:** LOW (with proper statistics)

**Impact:** HIGH (no performance improvement)

**Mitigation:**
- Always COLLECT STATISTICS after creating indexes
- Use EXPLAIN to verify index usage
- If optimizer ignores index, check:
  - Are statistics stale? Re-collect.
  - Are columns in index order matching join condition order?
  - Is TRIM/UPPER preventing index usage? (Long-term: normalize data)

## Open Questions

### Q1: Current OL_COLUMN_LINEAGE Row Count?

**Why it matters:** Optimization strategy differs for 10K vs. 10M rows

**How to check:**
```sql
SELECT COUNT(*) FROM {DATABASE}.OL_COLUMN_LINEAGE;
```

**Impact on recommendations:**
- <100K rows: Indexing may not show dramatic gains (full scans are fast)
- 100K-1M rows: Indexing critical
- >1M rows: Consider partitioning (not in current scope)

### Q2: Typical Graph Depth in Production?

**Why it matters:** Depth 5 vs. depth 20 has different optimization priorities

**How to check:** Run benchmark on production data, measure max_depth_found

**Impact on recommendations:**
- Depth ≤5: Current VARCHAR(4000) sufficient
- Depth >10: Consider NOT EXISTS cycle detection (Alternative 2)
- Depth >20: May need multi-level caching or materialized views

### Q3: What's the Network/Frontend Contribution to 60s?

**Why it matters:** If database query is 5s but network/frontend adds 55s, backend optimizations won't help

**How to check:**
```python
# Add timing breakdown to openlineage.py route handler
start_total = time.perf_counter()

start_db = time.perf_counter()
lineage_data = lineage_service.get_upstream_lineage(...)
db_time = time.perf_counter() - start_db

start_serialize = time.perf_counter()
response = jsonify(lineage_data)
serialize_time = time.perf_counter() - start_serialize

total_time = time.perf_counter() - start_total

logger.info("timing_breakdown", db=db_time, serialize=serialize_time, total=total_time)
```

**Impact on recommendations:**
- If DB time is <5s and total is 60s: Frontend/network is bottleneck, not backend queries
- If DB time is ~60s: Backend query optimization is correct focus

### Q4: Is Connection Pooling Already Implemented?

**Why it matters:** If not pooled, adding pooling saves 100-500ms per request

**How to check:** Review repositories/base.py and config.py for pooling config

**Impact on recommendations:** LOW priority but easy win if not present

## Confidence Assessment

| Area | Confidence | Reason |
|------|------------|--------|
| Composite Indexes | HIGH | Teradata official docs + multiple sources confirm composite indexes on join columns improve join performance |
| Statistics Collection | HIGH | Teradata docs + community consensus: statistics are #1 optimization |
| lineage_id Cycle Detection | MEDIUM-HIGH | Pattern already in benchmark_cte.py, proven to work. Need production testing for performance gain. |
| LOCKING ROW ACCESS | MEDIUM | Teradata docs confirm concurrency benefit. Impact depends on multi-user load. |
| Redis Caching | HIGH | Proven pattern for read-heavy workloads. AWS whitepaper + Redis docs confirm cache-aside pattern. |
| VARCHAR Sizing | MEDIUM | Logical optimization. Need production path length data to size correctly. |
| Primary Index Change | LOW | High effort, complex tradeoffs. Not recommended without Phase 1-3 results. |
| Join Indexes | MEDIUM | Teradata docs confirm query speed gains. Maintenance overhead + storage cost are concerns. |

## Gaps and Limitations

### Research Limitations

1. **No 2026-specific Teradata updates**: Web search results primarily from 2023-2024. Teradata core optimization principles are stable, but latest version-specific features may not be covered.

2. **No lineage-specific optimization resources**: General Teradata recursive CTE and graph traversal optimization found, but no lineage-tool-specific case studies. Recommendations are domain-general.

3. **No production data**: Recommendations based on benchmark test data (CHAIN_TEST, FANOUT10_TEST, etc.). Production graphs may have different characteristics (depth distribution, fanout ratios, cycle frequency).

4. **Caching hit rate uncertainty**: 50% hit rate assumption is educated guess. Actual hit rate depends on user behavior (exploratory browsing vs. targeted impact analysis).

### Areas Requiring Production Testing

1. **Index effectiveness**: Composite indexes may not provide expected gains if query patterns differ from assumptions. EXPLAIN analysis required.

2. **VARCHAR sizing**: Need production path length measurements to size correctly without truncation risk.

3. **Cycle detection performance**: lineage_id-based vs. dataset.field-based cycle detection needs A/B testing with production graph complexity.

4. **Cache TTL tuning**: 1-hour TTL may be too short (high cache miss rate) or too long (stale data complaints). Adjust based on populate_lineage.py frequency.

5. **Spool space thresholds**: Need production spool monitoring to identify if spool exhaustion is real risk or theoretical concern.

### Future Research Topics

If Phase 1-3 insufficient:

1. **Table partitioning**: Partition OL_COLUMN_LINEAGE by source_dataset or date range for large tables (>10M rows)

2. **Columnar storage**: Teradata columnar tables for read-optimized workloads (requires schema change)

3. **Query rewrite**: Explore non-recursive alternatives (e.g., closure table pattern with pre-computed paths)

4. **Distributed caching**: Redis cluster for high-availability caching if single Redis instance becomes bottleneck

5. **Materialized graph views**: Pre-compute and cache entire database lineage graphs, refresh nightly

## Sources

### Teradata Recursive CTEs and Performance
- [Mastering Teradata Recursive Queries: How To Create And Use Them For Shortest Path Problems](https://www.dwhpro.com/teradata-recursive-queries/)
- [The Teradata Recursive Query for Performance Tuning](https://www.dwhpro.com/teradata-recursive-query/)
- [SQL Fundamentals | Teradata Vantage - Recursive Queries](https://docs.teradata.com/r/Enterprise_IntelliFlex_VMware/SQL-Fundamentals/SQL-Data-Definition-Control-and-Manipulation/Recursive-Queries)
- [Mastering Teradata Performance Tuning: Best Practices for SQL Optimization](https://medium.com/@guruprasadnookala65/mastering-teradata-performance-tuning-best-practices-for-sql-optimization-834dccbaa375)

### Teradata Indexing Strategies
- [3 ways to use Indexes in Teradata to improve database performance](https://hub.packtpub.com/3-ways-to-use-indexes-in-teradata-to-improve-database-performance/)
- [Understanding The Teradata Primary Index: Distribution, Hashing Algorithm, And Performance Considerations](https://www.dwhpro.com/teradata-primary-index-pi/)
- [Optimizing Teradata SQL Queries by Avoiding Full Table Scans and Utilizing Secondary Indexes](https://medium.com/@r.wenzlofsky/optimizing-teradata-sql-queries-by-avoiding-full-table-scans-and-utilizing-secondary-indexes-bfbca7005b3a)
- [Understanding The Teradata Join Index: Benefits, Usage, And Implementation](https://www.dwhpro.com/teradata-join-index/)
- [Teradata - Secondary Index](https://www.tutorialspoint.com/teradata/teradata_secondary_index.htm)

### Teradata Statistics and Query Optimization
- [Improving Query Performance Using COLLECT STATISTICS](https://docs.teradata.com/r/Enterprise_IntelliFlex_VMware/Database-Administration/Improving-Query-Performance-Using-COLLECT-STATISTICS-Application-DBAs)
- [The Importance of Up-to-Date Statistics for Teradata SQL Tuning](https://www.dwhpro.com/teradata-sql-tuning-top-10/)
- [Mastering Teradata Performance Tuning](https://www.dwhpro.com/teradata-tuning/)
- [Teradata Performance Tuning](https://www.tutorialspoint.com/teradata/teradata_performance_tuning.htm)

### EXPLAIN Plan Analysis
- [How do you use explain plans to identify performance bottlenecks in Teradata SQL queries?](https://www.linkedin.com/advice/0/how-do-you-use-explain-plans-identify-performance-bottlenecks)
- [Teradata Explain Statement: A Guide to Optimizing SQL Performance](https://www.dwhpro.com/teradata-explain/)
- [Explain Plan in Teradata](https://www.teradatapoint.com/teradata/explain-plan-in-teradata.htm)

### Teradata Locking and Concurrency
- [Using LOCKING ROW - Teradata Vantage](https://docs.teradata.com/r/Enterprise_IntelliFlex_VMware/SQL-Data-Manipulation-Language/Statement-Syntax/LOCKING-Request-Modifier/Usage-Notes/Using-LOCKING-ROW)
- [Teradata Locking. Locking Levels in Teradata](https://medium.com/@r.wenzlofsky/teradata-locking-207f27d74590)
- [Understanding Teradata Locking: Types And Granularity](https://www.dwhpro.com/teradata-locking/)

### Spool Space Optimization
- [Teradata Spool Space Introduction](https://medium.com/@r.wenzlofsky/teradata-spool-space-introduction-24b594086e41)
- [Teradata Spool Space 101: Understanding, Managing, and Troubleshooting](https://www.dwhpro.com/teradata-spool-space-no-more-spool-space/)

### Redis Caching Strategies
- [Database Caching Strategies Using Redis - AWS Whitepaper](https://docs.aws.amazon.com/whitepapers/latest/database-caching-strategies-using-redis/caching-patterns.html)
- [Database Performance Optimization: Ultimate Guide](https://redis.io/blog/database-performance-optimization-guide/)
- [Database Caching with Redis: Strategies for Optimization](https://www.site24x7.com/learn/redis-database-caching.html)
- [How to Cache Database Queries with Redis](https://oneuptime.com/blog/post/2026-01-21-redis-database-query-caching/view)
- [Redis Caching Strategies 2026: High-Performance Data Storage](https://miracl.in/blog/redis-caching-strategies-2026/)

### Teradata Composite Indexes
- [Multiple Secondary Indexes and Composites - Teradata Developers Portal](https://docs.teradata.com/r/Enterprise_IntelliFlex_VMware/SQL-Fundamentals/Database-Objects/Secondary-Indexes/Multiple-Secondary-Indexes-and-Composites)
- [Creating a secondary index to improve performance - Teradata Cookbook](https://www.oreilly.com/library/view/teradata-cookbook/9781787280786/096d6cd1-f845-4e3f-b595-abf1b8c63722.xhtml)

### Teradata Data Types and VARCHAR Performance
- [The Impact of Character Sets on Teradata SQL Performance: A Case Study](https://www.dwhpro.com/teradata-tuning-success-the-best-ever/)
- [Teradata Data Type Considerations](https://www.dwhpro.com/data-types-teradata/)
- [Optimizing Teradata Stage Table Design for Faster Load Times](https://www.dwhpro.com/teradata-stage-table-design/)

### Materialized Views and Join Indexes
- [Introduction to Materialized Views In Teradata](https://tensupport.teradata.com/library/materialview.pdf)
- [Improving Join Index Performance - Teradata Vantage](https://docs.teradata.com/r/Enterprise_IntelliFlex_VMware/Database-Design/Join-and-Hash-Indexes/Improving-Join-Index-Performance)
- [Join Index Benefits and Costs - Teradata Vantage](https://docs.teradata.com/r/Enterprise_IntelliFlex_VMware/Database-Design/Join-and-Hash-Indexes/Join-Index-Benefits-and-Costs)

---

**Next Steps:**
1. Answer open questions (row count, typical depth, timing breakdown)
2. Run baseline benchmark: `python benchmark_cte.py --output baseline.md`
3. Implement Phase 1 (indexes + statistics)
4. Re-benchmark and compare
5. Proceed to Phase 2/3 based on results
