# Phase 20: Backend Statistics & DDL API - Research

**Researched:** 2026-02-06
**Domain:** Go/Python backend API + Teradata DBC system views for table metadata
**Confidence:** HIGH

## Summary

This phase adds two new API endpoints to the existing v2 OpenLineage API: a statistics endpoint returning table/view metadata (row count, size, owner, dates, type) and a DDL endpoint returning view definition SQL and table/column comments. Both endpoints operate on existing `datasetId` values (format: `namespace_id/database.table`) already used by the current API.

The research focused on three areas: (1) which Teradata DBC system views provide the required metadata, (2) how to extend the existing hexagonal architecture (domain entities, repository interfaces, service layer, HTTP handlers) following established patterns, and (3) the specific Teradata SQL needed for each data point. The codebase already has a well-established pattern: domain entities in `entities.go`, repository interfaces in `repository.go`, Teradata implementation in `openlineage_repo.go`, service layer in `openlineage_service.go`, DTOs in `dto.go`, and HTTP handlers in `openlineage_handlers.go`.

The key finding is that all required data is available from standard Teradata DBC views (`DBC.TablesV`, `DBC.TableSizeV`/`DBC.TableSize`, `DBC.TableStatsV`, `DBC.ColumnsJQV`) with one important nuance: the `RequestText` column in `DBC.TablesV` stores view definition SQL but is limited to 12,500 characters. For most views this is sufficient, but very large view definitions may be truncated. The `SHOW VIEW` command returns full definitions but has different result handling characteristics.

**Primary recommendation:** Extend the existing `OpenLineageRepository` interface with two new methods (`GetDatasetStatistics` and `GetDatasetDDL`), add corresponding service and handler methods, and implement using Teradata DBC view queries. Both Python server and Go server need the same endpoints.

## Standard Stack

This phase uses no new libraries. Everything needed is already in the project.

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| go-chi/chi/v5 | v5.0.11 | HTTP router | Already in use, route registration follows existing pattern |
| database/sql | stdlib | Database access | Already used by all repository implementations |
| teradatasql | (Python) | Teradata Python driver | Already in use for Python server |
| Flask | (Python) | HTTP framework | Already in use for Python server |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| stretchr/testify | v1.11.1 | Test assertions | Already in use for all Go tests |
| net/http/httptest | stdlib | HTTP testing | Already in use for handler tests |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| DBC.TablesV RequestText for DDL | SHOW VIEW/SHOW TABLE commands | SHOW returns full DDL but is harder to handle programmatically; RequestText is simpler but truncates at 12,500 chars |
| DBC.TableStatsV for row count | COUNT(*) on actual table | COUNT(*) is accurate but slow on large tables; TableStatsV uses collected statistics (fast but may be stale) |
| DBC.TableSizeV for size | DBC.TableSize (non-view) | Both work; TableSizeV is the view wrapper. Either can be used with SUM(CurrentPerm) |

**Installation:** No new packages needed.

## Architecture Patterns

### Recommended Project Structure (additions only)
```
lineage-api/
  internal/
    domain/
      entities.go          # ADD: DatasetStatistics, DatasetDDL structs
      repository.go        # ADD: GetDatasetStatistics, GetDatasetDDL to OpenLineageRepository
    application/
      dto.go               # ADD: DatasetStatisticsResponse, DatasetDDLResponse DTOs
      openlineage_service.go  # ADD: GetDatasetStatistics, GetDatasetDDL methods
    adapter/
      inbound/http/
        openlineage_handlers.go  # ADD: GetDatasetStatistics, GetDatasetDDL handlers
        router.go                # ADD: route registrations for new endpoints
      outbound/teradata/
        openlineage_repo.go      # ADD: GetDatasetStatistics, GetDatasetDDL implementations
    domain/mocks/
      repositories.go            # ADD: mock methods for new interface methods
  python_server.py               # ADD: /statistics and /ddl endpoint handlers
```

### Pattern 1: Extend Existing Repository Interface
**What:** Add new methods to the `OpenLineageRepository` interface in `domain/repository.go`, following the same `(ctx context.Context, ...) (*Type, error)` signature pattern used by all other methods.
**When to use:** Always -- this is the established pattern in this codebase.
**Example:**
```go
// Source: existing codebase pattern from repository.go
type OpenLineageRepository interface {
    // ... existing methods ...

    // Statistics operations (new)
    GetDatasetStatistics(ctx context.Context, datasetID string) (*DatasetStatistics, error)

    // DDL operations (new)
    GetDatasetDDL(ctx context.Context, datasetID string) (*DatasetDDL, error)
}
```

