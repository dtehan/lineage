# Phase 24: Efficient Incremental OL Database Updates - Research

**Researched:** 2026-03-04
**Domain:** Python database population scripts, incremental ETL, watermark-based change detection, Teradata DBC views
**Confidence:** HIGH

## Summary

The populate_lineage.py script currently processes all tables, columns, views, and DBQL queries on every run. For datasets and fields (OL_DATASET, OL_DATASET_FIELD), it uses `NOT EXISTS` guards to skip already-populated rows, but it still scans all of DBC.TablesV and DBC.ColumnsV regardless of what changed. For DBQL-based lineage, it has a `--since` flag but no automatic watermark — the caller must track the timestamp externally. For view-based lineage, there is no change detection at all: every run re-extracts all views.

The archived `extract_dbql_lineage.py` contains a fully working watermark pattern using a `LIN_WATERMARK` table that was never ported to the current populate script. That prototype tracks `last_extracted_at` per source name and uses `INSERT/UPDATE` (upsert style) to maintain the watermark. This is the strongest prior art in the codebase.

The three distinct update concerns are: (1) new/changed **tables and columns** in DBC (catalog changes), (2) new/changed **view definitions** triggering lineage re-extraction, and (3) new DBQL queries within a time window. Each has a different change-detection mechanism available in Teradata's DBC views.

**Primary recommendation:** Add a lightweight `OL_POPULATE_LOG` tracking table to the existing schema and wire automatic watermark persistence into each of the three population paths (datasets, fields, view lineage, DBQL lineage). Gate each path on "what changed since last run" using Teradata's native `CreateTimeStamp`/`AlterTimeStamp` columns and the existing `--since` DBQL parameter.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| teradatasql | existing | Teradata database driver | Already in requirements.txt |
| Python stdlib: datetime | stdlib | Watermark timestamps | No new dependency needed |
| Python stdlib: json | stdlib | Optional local watermark file fallback | Avoid hard dependency on DB table |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| python-dotenv | existing | Config loading | Already used for .env |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| DB watermark table (OL_POPULATE_LOG) | File-based .watermark JSON | DB table survives across machines; file is simpler but per-machine only |
| AlterTimeStamp for table/column change detection | Full scan with NOT EXISTS | AlterTimeStamp is precise; NOT EXISTS scans everything but is safe |

**Installation:** No new packages needed.

## Architecture Patterns

### Recommended Project Structure

No new files required outside the populate scripts:

```
database/
├── scripts/
│   └── populate/
│       ├── populate_lineage.py          # Main entrypoint — add watermark wiring
│       ├── dbql_extractor.py            # Add watermark read/write methods
│       ├── view_lineage_extractor.py    # Add changed-views-only mode
│       └── watermark_store.py           # NEW: lightweight watermark read/write
│   └── setup/
│       └── setup_lineage_schema.py      # Add OL_POPULATE_LOG table DDL
```

### Pattern 1: Teradata Watermark Table (OL_POPULATE_LOG)

**What:** A single-row-per-source table tracking the last successful run timestamp and row count for each populate operation.

**When to use:** DBQL extraction, view lineage extraction, dataset/field population — any path that should skip already-processed items.

**Example:**
```sql
-- Table DDL (add to setup_lineage_schema.py)
CREATE MULTISET TABLE {DATABASE}.OL_POPULATE_LOG (
    source_name    VARCHAR(64)  NOT NULL,   -- e.g. 'DBQL', 'VIEW_LINEAGE', 'DATASETS'
    last_run_at    TIMESTAMP(0),            -- timestamp of last successful completion
    rows_processed INTEGER,                 -- rows processed in last run
    status         VARCHAR(20),             -- 'SUCCESS' | 'PARTIAL' | 'FAILED'
    updated_at     TIMESTAMP(0),
    PRIMARY KEY (source_name)
)
```

