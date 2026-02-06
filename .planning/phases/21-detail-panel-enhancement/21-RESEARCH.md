# Phase 21: Detail Panel Enhancement - Research

**Researched:** 2026-02-06
**Domain:** React UI -- tabbed panel, data fetching, SQL syntax highlighting
**Confidence:** HIGH

## Summary

This phase transforms the existing `DetailPanel` component (a slide-out panel showing column/edge details) into a comprehensive metadata viewer with three tabs: Columns, Statistics, and DDL. The panel already exists at `lineage-ui/src/components/domain/LineageGraph/DetailPanel.tsx` and is integrated into the `LineageGraph` component. The current panel shows column metadata (type, nullable, primary key) and edge details (source, target, transformation). The enhancement adds tabbed navigation, two new data-fetching tabs backed by Phase 20's API endpoints, SQL syntax highlighting for DDL, and column-click-to-navigate functionality.

The research investigated four areas: (1) tabbed UI pattern with proper ARIA accessibility, (2) SQL syntax highlighting libraries for the DDL tab, (3) TanStack Query patterns for independent per-tab loading/error states, and (4) integration with the existing codebase (stores, API hooks, navigation). The codebase uses TanStack Query v5, Tailwind CSS v3.4, React 18, lucide-react for icons, and has established patterns for API hooks, Zustand stores, and common components (LoadingSpinner, ErrorBoundary, Tooltip).

The key finding is that this phase requires only one new dependency: `prism-react-renderer` (v2.4.1) for SQL syntax highlighting. The tabbed interface should be hand-built using native ARIA attributes (role="tablist", role="tab", role="tabpanel") following the W3C WAI-ARIA Tabs Pattern, since the project already uses Tailwind for all styling and has no component library. TanStack Query's `enabled` option provides the exact pattern needed for lazy-loading tab content only when the tab is active.

**Primary recommendation:** Extend the existing DetailPanel with a custom accessible tabs component, add two new TanStack Query hooks (`useDatasetStatistics` and `useDatasetDDL`) with `enabled` gated on active tab, and use `prism-react-renderer` with the SQL language for DDL display.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| prism-react-renderer | ^2.4.1 | SQL syntax highlighting in DDL tab | Lightweight (vendored Prism core), render-props API for full styling control with Tailwind, supports SQL via prismjs/components/prism-sql import, used by Docusaurus and many React projects |
| @tanstack/react-query | ^5.17.0 (already installed) | Data fetching for statistics and DDL tabs | Already used throughout codebase; `enabled` option provides exact pattern for lazy tab fetching |
| lucide-react | ^0.300.0 (already installed) | Tab icons, metadata display icons | Already used throughout codebase for all iconography |
| tailwindcss | ^3.4.0 (already installed) | All styling for tabs, panels, content areas | Already the sole styling approach; no component library in use |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| prismjs | (peer of prism-react-renderer) | SQL language grammar | Imported to register SQL language: `import 'prismjs/components/prism-sql'` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| prism-react-renderer | react-syntax-highlighter | react-syntax-highlighter (v16.1.0) is more full-featured but heavier; prism-react-renderer is lighter, render-props gives full Tailwind control, SQL support via same Prism grammars |
| prism-react-renderer | sql-highlight (v6.1.0) | sql-highlight is SQL-only (smallest), but outputs raw HTML strings requiring dangerouslySetInnerHTML; prism-react-renderer renders proper React elements |
| Hand-built ARIA tabs | @radix-ui/react-tabs or Ariakit | External tab libraries add a dependency; the ARIA pattern is well-documented and simple enough to implement correctly with 3 tabs; project has no headless UI library |

**Installation:**
```bash
cd lineage-ui && npm install prism-react-renderer
```

Note: `prismjs` is bundled within `prism-react-renderer` -- no separate install needed. The SQL language grammar is loaded via `import 'prismjs/components/prism-sql'` at the component level.

## Architecture Patterns

