# Roadmap: Lineage

## Milestones

- ✅ **v1.0 Code Quality & Missing Features** — Phases 1-3 (shipped 2026-02-15)
- ✅ **v2.0 Performance Optimization** — Phases 4-6 (shipped 2026-02-16)
- ✅ **v3.0 Wildcard Expansion & Graph Enhancements** — Phases 7-13 (shipped 2026-02-19)
- ✅ **v4.0 First-Time Load Performance** — Phases 14-18 (shipped 2026-02-21)

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

<details>
<summary>✅ v4.0 First-Time Load Performance (Phases 14-18) — SHIPPED 2026-02-21</summary>

- [x] Phase 14: In-Memory Graph Engine (3/3 plans) — completed 2026-02-20
- [x] Phase 15: Cache Integration (1/1 plan) — completed 2026-02-20
- [x] Phase 16: Progressive Depth Loading (2/2 plans) — completed 2026-02-20
- [x] Phase 17: Observability (2/2 plans) — completed 2026-02-20
- [x] Phase 18: Redis Serialization (1/1 plan) — completed 2026-02-21

See archive: `.planning/milestones/v4.0-ROADMAP.md`

</details>

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
| 16. Progressive Depth Loading | v4.0 | 2/2 | Complete | 2026-02-20 |
| 17. Observability | v4.0 | 2/2 | Complete | 2026-02-20 |
| 18. Redis Serialization | v4.0 | 1/1 | Complete | 2026-02-21 |

### Phase 1: Draggable Minimap Viewport — ✓ Complete (2026-02-22)

**Goal:** Enable interactive minimap navigation (drag-to-pan, scroll-to-zoom) across all graph views with shared component and cursor feedback
**Depends on:** Phase 0
**Plans:** 1 plan

Plans:
- [x] 01-01-PLAN.md — Shared LineageMiniMap component with pannable/zoomable props, cursor CSS, and test updates — completed 2026-02-22
