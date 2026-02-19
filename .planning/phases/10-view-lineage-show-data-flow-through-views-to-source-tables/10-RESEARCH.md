# Phase 10: View Lineage - Research

**Researched:** 2026-02-19
**Domain:** Frontend graph visualization of view nodes in lineage paths; backend sourceType propagation to column/table lineage endpoints
**Confidence:** HIGH

## Summary

Phase 10 surfaces views as visible intermediate nodes in the lineage graph. The frontend infrastructure for displaying views already exists — `TableNodeHeader` has `AssetType` with `'view'` and renders orange borders/icons/badges; `mapTableKindToAssetType()` in `layoutEngine.ts` maps `'VIEW'` to `'view'`. The toolbar already has view filtering checkboxes. The visual styling is fully implemented and working.

The core gap is a data pipeline problem: when `lineage_service.py` builds column/table lineage graphs via `_build_node()` and `_add_lineage_results()`, it does NOT include `sourceType` in field nodes. The `dataset` object on each field node contains only `name` and `namespace` — no `sourceType`. As a result, `openLineageAdapter.ts` extracts `sourceType` from the dataset object (line 38-39) and finds nothing, so `mapTableKindToAssetType()` always receives `undefined` and defaults every node to `'table'`. Views in the lineage graph render as plain table nodes — same color, same icon — even though OL_DATASET stores `source_type = 'VIEW'` for them.

The fix is straightforward: `_build_node()` and `_add_lineage_results()` must look up `source_type` from `OL_DATASET` and include it as `sourceType` in the field node's `dataset` object. This requires `lineage_service.py` to have access to dataset metadata (source type) for every dataset that appears in a lineage path. The database lineage path already does this correctly (lines 199-332 in `lineage_service.py`), so the pattern is established. The column and table lineage paths just need the same treatment.

**Primary recommendation:** Extend `lineage_service.py`'s `_build_node()` to accept an optional `source_type` parameter and include it as `sourceType` in the node's `dataset` dict. Then populate it by calling `dataset_repo.get_dataset_metadata(dataset_name)` for datasets encountered in lineage results. Batch the lookups using an in-memory cache within each request to avoid N+1 queries.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Lineage path through views:**
- Views appear as intermediate nodes in the lineage path — not hidden or collapsed
- A view in the path looks like: Source table → View → Target table
- Lineage edges connect at the column level (not just table-to-table)
- The view card shows the columns it exposes, same as a table card

**View node content:**
- View cards display the list of columns the view exposes
- Column-level lineage edges flow in and out of view columns (same as table columns)
- No visual simplification — full column-level detail, not just a labeled box

**View as starting point:**
- When a user explores lineage from a view, both directions are shown:
  - Upstream: traces back through the view definition to source tables
  - Downstream: shows what tables/views SELECT from this view
- Same behavior as exploring from a regular table

**Nested views:**
- Lineage traces all the way to base tables — full transitive lineage
- If view A selects from view B which selects from table C, the graph shows: Table C → View B → View A (and whatever consumes View A)
- No manual click-through required — full chain rendered automatically

### Claude's Discretion