### Pattern 2: Dataset ID Parsing
**What:** The `datasetId` format is `namespace_id/database.table`. New endpoints receive this via URL param and must parse it to extract `database` and `table` names for DBC queries.
**When to use:** Both new endpoints need to parse the datasetId to query DBC views.
**Example:**
```go
// Parse datasetId "abc123/demo_user.MY_TABLE" into database="demo_user", table="MY_TABLE"
func parseDatasetName(datasetID string) (database, table string, err error) {
    // Find the last "/" to split namespace from name
    slashIdx := strings.LastIndex(datasetID, "/")
    if slashIdx < 0 {
        return "", "", fmt.Errorf("invalid dataset ID format: %s", datasetID)
    }
    name := datasetID[slashIdx+1:] // "demo_user.MY_TABLE"

    dotIdx := strings.Index(name, ".")
    if dotIdx < 0 {
        return "", "", fmt.Errorf("invalid dataset name format: %s", name)
    }
    return name[:dotIdx], name[dotIdx+1:], nil
}
```

### Pattern 3: Nil-Return for Not Found (existing pattern)
**What:** Repository methods return `(nil, nil)` when an entity is not found (not an error). The service layer checks for nil and the handler returns 404.
**When to use:** Always for single-entity lookups.
**Example:**
```go
// Source: existing pattern from openlineage_repo.go GetDataset
if err == sql.ErrNoRows {
    return nil, nil  // Not found, not an error
}
// Handler checks:
if stats == nil {
    respondError(w, r, http.StatusNotFound, "Dataset not found")
    return
}
```

### Pattern 4: First Verify Dataset Exists in OL_DATASET
**What:** Before querying DBC views, check that the dataset exists in OL_DATASET. This ensures consistent 404 behavior and avoids exposing DBC queries against arbitrary table names.
**When to use:** Both statistics and DDL endpoints.

### Pattern 5: Error Masking (Security - API-05)
**What:** Internal errors are logged with full details but return generic "Internal server error" to clients. Never expose SQL, table names, or connection details in error responses.
**When to use:** Always for 500 errors.
**Example:**
```go
// Source: existing pattern from openlineage_handlers.go
if err != nil {
    requestID := middleware.GetReqID(ctx)
    slog.ErrorContext(ctx, "failed to get dataset statistics",
        "request_id", requestID,
        "dataset_id", datasetID,
        "error", err,
        "stack", logging.CaptureStack(),
    )
    respondError(w, r, http.StatusInternalServerError, "Internal server error")
    return
}
```

### Anti-Patterns to Avoid
- **Querying DBC views without dataset validation:** Always verify the dataset exists in OL_DATASET first. This prevents information disclosure about arbitrary tables.
- **Returning DBC error details to client:** DBC query errors may contain table names, SQL fragments, or connection info. Always mask with generic error messages.
- **Using SELECT COUNT(*) for row count:** This is slow on large Teradata tables. Use DBC.TableStatsV instead.
- **Hardcoding database name in DBC queries:** The database and table names come from the dataset_id, not from a hardcoded `demo_user` prefix. The DBC views accept any database/table combination.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Table row count | COUNT(*) query on actual table | DBC.TableStatsV (WHERE IndexNumber = 1) | COUNT(*) full-table scans are expensive on large Teradata tables; stats are pre-collected |
| Table/view size | Custom space calculation | SUM(CurrentPerm) from DBC.TableSizeV/DBC.TableSize | Teradata tracks per-AMP space usage natively |
| View definition SQL | String reconstruction | DBC.TablesV.RequestText (WHERE TableKind='V') | Teradata stores the original CREATE VIEW statement |
| Column comments | Custom metadata table | DBC.ColumnsJQV.CommentString / DBC.ColumnsV.CommentString | Already populated by Teradata COMMENT ON statements |
| Table comments | Custom metadata table | DBC.TablesV.CommentString | Standard Teradata metadata |
| Dataset existence check | Separate DBC query | Existing OL_DATASET table lookup | Already have GetDataset in repository |

