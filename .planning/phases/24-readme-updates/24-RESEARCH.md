# Phase 24: README Updates - Research

**Researched:** 2026-02-07
**Domain:** Technical documentation (README.md files)
**Confidence:** HIGH

## Summary

This phase requires updating four README files (root, lineage-api, lineage-ui, database) to accurately describe the current state of the codebase after v4.0 completion. The root README exists but is sparse and outdated. The database README exists and is already comprehensive. The lineage-api and lineage-ui READMEs do not exist and must be created.

Research focused on three areas: (1) auditing the current state of each README against the actual codebase, (2) cataloguing the exact features, file structures, and commands that must be documented, and (3) identifying README documentation best practices for multi-component repositories.

**Primary recommendation:** Treat this as an audit-and-write phase with two plans. Plan 1 rewrites the root README with v4.0 features, working quick start, and doc links. Plan 2 creates lineage-api/README.md, creates lineage-ui/README.md, and verifies/updates database/README.md accuracy.

## Standard Stack

No libraries needed. This phase is pure Markdown documentation.

### Tools Used
| Tool | Purpose | Why Standard |
|------|---------|--------------|
| Markdown | Documentation format | GitHub renders it automatically, universal standard |
| Mermaid (optional) | Architecture diagrams | Renders natively in GitHub Markdown |

## Architecture Patterns

### README Hierarchy Pattern for Multi-Component Repos

The established pattern for repositories with multiple components is:

```
README.md              # Project overview, quick start, links to component READMEs
lineage-api/README.md  # Backend-specific: architecture, commands, API endpoints
lineage-ui/README.md   # Frontend-specific: component structure, dev/build/test
database/README.md     # Database-specific: schema, population, testing
```

**Key principle:** Root README is the entry point. It provides project overview and quick start, then links to component READMEs for deeper detail. Component READMEs are self-contained -- someone navigating directly to a subdirectory gets everything they need.

**Avoid duplication:** The root README should NOT repeat detailed information already in component READMEs. Instead, provide a brief summary and link. For example, root says "See [lineage-api/README.md](lineage-api/README.md) for backend architecture details" rather than repeating the full hexagonal architecture description.

### Recommended README Section Order

Based on best practices (makeareadme.com, GitHub conventions):

**Root README:**
1. Project title and description (what it does)
2. Features (current capability list)
3. Quick Start (numbered steps to get running)
4. Technology Stack
5. Architecture (high-level diagram)
6. Documentation links (user guide, ops guide, dev manual)
7. Project Structure (component overview with links)
8. Testing overview
9. Configuration
10. License/Status

**Component README:**
1. Component title and purpose
2. Architecture/Structure (directory tree)
3. Getting started (prerequisites, install, run)
4. Available commands
5. Testing
6. Configuration
7. API endpoints (for backend)

### Anti-Patterns to Avoid
- **Outdated "Work In Progress" banner**: The root README currently has a WIP warning that should be removed or replaced with a version badge now that v4.0 is shipped
- **Deferring to CLAUDE.md for quick start**: The current root README says "See CLAUDE.md for setup instructions" which is poor UX. Quick start belongs in the README itself
- **Duplicating CLAUDE.md**: CLAUDE.md is an AI-facing development reference. The README should contain human-facing documentation, not duplicate CLAUDE.md
- **Stale test counts**: The milestones document 444+ unit tests but grep shows 567 test/it calls. Document accurate counts or use "500+" approximation

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Architecture diagrams | ASCII art | Mermaid diagrams in Markdown | GitHub renders Mermaid natively, easier to maintain |
| Command verification | Manual testing | Copy commands directly from working Makefile/package.json | Source of truth is the config files themselves |
| Feature lists | Memory-based | Audit MILESTONES.md and v4.0-REQUIREMENTS.md | Accurate feature list comes from what was actually shipped |

## Common Pitfalls

### Pitfall 1: Inaccurate Quick Start Commands
**What goes wrong:** README quick start commands don't actually work when followed literally
**Why it happens:** Commands are written from memory rather than tested, or paths/prerequisites are assumed
**How to avoid:** Every command in the README must be copied from actual working config files (Makefile, package.json, scripts). The CLAUDE.md already has the canonical commands -- use these as source of truth
**Warning signs:** Commands that assume a specific working directory without stating it, missing prerequisite steps

