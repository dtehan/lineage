# Performance Optimization Pitfalls

**Domain:** Multi-layer performance optimization (Teradata, Python Flask, React Flow)
**Researched:** 2026-02-15
**Confidence:** HIGH

## Critical Pitfalls

### Pitfall 1: Optimizing Without Profiling First

**What goes wrong:**
Teams optimize the wrong bottleneck based on assumptions rather than data, spending days optimizing React rendering when the real issue is a 50-second database query, or vice versa. The 60s load time could be 55s database + 3s backend + 2s frontend, making frontend optimization nearly worthless.

**Why it happens:**
Developers see slow graphs and immediately assume it's a rendering problem because "600 nodes is a lot," or assume the database is slow because "Teradata is old." Premature optimization feels productive even when misdirected.

**How to avoid:**
1. Profile before optimizing: measure database query time, backend processing time, network transfer time, and frontend rendering time separately
2. Use existing `benchmark_cte.py` to establish baseline CTE performance
3. Add API endpoint timing logs (already using Loguru with correlation IDs)
4. Use browser DevTools Performance tab to measure frontend time
5. Document baseline metrics BEFORE any optimization work begins

**Warning signs:**
- No baseline metrics documented before optimization work starts
- Team debates "which layer is slow" without measurements
- Optimization PRs that don't include before/after timing data
- Claims like "this should make it faster" without profiling evidence

**Phase to address:**
Phase 1 (Requirements/Setup) — Establish profiling infrastructure and baseline metrics before any optimization work.

---

### Pitfall 2: Breaking Correctness While Optimizing Recursive CTEs

**What goes wrong:**
Optimization changes to recursive CTE logic break cycle detection, depth limiting, or path tracking, causing infinite loops, incorrect lineage results, or missing nodes. The graph loads fast but shows wrong data. Existing 73 database tests fail silently because they weren't run before committing.

**Why it happens:**
Recursive CTEs are complex: `POSITION(lineage_id IN path) = 0` for cycle detection, `VARCHAR(4000)` path length limits, and `depth < max_depth` termination. Developers remove "slow" path tracking without realizing it's the cycle detection mechanism, or change join conditions thinking they're equivalent when they're not.

**How to avoid:**
1. Run all 73 database tests BEFORE and AFTER every CTE optimization
2. Never modify cycle detection logic without explicit test coverage
3. Add specific regression tests for known edge cases: CYCLE5_TEST (5-node cycle), NESTED_DIAMOND (diamond patterns), FANOUT10_TEST (wide fan-out)
4. Use `insert_cte_test_data.py` test patterns as validation after changes
5. Compare row counts and max depths between baseline and optimized queries
6. Keep path tracking even if it seems "expensive" — it prevents infinite loops

**Warning signs:**
- Tests not run before committing CTE changes
- "Trust me, this is equivalent" code reviews without test evidence
- Removing path-based cycle detection to "save memory"
- Changing VARCHAR(4000) to smaller size without testing deep graphs
- Skipping database tests because "it's just a performance change"

**Phase to address:**
Every phase — CTE correctness is non-negotiable. Add "run database tests" as pre-commit gate for any query changes.

---

### Pitfall 3: React Flow Re-render Hell from Direct Store Access

**What goes wrong:**
Components directly access `nodes` or `edges` arrays from store, causing entire graph to re-render on every pan/zoom/drag operation. 600-node graph becomes unusable because React is diffing 600 nodes 60 times per second during pan operations. Users report "graph is laggy" even though initial load is fast.

**Why it happens:**
Most common React Flow performance pitfall: nodes and edges objects change frequently during dragging, panning, or zooming, causing unnecessary re-renders of components that depend on them. Developers don't realize that `useLineageStore()` selector is too broad and triggers on every state change.

**How to avoid:**
1. Use React.memo on TableNode, LineageEdge, and other graph components
2. Declare custom node/edge components outside parent component or memoize them
3. Use selective Zustand selectors: `useLineageStore(state => state.direction)` instead of `useLineageStore()`
4. Enable `onlyRenderVisibleElements` for graphs > 50 nodes (already using VIRTUALIZATION_THRESHOLD)
5. Throttle/debounce event handlers for pan/zoom/drag operations
6. Never access `nodes`/`edges` arrays directly in component render paths

