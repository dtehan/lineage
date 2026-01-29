# Coding Conventions

**Analysis Date:** 2026-01-29

## Naming Patterns

**Files:**
- React components: PascalCase with .tsx extension (e.g., `LineageGraph.tsx`, `ColumnNode.tsx`)
- Hooks: camelCase starting with `use` (e.g., `useLineageStore.ts`, `useAssets.ts`)
- Utilities: camelCase (e.g., `layoutEngine.ts`, `client.ts`)
- Tests: Same name as source file with `.test.ts` or `.test.tsx` suffix (e.g., `Button.test.tsx` for `Button.tsx`)
- Go packages: lowercase, single word when possible (e.g., `http`, `application`, `domain`)
- Go files: lowercase with underscores separating logical parts (e.g., `handlers.go`, `lineage_service.go`)

**Functions:**
- TypeScript/React: camelCase (e.g., `useDatabases()`, `setGraph()`, `getNodeWidth()`)
- Go: PascalCase for exported, camelCase for unexported (e.g., `NewHandler()`, `ListDatabases()`, `respondJSON()`)
- React hook names always start with `use` (e.g., `useLineage`, `useAssets`)

**Variables:**
- camelCase for local variables and state (e.g., `selectedAssetId`, `isLoading`, `highlightedNodeIds`)
- UPPER_CASE for constants (e.g., `HEADER_HEIGHT = 40`, `COLUMN_ROW_HEIGHT = 28`)
- Zustand store state: camelCase with `set` prefix for setters (e.g., `setGraph`, `setSelectedAssetId`)
- React props: camelCase (e.g., `variant`, `size`, `isLoading`)

**Types:**
- TypeScript interfaces: PascalCase with `-Props` suffix for component props (e.g., `ButtonProps`, `ColumnNodeProps`)
- TypeScript types: PascalCase (e.g., `LineageScope`, `AssetTypeFilter`)
- Go types: PascalCase (e.g., `Database`, `LineageGraph`, `Handler`)
- Go interfaces: PascalCase ending in `-er` or `-y` (e.g., `Repository`, `Service`)

## Code Style

**Formatting:**
- TypeScript: 2-space indentation (configured in Vitest/Vite)
- Go: Uses standard `gofmt` formatting
- Template strings for classNames: Multi-line template literals with `${}` expressions (see `ColumnNode.tsx` lines 23-30)
- JSON: 2-space indentation in tsconfig.json and package.json

**Linting:**
- ESLint configured for src directory: `npm run lint` runs `eslint src --ext ts,tsx`
- TypeScript strict mode enabled in tsconfig.json:
  - `strict: true` enforces type safety
  - `noUnusedLocals: true` prevents unused variables
  - `noUnusedParameters: true` prevents unused parameters
  - `noFallthroughCasesInSwitch: true` catches switch fall-through bugs

**JSX/TSX Style:**
- Self-closing tags when no children (e.g., `<Button />` not `<Button></Button>`)
- Props spread with `{...props}` for extensibility (see `Button.tsx` line 38)
- Classname ternaries preferred over if statements (see `ColumnNode.tsx` lines 25-30)
- Component names in PascalCase, even for memoized components (e.g., `export const Button =`)

## Import Organization

**Order:**
1. External libraries/node modules (React, third-party packages)
2. Internal imports from project (relative paths with @-aliases if configured)
3. Type imports using `import type` keyword (TypeScript)

**Examples from codebase:**
```typescript
// Button.tsx line 1
import { ButtonHTMLAttributes, ReactNode } from 'react';

// useAssets.tsx lines 1-3
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../client';
import type { Database, Table, Column } from '../../types';

// useLineageStore.tsx lines 1-2
import { create } from 'zustand';
import type { LineageNode, LineageEdge, SearchResult, PaginationInfo } from '../types';

// Go handlers.go lines 1-8
package http
import (
  "net/http"
  "strconv"
  "github.com/go-chi/chi/v5"
  "github.com/lineage-api/internal/application"
)
```

**Path Aliases:**
- No path aliases configured; relative imports used throughout
- Imports use `../` for parent directory navigation

## Error Handling

**Patterns:**
- TypeScript async functions use `try/catch` implicitly through promise rejection
- React Query hooks handle errors via `.isError` and `.error` properties (see `useAssets.test.tsx`)
- Go follows error-as-value pattern: functions return `error` as last return value
- HTTP error responses use `respondError()` helper in `internal/adapter/inbound/http/response.go`
- Error responses return JSON with `error` key: `{"error": "message"}`