### Pitfall 2: Stale Feature Lists
**What goes wrong:** README lists features from an older version, missing new capabilities
**Why it happens:** Documentation is written once and not updated with each milestone
**How to avoid:** Cross-reference the MILESTONES.md for all shipped features. The root README must include v4.0 features: detail panel with statistics/DDL tabs, CSS animations, fit-to-selection, selection breadcrumb
**Warning signs:** Feature list doesn't mention detail panel, statistics, DDL, animations

### Pitfall 3: Missing Prerequisites
**What goes wrong:** Someone following the quick start fails because they don't have Python, Node.js, or Teradata access
**Why it happens:** The author's machine already has everything installed
**How to avoid:** List exact prerequisites: Python 3.x, Node.js 18+, npm, Teradata database access, QVCI enabled
**Warning signs:** Quick start jumps directly to `pip install` without mentioning Python is needed

### Pitfall 4: Component README Doesn't Stand Alone
**What goes wrong:** Someone navigating directly to lineage-api/ directory gets a README that assumes they've read the root README
**Why it happens:** Author assumes linear reading order
**How to avoid:** Each component README should briefly state what the component is and link back to root for full project context

### Pitfall 5: Incorrect Test Counts
**What goes wrong:** README states test counts that don't match reality
**Why it happens:** Test counts change as features are added but docs aren't updated
**How to avoid:** Use conservative ranges like "500+" or verify actual counts. Current verified counts:
- Database: 73 tests (from CLAUDE.md, stable)
- Backend API: 20 tests (from tests/README.md)
- Frontend unit: 500+ (grep found 567 test/it calls across 36 files)
- Frontend E2E: 34 tests (grep confirmed in lineage.spec.ts)

## Code Examples

These are the verified code/content snippets that should appear in the READMEs.

### Root README - Quick Start (verified from CLAUDE.md)
```bash
# 1. Clone and setup Python environment
git clone <repo-url>
cd lineage
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# 2. Configure database connection
cp .env.example .env
# Edit .env with your Teradata credentials

# 3. Setup database
cd database
python scripts/setup/setup_lineage_schema.py --openlineage
python scripts/setup/setup_test_data.py

# 4. Populate lineage data
python scripts/populate/populate_lineage.py

# 5. Start backend (Python Flask)
cd ../lineage-api
python python_server.py  # Runs on :8080

# 6. Start frontend (new terminal)
cd lineage-ui
npm install && npm run dev  # Runs on :3000
```

### Root README - Feature List (from MILESTONES.md, all shipped)
```markdown
- **Asset Browser**: Navigate database hierarchies with pagination (25/50/100/200 items per page)
- **Lineage Graph**: Interactive column-level lineage visualization with upstream/downstream traversal
- **Detail Panel**: Inspect table metadata with tabbed Columns/Statistics/DDL views
- **Statistics**: View row counts, table size, owner, creation/modification dates
- **DDL Viewer**: View SQL and table definitions with syntax highlighting
- **Impact Analysis**: Understand downstream effects of schema changes
- **Search**: Find databases, tables, and columns across your environment
- **Graph Controls**: Adjustable depth/direction, fit-to-selection viewport, graph export
- **Smooth Animations**: CSS transitions for highlights, panel slides, and selection changes
- **Loading Progress**: Five-stage loading indicator with ETA for large graphs
- **Selection Breadcrumb**: Database > Table > Column hierarchy display
```

### lineage-api README - Architecture (from actual file structure)
```markdown
## Architecture (Hexagonal/Clean)

lineage-api/
├── cmd/server/main.go              # Application entry point
├── internal/
│   ├── domain/                     # Core business entities and repository interfaces
│   │   ├── entities.go             # Asset, LineageNode, Column types
│   │   ├── repository.go           # Repository interface definitions
│   │   └── mocks/                  # Mock implementations for testing
│   ├── application/                # Use cases and DTOs
│   │   ├── dto.go                  # Data transfer objects
│   │   ├── asset_service.go        # Asset browsing logic
│   │   ├── lineage_service.go      # Lineage traversal logic
│   │   ├── openlineage_service.go  # OpenLineage-aligned operations
│   │   └── search_service.go       # Search logic
│   ├── adapter/
│   │   ├── inbound/http/           # HTTP handlers (Chi router)
│   │   │   ├── router.go           # Route definitions
│   │   │   ├── handlers.go         # v1 API handlers
│   │   │   ├── openlineage_handlers.go  # v2 API handlers
│   │   │   ├── response.go         # Response helpers
│   │   │   └── validation.go       # Input validation
│   │   └── outbound/
│   │       ├── teradata/           # Teradata repository implementation
│   │       └── redis/              # Redis cache implementation
│   └── infrastructure/
│       ├── config/                 # Configuration (Viper)
│       └── logging/               # Structured logging (slog)
├── python_server.py                # Alternative Python Flask backend
├── Makefile                        # Build, test, lint commands
└── tests/                          # Integration tests
```

