# Roadmap: Lineage Application

## Milestones

- **v1.0 Production Readiness** - Phases 1-6 (shipped 2026-01-30)
- **v2.0 Configuration Improvements** - Phases 7-8 (shipped 2026-01-30)
- **v2.1 Pagination UI - Asset Browser** - Phases 9-10 (shipped 2026-01-31)
- **v3.0 Graph Improvements** - Phases 13-18 (in progress)

## Phases

<details>
<summary>v1.0 Production Readiness (Phases 1-6) - SHIPPED 2026-01-30</summary>

See MILESTONES.md for details. 6 phases, 13 plans, 72 files modified.

</details>

<details>
<summary>v2.0 Configuration Improvements (Phases 7-8) - SHIPPED 2026-01-30</summary>

See MILESTONES.md for details. 2 phases, 11 plans, 48 files modified.

</details>

<details>
<summary>v2.1 Pagination UI - Asset Browser (Phases 9-10) - SHIPPED 2026-01-31</summary>

See MILESTONES.md for details. 2 phases, 5 plans.

</details>

### v3.0 Graph Improvements (In Progress)

**Milestone Goal:** Enhance lineage graph usability, validate correctness for production use, and optimize performance for large graphs.

- [x] **Phase 13: Graph Loading Experience** - Progress indicator during graph loading stages
- [x] **Phase 14: Viewport & Space Optimization** - Improved initial positioning and node spacing
- [x] **Phase 15: Correctness Test Data** - Create test fixtures for cycles, diamonds, and fan patterns
- [ ] **Phase 16: Correctness Validation** - Verify graph algorithms handle complex patterns correctly
- [ ] **Phase 17: CTE Performance Optimization** - Benchmark and optimize recursive CTE for deep graphs
- [ ] **Phase 18: Frontend Rendering Performance** - Benchmark and optimize ELK.js and React Flow for large graphs

## Phase Details

### Phase 13: Graph Loading Experience
**Goal**: Users have visual feedback on graph loading progress across data fetch, layout, and render stages
**Depends on**: Nothing (first phase of milestone)
**Requirements**: UX-LOAD-01, UX-LOAD-02, UX-LOAD-03, UX-LOAD-04
**Success Criteria** (what must be TRUE):
  1. User sees a progress bar (0-100%) during graph loading
  2. User sees text indicating current stage (data fetch, layout calculation, rendering)
  3. Progress indicator appears immediately when lineage request starts and disappears when graph is interactive
  4. Loading experience feels responsive (no frozen states or missing feedback)
**Plans**: 2 plans

Plans:
- [x] 13-01-PLAN.md - Create LoadingProgress component and useLoadingProgress hook
- [x] 13-02-PLAN.md - Integrate loading progress into LineageGraph

### Phase 14: Viewport & Space Optimization
**Goal**: Users see a well-positioned, compact graph with minimal unnecessary scrolling
**Depends on**: Phase 13 (loading UX helps verify viewport changes)
**Requirements**: UX-VIEW-01, UX-VIEW-02, UX-VIEW-03, UX-VIEW-04, UX-VIEW-05, UX-SPACE-01, UX-SPACE-02, UX-SPACE-03, UX-SPACE-04
**Success Criteria** (what must be TRUE):
  1. Graph initial viewport starts at top-left showing the source/root nodes
  2. Small graphs (under 20 nodes) zoom to readable text size with minimal empty space
  3. Large graphs (over 50 nodes) fit more nodes on screen while maintaining usability
  4. Node spacing is compact with minimal gaps between tables
  5. User can manually adjust zoom after initial fit completes
**Plans**: 2 plans

Plans:
- [x] 14-01-PLAN.md - Compact layout configuration (reduce ELK spacing)
- [x] 14-02-PLAN.md - Smart viewport positioning (top-left start, size-aware zoom)

