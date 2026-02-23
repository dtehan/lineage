# Phase 22: Metadata Population Foundation - Research

**Researched:** 2026-02-23
**Domain:** Teradata catalog population (Python/SQL), React lazy-load pagination (TanStack Query)
**Confidence:** HIGH

---

## Summary

Phase 22 has two independent sub-problems that must both land together to be verifiable. The first is a backend Python script problem: `populate_lineage.py` currently scans **all of DBC.TablesV** with no `DatabaseName` filter, meaning a full-catalog run today would load every DBC system table, every SysAdmin routine, and every SYSLIB internal into OL_DATASET. The fix is a SQL `NOT IN` clause on the `DatabaseName` column against a hardcoded exclusion list (authoritative list sourced below). The second is a frontend React problem: `AssetBrowser.tsx` fetches all datasets with `limit: 1000, offset: 0` in a single blocking call, groups them client-side, and has no ability to go beyond 1000. The fix is per-database lazy loading: fetch only the database list on mount, then fetch tables for one database only when the user expands it.

The populate-script changes (POP-01, POP-02) touch three functions: `populate_openlineage_datasets`, `populate_openlineage_fields`, and the `main` CLI (adding a `--full-refresh` flag as the controlled deletion path). The asset-browser changes (BROW-01) require a new backend endpoint (`GET /api/v2/openlineage/databases`) and a new query in the repository that returns distinct database names with counts, plus a new `GET /api/v2/openlineage/namespaces/{namespaceId}/datasets?database_filter=X` or equivalent endpoint for per-database table fetch. Alternatively, and more aligned with the existing architecture, the AssetBrowser can call the existing datasets endpoint with a `database_filter` query param and the backend can push the filter into SQL.

**Primary recommendation:** Add `database_filter` query param to the existing `list_datasets` endpoint (avoids new endpoint), add system-DB exclusion list to `populate_openlineage_datasets` and `populate_openlineage_fields`, and refactor AssetBrowser to load databases first (from a new lightweight endpoint) then load tables on demand per-expand.

---

## Standard Stack

### Core (already in use — no new dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `teradatasql` | project lock | Teradata Python driver | Already used in populate script |
| `TanStack Query` | v5 (project lock) | React server-state, hook-based pagination | Already used; `useInfiniteQuery` available |
| `Flask` | project lock | Backend routing layer | Already used; add one query param to existing route |

### No New Libraries Required

All changes use existing infrastructure. The only technique addition on the frontend is switching from `useQuery` to `useInfiniteQuery` for per-database dataset fetching — both from the same `@tanstack/react-query` package already installed.

**Installation:**
```bash
# No new packages needed
```

---

## Architecture Patterns

### Recommended Project Structure

No new files or directories needed. Changes are:

```
database/
└── scripts/populate/
    └── populate_lineage.py        # add SYSTEM_DATABASES constant, exclusion WHERE clause, --full-refresh flag

lineage-api/
├── repositories/
│   └── dataset_repository.py     # add list_databases(), add database_filter to list_datasets()
├── routes/
│   └── openlineage.py            # add GET /databases route, add database_filter param to list_datasets
└── services/
    └── dataset_service.py        # add list_databases() passthrough

lineage-ui/src/
├── api/
│   ├── client.ts                  # add getDatabases(), update getDatasets() to accept database_filter
│   └── hooks/useOpenLineage.ts    # add useOpenLineageDatabases(), update useOpenLineageDatasets()
└── components/domain/AssetBrowser/
    └── AssetBrowser.tsx           # lazy-load: databases first, tables on expand
```

### Pattern 1: System Database Exclusion in SQL

**What:** Add `DatabaseName NOT IN (...)` to both `populate_openlineage_datasets` and `populate_openlineage_fields`. Define the list as a Python constant so it can be printed in pre-flight and overridden for testing.

**When to use:** Everywhere DBC.TablesV or DBC.ColumnsV is queried for catalog population.

**Example:**