- Visual differentiation of views vs tables (label, icon, color — pick something clear but consistent with existing graph style)
- How the backend API exposes view lineage (new endpoint or extension of existing lineage endpoint)
- Loading/performance strategy for deep view chains

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React Flow (@xyflow/react) | Current (in use) | Graph visualization, node rendering | Already the graph renderer. No changes needed to React Flow itself. |
| ELKjs | Current (in use) | Automatic graph layout | Already handles view nodes identically to table nodes — no ELK changes needed. |
| Tailwind CSS | Current (in use) | View node visual styling | Orange color scheme for views already implemented in `TableNode.tsx` and `TableNodeHeader.tsx`. |
| Python Flask | Current (in use) | Backend API | `lineage_service.py` is the modification target for sourceType propagation. |
| OL_DATASET | Teradata table | `source_type` column distinguishes TABLE vs VIEW | Already populated by `populate_lineage.py`. |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| TanStack Query | Current (in use) | API data caching on frontend | No changes needed — existing `useOpenLineageTableLineage` hook will automatically pick up sourceType once backend adds it. |
| Zustand | Current (in use) | Frontend state management | `assetTypeFilter` in `useLineageStore` already supports `'view'` filtering. No changes needed. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Extending `_build_node()` with sourceType | New API endpoint for view lineage | Existing endpoints already return all needed data; new endpoint would duplicate traversal logic with no benefit. Extend existing. |
| Per-dataset `get_dataset_metadata()` call in lineage | Batch query on OL_DATASET at start of request | Batch is cleaner for performance. Single query fetches sourceType for all datasets in the graph at once. |
| In-request sourceType cache (dict) | Redis cache for sourceType | sourceType is per-request volatile metadata. A simple dict `{dataset_name: sourceType}` within the service method is sufficient. Redis would be overkill for this lookup. |

**Installation:** No new packages required. All changes are within existing code.

## Architecture Patterns

### Recommended Project Structure

The scope is minimal: two files in the backend, no new files, no frontend library changes. All frontend view rendering infrastructure already exists.

```
lineage-api/services/
└── lineage_service.py          # MODIFIED: _build_node() gets sourceType param;
                                #            _add_lineage_results() batches OL_DATASET lookup;
                                #            get_column_lineage_graph() and get_table_lineage_graph()
                                #            initialize sourceType lookup at request start

lineage-api/repositories/
└── dataset_repository.py       # POSSIBLY MODIFIED: get_dataset_with_namespace() may be extended
                                #                    to also return source_type, OR
                                #                    new get_datasets_source_types(names) batch method added

lineage-api/tests/
└── test_lineage_service.py     # NEW: unit tests for sourceType propagation through lineage nodes
```

No frontend files need modification — the visual rendering already handles views correctly given correct sourceType in the API response.

### Pattern 1: sourceType Gap — The Root Cause

**What:** `_build_node()` builds a field node dict without `sourceType`. All nodes in column/table lineage paths default to `'table'` rendering.

**Current (broken) code:**
```python
# lineage_service.py line 355-376
def _build_node(self, key: str, field_name: str, dataset_name: str, namespace: str) -> dict:
    return {
        "id": key,
        "type": "field",
        "name": field_name,
        "dataset": {
            "name": dataset_name,
            "namespace": namespace
            # MISSING: "sourceType": source_type
        }
    }
```

**What the adapter expects (openLineageAdapter.ts lines 37-39):**
```typescript
const sourceType = typeof olNode.dataset === 'object' && olNode.dataset.sourceType
  ? olNode.dataset.sourceType
  : undefined;
```

**What the layout engine does with undefined sourceType (layoutEngine.ts line 60-78):**
```typescript
function mapTableKindToAssetType(tableKind: string | undefined): AssetType {
  if (!tableKind) return 'table';  // undefined -> 'table', every time
  // ...
}
```

**Fix:** Add `"sourceType": source_type` to the `dataset` object in `_build_node()`. This flows directly through `openLineageAdapter.ts` to `mapTableKindToAssetType()` which correctly maps `"VIEW"` to `'view'`.

### Pattern 2: Batch sourceType Lookup at Request Start

**What:** Before processing lineage records, pre-fetch all `source_type` values for the datasets involved in the request.

**When to use:** In `get_column_lineage_graph()` and `get_table_lineage_graph()`. The database lineage path already uses this pattern (but per-record lookups — the batch approach is cleaner).

