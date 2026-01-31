# Phase 10: Asset Browser Integration - Research

**Researched:** 2026-01-31
**Domain:** React pagination integration, state management, UI component composition
**Confidence:** HIGH

## Summary

This phase integrates the enhanced Pagination component (built in Phase 9) into the existing Asset Browser views for databases, tables, and columns. The research examined the current AssetBrowser implementation, existing data-fetching hooks, pagination state patterns with TanStack Query, and Zustand store patterns already in the codebase.

The codebase has two Asset Browser implementations:
1. **OpenLineage-based** (current `AssetBrowser.tsx`) - Uses `useOpenLineageNamespaces`, `useOpenLineageDatasets`, `useOpenLineageDataset` hooks
2. **v1 API-based** (test mocks reference `useAssets.ts`) - Uses `useDatabases`, `useTables`, `useColumns` hooks with `keepPreviousData`

The test file already contains pagination test cases (TC-COMP-PAGE) that mock the v1 API hooks with pagination metadata. The current AssetBrowser.tsx fetches with a hardcoded `limit: 1000`, which needs to be replaced with proper pagination state management.

**Primary recommendation:** Add pagination state (offset/limit) to each level of the AssetBrowser hierarchy using local useState, connect to existing hooks, and render the Pagination component from Phase 9 below each list section.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | ^18.2.0 | UI framework | Already in project |
| @tanstack/react-query | ^5.x | Server state management | Already in project, hooks use `keepPreviousData` |
| zustand | ^5.x | Client state management | Already in project for UI/lineage state |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Pagination component | Phase 9 | Pagination UI controls | All list views |
| lucide-react | ^0.300.0 | Icons | Already used in Pagination |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Local useState | Zustand store | Local state is simpler; store only needed if state must persist across navigation |
| Two API implementations | Unify on one | Keep both for now; OpenLineage is primary |

**Installation:**
No new packages needed - all dependencies already installed.

## Architecture Patterns

### Recommended Project Structure
```
src/
├── components/
│   ├── common/
│   │   └── Pagination.tsx       # Already exists from Phase 9
│   └── domain/
│       └── AssetBrowser/
│           ├── AssetBrowser.tsx     # Main component - ADD PAGINATION HERE
│           ├── AssetBrowser.test.tsx # Already has pagination test cases
│           ├── DatabaseList.tsx     # Optional: extract if file grows >300 lines
│           ├── TableList.tsx        # Optional: extract if needed
│           └── ColumnList.tsx       # Optional: extract if needed
├── api/hooks/
│   ├── useAssets.ts             # v1 hooks - already support pagination
│   └── useOpenLineage.ts        # v2 hooks - already support pagination params
└── stores/
    └── useAssetBrowserStore.ts  # NEW: Only if state persistence required
```

### Pattern 1: Local Pagination State per List Level
**What:** Each expandable section (database list, table list within database, column list within table) manages its own pagination offset via useState
**When to use:** Default pattern - simple, works with existing hooks
**Example:**
```typescript
// Source: Codebase pattern from useAssets.ts + Phase 9 Pagination
function DatabaseList() {
  const [offset, setOffset] = useState(0);
  const limit = 100; // Fixed per CONTEXT.md decision

  const { data, isLoading, isFetching } = useDatabases({ limit, offset });
  const databases = data?.data || [];
  const pagination = data?.pagination;

  const handlePageChange = (newOffset: number) => {
    setOffset(newOffset);
  };

  return (
    <div>
      {/* List rendering */}
      <ul>
        {databases.map(db => <DatabaseItem key={db.id} ... />)}
      </ul>

      {/* Pagination - always visible per CONTEXT.md decision */}
      <Pagination
        totalCount={pagination?.total_count || databases.length}
        limit={limit}
        offset={offset}
        onPageChange={handlePageChange}
        isLoading={isFetching}
        className="mt-4 justify-center"
      />
    </div>
  );
}
```

