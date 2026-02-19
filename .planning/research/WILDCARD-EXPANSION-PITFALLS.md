# Wildcard Expansion Pitfalls

**Domain:** Wildcard Expansion in SQL Lineage Extraction
**Researched:** 2026-02-18
**Confidence:** HIGH

## Critical Pitfalls

### Pitfall 1: Stale Metadata - The "What Was vs. What Is" Problem

**What goes wrong:**
You expand `SELECT *` using current table metadata, but the SQL was executed weeks ago when the table had different columns. Your lineage shows columns that didn't exist when the query ran, or misses columns that were dropped since then.

**Why it happens:**
Developers treat metadata queries as "point-in-time truth" when they're actually "current state snapshots." The `DBC.ColumnsV` query returns *today's* columns, not the columns that existed when the DBQL query was logged.

**How to avoid:**
- **Option 1 (Recommended for Phase 1):** Accept lower confidence scores for wildcards. Document that wildcard lineage represents "best effort based on current schema."
- **Option 2 (Phase 3 enhancement):** Store schema snapshots keyed by timestamp. Query `DBC.ColumnsV` at extraction time and associate with `query_execution_timestamp`.
- **Option 3 (Advanced):** Parse DBQL's `DBC.DBQLObjTbl` which captures actual objects accessed during query execution (column-level detail varies by Teradata version).

**Warning signs:**
- Wildcard lineage shows target columns that don't exist in source tables
- Users report "ghost columns" in lineage graphs
- Lineage count for wildcard queries changes when you re-run extraction on same DBQL data

**Phase to address:**
- Phase 1: Document limitation, add confidence penalty (0.70 vs 0.95 for explicit columns)
- Phase 3: Add schema version tracking if users report significant issues

---

### Pitfall 2: N+1 Metadata Query Performance Trap

**What goes wrong:**
Your wildcard expander queries `DBC.ColumnsV` separately for each `SELECT *` occurrence. With 1000 queries containing wildcards across 50 unique tables, you execute 1000+ metadata queries. Extraction that should take 30 seconds takes 20 minutes.

**Why it happens:**
Naive implementation: see `SELECT * FROM table_x`, immediately query metadata for `table_x`, generate lineage, move to next query. Natural imperative programming flow creates the N+1 pattern.

**How to avoid:**
1. **Two-pass extraction (recommended):**
   - Pass 1: Parse all SQL, collect unique (database, table) tuples needing metadata
   - Batch query: `SELECT * FROM DBC.ColumnsV WHERE (DatabaseName, TableName) IN (...)`
   - Pass 2: Expand wildcards using in-memory metadata cache
2. **Metadata warmup phase:** Query all tables in target databases before processing DBQL
3. **Incremental cache:** Build metadata cache once, refresh only changed tables on subsequent runs

**Warning signs:**
- Extraction time grows linearly with number of queries (not number of unique tables)
- Database metrics show thousands of identical `DBC.ColumnsV` queries
- Extraction is I/O bound waiting on database, not CPU bound parsing SQL

**Phase to address:**
Phase 1 - Core wildcard expansion must include metadata caching to be production-viable. This is not an optimization—it's a correctness requirement at scale.

---

### Pitfall 3: Ambiguous Table References - The "Which Table's *?" Problem

**What goes wrong:**
```sql
SELECT * FROM staging.customer t1 JOIN staging.account t2 ON t1.id = t2.customer_id
```
Parser expands `*` to all columns from both `customer` AND `account`, but can't determine which table each column came from when generating lineage. You either (a) create incorrect lineage mapping `customer.name` to both source tables, or (b) skip the query entirely.

**Why it happens:**
`SELECT *` is table-ambiguous in multi-table contexts. SQL engines resolve this by including all columns from all tables in FROM/JOIN, but lineage extraction needs per-column table attribution. Without explicit table qualifiers (`t1.*`, `t2.*`), the AST provides column names without source table context.