**Example:**
```python
def get_table_lineage_graph(self, dataset_id: str, direction: str = "both", max_depth: int = 5) -> dict:
    dataset_info = self.dataset_repo.get_dataset_with_namespace(dataset_id)
    if not dataset_info:
        raise DatasetNotFoundError(f"Dataset not found: {dataset_id}")

    dataset_name = dataset_info["name"]
    namespace_uri = dataset_info["namespace_uri"]
    source_type = dataset_info.get("source_type", "TABLE")  # requires get_dataset_with_namespace() update

    # sourceType cache: populated lazily during lineage traversal
    source_type_cache = {dataset_name: source_type}

    fields = self.dataset_repo.get_dataset_fields(dataset_id)
    nodes = {}
    edges = []

    for field_name in fields:
        root_key = f"{dataset_name}.{field_name}"
        if root_key not in nodes:
            nodes[root_key] = self._build_node(
                root_key, field_name, dataset_name, namespace_uri, source_type
            )

        if direction in ("upstream", "both"):
            records = self.lineage_repo.get_upstream_lineage(dataset_name, field_name, max_depth)
            self._add_lineage_results(records, nodes, edges, source_type_cache)

        if direction in ("downstream", "both"):
            records = self.lineage_repo.get_downstream_lineage(dataset_name, field_name, max_depth)
            self._add_lineage_results(records, nodes, edges, source_type_cache)

    return {"datasetId": dataset_id, "graph": {"nodes": list(nodes.values()), "edges": edges}}
```

**Pattern reasoning:**
- `source_type_cache` dict avoids repeated `get_dataset_metadata()` calls for the same dataset across multiple field traversals (a table with 10 columns would otherwise trigger 10 lookups per upstream dataset)
- Lazy population (on first encounter) handles unbounded traversal depths without pre-fetching all possible datasets
- Pattern already established in database lineage for `dataset_metadata` (lines 225-231 in lineage_service.py)

### Pattern 3: get_dataset_with_namespace() Extension

**What:** The `get_dataset_with_namespace()` method currently returns only `name` and `namespace_uri`. It needs to also return `source_type` for the root dataset.

**Current:**
```python
def get_dataset_with_namespace(self, dataset_id: str):
    cur.execute("""
        SELECT d."name", n.namespace_uri
        FROM OL_DATASET d
        JOIN OL_NAMESPACE n ON d.namespace_id = n.namespace_id
        WHERE d.dataset_id = ?
    """, [dataset_id])
    row = cur.fetchone()
    return {"name": ..., "namespace_uri": ...}
```

**Fix:** Add `d.source_type` to the SELECT and return it:
```python
def get_dataset_with_namespace(self, dataset_id: str):
    cur.execute("""
        SELECT d."name", n.namespace_uri, d.source_type
        FROM OL_DATASET d
        JOIN OL_NAMESPACE n ON d.namespace_id = n.namespace_id
        WHERE d.dataset_id = ?
    """, [dataset_id])
    row = cur.fetchone()
    return {
        "name": self._strip(row[0]) if row[0] else "",
        "namespace_uri": self._strip(row[1]) if row[1] else "",
        "source_type": self._strip(row[2]) if row[2] else "TABLE"
    }
```

This change is backward-compatible — callers that don't use `source_type` are unaffected.

### Pattern 4: Extended _build_node() Signature

**What:** `_build_node()` gets an optional `source_type` parameter.

**Example:**
```python
def _build_node(
    self,
    key: str,
    field_name: str,
    dataset_name: str,
    namespace: str,
    source_type: str = "TABLE"
) -> dict:
    return {
        "id": key,
        "type": "field",
        "name": field_name,
        "dataset": {
            "name": dataset_name,
            "namespace": namespace,
            "sourceType": source_type  # Frontend adapter reads this
        }
    }
```

**Pattern reasoning:**
- Default `"TABLE"` means existing callers that don't pass `source_type` continue to work correctly
- The database lineage path already populates `sourceType` in `dataset` objects (lines 256, 303, 332 in lineage_service.py) using the same field name — this makes column/table lineage consistent with database lineage

### Pattern 5: _add_lineage_results() with sourceType Cache

**What:** `_add_lineage_results()` must look up `sourceType` for source and target datasets before calling `_build_node()`.