### Pattern 2: Reset Pagination on Parent Change
**What:** When user switches to different parent (e.g., different database), child pagination resets to page 1
**When to use:** Required by ASSET-05 and ASSET-07
**Example:**
```typescript
// Source: React best practice + requirements
function TableList({ databaseName }: { databaseName: string }) {
  const [offset, setOffset] = useState(0);

  // Reset to page 1 when database changes
  useEffect(() => {
    setOffset(0);
  }, [databaseName]);

  const { data } = useTables(databaseName, { limit: 100, offset });
  // ... rest of component
}
```

### Pattern 3: TanStack Query Pagination with keepPreviousData
**What:** Use `placeholderData: keepPreviousData` to prevent UI flicker during page transitions
**When to use:** Already implemented in useAssets.ts hooks
**Example:**
```typescript
// Source: https://tanstack.com/query/latest/docs/framework/react/guides/paginated-queries
// Already in codebase: lineage-ui/src/api/hooks/useAssets.ts
import { useQuery, keepPreviousData } from '@tanstack/react-query';

export function useDatabases(options: PaginationOptions = {}) {
  const { limit = 100, offset = 0 } = options;

  return useQuery({
    queryKey: ['databases', { limit, offset }],
    queryFn: async () => { /* fetch */ },
    placeholderData: keepPreviousData, // Shows previous data while fetching
  });
}
```

### Pattern 4: Conditional Pagination Visibility
**What:** Per CONTEXT.md, pagination is ALWAYS visible, even with 1 page
**When to use:** All three views
**Example:**
```typescript
// Source: CONTEXT.md decisions
// Always render Pagination - no conditional hiding
<Pagination
  totalCount={pagination?.total_count || 0}
  limit={limit}
  offset={offset}
  onPageChange={handlePageChange}
  // No visibility condition - always shown
/>
```

### Anti-Patterns to Avoid
- **Hiding pagination when single page:** CONTEXT.md explicitly requires always visible
- **Shared pagination state across levels:** Each database/table/column list needs independent pagination
- **Mutating offset in parent:** Child components should own their pagination state
- **Forgetting to reset on parent change:** ASSET-05 and ASSET-07 require reset behavior

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Pagination UI | Custom buttons/controls | `Pagination` from Phase 9 | Already built, tested, accessible |
| Page calculations | `Math.floor(offset/limit)` everywhere | Pagination component handles internally | Component encapsulates math |
| Data fetching with pagination | Custom fetch with useState | `useDatabases/useTables/useColumns` hooks | Already implement TanStack Query patterns |
| Loading state during page change | Custom loading logic | `isFetching` from TanStack Query + `isLoading` prop | Built into hooks |
| State persistence | localStorage manually | Zustand persist middleware | Only if needed, already available |

**Key insight:** The hooks and Pagination component from Phase 9 handle all the complexity. This phase is primarily about wiring them together correctly.

## Common Pitfalls

### Pitfall 1: Not Resetting Pagination on Context Change
**What goes wrong:** User is on page 3 of tables in database A, switches to database B, sees page 3 of B (or empty if fewer tables)
**Why it happens:** Pagination state persists across parent context changes
**How to avoid:** useEffect to reset offset to 0 when parent ID changes:
```typescript
useEffect(() => { setOffset(0); }, [databaseId]);
```
**Warning signs:** Tests fail for ASSET-05 and ASSET-07; users report confusing pagination

### Pitfall 2: Using OpenLineage Hooks Without Pagination Support
**What goes wrong:** Current AssetBrowser.tsx uses `useOpenLineageDatasets(namespaceId, { limit: 1000 })` - hardcoded large limit
**Why it happens:** OpenLineage hooks exist but AssetBrowser doesn't expose pagination controls
**How to avoid:** Either:
1. Add pagination state to current OpenLineage-based implementation, OR
2. Switch to v1 hooks (useDatabases/useTables/useColumns) which test file already mocks
**Warning signs:** Tests mock v1 hooks but component uses OpenLineage hooks

