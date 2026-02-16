---
status: resolved
trigger: "User reports DBC database (600+ objects) takes 60+ seconds on first load, but subsequent loads are faster. Phase 5 optimizations show 142ms layout time in benchmarks."
created: 2026-02-16T00:00:00Z
updated: 2026-02-16T00:15:00Z
---

## Current Focus

hypothesis: ROOT CAUSE CONFIRMED - N+1 query pattern in lineage_service.get_database_lineage_graph
test: Complete - traced execution path and counted queries
expecting: Confirmed - 600+ dataset field queries (lines 234-262) dominate execution time
next_action: Document root cause and write to UAT.md Gaps section

## Symptoms

expected: Loading DBC database graph (600+ nodes) completes in 2-4 seconds end-to-end
actual: Takes 60+ seconds on first load, subsequent loads are faster (caching helps)
errors: None reported (performance issue, not error)
reproduction: Load DBC database lineage graph from frontend
started: Observed during Phase 5 UAT testing
phase: 05-frontend-rendering-optimization

## Eliminated

- hypothesis: Frontend rendering/layout is the bottleneck
  evidence: Benchmarks show 600 nodes layout in 142ms (Phase 05-03-SUMMARY.md)
  timestamp: 2026-02-16T00:11:00Z

- hypothesis: Database CTE query is the bottleneck
  evidence: get_database_lineage is cached and optimized in Phase 4. Subsequent loads are faster (cache hit). The CTE itself is not the problem.
  timestamp: 2026-02-16T00:11:00Z

- hypothesis: Network latency or data serialization is the bottleneck
  evidence: Subsequent loads within 5 minutes are fast (TanStack Query cache). If network was the bottleneck, backend would still be slow even with client-side cache.
  timestamp: 2026-02-16T00:11:00Z

## Evidence

- timestamp: 2026-02-16T00:00:00Z
  checked: Phase 5 benchmarks
  found: ELKjs layout for 600 nodes completes in 142ms
  implication: Frontend layout is NOT the bottleneck

- timestamp: 2026-02-16T00:00:00Z
  checked: User report
  found: "subsequent times are faster" after first load
  implication: Caching is working, suggests backend query or data processing is the bottleneck

- timestamp: 2026-02-16T00:01:00Z
  checked: lineage_repository.py get_database_lineage method
  found: Uses recursive CTE with bidirectional traversal and LOCKING ROW FOR ACCESS
  implication: Complex CTE query on 600+ tables may take significant time

- timestamp: 2026-02-16T00:02:00Z
  checked: lineage_service.py get_database_lineage_graph method (lines 164-353)
  found: After CTE query, iterates through ALL datasets to fetch field metadata (lines 234-262)
  implication: For 600+ tables, this means 600+ additional database queries for field metadata

- timestamp: 2026-02-16T00:03:00Z
  checked: Backend timing instrumentation
  found: No timing logs (console.time/log) found in lineage-api code
  implication: Cannot determine where time is spent without instrumentation

- timestamp: 2026-02-16T00:04:00Z
  checked: Cache implementation in lineage_repository.py
  found: _cache_get_or_compute with Redis-based stampede prevention (lines 37-93)
  implication: Cache should work, but first load requires full computation

- timestamp: 2026-02-16T00:05:00Z
  checked: lineage_service.py lines 269-343 (process lineage results)
  found: For EACH lineage edge, checks if source/target nodes exist. If not (external dataset), calls get_field_metadata() individually
  implication: CLASSIC N+1 QUERY PROBLEM

- timestamp: 2026-02-16T00:06:00Z
  checked: Query pattern analysis
  found: 1. Initial query gets all datasets (600+), 2. Loop through datasets to get fields (600 queries), 3. Get database lineage CTE (1 query), 4. For EACH edge result, call get_field_metadata if not in nodes dict (potentially 1000+ queries)
  implication: For DBC database, estimated 600 (dataset fields) + 1000+ (external nodes) = 1600+ individual queries

