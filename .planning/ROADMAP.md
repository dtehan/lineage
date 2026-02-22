# Roadmap: Lineage

## Milestones

- ✅ **v1.0 Code Quality & Missing Features** — Phases 1-3 (shipped 2026-02-15)
- ✅ **v2.0 Performance Optimization** — Phases 4-6 (shipped 2026-02-16)
- ✅ **v3.0 Wildcard Expansion & Graph Enhancements** — Phases 7-13 (shipped 2026-02-19)
- ✅ **v4.0 First-Time Load Performance** — Phases 14-18 (shipped 2026-02-21)
- 🚧 **v5.0 Database Lineage Layout** — Phases 19-21 (in progress)

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

### 🚧 v5.0 Database Lineage Layout (In Progress)

**Milestone Goal:** Fix database lineage graph layout so connected tables flow left-to-right and disconnected tables arrange in a compact grid, replacing the broken vertical stack.

#### Phase 19: Layout Engine Foundation

**Goal:** The layout engine is correct and performant at real database scale before any new algorithm is introduced
**Depends on:** Nothing (first v5.0 phase)
**Requirements:** LFND-01, LFND-02, LFND-03, LFND-04, LFND-05, LFND-06
**Success Criteria** (what must be TRUE):
  1. Database lineage graph with 200-500 tables renders without visible frame drops (layout runs off main thread via Web Worker)
  2. Cluster boxes around database groups correctly enclose their nodes with no gaps or over-expansion across layout zone boundaries
  3. Switching lineage direction (upstream/downstream) does not produce stale or doubled layouts from race conditions
  4. Database cluster colors remain stable on repeated renders and across page refreshes — same database always gets the same color
  5. Kahn topological sort completes without sort-per-iteration slowdown visible in browser profiler at 400+ node graphs
**Plans:** TBD

Plans:
- [ ] 19-01: Migrate DatabaseLineageGraph layout to Web Worker (LFND-04) and fix direction-change cancellation race condition (LFND-05)
- [ ] 19-02: Fix ClusterBackground stale dimensions (LFND-02), separateDatabaseClusters non-contiguous bounding box (LFND-03), Kahn sort-per-iteration degradation (LFND-01), and deterministic cluster colors (LFND-06)

#### Phase 20: Mixed Layout Strategy

**Goal:** Connected tables flow left-to-right in topological order and disconnected tables appear in a compact alphabetical grid — the core v5.0 layout fix is live
**Depends on:** Phase 19
**Requirements:** MLST-01, MLST-02, MLST-03, MLST-04, MLST-05, MLST-06
**Success Criteria** (what must be TRUE):
  1. Tables with lineage relationships appear in left-to-right columns representing their topological depth in the data flow
  2. Tables with no lineage connections appear in a compact grid below the connected section, not mixed into the hierarchical layout
  3. No node overlaps between the connected hierarchical section and the disconnected grid section
  4. Both DatabaseLineageGraph and AllDatabasesLineageGraph show the correct two-zone layout without any caller changes
  5. ELK simple-node fallback path also produces non-overlapping component separation when triggered
**Plans:** TBD

Plans:
- [ ] 20-01: Implement detectConnectedComponents() and refactor Kahn + longest-path layering to run per component
- [ ] 20-02: Add isolated table grid placement and layoutSimpleNodes ELK config fix (separateConnectedComponents, componentComponent spacing, aspectRatio)

#### Phase 21: UX Polish

**Goal:** The two-zone layout is self-explanatory and user-controllable — disconnected tables are labeled, countable, and hideable
**Depends on:** Phase 20
**Requirements:** UXPL-01, UXPL-02, UXPL-03
**Success Criteria** (what must be TRUE):
  1. A visible label "Tables without lineage connections (N)" marks the disconnected grid so users understand the section is intentional, not a layout bug
  2. User can toggle a "Hide tables without lineage" control in the toolbar to show or hide the disconnected section without a page reload
  3. The database header displays both the count of tables in the lineage flow and the count of isolated tables before the user opens the graph
**Plans:** TBD

Plans:
- [ ] 21-01: Section label for isolated grid, "hide" toggle in toolbar (useUIStore), and isolated table count in database header

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
| 19. Layout Engine Foundation | v5.0 | 0/2 | Not started | - |
| 20. Mixed Layout Strategy | v5.0 | 0/2 | Not started | - |
| 21. UX Polish | v5.0 | 0/1 | Not started | - |