### Pitfall 3: Pagination Hidden in Empty State
**What goes wrong:** When no results, pagination disappears
**Why it happens:** Conditional rendering based on data presence
**How to avoid:** Per CONTEXT.md, always show pagination. When totalCount=0, Pagination shows "Showing 0 items" and disabled buttons
**Warning signs:** Pagination flickers on/off during loading

### Pitfall 4: isFetching vs isLoading Confusion
**What goes wrong:** Loading indicator shown on initial load only, not during page changes
**Why it happens:** `isLoading` is true only on first load; `isFetching` is true during any fetch
**How to avoid:** Pass `isFetching` to Pagination's `isLoading` prop for all fetch operations:
```typescript
const { data, isLoading, isFetching } = useDatabases({ limit, offset });
// Use isFetching for Pagination's isLoading prop
<Pagination isLoading={isFetching} ... />
```
**Warning signs:** Users can click pagination during fetch, causing race conditions

### Pitfall 5: Missing Pagination Metadata Handling
**What goes wrong:** Pagination shows NaN or incorrect counts
**Why it happens:** API response might not include pagination metadata (legacy responses, errors)
**How to avoid:** Defensive coding with fallbacks:
```typescript
const pagination = data?.pagination;
const totalCount = pagination?.total_count ?? data?.data?.length ?? 0;
```
**Warning signs:** Tests show "Showing NaN" or "Page NaN of NaN"

## Code Examples

Verified patterns from codebase and official sources:

### Database List with Pagination
```typescript
// Source: Pattern derived from AssetBrowser.tsx + useAssets.ts + Pagination.tsx
import { useState, useEffect } from 'react';
import { useDatabases } from '../../../api/hooks/useAssets';
import { Pagination } from '../../common/Pagination';

interface DatabaseListProps {
  onSelectDatabase: (dbName: string) => void;
}

export function DatabaseList({ onSelectDatabase }: DatabaseListProps) {
  const [offset, setOffset] = useState(0);
  const limit = 100;

  const { data, isFetching } = useDatabases({ limit, offset });
  const databases = data?.data || [];
  const pagination = data?.pagination;

  return (
    <div className="flex flex-col h-full">
      {/* Database list */}
      <ul className="flex-1 overflow-auto space-y-1">
        {databases.map((db) => (
          <DatabaseItem key={db.id} database={db} onClick={onSelectDatabase} />
        ))}
      </ul>

      {/* Pagination - always visible, centered below list */}
      <div className="mt-4 flex justify-center">
        <Pagination
          totalCount={pagination?.total_count || databases.length}
          limit={limit}
          offset={offset}
          onPageChange={setOffset}
          isLoading={isFetching}
          showFirstLast={true}
          showPageInfo={true}
        />
      </div>
    </div>
  );
}
```

### Table List with Reset on Database Change
```typescript
// Source: Pattern for ASSET-05 requirement
import { useState, useEffect } from 'react';
import { useTables } from '../../../api/hooks/useAssets';
import { Pagination } from '../../common/Pagination';

interface TableListProps {
  databaseName: string;
}

export function TableList({ databaseName }: TableListProps) {
  const [offset, setOffset] = useState(0);
  const limit = 100;

  // Reset pagination when database changes (ASSET-05)
  useEffect(() => {
    setOffset(0);
  }, [databaseName]);

  const { data, isFetching } = useTables(databaseName, { limit, offset });
  const tables = data?.data || [];
  const pagination = data?.pagination;

  return (
    <div>
      <ul className="space-y-1">
        {tables.map((table) => (
          <TableItem key={table.id} table={table} />
        ))}
      </ul>

      <div className="mt-4 flex justify-center">
        <Pagination
          totalCount={pagination?.total_count || tables.length}
          limit={limit}
          offset={offset}
          onPageChange={setOffset}
          isLoading={isFetching}
        />
      </div>
    </div>
  );
}
```