**Examples:**
```typescript
// TypeScript: Error handling through hook state
const { isError, error, data } = useDatabases();
if (isError) { /* handle error */ }

// Go: Error checking pattern
if err != nil {
  respondError(w, http.StatusInternalServerError, err.Error())
  return
}
```

## Logging

**Framework:** `console.log` in TypeScript (no structured logger configured)

**Patterns:**
- Minimal console logging in source code
- Test files use `console.log` implicitly through test output
- Go uses standard `log` package (see `main.go` lines 20-75):
  - `log.Fatalf()` for fatal errors
  - `log.Printf()` for info messages
  - `log.Println()` for shutdown messages

## Comments

**When to Comment:**
- Comments used sparingly; code should be self-documenting
- Comments explain WHY, not WHAT
- Test descriptions capture intent (see test names like `fetches and returns database list`)
- TODO/FIXME comments: Not found in codebase (no technical debt documentation via comments)

**JSDoc/TSDoc:**
- Minimal use; TypeScript types provide documentation
- Function signatures are clear from parameters and return types
- React component props documented via interface definitions

**Examples from codebase:**
```typescript
// From useLineageStore.ts: Comments explain state management purpose
interface LineageState {
  // View scope - determines what level of lineage to show
  scope: LineageScope;
  // Pagination state for database/all-databases views
  pagination: PaginationInfo | null;
  // Panel state
  isPanelOpen: boolean;
}
```

## Function Design

**Size:**
- Components: 20-50 lines typical (memoized for performance)
- Hooks: 10-30 lines typical
- Services: 10-40 lines typical

**Parameters:**
- React components: Single `props` object destructured (e.g., `function ColumnNode({ id, data })`)
- Hooks: Context objects or query parameters (e.g., `useQuery({ queryKey, queryFn })`)
- Go: Receiver pattern for methods (e.g., `func (s *LineageService) GetLineageGraph(ctx context.Context, req GetLineageRequest)`)
- Limit to 3-4 parameters; use objects for larger parameter sets

**Return Values:**
- TypeScript: Single value or tuple unpacking (e.g., `[data, error]` from hooks)
- React Query returns query state object with `.data`, `.isLoading`, `.isError`, `.error`
- Go returns value and error tuple (e.g., `(*LineageGraphResponse, error)`)
- Zustand store methods return void (state managed internally via `set()`)

## Module Design

**Exports:**
- Named exports preferred for functions and types (e.g., `export function useAssets()`)
- Default exports for React components (e.g., `export default function LineageGraph()`)
- Go: Exported identifiers start with uppercase letter by convention

**Barrel Files:**
- Used in component directories: `index.ts` re-exports main components
- Example: `lineage-ui/src/components/domain/LineageGraph/TableNode/index.ts` exports TableNode

**Example barrel file pattern:**
```typescript
// LineageGraph/TableNode/index.ts
export { TableNode } from './TableNode';
```

## Zustand Store Pattern

**Store Creation:**
- Single `create<StateType>((set) => ({ ... }))` call per store
- State properties and setter methods defined inline
- No external reducers or middleware

**Store Usage:**
- Accessed via custom hooks: `useLineageStore()`
- Destructure only needed properties to reduce re-renders
- Setters called inline: `setGraph(nodes, edges)`

**Example from `useLineageStore.ts`:**
```typescript
export const useLineageStore = create<LineageState>((set) => ({
  scope: 'column' as LineageScope,
  setScope: (scope) => set({ scope }),
  highlightedNodeIds: new Set(),
  setHighlightedNodeIds: (ids) => set({ highlightedNodeIds: ids }),
}));
```

## React Query Pattern

**Hook Pattern:**
- Returns query result object with `.isLoading`, `.isSuccess`, `.isError`, `.data`, `.error`
- `queryKey` arrays for caching: `['databases']`, `['tables', databaseName]`
- `queryFn` is async function that fetches data
- `enabled` conditional for dependent queries

**Example from `useAssets.ts`:**
```typescript
export function useDatabases() {
  return useQuery({
    queryKey: ['databases'],
    queryFn: async () => {
      const { data } = await apiClient.get<{ databases: Database[] }>('/assets/databases');
      return data.databases;
    },
  });
}
```

## TypeScript Strict Mode

**Requirements:**
- All function parameters must have explicit types
- Return types should be inferred or explicitly stated
- No implicit `any` types
- All variables assigned to must be typed
- React component props require Props interface

---

*Convention analysis: 2026-01-29*
