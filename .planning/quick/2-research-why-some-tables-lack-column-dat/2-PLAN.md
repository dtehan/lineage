---
phase: quick-2
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - lineage-api/services/lineage_service.py
  - lineage-api/tests/test_lineage_service.py
autonomous: true
requirements:
  - fix-external-node-column-types
must_haves:
  truths:
    - External nodes in the BFS database lineage graph have resolved columnType values (not None)
    - The fix uses a single batch query after BFS traversal (not per-node queries)
    - Internal nodes (Phase 1) are unaffected
  artifacts:
    - path: lineage-api/services/lineage_service.py
      provides: "_get_database_lineage_bfs with external field type lookup"
      contains: "_batch_resolve_external_field_metadata"
    - path: lineage-api/tests/test_lineage_service.py
      provides: "Tests for external node column type resolution"
  key_links:
    - from: "_get_database_lineage_bfs Phase 2 loop"
      to: "OL_DATASET_FIELD"
      via: "batch query after BFS loop completes"
      pattern: "external_field_keys.*OL_DATASET_FIELD"
---

<objective>
Fix missing column data types for external nodes in the BFS database lineage graph.

Purpose: External nodes (columns from outside the queried database) are added with hardcoded `columnType: None` instead of their actual types from OL_DATASET_FIELD. This means users see no type information for source/target columns that belong to other databases.

Output: `_get_database_lineage_bfs` resolves field types for external nodes using a batch query after the BFS traversal loop, mirroring the batch pattern already used for dataset metadata.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add batch external field type lookup and fix external nodes</name>
  <files>lineage-api/services/lineage_service.py, lineage-api/tests/test_lineage_service.py</files>
  <behavior>
    - Test: External node added during BFS Phase 2 gets `columnType` from OL_DATASET_FIELD (not None)
    - Test: External node `nullable` is resolved (not None) — True when DB value is 'Y', False otherwise
    - Test: Internal nodes (already set in Phase 1) are not overwritten by the external lookup
    - Test: When no external nodes exist, no extra query is issued (early return)
    - Test: Multiple external datasets are resolved in a single batch query (not N queries)
  </behavior>
  <action>
In `lineage-api/services/lineage_service.py`, modify `_get_database_lineage_bfs` (around lines 383-406):

**Step 1** — During Phase 2 BFS loop, track external field keys needing lookup. Replace the unconditional `columnType: None` block with tracking logic:

```python
# Track external fields needing metadata lookup
external_field_keys = []  # list of (key, ds_name, field_name)

for record in bfs_records:
    source_dataset = record["source_dataset"]
    source_field = record["source_field"]
    target_dataset = record["target_dataset"]
    target_field = record["target_field"]
    transformation_type = record["transformation_type"]

    source_key = f"{source_dataset}.{source_field}"
    target_key = f"{target_dataset}.{target_field}"

    for key, ds_name, field_name in [
        (source_key, source_dataset, source_field),
        (target_key, target_dataset, target_field),
    ]:
        if key not in nodes:
            meta = dataset_metadata.get(ds_name, {})
            nodes[key] = {
                "id": key,
                "type": "field",
                "name": field_name,
                "dataset": {
                    "name": ds_name,
                    "namespace": meta.get("namespace", ""),
                    "sourceType": meta.get("sourceType", "TABLE"),
                },
                "metadata": {
                    "columnType": None,
                    "nullable": None
                }
            }
            external_field_keys.append((key, ds_name, field_name))

    edge = self._build_edge(source_key, target_key, transformation_type)
    edges.append(edge)
```

**Step 2** — After the BFS loop (before `return`), batch-resolve external field types:

```python
# Batch-resolve column types for external nodes
if external_field_keys:
    external_field_meta = self._batch_resolve_external_field_metadata(external_field_keys)
    for key, field_type, nullable in external_field_meta:
        if key in nodes:
            nodes[key]["metadata"]["columnType"] = field_type
            nodes[key]["metadata"]["nullable"] = nullable
```

**Step 3** — Add `_batch_resolve_external_field_metadata` method to `LineageService` (after `_batch_resolve_dataset_metadata`):

