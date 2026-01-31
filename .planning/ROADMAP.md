# Roadmap: Lineage Application

## Milestones

- ✅ **v1.0 Production Readiness** - Phases 1-6 (shipped 2026-01-30)
- ✅ **v2.0 Configuration Improvements** - Phases 7-8 (shipped 2026-01-30)
- 🚧 **v2.1 Pagination UI Completion** - Phases 9-12 (in progress)

## Phases

<details>
<summary>✅ v1.0 Production Readiness (Phases 1-6) - SHIPPED 2026-01-30</summary>

See MILESTONES.md for details. 6 phases, 13 plans, 72 files modified.

</details>

<details>
<summary>✅ v2.0 Configuration Improvements (Phases 7-8) - SHIPPED 2026-01-30</summary>

See MILESTONES.md for details. 2 phases, 11 plans, 48 files modified.

</details>

### 🚧 v2.1 Pagination UI Completion (In Progress)

**Milestone Goal:** Complete pagination feature by adding frontend controls across all user-facing views.

- [x] **Phase 9: Pagination Component** - Build reusable pagination UI component
- [x] **Phase 10: Asset Browser Integration** - Integrate pagination into database/table/column views
- [ ] **Phase 11: Search & Graph Integration** - Integrate pagination into search results and lineage views
- [ ] **Phase 12: Testing** - Comprehensive unit, integration, and E2E test coverage

## Phase Details

### Phase 9: Pagination Component
**Goal**: Users have a consistent, accessible pagination control for navigating large data sets
**Depends on**: Nothing (first phase of milestone)
**Requirements**: UI-01, UI-02, UI-03, UI-04, UI-05
**Success Criteria** (what must be TRUE):
  1. User sees current page number and total pages displayed
  2. User can click Previous/Next buttons to navigate between pages
  3. User sees "Showing X-Y of Z items" information
  4. Pagination component matches existing application styling
  5. Pagination controls work correctly on mobile viewports
**Plans**: 1 plan

Plans:
- [x] 09-01-PLAN.md - Enhance Pagination component with First/Last buttons, page size selector, page number display

### Phase 10: Asset Browser Integration
**Goal**: Users can navigate through paginated database, table, and column lists
**Depends on**: Phase 9
**Requirements**: ASSET-01, ASSET-02, ASSET-03, ASSET-04, ASSET-05, ASSET-06, ASSET-07
**Success Criteria** (what must be TRUE):
  1. User sees pagination controls on database list (always visible per context decision)
  2. User sees pagination controls on table list when database expanded (always visible)
  3. User sees pagination controls on column list when table expanded (always visible)
  4. User's page selection persists when navigating away and returning to a list
  5. Pagination resets to page 1 when user switches context (different database or table)
  6. Column list scrolls table header into view when changing pagination pages (UAT gap closure)
**Plans**: 4 plans

Plans:
- [x] 10-01-PLAN.md - Database and table list pagination integration
- [x] 10-02-PLAN.md - Column list pagination and test mock updates
- [x] 10-03-PLAN.md - Pagination test coverage
- [x] 10-04-PLAN.md - Gap closure: scroll-into-view on pagination changes

### Phase 11: Search & Graph Integration
**Goal**: Users can navigate paginated search results and lineage views
**Depends on**: Phase 9
**Requirements**: SEARCH-01, SEARCH-02, SEARCH-03, GRAPH-01, GRAPH-02
**Success Criteria** (what must be TRUE):
  1. User sees pagination controls on search results when more than 100 matches
  2. User's search query is preserved when navigating between result pages
  3. Pagination resets to page 1 when user enters a new search query
  4. Lineage views with paginated data show appropriate pagination controls
**Plans**: TBD

Plans:
- [ ] 11-01: Search results pagination integration
- [ ] 11-02: Lineage graph pagination integration

### Phase 12: Testing
**Goal**: All pagination functionality is verified through automated tests
**Depends on**: Phase 10, Phase 11
**Requirements**: TEST-01, TEST-02, TEST-03, TEST-04, TEST-05, TEST-06
**Success Criteria** (what must be TRUE):
  1. Unit tests verify component renders correctly in all states
  2. Unit tests verify navigation callbacks and boundary conditions
  3. Integration tests verify hooks and component work together
  4. E2E tests verify pagination works on asset browser pages using live Teradata database
  5. E2E tests verify pagination works on search results using live Teradata database
**Plans**: TBD

Plans:
- [ ] 12-01: Unit and integration tests
- [ ] 12-02: E2E tests (leverages Teradata database defined in .env)

## Progress

**Execution Order:**
Phases execute in numeric order: 9 → 10 → 11 → 12

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 9. Pagination Component | v2.1 | 1/1 | ✓ Complete | 2026-01-31 |
| 10. Asset Browser Integration | v2.1 | 4/4 | ✓ Complete | 2026-01-31 |
| 11. Search & Graph Integration | v2.1 | 0/2 | Not started | - |
| 12. Testing | v2.1 | 0/2 | Not started | - |

---
*Roadmap created: 2026-01-31*
*Last updated: 2026-01-31*
