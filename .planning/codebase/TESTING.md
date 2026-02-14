# Testing Patterns

**Analysis Date:** 2026-02-13

## Test Framework

**Runner:**
- Frontend: Vitest v1.1.0
- Config: `lineage-ui/vitest.config.ts`
- Backend: Custom Python test runner (requests library)
- Database: Custom Python test runner (teradatasql library)

**Assertion Library:**
- Frontend: Vitest (built-in `expect`)
- Accessibility: vitest-axe (Vitest matchers for a11y)
- React Testing: @testing-library/react, @testing-library/jest-dom

**Run Commands:**
```bash
# Frontend - all tests
cd lineage-ui && npm test

# Frontend - watch mode
npm test -- --watch

# Frontend - coverage
npm test:coverage

# Frontend - UI mode
npm test:ui

# E2E tests
npx playwright test

# Backend - API tests
cd lineage-api && python tests/run_api_tests.py

# Database tests
cd database && python tests/run_tests.py

# Benchmarks
npm run bench              # Watch mode
npm run bench:run          # Run once
```

## Test File Organization

**Location:**
- Co-located pattern: test files in same directory as source
- Alternative: `src/__tests__/` for integration tests

**Examples:**
- `src/components/common/Button.test.tsx` (same directory as `Button.tsx`)
- `src/stores/useUIStore.test.ts` (same directory as `useUIStore.ts`)
- `src/__tests__/integration/correctness.test.ts` (separate integration test directory)
- `e2e/lineage.spec.ts` (E2E tests in dedicated `e2e/` folder)

**Naming:**
- Pattern: `{FileName}.test.{ts|tsx}`
- E2E: `{FeatureName}.spec.ts`

**Structure:**
```
lineage-ui/
├── src/
│   ├── components/
│   │   ├── common/
│   │   │   ├── Button.tsx
│   │   │   └── Button.test.tsx
│   │   ├── domain/
│   │   │   ├── LineageGraph/
│   │   │   │   ├── LineageGraph.tsx
│   │   │   │   ├── LineageGraph.test.tsx
│   │   │   │   └── hooks/
│   │   │   │       ├── useGraphSearch.ts
│   │   │   │       └── useGraphSearch.test.ts
│   ├── stores/
│   │   ├── useUIStore.ts
│   │   └── useUIStore.test.ts
│   ├── utils/
│   │   ├── graph/
│   │   │   ├── layoutEngine.ts
│   │   │   └── layoutEngine.test.ts
│   ├── __tests__/
│   │   └── integration/
│   │       └── correctness.test.ts
│   └── test/
│       ├── setup.ts
│       ├── test-utils.tsx
│       └── accessibility.test.tsx
├── e2e/
│   └── lineage.spec.ts
└── vitest.config.ts
```

## Test Structure

**Suite Organization:**
```typescript
describe('ComponentName', () => {
  // Setup
  beforeEach(() => {
    // Reset state, clear mocks, etc.
    useUIStore.setState({
      sidebarOpen: true,
      searchQuery: '',
    });
  });

  // Feature tests grouped in nested describe blocks
  describe('Feature or method name', () => {
    it('does something specific', () => {
      // Arrange
      // Act
      // Assert
    });
  });
});
```

**Patterns:**

1. **Zustand Store Tests** - Uses `.getState()` to access and test store:
```typescript
describe('useUIStore', () => {
  beforeEach(() => {
    useUIStore.setState({ sidebarOpen: true, searchQuery: '' });
  });

  describe('toggleSidebar', () => {
    it('toggles sidebarOpen from true to false', () => {
      expect(useUIStore.getState().sidebarOpen).toBe(true);
      useUIStore.getState().toggleSidebar();
      expect(useUIStore.getState().sidebarOpen).toBe(false);
    });
  });
});
```

2. **Component Tests** - Uses React Testing Library with custom render util:
```typescript
describe('Button', () => {
  it('renders with children text', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByText('Click me')).toBeInTheDocument();
  });

  it('handles click events', () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Click me</Button>);
    fireEvent.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});
```

