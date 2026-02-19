# Phase 11: Sort Columns Alphabetically in Lineage Graph Nodes - Research

**Researched:** 2026-02-19
**Domain:** Frontend data transformation (React/TypeScript) — pure sorting concern
**Confidence:** HIGH

---

## Summary

Phase 11 is a narrow, well-scoped frontend change. The goal is to display columns inside `TableNode` graph nodes in alphabetical order by column name. The change does not require any backend work: the API already returns columns in `ordinal_position` order (the physical column order in the database), which is the correct default for the backend. Alphabetical sorting is a pure presentation concern that belongs in the frontend data transformation layer.

The critical insertion point is the `transformToTableNodes` function inside `layoutEngine.ts`. This is the single place where raw `LineageNode[]` arrays are converted into the `ColumnDefinition[]` arrays that populate `TableNodeData.columns`. Because `TableNode` renders `data.columns.map(...)` directly, sorting the array at transformation time is sufficient — no changes to `TableNode.tsx` or `ColumnRow.tsx` are needed.

A second, independent surface is `DetailPanel`'s `ColumnsTab`, which renders a `ColumnDetail[]` array passed from the parent `LineageGraph.tsx`. That list is populated from the graph's OpenLineage response and also arrives in ordinal-position order. If alphabetical ordering is desired there too, it needs its own sort — but this is a smaller, optional touch compared to the main graph node requirement.

**Primary recommendation:** Add a single `.sort((a, b) => a.name.localeCompare(b.name))` to the `columns` array inside `transformToTableNodes` in `layoutEngine.ts`. Then add a corresponding unit test to the existing `layoutEngine.test.ts` suite.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | ^5.3.0 | Language for all frontend source | Already used throughout |
| React 18 | ^18.2.0 | Component rendering | Already used throughout |
| @xyflow/react | ^12.0.0 | Graph canvas and node rendering | Already used for lineage graph |
| ELKjs | ^0.9.0 | Automatic layout algorithm | Already used for node positioning |
| Vitest | ^1.1.0 | Unit test runner | Already used for layoutEngine tests |

### Supporting

No new libraries are required. The sort is implemented with native JavaScript `Array.prototype.sort` and `String.prototype.localeCompare`.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `localeCompare` | `< / >` string comparison | `localeCompare` handles locale-specific characters and case correctly; `< / >` is ASCII-only. Use `localeCompare` |
| Sort in `transformToTableNodes` (layoutEngine) | Sort in `TableNode.tsx` render | Sorting in the transformation layer means it happens once and is testable in isolation; sorting in render would re-sort every render cycle and is harder to test |
| Sort in `transformToTableNodes` | Sort at the API layer | Frontend can always re-sort; backend sort would change all API consumers and is unnecessary here |

**Installation:** No new packages needed.

---

## Architecture Patterns

### Recommended Project Structure

No new files needed. The change targets one function in an existing file:

```
lineage-ui/src/
├── utils/graph/
│   ├── layoutEngine.ts          <-- MODIFY: sort columns in transformToTableNodes
│   └── layoutEngine.test.ts     <-- MODIFY: add alphabetical sort test cases
└── components/domain/LineageGraph/
    └── DetailPanel/
        └── ColumnsTab.tsx       <-- OPTIONAL MODIFY: sort ColumnDetail[] if needed
```

### Pattern 1: Sort at Transformation Boundary

**What:** Sort the `columns` array once, at the point where raw node data is converted to `ColumnDefinition[]`, before it enters the React node data structure.

**When to use:** Whenever a derived collection must have a stable order for rendering — sort at the earliest deterministic point, not at render time.

**Where in code:**

`/Users/Daniel.Tehan/Code/lineage/lineage-ui/src/utils/graph/layoutEngine.ts`, inside `transformToTableNodes`, the `columns` array is currently built like this:

```typescript
// Current code (lines 182-195, transformToTableNodes)
const columns: ColumnDefinition[] = columnNodes.map((node) => {
  columnToTableMap.set(node.id, tableKey);
  return {
    id: node.id,
    name: node.columnName || 'unknown',
    dataType: (node.metadata?.columnType as string) || 'unknown',
    isPrimaryKey: node.metadata?.isPrimaryKey === true,
    isForeignKey: node.metadata?.isForeignKey === true,
    hasUpstreamLineage: columnsWithUpstream.has(node.id),
    hasDownstreamLineage: columnsWithDownstream.has(node.id),
  };
});
```

The fix is to chain `.sort()` after `.map()`:

