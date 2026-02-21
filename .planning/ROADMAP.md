# Roadmap: Lineage

## Milestones

- ✅ **v1.0 Code Quality & Missing Features** — Phases 1-3 (shipped 2026-02-15)
- ✅ **v2.0 Performance Optimization** — Phases 4-6 (shipped 2026-02-16)
- ✅ **v3.0 Wildcard Expansion & Graph Enhancements** — Phases 7-13 (shipped 2026-02-19)
- 🚧 **v4.0 First-Time Load Performance** — Phases 14-18 (in progress)

## Phases

<details>
<summary>✅ v1.0 Code Quality & Missing Features (Phases 1-3) — SHIPPED 2026-02-15</summary>

- [x] Phase 1: Impact Analysis Implementation (4/4 plans) — completed 2026-02-15
- [x] Phase 2: Exception Handling & Observability (4/4 plans) — completed 2026-02-15
- [x] Phase 3: Architecture Refactoring (4/4 plans) — completed 2026-02-15

See archive: `.planning/milestones/v1.0-ROADMAP.md`

</details>

<details>
<summary>✅ v2.0 Performance Optimization (Phases 4-6) — SHIPPED 2026-02-16</summary>

- [x] Phase 4: Database Query Optimization (3/3 plans) — completed 2026-02-16
- [x] Phase 5: Frontend Rendering Performance (3/3 plans) — completed 2026-02-16
- [x] Phase 6: Redis Caching Layer (2/2 plans) — completed 2026-02-16

See archive: `.planning/milestones/v2.0-ROADMAP.md`

</details>

<details>
<summary>✅ v3.0 Wildcard Expansion & Graph Enhancements (Phases 7-13) — SHIPPED 2026-02-19</summary>

- [x] Phase 7: Core Wildcard Expansion + Metadata Caching (3/3 plans) — completed 2026-02-19
- [x] Phase 8: Qualified Wildcards + Schema Evolution (2/2 plans) — completed 2026-02-19
- [x] Phase 9: View Expansion (2/2 plans) — completed 2026-02-19
- [x] Phase 10: View Lineage — data flow through views to source tables (2/2 plans) — completed 2026-02-19
- [x] Phase 11: Alphabetical Column Sorting in graph nodes (1/1 plan) — completed 2026-02-19
- [x] Phase 12: Prevent Database Cluster Overlap (1/1 plan) — completed 2026-02-19
- [x] Phase 13: Multi-Select and Group Move (2/2 plans) — completed 2026-02-19

See archive: `.planning/milestones/v3.0-ROADMAP.md`

</details>

### 🚧 v4.0 First-Time Load Performance (In Progress)

**Milestone Goal:** Eliminate database round-trips for lineage traversal by building an in-memory graph engine with progressive depth loading, reducing first-time graph load from seconds to <500ms.

#### Phase 14: In-Memory Graph Engine

**Goal:** The application serves all lineage traversals from an in-memory networkx DiGraph, eliminating recursive CTE database round-trips while falling back transparently to the existing CTE path during warm-up or on engine failure.

**Depends on:** Phase 13 (existing codebase — no new dependencies)

**Requirements:** GRAPH-01, GRAPH-02, GRAPH-03, GRAPH-04, GRAPH-05, GRAPH-06, GRAPH-07, GRAPH-08

**Success Criteria** (what must be TRUE when this phase completes):
1. A lineage graph for any column loads in <100ms measured at the API level on a warm application (BFS traversal replaces CTE round-trip)
2. The application starts handling requests immediately; lineage graphs fall back to CTE results while the in-memory graph initializes in the background (no startup blocking)
3. Deploying a new version with `--preload` or `--workers 1 --threads N` does not serve inconsistent lineage across requests during or after startup
4. BFS traversal produces identical nodes, edges, and transformation types to the existing CTE query for CYCLE5, NESTED_DIAMOND, and FANOUT10 test patterns at all depth values
5. `GET /api/v2/graph/status` returns node count, edge count, last rebuild time, memory usage, and current warm-up status

**Plans:** 3 plans

Plans:
- [x] 14-01-PLAN.md — GraphStore dataclass, GraphLoader database-to-DiGraph, graph package, requirements.txt
- [x] 14-02-PLAN.md — GraphEngine singleton with BFS traversal, blue-green swap, dual-path routing in LineageService
- [x] 14-03-PLAN.md — Graph status endpoint, blueprint registration, BFS/CTE equivalence unit tests

#### Phase 15: Cache Integration

**Goal:** The ETL-triggered `/cache/invalidate` endpoint atomically clears Redis and rebuilds the in-memory graph in a single operation, so users never see stale post-ETL lineage regardless of which cache layer serves their request.

**Depends on:** Phase 14 (requires working GraphEngine with `invalidate()` method)

**Requirements:** CACHE-01, CACHE-02, CACHE-03

**Success Criteria** (what must be TRUE when this phase completes):
1. Calling `POST /api/v2/cache/invalidate` clears Redis cache AND triggers an in-memory graph rebuild — a single operation invalidates all three layers
2. After ETL updates Teradata and triggers invalidation, subsequent lineage API responses reflect the updated data (no stale pre-ETL results visible)
3. During the graph rebuild window after invalidation, the API serves correct results via CTE fallback — no stale graph data is served from the old in-memory graph