```python
# Source: archive/extract_dbql_lineage.py (adapted)
class WatermarkStore:
    """Read/write watermarks from OL_POPULATE_LOG."""

    SOURCE_DATASETS = "DATASETS"
    SOURCE_FIELDS = "FIELDS"
    SOURCE_VIEW_LINEAGE = "VIEW_LINEAGE"
    SOURCE_DBQL = "DBQL"

    def __init__(self, cursor, database: str):
        self.cursor = cursor
        self.database = database

    def get(self, source_name: str) -> Optional[datetime]:
        """Return last_run_at for source_name, or None if no record."""
        try:
            self.cursor.execute(f"""
                SELECT last_run_at
                FROM {self.database}.OL_POPULATE_LOG
                WHERE source_name = ?
            """, (source_name,))
            row = self.cursor.fetchone()
            return row[0] if row and row[0] else None
        except Exception:
            return None  # Graceful: treat as first run

    def set(self, source_name: str, rows: int, status: str = "SUCCESS"):
        """Upsert watermark to current timestamp."""
        try:
            self.cursor.execute(f"""
                UPDATE {self.database}.OL_POPULATE_LOG
                SET last_run_at = CURRENT_TIMESTAMP(0),
                    rows_processed = ?,
                    status = ?,
                    updated_at = CURRENT_TIMESTAMP(0)
                WHERE source_name = ?
            """, (rows, status, source_name))

            self.cursor.execute(f"""
                INSERT INTO {self.database}.OL_POPULATE_LOG
                (source_name, last_run_at, rows_processed, status, updated_at)
                SELECT ?, CURRENT_TIMESTAMP(0), ?, ?, CURRENT_TIMESTAMP(0)
                WHERE NOT EXISTS (
                    SELECT 1 FROM {self.database}.OL_POPULATE_LOG
                    WHERE source_name = ?
                )
            """, (source_name, rows, status, source_name))
        except Exception:
            pass  # Watermark failure must not abort the populate run
```

### Pattern 2: Dataset/Field Change Detection via DBC.TablesV AlterTimeStamp

**What:** Teradata's DBC.TablesV includes `AlterTimeStamp` and `CreateTimeStamp` columns that record when a table/view was last modified. Use these to filter to only new or changed objects since the last population run.

**When to use:** `populate_openlineage_datasets()` and `populate_openlineage_fields()` — replace the unconditional full scan.

**Example:**
```python
def populate_openlineage_datasets_incremental(cursor, namespace_id, since: datetime):
    """Only process tables/views created or altered since `since`."""
    cursor.execute(f"""
        INSERT INTO {DATABASE}.OL_DATASET
        (dataset_id, namespace_id, name, description, source_type, created_at, updated_at, is_active)
        SELECT
            ? || '/' || TRIM(DatabaseName) || '.' || TRIM(TableName) AS dataset_id,
            ? AS namespace_id,
            TRIM(DatabaseName) || '.' || TRIM(TableName) AS name,
            ... AS description,
            CASE WHEN TableKind = 'V' THEN 'VIEW' ELSE 'TABLE' END AS source_type,
            CAST(CreateTimeStamp AS TIMESTAMP(0)) AS created_at,
            CURRENT_TIMESTAMP(0) AS updated_at,
            'Y' AS is_active
        FROM DBC.TablesV
        WHERE TableKind IN ('T', 'V', 'O')
          AND (CreateTimeStamp > CAST(? AS TIMESTAMP(0))
               OR AlterTimeStamp > CAST(? AS TIMESTAMP(0)))
          AND NOT EXISTS (
              SELECT 1 FROM {DATABASE}.OL_DATASET od
              WHERE od.dataset_id = ? || '/' || TRIM(DatabaseName) || '.' || TRIM(TableName)
          )
    """, [namespace_id, namespace_id, since, since, namespace_id])
```

**For field UPDATE (column type changes):** When a table is altered (new column, changed type), the `OL_DATASET_FIELD` rows for that table need to be updated. The cleanest approach is: delete existing field rows for changed tables and re-insert them.

```python
# For tables that changed (AlterTimeStamp > last_run_at):
# 1. DELETE from OL_DATASET_FIELD WHERE dataset_id in changed_dataset_ids
# 2. Re-run the INSERT for only those datasets
```