**Example:**
```python
def _add_lineage_results(
    self,
    records: list,
    nodes: dict,
    edges: list,
    source_type_cache: dict = None
):
    if source_type_cache is None:
        source_type_cache = {}

    for record in records:
        source_key = f"{record['source_dataset']}.{record['source_field']}"
        target_key = f"{record['target_dataset']}.{record['target_field']}"

        if source_key not in nodes:
            source_type = self._get_source_type(record["source_dataset"], source_type_cache)
            nodes[source_key] = self._build_node(
                source_key, record["source_field"], record["source_dataset"],
                record["source_namespace"], source_type
            )

        if target_key not in nodes:
            target_type = self._get_source_type(record["target_dataset"], source_type_cache)
            nodes[target_key] = self._build_node(
                target_key, record["target_field"], record["target_dataset"],
                record["target_namespace"], target_type
            )

        edge = self._build_edge(source_key, target_key, record["transformation_type"])
        if not any(e["id"] == edge["id"] for e in edges):
            edges.append(edge)

def _get_source_type(self, dataset_name: str, cache: dict) -> str:
    """Lookup sourceType with in-memory cache to avoid N+1 queries."""
    if dataset_name not in cache:
        meta = self.dataset_repo.get_dataset_metadata(dataset_name)
        cache[dataset_name] = meta["sourceType"] if meta else "TABLE"
    return cache[dataset_name]
```

**Pattern reasoning:**
- `_get_source_type()` is a single-responsibility helper — the cache lookup plus DB fallback is isolated and testable
- `get_dataset_metadata()` already exists in `dataset_repository.py` (line 691) for exactly this purpose — queries `OL_DATASET` for `source_type` by dataset name
- Default `source_type_cache=None` maintains backward compatibility for callers that don't pass it (though all callers will be updated)

### Pattern 6: View Node Rendering (Already Works)

**What:** The frontend already renders view nodes correctly when `sourceType = 'VIEW'`.

**Evidence from existing code:**
- `TableNode.tsx` lines 44-65: `assetType === 'view'` → `border-orange-300` + `bg-orange-50`
- `TableNodeHeader.tsx` line 19: `'view'` → `<Eye className="text-orange-600" />`
- `TableNodeHeader.tsx` lines 41-53: `'view'` → orange "VIEW" badge
- `layoutEngine.ts` lines 60-78: `'VIEW'` → `'view'` AssetType mapping
- `Toolbar.tsx` lines 51-215: view filter checkbox already implemented

**No frontend changes required.** Once the backend includes `sourceType: "VIEW"` in field node dataset objects, views automatically render with orange borders, eye icon, and VIEW badge.

### Pattern 7: View as Starting Point (Already Works)

**What:** Navigating to a view's lineage page (e.g., `/lineage/demo_user.customer_view/_all`) works the same as navigating to a table.

**Evidence:**
- `LineageGraph.tsx` calls `useOpenLineageTableLineage(datasetId, ...)` which calls `GET /api/v2/openlineage/lineage/table/{datasetId}`
- `lineage_service.get_table_lineage_graph()` calls `get_dataset_fields()` to get all columns, then traverses lineage for each
- Views are stored in `OL_DATASET` and `OL_DATASET_FIELD` — the same tables as regular tables
- The recursive CTE in `lineage_repository.py` traverses `OL_COLUMN_LINEAGE` without filtering by source type — it sees both table and view datasets

**Conclusion:** Navigating from a view and getting both upstream (back to source tables) and downstream (to consuming tables) works without changes to the lineage traversal logic, provided `OL_COLUMN_LINEAGE` has the right edges. The only gap is `sourceType` missing from node data, which causes wrong visual rendering.

### Anti-Patterns to Avoid