**Plans:** 1 plan

Plans:
- [x] 15-01-PLAN.md — Add GraphEngine.invalidate() method, wire into cache endpoint, add three-layer consistency unit tests

#### Phase 16: Progressive Depth Loading

**Goal:** Users see a depth-1 lineage graph within 200ms of clicking a column; the full-depth graph expands automatically in the background without any node position jumping or layout jitter.

**Depends on:** Phase 15 (graph engine must be correct before building UX on top of it)

**Requirements:** PROG-01, PROG-02, PROG-03, PROG-04, PROG-05

**Success Criteria** (what must be TRUE when this phase completes):
1. Clicking a column displays a rendered depth-1 lineage graph within 200ms (measured from click to first visible graph nodes)
2. The full-depth graph appears automatically after depth-1 without any user action — no second click or manual expand required
3. Nodes visible in the depth-1 graph do not change position when deeper levels are added (zero layout jitter between depth-1 and full-depth renders)
4. ELKjs layout runs exactly once per graph load — only after the final depth data arrives, not after each intermediate depth
5. A loading indicator shows the two-stage progress: depth-1 complete, then full-depth expanding

**Plans:** TBD

Plans:
- [ ] 16-01: Two-request polling model in TanStack Query — depth-1 fetch then full-depth prefetch
- [ ] 16-02: Frontend progressive merge — Zustand appendGraph(), deferred ELKjs layout to final depth, progress indicator

#### Phase 17: Observability

**Goal:** Developers and operators can see exactly where time is spent in the lineage pipeline — from database query (or in-memory traversal) through layout to render — via API response headers and a metrics endpoint.

**Depends on:** Phase 16 (timing headers should reflect progressive loading stages once they exist)

**Requirements:** OBS-01, OBS-02, OBS-03

**Success Criteria** (what must be TRUE when this phase completes):
1. Every lineage API response includes timing headers showing database query time vs in-memory traversal time, making the performance difference between CTE and BFS paths observable without log access
2. `GET /api/v2/graph/status` (or equivalent metrics endpoint) returns current node count, edge count, last rebuild timestamp, and process memory usage — accessible without connecting to the server host
3. The frontend loading progress display shows per-stage timing (fetch duration, layout duration, render duration) visible to the user during graph load

**Plans:** TBD

Plans:
- [ ] 17-01: API timing headers (X-Timing-*) and graph metrics endpoint enhancement
- [ ] 17-02: Frontend per-stage timing display in loading progress indicator

#### Phase 18: Redis Serialization

**Goal:** A cold application restart restores the in-memory graph from Redis within 1 second instead of re-querying all OL_COLUMN_LINEAGE rows from Teradata, and memory usage remains stable across multiple ETL rebuild cycles.

**Depends on:** Phase 17 (hardening after the core engine and UX are validated in production)

**Requirements:** REDIS-01, REDIS-02, REDIS-03

**Success Criteria** (what must be TRUE when this phase completes):
1. After app restart with a warm Redis cache, lineage graphs are served from the in-memory engine within <1 second of startup (no Teradata query required for graph initialization)
2. A cold restart with an empty Redis falls back to Teradata load — the application starts and warms up correctly without any manual intervention
3. Process memory (RSS) is stable — not monotonically growing — after 3 simulated ETL rebuild cycles that each swap the in-memory graph

**Plans:** TBD

Plans:
- [ ] 18-01: Redis graph serialization on warm-up (nx.node_link_data → JSON → Redis) and restore on cold start

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Impact Analysis | v1.0 | 4/4 | Complete | 2026-02-15 |
| 2. Exception Handling | v1.0 | 4/4 | Complete | 2026-02-15 |
| 3. Architecture Refactoring | v1.0 | 4/4 | Complete | 2026-02-15 |
| 4. Database Optimization | v2.0 | 3/3 | Complete | 2026-02-16 |
| 5. Frontend Performance | v2.0 | 3/3 | Complete | 2026-02-16 |
| 6. Redis Caching | v2.0 | 2/2 | Complete | 2026-02-16 |
| 7. Core Wildcard Expansion | v3.0 | 3/3 | Complete | 2026-02-19 |
| 8. Qualified Wildcards | v3.0 | 2/2 | Complete | 2026-02-19 |
| 9. View Expansion | v3.0 | 2/2 | Complete | 2026-02-19 |
| 10. View Lineage | v3.0 | 2/2 | Complete | 2026-02-19 |
| 11. Alphabetical Column Sort | v3.0 | 1/1 | Complete | 2026-02-19 |
| 12. Cluster Overlap Prevention | v3.0 | 1/1 | Complete | 2026-02-19 |
| 13. Multi-Select & Group Move | v3.0 | 2/2 | Complete | 2026-02-19 |
| 14. In-Memory Graph Engine | v4.0 | 3/3 | Complete | 2026-02-20 |
| 15. Cache Integration | v4.0 | 1/1 | Complete | 2026-02-20 |
| 16. Progressive Depth Loading | v4.0 | 0/2 | Not started | - |
| 17. Observability | v4.0 | 0/2 | Not started | - |
| 18. Redis Serialization | v4.0 | 0/1 | Not started | - |
