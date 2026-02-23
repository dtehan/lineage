# Phase 23: Standalone Table Rendering - Research

**Researched:** 2026-02-23
**Domain:** Backend error handling, React Flow single-node rendering, Asset Browser UI indicator
**Confidence:** HIGH

---

## Summary

Phase 23 has four requirements across two distinct concerns: (1) fixing the rendering pipeline to handle tables with no lineage edges correctly (REND-01, REND-02, REND-03), and (2) adding a "has lineage" indicator per table in the Asset Browser (BROW-02).

The rendering fix is well-scoped with existing infrastructure. The backend already returns `{nodes, edges}` for tables with lineage — the gap is that `get_table_lineage_graph()` throws `DatasetNotFoundError("No fields found for dataset")` when `OL_DATASET_FIELD` returns no rows, and returns only field-level nodes with zero edges when fields exist. The frontend already has a `hasNoLineageData` branch (lines 679-706 in `LineageGraph.tsx`) that renders an empty-state screen — but it replaces the graph canvas entirely rather than showing a node with an informational banner overlaid. The layout engine also has an explicit early-exit gate at line 281 that skips ELK when `legacyEdges.length === 0`, calling `setStage('complete')` immediately — this is correct and already handles the ELK hang-prevention. What is missing is: rendering the ReactFlow canvas with the single node in it, and showing the "No lineage connections" banner alongside (not instead of) the node.

The BROW-02 indicator requires a backend query change: `list_datasets()` must JOIN `OL_DATASET_FIELD` against `OL_COLUMN_LINEAGE` to compute `has_lineage: bool` per dataset, and the `DatasetItem` in `AssetBrowser.tsx` must render a small visual badge based on that flag.

**Primary recommendation:** Implement Phase 23 as two tasks: (1) backend + frontend rendering fix for standalone tables (REND-01/02/03), (2) `has_lineage` indicator in Asset Browser (BROW-02). Both tasks are self-contained with clear change boundaries.

---

## Standard Stack

### Core (already in use — no new dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Flask | 3.x | Backend routing and error handling | Already the server framework |
| `@xyflow/react` | 12.x | Graph canvas rendering | Already used for all graph views |
| TanStack Query | 5.x | Frontend data fetching and caching | Already used for all API calls |
| Tailwind CSS | 3.x | Utility-first styling for banner | Already used throughout the UI |
| Lucide React | latest | Icon library | Already imported; `Info` icon suits informational banners |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Vitest + RTL | current | Unit testing components and service | All new logic needs unit tests |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Informational banner as inline overlay | Toast/notification | Overlays persist across user interactions; inline banners are contextual and dismissible — inline is correct here |
| `has_lineage` computed in Python service layer | Computed in frontend after fetch | Backend computation is one SQL JOIN; frontend computation would require a separate lineage endpoint call per table — N+1 antipattern |

**Installation:** No new packages required.

---

## Architecture Patterns

### Recommended Project Structure (existing — no new folders)

```
lineage-api/
├── services/lineage_service.py    # CHANGE: get_table_lineage_graph() no-fields fix
├── repositories/dataset_repository.py  # CHANGE: list_datasets() adds has_lineage JOIN

lineage-ui/src/
├── components/domain/LineageGraph/LineageGraph.tsx  # CHANGE: render single node + banner
├── components/domain/AssetBrowser/AssetBrowser.tsx  # CHANGE: DatasetItem shows indicator
├── types/openlineage.ts           # CHANGE: OpenLineageDataset adds hasLineage?: boolean
└── api/hooks/useOpenLineage.ts    # No change needed (types propagate automatically)
```

### Pattern 1: Backend — Return Valid Graph Instead of Throwing

**What:** When `get_table_lineage_graph()` finds no fields in `OL_DATASET_FIELD`, it currently raises `DatasetNotFoundError`. The fix: return a valid `{nodes: [], edges: []}` response when the dataset exists but has no fields. The nodes array can be empty (frontend handles the no-data display), or it can be populated with a dataset-level node. An empty nodes+edges response is the simplest correct contract that satisfies REND-03.

**Current code at lineage_service.py:170-172:**
```python
fields = self.dataset_repo.get_dataset_fields(dataset_id)
if not fields:
    raise DatasetNotFoundError(f"No fields found for dataset: {dataset_id}")
```

**Fix pattern:**
```python
fields = self.dataset_repo.get_dataset_fields(dataset_id)
if not fields:
    # Dataset exists in catalog but has no fields — valid state (not an error).
    # Return a valid empty graph so the frontend can render the informational state.
    return {
        "datasetId": dataset_id,
        "graph": {
            "nodes": [],
            "edges": []
        }
    }
```