**Warning signs:**
- React DevTools Profiler shows TableNode rendering 60fps during pan
- Graph feels "laggy" even with small node counts (< 100 nodes)
- Component renders logged on every zoom/pan operation
- Zustand store selectors don't use equality checks
- Components re-mount during interactions

**Phase to address:**
Phase 2 (Frontend Optimization) — After database/backend optimization, before claiming victory.

---

### Pitfall 4: Cache Invalidation Failures Create Stale Lineage

**What goes wrong:**
Redis caching speeds up repeated queries but shows outdated lineage after database updates. User refreshes graph multiple times expecting updated lineage but sees cached stale data. Cache stampede on popular tables causes 100 simultaneous cache misses, hammering database worse than without caching.

**Why it happens:**
"Cache invalidation is one of the hardest problems in computer science" for good reason. Teams add caching without invalidation strategy, use infinite TTLs because "lineage doesn't change often," include user input directly in cache keys causing unbounded key growth, and don't handle cache stampede on hot keys.

**How to avoid:**
1. Every cache key MUST have a TTL — no exceptions, even for "static" data
2. Use TTL jitter (random +/- 10%) to prevent stampede on popular keys
3. Tag-based invalidation for related entries: invalidate all lineage for table X when X changes
4. Stale-while-revalidate pattern: serve stale data while fetching fresh data in background
5. Monitor cache hit rates and key cardinality — unbounded growth is a red flag
6. Never include raw user input in cache keys without sanitization/limits

**Warning signs:**
- Cache keys without expiration times
- Users reporting "graph doesn't update" after schema changes
- Database CPU spikes at regular intervals (synchronized TTL expiration)
- Redis memory growing unbounded (check `INFO memory` and key count)
- Cache invalidation code commented out because "it was causing issues"

**Phase to address:**
Phase 3 (Caching Layer) — Design invalidation strategy BEFORE implementing caching, not after deployment.

---

### Pitfall 5: Teradata CTE Path String Overflow on Deep Graphs

**What goes wrong:**
Recursive CTE uses `VARCHAR(4000)` for path tracking. Deep lineage graphs (depth 20+ with long table names) overflow path column, causing Teradata truncation errors or silent cycle detection failures. Path becomes: `demo_user.really_long_table_name.column_with_long_name->demo_user.another_long...` and hits 4000 character limit around depth 15-18 depending on naming.

**Why it happens:**
CTE cycle detection uses `POSITION(lineage_id IN path)` which requires storing full path. With qualified names like `namespace://host:port->database.table.column`, path grows ~100-150 chars per depth level. 4000 char limit seemed safe but wasn't tested with real deep graphs.

**How to avoid:**
1. Use `lineage_id` (integer/short string) in path instead of full qualified names
2. Current benchmark_cte.py already does this: `CAST(l.lineage_id AS VARCHAR(4000))`
3. Test deep graphs (depth 20+) with realistic naming conventions
4. Monitor `AVG(CHARACTER_LENGTH(path))` from benchmark results
5. If using qualified names in path, calculate max depth: `4000 chars / avg_name_length`
6. Consider alternative cycle detection if path length becomes limiting factor

**Warning signs:**
- Teradata "string overflow" errors on deep lineage queries
- Cycle detection stops working at depth > 15
- Path column approaching VARCHAR limit in benchmark results
- Long table/column names (> 50 chars) combined with depth > 10

**Phase to address:**
Phase 1 (Requirements/Setup) — Validate during baseline measurement phase, before optimization.

---

### Pitfall 6: ELKjs Layout Blocking Main Thread on Large Graphs

**What goes wrong:**
ELKjs layout algorithm runs synchronously on main thread, freezing browser for 2-5 seconds on 600-node graphs. Graph data arrives from API instantly after backend optimization but users still see "frozen" UI while ELKjs calculates positions. Frontend team claims "backend is still slow" when the real issue is layout computation.

**Why it happens:**
ELKjs is a Java library ported to JavaScript, highly configurable but computationally expensive. Layout runs synchronously by default. Computing force layout every render for hundreds of nodes incurs big performance hit. Developers don't realize layout is async operation that can block.