**How to avoid:**
1. **Column name collision detection:** Query metadata for all tables in FROM/JOIN. If column names overlap, mark lineage as `LOW_CONFIDENCE` or skip.
2. **Heuristic ordering (risky):** Assign columns to tables based on metadata ordinal position. First N columns from table1, next M from table2. This works for simple joins but breaks with subqueries/CTEs.
3. **Require qualified wildcards (strict mode):** Only expand `t1.*` and `t2.*`, skip unqualified `*` in multi-table contexts.

**Warning signs:**
- Lineage shows one target column mapping to multiple source tables with identical column names
- `SELECT *` with JOINs produces more lineage records than target table has columns
- Confidence scores for wildcard queries are suspiciously uniform (ignoring ambiguity)

**Phase to address:**
- Phase 1: Detect multi-table `SELECT *`, skip with warning log. Track skip statistics.
- Phase 2: Add qualified wildcard expansion (`t1.*`) and column collision detection
- Phase 3: Add heuristic ordering with explicit `AMBIGUOUS` confidence tier

---

### Pitfall 4: CTE and Subquery Wildcard Depth Explosion

**What goes wrong:**
```sql
WITH cte1 AS (SELECT * FROM source_table),
     cte2 AS (SELECT * FROM cte1),
     cte3 AS (SELECT * FROM cte2)
INSERT INTO target SELECT * FROM cte3;
```
To expand the final `SELECT *`, you must recursively expand `cte3 -> cte2 -> cte1 -> source_table`. Each level multiplies complexity. With nested subqueries in 10-level CTE chains, expansion becomes exponentially expensive or fails with stack overflow.

**Why it happens:**
Wildcard expansion requires schema context. For CTEs/subqueries, "schema" is the SELECT list of the defining query, which may itself contain wildcards. This creates recursive metadata resolution. Developers implement depth-first expansion without cycle detection or depth limits.

**How to avoid:**
1. **Depth limits:** Set maximum CTE/subquery nesting depth for wildcard expansion (suggest 5 levels)
2. **Cycle detection:** Track CTE expansion path, detect cycles (e.g., recursive CTEs), terminate with error
3. **Lazy expansion:** Only expand wildcards when target columns are explicitly listed, not for intermediate CTEs
4. **Materialized CTE cache:** Once you expand a CTE wildcard, cache the result for reuse within the same query

**Warning signs:**
- Stack overflow errors during SQL parsing
- Extraction hangs on queries with deeply nested CTEs
- Memory usage spikes on queries with multiple CTE definitions
- Recursive CTE queries cause infinite loops in expander

**Phase to address:**
- Phase 1: Add depth limit (5 levels) with clear error messages
- Phase 1: Add cycle detection for recursive CTEs (skip with warning)
- Phase 2: Add CTE schema caching for performance

---

### Pitfall 5: EXCLUDE/EXCEPT/REPLACE Dialect Extensions Missing

**What goes wrong:**
Modern SQL dialects (BigQuery, Snowflake, DuckDB) support:
```sql
SELECT * EXCEPT (password, ssn) FROM users;
SELECT * REPLACE (UPPER(email) AS email) FROM users;
```
Your wildcard expander doesn't recognize these extensions, expands to ALL columns including `password` and `ssn`, creating incorrect and potentially dangerous lineage (security risk).

**Why it happens:**
Teradata SQL doesn't support `EXCEPT`/`REPLACE` wildcard modifiers (as of TD 17.20). Developers test against Teradata, assume all `SELECT *` patterns are simple wildcards. When extracting lineage from federated queries or multi-dialect environments, these patterns silently fail or produce wrong results.

**How to avoid:**
1. **Parser validation:** Detect unsupported syntax, fail with clear error message
2. **Dialect detection:** If source includes known dialect extensions, warn user about potential inaccuracies
3. **Future-proofing:** Design wildcard expansion as pluggable strategy pattern, allowing dialect-specific handlers