**Key insight:** All metadata is available from Teradata's built-in DBC system views. There is no need to create new metadata tables or collect metadata separately. The only custom part is the API layer that exposes this data.

## Common Pitfalls

### Pitfall 1: RequestText Truncation for Large Views
**What goes wrong:** DBC.TablesV.RequestText is limited to 12,500 characters. Very large view definitions will be truncated.
**Why it happens:** Teradata stores view DDL in a fixed-size column in the DBC catalog.
**How to avoid:** For the MVP, accept RequestText truncation and document it. If full DDL is needed later, use SHOW VIEW command. Add a `truncated` boolean field to the DDL response so the UI can indicate incomplete SQL.
**Warning signs:** View definitions with complex joins or many columns may exceed 12,500 characters.

### Pitfall 2: TableStatsV Requires Collected Statistics
**What goes wrong:** DBC.TableStatsV returns NULL or stale row counts if COLLECT STATISTICS has not been run.
**Why it happens:** Teradata statistics are not automatically maintained; they must be explicitly collected.
**How to avoid:** Handle NULL row counts gracefully in the response (return null/0, not an error). Document that row counts reflect the last statistics collection, not real-time counts.
**Warning signs:** All row counts showing 0 or NULL.

### Pitfall 3: TableSizeV May Not Include Views
**What goes wrong:** Views have no physical storage, so DBC.TableSizeV may return no rows for views.
**Why it happens:** Views are virtual objects with no CurrentPerm allocation.
**How to avoid:** Return null/0 for view size instead of erroring. The `sourceType` field (TABLE vs VIEW) tells the frontend whether to display size.
**Warning signs:** 404 or error when querying statistics for a view.

### Pitfall 4: Dataset ID Contains URL-Unsafe Characters
**What goes wrong:** The datasetId format `namespace_id/database.table` contains `/` and `.` characters. In URL paths like `/datasets/{datasetId}/statistics`, the `/` in datasetId must be handled.
**Why it happens:** Chi router's `{datasetId}` only matches a single path segment by default.
**How to avoid:** Use `{datasetId:*}` wildcard or `<path:dataset_id>` (Flask) to capture the full path including slashes. The existing codebase already uses `<path:dataset_id>` in Python and handles this in Go.
**Warning signs:** 404 errors when requesting statistics with a datasetId containing `/`.

### Pitfall 5: Teradata String Padding
**What goes wrong:** Teradata CHAR/VARCHAR values often have trailing spaces. DBC view results may include padded strings.
**Why it happens:** Teradata fixed-length CHAR columns pad with spaces.
**How to avoid:** Always TRIM() string values from DBC queries. The existing Python server already does `.strip()` on all string results. The Go side should use TRIM() in SQL or strings.TrimSpace() in Go.
**Warning signs:** JSON responses with trailing whitespace in field values.

### Pitfall 6: demo_user Hardcoding in Go Repository
**What goes wrong:** The existing Go OpenLineageRepository hardcodes `demo_user.OL_*` in all queries. The new DBC queries should NOT hardcode `demo_user` -- they query DBC views with the database/table extracted from datasetId.
**Why it happens:** The OL_* tables are in demo_user, but DBC views are system views queried with WHERE DatabaseName = ? parameters.
**How to avoid:** For DBC queries, use `DBC.TablesV` (no database prefix needed), and pass database/table names as query parameters.
**Warning signs:** DBC queries that reference `demo_user.DBC.TablesV` (wrong -- DBC is its own database).

## Code Examples

### Teradata SQL: Get Table/View Statistics
```sql
-- Source: Teradata DBC system views documentation
-- Get table metadata from DBC.TablesV
SELECT
    t.TableName,
    t.TableKind,        -- 'T' = table, 'V' = view, 'O' = object
    t.CreatorName,      -- who created it (acts as owner)
    t.CreateTimeStamp,  -- when created
    t.LastAlterTimeStamp, -- when last altered
    t.CommentString,    -- table comment
    t.RequestText       -- view definition SQL (for views)
FROM DBC.TablesV t
WHERE t.DatabaseName = ?  -- from parsed datasetId
  AND t.TableName = ?     -- from parsed datasetId
```

### Teradata SQL: Get Row Count from Statistics
```sql
-- Source: dataedo.com Teradata row count query pattern
-- Get row count from collected statistics
SELECT RowCount, LastCollectTimeStamp
FROM DBC.TableStatsV
WHERE DatabaseName = ?
  AND TableName = ?
  AND IndexNumber = 1
```