**How to avoid:**
1. Use Web Workers to offload ELKjs computation from main thread
2. Show loading indicator during layout computation (separate from data fetch)
3. Memoize layout results — don't recompute on every render
4. Only compute layout when necessary (data changes, not on pan/zoom/filter)
5. Use `useLayoutedElements` hook pattern for async layout computation
6. Consider simpler layout algorithm for very large graphs (> 500 nodes)

**Warning signs:**
- Browser DevTools Performance shows long blocking tasks during graph render
- UI freezes after data arrives but before graph displays
- Layout function called on every render (check React DevTools Profiler)
- Users report "app is frozen" but network tab shows request completed
- Main thread CPU usage spikes to 100% during graph load

**Phase to address:**
Phase 2 (Frontend Optimization) — After confirming ELKjs is bottleneck, not data fetch.

---

### Pitfall 7: Measuring "Feels Faster" Instead of Real Metrics

**What goes wrong:**
Team optimizes based on subjective "feels faster" judgments without concrete before/after measurements. Optimization that actually made things slower gets merged because "it felt smoother on my machine." 60s baseline claim turns out to be wrong — was actually 30s — so claiming 10s improvement to 20s looks like failure.

**Why it happens:**
Developers test on different machines, networks, and data sizes. Local dev database has 10 rows, production has 10,000. "My laptop is fast" vs. "production is slow." Browser caching makes second load faster, mistaken for optimization. No documented baseline means no way to verify improvement.

**How to avoid:**
1. Document baseline BEFORE optimization: specific query, specific depth, specific node count
2. Use automated benchmarking: `benchmark_cte.py` with `--iterations 3` for DB layer
3. Measure median not average (less influenced by outliers)
4. Test on representative data size matching production (not tiny dev data)
5. Clear all caches between test runs (browser, Redis, DB query cache)
6. Measure end-to-end time: API call start to graph visible in browser
7. Use control charts to show trend over time, not single data point

**Warning signs:**
- PR descriptions saying "this is faster" without timing data
- No documented baseline measurements before optimization starts
- Testing only on dev data (10 rows) not production scale (10,000 rows)
- Single benchmark run instead of multiple iterations
- No methodology documentation (cache state, data size, machine specs)

**Phase to address:**
Phase 1 (Requirements/Setup) — Establish measurement methodology before any optimization.

---

### Pitfall 8: Premature Index Creation Without Query Analysis

**What goes wrong:**
Team creates indexes on every column involved in lineage queries, slowing down writes and consuming storage without improving read performance. Wrong indexes created based on "these columns are in WHERE clauses" without analyzing actual execution plans. Teradata query optimizer ignores new indexes because existing plan is already optimal.

**Why it happens:**
"Indexes make queries faster" is correct in principle but wrong without analysis. Teradata optimizer considers many factors: table statistics, index selectivity, join methods. Index on `source_dataset` seems obvious but may not help if optimizer already uses primary index efficiently. Creates maintenance overhead without benefit.

**How to avoid:**
1. Use EXPLAIN plans BEFORE creating indexes: `benchmark_cte.py --explain`
2. Analyze existing execution plans to identify actual bottlenecks
3. Check if Teradata optimizer is using full table scans (SCAN operations in EXPLAIN)
4. Consider index selectivity: indexes on low-cardinality columns often ignored
5. Test index impact with `COLLECT STATISTICS` before permanent creation
6. Document why each index was created based on EXPLAIN analysis
7. Monitor index usage over time — remove unused indexes

**Warning signs:**
- Indexes created without EXPLAIN analysis
- Multiple indexes on same table without selectivity analysis
- Index creation based on "seems like it should help"
- No before/after EXPLAIN comparison showing index usage
- DBA reports high index maintenance overhead