**Warning signs:**
- Lineage includes sensitive columns (PII, credentials) that should have been excluded
- Column counts from wildcard expansion exceed actual query result column counts
- Users report "columns are transformed but show as DIRECT" (missing REPLACE logic)

**Phase to address:**
- Phase 1: Detect `EXCEPT`/`REPLACE` syntax, log warning and skip query (prevent incorrect lineage)
- Phase 3: Add dialect-specific expansion if multi-database support is required

---

### Pitfall 6: View Definition Wildcards - The Transitive Expansion Problem

**What goes wrong:**
```sql
CREATE VIEW v1 AS SELECT * FROM base_table;
SELECT col1, col2 FROM v1;  -- Which columns are these?
```
To determine `col1` lineage, you must:
1. Recognize `v1` is a view
2. Query view definition (DBC.TablesV → RequestText)
3. Parse view definition
4. Expand `SELECT *` in view definition
5. Map `col1` back through expanded columns to `base_table`

Without this transitive expansion, lineage stops at the view boundary. Users see `v1.col1 -> target` but not `base_table.col1 -> v1.col1 -> target`.

**Why it happens:**
Views are treated like tables in metadata queries. `DBC.ColumnsV` returns view columns, but not the underlying source columns. Developers assume view metadata is sufficient, missing that views are "stored queries" requiring recursive expansion.

**How to avoid:**
1. **View detection:** Query `DBC.TablesV.TableKind = 'V'` to identify views
2. **View definition parsing:** Extract `RequestText` (view SQL), parse recursively
3. **Recursion depth limit:** Prevent infinite loops (view→view→view references)
4. **View expansion cache:** Cache expanded view columns to avoid repeated parsing
5. **Transparent mode (Phase 1):** Skip view expansion, document as limitation
6. **Full mode (Phase 3):** Recursive view expansion with depth limits

**Warning signs:**
- Lineage graphs show views as "source" with no upstream lineage
- Users ask "where does the data in this view REALLY come from?"
- View column lineage confidence is HIGH but actual traceability is LOW

**Phase to address:**
- Phase 1: Detect views, treat like tables, document that lineage stops at view boundary
- Phase 2: Add view definition extraction and parsing (no recursion)
- Phase 3: Add recursive view expansion with cycle detection

---

### Pitfall 7: Wildcard + Column Position References - The ORDER BY Trap

**What goes wrong:**
```sql
INSERT INTO target (col1, col2, col3)
SELECT * FROM source ORDER BY 2;
```
You expand `SELECT *` to `(id, name, created_at)`, but `ORDER BY 2` means "sort by the second column in the SELECT list" not "sort by column named 2". If your parser doesn't resolve positional references, lineage mapping becomes incorrect when target column order differs from source.

**Why it happens:**
SQL allows positional references in ORDER BY, GROUP BY, and even SELECT lists. Wildcard expansion changes the number and order of columns in the SELECT list, invalidating positional indices. Parsers that expand wildcards textually (string replacement) don't update positional references.

**How to avoid:**
1. **Post-expansion positional resolution:** After expanding `*`, resolve `ORDER BY 2` to actual column name from expanded list
2. **AST-level expansion (recommended):** Expand wildcards in AST, not text. Positional references naturally resolve to correct nodes.
3. **Conservative approach:** Skip queries with wildcards + positional references, log warning

**Warning signs:**
- Lineage shows `source.column_3` → `target.column_1` when they should be positional matches
- Queries with `ORDER BY <number>` produce parsing errors after wildcard expansion
- Column order in extracted lineage doesn't match actual query execution results

**Phase to address:**
- Phase 1: Detect positional ORDER BY/GROUP BY with wildcards, skip with warning
- Phase 2: Add positional reference resolution post-expansion

---

### Pitfall 8: Case Sensitivity and Quoting - The Metadata Mismatch