### lineage-api README - API Endpoints (from router.go)
```markdown
## API Endpoints

### v1 API (Legacy)
| Method | Path | Description |
|--------|------|-------------|
| GET | /health | Health check |
| GET | /api/v1/assets/databases | List databases |
| GET | /api/v1/assets/databases/{db}/tables | List tables |
| GET | /api/v1/assets/databases/{db}/tables/{table}/columns | List columns |
| GET | /api/v1/lineage/{assetId} | Get lineage (both directions) |
| GET | /api/v1/lineage/{assetId}/upstream | Get upstream lineage |
| GET | /api/v1/lineage/{assetId}/downstream | Get downstream lineage |
| GET | /api/v1/lineage/{assetId}/impact | Impact analysis |
| GET | /api/v1/search | Search assets |

### v2 API (OpenLineage-aligned)
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/v2/openlineage/namespaces | List namespaces |
| GET | /api/v2/openlineage/namespaces/{id} | Get namespace |
| GET | /api/v2/openlineage/namespaces/{id}/datasets | List datasets in namespace |
| GET | /api/v2/openlineage/datasets/search?q= | Search datasets |
| GET | /api/v2/openlineage/datasets/{id} | Get dataset with fields |
| GET | /api/v2/openlineage/datasets/{id}/statistics | Get table statistics |
| GET | /api/v2/openlineage/datasets/{id}/ddl | Get DDL/SQL definition |
| GET | /api/v2/openlineage/lineage/{datasetId}/{fieldName} | Get lineage graph |
```

### lineage-ui README - Component Structure (from actual file listing)
```markdown
## Component Structure

src/
├── api/
│   ├── client.ts                    # Axios HTTP client
│   └── hooks/                       # TanStack Query hooks
│       ├── useAssets.ts             # Asset browser data fetching
│       ├── useLineage.ts           # Lineage graph data fetching
│       ├── useOpenLineage.ts       # OpenLineage v2 API hooks
│       └── useSearch.ts            # Search data fetching
├── components/
│   ├── common/                      # Reusable UI components
│   │   ├── Button.tsx, Input.tsx    # Form controls
│   │   ├── LoadingSpinner.tsx       # Loading indicator
│   │   ├── LoadingProgress.tsx      # Multi-stage progress bar
│   │   ├── Pagination.tsx           # Page navigation controls
│   │   ├── Tooltip.tsx              # Tooltip component
│   │   └── ErrorBoundary.tsx        # Error boundary wrapper
│   ├── layout/                      # App shell components
│   │   ├── AppShell.tsx             # Main layout wrapper
│   │   ├── Header.tsx               # Top navigation bar
│   │   └── Sidebar.tsx              # Side navigation
│   └── domain/                      # Feature-specific components
│       ├── AssetBrowser/            # Database/table/column browser
│       ├── LineageGraph/            # Main graph visualization
│       │   ├── LineageGraph.tsx     # Core graph component
│       │   ├── TableNode/           # Table card nodes
│       │   ├── ColumnNode.tsx       # Column-level nodes
│       │   ├── LineageEdge.tsx      # Edge rendering
│       │   ├── Toolbar.tsx          # Graph controls (depth, direction, export)
│       │   ├── DetailPanel.tsx      # Slide-out metadata panel
│       │   ├── DetailPanel/         # Panel sub-components
│       │   │   ├── ColumnsTab.tsx   # Column list with click-to-navigate
│       │   │   ├── StatisticsTab.tsx # Table metadata display
│       │   │   ├── DDLTab.tsx       # SQL viewer with syntax highlighting
│       │   │   ├── TabBar.tsx       # Tab navigation
│       │   │   └── SelectionBreadcrumb.tsx # Selection hierarchy
│       │   ├── LineageTableView/    # Alternative tabular view
│       │   ├── hooks/               # Graph-specific hooks
│       │   │   ├── useLineageHighlight.ts  # Path highlighting
│       │   │   ├── useDatabaseClusters.ts  # Database grouping
│       │   │   ├── useGraphSearch.ts       # In-graph search
│       │   │   ├── useFitToSelection.ts    # Viewport fitting
│       │   │   ├── useSmartViewport.ts     # Smart zoom
│       │   │   └── useKeyboardShortcuts.ts # Keyboard navigation
│       │   ├── Legend.tsx           # Graph legend
│       │   ├── LargeGraphWarning.tsx # Performance warnings
│       │   └── LineageGraphSearch.tsx # Graph search bar
│       ├── ImpactAnalysis/          # Impact analysis views
│       └── Search/                  # Search bar and results
├── features/                        # Page-level components
│   ├── ExplorePage.tsx              # Asset browser page
│   ├── LineagePage.tsx              # Single-column lineage
│   ├── DatabaseLineagePage.tsx      # Database-scoped lineage
│   ├── AllDatabasesLineagePage.tsx  # Cross-database lineage
│   ├── ImpactPage.tsx              # Impact analysis page
│   └── SearchPage.tsx              # Search results page
├── stores/                          # State management (Zustand)
│   ├── useLineageStore.ts          # Graph state (selection, depth, direction)
│   └── useUIStore.ts               # UI state (sidebar, panels)
├── hooks/                           # Shared hooks
│   └── useLoadingProgress.ts       # Loading stage tracking
├── types/                           # TypeScript type definitions
│   └── openlineage.ts              # OpenLineage API types
└── utils/graph/                     # Graph utilities
    ├── layoutEngine.ts             # ELKjs layout integration
    └── openLineageAdapter.ts       # API response to React Flow adapter
```