### Pattern 3: View Lineage Change Detection

**What:** View definitions stored in DBC.TablesV.RequestText also have `AlterTimeStamp`. Only re-process views whose definition changed since last run.

**When to use:** `ViewLineageExtractor.extract_all()` — filter views to only changed ones.

**Example:**
```python
def _discover_changed_views(self, since: Optional[datetime]) -> List[Tuple[str, str]]:
    """Return only views created or altered since `since`."""
    if since is None:
        return self._discover_views()  # Full run: all views

    since_str = since.strftime('%Y-%m-%d %H:%M:%S')
    try:
        self.cursor.execute(f"""
            SELECT d.dataset_id, d.name
            FROM {self.database}.OL_DATASET d
            JOIN DBC.TablesV t
              ON UPPER(TRIM(t.DatabaseName)) || '.' || UPPER(TRIM(t.TableName))
                 = UPPER(d.name)
            WHERE d.source_type = 'VIEW'
              AND d.is_active = 'Y'
              AND (t.CreateTimeStamp > CAST('{since_str}' AS TIMESTAMP(0))
                OR t.AlterTimeStamp  > CAST('{since_str}' AS TIMESTAMP(0)))
        """)
        rows = self.cursor.fetchall()
        return [(row[0], row[1]) for row in rows]
    except Exception as e:
        logger.warning(f"Changed-view query failed: {e}, falling back to full scan")
        return self._discover_views()
```

When a view's lineage records are re-extracted, first delete the old lineage for that view:
```sql
DELETE FROM {DATABASE}.OL_COLUMN_LINEAGE
WHERE target_dataset = ? AND transformation_description = 'Derived from view definition'
```

### Pattern 4: DBQL Watermark (Automatic, No --since Needed)

**What:** The DBQLExtractor already supports `since` parameter. Wire it to the watermark store so operators don't need to pass `--since` manually.

**When to use:** `dbql_extractor.extract_lineage()` — read watermark before fetch, write watermark after successful insert.

**Example:**
```python
# In DBQLExtractor.extract_lineage():
def extract_lineage(self, since=None, full=False):
    watermark = WatermarkStore(self.cursor, DATABASE)

    if full:
        extraction_since = None
    elif since:
        extraction_since = since
    else:
        # Auto-read from watermark
        extraction_since = watermark.get(WatermarkStore.SOURCE_DBQL)
        if extraction_since is None:
            extraction_since = datetime.now() - timedelta(days=DEFAULT_LOOKBACK_DAYS)

    # ... existing extraction logic ...

    # After successful insert:
    watermark.set(WatermarkStore.SOURCE_DBQL, inserted)
    return inserted
```

### Pattern 5: Deactivating Dropped Tables/Views (Soft Delete)

**What:** Tables and views that no longer exist in DBC.TablesV should have `is_active = 'N'` in OL_DATASET rather than being deleted (to preserve lineage history).

**When to use:** End of each incremental run as a cleanup pass.

**Example:**
```sql
UPDATE {DATABASE}.OL_DATASET
SET is_active = 'N', updated_at = CURRENT_TIMESTAMP(0)
WHERE is_active = 'Y'
  AND NOT EXISTS (
      SELECT 1 FROM DBC.TablesV t
      WHERE UPPER(TRIM(t.DatabaseName)) || '.' || UPPER(TRIM(t.TableName)) = UPPER(name)
        AND t.TableKind IN ('T', 'V', 'O')
  )
```

### Anti-Patterns to Avoid

