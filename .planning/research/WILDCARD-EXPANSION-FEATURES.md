# Feature Research: SQL Wildcard Expansion for Lineage Extraction

**Domain:** Column-level lineage extraction from SQL queries
**Researched:** 2026-02-18
**Confidence:** HIGH

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = lineage extraction feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Simple SELECT * expansion | Industry standard - all lineage tools handle this | MEDIUM | Requires schema lookup from OL_DATASET_FIELD. Position-based matching for INSERT INTO target columns. |
| INSERT INTO...SELECT * | Core SQL pattern for data movement | MEDIUM | Must match source columns to target by ordinal position (not name). Standard SQL behavior. |
| CREATE TABLE AS SELECT * (CTAS) | Common DDL pattern | MEDIUM | Target column names derived from source (includes aliases). Simpler than INSERT as target schema defined by query. |
| Qualified wildcards (t.* or table.*) | Needed for multi-table queries | MEDIUM-HIGH | Requires table alias resolution (already exists in TeradataSQLParser._table_aliases). Must differentiate t1.* from t2.* in same query. |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required, but valuable.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Confidence scoring for wildcards | Flags uncertainty in lineage | LOW | Current code has CONFIDENCE_STAR = 0.70. Lower than direct references (0.95) signals approximation. |
| Schema evolution warnings | Alerts when source table structure changes | MEDIUM | Track when column count/order differs from last extraction. Critical for maintaining accuracy over time. |
| Wildcard expansion auditing | Shows which wildcards were expanded and when | LOW | Log wildcard expansions with timestamp. Helps debug lineage gaps when schemas change. |
| Partial wildcard failures | Continue processing when some wildcards can't expand | MEDIUM | Graceful degradation - extract what's possible, log failures. Better than all-or-nothing. |
| SELECT * EXCEPT support | BigQuery-specific syntax gaining adoption | MEDIUM-HIGH | Not standard SQL or native Teradata. Would require custom sqlglot AST handling. Differentiator if users migrate from BigQuery. |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Real-time wildcard expansion during query execution | "Match exactly what database sees" | Requires access to live schema during DBQL extraction. Adds latency, external dependency. Schema may have changed since query ran. | Use snapshot of schema from OL_DATASET_FIELD at extraction time. Flag when schema timestamp differs from query timestamp. |
| Auto-fix column mismatches | "Automatically handle schema drift" | Guessing column mappings leads to incorrect lineage. False confidence worse than acknowledged gaps. | Explicit confidence scoring + warnings. Let users investigate mismatches manually. |
| Wildcard expansion without schema metadata | "Work without full metadata" | Impossible to accurately expand * without knowing source columns. Results in placeholder lineage that misleads users. | Require metadata population first. Clear error: "Run populate_test_metadata.py before DBQL extraction." |
| Name-based column matching for INSERT INTO | "More intuitive than position-based" | Violates SQL standard (ordinal position matching). Only DuckDB supports BY NAME modifier. Creates incorrect lineage in standard SQL. | Follow SQL standard: position-based matching. Document this clearly in logs/warnings. |

## Feature Dependencies

```
Schema Metadata (OL_DATASET_FIELD populated)
    └──requires──> Simple SELECT * expansion
                       ├──requires──> INSERT INTO...SELECT * (ordinal matching)
                       ├──requires──> CREATE TABLE AS SELECT * (name derivation)
                       └──requires──> Qualified wildcards (t.*)
                                          └──enhances──> Multi-table query support

Table Alias Resolution (_table_aliases)
    └──requires──> Qualified wildcards (t.*)

Confidence Scoring Framework (existing)
    └──enhances──> All wildcard features
                       └──requires──> Schema Evolution Warnings
```

### Dependency Notes

- **Schema Metadata required for ALL wildcard expansion**: Cannot expand * without knowing source table columns. OL_DATASET_FIELD must be populated via `populate_lineage.py` or `populate_test_metadata.py` before DBQL extraction runs.