### Teradata SQL: Get Table Size
```sql
-- Source: Teradata DBC.TableSizeV documentation
-- Get total table size across all AMPs
SELECT
    SUM(CurrentPerm) AS total_size_bytes
FROM DBC.TableSizeV
WHERE DatabaseName = ?
  AND TableName = ?
```

### Teradata SQL: Get Column Comments
```sql
-- Source: Teradata DBC.ColumnsJQV documentation
-- Get column comments for a table/view
SELECT
    TRIM(ColumnName) AS column_name,
    CommentString AS column_comment
FROM DBC.ColumnsJQV
WHERE DatabaseName = ?
  AND TableName = ?
  AND CommentString IS NOT NULL
  AND TRIM(CommentString) <> ''
ORDER BY ColumnId
```

### Go: Domain Entity for Statistics
```go
// Source: follows existing entity patterns in entities.go
type DatasetStatistics struct {
    DatasetID          string     `json:"datasetId"`
    DatabaseName       string     `json:"databaseName"`
    TableName          string     `json:"tableName"`
    SourceType         string     `json:"sourceType"`          // TABLE, VIEW
    CreatorName        string     `json:"creatorName,omitempty"`
    CreateTimestamp    *time.Time `json:"createTimestamp,omitempty"`
    LastAlterTimestamp *time.Time `json:"lastAlterTimestamp,omitempty"`
    RowCount           *int64     `json:"rowCount,omitempty"`  // nil if stats not collected
    SizeBytes          *int64     `json:"sizeBytes,omitempty"` // nil for views
    TableComment       string     `json:"tableComment,omitempty"`
}
```

### Go: Domain Entity for DDL
```go
// Source: follows existing entity patterns in entities.go
type DatasetDDL struct {
    DatasetID      string            `json:"datasetId"`
    DatabaseName   string            `json:"databaseName"`
    TableName      string            `json:"tableName"`
    SourceType     string            `json:"sourceType"`     // TABLE, VIEW
    ViewSQL        string            `json:"viewSql,omitempty"` // Only for views
    Truncated      bool              `json:"truncated"`      // true if RequestText was truncated
    TableComment   string            `json:"tableComment,omitempty"`
    ColumnComments map[string]string `json:"columnComments,omitempty"` // column_name -> comment
}
```

### Go: Handler Registration (router.go addition)
```go
// Source: follows existing route pattern in router.go
r.Route("/api/v2/openlineage", func(r chi.Router) {
    // ... existing routes ...

    // Dataset metadata routes (new)
    r.Get("/datasets/{datasetId}/statistics", olHandler.GetDatasetStatistics)
    r.Get("/datasets/{datasetId}/ddl", olHandler.GetDatasetDDL)
})
```