### Recommended Project Structure
```
src/
  components/
    domain/
      LineageGraph/
        DetailPanel.tsx              # REFACTOR: Add tabbed interface, delegate to sub-components
        DetailPanel.test.tsx         # UPDATE: Add tests for tabs, loading, error, navigation
        DetailPanel/                 # NEW: Folder for sub-components (optional, or keep flat)
          ColumnsTab.tsx             # NEW: Columns list with click-to-navigate
          StatisticsTab.tsx          # NEW: Statistics display with loading/error
          DDLTab.tsx                 # NEW: DDL/SQL viewer with syntax highlighting
          TabBar.tsx                 # NEW: Accessible tab bar component
  api/
    hooks/
      useOpenLineage.ts            # EXTEND: Add useDatasetStatistics, useDatasetDDL hooks
  types/
    openlineage.ts                 # EXTEND: Add DatasetStatisticsResponse, DatasetDDLResponse types
```

### Pattern 1: Accessible Tab Bar with ARIA Roles
**What:** A custom tab bar following the W3C WAI-ARIA Tabs Pattern with `role="tablist"`, `role="tab"`, and `role="tabpanel"` attributes, plus keyboard navigation (arrow keys).
**When to use:** For the three-tab interface (Columns, Statistics, DDL).
**Example:**
```typescript
// Source: W3C WAI-ARIA APG Tabs Pattern (https://www.w3.org/WAI/ARIA/apg/patterns/tabs/)
interface TabDefinition {
  id: string;
  label: string;
  icon?: React.ReactNode;
}

interface TabBarProps {
  tabs: TabDefinition[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
}

function TabBar({ tabs, activeTab, onTabChange }: TabBarProps) {
  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    let newIndex = index;
    if (e.key === 'ArrowRight') newIndex = (index + 1) % tabs.length;
    if (e.key === 'ArrowLeft') newIndex = (index - 1 + tabs.length) % tabs.length;
    if (newIndex !== index) {
      e.preventDefault();
      onTabChange(tabs[newIndex].id);
      // Focus the new tab button
      const tabEl = document.getElementById(`tab-${tabs[newIndex].id}`);
      tabEl?.focus();
    }
  };

  return (
    <div role="tablist" aria-label="Detail panel tabs" className="flex border-b border-slate-200">
      {tabs.map((tab, index) => (
        <button
          key={tab.id}
          id={`tab-${tab.id}`}
          role="tab"
          aria-selected={activeTab === tab.id}
          aria-controls={`tabpanel-${tab.id}`}
          tabIndex={activeTab === tab.id ? 0 : -1}
          onClick={() => onTabChange(tab.id)}
          onKeyDown={(e) => handleKeyDown(e, index)}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === tab.id
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
          }`}
        >
          <span className="flex items-center gap-1.5">
            {tab.icon}
            {tab.label}
          </span>
        </button>
      ))}
    </div>
  );
}

// Tab panel wrapper
function TabPanel({ id, activeTab, children }: { id: string; activeTab: string; children: React.ReactNode }) {
  return (
    <div
      id={`tabpanel-${id}`}
      role="tabpanel"
      aria-labelledby={`tab-${id}`}
      hidden={activeTab !== id}
      className="overflow-y-auto flex-1"
    >
      {activeTab === id && children}
    </div>
  );
}
```

### Pattern 2: Lazy Data Fetching per Tab with TanStack Query `enabled`
**What:** Use TanStack Query's `enabled` option to only fetch data when the corresponding tab is active. Each tab manages its own loading/error state independently.
**When to use:** For Statistics and DDL tabs that fetch from Phase 20 endpoints.
**Example:**
```typescript
// Source: TanStack Query v5 enabled option pattern
// (https://tanstack.com/query/v5/docs/framework/react/guides/disabling-queries)

// In useOpenLineage.ts -- new hooks
export function useDatasetStatistics(
  datasetId: string,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: [...openLineageKeys.all, 'statistics', datasetId],
    queryFn: () => openLineageApi.getDatasetStatistics(datasetId),
    enabled: !!datasetId && (options?.enabled ?? true),
    staleTime: 5 * 60 * 1000, // Statistics change infrequently
  });
}

export function useDatasetDDL(
  datasetId: string,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: [...openLineageKeys.all, 'ddl', datasetId],
    queryFn: () => openLineageApi.getDatasetDDL(datasetId),
    enabled: !!datasetId && (options?.enabled ?? true),
    staleTime: 30 * 60 * 1000, // DDL changes very rarely
  });
}