- **Qualified wildcards depend on table alias resolution**: Already implemented in `TeradataSQLParser._build_table_aliases()`. Extends naturally from existing functionality.

- **Ordinal position matching for INSERT INTO**: SQL standard behavior (ANSI/ISO SQL). Values matched left-to-right by position, NOT by name. Critical for correctness.

- **Schema Evolution Warnings enhance confidence scoring**: When source table has N columns but wildcard expected M columns, flag with lower confidence (e.g., 0.50 instead of 0.70).

- **SELECT * EXCEPT conflicts with standard SQL**: BigQuery-specific extension. Not in ANSI SQL or Teradata. Would require custom parsing logic separate from main wildcard expansion.

## MVP Definition

### Launch With (v1)

Minimum viable wildcard support — what's needed to handle common DBQL patterns.

- [x] **Schema metadata prerequisite** — OL_DATASET_FIELD must be populated before wildcard expansion. Clear error message if missing.
- [ ] **Simple SELECT * expansion** — Expand * to column list from OL_DATASET_FIELD for single-table queries.
- [ ] **INSERT INTO...SELECT * ordinal matching** — Match source columns to target by position (1st to 1st, 2nd to 2nd, etc.).
- [ ] **CREATE TABLE AS SELECT * name derivation** — Target columns inherit source column names (or aliases if present).
- [ ] **Confidence scoring** — Use CONFIDENCE_STAR (0.70) for all wildcard-expanded records.

**Rationale**: These four patterns cover 80%+ of wildcard usage in production SQL. Ordinal matching is non-negotiable (SQL standard). Confidence scoring signals approximation to users.

### Add After Validation (v1.x)

Features to add once core wildcard expansion is working.

- [ ] **Qualified wildcards (t.*)** — Expand table-specific wildcards in multi-table queries. Trigger: users report missing lineage for JOIN queries with t1.*, t2.*.
- [ ] **Schema evolution warnings** — Detect when source table column count changed since last extraction. Trigger: user reports lineage inaccuracies after schema changes.
- [ ] **Wildcard expansion auditing** — Log each wildcard expansion (source table, column count, timestamp). Trigger: users need debugging info for lineage gaps.
- [ ] **Partial failure handling** — Continue extraction when some wildcards fail to expand. Trigger: DBQL extraction fails completely due to single missing table metadata.

**Rationale**: These enhance robustness but aren't required for basic functionality. Add based on production feedback.

### Future Consideration (v2+)

Features to defer until product-market fit is established.

- [ ] **SELECT * EXCEPT support** — BigQuery syntax for excluding columns from wildcard. Why defer: Not standard SQL or Teradata. Niche use case. High implementation complexity (custom AST handling).
- [ ] **Cross-database wildcard resolution** — Expand * from tables in different databases/schemas. Why defer: Requires metadata from multiple namespaces. Edge case (most queries single-database).
- [ ] **Historical schema reconstruction** — Look back to schema state when query actually ran. Why defer: Requires schema versioning system. Complex. Current approach (snapshot at extraction time) sufficient for most use cases.

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Simple SELECT * expansion | HIGH | MEDIUM | P1 |
| INSERT INTO...SELECT * ordinal matching | HIGH | MEDIUM | P1 |
| CTAS name derivation | HIGH | LOW | P1 |
| Confidence scoring | MEDIUM | LOW | P1 |
| Schema metadata prerequisite | HIGH | LOW | P1 |
| Qualified wildcards (t.*) | MEDIUM | MEDIUM | P2 |
| Schema evolution warnings | MEDIUM | MEDIUM | P2 |
| Wildcard expansion auditing | LOW | LOW | P2 |
| Partial failure handling | MEDIUM | MEDIUM | P2 |
| SELECT * EXCEPT | LOW | HIGH | P3 |
| Cross-database wildcards | LOW | HIGH | P3 |
| Historical schema reconstruction | LOW | HIGH | P3 |

**Priority key:**
- P1: Must have for launch (v1) — Core wildcard functionality
- P2: Should have, add when possible (v1.x) — Robustness enhancements
- P3: Nice to have, future consideration (v2+) — Advanced/niche features

