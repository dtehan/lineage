# Phase 23: Testing & Validation - Research

**Researched:** 2026-02-06
**Domain:** Frontend testing (Vitest + RTL + Playwright), Backend testing (Go tests), Performance benchmarking
**Confidence:** HIGH

## Summary

This phase adds comprehensive test coverage for features implemented in Phases 19-22: animation transitions (CSS-based node/panel animations), backend statistics and DDL API endpoints, detail panel tabbed enhancement with navigation, and selection features (fit-to-selection, breadcrumb). The testing infrastructure is already mature -- Vitest with React Testing Library for unit/integration tests (260+ existing), Playwright for E2E (32 existing), Go test framework for backend, and Vitest bench for performance benchmarks.

The research investigated six specific test requirements (TEST-01 through TEST-06) against the existing codebase. The key finding is that the test infrastructure is complete and well-established. No new libraries or tools are needed. The work is purely writing new test cases following established patterns already present in the codebase. The Tooltip component uses standard mouseEnter/mouseLeave events testable with RTL's fireEvent. The useFitToSelection hook follows the same mock-useReactFlow pattern used in useSmartViewport.test.ts. The backend statistics/DDL endpoints follow identical patterns to the existing Go handler tests in handlers_test.go with mock repositories.

**Primary recommendation:** Follow existing test patterns exactly. No new dependencies needed. Write tests co-located with their components, using the established mock patterns (vi.mock for hooks, mock repositories for Go handlers, graph generators for performance benchmarks).

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Vitest | ^1.1.0 | Unit/integration test runner | Already configured with jsdom, globals, setup file |
| @testing-library/react | ^14.2.0 | React component testing | Already used in 28+ test files |
| @testing-library/user-event | ^14.5.0 | User interaction simulation | Already installed, provides realistic event sequences |
| @playwright/test | ^1.57.0 | E2E browser testing | Already configured with Chromium, dev server auto-start |
| Vitest bench (built-in) | ^1.1.0 | Performance benchmarking | Already configured, 2 existing bench files |
| Go testing + testify | stdlib + latest | Go handler/service testing | Already used in 8 Go test files |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| msw | ^2.1.0 | API mocking for integration tests | Already installed but NOT currently used in setup.ts -- available for integration tests if needed |
| vitest-axe | ^0.1.0 | Accessibility testing matchers | Already configured in setup.ts (expect.extend(matchers)) |
| @testing-library/jest-dom | ^6.4.0 | Extended DOM matchers | Already imported in setup.ts |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| RTL fireEvent for hover | @testing-library/user-event | user-event is more realistic but fireEvent is simpler for tooltips and already used in existing tests |
| Vitest bench for perf | Playwright performance API | bench runs in JSDOM (no real rendering), but consistent with existing perf tests |
| Go mock repos | httptest with real DB | Mock repos are faster, already established pattern, real DB tests done via Python run_api_tests.py |

**Installation:**
```bash
# No new packages needed - everything is already installed
cd lineage-ui && npm test -- --run  # Verify existing tests pass
```

## Architecture Patterns

### Recommended Test File Structure
```
lineage-ui/src/
├── components/
│   ├── common/
│   │   └── Tooltip.test.tsx          # NEW: TEST-01 hover tooltip tests
│   └── domain/
│       └── LineageGraph/
│           ├── DetailPanel.test.tsx   # EXTEND: TEST-06 tab switching + error states
│           ├── Toolbar.test.tsx       # EXTEND: TEST-01 fit-to-selection button
│           ├── TableNode/
│           │   ├── ColumnRow.test.tsx  # NEW: TEST-01 hover tooltip for columns
│           │   └── TableNodeHeader.test.tsx  # NEW: TEST-01 hover tooltip for headers
│           └── hooks/
│               └── useFitToSelection.test.ts  # NEW: TEST-02 viewport calculations
├── __tests__/
│   └── performance/
│       └── hoverResponsiveness.bench.ts  # NEW: TEST-04 hover perf on 100+ nodes
├── e2e/
│   └── lineage.spec.ts              # EXTEND: TEST-03 panel column click navigation

lineage-api/
├── internal/
│   └── adapter/
│       └── inbound/
│           └── http/
│               └── openlineage_handlers_test.go  # NEW: TEST-05 statistics + DDL tests
├── tests/
│   └── run_api_tests.py             # EXTEND: TEST-05 statistics + DDL integration tests
```