This matches the precedent already set by `get_column_lineage_graph()`: when no lineage edges exist for a field, it returns the root node in `nodes` with an empty `edges` list — it never throws. The table-level equivalent should behave identically.

**Note:** The dataset existence check (`get_dataset_with_namespace`) already runs before the fields check and correctly raises `DatasetNotFoundError` if the dataset itself is not in `OL_DATASET`. The fields-not-found case is distinct: the dataset exists, but either (a) `OL_DATASET_FIELD` has not been populated yet, or (b) the table genuinely has no columns (extremely rare). Both are valid states, not errors.

### Pattern 2: Frontend — Render Single Node + Informational Banner

**What:** The current `hasNoLineageData` branch at LineageGraph.tsx:679 returns a full-screen empty state that replaces the ReactFlow canvas. The fix: keep the ReactFlow canvas rendering (so the single node is visible), and show the "No lineage connections" message as an informational banner above the canvas — not as a replacement.

The layout engine already handles zero-edge graphs correctly (line 281 in `layoutEngine.ts` skips ELK and calls `setStage('complete')` immediately). The issue is purely in the render branch.

**Current code (LineageGraph.tsx:679-706) — renders full-screen replacement:**
```tsx
const hasNoLineageData = data && data.graph && data.graph.edges?.length === 0;
if (hasNoLineageData) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-slate-500">
      {/* Full-screen empty state — prevents node from rendering */}
    </div>
  );
}
```

**Fix pattern — render node with banner:**
```tsx
const hasNoLineageData = data && data.graph && data.graph.edges?.length === 0;

// In the return JSX, after the Toolbar:
{hasNoLineageData && (
  <div
    role="status"
    aria-live="polite"
    className="flex items-center gap-2 px-4 py-2 bg-blue-50 border-b border-blue-100 text-blue-700 text-sm"
  >
    <Info size={16} className="shrink-0" />
    <span>No lineage connections found for this table.</span>
  </div>
)}
```

The ReactFlow canvas renders below with the single table node. The table node is already correctly built by `convertOpenLineageGraph` and placed by the layout engine's isolated-grid path (which handles tables with no edges).

**Note on empty nodes array:** If the backend returns `nodes: []` (no-fields case), `hasNoLineageData` will be truthy AND `legacyNodes` will be empty. The layout engine handles this: `tableGroups.size === 0` triggers `layoutSimpleNodes` with an empty array, which returns `{nodes: [], edges: []}` — the ReactFlow canvas renders blank with just the banner. This is the correct behavior for a table that has no OL_DATASET_FIELD entries.

### Pattern 3: Backend — `has_lineage` Field in `list_datasets`

**What:** The `list_datasets` query in `dataset_repository.py` (line 222) currently joins `OL_DATASET` with `OL_NAMESPACE`. To add `has_lineage: bool`, add a LEFT OUTER JOIN EXISTS subquery against `OL_COLUMN_LINEAGE`.

**OL_COLUMN_LINEAGE schema** (confirmed in codebase): columns include `source_dataset_id` and `target_dataset_id` as foreign keys to `OL_DATASET`.

**Pattern:**
```sql
SELECT
    d.dataset_id,
    d."name" as dataset_name,
    ...,
    CASE
        WHEN EXISTS (
            SELECT 1 FROM OL_COLUMN_LINEAGE cl
            WHERE cl.source_dataset_id = d.dataset_id
               OR cl.target_dataset_id = d.dataset_id
        ) THEN 'Y' ELSE 'N'
    END AS has_lineage
FROM OL_DATASET d
JOIN OL_NAMESPACE n ON d.namespace_id = n.namespace_id
WHERE d.namespace_id = ?{extra_where}
```

**Important:** Before writing this query, verify the actual column names in `OL_COLUMN_LINEAGE` by checking the schema setup script. The `source_dataset_id` / `target_dataset_id` names are assumed — confirm against `setup_lineage_schema.py`.

**Performance consideration:** The EXISTS subquery is evaluated per row. With `limit: 500` per database expand (Phase 22 decision), this is at most 500 subquery evaluations. On a Teradata system with `OL_COLUMN_LINEAGE` indexed by `source_dataset_id` and `target_dataset_id`, this is fast. If no index exists, plan for a potential full-table scan per row — flag this for validation.

### Pattern 4: Frontend — `has_lineage` Badge in AssetBrowser

**What:** `OpenLineageDataset` type needs `hasLineage?: boolean` added. `DatasetItem` in `AssetBrowser.tsx` renders a small colored indicator (dot or badge) based on this field.