- **N+1 sourceType lookups:** Calling `get_dataset_metadata()` once per lineage record without caching. Use `source_type_cache` dict. A lineage graph with 5 tables × 5 columns each would trigger 5 redundant DB queries per upstream table without caching.
- **Adding sourceType to `lineage_repository.py`:** The repository returns raw edge data from `OL_COLUMN_LINEAGE`. It does not join to `OL_DATASET`. Keep sourceType lookup in the service layer where it belongs.
- **Modifying the OL_COLUMN_LINEAGE CTE queries:** The recursive CTE is pure edge traversal. Do not join OL_DATASET in the CTE — it breaks the cycle detection path string and adds complexity. Fetch sourceType separately after traversal.
- **Adding a new API endpoint for view lineage:** Views are datasets. The existing `GET /api/v2/openlineage/lineage/table/{datasetId}` endpoint handles views if the service correctly identifies them. No new endpoint needed.
- **Changing the frontend to make a second API call for sourceType:** All sourceType data must come from the primary lineage response. Do not add a second request from the frontend.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| sourceType lookup for datasets | Custom DBC.TablesV query in lineage service | `dataset_repo.get_dataset_metadata(dataset_name)` | Already implemented at line 691. Returns `sourceType` from OL_DATASET. |
| View visual rendering | Custom view node component | Existing `TableNode.tsx` + `TableNodeHeader.tsx` with `assetType='view'` | View rendering (orange border, eye icon, VIEW badge) already implemented and tested. |
| View detection in graph | Frontend logic to detect views from naming patterns | Backend `sourceType: "VIEW"` in API response | Reliable. Reads from OL_DATASET.source_type which is populated by populate_lineage.py. |
| AssetType mapping | Custom switch statement | `mapTableKindToAssetType()` in layoutEngine.ts | Already handles 'VIEW' → 'view', 'MATERIALIZED_VIEW' → 'materialized_view'. |

**Key insight:** Phase 10 is a data pipeline fix, not a new feature build. The visual infrastructure exists completely. The gap is one field (`sourceType`) missing from the lineage service's node construction. Close the gap, views render correctly.

## Common Pitfalls

### Pitfall 1: Conflating Phase 9 (Backend Extraction) with Phase 10 (Frontend Visualization)

**What goes wrong:** Developer assumes Phase 9 (WildcardResolver view expansion) is what makes views appear in the lineage graph. It is not. Phase 9 resolves `SELECT *` wildcards during SQL parsing for lineage extraction. Phase 10 is about the API response including `sourceType` so the graph renders views differently from tables.

**Why it happens:** Both phases involve "views" — the terminology overlaps.

**How to avoid:** Phase 10's domain is strictly:
1. Backend: `lineage_service.py` must include `sourceType` in field node `dataset` objects
2. Frontend: no changes needed (already works correctly when sourceType is present)

The OL_COLUMN_LINEAGE table already has the view-through lineage edges if Phase 9 was properly applied to the lineage extraction. Phase 10 makes those edges render correctly in the UI.

**Warning signs:** Editing `wildcard_resolver.py` or `sql_parser.py` during Phase 10 — those are Phase 9 files.

### Pitfall 2: _build_node() Callers in Column Lineage Don't Have sourceType

**What goes wrong:** `get_column_lineage_graph()` calls `_add_lineage_results()` which calls `_build_node()` without sourceType. The root node for the column's table is also built without sourceType (line 83). If only `_add_lineage_results()` is fixed but not the root node construction, the starting table renders as a plain table even if it's a view.

**Why it happens:** Root node and lineage result nodes are built separately. Root node at line 83 uses `namespace_uri` from `get_dataset_with_namespace()` which doesn't currently return `source_type`.

**How to avoid:** Fix both:
1. `get_dataset_with_namespace()` returns `source_type`
2. Root node construction uses it
3. `_add_lineage_results()` uses `source_type_cache` for all traversed nodes

**Warning signs:** The starting table renders correctly but intermediate views in the path do not, or vice versa.

### Pitfall 3: source_type Values in OL_DATASET May Not Match Exactly