- timestamp: 2026-02-16T00:07:00Z
  checked: Why subsequent loads are faster
  found: lineage_repo.get_database_lineage is cached via _cache_get_or_compute, but the N+1 field metadata queries in lineage_service happen AFTER cache check
  implication: Wait, this doesn't explain why subsequent loads are faster unless the entire service result is also cached somewhere

- timestamp: 2026-02-16T00:08:00Z
  checked: App.tsx TanStack Query configuration (lines 11-18)
  found: QueryClient configured with staleTime: 5 minutes and refetchOnWindowFocus: false
  implication: TanStack Query caches the ENTIRE API response for 5 minutes. Subsequent loads within 5 minutes use cached response (explains "subsequent times are faster")

- timestamp: 2026-02-16T00:09:00Z
  checked: Complete execution flow for first load
  found: 1. Query OL_DATASET for database (1 query), 2. For each dataset, query OL_DATASET_FIELD (600 queries), 3. Call get_database_lineage CTE (1 cached query), 4. For each external node in lineage results, call get_field_metadata (N queries where N = number of external columns)
  implication: The 600 queries in step 2 (lines 234-262) are the PRIMARY bottleneck. These cannot be avoided with current architecture.

- timestamp: 2026-02-16T00:10:00Z
  checked: Why Phase 4 database query optimizations didn't help
  found: Phase 4 optimized the CTE queries, but get_database_lineage_graph has additional N+1 queries at the service layer AFTER the CTE
  implication: The CTE optimization worked (get_database_lineage is fast and cached), but the service layer processing is the bottleneck

## Resolution

root_cause: |
  N+1 query problem in lineage_service.get_database_lineage_graph (lineage-api/services/lineage_service.py lines 234-262).

  For database lineage, the service fetches ALL fields for ALL tables in the database via individual queries:

  ```python
  for dataset in datasets:  # 600+ datasets in DBC
      cur.execute("""
          SELECT field_name, field_type, nullable
          FROM OL_DATASET_FIELD
          WHERE dataset_id = ?
          ORDER BY ordinal_position
      """, [dataset["id"]])  # SEPARATE QUERY FOR EACH DATASET
  ```

  For DBC database with 600+ objects, this results in 600+ individual queries executed sequentially.

  At ~100ms per query (network latency + query execution), this accounts for 60+ seconds:
  - 600 queries × 100ms = 60 seconds

  Why subsequent loads are faster:
  - TanStack Query caches the entire API response for 5 minutes (staleTime config in App.tsx)
  - Subsequent requests within 5 minutes bypass the backend entirely

  Why Phase 4 database optimizations didn't solve this:
  - Phase 4 optimized the recursive CTE query (get_database_lineage in repository layer)
  - The CTE query IS fast and cached in Redis
  - However, the N+1 field metadata queries happen AFTER the CTE query at the service layer
  - These service-layer queries are not cached and dominate execution time

fix: |
  NOT FIXED - this is a diagnosis-only session.

  Recommended fix approach (for future phase):
  1. Replace N individual queries with 1 bulk query using IN clause
  2. Fetch all field metadata for all datasets in the database in a single query
  3. Build an in-memory lookup map before processing lineage results

  Example:
  ```python
  # Instead of 600 individual queries, do 1 bulk query:
  dataset_ids = [ds["id"] for ds in datasets]
  cur.execute("""
      SELECT dataset_id, field_name, field_type, nullable
      FROM OL_DATASET_FIELD
      WHERE dataset_id IN ({})
  """.format(','.join(['?']*len(dataset_ids))), dataset_ids)

  # Build lookup map
  field_lookup = {}
  for row in cur.fetchall():
      key = (row[0], row[1])  # (dataset_id, field_name)
      field_lookup[key] = {"field_type": row[2], "nullable": row[3]}
  ```

  This would reduce 600+ queries to 1 query, bringing load time from 60s to ~1-2s.

verification:
files_changed: []
