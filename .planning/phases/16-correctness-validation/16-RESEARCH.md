# Phase 16: Correctness Validation - Research

**Researched:** 2026-01-31
**Domain:** Graph Algorithm Validation Testing
**Confidence:** HIGH

## Summary

Phase 16 validates that graph algorithms correctly handle complex patterns (cycles, diamonds, fan-in/fan-out) without duplication or infinite loops. This phase builds on Phase 15's test data fixtures and creates integration tests that verify:

1. **CTE cycle detection** - Recursive SQL queries use path tracking (`POSITION(id IN path) = 0`) to prevent infinite loops
2. **Node deduplication** - Both backend (`nodeMap[id]` checks) and frontend (`groupColumnsByTable`) deduplicate nodes
3. **Edge completeness** - All source/target nodes in fan patterns are included in the graph

The codebase already has the correct algorithms implemented. This phase creates tests to verify they work correctly against the new complex test data patterns.

**Primary recommendation:** Create integration tests that query the API with Phase 15 test data patterns and assert specific node/edge counts, using the existing Vitest + Playwright infrastructure.

## Standard Stack

The established libraries/tools for this domain:

### Core Testing
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Vitest | 1.x | Unit/integration tests | Already configured in `vitest.config.ts`, fast, Vite-native |
| Playwright | 1.x | E2E integration tests | Already configured in `playwright.config.ts`, browser automation |
| @testing-library/react | 14.x | React component testing | Already used in unit tests |
| Go testing | stdlib | Backend unit tests | Already used in `*_test.go` files |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| msw | 2.x | API mocking | Already used in frontend unit tests |
| testify | 1.x | Go assertions | Already used in backend tests |

**Installation:**
```bash
# No new dependencies needed - all tools already configured
```

## Architecture Patterns

### Test Organization
```
lineage-ui/
├── src/
│   └── __tests__/
│       └── integration/
│           └── correctness.test.ts    # NEW: Node/edge count validation
├── e2e/
│   └── correctness.spec.ts            # NEW: E2E graph correctness tests

lineage-api/
├── internal/
│   └── adapter/outbound/teradata/
│       └── lineage_repo_correctness_test.go  # NEW: CTE validation

database/
└── test_correctness.py                 # NEW: Direct SQL verification
```

### Pattern 1: Integration Test Against Test Data
**What:** Tests query the API with known test data patterns and assert expected node/edge counts
**When to use:** Validating graph traversal algorithms work correctly
**Example:**
```typescript
// Source: Existing pattern in useLineage.test.tsx
describe('Correctness Validation', () => {
  it('CORRECT-VAL-01: cycle detection prevents infinite loops', async () => {
    const mockCycleResponse = {
      assetId: 'demo_user.CYCLE5_TEST.col_a',
      graph: {
        nodes: [
          // 5 nodes: col_a -> col_b -> col_c -> col_d -> col_e -> col_a
          { id: 'demo_user.CYCLE5_TEST.col_a', type: 'column' },
          { id: 'demo_user.CYCLE5_TEST.col_b', type: 'column' },
          { id: 'demo_user.CYCLE5_TEST.col_c', type: 'column' },
          { id: 'demo_user.CYCLE5_TEST.col_d', type: 'column' },
          { id: 'demo_user.CYCLE5_TEST.col_e', type: 'column' },
        ],
        edges: [/* 5 edges */],
      },
    };

    // Test should complete without timeout (proves no infinite loop)
    const result = await queryLineageWithTimeout(mockCycleResponse.assetId, 5000);
    expect(result.graph.nodes).toHaveLength(5);  // Not infinite
    expect(result.graph.edges).toHaveLength(5);
  });

  it('CORRECT-VAL-02: diamond produces single node instances', async () => {
    // Diamond: A -> B -> D, A -> C -> D
    const result = await queryLineage('demo_user.DIAMOND.col_d', 'upstream');

    // Node 'col_a' should appear exactly once, not twice
    const nodeIds = result.graph.nodes.map(n => n.id);
    const uniqueIds = new Set(nodeIds);
    expect(nodeIds.length).toBe(uniqueIds.size);  // No duplicates
  });
});
```

### Pattern 2: CTE Path Tracking Verification
**What:** Verify the SQL recursive CTE correctly tracks visited paths
**When to use:** Validating database-level cycle detection
**Example:**
```python
# Source: Existing pattern in database/run_tests.py
def test_cycle_path_tracking(cursor):
    """TC-EDGE-002: Verify cycle detection handles A -> B -> A pattern"""
    cursor.execute("""
        WITH RECURSIVE upstream AS (
            SELECT source_field, target_field, 1 AS depth,
                   TRIM(target_field) || '->' || TRIM(source_field) AS path
            FROM demo_user.OL_COLUMN_LINEAGE
            WHERE target_dataset = 'demo_user.CYCLE_TEST'
              AND target_field = 'col_a'
              AND is_active = 'Y'
            UNION ALL
            SELECT cl.source_field, cl.target_field, u.depth + 1,
                   u.path || '->' || cl.source_field
            FROM demo_user.OL_COLUMN_LINEAGE cl
            JOIN upstream u ON cl.target_field = u.source_field
            WHERE cl.is_active = 'Y' AND u.depth < 10
              AND POSITION(cl.source_field IN u.path) = 0  -- Cycle detection
        )
        SELECT COUNT(*) FROM upstream
    """)
    count = cursor.fetchone()[0]
    # Should return finite count, not infinite loop
    assert count == 2  # A->B, B->A (stops at second visit)
```