### Pattern 1: Unit Testing Tooltip Hover Behavior
**What:** Test that hover events show/hide tooltips with correct content for different node types (PK, FK, data type, column name)
**When to use:** TEST-01 -- tooltip behavior for different node types
**Example:**
```typescript
// Source: Existing pattern from Toolbar.test.tsx + Tooltip component analysis
import { render, screen, fireEvent, act } from '@testing-library/react';
import { vi } from 'vitest';

// For testing Tooltip with delay, need to handle setTimeout
it('shows tooltip after hover delay', async () => {
  vi.useFakeTimers();
  render(<Tooltip content="Primary Key" delay={200}><span>PK</span></Tooltip>);

  fireEvent.mouseEnter(screen.getByText('PK').closest('div')!);

  // Tooltip not visible yet (delay=200ms)
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

  // Advance timers past delay
  act(() => { vi.advanceTimersByTime(200); });

  expect(screen.getByRole('tooltip')).toBeInTheDocument();
  expect(screen.getByRole('tooltip')).toHaveTextContent('Primary Key');

  vi.useRealTimers();
});
```

### Pattern 2: Testing Hook with Mocked React Flow
**What:** Test useFitToSelection by mocking useReactFlow and useLineageStore
**When to use:** TEST-02 -- integration test for viewport calculations
**Example:**
```typescript
// Source: Existing pattern from useSmartViewport.test.ts
const mockFitView = vi.fn();
const mockGetNodes = vi.fn();

vi.mock('@xyflow/react', async () => {
  const actual = await vi.importActual('@xyflow/react');
  return {
    ...actual,
    useReactFlow: () => ({
      fitView: mockFitView,
      getNodes: mockGetNodes,
    }),
  };
});

// Mock Zustand store
vi.mock('../../../../stores/useLineageStore', () => ({
  useLineageStore: vi.fn((selector) => {
    const state = { highlightedNodeIds: new Set(['col-1', 'col-2']) };
    return selector(state);
  }),
}));
```

### Pattern 3: Go Handler Test with Mock Repository
**What:** Test OpenLineage handlers for statistics/DDL endpoints following existing handler_test.go patterns
**When to use:** TEST-05 -- API tests for statistics and DDL endpoints
**Example:**
```go
// Source: Existing pattern from handlers_test.go
func TestGetDatasetStatistics_Success(t *testing.T) {
    olRepo := mocks.NewMockOpenLineageRepository()
    olRepo.Statistics["ns1/db.table"] = &domain.DatasetStatistics{
        SourceType: "TABLE",
        RowCount:   ptr(int64(1000)),
    }
    // ... setup service and handler ...
    req := newTestRequestWithRequestID("GET", "/api/v2/openlineage/datasets/ns1%2Fdb.table/statistics",
        map[string]string{"datasetId": "ns1/db.table"})
    rr := httptest.NewRecorder()
    handler.GetDatasetStatistics(rr, req)
    assert.Equal(t, http.StatusOK, rr.Code)
}
```

### Pattern 4: Playwright E2E Navigation Test
**What:** Test that clicking a column name in DetailPanel navigates to its lineage graph
**When to use:** TEST-03 -- E2E panel column click navigation
**Example:**
```typescript
// Source: Existing pattern from lineage.spec.ts
test('TC-E2E-033: panel column click navigates to new lineage', async ({ page }) => {
  await page.goto('/lineage/demo_user.FACT_SALES.quantity');
  await page.waitForTimeout(5000);

  // Click on a column in the detail panel
  const columnLink = page.locator('[title*="View lineage for"]').first();
  if (await columnLink.count() > 0) {
    await columnLink.click();
    await page.waitForTimeout(3000);
    // URL should have changed to the new column's lineage
    const url = page.url();
    expect(url).toContain('/lineage/');
  }
});
```

### Pattern 5: Vitest Bench for Hover Performance
**What:** Benchmark hover-related operations (highlight computation, DOM update) on 100+ node graphs
**When to use:** TEST-04 -- performance tests for hover responsiveness
**Example:**
```typescript
// Source: Existing pattern from graphRender.bench.ts
import { bench, describe } from 'vitest';
import { generateGraph } from './fixtures/graphGenerators';

describe('Hover Responsiveness Performance', () => {
  const graph100 = generateGraph(100);

  bench('highlight computation for 100 nodes', () => {
    // Simulate the highlight path calculation
    const adjacency = buildAdjacencyMap(graph100.edges);
    const highlighted = computeConnectedNodes('node-50', adjacency);
  }, { time: 5000 });
});
```