## Codebase Audit Findings

### Current Root README Gaps (HIGH confidence -- directly observed)
| Gap | Current State | Required State |
|-----|--------------|----------------|
| WIP banner | Has "Work In Progress" warning | Should reflect shipped v4.0 status |
| Features list | 4 basic features | 11+ features including v4.0 additions |
| Quick start | Defers to CLAUDE.md | Must have inline quick start commands |
| Documentation links | Links to user guide and CLAUDE.md only | Must link to user guide, ops guide, dev manual |
| Architecture | Not shown | Should include high-level architecture diagram |
| Test summary | Not shown | Should list test suites and counts |

### Current lineage-api README (HIGH confidence -- confirmed non-existent)
- File does not exist at lineage-api/README.md
- Must be created from scratch
- Content sources: CLAUDE.md (architecture section), router.go (endpoints), Makefile (commands), go.mod (dependencies)

### Current lineage-ui README (HIGH confidence -- confirmed non-existent)
- File does not exist at lineage-ui/README.md
- Must be created from scratch
- Content sources: CLAUDE.md (frontend structure), package.json (scripts/deps), actual src/ tree

### Current database README (HIGH confidence -- directly read)
- File exists and is already comprehensive (190 lines)
- Covers: OL_* schema, population modes, QVCI requirements, directory structure, configuration, transformation mapping, SQL parsing
- Missing: Explicit test execution commands section with `cd database && python tests/run_tests.py`
- Missing: Test count (73 tests)
- The database README is 90% complete for README-08 and README-09 requirements
- README-10 (test commands) needs a clearer dedicated section

### Verified Test Counts (HIGH confidence -- directly counted)
| Suite | Count | Command | Location |
|-------|-------|---------|----------|
| Database (Python) | 73 | `python tests/run_tests.py` | database/tests/ |
| Backend API (Python) | 20 | `python tests/run_api_tests.py` | lineage-api/tests/ |
| Frontend Unit (Vitest) | 500+ | `npm test` | lineage-ui/src/ (36 test files) |
| Frontend E2E (Playwright) | 34 | `npx playwright test` | lineage-ui/e2e/ |

