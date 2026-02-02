# Roadmap: Lineage Application

## Milestones

- [x] **v1.0 Production Readiness** - Phases 1-6 (shipped 2026-01-30)
- [x] **v2.0 Configuration Improvements** - Phases 7-8 (shipped 2026-01-30)
- [x] **v2.1 Pagination UI - Asset Browser** - Phases 9-10 (shipped 2026-01-31)
- [x] **v3.0 Graph Improvements** - Phases 13-18 (shipped 2026-01-31)
- [ ] **v4.0 Interactive Graph Experience** - Phases 19-23 (in progress)

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

<details>
<summary>v3.0 Graph Improvements (Phases 13-18) - SHIPPED 2026-01-31</summary>

See [milestones/v3.0-ROADMAP.md](milestones/v3.0-ROADMAP.md) for full details. 6 phases, 11 plans, 53 files modified.

</details>

### v4.0 Interactive Graph Experience (In Progress)

**Milestone Goal:** Transform the lineage graph into an interactive experience with polished animations, enhanced selection features, and a comprehensive detail panel with statistics and DDL display.

**Context:** 70% of features already exist (selection, highlighting, DetailPanel). Focus is on polish and enhancement, not new architecture. No new dependencies needed.

#### Phase 19: Animation & Transitions
**Goal**: Establish smooth, natural CSS animation patterns that make graph interactions feel polished
**Depends on**: Nothing (starts fresh from v3.0)
**Requirements**: ANIM-01, ANIM-02, ANIM-03, ANIM-04
**Success Criteria** (what must be TRUE):
  1. User sees smooth fade when nodes highlight/unhighlight (no instant snap)
  2. Unrelated nodes dim smoothly when selection active (200-300ms transition)
  3. Detail panel slides in/out with animation (not instant appear/disappear)
  4. All transitions feel natural with consistent ease-out timing
**Plans**: TBD

Plans:
- [ ] 19-01: TBD

#### Phase 20: Backend Statistics & DDL API
**Goal**: Provide backend endpoints that supply table/view metadata for the enhanced detail panel
**Depends on**: Nothing (can run parallel with Phase 19)
**Requirements**: API-01, API-02, API-03, API-04, API-05, API-06
**Success Criteria** (what must be TRUE):
  1. API returns statistics (row count, size, dates, owner, type) for any dataset
  2. API returns DDL/view definition SQL for views
  3. API returns table/column comments when available
  4. API returns 404 for missing datasets (not 500 with details)
  5. Both tables and views are supported by statistics/DDL endpoints
**Plans**: TBD

Plans:
- [ ] 20-01: TBD

#### Phase 21: Detail Panel Enhancement
**Goal**: Transform the existing detail panel into a comprehensive metadata viewer with tabs
**Depends on**: Phase 20 (needs statistics/DDL endpoints)
**Requirements**: PANEL-01, PANEL-02, PANEL-03, PANEL-04, PANEL-05, PANEL-06, PANEL-07, PANEL-08
**Success Criteria** (what must be TRUE):
  1. User can switch between Columns, Statistics, and DDL tabs
  2. Statistics tab displays table metadata (row count, size, dates, owner)
  3. DDL tab shows view SQL with syntax highlighting
  4. Clicking a column name navigates to that column's lineage graph
  5. Each tab shows loading state independently while fetching data
  6. Failed fetches show graceful error state (not crash or blank)
  7. Large content (many columns, long SQL) scrolls independently per tab
**Plans**: TBD

Plans:
- [ ] 21-01: TBD

#### Phase 22: Selection Features
**Goal**: Enhance selection interaction with viewport control and navigation breadcrumbs
**Depends on**: Phase 21 (breadcrumb appears in panel header)
**Requirements**: SELECT-01, SELECT-02, SELECT-03, SELECT-04, SELECT-05
**Success Criteria** (what must be TRUE):
  1. User can click "Fit to selection" to center viewport on highlighted lineage path
  2. Fit-to-selection includes appropriate padding around selected nodes
  3. Panel header shows selection hierarchy breadcrumb (database > table > column)
  4. Breadcrumb updates immediately when user changes selection
  5. Selection state persists when user changes graph depth (when possible)
**Plans**: TBD

Plans:
- [ ] 22-01: TBD

#### Phase 23: Testing & Validation
**Goal**: Ensure all v4.0 features have comprehensive test coverage
**Depends on**: Phases 19-22 (tests verify implemented features)
**Requirements**: TEST-01, TEST-02, TEST-03, TEST-04, TEST-05, TEST-06
**Success Criteria** (what must be TRUE):
  1. Unit tests cover hover tooltip behavior for different node types
  2. Integration tests verify fit-to-selection viewport calculations
  3. E2E tests verify panel column click navigates to new lineage graph
  4. Performance tests verify hover responsiveness on 100+ node graphs
  5. API tests verify statistics and DDL endpoints (success and error cases)
  6. Frontend tests verify tab switching and error state handling
**Plans**: TBD

Plans:
- [ ] 23-01: TBD

## Progress

**Execution Order:** 19 -> 20 (parallel possible) -> 21 -> 22 -> 23

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 19. Animation & Transitions | v4.0 | 0/TBD | Not started | - |
| 20. Backend Statistics & DDL API | v4.0 | 0/TBD | Not started | - |
| 21. Detail Panel Enhancement | v4.0 | 0/TBD | Not started | - |
| 22. Selection Features | v4.0 | 0/TBD | Not started | - |
| 23. Testing & Validation | v4.0 | 0/TBD | Not started | - |

---
*Roadmap created: 2026-01-31*
*Last updated: 2026-02-01 (v4.0 roadmap added)*