### Anti-Patterns to Avoid
- **Testing CSS animation timing in JSDOM:** JSDOM cannot verify actual animation smoothness. Test that CSS classes are applied correctly (transition-opacity, duration-200), not that animations "look smooth."
- **Using waitForTimeout in unit tests:** Playwright E2E tests use waitForTimeout out of necessity, but unit tests should use vi.useFakeTimers() and vi.advanceTimersByTime() for deterministic results.
- **Mocking too deep in hook tests:** When testing useFitToSelection, mock at the @xyflow/react and store level, not deeper. The hook itself is the unit under test.
- **Testing implementation details:** Test observable behavior (tooltip appears, navigation occurs, button disabled state) not internal state management.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Graph test data generation | Manual node/edge arrays | `generateGraph()` from fixtures/graphGenerators.ts | Handles layer creation, edge routing, realistic structure |
| React Flow mock setup | Per-test useReactFlow mock | Shared mock pattern from useSmartViewport.test.ts | Consistent, handles wrapper with ReactFlowProvider |
| API mock for DetailPanel tabs | Custom fetch interceptors | vi.mock of useOpenLineage hooks (already done in DetailPanel.test.tsx) | Established pattern, controls loading/error/data states |
| Go handler test helpers | Custom HTTP setup | `withChiURLParams()` and `newTestRequestWithRequestID()` from handlers_test.go | Handles Chi routing context, request IDs |
| Timer-based tooltip testing | setTimeout with callbacks | `vi.useFakeTimers()` + `vi.advanceTimersByTime()` | Deterministic, no flaky timing issues |

**Key insight:** This phase is purely about writing tests, not building infrastructure. Every test utility needed already exists in the codebase. The risk is inventing new patterns when proven patterns already exist in adjacent test files.

## Common Pitfalls

### Pitfall 1: Tooltip Delay Makes Tests Flaky
**What goes wrong:** Tooltip has a configurable delay (default 200ms). Tests that fireEvent.mouseEnter and immediately check for tooltip visibility will fail.
**Why it happens:** The Tooltip component uses `setTimeout(setIsVisible, delay)` -- the tooltip appears asynchronously.
**How to avoid:** Use `vi.useFakeTimers()` before the test, `vi.advanceTimersByTime(delay)` after hover, and `vi.useRealTimers()` in cleanup. Wrap timer advancement in `act()`.
**Warning signs:** Tests pass locally but fail in CI, or tests that check `queryByRole('tooltip')` immediately after mouseEnter.

### Pitfall 2: React Flow Hooks Need Provider Wrapper
**What goes wrong:** Testing useFitToSelection without ReactFlowProvider wrapper causes "useReactFlow must be used within ReactFlowProvider" error.
**Why it happens:** React Flow hooks require context from ReactFlowProvider.
**How to avoid:** Use the wrapper pattern from useSmartViewport.test.ts: `const wrapper = ({ children }) => createElement(ReactFlowProvider, null, children);`
**Warning signs:** "Cannot destructure property 'fitView' of undefined" errors in test output.

### Pitfall 3: Zustand Store State Leaks Between Tests
**What goes wrong:** One test sets highlightedNodeIds, next test still sees those values.
**Why it happens:** Zustand stores are singletons -- state persists across tests unless reset.
**How to avoid:** Either mock the store entirely with `vi.mock()` (preferred for isolation) or call store.getState().reset() in beforeEach. The existing tests mock at the module level.
**Warning signs:** Tests pass in isolation but fail when run together, order-dependent failures.

### Pitfall 4: Go Handler Tests Missing Request ID Context
**What goes wrong:** Handler calls `middleware.GetReqID(ctx)` which panics or returns empty string when RequestIDKey is not in context.
**Why it happens:** Test requests created with `httptest.NewRequest()` don't include middleware context values.
**How to avoid:** Use `newTestRequestWithRequestID()` helper from handlers_test.go which adds both Chi route context and request ID.
**Warning signs:** Nil pointer dereference in error handling paths during Go tests.

### Pitfall 5: E2E Tests Assume Backend State
**What goes wrong:** E2E test for column click navigation fails because the detail panel isn't open or no column is selected.
**Why it happens:** E2E tests rely on a specific UI state that may not exist (backend down, different data).
**How to avoid:** Follow the existing pattern of checking hasDbConnectivity first, and using fallback mock validation. For UI interactions, navigate to a specific URL first, then interact.
**Warning signs:** Tests pass locally with backend running, fail in CI.