**What goes wrong:** OL_DATASET.source_type stores values like `'TABLE'`, `'VIEW'`, or `'MATERIALIZED VIEW'`. The frontend `mapTableKindToAssetType()` handles all these strings correctly (lines 60-78 in layoutEngine.ts). But if `populate_lineage.py` stored a different value (e.g., lowercase `'view'`), the mapping would fall through to default `'table'`.

**Why it happens:** `populate_lineage.py` determines source_type from `DBC.TablesV.TableKind`:
- `TableKind = 'V'` → `'VIEW'`
- `TableKind = 'T'` → `'TABLE'`

`mapTableKindToAssetType()` handles both `'V'` and `'VIEW'` (case-insensitive), so this is handled.

**How to avoid:** No action needed — the existing mapping already handles all expected values. But verify by checking what `OL_DATASET.source_type` actually contains for a known view in the database.

**Warning signs:** Views appear as tables in the graph despite `sourceType` being in the API response — check the actual string value being passed to `mapTableKindToAssetType()`.

### Pitfall 4: Dataset Appearing Both as Source and Target Gets Wrong sourceType on First Encounter

**What goes wrong:** `source_type_cache` is populated lazily. If a view appears as a source in the first record, its sourceType gets cached correctly. If it appears as a target first, it's also correct. But if the cache returns a stale value for a dataset that was incorrectly assumed to be 'TABLE' in an earlier call, subsequent nodes for that dataset are wrong.

**Why it happens:** Won't happen with `get_dataset_metadata()` because it queries OL_DATASET directly. It would only happen if the cache is pre-populated incorrectly.

**How to avoid:** Only populate `source_type_cache` from `get_dataset_metadata()` calls, not from assumptions. The exception is the root dataset, which is pre-populated from `get_dataset_with_namespace()` — which must return `source_type`.

**Warning signs:** Some occurrences of a view in the graph render correctly, others don't.

### Pitfall 5: Test Data Has No Views in OL_COLUMN_LINEAGE Paths

**What goes wrong:** Unit tests pass (sourceType is in the node dict), but manual testing shows views are still not visible in the graph because the test data has no lineage edges that pass through a view.

**Why it happens:** Phase 9's WildcardResolver was applied during extraction. If the test data was populated before Phase 9, it may not have view-through edges. Or the demo data may not include views in lineage paths at all.