### Pattern 3: Expected Count Assertions
**What:** Define expected node/edge counts for each test pattern as constants
**When to use:** Clear validation of algorithm completeness
**Example:**
```typescript
// Expected counts from Phase 15 test data
const EXPECTED_COUNTS = {
  // CORRECT-VAL-01: Cycles
  'CYCLE_TEST': { nodes: 2, edges: 2 },      // 2-node cycle: A -> B -> A
  'MCYCLE_TEST': { nodes: 4, edges: 4 },     // 4-node cycle
  'CYCLE5_TEST': { nodes: 5, edges: 5 },     // 5-node cycle

  // CORRECT-VAL-02: Diamonds
  'DIAMOND': { nodes: 4, edges: 4 },         // Simple A->B->D, A->C->D
  'NESTED_DIAMOND': { nodes: 7, edges: 8 },  // Two diamonds in series
  'WIDE_DIAMOND': { nodes: 6, edges: 8 },    // A->B,C,D,E->F

  // CORRECT-VAL-03: Fan-out
  'FANOUT5_TEST': { nodes: 6, edges: 5 },    // 1 source + 5 targets
  'FANOUT10_TEST': { nodes: 11, edges: 10 }, // 1 source + 10 targets

  // CORRECT-VAL-04: Fan-in
  'FANIN5_TEST': { nodes: 6, edges: 5 },     // 5 sources + 1 target
  'FANIN10_TEST': { nodes: 11, edges: 10 },  // 10 sources + 1 target

  // CORRECT-VAL-05: Combined patterns
  'COMBINED_CYCLE_DIAMOND': { nodes: 4, edges: 5 },
  'COMBINED_FAN': { nodes: 5, edges: 6 },
};
```

### Anti-Patterns to Avoid
- **Testing implementation, not behavior:** Don't test that `POSITION(id IN path) = 0` is called; test that cycles terminate
- **Hardcoding data in tests:** Reference Phase 15 test data constants, don't duplicate
- **Timeout as only validation:** Assert specific counts, not just "didn't hang"

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Graph traversal cycle detection | Custom visited set in JS | SQL CTE `POSITION(id IN path)` | Already implemented in `lineage_repo.go` and `openlineage_repo.go` |
| Node deduplication | Manual filtering | `Map<string, node>` in `buildGraph()` | Already implemented in `lineage_repo.go:264` |
| Frontend table grouping | Custom groupBy | `groupColumnsByTable()` | Already implemented in `layoutEngine.ts` |
| API response timeout | Custom Promise.race | Playwright `expect.toPass({ timeout })` | Built-in timeout handling |

**Key insight:** The algorithms are already correct; this phase validates they remain correct.

## Common Pitfalls

### Pitfall 1: Testing Against Live Database Only
**What goes wrong:** Tests fail when database is unavailable or data changes
**Why it happens:** Integration tests without mocks depend on external state
**How to avoid:** Use MSW mocks with expected responses from Phase 15 data definitions
**Warning signs:** Tests pass locally but fail in CI; flaky tests

### Pitfall 2: Incorrect Expected Counts
**What goes wrong:** Tests pass/fail for wrong reasons due to incorrect expectations
**Why it happens:** Manual counting of test data patterns
**How to avoid:** Calculate expected counts programmatically from `insert_cte_test_data.py`
**Warning signs:** Tests pass when they shouldn't; disagreement between code and test

### Pitfall 3: Not Testing Both Directions
**What goes wrong:** Upstream works but downstream fails (or vice versa)
**Why it happens:** Algorithms differ for upstream vs downstream traversal
**How to avoid:** Test cycles/diamonds in both directions
**Warning signs:** Tests only cover one direction

### Pitfall 4: Timeout-Only Validation
**What goes wrong:** Test passes because timeout is generous, not because algorithm is correct
**Why it happens:** Infinite loops eventually hit resource limits
**How to avoid:** Assert specific node/edge counts, not just completion
**Warning signs:** Tests that just check `result !== undefined`

## Code Examples

Verified patterns from existing codebase:

### Backend CTE Cycle Detection (Go)
```go
// Source: lineage-api/internal/adapter/outbound/teradata/lineage_repo.go:89-91
// Path tracking prevents revisiting nodes
AND POSITION(cl.source_column_id IN ul.path) = 0
```

### Backend Node Deduplication (Go)
```go
// Source: lineage-api/internal/adapter/outbound/teradata/lineage_repo.go:282-292
// Map-based deduplication ensures single node instances
if _, exists := nodeMap[l.SourceColumnID]; !exists {
    nodeMap[l.SourceColumnID] = domain.LineageNode{
        ID:           l.SourceColumnID,
        // ...
    }
}
```