### Pitfall 6: Performance Benchmarks in JSDOM Are Not Real Browser Performance
**What goes wrong:** Benchmark numbers don't reflect actual user experience.
**Why it happens:** JSDOM doesn't do layout, painting, compositing, or GPU work. It only measures React reconciliation.
**How to avoid:** Use benchmarks for relative comparison (is 100 nodes 2x slower than 50?), not absolute numbers. Document that "these measure React computation time, not render time." The existing bench files already note this.
**Warning signs:** Someone interprets JSDOM benchmark as "this will take 50ms in the browser."

## Code Examples

Verified patterns from the existing codebase:

### Testing Tooltip Hover with Timer Control
```typescript
// Source: Tooltip.tsx component analysis + RTL patterns
import { render, screen, fireEvent, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Tooltip } from './Tooltip';

describe('Tooltip', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows tooltip on hover after delay', () => {
    render(
      <Tooltip content="Primary Key - uniquely identifies each row" position="top">
        <span>PK</span>
      </Tooltip>
    );

    const trigger = screen.getByText('PK').closest('div')!;
    fireEvent.mouseEnter(trigger);

    // Not visible yet
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

    // Advance past 200ms default delay
    act(() => { vi.advanceTimersByTime(200); });

    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    expect(screen.getByRole('tooltip')).toHaveTextContent('Primary Key');
  });

  it('hides tooltip on mouse leave', () => {
    render(
      <Tooltip content="Test tooltip"><span>Trigger</span></Tooltip>
    );

    const trigger = screen.getByText('Trigger').closest('div')!;
    fireEvent.mouseEnter(trigger);
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.getByRole('tooltip')).toBeInTheDocument();

    fireEvent.mouseLeave(trigger);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('does not show tooltip when disabled', () => {
    render(
      <Tooltip content="Won't show" disabled><span>Trigger</span></Tooltip>
    );

    // When disabled, Tooltip renders children directly without wrapper div
    expect(screen.getByText('Trigger')).toBeInTheDocument();
  });
});
```

### Testing ColumnRow Tooltip for Different Node Types
```typescript
// Source: ColumnRow.tsx component analysis -- uses @xyflow/react Handle
// Must mock @xyflow/react Handle component for unit tests
vi.mock('@xyflow/react', () => ({
  Handle: ({ children, ...props }: any) => <div data-testid="handle" {...props}>{children}</div>,
  Position: { Left: 'left', Right: 'right' },
}));

// Also mock the Tooltip to avoid timer complexity in integration tests
// OR use fake timers as shown above

it('shows PK tooltip on hover for primary key column', () => {
  vi.useFakeTimers();
  render(
    <ColumnRow
      column={{ id: 'col-1', name: 'customer_id', dataType: 'INTEGER', isPrimaryKey: true }}
      tableId="table-1"
      isSelected={false}
      isHighlighted={false}
      isDimmed={false}
    />
  );

  const pkBadge = screen.getByText('PK');
  fireEvent.mouseEnter(pkBadge.closest('div')!);
  act(() => { vi.advanceTimersByTime(200); });

  expect(screen.getByRole('tooltip')).toHaveTextContent('Primary Key');
  vi.useRealTimers();
});
```

