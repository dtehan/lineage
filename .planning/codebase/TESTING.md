# Testing Patterns

**Analysis Date:** 2026-01-29

## Test Framework

**Runner:**
- Vitest 1.1.0 (TypeScript/React unit tests)
- Config: `lineage-ui/vitest.config.ts`
- Playwright 1.57.0 (E2E tests)
- Go testing (standard `testing` package with testify)
- Python unittest/custom test runner for database tests

**Assertion Library:**
- TypeScript: Vitest built-in `expect()`, React Testing Library matchers
- Go: `github.com/stretchr/testify/assert` and `testify/require`
- vitest-axe for accessibility testing (a11y matchers)

**Run Commands:**
```bash
# Frontend unit tests
cd lineage-ui && npm test              # Run all tests with watch
cd lineage-ui && npm run test:ui       # UI dashboard for tests
cd lineage-ui && npm run test:coverage # Generate coverage reports

# Frontend E2E tests
cd lineage-ui && npx playwright test   # Run all Playwright tests

# Backend API tests (Python)
cd lineage-api && python run_api_tests.py  # If implemented

# Database tests
cd database && python run_tests.py     # Run 73 database schema/query tests
```

## Test File Organization

**Location:**
- Co-located: Test files sit next to source files in same directory
- Pattern: `ComponentName.test.tsx` next to `ComponentName.tsx`
- Hooks: `useAssets.test.tsx` next to `useAssets.ts`
- Utilities: `layoutEngine.test.ts` next to `layoutEngine.ts`
- Stores: `useLineageStore.test.ts` next to `useLineageStore.ts`

**Naming:**
- `*.test.ts` for TypeScript functions
- `*.test.tsx` for React components and hooks
- Filename matches source file exactly

**Structure:**
```
lineage-ui/
├── src/
│   ├── components/
│   │   ├── common/
│   │   │   ├── Button.tsx
│   │   │   └── Button.test.tsx
│   │   └── domain/
│   │       └── LineageGraph/
│   │           ├── ColumnNode.tsx
│   │           ├── ColumnNode.test.tsx
│   │           └── hooks/
│   │               ├── useLineageHighlight.ts
│   │               └── useLineageHighlight.test.ts
│   ├── api/hooks/
│   │   ├── useAssets.ts
│   │   └── useAssets.test.tsx
│   ├── stores/
│   │   ├── useLineageStore.ts
│   │   └── useLineageStore.test.ts
│   └── test/
│       ├── setup.ts           # Global test setup
│       └── test-utils.tsx     # Custom render with providers
├── e2e/
│   └── lineage.spec.ts        # Playwright E2E tests
└── vitest.config.ts
```

## Test Structure

**Suite Organization:**
```typescript
describe('FeatureName', () => {
  beforeEach(() => {
    // Reset mocks and state before each test
    vi.clearAllMocks();
  });

  it('describes expected behavior', () => {
    // Arrange: Set up test data
    const mockData = { /* ... */ };

    // Act: Execute code being tested
    const result = functionUnderTest(mockData);

    // Assert: Verify expected outcome
    expect(result).toBe(expectedValue);
  });
});
```

**From `Button.test.tsx` (lines 1-61):**
```typescript
describe('Button', () => {
  it('renders with children text', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByText('Click me')).toBeInTheDocument();
  });

  it('handles click events', () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Click me</Button>);
    fireEvent.click(screen.getByText('Click me'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('applies primary variant styles by default', () => {
    render(<Button>Primary</Button>);
    const button = screen.getByRole('button');
    expect(button.className).toContain('bg-blue-500');
  });
});
```

**Patterns:**
- Test ID naming: descriptive with test type prefix (e.g., `TC-INT-001`, `TC-UNIT-001`, `TC-API-001`)
- Setup helper functions: `createWrapper()` for providers, `setupTestHandler()` for dependency injection
- Arrange-Act-Assert structure: Clear separation of setup, execution, verification

**From `useAssets.test.tsx` (lines 16-28):**
```typescript
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,  // Disable caching in tests
      },
    },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
```

## Mocking

**Framework:**
- Vitest's `vi.mock()` for module mocking
- `vi.fn()` for creating mock functions
- Manual mocks via factory functions

**Patterns:**

**Module mocking (before imports):**
```typescript
// From useAssets.test.tsx lines 8-14
vi.mock('../client', () => ({
  apiClient: {
    get: vi.fn(),
  },
}));

const mockApiClient = apiClient as unknown as { get: ReturnType<typeof vi.fn> };
```

**React component mocking:**
```typescript
// From LineageGraph.test.tsx lines 15-38
vi.mock('@xyflow/react', () => ({
  ReactFlow: ({ children, nodes, edges }: Props) => (
    <div data-testid="react-flow" data-nodes={JSON.stringify(nodes)}>
      {children}
    </div>
  ),
  ReactFlowProvider: ({ children }: Props) => <>{children}</>,
  Background: () => <div data-testid="react-flow-background" />,
  // ... other mocked components
}));
```