**How to avoid:** Verify there are view-through lineage edges in OL_COLUMN_LINEAGE before testing. If not, either:
1. Re-run `populate_lineage.py` (which now uses Phase 9's view-aware WildcardResolver)
2. Or use `insert_cte_test_data.py` pattern to insert test view lineage edges manually

**Warning signs:** API response has correct `sourceType` in nodes, but no views appear as intermediate nodes in the graph (they just don't show up because the edges don't exist yet in OL_COLUMN_LINEAGE).

## Code Examples

Verified patterns from the existing codebase:

### Backend: The Complete Fix for _build_node()

```python
# lineage_service.py — updated _build_node()
def _build_node(
    self,
    key: str,
    field_name: str,
    dataset_name: str,
    namespace: str,
    source_type: str = "TABLE"
) -> dict:
    return {
        "id": key,
        "type": "field",
        "name": field_name,
        "dataset": {
            "name": dataset_name,
            "namespace": namespace,
            "sourceType": source_type  # Added
        }
    }
```

### Backend: get_dataset_with_namespace() Extension

```python
# dataset_repository.py — existing method extended
def get_dataset_with_namespace(self, dataset_id: str):
    with self.connection.cursor() as cur:
        cur.execute("""
            SELECT d."name", n.namespace_uri, d.source_type
            FROM OL_DATASET d
            JOIN OL_NAMESPACE n ON d.namespace_id = n.namespace_id
            WHERE d.dataset_id = ?
        """, [dataset_id])
        row = cur.fetchone()
        if not row:
            return None
        return {
            "name": self._strip(row[0]) if row[0] else "",
            "namespace_uri": self._strip(row[1]) if row[1] else "",
            "source_type": self._strip(row[2]) if row[2] else "TABLE"  # Added
        }
```

### Backend: sourceType Cache Helper

```python
# lineage_service.py — new helper method
def _get_source_type(self, dataset_name: str, cache: dict) -> str:
    """Look up sourceType for a dataset, caching to avoid N+1 queries."""
    if dataset_name not in cache:
        meta = self.dataset_repo.get_dataset_metadata(dataset_name)
        cache[dataset_name] = meta["sourceType"] if meta else "TABLE"
    return cache[dataset_name]
```

### Frontend: Why No Changes Are Needed

```typescript
// openLineageAdapter.ts (existing, no changes)
const sourceType = typeof olNode.dataset === 'object' && olNode.dataset.sourceType
  ? olNode.dataset.sourceType
  : undefined;
// Once backend includes "sourceType": "VIEW" in dataset object, this picks it up

// layoutEngine.ts (existing, no changes)
assetType: mapTableKindToAssetType(
  (firstColumn.metadata?.sourceType || firstColumn.metadata?.tableKind) as string | undefined
)
// mapTableKindToAssetType('VIEW') → 'view' ✓

// TableNodeHeader.tsx (existing, no changes)
// assetType === 'view' → Eye icon, orange colors, VIEW badge — already implemented
```

### Verifying the Data Pipeline

```python
# Quick verification: check what source_type values exist in OL_DATASET
# Run in lineage-api context to confirm 'VIEW' is stored (not 'view' or 'V')
# SELECT DISTINCT source_type FROM OL_DATASET ORDER BY 1
```

### Backend: Updated get_column_lineage_graph() Signature

```python
def get_column_lineage_graph(self, dataset_id, field_name, direction="both", max_depth=5):
    dataset_info = self.dataset_repo.get_dataset_with_namespace(dataset_id)
    if not dataset_info:
        raise DatasetNotFoundError(f"Dataset not found: {dataset_id}")

    dataset_name = dataset_info["name"]
    namespace_uri = dataset_info["namespace_uri"]
    source_type = dataset_info.get("source_type", "TABLE")  # NEW

    # Initialize sourceType cache with root dataset
    source_type_cache = {dataset_name: source_type}  # NEW

    nodes = {}
    edges = []

    if direction in ("upstream", "both"):
        records = self.lineage_repo.get_upstream_lineage(dataset_name, field_name, max_depth)
        self._add_lineage_results(records, nodes, edges, source_type_cache)  # passes cache

    if direction in ("downstream", "both"):
        records = self.lineage_repo.get_downstream_lineage(dataset_name, field_name, max_depth)
        self._add_lineage_results(records, nodes, edges, source_type_cache)  # passes cache

    root_key = f"{dataset_name}.{field_name}"
    if root_key not in nodes:
        nodes[root_key] = self._build_node(
            root_key, field_name, dataset_name, namespace_uri, source_type  # passes source_type
        )

    return {
        "datasetId": dataset_id,
        "fieldName": field_name,
        "graph": {"nodes": list(nodes.values()), "edges": edges}
    }
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| All lineage nodes default to TABLE rendering | Field nodes include sourceType in dataset object | Phase 10 | Views render as orange cards with eye icon and VIEW badge in lineage paths |
| Database lineage only correctly types nodes | Column and table lineage also type nodes correctly | Phase 10 | Consistent sourceType across all lineage endpoints |

**Currently correct (no change needed):**
- Database lineage (`get_database_lineage_graph`) already includes `sourceType` in `dataset` objects for all nodes — the pattern to follow
- Frontend visual rendering — TableNodeHeader, TableNode, Toolbar view filter — fully implemented since before Phase 10

**Currently broken (Phase 10 fixes):**
- Column lineage (`get_column_lineage_graph`) — `_build_node()` omits sourceType → all views render as tables
- Table lineage (`get_table_lineage_graph`) — same issue

## Open Questions

1. **Does OL_COLUMN_LINEAGE contain view-through edges for existing data?**
   - What we know: Phase 9 extended WildcardResolver to expand view wildcards during extraction. If `populate_lineage.py` was re-run after Phase 9, view-through edges should exist.
   - What's unclear: Whether the demo/test data was re-populated after Phase 9 completed.
   - Recommendation: Check `OL_COLUMN_LINEAGE` for any rows where `source_dataset` or `target_dataset` matches a known view name. If none exist, re-run `populate_lineage.py` or insert test rows.

2. **Should the sourceType cache be passed to all three lineage methods, or is a shared approach needed?**
   - What we know: `get_column_lineage_graph()` and `get_table_lineage_graph()` are separate methods, each creating their own `source_type_cache`. `get_database_lineage_graph()` already has its own inline approach.
   - What's unclear: Whether a shared dataset metadata cache across methods would provide meaningful performance benefit (it would not — each request is independent).
   - Recommendation: Per-request `source_type_cache` dict is the correct scope. No cross-request sharing needed.

3. **Are there any datasets in lineage paths that are NOT in OL_DATASET?**
   - What we know: `get_dataset_metadata()` returns `None` if the dataset_name is not in OL_DATASET. The `_get_source_type()` helper defaults to `"TABLE"` in that case.
   - What's unclear: Whether external datasets (from other Teradata instances or systems) appear in lineage paths but not in OL_DATASET.
   - Recommendation: Default to `"TABLE"` for unknown datasets — correct behavior since external datasets are physical tables. Log a debug message when defaulting.

## Sources

### Primary (HIGH confidence)

- `lineage-api/services/lineage_service.py` — All lineage graph construction code; `_build_node()`, `_add_lineage_results()`, `get_column_lineage_graph()`, `get_table_lineage_graph()`, `get_database_lineage_graph()` (lines 355-434, 96-161, 164-353)
- `lineage-api/repositories/dataset_repository.py` — `get_dataset_with_namespace()` (line 635), `get_dataset_metadata()` (line 691), `get_dataset_fields()` (line 615)
- `lineage-ui/src/utils/graph/openLineageAdapter.ts` — `convertOpenLineageNode()` showing how `sourceType` is extracted from `dataset` object (lines 37-39)
- `lineage-ui/src/utils/graph/layoutEngine.ts` — `mapTableKindToAssetType()` (lines 60-78), `transformToTableNodes()` using `firstColumn.metadata?.sourceType` (line 203)
- `lineage-ui/src/components/domain/LineageGraph/TableNode/TableNode.tsx` — View visual rendering: orange border, orange background (lines 44-65)
- `lineage-ui/src/components/domain/LineageGraph/TableNode/TableNodeHeader.tsx` — Eye icon, VIEW badge, orange header for views (lines 16-53)
- `lineage-ui/src/components/domain/LineageGraph/Toolbar.tsx` — View filter checkboxes (lines 202-215)
- `lineage-ui/src/types/openlineage.ts` — `OpenLineageNode.dataset` type includes `sourceType?: string` (line 55)

### Secondary (MEDIUM confidence)

- Phase 9 SUMMARY.md — Confirms `_column_cache` in WildcardResolver stores view-expanded columns transparently; view detection and expansion are backend-only concerns not affecting the API shape
- Phase 9 RESEARCH.md — Architecture decisions about view detection, Phase 9 scope boundary

### Tertiary (LOW confidence)

None — all findings verified directly against codebase.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — All existing in production, no new libraries
- Architecture: HIGH — Root cause (`_build_node()` missing sourceType) verified in code; fix pattern established by database lineage path in same file
- Pitfalls: HIGH — Verified by reading all relevant code paths; no speculative findings

**Research date:** 2026-02-19
**Valid until:** 2026-03-19 (30 days — stable codebase, no fast-moving dependencies)