## Wildcard Pattern Categories

### Category 1: Simple Wildcards (Table Stakes)

**Pattern**: `SELECT * FROM table`

**Behavior**:
- Expands to all columns from source table in ordinal order
- Column list retrieved from OL_DATASET_FIELD WHERE dataset_id = source_table
- ORDER BY ordinal_position ASC

**Implementation**:
```python
# When encountering exp.Star in _extract_select_columns():
if isinstance(expr, exp.Star):
    # Query OL_DATASET_FIELD for source table columns
    source_columns = self._expand_star_from_schema(source_table)
    for col in source_columns:
        columns.append(ColumnReference(
            database=col['database'],
            table=col['table'],
            column=col['column_name'],
            is_expression=False
        ))
```

**Edge cases**:
- Source table not found in OL_DATASET_FIELD → Log error, skip wildcard (partial failure)
- Source table has 0 columns → Warning (schema issue)
- Source table metadata stale → Use available metadata, flag with lower confidence

### Category 2: Qualified Wildcards (Advanced)

**Pattern**: `SELECT t1.*, t2.* FROM table1 t1 JOIN table2 t2 ON ...`

**Behavior**:
- Each qualified wildcard expands to columns from specific table
- Must resolve table alias to actual table name via _table_aliases
- Preserves order: t1.* expands first, then t2.*

**Implementation**:
```python
if isinstance(expr, exp.Star):
    # Check if qualified (has table reference)
    if hasattr(expr, 'table') and expr.table:
        # Resolve alias to actual table
        db, tbl = self._resolve_table_alias(expr.table)
        source_columns = self._expand_star_from_schema(f"{db}.{tbl}")
    else:
        # Unqualified * in multi-table query - ambiguous
        # Try to expand all tables in FROM clause
        for alias, (db, tbl) in self._table_aliases.items():
            source_columns.extend(self._expand_star_from_schema(f"{db}.{tbl}"))
```

**Edge cases**:
- Unqualified * in multi-table query → Expand all tables (SQL standard behavior)
- Alias doesn't match any table → Error (SQL would fail)
- Same table aliased twice (t1, t2 both point to same table) → Expand separately (columns duplicated)

### Category 3: Wildcards in INSERT INTO (Critical for Correctness)

**Pattern**: `INSERT INTO target_table SELECT * FROM source_table`

**Behavior**:
- Source columns matched to target columns by ORDINAL POSITION (NOT by name)
- 1st source column → 1st target column, 2nd → 2nd, etc.
- If explicit target columns: `INSERT INTO target (col3, col1) SELECT *` → 1st source → col3, 2nd source → col1

**Implementation**:
```python
# In _extract_insert_lineage():
source_columns = self._extract_select_columns(select_expr)  # Includes expanded *

# Get target columns (if specified)
if target_columns_explicit:
    # Match by position to explicit target list
    for i, source_col in enumerate(source_columns):
        if i < len(target_columns_explicit):
            target_col = target_columns_explicit[i]
            # Create lineage record
else:
    # No explicit target columns - match to target table schema
    target_schema = self._get_table_schema(target_table)
    for i, source_col in enumerate(source_columns):
        if i < len(target_schema):
            target_col = target_schema[i]['column_name']
            # Create lineage record
```

**Edge cases**:
- Source column count ≠ target column count → Error (SQL would fail). Log as FAILED extraction.
- Source column types incompatible with target → Not our concern (SQL execution issue). Extract lineage anyway.
- Target table not in OL_DATASET_FIELD → Error, cannot determine target columns

### Category 4: Wildcards in CTAS (Simpler than INSERT)

**Pattern**: `CREATE TABLE target AS SELECT * FROM source`

**Behavior**:
- Target columns inherit source column names (or aliases if present)
- Target schema automatically matches source schema
- No ordinal position issues - column names preserved