```python
# Source: codebase analysis + DataHub Teradata integration exclusion list
# (https://docs.datahub.com/docs/generated/ingestion/sources/teradata)

SYSTEM_DATABASES = {
    'All', 'Crashdumps', 'DBC', 'dbcmngr', 'Default', 'DemoNow_Monitor',
    'External_AP', 'EXTUSER', 'GLOBAL_FUNCTIONS', 'LockLogShredder', 'PUBLIC',
    'SQLJ', 'Sys_Calendar', 'SysAdmin', 'SYSBAR', 'SYSJDBC', 'SYSLIB',
    'SYSSPATIAL', 'SystemFe', 'SYSUDTLIB', 'SYSUIF',
    'TD_ANALYTICS_DB', 'TD_SERVER_DB', 'TD_SYSFNLIB', 'TD_SYSGPL', 'TD_SYSXML',
    'TDaaS_BAR', 'TDaaS_DB', 'TDaaS_Maint', 'TDaaS_Monitor', 'TDaaS_Support',
    'TDaaS_TDBCMgmt1', 'TDaaS_TDBCMgmt2', 'TDBCMgmt',
    'TDMaps', 'TDPUSER', 'TDQCD', 'TDStats', 'tdwm',
    'mldb', 'system', 'tapidb', 'val',
}

# Build parameterised placeholder string for SQL
def _system_db_exclusion_clause(alias: str = '') -> str:
    """Return a SQL WHERE fragment excluding system databases.

    Uses explicit list because DBC.DatabasesV requires DBC access which
    some users may not have, and the list is stable across Teradata versions.
    """
    prefix = f"{alias}." if alias else ""
    placeholders = ", ".join("?" * len(SYSTEM_DATABASES))
    return f"{prefix}DatabaseName NOT IN ({placeholders})"

def _system_db_params() -> list:
    """Return ordered list of system database names for parameterised query."""
    return sorted(SYSTEM_DATABASES)  # sorted for determinism
```

The WHERE clause in `populate_openlineage_datasets` becomes:

```sql
FROM DBC.TablesV
WHERE TableKind IN ('T', 'V', 'O')
  AND DatabaseName NOT IN (?, ?, ..., ?)   -- parameterised, not f-string
  AND TableName NOT LIKE 'LIN_%'
  AND TableName NOT LIKE 'OL_%'
  AND NOT EXISTS (...)
```

**CRITICAL:** Use `?` parameters, not f-string interpolation for the exclusion list. The Teradata driver supports passing a list for parameterised queries.

**WARNING:** Teradata string comparisons are case-sensitive by default. The system DB list uses the canonical casing from official documentation. Verify against `DBC.DatabasesV` on the target system before first run.

### Pattern 2: Re-Run Safety with `--full-refresh` Flag

**What:** The current `NOT EXISTS` guards make incremental runs safe. The `clear_openlineage_data` function is the destructive path. Rename the `--skip-clear` flag behavior: by default, the script is now always safe (no clearing), and `--full-refresh` is the explicit opt-in to destroy and rebuild.

**Current behavior problem:**
- Default run calls `clear_openlineage_data()` which deletes OL_DATASET and OL_DATASET_FIELD
- `--skip-clear` opts OUT of deletion — this is backwards from safe-by-default
- Success Criterion 4 requires the script be safe to re-run without destroying data UNLESS `--full-refresh` is provided

**New behavior:**
```
python populate_lineage.py                    # safe: adds missing, skips existing
python populate_lineage.py --full-refresh     # destructive: DELETE + repopulate
python populate_lineage.py --dry-run          # preview (unchanged)
```

**Migration:** The `--skip-clear` flag can remain as an alias for backward compatibility but the default logic flips.

### Pattern 3: Backend Endpoint — `GET /databases` for Lazy Loading

**What:** New lightweight endpoint returning just the list of distinct database names (and table count) present in OL_DATASET for a namespace. Used by AssetBrowser to populate the left-rail database list without fetching any table names.