**Mock function assertions:**
```typescript
// From Button.test.tsx
const handleClick = vi.fn();
render(<Button onClick={handleClick}>Click me</Button>);
fireEvent.click(screen.getByText('Click me'));
expect(handleClick).toHaveBeenCalledTimes(1);
```

**Go mocking (manual via repository interfaces):**
```typescript
// From handlers_test.go lines 28-39
func setupTestHandler() (*Handler, *mocks.MockAssetRepository, ...) {
  assetRepo := mocks.NewMockAssetRepository()
  lineageRepo := mocks.NewMockLineageRepository()
  searchRepo := mocks.NewMockSearchRepository()

  assetService := application.NewAssetService(assetRepo)
  lineageService := application.NewLineageService(lineageRepo)
  searchService := application.NewSearchService(searchRepo)

  handler := NewHandler(assetService, lineageService, searchService)
  return handler, assetRepo, lineageRepo, searchRepo
}
```

**What to Mock:**
- External API calls (apiClient)
- React Flow components (expensive to render)
- Router components (not under test)
- Heavy computation utilities (layoutGraph)

**What NOT to Mock:**
- React Testing Library utilities (use real DOM)
- State management (Zustand stores)
- Pure utility functions (unless performance critical)
- Type definitions

## Fixtures and Factories

**Test Data:**
```typescript
// From layoutEngine.test.ts: Inline data construction
const nodes: LineageNode[] = [
  { id: '1', type: 'column', databaseName: 'db', tableName: 't1', columnName: 'a' },
  { id: '2', type: 'column', databaseName: 'db', tableName: 't2', columnName: 'b' },
];
const edges: LineageEdge[] = [
  { id: 'e1', source: '1', target: '2' },
];

// From useAssets.test.tsx: Mock data in test
const mockDatabases = [
  { id: 'db-1', name: 'sales_db' },
  { id: 'db-2', name: 'analytics_db' },
];
mockApiClient.get.mockResolvedValueOnce({ data: { databases: mockDatabases } });
```

**Location:**
- Fixtures created inline in test files (not in separate fixtures directory)
- Database test data in `database/setup_test_data.py` and `database/insert_cte_test_data.py`
- Mock repositories defined in `lineage-api/internal/domain/mocks/`

## Coverage

**Requirements:**
- No coverage thresholds enforced (configured but not blocking)
- Coverage reporter: v8 with text, JSON, and HTML output

**View Coverage:**
```bash
cd lineage-ui && npm run test:coverage  # Generates HTML report in coverage/ directory
```

**Configuration in `vitest.config.ts`:**
```typescript
coverage: {
  provider: 'v8',
  reporter: ['text', 'json', 'html'],
  exclude: ['node_modules/', 'src/test/'],
}
```

## Test Types

**Unit Tests:**
- Scope: Individual functions and components in isolation
- Location: `*.test.ts` / `*.test.tsx` files
- Examples: `Button.test.tsx` (component rendering), `layoutEngine.test.ts` (utility functions)
- Approach: Mock external dependencies, test behavior with minimal setup

**From `layoutEngine.test.ts` (lines 16-44):**
```typescript
describe('getNodeWidth', () => {
  it('returns minimum width of 150 for short labels', () => {
    const node: LineageNode = {
      id: '1',
      type: 'column',
      databaseName: 'db',
      tableName: 't',
      columnName: 'col',
    };
    expect(getNodeWidth(node)).toBe(150);
  });

  it('returns calculated width for long labels', () => {
    const node: LineageNode = { /* ... */ };
    const label = getNodeLabel(node);
    const expectedWidth = Math.max(150, label.length * 8 + 40);
    expect(getNodeWidth(node)).toBe(expectedWidth);
  });
});
```

**Integration Tests:**
- Scope: Multiple components/modules working together
- Location: Component tests like `LineageGraph.test.tsx`, hook tests like `useAssets.test.tsx`
- Approach: Use real providers (QueryClient, Router), mock external APIs only

**From `useAssets.test.tsx` (lines 36-51):**
```typescript
describe('useDatabases', () => {
  it('fetches and returns database list', async () => {
    const mockDatabases = [
      { id: 'db-1', name: 'sales_db' },
      { id: 'db-2', name: 'analytics_db' },
    ];
    mockApiClient.get.mockResolvedValueOnce({ data: { databases: mockDatabases } });

    const { result } = renderHook(() => useDatabases(), { wrapper: createWrapper() });
    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockDatabases);
  });
});
```

**E2E Tests:**
- Framework: Playwright 1.57.0
- Location: `lineage-ui/e2e/lineage.spec.ts`
- Approach: Test user workflows end-to-end in real browser
- Scope: Multi-page interactions, form submissions, graph interactions