### OpenLineage Datasets with Pagination (Alternative)
```typescript
// Source: Current AssetBrowser.tsx pattern + pagination addition
import { useState } from 'react';
import { useOpenLineageDatasets } from '../../../api/hooks/useOpenLineage';
import { Pagination } from '../../common/Pagination';

interface DatasetListProps {
  namespaceId: string;
}

export function DatasetList({ namespaceId }: DatasetListProps) {
  const [offset, setOffset] = useState(0);
  const limit = 100;

  const { data, isFetching } = useOpenLineageDatasets(
    namespaceId,
    { limit, offset }
  );
  const datasets = data?.datasets || [];
  const pagination = data?.pagination;

  return (
    <div>
      <ul>
        {datasets.map((dataset) => (
          <DatasetItem key={dataset.id} dataset={dataset} />
        ))}
      </ul>

      <div className="mt-4 flex justify-center">
        <Pagination
          totalCount={pagination?.total_count || datasets.length}
          limit={limit}
          offset={offset}
          onPageChange={setOffset}
          isLoading={isFetching}
        />
      </div>
    </div>
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `keepPreviousData: true` | `placeholderData: keepPreviousData` | TanStack Query v5 | Hook syntax change; codebase already uses v5 pattern |
| Hardcoded large limit | Paginated fetching | This phase | Enables large dataset navigation |

**Deprecated/outdated:**
- `keepPreviousData: true` option (v4) - replaced by `placeholderData: keepPreviousData` function (v5) - codebase already uses v5

## Open Questions

Things that couldn't be fully resolved:

1. **Which API implementation to use?**
   - What we know: Tests mock v1 hooks (useAssets.ts), but current AssetBrowser.tsx uses OpenLineage hooks
   - What's unclear: Should we align tests with component, or component with tests?
   - Recommendation: Keep OpenLineage implementation in component; update test mocks if needed. OpenLineage is the active v2 API.

2. **Page size selector: include or not?**
   - What we know: Pagination component supports optional `onPageSizeChange` prop
   - What's unclear: CONTEXT.md doesn't mention page size selector for Asset Browser
   - Recommendation: Omit page size selector initially (simpler); can add later if requested

3. **State persistence when navigating away**
   - What we know: ASSET-02 requires "Pagination state persists when navigating away and returning"
   - What's unclear: How far does "navigating away" extend? Just expanding/collapsing, or leaving the page entirely?
   - Recommendation: Use local useState for expand/collapse persistence; consider Zustand only if cross-page persistence needed

## Sources

### Primary (HIGH confidence)
- Codebase: `lineage-ui/src/components/domain/AssetBrowser/AssetBrowser.tsx` - current implementation
- Codebase: `lineage-ui/src/components/domain/AssetBrowser/AssetBrowser.test.tsx` - existing pagination tests
- Codebase: `lineage-ui/src/api/hooks/useAssets.ts` - pagination-ready hooks
- Codebase: `lineage-ui/src/api/hooks/useOpenLineage.ts` - OpenLineage hooks with pagination params
- Codebase: `lineage-ui/src/components/common/Pagination.tsx` - Phase 9 component
- Phase 9 research: `.planning/phases/09-pagination-component/09-RESEARCH.md`

### Secondary (MEDIUM confidence)
- [TanStack Query Paginated Queries](https://tanstack.com/query/latest/docs/framework/react/guides/paginated-queries) - keepPreviousData pattern
- [Zustand Persist Middleware](https://zustand.docs.pmnd.rs/integrations/persisting-store-data) - if state persistence needed

### Tertiary (LOW confidence)
- None - all findings verified with primary or secondary sources

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries already in use, verified in codebase
- Architecture: HIGH - patterns extracted directly from existing codebase
- Pitfalls: HIGH - derived from requirements and existing test expectations
- Code examples: HIGH - based on existing component patterns

**Research date:** 2026-01-31
**Valid until:** 2026-03-01 (30 days - stable domain, patterns already established)
