# Lineage UI

React 18 frontend for the Teradata column lineage application. Interactive graph visualization with detail panels, asset browsing, search, and impact analysis.

Part of [Teradata Column Lineage](../README.md)

## Component Structure

```
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
│       │   ├── Toolbar.tsx          # Graph controls (depth, direction, export, refresh)
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

## Getting Started

```bash
# Install dependencies
npm install

# Start dev server (with hot reload)
npm run dev  # Runs on :3000

# Production build
npm run build

# Preview production build
npm run preview
```

**Prerequisites:** Requires Node.js 18+ and npm. The frontend proxies `/api/*` requests to `http://localhost:8080` via Vite config, so the backend must be running. See [root README](../README.md) for full setup instructions.

## Available Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server on :3000 |
| `npm run build` | TypeScript check + Vite production build |
| `npm run preview` | Preview production build locally |
| `npm test` | Run Vitest unit tests |
| `npm run test:ui` | Run tests with Vitest UI |
| `npm run test:coverage` | Run tests with coverage report |
| `npx playwright test` | Run E2E tests |
| `npm run lint` | Run ESLint |
| `npm run bench` | Run benchmarks |

## Testing

### Unit Tests (Vitest)

500+ tests across 36 test files covering components, hooks, stores, API layer, and graph utilities.

```bash
# Run all unit tests
npm test

# Run with coverage report
npm run test:coverage

# Run in watch mode (default behavior of `npm test`)
npm test
```

### E2E Tests (Playwright)

34 tests in `e2e/lineage.spec.ts` covering navigation flows, graph interactions, search, and asset browsing.

```bash
# Run all E2E tests
npx playwright test

# Run with headed browser
npx playwright test --headed
```

## Key Technologies

| Technology | Version | Purpose |
|------------|---------|---------|
| React | 18.2 | UI framework |
| TypeScript | 5.3 | Type safety |
| Vite | 5.0 | Build tool |
| @xyflow/react | 12.0 | Graph visualization |
| ELKjs | 0.9 | Graph layout engine |
| TanStack Query | 5.17 | Server state management |
| Zustand | 4.4 | Client state management |
| Tailwind CSS | 3.4 | Utility-first CSS |
| prism-react-renderer | 2.4 | Syntax highlighting (DDL tab) |
| lucide-react | 0.300 | Icon library |
| Vitest | 1.1 | Unit test framework |
| Playwright | 1.57 | E2E test framework |

## State Management

**Client state** is managed with two Zustand stores:

- `useLineageStore`: Graph state -- selected node, traversal depth, direction, highlighted paths, and active column.
- `useUIStore`: UI state -- sidebar visibility, panel open/close, active tab, and view mode.

**Server state** is managed with TanStack Query, which handles API data fetching, caching, background refetching, and loading/error states through custom hooks in `src/api/hooks/`.

## Configuration

The Vite dev server proxies `/api/*` requests to `http://localhost:8080` during development. This is configured in `vite.config.ts` and means the backend must be running for the frontend to fetch data.

No additional frontend-specific environment variables are required.