- **Unconditional full scan on every run:** The current `populate_openlineage_datasets()` scans all of DBC.TablesV with a NOT EXISTS guard. This is correct for correctness but wasteful for large catalogs. Gate with `AlterTimeStamp` instead.
- **Storing watermark in a local file:** Works per-machine only. The DB table pattern from the archive is more robust.
- **Deleting lineage on view change without tracking source:** When re-extracting view lineage after a definition change, delete only the view's own lineage records (where `target_dataset = view_name`), not all lineage.
- **Ignoring watermark failure:** Watermark read/write errors must be non-fatal. The populate run should always complete; a failed watermark just means the next run will do a full pass for that source.
- **Missing --reset-watermark flag:** Operators need a way to force a full refresh for one specific source without running `--full-refresh` on everything.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Change detection for Teradata catalog objects | Custom hash/checksum of column counts | DBC.TablesV.AlterTimeStamp | Teradata maintains this natively, zero cost |
| Duplicate lineage on re-extraction | Custom deduplication logic | Existing lineage_id MD5 + NOT EXISTS guard | Already proven in codebase |
| Upsert in Teradata (no MERGE on OL tables) | Hand-rolled UPDATE+INSERT | The UPDATE then conditional INSERT pattern | Already used in archive watermark code |
| View definition change detection | Diff of RequestText | AlterTimeStamp on DBC.TablesV | AlterTimeStamp changes whenever view DDL changes |

**Key insight:** Teradata's DBC.TablesV already tracks when objects changed (`AlterTimeStamp`). The entire catalog-level change detection problem is solved by a single WHERE clause filter.

## Common Pitfalls

### Pitfall 1: AlterTimeStamp Null for System Tables
**What goes wrong:** Some system-created tables have NULL `AlterTimeStamp`. A WHERE clause `AlterTimeStamp > ?` will silently exclude them.
**Why it happens:** System tables are never "altered" via DDL.
**How to avoid:** Use `COALESCE(AlterTimeStamp, CreateTimeStamp) > ?` or add `OR CreateTimeStamp > ?` as the incremental check always does.
**Warning signs:** First incremental run returns 0 new datasets but tables are missing from OL_DATASET.