**Type change:**
```typescript
// types/openlineage.ts
export interface OpenLineageDataset {
  id: string;
  namespace: string;
  name: string;
  description?: string;
  sourceType?: string;
  hasLineage?: boolean;  // NEW — undefined means unknown, false means catalog-only
  fields?: OpenLineageField[];
  createdAt: string;
  updatedAt: string;
}
```

**Render pattern (DatasetItem in AssetBrowser.tsx):**
```tsx
{dataset.hasLineage === true && (
  <Tooltip content="Has lineage connections" position="right">
    <span
      className="w-2 h-2 rounded-full bg-blue-500 shrink-0"
      data-testid="has-lineage-indicator"
      aria-label="Has lineage connections"
    />
  </Tooltip>
)}
```

Positioning: place the indicator after the asset type icon, before the table name — this is the DataHub convention and matches the visual weight of the existing row layout.

### Anti-Patterns to Avoid

- **Throwing `DatasetNotFoundError` for no-fields:** The no-fields case is not a "not found" error — the dataset exists. The error message "No fields found for dataset" was a design artifact from before Phase 22 populated `OL_DATASET_FIELD`. Fix it properly; don't add a workaround.
- **Full-screen replacement for the no-lineage state:** Replacing the ReactFlow canvas entirely prevents the user from seeing the table node. The node must render — the banner is additive.
- **Fetching lineage to determine `has_lineage` on the frontend:** This would require a lineage endpoint call per table row in the Asset Browser expand — N+1 pattern. The JOIN in `list_datasets` is the correct approach.
- **Using `data.graph.nodes.length === 1` as the no-lineage signal:** A table with 30 columns will have 30 field nodes, not 1. The correct signal is `data.graph.edges.length === 0` — which is already used in `hasNoLineageData`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Informational banner styling | Custom CSS alert component | Tailwind utility classes + Lucide `Info` icon | The codebase already uses this pattern for `ProgressBanner` and the `LargeGraphWarning` inline message — stay consistent |
| `has_lineage` computation in frontend | Per-table lineage API call | SQL EXISTS subquery in `list_datasets` | Backend JOIN is O(1) per dataset row; frontend approach is O(n) API calls |
| Single-node layout positioning | Custom positioning logic | ELK isolated-grid path (already in `layoutEngine.ts`) | The isolated-grid path at `placeIsolatedGrid()` already positions standalone tables correctly |

**Key insight:** The layout engine's isolated-grid (`detectConnectedComponents` + `placeIsolatedGrid`) was built in Phase 20 specifically to handle tables with no lineage edges. It already works for standalone nodes in a multi-table database lineage view. For single-table standalone rendering (Phase 23), it is equally applicable — no new positioning logic is needed.

---

## Common Pitfalls

### Pitfall 1: Backend Returns 404 for Tables Without Fields

**What goes wrong:** `get_table_lineage_graph()` calls `get_dataset_fields()` and raises `DatasetNotFoundError` if the result is empty. The global error handler at `error_handlers.py:33` converts this to a 404 JSON response. TanStack Query treats a 404 as an error, so `useOpenLineageTableLineage` sets `error` to a truthy value. The frontend renders the `error` branch: `"Failed to load lineage: Dataset not found: No fields found for dataset"`.

**Why it happens:** The pre-Phase 22 assumption was that a dataset without fields was effectively missing. Post-Phase 22, `OL_DATASET_FIELD` is populated for all catalog tables — but any table without populated fields (e.g., a table added to Teradata after the last `populate_lineage.py` run) hits this error path.

**How to avoid:** Remove the `raise DatasetNotFoundError(f"No fields found for dataset: {dataset_id}")` and replace with an early return of valid empty `{nodes: [], edges: []}`.

**Warning signs:** A user navigating to any table in the Asset Browser and seeing "Failed to load lineage" instead of a node or informational state.

### Pitfall 2: ELK Hang on Single-Node Zero-Edge Graph

**What goes wrong:** Passing a graph with nodes but no edges to ELK with the Phase 20 hierarchical layout options causes ELK to hang indefinitely in specific configurations (FIXED_ORDER port constraints + rectpacking inner layout for single-node compound graphs).

**Why it happens:** ELK's hierarchical algorithm requires at least one edge to produce a valid layered layout. With zero edges, the algorithm enters a degenerate state depending on port constraint settings.

**How to avoid:** The early-exit gate at `LineageGraph.tsx:281-288` already guards this correctly:
```tsx
if (legacyEdges.length === 0) {
  setGraph(legacyNodes, legacyEdges);
  setStage('complete');
  return () => { cancelled = true; reset(); };
}
```
Do NOT remove or bypass this gate. The fix in Phase 23 keeps this gate intact and changes only the render branch that runs after `stage === 'complete'`.

