# Requirements: Lineage v2.0 Performance Optimization

**Defined:** 2026-02-15
**Core Value:** Enable accurate impact analysis for database changes by visualizing complete column-level lineage across Teradata databases

## v1 Requirements

Requirements for v2.0 Performance Optimization. Target: 60s → 2-4s end-to-end load time across all graph types.

### Database Query Optimization

- [ ] **DBQUERY-01**: User experiences <15s query time for 600-node database-level lineage graphs (composite indexes on join pairs)
- [ ] **DBQUERY-02**: Teradata optimizer uses indexes effectively (statistics collected on all indexed columns)
- [ ] **DBQUERY-03**: Cycle detection uses lineage_id-based paths instead of string concatenation
- [ ] **DBQUERY-04**: Multi-user queries execute concurrently without lock contention (LOCKING ROW FOR ACCESS)
- [ ] **DBQUERY-05**: Baseline performance metrics established via benchmark_cte.py (depths, iterations, timing)
- [ ] **DBQUERY-06**: Query execution plans validated via EXPLAIN analysis (confirms index usage)

### Frontend Rendering Optimization

- [ ] **FRONTEND-01**: UI remains responsive during graph layout (ELKjs Web Worker non-blocking)
- [ ] **FRONTEND-02**: Component re-render frequency measured and optimized (React Profiler instrumentation)
- [ ] **FRONTEND-03**: Graph component props stable across renders (memoization audit complete)
- [ ] **FRONTEND-04**: User sees loading progress during graph computation (progressive rendering states)
- [ ] **FRONTEND-05**: Large graphs render without animation jank (CSS transitions disabled >200 nodes)

### Caching Layer

- [ ] **CACHE-01**: Repeated graph queries return in <2s (Redis cache-aside at repository layer)
- [ ] **CACHE-02**: Cache invalidation targets specific graphs (structured keys with pattern-based clearing)
- [ ] **CACHE-03**: Stale lineage automatically expires (1-hour TTL + event-based invalidation)
- [ ] **CACHE-04**: ETL jobs can clear affected cache entries (invalidation API endpoint)
- [ ] **CACHE-05**: Concurrent cache misses don't overwhelm database (stampede prevention with distributed locks)
- [ ] **CACHE-06**: Cache effectiveness visible to operators (hit rate monitoring and metrics endpoint)

### Measurement & Validation

- [ ] **MEASURE-01**: Performance bottleneck identified before optimization (timing instrumentation in API/frontend)
- [ ] **MEASURE-02**: Optimizations preserve correctness (all 73 database tests pass before/after changes)
- [ ] **MEASURE-03**: Performance validated on realistic workloads (benchmark suite with 600 nodes, depth 20+)
- [ ] **MEASURE-04**: Performance regressions detected automatically (CI pipeline benchmarking)

## v2 Requirements

Deferred optimizations. Only pursue if v2.0 doesn't achieve 2-4s target.

### Advanced Query Patterns

- **ADVANCED-01**: VARCHAR path columns sized optimally (reduce from 4000 to 2x measured max depth)
- **ADVANCED-02**: Queries filter by namespace early (push to base query)
- **ADVANCED-03**: Depth changes avoid full layout recalculation (incremental layout)
- **ADVANCED-04**: Common traversal patterns use materialized views (join indexes if needed)

## Out of Scope

Explicitly excluded from v2.0. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Security hardening (auth, rate limiting) | Defer to v3.0; focus on performance first |
| New features (version tracking, batch operations) | Defer to v3.0; validate performance improvements first |
| Alternative graph libraries (Cytoscape, vis.js) | React Flow 12.0 is sufficient; switching introduces risk |
| Graph database migration (Neo4j) | Preserve OpenLineage schema; Teradata optimization is proven approach |
| Canvas renderer | React Flow v12 doesn't support canvas yet; monitor future releases |
| Query result pagination | Full graph needed for correct lineage visualization; caching addresses performance |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| (To be filled by roadmapper) | | |

**Coverage:**
- v1 requirements: 21 total
- Mapped to phases: 0 (pending roadmap)
- Unmapped: 21 ⚠️

---
*Requirements defined: 2026-02-15*
*Last updated: 2026-02-15 after initial definition*
