# Roadmap: Lineage Data Lineage Application

## Milestones

- ✅ **v1.0 Code Quality & Missing Features** — Phases 1-3 (shipped 2026-02-15)
- 🚧 **v2.0 Performance Optimization** — Phases 4-7 (in progress)

## Phases

<details>
<summary>✅ v1.0 Code Quality & Missing Features (Phases 1-3) — SHIPPED 2026-02-15</summary>

- [x] Phase 1: Foundation Refactoring & Impact Analysis Core (6/6 plans) — completed 2026-02-14
- [x] Phase 2: Exception Handling & Observability (4/4 plans) — completed 2026-02-15
- [x] Phase 3: SQL Parser Consolidation & DBQL Validation (2/2 plans) — completed 2026-02-14

**Archive:** See [v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md) for full phase details

</details>

### 🚧 v2.0 Performance Optimization (In Progress)

**Milestone Goal:** Reduce graph loading time from 60 seconds to 2-4 seconds across all graph types (database-level, table-level, column-level lineage graphs).

**Phase Numbering:**
- Integer phases (4, 5, 6, 7): Planned milestone work
- Decimal phases (4.1, 4.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 4: Database Query Optimization** - Optimize Teradata recursive CTEs with indexes, statistics, and path-based cycle detection
- [ ] **Phase 5: Frontend Rendering Optimization** - Eliminate UI freezes with ELKjs Web Worker and React memoization
- [ ] **Phase 6: Caching Layer** - Implement Redis cache-aside pattern for repeated queries
- [ ] **Phase 7: Performance Validation** - Establish automated performance regression detection

## Phase Details

### Phase 4: Database Query Optimization
**Goal**: Reduce recursive CTE query execution time from 50-55s to 10-15s through composite indexing, statistics collection, and path-based cycle detection

**Depends on**: Nothing (first phase of v2.0)

**Requirements**: DBQUERY-01, DBQUERY-02, DBQUERY-03, DBQUERY-04, DBQUERY-05, DBQUERY-06, MEASURE-01, MEASURE-02

**Success Criteria** (what must be TRUE):
  1. 600-node database-level lineage queries execute in under 15 seconds (baseline: 50-55s)
  2. Query execution plans show composite index usage on all join pairs (validated via EXPLAIN)
  3. Statistics are collected and current on all indexed columns (no "stale stats" warnings)
  4. Cycle detection paths use lineage_id integers instead of string concatenation (verified in CTE logic)
  5. All 73 database tests pass including cycle detection tests (CYCLE5_TEST, NESTED_DIAMOND, FANOUT10_TEST)

**Plans**: 3/3 complete

Plans:
- [x] 04-01: Baseline & Index Creation
- [x] 04-02: Query Optimization & Validation
- [x] 04-03: Performance Verification

### Phase 5: Frontend Rendering Optimization
**Goal**: Eliminate 3-5 second UI freeze during graph layout computation while maintaining correct rendering

**Depends on**: Phase 4 (database optimization reduces query time, making frontend bottleneck visible)

**Requirements**: FRONTEND-01, FRONTEND-02, FRONTEND-03, FRONTEND-04, FRONTEND-05, MEASURE-02, MEASURE-03

**Success Criteria** (what must be TRUE):
  1. Graph layout computation happens in Web Worker without blocking main thread (user can interact during layout)
  2. UI shows progressive loading states during graph computation (loading spinner, then database clusters, then full graph)
  3. Component re-render count measured and documented (React Profiler baseline vs optimized)
  4. Large graphs (200+ nodes) render without animation jank (transitions disabled automatically)
  5. All 260+ frontend unit tests and 21 E2E tests pass

**Plans**: 3 plans

Plans:
- [ ] 05-01-PLAN.md — ELKjs Web Worker with Comlink (offload layout to Worker thread)
- [ ] 05-02-PLAN.md — React Profiler instrumentation + CSS transition disabling for large graphs
- [ ] 05-03-PLAN.md — Performance benchmarks (600 nodes, depth 20+) and test validation

### Phase 6: Caching Layer
**Goal**: Achieve sub-2-second response time for repeated lineage queries through Redis cache-aside pattern

**Depends on**: Phase 4 and Phase 5 (cache 2-4s queries, not 60s queries)

**Requirements**: CACHE-01, CACHE-02, CACHE-03, CACHE-04, CACHE-05, CACHE-06, MEASURE-03, MEASURE-04

**Success Criteria** (what must be TRUE):
  1. Repeated graph queries return in under 2 seconds (cache hit baseline: <100ms)
  2. Cache hit rate reaches 80%+ after warmup period (visible in monitoring dashboard)
  3. Stale lineage data expires automatically after 1 hour (TTL enforced on all keys)
  4. ETL jobs can clear affected cache entries via API endpoint (POST /api/v2/cache/invalidate)
  5. Concurrent cache misses don't trigger multiple database queries for same graph (stampede prevention with distributed locks)

**Plans**: TBD

Plans:
- [ ] 06-01: TBD
- [ ] 06-02: TBD

### Phase 7: Performance Validation
**Goal**: Establish automated performance regression detection in CI pipeline

**Depends on**: Phase 4, 5, 6 (optimizations complete, need validation)

**Requirements**: MEASURE-01, MEASURE-02, MEASURE-03, MEASURE-04

**Success Criteria** (what must be TRUE):
  1. CI pipeline runs performance benchmarks on every commit (benchmark_cte.py with 600 nodes, depth 20+)
  2. Performance regressions detected automatically (>10% slowdown triggers build failure)
  3. Benchmark results tracked over time (trends visible in CI artifacts)
  4. All correctness tests pass (73 DB + 20 API + 260+ frontend + 21 E2E = 374 total tests)

**Plans**: TBD

Plans:
- [ ] 07-01: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 4 → 5 → 6 → 7

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Foundation Refactoring & Impact Analysis Core | v1.0 | 6/6 | Complete | 2026-02-14 |
| 2. Exception Handling & Observability | v1.0 | 4/4 | Complete | 2026-02-15 |
| 3. SQL Parser Consolidation & DBQL Validation | v1.0 | 2/2 | Complete | 2026-02-14 |
| 4. Database Query Optimization | v2.0 | 3/3 | Complete | 2026-02-16 |
| 5. Frontend Rendering Optimization | v2.0 | 0/TBD | Not started | - |
| 6. Caching Layer | v2.0 | 0/TBD | Not started | - |
| 7. Performance Validation | v2.0 | 0/TBD | Not started | - |

---
*Roadmap created: 2026-02-14*
*Last updated: 2026-02-15 (v2.0 milestone roadmap created)*
