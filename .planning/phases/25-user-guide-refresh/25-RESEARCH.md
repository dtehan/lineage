# Phase 25: User Guide Refresh - Research

**Researched:** 2026-02-08
**Domain:** Documentation / User-facing feature documentation
**Confidence:** HIGH

## Summary

This phase refreshes `docs/user_guide.md` to document all current user-facing features, addressing 11 specific requirements (USER-01 through USER-11). Research involved reading every UI component referenced by the requirements to establish the actual, implemented behavior.

The existing user guide is comprehensive (1,716 lines) but has gaps for several features that have been added since the guide was last updated: (1) the asset browser has client-side pagination in its test suite but the component itself lacks pagination controls -- this is an implementation gap the guide must document accurately based on what actually exists; (2) loading progress stages are implemented but not documented in the user guide; (3) the detail panel now has a 3-tab interface (Columns, Statistics, DDL) that is only partially documented; (4) fit-to-selection is a new toolbar control not mentioned in the guide; (5) the DDL tab uses `prism-react-renderer` for syntax highlighting, which is not documented.

**Primary recommendation:** Update the existing user guide in place, section by section, to cover each USER requirement. Do NOT rewrite from scratch -- the existing guide is well-structured and most content is still accurate. Focus on filling gaps and updating outdated descriptions.

## Standard Stack

This is a documentation-only phase. No libraries are installed. The "stack" is the existing user guide format and the existing application features.

### Core Tools
| Tool | Purpose | Why Standard |
|------|---------|--------------|
| Markdown | Documentation format | Used throughout project, GitHub renders natively |
| Screenshots (PNG) | Visual feature documentation | USER-11 requires screenshots of key features |

### Supporting
| Tool | Purpose | When to Use |
|------|---------|-------------|
| Playwright | Screenshot capture | Can be used for automated screenshots if desired |
| Browser dev tools | Manual screenshot capture | Alternative for screenshot creation |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Manual screenshots | Playwright automated capture | Manual is simpler for a one-time task; automated is more maintainable |
| Inline base64 images | File-referenced images | File references are standard for git repos (smaller diffs, reusable) |

## Architecture Patterns

### Document Structure (Current)
```
docs/
├── user_guide.md        # PRIMARY TARGET - 1,716 lines currently
├── SECURITY.md          # Not in scope
└── screenshots/         # DOES NOT EXIST YET - needs creation for USER-11
```

### Pattern: Section-by-Requirement Mapping

Each USER requirement maps to specific sections of the existing user guide:

| Requirement | Target Section | Status |
|-------------|---------------|--------|
| USER-01: Pagination controls | "Asset Browser (Explore Page)" | **GAP** - pagination not documented (tests exist but component lacks controls) |
| USER-02: Page size selection | "Asset Browser (Explore Page)" | **GAP** - page sizes (25, 50, 100, 200) not documented |
| USER-03: Depth/direction controls | "Toolbar Controls" | **PARTIAL** - exists but needs review for accuracy |
| USER-04: Loading progress bar | NEW SECTION NEEDED | **GAP** - loading stages not documented |
| USER-05: Fit-to-selection | "Toolbar Controls" | **GAP** - new toolbar button not documented |
| USER-06: Detail panel tabs | "Detail Panel" | **GAP** - 3-tab interface (Columns, Statistics, DDL) not documented |
| USER-07: Table statistics | NEW in Detail Panel | **GAP** - statistics tab not documented |
| USER-08: DDL/SQL with syntax highlighting | NEW in Detail Panel | **GAP** - DDL tab not documented |
| USER-09: Click-to-navigate from columns | Detail Panel > Columns tab | **GAP** - clickable column names not documented |
| USER-10: Search functionality | "Search" | **PARTIAL** - exists but uses v1 API description, needs update to OpenLineage API |
| USER-11: Screenshots | Throughout | **GAP** - no screenshots directory or images exist |

### Pattern: Feature-Accurate Documentation