**Implementation**:
```python
# In _extract_ctas_lineage():
source_columns = self._extract_select_columns(select_expr)  # Includes expanded *

for source_col in source_columns:
    # Target column name = source column name (or alias)
    target_col_name = source_col.alias or source_col.column

    lineage.append(ColumnLineage(
        source_database=source_col.database,
        source_table=source_col.table,
        source_column=source_col.column,
        target_database=target_db,
        target_table=target_tbl,
        target_column=target_col_name,
        transformation_type="DIRECT",
        confidence_score=CONFIDENCE_STAR  # 0.70
    ))
```

**Edge cases**:
- SELECT * with aliases: `CREATE TABLE t AS SELECT col1 AS c1, * FROM source` → c1 comes first, then all columns from source
- Column name conflicts → Not our concern (database handles). Extract lineage with source names.

### Category 5: SELECT * EXCEPT (BigQuery-specific, P3)

**Pattern**: `SELECT * EXCEPT (col1, col2) FROM table`

**Behavior**:
- Expands to all columns EXCEPT explicitly excluded ones
- BigQuery extension (not ANSI SQL or Teradata)
- Would require custom sqlglot AST handling

**Implementation**: Deferred to v2+. Not critical for Teradata lineage extraction.

**Notes**:
- sqlglot may not parse EXCEPT clause correctly for Teradata dialect
- Would need to check if `exp.Star` has an `except` attribute
- Low priority - users can work around with explicit column lists

## Schema Metadata Requirements

All wildcard expansion depends on accurate schema metadata in OL_DATASET_FIELD.

### Prerequisite Checks

Before attempting wildcard expansion, verify:

1. **OL_DATASET_FIELD populated**: Check table has rows for source tables
2. **Schema timestamp**: When was metadata last updated? If > 30 days old, warn user
3. **Column count > 0**: Tables should have columns (0 = schema extraction issue)

### Error Handling

| Scenario | Behavior | User Message |
|----------|----------|--------------|
| OL_DATASET_FIELD empty | Skip wildcard expansion | "Schema metadata not found. Run populate_test_metadata.py first." |
| Source table not in schema | Skip this wildcard | "Table demo_user.source_table not in metadata. Lineage incomplete." |
| Schema timestamp stale | Continue with warning | "Schema metadata is 45 days old. Lineage may be inaccurate if table structure changed." |
| Column count mismatch | Lower confidence score | "Expected 5 columns, found 7. Schema may have evolved. Confidence: 0.50" |

### Schema Lookup Query

```sql
-- Retrieve columns for wildcard expansion
SELECT
    field_name,
    ordinal_position,
    field_type
FROM OL_DATASET_FIELD
WHERE dataset_id = ?  -- e.g., 'namespace_id/database.table'
ORDER BY ordinal_position ASC
```

**Performance**: Indexed on dataset_id (primary key includes it). Fast lookup.

## Confidence Scoring Strategy

Wildcard-expanded lineage inherently less certain than explicit column references.

### Confidence Levels

| Lineage Type | Confidence | Rationale |
|--------------|------------|-----------|
| Direct column reference (`col1`) | 0.95 | Explicit in SQL, no ambiguity |
| Expression (`UPPER(col1)`) | 0.85 | Explicit but transformed |
| Wildcard expansion (schema match) | 0.70 | Inferred from metadata, assumes no schema drift |
| Wildcard expansion (schema mismatch) | 0.50 | Column counts differ, likely schema evolution |
| Pattern-based fallback (no metadata) | 0.60 | Regex extraction, uncertain |

### Confidence Adjustments

- **Schema timestamp > 30 days old**: Reduce confidence by 0.10 (e.g., 0.70 → 0.60)
- **Column count mismatch**: Set confidence to 0.50 regardless of base
- **Qualified wildcard in complex JOIN**: No adjustment (same as simple wildcard)
- **Partial failure (some wildcards expanded)**: Lower confidence for entire query to 0.60

## Testing Strategy

### Unit Tests (TeradataSQLParser)