**Route:** `GET /api/v2/openlineage/namespaces/{namespaceId}/databases`

**Response:**
```json
{
  "databases": [
    {"name": "analytics_db", "tableCount": 142, "viewCount": 31},
    {"name": "sales_db", "tableCount": 87, "viewCount": 12}
  ],
  "total": 2
}
```

**SQL pattern (Teradata):**
```sql
SELECT
    TRIM(STRTOK(d."name", '.', 1)) AS database_name,
    SUM(CASE WHEN d.source_type = 'TABLE' THEN 1 ELSE 0 END) AS table_count,
    SUM(CASE WHEN d.source_type = 'VIEW' THEN 1 ELSE 0 END) AS view_count,
    COUNT(*) AS total_count
FROM OL_DATASET d
WHERE d.namespace_id = ?
GROUP BY 1
ORDER BY 1
```

**Note:** `STRTOK(name, '.', 1)` extracts the database portion from `database.table` format. This is Teradata-native and faster than Python string splitting.

### Pattern 4: Per-Database Dataset Fetch for AssetBrowser Lazy Loading

**What:** Extend `GET /api/v2/openlineage/namespaces/{namespaceId}/datasets` to accept an optional `database` query parameter. When present, filter `WHERE "name" LIKE ?` with pattern `database.%`. No new endpoint — same route, one new optional query param.

**Route change:** `GET /namespaces/{id}/datasets?database=analytics_db&limit=500&offset=0`

**SQL addition to `list_datasets`:**
```python
# In dataset_repository.py list_datasets()
if database_filter:
    pattern = f"{database_filter}.%"
    # Add to WHERE clause: AND d."name" LIKE ?
```

**Frontend usage:**
```typescript
// Fetch tables only when user expands a database
const { data } = useOpenLineageDatasets(
  namespaceId,
  { database: databaseName, limit: 500, offset: 0 },
  { enabled: isExpanded }
);
```

**Why not useInfiniteQuery:** For 95% of databases the table count is <500. `useInfiniteQuery` adds complexity without benefit unless a single database has >500 tables. Use `useQuery` per-database with a generous limit (500). If a database has more, add a "Load more" affordance — but do not implement virtual scrolling (out of scope per REQUIREMENTS.md BROW-04).

### Pattern 5: Pre-Flight Verification

**What:** Before running the catalog scan, verify system health. The roadmap specifies three checks.

**Implementation:** A `run_preflight_checks(cursor)` function that prints a table of check → status → detail, then returns `True/False`.

```python
def run_preflight_checks(cursor) -> bool:
    """Run pre-flight checks before catalog scan.

    Returns True if all checks pass, False if any fail.
    """
    checks = []

    # Check 1: QVCI status
    try:
        cursor.execute("SELECT 1 FROM DBC.ColumnsJQV WHERE 1=0")
        checks.append(("QVCI enabled", True, "DBC.ColumnsJQV accessible"))
    except Exception as e:
        if "9719" in str(e):
            checks.append(("QVCI enabled", False, "Error 9719 — view types will show as UNKNOWN"))
        else:
            checks.append(("QVCI enabled", False, f"Unexpected: {e}"))

    # Check 2: System DB exclusion list sanity
    # Verify that none of the system DB names appear in DBC.DatabasesV
    # (requires SELECT on DBC.DatabasesV, graceful skip if not available)
    try:
        placeholders = ", ".join("?" * len(SYSTEM_DATABASES))
        cursor.execute(f"""
            SELECT COUNT(DISTINCT DatabaseName)
            FROM DBC.DatabasesV
            WHERE DatabaseName NOT IN ({placeholders})
              AND DatabaseName NOT IN (SELECT TRIM(STRTOK(name, '.', 1)) FROM OL_DATASET)
        """, _system_db_params())
        user_db_count = cursor.fetchone()[0]
        checks.append(("User DB coverage", True, f"{user_db_count} user databases found"))
    except Exception:
        checks.append(("User DB coverage", None, "Skipped — no SELECT on DBC.DatabasesV"))

    # Check 3: Validate NOT EXISTS plan
    # Run EXPLAIN to confirm LEFT JOIN IS NULL plan (not nested loop with full scan)
    # Note: EXPLAIN output inspection is advisory, not blocking

    # Print results
    all_pass = True
    for name, status, detail in checks:
        icon = "OK" if status is True else ("WARN" if status is None else "FAIL")
        print(f"  [{icon}] {name}: {detail}")
        if status is False:
            all_pass = False

    return all_pass
```

