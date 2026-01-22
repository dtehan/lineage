# TypeScript/React Coding Standards

This document defines the coding standards for the Data Lineage Application React frontend. These standards ensure consistency, maintainability, and alignment with modern React and TypeScript best practices.

---

## Table of Contents

1. [Code Formatting](#code-formatting)
2. [Naming Conventions](#naming-conventions)
3. [React Component Patterns](#react-component-patterns)
4. [TypeScript Best Practices](#typescript-best-practices)
5. [State Management Patterns](#state-management-patterns)
6. [API and Data Fetching Patterns](#api-and-data-fetching-patterns)
7. [Testing Conventions](#testing-conventions)
8. [File Organization](#file-organization)

---

## Code Formatting

### Required Tools

All TypeScript/React code MUST be formatted and linted using:

```bash
# Format code with Prettier
npx prettier --write .

# Lint code with ESLint
npx eslint src --ext ts,tsx

# Type check
npx tsc --noEmit
```

### Prettier Configuration

Create `.prettierrc` in the project root:

```json
{
  "semi": true,
  "trailingComma": "es5",
  "singleQuote": true,
  "printWidth": 100,
  "tabWidth": 2,
  "useTabs": false,
  "jsxSingleQuote": false,
  "bracketSpacing": true,
  "bracketSameLine": false,
  "arrowParens": "always"
}
```

### ESLint Configuration

Create `.eslintrc.cjs`:

```javascript
module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    'prettier',
  ],
  ignorePatterns: ['dist', '.eslintrc.cjs'],
  parser: '@typescript-eslint/parser',
  plugins: ['react-refresh'],
  rules: {
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'react/prop-types': 'off',
  },
  settings: {
    react: {
      version: 'detect',
    },
  },
};
```

### Editor Configuration

Configure your editor to format on save. VS Code settings:

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "[typescript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "[typescriptreact]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  }
}
```

### Import Organization

Imports MUST be organized in this order, separated by blank lines:

```typescript
// React and React-related
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

// Third-party libraries
import { useQuery } from '@tanstack/react-query';
import { ReactFlow, Background, Controls } from '@xyflow/react';
import { ChevronRight, Database, Table } from 'lucide-react';

// Internal - API and hooks
import { useLineage, useImpactAnalysis } from '../api/hooks/useLineage';
import { apiClient } from '../api/client';

// Internal - Components
import { LineageGraph } from '../components/domain/LineageGraph/LineageGraph';
import { LoadingSpinner } from '../components/common/LoadingSpinner';

// Internal - Stores and state
import { useLineageStore } from '../stores/useLineageStore';

// Internal - Types
import type { LineageNode, LineageEdge, LineageGraph } from '../types';

// Internal - Utils
import { layoutGraph } from '../utils/graph/layoutEngine';

// Styles
import '@xyflow/react/dist/style.css';
```

---

## Naming Conventions

### Files and Directories

| Type | Convention | Example |
|------|------------|---------|
| React components | PascalCase | `LineageGraph.tsx`, `ColumnNode.tsx` |
| Hooks | camelCase with `use` prefix | `useLineage.ts`, `useAssets.ts` |
| Types | `index.ts` or descriptive | `types/index.ts` |
| Utils | camelCase | `layoutEngine.ts` |
| Stores | camelCase with `use` prefix | `useLineageStore.ts` |
| Test files | Same name with `.test.tsx` | `LineageGraph.test.tsx` |

### Directory Structure (from project spec)

```
src/
├── api/
│   ├── client.ts              # Axios instance
│   └── hooks/
│       ├── useAssets.ts       # Asset queries
│       ├── useLineage.ts      # Lineage queries
│       └── useSearch.ts       # Search queries
├── components/
│   ├── common/                # Shared UI components
│   │   ├── Button.tsx
│   │   ├── Input.tsx
│   │   └── LoadingSpinner.tsx
│   ├── layout/                # Layout components
│   │   ├── AppShell.tsx
│   │   ├── Sidebar.tsx
│   │   └── Header.tsx
│   └── domain/                # Domain-specific components
│       ├── AssetBrowser/
│       ├── LineageGraph/
│       ├── ImpactAnalysis/
│       └── Search/
├── features/                  # Page-level components
│   ├── ExplorePage.tsx
│   ├── LineagePage.tsx
│   └── ImpactPage.tsx
├── stores/                    # Zustand stores
│   ├── useLineageStore.ts
│   └── useUIStore.ts
├── types/                     # TypeScript types
│   └── index.ts
└── utils/                     # Utility functions
    └── graph/
        └── layoutEngine.ts
```

### Components

- Use PascalCase for component names
- Component name MUST match file name
- One component per file (with exceptions for small related components)

```typescript
// Good - LineageGraph.tsx
export function LineageGraph({ assetId }: LineageGraphProps) {
  // ...
}

// Good - Small related components can be in same file
// ColumnNode.tsx
export const ColumnNode = memo(function ColumnNode({ data, id }: NodeProps<ColumnNodeData>) {
  // ...
});
```

### Hooks

- Always prefix with `use`
- Use camelCase
- Name should describe what the hook does

```typescript
// Good
export function useLineage(assetId: string, options: LineageOptions = {}) { ... }
export function useDatabases() { ... }
export function useSearch(options: SearchOptions) { ... }

// Avoid
export function lineageHook() { ... }  // Missing 'use' prefix
export function UseLineage() { ... }   // Wrong case
```

### Types and Interfaces

- Use PascalCase for type names
- Prefer `interface` for object shapes that can be extended
- Use `type` for unions, intersections, and computed types
- Suffix props interfaces with `Props`
- Suffix data types with their purpose

```typescript
// Good - Interface for component props
interface LineageGraphProps {
  assetId: string;
}

interface ColumnNodeData {
  id: string;
  databaseName: string;
  tableName: string;
  columnName: string;
  label: string;
}

// Good - Types from project spec
export interface Database {
  id: string;
  name: string;
  ownerName?: string;
  createTimestamp?: string;
  commentString?: string;
}

export interface LineageNode {
  id: string;
  type: 'database' | 'table' | 'column';
  databaseName: string;
  tableName?: string;
  columnName?: string;
  metadata?: Record<string, unknown>;
}

// Good - Type for unions
type AssetType = 'database' | 'table' | 'column';
type Direction = 'upstream' | 'downstream' | 'both';

// Good - Type for API response
export interface ImpactAnalysisResponse {
  assetId: string;
  impactedAssets: ImpactedAsset[];
  summary: ImpactSummary;
}
```

### Variables and Functions

- Use camelCase for variables and functions
- Use UPPER_SNAKE_CASE for constants
- Use descriptive names

```typescript
// Good - Variables
const selectedAssetId = useLineageStore((state) => state.selectedAssetId);
const maxDepth = 5;
const isLoading = true;

// Good - Constants
const DEFAULT_MAX_DEPTH = 5;
const CACHE_TTL_MS = 5 * 60 * 1000;
const API_BASE_URL = 'http://localhost:8080/api/v1';

// Good - Functions
function getNodeLabel(node: LineageNode): string { ... }
function handleSearch(e: React.FormEvent) { ... }
const toggleSidebar = () => set((state) => ({ sidebarOpen: !state.sidebarOpen }));
```

### Event Handlers

- Prefix with `handle` for handler functions
- Prefix with `on` for props that accept handlers

```typescript
// Good - Component definition
interface SearchBarProps {
  onSearch: (query: string) => void;
  onClear: () => void;
}

// Good - Event handler implementation
function SearchBar({ onSearch, onClear }: SearchBarProps) {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch(query);
  };

  const handleClear = () => {
    setQuery('');
    onClear();
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* ... */}
    </form>
  );
}
```

---

## React Component Patterns

### Functional Components Only

Always use functional components. Class components are NOT allowed.

```typescript
// Good
export function LineageGraph({ assetId }: LineageGraphProps) {
  const [nodes, setNodes] = useState<Node[]>([]);
  // ...
}

// Also good - arrow function with memo
export const ColumnNode = memo(function ColumnNode({ data }: NodeProps<ColumnNodeData>) {
  // ...
});

// Never use class components
// class LineageGraph extends React.Component { ... }  // WRONG
```

### Component Structure

Follow this order within components:

```typescript
export function LineageGraph({ assetId }: LineageGraphProps) {
  // 1. Hooks - stores, router, etc.
  const { direction, maxDepth, setGraph } = useLineageStore();
  const navigate = useNavigate();

  // 2. Data fetching hooks
  const { data, isLoading, error } = useLineage(assetId, { direction, maxDepth });

  // 3. Local state
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // 4. Derived values / memoization
  const nodeTypes = useMemo(() => ({
    columnNode: ColumnNode,
    tableNode: TableNode,
  }), []);

  // 5. Effects
  useEffect(() => {
    if (data?.graph) {
      layoutGraph(data.graph.nodes, data.graph.edges).then(({ nodes, edges }) => {
        setNodes(nodes);
        setEdges(edges);
      });
    }
  }, [data, setNodes, setEdges]);

  // 6. Event handlers
  const handleNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    navigate(`/lineage/${node.id}`);
  }, [navigate]);

  // 7. Early returns for loading/error states
  if (isLoading) {
    return <LoadingSpinner size="lg" />;
  }

  if (error) {
    return <div className="text-red-500">Failed to load lineage</div>;
  }

  // 8. Main render
  return (
    <div className="w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}
```

### Hooks Usage

#### useState

```typescript
// Good - Simple state
const [query, setQuery] = useState('');
const [isOpen, setIsOpen] = useState(false);

// Good - Complex state with type
const [nodes, setNodes] = useState<LineageNode[]>([]);

// Good - Lazy initialization for expensive computations
const [graph, setGraph] = useState(() => computeInitialGraph());
```

#### useEffect

```typescript
// Good - With cleanup
useEffect(() => {
  const subscription = eventSource.subscribe(handleEvent);
  return () => subscription.unsubscribe();
}, [handleEvent]);

// Good - Dependency array reflects actual dependencies
useEffect(() => {
  if (data?.graph) {
    layoutGraph(data.graph.nodes, data.graph.edges).then(setLayoutedGraph);
  }
}, [data]);

// Avoid - Empty dependency array when dependencies exist
// useEffect(() => {
//   doSomethingWith(prop);  // Bug: prop is not in deps
// }, []);
```

#### useCallback

```typescript
// Good - Memoize callbacks passed to children or used in deps
const handleNodeMouseEnter = useCallback(
  (_: React.MouseEvent, node: Node) => {
    const connectedIds = new Set<string>([node.id]);
    edges.forEach((edge) => {
      if (edge.source === node.id) connectedIds.add(edge.target);
      if (edge.target === node.id) connectedIds.add(edge.source);
    });
    setHighlightedNodeIds(connectedIds);
  },
  [edges, setHighlightedNodeIds]
);

// Avoid - Unnecessary memoization for simple handlers not passed as props
// const handleClick = useCallback(() => {
//   console.log('clicked');
// }, []);
```

#### useMemo

```typescript
// Good - Expensive computations
const sortedResults = useMemo(
  () => results.sort((a, b) => b.score - a.score),
  [results]
);

// Good - Object references for React Flow
const nodeTypes = useMemo(() => ({
  columnNode: ColumnNode,
  tableNode: TableNode,
}), []);

// Avoid - Trivial computations
// const doubled = useMemo(() => count * 2, [count]);
```

#### memo

Use `memo` for components that receive the same props frequently:

```typescript
// Good - Node components in React Flow are rendered frequently
export const ColumnNode = memo(function ColumnNode({ data, id }: NodeProps<ColumnNodeData>) {
  const { selectedAssetId, highlightedNodeIds } = useLineageStore();
  const isSelected = selectedAssetId === id;
  const isHighlighted = highlightedNodeIds.has(id);

  return (
    <div className={`...`}>
      {/* ... */}
    </div>
  );
});
```

### Conditional Rendering

```typescript
// Good - Early return for loading/error states
if (isLoading) {
  return <LoadingSpinner />;
}

if (error) {
  return <ErrorMessage error={error} />;
}

// Good - Inline conditional for optional content
return (
  <div>
    {title && <h1>{title}</h1>}
    {items.length > 0 ? (
      <ItemList items={items} />
    ) : (
      <EmptyState message="No items found" />
    )}
  </div>
);

// Good - Logical AND for simple conditionals
return (
  <div>
    {isExpanded && <ExpandedContent />}
  </div>
);
```

### Props Patterns

```typescript
// Good - Destructure props
function AssetBrowser({ onSelect, initialDatabase }: AssetBrowserProps) {
  // ...
}

// Good - Default values
function LineageControls({ maxDepth = 5, direction = 'both' }: LineageControlsProps) {
  // ...
}

// Good - Spread remaining props for wrapper components
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary';
}

function Button({ variant = 'primary', className, ...props }: ButtonProps) {
  return (
    <button
      className={`${baseStyles} ${variantStyles[variant]} ${className}`}
      {...props}
    />
  );
}
```

---

## TypeScript Best Practices

### Strict Mode

Enable strict mode in `tsconfig.json`:

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true
  }
}
```

### Type Definitions

Define all types in `src/types/index.ts` (from project spec):

```typescript
// src/types/index.ts

export interface Database {
  id: string;
  name: string;
  ownerName?: string;
  createTimestamp?: string;
  commentString?: string;
}

export interface Table {
  id: string;
  databaseName: string;
  tableName: string;
  tableKind: string;
  createTimestamp?: string;
  commentString?: string;
  rowCount?: number;
}

export interface Column {
  id: string;
  databaseName: string;
  tableName: string;
  columnName: string;
  columnType: string;
  columnLength?: number;
  nullable: boolean;
  commentString?: string;
  columnPosition: number;
}

export interface LineageNode {
  id: string;
  type: 'database' | 'table' | 'column';
  databaseName: string;
  tableName?: string;
  columnName?: string;
  metadata?: Record<string, unknown>;
}

export interface LineageEdge {
  id: string;
  source: string;
  target: string;
  transformationType?: string;
  confidenceScore?: number;
}

export interface LineageGraph {
  nodes: LineageNode[];
  edges: LineageEdge[];
}
```

### Type Inference

Let TypeScript infer types when obvious:

```typescript
// Good - Inference works well
const [isOpen, setIsOpen] = useState(false);
const count = items.length;
const doubled = count * 2;

// Good - Explicit type needed for empty arrays
const [nodes, setNodes] = useState<LineageNode[]>([]);

// Good - Explicit type for function parameters
function getNodeLabel(node: LineageNode): string {
  if (node.type === 'column') {
    return `${node.tableName}.${node.columnName}`;
  }
  return node.databaseName;
}
```

### Avoid `any`

Never use `any`. Use `unknown` or proper types:

```typescript
// Bad
function processData(data: any) { ... }

// Good - Use unknown and narrow
function processData(data: unknown) {
  if (isLineageGraph(data)) {
    // data is now LineageGraph
  }
}

// Good - Use specific type
function processData(data: LineageGraph) { ... }

// Good - Use generic
function processData<T extends LineageNode>(data: T): T { ... }
```

### Type Guards

Create type guards for runtime type checking:

```typescript
function isLineageNode(value: unknown): value is LineageNode {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'type' in value &&
    typeof (value as LineageNode).id === 'string'
  );
}

function isColumnNode(node: LineageNode): node is LineageNode & { tableName: string; columnName: string } {
  return node.type === 'column' && !!node.tableName && !!node.columnName;
}
```

### Discriminated Unions

Use discriminated unions for variant types:

```typescript
type AssetNode =
  | { type: 'database'; databaseName: string }
  | { type: 'table'; databaseName: string; tableName: string }
  | { type: 'column'; databaseName: string; tableName: string; columnName: string };

function getDisplayName(node: AssetNode): string {
  switch (node.type) {
    case 'database':
      return node.databaseName;
    case 'table':
      return `${node.databaseName}.${node.tableName}`;
    case 'column':
      return `${node.tableName}.${node.columnName}`;
  }
}
```

---

## State Management Patterns

### Zustand Conventions

Follow the project's Zustand patterns (from specification):

```typescript
// src/stores/useLineageStore.ts
import { create } from 'zustand';
import type { LineageNode, LineageEdge } from '../types';

interface LineageState {
  // State
  selectedAssetId: string | null;
  nodes: LineageNode[];
  edges: LineageEdge[];
  maxDepth: number;
  direction: 'upstream' | 'downstream' | 'both';
  highlightedNodeIds: Set<string>;
  expandedTables: Set<string>;

  // Actions
  setSelectedAssetId: (id: string | null) => void;
  setGraph: (nodes: LineageNode[], edges: LineageEdge[]) => void;
  setMaxDepth: (depth: number) => void;
  setDirection: (direction: 'upstream' | 'downstream' | 'both') => void;
  setHighlightedNodeIds: (ids: Set<string>) => void;
  toggleTableExpanded: (tableId: string) => void;
}

export const useLineageStore = create<LineageState>((set) => ({
  // Initial state
  selectedAssetId: null,
  nodes: [],
  edges: [],
  maxDepth: 5,
  direction: 'both',
  highlightedNodeIds: new Set(),
  expandedTables: new Set(),

  // Actions
  setSelectedAssetId: (id) => set({ selectedAssetId: id }),
  setGraph: (nodes, edges) => set({ nodes, edges }),
  setMaxDepth: (depth) => set({ maxDepth: depth }),
  setDirection: (direction) => set({ direction }),
  setHighlightedNodeIds: (ids) => set({ highlightedNodeIds: ids }),
  toggleTableExpanded: (tableId) =>
    set((state) => {
      const newExpanded = new Set(state.expandedTables);
      if (newExpanded.has(tableId)) {
        newExpanded.delete(tableId);
      } else {
        newExpanded.add(tableId);
      }
      return { expandedTables: newExpanded };
    }),
}));
```

### Store Usage in Components

```typescript
// Good - Select only needed state (prevents unnecessary re-renders)
const selectedAssetId = useLineageStore((state) => state.selectedAssetId);
const setSelectedAssetId = useLineageStore((state) => state.setSelectedAssetId);

// Good - Select multiple related values
const { direction, maxDepth, setDirection, setMaxDepth } = useLineageStore();

// Avoid - Selecting entire store when only using part
// const store = useLineageStore();  // Re-renders on any state change
```

### Store Organization

Separate stores by domain:

```typescript
// src/stores/useLineageStore.ts - Lineage-specific state
// src/stores/useUIStore.ts - UI state (sidebar, search, etc.)

// UI Store example
interface UIState {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: true,
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  searchQuery: '',
  setSearchQuery: (query) => set({ searchQuery: query }),
}));
```

---

## API and Data Fetching Patterns

### TanStack Query Conventions

Follow the project's TanStack Query patterns (from specification):

#### Query Client Configuration

```typescript
// src/App.tsx
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      refetchOnWindowFocus: false,
    },
  },
});
```

#### Custom Hooks

```typescript
// src/api/hooks/useAssets.ts
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../client';
import type { Database, Table, Column } from '../../types';

export function useDatabases() {
  return useQuery({
    queryKey: ['databases'],
    queryFn: async () => {
      const { data } = await apiClient.get<{ databases: Database[] }>('/assets/databases');
      return data.databases;
    },
  });
}

export function useTables(databaseName: string) {
  return useQuery({
    queryKey: ['tables', databaseName],
    queryFn: async () => {
      const { data } = await apiClient.get<{ tables: Table[] }>(
        `/assets/databases/${encodeURIComponent(databaseName)}/tables`
      );
      return data.tables;
    },
    enabled: !!databaseName,  // Only fetch when databaseName is provided
  });
}

export function useColumns(databaseName: string, tableName: string) {
  return useQuery({
    queryKey: ['columns', databaseName, tableName],
    queryFn: async () => {
      const { data } = await apiClient.get<{ columns: Column[] }>(
        `/assets/databases/${encodeURIComponent(databaseName)}/tables/${encodeURIComponent(tableName)}/columns`
      );
      return data.columns;
    },
    enabled: !!databaseName && !!tableName,
  });
}
```

#### Query Keys

Use hierarchical query keys for proper cache invalidation:

```typescript
// Good - Hierarchical keys
queryKey: ['databases']
queryKey: ['tables', databaseName]
queryKey: ['columns', databaseName, tableName]
queryKey: ['lineage', assetId, direction, maxDepth]
queryKey: ['impact', assetId, maxDepth]
queryKey: ['search', query, assetTypes, limit]

// Invalidate all tables for a database
queryClient.invalidateQueries({ queryKey: ['tables', databaseName] });

// Invalidate all lineage queries
queryClient.invalidateQueries({ queryKey: ['lineage'] });
```

#### Lineage Queries

```typescript
// src/api/hooks/useLineage.ts
interface LineageOptions {
  direction?: 'upstream' | 'downstream' | 'both';
  maxDepth?: number;
}

export function useLineage(assetId: string, options: LineageOptions = {}) {
  const { direction = 'both', maxDepth = 5 } = options;

  return useQuery({
    queryKey: ['lineage', assetId, direction, maxDepth],
    queryFn: async () => {
      const params = new URLSearchParams({
        direction,
        maxDepth: String(maxDepth),
      });
      const { data } = await apiClient.get<{ assetId: string; graph: LineageGraph }>(
        `/lineage/${encodeURIComponent(assetId)}?${params}`
      );
      return data;
    },
    enabled: !!assetId,
  });
}

export function useImpactAnalysis(assetId: string, maxDepth = 10) {
  return useQuery({
    queryKey: ['impact', assetId, maxDepth],
    queryFn: async () => {
      const { data } = await apiClient.get<ImpactAnalysisResponse>(
        `/lineage/${encodeURIComponent(assetId)}/impact?maxDepth=${maxDepth}`
      );
      return data;
    },
    enabled: !!assetId,
  });
}
```

### API Client Configuration

```typescript
// src/api/client.ts
import axios from 'axios';

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8080/api/v1',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    // Log errors or show toast notifications
    console.error('API Error:', error.response?.data || error.message);
    return Promise.reject(error);
  }
);
```

---

## Testing Conventions

### Test Framework

Use Vitest with React Testing Library (from project spec):

```json
// package.json
{
  "devDependencies": {
    "vitest": "^1.1.0",
    "@testing-library/react": "^14.0.0",
    "@testing-library/jest-dom": "^6.0.0",
    "@testing-library/user-event": "^14.0.0"
  }
}
```

### Test File Structure

```typescript
// LineageGraph.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LineageGraph } from './LineageGraph';

// Setup
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
  },
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>
    {children}
  </QueryClientProvider>
);

describe('LineageGraph', () => {
  it('renders loading state initially', () => {
    render(<LineageGraph assetId="test-asset" />, { wrapper });
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders graph when data loads', async () => {
    render(<LineageGraph assetId="test-asset" />, { wrapper });

    await waitFor(() => {
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    expect(screen.getByTestId('react-flow')).toBeInTheDocument();
  });

  it('handles node click', async () => {
    const user = userEvent.setup();
    render(<LineageGraph assetId="test-asset" />, { wrapper });

    await waitFor(() => {
      expect(screen.getByTestId('node-1')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('node-1'));
    // Assert navigation or state change
  });
});
```

### Testing Hooks

```typescript
// useLineage.test.ts
import { describe, it, expect } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useLineage } from './useLineage';

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
};

describe('useLineage', () => {
  it('returns loading state initially', () => {
    const { result } = renderHook(
      () => useLineage('test-asset'),
      { wrapper: createWrapper() }
    );

    expect(result.current.isLoading).toBe(true);
  });

  it('returns data on success', async () => {
    const { result } = renderHook(
      () => useLineage('test-asset'),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.graph.nodes).toHaveLength(3);
  });
});
```

### Mocking

```typescript
// Mock API responses
vi.mock('../api/client', () => ({
  apiClient: {
    get: vi.fn().mockResolvedValue({
      data: {
        assetId: 'test-asset',
        graph: {
          nodes: [{ id: '1', type: 'column' }],
          edges: [],
        },
      },
    }),
  },
}));

// Mock Zustand store
vi.mock('../stores/useLineageStore', () => ({
  useLineageStore: vi.fn((selector) =>
    selector({
      selectedAssetId: 'test-asset',
      direction: 'both',
      maxDepth: 5,
      setSelectedAssetId: vi.fn(),
    })
  ),
}));
```

---

## File Organization

### Component File Structure

For complex components, use a directory structure:

```
LineageGraph/
├── LineageGraph.tsx       # Main component
├── LineageGraph.test.tsx  # Tests
├── ColumnNode.tsx         # Sub-component
├── TableNode.tsx          # Sub-component
├── LineageEdge.tsx        # Sub-component
└── index.ts               # Re-exports
```

Index file for clean imports:

```typescript
// LineageGraph/index.ts
export { LineageGraph } from './LineageGraph';
export { ColumnNode } from './ColumnNode';
export { TableNode } from './TableNode';
```

### Import Aliases

Configure path aliases in `tsconfig.json`:

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"],
      "@components/*": ["./src/components/*"],
      "@hooks/*": ["./src/api/hooks/*"],
      "@stores/*": ["./src/stores/*"],
      "@types/*": ["./src/types/*"]
    }
  }
}
```

Usage:

```typescript
import { LineageGraph } from '@components/domain/LineageGraph';
import { useLineage } from '@hooks/useLineage';
import { useLineageStore } from '@stores/useLineageStore';
import type { LineageNode } from '@types';
```

---

## Quick Reference

| Category | Convention |
|----------|------------|
| Component files | PascalCase.tsx |
| Hook files | useCamelCase.ts |
| Components | PascalCase function names |
| Hooks | useCamelCase function names |
| Types/Interfaces | PascalCase |
| Props interfaces | ComponentNameProps |
| Event handlers | handleEventName |
| Event props | onEventName |
| Constants | UPPER_SNAKE_CASE |
| Variables | camelCase |
| Boolean variables | is/has/should prefix |
| Query keys | Hierarchical arrays |
| Store selectors | Select specific state |
| Test files | ComponentName.test.tsx |
