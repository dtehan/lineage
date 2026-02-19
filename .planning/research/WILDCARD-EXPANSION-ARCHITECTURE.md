# Architecture Research: Wildcard Expansion Integration

**Domain:** SQL column lineage extraction - wildcard expansion
**Researched:** 2026-02-18
**Confidence:** HIGH

## Integration Overview

Wildcard expansion integrates into the existing DBQL extraction pipeline at the SQL AST traversal phase. The current architecture provides the necessary integration points without requiring structural changes.

```
┌─────────────────────────────────────────────────────────────┐
│                    DBQL Extraction Pipeline                  │
├─────────────────────────────────────────────────────────────┤
│  1. Query Fetch    → DBC.DBQLogTbl + DBC.DBQLSQLTbl         │
│                                                              │
│  2. SQL Parse      → SQLGlot (Teradata dialect)             │
│                      ↓                                       │
│                   [AST with Star nodes]                      │
│                                                              │
│  3. AST Traversal  → _extract_select_columns()               │
│                      ↓                                       │
│                   **INTEGRATION POINT**                      │
│                   [Wildcard Detection + Expansion]           │
│                      ↓                                       │
│                   [Resolved column references]               │
│                                                              │
│  4. Metadata Query → DBC.ColumnsV/ColumnsJQV (NEW)           │
│                      [Get actual columns for wildcards]      │
│                                                              │
│  5. Lineage Map    → source_col -> target_col records        │
│                                                              │
│  6. Insert         → OL_COLUMN_LINEAGE table                 │
└─────────────────────────────────────────────────────────────┘
```

## Current Architecture: Component Responsibilities

| Component | Responsibility | Location |
|-----------|----------------|----------|
| `populate_lineage.py` | Orchestrator - clears data, calls extractor, verifies results | `database/scripts/populate/populate_lineage.py` |
| `DBQLExtractor` | Query fetching, batch processing, stats tracking, insertion | `database/scripts/populate/dbql_extractor.py` |
| `TeradataSQLParser` | AST parsing, column extraction, lineage mapping | `lineage-api/utils/sql_parser.py` |
| `DBC views` | Metadata source (tables, columns, types) | Teradata system views |

## Integration Points

### 1. Wildcard Detection Point

**Where:** `TeradataSQLParser._extract_select_columns()` (line 424-478)

**Current behavior:**
```python
for expr in select.expressions:
    if isinstance(expr, exp.Star):
        # Handle SELECT *
        # This would require schema information to expand
        continue  # <-- Currently skips wildcards
```

**Integration:** Replace `continue` with call to wildcard expansion logic.

**Why here:**
- Already iterating over SELECT expressions
- Already has access to AST context (table aliases, FROM clause)
- Return type matches (List[ColumnReference])
- No changes to caller contracts

### 2. Metadata Query Point

**Where:** New module `database/scripts/populate/wildcard_resolver.py`