**Phase to address:**
Phase 1 (Database Optimization) — Only after EXPLAIN analysis proves index would help.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Skip database tests during "performance-only" changes | Faster commits | Silent correctness bugs, broken cycle detection | Never — correctness regression tests required |
| Cache without TTL for "static" lineage data | Simpler implementation | Stale data, user confusion, debugging nightmares | Never — all cache keys need expiration |
| Optimize most visible layer first (frontend) | User sees immediate UI responsiveness | Waste time if backend is real bottleneck | Only if profiling proves frontend is bottleneck |
| Remove path tracking to "save memory" | Slightly faster CTE execution | Infinite loops on cyclic graphs, silent failures | Never — path tracking is cycle detection |
| Use average instead of median for benchmarks | Simpler math | Outliers hide real performance, misleading metrics | Never — median is more representative |
| Test optimization on dev data (10 rows) | Fast iteration | Doesn't validate production scale (10K rows) | Early exploration only, must validate on real data |
| Memoize everything "just in case" | Feels safe | Memory leaks, stale closures, harder debugging | Only after profiling shows specific re-render problem |
| Add Redis without invalidation strategy | Quick wins on cache hits | Data inconsistency, debugging hell | Never — design invalidation before implementing cache |

## Integration Gotchas

Common mistakes when connecting to external services.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Redis caching | Including user input directly in keys (unbounded growth) | Sanitize input, use fixed key patterns, monitor cardinality |
| Teradata CTEs | Assuming VARCHAR(4000) is always enough for paths | Calculate max depth based on name lengths, test deep graphs |
| React Flow | Directly accessing store.nodes in render (re-render hell) | Use selective selectors, memoize components, throttle handlers |
| ELKjs layout | Running synchronously on main thread (UI freeze) | Use Web Workers, show loading indicator, memoize results |
| Flask profiling | Adding profiler only in dev (production mystery) | Use APM tools in production, structured logging with timing |

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| N+1 queries in lineage traversal | Fast for small graphs, exponential slowdown for large | Use recursive CTEs not iterative queries | > 100 nodes or depth > 5 |
| Full graph layout on every filter | Responsive for 50 nodes, freezes at 500 | Memoize layout, only recompute on data change | > 200 nodes |
| Synchronous ELKjs on main thread | Works fine for 50 nodes, locks UI at 300+ | Use Web Workers for layout computation | > 200 nodes |
| Path string concat in CTE cycle detection | Fine for depth 10, overflows at 20+ | Use numeric IDs not qualified names in paths | Depth > 15 with long names |
| Broad Zustand selectors | Fast for simple stores, re-renders entire graph | Use selective selectors with equality checks | > 100 nodes in graph |
| Cache without stampede protection | Fast for low traffic, crushes DB on hot keys | TTL jitter, stale-while-revalidate pattern | Popular tables with synchronized expirations |

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Unbounded cache keys from user input | Redis memory exhaustion, DoS | Sanitize input, limit key patterns, monitor cardinality |
| No query timeout on recursive CTEs | Malicious/accidental infinite loops consume resources | Set QUERY_BAND timeout, max_depth limits, path-based termination |
| Exposing internal table/column names in cache keys | Information disclosure in Redis | Hash sensitive names, use opaque identifiers |

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No loading indicator during ELKjs layout | "App is frozen" perception even though working | Show progress for data fetch AND layout computation separately |
| Showing stale cached lineage | Users make wrong decisions based on outdated data | TTL + last-updated timestamp + refresh button |
| Graph re-renders on every pan/zoom | Laggy, unusable graph despite fast load | Memoize components, throttle handlers, virtualization |
| No feedback when optimization actually worked | Users still complain "it's slow" out of habit | Show timing metrics in UI, before/after comparison |
| Failing silently when path overflow occurs | Wrong lineage shown, users don't know data is incomplete | Error handling + warning message for deep graphs |

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **CTE Optimization:** Often missing correctness regression tests — verify all 73 database tests pass
- [ ] **Caching Layer:** Often missing invalidation strategy — verify TTL on all keys, stampede protection
- [ ] **Frontend Optimization:** Often missing memoization — verify components use React.memo, selective selectors
- [ ] **Performance Claims:** Often missing baseline measurements — verify documented before/after with methodology
- [ ] **Index Creation:** Often missing EXPLAIN analysis — verify execution plan shows index usage
- [ ] **Load Time Improvement:** Often missing breakdown — verify database time vs backend time vs frontend time
- [ ] **Large Graph Testing:** Often missing realistic data scale — verify tested on production-size graphs (600+ nodes)
- [ ] **Cache Key Design:** Often missing cardinality monitoring — verify key count stays bounded

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Broke cycle detection in CTE | MEDIUM | Revert to last working version, run regression tests, fix with test coverage |
| Cache serving stale data | LOW | Flush Redis cache, add TTLs, implement invalidation |
| React re-render performance issue | LOW | Add React.memo to components, profile with DevTools, add selective selectors |
| Database query timeout on deep graphs | MEDIUM | Reduce max_depth, add path length monitoring, optimize CTE join conditions |
| Index creation without benefit | LOW | Drop unused indexes, run EXPLAIN, create selective indexes only |
| Path VARCHAR overflow | HIGH | Redesign path tracking (use IDs not names), adjust max_depth limits |
| ELKjs blocking main thread | MEDIUM | Move to Web Worker, add loading indicator, memoize layout |
| No baseline metrics to compare | HIGH | Stop optimization work, establish benchmarking infrastructure, measure baseline |

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Optimizing without profiling | Phase 1: Requirements/Setup | Documented baseline with timing breakdown |
| Breaking CTE correctness | All phases | 73 database tests pass before commit |
| React re-render hell | Phase 2: Frontend | DevTools Profiler shows < 5 renders per interaction |
| Cache invalidation failures | Phase 3: Caching | Test with schema change, verify fresh data shown |
| Path VARCHAR overflow | Phase 1: Requirements/Setup | Test depth 20+ graphs, verify no truncation |
| ELKjs blocking main thread | Phase 2: Frontend | Performance tab shows no > 500ms blocking tasks |
| Measuring "feels faster" | Phase 1: Requirements/Setup | Automated benchmark with median timing |
| Premature index creation | Phase 1: Database | EXPLAIN plan shows index usage |