// In StatisticsTab.tsx -- usage
function StatisticsTab({ datasetId, isActive }: { datasetId: string; isActive: boolean }) {
  const { data, isLoading, error } = useDatasetStatistics(datasetId, {
    enabled: isActive,
  });

  if (isLoading) return <LoadingSpinner size="sm" />;
  if (error) return <ErrorState message="Failed to load statistics" />;
  if (!data) return null;

  return (/* render statistics */);
}
```

### Pattern 3: SQL Syntax Highlighting with prism-react-renderer
**What:** Use prism-react-renderer's `<Highlight>` component to display SQL with syntax highlighting. Register the SQL language from prismjs.
**When to use:** DDL tab for view definition SQL.
**Example:**
```typescript
// Source: prism-react-renderer GitHub docs
// (https://github.com/FormidableLabs/prism-react-renderer)
import { Highlight, themes, Prism } from 'prism-react-renderer';

// Register SQL language (must be done before rendering)
// prism-react-renderer vendored Prism doesn't include SQL by default
(typeof globalThis !== 'undefined' ? globalThis : window).Prism = Prism;
import('prismjs/components/prism-sql');

function SqlHighlighter({ sql }: { sql: string }) {
  return (
    <Highlight theme={themes.vsDark} code={sql.trim()} language="sql">
      {({ className, style, tokens, getLineProps, getTokenProps }) => (
        <pre
          className="p-3 rounded-lg text-sm font-mono overflow-auto max-h-96"
          style={style}
        >
          {tokens.map((line, i) => (
            <div key={i} {...getLineProps({ line })}>
              <span className="inline-block w-8 text-right mr-4 text-slate-500 select-none">
                {i + 1}
              </span>
              {line.map((token, key) => (
                <span key={key} {...getTokenProps({ token })} />
              ))}
            </div>
          ))}
        </pre>
      )}
    </Highlight>
  );
}
```

### Pattern 4: Column Click-to-Navigate
**What:** Clicking a column name in the Columns tab navigates to that column's lineage graph using React Router.
**When to use:** PANEL-05 requirement -- column list items are clickable and navigate to lineage.
**Example:**
```typescript
// Source: existing codebase pattern from LineagePage.tsx route
// Route: /lineage/:datasetId/:fieldName
// The datasetId format matches what's already in the URL
import { useNavigate } from 'react-router-dom';