3. **Utility Function Tests** - Direct function calls with assertions:
```typescript
describe('layoutGraph', () => {
  it('groups columns by table when laying out', async () => {
    const nodes: LineageNode[] = [
      { id: '1', type: 'column', databaseName: 'db', tableName: 't', columnName: 'a' },
      { id: '2', type: 'column', databaseName: 'db', tableName: 't', columnName: 'b' },
    ];
    const edges: LineageEdge[] = [{ id: 'e1', source: '1', target: '2' }];

    const result = await layoutGraph(nodes, edges);

    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].type).toBe('tableNode');
    expect(result.nodes[0].data.columns).toHaveLength(2);
  });
});
```

4. **Test Case IDs** - Reference test plan via comment prefix:
```typescript
// TC-UNIT-001: getNodeWidth Function
describe('getNodeWidth', () => { ... });

// TC-STATE-006: toggleSidebar
describe('toggleSidebar', () => { ... });
```

## Mocking

**Framework:**
- Vitest's `vi` object for mocking
- Mock Service Worker (MSW) for API mocking in E2E tests
- vi.fn() for function mocks

**Patterns:**

1. **Global Mocks** (setup.ts) - ResizeObserver, matchMedia:
```typescript
const ResizeObserverMock = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

globalThis.ResizeObserver = ResizeObserverMock;

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});
```

2. **Function Mocks** - Track calls and return values:
```typescript
const handleClick = vi.fn();
render(<Button onClick={handleClick}>Click me</Button>);
fireEvent.click(screen.getByRole('button'));
expect(handleClick).toHaveBeenCalledTimes(1);
```

3. **TanStack Query Mocks** - Custom test client with caching disabled:
```typescript
const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });
```

4. **E2E API Mocking** - MSW with hardcoded responses:
```typescript
const mockDatabases = {
  databases: [
    { id: 'demo_user', name: 'demo_user', ownerName: 'dbc', createTimestamp: '2024-01-01T00:00:00Z' }
  ]
};
```

**What to Mock:**
- External API calls (axios/fetch)
- Browser APIs (ResizeObserver, matchMedia)
- Database queries in E2E tests
- Time-dependent functions (if needed)

**What NOT to Mock:**
- React components under test
- TanStack Query hooks (use test client)
- Store functions (Zustand) - test directly via getState()
- Pure utility functions

## Fixtures and Factories

**Test Data:**

No dedicated fixture factories found in codebase. Data is created inline in tests:

```typescript
const nodes: LineageNode[] = [
  { id: '1', type: 'column', databaseName: 'db', tableName: 'table', columnName: 'col' },
  { id: '2', type: 'column', databaseName: 'db', tableName: 'table2', columnName: 'col2' },
];

const edges: LineageEdge[] = [
  { id: 'e1', source: '1', target: '2' },
];
```

**Location:**
- Inline in test files (no shared fixtures directory)
- E2E test data hardcoded in `e2e/lineage.spec.ts` as constants:
```typescript
const mockDatabases = { ... };
const mockTables = { ... };
const mockLineageGraph = { ... };
```

**Pattern:**
- Create test data objects directly in `beforeEach()` or at test start
- No factory pattern or builder pattern used
- Mock data for E2E defined as module-level constants

## Coverage

**Requirements:** Not enforced (no CI check or failure threshold)

**View Coverage:**
```bash
cd lineage-ui
npm run test:coverage
# Generates HTML report in coverage/index.html
```

**Coverage Config (vitest.config.ts):**
```typescript
coverage: {
  provider: 'v8',
  reporter: ['text', 'json', 'html'],
  exclude: ['node_modules/', 'src/test/'],
}
```

**Current Status:**
- 260+ unit tests in frontend (Vitest)
- 21 E2E tests (Playwright)
- 73 database tests (Python)
- 20 backend API tests (Python)
- Coverage metrics tracked but not enforced