**What goes wrong:**
SQL text: `SELECT * FROM "MyTable"`
Metadata query: `WHERE TableName = 'MyTable'` (wrong) or `WHERE TableName = 'MYTABLE'` (also wrong)

Teradata is case-insensitive for unquoted identifiers (stored uppercase) but case-sensitive for quoted identifiers. Your metadata lookup fails, wildcard can't be expanded, lineage is lost.

**Why it happens:**
Teradata stores unquoted identifiers in uppercase in `DBC.TablesV.TableName`. Quoted identifiers preserve original case. SQL parsers tokenize quoted vs unquoted differently. Developers test with lowercase unquoted identifiers, don't encounter the issue until production queries use quoted mixed-case table names.

**How to avoid:**
1. **Normalize unquoted identifiers:** Convert to uppercase before metadata lookup
2. **Preserve quoted identifiers:** Track whether identifier was quoted in SQL, use exact match for metadata query
3. **Dual-lookup strategy:** Try exact match first, fallback to uppercase match if not found
4. **Metadata normalization cache:** Pre-build lookup map with multiple case variations

**Warning signs:**
- Wildcard expansion fails with "table not found" but table exists in database
- Lineage succeeds for lowercase table names, fails for mixed-case
- Error messages show `MyTable` (from SQL) vs `MYTABLE` (from metadata)

**Phase to address:**
Phase 1 - Case normalization must be part of core wildcard expansion. SQLGlot handles this partially, but Teradata-specific case rules require custom handling.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Skip multi-table `SELECT *` | Avoids ambiguity complexity | 30-50% of queries skipped in JOIN-heavy workloads | Phase 1 MVP only. Add qualified wildcard support in Phase 2 |
| Use current metadata for historical queries | No schema versioning needed | Incorrect lineage when schemas change frequently | Low-churn schemas (< 1 change/month). Document limitation clearly |
| String-based wildcard expansion | Simpler than AST manipulation | Breaks positional references, harder to debug | Never. Always expand in AST |
| Wildcard depth limit = 3 | Prevents recursion issues | Fails on legitimate deep CTE chains | Phase 1. Increase to 5 in Phase 2 after validation |
| Skip view expansion entirely | Significantly simpler logic | Lineage stops at view boundary | Phase 1. Essential for Phase 3 if views are common |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| DBC.ColumnsV metadata | Query per table in loop | Batch query with `IN (...)` for all tables, cache results |
| View definitions (DBC.TablesV.RequestText) | Parse as-is, assume valid SQL | Clean compression artifacts, handle NULL, validate before parsing |
| DBQL SQLTextInfo | Assume complete query text | Check `LENGTH(SQLTextInfo)` vs VARCHAR(32000) limit, warn on truncation |
| SQLGlot dialect | Use default parser | Explicitly specify `dialect="teradata"` to handle Teradata-specific syntax |
| Table alias resolution | Use first matching table name | Build full alias map before expansion, handle shadowing correctly |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| N+1 metadata queries | 10x slower than expected, DB CPU spike | Batch metadata query before expansion | >100 queries with wildcards |
| CTE recursion without caching | Exponential time with CTE depth | Cache expanded CTE schemas within query | 3+ level nested CTEs |
| String concatenation for SQL building | Memory spikes, OOM errors | Use parameterized queries, prepared statements | >10K lineage records in single batch |
| No wildcard early-exit | Process all columns even if target list is known | Skip wildcard expansion if INSERT columns explicit | Queries with 100+ column tables |
| Metadata cache never expires | Stale results after schema changes | TTL cache (e.g., 5 minutes) or invalidate on DDL events | Long-running extraction jobs (>1 hour) |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Expand `SELECT *` including sensitive columns | PII leakage in lineage metadata | Column classification + filtering. Never include columns tagged as PII/sensitive in lineage output |
| Store expanded SQL in logs | Credentials in query text exposed | Redact literal values before logging. Log AST structure, not raw SQL |
| No access control on metadata queries | Users see lineage for tables they can't access | Validate user privileges before returning lineage. Filter metadata by user's GRANT permissions |
| Wildcard expansion bypasses column-level security | Exposes columns user shouldn't see | Check column-level permissions (if supported), not just table-level |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Silent wildcard expansion failures | Users don't know lineage is incomplete | Surface skipped queries in UI with reason (e.g., "ambiguous table reference") |
| All wildcards show same confidence | Can't distinguish reliable vs. uncertain lineage | Confidence tiers: 0.95 explicit, 0.85 qualified wildcard, 0.70 unqualified, 0.50 ambiguous |
| No visual distinction for expanded columns | Can't tell if column was explicit or inferred | UI badge: "Explicit" vs "Expanded from *" |
| Wildcard lineage mixed with explicit | Graph becomes cluttered with low-value edges | Filter toggle: "Show only explicit lineage" / "Include wildcard expansions" |
| No explanation for skipped wildcards | Users report "missing data" as bug | Explain pane: "Why is this query not in lineage?" with actionable fix suggestions |