### Phase 15: Correctness Test Data
**Goal**: Database contains diverse test patterns (cycles, diamonds, fan-out/fan-in) for validating graph algorithms
**Depends on**: Nothing (can run in parallel with Phase 13-14)
**Requirements**: CORRECT-DATA-01, CORRECT-DATA-02, CORRECT-DATA-03, CORRECT-DATA-04, CORRECT-DATA-05
**Success Criteria** (what must be TRUE):
  1. Test database contains 3+ cycle patterns (2-node, 3-node, 5-node minimum)
  2. Test database contains 3+ diamond patterns (simple, nested, wide)
  3. Test database contains fan-out patterns (1 source to 5+ and 10+ targets)
  4. Test database contains fan-in patterns (5+ and 10+ sources to 1 target)
  5. Test database contains combined patterns (cycle+diamond, fan-out+fan-in together)
**Plans**: 1 plan

Plans:
- [x] 15-01-PLAN.md - Extend test data with comprehensive graph patterns (cycles, diamonds, fan-out/fan-in, combined)

### Phase 16: Correctness Validation
**Goal**: Graph algorithms correctly handle cycles, diamonds, and fan patterns without duplication or infinite loops
**Depends on**: Phase 15 (needs test data)
**Requirements**: CORRECT-VAL-01, CORRECT-VAL-02, CORRECT-VAL-03, CORRECT-VAL-04, CORRECT-VAL-05, CORRECT-VAL-06, CORRECT-VAL-07
**Success Criteria** (what must be TRUE):
  1. Cycle patterns terminate without infinite loops (path tracking works)
  2. Diamond patterns produce single node instances (no duplicate nodes in graph)
  3. Fan-out patterns include all target nodes in the graph
  4. Fan-in patterns include all source nodes in the graph
  5. Node and edge counts match expected values for each test pattern
**Plans**: 2 plans

Plans:
- [ ] 16-01-PLAN.md - Database CTE correctness tests (cycles, diamonds, fans)
- [ ] 16-02-PLAN.md - Frontend integration tests with mock data

### Phase 17: CTE Performance Optimization
**Goal**: Recursive CTE queries perform acceptably at depth 10+ with documented benchmarks
**Depends on**: Phase 15 (needs test data for benchmarking)
**Requirements**: PERF-CTE-01, PERF-CTE-02, PERF-CTE-03, PERF-CTE-04, PERF-CTE-05
**Success Criteria** (what must be TRUE):
  1. Baseline benchmarks documented for depths 5, 10, 15, 20
  2. Performance bottlenecks identified and documented
  3. Optimization applied to identified bottlenecks (if beneficial)
  4. Post-optimization benchmarks show improvement at depth > 10
  5. Query hints evaluated and applied if beneficial for Teradata
**Plans**: TBD

Plans:
- [ ] 17-01: TBD

### Phase 18: Frontend Rendering Performance
**Goal**: ELK.js layout and React Flow rendering perform acceptably with 100+ node graphs
**Depends on**: Phase 15 (needs test data), Phase 14 (uses optimized layout)
**Requirements**: PERF-RENDER-01, PERF-RENDER-02, PERF-RENDER-03, PERF-RENDER-04, PERF-RENDER-05, PERF-RENDER-06
**Success Criteria** (what must be TRUE):
  1. ELK.js layout time benchmarked for 50, 100, 200 node graphs
  2. React Flow render time benchmarked for 50, 100, 200 node graphs
  3. Rendering bottlenecks identified and documented
  4. onlyRenderVisibleElements threshold verified or optimized
  5. Zoom/pan interactions remain responsive (<100ms target) with large graphs
**Plans**: TBD

Plans:
- [ ] 18-01: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 13 -> 14 -> 15 -> 16 -> 17 -> 18
(Note: Phase 15 can run in parallel with 13-14 as it has no dependencies)

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 13. Graph Loading Experience | v3.0 | 2/2 | Complete | 2026-01-31 |
| 14. Viewport & Space Optimization | v3.0 | 2/2 | Complete | 2026-01-31 |
| 15. Correctness Test Data | v3.0 | 1/1 | Complete | 2026-01-31 |
| 16. Correctness Validation | v3.0 | 0/2 | Planned | - |
| 17. CTE Performance Optimization | v3.0 | 0/TBD | Not started | - |
| 18. Frontend Rendering Performance | v3.0 | 0/TBD | Not started | - |

---
*Roadmap created: 2026-01-31*
*Last updated: 2026-01-31 (Phase 16 planned)*