**Warning signs:** The spinner stuck at "Calculating layout..." for a single-table zero-edge graph.

### Pitfall 3: `has_lineage` JOIN Performance on Large Datasets

**What goes wrong:** The EXISTS subquery in `list_datasets` runs once per returned row. With `limit: 500` the impact is bounded. However, if `OL_COLUMN_LINEAGE` lacks an index on `source_dataset_id` or `target_dataset_id`, each EXISTS check does a full-table scan of `OL_COLUMN_LINEAGE`.

**Why it happens:** The `setup_lineage_schema.py` script may not create indexes on the foreign key columns of `OL_COLUMN_LINEAGE`.

**How to avoid:** Verify index existence before deploying. Alternative approach if performance is unacceptable: add a `has_lineage` boolean column to `OL_DATASET` and update it during `populate_lineage.py` runs. However, this adds schema complexity and stale-data risk — prefer the JOIN approach first and optimize only if needed.

**Warning signs:** `list_datasets` response times exceeding 2-3 seconds after the fix is deployed.

### Pitfall 4: `OpenLineageDataset` Type Change Breaks TypeScript Consumers

**What goes wrong:** Adding `hasLineage?: boolean` to `OpenLineageDataset` requires no breaking changes (it is optional). However, tests that assert on full dataset objects using exact-match assertions will not break either, since the field is additive. The only risk is if any code does exhaustive object construction without the new field — TypeScript strict mode will not catch omitted optional fields.