## Phase-Specific Research Flags

Phases that will need deeper investigation during execution.

**Phase 1 (Database Optimization):**
- MEDIUM confidence on index benefit without EXPLAIN analysis
- Need to validate: which indexes actually help vs. create overhead
- Research needed: Teradata-specific CTE optimization techniques
- Flag: Path VARCHAR sizing needs validation on real deep graphs

**Phase 2 (Frontend Optimization):**
- MEDIUM confidence on ELKjs Web Worker implementation complexity
- Need to validate: React Flow component memoization patterns specific to our graph structure
- Research needed: Optimal virtualization threshold for our data (currently 50)
- Flag: Layout computation time may still be bottleneck even with Web Workers

**Phase 3 (Caching Layer):**
- LOW confidence on optimal cache invalidation strategy for lineage data
- Need to validate: Invalidation granularity (column-level vs table-level vs database-level)
- Research needed: Redis memory requirements for full lineage cache
- Flag: Cache stampede mitigation may require more than TTL jitter

**Phase 4 (Integration & Testing):**
- HIGH confidence — existing test infrastructure (73 DB + 20 API + 260 frontend + 21 E2E)
- Need to validate: Performance regression test suite for continuous monitoring
- Flag: May need separate performance test environment to avoid false positives

## Sources

**Teradata Recursive CTE Performance:**
- [Mastering Recursive CTEs in SQL: A Comprehensive Guide - SQLPad.io](https://sqlpad.io/tutorial/mastering-recursive-ctes-in-sql-a-comprehensive-guide/)
- [Teradata Recursive Queries Guide - DWH Pro](https://www.dwhpro.com/teradata-recursive-queries/)
- [SQL Fundamentals - Teradata Vantage Recursive Queries](https://docs.teradata.com/r/Enterprise_IntelliFlex_VMware/SQL-Fundamentals/SQL-Data-Definition-Control-and-Manipulation/Recursive-Queries)
- [Optimize Recursive CTE Query - Microsoft TechCommunity](https://techcommunity.microsoft.com/t5/datacat/optimize-recursive-cte-query/ba-p/305094)

**React Flow Performance Optimization:**
- [Performance - React Flow Official Docs](https://reactflow.dev/learn/advanced-use/performance)
- [The Ultimate Guide to Optimize React Flow Project Performance - Synergy Codes](https://www.synergycodes.com/webbook/guide-to-optimize-react-flow-project-performance)
- [The Ultimate Guide to Optimize React Flow Project Performance - Medium](https://medium.com/@lukasz.jazwa_32493/the-ultimate-guide-to-optimize-react-flow-project-performance-42f4297b2b7b)
- [React Flow Performance Discussion - GitHub #4975](https://github.com/xyflow/xyflow/discussions/4975)
- [Tuning Edge Animations in Reactflow - Liam ERD](https://liambx.com/blog/tuning-edge-animations-reactflow-optimal-performance)

**Database Query Optimization:**
- [Query Optimization Patterns - Medium](https://medium.com/@artemkhrenov/query-optimization-patterns-writing-efficient-sql-for-high-performance-applications-8143e5028443)
- [Database Optimization Techniques for 2026 - CodeKrio](https://codekrio.tech/database-optimization-techniques/)
- [Stop Optimizing the Wrong Things - Dagster](https://dagster.io/blog/when-and-when-not-to-optimize-data-pipelines)
- [SQL Query Optimization - DataCamp](https://www.datacamp.com/blog/sql-query-optimization)

**Redis Caching Pitfalls:**
- [Redis Caching Pitfalls: Invalidation, Testing & Best Practices - Medium](https://medium.com/@QuarkAndCode/redis-caching-pitfalls-invalidation-testing-best-practices-3950a0660f1a)
- [How to Implement Cache Invalidation with Redis - OneUptime](https://oneuptime.com/blog/post/2026-01-25-redis-cache-invalidation/view)
- [Cache Invalidation - Redis Glossary](https://redis.io/glossary/cache-invalidation/)
- [Caching in 2026: Fundamentals, Invalidation - Medium](https://lukasniessen.medium.com/caching-in-2026-fundamentals-invalidation-and-why-it-matters-more-than-ever-867fee46e98b)
- [Redis Anti-Patterns to Avoid - Redis Official](https://redis.io/tutorials/redis-anti-patterns-every-developer-should-avoid/)

**ELKjs Layout Performance:**
- [Overview - React Flow Layouting](https://reactflow.dev/learn/layouting/layouting)
- [Elkjs Tree Example - React Flow](https://reactflow.dev/examples/layout/elkjs)
- [Building Complex Graph Diagrams with React Flow, ELK.js - Medium](https://dtoyoda10.medium.com/building-complex-graph-diagrams-with-react-flow-elk-js-and-dagre-js-8832f6a461c5)

**Performance Measurement Methodology:**
- [Before and After Automation Metrics - Robotics & Automation News](https://roboticsandautomationnews.com/2026/01/14/before-and-after-automation-metrics-how-to-compare-results-without-fooling-yourself/98139/)
- [Before and After Comparison - Lean 6 Sigma Hub](https://lean6sigmahub.com/before-and-after-comparison-how-to-document-improvement-results-effectively/)

**Flask Performance Profiling:**
- [Demystifying Python Performance: Profiling & Visualization - Naukri Engineering](https://medium.com/naukri-engineering/lets-profile-your-flask-app-70e25d149738)
- [flask_profiler - PyPI](https://pypi.org/project/flask_profiler/)
- [Best Python APM Tools in 2026 - Better Stack](https://betterstack.com/community/comparisons/python-application-monitoring-tools/)
- [Performance Optimization in Flask - Medium](https://medium.com/@christopherthai/performance-optimization-in-flask-tips-and-tricks-for-making-flask-applications-faster-and-more-07b9327277b3)

**Correctness Testing During Optimization:**
- [Regression Testing Guide for 2026 - Leapwork](https://www.leapwork.com/blog/regression-testing)
- [Regression Test Performance Best Practices - Speedscale](https://speedscale.com/blog/regression-test-performance/)
- [Early Detection of Performance Regressions - arXiv](https://arxiv.org/html/2408.08148v1)

**Project-Specific Sources:**
- Existing `benchmark_cte.py` implementation with depth testing
- `lineage_repository.py` recursive CTE patterns with cycle detection
- `LineageGraph.tsx` virtualization threshold and React Flow usage
- 73 database tests + 20 API tests + 260+ frontend tests + 21 E2E tests

---
*Pitfalls research for: Performance Optimization (Database, Backend, Frontend, Caching)*
*Researched: 2026-02-15*
*Target: 60s → 2-4s load time across all graph types*