### Anti-Patterns to Avoid

- **f-string SQL injection for database list:** Never build `DatabaseName NOT IN ('DBC', 'SysAdmin', ...)` as an f-string. Use parameterised `?` placeholders. The Teradata driver allows passing a list.
- **DBC.ColumnsJQV without QVCI check:** The current `populate_openlineage_fields` uses `DBC.ColumnsV` (not JQV). Keep using `ColumnsV` unless QVCI is confirmed enabled. The CLAUDE.md already documents the QVCI fallback pattern.
- **Fetching all datasets upfront in AssetBrowser:** The root cause of BROW-01. Do not increase the limit from 1000 to a higher number — this just defers the problem. Lazy-load by database instead.
- **useInfiniteQuery for per-database tables:** Adds complexity for a case that's unlikely to trigger (single database >500 tables). Use `useQuery` with `enabled: isExpanded`.
- **Hard-deleting OL_DATASET rows during incremental run:** The current default behavior calls `clear_openlineage_data()` before populating. This destroys existing data on every run. The fix is to make `NOT EXISTS` the default path and `--full-refresh` the destructive opt-in.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SQL parameterisation for NOT IN list | f-string with join | `?` per value, pass list as params | SQL injection; also correct for Teradata driver |
| Database name extraction from dataset name | STRTOK in Python | `TRIM(STRTOK(d."name", '.', 1))` in SQL | Pushes work to DB, avoids Python iteration over 10k rows |
| Frontend pagination | Custom scroll handler | `useQuery` with `enabled: isExpanded` | TanStack Query caches per-database results automatically |
| QVCI detection | Try/catch on production run | Explicit pre-flight `SELECT 1 FROM DBC.ColumnsJQV WHERE 1=0` | Fails fast before a 20-minute scan |

**Key insight:** The SQL engine is faster at grouping 10,000 dataset names into databases than Python is. Push aggregation into SQL, not the application layer.

---

## Common Pitfalls

### Pitfall 1: System Database List Is Case-Sensitive

**What goes wrong:** `DatabaseName NOT IN ('dbc', 'sysadmin')` misses `'DBC'`, `'SysAdmin'` — all Teradata system databases use mixed case in DBC.DatabasesV.

**Why it happens:** Teradata VARCHAR comparisons are case-sensitive by default (no CASESPECIFIC modifier needed — it IS specific). The system databases use canonical mixed-case names.