1. **test_simple_wildcard_expansion**: `SELECT * FROM t1` → Expands to all columns from t1
2. **test_qualified_wildcard**: `SELECT t1.*, t2.id FROM t1 JOIN t2` → Only t1.* expands
3. **test_insert_ordinal_matching**: `INSERT INTO t1 SELECT * FROM t2` → Columns matched by position
4. **test_ctas_name_derivation**: `CREATE TABLE t1 AS SELECT * FROM t2` → Target columns = source columns
5. **test_wildcard_missing_schema**: `SELECT * FROM unknown_table` → Error logged, skip wildcard
6. **test_wildcard_with_aliases**: `SELECT t.* FROM table1 t` → Resolves alias, expands table1
7. **test_multiple_wildcards**: `SELECT t1.*, t2.* FROM t1, t2` → Both expand in order

### Integration Tests (DBQL Extraction)

1. **test_dbql_wildcard_real_query**: Extract lineage from actual DBQL query with SELECT *
2. **test_wildcard_confidence_scoring**: Verify confidence = 0.70 for wildcard-expanded records
3. **test_schema_mismatch_warning**: Column count differs → Warning logged, confidence = 0.50
4. **test_partial_wildcard_failure**: One table missing metadata → Extract other tables, log error

### E2E Tests (Playwright)

1. **Wildcard lineage visualization**: Navigate to column from wildcard-expanded INSERT → Lineage graph shows correct upstream
2. **Confidence indicator**: Wildcard-expanded lineage displays lower confidence score in UI

## Competitor Feature Analysis

| Feature | DataHub (sqlglot) | SQLLineage | Secoda | Our Approach |
|---------|-------------------|------------|--------|--------------|
| Simple SELECT * | ✅ Schema-aware, 97%+ accuracy | ✅ Supports with metadata | ✅ Automated | ✅ Schema from OL_DATASET_FIELD |
| Qualified wildcards (t.*) | ✅ Full support | ✅ Supported | ✅ Supported | ✅ Via table alias resolution |
| INSERT INTO ordinal matching | ✅ Correct (position-based) | ⚠️ May use name-based | ✅ Position-based | ✅ SQL standard (position-based) |
| CTAS wildcards | ✅ Full support | ✅ Supported | ✅ Supported | ✅ Name derivation from source |
| SELECT * EXCEPT | ✅ BigQuery dialect support | ❌ Not mentioned | ⚠️ Unknown | ⏸️ Deferred (P3) |
| Confidence scoring | ✅ Built-in | ❌ Not mentioned | ✅ Quality scores | ✅ Explicit 0.70 for wildcards |
| Schema evolution tracking | ⚠️ Relies on external metadata sync | ❌ Not mentioned | ✅ Automated drift detection | ✅ Timestamp-based warnings (v1.x) |

**Key differentiator**: We provide explicit confidence scoring AND schema evolution warnings. Most tools assume metadata is always current.

## Implementation Complexity Breakdown

### Low Complexity (< 1 day)
- Confidence scoring (already exists, just apply to wildcards)
- Schema metadata prerequisite checks (SQL query + error message)
- Wildcard expansion auditing (add logging statements)

### Medium Complexity (1-3 days)
- Simple SELECT * expansion (schema lookup + AST modification)
- INSERT INTO ordinal matching (position-based logic)
- CTAS name derivation (alias handling)
- Qualified wildcards (table alias resolution - already partially implemented)
- Schema evolution warnings (compare column counts, add timestamp check)
- Partial failure handling (try/catch per wildcard, continue on error)

### High Complexity (3-5 days)
- SELECT * EXCEPT support (custom sqlglot AST handling, BigQuery dialect)
- Cross-database wildcard resolution (multi-namespace metadata lookup)
- Historical schema reconstruction (requires schema versioning system)

**Recommendation**: Start with P1 features (5-7 days total). Validate with real DBQL data. Add P2 features based on production feedback.

## Open Questions

1. **Schema staleness threshold**: Is 30 days the right cutoff for warnings? Or should we use last ETL run timestamp?
   - **Resolution**: Start with 30 days. Make configurable via environment variable in v1.x.