**Critical principle:** Document what ACTUALLY exists in the codebase, not what tests expect to exist. The AssetBrowser tests reference pagination controls (`pagination-info`, `pagination-prev`, `pagination-next`) but the actual component at `/Users/Daniel.Tehan/Code/lineage/lineage-ui/src/components/domain/AssetBrowser/AssetBrowser.tsx` does NOT implement these controls. The "All Databases" lineage graph does have a "Load More" pagination pattern with page size selection (10, 20, 50).

### Anti-Patterns to Avoid
- **Documenting aspirational features:** Do NOT document pagination controls in AssetBrowser that do not actually exist in the component
- **Screenshot placeholders:** Do NOT write `[screenshot placeholder]` -- either include actual screenshots or describe what should be shown
- **Duplicating CLAUDE.md:** The user guide overlaps significantly with CLAUDE.md -- focus on end-user workflows, not developer setup

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Screenshot generation | Custom scripting | Manual screenshots or Playwright's `page.screenshot()` | One-time task, not worth automation overhead |
| Doc generation from code | AST parsing tool | Manual code reading | Components are already well-understood from research |
| Markdown formatting | Custom templates | Standard markdown headings and tables | Consistency with existing guide structure |

**Key insight:** This is a writing task, not a coding task. The research phase provides all the technical details; the planning phase just needs to organize the writing work.

## Common Pitfalls

### Pitfall 1: Documenting Non-Existent Features
**What goes wrong:** Tests for pagination exist in `AssetBrowser.test.tsx` but the actual component does not implement pagination controls. Writing documentation based on tests rather than actual code leads to inaccurate guides.
**Why it happens:** Test files are written test-first, before implementation.
**How to avoid:** Always reference the actual `.tsx` component source, not the `.test.tsx` file.
**Warning signs:** Feature is described in tests but `grep` of component source returns no matches.

### Pitfall 2: Stale API Examples
**What goes wrong:** The existing user guide documents v1 API endpoints (`/api/v1/*`) but the frontend actually uses v2 OpenLineage endpoints (`/api/v2/openlineage/*`).
**Why it happens:** API evolved after initial documentation.
**How to avoid:** Keep user guide focused on UI workflows. The API Reference section can note both APIs exist but end-user documentation should not depend on specific API paths.
**Warning signs:** API examples reference routes the frontend doesn't call.

### Pitfall 3: Over-Documenting Technical Internals
**What goes wrong:** User guide becomes a developer reference instead of an end-user guide.
**Why it happens:** Temptation to document implementation details (e.g., "ELKjs calculates layout at 30-70% progress").
**How to avoid:** Focus on what the user SEES and DOES, not how the system works internally.
**Warning signs:** Mentions of library names, hook names, or component names in user-facing text.

### Pitfall 4: Screenshot Rot
**What goes wrong:** Screenshots become outdated as UI evolves.
**Why it happens:** Screenshots are not automatically regenerated when code changes.
**How to avoid:** Use descriptive captions and keep screenshots at a coarse level (full page or major section, not zoomed-in button details).
**Warning signs:** Screenshots showing UI elements that no longer exist.

### Pitfall 5: Confusing Loading Progress with Loading Spinner
**What goes wrong:** Guide conflates the simple `LoadingSpinner` (used in AssetBrowser) with the staged `LoadingProgress` bar (used during graph rendering).
**Why it happens:** Both relate to "loading" but serve different purposes.
**How to avoid:** Document them as separate concepts. The progress bar has distinct stages; the spinner is a simple indeterminate indicator.

## Code Examples

These are the actual features as implemented in the codebase. Descriptions are written for planner consumption.

### Loading Progress Stages (USER-04)
Source: `/Users/Daniel.Tehan/Code/lineage/lineage-ui/src/hooks/useLoadingProgress.ts`

The loading progress system has 5 stages with defined progress ranges:
```
idle (0%)        -> fetching (15-30%)  -> layout (30-70%)  -> rendering (70-95%) -> complete (100%)
```