```typescript
const columns: ColumnDefinition[] = columnNodes
  .map((node) => {
    columnToTableMap.set(node.id, tableKey);
    return {
      id: node.id,
      name: node.columnName || 'unknown',
      dataType: (node.metadata?.columnType as string) || 'unknown',
      isPrimaryKey: node.metadata?.isPrimaryKey === true,
      isForeignKey: node.metadata?.isForeignKey === true,
      hasUpstreamLineage: columnsWithUpstream.has(node.id),
      hasDownstreamLineage: columnsWithDownstream.has(node.id),
    };
  })
  .sort((a, b) => a.name.localeCompare(b.name));
```

### Pattern 2: ELK Port Index Must Follow Sort Order

**What:** The `createElkPorts` function assigns `port.index` values to ELK ports in column order. Since the `columns` array is passed directly to `createElkPorts`, sorting before creating ports is sufficient — the port indices will automatically match the sorted display order.

**Why this matters:** ELK uses `port.index` with `FIXED_ORDER` port constraints to determine the vertical position of edge connection points. If the sorted column order is different from the port-index order, edges would visually connect to the wrong column rows.

**Verification:** Sorting `columns` before passing them to both `nodes.push({ ..., columns })` and `createElkPorts(tableNode.id, tableNode.columns)` is the correct sequence. Looking at the current code, `createElkPorts` is called inside `layoutGraph` on `tableNode.columns` after `transformToTableNodes` returns, so the sort in `transformToTableNodes` propagates correctly to ELK port assignment.

### Pattern 3: Case-Insensitive Sort via localeCompare

**What:** `localeCompare` with default options performs locale-aware, case-folded comparison. This means `account_id`, `Account_Name`, `AMOUNT` sort as `account_id → Account_Name → AMOUNT` (case-insensitive, alphabetical).

**Example:**
```typescript
// Case-insensitive alphabetical — standard approach
.sort((a, b) => a.name.localeCompare(b.name))

// Explicitly case-insensitive if needed
.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
```

Default `localeCompare` is already case-insensitive in most environments. `sensitivity: 'base'` makes it explicit.

### Anti-Patterns to Avoid

- **Sorting in `TableNode.tsx` render:** Sorting inside `data.columns.map(...)` or deriving a sorted copy on each render is wasteful. The layout engine already creates the data; sort there.
- **Sorting in the backend API:** The backend correctly orders by `ordinal_position` which is the database-native order. Changing this would affect all API consumers and mix display concerns into data access.
- **Mutating `.sort()` on the original array:** `Array.prototype.sort` mutates in place. Use `.map(...).sort(...)` as shown above, or spread `[...columnNodes]` before sorting. The current pattern uses `.map()` first which creates a new array, so chaining `.sort()` is safe.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Locale-aware string comparison | Custom compare function with `toLowerCase()` | `String.prototype.localeCompare` | Handles Unicode, diacritics, locale differences correctly |
| Stable sort | Custom merge sort | Native `.sort()` | V8's Array.sort has been spec-required stable since ES2019; Node.js 11+, Chrome 70+ all stable |

**Key insight:** This is a one-liner change, not a feature. The risk is entirely in getting the insertion point right (layout engine, not component render) and verifying ELK port ordering is unaffected.

---

## Common Pitfalls

### Pitfall 1: Sorting After `createElkPorts` Is Called

**What goes wrong:** If someone sorts `columns` inside `TableNode.tsx` or in a `useMemo` at render time, the ELK port indices (which are assigned in `layoutEngine.ts`) will no longer match the visual column row positions. This causes edges to visually connect at the wrong y-positions within the node.

**Why it happens:** ELK ports have a fixed `port.index` that determines their y-coordinate. If rows are reordered at render time without updating ELK port positions, the edge endpoints are misaligned.

**How to avoid:** Sort in `transformToTableNodes` before `createElkPorts` consumes the columns. The port indices will then match the sorted display order from the start.

**Warning signs:** Edges appear to connect between rows that are not the actual source/target columns.

### Pitfall 2: Sort Stability Concerns