**Responsibility:**
- Query `DBC.ColumnsV` or `DBC.ColumnsJQV` for table column lists
- Handle database qualification (default_database context)
- Cache column lists per table (in-memory, single extraction run)
- Handle errors (table doesn't exist, access denied)

**Why separate module:**
- Single Responsibility Principle - metadata concerns isolated
- Testable independently from SQL parser
- Reusable by other extractors if needed
- Clear dependency on Teradata cursor (injected)

### 3. Column List Caching Point

**Where:** `WildcardResolver` class (new)

**Strategy:**
```python
class WildcardResolver:
    def __init__(self, cursor, default_database: str):
        self.cursor = cursor
        self.default_database = default_database
        self._column_cache: Dict[Tuple[str, str], List[str]] = {}  # (db, table) -> [columns]

    def resolve_star(self, database: str, table: str) -> List[str]:
        """Return column list for table, cached."""
        key = (database, table)
        if key not in self._column_cache:
            self._column_cache[key] = self._fetch_columns(database, table)
        return self._column_cache[key]
```

**Why cache:**
- Same table appears multiple times across queries (common pattern)
- Single extraction run processes 1000+ queries
- Metadata queries are expensive (10-50ms each)
- Cache lifetime = single extraction run (no staleness concerns)

### 4. Parser Modification Point

**Where:** `TeradataSQLParser.__init__()` (line 80-84)

**Change:** Accept optional `WildcardResolver` dependency:
```python
def __init__(self, default_database: str = None, wildcard_resolver: Optional[WildcardResolver] = None):
    self.default_database = default_database or self.DEFAULT_DATABASE
    self.wildcard_resolver = wildcard_resolver
    self._table_aliases: Dict[str, Tuple[str, str]] = {}
```

**Why optional:**
- Preserves existing behavior when resolver not provided
- Allows parser to remain testable without database
- Gradual rollout (parser still works without expansion)

## Data Flow: Wildcard Expansion

### Detailed Flow

```
1. DBQLExtractor.extract_lineage()
   ↓
   Creates WildcardResolver(cursor, namespace_uri)
   ↓
   Creates TeradataSQLParser(default_db, wildcard_resolver)
   ↓

2. For each query:
   parser.extract_column_lineage(sql_text, stmt_type)
   ↓

3. TeradataSQLParser._parse_with_sqlglot(sql)
   ↓
   SQLGlot parses to AST
   ↓

4. TeradataSQLParser._extract_insert_lineage(ast)
   ↓

5. TeradataSQLParser._extract_select_columns(select_node)
   ↓
   Iterates select.expressions
   ↓
   Encounters exp.Star node
   ↓

6. if self.wildcard_resolver:
       source_table = self._resolve_star_table(expr)  # Get table for SELECT *
       column_list = self.wildcard_resolver.resolve_star(source_table.db, source_table.name)
       for col_name in column_list:
           columns.append(ColumnReference(
               database=source_table.db,
               table=source_table.name,
               column=col_name,
               is_expression=False
           ))
   ↓

7. Return expanded columns list
   ↓

8. Lineage mapping proceeds as normal
   (each expanded column becomes source_column in lineage record)
```

## Component Boundaries

### Modified Components

| Component | Change Type | Rationale |
|-----------|-------------|-----------|
| `TeradataSQLParser` | Enhancement | Add wildcard expansion logic to `_extract_select_columns()` |
| `TeradataSQLParser.__init__()` | Interface change | Accept optional `wildcard_resolver` parameter |
| `DBQLExtractor.extract_lineage()` | Enhancement | Instantiate and inject `WildcardResolver` |

### New Components

| Component | Responsibility | Dependencies |
|-----------|----------------|--------------|
| `WildcardResolver` | Query DBC views for column lists, cache results | `teradatasql.Cursor`, `db_config` |
| `wildcard_resolver.py` | Module containing `WildcardResolver` class | None (new) |

### Unchanged Components

| Component | Why Unchanged |
|-----------|---------------|
| `populate_lineage.py` | Orchestration logic unaffected - extractor handles expansion internally |
| `_extract_insert_lineage()` | Receives expanded columns, no logic changes needed |
| `_insert_lineage_records()` | Receives same lineage record format |
| `OL_COLUMN_LINEAGE` schema | No schema changes - expansion happens before insertion |

## Architectural Patterns

### Pattern 1: Dependency Injection (Optional Dependencies)

**What:** Pass `WildcardResolver` to parser constructor, make it optional.

**When to use:** When adding functionality that requires external resources (DB cursor) but want to preserve testability and backward compatibility.

**Trade-offs:**
- **Pro:** Parser still testable without database (unit tests with mock resolver)
- **Pro:** Gradual rollout (feature flag via resolver presence)
- **Pro:** Clear separation of concerns (parser doesn't create DB connections)
- **Con:** Slightly more complex initialization (need to create and pass resolver)
- **Con:** Null checks required (`if self.wildcard_resolver:`)

**Example:**
```python
# With expansion (production)
resolver = WildcardResolver(cursor, default_database)
parser = TeradataSQLParser(default_database, wildcard_resolver=resolver)

# Without expansion (unit tests, backward compatibility)
parser = TeradataSQLParser(default_database)  # Works, skips wildcards
```

### Pattern 2: Cache-Aside with Dictionary

**What:** Cache metadata query results in-memory dictionary, query on cache miss.

**When to use:** When external queries are expensive (10-50ms) and results are immutable during operation (column lists don't change mid-extraction).

**Trade-offs:**
- **Pro:** Reduces metadata queries from O(queries × tables) to O(unique tables)
- **Pro:** Simple implementation (Python dict)
- **Pro:** No external dependencies (Redis, etc.)
- **Con:** Memory usage scales with unique table count (acceptable: ~1KB per table × 100 tables = 100KB)
- **Con:** Cache lifetime = single extraction run (not persistent)

**Example:**
```python
def resolve_star(self, database: str, table: str) -> List[str]:
    key = (database, table)
    if key not in self._column_cache:
        # Cache miss - query database
        self._column_cache[key] = self._fetch_columns(database, table)
    return self._column_cache[key]  # Return cached result
```

### Pattern 3: Qualified vs Unqualified Wildcard Handling

**What:** Handle both `SELECT *` (unqualified) and `SELECT table_name.*` (qualified) differently.

**When to use:** SQL allows both forms, each has different table resolution logic.

**Trade-offs:**
- **Pro:** Correctly handles both SQL syntax variants
- **Pro:** Qualified form is unambiguous (table explicit)
- **Con:** Unqualified form requires table inference from FROM clause
- **Con:** Multi-table queries with unqualified `*` are ambiguous (must skip or error)

**Handling:**
```python
if isinstance(expr, exp.Star):
    if expr.table:  # Qualified: SELECT t.*
        # Explicit table - resolve directly
        db, table = self._resolve_table_alias(expr.table)
        columns = self.wildcard_resolver.resolve_star(db, table)
    else:  # Unqualified: SELECT *
        # Single table in FROM - use that table
        if len(self._table_aliases) == 1:
            db, table = list(self._table_aliases.values())[0]
            columns = self.wildcard_resolver.resolve_star(db, table)
        else:
            # Multiple tables - ambiguous, skip
            logger.warning("Unqualified SELECT * with multiple tables - skipping")
            continue
```

## Recommended Project Structure

```
database/
├── scripts/
│   ├── populate/
│   │   ├── populate_lineage.py          # Orchestrator (unchanged)
│   │   ├── dbql_extractor.py            # MODIFIED: instantiate WildcardResolver
│   │   └── wildcard_resolver.py         # NEW: metadata query + caching
│   └── utils/
│       └── insert_cte_test_data.py      # Unchanged
├── tests/
│   ├── test_wildcard_resolver.py        # NEW: test metadata queries
│   └── test_sql_parser_wildcards.py     # NEW: test wildcard expansion
└── db_config.py                         # Unchanged

lineage-api/
├── utils/
│   └── sql_parser.py                    # MODIFIED: add wildcard expansion
└── tests/
    └── test_sql_parser.py               # MODIFIED: add wildcard test cases
```

### Structure Rationale

- **`wildcard_resolver.py` in `database/scripts/populate/`:** Metadata queries are extraction-time concern, not runtime concern. Lives with other extraction scripts.
- **Parser modification in `lineage-api/utils/`:** Parser already lives here, wildcard expansion is parsing concern.
- **Tests in respective `tests/` directories:** Unit tests near code they test.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| <1000 queries | Current design sufficient. In-memory cache handles ~100 unique tables = <100KB memory. Metadata queries amortized across queries. |
| 1000-10000 queries | Monitor cache hit rate. If low, investigate query patterns. May need to warm cache with common tables upfront. |
| 10000+ queries | Consider persistent cache (Redis) if extraction runs frequently and table schemas are stable. Profile memory usage - large catalogs (1000+ tables) may need cache size limits (LRU eviction). |

### Scaling Priorities

1. **First bottleneck:** Metadata queries. If cache hit rate <80%, expansion adds 10-50ms per unique wildcard table. **Fix:** Warm cache with known tables before query processing.
2. **Second bottleneck:** Memory usage with large catalogs (10000+ tables). **Fix:** Implement cache size limit with LRU eviction.

## Anti-Patterns

### Anti-Pattern 1: Per-Query Metadata Queries

**What people do:** Query `DBC.ColumnsV` inside `_extract_select_columns()` on every wildcard without caching.

**Why it's wrong:**
- Same table appears in 100+ queries → 100+ redundant metadata queries
- Each query adds 10-50ms latency
- DBQL extraction of 1000 queries with 10 unique wildcard tables: 1000 queries instead of 10

**Do this instead:** Cache metadata results in `WildcardResolver` class, keyed by (database, table). Query once per unique table, not once per query.

### Anti-Pattern 2: SQLGlot Schema Object for Metadata

**What people do:** Try to use SQLGlot's built-in `Schema` object and `qualify()` function for wildcard expansion.

**Why it's wrong:**
- SQLGlot `Schema` expects dictionary: `{"database": {"table": {"column": "TYPE"}}}`
- Building this requires querying ALL tables in database upfront (expensive, slow)
- Over-fetching: only need columns for tables with wildcards, not entire catalog
- Schema construction is O(catalog_size), should be O(queries_with_wildcards)

**Do this instead:** Use SQLGlot for AST parsing only. Implement targeted metadata queries that fetch columns only for tables with wildcards. Query on-demand, cache results.

### Anti-Pattern 3: Eager Wildcard Expansion at Parse Time

**What people do:** Try to expand wildcards immediately when parsing SQL, before knowing which queries will succeed.

**Why it's wrong:**
- DBQL contains failed queries, incomplete SQL, truncated text
- Metadata queries may fail (table dropped, permissions changed)
- Wastes time querying metadata for queries that will be skipped anyway
- Complicates error handling (metadata failure vs SQL parse failure)

**Do this instead:** Expand wildcards lazily during `_extract_select_columns()`, after SQL parse succeeds. Handle metadata failures gracefully (log warning, skip wildcard, continue processing query).

### Anti-Pattern 4: Attempting Multi-Table Unqualified Star Expansion

**What people do:** Try to expand `SELECT *` from multi-table joins by concatenating all table columns.

**Why it's wrong:**
- Ambiguous which table each column comes from after expansion
- Column name collisions (both tables have `id` column)
- SQL dialects handle this differently (Teradata errors, some DBs pick first)
- Generates incorrect lineage (guessing which table per column)

**Do this instead:** Skip unqualified `SELECT *` when multiple tables in FROM clause. Log warning. Only expand when single table in context OR when qualified (`SELECT t.*`).

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| DBC.ColumnsV / ColumnsJQV | Direct SQL query via teradatasql cursor | Already used by `populate_openlineage_fields()` in `populate_lineage.py`. Same pattern. Query: `SELECT ColumnName FROM DBC.ColumnsV WHERE DatabaseName = ? AND TableName = ? ORDER BY ColumnId` |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| DBQLExtractor ↔ WildcardResolver | Constructor injection | Extractor creates resolver with cursor, passes to parser |
| TeradataSQLParser ↔ WildcardResolver | Method calls | Parser calls `resolver.resolve_star(db, table)` when encountering wildcard |
| WildcardResolver ↔ Teradata | SQL queries | Direct queries to DBC views via cursor.execute() |

## Performance Considerations

### Expected Performance Impact

| Scenario | Without Expansion | With Expansion | Delta |
|----------|-------------------|----------------|-------|
| Query with no wildcards | 50ms parse | 50ms parse | 0ms |
| Query with wildcard (cache hit) | 50ms parse (skip) | 50ms parse + <1ms cache | ~1ms |
| Query with wildcard (cache miss) | 50ms parse (skip) | 50ms parse + 20ms metadata query | +20ms |
| 1000 queries, 10 unique wildcard tables | ~50s total | ~50s + 10×20ms = 50.2s | +0.2s (0.4% increase) |

### Cache Hit Rate Expectations

**Typical workload:**
- ETL queries follow patterns (same staging table wildcards repeated)
- Expected hit rate: 80-95% after first 100 queries
- Cold start: First N unique wildcard tables incur metadata query
- Warm state: Subsequent queries hit cache

**Worst case:**
- Every query has unique wildcard table (rare in practice)
- Cache hit rate: 0%
- Performance: +20ms per query = +20s for 1000 queries (40% increase)
- **Mitigation:** Still acceptable for batch extraction. If problematic, implement cache warming.

## Build Order

### Phase 1: Metadata Resolution (No Dependencies)

**Components:**
1. `wildcard_resolver.py` module
2. `WildcardResolver` class with `resolve_star()` method
3. Unit tests for metadata queries

**Deliverable:** Standalone module that queries DBC views and returns column lists.

**Test without:** Integration with parser. Test directly with Teradata cursor.

### Phase 2: Parser Integration (Depends on Phase 1)

**Components:**
1. Modify `TeradataSQLParser.__init__()` to accept resolver
2. Modify `_extract_select_columns()` to call resolver on wildcards
3. Add `_resolve_star_table()` helper for table resolution
4. Unit tests with mock resolver

**Deliverable:** Parser expands wildcards when resolver provided.

**Test without:** DBQL extractor integration. Test with mock resolver returning hardcoded column lists.

### Phase 3: Extractor Integration (Depends on Phase 1 + 2)

**Components:**
1. Modify `DBQLExtractor.extract_lineage()` to create resolver
2. Pass resolver to parser constructor
3. Integration tests with real database

**Deliverable:** End-to-end DBQL extraction with wildcard expansion.

**Test with:** Full extraction run on test database with wildcard queries.

### Phase 4: Observability & Refinement (Depends on Phase 3)

**Components:**
1. Add stats tracking (wildcards encountered, cache hit rate)
2. Add logging for skipped wildcards (multi-table ambiguity)
3. Performance benchmarking (extraction time with/without expansion)

**Deliverable:** Production-ready feature with monitoring.

## Error Handling Strategy

### Metadata Query Failures

**Scenario:** Table doesn't exist, permissions denied, QVCI disabled (for ColumnsJQV).

**Handling:**
```python
def _fetch_columns(self, database: str, table: str) -> List[str]:
    try:
        self.cursor.execute("""
            SELECT ColumnName
            FROM DBC.ColumnsV
            WHERE DatabaseName = ? AND TableName = ?
            ORDER BY ColumnId
        """, (database, table))
        return [row[0] for row in self.cursor.fetchall()]
    except teradatasql.DatabaseError as e:
        logger.warning(f"Failed to resolve columns for {database}.{table}: {e}")
        return []  # Return empty list, skip wildcard
```

**Impact:** Wildcard skipped, query still processed, other columns still extracted.

### Ambiguous Wildcards

**Scenario:** Unqualified `SELECT *` with multiple tables in FROM clause.

**Handling:**
```python
if isinstance(expr, exp.Star):
    if not expr.table and len(self._table_aliases) > 1:
        logger.warning(f"Ambiguous SELECT * with {len(self._table_aliases)} tables - skipping")
        continue  # Skip wildcard, continue processing other columns
```

**Impact:** Wildcard skipped, explicit columns still extracted.

### Partial Expansion

**Scenario:** Query has both wildcards and explicit columns. Wildcard expansion fails but explicit columns succeed.

**Handling:** Treat as success. Extract explicit columns, skip failed wildcard. Log warning.

**Impact:** Partial lineage better than no lineage.

## Sources

**SQLGlot Wildcard Expansion:**
- [SQLGlot API Documentation](https://sqlglot.com/sqlglot.html) - Parser and AST structure (HIGH confidence)
- [SQLGlot Optimizer - qualify function](https://sqlglot.com/sqlglot/optimizer/qualify.html) - Wildcard expansion via `expand_stars` parameter (HIGH confidence)
- [GitHub - tobymao/sqlglot](https://github.com/tobymao/sqlglot) - Source code and examples (HIGH confidence)

**Column Lineage Extraction Patterns:**
- [DataHub: Extracting Column-Level Lineage from SQL](https://datahub.com/blog/extracting-column-level-lineage-from-sql-779b8ce17567) - Schema-aware parsing approach, metadata requirements (MEDIUM confidence)

**SQL Parser Metadata Patterns:**
- [sql-metadata - GitHub](https://github.com/macbre/sql-metadata) - Token-based parser for table/column extraction (MEDIUM confidence)
- [General SQL Parser - Table/Column References](http://support.sqlparser.com/tutorials/gsp-demo-get-table-column/) - Parser patterns for metadata enrichment (LOW confidence - dated)

**Teradata Metadata Views:**
- Teradata DBC.ColumnsV documentation (existing codebase knowledge - HIGH confidence)
- Teradata DBC.ColumnsJQV documentation (CLAUDE.md reference - HIGH confidence)

---
*Architecture research for: Wildcard expansion integration in DBQL lineage extraction*
*Researched: 2026-02-18*
*Confidence: HIGH - Integration points verified in existing codebase, SQLGlot documentation current, metadata query patterns established*