### Pitfall 2: Watermark Written Before Commit
**What goes wrong:** If the watermark is updated before lineage rows are fully committed (or in Teradata's implicit-commit model), a crash mid-run leaves the watermark advanced but data missing.
**Why it happens:** Teradata teradatasql auto-commits each statement.
**How to avoid:** Always write the watermark after the last INSERT/UPDATE of data rows in a given path. Since Teradata auto-commits each statement, individual row-level failures are already handled — the watermark just needs to come last.

### Pitfall 3: Re-Extracting View Lineage Without Cleaning Old Records
**What goes wrong:** A view's SELECT list changes (column added/removed). Old lineage records persist alongside new ones, creating phantom lineage edges.
**Why it happens:** The existing `_insert_lineage_records` in `ViewLineageExtractor` skips duplicates but does not delete stale records from the previous extraction.
**How to avoid:** Before re-inserting lineage for a changed view, `DELETE FROM OL_COLUMN_LINEAGE WHERE target_dataset = 'db.viewname' AND transformation_description = 'Derived from view definition'`.
**Warning signs:** View lineage graph shows columns that no longer exist in the view.

### Pitfall 4: DBQL StartTime Timezone Ambiguity
**What goes wrong:** DBC.DBQLogTbl.StartTime is stored in the session's timezone. If the populate script runs in a different timezone than the Teradata server, the watermark comparison `StartTime > CAST(? AS TIMESTAMP(0))` may include duplicates or miss records.
**Why it happens:** CURRENT_TIMESTAMP(0) in the watermark UPDATE uses the server's timezone; the Python datetime.now() uses the local machine's timezone.
**How to avoid:** Always write the watermark using `CURRENT_TIMESTAMP(0)` from a Teradata SQL expression (as the archive does), not Python's `datetime.now()`. Read the watermark back as a Teradata TIMESTAMP.

### Pitfall 5: First-Run Performance on Large Catalogs
**What goes wrong:** A Teradata system with thousands of tables and millions of DBQL records will make the initial (no-watermark) populate run very slow.
**Why it happens:** First run is necessarily a full scan.
**How to avoid:** Document this as expected. Provide `--since YYYY-MM-DD` and `--reset-watermark` flags so operators can control scope. The incremental runs after the first will be fast.

### Pitfall 6: OL_POPULATE_LOG Table Not Existing (Upgrade Path)
**What goes wrong:** Existing deployments that already have the OL_* schema from Phase 22 won't have `OL_POPULATE_LOG`. Running the updated populate script fails trying to read the watermark.
**Why it happens:** `setup_lineage_schema.py` was run before this phase added the new table.
**How to avoid:** The `WatermarkStore.get()` method must catch all exceptions and return None (treat as first run). Add `OL_POPULATE_LOG` to a new migration/upgrade script or to `setup_lineage_schema.py` with a "create if not exists" guard. Include a note in the README.

## Code Examples

Verified patterns from codebase (archive/extract_dbql_lineage.py):

### Watermark Upsert (proven pattern from archive)
```python
# Source: database/archive/extract_dbql_lineage.py lines 237-266
def update_watermark(self, timestamp: datetime, row_count: int, status: str):
    """Update or insert watermark after extraction."""
    ts_str = timestamp.strftime('%Y-%m-%d %H:%M:%S')

    # Try update first (Teradata has no native UPSERT/MERGE for single rows easily)
    self.cursor.execute(f"""
        UPDATE {DB_NAME}.LIN_WATERMARK
        SET last_extracted_at = CAST(? AS TIMESTAMP(0)),
            row_count = ?,
            status = ?,
            updated_at = CURRENT_TIMESTAMP(0)
        WHERE source_name = ?
    """, (ts_str, row_count, status, WATERMARK_SOURCE))

    # Then conditional INSERT if update found nothing
    self.cursor.execute(f"""
        INSERT INTO {DB_NAME}.LIN_WATERMARK (source_name, last_extracted_at, row_count, status, updated_at)
        SELECT ?, CAST(? AS TIMESTAMP(0)), ?, ?, CURRENT_TIMESTAMP(0)
        WHERE NOT EXISTS (
            SELECT 1 FROM {DB_NAME}.LIN_WATERMARK WHERE source_name = ?
        )
    """, (WATERMARK_SOURCE, ts_str, row_count, status, WATERMARK_SOURCE))
```

### DBC.TablesV AlterTimeStamp Filter
```sql
-- Only get tables/views created or altered since last run
SELECT TRIM(DatabaseName), TRIM(TableName), TableKind, CreateTimeStamp
FROM DBC.TablesV
WHERE TableKind IN ('T', 'V', 'O')
  AND (COALESCE(AlterTimeStamp, CreateTimeStamp) > CAST('2026-02-01 00:00:00' AS TIMESTAMP(0)))
```

### Existing NOT EXISTS Guard (populate_lineage.py)
```python
# Source: database/scripts/populate/populate_lineage.py lines 101-124
# The existing dataset insert already has a NOT EXISTS guard.
# For incremental, add: AND COALESCE(AlterTimeStamp, CreateTimeStamp) > CAST(? AS TIMESTAMP(0))
# to the WHERE clause of the subquery in DBC.TablesV
```

### View Lineage Stale Record Cleanup
```python
# Before re-extracting lineage for a changed view:
cursor.execute(f"""
    DELETE FROM {database}.OL_COLUMN_LINEAGE
    WHERE target_dataset = ?
      AND transformation_description = 'Derived from view definition'
""", (f"{view_db}.{view_tbl}",))
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| LIN_WATERMARK in archived script | No automatic watermark in current populate_lineage.py | Phase 22 (OL_ schema migration) | DBQL watermark was lost during schema migration — needs to be re-added as OL_POPULATE_LOG |
| `--skip-clear` flag (deprecated) | `--full-refresh` flag | Current code | `--skip-clear` is already a no-op; incremental is the default |
| Unconditional NOT EXISTS scan | Target: AlterTimeStamp-filtered scan | This phase | Will reduce scan cost for large catalogs |

**Deprecated/outdated:**
- `LIN_WATERMARK` table name: was in the `LIN_*` schema from the archived script. New name should be `OL_POPULATE_LOG` to fit the current `OL_*` naming convention.

## Open Questions

1. **Should OL_POPULATE_LOG be in setup_lineage_schema.py (requires re-run) or a separate migration script?**
   - What we know: `setup_lineage_schema.py` drops and recreates all OL_* tables, so running it would wipe existing data.
   - What's unclear: Whether users can be expected to run setup again vs. needing a gentle migration.
   - Recommendation: Add `OL_POPULATE_LOG` to `setup_lineage_schema.py` AND provide a separate `migrate_add_populate_log.py` script that creates only this table on existing deployments.

2. **Should dropped tables trigger lineage deactivation (`is_active = 'N') on every incremental run?**
   - What we know: The soft-delete pattern (is_active='N') is established in the schema.
   - What's unclear: How expensive the "find stale datasets" query is across large catalogs.
   - Recommendation: Include the soft-delete cleanup as an optional pass with a flag `--cleanup-stale`, defaulting to enabled but skippable for speed.