```python
def _batch_resolve_external_field_metadata(self, field_keys: list) -> list:
    """Resolve field_type and nullable for external fields in a single batch query.

    Args:
        field_keys: list of (key, dataset_name, field_name) tuples

    Returns:
        list of (key, field_type, nullable_bool) tuples
    """
    if not field_keys:
        return []

    # Build lookup: (dataset_name, field_name) -> key
    lookup = {(ds_name, field_name): key for key, ds_name, field_name in field_keys}

    # Get unique dataset names to query OL_DATASET for their IDs
    dataset_names = list({ds_name for _, ds_name, _ in field_keys})
    ds_placeholders = ",".join("?" * len(dataset_names))

    results = []
    with self.dataset_repo.connection.cursor() as cur:
        cur.execute(f"""
            SELECT d.dataset_id, TRIM(d."name")
            FROM OL_DATASET d
            WHERE TRIM(d."name") IN ({ds_placeholders})
        """, dataset_names)

        dataset_id_map = {}  # dataset_name -> dataset_id
        for row in cur.fetchall():
            ds_id = self.dataset_repo._strip(row[0]) if row[0] else ""
            ds_name = self.dataset_repo._strip(row[1]) if row[1] else ""
            dataset_id_map[ds_name] = ds_id

        if not dataset_id_map:
            return []

        dataset_ids = list(dataset_id_map.values())
        field_placeholders = ",".join("?" * len(dataset_ids))
        cur.execute(f"""
            SELECT d."name", f.field_name, f.field_type, f.nullable
            FROM OL_DATASET_FIELD f
            JOIN OL_DATASET d ON f.dataset_id = d.dataset_id
            WHERE f.dataset_id IN ({field_placeholders})
        """, dataset_ids)

        for row in cur.fetchall():
            ds_name = self.dataset_repo._strip(row[0]) if row[0] else ""
            field_name = self.dataset_repo._strip(row[1]) if row[1] else ""
            field_type = self.dataset_repo._strip(row[2]) if row[2] else None
            nullable_raw = self.dataset_repo._strip(row[3]) if row[3] else None
            nullable = nullable_raw == 'Y' if nullable_raw else None

            key = lookup.get((ds_name, field_name))
            if key:
                results.append((key, field_type, nullable))

    return results
```

**Tests** — Add a new `TestDatabaseLineageBfsExternalNodes` test class in `lineage-api/tests/test_lineage_service.py`. Mock `self.dataset_repo.connection.cursor()` using `MagicMock`. Test cases:
- `test_external_node_gets_column_type`: BFS record with one external field → node has non-None columnType
- `test_internal_node_not_overwritten`: Node already in `nodes` from Phase 1 → not added to `external_field_keys`
- `test_no_query_when_no_external_fields`: `external_field_keys` empty → `_batch_resolve_external_field_metadata` returns []
- `test_nullable_resolved_correctly`: DB returns 'Y' → nullable=True, 'N' → nullable=False

Unit-test `_batch_resolve_external_field_metadata` directly against the mock cursor, verifying the returned (key, field_type, nullable) tuples.
  </action>
  <verify>
    <automated>cd /Users/Daniel.Tehan/Code/lineage/lineage-api && python tests/run_api_tests.py 2>&1 | tail -20</automated>
  </verify>
  <done>All existing API tests pass. New tests for external node column type resolution pass. `_batch_resolve_external_field_metadata` exists in lineage_service.py. External nodes in BFS results have columnType populated from OL_DATASET_FIELD instead of hardcoded None.</done>
</task>

</tasks>

<verification>
Run the full API test suite: `cd /Users/Daniel.Tehan/Code/lineage/lineage-api && python tests/run_api_tests.py`

All 20+ tests pass. The new test class `TestDatabaseLineageBfsExternalNodes` passes. No regressions.
</verification>

<success_criteria>
- `_get_database_lineage_bfs` resolves `columnType` and `nullable` for all external nodes
- Resolution uses a single batch query (not per-node), consistent with the existing batch pattern for dataset metadata
- Internal (Phase 1) nodes are unaffected
- All API tests pass
</success_criteria>

<output>
After completion, create `.planning/quick/2-research-why-some-tables-lack-column-dat/2-SUMMARY.md`
</output>