2. **Unqualified * in multi-table query**: Expand all tables or error?
   - **Resolution**: Expand all tables (SQL standard behavior). Log warning about potential column name conflicts.

3. **Column name conflicts**: If t1 and t2 both have "id" column, how to handle `SELECT * FROM t1, t2`?
   - **Resolution**: SQL would create two columns (possibly with disambiguation like id, id_1). We extract both as separate lineage records. Database handles naming.

4. **Performance**: Does schema lookup for every wildcard slow down DBQL extraction?
   - **Resolution**: Add caching layer in TeradataSQLParser. Cache schema per table for duration of extraction run. Clear cache between runs.

5. **Schema mismatches**: If INSERT INTO has 5 target columns but SELECT * expands to 7 source columns, fail or partial match?
   - **Resolution**: Fail (log error). SQL would fail at runtime. Don't create incorrect lineage.

## Sources

### SQL Wildcard Behavior
- [Expanding wildcards - SQL Prompt Documentation](https://documentation.red-gate.com/sp6/formatting-your-code/expanding-wildcards)
- [SQL INSERT INTO SELECT Statement - W3Schools](https://www.w3schools.com/sql/sql_insert_into_select.asp)
- [Teradata Antiselect by Roland Wenzlofsky](https://medium.com/@r.wenzlofsky/teradata-antiselect-2bebe8457739)
- [PostgreSQL: insert into select and column order](https://www.postgresql.org/message-id/D960CB61B694CF459DCFB4B0128514C2CC1DC3@exadv11.host.magwien.gv.at)

### SQLGlot Wildcard Handling
- [sqlglot.schema API documentation](https://sqlglot.com/sqlglot/schema.html)
- [sqlglot.optimizer.qualify API documentation](https://sqlglot.com/sqlglot/optimizer/qualify.html)
- [sqlglot.lineage API documentation](https://sqlglot.com/sqlglot/lineage.html)
- [Recce: Column-Level Lineage Approach](https://blog.reccehq.com/column-level-lineage-internals)

### Column Lineage Extraction
- [Extracting Column-Level Lineage from SQL - DataHub](https://datahub.com/blog/extracting-column-level-lineage-from-sql/)
- [Column-Level Lineage: An Adventure in SQL Parsing - Metaplane](https://www.metaplane.dev/blog/column-level-lineage-an-adventure-in-sql-parsing)
- [sqllineage PyPI](https://pypi.org/project/sqllineage/)

### SELECT * EXCEPT
- [BigQuery SQL - SELECT * EXCEPT Clause - Kontext Labs](https://kontext.tech/project/code-snippets/article/bigquery-sql-select-except-clause)
- [Using SELECT * with EXCEPT and REPLACE](https://medium.com/data-engineers-notes/using-select-with-except-and-replace-55b4168807ac)
- [The Useful BigQuery * EXCEPT Syntax - jOOQ](https://blog.jooq.org/the-useful-bigquery-except-syntax/)

### Schema Evolution and Lineage
- [Data Lineage Tracking: Complete Guide for 2026 - Atlan](https://atlan.com/know/data-lineage-tracking/)
- [Schema evolution in Databricks](https://docs.databricks.com/aws/en/data-engineering/schema-evolution)
- [Column level lineage - dbt Developer Hub](https://docs.getdbt.com/docs/explore/column-level-lineage)

### CTAS Behavior
- [CREATE TABLE AS SELECT (CTAS) - Azure Synapse Analytics](https://learn.microsoft.com/en-us/azure/synapse-analytics/sql-data-warehouse/sql-data-warehouse-develop-ctas)
- [DuckDB INSERT Statement](https://duckdb.org/docs/stable/sql/statements/insert)

---

*Feature research for: SQL Wildcard Expansion in Column-Level Lineage Extraction*
*Researched: 2026-02-18*
*Confidence: HIGH (verified with official documentation, established SQL standards, and modern lineage tool implementations)*