## "Looks Done But Isn't" Checklist

- [ ] **Wildcard expansion:** Works for simple `SELECT *` but missing qualified wildcards (`table.*`)
- [ ] **Wildcard expansion:** Expands columns but doesn't handle `ORDER BY` positional references
- [ ] **Metadata caching:** Queries cached per-table but not invalidated after TTL
- [ ] **CTE wildcards:** Expands top-level wildcards but skips wildcards inside CTE definitions
- [ ] **View wildcards:** Detects views but doesn't parse view definitions for transitive lineage
- [ ] **Error handling:** Catches SQL parse errors but doesn't log WHICH query failed for debugging
- [ ] **Confidence scoring:** Assigns scores but doesn't explain WHY score is low to users
- [ ] **Ambiguity detection:** Detects multi-table `SELECT *` but allows undetected column collisions (same name, different tables)
- [ ] **Schema versioning:** Timestamps when metadata was queried but doesn't associate with query execution time
- [ ] **Case sensitivity:** Handles uppercase table names but fails on quoted mixed-case identifiers

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Stale metadata used | MEDIUM | Re-run extraction with schema versioning enabled. Requires storing historical metadata snapshots. |
| N+1 queries created | LOW | Add metadata caching layer. Code change in one module, no data migration needed. |
| Ambiguous wildcards stored | HIGH | Can't fix retroactively. Must re-extract with collision detection, mark old records as deprecated. |
| CTE depth explosion | MEDIUM | Add depth limit, re-parse failed queries. May need to manually map complex CTEs. |
| Missing dialect support | HIGH | Parser refactor required. May need different SQL parsing library or custom dialect handler. |
| View expansion skipped | MEDIUM | Implement view definition parser, re-extract affected queries. Requires DBC.TablesV.RequestText access. |
| Positional references wrong | MEDIUM | Re-parse with AST-aware expansion. May require different parsing approach (SQLGlot vs custom). |
| Case mismatch breaks lookup | LOW | Add normalization layer, re-run metadata matching. No query re-parsing needed. |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Stale metadata | Phase 1 (document), Phase 3 (fix with versioning) | Compare lineage for same query with 30-day gap. Column sets should match if no DDL occurred. |
| N+1 metadata queries | Phase 1 (must have from start) | Time extraction with 1000 queries. Should take <5 min with caching, >20 min without. |
| Ambiguous table references | Phase 1 (detect & skip), Phase 2 (qualified wildcards) | Run on queries with JOINs. Phase 1 should skip, Phase 2 should extract with qualified `t1.*` |
| CTE/subquery depth | Phase 1 (depth limit + cycle detection) | Test with 10-level nested CTE. Should error gracefully, not crash or hang. |
| EXCLUDE/EXCEPT/REPLACE | Phase 1 (detect & skip), Phase 3 (dialect support) | Parse BigQuery-syntax query. Should skip with warning in Phase 1. |
| View definition wildcards | Phase 1 (skip), Phase 2 (non-recursive), Phase 3 (recursive) | Lineage for view should show base tables in Phase 3, only show view in Phase 1. |
| Positional ORDER BY | Phase 1 (detect & skip), Phase 2 (resolve positions) | Query with `SELECT * ... ORDER BY 2`. Should skip in Phase 1, extract correctly in Phase 2. |
| Case sensitivity | Phase 1 (core normalization required) | Test with `"MyTable"` (quoted) vs `mytable` (unquoted). Both should resolve to same metadata. |