3. **What is the expected cadence for running populate_lineage.py?**
   - What we know: Currently no scheduler — it's manual.
   - What's unclear: Whether daily, hourly, or per-deployment is the intended pattern.
   - Recommendation: Design the watermark to work correctly regardless of cadence. The watermark handles any gap.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Python unittest (run_tests.py orchestrator) |
| Config file | none — see `database/tests/run_tests.py` |
| Quick run command | `cd database && python tests/run_tests.py` |
| Full suite command | `cd database && python tests/run_tests.py` |

### Phase Requirements to Test Map

No formal REQ IDs were assigned for this phase. The following behaviors must be verified:

| Behavior | Test Type | Notes |
|----------|-----------|-------|
| WatermarkStore.get() returns None on first run (no table) | unit | Mock cursor, expect graceful None |
| WatermarkStore.get() returns datetime after set() | unit | Integration with real or mock DB |
| Incremental dataset populate skips unchanged tables | unit | Compare row counts before/after |
| Incremental populate processes newly created tables | integration | Requires live Teradata or fixture |
| View lineage re-extraction deletes stale records | unit | Verify DELETE before INSERT |
| DBQL extractor reads watermark automatically when `--since` not passed | unit | Mock watermark store |
| Full-refresh flag bypasses all watermarks | unit | `--full-refresh` resets state |
| `--reset-watermark` clears OL_POPULATE_LOG for named source | unit | |

### Sampling Rate
- **Per task commit:** `cd database && python tests/run_tests.py`
- **Per wave merge:** `cd database && python tests/run_tests.py`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `database/tests/test_watermark_store.py` — unit tests for WatermarkStore get/set
- [ ] `database/tests/test_incremental_populate.py` — integration tests for changed-tables detection
- [ ] `database/scripts/setup/migrate_add_populate_log.py` — migration script for existing deployments

## Sources

### Primary (HIGH confidence)
- `database/scripts/populate/populate_lineage.py` — current populate implementation, full read
- `database/scripts/populate/dbql_extractor.py` — current DBQL extractor, full read
- `database/scripts/populate/view_lineage_extractor.py` — current view extractor, full read
- `database/scripts/setup/setup_lineage_schema.py` — OL_* table DDL, full read
- `database/archive/extract_dbql_lineage.py` — watermark prototype (LIN_WATERMARK pattern), full read

### Secondary (MEDIUM confidence)
- Teradata DBC.TablesV documentation: `AlterTimeStamp` and `CreateTimeStamp` are standard Teradata system columns available on all editions
- Teradata error 2801 = duplicate key (verified in codebase — multiple files reference this)

### Tertiary (LOW confidence)
- Teradata DBC.TablesV `AlterTimeStamp` null behavior for system tables: inferred from Teradata documentation patterns, not verified on a live system in this research session

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries, all patterns from existing codebase
- Architecture: HIGH — watermark pattern proven in archive; AlterTimeStamp pattern is standard Teradata
- Pitfalls: HIGH — timezone pitfall and stale-view-lineage pitfall identified from code analysis; AlterTimeStamp null is MEDIUM

**Research date:** 2026-03-04
**Valid until:** 2026-06-04 (stable domain — Teradata DBC views are unchanged across versions)