### Verified Technology Stack (HIGH confidence -- from package.json, go.mod)
| Technology | Version | Component |
|------------|---------|-----------|
| Go | 1.23.0 | Backend |
| Chi Router | v5.0.11 | Backend HTTP routing |
| Viper | v1.21.0 | Backend configuration |
| go-redis | v9.4.0 | Backend caching |
| sqlx | v1.3.5 | Backend SQL |
| React | ^18.2.0 | Frontend |
| TypeScript | ^5.3.0 | Frontend |
| Vite | ^5.0.0 | Frontend build |
| @xyflow/react | ^12.0.0 | Graph visualization |
| elkjs | ^0.9.0 | Graph layout |
| TanStack Query | ^5.17.0 | Data fetching |
| Zustand | ^4.4.0 | State management |
| Tailwind CSS | ^3.4.0 | Styling |
| Vitest | ^1.1.0 | Unit testing |
| Playwright | ^1.57.0 | E2E testing |
| prism-react-renderer | ^2.4.1 | Syntax highlighting (DDL tab) |
| lucide-react | ^0.300.0 | Icons |
| Python 3 + Flask | ^3.0.0 | Alternative backend |
| teradatasql | >=17.20.0 | Teradata driver |

### Verified API Endpoints (HIGH confidence -- from router.go)
- v1 API: 9 endpoints (health, 3 asset, 4 lineage, 1 search)
- v2 API: 8 endpoints (2 namespace, 3 dataset, 1 lineage, 1 statistics, 1 DDL)

### Documentation Files That Must Be Linked (HIGH confidence -- verified existence)
| Document | Path | Exists |
|----------|------|--------|
| User Guide | docs/user_guide.md | YES |
| Security Guide | docs/SECURITY.md | YES |
| Ops Guide | docs/operations_guide.md | NO (will be created in Phase 26) |
| Dev Manual | docs/developer_manual.md | NO (will be created in Phase 27) |
| Specifications | specs/ | YES (directory with 18 files) |

**Important:** The ops guide and dev manual don't exist yet (Phases 26-27). The root README should include placeholder links with "(coming soon)" notes, or structure the links section to be easily updated when those docs are created.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| README defers to CLAUDE.md | README has self-contained quick start | Best practice standard | Users don't need to know about CLAUDE.md |
| WIP badge on shipped software | Version badge or status indicator | After v4.0 ship | Professional appearance |
| Single root README only | Root + component READMEs | Monorepo pattern | Each component self-documenting |

## Open Questions

1. **Ops guide and dev manual links**
   - What we know: These documents will be created in Phases 26 and 27 respectively
   - What's unclear: Should the root README link to them now with "(coming soon)" or wait?
   - Recommendation: Include the links now with "(coming soon)" annotation. This makes Phase 26/27 simpler -- they just need to create the files at the expected paths. The links section should be structured for easy update.

2. **CLAUDE.md relationship to README**
   - What we know: CLAUDE.md contains extensive development instructions and is AI-facing
   - What's unclear: Should the README still link to CLAUDE.md or replace it with dev manual link?
   - Recommendation: Keep linking to CLAUDE.md as "AI Development Reference" since it serves a different purpose (AI agent instructions). The developer manual (Phase 27) will serve human developers.

3. **Mermaid diagram support**
   - What we know: GitHub renders Mermaid diagrams natively in Markdown
   - What's unclear: Whether the team prefers ASCII art or Mermaid
   - Recommendation: Use Mermaid for the architecture diagram in the root README. It's maintainable and renders well on GitHub.

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection: README.md, database/README.md, CLAUDE.md, package.json, go.mod, Makefile, router.go, all source directories
- `.planning/MILESTONES.md` - All shipped feature lists
- `.planning/milestones/v4.0-REQUIREMENTS.md` - v4.0 feature details
- `.planning/ROADMAP.md` - Phase descriptions and success criteria
- `.planning/REQUIREMENTS.md` - README-01 through README-10 requirements

### Secondary (MEDIUM confidence)
- [Make a README](https://www.makeareadme.com/) - README best practices
- [readme-best-practices (GitHub)](https://github.com/jehna/readme-best-practices) - Community patterns
- [awesome-monorepo](https://github.com/korfuri/awesome-monorepo/blob/master/README.md) - Monorepo README patterns

### Tertiary (LOW confidence)
- None -- this phase is documentation-focused and all findings come from direct codebase inspection

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No libraries needed, pure documentation
- Architecture: HIGH - README patterns well-established, codebase structure directly inspected
- Pitfalls: HIGH - Common documentation anti-patterns are well-known

**Research date:** 2026-02-07
**Valid until:** 2026-03-07 (stable -- documentation patterns don't change frequently)