Stage messages displayed to user:
- `fetching`: "Loading data..."
- `layout`: "Calculating layout..."
- `rendering`: "Rendering graph..."

During `layout` and `rendering` stages, timing information is shown:
- Elapsed time: "5s", "1m 30s"
- ETA: "~10s"

### Detail Panel Tabs (USER-06, USER-07, USER-08)
Source: `/Users/Daniel.Tehan/Code/lineage/lineage-ui/src/components/domain/LineageGraph/DetailPanel.tsx`

Three tabs in the detail panel when a table/column is selected:
1. **Columns** (LayoutList icon) - List of columns with name, type, nullable/PK badges, lineage counts. Each column name is clickable (navigates to that column's lineage).
2. **Statistics** (BarChart3 icon) - Table metadata: Type, Owner, Created, Last Modified, Row Count, Size (tables only), Comment.
3. **DDL** (Code icon) - For views: View SQL with syntax highlighting (prism-react-renderer, VS Dark theme). For tables: CREATE TABLE DDL. Includes Copy button and line numbers. Truncation warning at 12,500 characters.

### Fit-to-Selection (USER-05)
Source: `/Users/Daniel.Tehan/Code/lineage/lineage-ui/src/components/domain/LineageGraph/hooks/useFitToSelection.ts`

Toolbar button (Crosshair icon) that centers the viewport on the highlighted lineage path. Only enabled when a column is selected and highlighted. Animates with 300ms duration and 15% padding.

### Asset Browser Pagination Status (USER-01, USER-02)
Source: `/Users/Daniel.Tehan/Code/lineage/lineage-ui/src/components/domain/AssetBrowser/AssetBrowser.tsx`

**IMPORTANT FINDING:** The AssetBrowser component does NOT currently implement pagination controls. Tests exist in `AssetBrowser.test.tsx` that expect `pagination-info`, `pagination-prev`, `pagination-next` test IDs, but the actual component has no such elements. The component loads ALL datasets at once (`limit: 1000, offset: 0`).

The "All Databases Lineage" graph (`AllDatabasesLineageGraph.tsx`) DOES have pagination with:
- A "Load More Tables" button with page count selection (10, 20, 50)
- "(X of Y tables loaded)" indicator
- Database filter panel

The user guide currently documents "Loading More Tables" and "Page Size Options" (10, 20, 50) which refers to this All Databases view, not the AssetBrowser.

**For USER-01 and USER-02:** The user guide should document what actually exists. If the requirement specifies page sizes (25, 50, 100, 200), this suggests these features are expected to be IMPLEMENTED before documentation. The planner must determine whether this phase documents existing features or whether implementation is a prerequisite.

### Search (USER-10)
Source: `/Users/Daniel.Tehan/Code/lineage/lineage-ui/src/features/SearchPage.tsx`, `.../Search/SearchResults.tsx`

Search page uses `useOpenLineageUnifiedSearch` which returns both databases and datasets. Results are grouped into "Databases" and "Tables" sections. Each result is expandable to show child items (tables for databases, fields for datasets). Minimum 2 characters required. URL persists query as `?q=...`.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| v1 API (`/api/v1/*`) | v2 OpenLineage API (`/api/v2/openlineage/*`) | Recent phases | Frontend now uses OpenLineage endpoints |
| Simple column detail panel | 3-tab detail panel (Columns, Statistics, DDL) | Recent phases | Much richer table/column inspection |
| No loading progress | Staged progress bar with timing | Phase 18 | Better UX for large graphs |
| No fit-to-selection | Crosshair toolbar button | Phase 19 | Better navigation after highlighting |
| No DDL viewing | DDL tab with syntax highlighting | Recent | Users can inspect table/view definitions |

**Deprecated/outdated in current guide:**
- "Page Size Options" section references 10/20/50 which matches AllDatabases view but may not match AssetBrowser
- Edge color table references DIRECT/DERIVED/AGGREGATED/JOINED/CALCULATION but OpenLineage uses DIRECT(IDENTITY/TRANSFORMATION/AGGREGATION) and INDIRECT(JOIN/FILTER)
- Some navigation routes may have changed (need to verify against actual router config)

## Open Questions

1. **AssetBrowser Pagination: Should the guide document it?**
   - What we know: Tests expect pagination controls, but the component does not implement them. The requirements (USER-01, USER-02) specify documenting pagination with page sizes 25/50/100/200.
   - What's unclear: Is AssetBrowser pagination expected to be implemented in a prior phase, or should this phase implement it?
   - Recommendation: Document only what actually exists. If pagination needs to be added first, that should be a separate task or prerequisite. For now, document the existing "Load More" pattern in All Databases view.

2. **Screenshots: What format and where to store?**
   - What we know: No screenshots directory exists. USER-11 requires screenshots of key features.
   - What's unclear: Whether to use automated (Playwright) or manual capture. Whether the app can be run locally for screenshot capture.
   - Recommendation: Create `docs/screenshots/` directory. Use descriptive filenames like `asset-browser.png`, `lineage-graph.png`. Manual capture is fine for a one-time task.

3. **Edge color/transformation type discrepancy**
   - What we know: The existing guide documents legacy transformation types (DIRECT, DERIVED, AGGREGATED, JOINED, CALCULATION). The OpenLineage schema uses DIRECT/INDIRECT with subtypes (IDENTITY, TRANSFORMATION, AGGREGATION, JOIN, FILTER).
   - What's unclear: Does the frontend display the legacy types or the OpenLineage types?
   - Recommendation: Check the actual edge rendering to determine which type labels are shown in the UI, and document accordingly.

## Sources

### Primary (HIGH confidence)
- Codebase source files (all read directly):
  - `lineage-ui/src/components/domain/AssetBrowser/AssetBrowser.tsx` - actual component (no pagination)
  - `lineage-ui/src/components/domain/AssetBrowser/AssetBrowser.test.tsx` - tests expecting pagination
  - `lineage-ui/src/components/domain/LineageGraph/Toolbar.tsx` - toolbar controls including fit-to-selection
  - `lineage-ui/src/components/domain/LineageGraph/DetailPanel.tsx` - 3-tab detail panel
  - `lineage-ui/src/components/domain/LineageGraph/DetailPanel/ColumnsTab.tsx` - clickable columns
  - `lineage-ui/src/components/domain/LineageGraph/DetailPanel/StatisticsTab.tsx` - table stats
  - `lineage-ui/src/components/domain/LineageGraph/DetailPanel/DDLTab.tsx` - DDL with syntax highlighting
  - `lineage-ui/src/components/domain/LineageGraph/hooks/useFitToSelection.ts` - fit-to-selection
  - `lineage-ui/src/hooks/useLoadingProgress.ts` - loading stages
  - `lineage-ui/src/components/common/LoadingProgress.tsx` - progress bar component
  - `lineage-ui/src/components/domain/LineageGraph/LineageGraph.tsx` - main graph with all features
  - `lineage-ui/src/components/domain/LineageGraph/AllDatabasesLineageGraph.tsx` - pagination in all-db view
  - `lineage-ui/src/features/SearchPage.tsx` - search page
  - `lineage-ui/src/components/domain/Search/SearchResults.tsx` - search results
  - `docs/user_guide.md` - existing guide (1,716 lines)

### Secondary (MEDIUM confidence)
- None needed -- all findings from direct source code reading

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Feature behavior: HIGH - all findings from direct source code reading
- Gap analysis: HIGH - compared requirements against actual component source
- Documentation approach: HIGH - straightforward documentation update task
- Pagination status: HIGH - confirmed component lacks pagination via grep + full file read

**Research date:** 2026-02-08
**Valid until:** Indefinite (introspective documentation of existing codebase)