function ColumnsTab({
  datasetId,
  columns,
}: {
  datasetId: string;
  columns: ColumnInfo[];
}) {
  const navigate = useNavigate();

  const handleColumnClick = (columnName: string) => {
    navigate(`/lineage/${encodeURIComponent(datasetId)}/${encodeURIComponent(columnName)}`);
  };

  return (
    <ul className="divide-y divide-slate-100">
      {columns.map((col) => (
        <li key={col.name}>
          <button
            onClick={() => handleColumnClick(col.name)}
            className="w-full text-left px-4 py-2 hover:bg-blue-50 transition-colors"
          >
            <span className="text-sm font-medium text-blue-600 hover:underline">
              {col.name}
            </span>
            <span className="text-xs text-slate-500 ml-2">{col.type}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
```

### Pattern 5: Independent Scroll per Tab Panel
**What:** Each tab panel has its own scrollable container so scrolling DDL doesn't affect the Columns tab position.
**When to use:** PANEL-08 requirement -- large SQL or many columns.
**Example:**
```typescript
// Each TabPanel renders as overflow-y-auto with flex-1 to fill remaining space
// The panel structure becomes:
// <DetailPanel> (fixed height, flex column)
//   <StickyHeader> (close button, entity name)
//   <TabBar> (sticky below header)
//   <TabPanel> (flex-1, overflow-y-auto -- each tab scrolls independently)
```

### Anti-Patterns to Avoid
- **Fetching all tab data on panel open:** Statistics and DDL should only fetch when their tab is active. Use TanStack Query `enabled` to defer. This prevents unnecessary API calls.
- **Single scroll container for all tabs:** Each tab panel must have its own scroll position. Do NOT wrap all tabs in one scrollable div.
- **Dangerously setting innerHTML for SQL:** Use prism-react-renderer's React component rendering, not raw HTML injection.
- **Building tabs without ARIA attributes:** The tab pattern requires `role="tablist"`, `role="tab"`, `role="tabpanel"`, `aria-selected`, `aria-controls`, `aria-labelledby`, and keyboard navigation. Without these, the component is inaccessible.
- **Coupling DetailPanel to LineageGraph state:** The DetailPanel should receive a `datasetId` prop from its parent (derived from the selected node's table context) rather than parsing it from global state internally.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SQL syntax highlighting | Custom regex-based token coloring | prism-react-renderer + prismjs SQL grammar | SQL has complex syntax (strings, comments, keywords, functions); Prism's grammar handles edge cases |
| SQL copy-to-clipboard | Custom clipboard API wrapper | `navigator.clipboard.writeText()` (already used in existing SqlViewer) | Browser API is simple and already proven in codebase |
| Loading spinner | Custom animation | `LoadingSpinner` from `components/common` | Already exists in codebase with proper ARIA attributes |
| Error state display | Custom error rendering | Pattern from `ErrorBoundary` component; inline error with retry | Consistent with existing error patterns |
| Number formatting (row count, bytes) | Manual string manipulation | `Intl.NumberFormat` (browser API) and utility function for bytes | Handles localization, edge cases (null values) |
| Tab keyboard navigation | Focus management from scratch | Standard `ArrowLeft`/`ArrowRight` + `tabIndex` roving pattern | W3C APG defines exactly how this works |

**Key insight:** The only genuinely new capability needed is SQL syntax highlighting. Everything else -- tabs, loading states, error states, navigation, scrolling -- is a composition of existing patterns and components in the codebase.

## Common Pitfalls

### Pitfall 1: DatasetId Mismatch Between Column Selection and API Calls
**What goes wrong:** The DetailPanel currently receives a `selectedColumn` object with a string `id` that looks like `namespace_id/database.table.column`. The statistics/DDL APIs expect a `datasetId` like `namespace_id/database.table` (without column). Passing the wrong format causes 404 errors.
**Why it happens:** Column IDs and dataset IDs have similar but different formats.
**How to avoid:** Extract the `datasetId` from the column's `databaseName` and `tableName` fields (which are already available in `ColumnDetail`), or derive it by stripping the column name from the column ID. The existing `storeNodes` have `databaseName` and `tableName` properties.
**Warning signs:** 404 errors when clicking Statistics or DDL tabs.

### Pitfall 2: Forgetting to Register SQL Language in prism-react-renderer
**What goes wrong:** The DDL tab shows unstyled plain text instead of syntax-highlighted SQL.
**Why it happens:** prism-react-renderer ships with a limited set of default languages that does NOT include SQL. The SQL grammar must be explicitly imported.
**How to avoid:** Import the SQL grammar at module load time:
```typescript
import { Prism } from 'prism-react-renderer';
(typeof globalThis !== 'undefined' ? globalThis : window).Prism = Prism;
await import('prismjs/components/prism-sql');
```
Or use synchronous require if bundler supports it. Verify highlighting works with a test containing SQL keywords (SELECT, FROM, WHERE).
**Warning signs:** SQL code renders as single-color text; no keyword highlighting visible.

### Pitfall 3: Tab State Reset When Panel Closes and Reopens
**What goes wrong:** User opens panel, switches to Statistics tab, closes panel, opens it for a different node. The panel remembers the Statistics tab but the data is for the old node.
**Why it happens:** Tab state persists across panel open/close cycles.
**How to avoid:** Reset the active tab to "Columns" (the default) whenever the panel opens with a new selected item. Use a `useEffect` that watches the `selectedColumn` or `datasetId` prop and resets to "columns" tab when it changes.
**Warning signs:** Stale data shown briefly before new data loads; or data from wrong table displayed.

### Pitfall 4: Existing Tests Break Due to DetailPanel API Change
**What goes wrong:** The 12 existing tests in `DetailPanel.test.tsx` fail because the component's props or rendered output changes.
**Why it happens:** The refactoring changes the internal structure (adding tabs) while the test selectors expect the old layout.
**How to avoid:** Update existing tests to account for the tabbed layout. The column details should now appear inside the "Columns" tab (which is the default active tab, so they should still be visible). Add new tests for tab switching, loading states, error states, and navigation.
**Warning signs:** Test failures after refactoring; tests that query for text that's now inside a hidden tab panel.

### Pitfall 5: Panel Not Knowing the DatasetId
**What goes wrong:** The DetailPanel currently receives `ColumnDetail` objects with per-column info, but needs a `datasetId` to call the statistics/DDL APIs.
**Why it happens:** The current `ColumnDetail` interface has `databaseName` and `tableName` but not the full `datasetId` (which includes the namespace prefix).
**How to avoid:** Either (a) add a `datasetId` prop to DetailPanel from the parent LineageGraph component (which has it as a prop), or (b) construct the datasetId in the panel from the node data. Option (a) is cleaner. The LineageGraph already has `datasetId` available and passes it to the panel.
**Warning signs:** Unable to make API calls from within the Statistics/DDL tabs.

### Pitfall 6: Views Have No Size; Tables Have No viewSql
**What goes wrong:** Statistics tab shows "0 bytes" for views, or DDL tab shows "No SQL" for tables.
**Why it happens:** The Phase 20 API returns `sizeBytes: null` for views and `viewSql: ""` for tables. The UI must handle these nulls gracefully.
**How to avoid:** Check `sourceType` field in the API response. For views: hide size row in statistics, show SQL in DDL tab. For tables: show size in statistics, show "Table definitions are not available as SQL" in DDL tab. Show column comments regardless.
**Warning signs:** Confusing UI showing "0" or empty sections instead of contextual messages.

## Code Examples

Verified patterns from official sources:

### API Client Methods (to add to client.ts)
```typescript
// Source: existing pattern in lineage-ui/src/api/client.ts
// Add to the openLineageApi object

async getDatasetStatistics(datasetId: string): Promise<DatasetStatisticsResponse> {
  const response = await apiClientV2.get<DatasetStatisticsResponse>(
    `/api/v2/openlineage/datasets/${encodeURIComponent(datasetId)}/statistics`
  );
  return response.data;
},

async getDatasetDDL(datasetId: string): Promise<DatasetDDLResponse> {
  const response = await apiClientV2.get<DatasetDDLResponse>(
    `/api/v2/openlineage/datasets/${encodeURIComponent(datasetId)}/ddl`
  );
  return response.data;
},
```

### TypeScript Interfaces (to add to types/openlineage.ts)
```typescript
// Source: matches Go DTO from lineage-api/internal/application/dto.go lines 161-184
export interface DatasetStatisticsResponse {
  datasetId: string;
  databaseName: string;
  tableName: string;
  sourceType: string;            // "TABLE" or "VIEW"
  creatorName?: string;
  createTimestamp?: string;       // ISO 8601 timestamp
  lastAlterTimestamp?: string;    // ISO 8601 timestamp
  rowCount?: number | null;       // null if stats not collected
  sizeBytes?: number | null;      // null for views
  tableComment?: string;
}

export interface DatasetDDLResponse {
  datasetId: string;
  databaseName: string;
  tableName: string;
  sourceType: string;            // "TABLE" or "VIEW"
  viewSql?: string;              // Only populated for views
  truncated: boolean;            // true if SQL was truncated at 12,500 chars
  tableComment?: string;
  columnComments?: Record<string, string>; // columnName -> comment
}
```

### TanStack Query Hooks (to add to useOpenLineage.ts)
```typescript
// Source: follows existing hook patterns in useOpenLineage.ts

export function useDatasetStatistics(
  datasetId: string,
  options?: { enabled?: boolean } & Omit<UseQueryOptions<DatasetStatisticsResponse, Error>, 'queryKey' | 'queryFn'>
) {
  const { enabled = true, ...queryOptions } = options ?? {};
  return useQuery({
    queryKey: [...openLineageKeys.all, 'statistics', datasetId],
    queryFn: () => openLineageApi.getDatasetStatistics(datasetId),
    enabled: !!datasetId && enabled,
    staleTime: 5 * 60 * 1000,
    ...queryOptions,
  });
}

export function useDatasetDDL(
  datasetId: string,
  options?: { enabled?: boolean } & Omit<UseQueryOptions<DatasetDDLResponse, Error>, 'queryKey' | 'queryFn'>
) {
  const { enabled = true, ...queryOptions } = options ?? {};
  return useQuery({
    queryKey: [...openLineageKeys.all, 'ddl', datasetId],
    queryFn: () => openLineageApi.getDatasetDDL(datasetId),
    enabled: !!datasetId && enabled,
    staleTime: 30 * 60 * 1000,
    ...queryOptions,
  });
}
```

### Byte Size Formatting Utility
```typescript
// Utility for displaying sizeBytes in a human-readable format
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${units[i]}`;
}

// Utility for displaying row counts
export function formatNumber(n: number | null | undefined): string {
  if (n == null) return 'N/A';
  return new Intl.NumberFormat().format(n);
}
```

### DetailPanel Refactored Structure
```typescript
// High-level structure showing how existing DetailPanel evolves
// Source: existing DetailPanel.tsx pattern extended with tabs

export const DetailPanel: React.FC<DetailPanelProps> = ({
  isOpen,
  onClose,
  selectedColumn,
  selectedEdge,
  datasetId,           // NEW: needed for statistics/DDL API calls
  onViewFullLineage,
  onViewImpactAnalysis,
}) => {
  const [activeTab, setActiveTab] = useState<'columns' | 'statistics' | 'ddl'>('columns');

  // Reset tab when selection changes
  useEffect(() => {
    setActiveTab('columns');
  }, [selectedColumn?.id, datasetId]);

  // When showing edge details, tabs are not relevant
  if (selectedEdge) {
    return (/* existing edge detail rendering, no tabs */);
  }

  return (
    <div /* existing panel wrapper with slide animation */ >
      <StickyHeader onClose={onClose} title={/* entity name */} />
      <TabBar
        tabs={[
          { id: 'columns', label: 'Columns', icon: <TableIcon /> },
          { id: 'statistics', label: 'Statistics', icon: <BarChart2 /> },
          { id: 'ddl', label: 'DDL', icon: <Code /> },
        ]}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />
      <TabPanel id="columns" activeTab={activeTab}>
        <ColumnsTab columns={columns} onColumnClick={handleColumnClick} />
      </TabPanel>
      <TabPanel id="statistics" activeTab={activeTab}>
        <StatisticsTab datasetId={datasetId} isActive={activeTab === 'statistics'} />
      </TabPanel>
      <TabPanel id="ddl" activeTab={activeTab}>
        <DDLTab datasetId={datasetId} isActive={activeTab === 'ddl'} />
      </TabPanel>
    </div>
  );
};
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| highlight.js for syntax highlighting | prism-react-renderer with vendored Prism | 2023+ | Smaller bundle, React-native rendering (no dangerouslySetInnerHTML), tree-shakeable |
| Separate fetch + state management for API data | TanStack Query with `enabled` for lazy fetching | TanStack Query v4+ | Automatic caching, deduplication, error/loading states; `enabled` is the standard lazy pattern |
| Custom tab state with useState | Same (useState) -- headless UI libs exist but are overkill for 3 tabs | Current | For 3 static tabs with simple content, custom ARIA tabs are idiomatic and avoid dependency bloat |

**Deprecated/outdated:**
- `react-syntax-highlighter` with full Prism or highlight.js bundle: Heavy; use `prism-react-renderer` or `PrismLight` build instead
- CSS-only scroll containers without `overflow-y-auto`: Modern approach uses `overflow-y-auto` with flex layout for natural scroll behavior

## Open Questions

1. **DatasetId availability in DetailPanel**
   - What we know: The `LineageGraph` component receives `datasetId` as a prop. The `DetailPanel` is rendered inside `LineageGraph`. Currently, `DetailPanel` does not receive `datasetId` -- it receives `ColumnDetail` which has `databaseName` and `tableName` separately.
   - What's unclear: Whether the panel should receive the full `datasetId` (with namespace prefix) as a new prop, or reconstruct it from the column detail fields. The full `datasetId` format is `namespace_id/database.table`.
   - Recommendation: Pass `datasetId` as a new prop from `LineageGraph` to `DetailPanel`. The parent already has it. This is cleaner than reconstruction and guarantees format consistency with API expectations. The column `databaseName` + `tableName` might not include the namespace prefix needed for the API call.

2. **Panel Behavior for Table-Level Selection**
   - What we know: The panel currently shows column details when a column is selected, and edge details when an edge is selected. The new tabs show table-level info (statistics, DDL). Should the panel also open when a table header is clicked (not just a column)?
   - What's unclear: Whether table header clicks should open the panel with Statistics/DDL tabs, or if this is only triggered by column selection.
   - Recommendation: Keep existing behavior (panel opens on column or edge click) but the Statistics and DDL tabs show table-level data regardless of which column triggered the panel. The column tab lists all columns for that table. This means any column click gives access to the full table metadata through tabs.

3. **Edge Details vs. Tabbed Panel**
   - What we know: The current panel shows edge details when an edge is selected (source, target, transformation type, confidence, SQL). The new tabbed layout is for column/node selection.
   - What's unclear: Should edge selection also show the tabbed layout, or keep the current flat display?
   - Recommendation: Keep edge details as a flat display (no tabs). The tabs (Columns, Statistics, DDL) are table-level metadata and don't apply to edges. This matches the current behavior and the requirements (PANEL-01 through PANEL-08 are all about table/column metadata).

4. **Prism SQL Language Registration Timing**
   - What we know: prism-react-renderer requires SQL language to be registered via a dynamic import of `prismjs/components/prism-sql`. This must happen before the `<Highlight>` component renders.
   - What's unclear: Whether the dynamic `import()` is synchronous in Vite's bundler or needs a loading state.
   - Recommendation: Use a synchronous `require()` or a top-level side-effect import. If using ESM `import()`, add a `useEffect` that loads the grammar and sets a `ready` state. Test during implementation. The simplest approach is to import at the top of the DDL tab module.

## Sources

### Primary (HIGH confidence)
- **Existing codebase** -- DetailPanel.tsx, LineageGraph.tsx, useOpenLineage.ts, client.ts, useLineageStore.ts, types/openlineage.ts, types/index.ts, common components (LoadingSpinner, ErrorBoundary, Tooltip) -- all architecture patterns, component interfaces, and data flow derived from actual code inspection
- **Phase 20 Research and Verification** (.planning/phases/20-backend-statistics-&-ddl-api/) -- Confirmed API response shapes: `DatasetStatisticsResponse` and `DatasetDDLResponse` from dto.go lines 161-184
- **prism-react-renderer GitHub** (https://github.com/FormidableLabs/prism-react-renderer) -- API, SQL language registration pattern, Highlight component usage
- **W3C WAI-ARIA Tabs Pattern** (https://www.w3.org/WAI/ARIA/apg/patterns/tabs/) -- Required ARIA roles, attributes, and keyboard interactions

### Secondary (MEDIUM confidence)
- **TanStack Query `enabled` option** (https://tanstack.com/query/v5/docs/framework/react/guides/disabling-queries) -- Lazy fetching pattern with `enabled` option, verified through multiple community examples
- **react-syntax-highlighter comparison** (npm-compare.com) -- Bundle size and feature comparison with prism-react-renderer, informing library choice

### Tertiary (LOW confidence)
- **prism-react-renderer v2.4.1 as latest version** -- Version from npm search results (published ~1 year ago); verify during `npm install`
- **SQL grammar auto-detection by Prism** -- Some sources suggest Prism auto-detects SQL; others require explicit import. Will need validation during implementation.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- Only one new dependency (prism-react-renderer), all others already in codebase; API endpoints verified complete in Phase 20
- Architecture: HIGH -- All patterns derived from existing codebase inspection (component structure, hook patterns, store usage, routing)
- Pitfalls: HIGH -- DatasetId format issues, SQL registration, and tab state reset are well-understood from code inspection; null handling for views vs tables documented in Phase 20 research
- Code examples: HIGH -- Based on actual codebase types (dto.go) and established patterns (useOpenLineage.ts, client.ts)

**Research date:** 2026-02-06
**Valid until:** 2026-03-06 (stable domain -- React component patterns, Prism)