**How to avoid:** Make `hasLineage` optional (`hasLineage?: boolean`). Use `undefined` when the backend does not return the field (backwards compatible with API responses from older endpoints that don't include it).

---

## Code Examples

Verified patterns from codebase inspection:

### Existing ELK Early-Exit Gate (DO NOT REMOVE)
```typescript
// Source: lineage-ui/src/components/domain/LineageGraph/LineageGraph.tsx:281
if (legacyEdges.length === 0) {
  setGraph(legacyNodes, legacyEdges);
  setStage('complete');
  return () => {
    cancelled = true;
    reset();
  };
}
```

### Current No-Lineage Empty State (to be replaced with banner approach)
```typescript
// Source: LineageGraph.tsx:679-706
const hasNoLineageData = data && data.graph && data.graph.edges?.length === 0;
if (hasNoLineageData) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-slate-500">
      {/* ... replaces canvas entirely */}
    </div>
  );
}
```

### Existing Error State Pattern (for reference — error vs. informational distinction)
```typescript
// Source: LineageGraph.tsx:644-650 — error state has red color + role="alert"
if (error) {
  return (
    <div className="flex items-center justify-center h-full text-red-500" role="alert">
      Failed to load lineage: {error.message}
    </div>
  );
}
```

### Existing Inline Banner Pattern (ProgressBanner — for reference)
```typescript
// Source: LineageGraph.tsx:758-764
<ProgressBanner
  message="Expanding to full depth..."
  visible={!isTableView && isFetchingFullDepth}
  stageDurations={stageDurations}
/>
```

### `list_databases` SQL Pattern (for reference — basis for `has_lineage` JOIN)
```python
# Source: dataset_repository.py:87-97
cur.execute("""
    SELECT
        TRIM(STRTOK(d."name", '.', 1)) AS database_name,
        SUM(CASE WHEN d.source_type = 'TABLE' THEN 1 ELSE 0 END) AS table_count,
        ...
    FROM OL_DATASET d
    WHERE d.namespace_id = ?
    GROUP BY 1
    ORDER BY 1
""", [namespace_id])
```

### `list_datasets` Query (to be extended with `has_lineage`)
```python
# Source: dataset_repository.py:222-242
cur.execute(f"""
    SELECT dataset_id, dataset_name, namespace_id, namespace_uri,
           description, source_type, created_at, updated_at
    FROM (
        SELECT
            d.dataset_id,
            d."name" as dataset_name,
            d.namespace_id,
            n.namespace_uri,
            d.description,
            d.source_type,
            d.created_at,
            d.updated_at,
            ROW_NUMBER() OVER (ORDER BY d."name") as rn
        FROM OL_DATASET d
        JOIN OL_NAMESPACE n ON d.namespace_id = n.namespace_id
        WHERE d.namespace_id = ?{extra_where}
    ) t
    WHERE rn > ? AND rn <= ?
""", [namespace_id] + extra_params + [offset, offset + limit])
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `DatasetNotFoundError` for no-fields | Return `{nodes:[], edges:[]}` (Phase 23) | Phase 23 | Tables without populated fields show informational state instead of error |
| Full-screen empty state replacing canvas | Inline banner above ReactFlow canvas | Phase 23 | Single-table node renders visibly; user can still interact with the graph |
| No `has_lineage` field | `has_lineage: bool` in dataset list API | Phase 23 | Users can distinguish lineage-connected vs catalog-only tables in Asset Browser |

**Deprecated/outdated:**
- Full-screen `hasNoLineageData` replacement block at `LineageGraph.tsx:679`: replace with inline banner pattern
- `raise DatasetNotFoundError(f"No fields found for dataset: {dataset_id}")` at `lineage_service.py:172`: replace with early return

---

## Open Questions

1. **OL_COLUMN_LINEAGE column names for `has_lineage` JOIN**
   - What we know: `OL_COLUMN_LINEAGE` stores column-level lineage edges. The service layer references `source_dataset` and `target_dataset` by name strings, not by ID foreign keys.
   - What's unclear: Does `OL_COLUMN_LINEAGE` store `source_dataset_id` (FK to `OL_DATASET.dataset_id`) or `source_dataset` (name string)? The BFS engine and CTE queries use dataset names, but the schema may use IDs.
   - Recommendation: Read `setup_lineage_schema.py` before writing the EXISTS subquery. If lineage is stored by name, the JOIN needs `TRIM(d."name") = TRIM(cl.source_dataset)`. If by ID, use `cl.source_dataset_id = d.dataset_id`.

2. **Whether `has_lineage` should be in `list_datasets` or `list_databases`**
   - What we know: `has_lineage` is per-table (dataset), not per-database. The `DatasetItem` component renders per-table in the expanded database view.
   - What's unclear: Whether the Phase 22 decision to show `totalCount` per database at the database level (before expand) suggests a `hasAnyLineage` boolean per database would also be useful.
   - Recommendation: Implement only per-table `has_lineage` in `list_datasets`. Per-database aggregation is not a Phase 23 requirement — defer to avoid scope creep.

3. **Whether single-node graph should show table header node or field nodes**
   - What we know: When `get_table_lineage_graph()` returns an empty nodes array (no fields), the ReactFlow canvas will render blank with only the banner. When it returns field nodes with no edges, the layout engine places them in the isolated-grid and they render as a table card.
   - What's unclear: The phase requirement says "single node card with its columns rendered" (success criterion 1). If `OL_DATASET_FIELD` is empty, there are no columns to render. Should the backend manufacture a node from `OL_DATASET` data alone?
   - Recommendation: Return an empty `{nodes: [], edges: []}` for no-fields case. The banner covers this gracefully ("No lineage connections" is still accurate). For tables with fields, the existing field-node path renders the full table card. Manufacturing a synthetic node from OL_DATASET metadata is unnecessary complexity.

---

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection: `lineage-api/services/lineage_service.py` — `get_table_lineage_graph()` behavior, `DatasetNotFoundError` at line 172
- Direct codebase inspection: `lineage-api/repositories/dataset_repository.py` — `list_datasets()` SQL, `list_databases()` SQL
- Direct codebase inspection: `lineage-ui/src/components/domain/LineageGraph/LineageGraph.tsx` — `hasNoLineageData` block lines 679-706, ELK early-exit gate lines 281-288
- Direct codebase inspection: `lineage-ui/src/utils/graph/layoutEngine.ts` — `detectConnectedComponents`, `placeIsolatedGrid`, `layoutSimpleNodes` for zero-edge handling
- Direct codebase inspection: `lineage-ui/src/components/domain/AssetBrowser/AssetBrowser.tsx` — `DatasetItem` render structure
- Direct codebase inspection: `lineage-ui/src/types/openlineage.ts` — `OpenLineageDataset` interface
- Direct codebase inspection: `lineage-api/middleware/error_handlers.py` — `DatasetNotFoundError` → 404 mapping
- Direct codebase inspection: `.planning/research/FEATURES.md` lines 62-73 — prior research on standalone rendering and `has_lineage` indicator

### Secondary (MEDIUM confidence)
- `.planning/research/FEATURES.md` dependency graph (lines 92-119) — verified against actual code structure; consistent

### Tertiary (LOW confidence)
- None — all findings based on direct codebase inspection

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies, all existing libraries verified in place
- Architecture: HIGH — change boundaries confirmed by reading actual source files; no ambiguity about where changes go
- Pitfalls: HIGH — ELK hang behavior documented in existing code comments (lines 278-283 of `LineageGraph.tsx` explicitly mention the ELK hang risk); error propagation path confirmed through middleware

**Research date:** 2026-02-23
**Valid until:** 2026-04-23 (stable codebase, 60 days)