## Sources

**Column-Level Lineage Extraction:**
- [Extracting Column-Level Lineage from SQL - DataHub](https://datahub.com/blog/extracting-column-level-lineage-from-sql/)
- [Column-Level Lineage: An Adventure in SQL Parsing - Metaplane](https://www.metaplane.dev/blog/column-level-lineage-an-adventure-in-sql-parsing)
- [LineageX: A Column Lineage Extraction System for SQL](https://arxiv.org/html/2505.23133v1)
- [Column-Level Lineage Design - sqllineage](https://sqllineage.readthedocs.io/en/latest/behind_the_scene/column-level_lineage_design.html)

**SELECT * and Ambiguity Issues:**
- [SQL Wildcard Characters - W3Schools](https://www.w3schools.com/sql/sql_wildcards.asp)
- [How to improve query performance by expanding wildcards - ApexSQL](https://knowledgebase.apexsql.com/improve-query-performance-avoid-syntax-errors-expanding-wildcards-sql-statements/)

**SQL Parser CTE and Ambiguity:**
- [PostgreSQL Error: Column Reference is Ambiguous - Sling Academy](https://www.slingacademy.com/article/postgresql-error-resolving-column-reference-ambiguous-issue/)
- [PostgreSQL Common Table Expressions (CTEs) 2026 - TheLinuxCode](https://thelinuxcode.com/postgresql-common-table-expressions-ctes-practical-patterns-i-use-in-2026/)

**Metadata Cache Invalidation:**
- [Wildcard prepared statements metadata issue - Cassandra](https://issues.apache.org/jira/browse/CASSJAVA-93)
- [INVALIDATE METADATA Statement - Impala](https://impala.apache.org/docs/build/html/topics/impala_invalidate_metadata.html)

**Recursive CTEs and Circular References:**
- [Hierarchical Data: Self Joins vs. Recursive CTEs in SQL - Medium](https://medium.com/@anusoosanbaby/mastering-hierarchical-data-self-joins-vs-recursive-ctes-in-sql-221deea7226d)
- [Catching circular references in parent-child structures - sqlsunday.com](https://sqlsunday.com/2016/04/04/catching-circular-references/)
- [Common table expressions and circular references - SQLServerCentral](https://www.sqlservercentral.com/articles/common-table-expressions-and-circular-references)

**Column Renaming and Name Collisions:**
- [Recce: Column-Level Lineage Approach](https://blog.reccehq.com/column-level-lineage-internals)
- [Column Lineage in SQL - Microsoft Q&A](https://learn.microsoft.com/en-us/answers/questions/1477437/column-lineage-in-sql)

**Metadata Freshness and Schema Changes:**
- [Data Lineage Best Practices - Datadef.io](https://datadef.io/guides/en/data-lineage-best-practices)
- [Mastering Change Management with Data Lineage - Select Star](https://www.selectstar.com/resources/mastering-change-management-with-data-lineage)
- [Understanding data lineage - Datadog](https://www.datadoghq.com/blog/data-lineage/)

**Personal Experience:**
- Analysis of existing codebase (`dbql_extractor.py`, `sql_parser.py`, `populate_lineage.py`)
- Teradata-specific metadata system knowledge (DBC.ColumnsV, DBC.TablesV, QVCI requirements)

---
*Pitfalls research for: Wildcard Expansion in SQL Lineage Extraction*
*Researched: 2026-02-18*