### Frontend Table Grouping (TypeScript)
```typescript
// Source: lineage-ui/src/utils/graph/layoutEngine.ts:61-75
// Groups columns by table, ensuring single table node per table
export function groupColumnsByTable(nodes: LineageNode[]): Map<string, LineageNode[]> {
  const groups = new Map<string, LineageNode[]>();
  for (const node of nodes) {
    if (node.type === 'column' && node.tableName && node.databaseName) {
      const tableKey = `${node.databaseName}.${node.tableName}`;
      if (!groups.has(tableKey)) {
        groups.set(tableKey, []);
      }
      groups.get(tableKey)!.push(node);
    }
  }
  return groups;
}
```

### Existing Test Pattern (TypeScript)
```typescript
// Source: lineage-ui/src/utils/graph/layoutEngine.test.ts:347-371
// Diamond pattern test - validates graph correctness
it('handles diamond pattern graph across different tables', async () => {
  const nodes: LineageNode[] = [
    { id: 'A', type: 'column', databaseName: 'db', tableName: 't1', columnName: 'colA' },
    { id: 'B', type: 'column', databaseName: 'db', tableName: 't2', columnName: 'colB' },
    { id: 'C', type: 'column', databaseName: 'db', tableName: 't3', columnName: 'colC' },
    { id: 'D', type: 'column', databaseName: 'db', tableName: 't4', columnName: 'colD' },
  ];
  const edges: LineageEdge[] = [
    { id: 'e1', source: 'A', target: 'B' },
    { id: 'e2', source: 'A', target: 'C' },
    { id: 'e3', source: 'B', target: 'D' },
    { id: 'e4', source: 'C', target: 'D' },
  ];

  const result = await layoutGraph(nodes, edges);
  expect(result.nodes).toHaveLength(4);
  expect(result.edges).toHaveLength(4);
});
```

## Test Data Reference

Phase 15 created the following test patterns in `database/insert_cte_test_data.py`:

| Pattern | Table | Nodes | Edges | Test Purpose |
|---------|-------|-------|-------|--------------|
| 2-node cycle | CYCLE_TEST | 2 | 2 | A->B->A loop detection |
| 4-node cycle | MCYCLE_TEST | 4 | 4 | Multi-hop cycle |
| 5-node cycle | CYCLE5_TEST | 5 | 5 | Larger cycle |
| Simple diamond | DIAMOND | 4 | 4 | A->B->D, A->C->D |
| Nested diamond | NESTED_DIAMOND | 7 | 8 | Two diamonds in series |
| Wide diamond | WIDE_DIAMOND | 6 | 8 | A->B,C,D,E->F |
| Fan-out 5 | FANOUT5_TEST | 6 | 5 | 1 source -> 5 targets |
| Fan-out 10 | FANOUT10_TEST | 11 | 10 | 1 source -> 10 targets |
| Fan-in 5 | FANIN5_TEST | 6 | 5 | 5 sources -> 1 target |
| Fan-in 10 | FANIN10_TEST | 11 | 10 | 10 sources -> 1 target |
| Cycle+Diamond | COMBINED_CYCLE_DIAMOND | 4 | 5 | Combined patterns |
| Fan-out+Fan-in | COMBINED_FAN | 5 | 6 | Bow-tie pattern |

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Application-level cycle detection | SQL CTE path tracking | Initial implementation | More efficient, database-optimized |
| Separate dedup pass | Build-time dedup via Map | Initial implementation | Single pass, no post-processing |

**Deprecated/outdated:**
- None - the current approach is the industry standard for graph traversal validation

## Open Questions

No major open questions. The algorithms are implemented and Phase 15 test data exists. This phase creates validation tests.

## Sources

### Primary (HIGH confidence)
- `/Users/Daniel.Tehan/Code/lineage/lineage-api/internal/adapter/outbound/teradata/lineage_repo.go` - CTE implementation with cycle detection
- `/Users/Daniel.Tehan/Code/lineage/lineage-api/internal/adapter/outbound/teradata/openlineage_repo.go` - OpenLineage CTE queries
- `/Users/Daniel.Tehan/Code/lineage/lineage-ui/src/utils/graph/layoutEngine.ts` - Frontend node grouping
- `/Users/Daniel.Tehan/Code/lineage/lineage-ui/src/utils/graph/layoutEngine.test.ts` - Existing graph tests
- `/Users/Daniel.Tehan/Code/lineage/database/insert_cte_test_data.py` - Phase 15 test data definitions

### Secondary (MEDIUM confidence)
- `/Users/Daniel.Tehan/Code/lineage/lineage-ui/e2e/lineage.spec.ts` - Existing E2E test patterns
- `/Users/Daniel.Tehan/Code/lineage/database/run_tests.py` - Database test patterns

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All tools already in use in codebase
- Architecture: HIGH - Based on existing test patterns
- Pitfalls: HIGH - Derived from codebase analysis
- Expected counts: MEDIUM - Calculated from test data, should verify

**Research date:** 2026-01-31
**Valid until:** 60 days (stable testing patterns)
