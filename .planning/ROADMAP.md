# Roadmap: Lineage

## Milestones

- ✅ **v1.0 Code Quality & Missing Features** — Phases 1-3 (shipped 2026-02-15)
- ✅ **v2.0 Performance Optimization** — Phases 4-6 (shipped 2026-02-16)
- ✅ **v3.0 Wildcard Expansion & Graph Enhancements** — Phases 7-13 (shipped 2026-02-19)
- ✅ **v4.0 First-Time Load Performance** — Phases 14-18 (shipped 2026-02-21)
- ✅ **v5.0 Database Lineage Layout** — Phases 19-21 (shipped 2026-02-22)
- 🚧 **v6.0 Full System Catalog** — Phases 22-23 (in progress)

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

<details>
<summary>✅ Draggable Minimap Viewport (Phase 01) — COMPLETE 2026-02-22</summary>

- [x] Phase 1: Draggable Minimap Viewport (1/1 plan) — completed 2026-02-22

Standalone mini-phase outside main sequence. See `.planning/phases/01-foundation-refactoring-impact-analysis-core/`.

</details>

<details>
<summary>✅ v5.0 Database Lineage Layout (Phases 19-21) — SHIPPED 2026-02-22</summary>

- [x] Phase 19: Layout Engine Foundation (2/2 plans) — completed 2026-02-22
- [x] Phase 20: Mixed Layout Strategy (2/2 plans) — completed 2026-02-22
- [x] Phase 21: UX Polish (1/1 plan) — completed 2026-02-22

See archive: `.planning/milestones/v5.0-ROADMAP.md`

</details>

### 🚧 v6.0 Full System Catalog (In Progress)

**Milestone Goal:** Make every database, table, view, and column on the Teradata system browsable and renderable — even without lineage data.

#### Phase 22: Metadata Population Foundation — completed 2026-02-23
**Goal**: Every user database, table, view, and column is registered in OL_* tables and browsable in the Asset Browser — with system databases excluded and the browser capable of displaying the full catalog without truncation
**Depends on**: Phase 21 (v5.0 complete)
**Requirements**: POP-01, POP-02, BROW-01
**Success Criteria** (what must be TRUE):
  1. User can run the populate script and all user databases, tables, views, and columns appear in OL_* tables
  2. Teradata system databases (DBC, SysAdmin, SYSLIB, Sys_Calendar, and others) do not appear in the Asset Browser or OL_DATASET after population
  3. User can expand any database in the Asset Browser and see all its tables — with no silent truncation at 1000 items regardless of catalog size
  4. The populate script is safe to re-run without destroying existing catalog data unless an explicit full-refresh flag is provided
**Plans**: 3 plans

Plans:
- [x] 22-01-PLAN.md — System DB exclusion, safe re-run, pre-flight checks in populate_lineage.py
- [x] 22-02-PLAN.md — Backend API: GET /databases endpoint and database filter on datasets endpoint
- [x] 22-03-PLAN.md — Frontend: AssetBrowser two-phase lazy loading (databases first, tables on expand)

#### Phase 23: Standalone Table Rendering
**Goal**: Tables with no lineage relationships render as a valid single-node graph with columns — not an error state — and users can distinguish lineage-connected tables from catalog-only tables in the Asset Browser
**Depends on**: Phase 22 (populated OL_DATASET_FIELD required for column verification)
**Requirements**: REND-01, REND-02, REND-03, BROW-02
**Success Criteria** (what must be TRUE):
  1. User can navigate to any table with no lineage data and see a single node card with its columns rendered in the graph view
  2. User sees a "No lineage connections" informational banner (not an error) when viewing a table with zero lineage edges
  3. The backend returns a valid `{nodes, edges}` response for tables with no lineage — never a 404 or error response
  4. User can see a "has lineage" indicator per table in the Asset Browser, distinguishing tables with lineage connections from catalog-only tables
**Plans**: 2 plans

Plans:
- [ ] 23-01-PLAN.md — Backend valid graph response + frontend inline informational banner for standalone tables
- [ ] 23-02-PLAN.md — has_lineage indicator per table in Asset Browser (backend SQL + frontend badge)

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
| 19. Layout Engine Foundation | v5.0 | 2/2 | Complete | 2026-02-22 |
| 20. Mixed Layout Strategy | v5.0 | 2/2 | Complete | 2026-02-22 |
| 21. UX Polish | v5.0 | 1/1 | Complete | 2026-02-22 |
| 22. Metadata Population Foundation | v6.0 | 3/3 | Complete | 2026-02-23 |
| 23. Standalone Table Rendering | v6.0 | 0/2 | Not started | - |