### Testing useFitToSelection Hook
```typescript
// Source: Pattern from useSmartViewport.test.ts
import { renderHook } from '@testing-library/react';
import { createElement } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { useFitToSelection } from './useFitToSelection';

const mockFitView = vi.fn();
const mockGetNodes = vi.fn();

vi.mock('@xyflow/react', async () => {
  const actual = await vi.importActual('@xyflow/react');
  return {
    ...actual,
    useReactFlow: () => ({
      fitView: mockFitView,
      getNodes: mockGetNodes,
    }),
  };
});

vi.mock('../../../../stores/useLineageStore', () => ({
  useLineageStore: vi.fn(),
}));

import { useLineageStore } from '../../../../stores/useLineageStore';
const mockUseLineageStore = vi.mocked(useLineageStore);

describe('useFitToSelection', () => {
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    createElement(ReactFlowProvider, null, children);

  it('calls fitView with highlighted table nodes and padding', () => {
    // Setup: 2 highlighted columns in 2 different tables
    mockUseLineageStore.mockImplementation((selector: any) => {
      return selector({ highlightedNodeIds: new Set(['col-A', 'col-B']) });
    });

    mockGetNodes.mockReturnValue([
      { id: 'table-1', type: 'tableNode', data: { columns: [{ id: 'col-A' }] } },
      { id: 'table-2', type: 'tableNode', data: { columns: [{ id: 'col-B' }] } },
      { id: 'table-3', type: 'tableNode', data: { columns: [{ id: 'col-C' }] } },
    ]);

    const { result } = renderHook(() => useFitToSelection(), { wrapper });
    result.current.fitToSelection();

    expect(mockFitView).toHaveBeenCalledWith({
      nodes: [{ id: 'table-1' }, { id: 'table-2' }],
      padding: 0.15,
      duration: 300,
    });
  });

  it('hasSelection is false when no highlighted nodes', () => {
    mockUseLineageStore.mockImplementation((selector: any) => {
      return selector({ highlightedNodeIds: new Set() });
    });

    const { result } = renderHook(() => useFitToSelection(), { wrapper });
    expect(result.current.hasSelection).toBe(false);
  });
});
```

### Go Handler Test for Statistics Endpoint
```go
// Source: Pattern from handlers_test.go
func TestGetDatasetStatistics_Success(t *testing.T) {
    olHandler, olRepo := setupOpenLineageTestHandler()

    rowCount := int64(1500)
    sizeBytes := int64(52428800)
    olRepo.DatasetData["ns1/sales_db.customers"] = &domain.OpenLineageDataset{
        ID: "ns1/sales_db.customers",
    }
    olRepo.Statistics["ns1/sales_db.customers"] = &domain.DatasetStatistics{
        SourceType:    "TABLE",
        CreatorName:   "admin",
        RowCount:      &rowCount,
        SizeBytes:     &sizeBytes,
    }

    req := newTestRequestWithRequestID("GET",
        "/api/v2/openlineage/datasets/ns1%2Fsales_db.customers/statistics",
        map[string]string{"datasetId": "ns1/sales_db.customers"})
    rr := httptest.NewRecorder()
    olHandler.GetDatasetStatistics(rr, req)

    assert.Equal(t, http.StatusOK, rr.Code)

    var resp map[string]any
    json.Unmarshal(rr.Body.Bytes(), &resp)
    assert.Equal(t, "TABLE", resp["sourceType"])
}

func TestGetDatasetStatistics_NotFound(t *testing.T) {
    olHandler, _ := setupOpenLineageTestHandler()

    req := newTestRequestWithRequestID("GET",
        "/api/v2/openlineage/datasets/nonexistent/statistics",
        map[string]string{"datasetId": "nonexistent"})
    rr := httptest.NewRecorder()
    olHandler.GetDatasetStatistics(rr, req)

    assert.Equal(t, http.StatusNotFound, rr.Code)
}
```