**API/Backend Tests:**
- Go: Unit tests with mock repositories in `*_test.go` files
- Python: Test runner in `database/run_tests.py` (73 tests for schema validation and query CTEs)
- Approach: Mock database connections, test service layer logic

**From `handlers_test.go` (lines 43-64):**
```typescript
func TestListDatabases_Success(t *testing.T) {
  handler, assetRepo, _, _ := setupTestHandler()
  assetRepo.Databases = []domain.Database{
    {ID: "db-001", Name: "database1"},
    {ID: "db-002", Name: "database2"},
  }

  req := httptest.NewRequest("GET", "/api/v1/assets/databases", nil)
  w := httptest.NewRecorder()
  handler.ListDatabases(w, req)

  assert.Equal(t, http.StatusOK, w.Code)
  var response application.DatabaseListResponse
  err := json.Unmarshal(w.Body.Bytes(), &response)
  require.NoError(t, err)
  assert.Len(t, response.Databases, 2)
}
```

## Common Patterns

**Async Testing:**
```typescript
// From useAssets.test.tsx: Using waitFor for async queries
const { result } = renderHook(() => useDatabases(), { wrapper: createWrapper() });
await waitFor(() => expect(result.current.isSuccess).toBe(true));

// From layoutEngine.test.ts: Testing async functions with await
const result = await layoutGraph(nodes, edges);
expect(result.nodes).toHaveLength(1);
```

**Error Testing:**
```typescript
// From useAssets.test.tsx (lines 55-63)
it('handles API errors correctly', async () => {
  mockApiClient.get.mockRejectedValueOnce(new Error('Network error'));
  const { result } = renderHook(() => useDatabases(), { wrapper: createWrapper() });

  await waitFor(() => expect(result.current.isError).toBe(true));
  expect(result.current.error).toBeDefined();
  expect(result.current.data).toBeUndefined();
});
```

**Conditional Query Testing:**
```typescript
// From useAssets.test.tsx (lines 69-74)
it('does not fetch when databaseName is empty', async () => {
  const { result } = renderHook(() => useTables(''), { wrapper: createWrapper() });
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  expect(mockApiClient.get).not.toHaveBeenCalled();
});
```

## Test Utilities

**Custom Render Function (test-utils.tsx):**
```typescript
// Wraps component with all required providers
function AllProviders({ children }: WrapperProps) {
  const queryClient = createTestQueryClient();
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>{children}</BrowserRouter>
    </QueryClientProvider>
  );
}

const customRender = (ui: React.ReactElement, options?: RenderOptions) =>
  render(ui, { wrapper: AllProviders, ...options });

export { customRender as render };
```

**Usage:**
```typescript
// Import custom render, not from react-testing-library
import { render, screen } from '../test/test-utils';

// Render includes QueryClient and Router automatically
render(<MyComponent />);
```

## Global Test Setup

**File:** `lineage-ui/src/test/setup.ts`

**Configures:**
- Testing Library jest-dom matchers (for `.toBeInTheDocument()`)
- vitest-axe matchers for accessibility testing
- ResizeObserver mock (required for React Flow)
- window.matchMedia mock (required for responsive testing)

**ResizeObserver Mock:**
```typescript
const ResizeObserverMock = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));
globalThis.ResizeObserver = ResizeObserverMock;
```

## Test Naming Convention

**Pattern:** `[Category-Number]: Description`

**Examples from codebase:**
- `TC-INT-001`: Integration test 1
- `TC-UNIT-001`: Unit test 1
- `TC-API-001`: API test 1
- `TC-SCH-001`: Schema test 1
- `TC-GRAPH-001`: Graph layout test 1

**Test descriptions:**
- Describe expected behavior in plain English
- Use `it()` with complete sentences (e.g., "fetches and returns database list")
- Match test ID to description for traceability

## Database Testing

**Test Runner:** `database/run_tests.py` (Python)

**Test Categories:**
1. Schema Validation (13 tests): Table structures, column definitions, indexes
2. Data Extraction (12 tests): Asset population, lineage extraction
3. Recursive CTE Tests (22 tests): Upstream/downstream lineage, cycles, depth limiting
4. Edge Cases (26 tests): Null handling, circular dependencies, fan-out/fan-in patterns

**Test Structure:**
```python
def test_schema_validation(cursor) -> None:
  """Section 1: Schema Validation Tests"""
  cursor.execute("SELECT ... FROM DBC.ColumnsV WHERE ...")
  cols = cursor.fetchall()
  if all(expected_col in found_cols for expected_col in expected_cols):
    log_result("TC-SCH-002", "Verify LIN_DATABASE Table Structure", "passed")
  else:
    log_result("TC-SCH-002", "Verify LIN_DATABASE Table Structure", "failed", details)
```

---

*Testing analysis: 2026-01-29*