### Python: Statistics Endpoint Pattern
```python
# Source: follows existing endpoint pattern in python_server.py
@app.route("/api/v2/openlineage/datasets/<path:dataset_id>/statistics", methods=["GET"])
def get_dataset_statistics(dataset_id):
    """Get statistics for a dataset (table/view)."""
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                # First verify dataset exists in OL_DATASET
                cur.execute("SELECT source_type FROM OL_DATASET WHERE dataset_id = ?", [dataset_id])
                row = cur.fetchone()
                if not row:
                    return jsonify({"error": "Dataset not found"}), 404

                # Parse database.table from dataset name
                name = dataset_id.split("/", 1)[1] if "/" in dataset_id else dataset_id
                db_name, table_name = name.split(".", 1)

                # Query DBC.TablesV for metadata
                # ... (see Teradata SQL examples above)
    except Exception as e:
        return jsonify({"error": "Internal server error"}), 500
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| DBC.ColumnsV for view columns | DBC.ColumnsJQV (requires QVCI) | TD16+ | ColumnsJQV returns complete column types for views; ColumnsV returns NULL for view columns |
| HELP TABLE for column info | DBC.ColumnsJQV for column metadata | TD16+ | Single query vs per-column HELP commands |
| Custom row count queries | DBC.TableStatsV | Always available | Uses pre-collected statistics, much faster than COUNT(*) |

**Deprecated/outdated:**
- DBC.ColumnsV for view column types: Returns NULL for view columns. Use DBC.ColumnsJQV with QVCI enabled.
- LIN_* tables (v1 schema): The project migrated to OL_* tables (OpenLineage-aligned). New endpoints should only reference OL_* and DBC views.

## Open Questions

1. **Chi Router Wildcard for datasetId with Slashes**
   - What we know: The Python server uses `<path:dataset_id>` to capture slashes in dataset IDs. The existing Go endpoint `r.Get("/datasets/{datasetId}", ...)` handles this somehow.
   - What's unclear: Whether Chi's `{datasetId}` naturally captures the full path with slashes, or if it needs `{datasetId:*}` wildcard syntax. The existing `/datasets/{datasetId}` route works in Go, so the same pattern should work for sub-routes.
   - Recommendation: Test with the same `{datasetId}` syntax used by the existing GetDataset route. If it fails, switch to Chi's wildcard pattern.

2. **RequestText Truncation Threshold**
   - What we know: DBC.TablesV.RequestText is VARCHAR(12500). Very large view definitions will be truncated.
   - What's unclear: Whether Teradata adds a `RequestTxtOverFlow` indicator, and what format it takes.
   - Recommendation: Check `RequestTxtOverFlow` column (mentioned in DBC.TablesV docs) to detect truncation. Set `truncated: true` in the response if overflow is detected.

3. **DBC View Access Permissions**
   - What we know: The application connects as `demo_user`. DBC views are generally accessible to all users.
   - What's unclear: Whether the `demo_user` account on ClearScape has SELECT access to DBC.TableStatsV, DBC.TableSizeV, and DBC.ColumnsJQV.
   - Recommendation: Wrap each DBC query in its own try/catch so permission errors on one view don't prevent other data from being returned. Return partial statistics rather than failing entirely.

## Sources

### Primary (HIGH confidence)
- **Existing codebase** (entities.go, repository.go, openlineage_repo.go, openlineage_handlers.go, openlineage_service.go, dto.go, router.go, python_server.py) - All architecture patterns, entity structures, and coding conventions derived from actual code inspection
- **Teradata DBC.TablesV** - [Teradata official docs](https://docs.teradata.com/r/oiS9ixs2ypIQvjTUOJfgoA/JKGDTOsfv6_gr8wswcE9eA) and [Teradata Point](https://www.teradatapoint.com/teradata/list-of-all-dbc-tables-in-teradata.htm) - Columns: DatabaseName, TableName, TableKind, CreatorName, CreateTimeStamp, LastAlterTimeStamp, CommentString, RequestText
- **Teradata DBC.TableSizeV** - [Teradata official docs](https://docs.teradata.com/r/oiS9ixs2ypIQvjTUOJfgoA/qQd_5O6fT0QrDcSfDEZj~Q) - CurrentPerm column for per-AMP table size

### Secondary (MEDIUM confidence)
- **DBC.TableStatsV for row count** - [dataedo.com](https://dataedo.com/kb/query/teradata/list-of-tables-by-the-number-of-rows) - RowCount column with IndexNumber = 1 filter, verified against multiple sources
- **DBC.ColumnsJQV for column comments** - [Teradata official docs](https://docs.teradata.com/r/Enterprise_IntelliFlex_VMware/Data-Dictionary/Views-Reference/ColumnsV-X/Example-Select-the-CommentString-Column-from-ColumnsV) - CommentString column confirmed
- **RequestText for view definitions** - [dataedo.com](https://dataedo.com/kb/query/teradata/list-views-with-their-scripts) - Confirmed RequestText stores CREATE VIEW SQL

### Tertiary (LOW confidence)
- **RequestTxtOverFlow column existence** - Mentioned in search results for DBC.TablesV but not verified in official documentation. Needs validation during implementation.
- **TableStatsV availability on ClearScape** - Some DBC views may be restricted in ClearScape Analytics environments. Needs runtime testing.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No new libraries needed; all patterns derived from existing code inspection
- Architecture: HIGH - Exact patterns visible in codebase (entities, repos, services, handlers, DTOs, mocks)
- Teradata DBC SQL: HIGH for TablesV/TableSizeV (well-documented standard views); MEDIUM for TableStatsV (requires COLLECT STATISTICS)
- Pitfalls: HIGH - Derived from Teradata documentation and known limitations (truncation, padding, stats collection)

**Research date:** 2026-02-06
**Valid until:** 2026-03-06 (stable domain -- Teradata DBC views don't change between minor releases)