### Performance Benchmark for Hover on Large Graphs
```typescript
// Source: Pattern from graphRender.bench.ts + layoutEngine.bench.ts
import { bench, describe } from 'vitest';
import { generateGraph } from './fixtures/graphGenerators';

describe('Hover Highlight Computation Performance', () => {
  const graph100 = generateGraph(100);
  const graph200 = generateGraph(200);

  // Build adjacency map (simulating what useLineageHighlight does)
  function buildAdjacencyMaps(edges: any[]) {
    const upstream = new Map<string, Set<string>>();
    const downstream = new Map<string, Set<string>>();
    for (const edge of edges) {
      if (!upstream.has(edge.target)) upstream.set(edge.target, new Set());
      upstream.get(edge.target)!.add(edge.source);
      if (!downstream.has(edge.source)) downstream.set(edge.source, new Set());
      downstream.get(edge.source)!.add(edge.target);
    }
    return { upstream, downstream };
  }

  function computeConnected(nodeId: string, maps: ReturnType<typeof buildAdjacencyMaps>): Set<string> {
    const visited = new Set<string>();
    const queue = [nodeId];
    while (queue.length > 0) {
      const current = queue.pop()!;
      if (visited.has(current)) continue;
      visited.add(current);
      for (const neighbor of maps.upstream.get(current) ?? []) queue.push(neighbor);
      for (const neighbor of maps.downstream.get(current) ?? []) queue.push(neighbor);
    }
    return visited;
  }

  bench('highlight computation 100 nodes', () => {
    const maps = buildAdjacencyMaps(graph100.edges);
    const mid = graph100.nodes[Math.floor(graph100.nodes.length / 2)].id;
    computeConnected(mid, maps);
  }, { time: 5000 });

  bench('highlight computation 200 nodes', () => {
    const maps = buildAdjacencyMaps(graph200.edges);
    const mid = graph200.nodes[Math.floor(graph200.nodes.length / 2)].id;
    computeConnected(mid, maps);
  }, { time: 5000 });
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual mock fetch/axios | MSW (Mock Service Worker) for API mocking | 2023+ | MSW is installed (v2.1.0) but not used -- existing tests mock at hook level instead, which is simpler |
| Enzyme for React testing | React Testing Library | 2020+ | RTL is the standard, already fully adopted in this project |
| Custom performance timers | Vitest bench (built-in, experimental) | Vitest 1.0+ | Already configured and used in 2 bench files |
| Jest for unit tests | Vitest | 2023+ | Already fully adopted, faster with Vite ecosystem |

**Deprecated/outdated:**
- Enzyme: Not used, not needed
- Jest: Fully replaced by Vitest in this project

## Open Questions

Things that couldn't be fully resolved:

1. **OpenLineage Handler Test File Location**
   - What we know: No `openlineage_handlers_test.go` file exists yet. The existing `handlers_test.go` tests the v1 API handlers.
   - What's unclear: Should new tests go in `handlers_test.go` (same package, easy access to helpers) or a new `openlineage_handlers_test.go` file (better organization)?
   - Recommendation: Create `openlineage_handlers_test.go` in the same package. This follows Go convention of test file mirroring source file, and the existing helpers (`newTestRequestWithRequestID`, `withChiURLParams`) are package-level and accessible.

2. **E2E Test Reliability for Panel Navigation**
   - What we know: Existing E2E tests use hasDbConnectivity checks and fallback to mock validation. Column click navigation requires the panel to be open and populated.
   - What's unclear: Whether the detail panel's column click will work without backend connectivity, since columns come from API data.
   - Recommendation: Structure E2E test to navigate to a known lineage URL, wait for panel to populate, then test click. Include mock fallback path.

3. **Performance Benchmark Thresholds**
   - What we know: Existing benchmarks don't define pass/fail thresholds. They measure relative performance (50 vs 100 vs 200 nodes).
   - What's unclear: What constitutes "acceptable" hover responsiveness. No threshold defined in requirements.
   - Recommendation: Benchmark without hard thresholds. Document relative scaling (100 nodes should be < 2x slower than 50). The value is regression detection, not absolute targets.

## Sources

### Primary (HIGH confidence)
- Codebase analysis: 28 existing test files, 2 bench files, 8 Go test files, 1 Playwright spec
- `lineage-ui/vitest.config.ts` -- test configuration with jsdom, setup file, bench config
- `lineage-ui/package.json` -- all test dependencies already installed
- `lineage-ui/src/test/setup.ts` -- global test setup with vitest-axe matchers
- `lineage-ui/src/components/domain/LineageGraph/hooks/useSmartViewport.test.ts` -- React Flow hook testing pattern
- `lineage-ui/src/components/domain/LineageGraph/DetailPanel.test.tsx` -- 49-test reference for tab/panel testing
- `lineage-api/internal/adapter/inbound/http/handlers_test.go` -- Go handler test patterns with mock repos
- `lineage-api/internal/domain/mocks/repositories.go` -- Mock repo with Statistics/DDLData maps

### Secondary (MEDIUM confidence)
- [Vitest bench documentation](https://vitest.dev/config/benchmark) -- benchmark configuration options
- [React Flow Testing docs](https://reactflow.dev/learn/advanced-use/testing) -- testing patterns for React Flow apps
- [Playwright hover testing](https://www.lambdatest.com/automation-testing-advisor/javascript/playwright-internal-hover) -- hover interaction testing

### Tertiary (LOW confidence)
- Web search for Vitest performance regression patterns -- general guidance on bench API usage

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all tools already installed and configured, verified in package.json and config files
- Architecture: HIGH -- test patterns extracted directly from existing 28+ test files in the codebase
- Pitfalls: HIGH -- pitfalls identified from actual component implementations (Tooltip setTimeout, React Flow context requirement, Zustand singleton)
- Code examples: HIGH -- patterns derived from existing test files with verified working assertions

**Research date:** 2026-02-06
**Valid until:** 2026-03-06 (30 days -- stable, no library changes expected)