## Test Types

**Unit Tests:**
- Scope: Individual functions, components, hooks
- Location: `src/**/*.test.ts|tsx` (co-located)
- Framework: Vitest + React Testing Library
- Examples: Button rendering, store mutations, utility functions
- Count: 260+
- Pattern: Describe → beforeEach → it() statements

**Integration Tests:**
- Scope: Multiple components interacting, full features
- Location: `src/__tests__/integration/`
- Framework: Vitest + React Testing Library
- Examples: Correctness tests for lineage calculations
- Count: 1+ (correctness.test.ts)
- Pattern: Full component render with mocked APIs

**E2E Tests:**
- Framework: Playwright v1.57.0
- Config: `lineage-ui/playwright.config.ts`
- Location: `e2e/lineage.spec.ts`
- Scope: Full user workflows (navigate, click, verify)
- Count: 21 tests
- Pattern: Page interactions with mock API responses

**Backend API Tests (Python):**
- Framework: Requests library (HTTP tests)
- Location: `lineage-api/tests/run_api_tests.py`
- Scope: API endpoint responses, status codes, data structure
- Count: 20 tests
- Pattern: HTTP GET requests, JSON response validation

**Database Tests (Python):**
- Framework: teradatasql (direct database queries)
- Location: `database/tests/run_tests.py`
- Scope: Schema validation, data correctness, lineage logic
- Count: 73 tests (29 skipped in ClearScape Analytics)
- Pattern: SQL queries, cursor.fetchall(), data assertions

## Common Patterns

**Async Testing:**
```typescript
it('handles diamond pattern graph across different tables', async () => {
  const nodes: LineageNode[] = [
    { id: 'A', type: 'column', databaseName: 'db', tableName: 't1', columnName: 'colA' },
    // ...
  ];

  const result = await layoutGraph(nodes, edges);

  expect(result.nodes).toHaveLength(4);
});
```

**Error Testing:**
```typescript
it('returns 404 when namespace not found', async () => {
  const response = await apiClientV2.get(
    `/api/v2/openlineage/namespaces/nonexistent`
  );
  expect(response.status).toBe(404);
});
```

**Store Testing (Zustand):**
```typescript
it('is independent from useLineageStore', async () => {
  const { useLineageStore } = await import('./useLineageStore');

  useUIStore.getState().setSidebarOpen(false);
  expect(useLineageStore.getState().selectedAssetId).toBeNull();

  useLineageStore.getState().setSelectedAssetId('test');
  expect(useUIStore.getState().sidebarOpen).toBe(false);
});
```

**Python Backend Test Pattern:**
```python
def test_health_endpoint(results):
    """TC-API-001: Health Check Endpoint"""
    try:
        response = requests.get(f"{BASE_URL}/health")
        passed = response.status_code == 200 and response.json().get("status") == "ok"
        results.add_result("TC-API-001: Health Check Endpoint", passed,
                          f"Status: {response.status_code}, Body: {response.text[:100]}")
    except Exception as e:
        results.add_result("TC-API-001: Health Check Endpoint", False, str(e))
```

**Python Database Test Pattern:**
```python
def test_schema_validation(cursor) -> None:
    """Section 1: Schema Validation Tests"""

    # TC-SCH-001: OL_NAMESPACE table structure
    cursor.execute(f"""
        SELECT ColumnName, ColumnType, Nullable
        FROM DBC.ColumnsV
        WHERE DatabaseName = '{DATABASE}' AND TableName = 'OL_NAMESPACE'
        ORDER BY ColumnId
    """)
    cols = cursor.fetchall()
    expected_cols = ["namespace_id", "namespace_uri", "description", "spec_version", "created_at"]
    found_cols = [c[0].strip().lower() for c in cols]
    if all(ec in found_cols for ec in expected_cols):
        log_result("TC-SCH-001", "Verify OL_NAMESPACE Table Structure", "passed")
```

---

*Testing analysis: 2026-02-13*