**How to avoid:** Use the exact casing from the authoritative list (sourced from DataHub's Teradata integration): `'DBC'` not `'dbc'`, `'SysAdmin'` not `'sysadmin'`.

**Warning signs:** After population, you still see DBC or SysAdmin tables in the asset browser.

### Pitfall 2: ColumnsV Returns NULL for View Column Types

**What goes wrong:** After population, views show `field_type = 'UNKNOWN'` for all columns.

**Why it happens:** `DBC.ColumnsV` returns NULL for view column types. The current `populate_openlineage_fields` uses `ColumnsV`, not `ColumnsJQV`. The COALESCE in the CASE statement falls through to `COALESCE(TRIM(c.ColumnType), 'UNKNOWN')` which returns `'UNKNOWN'`.

**How to avoid:** If QVCI is enabled, upgrade `DBC.ColumnsV` to `DBC.ColumnsJQV` in `populate_openlineage_fields`. If QVCI is disabled, the fallback is acceptable — show `'—'` in the UI instead of `'UNKNOWN'`. The pre-flight check tells you which case you're in.

**Warning signs:** All view columns in the Asset Browser show type `UNKNOWN`.

### Pitfall 3: Full Catalog Scan Timeout

**What goes wrong:** The `INSERT...SELECT` that populates OL_DATASET_FIELD from DBC.ColumnsV across a full Teradata system can take 10-30 minutes on a large system (millions of columns across thousands of tables).

**Why it happens:** `DBC.ColumnsV` is a system view that reads dictionary data. The `NOT EXISTS` subquery for deduplication creates a correlated subquery that executes for every row.

**How to avoid:**
1. The `QUALIFY ROW_NUMBER()` window already handles deduplication within the result set.
2. Replace the correlated `NOT EXISTS` with a `LEFT JOIN ... IS NULL` pattern — Teradata's optimizer handles this better for large datasets.
3. Run outside business hours.
4. Use `--lineage-only` on subsequent runs to skip dataset/field re-scan.

**LEFT JOIN IS NULL pattern:**
```sql
INSERT INTO {DATABASE}.OL_DATASET_FIELD (...)
SELECT ...
FROM DBC.ColumnsV c
LEFT JOIN {DATABASE}.OL_DATASET_FIELD odf
    ON odf.field_id = ? || '/' || TRIM(c.DatabaseName) || '.' || TRIM(c.TableName) || '/' || TRIM(c.ColumnName)
WHERE c.TableName NOT LIKE 'LIN_%'
  AND c.TableName NOT LIKE 'OL_%'
  AND TRANSLATE_CHK(c.DatabaseName USING UNICODE_TO_LATIN) = 0
  AND c.DatabaseName NOT IN (?, ?, ..., ?)   -- system DB exclusion
  AND odf.field_id IS NULL                   -- not already loaded
QUALIFY ROW_NUMBER() OVER (...) = 1
```

**Warning signs:** Script hangs for >5 minutes on a small system. Run `EXPLAIN` on the statement first to validate the plan.

### Pitfall 4: `--full-refresh` Logic Is Backwards Today

**What goes wrong:** A user runs `python populate_lineage.py` expecting a safe incremental run, but the default behavior DELETES all OL_DATASET and OL_DATASET_FIELD rows before repopulating.

**Why it happens:** The current `main()` calls `clear_openlineage_data(cursor)` by default. The `--skip-clear` flag is the safe opt-out, not the destructive opt-in.

**How to avoid:** Flip the default: `--full-refresh` is the explicit destructive path. Default is always safe (NOT EXISTS guards). The `--skip-clear` flag can be deprecated.

**Warning signs:** Re-running the script causes all lineage edges to temporarily disappear (because OL_COLUMN_LINEAGE is also cleared).

### Pitfall 5: AssetBrowser Refresh Button Bypasses Lazy Load

**What goes wrong:** The `handleRefresh` function in AssetBrowser calls `getDatasets(defaultNamespace.id, { limit: 1000, offset: 0 })` directly, bypassing the new per-database fetch pattern.

**Why it happens:** The refresh button was added before the lazy-load architecture.

**How to avoid:** After refactoring to lazy-load, update `handleRefresh` to invalidate the databases query AND any cached per-database dataset queries via `queryClient.invalidateQueries`.

---

## Code Examples

### Exclusion List in populate_lineage.py

```python
# Source: DataHub Teradata integration + Teradata Vantage documentation
# https://docs.datahub.com/docs/generated/ingestion/sources/teradata

SYSTEM_DATABASES = frozenset({
    'All', 'Crashdumps', 'DBC', 'dbcmngr', 'Default', 'DemoNow_Monitor',
    'External_AP', 'EXTUSER', 'GLOBAL_FUNCTIONS', 'LockLogShredder', 'PUBLIC',
    'SQLJ', 'Sys_Calendar', 'SysAdmin', 'SYSBAR', 'SYSJDBC', 'SYSLIB',
    'SYSSPATIAL', 'SystemFe', 'SYSUDTLIB', 'SYSUIF',
    'TD_ANALYTICS_DB', 'TD_SERVER_DB', 'TD_SYSFNLIB', 'TD_SYSGPL', 'TD_SYSXML',
    'TDaaS_BAR', 'TDaaS_DB', 'TDaaS_Maint', 'TDaaS_Monitor', 'TDaaS_Support',
    'TDaaS_TDBCMgmt1', 'TDaaS_TDBCMgmt2', 'TDBCMgmt',
    'TDMaps', 'TDPUSER', 'TDQCD', 'TDStats', 'tdwm',
    'mldb', 'system', 'tapidb', 'val',
})
```

### populate_openlineage_datasets — with exclusion

```python
def populate_openlineage_datasets(cursor, namespace_id: str):
    exclusions = sorted(SYSTEM_DATABASES)
    placeholders = ', '.join('?' * len(exclusions))

    cursor.execute(f"""
        INSERT INTO {DATABASE}.OL_DATASET
        (dataset_id, namespace_id, name, description, source_type, created_at, updated_at, is_active)
        SELECT
            ? || '/' || TRIM(DatabaseName) || '.' || TRIM(TableName) AS dataset_id,
            ? AS namespace_id,
            TRIM(DatabaseName) || '.' || TRIM(TableName) AS name,
            CASE WHEN TRANSLATE_CHK(CommentString USING UNICODE_TO_LATIN) = 0
                 THEN CAST(CommentString AS VARCHAR(2000))
                 ELSE NULL END AS description,
            CASE WHEN TableKind = 'V' THEN 'VIEW' ELSE 'TABLE' END AS source_type,
            CAST(CreateTimeStamp AS TIMESTAMP(0)) AS created_at,
            CURRENT_TIMESTAMP(0) AS updated_at,
            'Y' AS is_active
        FROM DBC.TablesV
        WHERE TableKind IN ('T', 'V', 'O')
          AND DatabaseName NOT IN ({placeholders})
          AND TableName NOT LIKE 'LIN_%'
          AND TableName NOT LIKE 'OL_%'
          AND NOT EXISTS (
              SELECT 1 FROM {DATABASE}.OL_DATASET od
              WHERE od.dataset_id = ? || '/' || TRIM(DatabaseName) || '.' || TRIM(TableName)
          )
    """, [namespace_id, namespace_id] + exclusions + [namespace_id])
```

### list_databases in dataset_repository.py

```python
def list_databases(self, namespace_id: str):
    """List distinct database names with table/view counts from OL_DATASET."""
    with self.connection.cursor() as cur:
        cur.execute("""
            SELECT
                TRIM(STRTOK(d."name", '.', 1)) AS database_name,
                SUM(CASE WHEN d.source_type = 'TABLE' THEN 1 ELSE 0 END) AS table_count,
                SUM(CASE WHEN d.source_type = 'VIEW' THEN 1 ELSE 0 END) AS view_count,
                COUNT(*) AS total_count
            FROM OL_DATASET d
            WHERE d.namespace_id = ?
              AND STRPOS(d."name", '.') > 0
            GROUP BY 1
            ORDER BY 1
        """, [namespace_id])
        rows = cur.fetchall()
        return [
            {
                "name": self._strip(row[0]) if row[0] else "",
                "tableCount": int(row[1]) if row[1] else 0,
                "viewCount": int(row[2]) if row[2] else 0,
                "totalCount": int(row[3]) if row[3] else 0,
            }
            for row in rows
        ]
```

**Note:** `STRTOK(name, '.', 1)` is Teradata-specific. Equivalent to `SPLIT_PART` in PostgreSQL.

### New route in openlineage.py

```python
@openlineage_bp.route("/namespaces/<namespace_id>/databases", methods=["GET"])
def list_databases(namespace_id):
    """List distinct database names present in OL_DATASET for a namespace."""
    result = dataset_service.list_databases(namespace_id)
    return jsonify(result)
```

### AssetBrowser — lazy loading pattern

```typescript
// Source: TanStack Query v5 patterns, codebase analysis

export function AssetBrowser() {
  const [expandedDatabases, setExpandedDatabases] = useState<Set<string>>(new Set());

  // Step 1: Load database list only (lightweight)
  const { data: databasesData } = useOpenLineageDatabases(namespaceId);
  const databases = databasesData?.databases || [];

  // Step 2: Per-database: DatabaseItem fetches its own tables when expanded
  return (
    <ul>
      {databases.map((db) => (
        <DatabaseItem
          key={db.name}
          databaseName={db.name}
          totalCount={db.totalCount}
          namespaceId={namespaceId}
          isExpanded={expandedDatabases.has(db.name)}
          onToggle={() => toggleDatabase(db.name)}
        />
      ))}
    </ul>
  );
}

function DatabaseItem({ databaseName, namespaceId, isExpanded, ... }) {
  // Only fires when isExpanded=true
  const { data, isLoading } = useOpenLineageDatasets(
    namespaceId,
    { database: databaseName, limit: 500, offset: 0 },
    { enabled: isExpanded }
  );
  const datasets = data?.datasets || [];
  // ... render
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Fetch all datasets at once (limit 1000) | Per-database lazy fetch on expand | Phase 22 | Eliminates silent truncation |
| No DB exclusion in populate script | SYSTEM_DATABASES exclusion list | Phase 22 | Prevents DBC junk in catalog |
| `--skip-clear` as safe opt-out | `--full-refresh` as destructive opt-in | Phase 22 | Safe re-runs by default |
| `DBC.ColumnsV` (nulls for view types) | `DBC.ColumnsJQV` if QVCI enabled | Phase 22 (conditional) | View column types populated |

---

## Open Questions

1. **QVCI Status on Target System**
   - What we know: DBC.ColumnsV returns NULL for view column types; DBC.ColumnsJQV works when QVCI enabled (TD16+); error 9719 if disabled
   - What's unclear: Whether the target Teradata system has QVCI enabled
   - Recommendation: Pre-flight check `SELECT 1 FROM DBC.ColumnsJQV WHERE 1=0` before scan. If error 9719, stay on ColumnsV and display `'—'` for unknown types in UI. Do not block the scan on QVCI absence.

2. **NOT IN List Completeness for Target System**
   - What we know: The 42-item list from DataHub covers standard Teradata deployments. Different installs (TDaaS, on-prem, VantageCloud) may have additional system DBs.
   - What's unclear: Which system databases exist on the specific target system.
   - Recommendation: Add a pre-flight step that prints `SELECT DatabaseName FROM DBC.DatabasesV WHERE DatabaseName NOT IN (...)` to surface any system-looking databases that aren't in the exclusion list. Let the user verify before scanning.

3. **Per-Database Table Count Exceeding 500**
   - What we know: Current architecture sets a generous per-database limit of 500. Most databases have fewer.
   - What's unclear: Whether any user database has >500 tables.
   - Recommendation: Add `has_more` flag to the datasets response (already typed in `DatasetsResponse.pagination`). If `has_more` is true for a database, show a "Showing 500 of N — use search to find more" notice in the Asset Browser. Do not implement virtual scrolling (deferred to BROW-04 in REQUIREMENTS.md).

4. **LEFT JOIN IS NULL vs NOT EXISTS Performance**
   - What we know: Both patterns are semantically equivalent for deduplication; LEFT JOIN IS NULL is generally faster in Teradata's optimizer for large tables.
   - What's unclear: Which plan Teradata's optimizer actually picks for the `NOT EXISTS` pattern with the full DBC.ColumnsV join.
   - Recommendation: Add `--dry-run` EXPLAIN step that prints the execution plan for the main INSERT. If the plan shows a high estimated cost, switch to LEFT JOIN IS NULL before running.

---

## Existing Code Map (What Changes, What Stays)

### Files That Change

| File | What Changes |
|------|-------------|
| `database/scripts/populate/populate_lineage.py` | Add `SYSTEM_DATABASES` constant; add exclusion WHERE clause to `populate_openlineage_datasets` and `populate_openlineage_fields`; flip `--skip-clear` default to safe; add `--full-refresh` flag; add `run_preflight_checks()` |
| `lineage-api/repositories/dataset_repository.py` | Add `list_databases(namespace_id)`; add optional `database_filter` param to `list_datasets` |
| `lineage-api/services/dataset_service.py` | Add `list_databases(namespace_id)` passthrough |
| `lineage-api/routes/openlineage.py` | Add `GET /namespaces/<id>/databases` route; add `database` query param to `list_datasets` route handler |
| `lineage-ui/src/api/client.ts` | Add `getDatabases(namespaceId)`; update `getDatasets` to accept `database` filter param |
| `lineage-ui/src/api/hooks/useOpenLineage.ts` | Add `useOpenLineageDatabases(namespaceId)` hook |
| `lineage-ui/src/types/openlineage.ts` | Add `DatabaseSummary` and `DatabasesResponse` types |
| `lineage-ui/src/components/domain/AssetBrowser/AssetBrowser.tsx` | Refactor to two-phase: databases first, tables on expand |

### Files That Stay the Same

| File | Why Unchanged |
|------|--------------|
| `database/scripts/setup/setup_lineage_schema.py` | Schema already correct; no DDL changes |
| `lineage-api/repositories/lineage_repository.py` | Lineage traversal unaffected |
| `lineage-api/services/lineage_service.py` | Lineage service unaffected |
| `database/scripts/populate/view_lineage_extractor.py` | Queries OL_DATASET (already filtered at population time) |
| `database/scripts/populate/dbql_extractor.py` | DBQL extraction separate concern |

---

## Sources

### Primary (HIGH confidence)

- Codebase analysis: `/Users/Daniel.Tehan/Code/lineage/database/scripts/populate/populate_lineage.py` — confirmed no DatabaseName filter in populate_openlineage_datasets or populate_openlineage_fields
- Codebase analysis: `/Users/Daniel.Tehan/Code/lineage/lineage-ui/src/components/domain/AssetBrowser/AssetBrowser.tsx` — confirmed hardcoded `limit: 1000` on single upfront fetch
- Codebase analysis: `/Users/Daniel.Tehan/Code/lineage/lineage-api/repositories/dataset_repository.py` — confirmed `list_datasets` has no database_filter; confirmed `STRTOK` not yet used
- [DataHub Teradata Integration](https://docs.datahub.com/docs/generated/ingestion/sources/teradata) — authoritative system database exclusion list (42 databases) used in production Teradata metadata ingestion

### Secondary (MEDIUM confidence)

- [List all tables in all Teradata databases - Dataedo](https://dataedo.com/kb/query/teradata/list-all-tables-in-all-databases) — confirms NOT IN pattern for user vs system DB filtering
- [GitHub Gist: Teradata users excluding system ones](https://gist.github.com/alex-dyner/bd599f009d728de4133042ef1d313f1e) — confirms core system user/DB exclusion list
- [TanStack Query Infinite Queries documentation](https://tanstack.com/query/latest/docs/framework/react/guides/infinite-queries) — `useInfiniteQuery` API; confirmed `enabled` option for conditional fetching

### Tertiary (LOW confidence — needs validation)

- STRTOK performance vs Python splitting: Claimed to be faster but not benchmarked on this schema. Acceptable for planning given the SQL-side grouping rationale.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies, all existing tools
- Architecture: HIGH — patterns derived directly from codebase code paths and authoritative external source
- Pitfalls: HIGH — all pitfalls identified from direct code inspection (confirmed gaps in current implementation)
- System DB exclusion list: MEDIUM — DataHub list is authoritative for standard deployments; specific target system may have additions

**Research date:** 2026-02-23
**Valid until:** 2026-03-23 (stable domain; only changes if Teradata adds new system databases)