**What goes wrong:** Columns with identical `name` values (shouldn't happen in practice, but possible with edge data) could flip order on re-render.

**Why it happens:** JavaScript sort stability is only guaranteed if the comparison returns 0 for equal items.

**How to avoid:** `localeCompare` returns 0 for equal strings, and JavaScript's native sort is stable (ES2019+). No secondary sort key is needed.

### Pitfall 3: Forgetting the DetailPanel ColumnsTab

**What goes wrong:** Graph nodes show alphabetical columns, but the detail panel side drawer still shows columns in ordinal position order — inconsistent UX.

**Why it happens:** `ColumnsTab.tsx` renders `columns.map(...)` where `columns` is a `ColumnDetail[]` built in `LineageGraph.tsx` from the OpenLineage response. It has no sort of its own.

**How to avoid:** Decide whether the DetailPanel should also sort alphabetically. If yes, add `.sort((a, b) => a.columnName.localeCompare(b.columnName))` when building the `selectedColumns` array in `LineageGraph.tsx` (or inside `ColumnsTab.tsx` with a `useMemo`). If maintaining ordinal order in the detail panel is desired, leave it as-is.

**Note:** The `ColumnDetail` interface uses `columnName` (not `name`) as its field, so the sort comparator key is different from the `ColumnDefinition` pattern.

### Pitfall 4: localeCompare Performance at Scale

**What goes wrong:** For tables with hundreds of columns, `localeCompare` can be slower than simple `<` / `>` comparison.

**Why it happens:** `localeCompare` uses Unicode collation tables.

**How to avoid:** This application deals with Teradata database column lists, which are typically 10-100 columns per table. Performance is not a concern at this scale. `localeCompare` is correct here.

---

## Code Examples

### Exact Change Location

File: `/Users/Daniel.Tehan/Code/lineage/lineage-ui/src/utils/graph/layoutEngine.ts`

Function: `transformToTableNodes` (lines ~179-210)

Current code building `columns`:
```typescript
const columns: ColumnDefinition[] = columnNodes.map((node) => {
  // Map column ID to table key for edge routing
  columnToTableMap.set(node.id, tableKey);

  return {
    id: node.id,
    name: node.columnName || 'unknown',
    dataType: (node.metadata?.columnType as string) || 'unknown',
    isPrimaryKey: node.metadata?.isPrimaryKey === true,
    isForeignKey: node.metadata?.isForeignKey === true,
    hasUpstreamLineage: columnsWithUpstream.has(node.id),
    hasDownstreamLineage: columnsWithDownstream.has(node.id),
  };
});
```

After change:
```typescript
const columns: ColumnDefinition[] = columnNodes
  .map((node) => {
    // Map column ID to table key for edge routing
    columnToTableMap.set(node.id, tableKey);

    return {
      id: node.id,
      name: node.columnName || 'unknown',
      dataType: (node.metadata?.columnType as string) || 'unknown',
      isPrimaryKey: node.metadata?.isPrimaryKey === true,
      isForeignKey: node.metadata?.isForeignKey === true,
      hasUpstreamLineage: columnsWithUpstream.has(node.id),
      hasDownstreamLineage: columnsWithDownstream.has(node.id),
    };
  })
  .sort((a, b) => a.name.localeCompare(b.name));
```

### Test Pattern to Add

File: `/Users/Daniel.Tehan/Code/lineage/lineage-ui/src/utils/graph/layoutEngine.test.ts`

Add inside the `layoutGraph` describe block or a new `describe('column sorting')` block:

```typescript
it('sorts columns alphabetically within a table node', async () => {
  const nodes: LineageNode[] = [
    { id: '1', type: 'column', databaseName: 'db', tableName: 't', columnName: 'zebra' },
    { id: '2', type: 'column', databaseName: 'db', tableName: 't', columnName: 'alpha' },
    { id: '3', type: 'column', databaseName: 'db', tableName: 't', columnName: 'mango' },
  ];
  const edges: LineageEdge[] = [];

  const result = await layoutGraph(nodes, edges);

  const nodeData = result.nodes[0].data as { columns: Array<{ name: string }> };
  expect(nodeData.columns.map((c) => c.name)).toEqual(['alpha', 'mango', 'zebra']);
});

it('sorts columns case-insensitively', async () => {
  const nodes: LineageNode[] = [
    { id: '1', type: 'column', databaseName: 'db', tableName: 't', columnName: 'ZEBRA' },
    { id: '2', type: 'column', databaseName: 'db', tableName: 't', columnName: 'alpha' },
    { id: '3', type: 'column', databaseName: 'db', tableName: 't', columnName: 'Mango' },
  ];
  const edges: LineageEdge[] = [];

  const result = await layoutGraph(nodes, edges);

  const nodeData = result.nodes[0].data as { columns: Array<{ name: string }> };
  const names = nodeData.columns.map((c) => c.name.toLowerCase());
  expect(names).toEqual(['alpha', 'mango', 'zebra']);
});
```

---

## Data Flow: End-to-End Understanding

The complete column data path for lineage graph nodes:

```
Backend (Python Flask)
  LineageRepository.get_upstream/downstream_lineage()
    → rows from OL_COLUMN_LINEAGE (no guaranteed column order in SQL result)
  LineageService._build_node()
    → dict with field_name, dataset_name, etc.
  API response: {"graph": {"nodes": [...field nodes...], "edges": [...]}}

Frontend
  useOpenLineageTableLineage() / useOpenLineageGraph()   [useOpenLineage.ts]
    → OpenLineageLineageResponse
  convertOpenLineageGraph()                              [openLineageAdapter.ts]
    → LineageNode[] (type='column', columnName, metadata)
  layoutGraph()                                          [layoutEngine.ts]
    → groupColumnsByTable()          groups by databaseName.tableName
    → transformToTableNodes()        ← SORT HERE: columns.sort()
    → createElkPorts()               uses sorted columns array
    → elk.layout()                   assigns x/y positions
    → TableNodeData[]                columns array in final React Flow node data
  TableNode.tsx
    → data.columns.map((column) => <ColumnRow key={column.id} ... />)
    ← columns are rendered in whatever order they arrive in data.columns
```

**The only frontend location that needs to change is `transformToTableNodes` in `layoutEngine.ts`.**

---

## Scope Analysis: What Else Renders Columns

| Surface | File | Column Array | Current Order | Needs Sort? |
|---------|------|-------------|--------------|-------------|
| Graph node rows | `TableNode.tsx` via `data.columns` | `ColumnDefinition[]` | Ordinal (API order) | **Yes — fix in layoutEngine** |
| Detail panel drawer | `ColumnsTab.tsx` via `selectedColumns` prop | `ColumnDetail[]` | Ordinal (API order) | Optional — decide in planning |
| Asset Browser | `AssetBrowser/` | Field list from `useOpenLineageDataset` | `ordinal_position` from DB | Out of scope — different feature |

The backend `get_dataset` query uses `ORDER BY ordinal_position, field_name`, which means field names are already sub-sorted alphabetically within each ordinal position. This is not the same as full alphabetical sort and does not affect the lineage graph (which uses a different code path through `OL_COLUMN_LINEAGE`).

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Sort in render | Sort in transformation layer | Phase 11 (new) | Sort happens once, ELK ports stay aligned |

No deprecated patterns involved. This is a new capability addition.

---

## Open Questions

1. **Should `ColumnsTab` (detail panel) also sort alphabetically?**
   - What we know: `ColumnsTab` renders a `ColumnDetail[]` in ordinal position order
   - What's unclear: Whether the user's intent ("columns in alphabetical order") applies to the panel or just the graph nodes
   - Recommendation: Include it in scope. The user described the goal as making lineage connections "easier to follow" — the panel is part of the same UX surface. Sort it too. The sort goes in `LineageGraph.tsx` where `selectedColumns` is built, or inside `ColumnsTab.tsx` with a `useMemo`.

2. **What is the `localeCompare` sensitivity setting?**
   - What we know: Default `localeCompare` is typically case-insensitive
   - What's unclear: Whether explicit `sensitivity: 'base'` is warranted for Teradata column names (which are always uppercase in practice)
   - Recommendation: Use plain `localeCompare(b.name)` without options. Teradata normalizes column names to uppercase anyway, so this is effectively case-insensitive in practice.

---

## Sources

### Primary (HIGH confidence)

- Direct codebase inspection — all findings verified by reading actual source files:
  - `/Users/Daniel.Tehan/Code/lineage/lineage-ui/src/utils/graph/layoutEngine.ts` — transformation logic, ELK port assignment, confirmed insertion point
  - `/Users/Daniel.Tehan/Code/lineage/lineage-ui/src/components/domain/LineageGraph/TableNode/TableNode.tsx` — `data.columns.map()` render pattern
  - `/Users/Daniel.Tehan/Code/lineage/lineage-ui/src/components/domain/LineageGraph/TableNode/ColumnRow.tsx` — `ColumnDefinition` type, no sorting logic
  - `/Users/Daniel.Tehan/Code/lineage/lineage-api/repositories/dataset_repository.py` — `ORDER BY ordinal_position, field_name` confirms backend does not sort alphabetically
  - `/Users/Daniel.Tehan/Code/lineage/lineage-ui/src/utils/graph/layoutEngine.test.ts` — existing test patterns for `layoutGraph`
  - `/Users/Daniel.Tehan/Code/lineage/lineage-ui/src/components/domain/LineageGraph/DetailPanel/ColumnsTab.tsx` — second render surface

### Secondary (MEDIUM confidence)

- MDN Web Docs pattern knowledge: `String.prototype.localeCompare` with default args performs locale-aware, generally case-insensitive comparison. Stable since JavaScript 1.2.
- ES2019 specification: `Array.prototype.sort` is required to be stable (matching V8 behavior since Node.js 11 / Chrome 70).

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified in package.json, no new dependencies
- Architecture: HIGH — insertion point confirmed by reading source; data flow traced end-to-end
- Pitfalls: HIGH — ELK port alignment pitfall verified by reading `createElkPorts` and `layoutGraph` call sequence; DetailPanel surface confirmed by code inspection
- Test patterns: HIGH — existing test patterns in `layoutEngine.test.ts` confirmed, new test cases follow identical structure

**Research date:** 2026-02-19
**Valid until:** 2026-03-21 (stable codebase; layout engine unlikely to change soon)
